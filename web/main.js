// 게임 시작점: 작물 데이터와 세이브를 불러오고, 1초마다 농장의 시간을 흘려보냅니다.
import { loadSpecies, loadState, saveState } from "./api.js";
import { bulkCare, BULK, flood, water } from "./farm/care.js";
import { advanceFarm } from "./farm/crops.js";
import { clearWithered, harvest, plant } from "./farm/harvest.js";
import { realMsToGameMinutes } from "./time/clock.js";
import { renderHeader, renderPanel } from "./ui/panels.js";
import { drawFarm, farmSize, plotAt, ZOOM } from "./ui/renderer.js";
import { showToast } from "./ui/toast.js";

const canvas = document.getElementById("farm");
const ctx = canvas.getContext("2d");
const panel = document.getElementById("panel");

const speciesList = await loadSpecies();
const speciesById = new Map(speciesList.map((s) => [s.id, s]));
const boot = await loadState();

const game = {
  state: boot.state,
  integrity: boot.integrity,
  selectedId: null,
  log: [], // 아직 서버에 보내지 않은 작업 기록
};

// 지금은 접속한 순간부터 시간이 흐릅니다. 꺼 둔 동안의 변화(오프라인 계산)는 3단계에서 추가해요.
let lastTick = Date.now();

const { width, height } = farmSize(game.state.plots);
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width * ZOOM}px`;

function selectedPlot() {
  return game.state.plots.find((p) => p.id === game.selectedId) ?? null;
}

function record(action, detail = "") {
  game.log.push({ at: game.state.meta.gameMinutes, actor: "player", action, detail });
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
};

async function save() {
  const sending = game.log.slice();
  try {
    const result = await saveState(game.state, sending);
    if (result.ok) {
      game.log.splice(0, sending.length);
      game.state.meta.lastSavedAt = result.lastSavedAt;
      showToast("저장했어요");
    } else {
      showToast(`저장하지 못했어요: ${result.error ?? result.status}`);
    }
  } catch {
    showToast("서버와 연결할 수 없어요. 서버 창이 켜져 있는지 확인해 주세요.");
  }
  draw();
}

function tick() {
  const now = Date.now();
  const elapsed = now - lastTick;
  lastTick = now;
  advanceFarm(game.state, speciesById, realMsToGameMinutes(elapsed, game.state.meta.timeScale));
  if (!document.hidden) game.state.meta.playSeconds += elapsed / 1000; // 직접 플레이한 시간
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
document.getElementById("save-btn").addEventListener("click", save);

if (boot.recovery) {
  showToast(
    boot.recovery.restoredFrom
      ? "세이브 파일이 깨져 있어서 최근 백업으로 복구했어요"
      : "세이브 파일이 깨졌고 백업이 없어 새 농장으로 시작해요",
  );
}
draw();
setInterval(tick, 1000);
