"""6단계: 농장 일지 파이프라인 (원본 → 정리 → 집계)."""

import sqlite3
import unittest
from contextlib import closing

from helpers import NOW, TempFarm, rules, save_request

import journal
from validation import ValidationError, validate_save

FRIENDS = [{"id": "haneul", "name": "하늘"}, {"id": "bada", "name": "바다"}]


class CleanTest(unittest.TestCase):
    def test_old_rows_are_fixed_and_unusable_rows_dropped_with_a_reason(self):
        rows = [
            (1, 10, "하늘", "harvest", "tomato:4"),  # 옛 친구 수확
            (2, 20, "player", "harvest", "3"),  # 옛 플레이어 수확: 작물 이름 없음
            (3, 30, "바다", "water", "5"),  # 옛 친구 물주기: 칸 수
            (4, 40, "system", "gift", "carrot,corn"),  # 옛 새 씨앗 선물
            (5, 50, "player", "harvest", '{"plot": 1, "species": "corn", "count": 3}'),  # 새 모양
            (6, 60, "player", "plant", "{broken"),
        ]
        kept, fixed, dropped, counts = journal.clean(rows, FRIENDS)
        self.assertEqual(counts, {"read": 6, "kept": 4, "fixed": 3, "dropped": 2})
        self.assertIn((10, "haneul", "harvest", "tomato", 4), kept)
        self.assertIn((30, "bada", "water", None, 5), kept)
        self.assertIn((40, "system", "seed_gift", None, 1), kept)
        self.assertEqual({d["id"] for d in dropped}, {2, 6})


class BuildTest(unittest.TestCase):
    def test_tables_come_from_sql_over_the_cleaned_log(self):
        with TempFarm() as farm:
            store = farm.store()
            log = [
                {"at": 400, "actor": "player", "action": "harvest", "detail": '{"species": "tulip", "count": 1}'},
                {"at": 900, "actor": "haneul", "action": "harvest", "detail": '{"species": "tomato", "count": 3}'},
                {"at": 950, "actor": "하늘", "action": "harvest", "detail": "tomato:3"},
            ]
            store.save(validate_save(save_request(store.load()["state"], log), rules()), NOW)
            result = store.journal(FRIENDS)
        self.assertEqual(len(result["raw"]["rows"]), 3)
        by_title = {t["title"]: t for t in result["tables"]}
        self.assertEqual(by_title["작물별 수확"]["rows"], [("tomato", 6), ("tulip", 1)])
        self.assertIn("GROUP BY species", by_title["작물별 수확"]["sql"])
        self.assertEqual(by_title["누가 일했나"]["rows"][0], ("haneul", 2), "옛 이름 '하늘'도 haneul 로 합쳐요")
        self.assertEqual(by_title["하루 중 언제"]["rows"], [("오후", 2), ("아침", 1)], "06:40 은 아침, 15:00·15:50 은 오후")


class SignedNumbersTest(unittest.TestCase):
    def state(self, **meta):
        return {"meta": {"gameMinutes": 0, "playSeconds": 0, "timeScale": 30, **meta}, "plots": [], "inventory": {}}

    def test_stats_codex_and_unlocks_are_checked(self):
        ok = self.state(
            stats={"harvests": {"tomato": 3}, "cooked": 1},
            codex=[{"id": "tulip_rainbow", "species": "tulip", "truth": {"color": "rainbow"}, "label": {"color": "rainbow", "shape": "none", "size": "none"}, "name": "무지개", "foundAt": 1, "labeledAt": 2}],
            unlocked=["blue_tulip"],
        )
        game = validate_save(save_request(ok), rules())
        self.assertEqual(game["meta"]["unlocked"], ["blue_tulip"])
        for bad in (
            {"stats": {"harvests": {"dragonfruit": 1}}},
            {"stats": {"gold": 9}},
            {"codex": [{"id": "x", "species": "tulip", "truth": {"color": "plaid"}, "foundAt": 1}]},
            {"unlocked": ["free_money"]},
        ):
            with self.assertRaises(ValidationError):
                validate_save(save_request(self.state(**bad)), rules())

    def test_unlocked_color_can_be_saved(self):
        state = self.state()
        state["plots"] = [{"id": 0, "x": 0, "y": 0, "kind": "flowerbed", "border": "bark", "crop": {"species": "tulip", "plantedAt": 0, "progress": 0, "moisture": 50, "color": "blue"}}]
        validate_save(save_request(state), rules())


if __name__ == "__main__":
    unittest.main()
