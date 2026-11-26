import { describe, expect, it } from "vitest";

import {
  applyAerialPerspectiveDepthBuffer,
  assignPlanarFaceColor,
  buildPlanarArrangement,
  composeAerialPerspectiveLayers,
  computeRayleighCoefficients,
  computeRayleighMieAtmosphereSample,
  computeSignedShoelaceArea,
  decodeProgressiveCutLossless,
  decodeProgressiveCutPreview,
  encodeProgressiveCutLossless,
  forwardHaar2DInt,
  generateKajiyaMarschnerHairHighlight,
  inverseHaar2DInt,
  predictLocoIMed,
  rasterizePlanarArrangement,
  RAYLEIGH_WAVELENGTHS_NM,
  solveDiffusionCurves,
  type DiffusionCurveSpec,
  type PlanarStrokeInput,
  type RgbaColor,
} from "./index";

function createSyntheticWebtoonCutRgba(
  width: number,
  height: number,
  withAlpha = false,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      // 배경 하늘 그라데이션 + 건물 실루엣 + 캐릭터 셀 원형 + 스크린톤 미세 질감
      let r = Math.round(48 + (y / height) * 140);
      let g = Math.round(76 + (y / height) * 110 + (x / width) * 24);
      let b = Math.round(142 + (1 - y / height) * 88);

      // 중경 빌딩 블록
      if (y > height * 0.52 && ((x >> 4) % 2 === 0 || y > height * 0.68)) {
        r = 52 + ((x * 7 + y * 3) % 19);
        g = 58 + ((x * 5 + y * 11) % 17);
        b = 78 + ((x * 3 + y * 7) % 23);
      }

      // 캐릭터 얼굴/머리 셀 영역
      const dx = x - width * 0.48;
      const dy = y - height * 0.44;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < width * 0.24) {
        r = 246;
        g = 214;
        b = 198;
        // 스크린톤 해칭 패턴
        if ((x + y) % 5 === 0 && dx > 4) {
          r -= 22;
          g -= 24;
          b -= 18;
        }
      }
      // 선화 테두리
      if (Math.abs(dist - width * 0.24) < 1.35 || (y === Math.floor(height * 0.52) && x % 3 !== 0)) {
        r = 22;
        g = 20;
        b = 28;
      }

      // 결정론적 종이 질감 미세 변동
      const grain = ((x * 73856093) ^ (y * 19349663)) & 7;
      rgba[idx] = Math.min(255, Math.max(0, r + grain - 3));
      rgba[idx + 1] = Math.min(255, Math.max(0, g + ((grain * 3) & 7) - 3));
      rgba[idx + 2] = Math.min(255, Math.max(0, b + ((grain * 5) & 7) - 3));
      rgba[idx + 3] = withAlpha && x < 12 && y < 12 ? 128 : 255;
    }
  }
  return rgba;
}

function computeMeanAbsoluteError(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += Math.abs(a[i]! - b[i]!);
  }
  return sum / Math.max(1, a.length);
}

