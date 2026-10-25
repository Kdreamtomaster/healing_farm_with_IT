// 농부의 친구들이 플레이어 대신 농장을 돌보는 규칙입니다.
// 친구마다 맡은 구획이 있어요 (data/friends.json 의 plots).
import { flood, water } from "../farm/care.js";
import { isThirsty, stageOf } from "../farm/crops.js";
import { harvest } from "../farm/harvest.js";

export function friendFor(friends, plotKind) {
  return friends.find((friend) => friend.plots.includes(plotKind)) ?? null;
}

// 농장을 한 바퀴 돌며: 다 자란 작물은 수확해 창고에 넣고, 목마른 작물에는 물을 줍니다.
export function friendsHelp(state, speciesById, friends, report) {
  for (const plot of state.plots) {
    if (!plot.crop) continue;
    const friend = friendFor(friends, plot.kind);
    if (!friend) continue;
    const species = speciesById.get(plot.crop.species);
    const done = (report.friends[friend.id] ??= { water: 0, harvest: {} });
    if (stageOf(plot.crop) === "ripe") {
      if (harvest(state, plot, species).ok) {
        done.harvest[species.id] = (done.harvest[species.id] ?? 0) + species.yield;
      }
    } else if (isThirsty(plot.crop, species)) {
      if (plot.kind === "paddy" ? flood(plot) : water(plot)) done.water += 1;
    }
  }
}
