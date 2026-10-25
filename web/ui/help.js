// 단축키 도움말 화면: keys.js 의 단축키 표에서 바로 만들어요. (표만 고치면 도움말도 함께 바뀌어요)
import { el } from "./dom.js";
import { KEYMAP } from "./keys.js";

const MOUSE = [
  ["왼쪽 클릭", "지금 도구로 일하기 (살펴보기 도구면 칸 고르기)"],
  ["왼쪽 끌기", "지나가는 칸마다 지금 도구로 일하기 (한 줄 물주기, 한꺼번에 심기)"],
  ["오른쪽 클릭·끌기", "알맞은 일 (다 자랐으면 수확, 비었으면 심기, 목마르면 물주기)"],
  ["마우스 올리기", "작물 상태 보기 · 씨앗 도구면 심을 모습 미리 보기"],
  ["휠 (씨앗 도구)", "씨앗 바꾸기 · Shift+휠: 색 바꾸기"],
  ["고양이 누르기", "쓰다듬기 ♥"],
];

export function renderHelp(root, onClose) {
  const groups = [...new Set(KEYMAP.map((entry) => entry.group))];
  root.replaceChildren(
    el(
      "div",
      { class: "help-box", role: "dialog", "aria-modal": "true", "aria-label": "조작 방법" },
      el("h2", {}, "🎮 조작 방법"),
      el("p", { class: "hint" }, "왼손은 키보드, 오른손은 마우스에 두고 편하게 농사지어요."),
      el(
        "div",
        { class: "help-grid" },
        el("section", {}, el("h3", {}, "🖱 마우스"), el("dl", {}, MOUSE.flatMap(([k, t]) => [el("dt", {}, el("kbd", {}, k)), el("dd", {}, t)]))),
        groups.map((group) =>
          el(
            "section",
            {},
            el("h3", {}, group),
            el("dl", {}, KEYMAP.filter((e) => e.group === group).flatMap((e) => [el("dt", {}, el("kbd", {}, e.label)), el("dd", {}, e.text)])),
          ),
        ),
      ),
      el("button", { onclick: onClose }, "닫기 ", el("kbd", {}, "Esc")),
    ),
  );
}
