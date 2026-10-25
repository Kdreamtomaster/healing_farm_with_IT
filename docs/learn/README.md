# docs/learn/ — 게임으로 배우는 컴퓨터 과학

농장을 가꾸다 보면 실제 제품 개발에서 쓰는 개념을 이미 만나고 있어요. 각 문서는 **A4 한 장 내외**로 짧게 읽고, 바로 게임 코드와 연결해 볼 수 있도록 썼습니다.

| 번호 | 문서 | 게임에서 만나는 곳 |
|---|---|---|
| 01 | [게임 디렉터리와 코드 역할](01-directory-and-code-roles.md) | 프로젝트 전체 |
| 02 | [데이터베이스와 저장소](02-database-and-storage.md) | `server/storage/` |
| 03 | [시간 처리와 방치형 진행](03-time-and-idle-progress.md) | `web/time/` |
| 04 | [데이터 파이프라인과 라벨링](04-data-pipeline-and-labeling.md) | `data/`, `web/farm/` 도감 |
| 05 | [자동화 DAG와 Airflow 개념](05-automation-dag-and-airflow.md) | `web/smartfarm/` |
| 06 | [내결함성과 데이터 복구](06-fault-tolerance-and-recovery.md) | `server/storage/`, `web/smartfarm/` |
| 07 | [해시와 데이터 무결성](07-hash-and-integrity.md) | `server/integrity/` |
| 08 | [시큐어 코딩과 샌드박스](08-secure-coding-and-sandbox.md) | `server/`, `web/lab/` |
| 09 | [프로덕트 엔지니어링과 기획 원칙](09-product-engineering-principles.md) | `docs/PLAN.md` |

## 모든 문서의 짜임
1. **한 줄 요약**
2. **쉬운 비유** — 농장 이야기로 먼저 이해하기
3. **핵심 개념** — 진짜 용어와 뜻
4. **게임 속에서는** — 이 프로젝트 코드의 어디에 있는지
5. **실제 제품에서는** — 회사에서 만드는 서비스에서는 어떻게 쓰이는지
6. **직접 해 보기** — 손으로 확인하는 작은 실험

> ✏️ 현재 모든 문서는 **초안**입니다. 코드가 만들어지면 실제 파일 이름과 줄 번호를 연결할 예정이에요.
