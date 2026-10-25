// 게임 상태(state)의 모양과 창고를 다루는 도우미입니다.
//
// state = {
//   meta: { gameMinutes, playSeconds, timeScale, lastSavedAt, createdAt, stats, codex, unlocked, smartfarm, ... },
//   plots: [{ id, x, y, kind, crop: null | { species, plantedAt, progress, moisture, color } }],
//   inventory: { seed_tomato: 4, tomato: 3, ... },
// }
// 이 모양 그대로 서버에 저장되고 다시 불러와집니다.

export function itemCount(state, item) {
  return state.inventory[item] ?? 0;
}

export function addItem(state, item, count = 1) {
  state.inventory[item] = itemCount(state, item) + count;
}

// 서명된 집계 숫자 (meta.stats): 해금 같은 판단은 서명 밖인 작업 기록 대신 이 숫자를 써요
//   addStat(state, "cooked")              → stats.cooked += 1
//   addStat(state, "harvests", "tomato", 3) → stats.harvests.tomato += 3
export function addStat(state, key, sub = null, n = 1) {
  const stats = ((state.meta ??= {}).stats ??= {});
  if (sub === null) stats[key] = (stats[key] ?? 0) + n;
  else (stats[key] ??= {})[sub] = (stats[key][sub] ?? 0) + n;
}

export const statOf = (state, key) => state.meta.stats?.[key] ?? 0;
export const totalHarvests = (state) => Object.values(state.meta.stats?.harvests ?? {}).reduce((a, b) => a + b, 0);

// 물건이 충분하면 꺼내고 true, 모자라면 아무것도 하지 않고 false
export function takeItem(state, item, count = 1) {
  if (itemCount(state, item) < count) return false;
  state.inventory[item] -= count;
  return true;
}
