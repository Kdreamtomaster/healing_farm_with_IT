// 연구소 탭: 실험 작물, 바이오 연료 만들기, 지문 실험대
// 동작은 web/lab/sandbox.js 가 맡고, 여기서는 그리기만 해요.
import { changedPositions } from "../lab/bench.js";
import { itemCount } from "../state.js";
import { el } from "./dom.js";

const SIZE_NAMES = { small: "작은", normal: "보통", big: "큰" };

export function labTab(game, data, actions) {
  const lab = game.lab;
  const intro = [
    el("h2", {}, "연구소 🧪"),
    el("p", { class: "hint" }, "마음껏 실험해도 본 농장은 안전한 샌드박스예요. 연구소 작물은 선물·요리에 쓸 수 없고, 바이오 연료로만 농장에 돌아가요."),
  ];
  if (!lab) return [...intro, el("p", { class: "hint" }, "연구소 문을 여는 중…")];
  if (lab.error) return [...intro, el("p", { class: "hint" }, lab.error)];
  return [...intro, status(lab, actions), importRow(game, data, actions), samples(lab, data, actions), bench(game, lab, actions)];
}

function status(lab, actions) {
  if (lab.integrity === "ok") return el("p", { class: "lab-status ok" }, "🔏 연구소 지문이 맞아요");
  return el(
    "div",
    { class: "lab-status bad" },
    el("p", {}, "⚠ 연구소 지문이 맞지 않아요 — 게임 밖에서 lab.sqlite 를 고쳤군요! 여기는 샌드박스라 벌칙은 없지만, 지문이 맞을 때까지 연료는 보낼 수 없어요."),
    el("p", { class: "hint" }, "고친 값을 원래대로 되돌리면 다시 맞아요. 아니면 연구소를 비우고 새로 시작해요 (실험 작물은 사라져요)."),
    el("button", { class: "small", onclick: actions.labClear }, "연구소 비우기"),
  );
}

// 농장 창고의 수확물 → 연구소
function importRow(game, data, actions) {
  const produce = data.speciesList.filter((s) => itemCount(game.state, s.id) > 0);
  if (!produce.length) return [el("h3", {}, "🧺 농장에서 가져오기"), el("p", { class: "hint" }, "창고에 수확물이 없어요. 수확한 작물을 가져올 수 있어요.")];
  const pick = game.ui.labPick ?? {};
  const species = produce.find((s) => s.id === pick.species) ?? produce[0];
  const max = itemCount(game.state, species.id);
  const count = Math.min(max, Math.max(1, pick.count ?? 1));
  return [
    el("h3", {}, "🧺 농장에서 가져오기"),
    el(
      "div",
      { class: "lab-row" },
      el(
        "select",
        { "aria-label": "가져올 작물", onchange: (e) => actions.remember("labPick", { species: e.target.value, count: 1 }, true) },
        produce.map((s) => el("option", { value: s.id, selected: s === species }, `${s.name.ko} (${itemCount(game.state, s.id)})`)),
      ),
      el("input", {
        type: "number",
        min: "1",
        max: String(max),
        value: String(count),
        "aria-label": "개수",
        onchange: (e) => actions.remember("labPick", { species: species.id, count: Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1)) }, true),
      }),
      el("button", { class: "small", onclick: () => actions.labSend(species.id, count) }, "연구소로 보내기"),
    ),
  ];
}

function samples(lab, data, actions) {
  const rows = lab.samples.map((sample) => {
    const species = data.speciesById.get(sample.species);
    return el(
      "div",
      { class: "lab-row sample" },
      el("img", { class: "mini-icon", src: data.icons.cropHex(sample.species, sample.color), alt: "" }),
      el("span", { class: "recipe-name" }, `${SIZE_NAMES[sample.size]} ${species?.name.ko ?? sample.species} × ${sample.count}`),
      el("input", {
        type: "color",
        value: sample.color,
        title: "색 바꾸기 실험",
        onchange: (e) => actions.labExperiment(sample.id, e.target.value, sample.size),
      }),
      el(
        "select",
        { title: "크기 바꾸기 실험", onchange: (e) => actions.labExperiment(sample.id, sample.color, e.target.value) },
        Object.entries(SIZE_NAMES).map(([id, name]) => el("option", { value: id, selected: id === sample.size }, name)),
      ),
      el("button", { class: "small", disabled: lab.integrity !== "ok", onclick: () => actions.labFuel(sample.id) }, `⛽ 연료 ${sample.count}`),
    );
  });
  return [
    el("h3", {}, "🔬 실험 작물"),
    rows.length ? rows : el("p", { class: "hint" }, "아직 실험 작물이 없어요. 농장에서 가져와 보세요."),
    rows.length > 0 && el("p", { class: "hint" }, "색과 크기는 바꿔 볼 수 있지만 개수는 못 바꿔요 (연료를 공짜로 만들 수 있으니까요). 작물 1개 = 연료 1개."),
  ];
}

