// 농장 배경(풀밭, 길, 울타리, 나무, 헛간)과 창고 풍경(쌓이는 수확물 상자와 씨앗 자루)을 그립니다.
// 풀과 나뭇잎 색은 계절마다 바뀌어요 (assets/palette.json 의 seasons).
import { TILE } from "./layout.js";

function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

const inside = (x, y, r) => x >= r.x - 2 && x < r.x + r.w + 2 && y >= r.y - 2 && y < r.y + r.h + 2;

export function drawScenery(ctx, layout, palette, sprites, look) {
  const { width, height } = layout;
  const { scenery } = palette;
  // 풀밭과 풀 포기 (자리는 늘 같아서 화면이 깜빡이지 않아요)
  ctx.fillStyle = look.grass;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const x = (i * 73 + 11) % width;
    const y = (i * 151 + 7) % height;
    if (inside(x, y, layout.farm)) continue;
    dot(ctx, x, y, look.grassDark);
    dot(ctx, x + 2, y - 1, look.grassDark);
  }
  // 흙길
  const { path } = layout;
  ctx.fillStyle = scenery.path;
  ctx.fillRect(path.x, path.y, path.w, path.h);
  for (let y = path.y + 2; y < path.y + path.h; y += 5) dot(ctx, path.x + ((y * 7) % path.w), y, scenery.pathDark);
  // 울타리: 밭 위쪽
  const { farm } = layout;
  const fenceY = farm.y - 7;
  ctx.fillStyle = scenery.fence;
  ctx.fillRect(farm.x - 2, fenceY + 1, farm.w + 4, 1);
  ctx.fillRect(farm.x - 2, fenceY + 4, farm.w + 4, 1);
  for (let x = farm.x - 2; x <= farm.x + farm.w + 2; x += 8) {
    ctx.fillStyle = scenery.fenceDark;
    ctx.fillRect(x, fenceY, 2, 6);
  }
  // 나무 (잎이 계절 색으로)
  for (const tree of layout.trees) ctx.drawImage(sprites.scenery("tree_1", look.leaf), tree.x, tree.y);
  ctx.drawImage(sprites.scenery("barn_1"), layout.barn.x, layout.barn.y);
}

// 수확물 무더기: 아래 줄부터 4·3·2·1 개씩 피라미드처럼 쌓아요
const PILE = [
  [1, 0], [4, 0], [7, 0], [10, 0],
  [2.5, 1], [5.5, 1], [8.5, 1],
  [4, 2], [7, 2],
  [5.5, 3],
];

function drawFruit(ctx, x, y, hex) {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = "rgba(0,0,0,0.25)"; // 아래쪽 그림자
  ctx.fillRect(x, y + 2, 3, 1);
  ctx.fillStyle = "rgba(255,255,255,0.6)"; // 반짝
  ctx.fillRect(x, y, 1, 1);
}

// 창고 풍경: 작물마다 상자 하나(수확물이 쌓임)와 씨앗 자루(씨앗이 많을수록 자루가 늘어남)
export function drawStorage(ctx, layout, state, speciesList, sprites) {
  speciesList.forEach((species, i) => {
    const hex = species.colors[0].hex;
    // 수확물 상자
    const cx = layout.crates.x + i * TILE;
    const cy = layout.crates.y;
    const produce = Math.min(PILE.length, state.inventory[species.id] ?? 0);
    ctx.drawImage(sprites.scenery("crate_1"), cx, cy);
    for (const [px, row] of PILE.slice(0, produce)) drawFruit(ctx, Math.round(cx + px), cy + 6 - row * 3, hex);
    // 씨앗 자루: 씨앗 3개마다 한 자루, 최대 3자루 (2개 위에 1개)
    const seeds = state.inventory[`seed_${species.id}`] ?? 0;
    const sacks = Math.min(3, Math.ceil(seeds / 3));
    const sx = layout.sacks.x + i * TILE;
    const sy = layout.sacks.y;
    const spots = [[-2, 4], [4, 4], [1, -1]];
    for (const [dx, dy] of spots.slice(0, sacks)) ctx.drawImage(sprites.scenery("sack_1", hex), sx + dx, sy + dy);
  });
}
