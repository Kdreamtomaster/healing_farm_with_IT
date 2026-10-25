// 하루의 빛: 새벽 → 낮 → 저녁노을 → 밤
// 화면 위에 살짝 덮는 빛깔만 바뀌어요. 밤에도 작물은 똑같이 자라고, 할 수 있는 일도 그대로예요.
import { MINUTES_PER_DAY } from "../time/clock.js";

// [그날 몇 분째, 빨강, 초록, 파랑, 진하기] — 사이 시간은 부드럽게 섞어요
const NIGHT = [36, 44, 96, 0.34];
const DAWN = [255, 170, 150, 0.14];
const DAY = [255, 255, 255, 0];
const DUSK = [255, 140, 70, 0.18];
const KEYS = [
  [0, NIGHT],
  [5 * 60, NIGHT],
  [6 * 60 + 30, DAWN],
  [8 * 60, DAY],
  [17 * 60, DAY],
  [18 * 60 + 30, DUSK],
  [20 * 60, NIGHT],
  [24 * 60, NIGHT],
];

export function lightAt(gameMinutes) {
  const minute = ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let i = 0;
  while (KEYS[i + 1][0] <= minute) i += 1;
  const [m0, c0] = KEYS[i];
  const [m1, c1] = KEYS[i + 1];
  const t = (minute - m0) / (m1 - m0);
  const [r, g, b, a] = c0.map((v, k) => v + (c1[k] - v) * t);
  return { tint: `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(3)})`, darkness: a, night: isNight(minute) };
}

function isNight(minute) {
  return minute < 5 * 60 + 30 || minute >= 19 * 60 + 30;
}

// 상태 줄에 보여 줄 때의 이름
export function partOfDay(gameMinutes) {
  const minute = ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minute < 5 * 60) return "밤";
  if (minute < 8 * 60) return "아침";
  if (minute < 17 * 60) return "낮";
  if (minute < 20 * 60) return "저녁";
  return "밤";
}

// 다들 쉬는 시간 (멍때리기 모드의 농부들도 이때는 쉬어요)
export function isRestTime(gameMinutes) {
  const minute = ((gameMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return minute >= 22 * 60 || minute < 5 * 60;
}
