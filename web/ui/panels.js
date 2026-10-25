// 오른쪽 패널(선택한 칸, 일괄 관리, 창고, 설정)과 위쪽 상태 줄을 그립니다.
// 버튼을 누르면 actions 의 함수를 부를 뿐, 규칙 계산은 하지 않습니다.
import { cropColor } from "../decor/palette.js";
import { formatCalendar, seasonOf } from "../decor/season.js";
import { BULK } from "../farm/care.js";
import { PLOT_FOR_TYPE, WATER_RANGE, stageOf } from "../farm/crops.js";
import { seedId } from "../farm/harvest.js";
import { getSoundSettings } from "../sound/engine.js";
import { itemCount } from "../state.js";
import { PLOT_NAMES, STAGE_NAMES } from "../text.js";
import { TIME_SCALES } from "../time/clock.js";
import { el } from "./dom.js";

export function renderHeader(game, palette) {
  const { meta } = game.state;
  document.getElementById("clock").textContent = `${formatCalendar(meta.gameMinutes, palette)} · 시간 배율 ×${meta.timeScale}`;
  // 계절에 따라 화면 바탕색도 살짝 바뀌어요
  document.documentElement.style.setProperty("--bg", palette.seasons[seasonOf(meta.gameMinutes).id].page);
  const saved = new Date(meta.lastSavedAt);
  document.getElementById("save-status").textContent =
    `마지막 저장 ${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}`;
  document.getElementById("integrity-badge").hidden = game.integrity === "ok";
  document.getElementById("save-btn").disabled = game.integrity !== "ok";
}

export function renderPanel(root, game, data, actions) {
  const plot = game.state.plots.find((p) => p.id === game.selectedId) ?? null;
  root.replaceChildren(
    el(
      "section",
      { class: "card" },
      el("h2", {}, "선택한 칸"),
      plotInfo(plot, game.state, data, actions),
      plot && decorInfo(plot, data.palette, actions),
    ),
    el(
      "section",
      { class: "card" },
      el("h2", {}, "일괄 관리"),
      Object.entries(BULK).map(([kind, { label }]) => el("button", { onclick: () => actions.bulk(kind) }, label)),
    ),
    el("section", { class: "card" }, el("h2", {}, "창고"), inventoryList(game.state, data.speciesById)),
    settingsCard(game.state, actions),
  );
}

// 색 견본 버튼: 글자 앞에 작은 색 네모가 붙어요
function swatch(hex, label, { selected = false, ...props }) {
  return el("button", { class: selected ? "swatch selected" : "swatch", style: `--swatch:${hex}`, title: label, ...props }, label);
}

function plotInfo(plot, state, data, actions) {
  if (!plot) return el("p", { class: "hint" }, "농장의 칸을 눌러 보세요.");
  const title = el("p", { class: "plot-title" }, `${plot.id + 1}번 칸 · ${PLOT_NAMES[plot.kind]}`);
  if (!plot.crop) {
    const seeds = data.speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === plot.kind);
    return el(
      "div",
      {},
      title,
      el("p", { class: "hint" }, "색을 골라 심어 보세요. 색 버튼에 마우스를 올리면 미리 볼 수 있어요."),
      seeds.map((s) => {
        const count = itemCount(state, seedId(s.id));
        return el(
          "div",
          { class: "seed-row" },
          el("span", { class: "seed-name" }, `${s.name.ko} 씨앗 ${count}개`),
          s.colors.map((color) =>
            swatch(color.hex, color.name, {
              disabled: count === 0,
              onclick: () => actions.plant(s.id, color.id),
              onmouseenter: () => actions.preview(s.id, color.id),
              onmouseleave: () => actions.preview(null),
            }),
          ),
        );
      }),
    );
  }
  const species = data.speciesById.get(plot.crop.species);
  const stage = stageOf(plot.crop);
  const [low, high] = WATER_RANGE[species.water];
  const moisture = Math.round(plot.crop.moisture);
  return el(
    "div",
    {},
    title,
    el("p", {}, el("strong", {}, species.name.ko), ` · ${cropColor(species, plot.crop.color).name} · ${STAGE_NAMES[stage]}`),
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

function decorInfo(plot, palette, actions) {
  return el(
    "div",
    { class: "decor" },
    el("p", { class: "hint" }, "테두리 색"),
    palette.borders.map((b) => swatch(b.color, b.name, { selected: b.id === plot.border, onclick: () => actions.setBorder(b.id) })),
    el("button", { class: "small", onclick: actions.borderToKind }, `${PLOT_NAMES[plot.kind]} 칸 모두 이 색으로`),
  );
}

function settingsCard(state, actions) {
  const sound = getSoundSettings();
  return el(
    "section",
    { class: "card" },
    el("h2", {}, "설정"),
    el("p", { class: "hint" }, "시간 배율: 현실 1분이 게임 속 몇 분인지"),
    TIME_SCALES.map((scale) =>
      el("button", { class: scale === state.meta.timeScale ? "selected" : "", onclick: () => actions.setTimeScale(scale) }, `×${scale}`),
    ),
    el("p", { class: "hint" }, "소리"),
    el(
      "label",
      { class: "toggle" },
      el("input", { type: "checkbox", checked: sound.sfx, onchange: (e) => actions.setSound({ sfx: e.target.checked }) }),
      " 효과음",
    ),
    el(
      "label",
      { class: "toggle" },
      el("input", { type: "checkbox", checked: sound.music, onchange: (e) => actions.setSound({ music: e.target.checked }) }),
      " 배경음",
    ),
    el(
      "label",
      { class: "toggle" },
      "음량 ",
      el("input", {
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: String(sound.volume),
        oninput: (e) => actions.setSound({ volume: Number(e.target.value) }),
      }),
    ),
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
