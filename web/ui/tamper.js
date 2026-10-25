// 무결성 이상(변조) 안내: 무엇이 바뀌었는지 보여 주는 문장 만들기
// 서버가 마지막 정상 저장본과 비교한 차이(tamperDiff)를 받아요 → server/integrity/diff.py
const MAX_LINES = 8;

const show = (value) => (value === null || value === undefined ? "없음" : JSON.stringify(value));

// [{ path, before, after }] → 안내 문장들
export function tamperLines(diff) {
  const lines = [
    "저장할 때 찍어 둔 지문(HMAC)과 지금 세이브의 지문이 달라요.",
    "게임이 아닌 다른 곳에서 세이브를 고치면 이렇게 알아챌 수 있어요.",
  ];
  if (diff === null || diff === undefined) {
    lines.push("비교할 정상 저장본이 없어서, 어디가 바뀌었는지는 알 수 없어요. (키 파일 saves/.key 가 바뀌었을 수도 있어요)");
  } else if (!diff.length) {
    lines.push("값은 그대로인데 지문만 달라요. 키 파일(saves/.key)이나 지문이 바뀌었을 수 있어요.");
  } else {
    lines.push("마지막 정상 저장본과 비교해 보니 이곳이 바뀌었어요:");
    for (const change of diff.slice(0, MAX_LINES)) lines.push(`${change.path}: ${show(change.before)} → ${show(change.after)}`);
    if (diff.length > MAX_LINES) lines.push(`… 그 밖에 ${diff.length - MAX_LINES}곳`);
  }
  lines.push("약속대로 메뚜기 떼가 지나간 뒤, 농장은 처음부터 다시 시작해요. (연구소는 그대로예요)");
  lines.push("바뀐 세이브는 saves/broken/ 폴더에 남겨 둬요. 더 알아보기: docs/learn/07-hash-and-integrity.md");
  return lines;
}
