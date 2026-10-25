"""브라우저의 요청을 받아 파일을 보내 주거나 저장/불러오기를 처리합니다.

| 주소              | 하는 일                                       |
|-------------------|-----------------------------------------------|
| GET  /            | 게임 첫 화면(web/index.html)                   |
| GET  /web/... 등  | web, assets, data, tests 폴더 안의 파일        |
| GET  /api/state   | 저장된 농장 상태 + 무결성 결과 + 복구 안내      |
| POST /api/save    | 농장 상태 저장                                 |
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

import validation
from storage.store import FarmStore, LayoutMismatch, SaveLocked

# 브라우저가 읽어 갈 수 있는 폴더. saves/ 나 server/ 는 일부러 뺐습니다 (최소 권한).
STATIC_DIRS = {"web", "assets", "data", "tests"}
MAX_BODY = 1024 * 1024

# 운영체제 설정에 따라 .js 가 text/plain 으로 잡히면 모듈이 실행되지 않아 직접 정해 둡니다.
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


def resolve_static(root: Path, url_path: str):
    """주소를 실제 파일 경로로 바꿉니다. 허용된 폴더 밖이면 None (경로 조작 방지)."""
    relative = unquote(url_path).lstrip("/")
    top = relative.replace("\\", "/").split("/", 1)[0]
    if top not in STATIC_DIRS:
        return None
    base = (root / top).resolve()
    target = (root / relative).resolve()
    if not target.is_relative_to(base) or not target.is_file():
        return None
    return target


def make_server(store: FarmStore, root: Path, port: int) -> ThreadingHTTPServer:
    rules = validation.load_rules(root)

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if not self._trusted():
                return
            path = urlsplit(self.path).path
            if path == "/api/state":
                return self._send_json(200, {**store.load(), "serverNow": _now()})
            if path == "/":
                path = "/web/index.html"
            elif path.endswith("/"):
                path += "index.html"  # /tests/web/ → /tests/web/index.html
            target = resolve_static(root, path)
            if target is None:
                return self._send_json(404, {"error": "찾을 수 없어요"})
            body = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", CONTENT_TYPES.get(target.suffix, "application/octet-stream"))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")  # 코드를 고치고 새로고침하면 바로 반영되도록
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if not self._trusted():
                return
            if urlsplit(self.path).path != "/api/save":
                return self._send_json(404, {"error": "찾을 수 없어요"})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self._send_json(413, {"error": "저장 요청이 너무 커요"})
            try:
                game = validation.validate_save(json.loads(self.rfile.read(length) or b"null"), rules)
                return self._send_json(200, store.save(game, _now()))
            except (json.JSONDecodeError, validation.ValidationError, LayoutMismatch) as error:
                return self._send_json(400, {"error": str(error) or "잘못된 저장 요청이에요"})
            except SaveLocked:
                return self._send_json(409, {"error": "무결성 이상이 감지되어 저장이 잠겨 있어요"})

        def _trusted(self) -> bool:
            """내 PC 의 게임 화면에서 온 요청인지 확인합니다.

            다른 웹사이트가 몰래 127.0.0.1 로 저장 요청을 보내거나(CSRF),
            가짜 주소로 우회하는 것(DNS 리바인딩)을 막습니다.
            """
            port_ = self.server.server_address[1]
            hosts = {f"127.0.0.1:{port_}", f"localhost:{port_}"}
            origin = self.headers.get("Origin")
            if self.headers.get("Host") not in hosts or (origin and origin not in {f"http://{h}" for h in hosts}):
                self._send_json(403, {"error": "허용되지 않은 요청이에요"})
                return False
            return True

        def _send_json(self, status: int, data: dict) -> None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            # 파일 요청 기록은 너무 많아서, 문제가 생긴 요청(400 이상)만 보여 줍니다.
            if len(args) > 1 and str(args[1]).isdigit() and int(args[1]) >= 400:
                super().log_message(format, *args)

    # 127.0.0.1: 내 PC 안에서만 접속할 수 있는 주소
    return FarmServer(("127.0.0.1", port), Handler)


class FarmServer(ThreadingHTTPServer):
    daemon_threads = True
    # Windows 에서는 이 옵션이 켜져 있으면 이미 쓰는 포트에 또 붙어 버려서 끕니다.
    allow_reuse_address = sys.platform != "win32"

    def handle_error(self, request, client_address):
        """답장을 보내기 전에 브라우저가 연결을 끊은 경우는 조용히 넘어가요.

        창을 닫거나 새로고침하면서 보낸 저장 요청은 저장은 다 끝났는데, 브라우저가 이미 떠나서
        "저장했어요" 답장만 못 받는 일이 흔해요. Windows 에서는 이때 ConnectionAbortedError 가 나요.
        그 밖의 오류는 원래대로 자세히 보여 줍니다.
        """
        if isinstance(sys.exc_info()[1], ConnectionError):
            return
        super().handle_error(request, client_address)


def _now() -> int:
    return int(time.time() * 1000)
