# 05. 자동화 DAG와 Airflow 개념

**한 줄 요약** — 일의 순서를 화살표로 그린 그림(DAG)이 있으면, 컴퓨터가 순서를 지키며 일을 자동으로 처리할 수 있다.

## 쉬운 비유
라면 끓이기: 물 붓기 → 물 끓이기 → 면 넣기 → 3분 기다리기. 면을 먼저 넣으면 안 되죠. 순서를 화살표로 그리면 누구든(로봇도!) 순서대로 따라 할 수 있어요.

## 핵심 개념
- **DAG** (Directed Acyclic Graph, 방향 비순환 그래프)
  - *Graph* — 점(작업)과 선(연결)으로 된 그림
  - *Directed* — 선에 화살표 방향이 있음 (A 다음 B)
  - *Acyclic* — 빙글 돌아 제자리로 오는 길이 없음 (끝없이 반복하지 않음)
- **위상 정렬** — 화살표를 지키는 실행 순서 찾기. 방법 하나(Kahn 알고리즘): "들어오는 화살표가 없는 일"부터 하나씩 꺼내고, 꺼낸 일에서 나가는 화살표를 지워요. 끝까지 못 꺼내는 일이 남으면 → 어딘가 빙글 도는 길(순환)이 있다는 뜻
- **센서(Sensor)** — 조건이 될 때까지 기다리는 작업 ("다 자랄 때까지 기다리기")
- **재시도(Retry)** — 실패하면 조금 기다렸다가 몇 번 더 해 보기
- **실행 조건(Trigger rule)** — "앞 일이 모두 성공해야" 시작할지, "실패만 없으면(건너뛴 건 괜찮아)" 시작할지

## 게임 속에서는
**지금 있는 자동화: 우선순위 규칙** — 멍때리기 모드(`M`)의 농부들은 `web/farm/autopilot.js` 의 `nextTask` 로 할 일을 골라요.
```
다 자란 작물? → 수확   (없으면)
목마른 작물?  → 물주기 (없으면)
빈 칸?        → 심기   (없으면 쉬기)
```
매번 "지금 가장 급한 일 하나"를 고르는 방식이라 간단하지만, **"수확한 다음에 꼭 선물 만들기"처럼 일 사이의 순서**는 말할 수 없어요. 그게 DAG 가 필요한 이유예요.

**작업의 상태** — 요리는 두 단계예요 (`web/friends/cooking.js` 의 `startCooking` → `finishCooking`). 시작할 때 재료를 먼저 꺼내 두어서, 끓는 동안 같은 재료로 다른 요리를 또 시작하지 않아요. "대기 → 실행 중 → 완료"라는 **작업 상태**를 나눈 것이죠.

**스마트팜** (자동화 탭 `B`, [web/smartfarm/](../../web/smartfarm/README.md))
```
씨앗 심기 → 수분 확인 → 물주기 → 다 자람 기다리기 → 수확 → 꽃다발 만들기
                          └ 촉촉하면 "건너뜀" (기다리기는 실패만 없으면 시작)
```
- 블록을 이어 나만의 DAG 만들기, 화살표가 빙글 돌면 연결 거부(어디서 도는지 보여 줌) → `web/smartfarm/dag.js` 의 `topoOrder`(Kahn 알고리즘), `findCycle`
- 서버도 저장할 때 Python `graphlib` 으로 한 번 더 검사해요 (`server/validation.py` 의 `_smartfarm`) — 아래 실험 2·3 과 같은 도구
- 블록마다 색으로 상태 표시: 대기 / 기다리는 중(센서) / 성공 / 건너뜀 / 다시 시도 대기 / 실패 / 앞 단계 실패 → `web/smartfarm/runner.js` 의 `stepRun`
- 실행 기록 격자(Airflow 의 Grid 보기)로 최근 8번의 실행을 한눈에
- 바이오 연료가 없으면 실패 → 정해진 횟수만큼 재시도. 실패해도 작물에게 나쁜 일은 없어요. 멈춘 자리만 알려 줘요
- **"Airflow 코드로 보기"**: 내가 만든 DAG 를 진짜 Airflow 파이썬 코드 모양으로 보여 주기

## 실제 제품에서는: Apache Airflow
Airflow는 회사에서 "매일 새벽 3시에 어제 매출을 모아 → 정리하고 → 보고서 만들기" 같은 데이터 작업을 DAG로 자동 실행하는 도구예요.

| 게임 | Airflow |
|---|---|
| 작업 블록 | Task (Operator) |
| 블록 연결 | `심기 >> 물주기` |
| "다 자람 기다리기" 블록 | Sensor |
| 블록 색 (성공/실패/건너뜀) | Task Instance 상태 |
| 재시도 횟수 설정 | `retries=3`, `retry_delay` |
| "건너뛴 건 괜찮아" | `trigger_rule="none_failed"` |
| 매일 아침 6시 실행 | `schedule="0 6 * * *"` |

```python
# Airflow라면 이렇게 써요 (참고용)
plant >> check_moisture >> water >> wait_ripe >> harvest >> make_bouquet
```

## 직접 해 보기
1. 🌱 멍때리기 모드(`M`)를 켜고 농부들이 "수확 → 물주기 → 심기" 우선순위대로 움직이는지 지켜보기. 그다음 자동화(`B`)에서 "꽃다발 공장"을 실행해, 순서가 정해진 흐름과 비교하기
2. 🌿 위상 정렬을 파이썬으로 (Python 3.9 이상에 들어 있는 `graphlib`)
   ```bash
   python -c "from graphlib import TopologicalSorter as T; print(list(T({'water': {'plant'}, 'wait_ripe': {'water'}, 'harvest': {'wait_ripe'}, 'bouquet': {'harvest'}}).static_order()))"
   ```
   `{'water': {'plant'}}` 은 "water 는 plant 다음에"라는 뜻이에요. 순서가 어떻게 나오나요?
3. 🌿 빙글 도는 길 만들기: 위 사전에 `'plant': {'bouquet'}` 을 더하면? → `CycleError` 와 함께 어디서 도는지 알려 줘요. 이게 바로 DAG 의 *Acyclic* 검사예요
4. 🌱 자동화 탭의 "블록 고치기"에서 bouquet → plant 화살표를 이어 보기 → 게임도 같은 길을 알려 주며 거부해요
5. 🌱 바이오 연료가 0개일 때 ▶ 지금 실행 → 실패 / 다시 시도 대기 / 앞 단계 실패 색을 보고, "Airflow 코드로 보기"에서 `retries`, `trigger_rule` 이 어떻게 적히는지 찾아보기
