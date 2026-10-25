// web/friends/crafts.js 테스트: 꽃 공방(꾸미기·선물 만들기)과 선물하기
import { decorOnDisplay, finishCraft, giveGift, lovesGift, missingMaterials, startCraft } from "../../web/friends/crafts.js";
import { assert, test } from "./runner.js";

const BOUQUET = { id: "tulip_bouquet", name: { ko: "튤립 꽃다발" }, kind: "gift", materials: { tulip: 3 } };
const BASKET = { id: "flower_basket", name: { ko: "들꽃 바구니" }, kind: "gift", materials: { tulip: 1, cosmos: 1, lavender: 1 } };
const POT = { id: "tulip_pot", name: { ko: "튤립 화분" }, kind: "decor", spot: "potLeft", materials: { tulip: 2 } };
const HANEUL = { id: "haneul", name: "하늘", favoriteFlower: "cosmos" };
const BOMI = { id: "bomi", name: "봄이", favoriteFlower: "tulip" };
const BADA = { id: "bada", name: "바다" };

test("꽃이 있으면 꺼내 두고 만들기 시작, 다 만들면 창고에 craft_ 로 들어가요", () => {
  const state = { inventory: { tulip: 4 } };
  assert(startCraft(state, BOUQUET).ok && state.inventory.tulip === 1);
  assert(!startCraft(state, BOUQUET).ok, "두 번째는 꽃이 모자라요");
  assert(finishCraft(state, BOUQUET).message.includes("창고에"));
  assert(state.inventory.craft_tulip_bouquet === 1);
});

test("꽃이 모자라면 무엇이 모자란지 알려 주고, 아무것도 쓰지 않아요", () => {
  const state = { inventory: { tulip: 1, cosmos: 1 } };
  const missing = missingMaterials(state, BASKET);
  assert(missing.length === 1 && missing[0].item === "lavender", JSON.stringify(missing));
  assert(!startCraft(state, BASKET).ok && state.inventory.tulip === 1);
});

test("꾸미기 물건은 만들면 마당에 놓여요", () => {
  const state = { inventory: { tulip: 2 } };
  assert(decorOnDisplay(state, [BOUQUET, POT]).length === 0);
  startCraft(state, POT);
  assert(finishCraft(state, POT).message.includes("마당에"));
  const shown = decorOnDisplay(state, [BOUQUET, POT]);
  assert(shown.length === 1 && shown[0].id === "tulip_pot");
});

test("선물: 좋아하는 꽃이 들어 있으면 ★, 아니면 ♥. 준 선물은 창고에서 빠져요", () => {
  assert(lovesGift(BOUQUET, BOMI) && !lovesGift(BOUQUET, HANEUL) && !lovesGift(BOUQUET, BADA));
  assert(lovesGift(BASKET, HANEUL) && lovesGift(BASKET, BOMI), "여러 꽃이 든 바구니");
  const state = { inventory: { craft_tulip_bouquet: 2 } };
  const loved = giveGift(state, BOUQUET, BOMI);
  assert(loved.ok && loved.loved && loved.message === "봄이에게 튤립 꽃다발을 선물했어요. 제일 좋아하는 꽃이래요 ★", loved.message);
  const thanks = giveGift(state, BOUQUET, HANEUL);
  assert(thanks.ok && !thanks.loved && thanks.message.startsWith("하늘이에게"), thanks.message);
  assert(state.inventory.craft_tulip_bouquet === 0);
  assert(!giveGift(state, BOUQUET, BOMI).ok, "다 줬으면 없어요");
});

test("꾸미기 물건은 선물로 줄 수 없어요", () => {
  const state = { inventory: { craft_tulip_pot: 1 } };
  assert(!giveGift(state, POT, BOMI).ok && state.inventory.craft_tulip_pot === 1);
});

test("게임 데이터: 공방 재료는 모두 있는 작물이고, 꾸미기 자리와 그림이 있어요", async () => {
  const get = (path) => fetch(`../../${path}`).then((r) => r.json());
  const [{ crafts }, { crops }, { friends }, manifest] = await Promise.all([get("data/crafts.json"), get("data/crops.json"), get("data/friends.json"), get("assets/manifest.json")]);
  const ids = new Set(crops.map((c) => c.id));
  assert(crafts.map((c) => c.id).join() === manifest.crafts.join(), "manifest 의 공방 그림 목록이 crafts.json 과 달라요");
  for (const craft of crafts) {
    assert(["gift", "decor"].includes(craft.kind), craft.id);
    for (const item of Object.keys(craft.materials)) assert(ids.has(item), `${craft.id} 의 재료 ${item}`);
    if (craft.kind === "decor") assert(["door", "potLeft", "potRight", "lantern"].includes(craft.spot), `${craft.id} 의 자리 ${craft.spot}`);
  }
  for (const friend of friends) {
    assert(ids.has(friend.favoriteFlower), `${friend.id} 의 좋아하는 꽃`);
    assert(crafts.some((c) => c.kind === "gift" && lovesGift(c, friend)), `${friend.name}이 ★ 할 선물이 하나는 있어요`);
  }
});
