# assets/ — 도트 그래픽

## 이 폴더는 왜 있나요? (기획안 10절)
게임의 모든 그림과 색 목록이 여기 있습니다. **도트 그래픽을 처음 그려 보는 사람도** 쉽게 고치고 추가할 수 있도록 구조를 최대한 단순하게 만들었어요.

## 그래픽 원칙
- 모든 그림은 **도트(픽셀) 스타일로 통일**
- 과도한 디테일보다 **색채와 감성** 중심
- 편안한 색감, 계절 변화, 작은 애니메이션(흔들리는 작물)으로 힐링 분위기
- 테두리·흙·계절(풀, 나뭇잎, 색조)·길·울타리 색은 `palette.json` 안에서만 사용 → 누가 골라도 어울림

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| 16×16 픽셀 PNG | 작고 단순한 크기라 무료 도트 편집기(예: Piskel, LibreSprite)로 바로 수정 가능 |
| 그림 1장 = 파일 1개 | 큰 그림 한 장(스프라이트 시트)보다 고칠 곳을 찾기 쉬움 |
| 파일 이름 규칙 | 이름만 보고 무슨 그림인지 알 수 있게 |
| 팔레트 스왑 표시색 | 열매·꽃 자리를 **분홍 `#ff00ff`**(밝은 쪽), **진분홍 `#b000b0`**(그림자 쪽)으로 칠해 두면, 게임이 그 작물의 색으로 바꿔 칠함 |

## 폴더와 파일
```
assets/
├── palette.json      ← 테두리 색, 흙 색, 계절 색
├── manifest.json     ← 그림 목록 (작물 id, 단계별 프레임 수)
├── crops/            ← 작물 그림
│   ├── tomato_seed_1.png
│   ├── tomato_sprout_1.png, tomato_sprout_2.png
│   ├── tomato_growing_1.png, tomato_growing_2.png
│   └── tomato_ripe_1.png, tomato_ripe_2.png   (다른 작물 13가지도 같은 규칙, 목록은 manifest.json 의 crops.ids)
├── actors/           ← 등장인물 (색을 바꾸지 않고 그대로 그림)
│   ├── farmer_walk_1.png, farmer_walk_2.png   ← 걷는 농부 (오른쪽을 봄, 왼쪽은 뒤집어 그림)
│   ├── farmer_pour_1.png, farmer_pour_2.png   ← 물뿌리개 기울이기
│   ├── farmer_work_1.png, farmer_work_2.png   ← 쪼그려 심기·수확
│   ├── cat_sit_1.png, cat_sit_2.png           ← 앉아서 꼬리 살랑 고양이
│   ├── cat_sleep_1.png, cat_sleep_2.png       ← 동그랗게 잠든 고양이
│   │     (옷 색 #6fb0dc 는 도와주러 온 친구의 옷 색으로 바꿔 그림)
│   └── drone_1.png, drone_2.png               ← 프로펠러가 도는 드론
├── scenery/          ← 배경
│   ├── tree_1.png    ← 나무 (잎은 표시색 → 계절 잎 색으로)
│   ├── barn_1.png    ← 헛간 (32×32)
│   ├── crate_1.png   ← 수확물 상자 (위에 수확물이 쌓임)
│   ├── sack_1.png    ← 씨앗 자루 (띠는 표시색 → 작물 색으로, 12×12)
│   └── stove_1.png, stove_2.png ← 냄비 올린 화덕 (불꽃 2프레임)
├── ui/               ← 도구 막대 아이콘 (돋보기, 물뿌리개, 씨앗 주머니, 바구니, 스프링클러, 물길)
├── dishes/           ← 요리 그림 (data/recipes.json 의 id 와 같은 이름)
│   └── caprese.png, potato_soup.png, … (16가지)
├── crafts/           ← 꽃 공방 물건 (data/crafts.json 의 id 와 같은 이름)
│   └── tulip_bouquet.png, flower_wreath.png, lotus_lantern.png, … (8가지)
└── effects/
    └── drop_1.png    ← 목마른 작물 위 물방울
```
- 형식: `대상_단계_프레임.png` (모두 영어 소문자와 `_`)
- 단계: `seed` 씨앗 / `sprout` 새싹 / `growing` 자라는 중 / `ripe` 다 자람
- 프레임 2장은 번갈아 보여 바람에 흔들리는 것처럼 보임 (윗부분을 한 칸 옆으로 민 그림)

## 그림 고치는 법
1. Piskel 같은 도트 편집기로 PNG 열기 (16×16)
2. 고치고 같은 이름으로 저장 → 게임 새로고침
3. 열매·꽃처럼 **작물 색으로 바뀌어야 하는 곳은 `#ff00ff`, `#b000b0`** 으로 칠하기

## 새 작물 그림 추가하는 법
1. 위 규칙대로 7장 그리기 (`{id}_seed_1` … `{id}_ripe_2`)
2. `manifest.json` 의 `crops.ids` 에 작물 id 추가
3. `data/crops.json` 에 작물 정보 추가

## 라이선스
이 폴더의 그림도 MIT 라이선스로 배포합니다. 다른 곳의 그림을 가져올 때는 라이선스를 꼭 확인하고 출처를 적어 주세요.
