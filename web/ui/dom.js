// 화면 요소를 만드는 작은 도우미입니다.
// innerHTML 대신 이 함수를 쓰면 글자가 HTML 로 해석되지 않아 안전합니다.
//   el("button", { class: "big", onclick: () => ... }, "물주기")
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}
