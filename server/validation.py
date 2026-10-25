"""브라우저가 보낸 저장 요청을 그대로 믿지 않고 하나하나 확인합니다 (입력 검증).

통과하면 저장에 필요한 값만 골라 담은 dict 를 돌려주고, 이상하면 ValidationError 를 냅니다.
"""

import json
import math
import re
from graphlib import CycleError, TopologicalSorter
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
    traits:  돌연변이 특징 (data/mutations.json), unlocks: 해금 id 들 (data/unlocks.json)
    """
    def read(*parts):
        return json.loads(root.joinpath(*parts).read_text(encoding="utf-8"))

    crops = read("data", "crops.json")["crops"]
    colors = {c["id"]: {color["id"] for color in c["colors"]} for c in crops}
    unlocks = read("data", "unlocks.json")["unlocks"]
    for unlock in unlocks:  # 해금으로 열리는 희귀 색도 저장할 수 있어야 해요
        color = unlock["gives"].get("color")
        if color:
            colors[color["species"]].add(color["id"])
    return {
        "colors": colors,
        "borders": {b["id"] for b in read("assets", "palette.json")["borders"]},
        "species": {c["id"]: c for c in crops},
        "traits": {k: set(v) for k, v in read("data", "mutations.json")["traits"].items()},
        "unlocks": {u["id"] for u in unlocks},
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
    if "smartfarm" in meta:
        game_meta["smartfarm"] = _smartfarm(meta["smartfarm"])
    if "stats" in meta:
        game_meta["stats"] = _stats(meta["stats"], rules)
    if "codex" in meta:
        game_meta["codex"] = _codex(meta["codex"], rules)
    if "unlocked" in meta:
        unlocked = _list(meta["unlocked"], "meta.unlocked", len(rules["unlocks"]))
        if any(u not in rules["unlocks"] for u in unlocked if isinstance(u, str)) or not all(isinstance(u, str) for u in unlocked):
            raise ValidationError("meta.unlocked 에 data/unlocks.json 에 없는 해금이 있어요")
        game_meta["unlocked"] = unlocked

    return {
        "meta": game_meta,
        "layout": layout,
        "borders": borders,
        "crops": crops,
        "inventory": inventory,
        "log": log,
    }


# ── 스마트팜 (8단계): DAG 모양과 실행 상태. 브라우저가 계산하지만, 모양이 이상하면 저장하지 않아요 ──
SMARTFARM_BLOCKS = {"plant", "check_moisture", "water", "wait_ripe", "harvest", "cook", "craft"}
TASK_ID = re.compile(r"^[a-z][a-z0-9_]{0,23}$")
SCHEDULE = re.compile(r"^(manual|daily@([01]\d|2[0-3]):[0-5]\d)$")
TRIGGERS = {"all_success", "none_failed"}
MAX_SMARTFARM_BYTES = 64 * 1024


def _smartfarm(raw) -> dict:
    sf = _dict(raw, "meta.smartfarm")
    if len(json.dumps(sf)) > MAX_SMARTFARM_BYTES:
        raise ValidationError("스마트팜 데이터가 너무 커요")
    for i, dag in enumerate(_list(sf.get("dags", []), "meta.smartfarm.dags", 8)):
        where = f"meta.smartfarm.dags[{i}]"
        dag = _dict(dag, where)
        _name(dag.get("id"), f"{where}.id")
        _text(dag.get("name"), f"{where}.name", 40)
        if not isinstance(dag.get("schedule"), str) or not SCHEDULE.match(dag["schedule"]):
            raise ValidationError(f"{where}.schedule 은 manual 이나 daily@HH:MM 이어야 해요")
        ids = set()
        for j, task in enumerate(_list(dag.get("tasks"), f"{where}.tasks", 20)):
            at = f"{where}.tasks[{j}]"
            task = _dict(task, at)
            ids.add(_name(task.get("id"), f"{at}.id"))
            if task.get("block") not in SMARTFARM_BLOCKS:
                raise ValidationError(f"{at}.block 은 아는 블록이 아니에요")
            for key, value in _dict(task.get("params", {}), f"{at}.params").items():
                _text(key, f"{at}.params", 20)
                if not isinstance(value, (str, int, float)) or isinstance(value, bool) or len(str(value)) > 40:
                    raise ValidationError(f"{at}.params.{key} 값이 올바르지 않아요")
            _int(task.get("retries", 0), f"{at}.retries", 0, 5)
            _number(task.get("retryDelay", 30), f"{at}.retryDelay", 0, 1440)
            if task.get("trigger", "all_success") not in TRIGGERS:
                raise ValidationError(f"{at}.trigger 는 all_success 나 none_failed 예요")
        graph = {task_id: set() for task_id in ids}
        for edge in _list(dag.get("edges", []), f"{where}.edges", 60):
            if not isinstance(edge, list) or len(edge) != 2 or edge[0] not in ids or edge[1] not in ids:
                raise ValidationError(f"{where}.edges 에 없는 블록을 잇는 화살표가 있어요")
            graph[edge[1]].add(edge[0])
        try:
            tuple(TopologicalSorter(graph).static_order())  # 빙글 도는 길이 있으면 CycleError (docs/learn/05 의 실험과 같은 도구)
        except CycleError as error:
            raise ValidationError(f"{where} 에 빙글 도는 길이 있어요: {' → '.join(error.args[1])}") from None
    _dict(sf.get("runs", {}), "meta.smartfarm.runs")
    _list(sf.get("history", []), "meta.smartfarm.history", 20)
    _dict(sf.get("lastDaily", {}), "meta.smartfarm.lastDaily")
    return sf


def _name(value, where: str) -> str:
    if not isinstance(value, str) or not TASK_ID.match(value):
        raise ValidationError(f"{where} 는 영어 소문자·숫자·_ 로 된 이름이어야 해요")
    return value


# ── 6단계: 서명된 집계 숫자와 도감 ──
STAT_COUNTS = {"cooked", "crafted", "gifts", "mutants"}
CODEX_ID = re.compile(r"^[a-z][a-z0-9_]{0,60}$")


def _stats(raw, rules: dict) -> dict:
    stats = _dict(raw, "meta.stats")
    for key, value in stats.items():
        if key == "harvests":
            for species, n in _dict(value, "meta.stats.harvests").items():
                if species not in rules["colors"]:
                    raise ValidationError("meta.stats.harvests 에 모르는 작물이 있어요")
                _int(n, f"meta.stats.harvests.{species}", 0, 10**9)
        elif key in STAT_COUNTS:
            _int(value, f"meta.stats.{key}", 0, 10**9)
        else:
            raise ValidationError(f"meta.stats.{str(key)[:20]} 는 모르는 집계예요")
    return stats


def _codex(raw, rules: dict) -> list:
    entries = _list(raw, "meta.codex", 300)
    for i, entry in enumerate(entries):
        where = f"meta.codex[{i}]"
        entry = _dict(entry, where)
        if not isinstance(entry.get("id"), str) or not CODEX_ID.match(entry["id"]):
            raise ValidationError(f"{where}.id 모양이 올바르지 않아요")
        if entry.get("species") not in rules["colors"]:
            raise ValidationError(f"{where}.species 는 data/crops.json 에 있는 작물이어야 해요")
        truth = _dict(entry.get("truth"), f"{where}.truth")
        if not truth or any(k not in rules["traits"] or v not in rules["traits"][k] for k, v in truth.items()):
            raise ValidationError(f"{where}.truth 에 모르는 특징이 있어요")
        if entry.get("label") is not None:
            for k, v in _dict(entry["label"], f"{where}.label").items():
                if k not in rules["traits"] or (v != "none" and v not in rules["traits"][k]):
                    raise ValidationError(f"{where}.label 에 모르는 특징이 있어요")
        _text(entry.get("name", ""), f"{where}.name", 20)
        _number(entry.get("foundAt"), f"{where}.foundAt", 0, 1e12)
        if entry.get("labeledAt") is not None:
            _number(entry["labeledAt"], f"{where}.labeledAt", 0, 1e12)
    return entries


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
