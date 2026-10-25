// 게임 시작점: 데이터와 세이브를 불러와 비운 시간을 처리하고, 1초마다 농장의 시간을 흘려보냅니다.
// 마우스·키보드 조작, 도구, 메뉴(옆에 붙이기 · 팝업 · 새 창)도 여기서 이어 줘요.
import {
  loadCrafts,
  loadFriends,
  loadJournal,
  loadManifest,
  loadMutations,
  loadPalette,
  loadRecipes,
  loadSmartfarmTemplates,
  loadSpecies,
  loadState,
  loadUnlocks,
  resetFarm,
  saveState,
} from "./api.js";
import { isRestTime, lightAt } from "./decor/daylight.js";
import { applyBorderToKind, setBorder } from "./decor/plots-style.js";
import { seasonOf } from "./decor/season.js";
import { nextKitchenTask, nextTask } from "./farm/autopilot.js";
import { BULK, bulkTargets, flood, water } from "./farm/care.js";
import { advanceFarm, PLOT_FOR_TYPE } from "./farm/crops.js";
import { configureMutations, labelEntry } from "./farm/codex.js";
import { giftMessage, giftNewSeeds } from "./farm/seed-gift.js";
import { applyUnlock, checkUnlocks } from "./farm/unlocks.js";
import { createLab } from "./lab/sandbox.js";
import { addFromTemplate, addTask, connect, disconnect, removeDag, removeTask, setOption, setSchedule } from "./smartfarm/editor.js";
import { newSmartfarm, tickSmartfarm, triggerRun } from "./smartfarm/runner.js";
import { harvest, plant } from "./farm/harvest.js";
import { cycleColor, cycleSeed, seedFor, smartTask, toolTask } from "./farm/tools.js";
import { farmSeed, weatherAt } from "./farm/weather.js";
import { fansOf, finishCooking, share, shareMessage, startCooking } from "./friends/cooking.js";
import { finishCraft, giveGift, startCraft } from "./friends/crafts.js";
import { playSound, setNatureEnv, setSound, unlockAudio } from "./sound/engine.js";
import { josa, PLOT_NAMES } from "./text.js";
import { startAutosave } from "./time/autosave.js";
import { MINUTES_PER_DAY, realMsToGameMinutes } from "./time/clock.js";
import { newReport, planOffline, simulateOffline } from "./time/offline.js";
import { reportToLog, summarize } from "./time/summary.js";
import { createAnimator } from "./ui/animations.js";
import { catRect, createCat, petCat } from "./ui/critters.js";
import { el } from "./ui/dom.js";
import { renderHelp } from "./ui/help.js";
import { createIcons, toolCursor } from "./ui/icons.js";
import { commandForKey, MOVES, moveCursor } from "./ui/keys.js";
import { computeLayout, fitZoom, giftSpots, picnicSeats } from "./ui/layout.js";
import { hideLoading, showNotice, showProgress, showSummary } from "./ui/loading.js";
import { plotSummary, renderHeader, renderPanel } from "./ui/panels.js";
import { drawFarm, plotAt } from "./ui/renderer.js";
import { loadSprites } from "./ui/sprites.js";
import { showToast } from "./ui/toast.js";
import { renderToolbar } from "./ui/toolbar.js";
import { tamperLines } from "./ui/tamper.js";
import { hideTip, showTip } from "./ui/tooltip.js";

// 이만큼 넘게 시간이 비면(컴퓨터 잠자기 등) 플레이 중이 아니라 "비운 시간"으로 보고 친구들이 돌봐요.
const AWAY_GAP_MS = 2 * 60 * 1000;
// 이보다 짧게 비운 건 안내 화면을 띄우지 않아요.
const AWAY_NOTICE_MS = 60 * 1000;
const MAX_LOG_PER_SAVE = 500; // 서버가 한 번에 받는 작업 기록 수
const FRAME_MS = 1000 / 24; // 1초에 24번 다시 그려요 (도트 느낌은 살리고, 움직임은 부드럽게)

const canvas = document.getElementById("farm");
const ctx = canvas.getContext("2d");
const toolbar = document.getElementById("toolbar");
const floatMenu = document.getElementById("float-menu");
const helpBox = document.getElementById("help");

const [speciesList, friends, recipes, crafts, smartfarmTemplates, mutations, unlocks, palette, manifest, boot] = await Promise.all([
  loadSpecies(),
  loadFriends(),
  loadRecipes(),
  loadCrafts(),
  loadSmartfarmTemplates(),
  loadMutations(),
  loadUnlocks(),
  loadPalette(),
  loadManifest(),
  loadState(),
]);
const sprites = await loadSprites(manifest);
const speciesById = new Map(speciesList.map((s) => [s.id, s]));
const icons = createIcons(sprites, speciesById);
const data = { speciesList, speciesById, palette, recipes, crafts, friends, icons, smartfarmTemplates, mutations, unlocks };
configureMutations(mutations); // 수확할 때 아주 가끔 돌연변이 (web/farm/codex.js)
let feasting = false; // 나눠 먹는 중에는 또 상을 차리지 않아요
let gifting = false; // 선물을 건네는 중에는 다음 선물을 기다려요
const animator = createAnimator(friends); // 농부(바쁘면 친구들이 도우러 와요), 드론, 스프링클러, 물길 연출
const cat = createCat(); // 헛간 옆 고양이
data.isPending = (plotId) => animator.isPending(plotId);

// ── 이 컴퓨터에서의 취향 (고른 탭, 고른 씨앗, 메뉴 접기) — 세이브가 아니라 브라우저에 보관 ──
const PREFS_KEY = "healing-farm-prefs";
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ tab: game.tab, seedChoice: game.seedChoice, seedFocus: game.seedFocus, folded: game.menu.folded }));
  } catch {
    // 저장이 막혀 있어도 지금 화면에서는 그대로 써요
  }
}
const prefs = loadPrefs();

