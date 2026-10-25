// 게임 시작점: 데이터와 세이브를 불러와 비운 시간을 처리하고, 1초마다 농장의 시간을 흘려보냅니다.
import { loadFriends, loadSpecies, loadState, saveState } from "./api.js";
import { bulkCare, BULK, flood, water } from "./farm/care.js";
import { advanceFarm } from "./farm/crops.js";
import { clearWithered, harvest, plant } from "./farm/harvest.js";
import { startAutosave } from "./time/autosave.js";
import { MINUTES_PER_DAY, realMsToGameMinutes } from "./time/clock.js";
import { newReport, planOffline, simulateOffline } from "./time/offline.js";
import { reportToLog, summarize } from "./time/summary.js";
import { hideLoading, showProgress, showSummary } from "./ui/loading.js";
import { renderHeader, renderPanel } from "./ui/panels.js";
import { drawFarm, farmSize, plotAt, ZOOM } from "./ui/renderer.js";
import { showToast } from "./ui/toast.js";

// 이만큼 넘게 시간이 비면(컴퓨터 잠자기 등) 플레이 중이 아니라 "비운 시간"으로 보고 친구들이 돌봐요.
const AWAY_GAP_MS = 2 * 60 * 1000;
// 이보다 짧게 비운 건 안내 화면을 띄우지 않아요.
const AWAY_NOTICE_MS = 60 * 1000;
const MAX_LOG_PER_SAVE = 500; // 서버가 한 번에 받는 작업 기록 수

const canvas = document.getElementById("farm");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("panel");

const [speciesList, friends, boot] = await Promise.all([loadSpecies(), loadFriends(), loadState()]);
const speciesById = new Map(speciesList.map((s) => [s.id, s]));

const game = {
  state: boot.state,
  integrity: boot.integrity,
  selectedId: null,
  log: [], // 아직 서버에 보내지 않은 작업 기록
};

// 농장 상태가 몇 시(현실 시각, ms)까지 계산되어 있는지
let lastTick = boot.serverNow;
let busy = false; // 비운 시간을 처리하는 동안에는 1초 시계를 멈춥니다

const { width, height } = farmSize(game.state.plots);
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width * ZOOM}px`;

function selectedPlot() {
  return game.state.plots.find((p) => p.id === game.selectedId) ?? null;
}

function record(action, detail = "", actor = "player") {
  game.log.push({ at: game.state.meta.gameMinutes, actor, action, detail });
}

// 규칙 함수의 결과({ ok, message })를 알림으로 보여 주고, 성공했으면 기록합니다.
function report(result, action, detail) {
  showToast(result.message);
  if (result.ok) record(action, detail);
  draw();
}

const actions = {
  plant(speciesId) {
    const plot = selectedPlot();
    report(plant(game.state, plot, speciesById.get(speciesId)), "plant", `${plot.id}:${speciesId}`);
  },
  water() {
    const plot = selectedPlot();
    report(water(plot) ? { ok: true, message: "물을 줬어요" } : { ok: false, message: "물을 줄 작물이 없어요" }, "water", `${plot.id}`);
  },
  flood() {
    const plot = selectedPlot();
    report(flood(plot) ? { ok: true, message: "논에 물을 가득 채웠어요" } : { ok: false, message: "물을 댈 수 없어요" }, "flood", `${plot.id}`);
  },
  harvest() {
    const plot = selectedPlot();
    const species = speciesById.get(plot.crop.species);
    report(harvest(game.state, plot, species), "harvest", `${plot.id}:${species.id}`);
  },
  clear() {
    const plot = selectedPlot();
    report(clearWithered(plot), "clear", `${plot.id}`);
  },
  bulk(kind) {
    const count = bulkCare(game.state, speciesById, kind);
    const message = count ? `${BULK[kind].label}: ${count}칸` : `${BULK[kind].label}: 해당하는 칸이 없어요`;
    report({ ok: count > 0, message }, `bulk:${kind}`, `${count}`);
  },
  setTimeScale(scale) {
    tick(); // 지금까지는 이전 배율로 계산하고
    game.state.meta.timeScale = scale; // 지금부터 새 배율로
    report({ ok: true, message: `시간 배율을 ×${scale}로 바꿨어요` }, "time_scale", String(scale));
  },
};

async function save({ silent = false, keepalive = false } = {}) {
  if (game.integrity !== "ok") return;
  // 보내는 기록은 목록에서 꺼내 두고, 실패하면 되돌려 놓아요. (두 번 저장되는 일을 막기 위해)
  const sending = game.log.splice(0, MAX_LOG_PER_SAVE);
  try {
    const result = await saveState(game.state, sending, keepalive);
    if (result.ok) {
      game.state.meta.lastSavedAt = result.lastSavedAt;
      if (!silent) showToast("저장했어요");
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
  // 하루치(게임 시간)씩 나눠 처리하고, 그 사이에 진행 막대를 그려요. 한 번에 하면 화면이 멈춘 것처럼 보여요.
  let done = 0;
  while (done < plan.gameMinutes) {
    const slice = Math.min(MINUTES_PER_DAY, plan.gameMinutes - done);
    simulateOffline(game.state, speciesById, friends, slice, away);
    done += slice;
    if (notice) {
      showProgress("친구들에게 농장 소식을 듣는 중…", done / plan.gameMinutes);
      await nextFrame();
    }
  }
  game.log.push(...reportToLog(away, game.state.meta.gameMinutes, friends));
  lastTick = toMs;
  draw();
  await save({ silent: true }); // 처리한 결과를 바로 저장
  if (notice) await showSummary(summarize(plan, away, speciesById, friends));
  else hideLoading();
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
  game.state.meta.playSeconds += elapsed / 1000; // 직접 플레이한 시간
  draw();
}

// 패널은 보이는 내용이 바뀔 때만 다시 만듭니다. 매초 다시 만들면 누르던 버튼이 사라질 수 있어요.
let panelKey = "";

function draw() {
  drawFarm(ctx, game.state, speciesById, game.selectedId);
  renderHeader(game);
  const crop = selectedPlot()?.crop;
  const key = JSON.stringify([
    game.selectedId,
    crop && [crop.species, crop.withered, Math.floor(crop.progress * 100), Math.round(crop.moisture)],
    game.state.inventory,
    game.state.meta.timeScale,
  ]);
  if (key !== panelKey) {
    panelKey = key;
    renderPanel(panel, game, speciesList, speciesById, actions);
  }
}

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
  const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
  game.selectedId = plotAt(game.state.plots, x, y)?.id ?? null;
  draw();
});
document.getElementById("save-btn").addEventListener("click", () => save());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) tick(); // 돌아오자마자 비운 시간 처리
});

// ── 시작 ──
draw();
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
