// 메뉴에 쓰는 작은 그림(아이콘): 게임 그림을 그대로 써서 메뉴와 농장이 한 세트처럼 보여요.
// 색을 바꿔 그린 캔버스는 한 번만 그림 주소(data URL)로 바꿔 두고 다시 써요.
import { cropColor, hexToRgb } from "../decor/palette.js";
import { drawIcon } from "./critters.js";

const RAINBOW = ["#e05050", "#f0a040", "#f0e050", "#60c060", "#5080e0", "#9060d0"];
const SIZE_PX = { small: 12, big: 20 };
// 흰색을 섞어 연하게 (파스텔): "#rrggbb" 로 돌려줘요
const lighten = (hex, t) => `#${hexToRgb(hex).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, "0")).join("")}`;

export function createIcons(sprites, speciesById) {
  const cache = new Map();
  const url = (key, make) => {
    if (!cache.has(key)) cache.set(key, make().toDataURL());
    return cache.get(key);
  };
  return {
    // 다 자란 작물
    crop(speciesId, colorId) {
      const hex = cropColor(speciesById.get(speciesId), colorId).hex;
      return url(`crop:${speciesId}:${hex}`, () => sprites.crop(speciesId, "ripe", 0, hex));
    },
    // 아무 색(#rrggbb)으로 칠한 다 자란 작물 (연구소 실험 작물)
    cropHex(speciesId, hex) {
      return url(`crop:${speciesId}:${hex}`, () => sprites.crop(speciesId, "ripe", 0, hex));
    },
    // 돌연변이 작물: 색(무지개·반짝·파스텔), 모양(하트·별 표시), 크기(큰·작은)를 그림에 입혀요
    mutant(speciesId, traits) {
      return url(`mutant:${speciesId}:${JSON.stringify(traits)}`, () => {
        const base = speciesById.get(speciesId).colors[0].hex;
        const hex = traits.color === "pastel" ? lighten(base, 0.55) : base;
        const crop = sprites.crop(speciesId, "ripe", 0, hex);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 20;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const size = SIZE_PX[traits.size] ?? 16;
        ctx.drawImage(crop, (20 - size) / 2, 20 - size, size, size);
        if (traits.color === "rainbow") {
          // 열매·꽃 색 자리를 줄마다 무지개색으로
          const [r, g, b] = hexToRgb(hex);
          const shade = [r, g, b].map((v) => Math.round(v * 0.72));
          const pixels = ctx.getImageData(0, 0, 20, 20);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const px = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
            const same = (c) => c.every((v, k) => Math.abs(v - px[k]) < 3);
            if (pixels.data[i + 3] && (same([r, g, b]) || same(shade))) {
              const [nr, ng, nb] = hexToRgb(RAINBOW[Math.floor(i / 4 / 20) % RAINBOW.length]);
              pixels.data.set([nr, ng, nb], i);
            }
          }
          ctx.putImageData(pixels, 0, 0);
        }
        if (traits.color === "sparkle") {
          ctx.fillStyle = "#fffbe0";
          for (const [x, y] of [[4, 5], [15, 3], [12, 11], [6, 13]]) ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = "#f5c832";
          for (const [x, y] of [[3, 5], [5, 5], [4, 4], [4, 6], [15, 2], [15, 4]]) ctx.fillRect(x, y, 1, 1);
        }
        if (traits.shape) drawIcon(ctx, traits.shape, 15, 0);
        return canvas;
      });
    },
    // 씨앗 자루 (띠는 작물 색)
    seed(speciesId) {
      const hex = speciesById.get(speciesId).colors[0].hex;
      return url(`seed:${speciesId}`, () => sprites.scenery("sack_1", hex));
    },
    dish: (recipeId) => `/assets/dishes/${recipeId}.png`,
    craft: (craftId) => `/assets/crafts/${craftId}.png`,
    tool: (toolId) => `/assets/ui/tool_${toolId}.png`,
    fuel: () => "/assets/ui/biofuel.png",
    drone: () => "/assets/actors/drone_1.png",
  };
}

// 도구 그림을 2배로 키운 마우스 커서 (도트가 또렷하게)
export function toolCursor(toolId) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 32, 32);
      resolve(`url(${canvas.toDataURL()}) 4 4, pointer`);
    };
    img.onerror = () => resolve("pointer");
    img.src = `/assets/ui/tool_${toolId}.png`;
  });
}
