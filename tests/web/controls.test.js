// 조작 규칙 테스트: 도구(web/farm/tools.js)와 단축키(web/ui/keys.js)
import { cycleColor, cycleSeed, seedFor, smartTask, toolTask } from "../../web/farm/tools.js";
import { commandForKey, KEYMAP, moveCursor } from "../../web/ui/keys.js";
import { assert, test } from "./runner.js";

const TOMATO = { id: "tomato", type: "field", water: "high", colors: [{ id: "red" }, { id: "yellow" }] };
const POTATO = { id: "potato", type: "field", water: "low", colors: [{ id: "gold" }, { id: "purple" }] };
const RICE = { id: "rice", type: "paddy", water: "high", colors: [{ id: "gold" }] };
const SPECIES = [TOMATO, POTATO, RICE];
const crop = (species, progress, moisture) => ({ species, plantedAt: 0, progress, moisture, color: "red" });
const field = (c = null) => ({ id: 0, x: 0, y: 0, kind: "field", crop: c });
const paddy = (c = null) => ({ id: 1, x: 1, y: 0, kind: "paddy", crop: c });
const state = (inventory = { seed_tomato: 1, seed_potato: 1, seed_rice: 1 }) => ({ inventory });

test("물뿌리개: 논이면 물대기, 빈 칸이면 이유", () => {
  assert(toolTask("water", field(crop("tomato", 0.5, 80)), state(), SPECIES, {}).kind === "water");
  assert(toolTask("water", paddy(crop("rice", 0.5, 80)), state(), SPECIES, {}).kind === "flood");
  assert(toolTask("water", field(), state(), SPECIES, {}).reason === "물을 줄 작물이 없어요");
});

test("수확 바구니: 다 자란 작물만", () => {
  assert(toolTask("harvest", field(crop("tomato", 1, 80)), state(), SPECIES, {}).kind === "harvest");
  assert(toolTask("harvest", field(crop("tomato", 0.5, 80)), state(), SPECIES, {}).reason.includes("아직"));
});

test("씨앗: 칸 종류마다 골라 둔 씨앗, 씨앗이 없으면 그 칸에 맞는 다른 작물", () => {
  const choice = { field: { speciesId: "potato", colorId: "purple" } };
  const t = toolTask("seed", field(), state(), SPECIES, choice);
  assert(t.kind === "plant" && t.speciesId === "potato" && t.colorId === "purple", JSON.stringify(t));
  const rice = toolTask("seed", paddy(), state(), SPECIES, choice);
  assert(rice.speciesId === "rice", "논에는 벼");
  const noPotato = seedFor(field(), state({ seed_tomato: 2 }), SPECIES, choice);
  assert(noPotato.speciesId === "tomato" && noPotato.colorId === "red", "감자 씨앗이 없으면 토마토 첫 색");
  assert(toolTask("seed", field(), state({}), SPECIES, choice).reason === "이 칸에 심을 씨앗이 없어요");
});

test("알맞은 일: 수확 → 심기 → 물주기 → 할 일 없음", () => {
  assert(smartTask(field(crop("tomato", 1, 10)), state(), SPECIES, {}).kind === "harvest");
  assert(smartTask(field(), state(), SPECIES, {}).kind === "plant");
  assert(smartTask(paddy(crop("rice", 0.5, 10)), state(), SPECIES, {}).kind === "flood");
  assert(smartTask(field(crop("tomato", 0.5, 70)), state(), SPECIES, {}).reason.includes("잘 자라고"));
});

test("Q/E 로 씨앗을 넘기면 그 작물의 칸 종류 자리에 기억하고, R 로 색을 바꾼다", () => {
  let { choice, speciesId } = cycleSeed({}, SPECIES, "tomato", 1);
  assert(speciesId === "potato" && choice.field.speciesId === "potato");
  ({ choice, speciesId } = cycleSeed(choice, SPECIES, speciesId, 1));
  assert(speciesId === "rice" && choice.paddy.speciesId === "rice" && choice.field.speciesId === "potato", "밭 고른 건 그대로");
  ({ speciesId } = cycleSeed(choice, SPECIES, "tomato", -1));
  assert(speciesId === "rice", "처음에서 뒤로 가면 맨 끝");
  const colored = cycleColor(choice, SPECIES, "potato");
  assert(colored.field.colorId === "purple" && cycleColor(colored, SPECIES, "potato").field.colorId === "gold", "색은 돌아가며");
});

const key = (k, extra = {}) => commandForKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: "BODY" }, ...extra });

test("단축키: 방향키·WASD·숫자·Space·Ctrl+S", () => {
  assert(key("ArrowUp") === "up" && key("w") === "up" && key("W") === "up");
  assert(key("2") === "tool:water" && key(" ") === "use" && key("z") === "bulk:thirsty");
  assert(key("s", { ctrlKey: true }) === "save" && key("s") === "down");
  assert(key("?") === "help" && key("Escape") === "cancel");
});

test("단축키: 글자를 쓰는 중이거나 버튼에서 Space 를 누르면 끼어들지 않는다", () => {
  assert(key("w", { target: { tagName: "INPUT" } }) === null, "입력 칸");
  assert(key(" ", { target: { tagName: "BUTTON" } }) === null, "버튼은 버튼이 알아서");
  assert(key("2", { target: { tagName: "BUTTON" } }) === "tool:water", "숫자는 버튼 위에서도");
});

test("단축키 표에 같은 키가 두 번 들어 있지 않다", () => {
  const all = KEYMAP.flatMap((e) => e.keys);
  assert(new Set(all).size === all.length, "겹치는 키");
});

test("키보드 커서: 처음엔 왼쪽 위, 끝에서는 멈춤", () => {
  const plots = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) plots.push({ id: y * 3 + x, x, y });
  assert(moveCursor(plots, null, 1, 0) === 0, "처음");
  assert(moveCursor(plots, 0, 1, 0) === 1 && moveCursor(plots, 1, 0, 1) === 4);
  assert(moveCursor(plots, 2, 1, 0) === 2 && moveCursor(plots, 0, 0, -1) === 0, "끝에서 멈춤");
});
