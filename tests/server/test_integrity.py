"""해시(지문)로 변조를 알아채는지 테스트."""

import sqlite3
import unittest

from helpers import NOW, TempFarm, rules, save_request

from integrity import hashing
from storage.store import SaveLocked
from validation import validate_save

RULES = rules()
KEY = b"k" * 32


class HashingTest(unittest.TestCase):
    def sample(self):
        return {"meta": {"gameMinutes": 1, "lastLaunchAt": 5}, "plots": [], "inventory": {"tomato": 3}}

    def test_same_state_same_digest(self):
        self.assertEqual(hashing.digest(self.sample(), KEY), hashing.digest(self.sample(), KEY))

    def test_one_value_changes_digest(self):
        changed = self.sample()
        changed["inventory"]["tomato"] = 4
        self.assertNotEqual(hashing.digest(self.sample(), KEY), hashing.digest(changed, KEY))

    def test_launch_time_is_not_signed(self):
        changed = self.sample()
        changed["meta"]["lastLaunchAt"] = 999
        self.assertEqual(hashing.digest(self.sample(), KEY), hashing.digest(changed, KEY))

    def test_different_key_different_digest(self):
        self.assertNotEqual(hashing.digest(self.sample(), KEY), hashing.digest(self.sample(), b"x" * 32))


class TamperTest(unittest.TestCase):
    def test_editing_save_file_is_detected_and_save_locked(self):
        with TempFarm() as farm:
            farm.store()
            with sqlite3.connect(str(farm.saves / "farm.sqlite")) as conn:
                conn.execute("UPDATE inventory SET count = 999 WHERE item = 'seed_tomato'")

            store = farm.store()
            self.assertEqual(store.integrity, "tampered")
            self.assertIsNone(store.recovery)  # 변조는 파일 손상이 아니므로 복구하지 않음
            with self.assertRaises(SaveLocked):
                store.save(validate_save(save_request(store.load()["state"]), RULES), NOW)

    def test_deleting_key_is_detected(self):
        with TempFarm() as farm:
            farm.store()
            (farm.saves / ".key").unlink()
            self.assertEqual(farm.store().integrity, "tampered")

    def test_normal_reopen_is_ok(self):
        with TempFarm() as farm:
            farm.store()
            self.assertEqual(farm.store().integrity, "ok")


if __name__ == "__main__":
    unittest.main()
