# 02. 데이터베이스와 저장소

**한 줄 요약** — 데이터베이스는 정보를 표로 정리해 두고, 필요한 것을 빠르고 안전하게 꺼내 쓰게 해 주는 창고다.

## 쉬운 비유
농장 일기를 공책에 마구 적으면 "지난주에 심은 감자가 몇 개였지?"를 찾기 어려워요. 날짜·작물·개수 칸이 있는 **표**에 적으면 금방 찾을 수 있죠. 데이터베이스는 그런 표를 여러 개 가진 똑똑한 공책입니다.

## 핵심 개념
- **테이블(표)** — 같은 종류의 정보를 모은 표. 예: `crops` 표에는 심은 작물만
- **행(row)과 열(column)** — 행은 작물 한 그루, 열은 "품종", "심은 시각" 같은 항목
- **기본 키(PRIMARY KEY)** — 행을 하나로 가리키는 이름표. `crops` 는 `plot_id` 가 기본 키라서 **한 칸에 작물은 하나만**
- **SQL** — 표에게 묻는 말. `SELECT species FROM crops WHERE progress >= 1;` → "다 자란 작물 보여 줘"
- **SQLite** — 데이터베이스 전체가 **파일 하나**인 가벼운 DB. 휴대폰 앱들도 많이 씀
- **스키마** — 표들의 설계도. 게임이 업데이트되어 설계도가 바뀌면 옛 세이브를 새 설계도로 옮기는 **마이그레이션**이 필요
- **상대 경로** — "C:\Users\..." 처럼 전체 주소 대신 "프로젝트 폴더에서 saves/로" 같은 위치. 폴더를 옮겨도 동작

## 게임 속에서는
- 농장 전체가 `saves/farm.sqlite` 파일 하나에 저장돼요
- 설계도: `server/storage/schema.sql` — 표 6개
  | 표 | 담는 것 |
  |---|---|
  | `meta` | 이름표-값 한 쌍씩: 게임 시각, 시간 배율, 마지막 저장 시각, 아는 작물 목록 … |
  | `plots` | 칸 32개: 위치, 종류(밭/논/화단), 테두리 색 |
  | `crops` | 심은 작물: 품종, 색, 성장도(0~1), 수분(0~100) |
  | `inventory` | 창고: `tomato`, `seed_tomato`, `dish_caprese`, `craft_tulip_pot` … 와 개수 |
  | `task_log` | 작업 기록: 누가 언제 무엇을 했는지 (→ 04번 문서) |
  | `integrity` | 저장본의 지문 (→ 07번 문서) |
- 읽고 쓰는 코드: `server/storage/db.py` 의 `read_state`, `write_game`
- 값은 SQL 문장에 직접 이어 붙이지 않고 `?` 자리에 넣어요 → 08번 문서의 "SQL 인젝션 방지"
- 마이그레이션: `server/storage/migrations.py` — 버전 1 → 2(색 추가) → 3(시듦 기능 제거)
- 경로: `server/main.py` 의 `ROOT = Path(__file__).resolve().parent.parent` — 서버 파일 위치에서 프로젝트 폴더를 찾아요. 테스트(`tests/server/helpers.py`)는 일부러 `내 게임/힐링 농장` 같은 **한글·공백 폴더**에서 돌려 확인해요

## 실제 제품에서는
쇼핑몰의 주문, 은행의 계좌, 게임의 랭킹이 모두 데이터베이스에 있어요. 규모가 커지면 PostgreSQL, MySQL 같은 서버형 DB를 쓰지만 **표와 SQL이라는 기본 개념은 같습니다.** 앱이 업데이트될 때 사용자 데이터를 새 설계도로 옮기는 마이그레이션도 매일 하는 일이에요.

## 직접 해 보기
게임을 한 번 실행해 `saves/farm.sqlite` 가 생긴 뒤에, 프로젝트 폴더의 터미널에서 해 봐요. `tools/sql.py` 는 세이브를 **읽기 전용**으로 열어서 SQL 을 실행해 주는 도구예요.

1. 🌿 창고 들여다보기
   ```bash
   python tools/sql.py "SELECT item, count FROM inventory ORDER BY count DESC"
   ```
2. 🌿 SQL 바꿔 보기
   - `SELECT species, color, round(progress, 2) AS 성장 FROM crops` — 지금 자라는 작물
   - `SELECT kind, COUNT(*) FROM plots GROUP BY kind` — 밭·논·화단이 몇 칸씩?
   - `SELECT key, value FROM meta` — 게임이 기억하는 것들
   - `DELETE FROM inventory` — 창고를 비우라고? 읽기 전용이라 데이터베이스가 거절해요
3. 🌱 무료 도구 *DB Browser for SQLite*로 파일을 열어 표를 구경해도 좋아요. 단, **읽기만!** (고치면 무결성 이상 → 07번 문서)
