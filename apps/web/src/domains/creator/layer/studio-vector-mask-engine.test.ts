import { describe, expect, it } from "vitest";

import {
  applyVectorMaskToRgba,
  computeVectorMaskBounds,
  createEllipseVectorMaskSubpath,
  createRectVectorMaskSubpath,
  createVectorMask,
  deserializeVectorMaskFromPsd,
  deserializeVectorMaskFromVmskBinary,
  evaluateVectorMaskAtPoint,
  flattenVectorMaskSubpath,
  rasterizeVectorMaskForViewport,
  serializeVectorMaskToPsdVmsk,
} from "./studio-vector-mask-engine";

describe("studio-vector-mask-engine", () => {
  it("union / subtract / intersect / exclude 4종 불리언 서브패스를 정확히 평가한다", () => {
    const leftRect = createRectVectorMaskSubpath({
      id: "left",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      operation: "union",
    });

    // 1. union: 두 사각형 합집합
    const unionMask = createVectorMask({
      id: "m-union",
      subpaths: [
        leftRect,
        createRectVectorMaskSubpath({
          id: "right",
          x: 30,
          y: 10,
          width: 40,
          height: 40,
          operation: "union",
        }),
      ],
    });
    expect(evaluateVectorMaskAtPoint(unionMask, 20, 30)).toBe(1);
    expect(evaluateVectorMaskAtPoint(unionMask, 40, 30)).toBe(1);
    expect(evaluateVectorMaskAtPoint(unionMask, 60, 30)).toBe(1);
    expect(evaluateVectorMaskAtPoint(unionMask, 85, 30)).toBe(0);

    // 2. subtract: 가운데 원형 구멍 뚫기
    const subtractMask = createVectorMask({
      id: "m-sub",
      subpaths: [
        leftRect,
        createEllipseVectorMaskSubpath({
          id: "hole",
          cx: 30,
          cy: 30,
          rx: 10,
          ry: 10,
          operation: "subtract",
        }),
      ],
    });
    expect(evaluateVectorMaskAtPoint(subtractMask, 30, 30)).toBe(0);
    expect(evaluateVectorMaskAtPoint(subtractMask, 14, 14)).toBe(1);

    // 3. intersect: 겹치는 영역 [30..50, 10..50]만 보존
    const intersectMask = createVectorMask({
      id: "m-inter",
      subpaths: [
        leftRect,
        createRectVectorMaskSubpath({
          id: "right",
          x: 30,
          y: 10,
          width: 40,
          height: 40,
          operation: "intersect",
        }),
      ],
    });
    expect(evaluateVectorMaskAtPoint(intersectMask, 40, 30)).toBe(1);
    expect(evaluateVectorMaskAtPoint(intersectMask, 20, 30)).toBe(0);
    expect(evaluateVectorMaskAtPoint(intersectMask, 60, 30)).toBe(0);

    // 4. exclude (XOR): 겹치는 영역만 빠지고 양쪽 비중첩 영역만 표시
    const excludeMask = createVectorMask({
      id: "m-xor",
      subpaths: [
        leftRect,
        createRectVectorMaskSubpath({
          id: "right",
          x: 30,
          y: 10,
          width: 40,
          height: 40,
          operation: "exclude",
        }),
      ],
    });
    expect(evaluateVectorMaskAtPoint(excludeMask, 20, 30)).toBe(1);
    expect(evaluateVectorMaskAtPoint(excludeMask, 40, 30)).toBe(0);
    expect(evaluateVectorMaskAtPoint(excludeMask, 60, 30)).toBe(1);
  });

  it("비파괴 featherPx · density01 · invert가 SDF 커버리지에 정확히 반영된다", () => {
    const circle = createEllipseVectorMaskSubpath({
      id: "c1",
      cx: 50,
      cy: 50,
      rx: 20,
      ry: 20,
    });

    // 페더 10px: 반경 정확히 20 지점 경계에서 0.5, 중심(50,50)에서 1, 바깥(85,50)에서 0
    const feathered = createVectorMask({ id: "m-f", subpaths: [circle], featherPx: 10 });
    expect(evaluateVectorMaskAtPoint(feathered, 50, 50)).toBe(1);
    expect(evaluateVectorMaskAtPoint(feathered, 70, 50)).toBeCloseTo(0.5, 2);
    expect(evaluateVectorMaskAtPoint(feathered, 85, 50)).toBe(0);

    // invert: 내부가 0, 외부가 1
    const inverted = createVectorMask({ id: "m-inv", subpaths: [circle], invert: true });
    expect(evaluateVectorMaskAtPoint(inverted, 50, 50)).toBe(0);
    expect(evaluateVectorMaskAtPoint(inverted, 5, 5)).toBe(1);

    // density01 = 0.4: 마스크 밖 영역도 60%(0.6) 가시성 유지
    const softDensity = createVectorMask({ id: "m-den", subpaths: [circle], density01: 0.4 });
    expect(evaluateVectorMaskAtPoint(softDensity, 50, 50)).toBe(1);
    expect(evaluateVectorMaskAtPoint(softDensity, 5, 5)).toBeCloseTo(0.6, 5);
  });

  it("800% 줌에서 베지어 평탄화 밀도가 자동 향상되고 뷰포트 크기만 지연 래스터화한다", () => {
    const circle = createEllipseVectorMaskSubpath({
      id: "zoom-circle",
      cx: 100,
      cy: 100,
      rx: 40,
      ry: 40,
    });
    const mask = createVectorMask({ id: "m-zoom", subpaths: [circle] });

    const flat1x = flattenVectorMaskSubpath(circle, 0.2);
    const flat8x = flattenVectorMaskSubpath(circle, 0.2 / 8);
    expect(flat8x.length).toBeGreaterThan(flat1x.length);

    // 800% 줌으로 원 오른쪽 가장자리(x=138..142, y=98..102)만 32×32 뷰포트 래스터화
    const raster = rasterizeVectorMaskForViewport(mask, {
      originX: 138,
      originY: 98,
      widthPx: 32,
      heightPx: 32,
      zoomScale: 8,
    });
    expect(raster.alpha.length).toBe(32 * 32);
    expect(raster.stats.zoomScale).toBe(8);
    expect(raster.stats.effectiveFlatnessDocPx).toBeLessThan(0.05);
    // 왼쪽(x=138, 내부)은 255, 오른쪽(x=142, 외부)은 0
    expect(raster.alpha[16 * 32 + 0]).toBe(255);
    expect(raster.alpha[16 * 32 + 31]).toBe(0);
  });

  it("RGBA 버퍼 적용 시 원본을 변형하지 않고 마스크 밖 픽셀 알파를 0으로 만든다", () => {
    const mask = createVectorMask({
      id: "m-rgba",
      subpaths: [createRectVectorMaskSubpath({ id: "r", x: 2, y: 2, width: 4, height: 4 })],
    });
    const source = {
      width: 8,
      height: 8,
      data: new Uint8ClampedArray(8 * 8 * 4).fill(255),
    };
    const masked = applyVectorMaskToRgba(source, mask, {
      originX: 0,
      originY: 0,
      widthPx: 8,
      heightPx: 8,
      zoomScale: 1,
    });
    expect(source.data[3]).toBe(255); // 원본 불변
    expect(masked.data[3]).toBe(0); // (0,0) 바깥
    expect(masked.data[(4 * 8 + 4) * 4 + 3]).toBe(255); // (4,4) 내부
  });

  it("PSD vmsk 바이너리 및 ag-psd LayerVectorMask 왕복 직렬화/역직렬화가 무손실로 일치한다", () => {
    const mask = createVectorMask({
      id: "m-psd",
      enabled: true,
      linked: false,
      invert: true,
      featherPx: 6.5,
      density01: 0.8,
      subpaths: [
        createEllipseVectorMaskSubpath({
          id: "outer",
          cx: 400,
          cy: 300,
          rx: 120,
          ry: 90,
          operation: "union",
        }),
        createRectVectorMaskSubpath({
          id: "cut",
          x: 360,
          y: 260,
          width: 80,
          height: 80,
          operation: "subtract",
        }),
      ],
    });

    const payload = serializeVectorMaskToPsdVmsk(mask, 800, 600);
    expect(payload.tag).toBe("vmsk");
    expect(payload.vectorMaskFeather).toBe(6.5);
    expect(payload.vectorMaskDensity).toBe(204);
    expect(payload.vectorMask.paths).toHaveLength(2);
    expect(payload.vectorMask.paths[0]!.operation).toBe("combine");
    expect(payload.vectorMask.paths[1]!.operation).toBe("subtract");

    // 1. ag-psd LayerVectorMask 역직렬화 라운드트립
    const fromAgPsd = deserializeVectorMaskFromPsd(payload.vectorMask, {
      id: mask.id,
      vectorMaskFeather: payload.vectorMaskFeather,
      vectorMaskDensity: payload.vectorMaskDensity,
    });
    expect(fromAgPsd.invert).toBe(true);
    expect(fromAgPsd.linked).toBe(false);
    expect(fromAgPsd.featherPx).toBe(6.5);
    expect(fromAgPsd.density01).toBeCloseTo(0.8, 2);
    expect(fromAgPsd.subpaths[0]!.knots[0]!.anchor).toEqual({ x: 400, y: 210 });

    // 2. 원시 PSD vmsk 8.24 고정소수점 바이너리 직접 디코딩 라운드트립
    const fromBinary = deserializeVectorMaskFromVmskBinary(payload.vmskBinary, 800, 600, {
      id: mask.id,
      featherPx: 6.5,
      density01: 0.8,
    });
    expect(fromBinary.invert).toBe(true);
    expect(fromBinary.linked).toBe(false);
    expect(fromBinary.subpaths).toHaveLength(2);
    expect(fromBinary.subpaths[1]!.operation).toBe("subtract");
    expect(fromBinary.subpaths[0]!.knots[1]!.anchor.x).toBeCloseTo(520, 3);
    expect(fromBinary.subpaths[0]!.knots[1]!.anchor.y).toBeCloseTo(300, 3);

    const bounds = computeVectorMaskBounds(fromBinary);
    expect(bounds).not.toBeNull();
    expect(bounds!.minX).toBeCloseTo(280, 1);
    expect(bounds!.maxX).toBeCloseTo(520, 1);
  });
});