const game = {
  state: boot.state,
  integrity: boot.integrity,
  selectedId: null, // 고른 칸 (키보드 커서)
  hoverId: null, // 마우스가 올라가 있는 칸
  preview: null, // 심기 전 미리보기 { plotId, speciesId, colorId }
  log: [], // 아직 서버에 보내지 않은 작업 기록
  tool: "look",
  seedChoice: prefs.seedChoice ?? {}, // 칸 종류마다 심을 씨앗 { field: { speciesId, colorId }, … }
  seedFocus: speciesById.has(prefs.seedFocus) ? prefs.seedFocus : speciesList[0].id, // 도구 막대에 보이는 씨앗
  tab: prefs.tab ?? "plot",
  // 메뉴: dock(옆에 붙이기) · float(농장 위 팝업) · window(새 창)
  menu: { mode: "dock", floatOpen: false, folded: Boolean(prefs.folded) },
  ui: {}, // 접어 둔 목록을 펼쳤는지 같은 작은 화면 상태
  journal: null, // 농장 일지 (일지 탭을 열면 서버에서 읽어요)
  lab: null, // 연구소 상태 (연구소 탭을 열면 서버에서 읽어요)
  labBench: null, // 지문 실험대의 "만약에" 계산 결과
  locust: null, // 메뚜기 떼 연출 중이면 { front }
};

// ── 해금: 이미 열린 희귀 색·레시피를 게임 데이터에 더하고, 새로 열린 것은 알려 줘요 ──
for (const unlock of unlocks) if ((game.state.meta.unlocked ?? []).includes(unlock.id)) applyUnlock(unlock, speciesById, recipes);
function noticeUnlocks() {
  for (const unlock of checkUnlocks(game.state, unlocks)) {
    applyUnlock(unlock, speciesById, recipes);
    record("unlock", { id: unlock.id }, "system");
    showToast(`🔓 새로 열렸어요: ${unlock.name}`);
    playSound("welcome");
  }
}

// ── 스마트팜: 블록 흐름(DAG)대로 농장이 일해요 (web/smartfarm/) ──
game.state.meta.smartfarm ??= newSmartfarm();
const machineEnv = { speciesList, speciesById, recipes, crafts, random: Math.random };

// 스마트팜 한 걸음. 일어난 일은 작업 기록에 남기고, quiet 가 아니면 실행이 끝났을 때 알려 줘요.
function runMachines(state, quiet = false) {
  const sf = state.meta.smartfarm;
  const events = tickSmartfarm(sf, state, state.meta.gameMinutes, machineEnv);
  for (const event of events) {
    record("smartfarm", event, "smartfarm");
    if (quiet || !event.run || event.run === "started") continue;
    const name = sf.dags.find((d) => d.id === event.dag)?.name ?? event.dag;
    if (!idleMode) showToast(event.run === "success" ? `🤖 스마트팜 "${name}" 다 했어요 ✔` : `🤖 스마트팜 "${name}" 이 멈췄어요. 블록 색을 확인해 보세요`);
    if (event.run === "success") playSound("craft");
  }
  return events;
}

// 연구소: 서버의 연구소와 이야기하고 지문 실험대를 계산해요 (save·draw·record 는 아래에 있는 함수예요)
const lab = createLab({ game, speciesById, save, draw, showToast, playSound, record });

// 농장 상태가 몇 시(현실 시각, ms)까지 계산되어 있는지
let lastTick = boot.serverNow;
let busy = false; // 비운 시간을 처리하는 동안에는 1초 시계를 멈춥니다

// ── 멍때리기 모드 ──
// 농부들이 알아서 수확하고, 물 주고, 씨앗을 심어요 (작물과 색은 무작위). 메뉴는 숨기고 농장을 크게 보여 줘요.
const IDLE_KEY = "healing-farm-idle";
const IDLE_STEP_MS = 1200; // 이만큼마다 할 일을 하나씩 찾아요
const IDLE_MAX_JOBS = 3; // 한꺼번에 맡기는 일은 이만큼까지 (느긋하게)
let idleMode = false;
try {
  idleMode = localStorage.getItem(IDLE_KEY) === "on";
} catch {
  // 브라우저 저장이 막혀 있으면 꺼진 채로 시작
}

function setIdleMode(on) {
  idleMode = on;
  try {
    localStorage.setItem(IDLE_KEY, on ? "on" : "off");
  } catch {
    // 저장이 안 돼도 지금 화면에서는 바뀌어요
  }
  document.body.classList.toggle("idle-mode", on);
  document.getElementById("idle-btn").replaceChildren(on ? "🍃 멍때리기 끝내기 " : "🍃 멍때리기 ", el("kbd", {}, "M"));
  fitScreen();
}

let idleSteps = 0;
let lastFeastAt = 0;

function idleStep() {
  // 밤 10시 ~ 새벽 5시에는 다들 쉬어요 (쿨쿨)
  const resting = idleMode && isRestTime(game.state.meta.gameMinutes);
  animator.setResting(resting);
  if (!idleMode || resting || busy || document.hidden || animator.pendingCount() >= IDLE_MAX_JOBS) return;
  idleSteps += 1;
  const task = nextTask(game.state, speciesList, (id) => animator.isPending(id));
  // 부엌일은 가끔: 밭일이 없을 때, 또는 다섯 번에 한 번
  if (!task || idleSteps % 5 === 0) {
    const kitchen = nextKitchenTask(game.state, recipes, { feasting, msSinceFeast: performance.now() - lastFeastAt });
    if (kitchen) return actions[kitchen.kind](kitchen.recipeId, { quiet: true });
  }
  if (task) sendWorker(task.plot, task, { quiet: true });
}

// ── 메뉴를 새 창으로 (다른 모니터로 옮겨 쓰기) ──
let menuWindow = null;

function popOutMenu() {
  if (menuWindow && !menuWindow.closed) return menuWindow.focus();
  menuWindow = window.open("/web/menu.html", "healing-farm-menu", "popup,width=420,height=820");
  if (!menuWindow) showToast("새 창이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해 주세요");
}

