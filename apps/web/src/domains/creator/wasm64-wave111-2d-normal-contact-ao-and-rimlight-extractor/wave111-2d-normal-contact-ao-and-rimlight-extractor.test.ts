import { describe, expect, it } from "vitest";
import {
  binarizeSilhouetteMask,
  buildNormalAoRimWgsl,
  computeExactMaskInteriorEdt,
  computeInflated2dNormalField,
  encodeNormalFieldToRgba,
  escapeLightingSvgXml,
  evaluateBevelProfileHeight,
  evaluateCelShadowRamp,
  normalizeVec3Safe,
  renderLightingPassBreakdownSvg,
  summarizeNormalAoRimPassKo,
  synthesizeCelShadowContactAoAndRimPass,
  validateNormalAoRimWgsl,
  type ContactAoOccluderLayer,
  type NormalInflationProfile,
} from "./index";

function makeCircleMask(w: number, h: number, cx: number, cy: number, r: number, fill = 255): Uint8Array {
  const mask = new Uint8Array(w * h);
  const r2 = r * r;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * w + x] = fill;
    }
  }
  return mask;
}

function makeRectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number, fill = 255): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y += 1) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x += 1) mask[y * w + x] = fill;
  }
  return mask;
}

function makeConcaveLShapeMask(w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = 3; y <= h - 4; y += 1) {
    for (let x = 3; x <= w - 4; x += 1) {
      if (x <= Math.floor(w * 0.45) || y >= Math.floor(h * 0.55)) mask[y * w + x] = 255;
    }
  }
  return mask;
}

function computeBruteForceEdt(binaryMask: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const zeros: Array<[number, number]> = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) if (binaryMask[y * w + x] === 0) zeros.push([x, y]);
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (binaryMask[idx] === 0) continue;
      let bestSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zeros.length; i += 1) {
        const z = zeros[i];
        if (!z) continue;
        const d2 = (x - z[0]) * (x - z[0]) + (y - z[1]) * (y - z[1]);
        if (d2 < bestSq) bestSq = d2;
      }
      out[idx] = Math.sqrt(bestSq);
    }
  }
  return out;
}

function readNormal(normals: Float32Array, w: number, x: number, y: number): [number, number, number] {
  const idx = (y * w + x) * 3;
  return [normals[idx] ?? 0, normals[idx + 1] ?? 0, normals[idx + 2] ?? 1];
}

