"""브라우저가 보낸 저장 요청을 그대로 믿지 않고 하나하나 확인합니다 (입력 검증).

통과하면 저장에 필요한 값만 골라 담은 dict 를 돌려주고, 이상하면 ValidationError 를 냅니다.
"""

import math
import re

ITEM_ID = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
PLOT_KINDS = {"field", "paddy", "flowerbed"}
MAX_PLOTS = 256
MAX_LOG = 500


class ValidationError(ValueError):
    pass


def validate_save(payload, species_ids: set) -> dict:
    body = _dict(payload, "요청")
    state = _dict(body.get("state"), "state")
    meta = _dict(state.get("meta"), "state.meta")

    layout, crops = [], {}
    for i, raw in enumerate(_list(state.get("plots"), "state.plots", MAX_PLOTS)):
        where = f"state.plots[{i}]"
        plot = _dict(raw, where)
        plot_id = _int(plot.get("id"), f"{where}.id", 0, 10**6)
        kind = plot.get("kind")
        if kind not in PLOT_KINDS:
            raise ValidationError(f"{where}.kind 값이 올바르지 않아요")
        layout.append((plot_id, _int(plot.get("x"), f"{where}.x", 0, 255), _int(plot.get("y"), f"{where}.y", 0, 255), kind))
        if plot.get("crop") is not None:
            crops[plot_id] = _crop(plot["crop"], species_ids, f"{where}.crop")

    inventory = {}
    for item, count in _dict(state.get("inventory"), "state.inventory").items():
        if not ITEM_ID.match(item):
            raise ValidationError(f"창고 물건 이름이 올바르지 않아요: {item[:40]}")
        inventory[item] = _int(count, f"state.inventory.{item}", 0, 10**9)

    log = []
    for i, raw in enumerate(_list(body.get("log", []), "log", MAX_LOG)):
        entry = _dict(raw, f"log[{i}]")
        log.append({
            "at": _number(entry.get("at"), f"log[{i}].at", 0, 1e12),
            "actor": _text(entry.get("actor"), f"log[{i}].actor", 40),
            "action": _text(entry.get("action"), f"log[{i}].action", 40),
            "detail": _text(entry.get("detail", ""), f"log[{i}].detail", 200),
        })

    return {
        "meta": {
            "gameMinutes": _number(meta.get("gameMinutes"), "meta.gameMinutes", 0, 1e12),
            "playSeconds": _number(meta.get("playSeconds"), "meta.playSeconds", 0, 1e12),
            "timeScale": _number(meta.get("timeScale"), "meta.timeScale", 0.1, 1000),
        },
        "layout": layout,
        "crops": crops,
        "inventory": inventory,
        "log": log,
    }


def _crop(raw, species_ids: set, where: str) -> dict:
    crop = _dict(raw, where)
    if crop.get("species") not in species_ids:
        raise ValidationError(f"{where}.species 는 data/crops.json 에 없는 작물이에요")
    withered = crop.get("withered")
    if not isinstance(withered, bool):
        raise ValidationError(f"{where}.withered 는 true/false 여야 해요")
    return {
        "species": crop["species"],
        "plantedAt": _number(crop.get("plantedAt"), f"{where}.plantedAt", 0, 1e12),
        "progress": _number(crop.get("progress"), f"{where}.progress", 0, 1),
        "moisture": _number(crop.get("moisture"), f"{where}.moisture", 0, 100),
        "ripeMinutes": _number(crop.get("ripeMinutes"), f"{where}.ripeMinutes", 0, 1e12),
        "withered": withered,
    }


def _dict(value, where: str) -> dict:
    if not isinstance(value, dict):
        raise ValidationError(f"{where} 는 객체여야 해요")
    return value


def _list(value, where: str, max_len: int) -> list:
    if not isinstance(value, list) or len(value) > max_len:
        raise ValidationError(f"{where} 는 {max_len}개 이하의 목록이어야 해요")
    return value


def _number(value, where: str, low: float, high: float) -> float:
    # bool 은 파이썬에서 int 의 한 종류라서 따로 걸러 냅니다.
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValidationError(f"{where} 는 숫자여야 해요")
    if not low <= value <= high:
        raise ValidationError(f"{where} 는 {low} ~ {high} 사이여야 해요")
    return value


def _int(value, where: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError(f"{where} 는 정수여야 해요")
    return int(_number(value, where, low, high))


def _text(value, where: str, max_len: int) -> str:
    if not isinstance(value, str) or len(value) > max_len:
        raise ValidationError(f"{where} 는 {max_len}자 이하의 글자여야 해요")
    return value