// menu.html 이 다 열리면 알려 와요 → 그때부터 메뉴를 그 창에 그려요
addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== menuWindow) return;
  if (event.data?.type === "menu-ready") {
    menuWindow.addEventListener("keydown", handleKey);
    menuWindow.addEventListener("pointerdown", unlockAudio);
    refreshMenu();
  }
});
// 새 창을 닫으면 메뉴가 원래 자리로 돌아와요. 농장 창을 닫으면 메뉴 창도 함께 닫아요.
setInterval(() => {
  if (menuWindow?.closed) {
    menuWindow = null;
    refreshMenu();
  }
}, 700);
addEventListener("pagehide", () => menuWindow?.close());

// ── 반응형 화면과 메뉴 자리 ──
// 넓은 가로 화면(16:9 PC)은 메뉴를 옆에 붙이고(dock), 접었거나 좁은·세로 화면이면 농장 위 팝업(float)으로,
// 새 창으로 띄웠으면(window) 농장만 크게 보여요.
const DOCK_MIN_WIDTH = 1000;
const PANEL_WIDTH = 360;
let layout;

function menuMode() {
  if (menuWindow && !menuWindow.closed) return "window";
  const wide = innerWidth >= DOCK_MIN_WIDTH && innerWidth > innerHeight;
  return wide && !game.menu.folded && !idleMode ? "dock" : "float";
}

function fitScreen() {
  game.menu.mode = menuMode();
  document.body.classList.toggle("menu-float", game.menu.mode === "float");
  document.body.classList.toggle("menu-window-open", game.menu.mode === "window");
  const portrait = innerHeight > innerWidth;
  layout = computeLayout(game.state.plots, portrait);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const header = document.querySelector("header").offsetHeight;
  const bar = idleMode ? 0 : toolbar.offsetHeight + 8;
  const availableWidth = innerWidth - 40 - (game.menu.mode === "dock" ? PANEL_WIDTH + 16 : 0);
  const availableHeight = innerHeight - header - bar - 32;
  const zoom = fitZoom(layout, availableWidth, availableHeight);
  canvas.style.width = `${Math.floor(layout.width * zoom)}px`;
}

function refreshMenu() {
  fitScreen();
  panelKey = "";
  toolbarKey = "";
  draw();
}

addEventListener("resize", refreshMenu);

function selectedPlot() {
  return game.state.plots.find((p) => p.id === game.selectedId) ?? null;
}

// 작업 기록 한 줄. 새 기록은 모양을 맞춰요 (docs/learn/04 의 "정리가 필요한 진짜 사례"):
//   actor: id (player · haneul · idle · system · smartfarm …), detail: JSON 글자 {"plot":3,"species":"tomato"}
const ACTOR_IDS = new Map([...friends.map((f) => [f.name, f.id]), ["멍때리기", "idle"]]);
function record(action, detail = {}, actor = "player") {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  game.log.push({ at: game.state.meta.gameMinutes, actor: ACTOR_IDS.get(actor) ?? actor, action, detail: text });
}

// 규칙 함수의 결과({ ok, message })를 알림으로 보여 주고, 성공했으면 기록하고 효과음을 냅니다.
//   quiet: 멍때리기 모드처럼 알림 글은 띄우지 않고 소리와 기록만
function report(result, action, detail, sound, actor = "player", quiet = false) {
  if (!quiet && result.message) showToast(result.message);
  if (result.ok) {
    record(action, detail, actor);
    if (sound) playSound(sound);
  }
  draw();
}

// 일 종류마다, 사람이 칸에 도착해서 실제로 하는 일 (task 에는 심을 작물과 색 같은 정보)
const JOB_RULES = {
  plant: (p, task) => plant(game.state, p, speciesById.get(task.speciesId), task.colorId),
  // 흙이 젖는 건 물뿌리개를 기울이는 순간이에요
  water: (p) => (water(p) ? { ok: true, message: "물을 줬어요" } : { ok: false, message: "물을 줄 작물이 없어요" }),
  flood: (p) => (flood(p) ? { ok: true, message: "논에 물을 가득 채웠어요" } : { ok: false, message: "물을 댈 수 없어요" }),
  harvest: (p) => (p.crop ? harvest(game.state, p, speciesById.get(p.crop.species)) : { ok: false, message: "수확할 작물이 없어요" }),
};
const JOB_SOUNDS = { plant: "plant", water: "water", flood: "water", harvest: "harvest" };

// 칸에 사람을 보내 일을 맡겨요. 농부가 바쁘면 친구가 도우러 오고, 친구가 한 일은 친구 이름으로 알리고 기록해요.
//   quiet: 멍때리기 모드나 여러 칸을 끌어서 일할 때처럼 알림 글 없이 (효과음과 기록은 남아요)
function sendWorker(plot, task, { quiet = false } = {}) {
  if (animator.isPending(plot.id)) {
    if (!quiet) report({ ok: false, message: "이 칸에는 벌써 일하러 가고 있어요" });
    return;
  }
  animator.work(
    plot,
    task.kind,
    (p, worker) => {
      const before = p.crop; // 수확하면 사라지니까 미리 봐 둬요
      const result = JOB_RULES[task.kind](p, task);
      const detail =
        task.kind === "plant"
          ? { plot: p.id, species: task.speciesId, color: task.colorId }
          : task.kind === "harvest"
            ? { plot: p.id, species: before?.species, count: speciesById.get(before?.species)?.yield ?? 0 }
            : { plot: p.id, count: 1 };
      const actor = worker.name ?? (idleMode ? "멍때리기" : "player");
      const message = worker.name && result.ok ? `${josa(worker.name, "이가", "가")} 도와줬어요. ${result.message}` : result.message;
      report({ ...result, message }, task.kind, detail, JOB_SOUNDS[task.kind], actor, quiet);
    },
    performance.now(),
  );
  draw();
}

// 지금 든 도구(또는 "알맞은 일")로 이 칸에 일하기
//   painting: 마우스를 끌며 여러 칸에 일하는 중 → 할 수 없는 칸은 조용히 건너뛰어요
function workOn(plot, { smart = false, painting = false } = {}) {
  const task = smart ? smartTask(plot, game.state, speciesList, game.seedChoice) : toolTask(game.tool, plot, game.state, speciesList, game.seedChoice);
  if (!task.kind) {
    if (!painting && task.reason) showToast(task.reason);
    return;
  }
  if (animator.isPending(plot.id)) {
    if (!painting) showToast("이 칸에는 벌써 일하러 가고 있어요");
    return;
  }
  sendWorker(plot, task, { quiet: painting });
}

