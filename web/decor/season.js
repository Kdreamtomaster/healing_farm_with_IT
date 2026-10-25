// 게임 속 달력과 계절
// 한 계절은 게임 속 7일, 한 해는 28일입니다. (배율 ×30 이면 한 계절이 현실 약 5시간 36분)
import { formatClock, MINUTES_PER_DAY } from "../time/clock.js";

export const SEASON_ORDER = ["spring", "summer", "autumn", "winter"];
export const SEASON_DAYS = 7;

export function seasonOf(gameMinutes) {
  const dayIndex = Math.floor(gameMinutes / MINUTES_PER_DAY);
  return {
    id: SEASON_ORDER[Math.floor(dayIndex / SEASON_DAYS) % SEASON_ORDER.length],
    year: Math.floor(dayIndex / (SEASON_DAYS * SEASON_ORDER.length)) + 1,
    day: (dayIndex % SEASON_DAYS) + 1,
  };
}

// "1년차 봄 3일째 07:30"
export function formatCalendar(gameMinutes, palette) {
  const { id, year, day } = seasonOf(gameMinutes);
  return `${year}년차 ${palette.seasons[id].name} ${day}일째 ${formatClock(gameMinutes)}`;
}
