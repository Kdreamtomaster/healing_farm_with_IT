// 스마트팜 탭: 블록 흐름(DAG) 보기·고치기, 실행 기록 격자, Airflow 코드 보기
// 동작은 actions(web/main.js)를 부르고, 규칙은 web/smartfarm/ 에 있어요.
import { toAirflow } from "../smartfarm/airflow.js";
import { BLOCKS, KINDS, WATER_TARGETS } from "../smartfarm/blocks.js";
import { depths, neighbors } from "../smartfarm/dag.js";
import { STATE_NAMES } from "../smartfarm/runner.js";
import { PLOT_FOR_TYPE } from "../farm/crops.js";
import { itemCount } from "../state.js";
import { PLOT_NAMES } from "../text.js";
import { el } from "./dom.js";

const SCHEDULES = { manual: "수동 실행", "daily@06:00": "매일 06:00", "daily@12:00": "매일 12:00", "daily@18:00": "매일 18:00" };

export function smartfarmTab(game, data, actions) {
  const sf = game.state.meta.smartfarm;
  const fuel = itemCount(game.state, "biofuel");
  const head = [
    el("h2", {}, "스마트팜 🤖"),
    el("p", { class: "hint" }, "블록을 화살표로 이어 순서를 정하면 농장이 그 순서대로 일해요 (Airflow 의 DAG). 일하는 블록은 바이오 연료를 1개씩 써요."),
    el("p", { class: fuel ? "lab-status ok" : "lab-status bad" }, `⛽ 바이오 연료 ${fuel}개`, fuel ? "" : " — 연구소(L)에서 수확물을 연료로 바꿔 오세요"),
  ];
  const dag = sf.dags.find((d) => d.id === game.ui.sfDag) ?? sf.dags[0];
  return [
    ...head,
    sf.dags.length > 1 &&
      el(
        "div",
        { class: "lab-row" },
        "흐름: ",
        el("select", { onchange: (e) => actions.remember("sfDag", e.target.value, true) }, sf.dags.map((d) => el("option", { value: d.id, selected: d === dag }, d.name))),
      ),
    dag ? dagView(game, data, actions, sf, dag) : null,
    templates(data, actions, sf.dags.length === 0),
  ];
}

function templates(data, actions, open) {
  return el(
    "details",
    { class: "more", open },
    el("summary", {}, "➕ 새 흐름 만들기 (틀 고르기)"),
    data.smartfarmTemplates.map((t) =>
      el(
        "div",
        { class: "recipe-row" },
        el("span", { class: "recipe-name" }, t.name, el("small", {}, t.about)),
        el("button", { class: "small", onclick: () => actions.sfAddTemplate(t.id) }, "만들기"),
      ),
    ),
  );
}

// 블록 상태: 실행 중이면 그 실행, 아니면 마지막 실행 기록
function stateOf(sf, dag, taskId) {
  const run = sf.runs[dag.id];
  if (run) return run.tasks[taskId] ?? { state: "waiting" };
  const last = sf.history.find((h) => h.dagId === dag.id);
  return last ? { state: last.tasks[taskId] ?? "none", message: "" } : { state: "none", message: "" };
}

function dagView(game, data, actions, sf, dag) {
  const running = Boolean(sf.runs[dag.id]);
  const depth = depths(dag);
  const { up } = neighbors(dag);
  const layers = [];
  for (const task of dag.tasks) (layers[depth.get(task.id)] ??= []).push(task);
  const env = { speciesById: data.speciesById, recipes: data.recipes, crafts: data.crafts };
  return [
    el(
      "div",
      { class: "lab-row" },
      el("strong", {}, dag.name),
      el("select", { "aria-label": "언제 실행", onchange: (e) => actions.sfSchedule(dag.id, e.target.value) }, Object.entries(SCHEDULES).map(([v, n]) => el("option", { value: v, selected: v === dag.schedule }, n))),
      el("button", { class: "small", disabled: running, onclick: () => actions.sfTrigger(dag.id) }, running ? "실행 중…" : "▶ 지금 실행"),
      el("button", { class: "small ghost", title: "이 흐름 지우기", onclick: () => actions.sfRemoveDag(dag.id) }, "🗑"),
    ),
    // 그래프: 깊이(층)마다 한 줄
    el(
      "div",
      { class: "dag" },
      layers.map((layer, i) =>
        el(
          "div",
          { class: "dag-layer" },
          i > 0 && el("span", { class: "dag-arrow" }, "↓"),
          layer.map((task) => {
            const s = stateOf(sf, dag, task.id);
            const block = BLOCKS[task.block];
            return el(
              "div",
              { class: `dag-node st-${s.state}`, title: `${STATE_NAMES[s.state] ?? "아직 실행 안 함"}${s.message ? ` — ${s.message}` : ""}` },
              el("strong", {}, `${block.icon} ${task.id}`),
              el("small", {}, block.describe({ ...block.params, ...task.params }, env)),
              up.get(task.id).length > 0 && el("small", { class: "dag-up" }, `← ${up.get(task.id).join(", ")}`),
              el("span", { class: "dag-state" }, STATE_NAMES[s.state] ?? "—", s.message ? ` · ${s.message}` : ""),
            );
          }),
        ),
      ),
    ),
    legend(),
    editor(game, data, actions, dag),
    grid(sf, dag),
    el("details", { class: "more" }, el("summary", {}, "🐍 Airflow 코드로 보기"), el("pre", { class: "canonical airflow" }, toAirflow(dag))),
  ];
}

