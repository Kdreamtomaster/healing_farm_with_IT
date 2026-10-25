// 아주 작은 테스트 도구입니다. test("이름", () => { ... }) 로 쓰고, 실패하면 오류를 던집니다.
// 기다려야 하는 테스트는 async 함수로 쓰면 돼요.
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

// 등록된 테스트를 차례로 실행하고 결과 목록을 돌려줍니다.
export async function runAll() {
  const results = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
    }
  }
  return results;
}

export function assert(condition, message = "조건이 맞지 않아요") {
  if (!condition) throw new Error(message);
}

export function assertNear(actual, expected, message = "", epsilon = 1e-9) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${message} 기대값 ${expected}, 실제값 ${actual}`);
}
