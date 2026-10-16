import { describe, expect, it } from "vitest";

import { detectPanels, detectPanelsAsync } from "./panel-detect-core";
import { FixtureImage, WHITE, rectNear } from "./panel-detect-fixtures";
import { alternativeGutters, estimateGutter } from "./panel-detect-raster";

import type { PanelDetectResult, PanelRect } from "./panel-detect-types";

/**
 * 여백색 가설 시험.
 *
 * 바깥 여백 없이 이미지 끝까지 닿는 어두운 그림은 "거의 한 색인 줄"이 그림 속에서 더 많이 나온다. 그러면 가장 많이 표를 받은 색이
 * 여백이 아니라 그림의 어두운 색이 되어 컷을 하나도 못 나눈다. 이때만 다른 여백색 가설을 시험해 뚜렷이 좋아질 때 바꾼다.
 * 이 파일의 그림은 모두 코드로 만든 합성 이미지다.
 */

const SIZE = 800;
const GUTTER = 8;
const HALF = (SIZE - GUTTER) / 2;

/** 위에 가로로 긴 컷 하나, 아래에 컷 둘. 컷은 이미지 끝까지 닿고 여백은 흰색 8px 줄 둘뿐이다. */
const EXPECTED: readonly PanelRect[] = [
  { x: 0, y: 0, width: SIZE, height: HALF },
  { x: 0, y: HALF + GUTTER, width: HALF, height: HALF },
  { x: HALF + GUTTER, y: HALF + GUTTER, width: HALF, height: HALF },
];

function darkCollage(detail: number): FixtureImage {
  const image = new FixtureImage(SIZE, SIZE, WHITE);
  EXPECTED.forEach((rect, index) => image.darkArt(rect.x, rect.y, rect.width, rect.height, { seed: index + 1, detail }));
  return image;
}

function rectsOf(result: PanelDetectResult): PanelRect[] {
  return result.panels.map(({ x, y, width, height }) => ({ x, y, width, height }));
}

function expectLayout(result: PanelDetectResult, expected: readonly PanelRect[], tolerance = 2): void {
  expect(result.panels).toHaveLength(expected.length);
  const actual = rectsOf(result);
  expected.forEach((rect, index) => {
    expect(rectNear(actual[index], rect, tolerance), `컷 ${index + 1} 기대 ${JSON.stringify(rect)} 실제 ${JSON.stringify(actual[index])}`).toBe(true);
  });
}

describe("여백색 가설 — 어두운 그림이 여백색 표를 가로챈 경우", () => {
  it("전제: 이 그림에서는 어두운 색이 가장 많이 표를 받고, 흰 여백은 표본에 거의 안 잡힌다", () => {
    const gutter = estimateGutter(darkCollage(0.03).raster(), 28);
    expect(gutter.kind).toBe("black");
    // 두 번째 이후 가설로 흰색이 나온다.
    const alternatives = alternativeGutters(darkCollage(0.03).raster(), 28, gutter, 3);
    expect(alternatives.some((candidate) => candidate.kind === "white")).toBe(true);
  });

  it("어두운 색으로는 아무 데도 안 나뉘면 흰색 가설로 컷 셋을 찾는다(밝은 점이 줄마다 3%)", () => {
    const result = detectPanels(darkCollage(0.03).raster(), { readingOrder: "comic" });
    expectLayout(result, EXPECTED);
    expect(result.gutter.kind).toBe("white");
    expect(result.level).not.toBe("low");
    expect(result.panels.every((panel) => !panel.warnings.includes("merged-panels-suspected"))).toBe(true);
    expect(result.warnings).not.toContain("low-overall-confidence");
  });

  it("어두운 색으로 엉뚱하게 나뉘어 신뢰도가 낮을 때도 흰색 가설로 바로잡는다(밝은 점이 줄마다 0.4%)", () => {
    const image = darkCollage(0.004);
    expect(estimateGutter(image.raster(), 28).kind).toBe("black");
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectLayout(result, EXPECTED);
    expect(result.gutter.kind).toBe("white");
  });

  it("같은 입력은 입력 배열 종류와 무관하게 같은 결과이고, 비동기 실행도 같다", async () => {
    const image = darkCollage(0.03);
    const clamped = detectPanels(image.raster(), { readingOrder: "comic" });
    const plain = detectPanels({ width: image.width, height: image.height, data: Array.from(image.data) }, { readingOrder: "comic" });
    expect(JSON.stringify(plain)).toBe(JSON.stringify(clamped));
    const asynchronous = await detectPanelsAsync(image.raster(), { readingOrder: "comic" });
    expect(JSON.stringify(asynchronous)).toBe(JSON.stringify(clamped));
  });
});

