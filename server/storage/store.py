"""세이브 파일을 열고, 저장·불러오기·복구를 한곳에서 처리합니다.

실행 시 순서:
    1. 파일이 깨졌으면(파일 손상) → 최근 정상 스냅샷으로 복구
    2. 파일이 없으면 → 새 농장 만들기
    3. 지문(해시) 검증 → 맞지 않으면(변조) 저장을 잠금
       (메뚜기 떼와 완전 초기화는 7단계에서 구현합니다)
"""

import json
import os
import threading
from contextlib import closing
from pathlib import Path

from integrity import hashing, verify
from storage import backup, db


class SaveLocked(Exception):
    """무결성 이상이 감지되어 저장을 막았을 때 발생합니다."""


class LayoutMismatch(ValueError):
    """저장 요청의 구획 배치가 세이브와 다를 때 발생합니다."""


class FarmStore:
    def __init__(self, saves_dir: Path, data_dir: Path):
        self.saves_dir = saves_dir
        self.data_dir = data_dir
        self.db_path = saves_dir / "farm.sqlite"
        self.backups_dir = saves_dir / "backups"
        self.broken_dir = saves_dir / "broken"
        self.integrity = None
        self.recovery = None
        self._key = b""
        # 서버는 여러 요청을 동시에 받을 수 있으므로, 세이브 파일은 한 번에 한 요청만 만집니다.
        self._lock = threading.Lock()

    def open(self, now: int) -> None:
        """게임 실행 시 한 번 부릅니다. 실행 시각도 이때 기록합니다."""
        with self._lock:
            self.saves_dir.mkdir(parents=True, exist_ok=True)
            self._key = hashing.load_or_create_key(self.saves_dir / ".key")
            if self.db_path.exists() and not db.check_file(self.db_path):
                self.recovery = self._recover(now)
            if not self.db_path.exists():
                self._new_farm(now)
            with closing(db.connect(self.db_path)) as conn:
                db.set_meta(conn, "lastLaunchAt", now)
                state = db.read_state(conn)
                stored = db.read_digest(conn)
            self.integrity = verify.check(state, stored, self._key)

    def load(self) -> dict:
        with self._lock, closing(db.connect(self.db_path)) as conn:
            state = db.read_state(conn)
        return {"state": state, "integrity": self.integrity, "recovery": self.recovery}

    def save(self, game: dict, now: int) -> dict:
        """검증을 마친 저장 요청을 기록합니다. 데이터와 지문은 같은 트랜잭션으로 함께 저장됩니다."""
        with self._lock:
            if self.integrity != verify.OK:
                raise SaveLocked()
            with closing(db.connect(self.db_path)) as conn:
                if sorted(game["layout"]) != db.read_layout(conn):
                    raise LayoutMismatch("구획 배치는 저장 요청으로 바꿀 수 없어요")
                conn.execute("BEGIN IMMEDIATE")
                try:
                    db.write_game(conn, game, now)
                    db.append_log(conn, game["log"])
                    db.write_digest(conn, hashing.ALGO, hashing.digest(db.read_state(conn), self._key))
                    conn.execute("COMMIT")
                except BaseException:
                    conn.execute("ROLLBACK")
                    raise
                backup.snapshot(conn, self.backups_dir, now)
        return {"lastSavedAt": now}

    def _new_farm(self, now: int) -> None:
        """새 농장은 임시 파일에 다 만든 뒤 이름을 바꿔 넣습니다.

        만드는 도중 꺼져도 반쯤 만들어진 farm.sqlite 가 남지 않습니다.
        (os.replace 는 "바꾸기 전" 아니면 "바꾼 후" 둘 중 하나만 일어나는 동작이에요)
        """
        start = json.loads((self.data_dir / "start.json").read_text(encoding="utf-8"))
        tmp_path = self.db_path.with_name(self.db_path.name + ".new")
        leftovers = [tmp_path] + [p.with_name(p.name + s) for p in (tmp_path, self.db_path) for s in ("-wal", "-shm")]
        for path in leftovers:
            path.unlink(missing_ok=True)
        with closing(db.connect(tmp_path)) as conn:
            db.create_schema(conn)
            conn.execute("BEGIN")
            try:
                db.fill_new_farm(conn, start, now)
                db.write_digest(conn, hashing.ALGO, hashing.digest(db.read_state(conn), self._key))
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        os.replace(tmp_path, self.db_path)

    def _recover(self, now: int) -> dict:
        backup.quarantine(self.db_path, self.broken_dir, now)
        restored = backup.restore_latest(self.db_path, self.backups_dir, self._is_valid_backup)
        return {"restoredFrom": restored.name if restored else None}

    def _is_valid_backup(self, path: Path) -> bool:
        """파일이 멀쩡하고 지문도 맞는 스냅샷만 복구에 씁니다."""
        if not db.check_file(path):
            return False
        with closing(db.connect(path)) as conn:
            state = db.read_state(conn)
            stored = db.read_digest(conn)
        return verify.check(state, stored, self._key) == verify.OK
