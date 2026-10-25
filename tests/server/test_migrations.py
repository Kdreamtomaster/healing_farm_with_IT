"""옛 버전(1) 세이브를 새 표 구조로 옮기는지 테스트."""

import json
import sqlite3
import unittest
from contextlib import closing

from helpers import TempFarm

from integrity import hashing
from storage import db

# 3단계까지 쓰던 표 구조 (border, color 칸이 없음)
V1_SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE plots (id INTEGER PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL, kind TEXT NOT NULL);
CREATE TABLE crops (plot_id INTEGER PRIMARY KEY REFERENCES plots(id), species TEXT NOT NULL, planted_at REAL NOT NULL,
    progress REAL NOT NULL, moisture REAL NOT NULL, ripe_minutes REAL NOT NULL, withered INTEGER NOT NULL);
CREATE TABLE inventory (item TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE task_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, actor TEXT NOT NULL,
    action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE TABLE integrity (id INTEGER PRIMARY KEY CHECK (id = 1), algo TEXT NOT NULL, digest TEXT NOT NULL);
"""


def make_v1_save(farm, tamper=False):
    farm.saves.mkdir(parents=True)
    key = hashing.load_or_create_key(farm.saves / ".key")
    with closing(sqlite3.connect(str(farm.saves / "farm.sqlite"), isolation_level=None)) as conn:
        conn.executescript(V1_SCHEMA)
        conn.executemany("INSERT INTO plots VALUES (?, ?, ?, ?)", [(0, 0, 0, "field"), (1, 1, 0, "paddy"), (2, 2, 0, "flowerbed")])
        conn.execute("INSERT INTO crops VALUES (2, 'tulip', 0, 0.5, 50, 0, 0)")
        conn.execute("INSERT INTO crops VALUES (0, 'tomato', 0, 1.0, 20, 400, 1)")  # 시들었던 토마토
        conn.execute("INSERT INTO inventory VALUES ('seed_tulip', 3)")
        for k, v in {"schemaVersion": 1, "createdAt": 1, "lastSavedAt": 1, "lastLaunchAt": 1,
                     "gameMinutes": 10, "playSeconds": 5, "timeScale": 30}.items():
            conn.execute("INSERT INTO meta VALUES (?, ?)", (k, json.dumps(v)))
        conn.execute("INSERT INTO integrity VALUES (1, ?, ?)", (hashing.ALGO, hashing.digest(db.read_state(conn), key)))
        if tamper:
            conn.execute("UPDATE inventory SET count = 999")


class MigrationTest(unittest.TestCase):
    def test_v1_save_is_upgraded_and_stays_valid(self):
        # 1 → 2 (색 추가) → 3 (시듦 제거, 시든 작물은 수확할 수 있게 되살림)
        with TempFarm() as farm:
            make_v1_save(farm)
            store = farm.store()
            state = store.load()["state"]
            self.assertEqual(store.integrity, "ok")
            self.assertEqual(state["meta"]["schemaVersion"], db.SCHEMA_VERSION)
            self.assertEqual([p["border"] for p in state["plots"]], ["oak", "stream", "bark"])
            self.assertEqual(state["plots"][2]["crop"]["color"], "pink")  # 튤립의 첫 번째 색
            self.assertEqual(state["plots"][0]["crop"], {"species": "tomato", "plantedAt": 0.0, "progress": 1.0, "moisture": 20.0, "color": "red"})
            self.assertEqual(state["inventory"]["seed_tulip"], 3)

    def test_tampered_v1_save_stays_tampered(self):
        with TempFarm() as farm:
            make_v1_save(farm, tamper=True)
            store = farm.store()
            self.assertEqual(store.integrity, "tampered")
            self.assertEqual(store.load()["state"]["meta"]["schemaVersion"], db.SCHEMA_VERSION)

    def test_newer_save_is_refused(self):
        with TempFarm() as farm:
            farm.store()
            with closing(sqlite3.connect(str(farm.saves / "farm.sqlite"))) as conn, conn:
                conn.execute("UPDATE meta SET value = '99' WHERE key = 'schemaVersion'")
            with self.assertRaises(RuntimeError):
                farm.store()


if __name__ == "__main__":
    unittest.main()
