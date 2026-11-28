import { describe, expect, it } from "vitest";

import {
  CINEMATIC_LENS_PRESETS,
  CINEMATIC_LENS_PRESET_IDS,
  LENS_OPTICS_UNIFORM_ALIGNMENT,
  LENS_OPTICS_UNIFORM_BYTE_SIZE,
  MIN_SAFE_CORNER_VIGNETTE_GAIN,
  applyCinematicLensOpticsToTile,
  auditCinematicPostReadability,
  buildCinematicLensOpticsWgsl,
  computeAnamorphicBokehAxes,
  computeCos4VignetteGain,
  computeLateralCaShiftPx,
  computeThinLensCocPx,
  distortLensUv,
  escapeLensOpticsXml,
  getCinematicLensPreset,
  measureDistortionRoundTripError,
  renderCinematicLensOpticsSvg,
  summarizeCinematicLensOpticsKo,
  undistortLensUv,
  validateCinematicLensOpticsWgsl,
  type CinematicLensPresetId,
  type CinematicLensTileResult,
  type TextSafeBox,
} from "./index";

function createTestPlate(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const checker = ((x >> 2) + (y >> 2)) % 2 === 0;
      const edgeStripe = x === Math.floor(width * 0.85) || x === Math.floor(width * 0.15);
      rgba[idx] = edgeStripe ? 240 : checker ? 178 : 56;
      rgba[idx + 1] = edgeStripe ? 240 : checker ? 152 : 68;
      rgba[idx + 2] = edgeStripe ? 240 : checker ? 128 : 92;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

function paintTextBalloonBox(rgba: Uint8ClampedArray, width: number, box: TextSafeBox): void {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.width));
  const y1 = Math.ceil(box.y + box.height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const idx = (y * width + x) * 4;
      const ink = (x - x0) % 3 === 1 && (y - y0) % 3 === 1;
      rgba[idx] = ink ? 18 : 252;
      rgba[idx + 1] = ink ? 22 : 250;
      rgba[idx + 2] = ink ? 26 : 244;
      rgba[idx + 3] = 255;
    }
  }
}

function createSolidTile(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    rgba[o] = r;
    rgba[o + 1] = g;
    rgba[o + 2] = b;
    rgba[o + 3] = a;
  }
  return rgba;
}

