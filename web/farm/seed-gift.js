// 새 작물 씨앗 선물: 게임에 새 작물이 늘어나면, 전부터 키우던 농장에도 씨앗을 한 번 보내 줘요.
// 어떤 작물을 이미 아는지는 세이브의 meta.knownSpecies 에 기억해서, 같은 선물을 두 번 받지 않아요.
import { addItem } from "../state.js";
import { seedId } from "./harvest.js";

// knownSpecies 를 기억하기 전에 만든 농장이 알던 작물들
export const FIRST_SPECIES = ["tomato", "potato", "rice", "tulip"];
export const GIFT_SEEDS = 2;

// 처음 보는 작물의 씨앗을 창고에 넣고, 그 작물 목록을 돌려줘요 (없으면 빈 목록)
export function giftNewSeeds(state, speciesList) {
  const known = new Set(state.meta.knownSpecies ?? FIRST_SPECIES);
  const fresh = speciesList.filter((s) => !known.has(s.id));
  for (const species of fresh) addItem(state, seedId(species.id), GIFT_SEEDS);
  // 지금 게임에 있는 작물만 기억해요 (서버도 crops.json 에 있는 작물만 받아요)
  state.meta.knownSpecies = speciesList.map((s) => s.id);
  return fresh;
}

// 선물 안내 한 줄: "당근·딸기·양배추 등 10가지 씨앗이 도착했어요 🎁"
export function giftMessage(fresh) {
  const names = fresh.map((s) => s.name.ko);
  const shown = names.length > 3 ? `${names.slice(0, 3).join("·")} 등 ${names.length}가지` : names.join("·");
  return `새 씨앗 선물이 도착했어요 🎁 ${shown} 씨앗을 ${GIFT_SEEDS}개씩 받았어요`;
}
