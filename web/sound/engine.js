// 소리 전체를 관리합니다: 켜고 끄기, 음량, 효과음, 배경음
//
//   효과음 ─┐
//           ├─ 전체 음량 ─ 부드럽게(고음 깎기) ─ 스피커
//   배경음 ─┘
import { scheduleEffect } from "./effects.js";
import { createMusic } from "./music.js";

const STORAGE_KEY = "healing-farm-sound";
const DEFAULTS = { sfx: true, music: false, volume: 0.6 }; // 처음에는 효과음만 켜 둬요

let settings = loadSettings();
let ctx = null;
let master = null;
let sfxBus = null;
let music = null;

// 소리 설정은 게임 진행이 아니라 "이 컴퓨터에서의 취향"이라 세이브 대신 브라우저에 보관합니다.
function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function storeSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 저장이 막힌 브라우저에서도 소리는 그대로 나요
  }
}

export function getSoundSettings() {
  return { ...settings };
}

// 브라우저는 사용자가 화면을 한 번 누르기 전에는 소리를 내지 못하게 막아 둡니다.
// 그래서 첫 클릭 때 소리 장치를 준비해요.
export function unlockAudio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass"; // 네모파의 날카로운 고음을 깎아 귀가 편하게
    soften.frequency.value = 2400;
    master.connect(soften).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    const musicBus = ctx.createGain();
    musicBus.gain.value = 0.7;
    musicBus.connect(master);
    music = createMusic(ctx, musicBus);
    applyVolume();
  }
  if (ctx.state === "suspended") ctx.resume();
  if (settings.music && !document.hidden) music.start();
}

export function isAudioReady() {
  return ctx?.state === "running";
}

function applyVolume() {
  // 사람 귀는 작은 소리 변화에 더 민감해서, 제곱해 주면 슬라이더가 자연스럽게 느껴져요
  if (master) master.gain.value = settings.volume ** 2;
}

// 효과음을 냈으면 true. 소리가 꺼져 있거나 아직 준비 전이면 false
export function playSound(name) {
  if (!settings.sfx || !isAudioReady()) return false;
  scheduleEffect(ctx, sfxBus, name);
  return true;
}

export function setSound(change) {
  settings = { ...settings, ...change };
  storeSettings();
  applyVolume();
  if (music) {
    if (settings.music && !document.hidden) music.start();
    else music.stop();
  }
}

// 탭을 숨기면 배경음도 쉬어요
document.addEventListener("visibilitychange", () => {
  if (!music) return;
  if (document.hidden) music.stop();
  else if (settings.music) music.start();
});
