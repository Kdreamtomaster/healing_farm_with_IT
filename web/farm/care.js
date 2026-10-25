// 물주기와 일괄 관리 규칙입니다.
import { isThirsty } from "./crops.js";

export const WATER_AMOUNT = 40; // 물뿌리개 한 번에 오르는 수분

// 물을 줄 수 있으면 주고 true 를 돌려줍니다.
export function water(plot) {
  if (!plot.crop) return false;
  plot.crop = { ...plot.crop, moisture: Math.min(100, plot.crop.moisture + WATER_AMOUNT) };
  return true;
}

// 논에 물을 가득 채웁니다.
export function flood(plot) {
  if (plot.kind !== "paddy" || !plot.crop) return false;
  plot.crop = { ...plot.crop, moisture: 100 };
  return true;
}

// 작물 특징별 일괄 관리. match 가 true 인 칸에만 action 을 합니다.
export const BULK = {
  thirsty: {
    label: "목마른 작물에 물주기",
    match: (plot, species) => isThirsty(plot.crop, species),
    action: water,
  },
  highWater: {
    label: "물 많이 먹는 작물에 물주기",
    match: (plot, species) => species.water === "high",
    action: water,
  },
  paddy: {
    label: "논 전체 물대기",
    match: (plot) => plot.kind === "paddy",
    action: flood,
  },
};

// 일괄 관리할 칸 고르기 (화면은 이 칸들을 차례로 돌며 드론·스프링클러 연출을 보여 줘요)
export function bulkTargets(state, speciesById, kind) {
  const { match } = BULK[kind];
  return state.plots.filter((plot) => plot.crop && match(plot, speciesById.get(plot.crop.species)));
}

// 연출 없이 한 번에 일괄 관리. 바뀐 칸 수를 돌려줍니다.
export function bulkCare(state, speciesById, kind) {
  return bulkTargets(state, speciesById, kind).filter((plot) => BULK[kind].action(plot)).length;
}
