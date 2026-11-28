import { describe, expect, it } from "vitest";
import {
  ANISOTROPIC_METAL_REFLECTION_WGSL,
  CUT_25D_RELIGHTING_RAYMARCH_WGSL,
  OPTICAL_BRUSH_MATERIALS,
  OPTICAL_REFRACTION_DISPERSION_WGSL,
  RELIGHTING_ATMOSPHERE_PRESETS,
  WAVE74_WGSL_SHADER_CONTRACTS,
  applyOpticalRefractionReflectionBrush,
  computeChromaticDispersionOffsets,
  computeSchlickFresnel,
  computeSnellRefractedOffset,
  evaluateAnisotropicWardGgx,
  interpolateAtmosphereByHour,
  linearRgbToOklch,
  marchScreenSpaceSoftShadow,
  oklchToLinearRgb,
  packAnisotropicMetalUniforms,
  packOpticalRefractionUniforms,
  packRelighting25dUniforms,
  reconstructCut25dGeometryMaps,
  relight25dWebtoonCut,
  validateRelightingOpticalWgslContracts,
  validateSingleRelightingWgslContract,
  type RelightingAtmospherePresetId,
} from "./index";

function createSyntheticCharacterCut(
  width: number,
  height: number,
  fillRgb: readonly [number, number, number] = [216, 212, 208],
): { readonly rgba: Uint8ClampedArray; readonly lineartMask: Uint8Array } {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const lineartMask = new Uint8Array(width * height);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const radius = Math.min(width, height) * 0.34;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const o = idx * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (Math.abs(dist - radius) <= 1.15) {
        rgba[o] = 12; rgba[o + 1] = 12; rgba[o + 2] = 14; rgba[o + 3] = 255;
        lineartMask[idx] = 255;
      } else if (dist < radius) {
        rgba[o] = fillRgb[0]; rgba[o + 1] = fillRgb[1]; rgba[o + 2] = fillRgb[2]; rgba[o + 3] = 255;
      } else {
        rgba[o] = 148; rgba[o + 1] = 150; rgba[o + 2] = 154; rgba[o + 3] = 255;
      }
    }
  }
  return { rgba, lineartMask };
}

function createHighContrastStripeCut(width: number, height: number, stripeWidthPx: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const val = Math.floor(x / stripeWidthPx) % 2 === 0 ? 245 : 18;
      rgba[o] = val; rgba[o + 1] = val; rgba[o + 2] = val; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

function createSplitSkyGroundCut(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const splitY = Math.floor(height * 0.5);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      if (y < splitY) {
        rgba[o] = 244; rgba[o + 1] = 68; rgba[o + 2] = 36; rgba[o + 3] = 255;
      } else {
        rgba[o] = 24; rgba[o + 1] = 34; rgba[o + 2] = 56; rgba[o + 3] = 255;
      }
    }
  }
  return rgba;
}

function meanChannelInRect(rgba: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number): readonly [number, number, number] {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const o = (y * width + x) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; n += 1;
    }
  }
  return n > 0 ? [r / n, g / n, b / n] : [0, 0, 0];
}