function regionMean(
  buf: Float32Array,
  bin: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let sum = 0;
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const idx = y * w + x;
      if (bin[idx] === 1) {
        sum += buf[idx] ?? 0;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

const ALL_PROFILES: readonly NormalInflationProfile[] = [
  "soft-organic",
  "cel-bevel",
  "chiseled-hard-surface",
];

describe("Wave 111 — 2D 실루엣 법선장·접촉 AO & 림라이트 자동 추출 엔진", () => {
  describe("1. Meijster O(W×H) 정확 내부 유클리드 거리 변환(EDT)", () => {
    it("중심 원형 마스크에서 중심 거리가 반지름과 <= 1.0px 오차로 일치하고 대칭을 보존한다", () => {
      const w = 65;
      const edt = computeExactMaskInteriorEdt(makeCircleMask(w, w, 32, 32, 20), w, w);
      expect(Math.abs((edt.distanceField[32 * w + 32] ?? 0) - 20)).toBeLessThanOrEqual(1.0);
      expect(edt.distanceField[0]).toBe(0);
      expect(edt.distanceField[w * w - 1]).toBe(0);

      for (const offset of [4, 10, 16, 19]) {
        const l = edt.distanceField[32 * w + (32 - offset)] ?? 0;
        const r = edt.distanceField[32 * w + (32 + offset)] ?? 0;
        const t = edt.distanceField[(32 - offset) * w + 32] ?? 0;
        const b = edt.distanceField[(32 + offset) * w + 32] ?? 0;
        expect(Math.abs(l - r)).toBeLessThan(1e-5);
        expect(Math.abs(t - b)).toBeLessThan(1e-5);
        expect(Math.abs(l - t)).toBeLessThan(1e-5);
      }
    });

    it("직사각형 마스크에서 중심 거리가 절반 높이(12.5px)와 <= 1.0px 이내로 일치한다", () => {
      const w = 64;
      const edt = computeExactMaskInteriorEdt(makeRectMask(w, w, 11, 19, 51, 43), w, w);
      expect(Math.abs((edt.distanceField[31 * w + 31] ?? 0) - 12.5)).toBeLessThanOrEqual(1.0);
      expect(edt.distanceField[19 * w + 31]).toBeCloseTo(1.0, 5);
      expect(edt.distanceField[31 * w + 11]).toBeCloseTo(1.0, 5);
      expect(edt.distanceField[18 * w + 31]).toBe(0);
    });

    it("비볼록 L자 실루엣에서 Meijster EDT가 전수 브루트포스 유클리드 거리와 픽셀 단위로 일치한다", () => {
      const w = 28;
      const edt = computeExactMaskInteriorEdt(makeConcaveLShapeMask(w, w), w, w);
      const ref = computeBruteForceEdt(edt.binaryMask, w, w);
      let maxDiff = 0;
      for (let i = 0; i < w * w; i += 1) {
        maxDiff = Math.max(maxDiff, Math.abs((edt.distanceField[i] ?? 0) - (ref[i] ?? 0)));
      }
      expect(maxDiff).toBeLessThan(1e-5);
    });

    it("이진(0/1) 마스크와 8비트 알파(0/255) 마스크를 동일한 내부 마스크로 정규화한다", () => {
      const binRes = binarizeSilhouetteMask(makeCircleMask(32, 32, 16, 16, 10, 1), 32, 32);
      const alphaRes = binarizeSilhouetteMask(makeCircleMask(32, 32, 16, 16, 10, 255), 32, 32);
      expect(binRes.isBinaryMaskInput).toBe(true);
      expect(binRes.effectiveAlphaThreshold).toBe(1);
      expect(alphaRes.isBinaryMaskInput).toBe(false);
      expect(alphaRes.effectiveAlphaThreshold).toBe(128);
      expect(Array.from(binRes.binaryMask)).toEqual(Array.from(alphaRes.binaryMask));
    });

    it("빈 마스크(전부 0)와 가득 찬 마스크(전부 255)를 NaN 없이 안전하게 처리한다", () => {
      const w = 24;
      const emptyEdt = computeExactMaskInteriorEdt(new Uint8Array(w * w), w, w);
      expect(emptyEdt.interiorPixelCount).toBe(0);
      expect(emptyEdt.maxDistancePx).toBe(0);

      const fullMask = new Uint8Array(w * w);
      fullMask.fill(255);
      const fullEdt = computeExactMaskInteriorEdt(fullMask, w, w);
      expect(fullEdt.interiorPixelCount).toBe(w * w);
      expect(fullEdt.maxDistancePx).toBeGreaterThanOrEqual(11);
      expect(fullEdt.maxDistancePx).toBeLessThanOrEqual(13);
      for (let i = 0; i < w * w; i += 1) expect(Number.isFinite(fullEdt.distanceField[i])).toBe(true);
    });
  });

  describe("2. 3종 베벨 프로파일 2D 법선장 팽창 및 기하 불변식", () => {
    it.each(ALL_PROFILES)(
      "%s 프로파일에서 모든 내부 픽셀이 단위 법선(|n|=1±1e-5, nz>=0)을 만족하고 외곽은 (0,0,1)이다",
      (profile) => {
        const w = 49;
        const field = computeInflated2dNormalField(makeCircleMask(w, w, 24, 24, 16), w, w, { profile });
        expect(field.interiorPixelCount).toBeGreaterThan(700);
        expect(field.maxNormalLengthError).toBeLessThan(1e-5);
        expect(field.minInteriorNz).toBeGreaterThanOrEqual(0);
        for (let i = 0; i < w * w; i += 1) {
          const nx = field.normals[i * 3] ?? 0;
          const ny = field.normals[i * 3 + 1] ?? 0;
          const nz = field.normals[i * 3 + 2] ?? 1;
          expect(Math.abs(Math.hypot(nx, ny, nz) - 1)).toBeLessThan(1e-5);
          if (field.binaryMask[i] === 1) {
            expect(nz).toBeGreaterThanOrEqual(0);
          } else {
            expect([nx, ny, nz]).toEqual([0, 0, 1]);
          }
        }
      },
    );

    it.each(ALL_PROFILES)(
      "%s 프로파일 대칭 원형 마스크에서 좌·우·상·하 방향 부호와 중앙 (0,0,1) 대칭 불변식을 만족한다",
      (profile) => {
        const w = 65;
        const field = computeInflated2dNormalField(makeCircleMask(w, w, 32, 32, 20), w, w, { profile });
        const left = readNormal(field.normals, w, 13, 32);
        const right = readNormal(field.normals, w, 51, 32);
        const top = readNormal(field.normals, w, 32, 13);
        const bottom = readNormal(field.normals, w, 32, 51);
        const center = readNormal(field.normals, w, 32, 32);

        expect(left[0]).toBeLessThan(-0.3);
        expect(right[0]).toBeGreaterThan(0.3);
        expect(top[1]).toBeLessThan(-0.3);
        expect(bottom[1]).toBeGreaterThan(0.3);
        expect(Math.abs(left[0] + right[0])).toBeLessThan(1e-4);
        expect(Math.abs(top[1] + bottom[1])).toBeLessThan(1e-4);
        expect(Math.abs(left[1])).toBeLessThan(1e-4);
        expect(Math.abs(top[0])).toBeLessThan(1e-4);
        expect(Math.abs(center[0])).toBeLessThan(1e-5);
        expect(Math.abs(center[1])).toBeLessThan(1e-5);
        expect(center[2]).toBeGreaterThan(0.99);
      },
    );

    it("3종 베벨 프로파일이 중간 반경에서 서로 다른 곡률·평탄 프로파일을 생성한다", () => {
      const w = 65;
      const mask = makeCircleMask(w, w, 32, 32, 22);
      const organic = computeInflated2dNormalField(mask, w, w, { profile: "soft-organic" });
      const cel = computeInflated2dNormalField(mask, w, w, { profile: "cel-bevel" });
      const chiseled = computeInflated2dNormalField(mask, w, w, { profile: "chiseled-hard-surface" });

      expect(readNormal(chiseled.normals, w, 25, 32)[2]).toBeGreaterThan(0.99);
      expect(readNormal(organic.normals, w, 25, 32)[2]).toBeLessThan(0.985);
      expect(evaluateBevelProfileHeight(0, "soft-organic")).toBe(0);
      expect(evaluateBevelProfileHeight(1, "soft-organic")).toBe(1);
      expect(evaluateBevelProfileHeight(0.5, "soft-organic")).toBeGreaterThan(
        evaluateBevelProfileHeight(0.5, "cel-bevel"),
      );
      expect(evaluateBevelProfileHeight(0.5, "cel-bevel")).toBeGreaterThan(
        evaluateBevelProfileHeight(0.5, "chiseled-hard-surface"),
      );
      expect(cel.effectiveBevelRadiusPx).toBeGreaterThan(chiseled.effectiveBevelRadiusPx);
    });

    it("경계 보존 대칭 평활화(smoothPasses=2) 후에도 대칭성과 단위 법선 길이가 유지된다", () => {
      const w = 49;
      const smoothed = computeInflated2dNormalField(makeCircleMask(w, w, 24, 24, 16), w, w, {
        profile: "soft-organic",
        smoothPasses: 2,
      });
      expect(smoothed.maxNormalLengthError).toBeLessThan(1e-5);
      expect(Math.abs(readNormal(smoothed.normals, w, 10, 24)[0] + readNormal(smoothed.normals, w, 38, 24)[0])).toBeLessThan(1e-4);
      expect(readNormal(smoothed.normals, w, 24, 24)[2]).toBeGreaterThan(0.99);
    });

    it("탄젠트 공간 RGBA8 노멀맵 인코딩이 중앙(128,128,255,255)과 좌우 채널·외곽 투명을 정확히 기록한다", () => {
      const w = 49;
      const rgba = encodeNormalFieldToRgba(
        computeInflated2dNormalField(makeCircleMask(w, w, 24, 24, 16), w, w, { profile: "soft-organic" }),
      );
      const c = (24 * w + 24) * 4;
      expect([rgba[c], rgba[c + 1], rgba[c + 2], rgba[c + 3]]).toEqual([128, 128, 255, 255]);
      expect(rgba[(24 * w + 10) * 4] ?? 128).toBeLessThan(100);
      expect(rgba[(24 * w + 38) * 4] ?? 128).toBeGreaterThan(155);
      expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([0, 0, 0, 0]);
    });
  });

  describe("3. 셀 음영 방향 반전·밴드 양자화·다중 레이어 접촉 AO & 프레넬 림라이트", () => {
    it("키 라이트를 좌측(-1,0,0.5)에서 우측(+1,0,0.5)으로 옮기면 밝은 반구가 좌측에서 우측으로 대칭 반전된다", () => {
      const w = 65;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 32, 32, 22), w, w);
      const litLeft = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [-1, 0, 0.5], bandCount: 3 });
      const litRight = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [1, 0, 0.5], bandCount: 3 });

      const lWhenL = regionMean(litLeft.celShadeBuffer, field.binaryMask, w, 10, 18, 28, 46);
      const rWhenL = regionMean(litLeft.celShadeBuffer, field.binaryMask, w, 36, 18, 54, 46);
      const lWhenR = regionMean(litRight.celShadeBuffer, field.binaryMask, w, 10, 18, 28, 46);
      const rWhenR = regionMean(litRight.celShadeBuffer, field.binaryMask, w, 36, 18, 54, 46);

      expect(lWhenL).toBeGreaterThan(rWhenL + 0.35);
      expect(rWhenR).toBeGreaterThan(lWhenR + 0.35);
      expect(Math.abs(lWhenL - rWhenR)).toBeLessThan(1e-4);
      expect(Math.abs(rWhenL - lWhenR)).toBeLessThan(1e-4);
    });

    it("상단 키 라이트(0,-1,0.5)와 하단 키 라이트(0,+1,0.5)가 상·하반구 셀 음영을 정확히 반전시킨다", () => {
      const w = 65;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 32, 32, 20), w, w);
      const topLit = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [0, -1, 0.5], bandCount: 2 });
      const botLit = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [0, 1, 0.5], bandCount: 2 });

      expect(regionMean(topLit.celShadeBuffer, field.binaryMask, w, 18, 12, 46, 28)).toBeGreaterThan(
        regionMean(topLit.celShadeBuffer, field.binaryMask, w, 18, 36, 46, 52) + 0.35,
      );
      expect(regionMean(botLit.celShadeBuffer, field.binaryMask, w, 18, 36, 46, 52)).toBeGreaterThan(
        regionMean(botLit.celShadeBuffer, field.binaryMask, w, 18, 12, 46, 28) + 0.35,
      );
    });

    it("셀 음영 밴드 수(2/3/4)와 hard terminator(softness=0)가 정확한 이산 스텝을 출력한다", () => {
      expect(evaluateCelShadowRamp(-0.8, 2, 0, 0)).toBe(0);
      expect(evaluateCelShadowRamp(0.9, 2, 0, 0)).toBe(1);
      const band3 = new Set<number>();
      const band4 = new Set<number>();
      for (let i = -10; i <= 10; i += 1) {
        band3.add(Number(evaluateCelShadowRamp(i / 10, 3, 0, 0).toFixed(4)));
        band4.add(Number(evaluateCelShadowRamp(i / 10, 4, 0, 0).toFixed(4)));
      }
      expect(Array.from(band3).sort((a, b) => a - b)).toEqual([0, 0.5, 1]);
      expect(Array.from(band4).sort((a, b) => a - b)).toEqual([0, 0.3333, 0.6667, 1]);
    });

    it("terminatorShift를 양수로 올리면 명부 비율이 늘어나고 음수로 내리면 암부 비율이 늘어난다", () => {
      const field = computeInflated2dNormalField(makeCircleMask(49, 49, 24, 24, 18), 49, 49);
      const dark = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [-0.8, -0.3, 0.5], terminatorShift: -0.35 });
      const mid = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [-0.8, -0.3, 0.5], terminatorShift: 0 });
      const light = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [-0.8, -0.3, 0.5], terminatorShift: 0.35 });
      expect(dark.telemetry.meanInteriorCel).toBeLessThan(mid.telemetry.meanInteriorCel);
      expect(mid.telemetry.meanInteriorCel).toBeLessThan(light.telemetry.meanInteriorCel);
    });

    it("상위 앞머리(Bangs) 차폐 마스크 배치 시 이마 접촉부 AO가 열린 볼보다 어두워지고 거리에 따라 감쇠한다", () => {
      const w = 65;
      const faceField = computeInflated2dNormalField(makeCircleMask(w, w, 32, 34, 22), w, w);
      const occluder: ContactAoOccluderLayer = {
        id: "hair-bangs",
        labelKo: "앞머리 레이어",
        mask: makeRectMask(w, w, 14, 10, 50, 25),
        elevationPx: 2.5,
        opacity: 0.9,
        rayDistancePx: 12,
        creaseRadiusPx: 4,
      };
      const pass = synthesizeCelShadowContactAoAndRimPass(
        faceField,
        { keyLightDir: [-0.2, -0.85, 0.48], bandCount: 3 },
        [occluder],
      );

      const underBangs = regionMean(pass.contactAoBuffer, faceField.binaryMask, w, 24, 18, 40, 24);
      const creaseBelow = regionMean(pass.contactAoBuffer, faceField.binaryMask, w, 24, 26, 40, 29);
      const midFalloff = regionMean(pass.contactAoBuffer, faceField.binaryMask, w, 24, 31, 40, 35);
      const openCheek = regionMean(pass.contactAoBuffer, faceField.binaryMask, w, 24, 42, 40, 49);

      expect(underBangs).toBeLessThan(openCheek - 0.4);
      expect(creaseBelow).toBeLessThan(openCheek - 0.15);
      expect(underBangs).toBeLessThan(creaseBelow);
      expect(creaseBelow).toBeLessThan(midFalloff);
      expect(midFalloff).toBeLessThanOrEqual(openCheek);
      expect(openCheek).toBeGreaterThan(0.95);
    });

    it("다중 차폐 레이어(앞머리 + 셔츠 칼라)가 각각의 접촉 영역을 독립적으로 어둡게 만든다", () => {
      const w = 65;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 32, 32, 24), w, w, { profile: "cel-bevel" });
      const pass = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [0, -0.7, 0.7], bandCount: 3 },
        [
          { id: "bangs", labelKo: "앞머리", mask: makeRectMask(w, w, 14, 8, 50, 20), opacity: 0.85 },
          { id: "collar", labelKo: "셔츠 칼라", mask: makeRectMask(w, w, 14, 44, 50, 56), opacity: 0.8 },
        ],
      );
      const topAo = regionMean(pass.contactAoBuffer, field.binaryMask, w, 22, 14, 42, 20);
      const midAo = regionMean(pass.contactAoBuffer, field.binaryMask, w, 22, 30, 42, 36);
      const botAo = regionMean(pass.contactAoBuffer, field.binaryMask, w, 22, 44, 42, 50);

      expect(pass.telemetry.occluderLayerCount).toBe(2);
      expect(topAo).toBeLessThan(midAo - 0.35);
      expect(botAo).toBeLessThan(midAo - 0.35);
      expect(pass.telemetry.nanCount).toBe(0);
    });

    it("차폐 레이어가 없으면 내부 접촉 AO는 1.0을 유지하고 마스크 외곽은 0을 유지한다", () => {
      const field = computeInflated2dNormalField(makeCircleMask(41, 41, 20, 20, 14), 41, 41);
      const pass = synthesizeCelShadowContactAoAndRimPass(field, { keyLightDir: [-0.6, -0.5, 0.6] });
      expect(pass.telemetry.meanInteriorAo).toBeCloseTo(1.0, 5);
      expect(pass.telemetry.minInteriorAo).toBeCloseTo(1.0, 5);
      expect(pass.contactAoBuffer[0]).toBe(0);
    });

    it("프레넬 림라이트는 역광 실루엣 가장자리에서 피크를 이루고 깊은 중앙에서는 0에 수렴한다", () => {
      const w = 65;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 32, 32, 22), w, w);
      const pass = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [-0.8, -0.3, 0.52],
        rimLightDir: [0.95, 0, 0.31],
        rimPower: 2.2,
        rimIntensity: 1.0,
      });

      const rightEdgeRim = pass.rimBuffer[32 * w + 53] ?? 0;
      const centerRim = pass.rimBuffer[32 * w + 32] ?? 0;
      const leftEdgeRim = pass.rimBuffer[32 * w + 11] ?? 0;

      expect(rightEdgeRim).toBeGreaterThan(0.25);
      expect(centerRim).toBeLessThan(1e-4);
      expect(rightEdgeRim).toBeGreaterThan(Math.max(centerRim, 1e-4) * 3);
      expect(leftEdgeRim).toBeLessThan(0.05);
      expect(pass.telemetry.outsideMaskLeakPixels).toBe(0);
    });

    it("rimPower를 높이면 림 밴드가 좁혀지고 rimIntensity=0이면 림 버퍼가 전부 0이 된다", () => {
      const field = computeInflated2dNormalField(makeCircleMask(65, 65, 32, 32, 22), 65, 65);
      const broad = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [-0.7, -0.3, 0.64],
        rimLightDir: [0.92, 0, 0.39],
        rimPower: 1.4,
        rimIntensity: 1.0,
      });
      const tight = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [-0.7, -0.3, 0.64],
        rimLightDir: [0.92, 0, 0.39],
        rimPower: 5.0,
        rimIntensity: 1.0,
      });
      const zero = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [-0.7, -0.3, 0.64],
        rimLightDir: [0.92, 0, 0.39],
        rimIntensity: 0,
      });
      expect(tight.telemetry.meanInteriorRim).toBeLessThan(broad.telemetry.meanInteriorRim);
      expect(zero.telemetry.rimPeakIntensity).toBe(0);
      expect(zero.telemetry.rimLitPixelCount).toBe(0);
    });

    it("비볼록 L자 실루엣에서 cel/AO/rim/RGBA 모든 버퍼의 마스크 외곽 번짐이 정확히 0px이다", () => {
      const w = 44;
      const field = computeInflated2dNormalField(makeConcaveLShapeMask(w, w), w, w, { profile: "cel-bevel" });
      const pass = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [-0.6, -0.6, 0.5], rimLightDir: [0.85, 0.2, 0.48], bandCount: 4 },
        [{ id: "occ", mask: makeRectMask(w, w, 6, 6, 36, 18) }],
      );
      expect(pass.telemetry.outsideMaskLeakPixels).toBe(0);
      expect(pass.telemetry.nanCount).toBe(0);
      for (let i = 0; i < w * w; i += 1) {
        if (field.binaryMask[i] === 0) {
          expect(pass.celShadeBuffer[i]).toBe(0);
          expect(pass.contactAoBuffer[i]).toBe(0);
          expect(pass.rimBuffer[i]).toBe(0);
          expect(pass.compositeRgba[i * 4 + 3]).toBe(0);
        } else {
          expect(pass.compositeRgba[i * 4 + 3]).toBe(255);
        }
      }
    });

    it("합성 RGBA 프리뷰가 AO 어두워짐·림 밝아짐을 반영하고 반투명 알파를 정확히 보존한다", () => {
      const w = 49;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 24, 24, 16, 210), w, w);
      const base = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [-0.6, -0.4, 0.69],
        rimLightDir: [0.95, 0, 0.31],
        rimIntensity: 0,
      });
      const full = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [-0.6, -0.4, 0.69], rimLightDir: [0.95, 0, 0.31], rimIntensity: 1.1, contactAoStrength: 0.7 },
        [{ id: "bangs", mask: makeRectMask(w, w, 10, 8, 38, 22), opacity: 0.9 }],
      );
      expect(full.compositeRgba[(24 * w + 24) * 4 + 3]).toBe(210);
      expect(full.compositeRgba[(16 * w + 24) * 4] ?? 0).toBeLessThan(base.compositeRgba[(16 * w + 24) * 4] ?? 0);
      expect(full.compositeRgba[(24 * w + 39) * 4] ?? 0).toBeGreaterThan(base.compositeRgba[(24 * w + 39) * 4] ?? 0);
    });

    it("동일 입력을 두 번 실행하면 모든 수치·RGBA 버퍼가 바이트 단위로 100% 결정론적으로 일치한다", () => {
      const w = 41;
      const mask = makeCircleMask(w, w, 20, 20, 14);
      const occ = makeRectMask(w, w, 8, 6, 32, 16);
      const fieldA = computeInflated2dNormalField(mask, w, w, { profile: "cel-bevel" });
      const fieldB = computeInflated2dNormalField(mask, w, w, { profile: "cel-bevel" });
      const passA = synthesizeCelShadowContactAoAndRimPass(fieldA, { keyLightDir: [-0.7, -0.5, 0.5] }, [{ id: "h", mask: occ }]);
      const passB = synthesizeCelShadowContactAoAndRimPass(fieldB, { keyLightDir: [-0.7, -0.5, 0.5] }, [{ id: "h", mask: occ }]);

      expect(Array.from(fieldA.normals)).toEqual(Array.from(fieldB.normals));
      expect(Array.from(passA.celShadeBuffer)).toEqual(Array.from(passB.celShadeBuffer));
      expect(Array.from(passA.contactAoBuffer)).toEqual(Array.from(passB.contactAoBuffer));
      expect(Array.from(passA.rimBuffer)).toEqual(Array.from(passB.rimBuffer));
      expect(Array.from(passA.compositeRgba)).toEqual(Array.from(passB.compositeRgba));
    });

    it("잘못된 마스크 크기나 영벡터 광원을 안전하게 차단·정규화한다", () => {
      expect(() => computeExactMaskInteriorEdt(new Uint8Array(4), 0, 4)).toThrow();
      expect(() => computeExactMaskInteriorEdt(new Uint8Array(4), 4, 4)).toThrow();
      const fb = normalizeVec3Safe([0, 0, 0], [-1, 0, 1]);
      expect(Math.hypot(fb[0], fb[1], fb[2])).toBeCloseTo(1, 5);

      const field = computeInflated2dNormalField(makeCircleMask(25, 25, 12, 12, 8), 25, 25);
      const pass = synthesizeCelShadowContactAoAndRimPass(field, {
        keyLightDir: [0, 0, 0],
        rimLightDir: [Number.NaN, 0, 0],
      });
      expect(pass.telemetry.nanCount).toBe(0);
      expect(pass.telemetry.outsideMaskLeakPixels).toBe(0);
    });
  });

  describe("4. WebGPU WGSL 셰이더 생성·검증, OKLCH 4패널 SVG 및 자연스러운 한국어 QA 요약", () => {
    it("3종 프로파일 WGSL 컴퓨트/프래그먼트 셰이더가 유효성 검증과 16바이트 정렬을 통과한다", () => {
      for (const profile of ALL_PROFILES) {
        const artifact = buildNormalAoRimWgsl(profile);
        const report = validateNormalAoRimWgsl(artifact);
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.lineCount).toBeGreaterThan(80);
        expect(artifact.uniformBufferByteLength % 16).toBe(0);
        expect(artifact.entryPoints).toEqual(["cs_normal_ao_rim", "fs_composite_cel_pass"]);
        expect(artifact.wgsl).toContain(`(${profile})`);
      }
    });

    it("WGSL 검증기가 불균형 중괄호·필수 함수 누락·NaN 리터럴·비정렬 유니폼을 정확히 검출한다", () => {
      const broken = validateNormalAoRimWgsl("fn cs_normal_ao_rim() { let x = NaN;");
      expect(broken.valid).toBe(false);
      expect(broken.errors.length).toBeGreaterThanOrEqual(3);
      expect(validateNormalAoRimWgsl("   ").valid).toBe(false);

      const validArtifact = buildNormalAoRimWgsl("soft-organic");
      expect(validateNormalAoRimWgsl({ ...validArtifact, uniformBufferByteLength: 100 }).valid).toBe(false);
    });

    it("4패널 분해도 SVG가 OKLCH 색상만 사용하고 원시 #hex/rgb 및 NaN/Infinity가 0건이다", () => {
      const w = 49;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 24, 26, 17), w, w);
      const pass = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [-0.6, -0.5, 0.62], bandCount: 3 },
        [{ id: "bangs", labelKo: "앞머리", mask: makeRectMask(w, w, 10, 8, 38, 19) }],
      );
      const svg = renderLightingPassBreakdownSvg(pass, { sceneTitle: "주인공 클로즈업 조명 분해" });

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("Mask &amp; Normal Sphere");
      expect(svg).toContain("Cel Shadow");
      expect(svg).toContain("Contact AO");
      expect(svg).toContain("Final Rim-Light Pass");
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\(/i);
      expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
    });

    it("SVG XML 이스케이프가 제목과 차폐 레이어명의 특수문자(<script>&\"')를 안전하게 치환한다", () => {
      expect(escapeLightingSvgXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
      const field = computeInflated2dNormalField(makeCircleMask(25, 25, 12, 12, 8), 25, 25);
      const pass = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [-0.5, -0.5, 0.7] },
        [{ id: "xss", labelKo: `<script>alert("1")</script> & 'hair'`, mask: makeRectMask(25, 25, 6, 4, 18, 9) }],
      );
      const svg = renderLightingPassBreakdownSvg(pass, { sceneTitle: `Cut <1> & "Rim"` });
      expect(svg).not.toContain("<script>");
      expect(svg).toContain("&lt;script&gt;");
      expect(svg).toContain("Cut &lt;1&gt; &amp; &quot;Rim&quot;");
    });

    it("자연스러운 한국어 조명 QA 요약이 핵심 지표를 보고하고 번역투 표현을 배제하며 빈 마스크를 구분한다", () => {
      const w = 49;
      const field = computeInflated2dNormalField(makeCircleMask(w, w, 24, 26, 17), w, w, { profile: "cel-bevel" });
      const pass = synthesizeCelShadowContactAoAndRimPass(
        field,
        { keyLightDir: [-0.5, -0.6, 0.62], bandCount: 3 },
        [{ id: "bangs", labelKo: "앞머리", mask: makeRectMask(w, w, 10, 8, 38, 19) }],
      );
      const summary = summarizeNormalAoRimPassKo(pass);
      expect(summary.verdict).toBe("ready");
      expect(summary.unitNormalValid).toBe(true);
      expect(summary.outsideMaskLeakPixels).toBe(0);
      expect(summary.maskCoveragePercent).toBeGreaterThan(30);
      expect(summary.celLitRatioPercent + summary.celShadowRatioPercent).toBeCloseTo(100, 4);
      expect(summary.contactAoDarkenedRatioPercent).toBeGreaterThan(10);
      expect(summary.rimPeakIntensity).toBeGreaterThan(0.1);
      expect(summary.bulletsKo.length).toBe(4);
      expect(summary.reportTextKo).toContain("셀 베벨 챔퍼");
      expect(summary.reportTextKo).toContain("번짐은 0px");
      expect(summary.reportTextKo).not.toContain("하는 것을 가능하게");
      expect(summary.reportTextKo).not.toContain("직관적인 경험을 제공");
      expect(summary.reportTextKo).not.toContain("원활한 워크플로우를 보장");

      const emptyPass = synthesizeCelShadowContactAoAndRimPass(
        computeInflated2dNormalField(new Uint8Array(16 * 16), 16, 16),
        { keyLightDir: [-1, 0, 1] },
      );
      const emptySummary = summarizeNormalAoRimPassKo(emptyPass);
      expect(emptySummary.verdict).toBe("empty-mask");
      expect(emptySummary.interiorPixelCount).toBe(0);
    });
  });
});
