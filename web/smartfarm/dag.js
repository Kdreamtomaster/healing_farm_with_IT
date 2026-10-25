// DAG(방향이 있고 빙글 돌지 않는 작업 흐름도) 검사와 실행 순서 계산
//   dag = { id, name, schedule, tasks: [{ id, block, params, retries, retryDelay, trigger }], edges: [[앞, 뒤], …] }
// 화면도 게임 상태도 모르는 순수 함수예요. → tests/web/smartfarm.test.js

// 블록마다 앞 작업(upstream)과 뒤 작업(downstream) 목록
export function neighbors(dag) {
  const up = new Map(dag.tasks.map((t) => [t.id, []]));
  const down = new Map(dag.tasks.map((t) => [t.id, []]));
  for (const [from, to] of dag.edges) {
    down.get(from)?.push(to);
    up.get(to)?.push(from);
  }
  return { up, down };
}

// 위상 정렬 (Kahn 알고리즘): 들어오는 화살표가 없는 블록부터 하나씩 꺼내요.
// 끝까지 못 꺼낸 블록이 남으면 어딘가 빙글 도는 길이 있다는 뜻 → null
export function topoOrder(dag) {
  const { up, down } = neighbors(dag);
  const waiting = new Map([...up].map(([id, list]) => [id, list.length])); // 아직 안 끝난 앞 작업 수
  const ready = dag.tasks.filter((t) => waiting.get(t.id) === 0).map((t) => t.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of down.get(id)) {
      waiting.set(next, waiting.get(next) - 1);
      if (waiting.get(next) === 0) ready.push(next);
    }
  }
  return order.length === dag.tasks.length ? order : null;
}

// 빙글 도는 길 찾기 (깊이 우선 탐색): ["물주기", "수확", "물주기"] 처럼 돌아오는 길, 없으면 null
export function findCycle(dag) {
  const { down } = neighbors(dag);
  const state = new Map(); // 1: 지나가는 중, 2: 다 봄
  const path = [];
  const visit = (id) => {
    state.set(id, 1);
    path.push(id);
    for (const next of down.get(id)) {
      if (state.get(next) === 1) return [...path.slice(path.indexOf(next)), next];
      if (!state.get(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, 2);
    return null;
  };
  for (const task of dag.tasks) {
    if (!state.get(task.id)) {
      const found = visit(task.id);
      if (found) return found;
    }
  }
  return null;
}

// 그래프 그림의 층: 맨 앞 블록은 0층, 나머지는 (앞 작업 중 가장 깊은 층 + 1)
export function depths(dag) {
  const order = topoOrder(dag) ?? dag.tasks.map((t) => t.id);
  const { up } = neighbors(dag);
  const depth = new Map();
  for (const id of order) depth.set(id, Math.max(-1, ...up.get(id).map((u) => depth.get(u) ?? 0)) + 1);
  return depth;
}

// 화살표 하나를 더해도 되는지: { ok } 또는 { ok: false, reason, cycle }
export function canConnect(dag, from, to) {
  if (from === to) return { ok: false, reason: "자기 자신에게는 화살표를 이을 수 없어요" };
  if (dag.edges.some(([a, b]) => a === from && b === to)) return { ok: false, reason: "이미 이어져 있어요" };
  const cycle = findCycle({ ...dag, edges: [...dag.edges, [from, to]] });
  return cycle ? { ok: false, reason: "빙글 도는 길이 생겨요", cycle } : { ok: true };
}

// DAG 모양 검사: 문제 목록 (없으면 빈 목록)
export function problems(dag, blocks) {
  const found = [];
  const ids = new Set();
  for (const task of dag.tasks) {
    if (ids.has(task.id)) found.push(`블록 이름 ${task.id} 이(가) 겹쳐요`);
    ids.add(task.id);
    if (!blocks[task.block]) found.push(`${task.id}: 모르는 블록 ${task.block}`);
  }
  for (const [from, to] of dag.edges) if (!ids.has(from) || !ids.has(to)) found.push(`없는 블록을 잇는 화살표 ${from} → ${to}`);
  const cycle = findCycle(dag);
  if (cycle) found.push(`빙글 도는 길: ${cycle.join(" → ")}`);
  return found;
}