describe("Wave 122 — 5종 시네마틱 렌즈 프리셋 및 Brown-Conrady 정·역왜곡", () => {
  it("5종 정규 웹툰 촬영 렌즈 프리셋이 모두 등록되어 있고 핵심 사양이 유효하다", () => {
    expect(CINEMATIC_LENS_PRESET_IDS).toEqual([
      "clean-editorial-50mm",
      "anamorphic-cinema-2x",
      "vintage-helios-swirl",
      "action-wide-24mm-ca",
      "dreamy-romance-halation",
    ]);
    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const preset = getCinematicLensPreset(presetId);
      expect(preset.id).toBe(presetId);
      expect(preset.focalLengthMm).toBeGreaterThanOrEqual(24);
      expect(preset.apertureFStop).toBeGreaterThanOrEqual(1.4);
      expect(preset.minCornerVignetteGain).toBeGreaterThanOrEqual(MIN_SAFE_CORNER_VIGNETTE_GAIN);
    }
    expect(CINEMATIC_LENS_PRESETS["anamorphic-cinema-2x"].bokehAspectRatio).toBe(2.0);
    expect(CINEMATIC_LENS_PRESETS["anamorphic-cinema-2x"].anamorphicSqueeze).toBe(2.0);
  });

  it("미등록 렌즈 프리셋 요청 시 fail-closed 에러를 던진다", () => {
    expect(() =>
      getCinematicLensPreset("nonexistent-lens-99mm" as unknown as CinematicLensPresetId),
    ).toThrow(/알 수 없는 시네마틱 렌즈 프리셋/);
  });

  it("5종 프리셋 모두 Brown-Conrady 왜곡 중심 (0.5, 0.5)이 불변이다", () => {
    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const p = getCinematicLensPreset(presetId);
      const center = distortLensUv(
        { u: 0.5, v: 0.5 },
        { k1: p.distortionK1, k2: p.distortionK2, p1: p.tangentialP1, p2: p.tangentialP2 },
      );
      expect(center).toEqual({ u: 0.5, v: 0.5 });
    }
  });

  it("5종 프리셋 모두 Brown-Conrady 정왜곡 → 뉴턴-랩슨 역왜곡 왕복 오차가 1e-4 미만이다", () => {
    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const p = getCinematicLensPreset(presetId);
      const report = measureDistortionRoundTripError(
        { k1: p.distortionK1, k2: p.distortionK2, p1: p.tangentialP1, p2: p.tangentialP2 },
        11,
      );
      expect(report.centerDriftUv).toBe(0);
      expect(report.maxRoundTripUvError).toBeLessThan(1e-4);
      expect(report.meanRoundTripUvError).toBeLessThan(1e-5);
    }
  });

  it("접선 왜곡(p1, p2)을 포함한 복합 Brown-Conrady 좌표도 뉴턴-랩슨으로 정밀 복원된다", () => {
    const params = { k1: -0.095, k2: 0.025, p1: 0.004, p2: -0.003 };
    for (const pt of [
      { u: 0.1, v: 0.15 },
      { u: 0.9, v: 0.12 },
      { u: 0.25, v: 0.85 },
      { u: 0.88, v: 0.92 },
    ]) {
      const restored = undistortLensUv(distortLensUv(pt, params), params);
      expect(Math.hypot(restored.u - pt.u, restored.v - pt.v)).toBeLessThan(1e-6);
    }
  });

  it("배럴 왜곡(action-wide-24mm-ca)은 코너를 안쪽으로, 핀쿠션(dreamy-romance-halation)은 바깥쪽으로 이동시킨다", () => {
    const wide = getCinematicLensPreset("action-wide-24mm-ca");
    const romance = getCinematicLensPreset("dreamy-romance-halation");
    const baseRadius = Math.hypot(0.5, 0.5);
    const wideWarped = distortLensUv({ u: 1.0, v: 1.0 }, { k1: wide.distortionK1, k2: wide.distortionK2 });
    const romanceWarped = distortLensUv(
      { u: 1.0, v: 1.0 },
      { k1: romance.distortionK1, k2: romance.distortionK2 },
    );
    expect(Math.hypot(wideWarped.u - 0.5, wideWarped.v - 0.5)).toBeLessThan(baseRadius);
    expect(Math.hypot(romanceWarped.u - 0.5, romanceWarped.v - 0.5)).toBeGreaterThan(baseRadius);
  });
});

