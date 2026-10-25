# docs/learn/ — 게임으로 배우는 컴퓨터 과학

농장을 가꾸다 보면 실제 제품 개발에서 쓰는 개념을 이미 만나고 있어요. 각 문서는 **A4 한 장 내외**로 짧게 읽고, 바로 게임 코드와 연결해 볼 수 있도록 썼습니다.

| 번호 | 문서 | 게임에서 만나는 곳 | 지금 해 볼 수 있나요? |
|---|---|---|---|
| 01 | [게임 디렉터리와 코드 역할](01-directory-and-code-roles.md) | 프로젝트 전체 | ✔ |
| 02 | [데이터베이스와 저장소](02-database-and-storage.md) | `server/storage/` | ✔ |
| 03 | [시간 처리와 방치형 진행](03-time-and-idle-progress.md) | `web/time/` | ✔ |
| 04 | [데이터 파이프라인과 라벨링](04-data-pipeline-and-labeling.md) | `task_log` 표, 일지 탭(파이프라인·도감), `data/` 라벨 | ✔ |
| 05 | [자동화 DAG와 Airflow 개념](05-automation-dag-and-airflow.md) | `web/farm/autopilot.js`, `web/smartfarm/` (자동화 탭) | ✔ |
| 06 | [내결함성과 데이터 복구](06-fault-tolerance-and-recovery.md) | `server/storage/` | ✔ |
| 07 | [해시와 데이터 무결성](07-hash-and-integrity.md) | `server/integrity/`, 연구소 지문 실험대 | ✔ |
| 08 | [시큐어 코딩과 샌드박스](08-secure-coding-and-sandbox.md) | `server/api.py`, `server/validation.py`, `server/lab/` | ✔ |
| 09 | [프로덕트 엔지니어링과 기획 원칙](09-product-engineering-principles.md) | `docs/PLAN.md` | ✔ |

- ✔ 표시는 지금 게임과 코드로 바로 확인할 수 있는 내용이에요.

## 모든 문서의 짜임
1. **한 줄 요약**
2. **쉬운 비유** — 농장 이야기로 먼저 이해하기
3. **핵심 개념** — 진짜 용어와 뜻
4. **게임 속에서는** — 이 프로젝트 코드의 어디에 있는지
5. **실제 제품에서는** — 회사에서 만드는 서비스에서는 어떻게 쓰이는지
6. **직접 해 보기** — 손으로 확인하는 작은 실험

## 코드 찾는 법
문서에는 줄 번호 대신 **파일 이름과 함수 이름**을 적었어요 (예: `server/storage/db.py` 의 `write_game`). 코드는 계속 바뀌어서 줄 번호는 금방 틀려지지만, 함수 이름은 잘 바뀌지 않거든요. 편집기의 "파일에서 찾기"(`Ctrl+F`)로 함수 이름을 찾으면 돼요.

## 실험 난이도
| 표시 | 뜻 |
|---|---|
| 🌱 | 게임 화면만으로 할 수 있어요 |
| 🌿 | 터미널(명령 창)이나 브라우저 개발자 도구(`F12`)를 써요 |
| 🌳 | 코드를 조금 고쳐 봐요 (고치기 전에 폴더를 통째로 복사해 두면 안심) |

> ⚠️ `saves/farm.sqlite`는 **읽기만** 하세요. 게임 밖에서 고치면 무결성 이상으로 저장이 잠기고, 메뚜기 떼가 지나간 뒤 농장이 처음부터 다시 시작돼요. 고쳐 보는 실험은 복사본 폴더에서, 아니면 마음껏 고쳐도 되는 연구소 세이브(`saves/lab.sqlite`)에서!
