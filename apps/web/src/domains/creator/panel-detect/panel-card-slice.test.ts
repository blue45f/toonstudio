import { describe, expect, it } from "vitest";

import {
  cardCutBounds,
  cardRange,
  moveCardCut,
  replanCardSlicesAsync,
  resolveCardSliceOptions,
  sliceCards,
  sliceCardsAsync,
  snapCardCut,
} from "./panel-card-slice";
import { CARD_NEWS_PRESET, CARD_SLICE_LIMITS, CardSliceError, cardGeometry } from "./panel-card-slice-types";
import { BLACK, FixtureImage, PASTEL, WHITE, type Rgb } from "./panel-detect-fixtures";

interface Scene {
  readonly height: number;
  /** 장면 아래 여백 두께. */
  readonly gutterAfter: number;
}

interface Strip {
  readonly image: FixtureImage;
  /** 여백 구간 [시작, 끝) — 절단선이 그 안에 있어야 "여백에서 자른" 것이다. */
  readonly gutters: ReadonlyArray<readonly [number, number]>;
}

const SIDE = 20;

function strip(width: number, scenes: readonly Scene[], background: Rgb = WHITE, lead = 40): Strip {
  const total = lead + scenes.reduce((sum, scene) => sum + scene.height + scene.gutterAfter, 0);
  const image = new FixtureImage(width, total, background);
  const gutters: Array<readonly [number, number]> = [];
  let y = lead;
  scenes.forEach((scene, index) => {
    image.art(SIDE, y, width - SIDE * 2, scene.height, { seed: index, balloon: true });
    y += scene.height;
    if (scene.gutterAfter > 0) gutters.push([y, y + scene.gutterAfter]);
    y += scene.gutterAfter;
  });
  return { image, gutters };
}

/** slack: 어두운 테두리가 검정 여백과 허용 오차 안에서 섞이는 만큼의 여유 행. */
function insideGutter(y: number, gutters: Strip["gutters"], slack = 0): boolean {
  return gutters.some(([from, to]) => y >= from - slack && y <= to + slack);
}

describe("카드 기하", () => {
  it("원본 폭을 카드 폭에 맞춘 배율로 카드 한 장에 들어가는 원본 높이를 정한다", () => {
    const options = resolveCardSliceOptions();
    expect(cardGeometry(720, options)).toMatchObject({ scale: 1.5, cardSourceHeight: 900 });
    expect(cardGeometry(1080, options)).toMatchObject({ scale: 1, cardSourceHeight: 1350 });
    expect(cardGeometry(1440, options)).toMatchObject({ scale: 0.75, cardSourceHeight: 1800 });
    // 내림이라 어떤 조각도 카드 높이를 넘지 않는다.
    for (const width of [333, 701, 1001, 1234]) {
      const geometry = cardGeometry(width, options);
      expect(Math.round(geometry.cardSourceHeight * geometry.scale)).toBeLessThanOrEqual(CARD_NEWS_PRESET.height);
    }
  });

  it("잘못된 옵션은 코드와 함께 거절한다", () => {
    expect(() => resolveCardSliceOptions({ minFill: 0.95 })).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => resolveCardSliceOptions({ cardCount: 0 })).toThrow(CardSliceError);
    expect(() => resolveCardSliceOptions({ cardWidth: 10 })).toThrow(CardSliceError);
    expect(resolveCardSliceOptions({ cardCount: null }).cardCount).toBeNull();
  });
});

