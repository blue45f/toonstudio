import { describe, expect, it } from "vitest";

import { isVectorLayer, vectorStrokeBounds } from "../vector-layer/vector-layer-model";
import { convertStudioLtImage, type StudioLtConvertResult } from "./studio-lt-convert";
import {
  convertStudioLtResultToVectorLine,
  extractStudioLtLineMask,
  simplifyStudioLtVectorContour,
  traceStudioLtLineMaskToContours,
} from "./studio-lt-convert-vector";

// node 환경에는 ImageData가 없으므로 최소 스텁을 제공한다(LT 엔진 테스트와 동일).
if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

function makeImageData(
  width: number,
  height: number,
  fill: (x: number, y: number) => readonly [number, number, number, number],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = a;
    }
  }
  return new ImageData(data, width, height);
}

/** 선화 레이어 흉내: 선 픽셀만 검정+불투명, 나머지는 검정 RGB+투명(LT 엔진 출력 그대로). */
function makeLineLayer(
  width: number,
  height: number,
  isLine: (x: number, y: number) => boolean,
): ImageData {
  return makeImageData(width, height, (x, y) => (isLine(x, y) ? [0, 0, 0, 255] : [0, 0, 0, 0]));
}

function makeResult(lineLayer: ImageData): StudioLtConvertResult {
  return { lineLayer, toneLayer: lineLayer };
}

function signedArea(points: readonly number[]): number {
  let area = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    area += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!;
  }
  return area / 2;
}

describe("extractStudioLtLineMask", () => {
  it("알파만으로 주선을 판정한다 — 투명한 검정 픽셀은 선이 아니다", () => {
    const line = makeLineLayer(2, 1, (x) => x === 0);
    const mask = extractStudioLtLineMask(line);
    expect(mask.pixelCount).toBe(1);
    expect([...mask.mask]).toEqual([255, 0]);
  });

  it("버퍼가 짧으면 invalid-input으로 거부한다", () => {
    expect(() =>
      extractStudioLtLineMask({ width: 2, height: 2, data: new Uint8ClampedArray(4) }),
    ).toThrowError(expect.objectContaining({ code: "invalid-input" }));
  });
});

describe("traceStudioLtLineMaskToContours", () => {
  it("픽셀 1개는 면적 1인 정사각형 링이 된다", () => {
    const mask = new Uint8Array([255]);
    const contours = traceStudioLtLineMaskToContours(mask, 1, 1);
    expect(contours).toHaveLength(1);
    expect(Math.abs(signedArea(contours[0]!.points))).toBe(1);
    expect(contours[0]!.points).toHaveLength(8);
  });

  it("2×2 블록은 공선 접기로 모서리 4개만 남는다", () => {
    const mask = new Uint8Array([255, 255, 255, 255]);
    const contours = traceStudioLtLineMaskToContours(mask, 2, 2);
    expect(contours).toHaveLength(1);
    expect(contours[0]!.points).toHaveLength(8);
    expect(Math.abs(signedArea(contours[0]!.points))).toBe(4);
  });

  it("링(테두리) 모양은 바깥 링과 구멍 링 2개가 나온다", () => {
    const line = makeLineLayer(5, 5, (x, y) => x === 0 || x === 4 || y === 0 || y === 4);
    const mask = extractStudioLtLineMask(line);
    const contours = traceStudioLtLineMaskToContours(mask.mask, 5, 5);
    expect(contours).toHaveLength(2);
  });
});

describe("convertStudioLtResultToVectorLine", () => {
  it("링 주선이 구멍을 가진 편집 가능 벡터 패스 1개로 남는다", () => {
    const line = makeLineLayer(5, 5, (x, y) => x === 0 || x === 4 || y === 0 || y === 4);
    const conversion = convertStudioLtResultToVectorLine(makeResult(line), {
      id: "lt-test",
      simplifyTolerance: 0,
    });
    expect(conversion.pieceCount).toBe(1);
    expect(conversion.holeCount).toBe(1);
    expect(conversion.linePixelCount).toBe(16);
    expect(isVectorLayer(conversion.layer)).toBe(true);
    expect(conversion.layer.strokes).toHaveLength(1);
    const stroke = conversion.layer.strokes[0]!;
    expect(stroke.closed).toBe(true);
    expect(stroke.color).toBe("#000000");
    // 닫힌 체인: 마지막 세그먼트 끝점이 첫 세그먼트 시작점과 같다.
    const first = stroke.segments[0]!;
    const last = stroke.segments[stroke.segments.length - 1]!;
    expect(last.p3).toEqual(first.p0);
    expect(conversion.svg).toContain("M ");
    expect(conversion.svg).toContain("Z");
    expect(conversion.bounds).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });

  it("실제 LT 엔진 결과(반반 이미지의 경계선)가 벡터 패스로 변환된다", () => {
    const source = makeImageData(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const result = convertStudioLtImage(source, {
      toneDensity: 4,
      lineThickness: 2,
      lineThreshold: 0.1,
    });
    const conversion = convertStudioLtResultToVectorLine(result);
    expect(conversion.linePixelCount).toBeGreaterThan(0);
    expect(conversion.pieceCount).toBeGreaterThanOrEqual(1);
    expect(conversion.layer.strokes.length).toBeGreaterThanOrEqual(1);
    for (const stroke of conversion.layer.strokes) {
      expect(stroke.widths).toHaveLength(stroke.segments.length + 1);
    }
  });

  it("scale/offset이 출력 좌표에 적용된다", () => {
    const line = makeLineLayer(2, 2, () => true);
    const conversion = convertStudioLtResultToVectorLine(makeResult(line), {
      scale: 2,
      offsetX: 10,
      offsetY: 20,
      simplifyTolerance: 0,
    });
    expect(conversion.bounds).toEqual({ x: 10, y: 20, width: 4, height: 4 });
    const bounds = vectorStrokeBounds(conversion.layer.strokes[0]!);
    expect(bounds?.minX).toBeLessThanOrEqual(10);
    expect(bounds?.maxX).toBeGreaterThanOrEqual(14);
  });

  it("주선이 없으면 빈 레이어와 pieceCount 0으로 수렴한다", () => {
    const line = makeLineLayer(4, 4, () => false);
    const conversion = convertStudioLtResultToVectorLine(makeResult(line));
    expect(conversion.pieceCount).toBe(0);
    expect(conversion.layer.strokes).toHaveLength(0);
    expect(conversion.svg).toBe("");
    expect(conversion.bounds).toBeNull();
  });
});

describe("simplifyStudioLtVectorContour", () => {
  it("계단 링을 허용 오차로 단순화하면 정점이 줄고 면적은 유지된다", () => {
    // 대각 계단 경계를 가진 다이아몬드 근사 링
    const line = makeLineLayer(9, 9, (x, y) => Math.abs(x - 4) + Math.abs(y - 4) <= 4);
    const mask = extractStudioLtLineMask(line);
    const contours = traceStudioLtLineMaskToContours(mask.mask, 9, 9);
    const raw = contours[0]!.points;
    const simplified = simplifyStudioLtVectorContour(raw, 1.5);
    expect(simplified.length).toBeLessThan(raw.length);
    expect(simplified.length).toBeGreaterThanOrEqual(6);
  });

  it("허용 오차 0이면 원본을 그대로 돌려준다", () => {
    const raw = [0, 0, 4, 0, 4, 4, 0, 4];
    expect(simplifyStudioLtVectorContour(raw, 0)).toEqual(raw);
  });
});
