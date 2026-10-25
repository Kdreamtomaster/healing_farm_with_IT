// 도구 규칙: 지금 든 도구로 이 칸에 무슨 일을 할 수 있는지, "알맞은 일"은 무엇인지 정합니다.
// 화면도 키보드도 모르는 순수한 규칙이라, 마우스 클릭·드래그·키보드가 모두 같은 규칙을 써요.
import { isThirsty, PLOT_FOR_TYPE, stageOf } from "./crops.js";
import { seedId } from "./harvest.js";
import { itemCount } from "../state.js";

// 도구: 살펴보기, 물뿌리개, 씨앗, 수확 바구니
export const TOOLS = [
  { id: "look", name: "살펴보기", key: "1" },
  { id: "water", name: "물뿌리개", key: "2" },
  { id: "seed", name: "씨앗", key: "3" },
  { id: "harvest", name: "수확", key: "4" },
];

const pour = (plot) => ({ kind: plot.kind === "paddy" ? "flood" : "water" });

// 이 칸에 심을 씨앗: 그 칸 종류(밭·논·화단)에 골라 둔 씨앗 → 없으면 씨앗이 남은 첫 작물
//   seedChoice: { field: { speciesId, colorId }, paddy: …, flowerbed: … }
export function seedFor(plot, state, speciesList, seedChoice = {}) {
  const fits = speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === plot.kind && itemCount(state, seedId(s.id)) > 0);
  const chosen = seedChoice[plot.kind];
  const species = fits.find((s) => s.id === chosen?.speciesId) ?? fits[0];
  if (!species) return null;
  const keepColor = species.id === chosen?.speciesId && species.colors.some((c) => c.id === chosen.colorId);
  return { speciesId: species.id, colorId: keepColor ? chosen.colorId : species.colors[0].id };
}

// 도구로 이 칸에 할 일 → { kind, … } 또는 할 수 없으면 { reason }
export function toolTask(tool, plot, state, speciesList, seedChoice) {
  if (tool === "water") return plot.crop ? pour(plot) : { reason: "물을 줄 작물이 없어요" };
  if (tool === "harvest") {
    if (!plot.crop) return { reason: "수확할 작물이 없어요" };
    return stageOf(plot.crop) === "ripe" ? { kind: "harvest" } : { reason: "아직 수확할 때가 아니에요" };
  }
  if (tool === "seed") {
    if (plot.crop) return { reason: "이미 작물이 자라고 있어요" };
    const seed = seedFor(plot, state, speciesList, seedChoice);
    return seed ? { kind: "plant", ...seed } : { reason: "이 칸에 심을 씨앗이 없어요" };
  }
  return { reason: "" }; // 살펴보기는 일을 하지 않아요
}

// 알맞은 일: 다 자랐으면 수확 → 비었으면 심기 → 목마르면 물주기 → 아니면 할 일 없음
export function smartTask(plot, state, speciesList, seedChoice) {
  if (!plot.crop) return toolTask("seed", plot, state, speciesList, seedChoice);
  if (stageOf(plot.crop) === "ripe") return { kind: "harvest" };
  const species = speciesList.find((s) => s.id === plot.crop.species);
  if (isThirsty(plot.crop, species)) return pour(plot);
  return { reason: "지금은 잘 자라고 있어요. 할 일이 없어요" };
}

// 씨앗 고르기를 앞뒤로 넘기기 (Q/E, 마우스 휠). 고른 작물의 칸 종류 자리에 기억해요.
export function cycleSeed(seedChoice, speciesList, currentSpeciesId, step) {
  const index = Math.max(0, speciesList.findIndex((s) => s.id === currentSpeciesId));
  const species = speciesList[(index + step + speciesList.length) % speciesList.length];
  const kind = PLOT_FOR_TYPE[species.type];
  const colorId = seedChoice[kind]?.speciesId === species.id ? seedChoice[kind].colorId : species.colors[0].id;
  return { choice: { ...seedChoice, [kind]: { speciesId: species.id, colorId } }, speciesId: species.id };
}

// 고른 씨앗의 색 바꾸기 (R, Shift+휠)
export function cycleColor(seedChoice, speciesList, speciesId, step = 1) {
  const species = speciesList.find((s) => s.id === speciesId);
  const kind = PLOT_FOR_TYPE[species.type];
  const current = seedChoice[kind]?.speciesId === speciesId ? seedChoice[kind].colorId : species.colors[0].id;
  const index = species.colors.findIndex((c) => c.id === current);
  const color = species.colors[(index + step + species.colors.length) % species.colors.length];
  return { ...seedChoice, [kind]: { speciesId, colorId: color.id } };
}
