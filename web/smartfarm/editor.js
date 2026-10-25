// 스마트팜 DAG 고치기 규칙: 블록 더하기·빼기, 화살표 잇기·끊기, 블록 설정 바꾸기
// 모두 sf(meta.smartfarm)를 바꾸고 { ok, message } 를 돌려줘요. 고치면 그 DAG 의 실행 중인 일은 멈춰요.
import { BLOCKS } from "./blocks.js";
import { canConnect } from "./dag.js";

const stop = (sf, dag) => {
  const running = Boolean(sf.runs[dag.id]);
  delete sf.runs[dag.id];
  return running ? " (고쳤으니 실행 중이던 일은 멈췄어요)" : "";
};
const findDag = (sf, dagId) => sf.dags.find((d) => d.id === dagId);

// 틀(data/smartfarm.json 의 templates)로 새 DAG 만들기
export function addFromTemplate(sf, template) {
  if (sf.dags.length >= 8) return { ok: false, message: "스마트팜은 8개까지 만들 수 있어요" };
  let id = template.id;
  for (let n = 2; sf.dags.some((d) => d.id === id); n++) id = `${template.id}_${n}`;
  const { about, ...dag } = structuredClone(template);
  sf.dags.push({ ...dag, id });
  return { ok: true, message: `"${template.name}" 흐름을 만들었어요`, dagId: id };
}

export function removeDag(sf, dagId) {
  sf.dags = sf.dags.filter((d) => d.id !== dagId);
  delete sf.runs[dagId];
  return { ok: true, message: "흐름을 지웠어요" };
}

export function addTask(sf, dagId, block) {
  const dag = findDag(sf, dagId);
  if (!BLOCKS[block]) return { ok: false, message: "모르는 블록이에요" };
  if (dag.tasks.length >= 20) return { ok: false, message: "블록은 20개까지예요" };
  let id = block;
  for (let n = 2; dag.tasks.some((t) => t.id === id); n++) id = `${block}_${n}`;
  dag.tasks.push({ id, block, params: { ...BLOCKS[block].params } });
  return { ok: true, message: `${BLOCKS[block].name} 블록(${id})을 더했어요${stop(sf, dag)}` };
}

export function removeTask(sf, dagId, taskId) {
  const dag = findDag(sf, dagId);
  dag.tasks = dag.tasks.filter((t) => t.id !== taskId);
  dag.edges = dag.edges.filter(([a, b]) => a !== taskId && b !== taskId);
  for (const t of dag.tasks) if (t.params?.skip === taskId) t.params.skip = "";
  return { ok: true, message: `${taskId} 블록을 뺐어요${stop(sf, dag)}` };
}

// 화살표 from → to (빙글 도는 길이 생기면 이유와 길을 알려 주고 거부)
export function connect(sf, dagId, from, to) {
  const dag = findDag(sf, dagId);
  const check = canConnect(dag, from, to);
  if (!check.ok) return { ok: false, message: check.cycle ? `${check.reason}: ${check.cycle.join(" → ")}` : check.reason };
  dag.edges.push([from, to]);
  return { ok: true, message: `${from} → ${to} 이었어요${stop(sf, dag)}` };
}

export function disconnect(sf, dagId, from, to) {
  const dag = findDag(sf, dagId);
  dag.edges = dag.edges.filter(([a, b]) => !(a === from && b === to));
  return { ok: true, message: `${from} → ${to} 끊었어요${stop(sf, dag)}` };
}

// 블록 설정: params(블록마다 다름) 또는 retries · retryDelay · trigger
export function setOption(sf, dagId, taskId, key, value) {
  const dag = findDag(sf, dagId);
  const task = dag.tasks.find((t) => t.id === taskId);
  if (["retries", "retryDelay", "trigger"].includes(key)) task[key] = value;
  else task.params = { ...task.params, [key]: value };
  return { ok: true, message: `${taskId} 설정을 바꿨어요${stop(sf, dag)}` };
}

export function setSchedule(sf, dagId, schedule) {
  findDag(sf, dagId).schedule = schedule;
  return { ok: true, message: schedule === "manual" ? "수동 실행으로 바꿨어요" : `매일 ${schedule.slice(6)}에 실행해요` };
}
