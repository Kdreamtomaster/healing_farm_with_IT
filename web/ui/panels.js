// 오른쪽 패널(선택한 칸, 일괄 관리, 창고)과 위쪽 상태 줄을 그립니다.
// 버튼을 누르면 actions 의 함수를 부를 뿐, 규칙 계산은 하지 않습니다.
import { BULK } from "../farm/care.js";
import { PLOT_FOR_TYPE, WATER_RANGE, stageOf } from "../farm/crops.js";
import { seedId } from "../farm/harvest.js";
import { itemCount } from "../state.js";
import { PLOT_NAMES, STAGE_NAMES } from "../text.js";
import { formatGameTime, TIME_SCALES } from "../time/clock.js";
import { el } from "./dom.js";

export function renderHeader(game) {
  const { meta } = game.state;
  document.getElementById("clock").textContent = `${formatGameTime(meta.gameMinutes)} · 시간 배율 ×${meta.timeScale}`;
  const saved = new Date(meta.lastSavedAt);
  document.getElementById("save-status").textContent =
    `마지막 저장 ${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}`;
  const badge = document.getElementById("integrity-badge");
  badge.hidden = game.integrity === "ok";
  document.getElementById("save-btn").disabled = game.integrity !== "ok";
}

export function renderPanel(root, game, speciesList, speciesById, actions) {
  const plot = game.state.plots.find((p) => p.id === game.selectedId) ?? null;
  root.replaceChildren(
    el("section", { class: "card" }, el("h2", {}, "선택한 칸"), plotInfo(plot, game.state, speciesList, speciesById, actions)),
    el(
      "section",
      { class: "card" },
      el("h2", {}, "일괄 관리"),
      Object.entries(BULK).map(([kind, { label }]) => el("button", { onclick: () => actions.bulk(kind) }, label)),
    ),
    el("section", { class: "card" }, el("h2", {}, "창고"), inventoryList(game.state, speciesById)),
    el(
      "section",
      { class: "card" },
      el("h2", {}, "설정"),
      el("p", { class: "hint" }, "시간 배율: 현실 1분이 게임 속 몇 분인지"),
      TIME_SCALES.map((scale) =>
        el(
          "button",
          { class: scale === game.state.meta.timeScale ? "selected" : "", onclick: () => actions.setTimeScale(scale) },
          `×${scale}`,
        ),
      ),
    ),
  );
}

function plotInfo(plot, state, speciesList, speciesById, actions) {
  if (!plot) return el("p", { class: "hint" }, "농장의 칸을 눌러 보세요.");
  const title = el("p", { class: "plot-title" }, `${plot.id + 1}번 칸 · ${PLOT_NAMES[plot.kind]}`);
  if (!plot.crop) {
    const seeds = speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === plot.kind);
    return el(
      "div",
      {},
      title,
      el("p", { class: "hint" }, "비어 있어요. 씨앗을 골라 심어 보세요."),
      seeds.map((s) => {
        const count = itemCount(state, seedId(s.id));
        return el("button", { onclick: () => actions.plant(s.id), disabled: count === 0 }, `${s.name.ko} 씨앗 심기 (${count})`);
      }),
    );
  }
  const species = speciesById.get(plot.crop.species);
  const stage = stageOf(plot.crop);
  const [low, high] = WATER_RANGE[species.water];
  const moisture = Math.round(plot.crop.moisture);
  return el(
    "div",
    {},
    title,
    el("p", {}, el("strong", {}, species.name.ko), ` · ${STAGE_NAMES[stage]}`),
    el("p", {}, `성장 ${Math.floor(plot.crop.progress * 100)}%`),
    el(
      "div",
      { class: "meter", title: `좋아하는 수분 ${low}~${high}` },
      el("div", { class: "meter-range", style: `left:${low}%;width:${high - low}%` }),
      el("div", { class: "meter-fill", style: `width:${moisture}%` }),
    ),
    el("p", { class: "hint" }, `수분 ${moisture} (좋아하는 범위 ${low}~${high})`),
    stage === "withered"
      ? el("button", { onclick: actions.clear }, "시든 작물 정리")
      : [
          el("button", { onclick: actions.water }, "물주기"),
          plot.kind === "paddy" && el("button", { onclick: actions.flood }, "논에 물대기"),
          el("button", { onclick: actions.harvest, disabled: stage !== "ripe" }, "수확"),
        ],
  );
}

function inventoryList(state, speciesById) {
  const rows = Object.entries(state.inventory)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, count]) => el("li", {}, `${itemName(item, speciesById)} × ${count}`));
  return rows.length ? el("ul", { class: "inventory" }, rows) : el("p", { class: "hint" }, "창고가 비어 있어요.");
}

function itemName(item, speciesById) {
  if (item.startsWith("seed_")) {
    const species = speciesById.get(item.slice(5));
    return species ? `${species.name.ko} 씨앗` : item;
  }
  return speciesById.get(item)?.name.ko ?? item;
}
