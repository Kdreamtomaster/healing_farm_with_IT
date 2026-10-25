// 메뉴에 쓰는 작은 그림(아이콘): 게임 그림을 그대로 써서 메뉴와 농장이 한 세트처럼 보여요.
// 색을 바꿔 그린 캔버스는 한 번만 그림 주소(data URL)로 바꿔 두고 다시 써요.
import { cropColor } from "../decor/palette.js";

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
