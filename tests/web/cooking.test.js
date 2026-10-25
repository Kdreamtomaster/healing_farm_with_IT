// web/friends/cooking.js 테스트: 요리하기와 나눠 먹기
import { cook, finishCooking, missingIngredients, share, startCooking } from "../../web/friends/cooking.js";
import { assert, test } from "./runner.js";

const SALAD = { id: "potato_salad", name: { ko: "감자 샐러드" }, ingredients: { potato: 2, tomato: 1 } };
const SOUP = { id: "potato_soup", name: { ko: "감자 수프" }, ingredients: { potato: 3 } };

test("재료가 있으면 요리해서 창고에 넣는다", () => {
  const state = { inventory: { potato: 3, tomato: 1 } };
  const result = cook(state, SALAD);
  assert(result.ok && result.message === "감자 샐러드를 만들었어요", result.message);
  assert(state.inventory.potato === 1 && state.inventory.tomato === 0 && state.inventory.dish_potato_salad === 1);
});

test("재료가 모자라면 무엇이 모자란지 알려 주고, 아무것도 쓰지 않는다", () => {
  const state = { inventory: { potato: 2 } };
  const missing = missingIngredients(state, SOUP);
  assert(missing.length === 1 && missing[0].item === "potato" && missing[0].have === 2);
  assert(!cook(state, SOUP).ok && state.inventory.potato === 2, "재료는 그대로");
});

test("요리를 시작하면 재료부터 꺼내 둬서, 끓는 동안 같은 재료를 또 쓰지 않는다", () => {
  const state = { inventory: { potato: 3 } };
  assert(startCooking(state, SOUP).ok);
  assert(!startCooking(state, SOUP).ok, "두 번째는 재료가 없어요");
  assert(!state.inventory.dish_potato_soup, "아직 끓는 중");
  finishCooking(state, SOUP);
  assert(state.inventory.dish_potato_soup === 1, "다 끓으면 완성");
});

test("나눠 먹으면 요리가 하나 줄고, 없으면 나눌 수 없다", () => {
  const state = { inventory: { dish_potato_soup: 1 } };
  const result = share(state, SOUP);
  assert(result.ok && result.message === "다 같이 감자 수프를 맛있게 먹었어요!", result.message);
  assert(state.inventory.dish_potato_soup === 0);
  assert(!share(state, SOUP).ok);
});
