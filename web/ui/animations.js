// 농사 연출: 농부가 걸어가서 심고·물주고·수확하고(바쁘면 친구들이 도우러 와요),
// 일괄 물주기는 드론이 날아다니며, 스프링클러가 돌며, 논에 물이 흘러들며.
//
// 연출은 "보여 주기"만 맡고, 실제 물주기는 규칙 함수(farm/care.js)를 apply(plot) 로 넘겨받아
// 연출이 그 칸에 닿는 순간에 실행합니다. 그래서 흙이 젖는 순간과 그림이 딱 맞아요.
//
// 시간은 모두 now(ms)로 받습니다. 화면에서는 requestAnimationFrame 의 시각을, 테스트에서는 아무 숫자나 넣어요.
import { TILE } from "./layout.js";

const FARMER_SPEED = 6 * TILE; // 1초에 6칸 (px/s)
const MAX_WALK_MS = 1000; // 아무리 멀어도 1초 안에 도착 — 기다리게 하지 않아요
const POUR_MS = 600; // 물뿌리개를 기울이는 시간
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

// 사람이 하는 일: 걸어가서 → 일하고(이때 hit 시각에 규칙이 실행돼요) → 끝
const JOBS = {
  water: { ms: 600, hitMs: 200, pose: "farmer_pour" },
  flood: { ms: 600, hitMs: 200, pose: "farmer_pour" },
  plant: { ms: 450, hitMs: 200, pose: "farmer_work" },
  harvest: { ms: 450, hitMs: 150, pose: "farmer_work" },
};
const MAX_WORKERS = 4; // 농부 + 도와주러 오는 친구 최대 3명
const EXIT_X = -28; // 친구들은 화면 왼쪽 밖에서 들어오고 나가요 (밭 왼쪽 풀밭 1칸 너머)

