import { describe, expect, it } from "vitest";

import { detectPanels } from "./panel-detect-core";
import { createPanelEditState, mergePanels } from "./panel-detect-edit";
import { FixtureImage, INK, WHITE, mulberry32, rectNear } from "./panel-detect-fixtures";
import type { PanelDetectResult, PanelRect } from "./panel-detect-types";

/**
 * 흑백 만화 스캔의 가장 흔한 모양: 흰 바탕, 얇은 테두리, 안쪽은 대부분 여백색이고 인물·말풍선만 떠 있다.
 * 테두리가 얇으면 컷 안쪽의 빈 줄이 컷 사이 여백과 닮아 투영만으로는 컷이 잘게 쪼개진다 — 이 파일은 그 모양에서
 * 컷을 테두리 사각형 그대로 되찾는지, 못 나누는 경우에는 지어내지 않고 경고하는지를 고정한다.
 * 모든 그림은 코드로 만든 합성 픽셀이며 실제 스캔본 정확도를 보증하는 수치가 아니다.
 */

/** 2단 격자 만화 페이지(1200×1700): 위 단 3컷, 아래 단 2컷, 컷 사이 24px, 바깥 여백 40px. */
const PAGE: readonly PanelRect[] = [
  { x: 40, y: 40, width: 360, height: 700 },
  { x: 424, y: 40, width: 360, height: 700 },
  { x: 808, y: 40, width: 352, height: 700 },
  { x: 40, y: 764, width: 560, height: 896 },
  { x: 624, y: 764, width: 536, height: 896 },
];

/** 만화 읽기 순서(우→좌, 위→아래)로 늘어놓은 기대 컷. */
const PAGE_MANGA_ORDER: readonly PanelRect[] = [PAGE[2], PAGE[1], PAGE[0], PAGE[4], PAGE[3]];

type Mode = "sparse" | "dense";

function inkPage(frame: number, mode: Mode): FixtureImage {
  const image = new FixtureImage(1200, 1700, WHITE);
  PAGE.forEach((rect, index) => image.inkPanel(rect.x, rect.y, rect.width, rect.height, { frame, seed: index + 1, mode }));
  return image;
}

function expectExactPanels(result: PanelDetectResult, expected: readonly PanelRect[], tolerance = 1): void {
  expect(result.panels).toHaveLength(expected.length);
  expected.forEach((rect, index) => {
    const panel = result.panels[index];
    expect(rectNear(panel, rect, tolerance), `컷 ${index + 1} 기대 ${JSON.stringify(rect)} 실제 ${JSON.stringify(panel)}`).toBe(true);
  });
}