// 지문(해시) 글자. 다른 지문과 다른 글자는 강조해요
function hash(text, against) {
  const marks = against ? changedPositions(text, against) : [];
  return el("code", { class: "hash" }, [...text].map((ch, i) => (marks[i] ? el("b", {}, ch) : ch)));
}

function bench(game, lab, actions) {
  const same = lab.hmac === lab.storedDigest;
  const ask = game.ui.whatIf;
  const target = lab.samples.find((s) => s.id === ask?.sampleId) ?? lab.samples[0];
  const result = game.labBench;
  return [
    el("h3", {}, "🔏 지문 실험대"),
    el("p", { class: "hint" }, "연구소 데이터를 정해진 순서의 글자(정렬된 JSON)로 바꾼 뒤 지문을 찍어요."),
    el("pre", { class: "canonical" }, lab.canonical),
    el(
      "dl",
      { class: "hashes" },
      el("dt", {}, "저장할 때 찍은 지문"),
      el("dd", {}, hash(lab.storedDigest ?? "(없음)")),
      el("dt", {}, `지금 다시 계산 (HMAC, 연구소 키) ${same ? "✔ 같아요" : "✘ 달라요"}`),
      el("dd", {}, hash(lab.hmac, lab.storedDigest)),
      el("dt", {}, "키 없이 계산 (그냥 SHA-256)"),
      el("dd", {}, hash(lab.sha256, lab.storedDigest)),
    ),
    el("p", { class: "hint" }, "키 없이 계산한 지문은 저장된 지문과 전혀 달라요. 그래서 키를 모르면 세이브를 고친 뒤 맞는 지문을 새로 만들 수 없어요."),
    target &&
      el(
        "div",
        { class: "lab-row" },
        "만약 ",
        el(
          "select",
          { "aria-label": "실험 작물", onchange: (e) => actions.labWhatIf(Number(e.target.value), lab.samples.find((s) => s.id === Number(e.target.value)).count + 1) },
          lab.samples.map((s) => el("option", { value: String(s.id), selected: s === target }, `${s.species}#${s.id}`)),
        ),
        " 의 개수를 ",
        el("input", {
          type: "number",
          min: "0",
          value: String(ask?.sampleId === target.id ? ask.count : target.count),
          "aria-label": "바꿔 볼 개수",
          onchange: (e) => actions.labWhatIf(target.id, Math.max(0, Math.floor(Number(e.target.value)) || 0)),
        }),
        " 로 바꾸면?",
      ),
    result &&
      el(
        "div",
        {},
        el("dl", { class: "hashes" }, el("dt", {}, "바꾼 뒤의 지문 (저장은 안 해요)"), el("dd", {}, hash(result.hmac, lab.hmac))),
        el("p", { class: "hint" }, `개수 하나만 바꿨는데 64글자 중 ${changedPositions(result.hmac, lab.hmac).filter(Boolean).length}글자가 달라졌어요.`),
      ),
    el(
      "details",
      { class: "more" },
      el("summary", {}, "🔑 연구소 키 보기"),
      el("code", { class: "hash" }, lab.key),
      el(
        "p",
        { class: "hint" },
        "공부용 장난감 키예요 (saves/.lab-key). 본 농장 키는 어디에도 보여 주지 않아요. 키를 알면 고친 데이터에 맞는 지문을 새로 만들 수 있어요 — 그래서 키가 같은 PC 에 있는 이 게임의 보안은 완벽하지 않아요 (docs/learn/07 의 위협 모델).",
      ),
    ),
  ];
}
