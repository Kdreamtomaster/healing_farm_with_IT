// 게임 시작점: 데이터와 세이브를 불러와 비운 시간을 처리하고, 1초마다 농장의 시간을 흘려보냅니다.
import { loadFriends, loadManifest, loadPalette, loadRecipes, loadSpecies, loadState, saveState } from "./api.js";
import { applyBorderToKind, setBorder } from "./decor/plots-style.js";
import { BULK, bulkTargets, flood, water } from "./farm/care.js";
import { advanceFarm } from "./farm/crops.js";
import { lightAt, isRestTime } from "./decor/daylight.js";
import { seasonOf } from "./decor/season.js";
import { nextKitchenTask, nextTask } from "./farm/autopilot.js";
import { farmSeed, weatherAt } from "./farm/weather.js";
import { fansOf, finishCooking, share, shareMessage, startCooking } from "./friends/cooking.js";
import { harvest, plant } from "./farm/harvest.js";
import { playSound, setNatureEnv, setSound, unlockAudio } from "./sound/engine.js";
import { josa, PLOT_NAMES } from "./text.js";
import { startAutosave } from "./time/autosave.js";
import { MINUTES_PER_DAY, realMsToGameMinutes } from "./time/clock.js";
import { newReport, planOffline, simulateOffline } from "./time/offline.js";
import { reportToLog, summarize } from "./time/summary.js";
import { createAnimator } from "./ui/animations.js";
import { catRect, createCat, petCat } from "./ui/critters.js";
import { hideLoading, showProgress, showSummary } from "./ui/loading.js";
import { renderHeader, renderPanel } from "./ui/panels.js";
import { computeLayout, fitZoom, picnicSeats } from "./ui/layout.js";
import { drawFarm, plotAt } from "./ui/renderer.js";
import { loadSprites } from "./ui/sprites.js";
import { showToast } from "./ui/toast.js";

// 이만큼 넘게 시간이 비면(컴퓨터 잠자기 등) 플레이 중이 아니라 "비운 시간"으로 보고 친구들이 돌봐요.
const AWAY_GAP_MS = 2 * 60 * 1000;
// 이보다 짧게 비운 건 안내 화면을 띄우지 않아요.
const AWAY_NOTICE_MS = 60 * 1000;
const MAX_LOG_PER_SAVE = 500; // 서버가 한 번에 받는 작업 기록 수
const FRAME_MS = 1000 / 24; // 1초에 24번 다시 그려요 (도트 느낌은 살리고, 움직임은 부드럽게)

const canvas = document.getElementById("farm");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("panel");

const [speciesList, friends, recipes, palette, manifest, boot] = await Promise.all([
  loadSpecies(),
  loadFriends(),
  loadRecipes(),
  loadPalette(),
  loadManifest(),
  loadState(),
]);
const sprites = await loadSprites(manifest);
const speciesById = new Map(speciesList.map((s) => [s.id, s]));
const data = { speciesList, speciesById, palette, recipes };
let feasting = false; // 나눠 먹는 중에는 또 상을 차리지 않아요
const animator = createAnimator(friends); // 농부(바쁘면 친구들이 도우러 와요), 드론, 스프링클러, 물길 연출
const cat = createCat(); // 헛간 옆 고양이
data.isPending = (plotId) => animator.isPending(plotId);

const game = {
  state: boot.state,
  integrity: boot.integrity,
  selectedId: null,
  preview: null, // 심기 전 미리보기 { plotId, speciesId, colorId }
  log: [], // 아직 서버에 보내지 않은 작업 기록
};

// 농장 상태가 몇 시(현실 시각, ms)까지 계산되어 있는지
let lastTick = boot.serverNow;
let busy = false; // 비운 시간을 처리하는 동안에는 1초 시계를 멈춥니다

// ── 멍때리기 모드 ──
// 농부들이 알아서 수확하고, 물 주고, 씨앗을 심어요 (작물과 색은 무작위). 메뉴는 숨기고 농장을 크게 보여 줘요.
// 켜 두었는지는 이 컴퓨터의 취향이라 브라우저에 보관해요.
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
  document.getElementById("idle-btn").textContent = on ? "🍃 멍때리기 끝내기" : "🍃 멍때리기";
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

// ── 반응형 화면 ──
// 가로로 넓은 화면(16:9 PC)은 농장 옆에 메뉴, 세로 화면(9:16, 갤럭시 S25)이나 좁은 화면은 농장 아래에 메뉴.
// 세로 화면에서는 창고 마당도 밭 아래로 옮겨서 폭을 좁혀요.
const SIDE_PANEL_MIN_WIDTH = 1000; // 이보다 좁으면 메뉴를 아래로
const PANEL_WIDTH = 360;
let layout;

