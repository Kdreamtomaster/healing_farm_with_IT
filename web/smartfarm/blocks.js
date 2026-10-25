// 스마트팜 블록(Airflow 의 Operator·Sensor): 블록마다 web/farm/·web/friends/ 의 규칙을 그대로 불러요.
//   run(state, params, env) → { status, message, skip? }
//     status: "success" 성공 / "waiting" 센서가 아직 기다리는 중 / "failed" 이번에는 실패
//     skip: 이 블록이 성공하면서 "건너뜀"으로 표시할 블록 id 들 (분기 블록)
//   env = { speciesList, speciesById, recipes, crafts, random }
//   fuel: 실제로 일할 때 쓰는 바이오 연료 (기다리기·확인 블록은 0)
import { bulkCare } from "../farm/care.js";
import { isThirsty, PLOT_FOR_TYPE, stageOf } from "../farm/crops.js";
import { harvest, plant, seedId } from "../farm/harvest.js";
import { cook } from "../friends/cooking.js";
import { finishCraft, startCraft } from "../friends/crafts.js";
import { itemCount } from "../state.js";
import { PLOT_NAMES } from "../text.js";

export const KINDS = ["field", "paddy", "flowerbed"];
export const WATER_TARGETS = { thirsty: "목마른 작물", highWater: "물 많이 먹는 작물", paddy: "논 전체" };
export const POKE_MINUTES = 30; // 센서가 다시 확인하는 간격 (게임 분)
export const SENSOR_TIMEOUT = 24 * 60; // 센서가 기다리는 최대 시간 (게임 하루)

const pick = (list, random) => list[Math.floor(random() * list.length)];
const plotsOf = (state, kind) => state.plots.filter((p) => p.kind === kind);

export const BLOCKS = {
  plant: {
    name: "씨앗 심기",
    icon: "🌱",
    fuel: 1,
    airflow: "PlantOperator",
    params: { kind: "flowerbed", species: "any" },
    describe: (p, env) => `${PLOT_NAMES[p.kind]}에 ${p.species === "any" ? "아무 작물" : env.speciesById.get(p.species)?.name.ko ?? p.species}`,
    run(state, p, env) {
      const empty = plotsOf(state, p.kind).filter((plot) => !plot.crop);
      if (!empty.length) return { status: "success", message: "빈 칸이 없어요" };
      let planted = 0;
      for (const plot of empty) {
        const choices = env.speciesList.filter(
          (s) => PLOT_FOR_TYPE[s.type] === p.kind && (p.species === "any" || s.id === p.species) && itemCount(state, seedId(s.id)) > 0,
        );
        if (!choices.length) break;
        const species = pick(choices, env.random);
        if (plant(state, plot, species, pick(species.colors, env.random).id).ok) planted += 1;
      }
      return planted ? { status: "success", message: `${planted}칸에 심었어요` } : { status: "failed", message: "심을 씨앗이 없어요" };
    },
  },
  check_moisture: {
    name: "수분 확인",
    icon: "🔎",
    fuel: 0,
    airflow: "ShortCircuitOperator",
    params: { skip: "" },
    describe: (p) => (p.skip ? `촉촉하면 "${p.skip}" 건너뛰기` : "촉촉한지 보기만"),
    run(state, p, env) {
      const thirsty = state.plots.filter((plot) => plot.crop && isThirsty(plot.crop, env.speciesById.get(plot.crop.species)));
      if (thirsty.length) return { status: "success", message: `목마른 칸 ${thirsty.length}개` };
      return { status: "success", message: "모두 촉촉해요", skip: p.skip ? [p.skip] : [] };
    },
  },
  water: {
    name: "물주기",
    icon: "💧",
    fuel: 1,
    airflow: "WaterOperator",
    params: { target: "thirsty" },
    describe: (p) => WATER_TARGETS[p.target],
    run(state, p, env) {
      const count = bulkCare(state, env.speciesById, p.target);
      return { status: "success", message: `${count}칸에 물을 줬어요` };
    },
  },
  wait_ripe: {
    name: "다 자람 기다리기",
    icon: "⏳",
    fuel: 0,
    sensor: true,
    airflow: "RipeSensor",
    params: { kind: "flowerbed" },
    describe: (p) => `${PLOT_NAMES[p.kind]}에 다 자란 작물이 생길 때까지`,
    run(state, p) {
      const ripe = plotsOf(state, p.kind).filter((plot) => plot.crop && stageOf(plot.crop) === "ripe").length;
      return ripe ? { status: "success", message: `다 자란 칸 ${ripe}개` } : { status: "waiting", message: "아직 자라는 중" };
    },
  },
  harvest: {
    name: "수확",
    icon: "🧺",
    fuel: 1,
    airflow: "HarvestOperator",
    params: { kind: "flowerbed" },
    describe: (p) => PLOT_NAMES[p.kind],
    run(state, p, env) {
      let count = 0;
      for (const plot of plotsOf(state, p.kind)) {
        if (plot.crop && stageOf(plot.crop) === "ripe" && harvest(state, plot, env.speciesById.get(plot.crop.species)).ok) count += 1;
      }
      return { status: "success", message: count ? `${count}칸 수확했어요` : "수확할 작물이 없었어요" };
    },
  },
  cook: {
    name: "요리",
    icon: "🍳",
    fuel: 1,
    airflow: "CookOperator",
    params: { recipe: "caprese" },
    describe: (p, env) => env.recipes.find((r) => r.id === p.recipe)?.name.ko ?? p.recipe,
    run(state, p, env) {
      const recipe = env.recipes.find((r) => r.id === p.recipe);
      const result = recipe ? cook(state, recipe) : { ok: false, message: "모르는 요리예요" };
      return { status: result.ok ? "success" : "failed", message: result.message };
    },
  },
  craft: {
    name: "공방",
    icon: "💐",
    fuel: 1,
    airflow: "CraftOperator",
    params: { craft: "tulip_bouquet" },
    describe: (p, env) => env.crafts.find((c) => c.id === p.craft)?.name.ko ?? p.craft,
    run(state, p, env) {
      const craft = env.crafts.find((c) => c.id === p.craft);
      const started = craft ? startCraft(state, craft) : { ok: false, message: "모르는 물건이에요" };
      if (!started.ok) return { status: "failed", message: started.message };
      return { status: "success", message: finishCraft(state, craft).message };
    },
  },
};
