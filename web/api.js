// 서버(server/api.py)와 이야기하는 함수들입니다.

async function getJson(url, what) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what}를 불러오지 못했어요`);
  return res.json();
}

export async function loadSpecies() {
  return (await getJson("/data/crops.json", "작물 데이터")).crops;
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