const BULK_HELPERS = {
  thirsty: { run: "drone", name: "드론", sound: "drone", dropSound: "drip" },
  highWater: { run: "sprinklers", name: "스프링클러", sound: "sprinkler" },
  paddy: { run: "flow", name: "물길", sound: "flow" },
};

// 도구 바꾸기: 마우스 모양도 그 도구로 바뀌어요
const cursors = {};
async function setTool(tool) {
  game.tool = tool;
  game.preview = null;
  cursors[tool] ??= await toolCursor(tool);
  if (game.tool === tool) canvas.style.cursor = cursors[tool];
  draw();
}

function setSeedFocus(speciesId, choice) {
  game.seedFocus = speciesId;
  game.seedChoice = choice;
  savePrefs();
  if (game.tool !== "seed") setTool("seed");
  else draw();
}

const actions = {
  plant(speciesId, colorId) {
    game.preview = null;
    const species = speciesById.get(speciesId);
    // 메뉴에서 고른 씨앗은 씨앗 도구(3)에도 기억해 둬요
    game.seedChoice = { ...game.seedChoice, [selectedPlot().kind]: { speciesId, colorId } };
    game.seedFocus = species.id;
    savePrefs();
    sendWorker(selectedPlot(), { kind: "plant", speciesId, colorId });
  },
  // 밭 탭에서 작물 그림을 고르면: 그 칸 종류에 심을 씨앗으로 기억해요 (색은 전에 고른 색 그대로)
  pickSeed(speciesId) {
    const species = speciesById.get(speciesId);
    const kind = PLOT_FOR_TYPE[species.type];
    const before = game.seedChoice[kind];
    const colorId = before?.speciesId === speciesId ? before.colorId : species.colors[0].id;
    game.seedChoice = { ...game.seedChoice, [kind]: { speciesId, colorId } };
    game.seedFocus = speciesId;
    savePrefs();
    draw();
  },
  // 접었다 편 메뉴처럼, 다시 그려도 그대로 두고 싶은 화면 상태
  remember(key, value, redraw = false) {
    game.ui[key] = value;
    if (redraw) draw();
  },
  // 도감 라벨 달기 (web/farm/codex.js): 정답과 비교해 알려 주고, 틀려도 등록돼요
  labelCodex(entryId, draft) {
    const entry = (game.state.meta.codex ?? []).find((e) => e.id === entryId);
    if (!entry) return;
    const result = labelEntry(entry, draft, draft.name ?? "", game.state.meta.gameMinutes);
    game.ui.relabel = result.score === 3 ? null : entry.id;
    report({ ok: true, message: result.message }, "label", { id: entry.id, score: result.score }, result.score === 3 ? "harvest" : null);
    noticeUnlocks();
  },
  async refreshJournal() {
    try {
      game.journal = await loadJournal();
    } catch {
      game.journal = { error: "일지를 읽을 수 없어요. 서버가 켜져 있는지 확인해 주세요." };
    }
    draw();
  },
  // 스마트팜 (web/smartfarm/editor.js) — 고치면 바로 그려요
  sfAddTemplate(templateId) {
    const result = addFromTemplate(game.state.meta.smartfarm, smartfarmTemplates.find((t) => t.id === templateId));
    if (result.ok) game.ui.sfDag = result.dagId;
    report(result, "smartfarm_edit", { dag: result.dagId ?? templateId });
  },
  sfRemoveDag(dagId) {
    if (confirm("이 흐름을 지울까요?")) report(removeDag(game.state.meta.smartfarm, dagId), "smartfarm_edit", { dag: dagId });
  },
  sfTrigger(dagId) {
    const sf = game.state.meta.smartfarm;
    const ok = triggerRun(sf, sf.dags.find((d) => d.id === dagId), game.state.meta.gameMinutes);
    report({ ok, message: ok ? "▶ 실행을 시작했어요" : "이미 실행 중이에요" }, "smartfarm_run", { dag: dagId });
    if (ok) runMachines(game.state);
    draw();
  },
  sfSchedule: (dagId, schedule) => report(setSchedule(game.state.meta.smartfarm, dagId, schedule), "smartfarm_edit", { dag: dagId }),
  sfAddTask: (dagId, block) => report(addTask(game.state.meta.smartfarm, dagId, block), "smartfarm_edit", { dag: dagId }),
  sfRemoveTask: (dagId, taskId) => report(removeTask(game.state.meta.smartfarm, dagId, taskId), "smartfarm_edit", { dag: dagId }),
  sfOption: (dagId, taskId, key, value) => report(setOption(game.state.meta.smartfarm, dagId, taskId, key, value), "smartfarm_edit", { dag: dagId }),
  sfEdge(dagId, from, to, on) {
    const sf = game.state.meta.smartfarm;
    const result = on ? connect(sf, dagId, from, to) : disconnect(sf, dagId, from, to);
    if (!result.ok) panelKey = ""; // 거부했으면 눌린 체크 표시를 되돌리려고 메뉴를 다시 그려요
    report(result, "smartfarm_edit", { dag: dagId });
  },
  // 연구소 (web/lab/sandbox.js)
  labSend: (speciesId, count) => lab.send(speciesId, count),
  labFuel: (sampleId) => lab.fuel(sampleId),
  labExperiment: (sampleId, color, size) => lab.experiment(sampleId, color, size),
  labWhatIf: (sampleId, count) => lab.whatIf(sampleId, count),
  labClear() {
    if (confirm("연구소를 비울까요? 실험 작물은 모두 사라져요.")) lab.clear();
  },
  preview(speciesId, colorId) {
    game.preview = speciesId ? { plotId: game.selectedId, speciesId, colorId } : null;
  },
  water() {
    sendWorker(selectedPlot(), { kind: "water" });
  },
  flood() {
    sendWorker(selectedPlot(), { kind: "flood" });
  },
  harvest() {
    sendWorker(selectedPlot(), { kind: "harvest" });
  },
  smartSelected() {
    const plot = selectedPlot();
    if (plot) workOn(plot, { smart: true });
  },
  // 일괄 관리는 기계가 도와줘요: 목마른 작물은 드론, 물 많이 먹는 작물은 스프링클러, 논은 물길
  bulk(kind) {
    const targets = bulkTargets(game.state, speciesById, kind);
    if (!targets.length) return report({ ok: false, message: `${BULK[kind].label}: 해당하는 칸이 없어요` });
    const helper = BULK_HELPERS[kind];
    let count = 0;
    const apply = (plot) => {
      if (BULK[kind].action(plot)) count += 1;
      if (helper.dropSound) playSound(helper.dropSound);
      draw();
    };
    const done = () => report({ ok: count > 0, message: `${helper.name}: ${BULK[kind].label} ${count}칸` }, "bulk", { kind, count });
    playSound(helper.sound);
    animator[helper.run](targets, apply, done, performance.now());
  },
  setBorder(borderId) {
    const plot = selectedPlot();
    if (setBorder(plot, borderId)) record("decor", { plot: plot.id, border: borderId });
    draw();
  },
  borderToKind() {
    const plot = selectedPlot();
    const count = applyBorderToKind(game.state, plot.kind, plot.border);
    report({ ok: count > 0, message: count ? `${PLOT_NAMES[plot.kind]} ${count}칸의 테두리를 바꿨어요` : "이미 모두 같은 색이에요" }, "decor", { kind: plot.kind, border: plot.border });
  },
  // 요리: 재료를 꺼내 두고, 농부가 화덕에 가서 보글보글 끓이면 창고에 요리가 들어가요.
  cook(recipeId, { quiet = false } = {}) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const started = startCooking(game.state, recipe);
    if (!started.ok) return report(started, "cook", { recipe: recipe.id }, null, "player", quiet);
    const spot = { x: layout.kitchen.x - 2 - layout.farm.x, y: layout.kitchen.y + 15 - layout.farm.y };
    animator.cook(spot, (worker) => {
      const result = finishCooking(game.state, recipe);
      const who = worker.name ? `${josa(worker.name, "이가", "가")} ` : "";
      report({ ...result, message: `${who}${result.message}` }, "cook", { recipe: recipe.id }, "cook", worker.name ?? "player", quiet);
    });
    if (!quiet) showToast(started.message);
    draw();
  },
  // 나눠 먹기: 농부와 친구들이 돗자리에 둘러앉아 맛있게 먹어요. 제일 좋아하는 요리면 머리 위에 ★
  share(recipeId, { quiet = false } = {}) {
    if (feasting) return report({ ok: false, message: "지금 다 같이 먹고 있어요. 다 먹으면 또 차려 주세요" }, "share", {}, null, "player", quiet);
    const recipe = recipes.find((r) => r.id === recipeId);
    const result = share(game.state, recipe);
    if (!result.ok) return report(result, "share", { recipe: recipe.id }, null, "player", quiet);
    feasting = true;
    const { center, seats } = picnicSeats(layout.picnic);
    const rel = (p) => ({ ...p, x: p.x - layout.farm.x, y: p.y - layout.farm.y });
    const fans = new Set(fansOf(recipe, friends).map((f) => f.id));
    playSound("call");
    animator.feast(
      seats.map(rel),
      recipe.id,
      rel(center),
      () => {
        feasting = false;
        lastFeastAt = performance.now();
        report({ ...result, message: shareMessage(recipe, friends) }, "share", { recipe: recipe.id }, "yum", "player", quiet);
      },
      fans,
    );
    if (!quiet) showToast("다들 모여라~ 맛있는 거 먹자!");
    draw();
  },
  // 꽃 공방: 꽃을 꺼내 두고, 농부가 헛간 앞에서 엮어 만들면 창고로 (꾸미기 물건은 마당에 저절로 놓여요)
  craft(id) {
    const craft = crafts.find((c) => c.id === id);
    const started = startCraft(game.state, craft);
    if (!started.ok) return report(started, "craft", { craft: craft.id });
    const spot = { x: layout.barn.x + 4 - layout.farm.x, y: layout.barn.y + 34 - layout.farm.y };
    animator.craft(spot, (worker) => {
      const result = finishCraft(game.state, craft);
      const who = worker.name ? `${josa(worker.name, "이가", "가")} ` : "";
      report({ ...result, message: `${who}${result.message}` }, "craft", { craft: craft.id }, "craft", worker.name ?? "player");
    });
    showToast(started.message);
    draw();
  },
  // 선물하기: 농부가 돗자리 옆에서 기다리면 친구가 와서 받아요. 좋아하는 꽃이 들어 있으면 ★
  gift(id, friendId) {
    if (gifting) return report({ ok: false, message: "지금 선물을 건네는 중이에요. 조금만 기다려 주세요" });
    const craft = crafts.find((c) => c.id === id);
    const friend = friends.find((f) => f.id === friendId);
    const result = giveGift(game.state, craft, friend);
    if (!result.ok) return report(result, "gift", { craft: craft.id, friend: friend.id });
    gifting = true;
    const spots = giftSpots(layout.picnic);
    const rel = (p) => ({ ...p, x: p.x - layout.farm.x, y: p.y - layout.farm.y });
    animator.gift({ giver: rel(spots.giver), taker: rel(spots.taker), item: rel(spots.item) }, friend, craft.id, result.loved, () => {
      gifting = false;
      report(result, "gift", { craft: craft.id, friend: friend.id, loved: result.loved }, "gift");
    });
    showToast(`${josa(friend.name, "이를", "를")} 불렀어요. ${josa(craft.name.ko, "을", "를")} 들고 기다려요`);
    draw();
  },
  setTimeScale(scale) {
    tick(); // 지금까지는 이전 배율로 계산하고
    game.state.meta.timeScale = scale; // 지금부터 새 배율로
    report({ ok: true, message: `시간 배율을 ×${scale}로 바꿨어요` }, "time_scale", { scale });
  },
  setSound(change) {
    setSound(change);
  },
  setTool,
  cycleSeed(step) {
    const { choice, speciesId } = cycleSeed(game.seedChoice, speciesList, game.seedFocus, step);
    setSeedFocus(speciesId, choice);
  },
  cycleColor() {
    setSeedFocus(game.seedFocus, cycleColor(game.seedChoice, speciesList, game.seedFocus));
  },
  // 탭 고르기: 메뉴가 붙어 있으면 탭만 바꾸고, 팝업이면 열고 닫아요 (같은 탭을 다시 누르면 닫혀요)
  setTab(tab) {
    game.tab = tab;
    savePrefs();
    draw();
    if (tab === "lab") lab.refresh(); // 연구소는 열 때마다 서버에서 새로 읽어요 (게임 밖에서 고쳤을 수도 있으니까요)
    if (tab === "journal") save({ silent: true }).then(() => actions.refreshJournal()); // 방금 한 일까지 일지에 보이도록 저장부터
  },
  openTab(tab) {
    if (game.menu.mode === "float") game.menu.floatOpen = !(game.menu.floatOpen && game.tab === tab);
    if (game.menu.mode === "window") menuWindow.focus();
    actions.setTab(tab);
  },
  toggleMenu() {
    if (game.menu.mode === "window") return menuWindow.focus();
    game.menu.folded = game.menu.mode === "dock";
    game.menu.floatOpen = false;
    savePrefs();
    refreshMenu();
    showToast(game.menu.folded ? "메뉴를 접었어요. 탭 키(P·I·K·O)를 누르면 팝업으로 열려요" : "메뉴를 폈어요");
  },
  popOutMenu,
  toggleHelp,
};

