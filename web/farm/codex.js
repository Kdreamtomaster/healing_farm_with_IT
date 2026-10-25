// 돌연변이와 도감 (라벨링 체험)
//   - 수확할 때 낮은 확률로 특징이 다른 작물(돌연변이)이 함께 나와요 (data/mutations.json)
//   - 처음 본 돌연변이는 도감에 "이름표 기다리는 중"으로 올라가고, 플레이어가 특징 이름표(라벨)를 달고 이름을 붙여요
//   - 게임은 정답(진짜 특징)을 알고 있어서, 라벨이 맞았는지 부드럽게 알려 줘요 (틀려도 벌칙 없음)
// 도감은 meta.codex 에 저장돼서 지문(HMAC)이 지켜 줘요.
import { farmSeed } from "./weather.js";
import { addItem, addStat } from "../state.js";
import { josa } from "../text.js";

let config = null; // data/mutations.json (설정하기 전에는 돌연변이가 나오지 않아요)
export function configureMutations(mutations) {
  config = mutations;
}
export const mutationConfig = () => config;

// 늘 같은 무작위: 농장 씨앗·칸·심은 시각이 같으면 같은 결과 → 새로고침으로 다시 뽑을 수 없어요
function chance(seed, plotId, plantedAt, salt) {
  let h = (seed ^ Math.imul(plotId + 1, 0x9e3779b1) ^ Math.imul(Math.floor(plantedAt * 10) + 7, 0x85ebca6b) ^ Math.imul(salt + 3, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 이 작물이 돌연변이인지: null 또는 { color?, shape?, size? }
export function rollMutation(state, plot) {
  if (!config || !plot.crop) return null;
  const roll = (salt) => chance(farmSeed(state), plot.id, plot.crop.plantedAt, salt);
  if (roll(0) >= config.chance) return null;
  const categories = Object.keys(config.traits);
  const pickValue = (category, salt) => {
    const values = Object.keys(config.traits[category]);
    return values[Math.floor(roll(salt) * values.length)];
  };
  const first = categories[Math.floor(roll(1) * categories.length)];
  const traits = { [first]: pickValue(first, 2) };
  if (roll(3) < config.secondTraitChance) {
    const others = categories.filter((c) => c !== first);
    const second = others[Math.floor(roll(4) * others.length)];
    traits[second] = pickValue(second, 5);
  }
  return traits;
}

// 특징을 정해진 순서로 이은 이름: { shape: "heart", color: "rainbow" } → "rainbow_heart"
export const traitKey = (traits) => ["color", "shape", "size"].filter((k) => traits[k]).map((k) => traits[k]).join("_");
export const mutantId = (speciesId, traits) => `mutant_${speciesId}_${traitKey(traits)}`;

// 수확한 돌연변이를 창고와 도감에 넣어요. 처음 보는 것이면 { isNew: true, entry }
export function discover(state, speciesId, traits, at) {
  addItem(state, mutantId(speciesId, traits));
  addStat(state, "mutants");
  const codex = (state.meta.codex ??= []);
  const id = `${speciesId}_${traitKey(traits)}`;
  const found = codex.find((e) => e.id === id);
  if (found) return { isNew: false, entry: found };
  const entry = { id, species: speciesId, truth: traits, label: null, name: "", foundAt: at, labeledAt: null };
  codex.push(entry);
  return { isNew: true, entry };
}

// 라벨 달기: label = { color, shape, size } (특징이 없으면 "none"), name = 내가 붙인 이름
// → { right: { color: true, … }, score, total, message }. 틀려도 등록돼요 (라벨 품질도 배워요)
export function labelEntry(entry, label, name, at) {
  const right = {};
  for (const category of ["color", "shape", "size"]) right[category] = (entry.truth[category] ?? "none") === (label[category] ?? "none");
  entry.label = { color: label.color ?? "none", shape: label.shape ?? "none", size: label.size ?? "none" };
  entry.name = name.trim().slice(0, 20) || entry.name;
  entry.labeledAt = at;
  const score = Object.values(right).filter(Boolean).length;
  const names = config?.categories ?? { color: "색", shape: "모양", size: "크기" };
  const wrong = Object.keys(right).filter((k) => !right[k]).map((k) => names[k]);
  const message = wrong.length ? `${score}/3 맞았어요. ${josa(wrong.join("·"), "을", "를")} 다시 볼까요? (다시 고칠 수 있어요)` : "라벨이 모두 맞았어요 ★ 도감에 올렸어요";
  return { right, score, total: 3, message };
}

// 내 라벨 정확도: 라벨을 단 도감 항목의 특징 칸 중 맞은 비율
export function labelAccuracy(codex = []) {
  let right = 0;
  let total = 0;
  for (const entry of codex) {
    if (!entry.label) continue;
    for (const category of ["color", "shape", "size"]) {
      total += 1;
      if ((entry.truth[category] ?? "none") === entry.label[category]) right += 1;
    }
  }
  return { right, total };
}

export const labeledCount = (codex = []) => codex.filter((e) => e.label).length;
