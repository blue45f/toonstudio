import { describe, expect, it } from "vitest";

import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping, reviewPenStrokeSchema,
  reviewPenStrokesSchema, STUDIO_REVIEW_PEN_MAX_JSON_BYTES, validateStudioReviewPenStrokes,
  type ReviewPenStroke } from "../index";

const mapping = deriveStudioReviewPageMapping({ width: 720, pagesList: [{ id: "page-one", canvasH: 1080, elements: [] }] },
  { sourceServerRevision: 3, sourceContentDigest: "a".repeat(64), ordinal: 0, renderWidth: 1440, renderHeight: 2160 });
const region = () => {
  const value = createStudioReviewSpatialAnchor(mapping, { kind: "region", x: 10, y: 20, width: 100, height: 100 });
  if (!value) throw new Error("검증용 source 영역이 유효해야 합니다.");
  return value;
};
const firstPoint = { x: 10, y: 20 };
const stroke: ReviewPenStroke = { id: "pen-one", points: [firstPoint, { x: 110, y: 120 }], color: "#e5484d", width: 4 };

describe("고정 원고 펜 첨삭 계약", () => {
  it("페이지 해상도를 바꾸지 않고 원본 좌표·색·굵기를 보존한다", () => {
    expect(reviewPenStrokesSchema.parse([stroke])).toEqual([stroke]);
    expect(validateStudioReviewPenStrokes(mapping, region(), [stroke])).toBe(true);
    expect(validateStudioReviewPenStrokes({ status: "unmapped", reason: "legacy-review" }, { kind: "artifact" }, [])).toBe(true);
  });
  it.each([
    { ...stroke, id: "" }, { ...stroke, id: "x".repeat(65) },
    { ...stroke, points: [{ x: 10, y: 20 }] },
    { ...stroke, points: [{ x: -1, y: 20 }, { x: 10, y: 30 }] },
    { ...stroke, points: [{ x: NaN, y: 20 }, { x: 10, y: 30 }] },
    { ...stroke, points: [{ x: 10, y: Infinity }, { x: 10, y: 30 }] },
    { ...stroke, color: "url(https://external.invalid/image)" }, { ...stroke, color: "red" },
    { ...stroke, width: 0 }, { ...stroke, width: Infinity },
    { ...stroke, url: "https://external.invalid" },
  ])("부정확하거나 실행 가능한 표현을 받은 획을 거절한다 %#", (value) => {
    expect(reviewPenStrokeSchema.safeParse(value).success).toBe(false);
  });
  it("한도 전체를 보존하고 중복 ID와 과도한 배열을 거절한다", () => {
    const full = Array.from({ length: 50 }, (_, id) => ({ ...stroke, id: `pen-${id}`,
      points: Array.from({ length: 500 }, (_, point) => ({ x: 10 + point / 5, y: 20 + point / 5 })) }));
    expect(reviewPenStrokesSchema.parse(full)).toEqual(full);
    expect(new TextEncoder().encode(JSON.stringify(full)).byteLength).toBeLessThan(STUDIO_REVIEW_PEN_MAX_JSON_BYTES);
    expect(validateStudioReviewPenStrokes(mapping, region(), full)).toBe(true);
    expect(reviewPenStrokesSchema.safeParse([...full, { ...stroke, id: "overflow" }]).success).toBe(false);
    const first = full[0];
    if (!first) throw new Error("전체 한도 fixture가 필요합니다.");
    expect(reviewPenStrokeSchema.safeParse({ ...stroke, points: [...first.points, { x: 0, y: 0 }] }).success).toBe(false);
    expect(reviewPenStrokesSchema.safeParse([stroke, stroke]).success).toBe(false);
  });
  it("정본 페이지·revision·영역과 다른 획을 거절한다", () => {
    const anchor = region();
    expect(validateStudioReviewPenStrokes(mapping, { ...anchor, source: { ...anchor.source, pageId: "page-two" } }, [stroke])).toBe(false);
    expect(validateStudioReviewPenStrokes(mapping, { ...anchor, source: { ...anchor.source, sourceServerRevision: 4 } }, [stroke])).toBe(false);
    expect(validateStudioReviewPenStrokes(mapping, { ...anchor, source: undefined }, [stroke])).toBe(false);
    expect(validateStudioReviewPenStrokes(mapping, { kind: "artifact" }, [stroke])).toBe(false);
    expect(validateStudioReviewPenStrokes({ status: "unmapped", reason: "source-unavailable" }, anchor, [stroke])).toBe(false);
    for (const point of [{ x: 111, y: 120 }, { x: 720.1, y: 20 }, { x: 10, y: 1080.1 }]) {
      expect(validateStudioReviewPenStrokes(mapping, anchor, [{ ...stroke, points: [firstPoint, point] }])).toBe(false);
    }
    expect(validateStudioReviewPenStrokes(mapping, anchor, [{ ...stroke, width: 1081 }])).toBe(false);
  });
  it("영역의 부동소수점 합산 오차만 허용하고 실제 좌표 이동은 거절한다", () => {
    const anchor = { ...region(), x: .1, y: .1, width: .2, height: .2 };
    const fractional = { ...stroke, points: [{ x: .1, y: .1 }, { x: .30000000000000004, y: .3 }] };
    expect(validateStudioReviewPenStrokes(mapping, anchor, [fractional])).toBe(true);
    expect(validateStudioReviewPenStrokes(mapping, anchor, [{ ...stroke, points: [{ x: .1, y: .1 }, { x: .30001, y: .3 }] }])).toBe(false);
  });
});
