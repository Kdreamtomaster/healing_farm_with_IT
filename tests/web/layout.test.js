// web/ui/layout.js 테스트: 가로·세로 화면 배치와 확대 배율
import { computeLayout, fitZoom, giftSpots } from "../../web/ui/layout.js";
import { assert, test } from "./runner.js";

const plots = [];
for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) plots.push({ x, y });

test("세로 화면은 창고를 밭 아래로 옮겨 폭이 더 좁다", () => {
  const wide = computeLayout(plots, false);
  const tall = computeLayout(plots, true);
  assert(tall.width < wide.width, `세로 ${tall.width} < 가로 ${wide.width}`);
  assert(tall.crates.y > tall.farm.y + tall.farm.h, "상자는 밭 아래");
  assert(wide.crates.x > wide.farm.x + wide.farm.w, "가로에서는 밭 오른쪽");
});

test("창고와 헛간이 화면 안에 들어간다", () => {
  for (const layout of [computeLayout(plots, false), computeLayout(plots, true)]) {
    assert(layout.crates.x + 4 * 16 <= layout.width && layout.sacks.y + 12 <= layout.height, JSON.stringify(layout.crates));
    assert(layout.barn.x + 32 <= layout.width && layout.barn.y + 32 <= layout.height, "헛간");
    assert(layout.kitchen.x + 16 <= layout.width && layout.kitchen.y + 16 <= layout.height, "화덕");
    assert(layout.cat.x + 16 <= layout.width && layout.cat.y + 16 <= layout.height, "고양이");
    assert(layout.picnic.x + layout.picnic.w <= layout.width && layout.picnic.y + layout.picnic.h <= layout.height, "돗자리");
  }
});

test("확대 배율은 정수로, 화면이 아주 작을 때만 소수로", () => {
  const layout = computeLayout(plots, true); // 160 폭
  assert(fitZoom(layout, 352, 500) === 2, "갤럭시 S25 세로 폭 352px → 2배");
  assert(fitZoom(layout, 100, 500) < 1, "너무 좁으면 줄여요");
});

test("꾸미기 자리와 선물 자리가 화면 안에 있다", () => {
  for (const layout of [computeLayout(plots, false), computeLayout(plots, true)]) {
    for (const [name, spot] of Object.entries(layout.decor)) {
      assert(spot.x >= 0 && spot.y >= 0 && spot.x + 16 <= layout.width && spot.y + 16 <= layout.height, `${name} ${JSON.stringify(spot)}`);
    }
    const gift = giftSpots(layout.picnic);
    assert(gift.taker.x - 8 >= -28 && gift.taker.x < gift.giver.x, "친구는 왼쪽에서 와서 농부 왼쪽에 서요");
  }
});
