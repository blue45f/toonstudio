import { describe, expect, it } from "vitest";

import {
  A5_PORTRAIT_BOOK_PRESET,
  BOOK_BINDING_PRESETS,
  DEFAULT_BOOK_FOLIO,
  bookFolioTextWidthPt,
  findBookBindingPreset,
  fitBoxInside,
  formatBookFolioText,
  placeBookFolio,
} from "./studio-book-binding";
import { computeBookPageBoxes, findBookTrimPreset, validateBookTrimSpec } from "./studio-book-layout-model";

function a5Spec() {
  const preset = findBookTrimPreset("a5");
  if (!preset) throw new Error("a5 preset missing");
  return preset.spec;
}

describe("A5 세로 제본 책 프리셋", () => {
  it("기존 A5 판형 프리셋을 가리키고, 여백 안에 맞춤·쪽 번호·표지를 함께 켠다", () => {
    expect(BOOK_BINDING_PRESETS).toEqual([A5_PORTRAIT_BOOK_PRESET]);
    expect(findBookBindingPreset("a5-portrait-book")).toBe(A5_PORTRAIT_BOOK_PRESET);
    expect(findBookBindingPreset("nope")).toBeUndefined();
    expect(A5_PORTRAIT_BOOK_PRESET).toMatchObject({
      trimPresetId: "a5",
      placement: "inside-safe",
      folio: true,
      cover: true,
      cropMarks: true,
      dpi: 300,
    });
    const trim = findBookTrimPreset(A5_PORTRAIT_BOOK_PRESET.trimPresetId);
    expect(trim?.spec).toMatchObject({ trimWidthMm: 148, trimHeightMm: 210 });
    expect(validateBookTrimSpec(a5Spec())).toEqual([]);
  });

  it("세로 제본 여백: 안쪽(제본) 여백이 바깥·위아래보다 크다", () => {
    const right = computeBookPageBoxes(a5Spec(), "right");
    const left = computeBookPageBoxes(a5Spec(), "left");
    const mm = 72 / 25.4;
    const spec = a5Spec();
    const innerRight = right.safe.x - right.trim.x;
    const outerRight = right.trim.x + right.trim.width - (right.safe.x + right.safe.width);
    expect(innerRight / mm).toBeCloseTo(spec.safeMarginMm + spec.gutterMm, 5);
    expect(outerRight / mm).toBeCloseTo(spec.safeMarginMm, 5);
    expect(innerRight).toBeGreaterThan(outerRight);
    // 왼쪽 면은 제본이 오른쪽이라 반대로 뒤집힌다.
    const innerLeft = left.trim.x + left.trim.width - (left.safe.x + left.safe.width);
    expect(innerLeft / mm).toBeCloseTo(spec.safeMarginMm + spec.gutterMm, 5);
  });
});

describe("쪽 번호", () => {
  it("숫자 서식: 기본은 숫자만, 대시 서식은 앞뒤에 - 를 붙인다", () => {
    expect(formatBookFolioText(7, "arabic")).toBe("7");
    expect(formatBookFolioText(7, "arabic-dash")).toBe("- 7 -");
    expect(formatBookFolioText(12.9, "arabic")).toBe("12");
  });

  it("Helvetica 글자 폭으로 너비를 계산한다", () => {
    expect(bookFolioTextWidthPt("12", 10)).toBeCloseTo(11.12, 5);
    expect(bookFolioTextWidthPt("- 7 -", 10)).toBeCloseTo(17.78, 5);
  });

  it("바깥쪽 아래: 오른쪽 면은 오른쪽 끝에, 왼쪽 면은 왼쪽 끝에 붙고 아래 여백 띠 안에 놓인다", () => {
    const spec = a5Spec();
    const right = computeBookPageBoxes(spec, "right");
    const left = computeBookPageBoxes(spec, "left");
    const onRight = placeBookFolio(right, "right", 12, DEFAULT_BOOK_FOLIO);
    const onLeft = placeBookFolio(left, "left", 13, DEFAULT_BOOK_FOLIO);
    const width = bookFolioTextWidthPt("12", DEFAULT_BOOK_FOLIO.fontSizePt);
    expect(onRight.x + width).toBeCloseTo(right.safe.x + right.safe.width, 5);
    expect(onLeft.x).toBeCloseTo(left.safe.x, 5);
    for (const [place, boxes] of [[onRight, right], [onLeft, left]] as const) {
      // 글자 아랫선은 재단선 위, 글자 윗선은 안전 영역(본문) 아래다.
      expect(place.y).toBeGreaterThan(boxes.trim.y);
      expect(place.y + DEFAULT_BOOK_FOLIO.fontSizePt * 0.72).toBeLessThan(boxes.safe.y);
    }
  });

  it("아래 가운데: 안전 영역 가운데에 놓인다. 재단 마크 여유로 박스가 옮겨져도 같은 상대 위치다", () => {
    const spec = a5Spec();
    const base = computeBookPageBoxes(spec, "right");
    const shift = 7 * (72 / 25.4);
    const moved = {
      ...base,
      trim: { ...base.trim, x: base.trim.x + shift, y: base.trim.y + shift },
      safe: { ...base.safe, x: base.safe.x + shift, y: base.safe.y + shift },
    };
    const options = { ...DEFAULT_BOOK_FOLIO, anchor: "bottom-center" as const };
    const a = placeBookFolio(base, "right", 5, options);
    const b = placeBookFolio(moved, "right", 5, options);
    const width = bookFolioTextWidthPt("5", options.fontSizePt);
    expect(a.x + width / 2).toBeCloseTo(base.safe.x + base.safe.width / 2, 5);
    expect(b.x - a.x).toBeCloseTo(shift, 5);
    expect(b.y - a.y).toBeCloseTo(shift, 5);
  });
});

describe("fitBoxInside — 비율을 지켜 안전 영역 안에 맞춘다", () => {
  const area = { x: 100, y: 200, width: 300, height: 400 };

  it("가로로 넓은 원고는 폭에 맞추고 위아래 가운데에 놓는다", () => {
    const box = fitBoxInside(area, 800, 400);
    expect(box.width).toBeCloseTo(300, 5);
    expect(box.height).toBeCloseTo(150, 5);
    expect(box.x).toBeCloseTo(100, 5);
    expect(box.y).toBeCloseTo(200 + (400 - 150) / 2, 5);
  });

  it("세로로 좁고 긴 원고는 높이에 맞추고 좌우 가운데에 놓는다", () => {
    const box = fitBoxInside(area, 690, 12000);
    expect(box.height).toBeCloseTo(400, 5);
    expect(box.width).toBeCloseTo((690 / 12000) * 400, 5);
    expect(box.x).toBeCloseTo(100 + (300 - box.width) / 2, 5);
  });

  it("어떤 비율이든 영역 밖으로 나가지 않고 비율이 유지된다", () => {
    for (const [w, h] of [[100, 100], [3, 900], [900, 3], [1819, 2551], [5, 5]] as const) {
      const box = fitBoxInside(area, w, h);
      expect(box.x).toBeGreaterThanOrEqual(area.x - 1e-9);
      expect(box.y).toBeGreaterThanOrEqual(area.y - 1e-9);
      expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 1e-9);
      expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 1e-9);
      expect(box.width / box.height).toBeCloseTo(w / h, 6);
    }
  });
});