// 저장했으면 true
async function save({ silent = false, keepalive = false } = {}) {
  if (game.integrity !== "ok") return false;
  // 보내는 기록은 목록에서 꺼내 두고, 실패하면 되돌려 놓아요. (두 번 저장되는 일을 막기 위해)
  const sending = game.log.splice(0, MAX_LOG_PER_SAVE);
  let saved = false;
  try {
    const result = await saveState(game.state, sending, keepalive);
    saved = result.ok;
    if (result.ok) {
      game.state.meta.lastSavedAt = result.lastSavedAt;
      if (!silent) {
        showToast("저장했어요");
        playSound("save");
      }
    } else {
      game.log.unshift(...sending);
      showToast(`저장하지 못했어요: ${result.error ?? result.status}`);
    }
  } catch {
    game.log.unshift(...sending);
    if (!keepalive) showToast("서버와 연결할 수 없어요. 서버 창이 켜져 있는지 확인해 주세요.");
  }
  draw();
  return saved;
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// 비운 시간(fromMs ~ toMs)을 친구들과 함께 처리하고, 있었던 일을 안내합니다.
async function catchUp(fromMs, toMs) {
  const plan = planOffline(fromMs, toMs, game.state.meta.timeScale);
  const notice = plan.clockWentBack || plan.realMs >= AWAY_NOTICE_MS;
  if (plan.clockWentBack) record("clock_backwards", { ms: plan.realMs }, "system");
  const away = newReport();
  let machineRuns = 0; // 비운 사이 스마트팜이 끝낸 실행 수
  // 새로고침처럼 아주 잠깐 비운 건 친구들이 나서지 않아요. (다 자란 작물은 플레이어가 직접 수확하도록)
  const helpers = notice ? friends : [];
  // 하루치(게임 시간)씩 나눠 처리하고, 그 사이에 진행 막대를 그려요. 한 번에 하면 화면이 멈춘 것처럼 보여요.
  let done = 0;
  while (done < plan.gameMinutes) {
    const slice = Math.min(MINUTES_PER_DAY, plan.gameMinutes - done);
    simulateOffline(game.state, speciesById, helpers, slice, away, (s) => {
      for (const e of runMachines(s, true)) if (e.run && e.run !== "started") machineRuns += 1;
    });
    done += slice;
    if (notice) {
      showProgress("친구들에게 농장 소식을 듣는 중…", done / plan.gameMinutes);
      await nextFrame();
    }
  }
  game.log.push(...reportToLog(away, game.state.meta.gameMinutes, friends));
  lastTick = toMs;
  lastWeather = weatherAt(game.state.meta.gameMinutes, farmSeed(game.state)); // 비운 사이 바뀐 날씨는 알림 없이
  draw();
  await save({ silent: true }); // 처리한 결과를 바로 저장
  if (!notice) {
    hideLoading();
    return;
  }
  // 소리는 화면을 한 번 누른 뒤에만 낼 수 있어서, 아직 못 냈으면 "농장으로" 버튼을 누를 때 인사해요
  const greeted = playSound("welcome");
  const lines = summarize(plan, away, speciesById, friends);
  if (machineRuns) lines.push(`🤖 스마트팜이 흐름을 ${machineRuns}번 끝까지 실행했어요`);
  await showSummary(lines);
  if (!greeted) playSound("welcome");
}

async function tick() {
  if (busy || document.hidden) return; // 숨겨진 동안은 멈췄다가, 돌아오면 비운 시간으로 처리해요
  const now = Date.now();
  const elapsed = now - lastTick;
  if (elapsed > AWAY_GAP_MS || elapsed < 0) {
    busy = true;
    await catchUp(lastTick, now);
    busy = false;
    return;
  }
  lastTick = now;
  advanceFarm(game.state, speciesById, realMsToGameMinutes(elapsed, game.state.meta.timeScale));
  runMachines(game.state);
  noticeUnlocks();
  if (!idleMode) game.state.meta.playSeconds += elapsed / 1000; // 직접 플레이한 시간 (멍때리기는 빼요)
  noticeWeather();
  updateTip();
  draw();
}

// 비가 오기 시작하거나 무지개가 뜨면 살짝 알려 줘요
const WEATHER_NEWS = {
  rain: "비가 내리기 시작했어요. 작물들이 촉촉해져요 ☔",
  snow: "눈이 소복소복 내려요 ❄",
  rainbow: "비가 그치고 무지개가 떴어요 🌈",
};
let lastWeather = weatherAt(game.state.meta.gameMinutes, farmSeed(game.state));

function noticeWeather() {
  const weather = weatherAt(game.state.meta.gameMinutes, farmSeed(game.state));
  if (weather === lastWeather) return;
  lastWeather = weather;
  if (!WEATHER_NEWS[weather]) return;
  if (!idleMode) showToast(WEATHER_NEWS[weather]);
  playSound("weather");
}

// 자연의 소리가 지금이 밤인지, 비가 오는지, 무슨 계절인지 알 수 있게
setNatureEnv(() => {
  const minutes = game.state.meta.gameMinutes;
  return { night: lightAt(minutes).night, raining: weatherAt(minutes, farmSeed(game.state)) === "rain", season: seasonOf(minutes).id };
});

// ── 화면 다시 그리기 ──
// 메뉴와 도구 막대는 보이는 내용이 바뀔 때만 다시 만듭니다. 매초 다시 만들면 누르던 버튼이 사라질 수 있어요.
let panelKey = "";
let toolbarKey = "";

function menuRoot() {
  if (game.menu.mode === "window") return menuWindow?.document.getElementById("panel") ?? null;
  if (game.menu.mode === "float") return game.menu.floatOpen ? floatMenu : null;
  return document.getElementById("panel");
}

function draw() {
  renderHeader(game, palette);
  const plot = selectedPlot();
  const crop = plot?.crop;
  const root = menuRoot();
  floatMenu.hidden = !(game.menu.mode === "float" && game.menu.floatOpen);
  const key = JSON.stringify([
    game.menu.mode,
    game.menu.floatOpen,
    game.tab,
    game.selectedId,
    plot?.border,
    plot && animator.isPending(plot.id),
    crop && [crop.species, Math.floor(crop.progress * 100), Math.round(crop.moisture)],
    game.state.inventory,
    game.state.meta.timeScale,
    game.seedChoice,
    game.tab === "lab" && [game.lab, game.labBench, game.ui],
    game.tab === "smartfarm" && [game.state.meta.smartfarm, game.ui],
    game.tab === "journal" && [game.journal, game.state.meta.codex, game.state.meta.stats, game.state.meta.unlocked, game.ui.relabel],
  ]);
  if (root && key !== panelKey) {
    panelKey = key;
    renderPanel(root, game, data, actions);
    if (root === floatMenu) {
      root.prepend(el("button", { class: "close small ghost", "aria-label": "메뉴 닫기", onclick: closeFloatMenu }, "✕"));
    }
  }
  const barKey = JSON.stringify([game.tool, game.seedFocus, game.seedChoice, game.state.inventory, game.menu, game.tab]);
  if (barKey !== toolbarKey) {
    toolbarKey = barKey;
    renderToolbar(toolbar, game, data, actions);
  }
}

function closeFloatMenu() {
  game.menu.floatOpen = false;
  draw();
}

// 농장 그림은 따로 다시 그려요 (흔들리는 작물, 계절 효과, 물주기 연출)
let lastFrame = 0;
function animate(time) {
  if (time - lastFrame >= FRAME_MS) {
    lastFrame = time;
    animator.update(time);
    drawFarm(ctx, { ...data, layout, sprites, animator, cat, state: game.state, selectedId: game.selectedId, hoverId: game.hoverId, preview: game.preview, locust: game.locust, time });
  }
  requestAnimationFrame(animate);
}

// ── 마우스: 누르기·끌기·오른쪽 클릭·올리기·휠 ──
let drag = null; // 끌며 일하는 중 { smart, visited }
let pointer = null; // 마지막 마우스 위치 (정보 카드를 다시 그릴 때)

function farmPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const border = 4; // 캔버스 테두리 두께(px)
  const x = ((event.clientX - rect.left - border) * canvas.width) / (rect.width - border * 2);
  const y = ((event.clientY - rect.top - border) * canvas.height) / (rect.height - border * 2);
  return { x, y, plot: plotAt(game.state.plots, x - layout.farm.x, y - layout.farm.y) };
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.button !== 2) return;
  const { x, y, plot } = farmPoint(event);
  // 고양이를 누르면 쓰다듬어 줘요 (가르릉 ♥)
  const c = catRect(layout);
  if (event.button === 0 && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    petCat(cat, performance.now());
    playSound("purr");
    return;
  }
  if (!plot) {
    if (game.tool === "look") game.selectedId = null;
    return draw();
  }
  game.selectedId = plot.id;
  const smart = event.button === 2;
  if (smart || game.tool !== "look") {
    workOn(plot, { smart });
    drag = { smart, visited: new Set([plot.id]) };
    canvas.setPointerCapture(event.pointerId);
  } else if (game.menu.mode === "float" && !game.menu.floatOpen) {
    // 살펴보기 도구로 누르면 메뉴가 접혀 있어도 그 칸 정보를 팝업으로 보여 줘요
    game.tab = "plot";
    game.menu.floatOpen = true;
  } else {
    game.tab = "plot";
  }
  draw();
});

