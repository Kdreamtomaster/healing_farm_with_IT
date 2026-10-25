# web/smartfarm/ — DAG로 만드는 스마트팜 (✔ 8단계, 메뉴 `B`)

## 이 폴더는 왜 있나요? (기획안 7절)
농사 작업에는 **순서**가 있어요. 씨앗을 심어야 물을 줄 수 있고, 다 자라야 수확할 수 있죠. 이 폴더는 농사 작업을 **DAG(방향이 있고 되돌아오지 않는 작업 흐름도)** 로 만들어 자동으로 실행하는 스마트팜 기능입니다. 게임을 하며 실제 데이터 파이프라인과 Apache Airflow의 핵심 개념을 체험하는 것이 목표예요.

> 지금 있는 자동화는 멍때리기 모드의 **우선순위 규칙**(`web/farm/autopilot.js`)이에요. "지금 가장 급한 일 하나"만 고르기 때문에 일 사이의 순서를 말할 수 없어요. 스마트팜은 그 순서를 화살표로 정해 줘요.

## 예시 흐름
```
씨앗 심기 → 수분 확인 → 물주기 → 다 자람 기다리기 → 수확 → 꽃다발 만들기
               │          ↑
               └ 촉촉하면 물주기를 "건너뜀"으로 표시 (기다리기는 실패만 없으면 시작)
```

## DAG 모양 (JSON)
```json
{
  "id": "morning",
  "name": "아침 농사",
  "schedule": "daily@06:00",
  "tasks": [
    { "id": "plant", "block": "plant", "params": { "kind": "flowerbed", "species": "tulip", "color": "random" } },
    { "id": "check", "block": "check_moisture", "params": { "skip": "water" } },
    { "id": "water", "block": "water", "params": { "target": "thirsty" }, "retries": 2, "retryDelay": 30 },
    { "id": "wait", "block": "wait_ripe", "params": { "kind": "flowerbed" }, "trigger": "none_failed" },
    { "id": "harvest", "block": "harvest", "params": { "kind": "flowerbed" } },
    { "id": "bouquet", "block": "craft", "params": { "craft": "tulip_bouquet" } }
  ],
  "edges": [["plant", "check"], ["check", "water"], ["water", "wait"], ["wait", "harvest"], ["harvest", "bouquet"]]
}
```
시간 단위(`retryDelay`, 기다리기 간격)는 모두 **게임 시간(분)** 이에요.

## 블록 (Operator)
| 블록 | 하는 일 | 부르는 규칙 | Airflow 에서는 |
|---|---|---|---|
| `plant` | 칸 종류·작물·색(또는 무작위)으로 빈 칸에 심기 | `farm/harvest.js` 의 `plant` | Operator |
| `water` | 라벨로 고른 칸에 물 (목마른 / 물 많이 먹는 / 논) | `farm/care.js` 의 `BULK` | Operator |
| `check_moisture` | 목마른 작물이 없으면 `skip` 에 적은 블록을 **건너뜀**으로 | `farm/crops.js` 의 `isThirsty` | BranchOperator / ShortCircuitOperator |
| `wait_ripe` | 다 자란 작물이 생길 때까지 30분마다 확인, 하루 지나면 실패 | `farm/crops.js` 의 `stageOf` | Sensor (poke, timeout) |
| `harvest` | 다 자란 작물 수확 | `farm/harvest.js` 의 `harvest` | Operator |
| `cook` / `craft` | 재료가 있으면 요리·공방 물건 만들기 | `friends/cooking.js`, `friends/crafts.js` | Operator |

