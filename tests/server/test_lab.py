"""7단계: 완전 초기화(변조일 때만), 연구소 샌드박스, 송장 번호로 멱등하게 옮기기."""

import sqlite3
import unittest
from contextlib import closing

from helpers import NOW, TempFarm, rules, save_request

from integrity import verify
from lab import transfer
from lab.store import LabLocked, LabStore
from storage.store import NotTampered, SaveLocked
from validation import validate_save

RULES = rules()
TOMATO = RULES["species"]["tomato"]


def tamper(farm, item="seed_tomato", count=999):
    with closing(sqlite3.connect(str(farm.saves / "farm.sqlite"))) as conn:
        conn.execute("UPDATE inventory SET count = ? WHERE item = ?", (count, item))
        conn.commit()


def give(store, **items):
    state = store.load()["state"]
    state["inventory"].update(items)
    store.save(validate_save(save_request(state), RULES), NOW + 1)


class ResetTest(unittest.TestCase):
    def test_reset_only_when_tampered(self):
        with TempFarm() as farm:
            with self.assertRaises(NotTampered):
                farm.store().reset(NOW)

    def test_tamper_shows_what_changed_then_resets_everything(self):
        with TempFarm() as farm:
            give(farm.store(), seed_tomato=5)  # 스냅샷 하나 생김
            tamper(farm)
            store = farm.store()
            loaded = store.load()
            self.assertEqual(loaded["integrity"], verify.TAMPERED)
            self.assertIn({"path": "inventory.seed_tomato", "before": 5, "after": 999}, loaded["tamperDiff"])
            with self.assertRaises(SaveLocked):
                store.save(validate_save(save_request(loaded["state"]), RULES), NOW + 2)

            store.reset(NOW + 3)
            fresh = store.load()
            self.assertEqual(fresh["integrity"], verify.OK)
            self.assertEqual(fresh["state"]["inventory"]["seed_tomato"], 4)  # 새 농장
            self.assertNotIn("tamperDiff", fresh)
            moved = list((farm.saves / "broken").glob("tampered-*"))
            self.assertEqual(len(moved), 1)
            self.assertTrue((moved[0] / "farm.sqlite").exists())
            self.assertTrue(list((moved[0] / "backups").glob("farm-*.sqlite")), "스냅샷도 함께 옮겨요")
            self.assertFalse(list((farm.saves / "backups").glob("*")) if (farm.saves / "backups").exists() else [])
            with closing(sqlite3.connect(str(farm.saves / "farm.sqlite"))) as conn:
                self.assertEqual(conn.execute("SELECT action FROM task_log").fetchall(), [("reset",)])
            self.assertEqual(farm.store().load()["integrity"], verify.OK, "껐다 켜도 정상")


