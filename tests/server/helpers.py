"""서버 테스트에서 함께 쓰는 준비물입니다."""

import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))

NOW = 1_700_000_000_000  # 테스트용 고정 시각(ms)


class TempFarm:
    """한글과 공백이 들어간 임시 폴더에 data/, assets/ 를 복사해 둔 테스트용 농장."""

    def __enter__(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "내 게임" / "힐링 농장"
        shutil.copytree(ROOT / "data", self.root / "data")
        shutil.copytree(ROOT / "assets", self.root / "assets")
        self.saves = self.root / "saves"
        return self

    def __exit__(self, *exc):
        self._tmp.cleanup()

    def store(self):
        from storage.store import FarmStore

        store = FarmStore(self.saves, self.root / "data")
        store.open(NOW)
        return store


def rules():
    from validation import load_rules

    return load_rules(ROOT)


def save_request(state: dict, log=None) -> dict:
    return {"state": state, "log": log or []}
