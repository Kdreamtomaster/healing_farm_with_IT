// 스마트팜 테스트: DAG 검사(web/smartfarm/dag.js), 실행기(runner.js), Airflow 코드(airflow.js)
import { toAirflow } from "../../web/smartfarm/airflow.js";
import { BLOCKS, SENSOR_TIMEOUT } from "../../web/smartfarm/blocks.js";
import { canConnect, depths, findCycle, problems, topoOrder } from "../../web/smartfarm/dag.js";
import { newRun, newSmartfarm, stepRun, tickSmartfarm, triggerRun } from "../../web/smartfarm/runner.js";
import { assert, test } from "./runner.js";

const TULIP = { id: "tulip", name: { ko: "튤립" }, type: "flower", water: "mid", growMinutes: 120, yield: 1, seeds: 2, colors: [{ id: "pink", hex: "#e86f9a" }] };
const BOUQUET = { id: "tulip_bouquet", name: { ko: "튤립 꽃다발" }, kind: "gift", materials: { tulip: 1 } };
const env = { speciesList: [TULIP], speciesById: new Map([["tulip", TULIP]]), recipes: [], crafts: [BOUQUET], random: () => 0 };
const farm = (inventory) => ({ meta: { gameMinutes: 0 }, plots: [{ id: 0, x: 0, y: 0, kind: "flowerbed", crop: null }], inventory });

const FLOW = {
  id: "bouquet",
  name: "꽃다발",
  schedule: "manual",
  tasks: [
    { id: "plant", block: "plant", params: { kind: "flowerbed", species: "tulip" } },
    { id: "check", block: "check_moisture", params: { skip: "water" } },
    { id: "water", block: "water", params: { target: "thirsty" } },
    { id: "wait", block: "wait_ripe", params: { kind: "flowerbed" }, trigger: "none_failed" },
    { id: "harvest", block: "harvest", params: { kind: "flowerbed" } },
    { id: "make", block: "craft", params: { craft: "tulip_bouquet" }, retries: 1, retryDelay: 30 },
  ],
  edges: [["plant", "check"], ["check", "water"], ["water", "wait"], ["wait", "harvest"], ["harvest", "make"]],
};

test("위상 정렬: 화살표 순서를 지키고, 빙글 돌면 null", () => {
  assert(topoOrder(FLOW).join() === "plant,check,water,wait,harvest,make", topoOrder(FLOW).join());
  const loop = { ...FLOW, edges: [...FLOW.edges, ["make", "plant"]] };
  assert(topoOrder(loop) === null);
  assert(findCycle(loop).join(" → ") === "plant → check → water → wait → harvest → make → plant", findCycle(loop).join(" → "));
});

test("화살표 잇기 검사: 자기 자신, 이미 이은 것, 빙글 도는 길은 거부", () => {
  assert(!canConnect(FLOW, "water", "water").ok);
  assert(!canConnect(FLOW, "plant", "check").ok);
  const cyc = canConnect(FLOW, "harvest", "check");
  assert(!cyc.ok && cyc.cycle.includes("check"), JSON.stringify(cyc));
  assert(canConnect(FLOW, "plant", "wait").ok);
  assert(depths(FLOW).get("make") === 5 && depths(FLOW).get("plant") === 0);
  assert(problems(FLOW, BLOCKS).length === 0);
  assert(problems({ ...FLOW, tasks: [...FLOW.tasks, { id: "x", block: "teleport" }] }, BLOCKS).length === 1);
});

