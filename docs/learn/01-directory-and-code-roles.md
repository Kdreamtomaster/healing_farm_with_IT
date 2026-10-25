# 01. 게임 디렉터리와 코드 역할

**한 줄 요약** — 코드를 역할별 폴더로 나누면, 고칠 곳을 빨리 찾고 한 곳을 고쳐도 다른 곳이 덜 망가진다.

## 쉬운 비유
농장에도 창고, 밭, 작업장이 따로 있어요. 씨앗이 밭 한가운데 흩어져 있으면 찾기 힘들죠. 코드도 **물건마다 정해진 자리**가 있어야 합니다.

## 핵심 개념
- **디렉터리(폴더)** — 파일을 묶는 상자. 이름만 보고 무엇이 들었는지 알 수 있어야 좋은 이름
- **관심사의 분리** — "보여 주기", "규칙 계산", "저장하기"처럼 하는 일이 다른 코드는 떼어 놓기
- **데이터와 코드 분리** — 작물 목록 같은 정보는 코드 밖(`data/`)에 두면 코드를 몰라도 고칠 수 있음
- **순수 함수** — 같은 입력이면 늘 같은 결과를 내고, 화면이나 파일을 건드리지 않는 함수. 테스트하기 쉬워요

## 게임 속에서는
| 역할 | 폴더 | 예 |
|---|---|---|
| 보여 주기·들려주기 | `web/ui/`, `web/sound/`, `assets/` | `renderer.js` 가 농장을 그림 |
| 규칙 계산 (순수 함수) | `web/farm/`, `web/time/`, `web/friends/`, `web/decor/` | `crops.js` 의 `advanceCrop` 이 성장을 계산 |
| 모두 이어 붙이기 | `web/main.js` | 버튼·키보드 → 규칙 → 그림 |
| 저장하기 | `server/storage/`, `server/integrity/`, `saves/` | `store.py` 가 저장·복구 순서를 관리 |
| 기본 정보 | `data/` | `crops.json` 에 작물 14가지 |
| 확인하기 | `tests/` | 서버 테스트(Python) + 규칙 테스트(브라우저) |

**화면에 토마토가 보이기까지**
```
data/crops.json        토마토는 240분이면 다 자라요
  → web/api.js         loadSpecies() 로 읽어 오기
  → web/farm/crops.js  advanceCrop() 이 성장도 계산, stageOf() 가 "ripe"(다 자람)라고 판단
  → web/ui/renderer.js drawFarm() 이 그 칸을 그리기로 함
  → web/ui/sprites.js  crop() 이 그림의 표시색(#ff00ff)을 빨강으로 바꿔 칠함
  → assets/crops/tomato_ripe_1.png
```
규칙(`farm/`)은 그림을 모르고, 그림(`ui/`)은 규칙을 계산하지 않아요. 그래서 성장 규칙은 화면 없이 `tests/web/farm.test.js` 에서 확인할 수 있어요.

## 실제 제품에서는
큰 서비스는 수백 명이 함께 코드를 고쳐요. 폴더 구조가 곧 **"누가 무엇을 책임지는지"의 지도**가 됩니다. 화면 팀이 디자인을 바꿔도 계산 규칙은 그대로 두는 식으로, 서로 덜 부딪히며 일할 수 있어요.

## 직접 해 보기
1. 🌱 루트 `README.md`의 폴더 지도를 보고 맞혀 보기: "친구가 제일 좋아하는 꽃을 바꾸려면 어느 파일?" (정답: `data/friends.json` 의 `favoriteFlower`)
2. 🌳 `data/crops.json` 에서 튤립의 `growMinutes` 를 `120` → `60` 으로 바꾸고 새로고침. 튤립이 두 배 빨리 자라요. 코드는 한 줄도 안 고쳤어요!
   - 튤립에 새 **색**을 추가했다면 서버를 껐다 켜야 해요. 서버(`server/validation.py` 의 `load_rules`)가 켜질 때 작물 색 목록을 읽어 "저장해도 되는 색"을 정하거든요
3. 🌿 서버 테스트 돌려 보기: 프로젝트 폴더에서 `python -m unittest discover -s tests/server -t tests/server` → `OK` 가 나오면 저장 기능이 모두 정상
