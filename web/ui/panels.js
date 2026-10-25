// 위쪽 상태 줄과 오른쪽 메뉴(탭: 밭 · 창고 · 부엌 · 공방 · 연구소 · 자동화 · 일지 · 설정)를 그립니다.
// 버튼을 누르면 actions 의 함수를 부를 뿐, 규칙 계산은 하지 않습니다.
import { lightAt, partOfDay } from "../decor/daylight.js";
import { cropColor } from "../decor/palette.js";
import { formatCalendar, seasonOf } from "../decor/season.js";
import { PLOT_FOR_TYPE, WATER_RANGE, stageOf } from "../farm/crops.js";
import { seedId } from "../farm/harvest.js";
import { craftId, lovesGift } from "../friends/crafts.js";
import { farmSeed, WEATHER_ICONS, weatherAt } from "../farm/weather.js";
import { getSoundSettings } from "../sound/engine.js";
import { itemCount } from "../state.js";
import { josa, PLOT_NAMES, STAGE_NAMES } from "../text.js";
import { TIME_SCALES } from "../time/clock.js";
import { el } from "./dom.js";
import { labTab } from "./lab-panel.js";
import { journalTab } from "./journal-panel.js";
import { smartfarmTab } from "./smartfarm-panel.js";

export const TABS = [
  { id: "plot", icon: "🌱", label: "밭", key: "P" },
  { id: "storage", icon: "📦", label: "창고", key: "I" },
  { id: "kitchen", icon: "🍳", label: "부엌", key: "K" },
  { id: "workshop", icon: "💐", label: "공방", key: "G" },
  { id: "lab", icon: "🧪", label: "연구소", key: "L" },
  { id: "smartfarm", icon: "🤖", label: "자동화", key: "B" },
  { id: "journal", icon: "📒", label: "일지", key: "J" },
  { id: "settings", icon: "⚙️", label: "설정", key: "O" },
];

export const kbd = (text) => el("kbd", {}, text);

export function renderHeader(game, palette) {
  const { meta } = game.state;
  const weather = weatherAt(meta.gameMinutes, farmSeed(game.state));
  document.getElementById("clock").textContent =
    `${formatCalendar(meta.gameMinutes, palette)} · ${partOfDay(meta.gameMinutes)} ${weatherIcon(weather, meta.gameMinutes)} · 시간 배율 ×${meta.timeScale}`;
  // 계절에 따라 화면 바탕색도 살짝 바뀌어요
  document.documentElement.style.setProperty("--bg", palette.seasons[seasonOf(meta.gameMinutes).id].page);
  const saved = new Date(meta.lastSavedAt);
  document.getElementById("save-status").textContent =
    `마지막 저장 ${String(saved.getHours()).padStart(2, "0")}:${String(saved.getMinutes()).padStart(2, "0")}`;
  document.getElementById("integrity-badge").hidden = game.integrity === "ok";
  document.getElementById("save-btn").disabled = game.integrity !== "ok";
}

// 맑은 밤에는 해 대신 달
function weatherIcon(weather, gameMinutes) {
  return weather === "sunny" && lightAt(gameMinutes).night ? "🌙" : WEATHER_ICONS[weather];
}

export function renderPanel(root, game, data, actions) {
  const content = { plot: plotTab, storage: storageTab, kitchen: kitchenTab, workshop: workshopTab, lab: labTab, smartfarm: smartfarmTab, journal: journalTab, settings: settingsTab }[game.tab] ?? plotTab;
  root.replaceChildren(
    el(
      "nav",
      { class: "tabs", role: "tablist" },
      TABS.map((tab) =>
        el(
          "button",
          { role: "tab", class: tab.id === game.tab ? "tab active" : "tab", "aria-selected": String(tab.id === game.tab), title: `${tab.label} (${tab.key})`, onclick: () => actions.setTab(tab.id) },
          el("span", { class: "tab-icon" }, tab.icon),
          el("span", { class: "tab-label" }, tab.label),
          kbd(tab.key),
        ),
      ),
    ),
    el("section", { class: "card tab-body", role: "tabpanel" }, content(game, data, actions)),
  );
}

