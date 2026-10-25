// 하늘과 날씨 그리기: 하루의 빛, 밤의 별과 불빛, 무지개, 비와 눈

const wrap = (v, size) => ((v % size) + size) % size;

function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// 흐리거나 비·눈이 오면 화면이 살짝 회색빛
const WEATHER_TINT = { cloudy: "rgba(90, 100, 120, 0.12)", rain: "rgba(70, 85, 110, 0.22)", snow: "rgba(200, 210, 230, 0.18)" };

export function drawWeatherTint(ctx, weather) {
  if (!WEATHER_TINT[weather]) return;
  ctx.fillStyle = WEATHER_TINT[weather];
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawLight(ctx, light) {
  if (light.darkness <= 0) return;
  ctx.fillStyle = light.tint;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

// 밤이 되면: 하늘에 별이 반짝, 헛간 창문과 화덕에 따뜻한 불빛
export function drawNightLights(ctx, layout, light, weather, time) {
  if (light.darkness < 0.12) return;
  const glow = light.darkness / 0.34; // 0 ~ 1
  // 따뜻한 불빛 둘레
  const halo = (x, y, r) => {
    ctx.fillStyle = `rgba(255, 205, 110, ${(0.22 * glow).toFixed(3)})`;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillRect(x - r - 1, y - r + 2, r * 2 + 2, r * 2 - 4);
  };
  const window = { x: layout.barn.x + 14, y: layout.barn.y + 6 };
  halo(window.x + 2, window.y + 2, 4);
  ctx.fillStyle = "#ffd36b";
  ctx.fillRect(window.x + 1, window.y + 1, 2, 2);
  halo(layout.kitchen.x + 8, layout.kitchen.y + 13, 5);
  // 별 (구름 낀 밤에는 숨어요)
  if (weather !== "sunny" && weather !== "rainbow") return;
  const skyHeight = layout.farm.y - 10;
  const { width } = ctx.canvas;
  for (let i = 0; i < 22; i++) {
    const x = (i * 97 + 13) % width;
    const y = (i * 37 + 5) % skyHeight;
    const twinkle = (Math.sin(time / 600 + i * 1.7) + 1) / 2;
    ctx.globalAlpha = glow * (0.4 + twinkle * 0.6);
    dot(ctx, x, y, i % 5 ? "#fff8d8" : "#cfe4ff");
  }
  ctx.globalAlpha = 1;
}

// 비 갠 뒤 하늘에 뜨는 무지개 (점을 찍어 그린 반원)
const RAINBOW = ["#f08a8a", "#f5b86a", "#f5e07a", "#9ed89a", "#8ab8f0", "#b89af0"];

export function drawRainbow(ctx, layout) {
  const cx = ctx.canvas.width * 0.62;
  const cy = layout.farm.y + 18;
  ctx.globalAlpha = 0.5;
  RAINBOW.forEach((color, i) => {
    const r = 52 - i;
    for (let a = Math.PI; a <= 2 * Math.PI; a += 0.5 / r) {
      const y = cy + Math.sin(a) * r * 0.75;
      if (y < layout.farm.y - 8) dot(ctx, cx + Math.cos(a) * r, y, color);
    }
  });
  ctx.globalAlpha = 1;
}

// 비는 비스듬히 내리는 짧은 줄, 눈 오는 날은 송이송이
export function drawPrecipitation(ctx, weather, time) {
  const { width, height } = ctx.canvas;
  const t = time / 1000;
  if (weather === "rain") {
    ctx.fillStyle = "rgba(200, 220, 240, 0.6)";
    for (let i = 0; i < 60; i++) {
      // 빗방울마다 자리를 흩어 놓아요 (곱하는 수를 잘못 고르면 몇 줄로만 몰려 내려요)
      const x = wrap(((i * 97 + i * i * 31) % width) - t * 30, width);
      const y = wrap(((i * 61 + i * i * 17) % height) + t * (110 + (i % 5) * 12), height);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      ctx.fillRect(Math.round(x) - 1, Math.round(y) + 2, 1, 1); // 살짝 비스듬히
    }
  } else if (weather === "snow") {
    for (let i = 0; i < 34; i++) {
      const x = wrap((i * 59) % width + Math.sin(t + i) * 3, width);
      const y = wrap((i * 41) % height + t * (10 + (i % 5) * 3), height);
      dot(ctx, x, y, "#ffffff");
    }
  }
}
