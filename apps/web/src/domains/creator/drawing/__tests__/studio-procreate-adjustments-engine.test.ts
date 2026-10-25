import { describe, expect, it } from "vitest";

import {
  applyProcreateBloomFilter,
  applyProcreateChromaticAberrationFilter,
  applyProcreateCloneStampDab,
  applyProcreateGlitchFilter,
  applyProcreateNoiseFilter,
  applyProcreatePerspectiveBlurFilter,
  evaluateProcreateLiquifyDisplacementAt,
  ProcreatePencilFilterSession,
} from "../studio-procreate-adjustments-engine";

function makeTestBuffer(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isCenterBright = x >= 4 && x <= 11 && y >= 4 && y <= 11;
      buf[idx] = isCenterBright ? 250 : 30;
      buf[idx + 1] = isCenterBright ? 220 : 40;
      buf[idx + 2] = isCenterBright ? 180 : 60;
      buf[idx + 3] = 255;
    }
  }
  return buf;
}

describe("studio-procreate-adjustments-engine (Procreate Adjustments & Pencil Filters 비파괴 마스크 엔진)", () => {
  it("Pencil Filters 세션은 브러시로 칠한 국소 마스크 영역에만 조정 필터를 비파괴 합성하고 지우개로 복원한다", () => {
    const width = 16;
    const height = 16;
    const source = makeTestBuffer(width, height);
    const inverted = new Uint8ClampedArray(source.length);
    for (let i = 0; i < source.length; i += 4) {
      inverted[i] = 255 - (source[i] ?? 0);
      inverted[i + 1] = 255 - (source[i + 1] ?? 0);
      inverted[i + 2] = 255 - (source[i + 2] ?? 0);
      inverted[i + 3] = 255;
    }

    const session = new ProcreatePencilFilterSession(width, height, "bloom");
    session.paintFilterMaskDab({
      x: 8,
      y: 8,
      radiusPx: 4,
      pressure01: 1,
      softness01: 0.2,
      mode: "paint",
    });

    expect(session.getMaskValueAt(8, 8)).toBeCloseTo(1, 3);
    expect(session.getMaskValueAt(0, 0)).toBe(0);

    const composited = session.compositeWithFilteredBuffer(source, inverted);
    const centerIdx = (8 * width + 8) * 4;
    const cornerIdx = 0;
    expect(composited[centerIdx]).toBe(inverted[centerIdx]);
    expect(composited[cornerIdx]).toBe(source[cornerIdx]);

    session.paintFilterMaskDab({
      x: 8,
      y: 8,
      radiusPx: 4,
      pressure01: 1,
      softness01: 0.1,
      mode: "erase",
    });
    expect(session.getMaskValueAt(8, 8)).toBeCloseTo(0, 3);
  });

  it("Perspective Blur(Positional/Directional)와 Bloom 광학 할로 합성이 정상 동작한다", () => {
    const width = 16;
    const height = 16;
    const source = makeTestBuffer(width, height);

    const pBlur = applyProcreatePerspectiveBlurFilter(source, {
      width,
      height,
      vanishingX: 8,
      vanishingY: 8,
      mode: "positional",
      amount01: 0.75,
    });
    expect(pBlur).toHaveLength(source.length);

    const bloomed = applyProcreateBloomFilter(source, {
      width,
      height,
      amount01: 0.85,
      threshold01: 0.5,
      sizePx: 2,
      burn01: 0.4,
    });
    // 밝은 중앙부 주변 어두운 픽셀(3, 8)이 Bloom 광학 번짐으로 원본(30)보다 밝아져야 한다
    const haloIdx = (8 * width + 3) * 4;
    expect(bloomed[haloIdx]!).toBeGreaterThan(source[haloIdx]!);
  });

  it("Glitch 4모드(artifact/wave/signal/diverge), Chromatic Aberration(transverse/displace), Noise(clouds/ridges/turbulence)가 동작한다", () => {
    const width = 16;
    const height = 16;
    const source = makeTestBuffer(width, height);

    for (const mode of ["artifact", "wave", "signal", "diverge"] as const) {
      const glitched = applyProcreateGlitchFilter(source, {
        width,
        height,
        mode,
        amount01: 0.6,
      });
      expect(glitched).toHaveLength(source.length);
    }

    const transverseCa = applyProcreateChromaticAberrationFilter(source, {
      width,
      height,
      mode: "transverse",
      amount01: 0.8,
      focalX: 8,
      focalY: 8,
      falloff01: 0.3,
    });
    // 초점 중심(8, 8)은 falloff 보호 영역 안이므로 색수차 변위가 0이어야 함
    const centerIdx = (8 * width + 8) * 4;
    expect(transverseCa[centerIdx]).toBe(source[centerIdx]);

    const ridgedNoise = applyProcreateNoiseFilter(source, {
      width,
      height,
      generator: "ridges",
      channelMode: "multi",
      amount01: 0.5,
      octaves: 4,
    });
    expect(ridgedNoise).toHaveLength(source.length);
  });

  it("Liquify(Crystals/Edge/Adjust 엔벨로프) 및 Clone 도장 복제가 정확히 계산된다", () => {
    const crystalDisp = evaluateProcreateLiquifyDisplacementAt({
      x: 54,
      y: 52,
      brushX: 50,
      brushY: 50,
      radiusPx: 20,
      mode: "crystals",
      pressure01: 0.9,
      distortion01: 0.8,
      momentum01: 0.5,
      adjustEnvelope01: 1,
    });
    expect(crystalDisp.displacedX).not.toBe(54);

    const zeroAdjustDisp = evaluateProcreateLiquifyDisplacementAt({
      x: 54,
      y: 52,
      brushX: 50,
      brushY: 50,
      radiusPx: 20,
      mode: "crystals",
      pressure01: 0.9,
      distortion01: 0.8,
      momentum01: 0.5,
      adjustEnvelope01: 0,
    });
    expect(zeroAdjustDisp).toEqual({ displacedX: 54, displacedY: 52 });

    const width = 16;
    const height = 16;
    const source = makeTestBuffer(width, height);
    const cloned = applyProcreateCloneStampDab(source, {
      width,
      height,
      sourceX: 8,
      sourceY: 8,
      targetX: 2,
      targetY: 2,
      radiusPx: 2,
      strength01: 1,
    });
    const targetIdx = (2 * width + 2) * 4;
    expect(cloned[targetIdx]).toBe(250);
  });
});