test("실행: 심기 → (촉촉해서) 물주기 건너뜀 → 다 자랄 때까지 기다림 → 수확 → 꽃다발, 연료는 일한 블록만큼", () => {
  const state = farm({ seed_tulip: 1, biofuel: 10 });
  const run = newRun(FLOW, 0);
  stepRun(FLOW, run, state, 0, env);
  const s = (id) => run.tasks[id].state;
  assert(s("plant") === "success" && s("check") === "success" && s("water") === "skipped" && s("wait") === "sensing", JSON.stringify(run.tasks));
  state.plots[0].crop.progress = 1; // 다 자람
  stepRun(FLOW, run, state, 10, env);
  assert(s("wait") === "sensing", "센서는 30분마다 확인해요");
  stepRun(FLOW, run, state, 30, env);
  assert(s("wait") === "success" && s("harvest") === "success" && s("make") === "success", JSON.stringify(run.tasks));
  assert(state.inventory.craft_tulip_bouquet === 1);
  assert(state.inventory.biofuel === 7, `연료 ${state.inventory.biofuel} (심기·수확·공방 3개)`);
});

test("연료가 없으면 실패 → 다시 시도 대기 → 그래도 없으면 실패, 뒤 블록은 앞 단계 실패", () => {
  const dag = { ...FLOW, tasks: FLOW.tasks.map((t) => (t.id === "plant" ? { ...t, retries: 1, retryDelay: 60 } : t)) };
  const state = farm({ seed_tulip: 1 });
  const run = newRun(dag, 0);
  stepRun(dag, run, state, 0, env);
  assert(run.tasks.plant.state === "up_for_retry" && run.tasks.plant.message.includes("연료"), JSON.stringify(run.tasks.plant));
  stepRun(dag, run, state, 30, env);
  assert(run.tasks.plant.state === "up_for_retry", "retryDelay 전에는 다시 하지 않아요");
  stepRun(dag, run, state, 60, env);
  assert(run.tasks.plant.state === "failed");
  assert(Object.entries(run.tasks).every(([id, t]) => id === "plant" || t.state === "upstream_failed"), JSON.stringify(run.tasks));
  assert(state.plots[0].crop === null, "작물에게는 아무 일도 없어요");
});

test("센서는 하루를 기다려도 안 되면 실패", () => {
  const dag = { id: "w", name: "w", schedule: "manual", tasks: [{ id: "wait", block: "wait_ripe", params: { kind: "flowerbed" } }], edges: [] };
  const run = newRun(dag, 0);
  const state = farm({});
  for (let t = 0; t <= SENSOR_TIMEOUT; t += 30) stepRun(dag, run, state, t, env);
  assert(run.tasks.wait.state === "failed", run.tasks.wait.state);
});

test("스케줄: 매일 정해진 시각에 한 번 시작하고, 끝나면 이력에 남아요. 수동 실행도 가능", () => {
  const sf = newSmartfarm();
  const dag = { id: "d", name: "d", schedule: "daily@06:00", tasks: [{ id: "check", block: "check_moisture", params: {} }], edges: [] };
  sf.dags.push(dag);
  const state = farm({});
  assert(tickSmartfarm(sf, state, 5 * 60, env).length === 0, "6시 전에는 시작하지 않아요");
  const events = tickSmartfarm(sf, state, 6 * 60, env);
  assert(events[0].run === "started" && events.at(-1).run === "success", JSON.stringify(events));
  assert(tickSmartfarm(sf, state, 7 * 60, env).length === 0, "같은 날 두 번 시작하지 않아요");
  assert(sf.history.length === 1 && sf.history[0].tasks.check === "success");
  assert(triggerRun(sf, dag, 8 * 60) && !triggerRun(sf, dag, 8 * 60), "실행 중이면 또 시작하지 않아요");
  tickSmartfarm(sf, state, 8 * 60, env);
  assert(sf.history.length === 2);
});

test("Airflow 코드: Operator·Sensor·retries·trigger_rule·>> 연결이 들어 있어요", () => {
  const code = toAirflow(FLOW);
  for (const part of ['dag_id="bouquet"', "schedule=None", "plant = PlantOperator(", "wait = RipeSensor(", "poke_interval=timedelta(minutes=30)", "trigger_rule=TriggerRule.NONE_FAILED", "retries=1", "plant >> check", "harvest >> make"]) {
    assert(code.includes(part), `${part} 가 없어요\n${code}`);
  }
  assert(toAirflow({ ...FLOW, schedule: "daily@06:30" }).includes('schedule="30 6 * * *"'));
});
