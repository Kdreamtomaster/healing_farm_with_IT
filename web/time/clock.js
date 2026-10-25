// 게임 시계: 게임 시간은 현실 시간 × 배율(timeScale)로 흐릅니다.
// 예) 배율 30 이면 현실 1분 = 게임 30분

export const MINUTES_PER_DAY = 24 * 60;

// 설정 화면에서 고를 수 있는 배율
export const TIME_SCALES = [1, 10, 30, 60];

export function realMsToGameMinutes(ms, timeScale) {
  return (ms / 60000) * timeScale;
}

// 게임 분 → 그날의 "07:30"
export function formatClock(gameMinutes) {
  const minuteOfDay = Math.floor(gameMinutes % MINUTES_PER_DAY);
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// 게임 분 → "3일째 07:30" (계절이 들어간 달력은 decor/season.js)
export function formatGameTime(gameMinutes) {
  return `${Math.floor(gameMinutes / MINUTES_PER_DAY) + 1}일째 ${formatClock(gameMinutes)}`;
}