describe("컷 감지 — 흑백 만화(흰 속 컷, 얇은 테두리)", () => {
  const frames = [1, 2, 3, 4, 6, 8] as const;
  const modes: readonly Mode[] = ["sparse", "dense"];

  for (const frame of frames) {
    for (const mode of modes) {
      it(`테두리 ${frame}px · 그림 ${mode === "sparse" ? "성김" : "촘촘함"}: 컷 5개를 테두리 사각형 그대로 찾는다`, () => {
        const result = detectPanels(inkPage(frame, mode).raster(), { readingOrder: "manga" });
        expectExactPanels(result, PAGE_MANGA_ORDER);
        expect(result.undetectable).toEqual([]);
        expect(result.ignored).toEqual([]);
        expect(result.panels.every((panel) => panel.warnings.length === 0 && panel.level === "high")).toBe(true);
        expect(result.suggestions).toEqual([]);
      });
    }
  }

  it("스캔 잡티(±8)가 있어도 같은 컷을 찾는다", () => {
    const image = inkPage(3, "sparse");
    image.noise(8, 5);
    const result = detectPanels(image.raster(), { readingOrder: "manga" });
    expectExactPanels(result, PAGE_MANGA_ORDER);
    expect(result.undetectable).toEqual([]);
  });

  it("큰 이미지를 줄여서 분석해도 컷 5개를 찾고 경계 오차는 분석 배율 안이다", () => {
    const image = new FixtureImage(2400, 3400, WHITE);
    PAGE.forEach((rect, index) => image.inkPanel(rect.x * 2, rect.y * 2, rect.width * 2, rect.height * 2, { frame: 8, seed: index + 1, mode: "sparse" }));
    const result = detectPanels(image.raster(), { readingOrder: "manga", maxAnalysisPixels: 1_000_000 });
    expect(result.analysis.step).toBeGreaterThan(1);
    expectExactPanels(result, PAGE_MANGA_ORDER.map((rect) => ({ x: rect.x * 2, y: rect.y * 2, width: rect.width * 2, height: rect.height * 2 })), 4);
  });

  it("무작위 흑백 단두대 배치 24종에서 컷 개수와 테두리 경계(≤1px)를 모두 되찾는다", () => {
    let expectedTotal = 0;
    let matchedTotal = 0;
    let foundTotal = 0;
    const misses: string[] = [];
    for (let seed = 1; seed <= 24; seed += 1) {
      const random = mulberry32(seed * 7919 + 101);
      const pick = (min: number, max: number): number => min + Math.floor(random() * (max - min + 1));
      const width = pick(800, 1300);
      const height = pick(1100, 1900);
      const image = new FixtureImage(width, height, WHITE);
      const expected: PanelRect[] = [];
      let artSeed = seed;
      const split = (x: number, y: number, w: number, h: number, depth: number): void => {
        const canRows = h >= 2 * 220 + 30 && depth < 4;
        const canCols = w >= 2 * 220 + 30 && depth < 4;
        if ((depth > 0 && random() >= 0.7) || (!canRows && !canCols)) {
          artSeed += 1;
          expected.push(image.inkPanel(x, y, w, h, { frame: pick(2, 6), seed: artSeed, mode: random() < 0.5 ? "sparse" : "dense" }));
          return;
        }
        const gap = pick(18, 56);
        if (canRows && (!canCols || random() < 0.5)) {
          const first = pick(220, h - gap - 220);
          split(x, y, w, first, depth + 1);
          split(x, y + first + gap, w, h - first - gap, depth + 1);
        } else {
          const first = pick(220, w - gap - 220);
          split(x, y, first, h, depth + 1);
          split(x + first + gap, y, w - first - gap, h, depth + 1);
        }
      };
      const margin = pick(30, 70);
      split(margin, margin, width - 2 * margin, height - 2 * margin, 0);
      if (seed % 3 === 0) image.noise(8, seed);
      const result = detectPanels(image.raster(), { readingOrder: "comic" });
      expectedTotal += expected.length;
      foundTotal += result.panels.length;
      const matched = expected.filter((rect) => result.panels.some((panel) => rectNear(panel, rect, 1))).length;
      matchedTotal += matched;
      if (matched !== expected.length || result.panels.length !== expected.length) {
        misses.push(`seed ${seed}: 기대 ${expected.length} / 발견 ${result.panels.length} / 일치 ${matched}`);
      }
      expect(result.undetectable, `seed ${seed} 검출 불가 영역`).toEqual([]);
    }
    expect(misses).toEqual([]);
    expect(matchedTotal).toBe(expectedTotal);
    expect(foundTotal).toBe(expectedTotal);
  });
});

describe("컷 감지 — 테두리 속 인물만 있는 컷 한 장", () => {
  for (const mode of ["sparse", "dense"] as const) {
    it(`${mode === "sparse" ? "성긴" : "촘촘한"} 그림의 단일 컷 이미지는 쪼개지 않고 테두리 사각형 하나로 돌려준다`, () => {
      const image = new FixtureImage(440, 600, WHITE);
      const only = image.inkPanel(20, 20, 400, 560, { frame: 4, seed: 3, mode });
      const result = detectPanels(image.raster());
      expectExactPanels(result, [only], 0);
      expect(result.ignored).toEqual([]);
      expect(result.undetectable).toEqual([]);
      expect(result.panels[0].warnings).toEqual([]);
    });
  }
});

