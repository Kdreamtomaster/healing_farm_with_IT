// web/ui/animations.js 테스트: 연출이 칸에 닿을 때 딱 한 번씩 물을 주는지, 순서와 끝맺음이 맞는지
// 시간은 가짜 숫자(ms)를 직접 넣어 앞으로 돌려요.
import { createAnimator, visitOrder } from "../../web/ui/animations.js";
import { assert, test } from "./runner.js";

const plot = (id, x, y) => ({ id, x, y });

// 0 ~ endMs 까지 50ms 씩 시간을 흘려보내기
function run(animator, endMs, from = 0) {
  for (let t = from; t <= endMs; t += 50) animator.update(t);
}

test("드론은 가까운 칸부터 들른다", () => {
  const order = visitOrder({ x: 0, y: 0 }, [plot(1, 5, 0), plot(2, 0, 0), plot(3, 2, 0)]);
  assert(order.map((p) => p.id).join() === "2,3,1", order.map((p) => p.id).join());
});

test("농부는 걸어가서 물을 딱 한 번 주고, 부탁을 차례로 처리한다", () => {
  const animator = createAnimator();
  const watered = [];
  animator.farmerWater(plot(1, 7, 3), (p) => watered.push([p.id, animator.farmer.x]));
  animator.farmerWater(plot(2, 0, 0), (p) => watered.push([p.id, animator.farmer.x]));
  animator.update(0);
  assert(watered.length === 0, "도착하기 전에는 물을 주지 않아요");
  run(animator, 5000);
  assert(watered.map(([id]) => id).join() === "1,2", "부탁한 순서대로 한 번씩");
  assert(Math.abs(watered[0][1] - (7 * 16 + 3)) < 0.01, "그 칸 옆에서 물을 줘요");
  assert(!animator.isBusy(), "다 끝나면 쉬어요");
});

test("농부는 아무리 멀어도 1초 안에 도착한다", () => {
  const animator = createAnimator();
  let at = null;
  animator.farmerWater(plot(1, 30, 30), () => (at = at ?? "done"));
  animator.update(0);
  run(animator, 1000, 50);
  assert(animator.farmer.x === 30 * 16 + 3, "1초에는 도착해 있어요");
});

test("드론은 모든 칸에 한 번씩 물을 주고, 끝나면 done 을 한 번 부른다", () => {
  const animator = createAnimator();
  const targets = [plot(1, 0, 0), plot(2, 3, 1), plot(3, 6, 2)];
  const watered = [];
  let done = 0;
  animator.drone(targets, (p) => watered.push(p.id), () => (done += 1), 0);
  run(animator, 10000);
  assert(watered.sort().join() === "1,2,3", watered.join());
  assert(done === 1, `done ${done}번`);
  assert(!animator.isBusy());
});

test("스프링클러는 절반쯤 돌았을 때 모든 칸을 적신다", () => {
  const animator = createAnimator();
  const watered = [];
  animator.sprinklers([plot(1, 0, 0), plot(2, 1, 0)], (p) => watered.push(p.id), () => {}, 0);
  run(animator, 400);
  assert(watered.length === 0, "처음에는 아직");
  run(animator, 2000, 450);
  assert(watered.join() === "1,2");
});

test("논 물길은 왼쪽 칸부터 차례로 채운다", () => {
  const animator = createAnimator();
  const watered = [];
  let done = false;
  animator.flow([plot(3, 2, 2), plot(1, 0, 2), plot(2, 1, 2)], (p) => watered.push(p.id), () => (done = true), 0);
  run(animator, 3000);
  assert(watered.join() === "1,2,3", watered.join());
  assert(done);
});
