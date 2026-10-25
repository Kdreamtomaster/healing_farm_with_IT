// 물주기 연출: 농부가 걸어가서 물뿌리개로, 드론이 날아다니며, 스프링클러가 돌며, 논에 물이 흘러들며.
//
// 연출은 "보여 주기"만 맡고, 실제 물주기는 규칙 함수(farm/care.js)를 apply(plot) 로 넘겨받아
// 연출이 그 칸에 닿는 순간에 실행합니다. 그래서 흙이 젖는 순간과 그림이 딱 맞아요.
//
// 시간은 모두 now(ms)로 받습니다. 화면에서는 requestAnimationFrame 의 시각을, 테스트에서는 아무 숫자나 넣어요.
import { TILE } from "./renderer.js";

const FARMER_SPEED = 6 * TILE; // 1초에 6칸 (px/s)
const MAX_WALK_MS = 1000; // 아무리 멀어도 1초 안에 도착 — 기다리게 하지 않아요
const POUR_MS = 600; // 물뿌리개를 기울이는 시간
const POUR_HIT_MS = 200; // 기울이기 시작하고 이만큼 뒤에 흙이 젖어요
const DRONE_SPEED = 8 * TILE;
const DRONE_HOVER_MS = 250; // 칸 위에 머물며 물을 뿌리는 시간
const SPRINKLER_MS = 1400;
const FLOW_SPEED = 10 * TILE;
const WATER = "#7cc4f0";
const WATER_DARK = "#4a9ad0";

const center = (plot) => ({ x: plot.x * TILE + TILE / 2, y: plot.y * TILE + TILE / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const travelMs = (from, to, speed) => (distance(from, to) / speed) * 1000;

// 지금 위치에서 가장 가까운 칸부터 차례로 들르는 순서 (드론이 갈팡질팡하지 않게)
export function visitOrder(start, plots) {
  const left = [...plots];
  const order = [];
  let here = start;
  while (left.length) {
    left.sort((a, b) => distance(here, center(a)) - distance(here, center(b)));
    const next = left.shift();
    order.push(next);
    here = center(next);
  }
  return order;
}

export function createAnimator() {
  // 농부는 물주기 부탁을 줄 세워 하나씩 처리해요. (x, y 는 발 위치)
  const farmer = { x: 6, y: 14, facing: 1, queue: [], job: null };
  const effects = [];

  function updateFarmer(now) {
    if (!farmer.job && farmer.queue.length) {
      const { plot, apply } = farmer.queue.shift();
      const to = { x: plot.x * TILE + 3, y: plot.y * TILE + 14 }; // 칸의 왼쪽에 서서 오른쪽을 보고 물을 줘요
      const walkMs = Math.min(MAX_WALK_MS, travelMs(farmer, to, FARMER_SPEED));
      farmer.facing = to.x >= farmer.x ? 1 : -1;
      farmer.job = { plot, apply, from: { x: farmer.x, y: farmer.y }, to, start: now, walkMs, poured: false };
    }
    const job = farmer.job;
    if (!job) return;
    const t = now - job.start;
    const walk = job.walkMs ? clamp01(t / job.walkMs) : 1;
    farmer.x = lerp(job.from.x, job.to.x, walk);
    farmer.y = lerp(job.from.y, job.to.y, walk);
    if (walk >= 1) farmer.facing = 1;
    if (!job.poured && t >= job.walkMs + POUR_HIT_MS) {
      job.poured = true;
      job.apply(job.plot);
    }
    if (t >= job.walkMs + POUR_MS) farmer.job = null;
  }

  return {
    farmer,

    // 농부에게 물주기 부탁 (apply: 실제로 물을 주는 함수)
    farmerWater(plot, apply) {
      farmer.queue.push({ plot, apply });
    },

    // 드론: 가까운 칸부터 들러 물을 뿌리고 날아가요. 다 끝나면 done()
    drone(plots, apply, done, now) {
      const start = { x: -TILE, y: -TILE };
      let here = start;
      let at = now;
      const legs = visitOrder(start, plots).map((plot) => {
        const to = center(plot);
        const arrive = at + travelMs(here, to, DRONE_SPEED);
        const leg = { plot, from: here, to, start: at, arrive, leave: arrive + DRONE_HOVER_MS, applied: false };
        here = to;
        at = leg.leave;
        return leg;
      });
      const exit = { from: here, to: { x: here.x + 6 * TILE, y: -2 * TILE }, start: at };
      exit.end = at + travelMs(exit.from, exit.to, DRONE_SPEED);
      effects.push({
        kind: "drone",
        update(t) {
          for (const leg of legs) {
            if (!leg.applied && t >= leg.arrive) {
              leg.applied = true;
              apply(leg.plot);
            }
          }
          if (t < exit.end) return true;
          done();
          return false;
        },
        position(t) {
          for (const leg of legs) {
            if (t < leg.arrive) {
              const k = clamp01((t - leg.start) / (leg.arrive - leg.start || 1));
              return { x: lerp(leg.from.x, leg.to.x, k), y: lerp(leg.from.y, leg.to.y, k), spraying: false };
            }
            if (t < leg.leave) return { ...leg.to, spraying: true };
          }
          const k = clamp01((t - exit.start) / (exit.end - exit.start || 1));
          return { x: lerp(exit.from.x, exit.to.x, k), y: lerp(exit.from.y, exit.to.y, k), spraying: false };
        },
      });
    },

    // 스프링클러: 칸마다 솟아올라 빙글빙글 물을 뿌리고 들어가요. 절반쯤 돌았을 때 흙이 젖어요.
    sprinklers(plots, apply, done, now) {
      let applied = false;
      effects.push({
        kind: "sprinkler",
        plots,
        start: now,
        update(t) {
          if (!applied && t >= now + SPRINKLER_MS / 2) {
            applied = true;
            plots.forEach((plot) => apply(plot));
          }
          if (t < now + SPRINKLER_MS) return true;
          done();
          return false;
        },
      });
    },

    // 논 물대기: 왼쪽 수로에서 물이 흘러 들어와, 물결이 지나가는 칸부터 차례로 채워져요.
    flow(plots, apply, done, now) {
      const startX = Math.min(...plots.map((p) => p.x)) * TILE;
      const endX = (Math.max(...plots.map((p) => p.x)) + 1) * TILE;
      const filled = new Set();
      const front = (t) => startX + ((t - now) / 1000) * FLOW_SPEED;
      effects.push({
        kind: "flow",
        plots,
        front,
        update(t) {
          for (const plot of plots) {
            if (!filled.has(plot) && front(t) >= center(plot).x) {
              filled.add(plot);
              apply(plot);
            }
          }
          if (front(t) < endX) return true;
          done();
          return false;
        },
      });
    },

    update(now) {
      updateFarmer(now);
      for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(now)) effects.splice(i, 1);
      }
    },

    isBusy() {
      return Boolean(farmer.job || farmer.queue.length || effects.length);
    },

    draw(ctx, sprites, now) {
      for (const effect of effects) DRAW[effect.kind](ctx, sprites, effect, now);
      drawFarmer(ctx, sprites, farmer, now);
    },
  };
}