function fitScreen() {
  const portrait = innerHeight > innerWidth;
  const side = !portrait && innerWidth >= SIDE_PANEL_MIN_WIDTH && !idleMode;
  document.body.classList.toggle("stacked", !side);
  layout = computeLayout(game.state.plots, portrait);
  canvas.width = layout.width;
  canvas.height = layout.height;
  const header = document.querySelector("header").offsetHeight;
  const availableWidth = innerWidth - 32 - (side ? PANEL_WIDTH + 16 : 0);
  const availableHeight = side || idleMode ? innerHeight - header - 32 : (innerHeight - header) * (portrait ? 0.55 : 0.75);
  const zoom = fitZoom(layout, availableWidth, availableHeight);
  canvas.style.width = `${Math.floor(layout.width * zoom)}px`;
}
addEventListener("resize", fitScreen);
setIdleMode(idleMode); // 버튼 글자와 화면 크기 맞추기 (fitScreen 포함)

function selectedPlot() {
  return game.state.plots.find((p) => p.id === game.selectedId) ?? null;
}

function record(action, detail = "", actor = "player") {
  game.log.push({ at: game.state.meta.gameMinutes, actor, action, detail });
}

// 규칙 함수의 결과({ ok, message })를 알림으로 보여 주고, 성공했으면 기록하고 효과음을 냅니다.
//   quiet: 멍때리기 모드처럼 알림 글은 띄우지 않고 소리와 기록만
function report(result, action, detail, sound, actor = "player", quiet = false) {
  if (!quiet) showToast(result.message);
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
//   quiet: 멍때리기 모드처럼 알림 없이 조용히 (효과음과 기록은 남아요)
function sendWorker(plot, task, { quiet = false } = {}) {
  if (animator.isPending(plot.id)) {
    if (!quiet) report({ ok: false, message: "이 칸에는 벌써 일하러 가고 있어요" });
    return;
  }
  animator.work(
    plot,
    task.kind,
    (p, worker) => {
      const result = JOB_RULES[task.kind](p, task);
      const actor = worker.name ?? (quiet ? "멍때리기" : "player");
      if (quiet) {
        if (result.ok) {
          record(task.kind, `${p.id}`, actor);
          playSound(JOB_SOUNDS[task.kind]);
        }
        draw();
        return;
      }
      const message = worker.name && result.ok ? `${josa(worker.name, "이가", "가")} 도와줬어요. ${result.message}` : result.message;
      report({ ...result, message }, task.kind, `${p.id}`, JOB_SOUNDS[task.kind], actor);
    },
    performance.now(),
  );
  draw();
}

const actions = {
  plant(speciesId, colorId) {
    game.preview = null;
    sendWorker(selectedPlot(), { kind: "plant", speciesId, colorId });
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
    const done = () => report({ ok: count > 0, message: `${helper.name}: ${BULK[kind].label} ${count}칸` }, `bulk:${kind}`, `${count}`);
    playSound(helper.sound);
    animator[helper.run](targets, apply, done, performance.now());
  },
  setBorder(borderId) {
    const plot = selectedPlot();
    if (setBorder(plot, borderId)) record("decor", `${plot.id}:${borderId}`);
    draw();
  },
  borderToKind() {
    const plot = selectedPlot();
    const count = applyBorderToKind(game.state, plot.kind, plot.border);
    report({ ok: count > 0, message: count ? `${PLOT_NAMES[plot.kind]} ${count}칸의 테두리를 바꿨어요` : "이미 모두 같은 색이에요" }, "decor", `${plot.kind}:${plot.border}`);
  },
  // 요리: 재료를 꺼내 두고, 농부가 화덕에 가서 보글보글 끓이면 창고에 요리가 들어가요.
  cook(recipeId, { quiet = false } = {}) {
    const recipe = recipes.find((r) => r.id === recipeId);
    const started = startCooking(game.state, recipe);
    if (!started.ok) return report(started, "cook", recipe.id, null, "player", quiet);
    const spot = { x: layout.kitchen.x - 2 - layout.farm.x, y: layout.kitchen.y + 15 - layout.farm.y };
    animator.cook(spot, (worker) => {
      const result = finishCooking(game.state, recipe);
      const who = worker.name ? `${josa(worker.name, "이가", "가")} ` : "";
      report({ ...result, message: `${who}${result.message}` }, "cook", recipe.id, "cook", worker.name ?? "player", quiet);
    });
    if (!quiet) showToast(started.message);
    draw();
  },
  // 나눠 먹기: 농부와 친구들이 돗자리에 둘러앉아 맛있게 먹어요. 제일 좋아하는 요리면 머리 위에 ★
  share(recipeId, { quiet = false } = {}) {
    if (feasting) return report({ ok: false, message: "지금 다 같이 먹고 있어요. 다 먹으면 또 차려 주세요" }, "share", "", null, "player", quiet);
    const recipe = recipes.find((r) => r.id === recipeId);
    const result = share(game.state, recipe);
    if (!result.ok) return report(result, "share", recipe.id, null, "player", quiet);
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
        report({ ...result, message: shareMessage(recipe, friends) }, "share", recipe.id, "yum", "player", quiet);
      },
      fans,
    );
    if (!quiet) showToast("다들 모여라~ 맛있는 거 먹자!");
    draw();
  },
  setTimeScale(scale) {
    tick(); // 지금까지는 이전 배율로 계산하고
    game.state.meta.timeScale = scale; // 지금부터 새 배율로
    report({ ok: true, message: `시간 배율을 ×${scale}로 바꿨어요` }, "time_scale", String(scale));
  },
  setSound(change) {
    setSound(change);
  },
};