describe("wasm64-wave15-structural", () => {
  describe("Half-Edge Planar Map Arrangement Gapless Color Kernel", () => {
    it("부호 있는 신발끈 면적으로 내부 유계 면(양수)과 외곽 경계 사이클(음수)을 분리하고 언더슛 틈을 스냅한다", () => {
      const ccwSquare = [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 50 },
        { x: 10, y: 50 },
      ];
      expect(computeSignedShoelaceArea(ccwSquare)).toBeCloseTo(1600, 6);
      expect(computeSignedShoelaceArea([...ccwSquare].reverse())).toBeCloseTo(-1600, 6);

      // 1.1px 언더슛 틈과 5px 오버슛 꼬리를 포함한 사각형 + 대각선 분할 선화
      const strokes: readonly PlanarStrokeInput[] = [
        {
          strokeId: "outer-frame",
          width: 4,
          points: [
            { x: 8, y: 8 },
            { x: 56, y: 8 },
            { x: 56, y: 56 },
            { x: 8, y: 56 },
            { x: 8, y: 9.1 }, // 1.1px 언더슛
          ],
        },
        {
          strokeId: "diag-split",
          width: 3,
          points: [
            { x: 4, y: 4 }, // 바깥 오버슛
            { x: 55.1, y: 55.2 }, // 모서리 근처 언더슛 스냅
          ],
        },
      ];

      const arrangement = buildPlanarArrangement(strokes, { snapTolerance: 1.8 });
      expect(arrangement.boundedFaces).toHaveLength(2);
      expect(arrangement.outerBoundaryCycles.length).toBeGreaterThanOrEqual(1);

      const totalInteriorArea = arrangement.boundedFaces.reduce((acc, f) => acc + f.area, 0);
      expect(totalInteriorArea).toBeCloseTo(48 * 48, 0);
      for (const face of arrangement.boundedFaces) {
        expect(face.signedArea).toBeGreaterThan(0);
        expect(face.neighborFaceIds).toHaveLength(1);
      }
      expect(arrangement.outerBoundaryCycles[0]!.signedArea).toBeLessThan(0);
    });

    it("정점 변형과 선 두께 변경(8px -> 1px -> 무테두리) 후에도 영구 위상 면 ID를 유지하며 흰색 틈새 픽셀이 0개다", () => {
      const baseStrokes: readonly PlanarStrokeInput[] = [
        {
          strokeId: "panel-border",
          width: 8,
          points: [
            { x: 6, y: 6 },
            { x: 58, y: 6 },
            { x: 58, y: 58 },
            { x: 6, y: 58 },
            { x: 6, y: 6 },
          ],
        },
        {
          strokeId: "collar-divider",
          width: 8,
          points: [
            { x: 6, y: 20 },
            { x: 32, y: 34 },
            { x: 58, y: 22 },
          ],
        },
      ];

      let arr = buildPlanarArrangement(baseStrokes);
      expect(arr.boundedFaces).toHaveLength(2);

      const upperFirst = [...arr.boundedFaces].sort((a, b) => a.centroid.y - b.centroid.y);
      const upperFaceId = upperFirst[0]!.faceId;
      const lowerFaceId = upperFirst[1]!.faceId;

      const warmSkin: RgbaColor = { r: 252, g: 218, b: 198, a: 255 };
      const jacketNavy: RgbaColor = { r: 44, g: 68, b: 118, a: 255 };
      arr = assignPlanarFaceColor(arr, upperFaceId, warmSkin);
      arr = assignPlanarFaceColor(arr, lowerFaceId, jacketNavy);

      // 정점을 이동시키고 선 두께를 8px -> 1px로 대폭 축소해도 면 ID와 색상이 보존된다.
      const deformedThinStrokes: readonly PlanarStrokeInput[] = [
        {
          strokeId: "panel-border",
          width: 1,
          points: [
            { x: 6, y: 6 },
            { x: 58, y: 6 },
            { x: 58, y: 58 },
            { x: 6, y: 58 },
            { x: 6, y: 6 },
          ],
        },
        {
          strokeId: "collar-divider",
          width: 1,
          points: [
            { x: 6, y: 26 },
            { x: 35, y: 40 },
            { x: 58, y: 18 },
          ],
        },
      ];

      const deformedArr = buildPlanarArrangement(deformedThinStrokes, {
        previousArrangement: arr,
      });
      expect(deformedArr.boundedFaces).toHaveLength(2);
      expect(deformedArr.faceColors.get(upperFaceId)).toEqual(warmSkin);
      expect(deformedArr.faceColors.get(lowerFaceId)).toEqual(jacketNavy);

      const thinRaster = rasterizePlanarArrangement(deformedArr, deformedThinStrokes, {
        width: 64,
        height: 64,
        renderStrokes: true,
      });
      expect(thinRaster.interiorGapPixelCount).toBe(0);

      const strokeFreeRaster = rasterizePlanarArrangement(deformedArr, deformedThinStrokes, {
        width: 64,
        height: 64,
        renderStrokes: false,
      });
      expect(strokeFreeRaster.interiorGapPixelCount).toBe(0);

      // 패널 내부 픽셀(x=7..57, y=7..57) 전체에서 흰색 배경(255,255,255)이 노출된 픽셀이 정확히 0개인지 전수 확인한다.
      let whiteLeakPixels = 0;
      for (let y = 7; y <= 57; y += 1) {
        for (let x = 7; x <= 57; x += 1) {
          const off = (y * 64 + x) * 4;
          if (
            strokeFreeRaster.rgba[off] === 255 &&
            strokeFreeRaster.rgba[off + 1] === 255 &&
            strokeFreeRaster.rgba[off + 2] === 255
          ) {
            whiteLeakPixels += 1;
          }
        }
      }
      expect(whiteLeakPixels).toBe(0);
    });

    it("내부 고립 윤곽(도넛 구멍)을 감싸는 유계 면의 구멍으로 분리해 독립 채색한다", () => {
      const strokes: readonly PlanarStrokeInput[] = [
        {
          strokeId: "face-loop",
          width: 2,
          points: [
            { x: 8, y: 8 },
            { x: 56, y: 8 },
            { x: 56, y: 56 },
            { x: 8, y: 56 },
            { x: 8, y: 8 },
          ],
        },
        {
          strokeId: "eye-loop",
          width: 2,
          points: [
            { x: 24, y: 24 },
            { x: 40, y: 24 },
            { x: 40, y: 40 },
            { x: 24, y: 40 },
            { x: 24, y: 24 },
          ],
        },
      ];
      let arr = buildPlanarArrangement(strokes);
      expect(arr.boundedFaces).toHaveLength(2);
      const byArea = [...arr.boundedFaces].sort((a, b) => b.area - a.area);
      const outerRingFace = byArea[0]!;
      const innerEyeFace = byArea[1]!;
      expect(outerRingFace.holes).toHaveLength(1);
      expect(outerRingFace.area).toBeCloseTo(48 * 48 - 16 * 16, 0);
      expect(innerEyeFace.area).toBeCloseTo(16 * 16, 0);

      arr = assignPlanarFaceColor(arr, outerRingFace.faceId, { r: 240, g: 190, b: 175, a: 255 });
      arr = assignPlanarFaceColor(arr, innerEyeFace.faceId, { r: 60, g: 130, b: 220, a: 255 });
      const raster = rasterizePlanarArrangement(arr, strokes, {
        width: 64,
        height: 64,
        renderStrokes: false,
      });
      expect(raster.interiorGapPixelCount).toBe(0);
      const centerOff = (32 * 64 + 32) * 4;
      expect(raster.rgba[centerOff]).toBe(60);
      expect(raster.rgba[centerOff + 2]).toBe(220);
    });
  });

  describe("Laplacian Diffusion Curves Infinite-Resolution Shading Solver", () => {
    it("1×, 2×, 4×, 8× 임의 뷰포트 배율에서 밴딩·픽셀화 없이 이산 조화 해(∇²u = 0)로 수렴한다", () => {
      const curves: readonly DiffusionCurveSpec[] = [
        {
          curveId: "cheek-shadow-curve",
          segments: [
            {
              kind: "cubic",
              p0: { x: 10, y: 2 },
              p1: { x: 13, y: 8 },
              p2: { x: 7, y: 12 },
              p3: { x: 10, y: 18 },
            },
          ],
          leftColors: [
            { t: 0, colorRgba: { r: 250, g: 220, b: 205, a: 255 } },
            { t: 1, colorRgba: { r: 242, g: 196, b: 184, a: 255 } },
          ],
          rightColors: [
            { t: 0, colorRgba: { r: 72, g: 84, b: 148, a: 255 } },
            { t: 1, colorRgba: { r: 54, g: 62, b: 120, a: 255 } },
          ],
        },
      ];

      const scales = [1, 2, 4, 8] as const;
      const results = scales.map((viewportScale) =>
        solveDiffusionCurves(curves, {
          baseWidth: 20,
          baseHeight: 20,
          viewportScale,
          iterationsPerLevel: 96,
        }),
      );

      expect(results[0]!.width).toBe(20);
      expect(results[1]!.width).toBe(40);
      expect(results[2]!.width).toBe(80);
      expect(results[3]!.width).toBe(160);

      for (const res of results) {
        expect(res.constrainedCellCount).toBeGreaterThan(0);
        expect(res.meanHarmonicResidual).toBeLessThan(0.004);
      }

      // 배율이 높아질수록 내부 인접 픽셀 간 단계 차이가 단조 감소하며 8×에서 무밴딩 연속 음영을 형성한다.
      const res8x = results[3]!;
      expect(results[0]!.maxInteriorStepDelta8).toBeGreaterThan(res8x.maxInteriorStepDelta8);
      expect(res8x.maxInteriorStepDelta8).toBeLessThanOrEqual(5);

      // 곡선 장벽 기준 좌측(밝은 피부색)과 우측(차가운 그림자색)이 선명하게 분리된다.
      const sampleRow = 80;
      const leftPixelOff = (sampleRow * res8x.width + 20) * 4;
      const rightPixelOff = (sampleRow * res8x.width + 140) * 4;
      expect(res8x.rgba8[leftPixelOff]!).toBeGreaterThan(210);
      expect(res8x.rgba8[rightPixelOff]!).toBeLessThan(100);
      expect(res8x.rgba8[rightPixelOff + 2]!).toBeGreaterThan(res8x.rgba8[rightPixelOff]!);
    });
  });

  describe("Kajiya-Kay / Marschner Anisotropic Hair Angel-Ring Highlight Generator", () => {
    it("단일 가이드 접선 곡선에서 1ms 미만으로 1차·2차 큐티클 이동 엔젤링과 미세 차폐를 생성한다", () => {
      const baseInput = {
        guidePoints: [
          { x: 60, y: 12 },
          { x: 56, y: 48 },
          { x: 62, y: 88 },
          { x: 70, y: 128 },
        ],
        lightDirection: { x: 0.35, y: -0.25, z: 0.9 },
        swatchWidth: 48,
        swatchHeight: 72,
        cuticleTiltDeg: -8.5,
        strandCount: 12,
      } as const;

      // JIT 워밍업 후 실행 시간 실측
      generateKajiyaMarschnerHairHighlight({ ...baseInput, shadingStyle: "cel" });
      generateKajiyaMarschnerHairHighlight({ ...baseInput, shadingStyle: "soft" });

      const timings: number[] = [];
      let celResult = generateKajiyaMarschnerHairHighlight({ ...baseInput, shadingStyle: "cel" });
      for (let i = 0; i < 5; i += 1) {
        celResult = generateKajiyaMarschnerHairHighlight({ ...baseInput, shadingStyle: "cel" });
        timings.push(celResult.elapsedMs);
      }
      timings.sort((a, b) => a - b);
      const medianElapsedMs = timings[2]!;
      expect(medianElapsedMs).toBeLessThan(1.0);

      const softResult = generateKajiyaMarschnerHairHighlight({
        ...baseInput,
        shadingStyle: "soft",
      });
      expect(celResult.angelRingRibbon).toHaveLength(48);
      // 큐티클 경사로 인해 1차 표면 반사(R)와 2차 내부 반사(TRT) 피크 위치가 유의미하게 분리된다.
      expect(Math.abs(softResult.peakPrimaryU - softResult.peakSecondaryU)).toBeGreaterThan(0.03);

      // 측면 광원 성분에 의해 가닥 능선과 골짜기 사이에 미세 차폐 편차가 존재한다.
      let minShadow = 1;
      let maxShadow = 0;
      for (const s of softResult.microShadowFactor) {
        if (s < minShadow) minShadow = s;
        if (s > maxShadow) maxShadow = s;
      }
      expect(maxShadow - minShadow).toBeGreaterThan(0.1);
    });
  });

  describe("Rayleigh-Mie Physical Aerial Perspective Depth Composer", () => {
    it("파장 의존 레일리(λ^-4) 법칙과 미(Mie) 전방 산란 위상 함수를 만족하며 다중 깊이 레이어를 합성한다", () => {
      const [betaR, betaG, betaB] = computeRayleighCoefficients(1);
      const expectedRatioBR = Math.pow(RAYLEIGH_WAVELENGTHS_NM[0] / RAYLEIGH_WAVELENGTHS_NM[2], 4);
      expect(betaB / betaR).toBeCloseTo(expectedRatioBR, 6);
      expect(betaB).toBeGreaterThan(betaG);
      expect(betaG).toBeGreaterThan(betaR);

      // 태양 정면(전방 산란) vs 태양 반대편(후방 산란) 비교
      const forwardSample = computeRayleighMieAtmosphereSample(2500, {
        sunDirection: { x: 0, y: 0.2, z: -0.98 },
        viewDirection: { x: 0, y: 0.2, z: -0.98 },
        turbidity: 4.0,
      });
      const backwardSample = computeRayleighMieAtmosphereSample(2500, {
        sunDirection: { x: 0, y: 0.2, z: 0.98 },
        viewDirection: { x: 0, y: 0.2, z: -0.98 },
        turbidity: 4.0,
      });
      expect(forwardSample.inScatterLinearRgb[0]).toBeGreaterThan(
        backwardSample.inScatterLinearRgb[0] * 1.5,
      );

      // 깊이 0m 픽셀 무변형 보존 및 원경(4000m) 대기 소산·유입 검증
      const srcRgba = new Uint8Array([
        180, 60, 50, 255, // 근경 0m
        180, 60, 50, 255, // 중경 1200m
        180, 60, 50, 255, // 원경 6000m
        40, 45, 42, 255, // 원경 암부 6000m
      ]);
      const depths = new Float32Array([0, 1200, 6000, 6000]);
      const report = applyAerialPerspectiveDepthBuffer(srcRgba, depths, 2, 2, {
        sunDirection: { x: 0.3, y: 0.7, z: 0.65 },
        viewDirection: { x: 0, y: 0, z: -1 },
        turbidity: 2.4,
      });
      // 0m 전경 픽셀 보존
      expect(report.rgba[0]).toBe(180);
      expect(report.rgba[1]).toBe(60);
      expect(report.rgba[2]).toBe(50);
      // 청색 투과율이 적색 투과율보다 낮고, 원경 암부에 푸른 대기광이 유입된다.
      expect(report.meanTransmittanceBlue).toBeLessThan(report.meanTransmittanceRed);
      expect(report.rgba[14]!).toBeGreaterThan(srcRgba[14]! + 30);

      // 레이어 스택 합성(깊이 역순 입력도 원경->근경 순으로 자동 정렬 합성)
      const nearLayer = new Uint8Array(16);
      nearLayer.set([220, 80, 70, 255], 0); // 첫 픽셀만 불투명 전경 인물
      const farMountain = new Uint8Array([
        50, 65, 55, 255,
        50, 65, 55, 255,
        50, 65, 55, 255,
        50, 65, 55, 255,
      ]);
      const composed = composeAerialPerspectiveLayers(
        [
          { layerId: "hero-near", depthMeters: 0, rgba: nearLayer },
          { layerId: "mountain-far", depthMeters: 5000, rgba: farMountain },
        ],
        2,
        2,
        { sunDirection: { x: 0.2, y: 0.8, z: 0.5 }, turbidity: 2.5 },
      );
      expect(composed.layerTransmittances[0]!.layerId).toBe("mountain-far");
      expect(composed.rgba[0]).toBe(220);
      expect(composed.rgba[6]!).toBeGreaterThan(55);
    });
  });

  describe("Lossless Integer Haar Wavelet + LOCO-I (MED) Progressive Cut Codec", () => {
    it("LOCO-I MED 예측기와 짝수·홀수 가역 2D 정수 리프팅 Haar가 오차 0으로 왕복 복원된다", () => {
      // 수직·수평 에지 클램프 및 순수 평면(min < nw < max) 외삽 검증
      expect(predictLocoIMed(20, 90, 95)).toBe(20);
      expect(predictLocoIMed(80, 15, 10)).toBe(80);
      expect(predictLocoIMed(40, 50, 30)).toBe(50);
      expect(predictLocoIMed(40, 60, 48)).toBe(52);

      // 홀수 크기(53x37) 및 음수 포함 정수 격자 100% 비트 일치 왕복 검증
      const w = 53;
      const h = 37;
      const original = new Int32Array(w * h);
      for (let i = 0; i < original.length; i += 1) {
        original[i] = ((i * 197) % 511) - 255;
      }
      const subbands = forwardHaar2DInt(original, w, h);
      expect(subbands.lowWidth + subbands.highWidth).toBe(w);
      expect(subbands.lowHeight + subbands.highHeight).toBe(h);

      const restored = inverseHaar2DInt(subbands);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("앞쪽 6~10% 바이트만으로 거친 LL 미리보기를 복원하고 전체 스트림에서 100% 원본 RGBA로 무손실 일치한다", () => {
      const width = 128;
      const height = 128;
      const cutRgba = createSyntheticWebtoonCutRgba(width, height, false);

      const packet = encodeProgressiveCutLossless(cutRgba, width, height);
      expect(packet.bitstream.byteLength).toBeLessThan(cutRgba.byteLength);
      expect(packet.coarsePreviewByteRatio).toBeGreaterThanOrEqual(0.06);
      expect(packet.coarsePreviewByteRatio).toBeLessThanOrEqual(0.1);

      // 앞쪽 6~10% 바이트 슬라이스만 잘라 전달해도 즉시 유효한 전체 해상도 거친 미리보기가 복원된다.
      const coarseSlice = packet.bitstream.subarray(0, packet.coarsePreviewByteLength);
      const coarsePreview = decodeProgressiveCutPreview(coarseSlice);
      expect(coarsePreview.width).toBe(width);
      expect(coarsePreview.height).toBe(height);
      expect(coarsePreview.isCompleteLossless).toBe(false);
      expect(coarsePreview.decodedChunks).toBe(packet.coarseChunkCount);

      const halfSlice = packet.bitstream.subarray(0, Math.floor(packet.bitstream.byteLength * 0.5));
      const halfPreview = decodeProgressiveCutPreview(halfSlice);

      const maeCoarse = computeMeanAbsoluteError(cutRgba, coarsePreview.rgba);
      const maeHalf = computeMeanAbsoluteError(cutRgba, halfPreview.rgba);
      expect(maeCoarse).toBeLessThan(28);
      expect(maeHalf).toBeLessThan(maeCoarse);

      // 100% 전체 스트림 복원 시 단 1비트 오차도 없이 원본 RGBA와 완전히 일치한다.
      const fullDecoded = decodeProgressiveCutLossless(packet.bitstream);
      expect(fullDecoded.isCompleteLossless).toBe(true);
      expect(fullDecoded.checksumVerified).toBe(true);
      expect(computeMeanAbsoluteError(cutRgba, fullDecoded.rgba)).toBe(0);
      expect(Buffer.compare(Buffer.from(cutRgba), Buffer.from(fullDecoded.rgba))).toBe(0);

      // 반투명 알파 채널 및 홀수 해상도(67x51) 무손실 왕복 검증
      const oddAlphaCut = createSyntheticWebtoonCutRgba(67, 51, true);
      const oddPacket = encodeProgressiveCutLossless(oddAlphaCut, 67, 51);
      const oddDecoded = decodeProgressiveCutLossless(oddPacket.bitstream);
      expect(oddDecoded.checksumVerified).toBe(true);
      expect(Buffer.compare(Buffer.from(oddAlphaCut), Buffer.from(oddDecoded.rgba))).toBe(0);
    });
  });
});
