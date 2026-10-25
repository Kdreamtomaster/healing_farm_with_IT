"""불러온 농장 데이터의 지문을 다시 계산해, 저장할 때 기록한 지문과 비교합니다."""

import hmac

from integrity import hashing

OK = "ok"
TAMPERED = "tampered"


def check(state: dict, stored_digest, key: bytes) -> str:
    return compare(hashing.digest(state, key), stored_digest)


def compare(computed: str, stored_digest) -> str:
    if stored_digest is None:
        return TAMPERED
    # compare_digest: 글자를 비교하는 데 걸린 시간으로 정답을 추측하지 못하게 하는 비교
    return OK if hmac.compare_digest(computed, stored_digest) else TAMPERED