describe("여백색 가설 — 단색 면이 넓은 컬러 그림", () => {
  it("컷이 이미지 끝까지 닿고 그림이 거의 단색이면 그림 색이 여백으로 오인되지만, 흰 여백 가설로 컷 둘을 찾는다", () => {
    const image = new FixtureImage(600, 400, WHITE);
    const left = image.art(0, 0, 296, 400, { seed: 0, border: 0 });
    const right = image.art(304, 0, 296, 400, { seed: 1, border: 0 });
    // 전제: 가장 많이 표를 받은 색은 흰 여백이 아니라 그림의 바탕색이다.
    expect(estimateGutter(image.raster(), 28).kind).toBe("solid");
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectLayout(result, [left, right], 1);
    expect(result.gutter.kind).toBe("white");
  });
});

describe("여백색 가설 — 잘못 바꾸지 않는다", () => {
  it("바깥 여백이 있는 컷 한 장(전면 그림)은 다른 가설을 시험해도 한 컷 그대로다", () => {
    const image = new FixtureImage(SIZE, SIZE, WHITE);
    image.darkArt(40, 40, SIZE - 80, SIZE - 80, { seed: 1, detail: 0.03 });
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectLayout(result, [{ x: 40, y: 40, width: SIZE - 80, height: SIZE - 80 }]);
    expect(result.gutter.kind).toBe("white");
  });

  it("여백이 하나도 없는 전면 삽화는 어떤 가설로도 나뉘지 않아 이미지 전체가 컷 한 장으로 남는다", () => {
    const image = new FixtureImage(SIZE, SIZE, WHITE);
    image.darkArt(0, 0, SIZE, SIZE, { seed: 3, detail: 0.03 });
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0]).toMatchObject({ x: 0, y: 0, width: SIZE, height: SIZE });
    // 컷 하나짜리 그림이므로 "여러 컷이 합쳐졌을 수 있다"는 의심은 붙지 않는다.
    expect(result.panels[0].warnings).not.toContain("merged-panels-suspected");
  });

  it("처음 추정으로 잘 나뉜 흰 여백 쪽은 그대로다", () => {
    const image = new FixtureImage(1200, 1700, WHITE);
    const expected = [
      image.art(40, 40, 560, 700, { seed: 0 }),
      image.art(624, 40, 536, 700, { seed: 1 }),
      image.art(40, 764, 1120, 896, { seed: 2 }),
    ];
    const result = detectPanels(image.raster(), { readingOrder: "comic" });
    expectLayout(result, expected, 1);
    expect(result.gutter.kind).toBe("white");
    expect(result.level).toBe("high");
  });

  it("가설 시험 때문에 시간 상한을 넘기지 않는다: 시간 절반을 이미 썼으면 처음 결과를 그대로 낸다", () => {
    const image = darkCollage(0.03);
    let now = 0;
    let checks = 0;
    // 드라이버가 점검을 두 번 한 뒤(처음 분석 도중)부터 시계가 상한(10초)의 60%를 가리키지만 상한은 넘지 않는다.
    const result = detectPanels(image.raster(), {
      readingOrder: "comic",
      timeLimitMs: 10_000,
      now: () => now,
      isCancelled: () => {
        checks += 1;
        if (checks === 2) now = 6_000;
        return false;
      },
    });
    expect(checks).toBeGreaterThanOrEqual(2);
    expect(result.panels).toHaveLength(1);
    expect(result.gutter.kind).toBe("black");
    // 처음 결과 그대로이므로 컷이 겹치거나 합쳐졌을 수 있다는 경고가 남는다(사용자가 알 수 있다).
    expect(result.panels[0].warnings.some((warning) => warning === "merged-panels-suspected" || warning === "overlap-suspected")).toBe(true);
  });

  it("가설을 시험하는 도중에 시간 절반을 넘기면 그 가설을 버리고 처음 결과를 낸다(timeout 오류로 끝내지 않는다)", () => {
    const image = darkCollage(0.03);
    /** 점검(isCancelled) 시점마다 센다. jumpAt 번째 점검에서 시계를 상한(10초)의 60% 로 옮긴다. */
    const run = (jumpAt: number | null): { readonly result: PanelDetectResult; readonly checks: number } => {
      let now = 0;
      let checks = 0;
      const result = detectPanels(image.raster(), {
        readingOrder: "comic",
        timeLimitMs: 10_000,
        now: () => now,
        isCancelled: () => {
          checks += 1;
          if (checks === jumpAt) now = 6_000;
          return false;
        },
      });
      return { result, checks };
    };
    const whole = run(null);
    // 처음 분석 도중(두 번째 점검)에 시계가 절반을 넘으면 가설은 시작도 하지 않는다 — 처음 분석의 점검 횟수를 얻는다.
    const primaryOnly = run(2);
    expect(whole.result.panels).toHaveLength(3);
    expect(primaryOnly.result.panels).toHaveLength(1);
    expect(whole.checks).toBeGreaterThan(primaryOnly.checks + 3);

    // 처음 분석은 끝났고 가설을 시작할 때는 시간이 남아 있었는데, 시험하는 도중에 절반을 넘긴다.
    const midway = run(primaryOnly.checks + 3);
    expect(midway.result.panels).toHaveLength(1);
    expect(midway.result.gutter.kind).toBe("black");
    expect(midway.result).toEqual(primaryOnly.result);
  });

  it("가설이 컷을 너무 잘게 쪼개 상한을 넘기면 그 가설만 버리고 처음 결과를 낸다(오류로 끝내지 않는다)", () => {
    // 어두운 그림 사이사이에 흰 줄무늬(8px)가 40px 간격으로 있다. 어두운 줄이 훨씬 많아 검정이 표를 받고(나뉘는 곳 없음),
    // 흰색 가설이면 컷이 스무 개쯤 나뉜다 — 상한(3)을 넘으므로 그 가설은 틀린 것으로 보고 버린다.
    const image = new FixtureImage(SIZE, SIZE, WHITE);
    image.darkArt(0, 0, SIZE, SIZE, { seed: 5, detail: 0.03 });
    for (let y = 20; y < SIZE; y += 40) image.fillRect(0, y, SIZE, 8, WHITE);
    expect(estimateGutter(image.raster(), 28).kind).toBe("black");
    const limited = detectPanels(image.raster(), { readingOrder: "comic", maxPanels: 3 });
    expect(limited.panels).toHaveLength(1);
    expect(limited.gutter.kind).toBe("black");
    // 상한을 넉넉히 주면 같은 그림이 흰색 가설로 잘게 나뉜다(그림이 흰 줄무늬로 가득한 만큼 컷이 많은 것이 맞다).
    const unlimited = detectPanels(image.raster(), { readingOrder: "comic", maxPanels: 60 });
    expect(unlimited.panels.length).toBeGreaterThan(3);
  });
});

