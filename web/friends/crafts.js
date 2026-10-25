// 꽃 공방 규칙입니다. 수확한 꽃으로 꾸미기 물건이나 선물을 만들어요 (data/crafts.json).
//   꾸미기(decor): 창고에 있으면 마당의 정해진 자리(spot)에 저절로 놓여요
//   선물(gift): 친구에게 주면 창고에서 빠지고, 친구가 좋아하는 꽃이 들어 있으면 ★
// 공방 물건은 창고에 craft_물건이름 으로 들어가요. 모든 함수는 { ok, message } 를 돌려줍니다.
import { addItem, itemCount, takeItem } from "../state.js";
import { josa } from "../text.js";

export const craftId = (id) => `craft_${id}`;

// 모자란 꽃 → [{ item, need, have }]
export function missingMaterials(state, craft) {
  return Object.entries(craft.materials)
    .filter(([item, need]) => itemCount(state, item) < need)
    .map(([item, need]) => ({ item, need, have: itemCount(state, item) }));
}

// 요리처럼 두 단계예요: 꽃을 꺼내 작업대에 올리고(startCraft) → 다 만들면 창고로(finishCraft)
export function startCraft(state, craft) {
  const name = craft.name.ko;
  if (missingMaterials(state, craft).length) return { ok: false, message: `${name}에 쓸 꽃이 모자라요` };
  for (const [item, need] of Object.entries(craft.materials)) takeItem(state, item, need);
  return { ok: true, message: `${josa(name, "을", "를")} 만들기 시작했어요` };
}

export function finishCraft(state, craft) {
  addItem(state, craftId(craft.id));
  const where = craft.kind === "decor" ? " 마당에 놓아 두었어요" : " 창고에 넣어 두었어요";
  return { ok: true, message: `${josa(craft.name.ko, "을", "를")} 만들어${where}` };
}

// 친구가 이 선물을 특히 좋아할까? (선물에 친구가 제일 좋아하는 꽃이 들어 있으면)
export const lovesGift = (craft, friend) => Boolean(friend.favoriteFlower) && Object.hasOwn(craft.materials, friend.favoriteFlower);

export function giveGift(state, craft, friend) {
  const name = craft.name.ko;
  const to = josa(friend.name, "이에게", "에게"); // 하늘이에게, 바다에게
  if (craft.kind !== "gift") return { ok: false, message: `${josa(name, "은", "는")} 선물용이 아니에요` };
  if (!takeItem(state, craftId(craft.id))) return { ok: false, message: `${josa(name, "이", "가")} 없어요` };
  const loved = lovesGift(craft, friend);
  const reply = loved ? `제일 좋아하는 꽃이래요 ★` : `고마워해요 ♥`;
  return { ok: true, loved, message: `${to} ${josa(name, "을", "를")} 선물했어요. ${reply}` };
}

// 마당에 놓일 꾸미기 물건들 (창고에 하나라도 있으면)
export function decorOnDisplay(state, crafts) {
  return crafts.filter((c) => c.kind === "decor" && itemCount(state, craftId(c.id)) > 0);
}
