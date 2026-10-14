import { describe, expect, it } from "vitest";

import {
  BOOK_TRIM_PRESETS,
  MM_TO_PT,
  bookPagePixelSize,
  checkBookPageElements,
  computeBookPageBoxes,
  computeSpreadMediaBox,
  findBookTrimPreset,
  resolveBookPageSide,
  validateBookTrimSpec,
  type BookTrimSpec,
} from "./studio-book-layout-model";

const shingukpan = BOOK_TRIM_PRESETS[0].spec;

describe("computeBookPageBoxes", () => {
  it("신국판 단면: Media=Bleed(158×231mm), Trim은 도련만큼 안쪽", () => {
    const boxes = computeBookPageBoxes(shingukpan, "single");
    expect(boxes.media.width).toBeCloseTo(158 * MM_TO_PT, 5);
    expect(boxes.media.height).toBeCloseTo(231 * MM_TO_PT, 5);
    expect(boxes.bleed).toEqual(boxes.media);
    expect(boxes.trim.x).toBeCloseTo(3 * MM_TO_PT, 5);
    expect(boxes.trim.width).toBeCloseTo(152 * MM_TO_PT, 5);
    expect(boxes.trim.height).toBeCloseTo(225 * MM_TO_PT, 5);
  });

  it("안전 박스: 단면은 좌우 대칭, 펼침은 제본 쪽만 gutter만큼 더 좁다", () => {
    const single = computeBookPageBoxes(shingukpan, "single");
    expect(single.safe.x).toBeCloseTo((3 + 12) * MM_TO_PT, 5);
    expect(single.safe.width).toBeCloseTo((152 - 24) * MM_TO_PT, 5);
    // 오른쪽 페이지(홀수면)의 제본은 왼쪽 — 안전 박스가 왼쪽에서 gutter만큼 더 들어간다.
    const right = computeBookPageBoxes(shingukpan, "right");
    expect(right.safe.x).toBeCloseTo((3 + 12 + 5) * MM_TO_PT, 5);
    expect(right.safe.width).toBeCloseTo((152 - 24 - 5) * MM_TO_PT, 5);
    // 왼쪽 페이지는 반대 — x는 그대로, 폭만 gutter만큼 준다(오른쪽이 좁아짐).
    const left = computeBookPageBoxes(shingukpan, "left");
    expect(left.safe.x).toBeCloseTo((3 + 12) * MM_TO_PT, 5);
    expect(left.safe.width).toBeCloseTo((152 - 24 - 5) * MM_TO_PT, 5);
  });

  it("안전 여백이 판형을 먹으면 throw 한다(음수 박스 방지)", () => {
    const bad: BookTrimSpec = { ...shingukpan, safeMarginMm: 100 };
    expect(validateBookTrimSpec(bad).length).toBeGreaterThan(0);
    expect(() => computeBookPageBoxes(bad, "single")).toThrow();
  });
});

describe("computeSpreadMediaBox / 프리셋", () => {
  it("스프레드 폭 = 재단×2 + 도련×2", () => {
    const spread = computeSpreadMediaBox(shingukpan);
    expect(spread.width).toBeCloseTo((152 * 2 + 6) * MM_TO_PT, 5);
    expect(spread.height).toBeCloseTo(231 * MM_TO_PT, 5);
  });

  it("프리셋 3종이 모두 유효하고 id로 찾힌다", () => {
    expect(BOOK_TRIM_PRESETS.map((p) => p.id)).toEqual(["shingukpan", "b6", "a5"]);
    for (const preset of BOOK_TRIM_PRESETS) {
      expect(validateBookTrimSpec(preset.spec)).toEqual([]);
      expect(findBookTrimPreset(preset.id)).toBe(preset);
    }
    expect(findBookTrimPreset("nope")).toBeUndefined();
  });
});

describe("resolveBookPageSide / bookPagePixelSize", () => {
  it("첫 페이지 right면 홀수 인덱스가 right로 번갈린다", () => {
    expect(resolveBookPageSide(0)).toBe("right");
    expect(resolveBookPageSide(1)).toBe("left");
    expect(resolveBookPageSide(2)).toBe("right");
    expect(resolveBookPageSide(0, "left")).toBe("left");
  });

  it("300dpi 신국판 렌더 크기 = 도련 포함 mm를 dpi로 환산", () => {
    expect(bookPagePixelSize(shingukpan, 300)).toEqual({
      width: Math.round((158 * 300) / 25.4),
      height: Math.round((231 * 300) / 25.4),
    });
    expect(() => bookPagePixelSize(shingukpan, 10)).toThrow();
  });
});

describe("checkBookPageElements", () => {
  it("안전 영역 안의 말풍선은 경고가 없다", () => {
    const warnings = checkBookPageElements(shingukpan, "single", [
      { id: "b1", kind: "balloon", rect: { x: 20, y: 20, width: 60, height: 30 } },
    ]);
    expect(warnings).toEqual([]);
  });

  it("안전 영역을 벗어난 말풍선은 outside-safe + 벗어난 양(mm)", () => {
    const warnings = checkBookPageElements(shingukpan, "single", [
      { id: "b1", label: "첫 대사", kind: "balloon", rect: { x: 5, y: 20, width: 60, height: 30 } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("outside-safe");
    expect(warnings[0].overflowMm).toBe(7); // 안전 왼쪽 12mm - x 5mm
    expect(warnings[0].message).toContain("첫 대사");
  });

  it("오른쪽 페이지에서는 제본 쪽(왼쪽) 안전 경계가 gutter만큼 안쪽이다", () => {
    const warnings = checkBookPageElements(shingukpan, "right", [
      { id: "t1", kind: "text", rect: { x: 14, y: 20, width: 40, height: 10 } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].overflowMm).toBe(3); // 안전 왼쪽 17mm - x 14mm
  });

  it("재단 밖에 완전히 나가면 outside-trim", () => {
    const warnings = checkBookPageElements(shingukpan, "single", [
      { id: "x1", kind: "text", rect: { x: 200, y: 20, width: 30, height: 10 } },
    ]);
    expect(warnings[0].code).toBe("outside-trim");
  });

  it("배경 그림: 도련 끝까지 닿으면 무경고, 재단에만 닿으면 bleed-gap", () => {
    expect(
      checkBookPageElements(shingukpan, "single", [
        { id: "bg", kind: "art", rect: { x: -3, y: -3, width: 158, height: 231 } },
      ])
    ).toEqual([]);
    const warnings = checkBookPageElements(shingukpan, "single", [
      { id: "bg", kind: "art", rect: { x: 0, y: 0, width: 152, height: 225 } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("bleed-gap");
    expect(warnings[0].overflowMm).toBe(3);
  });
});
