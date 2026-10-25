// 비운 시간 계산과 오프라인 시뮬레이션입니다.
// 플레이 중과 똑같은 규칙(farm/)에 시간만 넣어 돌리므로, 접속해 있든 아니든 작물은 같은 방식으로 자랍니다.
import { advanceFarm } from "../farm/crops.js";
import { realMsToGameMinutes } from "./clock.js";
import { friendsHelp } from "./helpers.js";

export const OFFLINE_CAP_MS = 5 * 24 * 60 * 60 * 1000; // 현실 시간 기준 최대 5일
export const CHUNK_MINUTES = 10; // 친구들은 게임 시간 10분마다 농장을 둘러봐요

// 비운 시간을 얼마나 처리할지 정합니다.
export function planOffline(fromMs, toMs, timeScale) {
  const realMs = toMs - fromMs;
  const clockWentBack = realMs < 0; // 컴퓨터 시계를 뒤로 돌린 경우
  const capped = realMs > OFFLINE_CAP_MS;
  const usedMs = clockWentBack ? 0 : Math.min(realMs, OFFLINE_CAP_MS);
  return { realMs, usedMs, clockWentBack, capped, gameMinutes: realMsToGameMinutes(usedMs, timeScale) };
}

export function newReport() {
  return { minutes: 0, friends: {} };
}

// minutes(게임 분)를 10분 조각으로 나눠, 조각마다 작물이 자라고 친구들이 돌봅니다.
// report 에 친구들이 한 일이 쌓입니다. 여러 번 나눠 불러도 같은 report 를 넘기면 이어서 쌓여요.
export function simulateOffline(state, speciesById, friends, minutes, report = newReport()) {
  let left = minutes;
  while (left > 0) {
    const dt = Math.min(CHUNK_MINUTES, left);
    left -= dt;
    advanceFarm(state, speciesById, dt);
    friendsHelp(state, speciesById, friends, report);
    report.minutes += dt;
  }
  return report;
}
