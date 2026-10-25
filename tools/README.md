# tools/ — 실험과 공부를 돕는 작은 도구

## 이 폴더는 왜 있나요?
게임을 돌리는 데 꼭 필요하지는 않지만, [docs/learn/](../docs/learn/) 문서의 "직접 해 보기"를 쉽게 해 주는 도구를 모아 둡니다.

## 도구
| 파일 | 하는 일 |
|---|---|
| `sql.py` | 농장 세이브(`saves/farm.sqlite`)를 **읽기 전용**으로 열어 SQL 을 실행하고 결과를 표로 보여 줘요 |

```bash
python tools/sql.py "SELECT item, count FROM inventory ORDER BY count DESC"
python tools/sql.py "SELECT actor, action, COUNT(*) AS n FROM task_log GROUP BY actor, action ORDER BY n DESC"
python tools/sql.py "DELETE FROM inventory"   # → 읽기 전용이라 거절돼요. 농장은 안전!
```

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| SQLite 읽기 전용 열기 (`?mode=ro`) | **최소 권한**: 구경만 하는 도구는 고칠 권한을 아예 받지 않아요 |
| 상대 경로 (`Path(__file__)`) | 어느 폴더에서 실행해도 프로젝트의 `saves/` 를 찾아요 |
| 한글 폭 계산 (`unicodedata`) | 한글은 터미널에서 두 칸이라, 표 줄이 맞도록 따로 세어요 |
