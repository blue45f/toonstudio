import { describe, expect, it } from "vitest";

import {
  DEFAULT_POCHADE_COLOR_JITTER,
  applyPochadeLineBlendToRgba,
  beginPochadeBlockInSession,
  cancelPochadeBlockInSession,
  commitPochadeBlockInSession,
  computeDeterministicPochadeColor,
  evaluateNotanPosterizeRgba,
  pochadeRgbToOklab,
  rasterizePochadeSessionToRgba,
  updatePochadeBlockInSession,
} from "./studio-pochade-blockin-session";

describe("studio-pochade-blockin-session", () => {
  it("스트로크 단위 HSB · 색온도 지터가 결정적으로 재현되고 시드/획 번호에 따라 변주된다", () => {
    const base = { r: 120, g: 140, b: 165 };
    const runA = computeDeterministicPochadeColor(base, 7, DEFAULT_POCHADE_COLOR_JITTER);
    const runB = computeDeterministicPochadeColor(base, 7, DEFAULT_POCHADE_COLOR_JITTER);
    const nextStroke = computeDeterministicPochadeColor(base, 8, DEFAULT_POCHADE_COLOR_JITTER);

    expect(runA).toEqual(runB);
    expect(nextStroke.rgb).not.toEqual(runA.rgb);

    // 지터 강도 0이면 원색과 거의 일치해야 한다
    const zeroJitter = computeDeterministicPochadeColor(base, 1, {
      hueJitterDeg: 0,
      saturationJitter01: 0,
      brightnessJitter01: 0,
      tempWarmCoolJitter01: 0,
      seed: 42,
    });
    expect(Math.abs(zeroJitter.rgb.r - base.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(zeroJitter.rgb.g - base.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(zeroJitter.rgb.b - base.b)).toBeLessThanOrEqual(1);
  });

  it("실시간 닫힌 폴리곤 Lasso Fill과 부채꼴 Fan Fill 세션이 면을 즉시 래스터화한다", () => {
    const canvas = {
      width: 32,
      height: 32,
      data: new Uint8ClampedArray(32 * 32 * 4),
    };

    // 1. Lasso Fill 사각형
    let lasso = beginPochadeBlockInSession({
      mode: "lasso-fill",
      start: { x: 4, y: 4 },
      baseColor: { r: 200, g: 80, b: 60 },
      strokeIndex: 0,
      jitter: { ...DEFAULT_POCHADE_COLOR_JITTER, hueJitterDeg: 0, saturationJitter01: 0, brightnessJitter01: 0, tempWarmCoolJitter01: 0 },
    });
    lasso = updatePochadeBlockInSession(lasso, { x: 24, y: 4 });
    lasso = updatePochadeBlockInSession(lasso, { x: 24, y: 24 });
    lasso = updatePochadeBlockInSession(lasso, { x: 4, y: 24 });
    lasso = commitPochadeBlockInSession(lasso);

    expect(lasso.phase).toBe("committed");
    expect(Math.abs(lasso.signedAreaPx2)).toBeCloseTo(400, 1);

    const filled = rasterizePochadeSessionToRgba(canvas, lasso);
    // 입력 버퍼 불변
    expect(canvas.data[(14 * 32 + 14) * 4 + 3]).toBe(0);
    // 폴리곤 내부(14,14)는 채워지고 외부(1,1)는 투명 유지
    expect(filled.data[(14 * 32 + 14) * 4 + 3]).toBe(255);
    expect(filled.data[(14 * 32 + 14) * 4]).toBeGreaterThan(190);
    expect(filled.data[(1 * 32 + 1) * 4 + 3]).toBe(0);

    // 2. Fan Fill 부채꼴 삼각 팬
    let fan = beginPochadeBlockInSession({
      mode: "fan-fill",
      start: { x: 16, y: 28 },
      baseColor: { r: 60, g: 130, b: 220 },
      strokeIndex: 2,
    });
    fan = updatePochadeBlockInSession(fan, { x: 6, y: 10 });
    fan = updatePochadeBlockInSession(fan, { x: 16, y: 4 });
    fan = updatePochadeBlockInSession(fan, { x: 26, y: 10 });
    expect(fan.fanTriangles).toHaveLength(2);
    expect(fan.fanTriangles[0]!.a).toEqual({ x: 16, y: 28 });

    // 취소 시 래스터화 no-op
    const cancelled = cancelPochadeBlockInSession(fan);
    const untouched = rasterizePochadeSessionToRgba(canvas, cancelled);
    expect(untouched.data[(16 * 32 + 16) * 4 + 3]).toBe(0);
  });

  it("2점 직선 경계 OKLab Line Blend가 보색 경계에서 탁함 없이 매끄럽게 스미어한다", () => {
    const w = 40;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = (y * w + x) * 4;
        if (x < 20) {
          // 왼쪽: 선명한 파랑
          data[idx] = 20;
          data[idx + 1] = 80;
          data[idx + 2] = 235;
        } else {
          // 오른쪽: 선명한 노랑/주황
          data[idx] = 245;
          data[idx + 1] = 195;
          data[idx + 2] = 30;
        }
        data[idx + 3] = 255;
      }
    }
    const source = { width: w, height: h, data };
    const blended = applyPochadeLineBlendToRgba(source, {
      start: { x: 20, y: 0 },
      end: { x: 20, y: 20 },
      halfWidthPx: 6,
      sampleOffsetPx: 8,
      strength01: 1,
    });

    // 경계(x=20) 중심 픽셀은 양쪽 색의 중간 OKLab 색으로 부드럽게 섞여야 함
    const midIdx = (10 * w + 20) * 4;
    const midRgb = {
      r: blended.data[midIdx]!,
      g: blended.data[midIdx + 1]!,
      b: blended.data[midIdx + 2]!,
    };
    const leftLab = pochadeRgbToOklab({ r: 20, g: 80, b: 235 });
    const rightLab = pochadeRgbToOklab({ r: 245, g: 195, b: 30 });
    const midLab = pochadeRgbToOklab(midRgb);

    // OKLab 보간 명도 L은 양쪽 명도의 중간 부근을 유지한다
    const expectedMidL = (leftLab[0] + rightLab[0]) * 0.5;
    expect(Math.abs(midLab[0] - expectedMidL)).toBeLessThan(0.12);
    // 경계에서 멀리 떨어진 픽셀(x=2)은 원본 그대로 유지
    expect(blended.data[(10 * w + 2) * 4]).toBe(20);
    expect(blended.data[(10 * w + 2) * 4 + 2]).toBe(235);
  });

  it("Notan 3단계 명도 체크가 어둠·중간·밝음을 3값(0/128/255)으로 양자화한다", () => {
    const img = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([
        10, 10, 10, 255,
        128, 128, 128, 255,
        245, 245, 245, 255,
      ]),
    };
    const notan = evaluateNotanPosterizeRgba(img, 3);
    expect([notan.data[0], notan.data[4], notan.data[8]]).toEqual([0, 128, 255]);
  });
});
