// 물주기와 일괄 관리 규칙입니다.
import { isThirsty } from "./crops.js";

export const WATER_AMOUNT = 40; // 물뿌리개 한 번에 오르는 수분

// 물을 줄 수 있으면 주고 true 를 돌려줍니다.
export function water(plot) {
  if (!plot.crop || plot.crop.withered) return false;
  plot.crop = { ...plot.crop, moisture: Math.min(100, plot.crop.moisture + WATER_AMOUNT) };
  return true;
}

// 논에 물을 가득 채웁니다.
export function flood(plot) {
  if (plot.kind !== "paddy" || !plot.crop || plot.crop.withered) return false;
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

export function bulkCare(state, speciesById, kind) {
  const { match, action } = BULK[kind];
  let count = 0;
  for (const plot of state.plots) {
    if (plot.crop && !plot.crop.withered && match(plot, speciesById.get(plot.crop.species))) {
      if (action(plot)) count += 1;
    }
  }
  return count;
}
