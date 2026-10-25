// 연구소 지문 실험대: 값을 바꾸면 지문이 어떻게 달라지는지 브라우저에서 바로 계산해 봐요.
// 서버(server/lab/store.py 의 canonical)와 똑같은 규칙으로 글자를 만들어야 같은 지문이 나와요.
//   - 열쇠(key) 이름을 가나다·abc 순서로 정렬
//   - 쉼표·콜론 뒤에 빈칸 없음
// 해시 계산은 브라우저에 들어 있는 Web Crypto(crypto.subtle)를 써요.

// 정렬된 JSON 글자 (Python 의 json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False) 와 같게)
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// 연구소 지문에 들어가는 것: 실험 작물과 송장 (서버의 _read 와 같은 모양)
export const signedPart = (lab) => ({ samples: lab.samples, transfers: lab.transfers });

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (text) => new TextEncoder().encode(text);

// 키 없는 그냥 해시
export async function sha256Hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", bytes(text)));
}

// 키를 섞은 해시 (keyHex: 16진수 글자로 된 키)
export async function hmacHex(text, keyHex) {
  const keyBytes = new Uint8Array(keyHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, bytes(text)));
}

// "만약 이 값을 바꾸면?" — 저장하지 않고 바꾼 모양만 만들어요
//   change: { sampleId, field: "count" | "color" | "size", value }
export function whatIf(lab, change) {
  const samples = lab.samples.map((s) => (s.id === change.sampleId ? { ...s, [change.field]: change.value } : s));
  return { samples, transfers: lab.transfers };
}

// 두 지문에서 다른 글자 자리 (화면에서 강조하려고)
export function changedPositions(a, b) {
  return [...a].map((ch, i) => ch !== b[i]);
}

// 실험 작물 한 개 = 바이오 연료 한 개
export const fuelFor = (sample) => sample.count;