describe("Wave 74: 2.5D 기하 복원 & 다중 시간대·날씨 리라이팅 엔진", () => {
  it("2D 컷에서 복원한 모든 법선 벡터가 단위 길이(|N| = 1 ± 1e-4)와 양수 nz > 0을 보장한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(48, 48);
    const geom = reconstructCut25dGeometryMaps({ width: 48, height: 48, rgba, lineartMask });
    expect(geom.normalXyz.length).toBe(48 * 48 * 3);
    for (let i = 0; i < 48 * 48; i += 1) {
      const len = Math.hypot(geom.normalXyz[i * 3], geom.normalXyz[i * 3 + 1], geom.normalXyz[i * 3 + 2]);
      expect(Math.abs(len - 1)).toBeLessThan(1e-4);
      expect(geom.normalXyz[i * 3 + 2]).toBeGreaterThan(0);
      expect(geom.roughnessField[i]).toBeGreaterThanOrEqual(0);
      expect(geom.roughnessField[i]).toBeLessThanOrEqual(1);
      expect(geom.metallicField[i]).toBeGreaterThanOrEqual(0);
      expect(geom.metallicField[i]).toBeLessThanOrEqual(1);
    }
  });

  it("원형 인물 좌·우 사면 법선이 바깥쪽으로 대칭 팽창하고 선화는 매트하게 유지한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(48, 48);
    const geom = reconstructCut25dGeometryMaps({ width: 48, height: 48, rgba, lineartMask });
    expect(geom.normalXyz[(24 * 48 + 14) * 3]).toBeLessThan(-0.1);
    expect(geom.normalXyz[(24 * 48 + 34) * 3]).toBeGreaterThan(0.1);
    expect(geom.depthField[24 * 48 + 24]).toBeGreaterThan(geom.meanDepth);
    let checked = 0;
    for (let i = 0; i < 48 * 48; i += 1) {
      if (lineartMask[i] > 200) {
        expect(geom.lineartField[i]).toBeGreaterThan(0.9);
        expect(geom.roughnessField[i]).toBeGreaterThanOrEqual(0.85);
        expect(geom.metallicField[i]).toBeLessThan(0.05);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("명시적 lineartMask 없이도 어두운 흑색 선화를 자동 검출해 선화 커버리지를 복원한다", () => {
    const { rgba } = createSyntheticCharacterCut(40, 40, [222, 200, 185]);
    const geom = reconstructCut25dGeometryMaps({ width: 40, height: 40, rgba });
    expect(geom.lineartCoverage).toBeGreaterThan(0.02);
    expect(geom.lineartCoverage).toBeLessThan(0.35);
  });

  it("사용자 깊이 힌트(depthHints)가 주어지면 전경 깊이를 끌어올리고 경계 법선을 기울인다", () => {
    const w = 32; const h = 32;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(200);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    const hints = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) hints[y * w + x] = x >= 16 ? 0.95 : 0.1;
    }
    const geom = reconstructCut25dGeometryMaps({ width: w, height: h, rgba, depthHints: hints });
    expect(geom.depthField[16 * w + 24]).toBeGreaterThan(geom.depthField[16 * w + 6] + 0.45);
    expect(geom.normalXyz[(16 * w + 16) * 3]).toBeLessThan(-0.15);
  });

  it("OKLCH 왕복 변환(Linear RGB ↔ OKLCH)이 원색과 피부톤에서 1e-4 이내 정확도를 유지한다", () => {
    const samples: readonly (readonly [number, number, number])[] = [
      [0.85, 0.62, 0.52], [0.9, 0.2, 0.15], [0.12, 0.72, 0.36], [0.18, 0.34, 0.88], [0.5, 0.5, 0.5],
    ];
    for (const orig of samples) {
      const back = oklchToLinearRgb(linearRgbToOklch(orig));
      expect(Math.abs(back[0] - orig[0])).toBeLessThan(1e-4);
      expect(Math.abs(back[1] - orig[1])).toBeLessThan(1e-4);
      expect(Math.abs(back[2] - orig[2])).toBeLessThan(1e-4);
    }
  });

  it("좌측 광원 vs 우측 광원 전환 시 하이라이트 무게중심이 왼쪽에서 오른쪽으로 이동한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(52, 52, [225, 225, 225]);
    const geom = reconstructCut25dGeometryMaps({ width: 52, height: 52, rgba, lineartMask, inflationStrength: 1.5 });
    const leftLit = relight25dWebtoonCut({ width: 52, height: 52, rgba, geometry: geom, presetId: "morning-sunlight", keyLightAzimuthOverrideDeg: 180, keyLightElevationOverrideDeg: 30, celMode: "smooth" });
    const rightLit = relight25dWebtoonCut({ width: 52, height: 52, rgba, geometry: geom, presetId: "morning-sunlight", keyLightAzimuthOverrideDeg: 0, keyLightElevationOverrideDeg: 30, celMode: "smooth" });
    expect(leftLit.highlightCentroid[0]).toBeLessThan(24.5);
    expect(rightLit.highlightCentroid[0]).toBeGreaterThan(27.5);
    expect(rightLit.highlightCentroid[0] - leftLit.highlightCentroid[0]).toBeGreaterThan(4.0);
  });

  it("황금 노을은 난색(R > B), 달빛 옥상은 한색(B > R) 색온도를 생성한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(40, 40, [215, 215, 215]);
    const geom = reconstructCut25dGeometryMaps({ width: 40, height: 40, rgba, lineartMask });
    const sunset = relight25dWebtoonCut({ width: 40, height: 40, rgba, geometry: geom, presetId: "golden-sunset" });
    const moonlit = relight25dWebtoonCut({ width: 40, height: 40, rgba, geometry: geom, presetId: "moonlit-rooftop" });
    expect(sunset.averageRgb[0]).toBeGreaterThan(sunset.averageRgb[2] + 0.08);
    expect(moonlit.averageRgb[2]).toBeGreaterThan(moonlit.averageRgb[0] + 0.06);
  });

  it("6종 공식 분위기 프리셋이 모두 NaN 없이 렌더링되며 선화 흑색을 보존한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(36, 36);
    const geom = reconstructCut25dGeometryMaps({ width: 36, height: 36, rgba, lineartMask });
    const ids = Object.keys(RELIGHTING_ATMOSPHERE_PRESETS) as RelightingAtmospherePresetId[];
    expect(ids.length).toBe(6);
    for (const id of ids) {
      const res = relight25dWebtoonCut({ width: 36, height: 36, rgba, geometry: geom, presetId: id });
      expect(Number.isFinite(res.averageRgb[0])).toBe(true);
      let inkSum = 0; let inkCnt = 0;
      for (let p = 0; p < 36 * 36; p += 1) {
        if (lineartMask[p] > 200) {
          inkSum += (res.rgba[p * 4] + res.rgba[p * 4 + 1] + res.rgba[p * 4 + 2]) / 3;
          inkCnt += 1;
        }
      }
      expect(inkSum / inkCnt).toBeLessThan(75);
    }
  });

  it("비 오는 밤 네온 프리셋은 시안·마젠타 이중 림과 저거칠기 스펙큘러 구성을 갖는다", () => {
    const neon = RELIGHTING_ATMOSPHERE_PRESETS["rainy-night-neon"];
    expect(neon.secondaryRimLight).not.toBeNull();
    expect(neon.roughnessScale).toBeLessThan(0.5);
    expect(neon.rimLight.colorRgb[2]).toBeGreaterThan(0.8);
    expect(neon.secondaryRimLight?.colorRgb[0]).toBeGreaterThan(0.8);
  });

  it("극적 촛불(dramatic-candlelight) 점광원은 광원 근처가 밝고 모서리로 갈수록 감쇠한다", () => {
    const w = 48; const h = 48;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 210; rgba[i * 4 + 1] = 205; rgba[i * 4 + 2] = 200; rgba[i * 4 + 3] = 255;
    }
    const res = relight25dWebtoonCut({ width: w, height: h, rgba, presetId: "dramatic-candlelight" });
    const nearCandle = meanChannelInRect(res.rgba, w, 19, 28, 25, 34);
    const farCorner = meanChannelInRect(res.rgba, w, 2, 2, 8, 8);
    expect(nearCandle[0]).toBeGreaterThan(farCorner[0] + 15);
  });

  it("0~24시 연속 시간 보간(interpolateAtmosphereByHour)이 매끄럽고 0시=24시 순환 일치한다", () => {
    const at0 = interpolateAtmosphereByHour(0);
    const at24 = interpolateAtmosphereByHour(24);
    const atMinus2 = interpolateAtmosphereByHour(-2);
    const at22 = interpolateAtmosphereByHour(22);
    expect(Math.abs(at0.kelvin - at24.kelvin)).toBeLessThanOrEqual(1);
    expect(Math.abs(at0.keyLight.intensity - at24.keyLight.intensity)).toBeLessThan(1e-5);
    expect(Math.abs(atMinus2.kelvin - at22.kelvin)).toBeLessThanOrEqual(1);
    let prev = at0.keyLight.intensity;
    for (let hr = 0.5; hr <= 24; hr += 0.5) {
      const curr = interpolateAtmosphereByHour(hr);
      expect(Math.abs(curr.keyLight.intensity - prev)).toBeLessThan(0.25);
      prev = curr.keyLight.intensity;
    }
  });

  it("스크린 공간 광선 마칭 그림자가 높은 전경 차단물 뒤편에 어두운 그림자를 드리우고 광원 반전 시 뒤집힌다", () => {
    const w = 48; const h = 32;
    const depth = new Float32Array(w * h).fill(0.12);
    for (let y = 6; y < 26; y += 1) {
      for (let x = 20; x <= 27; x += 1) depth[y * w + x] = 0.95;
    }
    const shadowRight = marchScreenSpaceSoftShadow(depth, w, h, 31, 16, [-0.9, 0, 0.43], 16, 1.2, 0.3);
    const litLeft = marchScreenSpaceSoftShadow(depth, w, h, 16, 16, [-0.9, 0, 0.43], 16, 1.2, 0.3);
    const shadowLeft = marchScreenSpaceSoftShadow(depth, w, h, 16, 16, [0.9, 0, 0.43], 16, 1.2, 0.3);
    expect(shadowRight).toBeLessThan(0.5);
    expect(litLeft).toBeGreaterThan(0.95);
    expect(shadowLeft).toBeLessThan(0.5);
  });

  it("셀 셰이딩 모드와 부드러운 PBR 모드가 뚜렷이 다른 확산광 톤을 생성한다", () => {
    const { rgba, lineartMask } = createSyntheticCharacterCut(44, 44, [220, 220, 220]);
    const geom = reconstructCut25dGeometryMaps({ width: 44, height: 44, rgba, lineartMask });
    const cel = relight25dWebtoonCut({ width: 44, height: 44, rgba, geometry: geom, presetId: "morning-sunlight", celMode: "cel", celStepsOverride: 2 });
    const smooth = relight25dWebtoonCut({ width: 44, height: 44, rgba, geometry: geom, presetId: "morning-sunlight", celMode: "smooth" });
    let diff = 0;
    for (let i = 0; i < rgba.length; i += 4) if (Math.abs(cel.rgba[i] - smooth.rgba[i]) >= 4) diff += 1;
    expect(diff).toBeGreaterThan(80);
  });
});

