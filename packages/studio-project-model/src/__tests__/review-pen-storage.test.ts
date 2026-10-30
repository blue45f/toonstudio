import { describe, expect, it } from "vitest";

import { reviewPenNumberStorageByteLength, reviewPenStrokesStorageByteLength } from "../graph/review-pen-storage";
import { reviewPenStrokesSchema, STUDIO_REVIEW_PEN_MAX_JSON_BYTES, type ReviewPenStroke } from "../index";

function fullStrokes(point: (flatIndex: number) => { x: number; y: number }): ReviewPenStroke[] {
  return Array.from({ length: 50 }, (_, stroke) => ({ id: `pen-${stroke}`, color: "#e5484d", width: 4,
    points: Array.from({ length: 500 }, (_, index) => point(stroke * 500 + index)) }));
}

describe("펜 첨삭의 PostgreSQL JSONB 저장 표현 예산", () => {
  it.each([
    [0, 1], [-0, 1], [0.1, 3], [1e-6, 8], [1e-7, 9], [-1e-7, 10],
    [1.23e-7, 11], [1e20, 21], [1e21, 22], [Number.MIN_VALUE, 326], [Number.MAX_VALUE, 309],
  ])("최단 숫자 %s의 지수 확장 길이는 %s바이트다", (value, bytes) => {
    expect(reviewPenNumberStorageByteLength(value)).toBe(bytes);
  });

  it("유한하지 않은 숫자를 JSON null의 짧은 길이로 오인하지 않는다", () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(reviewPenNumberStorageByteLength(value)).toBe(Infinity);
  });

  it("빈 배열과 JSONB의 object·array 구분 공백을 정확히 센다", () => {
    expect(reviewPenStrokesStorageByteLength([])).toBe(2);
    const strokes = [{ id: "s", color: "#e5484d", width: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }];
    const stored = '[{"id": "s", "color": "#e5484d", "width": 1, "points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}]}]';
    expect(reviewPenStrokesStorageByteLength(strokes)).toBe(new TextEncoder().encode(stored).byteLength);
  });

  it("실제 read-only PostgreSQL에서 확인한 극소 좌표 50×500점의 길이와 일치하고 미리 거절한다", () => {
    const strokes = fullStrokes((index) => ({ x: index % 2 === 0 ? Number.MIN_VALUE : 10,
      y: index % 2 === 0 ? Number.MIN_VALUE : 10 }));
    // 2026-10-29 격리 DB probe의 JS/PG 실측값이다. 쓰기나 DB 연결 없이 같은 fixture를 확인한다.
    expect(new TextEncoder().encode(JSON.stringify(strokes)).byteLength).toBe(502_741);
    expect(reviewPenStrokesStorageByteLength(strokes)).toBe(8_603_090);
    const result = reviewPenStrokesSchema.safeParse(strokes);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("JSONB 저장 표현"))).toBe(true);
  });

  it("일반 50획·25,000점과 단일 최소 양수는 값이나 개수를 바꾸지 않고 보존한다", () => {
    const normal = fullStrokes(() => ({ x: 10, y: 10 }));
    expect(reviewPenStrokesStorageByteLength(normal)).toBe(503_090);
    expect(reviewPenStrokesSchema.parse(normal)).toEqual(normal);
    const minimum = [{ id: "minimum", color: "#e5484d", width: Number.MIN_VALUE,
      points: [{ x: Number.MIN_VALUE, y: Number.MIN_VALUE }, { x: 10, y: 10 }] }];
    expect(reviewPenStrokesSchema.parse(minimum)).toEqual(minimum);
  });

  it("같은 2 MiB 정확 경계는 보존하고 1바이트 초과만 거절한다", () => {
    const atLimit = fullStrokes((index) => ({ x: index < 4_919 ? Number.MIN_VALUE : 10, y: 10 }))
      .map((stroke, index) => index < 6 ? { ...stroke, id: `${stroke.id}${"x".repeat(51)}` } : stroke);
    // 기본 503090 + 지수 확장 4919×324 + ID 6×51 = 2097152. ID도 모두 64자 이하다.
    expect(reviewPenStrokesStorageByteLength(atLimit)).toBe(STUDIO_REVIEW_PEN_MAX_JSON_BYTES);
    expect(reviewPenStrokesSchema.safeParse(atLimit).success).toBe(true);
    const overLimit = atLimit.map((stroke, index) => index === 0 ? { ...stroke, id: `${stroke.id}x` } : stroke);
    expect(reviewPenStrokesStorageByteLength(overLimit)).toBe(STUDIO_REVIEW_PEN_MAX_JSON_BYTES + 1);
    expect(reviewPenStrokesSchema.safeParse(overLimit).success).toBe(false);
  });
});
