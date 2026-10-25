// 작물 다양화 테스트: 새 씨앗 선물(web/farm/seed-gift.js), 창고 풍경 고르기(web/ui/scenery.js), 게임 데이터 짝 맞추기
import { FIRST_SPECIES, giftMessage, giftNewSeeds, GIFT_SEEDS } from "../../web/farm/seed-gift.js";
import { josa } from "../../web/text.js";
import { storagePicks } from "../../web/ui/scenery.js";
import { assert, test } from "./runner.js";

const species = (id, ko = id) => ({ id, name: { ko } });
const ALL = [species("tomato", "토마토"), species("potato", "감자"), species("rice", "벼"), species("tulip", "튤립"), species("carrot", "당근"), species("corn", "옥수수")];

test("새 씨앗 선물: knownSpecies 가 없던 옛 농장은 처음 4가지 말고 새 작물만 받아요", () => {
  const state = { meta: {}, inventory: { seed_tomato: 1 } };
  const fresh = giftNewSeeds(state, ALL);
  assert(fresh.map((s) => s.id).join() === "carrot,corn", fresh.map((s) => s.id).join());
  assert(state.inventory.seed_carrot === GIFT_SEEDS && state.inventory.seed_tomato === 1, JSON.stringify(state.inventory));
  assert(state.meta.knownSpecies.length === ALL.length);
  assert(FIRST_SPECIES.every((id) => !fresh.some((s) => s.id === id)));
});

test("새 씨앗 선물: 같은 선물을 두 번 받지 않아요", () => {
  const state = { meta: {}, inventory: {} };
  giftNewSeeds(state, ALL);
  state.inventory.seed_carrot = 0; // 다 심었어도
  assert(giftNewSeeds(state, ALL).length === 0);
  assert(state.inventory.seed_carrot === 0);
});

test("새 씨앗 선물: 게임에서 빠진 작물은 기억에서도 빼요 (서버는 crops.json 에 있는 작물만 받아요)", () => {
  const state = { meta: { knownSpecies: ["tomato", "melon"] }, inventory: {} };
  giftNewSeeds(state, ALL.slice(0, 2));
  assert(state.meta.knownSpecies.join() === "tomato,potato", state.meta.knownSpecies.join());
});

test("새 씨앗 선물 안내: 많으면 3가지만 이름을 말해요", () => {
  assert(giftMessage(ALL.slice(4)).includes("당근·옥수수 씨앗을"), giftMessage(ALL.slice(4)));
  assert(giftMessage(ALL).includes("토마토·감자·벼 등 6가지"), giftMessage(ALL));
});

test("창고 풍경: 가장 많이 쌓인 4가지를 데이터 순서대로 보여 줘요", () => {
  const state = { inventory: { tomato: 1, potato: 9, rice: 5, tulip: 2, carrot: 7, corn: 0 } };
  const picks = storagePicks(state, ALL, (s) => s.id);
  assert(picks.map((s) => s.id).join() === "potato,rice,tulip,carrot", picks.map((s) => s.id).join());
  assert(storagePicks({ inventory: {} }, ALL, (s) => s.id).length === 0);
});

test("조사 으로/로: ㄹ 받침과 받침 없는 말 뒤에는 로", () => {
  assert(josa("빨강", "으로", "로") === "빨강으로");
  assert(josa("보라", "으로", "로") === "보라로");
  assert(josa("연필", "으로", "로") === "연필로");
  assert(josa("튤립", "을", "를") === "튤립을");
});

test("게임 데이터: 모든 작물에 그림이 있고, 요리 재료는 모두 있는 작물이에요", async () => {
  const get = (path) => fetch(`../../${path}`).then((r) => r.json());
  const [{ crops }, { recipes }, manifest, start] = await Promise.all([get("data/crops.json"), get("data/recipes.json"), get("assets/manifest.json"), get("data/start.json")]);
  const ids = crops.map((c) => c.id);
  assert(ids.length >= 14, `작물 ${ids.length}가지`);
  assert(ids.join() === manifest.crops.ids.join(), "manifest 의 작물 그림 목록이 crops.json 과 달라요");
  const { unlocks } = await get("data/unlocks.json");
  const allRecipes = [...recipes, ...unlocks.filter((u) => u.gives.recipe).map((u) => u.gives.recipe)];
  assert(allRecipes.map((r) => r.id).join() === manifest.dishes.join(), "manifest 의 요리 그림 목록이 recipes.json + unlocks.json 과 달라요");
  for (const u of unlocks) {
    if (u.gives.color) assert(ids.includes(u.gives.color.species), `${u.id} 의 작물`);
    for (const item of Object.keys(u.gives.recipe?.ingredients ?? {})) assert(ids.includes(item), `${u.id} 의 재료 ${item}`);
  }
  for (const r of recipes) for (const item of Object.keys(r.ingredients)) assert(ids.includes(item), `${r.id} 의 재료 ${item}`);
  for (const id of ids) assert(start.inventory[`seed_${id}`] > 0, `새 농장에 ${id} 씨앗이 없어요`);
  for (const type of ["field", "paddy", "flower"]) assert(crops.filter((c) => c.type === type).length >= 3, `${type} 작물이 3가지보다 적어요`);
});
