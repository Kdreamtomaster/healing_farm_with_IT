// 일지 탭: 도감(돌연변이에 라벨 달기), 해금 진행, 작업 기록 파이프라인(원본 → 정리 → 집계)
// 학습 문서: docs/learn/04-data-pipeline-and-labeling.md
import { labelAccuracy } from "../farm/codex.js";
import { isUnlocked, progress } from "../farm/unlocks.js";
import { el } from "./dom.js";

export function journalTab(game, data, actions) {
  return [
    el("h2", {}, "농장 일지 📒"),
    el("p", { class: "hint" }, "특별한 작물에 이름표(라벨)를 달고, 쌓인 작업 기록이 어떻게 표로 바뀌는지 봐요."),
    codex(game, data, actions),
    unlocks(game, data),
    pipeline(game, actions),
  ];
}

function codex(game, data, actions) {
  const entries = game.state.meta.codex ?? [];
  const { traits, categories } = data.mutations;
  const nameOf = (id) => data.speciesById.get(id)?.name.ko ?? id;
  const pending = entries.filter((e) => !e.label);
  const done = entries.filter((e) => e.label);
  const accuracy = labelAccuracy(entries);
  const labelForm = (entry) => {
    const draft = game.ui.labelDraft?.[entry.id] ?? { color: "none", shape: "none", size: "none", name: entry.name };
    // 고를 때마다 지금까지 고른 것에 덧붙여요 (그릴 때의 draft 를 쓰면 앞서 고른 값이 사라져요)
    const set = (key, value) => {
      const drafts = game.ui.labelDraft ?? {};
      actions.remember("labelDraft", { ...drafts, [entry.id]: { ...(drafts[entry.id] ?? draft), [key]: value } });
    };
    return el(
      "div",
      { class: "lab-row" },
      Object.entries(traits).map(([category, values]) =>
        el(
          "select",
          { "aria-label": categories[category], onchange: (e) => set(category, e.target.value) },
          el("option", { value: "none", selected: draft[category] === "none" }, `${categories[category]}: 평범`),
          Object.entries(values).map(([id, name]) => el("option", { value: id, selected: draft[category] === id }, `${categories[category]}: ${name}`)),
        ),
      ),
      el("input", { type: "text", maxlength: "20", placeholder: "이름 붙이기", value: draft.name ?? "", "aria-label": "이름", onchange: (e) => set("name", e.target.value) }),
      el("button", { class: "small", onclick: () => actions.labelCodex(entry.id, game.ui.labelDraft?.[entry.id] ?? draft) }, entry.label ? "라벨 고치기" : "라벨 달기"),
    );
  };
  const row = (entry, form) =>
    el(
      "div",
      { class: "codex-entry" },
      el("div", { class: "lab-row" }, el("img", { class: "big-icon", src: data.icons.mutant(entry.species, entry.truth), alt: "" }), el("span", { class: "recipe-name" }, entry.name || `이름 없는 ${nameOf(entry.species)}`, el("small", {}, nameOf(entry.species)))),
      entry.label &&
        el(
          "p",
          { class: "hint" },
          Object.keys(traits).map((c) => {
            const right = (entry.truth[c] ?? "none") === entry.label[c];
            return el("span", { class: right ? "need ok" : "need" }, `${right ? "✔" : "✘"} ${categories[c]}: ${traits[c][entry.label[c]] ?? "평범"}  `);
          }),
        ),
      form && labelForm(entry),
    );
  return [
    el("h3", {}, `📖 도감 (${done.length}/${entries.length})`),
    !entries.length && el("p", { class: "hint" }, "수확할 때 아주 가끔 특별한 작물(돌연변이)이 나와요. 찾으면 여기에 올라와요."),
    pending.length > 0 && el("p", { class: "hint" }, "✨ 이름표를 기다리는 작물이 있어요. 그림을 잘 보고 색·모양·크기를 골라 주세요."),
    pending.map((e) => row(e, true)),
    done.map((e) => row(e, game.ui.relabel === e.id)),
    accuracy.total > 0 && el("p", { class: "hint" }, `내 라벨 정확도 ${Math.round((accuracy.right / accuracy.total) * 100)}% (${accuracy.right}/${accuracy.total}) — 사람이 다는 라벨도 틀릴 수 있어서, 실제 AI 데이터도 여러 번 확인해요.`),
    done.length > 0 &&
      el(
        "div",
        { class: "lab-row" },
        "라벨 고치기: ",
        el("select", { onchange: (e) => actions.remember("relabel", e.target.value, true) }, el("option", { value: "" }, "고를 작물"), done.map((e) => el("option", { value: e.id, selected: game.ui.relabel === e.id }, e.name || e.id))),
      ),
  ];
}

