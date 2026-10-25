// 색 고르기 도우미: 팔레트(assets/palette.json)와 작물 색(data/crops.json)에서 실제 색을 찾아 줍니다.

export function borderColor(palette, borderId) {
  return (palette.borders.find((b) => b.id === borderId) ?? palette.borders[0]).color;
}

export function cropColor(species, colorId) {
  return species.colors.find((c) => c.id === colorId) ?? species.colors[0];
}

// "#d9483b" → [217, 72, 59]
export function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// 두 색을 t(0~1) 비율로 섞습니다. 흙이 젖을수록 진해지는 데 써요.
export function mixColors(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
}
