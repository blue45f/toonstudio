import { describe, expect, it } from "vitest";

import {
  applyLiquifyDisplacementToBuffer,
  applyMagmaBlendBrushDab,
  applyMagmaChromaticAberrationFilter,
  applyMagmaMotionBlurFilter,
  applyMagmaMultiChannelCurvesFilter,
  applyMagmaOrderedDitherFilter,
  applyMagmaOutlineFilter,
  createMagmaBlendReservoirState,
  MagmaLiquifyDisplacementField,
} from "../studio-magma-canvas-filters";

describe("studio-magma-canvas-filters (Magma 블렌드 브러시·리퀴파이·CSL 필터 커널)", () => {
  it("Ping-Pong 리덕션 + 물감 저장소(Reservoir) 블렌드 브러시가 캔버스 색을 끌고 가며 opacityLocked를 준수한다", () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);

    // 좌측 절반은 빨간색(불투명), 우측 절반은 파란색(반투명 alpha=128)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        if (x < 8) {
          rgba[idx] = 240;
          rgba[idx + 1] = 20;
          rgba[idx + 2] = 20;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 20;
          rgba[idx + 1] = 40;
          rgba[idx + 2] = 240;
          rgba[idx + 3] = 128;
        }
      }
    }

    const reservoir = createMagmaBlendReservoirState();
    // 1스텝: 좌측 빨간 영역에서 색 픽업
    applyMagmaBlendBrushDab(rgba, width, height, reservoir, {
      x: 4,
      y: 8,
      radiusPx: 3,
      hardness01: 0.8,
      paint01: 0, // 순수 블렌드(물감 추가 0)
      paintPressure: false,
      paintTilt: false,
      stretch01: 0.85,
      flow01: 0.8,
      pressure01: 1,
      tilt01: 0,
      opacityLocked: true,
      brushColor: { r: 0, g: 1, b: 0 },
    });
    expect(reservoir.initialized).toBe(true);
    expect(reservoir.r).toBeGreaterThan(0.8);

    // 2스텝: 우측 파란 영역으로 이동해 빨간 Reservoir 색을 블렌딩하되 opacityLocked=true로 알파(128) 보존
    applyMagmaBlendBrushDab(rgba, width, height, reservoir, {
      x: 11,
      y: 8,
      radiusPx: 3,
      hardness01: 0.8,
      paint01: 0.2,
      paintPressure: true,
      paintTilt: false,
      stretch01: 0.85,
      flow01: 0.8,
      pressure01: 0.9,
      tilt01: 0,
      opacityLocked: true,
      brushColor: { r: 0, g: 1, b: 0 },
    });

    const rightCenterIdx = (8 * width + 11) * 4;
    expect(rgba[rightCenterIdx]!).toBeGreaterThan(100); // 빨간 성분이 우측으로 끌려옴
    expect(rgba[rightCenterIdx + 3]).toBe(128); // opacityLocked 준수
  });

  it("리퀴파이 2D 변위장(push/twirl/reconstruct)이 픽셀을 이동시키고 reconstruct로 복원한다", () => {
    const width = 20;
    const height = 20;
    const src = new Uint8ClampedArray(width * height * 4);
    // (10, 10)에 밝은 흰색 점 배치
    const centerIdx = (10 * width + 10) * 4;
    src[centerIdx] = 255;
    src[centerIdx + 1] = 255;
    src[centerIdx + 2] = 255;
    src[centerIdx + 3] = 255;

    const field = new MagmaLiquifyDisplacementField(width, height);
    const affected = field.applyStrokeStep({
      x: 10,
      y: 10,
      deltaX: 3,
      deltaY: 0,
      radiusPx: 5,
      hardness01: 0.9,
      stretch01: 1,
      mode: "push",
    });
    expect(affected).toBeGreaterThan(10);

    const warped = applyLiquifyDisplacementToBuffer(src, field);
    // +X로 3px 밀었으므로 (13, 10) 위치에서 원본 (10, 10)의 흰색 픽셀이 샘플링됨
    const shiftedIdx = (10 * width + 13) * 4;
    expect(warped[shiftedIdx]!).toBeGreaterThan(200);

    // reconstruct 모드로 변위 복원
    field.applyStrokeStep({
      x: 10,
      y: 10,
      deltaX: 0,
      deltaY: 0,
      radiusPx: 6,
      hardness01: 1,
      stretch01: 1,
      mode: "reconstruct",
    });
    expect(Math.abs(field.dxField[10 * width + 10]!)).toBeLessThan(1e-4);
  });

  it("CSL MotionBlur 필터가 투명 이웃 픽셀의 검은색(RGB=0) 번짐 없이 순수 색상을 유지한다", () => {
    const width = 16;
    const height = 8;
    const src = new Uint8ClampedArray(width * height * 4);
    // 중앙 (8, 4)에만 순수 노란색(255, 220, 0, alpha=255), 나머지는 완전 투명(0, 0, 0, 0)
    const idx = (4 * width + 8) * 4;
    src[idx] = 255;
    src[idx + 1] = 220;
    src[idx + 2] = 0;
    src[idx + 3] = 255;

    const blurred = applyMagmaMotionBlurFilter(src, width, height, {
      angleDeg: 0,
      distancePx: 4,
      sampleSteps: 4,
    });

    // (10, 4) 지점은 알파가 감쇠되어 반투명해지지만, RGB 색상은 검은색으로 탁해지지 않고 노란색(255, 220, 0)을 유지해야 함
    const neighborIdx = (4 * width + 10) * 4;
    expect(blurred[neighborIdx + 3]!).toBeGreaterThan(0);
    expect(blurred[neighborIdx]!).toBe(255);
    expect(blurred[neighborIdx + 1]!).toBe(220);
    expect(blurred[neighborIdx + 2]!).toBe(0);
  });

  it("CSL Multi-Channel Curves·Ordered Bayer Dither·ChromaticAberration·Outline 필터가 정확히 동작한다", () => {
    const src = new Uint8ClampedArray([128, 128, 128, 255]);
    const curved = applyMagmaMultiChannelCurvesFilter(src, {
      masterCurve: [
        { x: 0, y: 0 },
        { x: 1, y: 0.5 }, // 전체 밝기 절반
      ],
      redCurve: [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.95 }, // masterCurve 거친 0.25(64) 입력을 0.95(242)로 증폭
        { x: 1, y: 1 },
      ],
    });
    expect(curved[0]!).toBeGreaterThan(220);
    expect(curved[1]!).toBeLessThan(80);
    expect(curved[3]).toBe(255);

    // 4x4 Bayer Dither 테스트
    const grad = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      grad[i * 4] = 120;
      grad[i * 4 + 1] = 120;
      grad[i * 4 + 2] = 120;
      grad[i * 4 + 3] = 255;
    }
    const dithered = applyMagmaOrderedDitherFilter(grad, 4, 4, {
      levels: 2,
      strength01: 1,
    });
    const uniqueReds = new Set<number>();
    for (let i = 0; i < 16; i += 1) {
      uniqueReds.add(dithered[i * 4]!);
    }
    expect(uniqueReds.has(0)).toBe(true);
    expect(uniqueReds.has(255)).toBe(true);

    // ChromaticAberration & Outline 테스트
    const shape = new Uint8ClampedArray(8 * 8 * 4);
    const cIdx = (4 * 8 + 4) * 4;
    shape[cIdx] = 200;
    shape[cIdx + 1] = 200;
    shape[cIdx + 2] = 200;
    shape[cIdx + 3] = 255;

    const chroma = applyMagmaChromaticAberrationFilter(shape, 8, 8, {
      shiftXPx: 1,
      shiftYPx: 0,
    });
    expect(chroma[(4 * 8 + 5) * 4]!).toBe(200); // Red shifted +1
    expect(chroma[(4 * 8 + 3) * 4 + 2]!).toBe(200); // Blue shifted -1

    const outlined = applyMagmaOutlineFilter(shape, 8, 8, {
      radiusPx: 1,
      outlineColor: { r: 255, g: 0, b: 128 },
      outlineOnly: true,
    });
    // 중심(4,4)은 이미 불투명이므로 outlineOnly에서는 알파 0, 바로 옆(4,5)은 알파 255 외곽선
    expect(outlined[cIdx + 3]).toBe(0);
    expect(outlined[(4 * 8 + 5) * 4 + 3]).toBe(255);
    expect(outlined[(4 * 8 + 5) * 4]).toBe(255);
  });
});
