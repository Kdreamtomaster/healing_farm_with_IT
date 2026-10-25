// 키보드 단축키 표: 이 표 하나로 "누르면 무엇을 할지"와 도움말 화면을 함께 만들어요.
// 왼손은 키보드(WASD·1234·QER·ZXC·Space), 오른손은 마우스에 두고 편하게 농사짓도록 골랐어요.
export const KEYMAP = [
  { group: "움직이기", keys: ["arrowup", "w"], label: "↑ W", command: "up", text: "위 칸으로" },
  { group: "움직이기", keys: ["arrowdown", "s"], label: "↓ S", command: "down", text: "아래 칸으로" },
  { group: "움직이기", keys: ["arrowleft", "a"], label: "← A", command: "left", text: "왼쪽 칸으로" },
  { group: "움직이기", keys: ["arrowright", "d"], label: "→ D", command: "right", text: "오른쪽 칸으로" },
  { group: "일하기", keys: [" ", "enter"], label: "Space", command: "use", text: "지금 도구로 일하기 (살펴보기면 알맞은 일)" },
  { group: "일하기", keys: ["f"], label: "F", command: "smart", text: "알맞은 일 (수확·심기·물주기 중 필요한 것)" },
  { group: "도구", keys: ["1"], label: "1", command: "tool:look", text: "살펴보기" },
  { group: "도구", keys: ["2"], label: "2", command: "tool:water", text: "물뿌리개" },
  { group: "도구", keys: ["3"], label: "3", command: "tool:seed", text: "씨앗" },
  { group: "도구", keys: ["4"], label: "4", command: "tool:harvest", text: "수확" },
  { group: "도구", keys: ["q"], label: "Q", command: "seed:prev", text: "이전 씨앗" },
  { group: "도구", keys: ["e"], label: "E", command: "seed:next", text: "다음 씨앗" },
  { group: "도구", keys: ["r"], label: "R", command: "seed:color", text: "씨앗 색 바꾸기" },
  { group: "일괄 관리", keys: ["z"], label: "Z", command: "bulk:thirsty", text: "드론: 목마른 작물에 물주기" },
  { group: "일괄 관리", keys: ["x"], label: "X", command: "bulk:highWater", text: "스프링클러: 물 많이 먹는 작물" },
  { group: "일괄 관리", keys: ["c"], label: "C", command: "bulk:paddy", text: "물길: 논 전체 물대기" },
  { group: "메뉴", keys: ["p"], label: "P", command: "tab:plot", text: "밭 메뉴" },
  { group: "메뉴", keys: ["i"], label: "I", command: "tab:storage", text: "창고 메뉴" },
  { group: "메뉴", keys: ["k"], label: "K", command: "tab:kitchen", text: "부엌 메뉴" },
  { group: "메뉴", keys: ["g"], label: "G", command: "tab:workshop", text: "꽃 공방 메뉴" },
  { group: "메뉴", keys: ["l"], label: "L", command: "tab:lab", text: "연구소 메뉴" },
  { group: "메뉴", keys: ["o"], label: "O", command: "tab:settings", text: "설정 메뉴" },
  { group: "메뉴", keys: ["h"], label: "H", command: "menu:toggle", text: "메뉴 접기·펴기 (접으면 농장이 커지고, 메뉴는 팝업으로)" },
  { group: "메뉴", keys: ["u"], label: "U", command: "menu:window", text: "메뉴를 새 창으로 (다른 모니터로 옮길 수 있어요)" },
  { group: "그 밖에", keys: ["m"], label: "M", command: "idle", text: "멍때리기 모드 켜고 끄기" },
  { group: "그 밖에", keys: ["ctrl+s"], label: "Ctrl+S", command: "save", text: "저장" },
  { group: "그 밖에", keys: ["escape"], label: "Esc", command: "cancel", text: "닫기 · 선택 풀기 · 살펴보기 도구로" },
  { group: "그 밖에", keys: ["?"], label: "?", command: "help", text: "단축키 도움말" },
];

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// 키 입력 → 명령 이름. 글자를 쓰는 중이거나, 버튼에서 Space/Enter 를 누른 경우(버튼이 직접 처리)에는 null
//   event 는 KeyboardEvent 와 같은 모양 { key, ctrlKey, metaKey, altKey, target }
export function commandForKey(event) {
  const tag = event.target?.tagName;
  if (TYPING.has(tag) || event.target?.isContentEditable || event.altKey || event.metaKey) return null;
  const key = event.key.toLowerCase(); // Shift 를 누른 대문자 W 도 w 로
  if ((key === " " || key === "enter") && tag === "BUTTON") return null;
  const name = event.ctrlKey ? `ctrl+${key}` : key;
  return KEYMAP.find((entry) => entry.keys.includes(name))?.command ?? null;
}

// 키보드 커서를 한 칸 옮기기. 아직 아무 칸도 안 골랐으면 왼쪽 위 칸부터. 밭 끝에서는 멈춰요.
export function moveCursor(plots, currentId, dx, dy) {
  const current = plots.find((p) => p.id === currentId);
  if (!current) return plots.find((p) => p.x === 0 && p.y === 0)?.id ?? plots[0]?.id ?? null;
  const next = plots.find((p) => p.x === current.x + dx && p.y === current.y + dy);
  return next ? next.id : current.id;
}

export const MOVES = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
