// 마우스를 칸 위에 올리면 뜨는 작은 정보 카드
import { el } from "./dom.js";

const tip = () => document.getElementById("tip");

// summary: { title, lines, icon? } (panels.js 의 plotSummary), x·y: 화면 위치(px)
export function showTip(summary, x, y) {
  const box = tip();
  box.replaceChildren(
    summary.icon ? el("img", { src: summary.icon, alt: "" }) : null,
    el("div", {}, el("strong", {}, summary.title), ...summary.lines.map((line) => el("span", {}, line))),
  );
  box.hidden = false;
  // 화면 밖으로 나가지 않게, 오른쪽이 모자라면 커서 왼쪽에 띄워요
  const width = box.offsetWidth;
  const left = x + 16 + width > innerWidth ? x - width - 12 : x + 16;
  box.style.left = `${Math.max(4, left)}px`;
  box.style.top = `${Math.max(4, y + 14)}px`;
}

export function hideTip() {
  tip().hidden = true;
}