// ── 밭 탭: 고른 칸 살펴보기 ──
function plotTab(game, data, actions) {
  const plot = game.state.plots.find((p) => p.id === game.selectedId);
  if (!plot) {
    return [
      el("h2", {}, "밭 살펴보기"),
      el("p", { class: "hint" }, "칸을 누르거나 방향키로 골라 보세요. 마우스를 올리기만 해도 작물 상태가 보여요."),
      controlsCheatSheet(),
    ];
  }
  if (data.isPending?.(plot.id)) {
    return [plotTitle(plot), el("p", { class: "hint" }, "🚶 일하러 가는 중이에요… 다른 칸에도 계속 일을 맡길 수 있어요.")];
  }
  return [plotTitle(plot), plot.crop ? cropInfo(plot, data, actions) : seedPicker(plot, game, data, actions), decorInfo(plot, data.palette, actions)];
}

function plotTitle(plot) {
  return el("h2", {}, `${plot.id + 1}번 칸 · ${PLOT_NAMES[plot.kind]}`);
}

// 작물 한 줄 요약 (밭 탭과 마우스를 올렸을 때 뜨는 작은 카드에서 함께 써요)
export function plotSummary(plot, data) {
  if (!plot.crop) return { title: `빈 ${PLOT_NAMES[plot.kind]}`, lines: ["씨앗을 심을 수 있어요"] };
  const species = data.speciesById.get(plot.crop.species);
  const [low, high] = WATER_RANGE[species.water];
  const moisture = Math.round(plot.crop.moisture);
  const mood = moisture < low ? "목말라요 💧" : moisture > high ? "조금 젖었어요" : "촉촉해요";
  return {
    title: `${cropColor(species, plot.crop.color).name} ${species.name.ko}`,
    lines: [`${STAGE_NAMES[stageOf(plot.crop)]} · 성장 ${Math.floor(plot.crop.progress * 100)}%`, `수분 ${moisture} (좋아하는 ${low}~${high}) · ${mood}`],
    icon: data.icons.crop(species.id, plot.crop.color),
  };
}

function bar(percent, className) {
  return el("div", { class: `bar ${className}` }, el("div", { class: "bar-fill", style: `width:${Math.max(0, Math.min(100, percent))}%` }));
}

function cropInfo(plot, data, actions) {
  const species = data.speciesById.get(plot.crop.species);
  const summary = plotSummary(plot, data);
  const [low, high] = WATER_RANGE[species.water];
  const ripe = stageOf(plot.crop) === "ripe";
  return el(
    "div",
    {},
    el("div", { class: "crop-head" }, el("img", { class: "big-icon", src: summary.icon, alt: "" }), el("div", {}, el("strong", {}, summary.title), el("p", { class: "hint" }, summary.lines[0]))),
    el("p", { class: "label" }, "성장"),
    bar(plot.crop.progress * 100, "grow"),
    el("p", { class: "label" }, summary.lines[1]),
    el(
      "div",
      { class: "meter", title: `좋아하는 수분 ${low}~${high}` },
      el("div", { class: "meter-range", style: `left:${low}%;width:${high - low}%` }),
      el("div", { class: "meter-fill", style: `width:${Math.round(plot.crop.moisture)}%` }),
    ),
    el(
      "div",
      { class: "actions" },
      el("button", { onclick: plot.kind === "paddy" ? actions.flood : actions.water }, plot.kind === "paddy" ? "💧 물대기 " : "💧 물주기 ", kbd("2")),
      el("button", { onclick: actions.harvest, disabled: !ripe }, "🧺 수확 ", kbd("4")),
      el("button", { class: "ghost", onclick: actions.smartSelected }, "✨ 알맞은 일 ", kbd("F")),
    ),
  );
}

