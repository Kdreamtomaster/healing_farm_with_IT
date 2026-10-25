// web/farm/ 규칙 테스트
import { bulkCare } from "../../web/farm/care.js";
import { advanceCrop, DRY_PER_MINUTE, stageOf } from "../../web/farm/crops.js";
import { harvest, plant } from "../../web/farm/harvest.js";
import { assert, assertNear, test } from "./runner.js";

// 테스트용 작물: 계산하기 쉽게 10분 만에 다 자라도록
const SPROUTY = { id: "sprouty", name: { ko: "새싹이" }, type: "field", water: "low", growMinutes: 10, yield: 3, seeds: 2, colors: [{ id: "red", name: "빨강", hex: "#ff0000" }] };
const RICE = { id: "rice", name: { ko: "벼" }, type: "paddy", water: "high", growMinutes: 10, yield: 5, seeds: 2, colors: [{ id: "gold", name: "황금", hex: "#ffff00" }] };
const speciesById = new Map([SPROUTY, RICE].map((s) => [s.id, s]));

const crop = (fields = {}) => ({ species: "sprouty", plantedAt: 0, progress: 0, moisture: 50, color: "red", ...fields });

function newState() {
  return {
    meta: { gameMinutes: 0, playSeconds: 0, timeScale: 30 },
    plots: [
      { id: 0, x: 0, y: 0, kind: "field", crop: null },
      { id: 1, x: 1, y: 0, kind: "field", crop: null },
      { id: 2, x: 0, y: 1, kind: "paddy", crop: null },
    ],
    inventory: { seed_sprouty: 1, seed_rice: 1 },
  };
}

test("수분이 알맞으면 성장 시간이 지나면 다 자란다", () => {
  const grown = advanceCrop(crop(), SPROUTY, "field", 10);
  assertNear(grown.progress, 1, "성장도");
  assert(stageOf(grown) === "ripe", "수확 가능 단계여야 해요");
});

test("수분이 맞지 않으면 느리게 자란다 (죽지는 않는다)", () => {
  const grown = advanceCrop(crop({ moisture: 0 }), SPROUTY, "field", 10);
  assertNear(grown.progress, 0.4, "성장도", 1e-6);
});

test("다 자란 작물은 아무리 오래 둬도 수확할 때까지 기다린다", () => {
  const grown = advanceCrop(crop(), SPROUTY, "field", 10 * 24 * 60); // 게임 열흘
  assert(stageOf(grown) === "ripe", "계속 수확 가능해야 해요");
});

test("흙은 시간이 지나면 마르고, 논은 더 천천히 마른다", () => {
  const field = advanceCrop(crop(), SPROUTY, "field", 10);
  const paddy = advanceCrop(crop(), SPROUTY, "paddy", 10);
  assertNear(field.moisture, 50 - DRY_PER_MINUTE.field * 10, "밭 수분", 1e-6);
  assert(paddy.moisture > field.moisture, "논이 덜 말라야 해요");
});

test("나눠서 계산해도 한 번에 계산한 것과 같다", () => {
  // 플레이 중(1초마다 조금씩)과 오프라인(한 번에 길게) 결과가 같아야 해요
  let stepwise = crop();
  for (let i = 0; i < 60; i++) stepwise = advanceCrop(stepwise, SPROUTY, "field", 0.5);
  const once = advanceCrop(crop(), SPROUTY, "field", 30);
  for (const key of ["progress", "moisture"]) assertNear(stepwise[key], once[key], key, 1e-6);
});

test("원래 작물은 바뀌지 않는다", () => {
  const original = crop();
  advanceCrop(original, SPROUTY, "field", 5);
  assert(original.progress === 0, "원래 작물이 바뀌었어요");
});

test("심으면 씨앗이 하나 줄고, 씨앗이 없으면 못 심는다", () => {
  const state = newState();
  assert(plant(state, state.plots[0], SPROUTY).ok, "심어져야 해요");
  assert(state.inventory.seed_sprouty === 0, "씨앗이 줄어야 해요");
  assert(!plant(state, state.plots[1], SPROUTY).ok, "씨앗이 없으면 안 돼요");
});

test("밭 작물은 논에 심을 수 없다", () => {
  const state = newState();
  const result = plant(state, state.plots[2], SPROUTY);
  assert(!result.ok, "논에 심어지면 안 돼요");
  assert(state.inventory.seed_sprouty === 1, "씨앗이 줄면 안 돼요");
});

test("다 자란 작물을 수확하면 수확물과 씨앗이 들어오고 칸이 빈다", () => {
  const state = newState();
  state.plots[0].crop = crop({ progress: 1 });
  assert(harvest(state, state.plots[0], SPROUTY).ok, "수확되어야 해요");
  assert(state.inventory.sprouty === 3, "수확물 3개");
  assert(state.inventory.seed_sprouty === 3, "씨앗 1 + 2개");
  assert(state.plots[0].crop === null, "칸이 비어야 해요");
});

test("덜 자란 작물은 수확되지 않는다", () => {
  const state = newState();
  state.plots[0].crop = crop({ progress: 0.9 });
  assert(!harvest(state, state.plots[0], SPROUTY).ok, "덜 자람");
});

test("목마른 작물에만 일괄 물주기", () => {
  const state = newState();
  state.plots[0].crop = crop({ moisture: 5 }); // low 작물의 최소 수분은 10
  state.plots[1].crop = crop({ moisture: 30 });
  assert(bulkCare(state, speciesById, "thirsty") === 1, "한 칸만");
  assert(state.plots[0].crop.moisture === 45, "목마른 칸에 물이 들어가요");
  assert(state.plots[1].crop.moisture === 30, "다른 칸은 그대로");
});

test("논 물대기는 논만 가득 채운다", () => {
  const state = newState();
  state.plots[0].crop = crop({ moisture: 5 });
  state.plots[2].crop = crop({ species: "rice", moisture: 20 });
  assert(bulkCare(state, speciesById, "paddy") === 1, "논 한 칸만");
  assert(state.plots[2].crop.moisture === 100, "논은 100");
  assert(state.plots[0].crop.moisture === 5, "밭은 그대로");
});