describe("Wave 74: 물리 기반 2.5D 광학 굴절·반사 브러시 엔진", () => {
  it("스넬 법칙 굴절 함수가 정면 0편향·경사 굴절 변위·전반사(TIR)를 정확히 판별한다", () => {
    const straight = computeSnellRefractedOffset([0, 0, 1], 1.333, 16);
    expect(straight.totalInternalReflection).toBe(false);
    expect(Math.abs(straight.offsetX)).toBeLessThan(1e-6);
    const tilted = computeSnellRefractedOffset([0.6, 0, 0.8], 1.5, 20);
    expect(tilted.totalInternalReflection).toBe(false);
    expect(Math.abs(tilted.offsetX)).toBeGreaterThan(1.5);
    const tir = computeSnellRefractedOffset([0.85, 0, 0.526], 0.5, 12);
    expect(tir.totalInternalReflection).toBe(true);
  });

  it("슐릭 프레넬(computeSchlickFresnel)이 [0, 1] 경계와 정면 F0·스침각 1.0 법칙을 준수한다", () => {
    expect(computeSchlickFresnel(1.0, 0.02)).toBeCloseTo(0.02, 5);
    expect(computeSchlickFresnel(0.0, 0.02)).toBeCloseTo(1.0, 5);
    expect(computeSchlickFresnel(0.5, 0.04)).toBeGreaterThan(0.04);
    expect(computeSchlickFresnel(Number.NaN, 0.02)).toBeGreaterThanOrEqual(0);
    expect(computeSchlickFresnel(Number.NaN, 0.02)).toBeLessThanOrEqual(1);
  });

  it("물방울과 수정의 RGB 색분산 오프셋이 |offsetR - offsetB| > 0으로 분리된다", () => {
    const rainDisp = computeChromaticDispersionOffsets([0.64, 0.22, 0.735], OPTICAL_BRUSH_MATERIALS["raindrop-glass"].iorRgb, 18);
    const crystalDisp = computeChromaticDispersionOffsets([0.64, 0.22, 0.735], OPTICAL_BRUSH_MATERIALS["frosted-crystal"].iorRgb, 20);
    expect(rainDisp.dispersionSpreadPx).toBeGreaterThan(0.05);
    expect(crystalDisp.dispersionSpreadPx).toBeGreaterThan(0.08);
    expect(rainDisp.red.offsetX).not.toBeCloseTo(rainDisp.blue.offsetX, 4);
  });

  it("raindrop-glass 브러시가 굴절 변위, R/B 색분산, 프레넬 반사를 만들고 원본 버퍼를 보존한다", () => {
    const stripes = createHighContrastStripeCut(64, 64, 4);
    const snapshot = new Uint8ClampedArray(stripes);
    const res = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: stripes, material: "raindrop-glass",
      points: [{ x: 32, y: 32, radiusPx: 16 }], thicknessPx: 20, dispersionScale: 2.2,
    });
    expect(stripes).toEqual(snapshot);
    expect(res.affectedPixelCount).toBeGreaterThan(400);
    expect(res.meanDispersionPx).toBeGreaterThan(0.1);
    expect(res.meanFresnel).toBeGreaterThan(0.02);
    let dispersed = 0; let shifted = 0;
    for (let y = 18; y <= 46; y += 1) {
      for (let x = 18; x <= 46; x += 1) {
        const o = (y * 64 + x) * 4;
        if (Math.abs(res.rgba[o] - res.rgba[o + 2]) >= 4) dispersed += 1;
        if (Math.abs(res.rgba[o + 1] - stripes[o + 1]) >= 25) shifted += 1;
      }
    }
    expect(dispersed).toBeGreaterThan(20);
    expect(shifted).toBeGreaterThan(50);
  });

  it("raindrop-glass 브러시가 광원 반대편 물방울 테두리 바깥에 미세 접촉 그림자를 드리운다", () => {
    const w = 64; const h = 64;
    const flat = new Uint8ClampedArray(w * h * 4).fill(215);
    for (let i = 3; i < flat.length; i += 4) flat[i] = 255;
    const res = applyOpticalRefractionReflectionBrush({
      width: w, height: h, rgba: flat, material: "raindrop-glass",
      points: [{ x: 32, y: 32, radiusPx: 12 }], lightDirection: [-0.7, -0.7, 0.5],
    });
    // 광원이 좌상단(-X, -Y)이므로 우하단 테두리 외곽(41, 41)에 접촉 그림자 형성
    const shadowPx = res.rgba[(41 * w + 41) * 4];
    expect(shadowPx).toBeLessThan(200);
  });

  it("frosted-crystal 브러시가 고대비 줄무늬를 흐리게 투과시키고 다면체 커스틱스를 더한다", () => {
    const stripes = createHighContrastStripeCut(64, 64, 3);
    const res = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: stripes, material: "frosted-crystal",
      points: [{ x: 32, y: 32, radiusPx: 16 }], frostBlurPx: 3.5, thicknessPx: 16,
    });
    expect(res.affectedPixelCount).toBeGreaterThan(400);
    expect(res.meanDispersionPx).toBeGreaterThan(0.05);
    let lifted = 0;
    for (let y = 22; y <= 42; y += 1) {
      for (let x = 22; x <= 42; x += 1) {
        const o = (y * 64 + x) * 4;
        if (stripes[o] < 30 && res.rgba[o] > 55) lifted += 1;
      }
    }
    expect(lifted).toBeGreaterThan(40);
  });

  it("anisotropic-blade-metal 브러시는 스트로크 접선 각도 회전(0° vs 90°)에 따라 반사 광택이 달라진다", () => {
    const base = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i += 1) {
      base[i * 4] = 44; base[i * 4 + 1] = 48; base[i * 4 + 2] = 56; base[i * 4 + 3] = 255;
    }
    const horiz = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: base, material: "anisotropic-blade-metal",
      points: [{ x: 14, y: 32, radiusPx: 10 }, { x: 50, y: 32, radiusPx: 10 }], lightDirection: [-0.78, -0.05, 0.62],
    });
    const vert = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: base, material: "anisotropic-blade-metal",
      points: [{ x: 32, y: 14, radiusPx: 10 }, { x: 32, y: 50, radiusPx: 10 }], lightDirection: [-0.78, -0.05, 0.62],
    });
    expect(Math.abs(horiz.strokeTangent[0])).toBeGreaterThan(0.99);
    expect(Math.abs(vert.strokeTangent[1])).toBeGreaterThan(0.99);
    expect(Math.abs(meanChannelInRect(vert.rgba, 64, 28, 28, 36, 36)[0] - meanChannelInRect(horiz.rgba, 64, 28, 28, 36, 36)[0])).toBeGreaterThan(8);
    expect(evaluateAnisotropicWardGgx([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, 0, 1], [-0.78, 0, 0.62], 0.08, 0.5))
      .toBeGreaterThan(evaluateAnisotropicWardGgx([0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-0.78, 0, 0.62], 0.08, 0.5) * 2);
  });

  it("wet-puddle-mirror 브러시가 상단 컷 적색을 하단 웅덩이에 반사하고 스침각에서 프레넬이 강해진다", () => {
    const splitCut = createSplitSkyGroundCut(64, 64);
    const steep = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: splitCut, material: "wet-puddle-mirror",
      points: [{ x: 18, y: 44, radiusPx: 12 }, { x: 46, y: 44, radiusPx: 12 }], puddleWaterlineY: 32, puddleTiltDeg: 18, rippleAmplitude: 0.08,
    });
    const grazing = applyOpticalRefractionReflectionBrush({
      width: 64, height: 64, rgba: splitCut, material: "wet-puddle-mirror",
      points: [{ x: 18, y: 44, radiusPx: 12 }, { x: 46, y: 44, radiusPx: 12 }], puddleWaterlineY: 32, puddleTiltDeg: 82, rippleAmplitude: 0.08,
    });
    expect(grazing.meanFresnel).toBeGreaterThan(steep.meanFresnel + 0.35);
    const rGrazing = meanChannelInRect(grazing.rgba, 64, 24, 40, 40, 48)[0];
    const rSteep = meanChannelInRect(steep.rgba, 64, 24, 40, 40, 48)[0];
    expect(rGrazing).toBeGreaterThan(120);
    expect(rGrazing).toBeGreaterThan(rSteep + 60);
  });

  it("캔버스 경계 밖 스트로크와 빈 스트로크(points=[])에서 OOB·NaN 없이 안전하게 동작한다", () => {
    const cut = createHighContrastStripeCut(24, 24, 4);
    const oob = applyOpticalRefractionReflectionBrush({
      width: 24, height: 24, rgba: cut, material: "raindrop-glass",
      points: [{ x: -12, y: -8, radiusPx: 20 }, { x: 34, y: 30, radiusPx: 20 }],
    });
    expect(oob.dirtyBounds.minX).toBeGreaterThanOrEqual(0);
    expect(oob.dirtyBounds.maxX).toBeLessThan(24);
    for (let i = 0; i < oob.rgba.length; i += 1) expect(Number.isFinite(oob.rgba[i])).toBe(true);

    const noPoints = applyOpticalRefractionReflectionBrush({ width: 24, height: 24, rgba: cut, material: "frosted-crystal", points: [] });
    expect(noPoints.affectedPixelCount).toBe(0);
    expect(noPoints.rgba).toEqual(cut);
  });
});