// 빈 칸: 작물 그림을 골라 → 색을 누르면 심어요. 고른 씨앗은 씨앗 도구(3)에도 기억돼요.
// 작물이 많아도 스크롤하지 않도록, 작물은 작은 그림 칸으로 늘어놓고 색은 고른 작물 것만 보여 줘요.
const WATER_WORDS = { low: "물을 조금", mid: "물을 알맞게", high: "물을 듬뿍" };
function seedPicker(plot, game, data, actions) {
  const seeds = data.speciesList.filter((s) => PLOT_FOR_TYPE[s.type] === plot.kind);
  const count = (s) => itemCount(game.state, seedId(s.id));
  const chosen = game.seedChoice[plot.kind];
  const focus = seeds.find((s) => s.id === chosen?.speciesId) ?? seeds.find((s) => count(s) > 0) ?? seeds[0];
  const hours = Math.round((focus.growMinutes / 60) * 10) / 10;
  return el(
    "div",
    {},
    el(
      "div",
      { class: "seed-grid" },
      seeds.map((s) =>
        el(
          "button",
          {
            class: ["seed-tile", s === focus && "selected", count(s) === 0 && "empty"].filter(Boolean).join(" "),
            title: `${s.name.ko} 씨앗 ${count(s)}개`,
            "aria-pressed": String(s === focus),
            onclick: () => actions.pickSeed(s.id),
          },
          el("img", { src: data.icons.crop(s.id, s.colors[0].id), alt: "" }),
          el("span", {}, s.name.ko),
          el("small", { class: "count" }, String(count(s))),
        ),
      ),
    ),
    el("p", { class: "hint" }, `${focus.name.ko} 씨앗 ${count(focus)}개 · 게임 속 ${hours}시간이면 다 자라요 · ${WATER_WORDS[focus.water]} 좋아해요`),
    el(
      "div",
      { class: "swatches" },
      focus.colors.map((color) =>
        swatch(color.hex, `${josa(color.name, "으로", "로")} 심기`, {
          disabled: count(focus) === 0,
          onclick: () => actions.plant(focus.id, color.id),
          onmouseenter: () => actions.preview(focus.id, color.id),
          onmouseleave: () => actions.preview(null),
        }),
      ),
    ),
    count(focus) === 0 && el("p", { class: "hint" }, "씨앗이 없어요. 다 자란 작물을 수확하면 씨앗도 얻어요."),
  );
}

// 색 견본 버튼: 글자 앞에 작은 색 네모가 붙어요
function swatch(hex, label, { selected = false, ...props }) {
  return el("button", { class: selected ? "swatch selected" : "swatch", style: `--swatch:${hex}`, title: label, ...props }, label);
}

function decorInfo(plot, palette, actions) {
  return el(
    "details",
    { class: "decor" },
    el("summary", {}, "🎨 꾸미기: 테두리 색"),
    el(
      "div",
      { class: "swatches" },
      palette.borders.map((b) => swatch(b.color, b.name, { selected: b.id === plot.border, onclick: () => actions.setBorder(b.id) })),
    ),
    el("button", { class: "small ghost", onclick: actions.borderToKind }, `${PLOT_NAMES[plot.kind]} 칸 모두 이 색으로`),
  );
}

function controlsCheatSheet() {
  const row = (keys, text) => el("li", {}, keys.map((k) => kbd(k)), ` ${text}`);
  return el(
    "ul",
    { class: "cheats" },
    row(["왼쪽 클릭"], "지금 도구로 일하기 · 끌면 여러 칸"),
    row(["오른쪽 클릭"], "알맞은 일 (수확·심기·물주기)"),
    row(["1", "2", "3", "4"], "살펴보기 · 물뿌리개 · 씨앗 · 수확"),
    row(["WASD"], "칸 옮기기"),
    row(["Space"], "일하기"),
    row(["Z", "X", "C"], "드론 · 스프링클러 · 물길"),
    row(["?"], "단축키 전체 보기"),
  );
}

// ── 창고 탭: 그림으로 보는 창고 ──
function storageTab(game, data) {
  const { state } = game;
  const tile = (src, name, count) =>
    el("div", { class: "item", title: name }, el("img", { src, alt: "" }), el("span", { class: "count" }, String(count)), el("span", { class: "name" }, name));
  const produce = data.speciesList.filter((s) => itemCount(state, s.id) > 0).map((s) => tile(data.icons.crop(s.id, s.colors[0].id), s.name.ko, itemCount(state, s.id)));
  const seeds = data.speciesList
    .filter((s) => itemCount(state, seedId(s.id)) > 0)
    .map((s) => tile(data.icons.seed(s.id), `${s.name.ko} 씨앗`, itemCount(state, seedId(s.id))));
  const dishes = data.recipes.filter((r) => itemCount(state, `dish_${r.id}`) > 0).map((r) => tile(data.icons.dish(r.id), r.name.ko, itemCount(state, `dish_${r.id}`)));
  const crafted = (data.crafts ?? []).filter((c) => itemCount(state, craftId(c.id)) > 0).map((c) => tile(data.icons.craft(c.id), c.name.ko, itemCount(state, craftId(c.id))));
  const section = (title, items, empty) => [el("h3", {}, title), items.length ? el("div", { class: "items" }, items) : el("p", { class: "hint" }, empty)];
  return [
    el("h2", {}, "창고"),
    section("🧺 수확물", produce, "아직 수확물이 없어요."),
    section("🌱 씨앗", seeds, "씨앗이 없어요. 수확하면 씨앗도 얻어요."),
    section("🍲 요리", dishes, "요리가 없어요. 부엌에서 만들어 보세요."),
    section("💐 공방 물건", crafted, "꽃으로 만든 물건이 없어요. 공방에서 만들어 보세요."),
    (state.meta.codex ?? []).length > 0 &&
      section(
        "✨ 특별한 작물",
        state.meta.codex.map((e) => tile(data.icons.mutant(e.species, e.truth), e.name || data.speciesById.get(e.species)?.name.ko, itemCount(state, `mutant_${e.id}`))),
        "",
      ),
    itemCount(state, "biofuel") > 0 && section("⛽ 바이오 연료", [tile(data.icons.fuel(), "바이오 연료", itemCount(state, "biofuel"))], ""),
  ];
}

