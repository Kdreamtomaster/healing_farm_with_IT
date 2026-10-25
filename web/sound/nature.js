// 자연의 소리: 낮에는 새소리, 여름·가을 밤에는 풀벌레, 비 오는 날에는 빗소리
// 배경음처럼 0.25초마다 깨어나 "지금 어떤 소리가 어울릴지" 보고, 아주 작게 들려줘요.
import { playNote } from "./notes.js";

// 새소리: 높은 음이 짧게 미끄러지는 "삐릿"을 두세 번
export function scheduleBird(ctx, destination, at, random = Math.random) {
  const calls = 2 + Math.floor(random() * 2);
  const notes = [["A6", "E7"], ["G6", "C7"], ["E7", "B6"]];
  for (let i = 0; i < calls; i++) {
    const [from, to] = notes[Math.floor(random() * notes.length)];
    playNote(ctx, destination, { note: from, slideTo: to, at: at + i * 0.13, len: 0.09, wave: "triangle", volume: 0.12 });
  }
}

// 풀벌레: "찌르르" — 아주 짧은 높은 음을 빠르게 서너 번
export function scheduleCricket(ctx, destination, at) {
  for (let i = 0; i < 4; i++) playNote(ctx, destination, { note: "E7", at: at + i * 0.045, len: 0.03, wave: "square", volume: 0.05 });
}

// 빗소리: 잡음(쏴아)을 부드럽게 깎아서 계속 흘려보내요. level 로 크기를 천천히 바꿔요.
export function createRain(ctx, destination) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 1000;
  const volume = ctx.createGain();
  volume.gain.value = 0;
  source.connect(soften).connect(volume).connect(destination);
  source.start();
  return {
    level(value) {
      volume.gain.setTargetAtTime(value, ctx.currentTime, 0.8); // 천천히 커지고 작아지게
    },
  };
}

// env(): { night, raining, season } 를 돌려주는 함수 (main.js 가 게임 상태를 보고 알려 줘요)
export function createNature(ctx, destination, env, random = Math.random) {
  let timer = null;
  let rain = null;
  let nextCricket = 0;

  function tick() {
    const { night, raining, season } = env();
    rain ??= createRain(ctx, destination);
    rain.level(raining ? 0.09 : 0);
    if (raining) return;
    const now = ctx.currentTime;
    if (!night && season !== "winter" && random() < 0.07) scheduleBird(ctx, destination, now + 0.05, random);
    if (night && (season === "summer" || season === "autumn") && now >= nextCricket) {
      scheduleCricket(ctx, destination, now + 0.05);
      nextCricket = now + 0.5 + random() * 0.8;
    }
  }

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, 250);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      rain?.level(0);
    },
  };
}
