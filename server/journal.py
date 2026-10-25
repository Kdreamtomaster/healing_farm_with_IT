"""농장 일지: 작업 기록(task_log)으로 보여 주는 작은 데이터 파이프라인 (docs/learn/04)

    ① 원본  task_log 의 최근 기록을 그대로
    ② 정리  옛 모양 기록을 고쳐 읽고(actor 이름 → id, "tomato:4" → 작물·개수), 쓸 수 없는 줄은 이유와 함께 빼기
    ③ 집계  정리한 기록을 메모리 속 SQLite 표 clean_log 에 담고 SQL 로 묶기 — 화면에 SQL 문장도 함께 보여 줘요
    ④ 활용  해금 진행 (브라우저가 서명된 숫자 meta.stats 로 계산해요. 기록은 서명 밖이라 판단에 쓰지 않아요)

SQL 은 여기 미리 정해 둔 것만 실행해요. 브라우저가 SQL 을 보내지 않아요 (허용 목록, docs/learn/08).
"""

import json
import sqlite3
from contextlib import closing

RAW_SQL = "SELECT id, at, actor, action, detail FROM task_log ORDER BY id DESC LIMIT 15"
READ_LIMIT = 5000
QUERIES = [
    ("작물별 수확", "SELECT species AS 작물, SUM(count) AS 수확 FROM clean_log WHERE action = 'harvest' AND species IS NOT NULL GROUP BY species ORDER BY 수확 DESC"),
    ("누가 일했나", "SELECT actor AS 누가, COUNT(*) AS 일 FROM clean_log GROUP BY actor ORDER BY 일 DESC"),
    (
        "하루 중 언제",
        "SELECT CASE CAST((at % 1440) / 360 AS INTEGER) WHEN 0 THEN '새벽' WHEN 1 THEN '아침' WHEN 2 THEN '오후' ELSE '저녁' END AS 때,"
        " COUNT(*) AS 일 FROM clean_log GROUP BY 때 ORDER BY 일 DESC",
    ),
    ("무슨 일을", "SELECT action AS 일, COUNT(*) AS 번 FROM clean_log GROUP BY action ORDER BY 번 DESC LIMIT 8"),
]


def clean(rows: list, friends: list) -> tuple:
    """원본 줄 → (정리한 줄, 고친 예, 뺀 예, 센 수)"""
    names = {f["name"]: f["id"] for f in friends}
    names["멍때리기"] = "idle"
    kept, fixed, dropped = [], [], []
    counts = {"read": len(rows), "kept": 0, "fixed": 0, "dropped": 0}
    for row_id, at, actor, action, detail in rows:
        why = []
        if actor in names:
            why.append(f"actor 화면 이름 {actor} → id {names[actor]}")
            actor = names[actor]
        species, count = None, 1
        if detail.startswith("{"):
            try:
                data = json.loads(detail)
            except json.JSONDecodeError:
                dropped.append({"id": row_id, "why": "detail JSON 이 깨졌어요"})
                continue
            species, count = data.get("species"), data.get("count", 1)
            if isinstance(species, list):  # 새 씨앗 선물처럼 여러 작물
                species = None
        else:  # 옛 모양 (기록 형식을 정하기 전)
            if action.startswith("bulk:"):
                why.append(f"action {action} → bulk")
                action = "bulk"
            if action == "gift" and actor == "system":
                why.append("새 씨앗 선물을 friend 선물과 나눔: gift → seed_gift")
                action = "seed_gift"
            if ":" in detail and action == "harvest":
                species, _, n = detail.partition(":")
                count = int(n) if n.isdigit() else 1
                why.append(f"detail {detail} → 작물 {species}, 개수 {count}")
            elif detail.isdigit():
                if action in ("water", "bulk") and actor != "player":
                    count = int(detail)
                    why.append(f"detail {detail} 은 물 준 칸 수")
                elif action in ("plant", "harvest", "water", "flood"):
                    why.append(f"detail {detail} 은 칸 번호 (작물 이름 없음)")
            if action == "harvest" and species is None:
                dropped.append({"id": row_id, "why": "수확했는데 작물 이름이 없어서 수확 집계에 쓸 수 없어요"})
                continue
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            dropped.append({"id": row_id, "why": "개수가 숫자가 아니에요"})
            continue
        kept.append((at, actor, action, species, count))
        if why:
            fixed.append({"id": row_id, "why": "; ".join(why)})
    counts.update(kept=len(kept), fixed=len(fixed), dropped=len(dropped))
    return kept, fixed, dropped, counts


def build(conn: sqlite3.Connection, friends: list) -> dict:
    raw = conn.execute(RAW_SQL)
    raw_step = {"sql": RAW_SQL, "columns": [d[0] for d in raw.description], "rows": raw.fetchall()}
    rows = conn.execute(f"SELECT id, at, actor, action, detail FROM task_log ORDER BY id DESC LIMIT {READ_LIMIT}").fetchall()
    kept, fixed, dropped, counts = clean(rows, friends)
    tables = []
    with closing(sqlite3.connect(":memory:")) as mem:
        mem.execute("CREATE TABLE clean_log (at REAL, actor TEXT, action TEXT, species TEXT, count INTEGER)")
        mem.executemany("INSERT INTO clean_log VALUES (?, ?, ?, ?, ?)", kept)
        for title, sql in QUERIES:
            cursor = mem.execute(sql)
            tables.append({"title": title, "sql": sql, "columns": [d[0] for d in cursor.description], "rows": cursor.fetchall()})
    return {
        "raw": raw_step,
        "clean": {"counts": counts, "fixed": fixed[:6], "dropped": dropped[:6]},
        "tables": tables,
    }