// ── 부엌 탭: 요리하기와 나눠 먹기 ──
function kitchenTab(game, data, actions) {
  const { state } = game;
  const cooked = data.recipes.filter((r) => itemCount(state, `dish_${r.id}`) > 0);
  const canCook = (recipe) => Object.entries(recipe.ingredients).every(([item, need]) => itemCount(state, item) >= need);
  const ready = data.recipes.filter(canCook);
  const waiting = data.recipes.filter((r) => !canCook(r));
  const recipeRow = (recipe, ok) =>
    el(
      "div",
      { class: ok ? "recipe-row" : "recipe-row dim" },
      el("img", { class: "dish-icon", src: data.icons.dish(recipe.id), alt: "" }),
      el(
        "span",
        { class: "recipe-name" },
        recipe.name.ko,
        el(
          "span",
          { class: "needs" },
          needs(recipe.ingredients, state, data),
        ),
      ),
      el("button", { class: "small", disabled: !ok, onclick: () => actions.cook(recipe.id) }, "요리하기"),
    );
  return [
    el("h2", {}, "부엌"),
    el("p", { class: "hint" }, "작물이 모이면 화덕에서 요리해요. 요리는 친구들과 돗자리에 둘러앉아 나눠 먹어요."),
    cooked.length > 0 && el("h3", {}, "🧺 나눠 먹기"),
    cooked.map((recipe) =>
      el(
        "div",
        { class: "recipe-row" },
        el("img", { class: "dish-icon", src: data.icons.dish(recipe.id), alt: "" }),
        el("span", { class: "recipe-name" }, `${recipe.name.ko} × ${itemCount(state, `dish_${recipe.id}`)}`, fanNote(recipe, data.friends)),
        el("button", { class: "small", onclick: () => actions.share(recipe.id) }, "나눠 먹기"),
      ),
    ),
    el("h3", {}, "🍳 요리하기"),
    ready.length ? ready.map((recipe) => recipeRow(recipe, true)) : el("p", { class: "hint" }, "지금은 재료가 모자라요. 수확해서 모아 보세요."),
    waiting.length > 0 &&
      el(
        "details",
        { class: "more", open: Boolean(game.ui?.moreRecipes), ontoggle: (e) => actions.remember("moreRecipes", e.target.open) },
        el("summary", {}, `재료를 모으는 중인 요리 ${waiting.length}가지`),
        waiting.map((recipe) => recipeRow(recipe, false)),
      ),
  ];
}

// 재료 그림과 "가진 수/필요한 수" (모자라면 주황 글씨)
function needs(materials, state, data) {
  return Object.entries(materials).map(([item, need]) => {
    const species = data.speciesById.get(item);
    const have = itemCount(state, item);
    return el(
      "span",
      { class: have >= need ? "need ok" : "need" },
      el("img", { src: data.icons.crop(item, species.colors[0].id), alt: species.name.ko, title: species.name.ko }),
      `${have}/${need}`,
    );
  });
}

