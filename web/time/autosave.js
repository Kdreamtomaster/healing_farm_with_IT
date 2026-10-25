// 언제 저장할지 정합니다.
//   - 플레이 중 5분마다
//   - 탭을 숨기거나 창을 닫을 때 (게임 종료 시 저장)
// "게임 실행 시 저장"은 서버(server/main.py)가 실행 시각을 기록하고, main.js 가 접속 직후 한 번 저장해요.
export const AUTOSAVE_MS = 5 * 60 * 1000;

export function startAutosave(save) {
  setInterval(() => {
    if (!document.hidden) save({ silent: true });
  }, AUTOSAVE_MS);

  // 창을 닫으면 pagehide 와 visibilitychange 가 둘 다 오는데, 순서는 브라우저마다 달라요.
  // 먼저 온 쪽에서 한 번만 저장합니다.
  let savedOnLeave = false;
  const leave = () => {
    if (savedOnLeave) return;
    savedOnLeave = true;
    save({ silent: true, keepalive: true });
  };
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) leave();
    else savedOnLeave = false;
  });
}
