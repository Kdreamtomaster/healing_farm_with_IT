// 6단계 테스트: 돌연변이(web/farm/codex.js)와 해금(web/farm/unlocks.js)
import { configureMutations, discover, labelAccuracy, labelEntry, mutantId, rollMutation } from "../../web/farm/codex.js";
import { harvest } from "../../web/farm/harvest.js";
import { applyUnlock, checkUnlocks, isMet, progress } from "../../web/farm/unlocks.js";
import { addStat } from "../../web/state.js";
import { assert, test } from "./runner.js";

const MUTATIONS = { chance: 0.03, secondTraitChance: 0.4, traits: { color: { rainbow: "무지개", sparkle: "반짝", pastel: "파스텔" }, shape: { heart: "하트", star: "별" }, size: { big: "큰", small: "작은" } }, categories: { color: "색", shape: "모양", size: "크기" } };
const TULIP = { id: "tulip", name: { ko: "튤립" }, yield: 1, seeds: 2, colors: [{ id: "pink", hex: "#e86f9a" }] };
const farm = (createdAt = 1) => ({ meta: { createdAt, gameMinutes: 0 }, inventory: {}, plots: [] });
const crop = (plantedAt) => ({ id: 3, kind: "flowerbed", crop: { species: "tulip", plantedAt, progress: 1, moisture: 50, color: "pink" } });

test("돌연변이: 늘 같은 무작위 — 같은 농장·칸·심은 시각이면 몇 번을 계산해도 같아요", () => {
  configureMutations(MUTATIONS);
  const state = farm(12345);
  const results = Array.from({ length: 2000 }, (_, i) => rollMutation(state, crop(i)));
  const found = results.filter(Boolean);
  assert(found.length > 20 && found.length < 120, `2000번 중 ${found.length}번 (약 3%)`);
  const again = Array.from({ length: 2000 }, (_, i) => rollMutation(state, crop(i)));
  assert(JSON.stringify(results) === JSON.stringify(again));
  assert(found.every((t) => Object.entries(t).every(([k, v]) => MUTATIONS.traits[k][v])), "정해진 특징만");
  assert(found.some((t) => Object.keys(t).length === 2), "가끔은 특징이 두 가지");
});

test("수확하다 돌연변이가 나오면 창고와 도감에 들어가고, 처음 본 것만 '새로' 표시", () => {
  configureMutations({ ...MUTATIONS, chance: 1 }); // 늘 돌연변이
  const state = farm(7);
  const result = harvest(state, crop(5), TULIP);
  assert(result.ok && result.mutant && result.mutant.isNew && result.message.includes("✨"), result.message);
  assert(state.inventory[mutantId("tulip", result.mutant.traits)] === 1);
  assert(state.meta.codex.length === 1 && state.meta.codex[0].label === null);
  assert(state.meta.stats.harvests.tulip === 1 && state.meta.stats.mutants === 1);
  assert(!harvest(state, crop(5), TULIP).mutant.isNew, "같은 돌연변이는 두 번째부터는 새것이 아니에요");
  configureMutations(null);
  assert(!harvest(state, crop(5), TULIP).mutant, "설정이 없으면 돌연변이 없음");
});

test("라벨 달기: 정답과 비교해 알려 주고, 틀려도 등록돼요. 정확도도 계산", () => {
  configureMutations(MUTATIONS);
  const state = farm();
  const { entry } = discover(state, "tulip", { color: "rainbow", shape: "heart" }, 0);
  const wrong = labelEntry(entry, { color: "rainbow", shape: "star", size: "none" }, "무지개 별", 10);
  assert(wrong.score === 2 && wrong.message.includes("모양"), wrong.message);
  assert(entry.name === "무지개 별" && entry.labeledAt === 10);
  assert(labelAccuracy(state.meta.codex).right === 2 && labelAccuracy(state.meta.codex).total === 3);
  assert(labelEntry(entry, { color: "rainbow", shape: "heart", size: "none" }, "", 11).score === 3, "다시 고칠 수 있어요");
  assert(entry.name === "무지개 별", "이름을 비우면 전 이름 그대로");
  configureMutations(null); // 다른 테스트에 돌연변이가 섞이지 않게
});

test("해금: 서명된 숫자로 진행을 보고, 조건을 채우면 한 번만 열리고 색·레시피가 더해져요", () => {
  const unlocks = [
    { id: "blue_tulip", needs: { harvests: 3 }, gives: { color: { species: "tulip", id: "blue", name: "파랑", hex: "#5a7ee0" } } },
    { id: "tart", needs: { cooked: 1, playMinutes: 2 }, gives: { recipe: { id: "tart", name: { ko: "타르트" }, ingredients: { tulip: 1 } } } },
  ];
  const state = farm();
  state.meta.playSeconds = 30;
  assert(checkUnlocks(state, unlocks).length === 0);
  addStat(state, "harvests", "tulip", 3);
  assert(progress(state, unlocks[1]).find((p) => p.key === "playMinutes").have === 0);
  const fresh = checkUnlocks(state, unlocks);
  assert(fresh.length === 1 && fresh[0].id === "blue_tulip" && state.meta.unlocked.join() === "blue_tulip");
  assert(checkUnlocks(state, unlocks).length === 0, "한 번만");
  addStat(state, "cooked");
  state.meta.playSeconds = 150;
  assert(isMet(state, unlocks[1]) && checkUnlocks(state, unlocks)[0].id === "tart");
  const species = { ...TULIP, colors: [...TULIP.colors] };
  const recipes = [];
  for (const u of unlocks) applyUnlock(u, new Map([["tulip", species]]), recipes);
  applyUnlock(unlocks[0], new Map([["tulip", species]]), recipes);
  assert(species.colors.map((c) => c.id).join() === "pink,blue" && recipes.length === 1, "두 번 더해도 한 번만");
});
