// 서버(server/api.py)와 이야기하는 함수들입니다.

export async function loadSpecies() {
  const res = await fetch("/data/crops.json");
  if (!res.ok) throw new Error("작물 데이터를 불러오지 못했어요");
  return (await res.json()).crops;
}

export async function loadState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error("세이브를 불러오지 못했어요");
  return res.json();
}

// 결과: { ok, status, lastSavedAt?, error? }
export async function saveState(state, log) {
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, log }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...body };
}
