// 구획 꾸미기 규칙: 테두리 색 바꾸기
// 바꾼 색은 plot.border 에 담겨 저장됩니다.

export function setBorder(plot, borderId) {
  if (plot.border === borderId) return false;
  plot.border = borderId;
  return true;
}

// 같은 종류(밭/논/화단)의 칸을 모두 같은 테두리 색으로. 바뀐 칸 수를 돌려줍니다.
export function applyBorderToKind(state, kind, borderId) {
  let count = 0;
  for (const plot of state.plots) {
    if (plot.kind === kind && setBorder(plot, borderId)) count += 1;
  }
  return count;
}
