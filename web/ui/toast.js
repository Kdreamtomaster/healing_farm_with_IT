// 화면 아래에 잠깐 나타났다 사라지는 알림입니다.
let timer = null;

export function showToast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove("show"), 2500);
}
