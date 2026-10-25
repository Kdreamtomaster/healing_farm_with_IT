// 농장의 작은 생명: 헛간 옆 고양이와 팔랑팔랑 나비
// 보기만 해도 마음이 편해지라고 넣었어요. 농사 규칙에는 아무 영향이 없어요.

// 고양이: 낮에는 앉아서 꼬리를 살랑, 밤에는 동그랗게 잠들어요. 쓰다듬으면(누르면) 하트!
export function createCat() {
  return { petUntil: 0 };
}

// 고양이가 있는 자리 (화면 좌표, 16×16)
export function catRect(layout) {
  return { x: layout.cat.x, y: layout.cat.y, w: 16, h: 16 };
}

export function petCat(cat, now) {
  cat.petUntil = now + 1600;
}

export function drawCat(ctx, cat, layout, sprites, sleeping, time) {
  const pose = sleeping && time > cat.petUntil ? "cat_sleep" : "cat_sit";
  const frame = Math.floor(time / (pose === "cat_sleep" ? 1200 : 700)); // 잘 때는 천천히 숨쉬어요
  const { x, y } = layout.cat;
  ctx.drawImage(sprites.actor(pose, frame), x, y);
  if (time < cat.petUntil) drawIcon(ctx, "heart", x + 4, y - 2 - Math.floor((cat.petUntil - time) / 400) % 2);
  else if (pose === "cat_sleep") drawIcon(ctx, "zzz", x + 10, y + 4 - (Math.floor(time / 800) % 2));
}

// 나비: 봄·여름 낮, 비가 오지 않을 때 밭 위를 팔랑팔랑
const BUTTERFLIES = ["#fff3a0", "#f5b8c8", "#cfe8ff"];

export function drawButterflies(ctx, layout, time) {
  const t = time / 1000;
  const { farm } = layout;
  BUTTERFLIES.forEach((color, i) => {
    const x = Math.round(farm.x + 10 + (farm.w - 20) * (0.5 + 0.5 * Math.sin(t * 0.23 + i * 2.1)));
    const y = Math.round(farm.y + 6 + (farm.h - 10) * (0.5 + 0.5 * Math.sin(t * 0.37 + i * 1.3)) + Math.sin(t * 6 + i));
    const open = Math.floor(time / 140 + i) % 2 === 0;
    ctx.fillStyle = "#4a3b2a";
    ctx.fillRect(x, y, 1, 2); // 몸통
    ctx.fillStyle = color;
    if (open) {
      ctx.fillRect(x - 2, y - 1, 2, 2);
      ctx.fillRect(x + 1, y - 1, 2, 2);
    } else {
      ctx.fillRect(x - 1, y - 1, 1, 2);
      ctx.fillRect(x + 1, y - 1, 1, 2);
    }
  });
}

// 말풍선 없이 쓰는 작은 그림 기호 (하트, 음표, 별, 쿨쿨)
const ICONS = {
  heart: { color: "#f06a8a", rows: [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."] },
  note: { color: "#4a3b2a", rows: ["..XX.", "..X.X", "..X..", "XXX..", "XX..."] },
  star: { color: "#f5c832", rows: ["..X..", ".XXX.", "XXXXX", ".XXX.", ".X.X."] },
  zzz: { color: "#8a9ab8", rows: ["XXX..", ".X...", "XXX..", "...XX", "...XX"] },
};

export function drawIcon(ctx, name, x, y) {
  const { color, rows } = ICONS[name];
  ctx.fillStyle = color;
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) if (row[dx] === "X") ctx.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1);
  });
}

// 말풍선 안에 기호 하나 (사람 머리 위에 띄워요)
export function drawBubble(ctx, name, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = "#4a3b2a";
  ctx.fillRect(x, y + 1, 9, 6);
  ctx.fillRect(x + 1, y, 7, 8);
  ctx.fillRect(x + 3, y + 8, 2, 1); // 꼬리
  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(x + 1, y + 1, 7, 6);
  drawIcon(ctx, name, x + 2, y + 1);
}
