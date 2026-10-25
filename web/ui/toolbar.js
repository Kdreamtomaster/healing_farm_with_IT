// 농장 아래 도구 막대: 도구(1~4), 고른 씨앗(Q/E/R), 일괄 관리(Z/X/C), 메뉴(P·I·K·O, 접기 H, 새 창 U)
// 마우스로 눌러도 되고, 칸마다 적힌 키를 눌러도 돼요.
import { BULK } from "../farm/care.js";
import { PLOT_FOR_TYPE } from "../farm/crops.js";
import { seedId } from "../farm/harvest.js";
import { TOOLS } from "../farm/tools.js";
import { itemCount } from "../state.js";
import { el } from "./dom.js";
import { TABS } from "./panels.js";

const BULK_SLOTS = [
  { kind: "thirsty", key: "Z", name: "드론", icon: (icons) => icons.drone() },
  { kind: "highWater", key: "X", name: "스프링클러", icon: (icons) => icons.tool("sprinkler") },
  { kind: "paddy", key: "C", name: "물길", icon: (icons) => icons.tool("flow") },
];

function slot({ active = false, key, icon, label, title, onclick }) {
  return el(
    "button",
    { class: active ? "slot active" : "slot", title, "aria-pressed": String(active), onclick },
    el("kbd", { class: "slot-key" }, key),
    el("img", { src: icon, alt: "" }),
    el("span", { class: "slot-label" }, label),
  );
}

// 메뉴 바로가기: 메뉴가 펼쳐져 있으면 탭을 바꾸고, 접혀 있으면 팝업으로 열어요
function menuSlots(game, actions) {
  const { mode, floatOpen } = game.menu;
  const shown = (tab) => game.tab === tab && (mode !== "float" || floatOpen);
  return el(
    "div",
    { class: "slots" },
    TABS.map((tab) =>
      el(
        "button",
        { class: shown(tab.id) ? "slot menu-slot active" : "slot menu-slot", title: `${tab.label} 메뉴 (${tab.key})`, onclick: () => actions.openTab(tab.id) },
        el("kbd", { class: "slot-key" }, tab.key),
        tab.icon,
        el("span", { class: "slot-label" }, tab.label),
      ),
    ),
    el(
      "button",
      { class: "slot menu-slot", title: mode === "dock" ? "메뉴 접기: 농장을 크게, 메뉴는 팝업으로 (H)" : "메뉴 펴기 (H)", onclick: actions.toggleMenu },
      el("kbd", { class: "slot-key" }, "H"),
      mode === "dock" ? "⇥" : "⇤",
      el("span", { class: "slot-label" }, mode === "dock" ? "접기" : "펴기"),
    ),
    el(
      "button",
      { class: mode === "window" ? "slot menu-slot active" : "slot menu-slot", title: "메뉴를 새 창으로 (다른 모니터로 옮겨 쓰세요) (U)", onclick: actions.popOutMenu },
      el("kbd", { class: "slot-key" }, "U"),
      "⧉",
      el("span", { class: "slot-label" }, "새 창"),
    ),
  );
}

export function renderToolbar(root, game, data, actions) {
  const species = data.speciesById.get(game.seedFocus) ?? data.speciesList[0];
  const choice = game.seedChoice[PLOT_FOR_TYPE[species.type]];
  const colorId = choice?.speciesId === species.id ? choice.colorId : species.colors[0].id;
  const color = species.colors.find((c) => c.id === colorId);
  const seeds = itemCount(game.state, seedId(species.id));
  root.replaceChildren(
    el(
      "div",
      { class: "slots" },
      TOOLS.map((tool) =>
        slot({
          active: game.tool === tool.id,
          key: tool.key,
          icon: data.icons.tool(tool.id),
          label: tool.name,
          title: `${tool.name} (${tool.key})`,
          onclick: () => actions.setTool(tool.id),
        }),
      ),
    ),
    // 고른 씨앗: 씨앗 도구로 심을 작물과 색
    el(
      "div",
      { class: game.tool === "seed" ? "seed-pick active" : "seed-pick", title: "심을 씨앗 (Q·E: 작물, R: 색, 휠로도 바꿀 수 있어요)" },
      el("button", { class: "mini", "aria-label": "이전 씨앗", onclick: () => actions.cycleSeed(-1) }, "◀", el("kbd", {}, "Q")),
      el("img", { src: data.icons.crop(species.id, colorId), alt: "" }),
      el("span", { class: "seed-text" }, el("strong", {}, species.name.ko), el("small", {}, `${color.name} · 씨앗 ${seeds}`)),
      el("button", { class: "mini color", style: `--swatch:${color.hex}`, "aria-label": "씨앗 색 바꾸기", onclick: () => actions.cycleColor() }, el("kbd", {}, "R")),
      el("button", { class: "mini", "aria-label": "다음 씨앗", onclick: () => actions.cycleSeed(1) }, el("kbd", {}, "E"), "▶"),
    ),
    el(
      "div",
      { class: "slots" },
      BULK_SLOTS.map((b) =>
        slot({ key: b.key, icon: b.icon(data.icons), label: b.name, title: `${b.name}: ${BULK[b.kind].label} (${b.key})`, onclick: () => actions.bulk(b.kind) }),
      ),
    ),
    menuSlots(game, actions),
  );
}
