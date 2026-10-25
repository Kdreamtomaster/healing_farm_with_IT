"""세이브 파일을 열고, 저장·불러오기·복구를 한곳에서 처리합니다.

실행 시 순서:
    1. 파일이 깨졌으면(파일 손상) → 최근 정상 스냅샷으로 복구
    2. 파일이 없으면 → 새 농장 만들기
    3. 옛 버전 세이브면 → 새 표 구조로 옮기기 (마이그레이션)
    4. 지문(해시) 검증 → 맞지 않으면(변조) 저장을 잠그고, 마지막 정상 스냅샷과 무엇이 다른지 찾아 둠
       → 화면이 메뚜기 떼 연출을 보여 준 뒤 reset() 으로 완전 초기화
"""

import json
import os
import threading
from contextlib import closing
from pathlib import Path

from integrity import diff, hashing, verify
from storage import backup, db, migrations


class SaveLocked(Exception):
    """무결성 이상이 감지되어 저장을 막았을 때 발생합니다."""


class LayoutMismatch(ValueError):
    """저장 요청의 구획 배치가 세이브와 다를 때 발생합니다."""


class NotTampered(Exception):
    """변조가 아닌데 완전 초기화를 요청했을 때 발생합니다."""


class FarmStore:
    def __init__(self, saves_dir: Path, data_dir: Path):
        self.saves_dir = saves_dir
        self.data_dir = data_dir
        self.db_path = saves_dir / "farm.sqlite"
        self.backups_dir = saves_dir / "backups"
        self.broken_dir = saves_dir / "broken"
        self.integrity = None
        self.recovery = None
        self.tamper_diff = None  # 변조였다면: 마지막 정상 스냅샷과 달라진 곳
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
                self._migrate(conn)
                db.set_meta(conn, "lastLaunchAt", now)
                state = db.read_state(conn)
                stored = db.read_digest(conn)
            self.integrity = verify.check(state, stored, self._key)
            if self.integrity == verify.TAMPERED:
                self.tamper_diff = self._diff_with_backup(state)

    def load(self) -> dict:
        with self._lock, closing(db.connect(self.db_path)) as conn:
            state = db.read_state(conn)
        loaded = {"state": state, "integrity": self.integrity, "recovery": self.recovery}
        if self.integrity == verify.TAMPERED:
            loaded["tamperDiff"] = self.tamper_diff
        return loaded

    def reset(self, now: int) -> None:
        """완전 초기화: 변조된 세이브와 스냅샷을 broken/tampered-시각/ 으로 옮기고 새 농장을 만듭니다.

        변조가 확인된 때만 할 수 있어요. 정상 농장을 실수로 지우는 일이 없도록요.
        """
        with self._lock:
            if self.integrity != verify.TAMPERED:
                raise NotTampered()
            dest = self.broken_dir / f"tampered-{backup._stamp(now)}"
            backup.quarantine_tampered(self.db_path, self.backups_dir, dest)
            self._new_farm(now)
            with closing(db.connect(self.db_path)) as conn:
                db.append_log(conn, [{"at": 0, "actor": "system", "action": "reset", "detail": "지문 불일치(변조) → 완전 초기화"}])
            self.integrity = verify.OK
            self.tamper_diff = None
            self.recovery = None

    def apply_transfer(self, transfer: dict, now: int) -> bool:
        """연구소 송장 하나를 농장 창고에 반영합니다. 이미 받은 송장이면 아무것도 안 하고 False (멱등).

        transfer: { id, kind: "to_lab"(작물을 연구소로 보냄 → 창고에서 빼기) | "fuel"(연료를 받음 → 더하기), item, amount, at }
        창고가 모자라면 ValueError. 창고·송장·지문을 한 트랜잭션으로 씁니다.
        """
        delta = transfer["amount"] if transfer["kind"] == "fuel" else -transfer["amount"]
        with self._lock:
            if self.integrity != verify.OK:
                raise SaveLocked()
            with closing(db.connect(self.db_path)) as conn:
                conn.execute("BEGIN IMMEDIATE")
                try:
                    if db.has_transfer(conn, transfer["id"]):
                        conn.execute("ROLLBACK")
                        return False
                    db.change_item(conn, transfer["item"], delta)
                    db.add_transfer(conn, transfer)
                    db.write_digest(conn, hashing.ALGO, hashing.digest(db.read_state(conn), self._key))
                    conn.execute("COMMIT")
                except BaseException:
                    conn.execute("ROLLBACK")
                    raise
                backup.snapshot(conn, self.backups_dir, now)
        return True

    def transfers(self) -> list:
        with self._lock, closing(db.connect(self.db_path)) as conn:
            return db.read_state(conn).get("transfers", [])

    def _diff_with_backup(self, state: dict):
        """지문까지 맞는 가장 최근 스냅샷과 비교한 차이. 그런 스냅샷이 없으면 None."""
        for candidate in backup.list_backups(self.backups_dir):
            if self._is_valid_backup(candidate):
                with closing(db.connect(candidate)) as conn:
                    return diff.changes(db.read_state(conn), state)
        return None

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

    def _migrate(self, conn) -> None:
        """옛 버전 세이브면 새 표 구조로 옮깁니다.

        옮기기 전에 지문을 먼저 확인합니다. 정상이던 세이브만 새 지문을 받고,
        변조된 세이브는 옮긴 뒤에도 지문이 맞지 않아 그대로 "변조"로 남습니다.
        """
        version = db.get_meta(conn, "schemaVersion", 1)
        if version > db.SCHEMA_VERSION:
            raise RuntimeError("이 세이브는 더 새로운 버전의 게임에서 만들어졌어요. 게임을 업데이트해 주세요.")
        if version == db.SCHEMA_VERSION:
            return
        was_ok = verify.check(db.read_state(conn), db.read_digest(conn), self._key) == verify.OK
        conn.execute("BEGIN")
        try:
            migrations.upgrade(conn, version, self._game_data())
            if was_ok:
                db.write_digest(conn, hashing.ALGO, hashing.digest(db.read_state(conn), self._key))
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise

    def _game_data(self) -> dict:
        def read(name):
            return json.loads((self.data_dir / name).read_text(encoding="utf-8"))

        return {"start": read("start.json"), "crops": read("crops.json")["crops"]}

    def _new_farm(self, now: int) -> None:
        """새 농장은 임시 파일에 다 만든 뒤 이름을 바꿔 넣습니다.

        만드는 도중 꺼져도 반쯤 만들어진 farm.sqlite 가 남지 않습니다.
        (os.replace 는 "바꾸기 전" 아니면 "바꾼 후" 둘 중 하나만 일어나는 동작이에요)
        """
        game_data = self._game_data()
        tmp_path = self.db_path.with_name(self.db_path.name + ".new")
        leftovers = [tmp_path] + [p.with_name(p.name + s) for p in (tmp_path, self.db_path) for s in ("-wal", "-shm")]
        for path in leftovers:
            path.unlink(missing_ok=True)
        with closing(db.connect(tmp_path)) as conn:
            db.create_schema(conn)
            conn.execute("BEGIN")
            try:
                db.fill_new_farm(conn, game_data["start"], now, [c["id"] for c in game_data["crops"]])
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
