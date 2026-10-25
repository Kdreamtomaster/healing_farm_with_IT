// 도트 그림(assets/) 불러오기와 팔레트 스왑
//
// 열매·꽃 자리는 그림 파일에 표시색(분홍 #ff00ff, 진분홍 #b000b0)으로 칠해 두고,
// 그릴 때 그 작물의 색으로 바꿔 칠합니다. 그래서 그림 한 장으로 빨간 토마토도, 노란 토마토도 그릴 수 있어요.
import { hexToRgb } from "../decor/palette.js";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`그림을 불러오지 못했어요: ${src}`));
    img.src = `/assets/${src}`;
  });
}

export async function loadSprites(manifest) {
  const { ids, frames } = manifest.crops;
  const entries = [];
  for (const id of ids) {
    for (const [stage, count] of Object.entries(frames)) {
      for (let f = 1; f <= count; f++) entries.push([`${id}_${stage}_${f}`, `crops/${id}_${stage}_${f}.png`]);
    }
  }
  const images = Object.fromEntries(await Promise.all(entries.map(async ([key, src]) => [key, await loadImage(src)])));
  const drop = await loadImage(manifest.effects.drop);
  const markers = { main: hexToRgb(manifest.recolor.main), shade: hexToRgb(manifest.recolor.shade) };
  const cache = new Map();

  return {
    drop,
    // frame 은 0, 1, 2 … 아무 숫자나 넣으면 그 단계의 그림 수에 맞춰 돌아가요.
    crop(id, stage, frame, hex) {
      const key = `${id}_${stage}_${(frame % frames[stage]) + 1}`;
      const cacheKey = `${key}|${hex}`;
      if (!cache.has(cacheKey)) cache.set(cacheKey, recolor(images[key], markers, hex));
      return cache.get(cacheKey);
    },
  };
}

function recolor(image, markers, hex) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const main = hexToRgb(hex);
  const shade = main.map((v) => Math.round(v * 0.72)); // 그림자 쪽은 조금 어둡게
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    const same = (rgb) => d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2];
    const to = same(markers.main) ? main : same(markers.shade) ? shade : null;
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}