describe("컷 감지 — 페이지 테두리·가장자리 띠 안의 컷(컨테이너)", () => {
  it("페이지를 두른 바깥 테두리 안의 컷 5개를 나누고 바깥 테두리 조각은 제외 목록에 남긴다", () => {
    const image = inkPage(4, "sparse");
    image.frameRect(12, 12, 1176, 1676, 6, INK);
    const result = detectPanels(image.raster(), { readingOrder: "manga" });
    expectExactPanels(result, PAGE_MANGA_ORDER);
    expect(result.ignored.length).toBeGreaterThan(0);
    expect(result.ignored.every((fragment) => fragment.reason === "too-small")).toBe(true);
    expect(result.warnings).toContain("ignored-fragments");
  });

  it("큰 바깥 테두리 안에 컷 4개가 세로로 놓인 4컷 만화도 나눈다", () => {
    const image = new FixtureImage(500, 1600, WHITE);
    image.frameRect(10, 10, 480, 1580, 5, INK);
    const expected = [0, 1, 2, 3].map((index) => image.inkPanel(40, 40 + index * 385, 420, 355, { frame: 3, seed: index + 1, mode: "sparse" }));
    const result = detectPanels(image.raster());
    expectExactPanels(result, expected, 0);
  });

  it("스캔 가장자리의 어두운 띠가 한쪽이거나 양쪽에 있어도 컷을 나누고 띠는 제외한다", () => {
    const both = inkPage(4, "sparse");
    both.fillRect(0, 0, 14, 1700, [70, 70, 70]);
    both.fillRect(1186, 0, 14, 1700, [70, 70, 70]);
    const bothResult = detectPanels(both.raster(), { readingOrder: "manga" });
    expectExactPanels(bothResult, PAGE_MANGA_ORDER);
    expect(bothResult.ignored).toHaveLength(2);

    const left = inkPage(4, "sparse");
    left.fillRect(0, 0, 20, 1700, [70, 70, 70]);
    const leftResult = detectPanels(left.raster(), { readingOrder: "manga" });
    expectExactPanels(leftResult, PAGE_MANGA_ORDER);
    expect(leftResult.ignored).toHaveLength(1);
  });
});

