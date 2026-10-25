// 스마트팜 실행기: DAG 를 블록 상태 기계로 한 걸음씩 실행해요. (Airflow 의 Scheduler + Executor 를 아주 작게)
//
// 블록 상태
//   waiting 대기 → (앞 작업이 끝나면) 실행 → success 성공
//                                        ├→ sensing 기다리는 중 (센서: 30분마다 다시 확인)
//                                        ├→ up_for_retry 다시 시도 대기 (retryDelay 뒤)
//                                        └→ failed 실패 → 뒤 블록은 upstream_failed 앞 단계 실패
//   skipped 건너뜀: 분기 블록이 건너뛰라고 했거나, 앞 작업이 건너뛰어져서
// 실행 조건(trigger): all_success(기본, 앞 작업이 모두 성공) / none_failed(실패만 없으면, 건너뜀도 괜찮아)
//
// 시간은 게임 시각(분)을 인자로 받아요. 그래서 1초 tick 과 비운 시간 계산(10분 조각)이 같은 함수를 써요.
// 실패해도 작물에게 나쁜 일은 없어요. 멈춘 자리만 알려 줘요 (힐링 원칙).
import { itemCount, takeItem } from "../state.js";
import { BLOCKS, POKE_MINUTES, SENSOR_TIMEOUT } from "./blocks.js";
import { neighbors, topoOrder } from "./dag.js";

export const FUEL = "biofuel";
export const TERMINAL = new Set(["success", "skipped", "failed", "upstream_failed"]);
export const STATE_NAMES = {
  waiting: "대기",
  sensing: "기다리는 중",
  up_for_retry: "다시 시도 대기",
  success: "성공",
  skipped: "건너뜀",
  failed: "실패",
  upstream_failed: "앞 단계 실패",
};
const KEEP_HISTORY = 8;

export const newSmartfarm = () => ({ dags: [], runs: {}, history: [], lastDaily: {} });

export function newRun(dag, now) {
  return {
    id: `${dag.id}-${Math.floor(now)}`,
    startedAt: now,
    tasks: Object.fromEntries(dag.tasks.map((t) => [t.id, { state: "waiting", tries: 0, nextAt: 0, since: null, message: "" }])),
  };
}

// 실행 한 걸음: 할 수 있는 블록을 위상 정렬 순서로 처리하고, 바뀐 일이 없을 때까지 되풀이해요.
// 돌려주는 것: 일어난 일 [{ task, state, message }]
export function stepRun(dag, run, state, now, env) {
  const order = topoOrder(dag);
  if (!order) return [];
  const { up } = neighbors(dag);
  const events = [];
  const set = (id, next, message = "") => {
    Object.assign(run.tasks[id], { state: next, message });
    events.push({ task: id, state: next, message });
  };
  const fail = (task, message) => {
    const t = run.tasks[task.id];
    t.tries += 1;
    t.since = null;
    if (t.tries <= (task.retries ?? 0)) {
      t.nextAt = now + (task.retryDelay ?? 30);
      set(task.id, "up_for_retry", `${message} (다시 시도 ${t.tries}/${task.retries})`);
    } else set(task.id, "failed", message);
  };

  for (let changed = true, guard = 0; changed && guard < 100; guard++) {
    changed = false;
    for (const id of order) {
      const task = dag.tasks.find((x) => x.id === id);
      const t = run.tasks[id];
      if (TERMINAL.has(t.state)) continue;
      const ups = up.get(id).map((u) => run.tasks[u].state);
      if (ups.some((s) => s === "failed" || s === "upstream_failed")) {
        set(id, "upstream_failed", "앞 단계가 실패했어요");
        changed = true;
        continue;
      }
      if (!ups.every((s) => TERMINAL.has(s))) continue;
      if ((task.trigger ?? "all_success") === "all_success" && ups.includes("skipped")) {
        set(id, "skipped", "앞 작업이 건너뛰어져서 건너뜀");
        changed = true;
        continue;
      }
      if ((t.state === "up_for_retry" || t.state === "sensing") && now < t.nextAt) continue;
      attempt(task, t);
      changed = true;
    }
  }
  return events;

  function attempt(task, t) {
    const block = BLOCKS[task.block];
    if (block.fuel && itemCount(state, FUEL) < block.fuel) return fail(task, "바이오 연료가 없어요");
    const result = block.run(state, { ...block.params, ...task.params }, env);
    if (result.status === "success") {
      if (block.fuel) takeItem(state, FUEL, block.fuel);
      set(task.id, "success", result.message);
      for (const skip of result.skip ?? []) {
        if (run.tasks[skip] && !TERMINAL.has(run.tasks[skip].state)) set(skip, "skipped", `${task.id} 이(가) 건너뛰라고 했어요`);
      }
    } else if (result.status === "waiting") {
      t.since ??= now;
      if (now - t.since >= SENSOR_TIMEOUT) return fail(task, "하루를 기다려도 조건이 되지 않았어요");
      t.nextAt = now + POKE_MINUTES;
      if (t.state !== "sensing") set(task.id, "sensing", result.message);
    } else fail(task, result.message);
  }
}

export const isFinished = (run) => Object.values(run.tasks).every((t) => TERMINAL.has(t.state));
export const runResult = (run) => (Object.values(run.tasks).some((t) => t.state === "failed" || t.state === "upstream_failed") ? "failed" : "success");

// "daily@06:00" → 하루 중 몇 분째 (수동이면 null)
export function dailyMinute(schedule) {
  const match = /^daily@(\d\d):(\d\d)$/.exec(schedule ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// 스마트팜 전체 한 걸음: 정해진 시각이 된 DAG 는 새로 시작하고, 실행 중인 DAG 는 한 걸음, 끝난 실행은 이력으로
// 돌려주는 것: [{ dag, task, state, message }] 또는 실행 시작·끝 { dag, run: "started" | "success" | "failed" }
export function tickSmartfarm(sf, state, now, env) {
  const events = [];
  for (const dag of sf.dags) {
    const daily = dailyMinute(dag.schedule);
    const day = Math.floor(now / (24 * 60));
    if (daily !== null && !sf.runs[dag.id] && sf.lastDaily[dag.id] !== day && now - day * 24 * 60 >= daily) {
      sf.lastDaily[dag.id] = day;
      sf.runs[dag.id] = newRun(dag, now);
      events.push({ dag: dag.id, run: "started" });
    }
    const run = sf.runs[dag.id];
    if (!run) continue;
    for (const e of stepRun(dag, run, state, now, env)) events.push({ dag: dag.id, ...e });
    if (isFinished(run)) {
      const result = runResult(run);
      sf.history.unshift({ dagId: dag.id, runId: run.id, startedAt: run.startedAt, finishedAt: now, result, tasks: Object.fromEntries(Object.entries(run.tasks).map(([id, t]) => [id, t.state])) });
      sf.history.length = Math.min(sf.history.length, KEEP_HISTORY);
      delete sf.runs[dag.id];
      events.push({ dag: dag.id, run: result });
    }
  }
  return events;
}

// 지금 바로 실행 (수동 실행 버튼). 이미 실행 중이면 false
export function triggerRun(sf, dag, now) {
  if (sf.runs[dag.id]) return false;
  sf.runs[dag.id] = newRun(dag, now);
  return true;
}
