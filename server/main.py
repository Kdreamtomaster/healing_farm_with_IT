"""힐링 농장 실행 파일.

    python server/main.py              # 게임 실행 (Chrome 이 자동으로 열려요)
    python server/main.py --no-browser # 브라우저는 직접 열기
    python server/main.py --port 9000  # 다른 포트 사용

모든 경로는 이 파일의 위치를 기준으로 계산합니다(상대 경로).
그래서 프로젝트 폴더를 어디로 옮겨도, 폴더 이름에 한글이 있어도 동작합니다.
"""

import argparse
import sys
import time
import webbrowser
from pathlib import Path

if sys.version_info < (3, 10):
    sys.exit("Python 3.10 이상이 필요해요. 지금 버전: " + sys.version.split()[0])

from api import make_server  # noqa: E402
from storage.store import FarmStore  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8765


def main() -> None:
    parser = argparse.ArgumentParser(description="힐링 농장 with IT")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true", help="브라우저를 자동으로 열지 않기")
    args = parser.parse_args()

    store = FarmStore(ROOT / "saves", ROOT / "data")
    store.open(int(time.time() * 1000))  # 게임 실행 시 저장: 실행 시각 기록
    if store.recovery:
        print("세이브 파일이 깨져 있어 복구했어요:", store.recovery["restoredFrom"] or "백업이 없어 새 농장으로 시작")
    if store.integrity != "ok":
        print("⚠ 무결성 이상: 세이브 파일이 게임 밖에서 바뀐 것 같아요. 저장이 잠깁니다.")

    try:
        server = make_server(store, ROOT, args.port)
    except OSError:
        print(f"{args.port}번 포트를 쓸 수 없어 빈 포트를 찾을게요.")
        server = make_server(store, ROOT, 0)

    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"🌱 힐링 농장이 열렸어요: {url}")
    print("   끝내려면 이 창에서 Ctrl+C 를 누르세요.")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n농장 문을 닫았어요. 또 만나요!")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
