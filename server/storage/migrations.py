"""옛 버전 세이브를 새 표 구조로 옮깁니다 (마이그레이션).

게임이 업데이트되어 표에 칸이 늘어나도, 예전에 키운 농장을 그대로 이어서 할 수 있게 해 줍니다.
버전마다 "한 단계 올리는 함수"를 하나씩 두고, 필요한 만큼 차례로 실행합니다.
    1 → 2 → 3 → ...
"""

import sqlite3

from storage import db


def _v1_to_v2(conn: sqlite3.Connection, game_data: dict) -> None:
    """4단계: 구획 테두리 색(border)과 작물 색(color)이 생겼습니다."""
    conn.execute("ALTER TABLE plots ADD COLUMN border TEXT NOT NULL DEFAULT ''")
    for kind, border in game_data["start"]["borders"].items():
        conn.execute("UPDATE plots SET border = ? WHERE kind = ?", (border, kind))
    conn.execute("ALTER TABLE crops ADD COLUMN color TEXT NOT NULL DEFAULT ''")
    for species in game_data["crops"]:
        conn.execute("UPDATE crops SET color = ? WHERE species = ?", (species["colors"][0]["id"], species["id"]))


STEPS = {1: _v1_to_v2}


def upgrade(conn: sqlite3.Connection, from_version: int, game_data: dict) -> None:
    """from_version 부터 최신 버전까지 차례로 올립니다. 트랜잭션 안에서 불러 주세요."""
    for version in range(from_version, db.SCHEMA_VERSION):
        STEPS[version](conn, game_data)
    db.set_meta(conn, "schemaVersion", db.SCHEMA_VERSION)
