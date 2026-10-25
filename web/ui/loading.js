// 재접속 로딩 화면: 오프라인 처리 진행 막대와, 비운 동안 있었던 일 안내
const $ = (id) => document.getElementById(id);

export function showProgress(title, ratio) {
  $("loading").hidden = false;
  $("loading-title").textContent = title;
  $("loading-progress").hidden = false;
  $("loading-bar").style.width = `${Math.round(ratio * 100)}%`;
  $("loading-lines").replaceChildren();
  $("loading-close").hidden = true;
}

// 안내 문장을 보여 주고, "농장으로" 버튼을 누르면 끝나는 Promise 를 돌려줍니다.
export function showSummary(lines) {
  $("loading").hidden = false;
  $("loading-title").textContent = "다녀오셨어요!";
  $("loading-progress").hidden = true;
  $("loading-lines").replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
  const button = $("loading-close");
  button.hidden = false;
  button.focus();
  return new Promise((resolve) => {
    button.onclick = () => {
      $("loading").hidden = true;
      resolve();
    };
  });
}

export function hideLoading() {
  $("loading").hidden = true;
}
