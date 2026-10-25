// 요리하기와 나눠 먹기 규칙입니다.
// 요리는 창고의 작물을 써서 만들고(dish_요리이름 으로 창고에 들어가요), 나눠 먹으면 창고에서 빠져요.
// 모든 함수는 { ok, message } 를 돌려줍니다.
import { addItem, addStat, itemCount, takeItem } from "../state.js";
import { josa } from "../text.js";

export const dishId = (recipeId) => `dish_${recipeId}`;

// 재료가 모자라면 무엇이 몇 개 모자란지 알려 줘요 → [{ item, need, have }]
export function missingIngredients(state, recipe) {
  return Object.entries(recipe.ingredients)
    .filter(([item, need]) => itemCount(state, item) < need)
    .map(([item, need]) => ({ item, need, have: itemCount(state, item) }));
}

// 요리는 두 단계예요: 재료를 꺼내 화덕에 올리고(startCooking) → 다 끓으면 완성(finishCooking)
// 재료를 먼저 꺼내 두면, 끓는 동안 같은 재료로 다른 요리를 또 시작하지 않아요.
export function startCooking(state, recipe) {
  const name = recipe.name.ko;
  if (missingIngredients(state, recipe).length) return { ok: false, message: `${name} 재료가 모자라요` };
  for (const [item, need] of Object.entries(recipe.ingredients)) takeItem(state, item, need);
  return { ok: true, message: `${josa(name, "을", "를")} 만들기 시작했어요` };
}

export function finishCooking(state, recipe) {
  addItem(state, dishId(recipe.id));
  addStat(state, "cooked");
  return { ok: true, message: `${josa(recipe.name.ko, "을", "를")} 만들었어요` };
}

// 기다림 없이 바로 요리하기 (두 단계를 한 번에)
export function cook(state, recipe) {
  const started = startCooking(state, recipe);
  return started.ok ? finishCooking(state, recipe) : started;
}

// 이 요리를 제일 좋아하는 친구들 (나눠 먹을 때 머리 위에 ★)
export function fansOf(recipe, friends) {
  return friends.filter((friend) => friend.favoriteDish === recipe.id);
}

// 나눠 먹은 뒤의 한마디. 좋아하는 요리였다면 그 친구 이야기를 덧붙여요.
export function shareMessage(recipe, friends) {
  const fans = fansOf(recipe, friends).map((f) => f.name);
  const base = `다 같이 ${josa(recipe.name.ko, "을", "를")} 맛있게 먹었어요!`;
  if (!fans.length) return base;
  // 하늘·봄이가 → 조사는 마지막 이름에만 붙여요
  const who = [...fans.slice(0, -1), josa(fans[fans.length - 1], "이가", "가")].join("·");
  return `${base} ${who} 제일 좋아하는 요리래요 ★`;
}

export function share(state, recipe) {
  const name = recipe.name.ko;
  if (!takeItem(state, dishId(recipe.id))) return { ok: false, message: `${josa(name, "이", "가")} 없어요` };
  return { ok: true, message: `다 같이 ${josa(name, "을", "를")} 맛있게 먹었어요!` };
}
