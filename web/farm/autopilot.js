// 멍때리기 모드: 농부들이 알아서 할 일을 고르는 규칙입니다.
// 순서: 다 자란 작물 수확 → 목마른 작물 물주기 → 빈 칸에 씨앗 심기(작물과 색은 무작위)
// 같은 순서 안에서는 아무 칸이나 골라서, 농부들이 농장 여기저기를 돌아다녀요.
import { isThirsty, PLOT_FOR_TYPE, stageOf } from "./crops.js";
import { seedId } from "./harvest.js";
import { itemCount } from "../state.js";

const pick = (list, random) => list[Math.floor(random() * list.length)];

// 다음에 할 일 하나: { kind, plot, speciesId?, colorId? } 또는 할 일이 없으면 null
//   isPending(plotId): 누가 이미 그 칸에 가는 중이면 true (같은 칸에 두 명이 가지 않게)
export function nextTask(state, speciesList, isPending, random = Math.random) {
  const speciesById = new Map(speciesList.map((s) => [s.id, s]));
  const free = state.plots.filter((plot) => !isPending(plot.id));

  const ripe = free.filter((plot) => plot.crop && stageOf(plot.crop) === "ripe");
  if (ripe.length) return { kind: "harvest", plot: pick(ripe, random) };

  const thirsty = free.filter((plot) => plot.crop && isThirsty(plot.crop, speciesById.get(plot.crop.species)));
  if (thirsty.length) {
    const plot = pick(thirsty, random);
    return { kind: plot.kind === "paddy" ? "flood" : "water", plot };
  }

  // 씨앗이 남아 있는 작물 중 그 칸에 심을 수 있는 것만
  const plantable = free
    .filter((plot) => !plot.crop)
    .map((plot) => ({
      plot,
      choices: speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === plot.kind && itemCount(state, seedId(s.id)) > 0),
    }))
    .filter(({ choices }) => choices.length);
  if (plantable.length) {
    const { plot, choices } = pick(plantable, random);
    const species = pick(choices, random);
    return { kind: "plant", plot, speciesId: species.id, colorId: pick(species.colors, random).id };
  }
  return null;
}
