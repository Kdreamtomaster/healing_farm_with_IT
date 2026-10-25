"""SQLite 파일을 열고, 농장 상태를 표에 쓰고 읽습니다.

이 파일의 함수들은 트랜잭션(BEGIN ~ COMMIT)을 직접 시작하지 않습니다.
"어디서부터 어디까지를 한 번에 저장할지"는 부르는 쪽(store.py)이 정합니다.
"""

import json
import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1
SCHEMA_FILE = Path(__file__).with_name("schema.sql")
REQUIRED_TABLES = {"meta", "plots", "crops", "inventory", "task_log", "integrity"}

# 저장 요청으로 브라우저가 바꿀 수 있는 meta 값. 나머지는 서버만 씁니다.
GAME_META_KEYS = ("gameMinutes", "playSeconds", "timeScale")


def connect(path: Path) -> sqlite3.Connection:
    # isolation_level=None: 파이썬이 몰래 트랜잭션을 열지 않게 하고, BEGIN/COMMIT 을 직접 씁니다.
    conn = sqlite3.connect(str(path), isolation_level=None)
    # WAL: 저장 도중 꺼져도 파일이 깨지지 않도록 바뀔 내용을 먼저 따로 적어 둡니다.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def check_file(path: Path) -> bool:
    """파일이 열리는 정상 SQLite 이고 필요한 표가 모두 있는지 확인합니다."""
    if not path.is_file():
        return False
    try:
        conn = sqlite3.connect(str(path))
        try:
            result = conn.execute("PRAGMA integrity_check").fetchone()[0]
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return False
    return result == "ok" and REQUIRED_TABLES <= tables


def create_schema(conn: sqlite3.Connection) -> None:
    # executescript 는 열려 있던 트랜잭션을 먼저 COMMIT 하므로, 트랜잭션 밖에서 부릅니다.
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))


def fill_new_farm(conn: sqlite3.Connection, start: dict, now: int) -> None:
    """data/start.json 내용으로 새 농장의 표를 채웁니다."""
    legend = start["legend"]
    plots = []
    for y, row in enumerate(start["layout"]):
        for x, symbol in enumerate(row):
            plots.append((len(plots), x, y, legend[symbol]))
    conn.executemany("INSERT INTO plots (id, x, y, kind) VALUES (?, ?, ?, ?)", plots)
    conn.executemany(
        "INSERT INTO inventory (item, count) VALUES (?, ?)",
        sorted(start["inventory"].items()),
    )
    for key, value in {
        "schemaVersion": SCHEMA_VERSION,
        "createdAt": now,
        "lastSavedAt": now,
        "lastLaunchAt": now,
        "gameMinutes": 0,
        "playSeconds": 0,
        "timeScale": start["timeScale"],
    }.items():
        set_meta(conn, key, value)


def set_meta(conn: sqlite3.Connection, key: str, value) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value)),
    )


def read_state(conn: sqlite3.Connection) -> dict:
    """표에 저장된 농장 상태를 브라우저가 쓰는 모양(dict)으로 읽어 옵니다."""
    meta = {key: json.loads(value) for key, value in conn.execute("SELECT key, value FROM meta ORDER BY key")}
    crops = {
        plot_id: {
            "species": species,
            "plantedAt": planted_at,
            "progress": progress,
            "moisture": moisture,
            "ripeMinutes": ripe_minutes,
            "withered": bool(withered),
        }
        for plot_id, species, planted_at, progress, moisture, ripe_minutes, withered in conn.execute(
            "SELECT plot_id, species, planted_at, progress, moisture, ripe_minutes, withered FROM crops"
        )
    }
    plots = [
        {"id": plot_id, "x": x, "y": y, "kind": kind, "crop": crops.get(plot_id)}
        for plot_id, x, y, kind in conn.execute("SELECT id, x, y, kind FROM plots ORDER BY id")
    ]
    inventory = dict(conn.execute("SELECT item, count FROM inventory ORDER BY item"))
    return {"meta": meta, "plots": plots, "inventory": inventory}


def read_layout(conn: sqlite3.Connection) -> list:
    return [tuple(row) for row in conn.execute("SELECT id, x, y, kind FROM plots ORDER BY id")]


def write_game(conn: sqlite3.Connection, game: dict, now: int) -> None:
    """검증을 마친 저장 요청(game)을 표에 씁니다. 구획 배치(plots)는 바꾸지 않습니다."""
    conn.execute("DELETE FROM crops")
    conn.executemany(
        "INSERT INTO crops (plot_id, species, planted_at, progress, moisture, ripe_minutes, withered)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            (
                plot_id,
                crop["species"],
                crop["plantedAt"],
                crop["progress"],
                crop["moisture"],
                crop["ripeMinutes"],
                int(crop["withered"]),
            )
            for plot_id, crop in sorted(game["crops"].items())
        ],
    )
    conn.execute("DELETE FROM inventory")
    conn.executemany(
        "INSERT INTO inventory (item, count) VALUES (?, ?)",
        [(item, count) for item, count in sorted(game["inventory"].items()) if count > 0],
    )
    for key in GAME_META_KEYS:
        set_meta(conn, key, game["meta"][key])
    set_meta(conn, "lastSavedAt", now)


def append_log(conn: sqlite3.Connection, entries: list) -> None:
    conn.executemany(
        "INSERT INTO task_log (at, actor, action, detail) VALUES (?, ?, ?, ?)",
        [(e["at"], e["actor"], e["action"], e["detail"]) for e in entries],
    )


def read_digest(conn: sqlite3.Connection):
    row = conn.execute("SELECT digest FROM integrity WHERE id = 1").fetchone()
    return row[0] if row else None


def write_digest(conn: sqlite3.Connection, algo: str, digest: str) -> None:
    conn.execute(
        "INSERT INTO integrity (id, algo, digest) VALUES (1, ?, ?)"
        " ON CONFLICT(id) DO UPDATE SET algo = excluded.algo, digest = excluded.digest",
        (algo, digest),
    )
