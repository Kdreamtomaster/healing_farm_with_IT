"""서버 주소 처리, 입력 검증, 요청 출처 확인 테스트."""

import contextlib
import http.client
import io
import json
import socket
import threading
import time
import unittest

from helpers import ROOT, TempFarm, rules, save_request

from api import make_server, resolve_static
from validation import ValidationError, validate_save

RULES = rules()


class StaticPathTest(unittest.TestCase):
    def test_allowed_file(self):
        self.assertEqual(resolve_static(ROOT, "/web/index.html"), (ROOT / "web" / "index.html").resolve())

    def test_blocks_folders_outside_allow_list(self):
        self.assertIsNone(resolve_static(ROOT, "/saves/README.md"))
        self.assertIsNone(resolve_static(ROOT, "/server/main.py"))

    def test_blocks_path_traversal(self):
        self.assertIsNone(resolve_static(ROOT, "/web/../server/main.py"))
        self.assertIsNone(resolve_static(ROOT, "/web/%2e%2e/server/main.py"))
        self.assertIsNone(resolve_static(ROOT, "/web/..\\server\\main.py"))


class ValidationTest(unittest.TestCase):
    def state(self):
        return {
            "meta": {"gameMinutes": 0, "playSeconds": 0, "timeScale": 30},
            "plots": [{"id": 0, "x": 0, "y": 0, "kind": "field", "border": "oak", "crop": None}],
            "inventory": {"seed_tomato": 1},
        }

    def test_valid_request(self):
        game = validate_save(save_request(self.state()), RULES)
        self.assertEqual(game["layout"], [(0, 0, 0, "field")])

    def assert_rejected(self, state):
        with self.assertRaises(ValidationError):
            validate_save(save_request(state), RULES)

    def test_rejects_negative_count(self):
        state = self.state()
        state["inventory"]["seed_tomato"] = -1
        self.assert_rejected(state)

    def test_rejects_bool_as_number(self):
        state = self.state()
        state["inventory"]["seed_tomato"] = True
        self.assert_rejected(state)

    def test_rejects_unknown_species(self):
        state = self.state()
        state["plots"][0]["crop"] = {
            "species": "gold", "plantedAt": 0, "progress": 0, "moisture": 0,
            "color": "red",
        }
        self.assert_rejected(state)

    def test_rejects_color_the_crop_does_not_have(self):
        state = self.state()
        state["plots"][0]["crop"] = {
            "species": "rice", "plantedAt": 0, "progress": 0, "moisture": 0,
            "color": "purple",
        }
        self.assert_rejected(state)

    def test_rejects_unknown_border(self):
        state = self.state()
        state["plots"][0]["border"] = "#000000"
        self.assert_rejected(state)

    def test_rejects_not_finite(self):
        state = self.state()
        state["meta"]["gameMinutes"] = float("nan")
        self.assert_rejected(state)

    def test_known_species_must_be_real_species(self):
        state = self.state()
        state["meta"]["knownSpecies"] = ["tomato", "tulip"]
        self.assertEqual(validate_save(save_request(state), RULES)["meta"]["knownSpecies"], ["tomato", "tulip"])
        for bad in (["dragonfruit"], ["tomato", "tomato"], [{"id": "tomato"}], "tomato"):
            state["meta"]["knownSpecies"] = bad
            self.assert_rejected(state)

    def test_old_screen_without_known_species_is_fine(self):
        self.assertNotIn("knownSpecies", validate_save(save_request(self.state()), RULES)["meta"])

    def smartfarm(self, **dag):
        base = {"id": "morning", "name": "아침", "schedule": "daily@06:00",
                "tasks": [{"id": "plant", "block": "plant", "params": {"kind": "field"}}, {"id": "water", "block": "water", "retries": 2}],
                "edges": [["plant", "water"]]}
        state = self.state()
        state["meta"]["smartfarm"] = {"dags": [{**base, **dag}], "runs": {}, "history": [], "lastDaily": {}}
        return state

    def test_smartfarm_is_checked(self):
        self.assertEqual(validate_save(save_request(self.smartfarm()), RULES)["meta"]["smartfarm"]["dags"][0]["id"], "morning")
        for bad in (
            {"edges": [["plant", "water"], ["water", "plant"]]},  # 빙글 도는 길
            {"edges": [["plant", "ghost"]]},
            {"schedule": "hourly"},
            {"tasks": [{"id": "plant", "block": "teleport"}]},
            {"tasks": [{"id": "Plant!", "block": "plant"}]},
            {"tasks": [{"id": "plant", "block": "plant", "retries": 99}]},
        ):
            self.assert_rejected(self.smartfarm(**bad))

    def test_rejects_strange_item_name(self):
        state = self.state()
        state["inventory"]["<script>"] = 1
        self.assert_rejected(state)


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.farm = TempFarm().__enter__()
        root = self.farm.root
        (root / "web").mkdir()
        (root / "web" / "index.html").write_text("<p>hi</p>", encoding="utf-8")
        self.server = make_server(self.farm.store(), root, 0)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.farm.__exit__(None, None, None)

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port)
        conn.request(method, path, body=body, headers=headers or {})
        res = conn.getresponse()
        data = res.read()
        conn.close()
        return res.status, data

    def test_state_and_save_round_trip(self):
        status, data = self.request("GET", "/api/state")
        self.assertEqual(status, 200)
        state = json.loads(data)["state"]
        state["inventory"]["seed_potato"] = 1
        status, _ = self.request("POST", "/api/save", json.dumps(save_request(state)), {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        _, data = self.request("GET", "/api/state")
        self.assertEqual(json.loads(data)["state"]["inventory"]["seed_potato"], 1)

    def post(self, path, body):
        status, data = self.request("POST", path, json.dumps(body), {"Content-Type": "application/json"})
        return status, json.loads(data)

    def test_reset_is_refused_for_a_healthy_farm(self):
        status, data = self.post("/api/reset", {})
        self.assertEqual(status, 409, data)

    def test_lab_round_trip(self):
        status, data = self.request("GET", "/api/lab/state")
        lab = json.loads(data)
        self.assertEqual((status, lab["integrity"], lab["samples"]), (200, "ok", []))
        self.assertEqual(self.post("/api/lab/import", {"species": "dragonfruit", "count": 1})[0], 400)
        self.assertEqual(self.post("/api/lab/import", {"species": "tomato", "count": 1})[0], 400, "창고에 토마토가 없어요")
        self.assertEqual(self.post("/api/lab/experiment", {"sampleId": 1, "color": "red", "size": "big"})[0], 400)
        self.assertEqual(self.post("/api/lab/clear", {})[0], 409, "멀쩡한 연구소는 비우지 않아요")

    def test_rejects_other_website(self):
        status, _ = self.request("POST", "/api/save", "{}", {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)

    def test_rejects_wrong_host(self):
        status, _ = self.request("GET", "/api/state", headers={"Host": "evil.example"})
        self.assertEqual(status, 403)

    def test_client_leaving_early_does_not_print_traceback(self):
        """저장 요청만 보내고 답장을 기다리지 않고 떠나는 브라우저 (창 닫기, 새로고침)"""
        status, data = self.request("GET", "/api/state")
        body = json.dumps(save_request(json.loads(data)["state"])).encode()
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors):
            raw = socket.create_connection(("127.0.0.1", self.port))
            raw.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, b"\x01\x00\x00\x00\x00\x00\x00\x00")  # 끊을 때 RST
            raw.sendall(
                f"POST /api/save HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nContent-Type: application/json\r\n"
                f"Content-Length: {len(body)}\r\n\r\n".encode() + body
            )
            raw.close()
            time.sleep(0.5)
        self.assertNotIn("Traceback", errors.getvalue())
        _, data = self.request("GET", "/api/state")
        self.assertEqual(json.loads(data)["integrity"], "ok")  # 저장은 정상

    def test_connection_errors_are_quiet_but_other_errors_are_shown(self):
        for error, shown in ((ConnectionAbortedError(), False), (BrokenPipeError(), False), (ValueError("bug"), True)):
            errors = io.StringIO()
            with contextlib.redirect_stderr(errors):
                try:
                    raise error
                except Exception:
                    self.server.handle_error(None, ("127.0.0.1", 0))
            self.assertEqual("Traceback" in errors.getvalue(), shown, type(error).__name__)

    def test_bad_save_is_400(self):
        status, _ = self.request("POST", "/api/save", "not json")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