describe("카드 슬라이스 — 여백 우선 절단", () => {
  const SCENES: readonly Scene[] = [
    { height: 700, gutterAfter: 60 },
    { height: 500, gutterAfter: 48 },
    { height: 880, gutterAfter: 72 },
    { height: 600, gutterAfter: 40 },
    { height: 800, gutterAfter: 0 },
  ];

  it("카드 한 장에 못 담는 긴 원고는 최소 장수로 나누고 모든 절단선을 여백 안에 둔다", () => {
    const { image, gutters } = strip(720, SCENES);
    const { plan } = sliceCards(image.raster());
    const minimum = Math.ceil(image.height / plan.geometry.cardSourceHeight);
    expect(plan.cards.length).toBeGreaterThanOrEqual(minimum);
    expect(plan.cards.length).toBeLessThanOrEqual(minimum + 1);
    expect(plan.cuts).toHaveLength(plan.cards.length - 1);
    for (const cut of plan.cuts) {
      expect(cut.kind).toBe("clean");
      expect(insideGutter(cut.y, gutters), `절단선 ${cut.y} 가 여백 ${JSON.stringify(gutters)} 밖`).toBe(true);
    }
    for (const card of plan.cards) {
      expect(card.y1 - card.y0).toBeLessThanOrEqual(plan.geometry.cardSourceHeight);
      expect(card.outputHeight).toBeLessThanOrEqual(CARD_NEWS_PRESET.height);
    }
    expect(plan.contentCutCount).toBe(0);
    expect(plan.warnings).toEqual(["upscaled"]);
    expect(plan.background).toBe("#ffffff");
  });

  it("카드는 원본을 빠짐없이, 겹치지 않게 이어 붙인다", () => {
    const { image } = strip(720, SCENES);
    const { plan } = sliceCards(image.raster());
    expect(plan.cards[0].y0).toBe(0);
    expect(plan.cards[plan.cards.length - 1].y1).toBe(image.height);
    plan.cards.slice(1).forEach((card, index) => expect(card.y0).toBe(plan.cards[index].y1));
  });

  it("꽉 채운 카드보다 여백이 있는 자리를 우선한다(채움 60% 이상이면 여백에서 자른다)", () => {
    // 첫 장면 뒤 여백이 카드 높이(900)의 약 73% 지점에 있고, 그 너머 900 지점은 그림 한가운데다.
    const { image, gutters } = strip(720, [
      { height: 640, gutterAfter: 50 },
      { height: 1200, gutterAfter: 60 },
      { height: 700, gutterAfter: 0 },
    ]);
    const { plan } = sliceCards(image.raster());
    const first = plan.cuts[0];
    expect(first.kind).toBe("clean");
    expect(insideGutter(first.y, gutters)).toBe(true);
    expect(first.y).toBeLessThan(plan.geometry.cardSourceHeight);
  });

  it("여백 색이 검정·파스텔이어도 같은 방식으로 자르고 카드 바탕색을 여백색으로 정한다", () => {
    for (const [color, expected] of [[BLACK, "#000000"], [PASTEL, "#cde1f5"]] as const) {
      const { image, gutters } = strip(720, SCENES, color);
      const { plan } = sliceCards(image.raster());
      expect(plan.background).toBe(expected);
      // 검정 여백에서는 어두운 장면 테두리(채널 ≤ 24)가 허용 오차 안에서 여백과 섞여 3행 안팎 넓어 보인다.
      for (const cut of plan.cuts) expect(insideGutter(cut.y, gutters, color === BLACK ? 4 : 0)).toBe(true);
    }
  });

  it("투명 여백은 바탕색 후보에서 빼고 흰색으로 둔다", () => {
    const { image } = strip(720, SCENES, WHITE);
    for (let p = 0; p < image.data.length; p += 4) {
      if (image.data[p] === 255 && image.data[p + 1] === 255 && image.data[p + 2] === 255) image.data[p + 3] = 0;
    }
    const { plan } = sliceCards(image.raster());
    expect(plan.background).toBe("#ffffff");
    expect(plan.cuts.every((cut) => cut.kind === "clean")).toBe(true);
  });

  it("넓은 단색 면(하늘 등)도 안전한 절단 자리로 본다", () => {
    const width = 720;
    const image = new FixtureImage(width, 2600, WHITE);
    image.art(20, 40, width - 40, 600, { seed: 1 });
    image.fillRect(0, 640, width, 1260, [150, 190, 235]);
    image.art(20, 1900, width - 40, 660, { seed: 2 });
    const { plan } = sliceCards(image.raster());
    expect(plan.cuts.length).toBe(2);
    for (const cut of plan.cuts) {
      expect(cut.kind).toBe("clean");
      expect(cut.y).toBeGreaterThanOrEqual(640);
      expect(cut.y).toBeLessThanOrEqual(1900);
    }
  });

  it("여백이 전혀 없는 전면 삽화는 내용을 가로지르는 절단을 경고로 알린다", () => {
    const image = new FixtureImage(720, 3000, WHITE);
    image.art(0, 0, 720, 3000, { border: 0, seed: 3, balloon: false });
    const { plan } = sliceCards(image.raster());
    expect(plan.cards.length).toBe(Math.ceil(3000 / plan.geometry.cardSourceHeight));
    expect(plan.contentCutCount).toBe(plan.cuts.length);
    expect(plan.cuts.every((cut) => cut.kind === "content")).toBe(true);
    expect(plan.warnings).toContain("content-cuts");
    for (const card of plan.cards) expect(card.y1 - card.y0).toBeLessThanOrEqual(plan.geometry.cardSourceHeight);
  });

  it("카드 한 장보다 짧은 원고는 한 장으로 둔다", () => {
    const { image } = strip(720, [{ height: 600, gutterAfter: 0 }]);
    const { plan } = sliceCards(image.raster());
    expect(plan.cards).toHaveLength(1);
    expect(plan.cuts).toEqual([]);
    expect(plan.cards[0]).toMatchObject({ y0: 0, y1: image.height });
  });

  it("카드 수를 직접 정하면 그 수로 나누고, 가능한 범위 밖이면 거절한다", () => {
    const { image } = strip(720, SCENES);
    const auto = sliceCards(image.raster());
    const range = cardRange(auto);
    expect(range.min).toBe(Math.ceil(image.height / auto.plan.geometry.cardSourceHeight));
    expect(range.max).toBeGreaterThan(range.min);
    const more = sliceCards(image.raster(), { cardCount: range.min + 1 });
    expect(more.plan.cards).toHaveLength(range.min + 1);
    for (const card of more.plan.cards) expect(card.y1 - card.y0).toBeGreaterThanOrEqual(auto.plan.geometry.minLength);
    expect(() => sliceCards(image.raster(), { cardCount: range.min - 1 })).toThrowError(expect.objectContaining({ code: "invalid-options" }));
    expect(() => sliceCards(image.raster(), { cardCount: range.max + 1 })).toThrowError(expect.objectContaining({ code: "invalid-options" }));
  });

  it("카드가 인스타그램 한도(20장)를 넘으면 경고하고, 상한(60장)을 넘으면 거절한다", () => {
    const many = strip(720, Array.from({ length: 24 }, () => ({ height: 700, gutterAfter: 80 })));
    const { plan } = sliceCards(many.image.raster());
    expect(plan.cards.length).toBeGreaterThan(CARD_SLICE_LIMITS.softMaxCards);
    expect(plan.warnings).toContain("over-carousel-limit");
    const tooMany = new FixtureImage(64, 64 * 1.25 * 61 + 100, WHITE);
    expect(() => sliceCards(tooMany.raster())).toThrowError(expect.objectContaining({ code: "too-many-cards" }));
  });

  it("폭이 카드보다 넓으면 줄이고, 좁으면 키운다고 경고한다", () => {
    const wide = strip(1440, [{ height: 1500, gutterAfter: 80 }, { height: 1500, gutterAfter: 0 }]);
    expect(sliceCards(wide.image.raster()).plan.warnings).toContain("downscaled");
    const exact = strip(1080, [{ height: 1200, gutterAfter: 80 }, { height: 1200, gutterAfter: 0 }]);
    expect(sliceCards(exact.image.raster()).plan.warnings).toEqual([]);
  });
});

