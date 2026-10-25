"""변조된 세이브와 마지막 정상 저장본을 비교해, 무엇이 바뀌었는지 찾습니다.

되살리려는 게 아니라 "왜 무결성 이상이 났는지" 보여 주려는 거예요.
농장 데이터를 "주소 → 값" 목록으로 펼친 뒤 (예: inventory.seed_tomato → 4) 두 목록을 비교합니다.
"""

from integrity.hashing import UNSIGNED_META

MAX_CHANGES = 30


def flatten(state: dict) -> dict:
    flat = {}
    for key, value in state["meta"].items():
        if key not in UNSIGNED_META | {"lastSavedAt", "schemaVersion"}:  # 저장·업데이트 때마다 바뀌는 값은 빼요
            flat[f"meta.{key}"] = value
    for item, count in state["inventory"].items():
        flat[f"inventory.{item}"] = count
    for plot in state["plots"]:
        where = f"plots[{plot['id']}]"
        flat[f"{where}.border"] = plot.get("border")
        for key, value in (plot.get("crop") or {}).items():
            flat[f"{where}.crop.{key}"] = value
    for transfer in state.get("transfers", []):
        flat[f"transfers.{transfer['id']}"] = f"{transfer['kind']}:{transfer['item']}:{transfer['amount']}"
    return flat


def changes(before: dict, after: dict) -> list:
    """[{ "path", "before", "after" }] — 없던 것은 before 가 None, 사라진 것은 after 가 None"""
    old, new = flatten(before), flatten(after)
    found = [
        {"path": path, "before": old.get(path), "after": new.get(path)}
        for path in sorted(old.keys() | new.keys())
        if old.get(path) != new.get(path)
    ]
    return found[:MAX_CHANGES]
