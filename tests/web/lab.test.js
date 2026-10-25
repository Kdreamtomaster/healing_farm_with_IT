// web/lab/bench.js 테스트: 지문 실험대가 서버와 똑같은 지문을 만드는지
import { canonicalJson, changedPositions, hmacHex, sha256Hex, signedPart, whatIf } from "../../web/lab/bench.js";
import { assert, test } from "./runner.js";

const LAB = {
  samples: [{ id: 1, species: "tomato", color: "#d9483b", size: "normal", count: 4 }],
  transfers: [{ id: "1-ab", kind: "from_farm", item: "tomato", amount: 4, status: "done", at: 1 }],
};

test("정렬된 JSON: 열쇠 순서와 빈칸이 서버(Python)와 같다", () => {
  assert(canonicalJson({ b: 1, a: [true, null, "토마토"] }) === '{"a":[true,null,"토마토"],"b":1}', canonicalJson({ b: 1, a: [true, null, "토마토"] }));
});

test("HMAC-SHA256: 알려진 정답(RFC 4231)과 같다", async () => {
  const keyHex = [..."Jefe"].map((c) => c.charCodeAt(0).toString(16)).join("");
  assert((await hmacHex("what do ya want for nothing?", keyHex)) === "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  assert((await sha256Hex("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("만약에 계산: 저장하지 않고 바꾼 모양만 만들고, 지문은 거의 모든 글자가 달라진다", async () => {
  const changed = whatIf(LAB, { sampleId: 1, field: "count", value: 5 });
  assert(LAB.samples[0].count === 4, "원래 값은 그대로");
  const key = "00".repeat(32);
  const a = await hmacHex(canonicalJson(signedPart(LAB)), key);
  const b = await hmacHex(canonicalJson(changed), key);
  const differ = changedPositions(a, b).filter(Boolean).length;
  assert(differ > 40, `64글자 중 ${differ}글자만 달라졌어요`);
});

test("서버가 보낸 연구소 지문을 브라우저도 똑같이 계산한다", async () => {
  const lab = await fetch("/api/lab/state").then((r) => r.json());
  const text = canonicalJson(signedPart(lab));
  assert(text === lab.canonical, `${text} ≠ ${lab.canonical}`);
  assert((await sha256Hex(text)) === lab.sha256, "SHA-256");
  assert((await hmacHex(text, lab.key)) === lab.hmac, "HMAC");
});

test("변조 안내: 바뀐 곳을 '주소: 전 → 후' 로 보여 주고, 비교할 저장본이 없으면 그렇다고 말한다", async () => {
  const { tamperLines } = await import("../../web/ui/tamper.js");
  const lines = tamperLines([{ path: "inventory.seed_tomato", before: 4, after: 999 }, { path: "inventory.gold", before: null, after: 1 }]);
  assert(lines.includes("inventory.seed_tomato: 4 → 999"), lines.join("\n"));
  assert(lines.includes("inventory.gold: 없음 → 1"));
  assert(tamperLines(null).some((l) => l.includes("비교할 정상 저장본이 없어서")));
  const many = tamperLines(Array.from({ length: 12 }, (_, i) => ({ path: `inventory.x${i}`, before: 0, after: 1 })));
  assert(many.some((l) => l.includes("그 밖에 4곳")));
});