describe("카드 슬라이스 — 결정성과 실행 규칙", () => {
  it("동기·비동기·배열 종류와 무관하게 같은 계획을 낸다", async () => {
    const { image } = strip(720, [{ height: 700, gutterAfter: 60 }, { height: 900, gutterAfter: 50 }, { height: 800, gutterAfter: 0 }]);
    const sync = sliceCards(image.raster());
    const asynchronous = await sliceCardsAsync(image.raster(), undefined, { yieldNow: () => Promise.resolve() });
    const plain = sliceCards({ width: image.width, height: image.height, data: Array.from(image.data) });
    expect(asynchronous.plan).toEqual(sync.plan);
    expect(plain.plan).toEqual(sync.plan);
  });

  it("취소 신호와 시간 상한은 부분 결과 없이 코드로 끝난다", async () => {
    const { image } = strip(720, [{ height: 1200, gutterAfter: 60 }, { height: 1200, gutterAfter: 0 }]);
    expect(() => sliceCards(image.raster(), { isCancelled: () => true })).toThrowError(expect.objectContaining({ code: "cancelled" }));
    let tick = 0;
    expect(() => sliceCards(image.raster(), { now: () => (tick += 1_000), timeLimitMs: 1_500 })).toThrowError(expect.objectContaining({ code: "timeout" }));
    const controller = new AbortController();
    controller.abort();
    await expect(sliceCardsAsync(image.raster(), { isCancelled: () => controller.signal.aborted })).rejects.toMatchObject({ code: "cancelled" });
  });

  it("잘못된 입력은 코드로 거절한다", () => {
    expect(() => sliceCards({ width: 32, height: 100, data: new Uint8ClampedArray(32 * 100 * 4) })).toThrowError(expect.objectContaining({ code: "invalid-input" }));
    expect(() => sliceCards({ width: 100, height: 100, data: new Uint8ClampedArray(10) })).toThrow(CardSliceError);
  });

  it("큰 원고(약 1,000만 화소, 카드 30장 이상)도 제한 시간 안에 나눈다", () => {
    // 폭 480 → 배율 2.25, 카드 한 장 = 원본 600행. 장면 + 여백이 450~560행이라 장면마다 한 장씩 나뉜다.
    const scenes = Array.from({ length: 40 }, (_, index) => ({ height: 400 + (index % 5) * 20, gutterAfter: 50 + (index % 3) * 15 }));
    const { image, gutters } = strip(480, scenes);
    const started = performance.now();
    const { plan } = sliceCards(image.raster());
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(plan.cards.length).toBeGreaterThan(30);
    expect(plan.cuts.every((cut) => cut.kind === "clean" && insideGutter(cut.y, gutters))).toBe(true);
  });
});