describe("Wave 122 — 물리 DoF CoC · 아나모픽 2x 보케 · 측면 색수차 · Cos⁴ 비네팅", () => {
  it("얇은 렌즈 CoC는 초점 평면(z === focusDistanceM)에서 정확히 0.0px을 반환한다", () => {
    expect(
      computeThinLensCocPx({
        depthM: 2.5,
        focusDistanceM: 2.5,
        focalLengthMm: 50,
        apertureFStop: 1.4,
        imageWidthPx: 1200,
      }),
    ).toBe(0);
  });

  it("얇은 렌즈 CoC는 초점면에서 후경(z > focusDistanceM)으로 멀어질수록 단조 증가한다", () => {
    const cocs = [2.5, 3.0, 4.0, 6.0, 12.0, 30.0].map((depthM) =>
      computeThinLensCocPx({
        depthM,
        focusDistanceM: 2.5,
        focalLengthMm: 50,
        apertureFStop: 2.0,
        imageWidthPx: 1000,
      }),
    );
    expect(cocs[0]).toBe(0);
    for (let i = 1; i < cocs.length; i += 1) {
      expect(cocs[i]).toBeGreaterThan(cocs[i - 1]);
    }
  });

  it("얇은 렌즈 CoC는 초점면에서 전경(z < focusDistanceM)으로 가까워질수록 단조 증가한다", () => {
    const cocs = [2.5, 2.0, 1.5, 1.0, 0.7].map((depthM) =>
      computeThinLensCocPx({
        depthM,
        focusDistanceM: 2.5,
        focalLengthMm: 50,
        apertureFStop: 2.0,
        imageWidthPx: 1000,
      }),
    );
    expect(cocs[0]).toBe(0);
    for (let i = 1; i < cocs.length; i += 1) {
      expect(cocs[i]).toBeGreaterThan(cocs[i - 1]);
    }
  });

  it("개방 조리개(f/1.4)가 조임(f/8.0)보다 정확히 조리개 반비례만큼 더 큰 CoC를 생성한다", () => {
    const openCoc = computeThinLensCocPx({
      depthM: 5.0,
      focusDistanceM: 2.5,
      focalLengthMm: 85,
      apertureFStop: 1.4,
      imageWidthPx: 1000,
    });
    const closedCoc = computeThinLensCocPx({
      depthM: 5.0,
      focusDistanceM: 2.5,
      focalLengthMm: 85,
      apertureFStop: 8.0,
      imageWidthPx: 1000,
    });
    expect(openCoc).toBeGreaterThan(closedCoc * 5.0);
    expect(openCoc / closedCoc).toBeCloseTo(8.0 / 1.4, 6);
  });

  it("anamorphic-cinema-2x는 보케 종횡비 2.0 세로 타원을, 구면 50mm는 1.0 원형을 산출한다", () => {
    const anamorphic = computeAnamorphicBokehAxes(12, getCinematicLensPreset("anamorphic-cinema-2x"));
    const editorial = computeAnamorphicBokehAxes(12, getCinematicLensPreset("clean-editorial-50mm"));
    expect(anamorphic.bokehAspectRatio).toBe(2.0);
    expect(anamorphic.verticalRadiusPx / anamorphic.horizontalRadiusPx).toBeCloseTo(2.0, 8);
    expect(anamorphic.verticalRadiusPx * anamorphic.horizontalRadiusPx).toBeCloseTo(36, 6);
    expect(editorial.bokehAspectRatio).toBe(1.0);
    expect(editorial.verticalRadiusPx).toBeCloseTo(editorial.horizontalRadiusPx, 8);
  });

  it("측면 색수차(Lateral CA)는 화면 중심 (0.5, 0.5)에서 0.0px이며 외곽으로 갈수록 단조 증가한다", () => {
    const preset = getCinematicLensPreset("action-wide-24mm-ca");
    const samples = [
      computeLateralCaShiftPx(0.5, 0.5, preset),
      computeLateralCaShiftPx(0.65, 0.5, preset),
      computeLateralCaShiftPx(0.85, 0.5, preset),
      computeLateralCaShiftPx(1.0, 0.5, preset),
      computeLateralCaShiftPx(1.0, 1.0, preset),
    ];
    expect(samples[0].totalSeparationPx).toBe(0);
    expect(samples[0].redShiftPx).toBe(0);
    expect(samples[0].blueShiftPx).toBe(0);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].totalSeparationPx).toBeGreaterThan(samples[i - 1].totalSeparationPx);
    }
  });

  it("액션 와이드 24mm 외곽 색수차가 클린 에디토리얼 50mm보다 뚜렷하게 크다", () => {
    const wideCa = computeLateralCaShiftPx(1.0, 1.0, getCinematicLensPreset("action-wide-24mm-ca"));
    const cleanCa = computeLateralCaShiftPx(1.0, 1.0, getCinematicLensPreset("clean-editorial-50mm"));
    expect(wideCa.totalSeparationPx).toBeGreaterThan(cleanCa.totalSeparationPx * 4);
  });

  it("Cos⁴ 물리 비네팅은 중심 1.0에서 외곽으로 단조 감쇠하되 모든 프리셋에서 코너 하한 0.35 이상을 유지한다", () => {
    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const preset = getCinematicLensPreset(presetId);
      const center = computeCos4VignetteGain(0.5, 0.5, preset);
      const mid = computeCos4VignetteGain(0.75, 0.75, preset);
      const corner = computeCos4VignetteGain(1.0, 1.0, preset);
      expect(center).toBe(1.0);
      expect(mid).toBeLessThanOrEqual(center);
      expect(corner).toBeLessThanOrEqual(mid);
      expect(corner).toBeGreaterThanOrEqual(MIN_SAFE_CORNER_VIGNETTE_GAIN);
    }
  });
});