## 블록의 상태 (색으로 보여 줘요)
```
대기 → 예약 → 실행 중 → 성공
                     ├→ 건너뜀 (수분이 충분해서 물주기 안 함)
                     ├→ 다시 시도 대기 → (retryDelay 뒤) 실행 중
                     └→ 실패 → 뒤 블록은 "앞 단계 실패"
```
- **실행 조건**: 기본은 `all_success`(앞 블록이 모두 성공), 건너뜀 다음 블록은 `none_failed`(실패만 없으면)
- **연료**: 블록이 실제로 일할 때 바이오 연료 1개 (기다리기·확인 블록은 무료). 연료가 없으면 실패 → 재시도 → 그래도 없으면 멈추고 그 자리를 표시
- **힐링 원칙**: 실패해도 작물에게 나쁜 일은 없어요. 멈춘 자리만 알려 줘요

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| 그래프 자료구조(노드 + 간선 목록) | DAG를 가장 단순한 형태로 표현해 코드로 따라가기 쉽게 |
| 위상 정렬(Kahn 알고리즘) | 선후 관계를 지키는 실행 순서를 계산, 순환 여부도 함께 검사 (순환이면 도는 길을 찾아 보여 줌) |
| 상태 기계 | 블록 하나하나의 상태를 명확히 하여 실패 지점을 바로 알 수 있게 |
| 순수한 한 걸음 함수 `step(dag, run, state, minutes)` | 1초 tick 과 비운 시간 계산(10분 조각)에 같은 코드를 씀 (`time/` 과 같은 원칙) |
| `dag_runs` 실행 이력 | "어디서 왜 멈췄는지" 되짚어 보기 (Airflow 의 Task Instance 로그) |
| Airflow 코드 내보내기 | 내 DAG 를 진짜 Airflow 파이썬 코드 모양으로 보여 줘서 실제 도구로 이어지게 |

## 저장
- DAG 정의와 실행 상태는 농장 세이브의 `meta.smartfarm` 에 들어가요 → 지문(HMAC) 서명 범위 안
  - `{ dags: [...], runs: { DAG id: 실행 중인 상태 }, history: [최근 8번의 실행 결과], lastDaily: { DAG id: 마지막으로 매일 실행한 날 } }`
  - 처음 설계(표 `dags`, `dag_runs`)보다 단순하게: 표를 늘리지 않아도 되고, 저장·서명·검증이 한 번에 돼요
- 서버도 한 번 더 확인해요 (`server/validation.py` 의 `_smartfarm`): 아는 블록인지, 이름 모양, 재시도 횟수, 그리고 **빙글 도는 길이 없는지** — Python 의 `graphlib.TopologicalSorter` 로 (학습 문서 05 의 실험과 같은 도구)
- 블록이 한 일은 작업 기록(`task_log`)에 `actor: smartfarm` 으로 남아요

## 파일
| 파일 | 하는 일 |
|---|---|
| `dag.js` | 위상 정렬(Kahn), 빙글 도는 길 찾기, 그래프 층(깊이), 화살표 잇기 검사, DAG 모양 검사 |
| `blocks.js` | 블록 7가지와 각 블록이 부르는 `farm/`·`friends/` 규칙, 센서 간격(30분)·제한 시간(하루) |
| `runner.js` | 상태 기계, 실행 조건, 재시도, 연료, 매일 스케줄, 실행 기록 (`tickSmartfarm`) |
| `editor.js` | 블록 더하기·빼기, 화살표 잇기·끊기(순환이면 거부), 설정 바꾸기, 틀로 만들기 |
| `airflow.js` | DAG → Airflow 파이썬 코드 글자 |
| `data/smartfarm.json` | 틀 3가지: 꽃다발 공장, 주먹밥 도시락, 아침 물 돌보기 |
| `web/ui/smartfarm-panel.js` | 자동화 탭: 그래프(층마다 한 줄), 블록 고치기, 실행 기록 격자, Airflow 코드 |

비운 시간 동안에도 같은 함수가 10분 조각마다 돌아요 (`web/time/offline.js` 의 `simulateOffline` 에 넘기는 `machines`). 친구들보다 먼저 일해요.

## 해 보기
1. 🌱 연구소(`L`)에서 수확물을 바이오 연료로 바꾼 뒤, 자동화(`B`)에서 "꽃다발 공장" 틀로 만들고 ▶ 지금 실행
2. 🌱 블록 색 보기: 심기 성공 → 촉촉하면 물주기 "건너뜀" → 다 자랄 때까지 "기다리는 중" → 수확 → 꽃다발
3. 🌱 "블록 고치기"에서 bouquet → plant 처럼 빙글 도는 화살표를 이어 보기 → 거부되고 도는 길을 알려 줘요
4. 🌱 연료가 0개일 때 실행해 보기 → 실패 → (재시도 설정이 있으면) 다시 시도 대기 → 뒤 블록은 "앞 단계 실패". 작물은 무사해요
5. 🌿 "Airflow 코드로 보기"를 진짜 Airflow 문서의 예제와 비교해 보기

## 더 읽기
- [docs/learn/05-automation-dag-and-airflow.md](../../docs/learn/05-automation-dag-and-airflow.md)
- [docs/learn/06-fault-tolerance-and-recovery.md](../../docs/learn/06-fault-tolerance-and-recovery.md)
