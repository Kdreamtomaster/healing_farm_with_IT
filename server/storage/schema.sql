-- 농장 세이브 파일(saves/farm.sqlite)의 표 구조입니다.
-- 표를 바꾸면 storage/db.py 의 SCHEMA_VERSION 도 올려 주세요.

-- 이름표(key)와 값(value) 한 쌍씩 저장하는 표. 값은 JSON 글자로 저장합니다.
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 농장 구획. 새 게임을 만들 때 data/start.json 의 배치대로 채워집니다.
CREATE TABLE IF NOT EXISTS plots (
    id   INTEGER PRIMARY KEY,
    x    INTEGER NOT NULL,
    y    INTEGER NOT NULL,
    kind TEXT    NOT NULL,          -- field(밭) / paddy(논) / flowerbed(화단)
    border TEXT  NOT NULL DEFAULT '' -- 테두리 색 (assets/palette.json 의 borders id)
);

-- 구획에 심은 작물. 구획 하나에 작물은 하나만 심을 수 있습니다.
CREATE TABLE IF NOT EXISTS crops (
    plot_id      INTEGER PRIMARY KEY REFERENCES plots(id),
    species      TEXT    NOT NULL,  -- data/crops.json 의 id
    planted_at   REAL    NOT NULL,  -- 심은 게임 시각(분)
    progress     REAL    NOT NULL,  -- 0 ~ 1, 1이면 다 자람
    moisture     REAL    NOT NULL,  -- 흙의 수분 0 ~ 100
    color        TEXT    NOT NULL DEFAULT ''  -- 열매·꽃 색 (data/crops.json 의 colors id)
);

-- 창고. seed_tomato(토마토 씨앗), tomato(토마토) 같은 물건과 개수.
CREATE TABLE IF NOT EXISTS inventory (
    item  TEXT    PRIMARY KEY,
    count INTEGER NOT NULL
);

-- 작업 기록: 누가 언제 무엇을 했는지 차곡차곡 쌓입니다.
CREATE TABLE IF NOT EXISTS task_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    at     REAL    NOT NULL,        -- 게임 시각(분)
    actor  TEXT    NOT NULL,        -- player / 친구 이름 / smartfarm
    action TEXT    NOT NULL,
    detail TEXT    NOT NULL DEFAULT ''
);

-- 저장본의 지문(해시). 행은 항상 하나뿐입니다.
CREATE TABLE IF NOT EXISTS integrity (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    algo   TEXT NOT NULL,
    digest TEXT NOT NULL
);
