"""SQLite 파일을 열고, 농장 상태를 표에 쓰고 읽습니다.

이 파일의 함수들은 트랜잭션(BEGIN ~ COMMIT)을 직접 시작하지 않습니다.
"어디서부터 어디까지를 한 번에 저장할지"는 부르는 쪽(store.py)이 정합니다.
"""

import json
import sqlite3
from pathlib import Path

# 표 구조를 바꾸면 이 숫자를 올리고 migrations.py 에 옮기는 방법을 적어 주세요.
SCHEMA_VERSION = 3
SCHEMA_FILE = Path(__file__).with_name("schema.sql")
REQUIRED_TABLES = {"meta", "plots", "crops", "inventory", "task_log", "integrity"}

# 저장 요청으로 브라우저가 바꿀 수 있는 meta 값. 나머지는 서버만 씁니다.
# knownSpecies: 이 농장이 이미 아는 작물들 (새 작물이 추가되면 씨앗을 한 번 선물하려고 기억해요)
GAME_META_KEYS = ("gameMinutes", "playSeconds", "timeScale", "knownSpecies")


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


def fill_new_farm(conn: sqlite3.Connection, start: dict, now: int, species=()) -> None:
    """data/start.json 내용으로 새 농장의 표를 채웁니다."""
    legend = start["legend"]
    plots = []
    for y, row in enumerate(start["layout"]):
        for x, symbol in enumerate(row):
            kind = legend[symbol]
            plots.append((len(plots), x, y, kind, start["borders"][kind]))
    conn.executemany("INSERT INTO plots (id, x, y, kind, border) VALUES (?, ?, ?, ?, ?)", plots)
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
        "knownSpecies": sorted(species),  # 새 농장은 지금 있는 작물을 다 알고 시작해요
    }.items():
        set_meta(conn, key, value)


def set_meta(conn: sqlite3.Connection, key: str, value) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value)),
    )


def get_meta(conn: sqlite3.Connection, key: str, default=None):
    row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return json.loads(row[0]) if row else default


def _columns(conn: sqlite3.Connection, table: str) -> set:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


# 표의 칸 이름 → 브라우저가 쓰는 이름
CROP_FIELDS = {
    "species": "species",
    "planted_at": "plantedAt",
    "progress": "progress",
    "moisture": "moisture",
    "color": "color",
    "ripe_minutes": "ripeMinutes",  # 버전 2까지 (시듦 기능, 지금은 없음)
    "withered": "withered",  # 버전 2까지
}
PLOT_FIELDS = {"id": "id", "x": "x", "y": "y", "kind": "kind", "border": "border"}


def _read_rows(conn: sqlite3.Connection, table: str, fields: dict, order: str = "") -> list:
    """표에 실제로 있는 칸만 골라 읽습니다.

    옛 버전 세이브도 읽을 수 있어야 마이그레이션 전에 지문을 확인할 수 있거든요.
    """
    present = [name for name in fields if name in _columns(conn, table)]
    rows = conn.execute(f"SELECT {', '.join(present)} FROM {table} {order}")
    return [{fields[name]: value for name, value in zip(present, row)} for row in rows]


def read_state(conn: sqlite3.Connection) -> dict:
    """표에 저장된 농장 상태를 브라우저가 쓰는 모양(dict)으로 읽어 옵니다."""
    meta = {key: json.loads(value) for key, value in conn.execute("SELECT key, value FROM meta ORDER BY key")}
    crops = {}
    for crop in _read_rows(conn, "crops", {"plot_id": "plotId", **CROP_FIELDS}):
        if "withered" in crop:
            crop["withered"] = bool(crop["withered"])
        crops[crop.pop("plotId")] = crop
    plots = [{**plot, "crop": crops.get(plot["id"])} for plot in _read_rows(conn, "plots", PLOT_FIELDS, "ORDER BY id")]
    inventory = dict(conn.execute("SELECT item, count FROM inventory ORDER BY item"))
    return {"meta": meta, "plots": plots, "inventory": inventory}


def read_layout(conn: sqlite3.Connection) -> list:
    return [tuple(row) for row in conn.execute("SELECT id, x, y, kind FROM plots ORDER BY id")]


def write_game(conn: sqlite3.Connection, game: dict, now: int) -> None:
    """검증을 마친 저장 요청(game)을 표에 씁니다. 구획 배치(위치, 종류)는 바꾸지 않습니다."""
    conn.executemany("UPDATE plots SET border = ? WHERE id = ?", [(b, i) for i, b in sorted(game["borders"].items())])
    conn.execute("DELETE FROM crops")
    conn.executemany(
        "INSERT INTO crops (plot_id, species, planted_at, progress, moisture, color) VALUES (?, ?, ?, ?, ?, ?)",
        [
            (
                plot_id,
                crop["species"],
                crop["plantedAt"],
                crop["progress"],
                crop["moisture"],
                crop["color"],
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
        if key in game["meta"]:
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