describe("Wave 122 — RGBA 타일 파이프라인 & 대사 보호(Text-Safe) 100% 무손실 보존", () => {
  it("5종 프리셋 모두 대사 보호 마스크(textSafeBoxes) 내부 픽셀이 단 1바이트도 변조되지 않는다", () => {
    const width = 48;
    const height = 48;
    const textBoxes: readonly TextSafeBox[] = [
      { id: "balloon-top", x: 4, y: 4, width: 16, height: 12, labelKo: "대사 상단" },
      { id: "balloon-corner", x: 30, y: 32, width: 14, height: 12, labelKo: "대사 코너" },
    ];
    const plate = createTestPlate(width, height);
    for (const box of textBoxes) {
      paintTextBalloonBox(plate, width, box);
    }
    const depthMeters = new Float32Array(width * height).fill(9.5);

    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const result = applyCinematicLensOpticsToTile({
        width,
        height,
        rgba: plate,
        presetId,
        depthMeters,
        textSafeBoxes: textBoxes,
        intensity: 1.2,
      });
      expect(result.metrics.textBoxCorruptedPixelCount).toBe(0);
      expect(result.metrics.textSafeProtectedPixelCount).toBe(16 * 12 + 14 * 12);
      expect(result.metrics.nonFiniteOrOutOfRangeChannelCount).toBe(0);

      for (const box of textBoxes) {
        for (let y = box.y; y < box.y + box.height; y += 1) {
          for (let x = box.x; x < box.x + box.width; x += 1) {
            const off = (y * width + x) * 4;
            expect(result.outputRgba.slice(off, off + 4)).toEqual(plate.slice(off, off + 4));
          }
        }
      }
    }
  });

  it("겹치거나 화면 경계 밖으로 걸친 다중 textSafeBoxes도 정확히 클리핑해 0px 훼손을 보장한다", () => {
    const result = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: createTestPlate(32, 32),
      presetId: "action-wide-24mm-ca",
      textSafeBoxes: [
        { id: "overlap-a", x: -4, y: 2, width: 12, height: 10 },
        { id: "overlap-b", x: 4, y: 6, width: 10, height: 10 },
        { id: "edge-clip", x: 26, y: 24, width: 12, height: 12 },
      ],
    });
    expect(result.metrics.textBoxCorruptedPixelCount).toBe(0);
    expect(result.metrics.textSafeBoxCount).toBe(3);
    expect(result.metrics.textSafeProtectedPixelCount).toBeGreaterThan(0);
  });

  it("외곽 고대비 흑백 경계선에서 측면 색수차(action-wide-24mm-ca)가 Red와 Blue 채널을 물리적으로 분리한다", () => {
    const width = 48;
    const height = 32;
    const rgba = createSolidTile(width, height, 12, 12, 12);
    for (let y = 0; y < height; y += 1) {
      for (let x = 40; x <= 42; x += 1) {
        const o = (y * width + x) * 4;
        rgba[o] = 245;
        rgba[o + 1] = 245;
        rgba[o + 2] = 245;
      }
    }
    const result = applyCinematicLensOpticsToTile({
      width,
      height,
      rgba,
      presetId: "action-wide-24mm-ca",
    });
    const midY = Math.floor(height / 2);
    let maxRbDiff = 0;
    for (let x = 32; x < width - 1; x += 1) {
      const o = (midY * width + x) * 4;
      maxRbDiff = Math.max(maxRbDiff, Math.abs(result.outputRgba[o] - result.outputRgba[o + 2]));
    }
    expect(maxRbDiff).toBeGreaterThan(25);
  });

  it("깊이 맵 적용 시 초점 평면 영역은 선명도를 유지하고 원거리 아웃포커스 배경은 보케 블러로 부드러워진다", () => {
    const width = 40;
    const height = 40;
    const rgba = createSolidTile(width, height, 20, 20, 20);
    const centerIdx = (20 * width + 20) * 4;
    const farIdx = (6 * width + 20) * 4;
    for (const idx of [centerIdx, farIdx]) {
      rgba[idx] = 250;
      rgba[idx + 1] = 250;
      rgba[idx + 2] = 250;
    }
    const depthMeters = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      depthMeters.fill(y < 14 ? 12.0 : 2.6, y * width, (y + 1) * width);
    }
    const result = applyCinematicLensOpticsToTile({
      width,
      height,
      rgba,
      depthMeters,
      presetId: "dreamy-romance-halation",
      focusDistanceM: 2.6,
      apertureFStop: 1.4,
    });
    expect(result.metrics.maxObservedCocPx).toBeGreaterThan(1.0);
    expect(result.outputRgba[centerIdx + 1]).toBeGreaterThan(result.outputRgba[farIdx + 1]);
  });

  it("할레이션은 고휘도 광원 타일에서 활성화되고 암부 저휘도 타일에서는 미반응(0)이다", () => {
    const brightPlate = createSolidTile(32, 32, 30, 30, 30);
    for (let y = 13; y <= 18; y += 1) {
      for (let x = 13; x <= 18; x += 1) {
        const o = (y * 32 + x) * 4;
        brightPlate[o] = 255;
        brightPlate[o + 1] = 252;
        brightPlate[o + 2] = 248;
      }
    }
    const brightResult = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: brightPlate,
      presetId: "dreamy-romance-halation",
    });
    const darkResult = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: createSolidTile(32, 32, 45, 42, 48),
      presetId: "dreamy-romance-halation",
    });
    expect(brightResult.metrics.halationActivatedPixelCount).toBeGreaterThan(20);
    expect(brightResult.metrics.maxHalationEnergyAdded).toBeGreaterThan(0.05);
    expect(darkResult.metrics.halationActivatedPixelCount).toBe(0);
    expect(darkResult.metrics.maxHalationEnergyAdded).toBe(0);
  });

  it("anamorphic-cinema-2x 할레이션은 2x 스퀴즈에 따라 수평 방향 스트릭이 수직보다 넓게 퍼진다", () => {
    const plate = createSolidTile(41, 41, 10, 10, 10);
    const centerOff = (20 * 41 + 20) * 4;
    plate[centerOff] = 255;
    plate[centerOff + 1] = 255;
    plate[centerOff + 2] = 255;
    const result = applyCinematicLensOpticsToTile({
      width: 41,
      height: 41,
      rgba: plate,
      presetId: "anamorphic-cinema-2x",
    });
    expect(result.outputRgba[(20 * 41 + 25) * 4 + 2]).toBeGreaterThan(
      result.outputRgba[(25 * 41 + 20) * 4 + 2],
    );
  });

  it("prefersReducedMotion: true일 때 실효 셔터 지터가 0px로 고정된다", () => {
    const plate = createTestPlate(24, 24);
    const normal = applyCinematicLensOpticsToTile({
      width: 24,
      height: 24,
      rgba: plate,
      presetId: "action-wide-24mm-ca",
      prefersReducedMotion: false,
    });
    const reduced = applyCinematicLensOpticsToTile({
      width: 24,
      height: 24,
      rgba: plate,
      presetId: "action-wide-24mm-ca",
      prefersReducedMotion: true,
    });
    expect(normal.effectiveShutterJitterPx).toBeGreaterThan(0);
    expect(reduced.effectiveShutterJitterPx).toBe(0);
    expect(reduced.prefersReducedMotion).toBe(true);
  });

  it("동일 입력으로 두 번 실행하면 출력 바이트와 모든 지표가 100% 결정론적으로 일치한다", () => {
    const plate = createTestPlate(32, 32);
    const depth = Float32Array.from({ length: 1024 }, (_, i) => 1.5 + (i % 32) * 0.2);
    const boxes: readonly TextSafeBox[] = [{ id: "t1", x: 4, y: 4, width: 10, height: 8 }];
    const opts = {
      width: 32,
      height: 32,
      rgba: plate,
      depthMeters: depth,
      textSafeBoxes: boxes,
      presetId: "vintage-helios-swirl" as const,
    };
    const runA = applyCinematicLensOpticsToTile(opts);
    const runB = applyCinematicLensOpticsToTile(opts);
    expect(Array.from(runA.outputRgba)).toEqual(Array.from(runB.outputRgba));
    expect(runA.metrics).toEqual(runB.metrics);
  });

  it("잘못된 타일 크기·버퍼 길이·비유효 깊이 맵·비유효 대사 박스 입력은 fail-closed로 거부한다", () => {
    const validRgba = createSolidTile(8, 8, 128, 128, 128);
    const nanDepth = new Float32Array(64).fill(2.5);
    nanDepth[10] = Number.NaN;
    const base = { width: 8, height: 8, rgba: validRgba, presetId: "clean-editorial-50mm" as const };
    expect(() => applyCinematicLensOpticsToTile({ ...base, width: 0 })).toThrow(/유효하지 않은 타일 크기/);
    expect(() => applyCinematicLensOpticsToTile({ ...base, rgba: new Uint8ClampedArray(12) })).toThrow(/RGBA 버퍼 길이/);
    expect(() => applyCinematicLensOpticsToTile({ ...base, depthMeters: new Float32Array(10) })).toThrow(/깊이 맵 길이/);
    expect(() => applyCinematicLensOpticsToTile({ ...base, depthMeters: nanDepth })).toThrow(/비유효 깊이값/);
    expect(() => applyCinematicLensOpticsToTile({ ...base, textSafeBoxes: [{ x: 0, y: 0, width: -5, height: 4 }] })).toThrow(/대사 보호 영역/);
  });
});

