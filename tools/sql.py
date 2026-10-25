"""농장 세이브를 읽기 전용으로 열어 SQL 을 실행해 보는 도구 (docs/learn 실험용)

    python tools/sql.py "SELECT item, count FROM inventory ORDER BY count DESC"
    python tools/sql.py "SELECT actor, action, COUNT(*) FROM task_log GROUP BY actor, action"

세이브를 읽기 전용(mode=ro)으로 열어요. INSERT·UPDATE·DELETE 같은 "고치는" SQL 은
데이터베이스가 거절하니, 마음껏 물어봐도 농장은 안전해요. (최소 권한 → docs/learn/08)
"""

import sqlite3
import sys
import unicodedata
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SAVE = ROOT / "saves" / "farm.sqlite"
MAX_ROWS = 200


def width(text: str) -> int:
    # 한글은 터미널에서 두 칸을 차지해서, 표 줄을 맞추려면 따로 세어야 해요
    return sum(2 if unicodedata.east_asian_width(ch) in "WF" else 1 for ch in text)


def pad(text: str, size: int) -> str:
    return text + " " * (size - width(text))


def print_table(columns: list, rows: list) -> None:
    cells = [[str(c) for c in columns]] + [["NULL" if v is None else str(v) for v in row] for row in rows]
    sizes = [max(width(row[i]) for row in cells) for i in range(len(columns))]
    line = "-+-".join("-" * s for s in sizes)
    for i, row in enumerate(cells):
        print(" | ".join(pad(v, s) for v, s in zip(row, sizes)))
        if i == 0:
            print(line)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    if not SAVE.exists():
        print("세이브가 아직 없어요. 먼저 python server/main.py 로 게임을 한 번 실행해 주세요.")
        return 1
    with closing(sqlite3.connect(SAVE.as_uri() + "?mode=ro", uri=True)) as db:
        try:
            cursor = db.execute(sys.argv[1])
        except sqlite3.Error as error:
            print(f"SQL 이 실행되지 않았어요: {error}")
            return 1
        if cursor.description is None:
            print("결과가 없는 SQL 이에요.")
            return 0
        rows = cursor.fetchmany(MAX_ROWS + 1)
        print_table([d[0] for d in cursor.description], rows[:MAX_ROWS])
        if len(rows) > MAX_ROWS:
            print(f"… {MAX_ROWS}줄까지만 보여 줬어요. LIMIT 로 줄여 보세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
