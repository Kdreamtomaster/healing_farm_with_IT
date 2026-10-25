# data/ — 게임의 기본 데이터

## 이 폴더는 왜 있나요?
작물 종류, 선물 레시피, 친구의 취향 같은 **게임의 재료 정보**를 코드와 분리해 모아 두는 곳입니다. 새 작물을 추가하고 싶다면 코드를 몰라도 이 폴더의 JSON 파일만 고치면 돼요.

> 플레이어마다 달라지는 진행 상황(내가 심은 작물, 내 도감)은 여기가 아니라 `saves/`에 저장됩니다. 이 폴더는 **모두에게 똑같은 기본 설정**이에요.

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| JSON 파일 | 사람이 읽고 고치기 쉬운 데이터 형식 |
| 고유 ID (`"tomato"`, `"rice"`) | 이름(한글/영어)이 바뀌어도 세이브 데이터와 연결이 끊기지 않게 |
| 라벨(분류 꼬리표) | 작물마다 `type: field/paddy/flower`, `water: low/mid/high` 같은 라벨을 달아 일괄 관리·검색에 사용 |
| 다국어 이름 필드 | `name: { ko: "토마토", en: "Tomato" }` |

## 파일 계획
| 파일 | 내용 | 상태 |
|---|---|---|
| `crops.json` | 작물: 종류 라벨, 성장 시간, 수분 라벨, 수확량, 색 | ✔ |
| `start.json` | 새 농장: 구획 배치, 처음 씨앗, 시간 배율 | ✔ |
| `recipes.json` | 요리: 이름, 재료와 개수 (`"ingredients": { "potato": 2, "tomato": 1 }`) | ✔ |
| `unlocks.json` | 해금 조건: 직접 플레이 시간, 수확 횟수 | 예정 |
| `gifts.json` | 선물 레시피: 재료 → 선물, 등급 확률 | 예정 |
| `friends.json` | 친구: 이름, 맡은 구획(`plots`), 옷 색(`shirt`), 제일 좋아하는 요리(`favoriteDish`) ✔ / 반응 대사는 5단계 | 일부 |
| `lines.json` | 로딩 화면 안내 멘트 문장틀 | 예정 |

### 작물 데이터 (`crops.json`)
```json
{
  "id": "tomato",
  "name": { "ko": "토마토", "en": "Tomato" },
  "type": "field",
  "water": "high",
  "growMinutes": 240,
  "yield": 3,
  "seeds": 2,
  "colors": [
    { "id": "red", "name": "빨강", "hex": "#d9483b" },
    { "id": "yellow", "name": "노랑", "hex": "#f0b43a" }
  ]
}
```
| 항목 | 뜻 |
|---|---|
| `type` | `field`(밭) / `paddy`(논) / `flower`(꽃 → 화단) |
| `water` | `low`(10~50) / `mid`(30~70) / `high`(50~95) — 좋아하는 수분 범위 |
| `growMinutes` | 다 자라는 데 걸리는 **게임 시간**(분) |
| `yield` / `seeds` | 수확할 때 얻는 작물 수 / 씨앗 수 |
| `colors` | 고를 수 있는 열매·꽃 색. 세이브에는 `id`만 저장되고, 첫 번째 색이 기본 |

지금 있는 작물 (14가지)
| 칸 | 작물 |
|---|---|
| 밭 (`field`) | 토마토, 감자, 당근, 딸기, 양배추, 옥수수, 호박 |
| 논 (`paddy`) | 벼, 흑미, 연꽃 |
| 화단 (`flower`) | 튤립, 해바라기, 코스모스, 라벤더 |

**새 작물을 추가하려면**: ① `crops.json`에 항목 추가 ② `assets/crops/`에 그림 7장(씨앗 1, 새싹·자람·다 자람 2장씩) ③ `assets/manifest.json`의 `crops.ids`에 id 추가 ④ `start.json`에 처음 씨앗 추가. 이미 키우던 농장에는 다음 실행 때 **새 씨앗 선물**로 씨앗 2개가 도착해요 (세이브의 `meta.knownSpecies`에 아는 작물을 기억해서 한 번만).

돌연변이 후보(`mutations`)는 6단계에서 추가합니다.

### 새 농장 배치 (`start.json`)
`layout`의 글자 하나가 구획 한 칸입니다. `F`=밭, `P`=논, `B`=화단. `borders`는 종류별 처음 테두리 색(`assets/palette.json`의 id)입니다. 글자를 바꾸면 처음 농장 모양이 바뀌어요 (이미 있는 세이브에는 적용되지 않아요).

## 데이터 파이프라인과의 연결
플레이 중 쌓이는 작업 기록(`task_log`)은 "원본 데이터 → 정리 → 집계 → 해금 판단"의 작은 파이프라인을 거칩니다. 돌연변이를 발견해 이름을 붙이는 도감 등록은 데이터에 **라벨을 다는 작업**과 같아요.

## 더 읽기
- [docs/learn/04-data-pipeline-and-labeling.md](../docs/learn/04-data-pipeline-and-labeling.md)