class LabTest(unittest.TestCase):
    def setUp(self):
        self.farm = TempFarm().__enter__()
        self.store = self.farm.store()
        give(self.store, tomato=10)
        self.lab = LabStore(self.farm.saves)

    def tearDown(self):
        self.farm.__exit__(None, None, None)

    def inventory(self):
        return self.store.load()["state"]["inventory"]

    def test_lab_is_a_separate_file_with_its_own_key(self):
        loaded = self.lab.load()
        self.assertTrue((self.farm.saves / "lab.sqlite").exists())
        self.assertNotEqual(loaded["key"], (self.farm.saves / ".key").read_text().strip())
        self.assertEqual(loaded["integrity"], verify.OK)
        self.assertEqual(loaded["hmac"], loaded["storedDigest"])
        self.assertNotEqual(loaded["sha256"], loaded["hmac"], "키가 없는 해시와 HMAC 은 달라요")

    def test_send_crops_to_lab(self):
        transfer.send_to_lab(self.store, self.lab, TOMATO, 4, NOW)
        self.assertEqual(self.inventory()["tomato"], 6)
        samples = self.lab.load()["samples"]
        self.assertEqual([(s["species"], s["count"]) for s in samples], [("tomato", 4)])
        self.assertEqual(self.store.load()["integrity"], verify.OK)

    def test_cannot_send_more_than_you_have(self):
        with self.assertRaises(ValueError):
            transfer.send_to_lab(self.store, self.lab, TOMATO, 11, NOW)
        self.assertEqual(self.inventory()["tomato"], 10)
        self.assertEqual(self.lab.load()["samples"], [])

    def test_only_biofuel_comes_back(self):
        transfer.send_to_lab(self.store, self.lab, TOMATO, 4, NOW)
        sample = self.lab.load()["samples"][0]
        transfer.send_fuel(self.store, self.lab, sample["id"], 3, NOW + 1)
        inventory = self.inventory()
        self.assertEqual((inventory["biofuel"], inventory["tomato"]), (3, 6), "토마토는 돌아오지 않고 연료만")
        self.assertEqual(self.lab.load()["samples"][0]["count"], 1)
        self.assertTrue(all(t["status"] == "done" for t in self.lab.load()["transfers"]))

    def test_experiment_changes_color_and_size_but_not_count(self):
        transfer.send_to_lab(self.store, self.lab, TOMATO, 2, NOW)
        sample = self.lab.load()["samples"][0]
        self.lab.experiment(sample["id"], "#3366ff", "big")
        after = self.lab.load()
        self.assertEqual((after["samples"][0]["color"], after["samples"][0]["size"], after["samples"][0]["count"]), ("#3366ff", "big", 2))
        self.assertEqual(after["integrity"], verify.OK)

    def test_fuel_survives_a_crash_and_is_never_added_twice(self):
        transfer.send_to_lab(self.store, self.lab, TOMATO, 5, NOW)
        sample = self.lab.load()["samples"][0]
        # ① 까지만 하고 꺼진 것처럼
        sent = self.lab.start_fuel("crash-1", sample["id"], 5, NOW + 1)
        self.assertNotIn("biofuel", self.inventory())
        self.assertEqual(transfer.recover(self.store, self.lab, RULES["species"], NOW + 2), 1)
        self.assertEqual(self.inventory()["biofuel"], 5)
        # ② 까지 하고 꺼진 것처럼: 농장은 이미 받았으니 다시 더하지 않아요
        self.assertFalse(self.store.apply_transfer(sent, NOW + 3))
        self.assertEqual(transfer.recover(self.store, self.lab, RULES["species"], NOW + 4), 0)
        self.assertEqual(self.inventory()["biofuel"], 5)

    def test_crops_on_the_way_to_lab_arrive_once(self):
        moving = {"id": "crash-2", "kind": "to_lab", "item": "tomato", "amount": 3, "at": NOW}
        self.store.apply_transfer(moving, NOW)  # 농장에서 빼고 꺼짐
        self.assertEqual(transfer.recover(self.store, self.lab, RULES["species"], NOW + 1), 1)
        self.assertEqual(transfer.recover(self.store, self.lab, RULES["species"], NOW + 2), 0)
        self.assertEqual(self.lab.load()["samples"][0]["count"], 3)

    def test_tampered_lab_cannot_send_fuel_or_fake_a_waybill(self):
        transfer.send_to_lab(self.store, self.lab, TOMATO, 2, NOW)
        with closing(sqlite3.connect(str(self.farm.saves / "lab.sqlite"))) as conn:
            conn.execute("UPDATE samples SET count = 999")
            conn.execute("INSERT INTO transfers VALUES ('fake', 'fuel', 'biofuel', 999, 'sending', 0)")
            conn.commit()
        loaded = self.lab.load()
        self.assertEqual(loaded["integrity"], verify.TAMPERED, "연구소도 변조를 알아채요 (벌칙은 없어요)")
        with self.assertRaises(LabLocked):
            transfer.send_fuel(self.store, self.lab, loaded["samples"][0]["id"], 10, NOW + 1)
        transfer.recover(self.store, self.lab, RULES["species"], NOW + 2)
        self.assertNotIn("biofuel", self.inventory(), "지어낸 송장은 믿지 않아요")
        self.assertEqual(self.store.load()["integrity"], verify.OK, "본 농장은 무사해요")
        self.lab.clear()
        self.assertEqual(self.lab.load()["integrity"], verify.OK)

    def test_tampered_farm_cannot_trade(self):
        tamper(self.farm, "tomato", 50)
        store = self.farm.store()
        with self.assertRaises(SaveLocked):
            transfer.send_to_lab(store, self.lab, TOMATO, 1, NOW)


if __name__ == "__main__":
    unittest.main()
