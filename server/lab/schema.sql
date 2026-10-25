-- 연구소 세이브 파일(saves/lab.sqlite)의 표 구조입니다. 본 농장(farm.sqlite)과 완전히 따로예요.

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 실험 작물: 농장에서 가져온 작물. 색과 크기를 바꿔 보는 실험을 할 수 있어요.
CREATE TABLE IF NOT EXISTS samples (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    species TEXT    NOT NULL,       -- data/crops.json 의 id
    color   TEXT    NOT NULL,       -- 색 (#rrggbb)
    size    TEXT    NOT NULL,       -- small / normal / big
    count   INTEGER NOT NULL
);

-- 송장: 농장과 주고받은 기록. 같은 송장을 두 번 처리하지 않으려고 기억해 둡니다.
--   kind: from_farm(농장에서 작물이 옴) / fuel(바이오 연료를 농장으로 보냄)
--   status: sending(보내는 중) / done(도착)
CREATE TABLE IF NOT EXISTS transfers (
    id     TEXT    PRIMARY KEY,
    kind   TEXT    NOT NULL,
    item   TEXT    NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT    NOT NULL,
    at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS integrity (
    id     INTEGER PRIMARY KEY CHECK (id = 1),
    algo   TEXT NOT NULL,
    digest TEXT NOT NULL
);
