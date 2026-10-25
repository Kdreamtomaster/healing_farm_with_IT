"""서버 주소 처리, 입력 검증, 요청 출처 확인 테스트."""

import http.client
import json
import threading
import unittest

from helpers import ROOT, TempFarm, save_request

from api import make_server, resolve_static
from validation import ValidationError, validate_save

SPECIES = {"tomato", "potato", "rice", "tulip"}


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
            "plots": [{"id": 0, "x": 0, "y": 0, "kind": "field", "crop": None}],
            "inventory": {"seed_tomato": 1},
        }

    def test_valid_request(self):
        game = validate_save(save_request(self.state()), SPECIES)
        self.assertEqual(game["layout"], [(0, 0, 0, "field")])

    def assert_rejected(self, state):
        with self.assertRaises(ValidationError):
            validate_save(save_request(state), SPECIES)

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
            "species": "gold", "plantedAt": 0, "progress": 0, "moisture": 0, "ripeMinutes": 0, "withered": False,
        }
        self.assert_rejected(state)

    def test_rejects_not_finite(self):
        state = self.state()
        state["meta"]["gameMinutes"] = float("nan")
        self.assert_rejected(state)

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

    def test_rejects_other_website(self):
        status, _ = self.request("POST", "/api/save", "{}", {"Origin": "http://evil.example"})
        self.assertEqual(status, 403)

    def test_rejects_wrong_host(self):
        status, _ = self.request("GET", "/api/state", headers={"Host": "evil.example"})
        self.assertEqual(status, 403)

    def test_bad_save_is_400(self):
        status, _ = self.request("POST", "/api/save", "not json")
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
