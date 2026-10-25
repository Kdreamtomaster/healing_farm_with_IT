// 작물이 자라는 규칙입니다.
// 이 파일의 함수는 화면을 모르고 시계도 직접 보지 않습니다. 몇 분이 흘렀는지만 받아서 계산합니다.
// 그래서 플레이 중에도, 오프라인 계산(3단계)에도, 테스트에도 똑같이 쓸 수 있어요.

import { farmSeed, isRaining } from "./weather.js";

// 작물이 좋아하는 흙의 수분 범위 [최소, 최대]
export const WATER_RANGE = { low: [10, 50], mid: [30, 70], high: [50, 95] };

// 게임 시간 1분마다 흙이 마르는 양. 논은 물을 머금고 있어 천천히 마릅니다.
export const DRY_PER_MINUTE = { field: 0.4, flowerbed: 0.4, paddy: 0.25 };

// 작물 종류(type)마다 심을 수 있는 구획(kind)
export const PLOT_FOR_TYPE = { field: "field", paddy: "paddy", flower: "flowerbed" };

// 비가 오면 흙의 수분이 1분마다 이만큼씩 작물이 좋아하는 촉촉함(좋아하는 범위의 가운데)으로 다가가요
const RAIN_PER_MINUTE = 1;

// 수분이 맞지 않으면 이만큼 느리게 자람.
// 힐링 게임이라 작물은 시들거나 죽지 않고, 다 자라면 수확할 때까지 그대로 기다려 줘요.
const SLOW_GROWTH = 0.4;
const STEP_MINUTES = 1; // 한 번에 계산하는 시간 조각

export function stageOf(crop) {
  if (crop.progress >= 1) return "ripe";
  if (crop.progress >= 0.5) return "growing";
  if (crop.progress >= 0.15) return "sprout";
  return "seed";
}

export function inWaterRange(moisture, species) {
  const [low, high] = WATER_RANGE[species.water];
  return moisture >= low && moisture <= high;
}

export function isThirsty(crop, species) {
  return crop.moisture < WATER_RANGE[species.water][0];
}

// 작물 하나를 minutes(게임 분)만큼 자라게 한 새 작물을 돌려줍니다. 원래 작물은 바꾸지 않아요.
//   weather: { start, raining(gameMinute) } — start 는 계산을 시작하는 게임 시각. 없으면 비 없이 계산
export function advanceCrop(crop, species, plotKind, minutes, weather = null) {
  let { progress, moisture } = crop;
  const dry = DRY_PER_MINUTE[plotKind];
  const [low, high] = WATER_RANGE[species.water];
  const comfy = (low + high) / 2;
  let left = minutes;
  // 긴 시간을 한 번에 계산하면 중간에 흙이 마르는 순간을 놓치므로 1분씩 나눠 계산합니다.
  while (left > 0) {
    const dt = Math.min(STEP_MINUTES, left);
    left -= dt;
    if (progress < 1) {
      const rate = inWaterRange(moisture, species) ? 1 : SLOW_GROWTH;
      progress += (dt / species.growMinutes) * rate;
      // 0.1 을 열 번 더해도 컴퓨터에서는 0.9999999… 가 될 수 있어, 아주 가까우면 1로 맞춥니다
      if (progress > 1 - 1e-9) progress = 1;
    }
    if (weather?.raining(weather.start + (minutes - left - dt))) {
      // 비: 마른 흙은 촉촉하게, 너무 젖은 흙은 알맞게
      const step = RAIN_PER_MINUTE * dt;
      moisture += Math.max(-step, Math.min(step, comfy - moisture));
    } else {
      moisture = Math.max(0, moisture - dry * dt);
    }
  }
  return { ...crop, progress, moisture };
}

// 농장 전체를 minutes(게임 분)만큼 흘려보냅니다.
export function advanceFarm(state, speciesById, minutes) {
  if (minutes <= 0) return;
  const seed = farmSeed(state);
  const weather = { start: state.meta.gameMinutes, raining: (gameMinute) => isRaining(gameMinute, seed) };
  for (const plot of state.plots) {
    if (plot.crop) {
      plot.crop = advanceCrop(plot.crop, speciesById.get(plot.crop.species), plot.kind, minutes, weather);
    }
  }
  state.meta.gameMinutes += minutes;
}
