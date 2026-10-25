// 화면 배치: 밭, 헛간과 창고 마당, 나무가 어디에 놓일지 정합니다. (단위: 도트 1칸 = 1px)
//
// 가로 화면(16:9 등):          세로 화면(9:16, 갤럭시 S25 등):
//   나무  나무    나무          나무  나무  나무
//  ┌울타리──────┐ 헛간         ┌울타리──────┐
//  │    밭     │길 상자        │    밭     │
//  └──────────┘  자루         └──────────┘
//                              헛간 상자 자루
export const TILE = 16;

export function computeLayout(plots, portrait) {
  const cols = Math.max(...plots.map((p) => p.x)) + 1;
  const rows = Math.max(...plots.map((p) => p.y)) + 1;
  const farm = { x: TILE, y: 2 * TILE, w: cols * TILE, h: rows * TILE };
  const farmRight = farm.x + farm.w;
  const farmBottom = farm.y + farm.h;

  if (!portrait) {
    const yard = { x: farmRight + TILE, y: TILE, w: 5 * TILE };
    return {
      portrait,
      width: yard.x + yard.w,
      height: farmBottom + TILE,
      farm,
      barn: { x: yard.x + 24, y: yard.y },
      crates: { x: yard.x + 8, y: yard.y + 34 }, // 수확물 상자 줄
      sacks: { x: yard.x + 10, y: yard.y + 56 }, // 씨앗 자루 줄
      path: { x: farmRight + 3, y: yard.y + 30, w: 10, h: farmBottom - yard.y - 30 },
      trees: [2, 26, 50, 78, 104, 128].map((x, i) => ({ x, y: i % 2 ? 2 : 0 })),
    };
  }
  const yardY = farmBottom + 8;
  return {
    portrait,
    width: farmRight + TILE,
    height: yardY + 40,
    farm,
    barn: { x: farm.x, y: yardY },
    crates: { x: farm.x + 44, y: yardY },
    sacks: { x: farm.x + 46, y: yardY + 22 },
    path: { x: farm.x + 10, y: farmBottom, w: 12, h: 10 },
    trees: [2, 28, 56, 84, 112, 140].map((x, i) => ({ x, y: i % 2 ? 2 : 0 })),
  };
}

// 화면 크기에 맞는 확대 배율. 도트가 고르게 보이도록 되도록 정수 배로 키워요.
export function fitZoom(layout, availableWidth, availableHeight) {
  const fit = Math.min(availableWidth / layout.width, availableHeight / layout.height);
  return fit >= 1 ? Math.floor(fit) : fit;
}