function legend() {
  return el(
    "p",
    { class: "dag-legend" },
    ["waiting", "sensing", "up_for_retry", "success", "skipped", "failed", "upstream_failed"].map((s) => el("span", { class: `chip st-${s}` }, STATE_NAMES[s])),
  );
}

// 블록 설정 고르기 (블록마다 다른 칸)
function paramControl(task, key, value, dag, data, actions) {
  const options = {
    kind: () => KINDS.map((k) => [k, PLOT_NAMES[k]]),
    species: () => [["any", "아무 작물"], ...data.speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === (task.params.kind ?? "flowerbed")).map((s) => [s.id, s.name.ko])],
    target: () => Object.entries(WATER_TARGETS),
    skip: () => [["", "건너뛰지 않음"], ...dag.tasks.filter((t) => t.id !== task.id).map((t) => [t.id, `${t.id} 건너뛰기`])],
    recipe: () => data.recipes.map((r) => [r.id, r.name.ko]),
    craft: () => data.crafts.map((c) => [c.id, c.name.ko]),
  }[key];
  if (!options) return null;
  return el("select", { "aria-label": key, onchange: (e) => actions.sfOption(dag.id, task.id, key, e.target.value) }, options().map(([v, n]) => el("option", { value: v, selected: v === value }, n)));
}

function editor(game, data, actions, dag) {
  const { up } = neighbors(dag);
  return el(
    "details",
    { class: "more", open: Boolean(game.ui.sfEdit), ontoggle: (e) => actions.remember("sfEdit", e.target.open) },
    el("summary", {}, "✏️ 블록 고치기"),
    dag.tasks.map((task) => {
      const block = BLOCKS[task.block];
      const params = { ...block.params, ...task.params };
      return el(
        "div",
        { class: "dag-edit" },
        el("div", { class: "lab-row" }, el("strong", {}, `${block.icon} ${task.id}`), Object.entries(params).map(([k, v]) => paramControl(task, k, v, dag, data, actions)), el("button", { class: "small ghost", title: "블록 빼기", onclick: () => actions.sfRemoveTask(dag.id, task.id) }, "✕")),
        el(
          "div",
          { class: "lab-row" },
          "재시도 ",
          el("select", { onchange: (e) => actions.sfOption(dag.id, task.id, "retries", Number(e.target.value)) }, [0, 1, 2, 3].map((n) => el("option", { value: String(n), selected: n === (task.retries ?? 0) }, `${n}번`))),
          " 실행 조건 ",
          el(
            "select",
            { onchange: (e) => actions.sfOption(dag.id, task.id, "trigger", e.target.value) },
            [["all_success", "앞 작업 모두 성공"], ["none_failed", "실패만 없으면"]].map(([v, n]) => el("option", { value: v, selected: v === (task.trigger ?? "all_success") }, n)),
          ),
        ),
        el(
          "div",
          { class: "lab-row" },
          "앞 작업: ",
          dag.tasks
            .filter((t) => t.id !== task.id)
            .map((t) =>
              el(
                "label",
                { class: "toggle inline" },
                el("input", { type: "checkbox", checked: up.get(task.id).includes(t.id), onchange: (e) => actions.sfEdge(dag.id, t.id, task.id, e.target.checked) }),
                ` ${t.id}`,
              ),
            ),
        ),
      );
    }),
    el(
      "div",
      { class: "lab-row" },
      "블록 더하기: ",
      el("select", { "aria-label": "더할 블록", onchange: (e) => actions.remember("sfNewBlock", e.target.value) }, Object.entries(BLOCKS).map(([id, b]) => el("option", { value: id, selected: id === game.ui.sfNewBlock }, `${b.icon} ${b.name}`))),
      el("button", { class: "small", onclick: () => actions.sfAddTask(dag.id, game.ui.sfNewBlock ?? "plant") }, "더하기"),
    ),
  );
}

// 실행 기록 격자 (Airflow 의 Grid 보기): 줄은 블록, 칸은 실행 (왼쪽이 최근)
function grid(sf, dag) {
  const runs = sf.history.filter((h) => h.dagId === dag.id);
  if (!runs.length) return el("p", { class: "hint" }, "아직 실행 기록이 없어요. ▶ 지금 실행을 눌러 보세요.");
  return el(
    "details",
    { class: "more", open: true },
    el("summary", {}, `📊 실행 기록 (최근 ${runs.length}번)`),
    el(
      "table",
      { class: "dag-grid" },
      dag.tasks.map((task) =>
        el(
          "tr",
          {},
          el("th", {}, task.id),
          runs.map((r) => el("td", {}, el("span", { class: `cell st-${r.tasks[task.id] ?? "none"}`, title: `${STATE_NAMES[r.tasks[task.id]] ?? "없음"}` }))),
        ),
      ),
    ),
  );
}
