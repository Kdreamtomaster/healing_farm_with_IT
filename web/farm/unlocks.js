// 해금: 서명된 숫자(meta.stats, meta.playSeconds, meta.codex)가 조건을 채우면 희귀 색·새 레시피가 열려요
// 조건과 열리는 것은 data/unlocks.json. 판단에는 서명 밖인 작업 기록(task_log)을 쓰지 않아요 (docs/learn/07 위협 모델).
import { statOf, totalHarvests } from "../state.js";
import { labeledCount } from "./codex.js";

export const NEED_NAMES = { playMinutes: "직접 플레이(분)", harvests: "수확", cooked: "요리", crafted: "공방 물건", gifts: "선물", codex: "도감 등록" };

function have(state, key) {
  if (key === "playMinutes") return Math.floor((state.meta.playSeconds ?? 0) / 60);
  if (key === "harvests") return totalHarvests(state);
  if (key === "codex") return labeledCount(state.meta.codex);
  return statOf(state, key);
}

// 조건마다 진행 상황 [{ key, name, have, need }]
export const progress = (state, unlock) => Object.entries(unlock.needs).map(([key, need]) => ({ key, name: NEED_NAMES[key] ?? key, have: Math.min(need, have(state, key)), need }));
export const isMet = (state, unlock) => progress(state, unlock).every((p) => p.have >= p.need);
export const isUnlocked = (state, unlock) => (state.meta.unlocked ?? []).includes(unlock.id);

// 새로 조건을 채운 것들을 meta.unlocked 에 적고 돌려줘요 (한 번만)
export function checkUnlocks(state, unlocks) {
  const fresh = unlocks.filter((u) => !isUnlocked(state, u) && isMet(state, u));
  if (fresh.length) state.meta.unlocked = [...(state.meta.unlocked ?? []), ...fresh.map((u) => u.id)];
  return fresh;
}

// 열린 것을 게임 데이터에 더해요: 작물 색 목록, 요리 목록 (이미 있으면 그대로)
export function applyUnlock(unlock, speciesById, recipes) {
  const { color, recipe } = unlock.gives;
  if (color) {
    const species = speciesById.get(color.species);
    if (species && !species.colors.some((c) => c.id === color.id)) species.colors.push({ id: color.id, name: color.name, hex: color.hex });
  }
  if (recipe && !recipes.some((r) => r.id === recipe.id)) recipes.push(recipe);
}
