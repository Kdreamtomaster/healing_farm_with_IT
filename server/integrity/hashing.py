"""농장 데이터의 "지문"(HMAC-SHA256)을 만듭니다.

같은 내용이면 언제나 같은 지문이 나오도록, 데이터를 정해진 순서의 JSON 글자로 바꾼 뒤 계산합니다.
비밀 키(saves/.key)를 섞기 때문에, 키를 모르면 데이터를 고친 뒤 맞는 지문을 새로 만들 수 없습니다.
(단, 내 PC 의 키 파일은 마음먹으면 읽을 수 있으니 완벽한 보안은 아닙니다. README.md 참고)
"""

import hashlib
import hmac
import json
import secrets
from pathlib import Path

ALGO = "hmac-sha256"

# 게임을 켤 때마다 서버가 고쳐 쓰는 값이라 지문에서 뺍니다.
UNSIGNED_META = {"lastLaunchAt"}


def load_or_create_key(path: Path) -> bytes:
    try:
        return bytes.fromhex(path.read_text(encoding="ascii").strip())
    except (FileNotFoundError, ValueError):
        # 키가 없거나 망가졌으면 새로 만듭니다. 기존 세이브의 지문은 더 이상 맞지 않게 됩니다.
        key = secrets.token_bytes(32)
        path.write_text(key.hex(), encoding="ascii")
        return key


def canonical(state: dict) -> bytes:
    signed = {
        "meta": {k: v for k, v in state["meta"].items() if k not in UNSIGNED_META},
        "plots": state["plots"],
        "inventory": state["inventory"],
    }
    if "transfers" in state:  # 연구소 송장 (세이브 버전 4부터)
        signed["transfers"] = state["transfers"]
    return json.dumps(signed, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(state: dict, key: bytes) -> str:
    return hmac_hex(canonical(state), key)


def hmac_hex(data: bytes, key: bytes) -> str:
    return hmac.new(key, data, hashlib.sha256).hexdigest()


def sha256_hex(data: bytes) -> str:
    """키 없는 그냥 해시 (연구소 실험대에서 HMAC 과 비교해 보여 줘요)"""
    return hashlib.sha256(data).hexdigest()
