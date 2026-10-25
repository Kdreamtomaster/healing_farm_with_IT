"""연구소(샌드박스) 세이브: saves/lab.sqlite 와 연구소 전용 키 saves/.lab-key

본 농장과 파일도 키도 따로라서, 연구소에서 무슨 실험을 해도 본 농장에는 닿지 않아요.
연구소 키는 공부용 장난감 키라서 화면에도 보여 줘요. (본 농장 키는 어디에도 보여 주지 않아요)

연구소 세이브는 마음껏 고쳐 봐도 괜찮아요. 지문이 맞지 않으면 "지문 불일치"라고 알려 줄 뿐,
벌칙은 없어요. 다만 지문이 맞지 않는 동안에는 농장으로 연료를 보낼 수 없어요.
"""

import json
import sqlite3
import threading
from contextlib import closing
from pathlib import Path

from integrity import hashing, verify
from storage.db import set_meta

SCHEMA = Path(__file__).with_name("schema.sql")
SIZES = ("small", "normal", "big")
SAMPLE_FIELDS = ("id", "species", "color", "size", "count")
TRANSFER_FIELDS = ("id", "kind", "item", "amount", "status", "at")


class LabLocked(Exception):
    """연구소 지문이 맞지 않아 연료를 보낼 수 없을 때 발생합니다."""


