// web/time/ 규칙 테스트: 비운 시간 계산, 친구들의 관리, 안내 문장
import { formatGameTime } from "../../web/time/clock.js";
import { OFFLINE_CAP_MS, planOffline, simulateOffline } from "../../web/time/offline.js";
import { formatDuration, reportToLog, summarize } from "../../web/time/summary.js";
import { assert, assertNear, test } from "./runner.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TOMATO = { id: "tomato", name: { ko: "토마토" }, type: "field", water: "high", growMinutes: 240, yield: 3, seeds: 2, colors: [{ id: "red", name: "빨강", hex: "#f00" }] };
const RICE = { id: "rice", name: { ko: "벼" }, type: "paddy", water: "high", growMinutes: 360, yield: 5, seeds: 2, colors: [{ id: "gold", name: "황금", hex: "#ff0" }] };
const speciesById = new Map([TOMATO, RICE].map((s) => [s.id, s]));
const FRIENDS = [
  { id: "haneul", name: "하늘", plots: ["field"] },
  { id: "bada", name: "바다", plots: ["paddy"] },
];

function farm() {
  const crop = (species) => ({ species, plantedAt: 0, progress: 0, moisture: 40, color: species === "rice" ? "gold" : "red" });
  return {
    meta: { gameMinutes: 0, playSeconds: 0, timeScale: 30 },
    plots: [
      { id: 0, x: 0, y: 0, kind: "field", crop: crop("tomato") },
      { id: 1, x: 0, y: 1, kind: "paddy", crop: crop("rice") },
      { id: 2, x: 1, y: 0, kind: "field", crop: null },
    ],
    inventory: {},
  };
}

test("비운 시간이 없으면 계산할 것도 없다", () => {
  const plan = planOffline(1000, 1000, 30);
  assert(plan.gameMinutes === 0 && !plan.capped && !plan.clockWentBack);
});

test("시계가 거꾸로 가면 0으로 처리하고 표시한다", () => {
  const plan = planOffline(10 * HOUR, 9 * HOUR, 30);
  assert(plan.clockWentBack, "표시되어야 해요");
  assert(plan.gameMinutes === 0, "시간은 0");
});

test("5일이 넘으면 5일로 자른다", () => {
  const plan = planOffline(0, 30 * DAY, 1);
  assert(plan.capped, "잘렸다고 표시");
  assert(plan.usedMs === OFFLINE_CAP_MS, "5일만 사용");
  assertNear(plan.gameMinutes, 5 * 24 * 60, "게임 시간");
});

test("게임 시간은 현실 시간 × 배율", () => {
  assertNear(planOffline(0, HOUR, 1).gameMinutes, 60, "×1");
  assertNear(planOffline(0, HOUR, 30).gameMinutes, 1800, "×30");
});

test("친구들이 물을 주고 다 자란 작물을 수확해 창고에 넣는다", () => {
  const state = farm();
  const report = simulateOffline(state, speciesById, FRIENDS, 8 * 60); // 게임 8시간
  assert(state.plots[0].crop === null && state.plots[1].crop === null, "수확되어 칸이 비어야 해요");
  assert(state.inventory.tomato === 3 && state.inventory.rice === 5, "창고에 수확물");
  assert(state.inventory.seed_tomato === 2, "씨앗도 창고에");
  assert(report.friends.haneul.water > 0 && report.friends.bada.water > 0, "물을 줬어야 해요");
  assert(report.friends.haneul.harvest.tomato === 3, "하늘이가 토마토 수확");
});

test("돌봐 줄 친구가 없어도 작물은 다 자란 채로 기다린다", () => {
  const state = farm();
  simulateOffline(state, speciesById, [], 5 * 24 * 60);
  assert(state.plots[0].crop.progress === 1, "다 자라 있어야 해요");
  assert(!state.inventory.tomato, "수확은 하지 않아요");
});

test("나눠서 처리해도 한 번에 처리한 것과 같다", () => {
  const a = farm();
  const b = farm();
  const reportA = simulateOffline(a, speciesById, FRIENDS, 3000);
  let reportB;
  for (let i = 0; i < 3; i++) reportB = simulateOffline(b, speciesById, FRIENDS, 1000, reportB);
  assert(JSON.stringify(a) === JSON.stringify(b), "농장 상태가 달라요");
  assert(JSON.stringify(reportA) === JSON.stringify(reportB), "보고가 달라요");
});

test("안내 문장: 조사와 시간 표시", () => {
  const plan = planOffline(0, 5 * HOUR + 12 * 60000, 30);
  const report = { minutes: 0, friends: { haneul: { water: 3, harvest: { tomato: 4 } }, bada: { water: 2, harvest: {} } } };
  const lines = summarize(plan, report, speciesById, FRIENDS);
  assert(lines[0] === "5시간 12분 동안 농장을 비웠어요.", lines[0]);
  assert(lines.includes("하늘이가 물을 3번 주고 토마토 4개를 수확해 창고에 넣어 뒀어요."), lines.join(" / "));
  assert(lines.includes("바다가 물을 2번 줬어요."), lines.join(" / "));
});

test("안내 문장: 5일 초과와 시계 역행", () => {
  const capped = summarize(planOffline(0, 9 * DAY, 30), { friends: {} }, speciesById, FRIENDS);
  assert(capped.some((l) => l.includes("최근 5일")), capped.join(" / "));
  const back = summarize(planOffline(10, 0, 30), { friends: {} }, speciesById, FRIENDS);
  assert(back[0].includes("거꾸로"), back[0]);
});

test("작업 기록은 친구별로 묶어서 남긴다", () => {
  const entries = reportToLog({ friends: { haneul: { water: 3, harvest: { tomato: 4 } } } }, 100, FRIENDS);
  assert(entries.length === 2, "물주기 1줄 + 수확 1줄");
  assert(entries[0].actor === "haneul", "화면 이름 대신 id 로 (이름이 바뀌어도 이어지게)");
  assert(JSON.parse(entries[0].detail).count === 3 && JSON.parse(entries[1].detail).species === "tomato", entries[1].detail);
});

test("시간 표시", () => {
  assert(formatDuration(0) === "0분");
  assert(formatDuration(DAY + 3 * HOUR) === "1일 3시간");
  assert(formatGameTime(24 * 60 + 90) === "2일째 01:30", formatGameTime(24 * 60 + 90));
});
