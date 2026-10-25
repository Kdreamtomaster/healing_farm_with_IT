// 서버(server/api.py)와 이야기하는 함수들입니다.

async function getJson(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what}를 불러오지 못했어요`);
  return res.json();
}

export async function loadSpecies() {
  return (await getJson("/data/crops.json", "작물 데이터")).crops;
}

export async function loadRecipes() {
  return (await getJson("/data/recipes.json", "요리 데이터")).recipes;
}

export async function loadCrafts() {
  return (await getJson("/data/crafts.json", "공방 데이터")).crafts;
}

export async function loadFriends() {
  return (await getJson("/data/friends.json", "친구 데이터")).friends;
}

export function loadPalette() {
  return getJson("/assets/palette.json", "색 팔레트");
}

export function loadManifest() {
  return getJson("/assets/manifest.json", "그림 목록");
}

export function loadState() {
  return getJson("/api/state", "세이브");
}

// 결과: { ok, status, lastSavedAt?, error? }
// keepalive: 창을 닫는 중에도 요청이 끝까지 전달되도록 브라우저에 부탁합니다.
export async function saveState(state, log, keepalive = false) {
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, log }),
    keepalive,
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...body };
}

// 저장이 아닌 요청들 (완전 초기화, 연구소). 결과: { ok, status, ...답장 }
async function post(url, body = {}) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, status: res.status, ...(await res.json().catch(() => ({}))) };
  } catch {
    return { ok: false, status: 0, error: "서버와 연결할 수 없어요" };
  }
}

// 변조가 확인된 농장을 처음부터 다시 시작 (서버는 변조일 때만 받아요)
export const resetFarm = () => post("/api/reset");

// ── 연구소 ──
export function loadLab() {
  return getJson("/api/lab/state", "연구소");
}
export const labImport = (species, count) => post("/api/lab/import", { species, count });
export const labFuel = (sampleId, count) => post("/api/lab/fuel", { sampleId, count });
export const labExperiment = (sampleId, color, size) => post("/api/lab/experiment", { sampleId, color, size });
export const labClear = () => post("/api/lab/clear");