// ── 공방 탭: 꽃으로 꾸미기 물건과 선물 만들기, 친구에게 선물하기 ──
function workshopTab(game, data, actions) {
  const { state } = game;
  const crafts = data.crafts ?? [];
  const count = (c) => itemCount(state, craftId(c.id));
  const canMake = (c) => Object.entries(c.materials).every(([item, need]) => itemCount(state, item) >= need);
  const gifts = crafts.filter((c) => c.kind === "gift" && count(c) > 0);
  const decor = crafts.filter((c) => c.kind === "decor" && count(c) > 0);
  const ready = crafts.filter(canMake);
  const waiting = crafts.filter((c) => !canMake(c));
  const kindName = { gift: "선물", decor: "꾸미기" };
  const craftRow = (craft, ok) =>
    el(
      "div",
      { class: ok ? "recipe-row" : "recipe-row dim" },
      el("img", { class: "dish-icon", src: data.icons.craft(craft.id), alt: "" }),
      el("span", { class: "recipe-name" }, `${craft.name.ko} `, el("small", { class: "tag" }, kindName[craft.kind]), el("span", { class: "needs" }, needs(craft.materials, state, data))),
      el("button", { class: "small", disabled: !ok, onclick: () => actions.craft(craft.id) }, "만들기"),
    );
  return [
    el("h2", {}, "꽃 공방"),
    el("p", { class: "hint" }, "수확한 꽃으로 마당을 꾸미거나 친구에게 줄 선물을 만들어요."),
    gifts.length > 0 && el("h3", {}, "🎁 선물하기"),
    gifts.map((craft) =>
      el(
        "div",
        { class: "recipe-row" },
        el("img", { class: "dish-icon", src: data.icons.craft(craft.id), alt: "" }),
        el("span", { class: "recipe-name" }, `${craft.name.ko} × ${count(craft)}`),
        el(
          "span",
          { class: "friend-buttons" },
          data.friends.map((friend) =>
            el(
              "button",
              { class: "small", title: lovesGift(craft, friend) ? `${friend.name}: 제일 좋아하는 꽃이 들어 있어요` : friend.name, onclick: () => actions.gift(craft.id, friend.id) },
              lovesGift(craft, friend) ? `★ ${friend.name}` : friend.name,
            ),
          ),
        ),
      ),
    ),
    decor.length > 0 && el("p", { class: "hint" }, `🏡 마당에 놓여 있어요: ${decor.map((c) => c.name.ko).join(", ")}`),
    el("h3", {}, "✂️ 만들기"),
    ready.length ? ready.map((craft) => craftRow(craft, true)) : el("p", { class: "hint" }, "꽃이 모자라요. 화단과 논에서 꽃을 키워 보세요."),
    waiting.length > 0 &&
      el(
        "details",
        { class: "more", open: Boolean(game.ui?.moreCrafts), ontoggle: (e) => actions.remember("moreCrafts", e.target.open) },
        el("summary", {}, `꽃을 모으는 중인 물건 ${waiting.length}가지`),
        waiting.map((craft) => craftRow(craft, false)),
      ),
    el("p", { class: "hint" }, `좋아하는 꽃: ${data.friends.map((f) => `${f.name} ${data.speciesById.get(f.favoriteFlower)?.name.ko ?? "?"}`).join(" · ")}`),
  ];
}

function fanNote(recipe, friends = []) {
  const fans = friends.filter((f) => f.favoriteDish === recipe.id).map((f) => f.name);
  if (!fans.length) return null;
  const who = [...fans.slice(0, -1), josa(fans[fans.length - 1], "이가", "가")].join("·"); // 하늘이가, 바다가
  return el("small", {}, `★ ${who} 제일 좋아해요`);
}

// ── 설정 탭 ──
function settingsTab(game, data, actions) {
  const sound = getSoundSettings();
  const toggle = (key, label) =>
    el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: sound[key], onchange: (e) => actions.setSound({ [key]: e.target.checked }) }), ` ${label}`);
  return [
    el("h2", {}, "설정"),
    el("h3", {}, "⏱ 시간 배율"),
    el("p", { class: "hint" }, "현실 1분이 게임 속 몇 분인지"),
    el(
      "div",
      { class: "actions" },
      TIME_SCALES.map((scale) => el("button", { class: scale === game.state.meta.timeScale ? "selected" : "", onclick: () => actions.setTimeScale(scale) }, `×${scale}`)),
    ),
    el("h3", {}, "🔊 소리"),
    toggle("sfx", "효과음"),
    toggle("music", "배경음"),
    toggle("nature", "자연의 소리 (새소리·풀벌레·빗소리)"),
    el(
      "label",
      { class: "toggle" },
      "음량 ",
      el("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(sound.volume), oninput: (e) => actions.setSound({ volume: Number(e.target.value) }) }),
    ),
    el("h3", {}, "🎮 조작"),
    controlsCheatSheet(),
    el("div", { class: "actions" }, el("button", { class: "ghost", onclick: actions.toggleHelp }, "단축키 전체 보기 ", kbd("?"))),
  ];
}
