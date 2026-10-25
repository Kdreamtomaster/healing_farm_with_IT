// web/farm/weather.js, web/decor/daylight.js 테스트: 날씨와 하루의 빛
import { lightAt, isRestTime, partOfDay } from "../../web/decor/daylight.js";
import { advanceCrop } from "../../web/farm/crops.js";
import { weatherAt, weatherOfDay } from "../../web/farm/weather.js";
import { assert, assertNear, test } from "./runner.js";

const DAY = 24 * 60;
const SEED = 12345;
const POTATO = { id: "potato", water: "low", growMinutes: 180 }; // 좋아하는 수분 10~50 (가운데 30)

// 비 오는 날 하나 찾기 (첫 해의 봄·여름·가을 중)
function rainyDay(seed = SEED) {
  for (let d = 0; d < 21; d++) if (weatherOfDay(d, seed).kind === "rain") return { d, ...weatherOfDay(d, seed) };
  return null;
}

test("같은 날은 언제 계산해도 같은 날씨", () => {
  for (let d = 0; d < 40; d++) assert(JSON.stringify(weatherOfDay(d, SEED)) === JSON.stringify(weatherOfDay(d, SEED)));
});

test("비는 낮에 2~6시간 내리고, 겨울에는 눈이 온다", () => {
  let rainy = 0;
  for (let d = 0; d < 28 * 4; d++) {
    const day = weatherOfDay(d, SEED);
    if (day.kind === "sunny") continue;
    rainy += 1;
    assert(day.start >= 6 * 60 && day.start <= 14 * 60, `시작 ${day.start}`);
    assert(day.end - day.start >= 120 && day.end - day.start <= 360, "길이");
    const winter = Math.floor(d / 7) % 4 === 3;
    assert(day.kind === (winter ? "snow" : "rain"), `${d}일째 ${day.kind}`);
  }
  assert(rainy > 15 && rainy < 70, `112일 중 비·눈 온 날 ${rainy}일`);
});

test("비 오기 전엔 흐리고, 비가 그치면 무지개가 뜬다", () => {
  const day = rainyDay();
  assert(day, "봄·여름·가을 21일 중 비 오는 날이 하루는 있어요");
  const at = (m) => weatherAt(day.d * DAY + m, SEED);
  assert(at(day.start - 30) === "cloudy");
  assert(at(day.start + 10) === "rain");
  if (day.end + 10 < 18 * 60) assert(at(day.end + 10) === "rainbow");
});

test("비는 마른 흙도, 너무 젖은 흙도 작물이 좋아하는 촉촉함으로 맞춰 준다", () => {
  const always = { start: 0, raining: () => true };
  const dry = advanceCrop({ progress: 0, moisture: 0 }, POTATO, "field", 60, always);
  const wet = advanceCrop({ progress: 0, moisture: 95 }, POTATO, "field", 120, always);
  assertNear(dry.moisture, 30, "마른 흙", 1e-9);
  assertNear(wet.moisture, 30, "젖은 흙", 1e-9);
});

test("비가 와도 나눠서 계산한 결과가 같다", () => {
  const raining = (m) => m >= 20 && m < 40;
  let stepwise = { progress: 0, moisture: 0 };
  for (let m = 0; m < 60; m += 0.5) stepwise = advanceCrop(stepwise, POTATO, "field", 0.5, { start: m, raining });
  const once = advanceCrop({ progress: 0, moisture: 0 }, POTATO, "field", 60, { start: 0, raining });
  assertNear(stepwise.moisture, once.moisture, "수분", 1e-6);
  assertNear(stepwise.progress, once.progress, "성장", 1e-6);
});

test("하루의 빛: 낮은 맑게, 밤은 살짝 어둡게, 저녁은 노을빛", () => {
  assert(lightAt(12 * 60).darkness === 0, "한낮");
  assert(lightAt(0).darkness > 0.3 && lightAt(0).night, "한밤");
  assert(lightAt(18 * 60 + 30).tint.startsWith("rgba(255, 140, 70"), lightAt(18 * 60 + 30).tint);
  assert(lightAt(DAY * 3 + 12 * 60).darkness === 0, "며칠이 지나도 같은 시각은 같은 빛");
  assert(partOfDay(7 * 60) === "아침" && partOfDay(21 * 60) === "밤");
  assert(isRestTime(23 * 60) && isRestTime(3 * 60) && !isRestTime(12 * 60), "쉬는 시간은 밤 10시 ~ 새벽 5시");
});
