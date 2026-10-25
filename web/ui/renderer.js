// 농장을 도트 그래픽으로 그립니다.
// 캔버스는 실제 픽셀 크기(칸 하나 16×16)로 그리고, CSS 로 4배 확대합니다.
// (style.css 의 image-rendering: pixelated 덕분에 흐려지지 않아요)
//
// 아직 그림 파일(assets/) 대신 점을 하나하나 찍어 그립니다. 4단계에서 그림 파일로 바꿀 예정이에요.
import { isThirsty, stageOf } from "../farm/crops.js";

export const TILE = 16;
export const ZOOM = 4;

const COLORS = {
  border: { field: "#6b4a2b", paddy: "#3f5f66", flowerbed: "#5a3b26" },
  dry: { field: "#d2a874", paddy: "#a9bdb0", flowerbed: "#c49670" },
  wet: { field: "#7d5434", paddy: "#4d7a86", flowerbed: "#6e4630" },
  ripple: "#cfeaf2",
  seed: "#4a2f1c",
  stem: "#4f8f3a",
  leaf: "#7cbc52",
  wither: "#8b6b3d",
  flowerCenter: "#f7e27a",
  drop: "#5aa9e6",
  select: "#fff6c8",
};

export function farmSize(plots) {
  const cols = Math.max(...plots.map((p) => p.x)) + 1;
  const rows = Math.max(...plots.map((p) => p.y)) + 1;
  return { width: cols * TILE, height: rows * TILE };
}

export function plotAt(plots, px, py) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  return plots.find((p) => p.x === x && p.y === y) ?? null;
}

export function drawFarm(ctx, state, speciesById, selectedId) {
  for (const plot of state.plots) {
    const ox = plot.x * TILE;
    const oy = plot.y * TILE;
    drawSoil(ctx, ox, oy, plot);
    if (plot.crop) {
      const species = speciesById.get(plot.crop.species);
      drawPlant(ctx, ox, oy, plot.crop, species);
      if (isThirsty(plot.crop, species)) drawDrop(ctx, ox, oy);
    }
    if (plot.id === selectedId) drawSelection(ctx, ox, oy);
  }
}

function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// 두 색을 t(0~1) 비율로 섞습니다. 흙이 젖을수록 진해져요.
function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}

function drawSoil(ctx, ox, oy, plot) {
  const moisture = plot.crop ? plot.crop.moisture : 30;
  ctx.fillStyle = COLORS.border[plot.kind];
  ctx.fillRect(ox, oy, TILE, TILE);
  ctx.fillStyle = mix(COLORS.dry[plot.kind], COLORS.wet[plot.kind], moisture / 100);
  ctx.fillRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
  if (plot.kind === "paddy" && moisture > 60) {
    for (const [x, y] of [[3, 3], [4, 3], [11, 5], [12, 5], [4, 13], [5, 13], [12, 12]]) {
      dot(ctx, ox + x, oy + y, COLORS.ripple);
    }
  }
}

function drawPlant(ctx, ox, oy, crop, species) {
  const P = (x, y, color) => dot(ctx, ox + x, oy + y, color);
  const stage = stageOf(crop);
  if (stage === "seed") {
    P(6, 12, COLORS.seed);
    P(8, 11, COLORS.seed);
    P(10, 12, COLORS.seed);
    return;
  }
  const color = species.colors[0];
  const height = stage === "sprout" ? 3 : 7; // 줄기 길이
  const stems = species.type === "paddy" ? [5, 8, 11] : [8];
  const top = 13 - height;
  const stemColor = stage === "withered" ? COLORS.wither : COLORS.stem;
  for (const sx of stems) {
    for (let i = 0; i < height; i++) P(sx, 12 - i, stemColor);
  }
  if (stage === "withered") {
    for (const sx of stems) P(sx + 1, top, COLORS.wither); // 고개 숙인 줄기
    return;
  }
  for (const sx of stems) {
    P(sx - 1, top + 1, COLORS.leaf);
    P(sx + 1, top + 2, COLORS.leaf);
    if (height > 3) {
      P(sx - 1, top + 4, COLORS.leaf);
      P(sx + 1, top + 5, COLORS.leaf);
    }
  }
  if (stage !== "ripe") return;
  if (species.type === "flower") {
    for (const [x, y] of [[7, top - 1], [9, top - 1], [8, top - 2], [8, top], [7, top - 2], [9, top - 2]]) P(x, y, color);
    P(8, top - 1, COLORS.flowerCenter);
  } else if (species.type === "paddy") {
    for (const sx of stems) {
      P(sx, top - 1, color);
      P(sx + 1, top, color); // 익어서 고개 숙인 이삭
    }
  } else {
    for (const [x, y] of [[5, 8], [6, 8], [5, 9], [6, 9], [10, 10], [11, 10], [10, 11], [11, 11]]) P(x, y, color);
  }
}

// 목마른 작물 위에 물방울 표시
function drawDrop(ctx, ox, oy) {
  for (const [x, y] of [[13, 1], [12, 2], [13, 2], [14, 2], [13, 3]]) dot(ctx, ox + x, oy + y, COLORS.drop);
}

function drawSelection(ctx, ox, oy) {
  ctx.fillStyle = COLORS.select;
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
}
