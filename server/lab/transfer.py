"""농장 ↔ 연구소 옮기기 (송장 번호로 멱등하게)

두 세이브 파일에 걸친 옮기기는 한 트랜잭션으로 묶을 수 없어요.
(WAL 모드의 SQLite 는 여러 파일에 걸친 트랜잭션이 파일마다만 원자적이에요)
그래서 택배처럼 송장 번호를 붙이고, 받는 쪽은 처음 보는 송장만 처리해요.
중간에 꺼져도 recover() 가 이어서 하고, 같은 송장이 두 번 더해지지 않아요.

    농장 → 연구소 (작물):  ① 농장: 작물 빼기 + 송장 기록   ② 연구소: 처음 보는 송장이면 받기
    연구소 → 농장 (연료):  ① 연구소: 실험 작물 빼기 + "보내는 중" 송장
                          ② 농장: 처음 보는 송장이면 biofuel 더하기   ③ 연구소: 송장 "도착"

연구소 → 농장으로 넘어갈 수 있는 것은 바이오 연료(biofuel) 하나뿐이에요 (허용 목록).
"""

import secrets

from integrity import verify
from storage.store import SaveLocked

FUEL_ITEM = "biofuel"


def new_id(now: int) -> str:
    return f"{now}-{secrets.token_hex(4)}"


def send_to_lab(farm, lab, species: dict, count: int, now: int) -> dict:
    """농장 창고의 작물(species: crops.json 항목)을 count 개 연구소로 보내요."""
    transfer = {"id": new_id(now), "kind": "to_lab", "item": species["id"], "amount": count, "at": now}
    farm.apply_transfer(transfer, now)  # ① 모자라면 ValueError, 변조된 농장이면 SaveLocked
    lab.receive_from_farm(transfer, species["colors"][0]["hex"])  # ②
    return transfer


def send_fuel(farm, lab, sample_id: int, count: int, now: int) -> dict:
    """연구소 실험 작물 count 개를 바이오 연료 count 개로 바꿔 농장 창고로 보내요."""
    if farm.integrity != verify.OK:
        raise SaveLocked()
    transfer = lab.start_fuel(new_id(now), sample_id, count, now)  # ① 지문이 맞지 않으면 LabLocked
    farm.apply_transfer(transfer, now)  # ②
    lab.finish_fuel(transfer["id"])  # ③
    return transfer


def recover(farm, lab, species_by_id: dict, now: int) -> int:
    """중간에 끊긴 옮기기를 이어서 해요. 이어서 한 송장 수를 돌려줘요.

    농장이나 연구소의 지문이 맞지 않으면 그쪽 기록은 믿지 않아요.
    (연구소 세이브를 고쳐 "보내는 중" 송장을 지어내면 연료를 공짜로 받을 수 있으니까요)
    """
    if farm.integrity != verify.OK:
        return 0
    done = 0
    received = lab.received_ids()
    for transfer in farm.transfers():
        if transfer["kind"] == "to_lab" and transfer["id"] not in received:
            species = species_by_id.get(transfer["item"])
            color = species["colors"][0]["hex"] if species else "#888888"
            if lab.receive_from_farm({**transfer}, color):
                done += 1
    if lab.load()["integrity"] == verify.OK:
        for transfer in lab.sending():
            farm.apply_transfer({k: transfer[k] for k in ("id", "kind", "item", "amount", "at")}, now)
            lab.finish_fuel(transfer["id"])
            done += 1
    return done

