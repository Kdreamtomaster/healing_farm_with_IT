// 비운 동안 있었던 일을 로딩 화면의 안내 문장과 작업 기록으로 바꿉니다.
import { josa } from "../text.js";

// 밀리초 → "1일 3시간 5분"
export function formatDuration(ms) {
  const total = Math.floor(ms / 60000);
  const parts = [];
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  if (days) parts.push(`${days}일`);
  if (hours) parts.push(`${hours}시간`);
  if (minutes || parts.length === 0) parts.push(`${minutes}분`);
  return parts.join(" ");
}

export function summarize(plan, report, speciesById, friends) {
  if (plan.clockWentBack) {
    return ["컴퓨터 시계가 거꾸로 돌아간 것 같아요. 그동안의 시간은 계산하지 않았어요."];
  }
  const lines = [`${formatDuration(plan.realMs)} 동안 농장을 비웠어요.`];
  if (plan.capped) lines.push("너무 오래 비워서 친구들은 최근 5일 동안의 일만 기억하고 있대요.");
  // "분", "시간", "일" 은 모두 받침이 있어 "이" 가 붙어요
  lines.push(`게임 속에서는 ${formatDuration(plan.gameMinutes * 60000)}이 흘렀어요.`);

  if (report.rainMinutes >= 60) lines.push("그동안 비가 내려서 작물들이 촉촉하게 물을 마셨어요.");
  let anyone = false;
  for (const friend of friends) {
    const done = report.friends[friend.id];
    const harvested = Object.entries(done?.harvest ?? {}).map(([id, n]) => `${speciesById.get(id).name.ko} ${n}개`);
    if (!done || (done.water === 0 && harvested.length === 0)) continue;
    anyone = true;
    const who = josa(friend.name, "이가", "가"); // 하늘이가, 바다가
    const crops = `${harvested.join(", ")}를 수확해 창고에 넣어 뒀어요`;
    if (done.water && harvested.length) lines.push(`${who} 물을 ${done.water}번 주고 ${crops}.`);
    else if (done.water) lines.push(`${who} 물을 ${done.water}번 줬어요.`);
    else lines.push(`${who} ${crops}.`);
  }
  if (!anyone) lines.push("친구들이 농장을 둘러봤지만 따로 할 일은 없었대요.");
  return lines;
}

// 친구들이 한 일을 작업 기록(task_log) 몇 줄로 묶습니다. 물 한 번마다 적으면 너무 많아지니까요.
export function reportToLog(report, at, friends) {
  const entries = [];
  for (const friend of friends) {
    const done = report.friends[friend.id];
    if (!done) continue;
    if (done.water) entries.push({ at, actor: friend.name, action: "water", detail: String(done.water) });
    for (const [id, n] of Object.entries(done.harvest)) {
      entries.push({ at, actor: friend.name, action: "harvest", detail: `${id}:${n}` });
    }
  }
  return entries;
}
