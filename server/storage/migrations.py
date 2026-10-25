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


def _v2_to_v3(conn: sqlite3.Connection, game_data: dict) -> None:
    """시듦 기능을 뺐습니다. 힐링 게임이라 다 자란 작물은 수확할 때까지 기다려 줘요.

    SQLite 는 칸을 지우는 기능이 오래된 버전에는 없어서, 새 표를 만들어 옮겨 담고 이름을 바꿉니다.
    이미 시들었던 작물은 다시 수확할 수 있는 상태로 되살립니다.
    """
    conn.execute(
        "CREATE TABLE crops_new ("
        " plot_id INTEGER PRIMARY KEY REFERENCES plots(id), species TEXT NOT NULL, planted_at REAL NOT NULL,"
        " progress REAL NOT NULL, moisture REAL NOT NULL, color TEXT NOT NULL DEFAULT '')"
    )
    conn.execute(
        "INSERT INTO crops_new (plot_id, species, planted_at, progress, moisture, color)"
        " SELECT plot_id, species, planted_at, CASE WHEN withered = 1 THEN 1.0 ELSE progress END, moisture, color"
        " FROM crops"
    )
    conn.execute("DROP TABLE crops")
    conn.execute("ALTER TABLE crops_new RENAME TO crops")


def _v3_to_v4(conn: sqlite3.Connection, game_data: dict) -> None:
    """7단계: 연구소와 주고받은 송장 번호를 기억하는 표가 생겼습니다."""
    conn.execute(
        "CREATE TABLE transfers (id TEXT PRIMARY KEY, kind TEXT NOT NULL, item TEXT NOT NULL,"
        " amount INTEGER NOT NULL, at INTEGER NOT NULL)"
    )


STEPS = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4}


def upgrade(conn: sqlite3.Connection, from_version: int, game_data: dict) -> None:
    """from_version 부터 최신 버전까지 차례로 올립니다. 트랜잭션 안에서 불러 주세요."""
    for version in range(from_version, db.SCHEMA_VERSION):
        STEPS[version](conn, game_data)
    db.set_meta(conn, "schemaVersion", db.SCHEMA_VERSION)
