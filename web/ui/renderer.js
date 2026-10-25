// 농장을 도트 그래픽으로 그립니다.
// 캔버스는 실제 픽셀 크기(칸 하나 16×16)로 그리고, CSS 로 화면에 맞게 확대합니다.
// (style.css 의 image-rendering: pixelated 덕분에 흐려지지 않아요)
//
// 그리는 순서: 배경(풀·나무·헛간) → 창고(상자·자루) → 밭과 작물 → 계절 색조 → 사람·드론 → 계절 입자 → 선택 표시
// scene = { layout, state, speciesList, speciesById, palette, sprites, selectedId, preview, animator, time }
//   time: 애니메이션용 시각(ms). 흔들리는 작물, 계절 효과가 이 값으로 움직여요.
import { borderColor, cropColor, mixColors } from "../decor/palette.js";
import { seasonOf } from "../decor/season.js";
import { isThirsty, stageOf } from "../farm/crops.js";
import { TILE } from "./layout.js";
import { drawScenery, drawStorage } from "./scenery.js";
const SWAY_MS = 700; // 작물이 흔들리는 박자
const RIPPLE = "#cfeaf2";
const SELECT = "#fff6c8";

// px, py 는 밭 왼쪽 위 모서리 기준 좌표예요
export function plotAt(plots, px, py) {
  const x = Math.floor(px / TILE);
  const y = Math.floor(py / TILE);
  return plots.find((p) => p.x === x && p.y === y) ?? null;
}

export function drawFarm(ctx, scene) {
  const { layout, state, speciesById, palette, sprites, selectedId, preview, time } = scene;
  const season = seasonOf(state.meta.gameMinutes).id;
  const look = palette.seasons[season];
  drawScenery(ctx, layout, palette, sprites, look);
  drawStorage(ctx, layout, state, scene.speciesList, sprites);
  const beat = Math.floor(time / SWAY_MS);
  ctx.save();
  ctx.translate(layout.farm.x, layout.farm.y); // 여기부터는 밭 기준 좌표
  for (const plot of state.plots) {
    const ox = plot.x * TILE;
    const oy = plot.y * TILE;
    drawSoil(ctx, ox, oy, plot, palette);
    // 칸마다 박자를 조금씩 어긋나게 해서 바람에 물결치듯 흔들려요
    const frame = beat + plot.x + plot.y;
    if (plot.crop) {
      const species = speciesById.get(plot.crop.species);
      const hex = cropColor(species, plot.crop.color).hex;
      ctx.drawImage(sprites.crop(species.id, stageOf(plot.crop), frame, hex), ox, oy);
      if (isThirsty(plot.crop, species)) ctx.drawImage(sprites.drop, ox, oy + (frame % 2));
    } else if (preview && preview.plotId === plot.id) {
      const species = speciesById.get(preview.speciesId);
      ctx.globalAlpha = 0.55; // 미리보기는 반투명하게
      ctx.drawImage(sprites.crop(species.id, "ripe", frame, cropColor(species, preview.colorId).hex), ox, oy);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  ctx.fillStyle = look.tint;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(layout.farm.x, layout.farm.y);
  scene.animator?.draw(ctx, sprites, time); // 농부와 친구들, 드론, 스프링클러, 물길
  const selected = state.plots.find((p) => p.id === selectedId);
  if (selected) drawSelection(ctx, selected.x * TILE, selected.y * TILE);
  ctx.restore();
  drawParticles(ctx, season, look.particle, time);
}

function drawSoil(ctx, ox, oy, plot, palette) {
  const soil = palette.soil[plot.kind];
  const moisture = plot.crop ? plot.crop.moisture : 30;
  ctx.fillStyle = borderColor(palette, plot.border);
  ctx.fillRect(ox, oy, TILE, TILE);
  ctx.fillStyle = mixColors(soil.dry, soil.wet, moisture / 100);
  ctx.fillRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
  if (plot.kind === "paddy" && moisture > 60) {
    ctx.fillStyle = RIPPLE;
    for (const [x, y] of [[3, 3], [4, 3], [11, 5], [12, 5], [4, 13], [5, 13], [12, 12]]) ctx.fillRect(ox + x, oy + y, 1, 1);
  }
}

// 계절마다 작은 입자: 봄 꽃잎, 여름 반딧불, 가을 낙엽, 겨울 눈
const PARTICLES = 14;
const wrap = (v, size) => ((v % size) + size) % size;

function drawParticles(ctx, season, color, time) {
  const { width, height } = ctx.canvas;
  const t = time / 1000;
  ctx.fillStyle = color;
  for (let i = 0; i < PARTICLES; i++) {
    const x0 = (i * 37) % width;
    const y0 = (i * 53) % height;
    const speed = 3 + ((i * 7) % 5); // 입자마다 떨어지는 속도가 조금씩 달라요
    if (season === "summer") {
      ctx.globalAlpha = (Math.sin(t * 2 + i) + 1) / 2; // 깜빡깜빡
      ctx.fillRect(Math.round(wrap(x0 + Math.sin(t * 0.7 + i) * 6, width)), Math.round(wrap(y0 + Math.cos(t * 0.5 + i) * 4, height)), 1, 1);
    } else {
      const fall = season === "winter" ? speed * 1.3 : speed;
      const x = Math.round(wrap(x0 + Math.sin(t + i) * 3 + t * (season === "winter" ? 0.5 : 2), width));
      const y = Math.round(wrap(y0 + t * fall, height));
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, y, season === "winter" ? 1 : 2, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSelection(ctx, ox, oy) {
  ctx.fillStyle = SELECT;
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
}
