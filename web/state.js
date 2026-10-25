// 게임 상태(state)의 모양과 창고를 다루는 도우미입니다.
//
// state = {
//   meta: { gameMinutes, playSeconds, timeScale, lastSavedAt, createdAt, ... },
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

// 물건이 충분하면 꺼내고 true, 모자라면 아무것도 하지 않고 false
export function takeItem(state, item, count = 1) {
  if (itemCount(state, item) < count) return false;
  state.inventory[item] -= count;
  return true;
}
