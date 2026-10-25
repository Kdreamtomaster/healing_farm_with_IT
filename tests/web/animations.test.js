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

const FRIENDS = [
  { id: "haneul", name: "하늘", shirt: "#f0c860" },
  { id: "bada", name: "바다", shirt: "#5fc0b0" },
  { id: "bomi", name: "봄이", shirt: "#f09ab0" },
];

test("농부는 걸어가서 딱 한 번 일하고, 다 끝나면 쉰다", () => {
  const animator = createAnimator(FRIENDS);
  const done = [];
  animator.work(plot(1, 7, 3), "water", (p, worker) => done.push([p.id, worker.id, worker.x]), 0);
  animator.update(0);
  assert(done.length === 0, "도착하기 전에는 일하지 않아요");
  assert(animator.isPending(1), "가는 중인 칸");
  run(animator, 3000);
  assert(done.length === 1 && done[0][1] === "farmer", "농부가 한 번");
  assert(Math.abs(done[0][2] - (7 * 16 + 3)) < 0.01, "그 칸 옆에서 일해요");
  assert(!animator.isPending(1) && !animator.isBusy(), "다 끝나면 쉬어요");
});

test("농부는 아무리 멀어도 1초 안에 도착한다", () => {
  const animator = createAnimator();
  animator.work(plot(1, 30, 30), "plant", () => {}, 0);
  animator.update(0);
  run(animator, 1000, 50);
  assert(animator.workers[0].x === 30 * 16 + 3, "1초에는 도착해 있어요");
});

test("농부가 바쁘면 친구가 도우러 오고, 일을 마치면 돌아간다", () => {
  const animator = createAnimator(FRIENDS);
  const who = {};
  for (let i = 0; i < 3; i++) animator.work(plot(i, i * 2, 0), "harvest", (p, worker) => (who[p.id] = worker.name ?? "농부"), 0);
  assert(animator.workers.length === 3, "농부 + 친구 2명");
  run(animator, 2000);
  assert(who[0] === "농부" && who[1] === "하늘" && who[2] === "바다", JSON.stringify(who));
  run(animator, 5000, 2050);
  assert(animator.workers.length === 1, "친구들은 돌아가고 농부만 남아요");
});

test("일손은 최대 4명, 그 이상은 할 일이 적은 사람이 이어서 한다", () => {
  const animator = createAnimator(FRIENDS);
  const done = [];
  for (let i = 0; i < 7; i++) animator.work(plot(i, i, 1), "plant", (p) => done.push(p.id), 0);
  assert(animator.workers.length === 4, `일손 ${animator.workers.length}명`);
  run(animator, 6000);
  assert(done.sort((a, b) => a - b).join() === "0,1,2,3,4,5,6", "모든 일을 한 번씩");
});

test("쉬고 있는 친구가 있으면 새로 부르지 않고 그 친구가 한다", () => {
  const animator = createAnimator(FRIENDS);
  animator.work(plot(0, 0, 0), "water", () => {}, 0);
  animator.work(plot(1, 1, 0), "water", () => {}, 0);
  run(animator, 1700); // 둘 다 일을 마침 (친구는 돌아가는 중)
  animator.work(plot(2, 0, 0), "water", () => {}, 1750);
  animator.work(plot(3, 1, 0), "water", () => {}, 1750);
  assert(animator.workers.length === 2, `일손 ${animator.workers.length}명`);
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

test("요리: 화덕에 가서 끓이고 다 되면 한 번 알려 준다", () => {
  const animator = createAnimator(FRIENDS);
  let cooked = 0;
  animator.cook({ x: 150, y: 30 }, () => (cooked += 1));
  run(animator, 1000);
  assert(cooked === 0, "아직 끓는 중");
  run(animator, 4000, 1050);
  assert(cooked === 1);
});

test("나눠 먹기: 농부와 친구 셋이 모두 모여 먹은 뒤에 done 을 한 번 부르고, 친구들은 돌아간다", () => {
  const animator = createAnimator(FRIENDS);
  const seats = [{ x: 40, y: 80, facing: 1 }, { x: 90, y: 80, facing: -1 }, { x: 55, y: 70, facing: 1 }, { x: 75, y: 70, facing: -1 }];
  let done = 0;
  animator.feast(seats, "potato_soup", { x: 65, y: 76 }, () => (done += 1));
  assert(animator.workers.length === 4, "모두 모여요");
  run(animator, 2000);
  assert(done === 0, "아직 먹는 중");
  run(animator, 5000, 2050);
  assert(done === 1, `done ${done}번`);
  run(animator, 9000, 5050);
  assert(animator.workers.length === 1 && !animator.isBusy(), "친구들은 돌아가고 상도 치워요");
});

test("공방: 헛간 앞에 가서 엮고 다 되면 한 번 알려 준다", () => {
  const animator = createAnimator(FRIENDS);
  let made = 0;
  animator.craft({ x: 170, y: 34 }, () => (made += 1));
  run(animator, 3500);
  assert(made === 1, `made ${made}`);
});

test("선물: 농부가 먼저 가서 기다리면 그 친구만 와서 받고, done 은 한 번", () => {
  const animator = createAnimator(FRIENDS);
  const spots = { giver: { x: 40, y: 80, facing: -1 }, taker: { x: 16, y: 80, facing: 1 }, item: { x: 28, y: 66 } };
  let done = 0;
  animator.gift(spots, FRIENDS[1], "cosmos_crown", true, () => (done += 1));
  assert(animator.workers.length === 1, "처음엔 농부만");
  run(animator, 1100);
  assert(animator.workers.length === 2 && animator.workers[1].id === FRIENDS[1].id, "농부가 도착하면 그 친구가 와요");
  run(animator, 4500, 1150);
  assert(done === 1, `done ${done}번`);
  run(animator, 9000, 4550);
  assert(animator.workers.length === 1 && !animator.isBusy(), "친구는 돌아가요");
});
