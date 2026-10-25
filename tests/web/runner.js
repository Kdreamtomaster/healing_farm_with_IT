// 아주 작은 테스트 도구입니다. test("이름", () => { ... }) 로 쓰고, 실패하면 오류를 던집니다.
export const results = [];

export function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

export function assert(condition, message = "조건이 맞지 않아요") {
  if (!condition) throw new Error(message);
}

export function assertNear(actual, expected, message = "", epsilon = 1e-9) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${message} 기대값 ${expected}, 실제값 ${actual}`);
}
