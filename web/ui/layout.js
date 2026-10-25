// 화면 배치: 밭, 헛간과 창고 마당, 나무가 어디에 놓일지 정합니다. (단위: 도트 1칸 = 1px)
//
// 가로 화면(16:9 등):          세로 화면(9:16, 갤럭시 S25 등):
//   나무  나무    나무          나무  나무  나무
//  ┌울타리──────┐화덕 헛간     ┌울타리──────┐
//  │    밭     │길 상자        │    밭     │
//  └──────────┘  자루         └──────────┘
//      돗자리                  헛간 상자  화덕
//                                   자루
//                                 돗자리
export const TILE = 16;

export function computeLayout(plots, portrait) {
  const cols = Math.max(...plots.map((p) => p.x)) + 1;
  const rows = Math.max(...plots.map((p) => p.y)) + 1;
  const farm = { x: TILE, y: 2 * TILE, w: cols * TILE, h: rows * TILE };
  const farmRight = farm.x + farm.w;
  const farmBottom = farm.y + farm.h;

  if (!portrait) {
    const yard = { x: farmRight + TILE, y: TILE, w: 5 * TILE };
    return {
      portrait,
      width: yard.x + yard.w,
      height: farmBottom + 2 * TILE,
      farm,
      kitchen: { x: yard.x + 4, y: yard.y + 16 }, // 화덕 (요리하는 곳)
      cat: { x: yard.x + 58, y: yard.y + 17 }, // 헛간 옆 고양이
      picnic: { x: farm.x + farm.w / 2 - 20, y: farmBottom + 10, w: 40, h: 12 }, // 나눠 먹는 돗자리
      barn: { x: yard.x + 24, y: yard.y },
      crates: { x: yard.x + 8, y: yard.y + 34 }, // 수확물 상자 줄
      sacks: { x: yard.x + 10, y: yard.y + 56 }, // 씨앗 자루 줄
      path: { x: farmRight + 3, y: yard.y + 30, w: 10, h: farmBottom - yard.y - 30 },
      trees: [2, 26, 50, 78, 104, 128].map((x, i) => ({ x, y: i % 2 ? 2 : 0 })),
      decor: decorSpots({ x: yard.x + 24, y: yard.y }, { x: farm.x - 10, y: farmBottom + 4 }, { x: farm.x + farm.w - 30, y: farmBottom + 4 }, { x: yard.x + 6, y: farmBottom + 2 }),
    };
  }
  const yardY = farmBottom + 8;
  return {
    portrait,
    width: farmRight + TILE,
    height: yardY + 68,
    farm,
    kitchen: { x: farm.x + 112, y: yardY + 4 },
    cat: { x: farm.x + 28, y: yardY + 18 },
    picnic: { x: farm.x + farm.w / 2 - 20, y: yardY + 48, w: 40, h: 12 },
    barn: { x: farm.x, y: yardY },
    crates: { x: farm.x + 44, y: yardY },
    sacks: { x: farm.x + 46, y: yardY + 22 },
    path: { x: farm.x + 10, y: farmBottom, w: 12, h: 10 },
    trees: [2, 28, 56, 84, 112, 140].map((x, i) => ({ x, y: i % 2 ? 2 : 0 })),
    decor: decorSpots({ x: farm.x, y: yardY }, { x: farm.x + 2, y: yardY + 46 }, { x: farm.x + 94, y: yardY + 46 }, { x: farm.x + 114, y: yardY + 44 }),
  };
}

// 꾸미기 물건이 놓이는 자리 (16×16 그림의 왼쪽 위). data/crafts.json 의 spot 이름과 짝이에요.
//   door: 헛간 문에 거는 리스, potLeft·potRight: 화분, lantern: 연꽃 등
function decorSpots(barn, potLeft, potRight, lantern) {
  return { door: { x: barn.x + 8, y: barn.y + 16 }, potLeft, potRight, lantern };
}

// 선물 건네는 자리: 돗자리 왼쪽에서 농부와 친구가 마주 서요 (친구는 화면 왼쪽에서 걸어와요)
// 선물은 두 사람 머리 위 말풍선 사이에 떠올라요 (item 은 선물 그림의 아래 가운데)
export function giftSpots(picnic) {
  const y = picnic.y + picnic.h;
  return {
    giver: { x: picnic.x - 2, y, facing: -1 },
    taker: { x: picnic.x - 26, y, facing: 1 },
    item: { x: picnic.x - 14, y: y - 14 },
  };
}

// 돗자리 둘레의 자리 4개 (발 위치, 돗자리 쪽을 바라봐요)와 요리를 놓을 가운데
export function picnicSeats(picnic) {
  const { x, y, w, h } = picnic;
  return {
    center: { x: x + w / 2, y: y + h / 2 + 2 },
    seats: [
      { x: x - 3, y: y + h, facing: 1 },
      { x: x + w + 3, y: y + h, facing: -1 },
      { x: x + 9, y: y + 2, facing: 1 },
      { x: x + w - 9, y: y + 2, facing: -1 },
    ],
  };
}

// 화면 크기에 맞는 확대 배율. 도트가 고르게 보이도록 되도록 정수 배로 키워요.
export function fitZoom(layout, availableWidth, availableHeight) {
  const fit = Math.min(availableWidth / layout.width, availableHeight / layout.height);
  return fit >= 1 ? Math.floor(fit) : fit;
}