describe("섬세 민감도 — 2px 헤어라인 여백", () => {
  /** 해상도가 낮은 콜라주: 컷 사이 여백이 흰색 2px 줄뿐이고 바깥 여백도 없다. */
  function hairlineCollage(): { readonly image: FixtureImage; readonly expected: readonly PanelRect[] } {
    const size = 674;
    const half = (size - 2) / 2;
    const expected: PanelRect[] = [
      { x: 0, y: 0, width: size, height: half },
      { x: 0, y: half + 2, width: half, height: half },
      { x: half + 2, y: half + 2, width: half, height: half },
    ];
    const image = new FixtureImage(size, size, WHITE);
    expected.forEach((rect, index) => image.darkArt(rect.x, rect.y, rect.width, rect.height, { seed: index + 7, detail: 0.03 }));
    return { image, expected };
  }

  it("보통에서는 2px 여백을 나누지 않고 합쳐졌을 수 있다고 알린다", () => {
    const { image } = hairlineCollage();
    const result = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "normal" });
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].warnings.some((warning) => warning === "merged-panels-suspected" || warning === "overlap-suspected")).toBe(true);
  });

  it("섬세로 바꾸면 여백색 가설과 함께 컷 셋으로 나뉜다", () => {
    const { image, expected } = hairlineCollage();
    expect(estimateGutter(image.raster(), 28).kind).toBe("black");
    const result = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "fine" });
    expectLayout(result, expected, 1);
    expect(result.gutter.kind).toBe("white");
  });

  it("밝은 바탕의 컷 둘 사이 2px 여백도 섬세에서는 나누고 보통에서는 나누지 않는다", () => {
    const image = new FixtureImage(600, 400, WHITE);
    image.art(0, 0, 299, 400, { seed: 0, border: 0 });
    image.art(301, 0, 299, 400, { seed: 1, border: 0 });
    expect(detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "normal" }).panels).toHaveLength(1);
    const fine = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "fine" });
    expectLayout(fine, [{ x: 0, y: 0, width: 299, height: 400 }, { x: 301, y: 0, width: 299, height: 400 }], 1);
  });
});
