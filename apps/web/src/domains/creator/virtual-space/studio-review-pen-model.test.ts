import { describe, expect, it } from "vitest";
import {
  normalizeStudioReviewPenStroke,
  parseStudioReviewPenStrokes,
  serializeStudioReviewPenStrokes,
  studioReviewPenStrokeBounds,
  STUDIO_REVIEW_PEN_DEFAULT_COLOR,
} from "./studio-review-pen-model";

const page = { width: 1000, height: 1400 };

describe("studio-review-pen-model", () => {
  it("두 점 이상이면 스트로크를 만들고 페이지를 벗어난 점을 클램프한다", () => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "s1", points: [{ x: -10, y: 20 }, { x: 2000, y: 1600 }], color: "#e5484d" },
      page,
    );
    expect(stroke).not.toBeNull();
    expect(stroke?.points[0]).toEqual({ x: 0, y: 20 });
    expect(stroke?.points[1]).toEqual({ x: 1000, y: 1400 });
    expect(stroke?.color).toBe("#e5484d");
  });

  it("점이 하나뿐이면 null 을 반환한다", () => {
    expect(normalizeStudioReviewPenStroke({ id: "s1", points: [{ x: 10, y: 10 }] }, page)).toBeNull();
  });

  it("허용되지 않은 색은 기본 빨간펜으로 보정한다", () => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "s1", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "not-a-color" },
      page,
    );
    expect(stroke?.color).toBe(STUDIO_REVIEW_PEN_DEFAULT_COLOR);
  });

  it.each([
    { size: { width: 800, height: 16000 }, expectedWidth: 3.2 },
    { size: { width: 16000, height: 800 }, expectedWidth: 3.2 },
    { size: page, expectedWidth: 4 },
  ])("새 획 기본 굵기는 긴 원고에서도 짧은 변을 기준으로 한다: %j", ({ size, expectedWidth }) => {
    const points = [{ x: 10, y: 10 }, { x: 20, y: 20 }];
    const stroke = normalizeStudioReviewPenStroke({ id: "new-stroke", points }, size);
    expect(stroke?.width).toBe(expectedWidth);
    expect(stroke?.points).toEqual(points);
  });

  it.each([64, 0.125])("명시한 굵기 %s는 긴 원고의 새 기본값으로 다시 계산하지 않는다", (width) => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "explicit-width", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], width },
      { width: 800, height: 16000 },
    );
    expect(stroke?.width).toBe(width);
  });

  it("기존 75점 획의 굵기·좌표·색·ID는 정규화와 저장 왕복에서 정확히 보존한다", () => {
    const stored = { id: "stored-long-page", width: 64, color: "#2563eb",
      points: Array.from({ length: 75 }, (_, index) => ({ x: 100 + index * 3, y: 200 + index * 20 })) };
    expect(normalizeStudioReviewPenStroke(stored, { width: 800, height: 16000 })).toEqual(stored);
    const serialized = JSON.stringify(serializeStudioReviewPenStrokes([stored]));
    expect(parseStudioReviewPenStrokes(JSON.parse(serialized))).toEqual([stored]);
    expect(stored.points).toHaveLength(75);
  });

  it("바운딩 박스를 구하고 최소 크기를 보장한다", () => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "s1", points: [{ x: 100, y: 200 }, { x: 300, y: 500 }] },
      page,
    );
    const bounds = studioReviewPenStrokeBounds(stroke ? [stroke] : []);
    expect(bounds).toEqual({ x: 100, y: 200, width: 200, height: 300 });
  });

  it("수직선도 region 앵커용 최소 너비를 가진다", () => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "s1", points: [{ x: 100, y: 200 }, { x: 100, y: 500 }] },
      page,
    );
    const bounds = studioReviewPenStrokeBounds(stroke ? [stroke] : []);
    expect(bounds?.width).toBeGreaterThanOrEqual(1);
    expect(bounds?.height).toBe(300);
  });

  it("스트로크가 없으면 바운딩 박스는 null 이다", () => {
    expect(studioReviewPenStrokeBounds([])).toBeNull();
  });

  it("직렬화·파싱이 왕복한다", () => {
    const stroke = normalizeStudioReviewPenStroke(
      { id: "s1", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "#2563eb", width: 5 },
      page,
    );
    const json = JSON.stringify(serializeStudioReviewPenStrokes(stroke ? [stroke] : []));
    const parsed = parseStudioReviewPenStrokes(JSON.parse(json));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].color).toBe("#2563eb");
    expect(parsed[0].points).toHaveLength(2);
  });

  it("파싱은 오염된 값을 방어적으로 버린다", () => {
    expect(parseStudioReviewPenStrokes(null)).toEqual([]);
    expect(parseStudioReviewPenStrokes([{ id: "s1" }])).toEqual([]);
    expect(parseStudioReviewPenStrokes([{ id: "s1", points: [{ x: NaN, y: 1 }, { x: 2, y: 2 }] }])).toEqual([]);
    expect(parseStudioReviewPenStrokes([{ id: "s1", points: [{ x: 1, y: 1 }] }])).toEqual([]);
  });
});