const BULK_HELPERS = {
  thirsty: { run: "drone", name: "드론", sound: "drone", dropSound: "drip" },
  highWater: { run: "sprinklers", name: "스프링클러", sound: "sprinkler" },
  paddy: { run: "flow", name: "물길", sound: "flow" },
};

async function save({ silent = false, keepalive = false } = {}) {
  if (game.integrity !== "ok") return;
  // 보내는 기록은 목록에서 꺼내 두고, 실패하면 되돌려 놓아요. (두 번 저장되는 일을 막기 위해)
  const sending = game.log.splice(0, MAX_LOG_PER_SAVE);
  try {
    const result = await saveState(game.state, sending, keepalive);
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
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

// 비운 시간(fromMs ~ toMs)을 친구들과 함께 처리하고, 있었던 일을 안내합니다.
async function catchUp(fromMs, toMs) {
  const plan = planOffline(fromMs, toMs, game.state.meta.timeScale);
  const notice = plan.clockWentBack || plan.realMs >= AWAY_NOTICE_MS;
  if (plan.clockWentBack) record("clock_backwards", String(plan.realMs), "system");
  const away = newReport();
  // 새로고침처럼 아주 잠깐 비운 건 친구들이 나서지 않아요. (다 자란 작물은 플레이어가 직접 수확하도록)
  const helpers = notice ? friends : [];
  // 하루치(게임 시간)씩 나눠 처리하고, 그 사이에 진행 막대를 그려요. 한 번에 하면 화면이 멈춘 것처럼 보여요.
  let done = 0;
  while (done < plan.gameMinutes) {
    const slice = Math.min(MINUTES_PER_DAY, plan.gameMinutes - done);
    simulateOffline(game.state, speciesById, helpers, slice, away);
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
  await showSummary(summarize(plan, away, speciesById, friends));
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
  if (!idleMode) game.state.meta.playSeconds += elapsed / 1000; // 직접 플레이한 시간 (멍때리기는 빼요)
  noticeWeather();
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

// 패널은 보이는 내용이 바뀔 때만 다시 만듭니다. 매초 다시 만들면 누르던 버튼이 사라질 수 있어요.
let panelKey = "";

function draw() {
  renderHeader(game, palette);
  const plot = selectedPlot();
  const crop = plot?.crop;
  const key = JSON.stringify([
    game.selectedId,
    plot?.border,
    plot && animator.isPending(plot.id),
    crop && [crop.species, Math.floor(crop.progress * 100), Math.round(crop.moisture)],
    game.state.inventory,
    game.state.meta.timeScale,
  ]);
  if (key !== panelKey) {
    panelKey = key;
    renderPanel(panel, game, data, actions);
  }
}

// 농장 그림은 따로 다시 그려요 (흔들리는 작물, 계절 효과, 물주기 연출)
let lastFrame = 0;
function animate(time) {
  if (time - lastFrame >= FRAME_MS) {
    lastFrame = time;
    animator.update(time);
    drawFarm(ctx, { ...data, layout, sprites, animator, cat, state: game.state, selectedId: game.selectedId, preview: game.preview, time });
  }
  requestAnimationFrame(animate);
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  // 고양이를 누르면 쓰다듬어 줘요 (가르릉 ♥)
  const c = catRect(layout);
  if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) {
    petCat(cat, performance.now());
    playSound("purr");
    return;
  }
  game.selectedId = plotAt(game.state.plots, x - layout.farm.x, y - layout.farm.y)?.id ?? null;
  game.preview = null;
  draw();
});
document.getElementById("save-btn").addEventListener("click", () => save());
document.getElementById("idle-btn").addEventListener("click", () => setIdleMode(!idleMode));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick(); // 돌아오자마자 비운 시간 처리
});
// 첫 클릭·키 입력 때 소리 장치를 준비해요 (브라우저 규칙)
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// ── 시작 ──
draw();
requestAnimationFrame(animate);
if (boot.recovery) {
  showToast(
    boot.recovery.restoredFrom
      ? "세이브 파일이 깨져 있어서 최근 백업으로 복구했어요"
      : "세이브 파일이 깨졌고 백업이 없어 새 농장으로 시작해요",
  );
}
busy = true;
showProgress("농장으로 가는 중…", 0);
await catchUp(game.state.meta.lastSavedAt, boot.serverNow); // 마지막 저장부터 지금까지 (끝나면 저장)
busy = false;
startAutosave(save);
setInterval(tick, 1000);
setInterval(idleStep, IDLE_STEP_MS);
