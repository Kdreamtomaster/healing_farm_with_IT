// 소리 파일 없이 만든 자연의 소리, 고양이 소리, 날씨 소리가 실제로 (아주 작게) 나는지 확인해요
import { createRain, scheduleBird, scheduleCricket } from "../../web/sound/nature.js";
import { assert, test } from "./runner.js";

const RATE = 22050;
const peakOf = (buffer) => buffer.getChannelData(0).reduce((m, s) => Math.max(m, Math.abs(s)), 0);

test("새소리가 작게 난다", async () => {
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  scheduleBird(ctx, ctx.destination, 0, () => 0.5);
  const peak = peakOf(await ctx.startRendering());
  assert(peak > 0.03 && peak < 0.3, `크기 ${peak}`);
});

test("풀벌레 소리가 작게 난다", async () => {
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  scheduleCricket(ctx, ctx.destination, 0);
  const peak = peakOf(await ctx.startRendering());
  assert(peak > 0.01 && peak < 0.2, `크기 ${peak}`);
});

test("빗소리는 켜면 들리고, 처음엔 조용하다", async () => {
  const quiet = new OfflineAudioContext(1, RATE * 2, RATE);
  createRain(quiet, quiet.destination);
  assert(peakOf(await quiet.startRendering()) === 0, "켜기 전엔 조용");
  const ctx = new OfflineAudioContext(1, RATE * 4, RATE);
  createRain(ctx, ctx.destination).level(0.09);
  const peak = peakOf(await ctx.startRendering());
  assert(peak > 0.005 && peak < 0.3, `크기 ${peak}`);
});