describe("카드 슬라이스 — 수동 조정", () => {
  const { image, gutters } = strip(720, [
    { height: 700, gutterAfter: 60 },
    { height: 500, gutterAfter: 48 },
    { height: 880, gutterAfter: 72 },
    { height: 600, gutterAfter: 40 },
    { height: 800, gutterAfter: 0 },
  ]);

  it("컷마다 움직일 수 있는 범위를 알려 주고, 범위 밖으로는 나가지 않는다", () => {
    const analysis = sliceCards(image.raster());
    const bounds = cardCutBounds(analysis.plan, 0);
    expect(bounds).not.toBeNull();
    if (!bounds) return;
    const farUp = moveCardCut(analysis, 0, -500);
    expect(farUp.plan.cuts[0].y).toBe(bounds.min);
    const farDown = moveCardCut(analysis, 0, 99_999);
    expect(farDown.plan.cuts[0].y).toBe(bounds.max);
    for (const card of farDown.plan.cards) expect(card.y1 - card.y0).toBeLessThanOrEqual(analysis.plan.geometry.cardSourceHeight);
    expect(cardCutBounds(analysis.plan, 99)).toBeNull();
  });

  it("옮긴 컷은 수동으로 표시되고 새 위치의 여백 등급을 다시 판정한다", () => {
    const analysis = sliceCards(image.raster());
    const bounds = cardCutBounds(analysis.plan, 0);
    if (!bounds) throw new Error("범위가 있어야 해요");
    const midArt = Math.round((bounds.min + bounds.max) / 2);
    const moved = moveCardCut(analysis, 0, insideGutter(midArt, gutters) ? bounds.min : midArt);
    expect(moved).not.toBe(analysis);
    expect(moved.plan.cuts[0].manual).toBe(true);
    expect(moved.plan.cuts[0].y).not.toBe(analysis.plan.cuts[0].y);
    if (!insideGutter(moved.plan.cuts[0].y, gutters)) {
      expect(moved.plan.cuts[0].kind).not.toBe("clean");
      expect(moved.plan.warnings).toContain("content-cuts");
    }
    expect(moveCardCut(moved, 0, moved.plan.cuts[0].y)).toBe(moved);
    // 원본 분석은 바뀌지 않는다.
    expect(analysis.plan.cuts[0].manual).toBe(false);
  });

  it("'가까운 여백으로'는 내용을 가로지르는 컷을 가장 가까운 여백 가운데로 붙인다", () => {
    const analysis = sliceCards(image.raster());
    const bounds = cardCutBounds(analysis.plan, 0);
    if (!bounds) throw new Error("범위가 있어야 해요");
    const gutterNearBounds = gutters.find(([from, to]) => to >= bounds.min && from <= bounds.max);
    if (!gutterNearBounds) throw new Error("범위 안에 여백이 있어야 해요");
    const dirty = moveCardCut(analysis, 0, Math.max(bounds.min, gutterNearBounds[0] - 25));
    expect(dirty.plan.cuts[0].kind).not.toBe("clean");
    const snapped = snapCardCut(dirty, 0);
    expect(snapped.plan.cuts[0].kind).toBe("clean");
    const center = (gutterNearBounds[0] + gutterNearBounds[1]) / 2;
    expect(Math.abs(snapped.plan.cuts[0].y - center)).toBeLessThanOrEqual(2);
    expect(snapCardCut(snapped, 0)).toBe(snapped);
  });

  it("카드 수만 바꿔 다시 나누면 수동 컷은 버려지고, null 이면 자동 수로 돌아간다", async () => {
    const analysis = sliceCards(image.raster());
    const moved = moveCardCut(analysis, 0, analysis.plan.cuts[0].y - 12);
    const range = cardRange(analysis);
    const more = await replanCardSlicesAsync(moved, range.min + 1, undefined, { yieldNow: () => Promise.resolve() });
    expect(more.plan.cards).toHaveLength(range.min + 1);
    expect(more.plan.cuts.some((cut) => cut.manual)).toBe(false);
    const auto = await replanCardSlicesAsync(more, null, undefined, { yieldNow: () => Promise.resolve() });
    expect(auto.plan).toEqual(analysis.plan);
    const controller = new AbortController();
    controller.abort();
    await expect(replanCardSlicesAsync(analysis, null, controller.signal)).rejects.toMatchObject({ code: "cancelled" });
  });
});
