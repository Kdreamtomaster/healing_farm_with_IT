// 효과음 악보
// 음 이름(note), 시작 시각(at, 초), 길이(len, 초)만 바꾸면 소리가 바뀌어요. 직접 작곡해 보세요!
import { playNote } from "./notes.js";

export const EFFECTS = {
  // 씨앗 심기: 낮은 음에서 "뽁"
  plant: [
    { note: "G4", at: 0, len: 0.09 },
    { note: "C5", at: 0.08, len: 0.14 },
  ],
  // 물주기: 높은 음이 미끄러져 내려오는 물방울 소리
  water: [
    { note: "E6", at: 0, len: 0.08, slideTo: "B5" },
    { note: "C6", at: 0.09, len: 0.08, slideTo: "G5" },
    { note: "A5", at: 0.18, len: 0.1, slideTo: "E5" },
  ],
  // 드론 출발: 위잉~ 하고 떠오르는 소리
  drone: [
    { note: "C4", at: 0, len: 0.35, slideTo: "G4", volume: 0.1 },
    { note: "G4", at: 0.3, len: 0.25, slideTo: "C5", volume: 0.08 },
  ],
  // 드론이 칸에 물을 뿌릴 때: 작은 물방울 한 방울
  drip: [{ note: "A6", at: 0, len: 0.06, slideTo: "E6", volume: 0.1 }],
  // 스프링클러: 칙칙칙칙 돌아가는 소리
  sprinkler: [0, 0.09, 0.18, 0.27, 0.36, 0.45, 0.54, 0.63].map((at, i) => ({ note: i % 2 ? "E6" : "G6", at, len: 0.04, volume: 0.07 })),
  // 논 물대기: 물이 졸졸 흘러가는 소리
  flow: [
    { note: "G5", at: 0, len: 0.2, slideTo: "C5", wave: "triangle", volume: 0.2 },
    { note: "A5", at: 0.18, len: 0.2, slideTo: "D5", wave: "triangle", volume: 0.2 },
    { note: "C6", at: 0.36, len: 0.3, slideTo: "E5", wave: "triangle", volume: 0.2 },
  ],
  // 요리 완성: 보글보글 끓다가 "띵!"
  cook: [
    { note: "C5", at: 0, len: 0.06, volume: 0.1 },
    { note: "E5", at: 0.08, len: 0.06, volume: 0.1 },
    { note: "D5", at: 0.16, len: 0.06, volume: 0.1 },
    { note: "C7", at: 0.3, len: 0.35, wave: "triangle", volume: 0.25 },
  ],
  // 다 같이 먹자고 부를 때
  call: [
    { note: "G5", at: 0, len: 0.12, wave: "triangle", volume: 0.22 },
    { note: "E5", at: 0.14, len: 0.12, wave: "triangle", volume: 0.22 },
    { note: "G5", at: 0.28, len: 0.2, wave: "triangle", volume: 0.22 },
  ],
  // 다 먹고 "냠냠, 맛있다!"
  yum: [
    { note: "E5", at: 0, len: 0.1 },
    { note: "G5", at: 0.1, len: 0.1 },
    { note: "E6", at: 0.2, len: 0.12 },
    { note: "C6", at: 0.34, len: 0.3, wave: "triangle", volume: 0.24 },
  ],
  // 수확: 도-미-솔-도 올라가는 소리
  harvest: [
    { note: "C5", at: 0, len: 0.08 },
    { note: "E5", at: 0.08, len: 0.08 },
    { note: "G5", at: 0.16, len: 0.08 },
    { note: "C6", at: 0.24, len: 0.28 },
  ],
  // 저장: 딩-동
  save: [
    { note: "G5", at: 0, len: 0.14, wave: "triangle", volume: 0.25 },
    { note: "C6", at: 0.13, len: 0.35, wave: "triangle", volume: 0.25 },
  ],
  // 돌아왔을 때 인사
  welcome: [
    { note: "C5", at: 0, len: 0.14, wave: "triangle", volume: 0.22 },
    { note: "E5", at: 0.15, len: 0.14, wave: "triangle", volume: 0.22 },
    { note: "G5", at: 0.3, len: 0.14, wave: "triangle", volume: 0.22 },
    { note: "A5", at: 0.45, len: 0.14, wave: "triangle", volume: 0.22 },
    { note: "G5", at: 0.6, len: 0.14, wave: "triangle", volume: 0.22 },
    { note: "C6", at: 0.75, len: 0.6, wave: "triangle", volume: 0.22 },
  ],
};

export function scheduleEffect(ctx, destination, name, startAt = ctx.currentTime) {
  for (const n of EFFECTS[name]) playNote(ctx, destination, { ...n, at: startAt + n.at });
}
