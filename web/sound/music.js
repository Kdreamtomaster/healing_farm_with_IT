// 잔잔한 배경음: 짧은 음을 천천히, 조금씩 다르게 이어 갑니다.
//
// 멜로디는 "5음계"(도 레 미 솔 라)에서만 고릅니다. 이 다섯 음은 어떤 순서로 이어도 서로 잘 어울려서,
// 무작위로 골라도 듣기 편한 노래가 돼요. 낮은 음은 4박마다 도 → 라 → 파 → 솔 로 바뀝니다.
import { playNote } from "./notes.js";

const SCALE = ["C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5"];
const BASS = ["C3", "A2", "F2", "G2"];
const BEAT = 0.8; // 한 박 길이(초)
const MOVES = [-2, -1, -1, 0, 1, 1, 2]; // 다음 음은 지금 음 근처에서 골라요 (가까운 쪽이 더 자주)
const REST = 0.3; // 이 확률로 한 박 쉬어 가요

export function createMusic(ctx, destination, random = Math.random) {
  let timer = null;
  let nextAt = 0;
  let beat = 0;
  let step = 3;

  // 0.2초마다 깨어나서, 앞으로 0.6초 안에 울릴 음을 미리 예약해 둡니다.
  // (setInterval 은 정확하지 않아서, 소리 시각은 오디오 시계로 정해요)
  function schedule() {
    while (nextAt < ctx.currentTime + 0.6) {
      if (beat % 4 === 0) {
        playNote(ctx, destination, { note: BASS[Math.floor(beat / 4) % BASS.length], at: nextAt, len: BEAT * 3.5, wave: "triangle", volume: 0.14 });
      }
      if (random() >= REST) {
        step = Math.min(SCALE.length - 1, Math.max(0, step + MOVES[Math.floor(random() * MOVES.length)]));
        playNote(ctx, destination, { note: SCALE[step], at: nextAt, len: BEAT * 1.4, wave: "triangle", volume: 0.1 });
      }
      nextAt += BEAT;
      beat += 1;
    }
  }

  return {
    start() {
      if (timer) return;
      nextAt = ctx.currentTime + 0.1;
      schedule();
      timer = setInterval(schedule, 200);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
