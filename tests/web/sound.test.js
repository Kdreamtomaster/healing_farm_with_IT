// web/sound/ 테스트: 스피커 없이도, 소리를 파일처럼 미리 만들어(OfflineAudioContext) 확인합니다.
import { EFFECTS, scheduleEffect } from "../../web/sound/effects.js";
import { createMusic } from "../../web/sound/music.js";
import { noteToFreq } from "../../web/sound/notes.js";
import { assert, assertNear, test } from "./runner.js";

const RATE = 22050;

function loudness(buffer) {
  const samples = buffer.getChannelData(0);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}

test("음 이름을 진동수로 바꾼다", () => {
  assertNear(noteToFreq("A4"), 440, "라", 1e-9);
  assertNear(noteToFreq("A5"), 880, "한 옥타브 위는 두 배", 1e-9);
  assertNear(noteToFreq("C4"), 261.6256, "가운데 도", 1e-3);
});

test("효과음 악보의 음 이름이 모두 올바르다", () => {
  for (const [name, notes] of Object.entries(EFFECTS)) {
    for (const n of notes) {
      noteToFreq(n.note);
      if (n.slideTo) noteToFreq(n.slideTo);
      assert(n.at >= 0, `${name} 시작 시각`);
    }
  }
});

for (const name of Object.keys(EFFECTS)) {
  test(`효과음 "${name}" 이 실제로 소리를 낸다`, async () => {
    const ctx = new OfflineAudioContext(1, RATE * 2, RATE);
    scheduleEffect(ctx, ctx.destination, name, 0);
    const peak = loudness(await ctx.startRendering());
    assert(peak > 0.05, `너무 작아요: ${peak}`);
    assert(peak <= 1, `너무 커서 소리가 깨져요: ${peak}`);
  });
}

test("배경음이 잔잔하게(작은 소리로) 이어진다", async () => {
  const ctx = new OfflineAudioContext(1, RATE * 6, RATE);
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // 늘 같은 결과가 나오는 난수
  const music = createMusic(ctx, ctx.destination, random);
  music.start(); // 오프라인에서는 시계가 0 이라, 처음 0.7초 분량만 예약돼요
  music.stop();
  const peak = loudness(await ctx.startRendering());
  assert(peak > 0.01, `소리가 안 나요: ${peak}`);
  assert(peak < 0.5, `배경음이 너무 커요: ${peak}`);
});