describe("Wave 74: WebGPU WGSL 셰이더 계약, 16-byte 유니폼 정렬 및 엣지 케이스", () => {
  it("3종 WebGPU 컴퓨트 WGSL 셰이더 전체 계약 검증이 통과한다", () => {
    const report = validateRelightingOpticalWgslContracts();
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.results.length).toBe(3);
    expect(CUT_25D_RELIGHTING_RAYMARCH_WGSL).toContain("@workgroup_size(8, 8, 1)");
    expect(OPTICAL_REFRACTION_DISPERSION_WGSL).toContain("@workgroup_size(8, 8, 1)");
    expect(ANISOTROPIC_METAL_REFLECTION_WGSL).toContain("@workgroup_size(8, 8, 1)");
  });

  it("정적 WGSL 검증기가 손상된 괄호·누락 바인딩·16-byte 미정렬 계약을 검출한다", () => {
    const broken = CUT_25D_RELIGHTING_RAYMARCH_WGSL.replace("outputField", "missingOut") + "{";
    const bad = validateSingleRelightingWgslContract(broken, { ...WAVE74_WGSL_SHADER_CONTRACTS[0], uniformByteLength: 100 });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("3종 유니폼 패커가 모두 16-byte 배수 정렬 버퍼와 유한한 값을 생성한다", () => {
    const uRelight = packRelighting25dUniforms({ width: 1920, height: 1080, presetId: "golden-sunset" });
    const uOptical = packOpticalRefractionUniforms({ width: 1920, height: 1080, material: "frosted-crystal", thicknessPx: 22 });
    const uMetal = packAnisotropicMetalUniforms({ width: 1920, height: 1080, alphaT: 0.08, alphaB: 0.45 });
    expect(uRelight.byteLength).toBe(112);
    expect(uOptical.byteLength).toBe(64);
    expect(uMetal.byteLength).toBe(64);
    expect(uRelight.byteLength % 16).toBe(0);
    expect(uOptical.byteLength % 16).toBe(0);
    expect(uMetal.byteLength % 16).toBe(0);
    expect(uRelight[0]).toBe(1920);
    expect(uOptical[4]).toBeCloseTo(OPTICAL_BRUSH_MATERIALS["frosted-crystal"].iorRgb[0], 4);
    expect(uMetal[8]).toBeCloseTo(0.88, 4);
    for (const buf of [uRelight, uOptical, uMetal]) {
      for (let i = 0; i < buf.length; i += 1) expect(Number.isFinite(buf[i])).toBe(true);
    }
  });

  it("빈 이미지(0x0)와 1x1 이미지에서 기하 복원·리라이팅·광학 브러시가 안전하게 복구된다", () => {
    expect(reconstructCut25dGeometryMaps({ width: 0, height: 0, rgba: new Uint8ClampedArray(0) }).normalXyz.length).toBe(0);
    expect(relight25dWebtoonCut({ width: 0, height: 0, rgba: new Uint8ClampedArray(0), presetId: "overcast-studio" }).rgba.length).toBe(0);
    expect(applyOpticalRefractionReflectionBrush({ width: 0, height: 0, rgba: new Uint8ClampedArray(0), material: "wet-puddle-mirror", points: [{ x: 0, y: 0, radiusPx: 5 }] }).affectedPixelCount).toBe(0);

    const single = new Uint8ClampedArray([180, 120, 90, 255]);
    expect(reconstructCut25dGeometryMaps({ width: 1, height: 1, rgba: single }).normalXyz[2]).toBeGreaterThan(0.99);
    const r1 = relight25dWebtoonCut({ width: 1, height: 1, rgba: single, hourOfDay: 16.5 });
    expect(r1.rgba.length).toBe(4);
    expect(Number.isFinite(r1.rgba[0])).toBe(true);
    const b1 = applyOpticalRefractionReflectionBrush({ width: 1, height: 1, rgba: single, material: "anisotropic-blade-metal", points: [{ x: 0, y: 0, radiusPx: 3 }] });
    expect(b1.affectedPixelCount).toBe(1);
  });
});
