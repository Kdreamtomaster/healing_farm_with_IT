"""정상 저장본(스냅샷)을 몇 개 보관하고, 세이브 파일이 깨지면 그중 하나로 되살립니다."""

import shutil
import sqlite3
import time
from contextlib import closing
from pathlib import Path

KEEP = 5  # 보관할 스냅샷 개수


def _stamp(now: int) -> str:
    return time.strftime("%Y%m%d-%H%M%S", time.localtime(now / 1000)) + f"-{now % 1000:03d}"


def list_backups(backups_dir: Path) -> list:
    """최신 스냅샷이 앞에 오도록 정렬합니다. (파일 이름에 시각이 들어 있어 이름순 = 시간순)"""
    return sorted(backups_dir.glob("farm-*.sqlite"), reverse=True)


def snapshot(conn: sqlite3.Connection, backups_dir: Path, now: int) -> Path:
    backups_dir.mkdir(parents=True, exist_ok=True)
    dest = backups_dir / f"farm-{_stamp(now)}.sqlite"
    with closing(sqlite3.connect(str(dest))) as target:
        conn.backup(target)  # SQLite 가 제공하는 안전한 복사
    for old in list_backups(backups_dir)[KEEP:]:
        old.unlink()
    return dest


def quarantine(db_path: Path, broken_dir: Path, now: int) -> None:
    """깨진 세이브를 지우지 않고 broken/ 으로 옮겨 둡니다. 원인을 살펴볼 수 있도록요.

    -wal, -shm 파일도 함께 옮깁니다. 남겨 두면 되살린 파일에 깨진 기록이 덧씌워질 수 있습니다.
    """
    broken_dir.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        path = db_path.with_name(db_path.name + suffix)
        if path.exists():
            shutil.move(str(path), str(broken_dir / f"{_stamp(now)}-{path.name}"))


def quarantine_tampered(db_path: Path, backups_dir: Path, dest: Path) -> None:
    """변조된 세이브와 스냅샷을 모두 dest 폴더로 옮깁니다 (완전 초기화).

    스냅샷을 남겨 두면 손으로 되살릴 수 있어서 함께 옮겨요. 지우지는 않아요 — 무엇이 바뀌었는지 살펴볼 수 있게.
    """
    dest.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        path = db_path.with_name(db_path.name + suffix)
        if path.exists():
            shutil.move(str(path), str(dest / path.name))
    if backups_dir.exists():
        shutil.move(str(backups_dir), str(dest / backups_dir.name))


def restore_latest(db_path: Path, backups_dir: Path, is_valid):
    """검사를 통과한 가장 최근 스냅샷을 세이브 자리에 복사합니다. 없으면 None."""
    for candidate in list_backups(backups_dir):
        if is_valid(candidate):
            shutil.copy2(str(candidate), str(db_path))
            return candidate
    return None
