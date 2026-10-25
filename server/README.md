# server/ — 내 PC 안의 작은 서버

## 이 폴더는 왜 있나요?
Chrome 브라우저는 보안 때문에 내 PC의 파일을 마음대로 쓰지 못해요. 그래서 **브라우저 대신 파일을 저장해 주는 심부름꾼**이 필요합니다. 이 서버는 두 가지 일만 합니다.

1. `web/`, `assets/`, `data/`, `tests/` 폴더의 파일을 브라우저에 보내 주기
2. 게임 상태를 SQLite 파일에 저장하고 꺼내 주기 (`storage/`, `integrity/`)

게임 규칙(작물이 얼마나 자라는지 등)은 서버에 두지 않습니다. 규칙은 `web/` 한 곳에만 두어 코드가 서로 어긋나지 않게 합니다.

## 어떤 기술을 쓰나요?
| 기술 | 의도 |
|---|---|
| Python 3.10 이상 표준 라이브러리 `http.server` | 별도 설치 없이 바로 실행. 웹 서버가 "요청을 받고 응답한다"는 원리를 짧은 코드로 보여 줌 |
| `pathlib` + `__file__` 기준 상대 경로 | 프로젝트 폴더를 어디로 옮겨도, 이름에 한글이 있어도 동작 |
| `127.0.0.1` 에만 연결 허용 | 같은 와이파이의 다른 사람이 내 농장에 접속하지 못하게 함 (시큐어 코딩) |
| Host / Origin 헤더 확인 | 다른 웹사이트가 몰래 내 농장 서버에 저장 요청을 보내지 못하게 함 |
| `webbrowser` 모듈 | 실행하면 Chrome에서 게임 화면을 자동으로 열기 |

## 어떻게 동작하나요?
```
python server/main.py
   │
   ├─ 1. saves/ 폴더와 DB 준비 (없으면 새로 만들기, 깨졌으면 백업에서 복구)
   ├─ 2. "게임 실행 시 저장" — 실행 시각 기록
   ├─ 3. 해시 검증 — 맞지 않으면 저장 잠금
   ├─ 4. http://127.0.0.1:8765 에서 대기 (포트를 쓸 수 없으면 빈 포트 사용)
   └─ 5. 브라우저 열기
```

### API
| 주소 | 하는 일 |
|---|---|
| `GET  /` | 게임 첫 화면 (`web/index.html`) |
| `GET  /web/…`, `/data/…`, `/assets/…`, `/tests/…` | 허용된 폴더의 파일 |
| `GET  /api/state` | 농장 상태 + 무결성 결과(`ok`/`tampered`) + 복구 안내 + 서버 시각 |
| `POST /api/save` | 농장 상태와 작업 기록 저장. 검증 실패 400, 저장 잠김 409 |

## 파일
| 파일 | 하는 일 |
|---|---|
| `main.py` | 서버 시작점 (`--port`, `--no-browser` 옵션) |
| `api.py` | 위 주소들을 처리, 경로 조작 방지, 요청 출처 확인 |
| `validation.py` | 저장 요청 검증 (형식, 범위, 알 수 없는 작물) |
| `storage/` | SQLite 저장·백업·복구 → [storage/README.md](storage/README.md) |
| `integrity/` | 해시 검증 → [integrity/README.md](integrity/README.md) |

## 더 읽기
- [docs/learn/01-directory-and-code-roles.md](../docs/learn/01-directory-and-code-roles.md)
- [docs/learn/08-secure-coding-and-sandbox.md](../docs/learn/08-secure-coding-and-sandbox.md)
