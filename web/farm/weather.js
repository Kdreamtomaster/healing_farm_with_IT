// 날씨: 맑음, 비(겨울엔 눈), 비 갠 뒤 무지개
//
// 힐링 게임이라 날씨는 나쁜 일을 만들지 않아요. 가뭄이나 폭풍은 없고,
// 비는 작물마다 좋아하는 촉촉함으로 흙을 맞춰 주는 고마운 손님이에요.
//
// 날씨는 "날짜 + 농장마다 다른 씨앗(seed)"으로 정해져요. 같은 날은 언제 다시 계산해도 같은 날씨라서
// 플레이 중이든, 비운 시간을 나중에 계산하든 똑같이 비가 내려요.
import { seasonOf } from "../decor/season.js";
import { MINUTES_PER_DAY } from "../time/clock.js";

// 계절마다 비(눈)가 오는 날의 확률
const RAIN_CHANCE = { spring: 0.35, summer: 0.4, autumn: 0.25, winter: 0.3 };
const RAINBOW_MINUTES = 90; // 비 갠 뒤 무지개가 떠 있는 시간
const RAINBOW_UNTIL = 18 * 60; // 해가 지면 무지개도 사라져요

// 숫자 몇 개를 섞어 0~1 사이의 "늘 같은 무작위" 수를 만들어요
function hash(...numbers) {
  let h = 2166136261;
  for (const n of numbers) {
    h = Math.imul(h ^ (n | 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

// 농장마다 날씨가 다르도록, 농장을 처음 만든 시각을 씨앗으로 써요
export function farmSeed(state) {
  return Math.floor(state.meta.createdAt ?? 0) % 2147483647;
}

const dayCache = new Map();

// 그날의 날씨: { kind: "sunny" } 또는 { kind: "rain" | "snow", start, end } (그날 0시부터 몇 분째)
export function weatherOfDay(dayIndex, seed) {
  const key = `${seed}:${dayIndex}`;
  if (dayCache.has(key)) return dayCache.get(key);
  const season = seasonOf(dayIndex * MINUTES_PER_DAY).id;
  let day = { kind: "sunny" };
  if (hash(seed, dayIndex, 1) < RAIN_CHANCE[season]) {
    const start = 6 * 60 + Math.floor(hash(seed, dayIndex, 2) * 8 * 60); // 06:00 ~ 14:00 사이에 시작
    const length = 2 * 60 + Math.floor(hash(seed, dayIndex, 3) * 4 * 60); // 2 ~ 6시간
    day = { kind: season === "winter" ? "snow" : "rain", start, end: start + length };
  }
  if (dayCache.size > 512) dayCache.clear();
  dayCache.set(key, day);
  return day;
}

// 지금 날씨: "sunny" 맑음 / "cloudy" 비 오기 전 흐림 / "rain" 비 / "snow" 눈 / "rainbow" 비 갠 뒤 무지개
export function weatherAt(gameMinutes, seed) {
  const dayIndex = Math.floor(gameMinutes / MINUTES_PER_DAY);
  const minute = gameMinutes - dayIndex * MINUTES_PER_DAY;
  const day = weatherOfDay(dayIndex, seed);
  if (day.kind === "sunny") return "sunny";
  if (minute >= day.start && minute < day.end) return day.kind;
  if (minute < day.start) return minute >= day.start - 120 ? "cloudy" : "sunny";
  if (day.kind === "rain" && minute < day.end + RAINBOW_MINUTES && minute < RAINBOW_UNTIL) return "rainbow";
  return "sunny";
}

export function isRaining(gameMinutes, seed) {
  return weatherAt(gameMinutes, seed) === "rain";
}

export const WEATHER_ICONS = { sunny: "☀️", cloudy: "☁️", rain: "🌧️", snow: "❄️", rainbow: "🌈" };
