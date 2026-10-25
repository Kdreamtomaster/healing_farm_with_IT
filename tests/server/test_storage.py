"""저장, 불러오기, 파일 손상 복구 테스트."""

import sqlite3
import unittest

from helpers import NOW, TempFarm, rules, save_request

from storage.store import LayoutMismatch
from validation import validate_save

RULES = rules()


def planted_state(store):
    state = store.load()["state"]
    state["plots"][0]["crop"] = {
        "species": "tomato",
        "plantedAt": 10,
        "progress": 0.25,
        "moisture": 62.5,
        "color": "yellow",
    }
    state["plots"][0]["border"] = "rose"
    state["inventory"]["seed_tomato"] = 3
    state["meta"]["gameMinutes"] = 42.5
    return state


class StorageTest(unittest.TestCase):
    def test_new_farm_in_korean_path(self):
        with TempFarm() as farm:
            loaded = farm.store().load()
            self.assertTrue((farm.saves / "farm.sqlite").is_file())
            self.assertEqual(len(loaded["state"]["plots"]), 32)
            self.assertEqual(loaded["state"]["inventory"]["seed_tomato"], 4)
            self.assertEqual(loaded["integrity"], "ok")

    def test_new_farm_knows_every_species(self):
        with TempFarm() as farm:
            meta = farm.store().load()["state"]["meta"]
            self.assertEqual(meta["knownSpecies"], sorted(RULES["colors"]))

    def test_known_species_is_saved_and_signed(self):
        with TempFarm() as farm:
            store = farm.store()
            state = store.load()["state"]
            state["meta"]["knownSpecies"] = ["tulip", "tomato"]
            store.save(validate_save(save_request(state), RULES), NOW + 1000)
            reopened = farm.store().load()
            self.assertEqual(reopened["integrity"], "ok")
            self.assertEqual(reopened["state"]["meta"]["knownSpecies"], ["tomato", "tulip"])

    def test_save_then_reopen_restores_same_state(self):
        with TempFarm() as farm:
            store = farm.store()
            state = planted_state(store)
            store.save(validate_save(save_request(state), RULES), NOW + 1000)

            reopened = farm.store().load()  # 서버를 껐다 켠 것과 같음
            self.assertEqual(reopened["integrity"], "ok")
            self.assertEqual(reopened["state"]["plots"][0]["crop"], state["plots"][0]["crop"])
            self.assertEqual(reopened["state"]["plots"][0]["border"], "rose")
            self.assertEqual(reopened["state"]["inventory"]["seed_tomato"], 3)
            self.assertEqual(reopened["state"]["meta"]["gameMinutes"], 42.5)
            self.assertEqual(reopened["state"]["meta"]["lastSavedAt"], NOW + 1000)

    def test_log_is_appended(self):
        with TempFarm() as farm:
            store = farm.store()
            log = [{"at": 1, "actor": "player", "action": "plant", "detail": "0:tomato"}]
            store.save(validate_save(save_request(planted_state(store), log), RULES), NOW)
            with sqlite3.connect(str(farm.saves / "farm.sqlite")) as conn:
                rows = conn.execute("SELECT actor, action FROM task_log").fetchall()
            self.assertEqual(rows, [("player", "plant")])

    def test_layout_cannot_change(self):
        with TempFarm() as farm:
            store = farm.store()
            state = store.load()["state"]
            state["plots"][0]["kind"] = "paddy"
            with self.assertRaises(LayoutMismatch):
                store.save(validate_save(save_request(state), RULES), NOW)

    def test_broken_file_is_restored_from_backup(self):
        with TempFarm() as farm:
            store = farm.store()
            state = planted_state(store)
            store.save(validate_save(save_request(state), RULES), NOW + 1000)
            for suffix in ("-wal", "-shm"):
                (farm.saves / f"farm.sqlite{suffix}").unlink(missing_ok=True)
            (farm.saves / "farm.sqlite").write_bytes(b"this is not a database")

            reopened = farm.store()
            loaded = reopened.load()
            self.assertIsNotNone(reopened.recovery["restoredFrom"])
            self.assertEqual(loaded["integrity"], "ok")
            self.assertEqual(loaded["state"]["plots"][0]["crop"], state["plots"][0]["crop"])
            self.assertTrue(any((farm.saves / "broken").iterdir()))  # 깨진 파일은 지우지 않고 보관

    def test_broken_file_without_backup_starts_new_farm(self):
        with TempFarm() as farm:
            farm.store()
            for suffix in ("-wal", "-shm"):
                (farm.saves / f"farm.sqlite{suffix}").unlink(missing_ok=True)
            (farm.saves / "farm.sqlite").write_bytes(b"garbage")

            reopened = farm.store()
            self.assertEqual(reopened.recovery, {"restoredFrom": None})
            self.assertEqual(reopened.load()["state"]["inventory"]["seed_tomato"], 4)

    def test_only_recent_backups_are_kept(self):
        with TempFarm() as farm:
            store = farm.store()
            state = planted_state(store)
            for i in range(8):
                store.save(validate_save(save_request(state), RULES), NOW + i * 1000)
            self.assertEqual(len(list((farm.saves / "backups").glob("farm-*.sqlite"))), 5)


if __name__ == "__main__":
    unittest.main()