describe("컷 감지 — 못 나누는 경우는 지어내지 않고 경고한다", () => {
  it("컷 사이 여백이 최소 두께보다 얇으면 한 컷으로 두되 합쳐졌을 수 있다고 경고하고, 민감도를 높이면 나눈다", () => {
    const image = new FixtureImage(1200, 800, WHITE);
    image.art(40, 40, 560, 720, { seed: 0 });
    image.art(604, 40, 556, 720, { seed: 1 });
    const normal = detectPanels(image.raster(), { readingOrder: "comic" });
    expect(normal.panels).toHaveLength(1);
    expect(normal.panels[0].warnings).toContain("merged-panels-suspected");
    expect(normal.panels[0].level).not.toBe("high");
    const fine = detectPanels(image.raster(), { readingOrder: "comic", sensitivity: "fine" });
    expect(fine.panels).toHaveLength(2);
    expect(fine.panels.every((panel) => !panel.warnings.includes("merged-panels-suspected"))).toBe(true);
  });

  it("스캔이 기울어도 여백이 어긋남보다 넓으면 컷을 나누고, 더 기울면 한 컷으로 두되 합쳐졌을 수 있다고 경고한다", () => {
    const base = new FixtureImage(900, 1300, WHITE);
    base.art(40, 40, 820, 380, { seed: 1 });
    base.art(40, 470, 390, 380, { seed: 2 });
    base.art(470, 470, 390, 380, { seed: 3 });
    base.art(40, 900, 820, 360, { seed: 4 });
    for (const degrees of [0.5, 2]) {
      const result = detectPanels(base.rotated(degrees).raster(), { readingOrder: "comic" });
      expect(result.panels, `${degrees}°`).toHaveLength(4);
      expect(result.panels.every((panel) => !panel.warnings.includes("merged-panels-suspected"))).toBe(true);
    }
    const tilted = detectPanels(base.rotated(5).raster(), { readingOrder: "comic" });
    expect(tilted.panels).toHaveLength(1);
    expect(tilted.panels[0].warnings).toContain("merged-panels-suspected");
    expect(tilted.panels[0].level).not.toBe("high");
    expect(tilted.confidence).toBeLessThan(0.75);
  });

  it("컷에 여백 없이 바로 붙은 넓은 가장자리 띠는 떼어 내지 못해 한 컷으로 두되 낮은 신뢰도와 경고를 준다", () => {
    const image = inkPage(4, "sparse");
    image.fillRect(0, 0, 40, 1700, [70, 70, 70]);
    const result = detectPanels(image.raster(), { readingOrder: "manga" });
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].level).toBe("low");
    expect(result.panels[0].warnings.length).toBeGreaterThan(0);
  });

  it("위·아래 선만 있는 열린 컷은 네 변이 막힌 직사각형이 아니라 안쪽 그림만 컷이 되고 선은 제외 조각으로 남는다", () => {
    const image = new FixtureImage(1000, 1000, WHITE);
    [0, 1].forEach((index) => {
      const y = 40 + index * 480;
      image.fillRect(40, y, 920, 3, INK);
      image.fillRect(40, y + 437, 920, 3, INK);
      image.ellipse(500, y + 220, 90, 120, [30, 30, 34]);
    });
    const result = detectPanels(image.raster());
    expect(result.panels).toHaveLength(2);
    expect(result.panels.every((panel) => panel.width < 400 && panel.height < 400)).toBe(true);
    expect(result.ignored.length).toBeGreaterThanOrEqual(4);
    expect(result.ignored.every((fragment) => fragment.reason === "too-small")).toBe(true);
  });

  it("흑백 페이지는 0.6°까지 기울어도 컷 5개를 찾고, 1° 기울면 못 나눈 채 한 컷으로 두되 합쳐졌을 수 있다고 경고한다", () => {
    const page = inkPage(4, "sparse");
    expect(detectPanels(page.rotated(0.6).raster(), { readingOrder: "manga" }).panels).toHaveLength(5);
    const tilted = detectPanels(page.rotated(1).raster(), { readingOrder: "manga" });
    expect(tilted.panels).toHaveLength(1);
    expect(tilted.panels[0].warnings).toContain("merged-panels-suspected");
    expect(tilted.panels[0].level).not.toBe("high");
  });

  it("테두리가 없는 컷 안쪽의 큰 빈 영역은 컷 사이 여백처럼 보여 둘로 나뉘고, 합치기로 고친다", () => {
    const image = new FixtureImage(700, 900, WHITE);
    image.ellipse(350, 200, 140, 70, WHITE, 3);
    image.ellipse(330, 560, 90, 170, [30, 30, 34]);
    const result = detectPanels(image.raster());
    expect(result.panels).toHaveLength(2);
    expect(result.undetectable).toEqual([]);
    const state = createPanelEditState(result);
    const merged = mergePanels(state, state.panels.map((panel) => panel.id));
    expect(merged.panels).toHaveLength(1);
    const [first, second] = [...result.panels].sort((a, b) => a.y - b.y);
    expect(merged.panels[0]).toMatchObject({
      x: Math.min(first.x, second.x),
      y: first.y,
      width: Math.max(first.x + first.width, second.x + second.width) - Math.min(first.x, second.x),
      height: second.y + second.height - first.y,
    });
  });
});
