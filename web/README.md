# web/ — Chrome에서 보이는 게임

## 이 폴더는 왜 있나요?
플레이어가 보고 만지는 모든 것이 여기 있어요. 화면을 그리는 코드와 함께 **게임 규칙**(작물 성장, 선물 반응, 오프라인 계산 등)도 이 폴더에만 둡니다. 규칙을 한 곳에 모아야 고칠 때 헷갈리지 않아요.

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| HTML + CSS + 순수 JavaScript | 빌드 도구 없이, 파일을 고치고 새로고침하면 바로 반영 |
| ES 모듈 (`import` / `export`) | 기능별 폴더를 작은 부품처럼 나누어 서로 필요한 것만 가져다 씀 |
| `<canvas>` + `image-rendering: pixelated` | 도트 그래픽을 흐릿하지 않고 또렷하게 확대 |
| `fetch` / `navigator.sendBeacon` | 서버에 저장 요청. 창을 닫을 때도 저장이 전달되도록 `sendBeacon` 사용 |

## 기능별 폴더
| 폴더 | 맡은 일 | 기획안 |
|---|---|---|
| [farm/](farm/README.md) | 작물 성장, 물주기, 수확, 돌연변이, 해금, 메뚜기 | 3, 6, 8 |
| [decor/](decor/README.md) | 구획 색 조합, 계절감 | 3, 10 |
| [time/](time/README.md) | 자동 저장, 오프라인 경과 계산, 친구들의 관리 | 4 |
| [friends/](friends/README.md) | 친구, 선물 만들기와 반응 | 5 |
| [smartfarm/](smartfarm/README.md) | DAG 작업 흐름 자동화 | 7 |
| [lab/](lab/README.md) | 연구소 샌드박스, 바이오 연료 | 8 |
| [ui/](ui/README.md) | 화면 그리기, 버튼, 로딩 화면 | 4, 10 |
| [sound/](sound/README.md) | 도트 감성 효과음과 배경음 | 2, 10 |

## 설계 원칙
1. **규칙과 그리기를 나눈다** — `farm/`은 "토마토가 몇 단계인지"만 계산하고, 어떻게 보일지는 `ui/`가 정함. 그래야 규칙을 테스트하기 쉬움
2. **게임 상태는 하나의 객체** — 모든 기능이 같은 `state`를 읽고 고침. 저장은 이 객체를 통째로 서버에 보냄
3. **시간은 인자로 받는다** — 규칙 함수는 `Date.now()`를 직접 부르지 않고 `now`를 받아서 계산 → 오프라인 계산과 테스트에 그대로 재사용

## 파일
| 파일 | 하는 일 |
|---|---|
| `index.html`, `style.css` | 게임 화면 틀과 꾸밈 |
| `main.js` | 시작점: 데이터·세이브 불러오기 → 1초마다 시간 흘려보내기 → 버튼 동작 연결 |
| `state.js` | 게임 상태 모양 설명, 창고 도우미 |
| `api.js` | 서버와 주고받기 (불러오기, 저장) |
| `text.js` | 한국어 조사(을/를), 이름표 |

## 더 읽기
- [docs/learn/01-directory-and-code-roles.md](../docs/learn/01-directory-and-code-roles.md)
