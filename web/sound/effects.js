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
