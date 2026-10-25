// 연구소 탭의 동작: 서버의 연구소(/api/lab/...)와 이야기하고, 지문 실험대 계산을 맡아요.
// 화면 그리기는 web/ui/lab-panel.js, 해시 계산 규칙은 bench.js 에 있어요.
//
// 농장 → 연구소, 연구소 → 농장 옮기기는 서버가 송장 번호를 붙여 두 세이브에 나눠 적어요 (server/lab/transfer.py).
// 서버가 농장 세이브의 창고를 바꾼 만큼, 브라우저도 들고 있는 창고를 똑같이 바꿔요.
// 그러면 다음 저장 때 브라우저가 보내는 창고와 서버 세이브가 어긋나지 않아요.
import { labClear, labExperiment, labFuel, labImport, loadLab } from "../api.js";
import { addItem, takeItem } from "../state.js";
import { josa } from "../text.js";
import { canonicalJson, hmacHex, sha256Hex, whatIf } from "./bench.js";

// ctx: { game, speciesById, save, draw, showToast, playSound, record }
export function createLab(ctx) {
  const { game, speciesById } = ctx;
  const nameOf = (id) => speciesById.get(id)?.name.ko ?? id;

  async function refresh(lab) {
    try {
      game.lab = lab ?? (await loadLab());
    } catch {
      game.lab = { error: "연구소를 열 수 없어요. 서버가 켜져 있는지 확인해 주세요." };
    }
    await bench();
    ctx.draw();
  }

  // 지문 실험대: "만약 개수를 바꾸면?" 의 지문을 계산 (저장하지 않아요)
  async function bench() {
    const lab = game.lab;
    const ask = game.ui.whatIf;
    const sample = lab?.samples?.find((s) => s.id === ask?.sampleId);
    if (!sample || ask.count === sample.count) {
      game.labBench = null;
      return;
    }
    const text = canonicalJson(whatIf(lab, { sampleId: sample.id, field: "count", value: ask.count }));
    game.labBench = { text, sha256: await sha256Hex(text), hmac: await hmacHex(text, lab.key) };
  }

  const failed = (result) => {
    ctx.showToast(result.error ?? `연구소 요청이 실패했어요 (${result.status})`);
    return false;
  };

  return {
    refresh,

    async whatIf(sampleId, count) {
      game.ui.whatIf = { sampleId, count };
      await bench();
      ctx.draw();
    },

    // 농장 작물 → 연구소 (한 방향). 먼저 저장해서 서버 세이브의 창고를 지금과 맞춰 둬요.
    async send(speciesId, count) {
      if (!(await ctx.save({ silent: true }))) return failed({ error: "먼저 저장하지 못해서 보내지 않았어요" });
      const result = await labImport(speciesId, count);
      if (!result.ok) return failed(result);
      takeItem(game.state, speciesId, count);
      ctx.record("lab_send", { species: speciesId, count, transfer: result.transfer.id });
      ctx.showToast(`${nameOf(speciesId)} ${count}개를 연구소로 보냈어요 🧪`);
      ctx.playSound("craft");
      await refresh(result.lab);
      return true;
    },

    // 실험 작물 → 바이오 연료 → 농장 창고
    async fuel(sampleId) {
      const sample = game.lab.samples.find((s) => s.id === sampleId);
      const result = await labFuel(sampleId, sample.count);
      if (!result.ok) return failed(result);
      addItem(game.state, "biofuel", result.transfer.amount);
      ctx.record("lab_fuel", { count: result.transfer.amount, transfer: result.transfer.id });
      ctx.showToast(`바이오 연료 ${result.transfer.amount}개가 농장 창고에 도착했어요 ⛽`);
      ctx.playSound("fuel");
      await refresh(result.lab);
      return true;
    },

    async experiment(sampleId, color, size) {
      const result = await labExperiment(sampleId, color, size);
      if (!result.ok) return failed(result);
      const sample = result.lab.samples.find((s) => s.id === sampleId);
      ctx.showToast(`${josa(nameOf(sample.species), "이", "가")} ${size === "big" ? "커졌어요" : size === "small" ? "작아졌어요" : "보통 크기예요"}. 지문도 바뀌었어요`);
      await refresh(result.lab);
      return true;
    },

    async clear() {
      const result = await labClear();
      if (!result.ok) return failed(result);
      game.ui.whatIf = null;
      ctx.showToast("연구소를 비웠어요. 지문이 다시 맞아요");
      await refresh(result.lab);
      return true;
    },
  };
}