describe("Wave 122 — 가독성·인쇄 안전 감사기 및 WebGPU WGSL(64B/16B) 검증", () => {
  it("정상 타일 결과는 auditCinematicPostReadability에서 PASS를 받는다", () => {
    const result = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: createTestPlate(32, 32),
      presetId: "anamorphic-cinema-2x",
      textSafeBoxes: [{ id: "main-dialogue", x: 4, y: 4, width: 12, height: 8, labelKo: "주인공 대사" }],
      prefersReducedMotion: true,
    });
    const audit = auditCinematicPostReadability(result);
    expect(audit.passed).toBe(true);
    expect(audit.grade).toBe("PASS");
    expect(audit.violations).toHaveLength(0);
    expect(audit.textSafeIntact).toBe(true);
    expect(audit.centerClarityIntact).toBe(true);
    expect(audit.vignetteFloorSafe).toBe(true);
    expect(audit.distortionInvertible).toBe(true);
    expect(audit.reducedMotionCompliant).toBe(true);
  });

  it("대사 침범·코너 비네팅 하한 위반·동작 축소 위반 결과는 FAIL로 정확히 차단된다", () => {
    const base = applyCinematicLensOpticsToTile({
      width: 16,
      height: 16,
      rgba: createTestPlate(16, 16),
      presetId: "clean-editorial-50mm",
      textSafeBoxes: [{ x: 2, y: 2, width: 4, height: 4 }],
      prefersReducedMotion: true,
    });
    const tampered: CinematicLensTileResult = {
      ...base,
      effectiveShutterJitterPx: 0.4,
      metrics: {
        ...base.metrics,
        textBoxCorruptedPixelCount: 3,
        minCornerVignetteGain: 0.21,
        centerCaSeparationPx: 0.8,
      },
    };
    const audit = auditCinematicPostReadability(tampered);
    expect(audit.passed).toBe(false);
    expect(audit.grade).toBe("FAIL");
    expect(audit.textSafeIntact).toBe(false);
    expect(audit.vignetteFloorSafe).toBe(false);
    expect(audit.centerClarityIntact).toBe(false);
    expect(audit.reducedMotionCompliant).toBe(false);
    expect(audit.violations.length).toBeGreaterThanOrEqual(4);
  });

  it("5종 프리셋 모두 64B(16바이트 정렬) 유니폼과 컴퓨트/프래그먼트 WGSL을 생성하고 검증을 통과한다", () => {
    for (const presetId of CINEMATIC_LENS_PRESET_IDS) {
      const artifact = buildCinematicLensOpticsWgsl(presetId, {
        workgroupSizeX: 8,
        workgroupSizeY: 8,
        prefersReducedMotion: true,
      });
      const validation = validateCinematicLensOpticsWgsl(artifact);
      expect(artifact.uniformByteSize).toBe(LENS_OPTICS_UNIFORM_BYTE_SIZE);
      expect(artifact.uniformAlignmentBytes).toBe(LENS_OPTICS_UNIFORM_ALIGNMENT);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.uniformByteSizeVerified).toBe(true);
      expect(validation.forbiddenGlslTokensFound).toHaveLength(0);
      expect(validation.detectedEntryPoints).toEqual(["cs_main", "fs_main"]);
      expect(artifact.wgslSource).toContain("PRESET_SHUTTER_JITTER_PX: f32 = 0.000000");
    }
  });

  it("validateCinematicLensOpticsWgsl은 빈 소스·NaN·중괄호 깨짐을 거부한다", () => {
    const valid = buildCinematicLensOpticsWgsl("anamorphic-cinema-2x");
    expect(validateCinematicLensOpticsWgsl({ ...valid, wgslSource: "   " }).valid).toBe(false);
    const nanCheck = validateCinematicLensOpticsWgsl({
      ...valid,
      wgslSource: valid.wgslSource.replace("0.70710678", "NaN"),
    });
    expect(nanCheck.valid).toBe(false);
    expect(nanCheck.errors.some((e) => e.includes("비유한"))).toBe(true);
    expect(validateCinematicLensOpticsWgsl({ ...valid, wgslSource: `${valid.wgslSource}\n}` }).valid).toBe(false);
  });

  it("validateCinematicLensOpticsWgsl은 GLSL 금지어(texture2D/gl_FragCoord/vec4)와 잘못된 유니폼 크기를 거부한다", () => {
    const valid = buildCinematicLensOpticsWgsl("action-wide-24mm-ca");
    const glslInjected = validateCinematicLensOpticsWgsl({
      ...valid,
      wgslSource: `${valid.wgslSource}\n// gl_FragCoord texture2D(a, b) vec4(1.0)`,
    });
    expect(glslInjected.valid).toBe(false);
    expect(glslInjected.forbiddenGlslTokensFound).toEqual(
      expect.arrayContaining(["gl_FragCoord", "texture2D(", "vec4("]),
    );
    const badUniform = validateCinematicLensOpticsWgsl({ ...valid, uniformByteSize: 48 });
    expect(badUniform.valid).toBe(false);
    expect(badUniform.uniformByteSizeVerified).toBe(false);
  });

  it("validateCinematicLensOpticsWgsl은 대사 보호 마스크 분기 함수가 누락된 셰이더를 거부한다", () => {
    const valid = buildCinematicLensOpticsWgsl("clean-editorial-50mm");
    const check = validateCinematicLensOpticsWgsl({
      ...valid,
      wgslSource: valid.wgslSource.replace(/is_text_safe_masked/g, "bypass_check"),
    });
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("is_text_safe_masked"))).toBe(true);
  });
});

