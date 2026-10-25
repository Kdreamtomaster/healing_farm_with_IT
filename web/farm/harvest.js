// 심기, 수확, 시든 작물 정리 규칙입니다.
// 모든 함수는 { ok, message } 를 돌려줍니다. 화면은 message 를 그대로 보여 주면 돼요.
import { PLOT_FOR_TYPE, stageOf } from "./crops.js";
import { addItem, takeItem } from "../state.js";
import { josa, PLOT_NAMES } from "../text.js";

const START_MOISTURE = 40;

export const seedId = (speciesId) => `seed_${speciesId}`;

export function plant(state, plot, species) {
  const name = species.name.ko;
  if (plot.crop) return { ok: false, message: "이미 작물이 자라고 있어요" };
  if (PLOT_FOR_TYPE[species.type] !== plot.kind) {
    return { ok: false, message: `${josa(name, "은", "는")} ${PLOT_NAMES[plot.kind]}에 심을 수 없어요` };
  }
  if (!takeItem(state, seedId(species.id))) {
    return { ok: false, message: `${name} 씨앗이 없어요` };
  }
  plot.crop = {
    species: species.id,
    plantedAt: state.meta.gameMinutes,
    progress: 0,
    moisture: START_MOISTURE,
    ripeMinutes: 0,
    withered: false,
  };
  return { ok: true, message: `${josa(name, "을", "를")} 심었어요` };
}

export function harvest(state, plot, species) {
  if (!plot.crop || stageOf(plot.crop) !== "ripe") {
    return { ok: false, message: "아직 수확할 때가 아니에요" };
  }
  addItem(state, species.id, species.yield);
  addItem(state, seedId(species.id), species.seeds);
  plot.crop = null;
  return { ok: true, message: `${species.name.ko} ${species.yield}개와 씨앗 ${species.seeds}개를 얻었어요` };
}

export function clearWithered(plot) {
  if (!plot.crop || !plot.crop.withered) return { ok: false, message: "정리할 시든 작물이 없어요" };
  plot.crop = null;
  return { ok: true, message: "시든 작물을 정리했어요" };
}
