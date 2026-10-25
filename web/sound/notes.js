// 음 하나를 내는 가장 작은 부품입니다.
// 소리 파일 없이, 브라우저에 들어 있는 Web Audio API 로 직접 소리를 만들어요.

const STEPS = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };

// "A4" → 440Hz. 한 옥타브(도→도) 올라가면 진동수가 두 배가 되고, 그 사이를 12칸으로 똑같이 나눠요.
export function noteToFreq(note) {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) throw new Error(`음 이름이 올바르지 않아요: ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + STEPS[match[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

// 음 하나 내기
//   wave: "square"(네모파, 옛 게임기 소리) / "triangle"(세모파, 부드러운 소리)
//   소리 크기는 "톡" 하고 커졌다가 길이(len)만큼에 걸쳐 부드럽게 사라져요.
export function playNote(ctx, destination, { note, at, len = 0.1, wave = "square", volume = 0.18, slideTo }) {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.setValueAtTime(noteToFreq(note), at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(noteToFreq(slideTo), at + len);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + len);
  osc.connect(envelope).connect(destination);
  osc.start(at);
  osc.stop(at + len + 0.02);
}