describe("Wave 122 — 순수 OKLCH 광학 진단 SVG & 한국어 촬영 감독 브리프", () => {
  it("renderCinematicLensOpticsSvg가 CoC 곡선·보케 실루엣·비네팅 프로파일·대사 보호 영역을 0 NaN으로 렌더링한다", () => {
    const result = applyCinematicLensOpticsToTile({
      width: 48,
      height: 36,
      rgba: createTestPlate(48, 36),
      presetId: "anamorphic-cinema-2x",
      textSafeBoxes: [{ id: "b1", x: 6, y: 4, width: 16, height: 10, labelKo: "말풍선 1" }],
      sceneTitleKo: "네온 옥상 대치 컷",
    });
    const svg = renderCinematicLensOpticsSvg(result, auditCinematicPostReadability(result));
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
    expect(svg).toContain("깊이별 착란원(DoF CoC) 곡선");
    expect(svg).toContain("아나모픽 보케 실루엣");
    expect(svg).toContain("Cos⁴ 물리 비네팅 감쇠 프로파일");
    expect(svg).toContain("대사 보호 안전 영역");
    expect(svg).toContain("<ellipse ");
    expect(svg).toContain("<polyline ");
    expect(svg).toContain("말풍선 1");
  });

  it("렌더링된 SVG는 원시 hex/rgb/rgba/hsl 색상을 단 한 건도 포함하지 않고 오직 oklch(...)만 사용한다", () => {
    const result = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: createTestPlate(32, 32),
      presetId: "dreamy-romance-halation",
      textSafeBoxes: [{ x: 2, y: 2, width: 10, height: 8 }],
    });
    const svg = renderCinematicLensOpticsSvg(result, auditCinematicPostReadability(result));
    const rawHexAttr = new RegExp('(fill|stroke|stop-color)="#', "i");
    const rawRgbFunc = new RegExp("\\brgba?\\s*\\(", "i");
    const rawHslFunc = new RegExp("\\bhsla?\\s*\\(", "i");
    expect(rawHexAttr.test(svg)).toBe(false);
    expect(rawRgbFunc.test(svg)).toBe(false);
    expect(rawHslFunc.test(svg)).toBe(false);
    expect((svg.match(/oklch\(/g) ?? []).length).toBeGreaterThan(25);
  });

  it("SVG 제목과 대사 박스 라벨의 XML 특수문자 및 XSS 태그가 안전하게 이스케이프된다", () => {
    const malicious = `<script>alert("xss")</script> & '컷' > 1`;
    expect(escapeLensOpticsXml(malicious)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;컷&apos; &gt; 1",
    );
    const result = applyCinematicLensOpticsToTile({
      width: 24,
      height: 24,
      rgba: createTestPlate(24, 24),
      presetId: "clean-editorial-50mm",
      textSafeBoxes: [{ x: 2, y: 2, width: 8, height: 6, labelKo: `<대사> & "강조"` }],
      sceneTitleKo: malicious,
    });
    const svg = renderCinematicLensOpticsSvg(result, auditCinematicPostReadability(result));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(svg).toContain("&lt;대사&gt; &amp; &quot;강조&quot;");
  });

  it("summarizeCinematicLensOpticsKo가 번역투 없이 자연스러운 한국어 촬영 감독 브리프를 출력한다", () => {
    const result = applyCinematicLensOpticsToTile({
      width: 32,
      height: 32,
      rgba: createTestPlate(32, 32),
      presetId: "anamorphic-cinema-2x",
      textSafeBoxes: [{ id: "d1", x: 4, y: 4, width: 10, height: 8 }],
      prefersReducedMotion: true,
      sceneTitleKo: "비 오는 골목 첫 만남",
    });
    const brief = summarizeCinematicLensOpticsKo(result, auditCinematicPostReadability(result), {
      generatedDateIso: "2026-11-28",
    });
    expect(brief).toContain("비 오는 골목 첫 만남");
    expect(brief).toContain("2026-11-28");
    expect(brief).toContain("출고 적합");
    expect(brief).toContain("아나모픽 시네마 2x");
    expect(brief).toContain("훼손 0개");
    expect(brief).toContain("동작 축소 모드: 활성");
    expect(brief).not.toContain("가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공");
    expect(brief).not.toContain("원활한 워크플로우를 보장");
    expect(brief).not.toContain("혁신적인");
  });

  it("감사 FAIL 시 한국어 촬영 감독 브리프에 출고 보류 판정과 차단 사유를 명확히 담는다", () => {
    const base = applyCinematicLensOpticsToTile({
      width: 16,
      height: 16,
      rgba: createTestPlate(16, 16),
      presetId: "vintage-helios-swirl",
      textSafeBoxes: [{ x: 2, y: 2, width: 6, height: 6 }],
    });
    const failedResult: CinematicLensTileResult = {
      ...base,
      metrics: { ...base.metrics, textBoxCorruptedPixelCount: 5 },
    };
    const brief = summarizeCinematicLensOpticsKo(
      failedResult,
      auditCinematicPostReadability(failedResult),
    );
    expect(brief).toContain("출고 보류");
    expect(brief).toContain("차단 사유:");
    expect(brief).toContain("5개");
  });
});