// helpers: 바쁠 때 도와주러 오는 친구들 [{ id, name, shirt }] (data/friends.json)
export function createAnimator(helpers = []) {
  const farmer = { id: "farmer", name: null, shirt: null, x: 6, y: 14, facing: 1, queue: [], job: null, walk: null };
  const workers = [farmer];
  const effects = [];
  const isIdle = (w) => !w.job && !w.queue.length;

  function walkTo(worker, to, now) {
    worker.walk = { from: { x: worker.x, y: worker.y }, to, start: now, ms: Math.min(MAX_WALK_MS, travelMs(worker, to, FARMER_SPEED)) };
    worker.facing = to.x >= worker.x ? 1 : -1;
  }

  // 걸음을 한 번 옮기고, 도착했으면 true
  function step(worker, now) {
    const walk = worker.walk;
    const k = walk.ms ? clamp01((now - walk.start) / walk.ms) : 1;
    worker.x = lerp(walk.from.x, walk.to.x, k);
    worker.y = lerp(walk.from.y, walk.to.y, k);
    return k >= 1;
  }

  function updateWorker(worker, now) {
    if (!worker.job && worker.queue.length) {
      const job = worker.queue.shift();
      worker.job = { ...job, arrived: null, hit: false };
      worker.leaving = false;
      walkTo(worker, { x: job.plot.x * TILE + 3, y: job.plot.y * TILE + 14 }, now); // 칸의 왼쪽에 서서 일해요
    }
    const job = worker.job;
    if (job) {
      if (job.arrived === null) {
        if (!step(worker, now)) return;
        job.arrived = now;
        worker.facing = 1;
      }
      const t = now - job.arrived;
      const { ms, hitMs } = JOBS[job.kind];
      if (!job.hit && t >= hitMs) {
        job.hit = true;
        job.apply(job.plot, worker);
      }
      if (t >= ms) worker.job = null;
      return;
    }
    // 일을 다 마친 친구는 왔던 쪽으로 돌아가요
    if (worker !== farmer) {
      if (!worker.leaving) {
        worker.leaving = true;
        walkTo(worker, { x: EXIT_X, y: worker.y }, now);
      }
      if (step(worker, now)) workers.splice(workers.indexOf(worker), 1);
    }
  }

  return {
    workers,

    // 일 맡기기: 쉬는 사람 → 새 친구 부르기 → 그래도 없으면 할 일이 가장 적은 사람 순서로
    //   kind: "water" | "flood" | "plant" | "harvest"
    //   apply(plot, worker): 그 칸에서 실제로 일을 하는 함수 (worker.name 이 있으면 친구가 한 일)
    work(plot, kind, apply, now) {
      const job = { plot, kind, apply };
      const target = { x: plot.x * TILE + 3, y: plot.y * TILE + 14 };
      const idle = workers.filter(isIdle).sort((a, b) => distance(a, target) - distance(b, target))[0];
      if (idle) {
        idle.queue.push(job);
        return idle;
      }
      const friend = helpers.find((h) => !workers.some((w) => w.id === h.id));
      if (friend && workers.length < MAX_WORKERS) {
        const helper = { ...friend, x: EXIT_X, y: target.y, facing: 1, queue: [job], job: null, walk: null, leaving: false };
        workers.push(helper);
        return helper;
      }
      const load = (w) => w.queue.length + (w.job ? 1 : 0);
      const least = [...workers].sort((a, b) => load(a) - load(b))[0];
      least.queue.push(job);
      return least;
    },

    // 맡겨 둔 일이 모두 몇 개인지 (하는 중 + 기다리는 중)
    pendingCount() {
      return workers.reduce((n, w) => n + w.queue.length + (w.job ? 1 : 0), 0);
    },

    // 이 칸에 누가 일하러 가는 중인지 (같은 일을 두 번 맡기지 않도록)
    isPending(plotId) {
      return workers.some((w) => w.job?.plot.id === plotId || w.queue.some((j) => j.plot.id === plotId));
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
      for (const worker of [...workers]) updateWorker(worker, now);
      for (let i = effects.length - 1; i >= 0; i--) {
        if (!effects[i].update(now)) effects.splice(i, 1);
      }
    },

    isBusy() {
      return workers.length > 1 || !isIdle(farmer) || effects.length > 0;
    },

    draw(ctx, sprites, now) {
      for (const effect of effects) DRAW[effect.kind](ctx, sprites, effect, now);
      // 아래쪽(화면 앞)에 있는 사람을 나중에 그려야 겹칠 때 자연스러워요
      for (const worker of [...workers].sort((a, b) => a.y - b.y)) drawWorker(ctx, sprites, worker, now);
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

function drawWorker(ctx, sprites, worker, now) {
  const job = worker.job;
  const working = job && job.arrived !== null;
  const walking = (job && !working) || worker.leaving;
  let pose = "farmer_walk";
  let frame = walking ? Math.floor(now / 160) : 0;
  if (working) {
    const t = now - job.arrived;
    pose = JOBS[job.kind].pose;
    frame = Math.floor(t / 150);
    drawJobEffect(ctx, worker, job.kind, t);
  }
  const bob = !job && !worker.leaving && Math.floor(now / 600) % 2 ? 1 : 0; // 가만히 있을 때 숨쉬듯 들썩
  drawFacing(ctx, sprites.actor(pose, frame, worker.shirt), worker.x - 8, worker.y - 15 + bob, worker.facing);
}

function drawJobEffect(ctx, worker, kind, t) {
  const sx = worker.x + 9;
  const sy = worker.y - 6;
  if (kind === "water" || kind === "flood") {
    // 물뿌리개 끝에서 작물 쪽으로 떨어지는 물방울
    for (let i = 0; i < 4; i++) {
      const k = ((t / POUR_MS) * 3 + i / 4) % 1;
      dot(ctx, worker.x + 9 + k * 6, worker.y - 4 + k * k * 8, i % 2 ? WATER : WATER_DARK);
    }
  } else if (kind === "plant" && t >= JOBS.plant.hitMs) {
    // 흙이 톡톡 튀어요
    const k = (t - JOBS.plant.hitMs) / 250;
    if (k < 1) for (const dx of [-2, 0, 2]) dot(ctx, sx + 1 + dx * (1 + k), sy + 6 - Math.sin(k * Math.PI) * 3, "#6b4a2b");
  } else if (kind === "harvest" && t >= JOBS.harvest.hitMs) {
    // 반짝반짝
    const k = (t - JOBS.harvest.hitMs) / 300;
    if (k < 1) for (const [dx, dy] of [[0, -4], [4, 0], [-3, 2], [3, -6]]) dot(ctx, sx + 2 + dx * (1 + k), sy + dy - k * 3, "#fff3a0");
  }
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
