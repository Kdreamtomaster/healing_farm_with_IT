// web/decor/ 규칙 테스트: 계절, 테두리 색, 작물 색
import { borderColor, cropColor, mixColors } from "../../web/decor/palette.js";
import { applyBorderToKind, setBorder } from "../../web/decor/plots-style.js";
import { formatCalendar, SEASON_DAYS, seasonOf } from "../../web/decor/season.js";
import { plant } from "../../web/farm/harvest.js";
import { assert, test } from "./runner.js";

const DAY = 24 * 60;
const PALETTE = {
  borders: [{ id: "oak", color: "#6b4a2b" }, { id: "rose", color: "#9a4a5a" }],
  seasons: { spring: { name: "봄" }, summer: { name: "여름" }, autumn: { name: "가을" }, winter: { name: "겨울" } },
};
const TULIP = {
  id: "tulip", name: { ko: "튤립" }, type: "flower", water: "mid", growMinutes: 120, yield: 1, seeds: 2,
  colors: [{ id: "pink", name: "분홍", hex: "#e86f9a" }, { id: "white", name: "하양", hex: "#f2f0e8" }],
};

test("계절은 게임 속 7일마다 바뀌고 28일이 지나면 한 해가 지난다", () => {
  assert(seasonOf(0).id === "spring" && seasonOf(0).day === 1 && seasonOf(0).year === 1);
  assert(seasonOf(SEASON_DAYS * DAY - 1).id === "spring", "7일째 끝까지 봄");
  assert(seasonOf(SEASON_DAYS * DAY).id === "summer", "8일째는 여름");
  assert(seasonOf(3 * SEASON_DAYS * DAY).id === "winter");
  const nextYear = seasonOf(4 * SEASON_DAYS * DAY);
  assert(nextYear.id === "spring" && nextYear.year === 2, "다시 봄, 2년차");
});

test("달력 표시", () => {
  const text = formatCalendar(SEASON_DAYS * DAY + 2 * DAY + 7 * 60 + 30, PALETTE);
  assert(text === "1년차 여름 3일째 07:30", text);
});

test("테두리 색 바꾸기와 같은 종류 칸 모두 바꾸기", () => {
  const state = { plots: [{ kind: "field", border: "oak" }, { kind: "field", border: "oak" }, { kind: "paddy", border: "oak" }] };
  assert(setBorder(state.plots[0], "rose"), "바뀌어야 해요");
  assert(!setBorder(state.plots[0], "rose"), "같은 색이면 바뀐 게 없어요");
  assert(applyBorderToKind(state, "field", "rose") === 1, "남은 밭 1칸만");
  assert(state.plots[2].border === "oak", "논은 그대로");
});

test("없는 색 id 는 첫 번째 색으로", () => {
  assert(borderColor(PALETTE, "nope") === "#6b4a2b");
  assert(cropColor(TULIP, "nope").id === "pink");
  assert(mixColors("#000000", "#ffffff", 0.5) === "rgb(128,128,128)");
});

test("색을 골라 심고, 없는 색은 심지 않는다", () => {
  const state = { meta: { gameMinutes: 0 }, inventory: { seed_tulip: 2 } };
  const plot = { id: 0, kind: "flowerbed", crop: null };
  const result = plant(state, plot, TULIP, "white");
  assert(result.ok && plot.crop.color === "white", "하양 튤립");
  assert(result.message === "하양 튤립을 심었어요", result.message);
  const other = { id: 1, kind: "flowerbed", crop: null };
  assert(!plant(state, other, TULIP, "black").ok, "없는 색");
  assert(state.inventory.seed_tulip === 1, "실패하면 씨앗이 줄지 않아요");
});
