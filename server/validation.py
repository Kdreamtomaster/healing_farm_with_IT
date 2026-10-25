"""브라우저가 보낸 저장 요청을 그대로 믿지 않고 하나하나 확인합니다 (입력 검증).

통과하면 저장에 필요한 값만 골라 담은 dict 를 돌려주고, 이상하면 ValidationError 를 냅니다.
"""

import json
import math
import re
from pathlib import Path

ITEM_ID = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
PLOT_KINDS = {"field", "paddy", "flowerbed"}
MAX_PLOTS = 256
MAX_LOG = 500


class ValidationError(ValueError):
    pass


def load_rules(root: Path) -> dict:
    """검증에 필요한 "허용 목록"을 게임 데이터에서 읽어 옵니다.

    colors:  작물 id → 고를 수 있는 색 id 들 (data/crops.json)
    borders: 고를 수 있는 테두리 색 id 들 (assets/palette.json)
    species: 작물 id → data/crops.json 의 항목 (연구소로 보낼 때 씀)
    """
    crops = json.loads((root / "data" / "crops.json").read_text(encoding="utf-8"))["crops"]
    palette = json.loads((root / "assets" / "palette.json").read_text(encoding="utf-8"))
    return {
        "colors": {c["id"]: {color["id"] for color in c["colors"]} for c in crops},
        "borders": {b["id"] for b in palette["borders"]},
        "species": {c["id"]: c for c in crops},
    }


def validate_save(payload, rules: dict) -> dict:
    body = _dict(payload, "요청")
    state = _dict(body.get("state"), "state")
    meta = _dict(state.get("meta"), "state.meta")

    layout, borders, crops = [], {}, {}
    for i, raw in enumerate(_list(state.get("plots"), "state.plots", MAX_PLOTS)):
        where = f"state.plots[{i}]"
        plot = _dict(raw, where)
        plot_id = _int(plot.get("id"), f"{where}.id", 0, 10**6)
        kind = plot.get("kind")
        if kind not in PLOT_KINDS:
            raise ValidationError(f"{where}.kind 값이 올바르지 않아요")
        layout.append((plot_id, _int(plot.get("x"), f"{where}.x", 0, 255), _int(plot.get("y"), f"{where}.y", 0, 255), kind))
        if plot.get("border") not in rules["borders"]:
            raise ValidationError(f"{where}.border 는 assets/palette.json 에 없는 색이에요")
        borders[plot_id] = plot["border"]
        if plot.get("crop") is not None:
            crops[plot_id] = _crop(plot["crop"], rules["colors"], f"{where}.crop")

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

    game_meta = {
        "gameMinutes": _number(meta.get("gameMinutes"), "meta.gameMinutes", 0, 1e12),
        "playSeconds": _number(meta.get("playSeconds"), "meta.playSeconds", 0, 1e12),
        "timeScale": _number(meta.get("timeScale"), "meta.timeScale", 0.1, 1000),
    }
    if "knownSpecies" in meta:  # 옛 화면은 보내지 않아서, 있을 때만 확인하고 저장해요
        known = _list(meta["knownSpecies"], "meta.knownSpecies", len(rules["colors"]))
        if any(not isinstance(s, str) or s not in rules["colors"] for s in known) or len(set(known)) != len(known):
            raise ValidationError("meta.knownSpecies 에 data/crops.json 에 없는 작물이나 겹치는 작물이 있어요")
        game_meta["knownSpecies"] = sorted(known)

    return {
        "meta": game_meta,
        "layout": layout,
        "borders": borders,
        "crops": crops,
        "inventory": inventory,
        "log": log,
    }


HEX_COLOR = re.compile(r"^#[0-9a-f]{6}$")
LAB_SIZES = {"small", "normal", "big"}
MAX_TRANSFER = 10000


def validate_lab_send(payload, rules: dict) -> tuple:
    """연구소로 보내기 요청 { species, count } → (crops.json 항목, 개수)"""
    body = _dict(payload, "요청")
    species = rules["species"].get(body.get("species")) if isinstance(body.get("species"), str) else None
    if species is None:
        raise ValidationError("species 는 data/crops.json 에 있는 작물이어야 해요")
    return species, _int(body.get("count"), "count", 1, MAX_TRANSFER)


def validate_lab_fuel(payload) -> tuple:
    """연료 보내기 요청 { sampleId, count } → (실험 작물 번호, 개수)"""
    body = _dict(payload, "요청")
    return _int(body.get("sampleId"), "sampleId", 1, 10**9), _int(body.get("count"), "count", 1, MAX_TRANSFER)


def validate_lab_experiment(payload) -> tuple:
    """실험 요청 { sampleId, color: "#rrggbb", size } → (번호, 색, 크기)"""
    body = _dict(payload, "요청")
    color, size = body.get("color"), body.get("size")
    if not isinstance(color, str) or not HEX_COLOR.match(color):
        raise ValidationError("color 는 #rrggbb 모양의 색이어야 해요")
    if size not in LAB_SIZES:
        raise ValidationError("size 는 small / normal / big 중 하나예요")
    return _int(body.get("sampleId"), "sampleId", 1, 10**9), color, size


def _crop(raw, colors: dict, where: str) -> dict:
    crop = _dict(raw, where)
    if crop.get("species") not in colors:
        raise ValidationError(f"{where}.species 는 data/crops.json 에 없는 작물이에요")
    if crop.get("color") not in colors[crop["species"]]:
        raise ValidationError(f"{where}.color 는 이 작물에 없는 색이에요")
    return {
        "species": crop["species"],
        "plantedAt": _number(crop.get("plantedAt"), f"{where}.plantedAt", 0, 1e12),
        "progress": _number(crop.get("progress"), f"{where}.progress", 0, 1),
        "moisture": _number(crop.get("moisture"), f"{where}.moisture", 0, 100),
        "color": crop["color"],
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