function dot(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// 그림을 좌우로 뒤집어 그리기 (왼쪽을 볼 때)
function drawFacing(ctx, image, x, y, facing) {
  if (facing >= 0) {
    ctx.drawImage(image, Math.round(x), Math.round(y));
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x) + image.width, Math.round(y));
  ctx.scale(-1, 1);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function drawFarmer(ctx, sprites, farmer, now) {
  const job = farmer.job;
  const pouring = job && now - job.start >= job.walkMs;
  let image;
  if (pouring) {
    const t = now - job.start - job.walkMs;
    image = sprites.actor("farmer_pour", Math.floor(t / 150));
    // 물뿌리개 끝에서 작물 쪽으로 떨어지는 물방울
    for (let i = 0; i < 4; i++) {
      const k = ((t / POUR_MS) * 3 + i / 4) % 1;
      dot(ctx, farmer.x + 9 + k * 6, farmer.y - 4 + k * k * 8, i % 2 ? WATER : WATER_DARK);
    }
  } else {
    image = sprites.actor("farmer_walk", job ? Math.floor(now / 160) : 0);
  }
  const bob = !job && Math.floor(now / 600) % 2 ? 1 : 0; // 가만히 있을 때 숨쉬듯 들썩
  drawFacing(ctx, image, farmer.x - 8, farmer.y - 15 + bob, farmer.facing);
}

const DRAW = {
  drone(ctx, sprites, effect, now) {
    const pos = effect.position(now);
    if (pos.spraying) {
      for (let i = 0; i < 6; i++) {
        const k = (now / 300 + i / 6) % 1;
        dot(ctx, pos.x - 3 + ((i * 5) % 7), pos.y - 2 + k * 8, i % 2 ? WATER : WATER_DARK);
      }
    }
    const hover = Math.round(Math.sin(now / 120)); // 떠 있는 느낌으로 위아래 살짝
    ctx.drawImage(sprites.actor("drone", Math.floor(now / 60)), Math.round(pos.x - 8), Math.round(pos.y - 14 + hover));
  },

  sprinkler(ctx, sprites, effect, now) {
    const t = (now - effect.start) / SPRINKLER_MS;
    const rise = clamp01(Math.min(t * 6, (1 - t) * 6)); // 솟았다가 들어가요
    for (const plot of effect.plots) {
      const c = center(plot);
      const height = Math.ceil(rise * 3);
      ctx.fillStyle = "#6f8088";
      ctx.fillRect(c.x - 1, c.y + 4 - height, 3, height);
      if (rise < 1) continue;
      for (let i = 0; i < 8; i++) {
        const angle = now / 180 + (i * Math.PI) / 4;
        const r = 2 + ((now / 40 + i * 3) % 6);
        dot(ctx, c.x + Math.cos(angle) * r, c.y + 1 + Math.sin(angle) * r * 0.6, i % 2 ? WATER : WATER_DARK);
      }
    }
  },

  flow(ctx, sprites, effect, now) {
    const front = effect.front(now);
    for (const plot of effect.plots) {
      const ox = plot.x * TILE;
      const width = Math.min(TILE - 2, front - ox - 1);
      if (width <= 0) continue;
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = WATER;
      ctx.fillRect(ox + 1, plot.y * TILE + 1, width, TILE - 2);
      ctx.globalAlpha = 1;
    }
    // 물결 앞머리 (논 줄마다)
    for (const row of new Set(effect.plots.map((p) => p.y))) {
      for (let i = 0; i < 6; i++) dot(ctx, front + Math.sin(now / 80 + i), row * TILE + 2 + i * 2, "#e8f6ff");
    }
  },
};
