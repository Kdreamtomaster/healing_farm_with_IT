// web/farm/autopilot.js 테스트: 멍때리기 모드에서 농부들이 고르는 일
import { nextTask } from "../../web/farm/autopilot.js";
import { assert, test } from "./runner.js";

const TOMATO = { id: "tomato", type: "field", water: "high", colors: [{ id: "red" }, { id: "yellow" }] };
const RICE = { id: "rice", type: "paddy", water: "high", colors: [{ id: "gold" }] };
const SPECIES = [TOMATO, RICE];
const crop = (species, progress, moisture) => ({ species, plantedAt: 0, progress, moisture, color: species === "rice" ? "gold" : "red" });
const none = () => false;
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function farm() {
  return {
    meta: { gameMinutes: 0 },
    plots: [
      { id: 0, x: 0, y: 0, kind: "field", crop: null },
      { id: 1, x: 1, y: 0, kind: "field", crop: crop("tomato", 0.5, 80) },
      { id: 2, x: 0, y: 1, kind: "paddy", crop: null },
    ],
    inventory: { seed_tomato: 3, seed_rice: 0 },
  };
}

test("다 자란 작물 수확이 가장 먼저", () => {
  const state = farm();
  state.plots[1].crop = crop("tomato", 1, 10);
  const task = nextTask(state, SPECIES, none, random);
  assert(task.kind === "harvest" && task.plot.id === 1, JSON.stringify(task));
});

test("그다음은 목마른 작물 물주기 (논은 물대기)", () => {
  const state = farm();
  state.plots[1].crop = crop("tomato", 0.5, 10);
  assert(nextTask(state, SPECIES, none, random).kind === "water");
  state.plots[1].crop = null;
  state.plots[2].crop = crop("rice", 0.5, 10);
  assert(nextTask(state, SPECIES, none, random).kind === "flood");
});

test("할 일이 없으면 씨앗이 있는 작물을 무작위 색으로 심는다", () => {
  const state = farm();
  const colors = new Set();
  for (let i = 0; i < 30; i++) {
    const task = nextTask(state, SPECIES, none, random);
    assert(task.kind === "plant" && task.plot.id === 0 && task.speciesId === "tomato", "벼 씨앗은 없어서 밭에 토마토만");
    colors.add(task.colorId);
  }
  assert(colors.size === 2, "빨강·노랑 둘 다 나와요");
});

test("누가 가는 중인 칸은 고르지 않고, 할 일이 없으면 null", () => {
  const state = farm();
  assert(nextTask(state, SPECIES, (id) => id === 0, random) === null, "빈 밭은 이미 누가 가는 중, 논은 씨앗 없음");
});

const RECIPES = [
  { id: "caprese", ingredients: { tomato: 2 } },
  { id: "rice_ball", ingredients: { rice: 2 } },
];

test("멍때리기 부엌일: 한동안 안 먹었고 요리가 있으면 다 같이 먹는다", async () => {
  const { nextKitchenTask, FEAST_EVERY_MS } = await import("../../web/farm/autopilot.js");
  const state = { inventory: { dish_caprese: 1, tomato: 5 } };
  assert(nextKitchenTask(state, RECIPES, { feasting: false, msSinceFeast: FEAST_EVERY_MS }, random).kind === "share");
  const soon = nextKitchenTask(state, RECIPES, { feasting: false, msSinceFeast: 1000 }, random);
  assert(soon.kind === "cook" && soon.recipeId === "caprese", "방금 먹었으면 요리를 해 둬요");
  assert(nextKitchenTask(state, RECIPES, { feasting: true, msSinceFeast: FEAST_EVERY_MS }, random).kind === "cook", "먹는 중이면 또 차리지 않아요");
});

test("멍때리기 부엌일: 같은 요리는 2접시까지, 재료가 없으면 할 일 없음", async () => {
  const { nextKitchenTask } = await import("../../web/farm/autopilot.js");
  assert(nextKitchenTask({ inventory: { dish_caprese: 2, tomato: 9 } }, RECIPES, { feasting: true, msSinceFeast: 0 }, random) === null);
  assert(nextKitchenTask({ inventory: { tomato: 1 } }, RECIPES, { feasting: false, msSinceFeast: 0 }, random) === null);
});