canvas.addEventListener("pointermove", (event) => {
  const { plot } = farmPoint(event);
  pointer = event.pointerType === "mouse" ? { x: event.clientX, y: event.clientY } : null;
  game.hoverId = plot?.id ?? null;
  // 씨앗 도구면 빈 칸에 심을 모습을 미리 보여 줘요
  const seed = plot && !plot.crop && game.tool === "seed" ? seedFor(plot, game.state, speciesList, game.seedChoice) : null;
  game.preview = seed ? { plotId: plot.id, ...seed } : null;
  updateTip();
  if (drag && plot && !drag.visited.has(plot.id)) {
    drag.visited.add(plot.id);
    game.selectedId = plot.id;
    workOn(plot, { smart: drag.smart, painting: true });
  }
});

const endDrag = () => {
  drag = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => {
  game.hoverId = null;
  if (game.tool === "seed") game.preview = null;
  pointer = null;
  hideTip();
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault()); // 오른쪽 클릭은 "알맞은 일"
canvas.addEventListener(
  "wheel",
  (event) => {
    if (game.tool !== "seed") return;
    event.preventDefault();
    const step = Math.sign(event.deltaY || event.deltaX);
    if (event.shiftKey) actions.cycleColor();
    else actions.cycleSeed(step);
  },
  { passive: false },
);

// 마우스가 올라간 칸의 정보 카드 (작물이 자라는 게 보이도록 1초마다 새로 그려요)
function updateTip() {
  const plot = game.state.plots.find((p) => p.id === game.hoverId);
  if (!plot || !pointer || drag) return hideTip();
  showTip(plotSummary(plot, data), pointer.x, pointer.y);
}

// ── 키보드 ──
function toggleHelp() {
  if (helpBox.hidden) renderHelp(helpBox, toggleHelp);
  helpBox.hidden = !helpBox.hidden;
}

const COMMANDS = {
  use() {
    if (game.selectedId === null) game.selectedId = moveCursor(game.state.plots, null, 0, 0);
    workOn(selectedPlot(), { smart: game.tool === "look" });
  },
  smart() {
    if (game.selectedId === null) game.selectedId = moveCursor(game.state.plots, null, 0, 0);
    workOn(selectedPlot(), { smart: true });
  },
  "seed:prev": () => actions.cycleSeed(-1),
  "seed:next": () => actions.cycleSeed(1),
  "seed:color": () => actions.cycleColor(),
  "menu:toggle": () => actions.toggleMenu(),
  "menu:window": () => popOutMenu(),
  idle: () => setIdleMode(!idleMode),
  save: () => save(),
  help: () => toggleHelp(),
  cancel() {
    if (!helpBox.hidden) return toggleHelp();
    if (game.menu.mode === "float" && game.menu.floatOpen) return closeFloatMenu();
    if (game.tool !== "look") return setTool("look");
    game.selectedId = null;
    draw();
  },
};

function runCommand(command) {
  const [name, arg] = command.split(":");
  if (MOVES[name]) {
    game.selectedId = moveCursor(game.state.plots, game.selectedId, ...MOVES[name]);
    return draw();
  }
  if (name === "tool") return setTool(arg);
  if (name === "bulk") return actions.bulk(arg);
  if (name === "tab") return actions.openTab(arg);
  COMMANDS[command]?.();
}

function handleKey(event) {
  // 안내 화면이 떠 있으면 Enter·Space·Esc 로 닫아요
  const close = document.getElementById("loading-close");
  if (!document.getElementById("loading").hidden) {
    if (!close.hidden && ["Enter", " ", "Escape"].includes(event.key)) {
      event.preventDefault();
      close.click();
    }
    return;
  }
  // 도움말이 떠 있을 때는 닫는 키만
  if (!helpBox.hidden && !["Escape", "?"].includes(event.key)) return;
  const command = commandForKey(event);
  if (!command || event.repeat && !MOVES[command]) return; // 꾹 누르면 칸 옮기기만 이어서
  event.preventDefault(); // 방향키·Space 로 화면이 스크롤되거나 Ctrl+S 로 저장 창이 뜨지 않게
  runCommand(command);
}

addEventListener("keydown", handleKey);
document.getElementById("save-btn").addEventListener("click", () => save());
document.getElementById("idle-btn").addEventListener("click", () => setIdleMode(!idleMode));
document.getElementById("help-btn").addEventListener("click", toggleHelp);
helpBox.addEventListener("click", (event) => {
  if (event.target === helpBox) toggleHelp(); // 바깥을 누르면 닫혀요
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick(); // 돌아오자마자 비운 시간 처리
});
// 첫 클릭·키 입력 때 소리 장치를 준비해요 (브라우저 규칙)
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// ── 시작 ──
draw(); // 도구 막대를 먼저 그려야 화면 크기를 맞출 수 있어요
setIdleMode(idleMode); // 버튼 글자와 화면 크기 맞추기 (fitScreen 포함)
setTool("look");
if (game.tab === "lab") lab.refresh();
if (game.tab === "journal") actions.refreshJournal();
requestAnimationFrame(animate);
if (boot.recovery) {
  showToast(
    boot.recovery.restoredFrom
      ? "세이브 파일이 깨져 있어서 최근 백업으로 복구했어요"
      : "세이브 파일이 깨졌고 백업이 없어 새 농장으로 시작해요",
  );
}
// ── 무결성 이상(변조): 무엇이 바뀌었는지 보여 주고 → 메뚜기 떼 → 완전 초기화 ──
// 지문이 맞지 않는 세이브는 서버가 저장을 잠가요. 약속(docs/PLAN.md 의 확정된 기획 결정)대로 처음부터 다시 시작해요.
const LOCUST_MS = 4000;
async function tamperFlow() {
  await showNotice("세이브 파일이 게임 밖에서 바뀌었어요", tamperLines(boot.tamperDiff), "메뚜기 떼 맞이하기");
  const from = layout.farm.x - 8;
  const to = layout.width + 60; // 떼의 꼬리까지 화면 밖으로
  game.locust = { front: from };
  const buzz = setInterval(() => playSound("locust"), 950);
  playSound("locust");
  await new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / LOCUST_MS);
      game.locust.front = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  clearInterval(buzz);
  const result = await resetFarm();
  if (!result.ok) {
    game.locust = null;
    return showToast(`처음부터 다시 시작하지 못했어요: ${result.error ?? result.status}`);
  }
  location.replace("/?fresh=1"); // 새 농장으로 다시 열기
}

// 게임에 새 작물이 늘었으면 씨앗을 한 번 선물해요 (아래 catchUp 이 끝나면 함께 저장돼요)
const gifts = giftNewSeeds(game.state, speciesList);
if (gifts.length) record("seed_gift", { species: gifts.map((s) => s.id) }, "system");
if (game.integrity === "tampered") {
  hideLoading();
  await tamperFlow(); // 초기화되면 페이지를 새로 열어요
} else {
  busy = true;
  showProgress("농장으로 가는 중…", 0);
  await catchUp(game.state.meta.lastSavedAt, boot.serverNow); // 마지막 저장부터 지금까지 (끝나면 저장)
  busy = false;
  if (gifts.length) showToast(giftMessage(gifts));
  if (new URLSearchParams(location.search).has("fresh")) {
    showToast("메뚜기 떼가 지나갔어요. 새 농장에서 다시 시작해요 🌱");
    history.replaceState(null, "", "/");
  }
  startAutosave(save);
}
setInterval(tick, 1000);
setInterval(idleStep, IDLE_STEP_MS);