def canonical(state: dict) -> str:
    """지문을 만들 글자. 브라우저의 실험대(web/lab/bench.js)도 똑같은 규칙으로 만들어요."""
    return json.dumps(state, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class LabStore:
    def __init__(self, saves_dir: Path):
        self.saves_dir = saves_dir
        self.db_path = saves_dir / "lab.sqlite"
        self.key_path = saves_dir / ".lab-key"
        self._lock = threading.Lock()

    # ── 열기와 읽기 ──
    def _connect(self) -> sqlite3.Connection:
        self.saves_dir.mkdir(parents=True, exist_ok=True)
        fresh = not self.db_path.exists()
        conn = sqlite3.connect(str(self.db_path), isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        if fresh:
            conn.executescript(SCHEMA.read_text(encoding="utf-8"))
            conn.execute("BEGIN")
            set_meta(conn, "createdAt", 0)
            self._sign(conn)
            conn.execute("COMMIT")
        return conn

    def _key(self) -> bytes:
        return hashing.load_or_create_key(self.key_path)

    @staticmethod
    def _read(conn) -> dict:
        samples = [dict(zip(SAMPLE_FIELDS, row)) for row in conn.execute(f"SELECT {', '.join(SAMPLE_FIELDS)} FROM samples ORDER BY id")]
        transfers = [dict(zip(TRANSFER_FIELDS, row)) for row in conn.execute(f"SELECT {', '.join(TRANSFER_FIELDS)} FROM transfers ORDER BY id")]
        return {"samples": samples, "transfers": transfers}

    def _sign(self, conn) -> None:
        text = canonical(self._read(conn))
        conn.execute(
            "INSERT INTO integrity (id, algo, digest) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET algo = excluded.algo, digest = excluded.digest",
            (hashing.ALGO, hashing.hmac_hex(text.encode("utf-8"), self._key())),
        )

    def _integrity(self, conn) -> str:
        row = conn.execute("SELECT digest FROM integrity WHERE id = 1").fetchone()
        text = canonical(self._read(conn))
        return verify.compare(hashing.hmac_hex(text.encode("utf-8"), self._key()), row[0] if row else None)

    def load(self) -> dict:
        """연구소 상태와, 지문 실험대에 보여 줄 재료(정규화 글자, SHA-256, HMAC, 키)"""
        with self._lock, closing(self._connect()) as conn:
            state = self._read(conn)
            row = conn.execute("SELECT digest FROM integrity WHERE id = 1").fetchone()
            integrity = self._integrity(conn)
        text = canonical(state)
        return {
            **state,
            "canonical": text,
            "sha256": hashing.sha256_hex(text.encode("utf-8")),
            "hmac": hashing.hmac_hex(text.encode("utf-8"), self._key()),
            "storedDigest": row[0] if row else None,
            "key": self._key().hex(),
            "integrity": integrity,
        }

    # ── 바꾸기 (모두 한 트랜잭션 + 새 지문) ──
    def _change(self, work, need_ok=False):
        with self._lock, closing(self._connect()) as conn:
            if need_ok and self._integrity(conn) != verify.OK:
                raise LabLocked()
            conn.execute("BEGIN IMMEDIATE")
            try:
                result = work(conn)
                self._sign(conn)
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            return result

    def experiment(self, sample_id: int, color: str, size: str) -> None:
        """실험: 실험 작물의 색과 크기를 바꿔요. (개수는 바꿀 수 없어요 — 연료를 공짜로 만들 수 있으니까요)"""

        def work(conn):
            if conn.execute("UPDATE samples SET color = ?, size = ? WHERE id = ?", (color, size, sample_id)).rowcount != 1:
                raise ValueError("그런 실험 작물이 없어요")

        self._change(work)

    def receive_from_farm(self, transfer: dict, color: str) -> bool:
        """농장에서 보낸 작물을 받아요. 이미 받은 송장이면 False (멱등)."""

        def work(conn):
            if conn.execute("SELECT 1 FROM transfers WHERE id = ?", (transfer["id"],)).fetchone():
                return False
            row = conn.execute("SELECT id FROM samples WHERE species = ? AND color = ? AND size = 'normal'", (transfer["item"], color)).fetchone()
            if row:
                conn.execute("UPDATE samples SET count = count + ? WHERE id = ?", (transfer["amount"], row[0]))
            else:
                conn.execute("INSERT INTO samples (species, color, size, count) VALUES (?, ?, 'normal', ?)", (transfer["item"], color, transfer["amount"]))
            conn.execute(
                "INSERT INTO transfers (id, kind, item, amount, status, at) VALUES (?, 'from_farm', ?, ?, 'done', ?)",
                (transfer["id"], transfer["item"], transfer["amount"], transfer["at"]),
            )
            return True

        return self._change(work)

    def start_fuel(self, transfer_id: str, sample_id: int, count: int, now: int) -> dict:
        """연료 보내기 ①: 실험 작물을 빼고 "보내는 중" 송장을 적어요. 지문이 맞을 때만."""

        def work(conn):
            row = conn.execute("SELECT count FROM samples WHERE id = ?", (sample_id,)).fetchone()
            if not row or row[0] < count or count < 1:
                raise ValueError("실험 작물이 모자라요")
            if row[0] == count:
                conn.execute("DELETE FROM samples WHERE id = ?", (sample_id,))
            else:
                conn.execute("UPDATE samples SET count = count - ? WHERE id = ?", (count, sample_id))
            transfer = {"id": transfer_id, "kind": "fuel", "item": "biofuel", "amount": count, "at": now}
            conn.execute(
                "INSERT INTO transfers (id, kind, item, amount, status, at) VALUES (?, 'fuel', 'biofuel', ?, 'sending', ?)",
                (transfer_id, count, now),
            )
            return transfer

        return self._change(work, need_ok=True)

    def finish_fuel(self, transfer_id: str) -> None:
        """연료 보내기 ③: 농장이 받았으니 송장을 "도착"으로."""
        self._change(lambda conn: conn.execute("UPDATE transfers SET status = 'done' WHERE id = ?", (transfer_id,)))

    def sending(self) -> list:
        """아직 "보내는 중"인 연료 송장 (중간에 꺼졌던 것)"""
        with self._lock, closing(self._connect()) as conn:
            return [t for t in self._read(conn)["transfers"] if t["status"] == "sending"]

    def received_ids(self) -> set:
        with self._lock, closing(self._connect()) as conn:
            return {t["id"] for t in self._read(conn)["transfers"] if t["kind"] == "from_farm"}

    def clear(self) -> None:
        """연구소 비우기: 지문이 맞지 않게 된 연구소를 처음 상태로. 실험 작물은 사라져요."""
        with self._lock:
            for suffix in ("", "-wal", "-shm"):
                self.db_path.with_name(self.db_path.name + suffix).unlink(missing_ok=True)