function unlocks(game, data) {
  return [
    el("h3", {}, "🔓 해금"),
    el("p", { class: "hint" }, "서명된 숫자(수확·요리·직접 플레이 시간·도감)로 판단해요. 작업 기록은 지문 밖이라 판단에 쓰지 않아요."),
    data.unlocks.map((unlock) => {
      const open = isUnlocked(game.state, unlock);
      return el(
        "div",
        { class: open ? "unlock open" : "unlock" },
        el("strong", {}, `${open ? "✔" : "🔒"} ${unlock.name}`),
        !open &&
          progress(game.state, unlock).map((p) =>
            el("div", { class: "unlock-need" }, el("small", {}, `${p.name} ${p.have}/${p.need}`), el("div", { class: "bar grow" }, el("div", { class: "bar-fill", style: `width:${Math.round((p.have / p.need) * 100)}%` }))),
          ),
      );
    }),
  ];
}

const table = (columns, rows) =>
  el("table", { class: "sql-table" }, el("tr", {}, columns.map((c) => el("th", {}, c))), rows.map((r) => el("tr", {}, r.map((v) => el("td", {}, v === null ? "NULL" : String(v))))));

function pipeline(game, actions) {
  const j = game.journal;
  const head = [el("h3", {}, "📊 작업 기록 파이프라인"), el("button", { class: "small ghost", onclick: actions.refreshJournal }, "새로 읽기")];
  if (!j) return [...head, el("p", { class: "hint" }, "읽는 중…")];
  if (j.error) return [...head, el("p", { class: "hint" }, j.error)];
  const { counts, fixed, dropped } = j.clean;
  return [
    ...head,
    el("p", { class: "hint" }, "작업 기록은 먼저 저장된 것까지 보여요. (방금 한 일은 저장한 뒤에)"),
    el("details", { class: "more" }, el("summary", {}, "① 원본 — task_log 표 그대로"), el("code", { class: "sql" }, j.raw.sql), table(j.raw.columns, j.raw.rows)),
    el(
      "details",
      { class: "more" },
      el("summary", {}, `② 정리 — 읽은 ${counts.read}줄: 그대로 ${counts.kept - counts.fixed} · 고침 ${counts.fixed} · 뺌 ${counts.dropped}`),
      fixed.length > 0 && el("p", { class: "hint" }, "고친 예:"),
      el("ul", { class: "cheats" }, fixed.map((f) => el("li", {}, `#${f.id} ${f.why}`))),
      dropped.length > 0 && el("p", { class: "hint" }, "뺀 예:"),
      el("ul", { class: "cheats" }, dropped.map((d) => el("li", {}, `#${d.id} ${d.why}`))),
    ),
    el(
      "details",
      { class: "more", open: true },
      el("summary", {}, "③ 집계 — 정리한 표(clean_log)에 SQL 로 묻기"),
      j.tables.map((t) => [el("p", { class: "label" }, t.title), el("code", { class: "sql" }, t.sql), t.rows.length ? table(t.columns, t.rows) : el("p", { class: "hint" }, "아직 기록이 없어요")]),
    ),
  ];
}
