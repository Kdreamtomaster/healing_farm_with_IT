// 한국어 문장을 자연스럽게 만드는 도우미입니다.

// 마지막 글자에 받침이 있는지에 따라 조사를 고릅니다. josa("튤립", "을", "를") → "튤립을"
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

export const PLOT_NAMES = { field: "밭", paddy: "논", flowerbed: "화단" };
export const STAGE_NAMES = {
  seed: "씨앗",
  sprout: "새싹",
  growing: "자라는 중",
  ripe: "수확 가능",
  withered: "시듦",
};
