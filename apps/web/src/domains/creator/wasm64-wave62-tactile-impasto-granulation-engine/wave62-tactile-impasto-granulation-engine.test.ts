import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAPER_BACKGROUND_LINEAR_RGB,
  MAX_MULTI_BRISTLE_COUNT,
  MIN_MULTI_BRISTLE_COUNT,
  PHYSICAL_MEDIA_TACTILE_PRESETS,
  PhysicalPaintCanvasBuffer,
  TACTILE_IMPASTO_RELIEF_WGSL,
  WATERCOLOR_GRANULATION_WGSL,
  WGSL_TACTILE_BINDING_CONTRACTS,
  applyPhysicalMediaStroke,
  compositeRakingLightImpastoRgba,
  compositeRakingLightImpastoSrgbUint8,
  computeHeightFieldSobelNormal,
  createBristleBundleState,
  evaluateDipPenNibProfile,
  generateProceduralPaperToothField,
  linearToSrgbRgb,
  mixColorsSrgbNaive,
  mixPigmentsKubelkaMunk,
  packImpastoReliefUniforms,
  packWatercolorGranulationUniforms,
  reloadBristleBundle,
  srgbToLinearRgb,
  stampDipPenInkStroke,
  stampDryMediaContactToothDab,
  stampMultiBristlePhysicalDab,
  stampOilImpastoStroke,
  stampWatercolorWetDab,
  stepWatercolorSimulation,
  strokeDryMediaContactTooth,
  validateWgslShaderContract,
  type LinearRgbTuple,
  type SrgbTuple,
  type StrokePointSample,
  type TactileMediaPresetId,
} from "./index";

function srgbToHueAndChroma(rgb: SrgbTuple): { readonly hueDeg: number; readonly chroma: number } {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma < 1e-6) return { hueDeg: 0, chroma: 0 };
  let h: number;
  if (max === r) h = ((g - b) / chroma) % 6;
  else if (max === g) h = (b - r) / chroma + 2;
  else h = (r - g) / chroma + 4;
  return { hueDeg: (h * 60 + 360) % 360, chroma };
}

function relativeLuminanceLinear(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function createBimodalPaperBuffer(width: number, height: number): PhysicalPaintCanvasBuffer {
  const tooth = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tooth[y * width + x] = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 0.88 : 0.14;
    }
  }
  return new PhysicalPaintCanvasBuffer(width, height, { customPaperTooth: tooth });
}

function fieldStdDev(arr: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i += 1) sum += arr[i];
  const mean = sum / arr.length;
  let variance = 0;
  for (let i = 0; i < arr.length; i += 1) variance += (arr[i] - mean) * (arr[i] - mean);
  return Math.sqrt(variance / arr.length);
}

describe("wasm64-wave62-tactile-impasto-granulation-engine", () => {
  describe("PhysicalPaintCanvasBuffer & 절차적 종이 섬유 높이장", () => {
    it("4개 물리 채널(rgbaLinearF32·heightF32·wetnessF32·paperToothF32)을 정확한 크기와 분산으로 초기화한다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(32, 24, {
        paperProfile: "cold-press-watercolor",
        paperSeed: 101,
      });
      expect(buffer.rgbaLinearF32.length).toBe(32 * 24 * 4);
      expect(buffer.heightF32.length).toBe(32 * 24);
      expect(buffer.wetnessF32.length).toBe(32 * 24);
      expect(buffer.paperToothF32.length).toBe(32 * 24);

      const metrics = buffer.getMetricsSnapshot();
      expect(metrics.paintedPixelCount).toBe(0);
      expect(metrics.paperToothMean).toBeGreaterThan(0.35);
      expect(metrics.paperToothMean).toBeLessThan(0.65);
      expect(metrics.paperToothStdDev).toBeGreaterThan(0.12);
    });

    it("종이 프로파일과 시드에 따라 결정론적이고 서로 구별되는 종이 결 높이장을 생성한다", () => {
      const laidA = generateProceduralPaperToothField(24, 24, "laid-charcoal", { seed: 77 });
      const laidB = generateProceduralPaperToothField(24, 24, "laid-charcoal", { seed: 77 });
      const bristol = generateProceduralPaperToothField(24, 24, "comic-bristol", { seed: 77 });
      const linen = generateProceduralPaperToothField(24, 24, "linen-canvas", { seed: 77 });

      expect(Array.from(laidA)).toEqual(Array.from(laidB));
      expect(fieldStdDev(laidA)).toBeGreaterThan(fieldStdDev(bristol) * 1.5);
      expect(fieldStdDev(linen)).toBeGreaterThan(fieldStdDev(bristol) * 1.3);
    });

    it("수분 증발(evaporateMoisture) 시 습윤도는 단조 감소하지만 안료와 임파스토 높이는 보존된다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(16, 16);
      buffer.setPixel(8, 8, { r: 0.7, g: 0.2, b: 0.1, a: 0.9, height: 0.85, wetness: 0.95 });

      expect(buffer.evaporateMoisture(0.35)).toBeGreaterThan(0.2);
      const mid = buffer.samplePixel(8, 8);
      expect(mid.wetness).toBeLessThan(0.75);
      expect(mid.a).toBeCloseTo(0.9, 5);
      expect(mid.height).toBeCloseTo(0.85, 5);

      for (let i = 0; i < 10; i += 1) buffer.evaporateMoisture(0.4);
      expect(buffer.samplePixel(8, 8).wetness).toBe(0);
      expect(buffer.samplePixel(8, 8).height).toBeCloseTo(0.85, 5);
    });

    it("toSrgbUint8Clamped가 선형 RGBA와 종이 배경을 정확한 sRGB 8비트로 변환한다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(8, 8, {
        backgroundLinearRgb: DEFAULT_PAPER_BACKGROUND_LINEAR_RGB,
      });
      buffer.setPixel(3, 3, { r: 0.0, g: 0.5, b: 0.0, a: 1.0, height: 0.2, wetness: 0 });
      const srgbBytes = buffer.toSrgbUint8Clamped({ includePaperBackground: true });

      const paintedIdx = (3 * 8 + 3) * 4;
      expect(srgbBytes[paintedIdx]).toBe(0);
      expect(srgbBytes[paintedIdx + 1]).toBeGreaterThan(180);
      expect(srgbBytes[paintedIdx + 1]).toBeLessThan(195);
      expect(srgbBytes[paintedIdx + 3]).toBe(255);
      expect(srgbBytes[0]).toBeGreaterThan(235);
      expect(srgbBytes[1]).toBeGreaterThan(230);
    });
  });

  describe("Kubelka-Munk 스펙트럼 광학 안료 혼색", () => {
    it("파랑 + 노랑 혼색 시 sRGB 회색화와 달리 뚜렷한 자연 녹색을 생성한다", () => {
      const blueSrgb: SrgbTuple = [0.06, 0.22, 0.86];
      const yellowSrgb: SrgbTuple = [0.97, 0.86, 0.05];
      const kmSrgb = linearToSrgbRgb(
        mixPigmentsKubelkaMunk(srgbToLinearRgb(blueSrgb), srgbToLinearRgb(yellowSrgb), 0.5),
      );
      const naiveSrgb = mixColorsSrgbNaive(blueSrgb, yellowSrgb, 0.5);
      const kmHC = srgbToHueAndChroma(kmSrgb);
      const naiveHC = srgbToHueAndChroma(naiveSrgb);

      expect(kmSrgb[1]).toBeGreaterThan(kmSrgb[0] * 2.5);
      expect(kmSrgb[1]).toBeGreaterThan(kmSrgb[2] * 1.25);
      expect(kmHC.hueDeg).toBeGreaterThanOrEqual(90);
      expect(kmHC.hueDeg).toBeLessThanOrEqual(165);
      expect(kmHC.chroma).toBeGreaterThan(0.32);
      expect(naiveHC.chroma).toBeLessThan(0.12);
      expect(kmHC.chroma).toBeGreaterThan(naiveHC.chroma * 3);
    });

    it("끝점(t=0, t=1) 및 동일 색상 혼합에서 기계 정밀도 수준의 왕복 항등성을 보장한다", () => {
      const palette: readonly LinearRgbTuple[] = [
        [0.03, 0.14, 0.78],
        [0.91, 0.72, 0.02],
        [0.82, 0.08, 0.12],
        [0.45, 0.45, 0.45],
      ];
      for (const color of palette) {
        const selfMix = mixPigmentsKubelkaMunk(color, color, 0.5);
        const startMix = mixPigmentsKubelkaMunk(color, [0.9, 0.8, 0.1], 0);
        const endMix = mixPigmentsKubelkaMunk([0.1, 0.2, 0.9], color, 1);
        for (let c = 0; c < 3; c += 1) {
          expect(selfMix[c]).toBeCloseTo(color[c], 6);
          expect(startMix[c]).toBeCloseTo(color[c], 6);
          expect(endMix[c]).toBeCloseTo(color[c], 6);
        }
      }
    });

    it("빨강+노랑→주황, 파랑+빨강→보라, 파랑+흰색→맑은 파스텔 틴트를 산출한다", () => {
      const redLin = srgbToLinearRgb([0.88, 0.1, 0.12]);
      const yellowLin = srgbToLinearRgb([0.97, 0.86, 0.05]);
      const blueLin = srgbToLinearRgb([0.06, 0.22, 0.86]);
      const whiteLin = srgbToLinearRgb([0.98, 0.98, 0.98]);

      const orangeSrgb = linearToSrgbRgb(mixPigmentsKubelkaMunk(redLin, yellowLin, 0.5));
      const orangeHC = srgbToHueAndChroma(orangeSrgb);
      expect(orangeSrgb[0]).toBeGreaterThan(0.8);
      expect(orangeHC.hueDeg).toBeGreaterThan(10);
      expect(orangeHC.hueDeg).toBeLessThan(48);

      const violetSrgb = linearToSrgbRgb(mixPigmentsKubelkaMunk(blueLin, redLin, 0.5));
      const violetHC = srgbToHueAndChroma(violetSrgb);
      expect(violetSrgb[0]).toBeGreaterThan(violetSrgb[1] * 2);
      expect(violetSrgb[2]).toBeGreaterThan(violetSrgb[1] * 2);
      expect(violetHC.hueDeg).toBeGreaterThan(255);
      expect(violetHC.hueDeg).toBeLessThan(320);

      const tintSrgb = linearToSrgbRgb(mixPigmentsKubelkaMunk(blueLin, whiteLin, 0.5));
      expect(tintSrgb[2]).toBeGreaterThan(0.8);
      expect(tintSrgb[1]).toBeGreaterThan(0.35);
    });

    it("안료 착색력(pigmentStrength) 가중치가 강할수록 해당 안료 쪽으로 광학 혼색이 이동한다", () => {
      const blueLin = srgbToLinearRgb([0.05, 0.2, 0.88]);
      const yellowLin = srgbToLinearRgb([0.96, 0.88, 0.04]);
      const balanced = mixPigmentsKubelkaMunk(blueLin, yellowLin, 0.5);
      const strongBlue = mixPigmentsKubelkaMunk(blueLin, yellowLin, 0.5, {
        pigmentStrengthA: 3.0,
        pigmentStrengthB: 1.0,
      });
      const strongYellow = mixPigmentsKubelkaMunk(blueLin, yellowLin, 0.5, {
        pigmentStrengthA: 1.0,
        pigmentStrengthB: 3.0,
      });
      expect(strongBlue[2]).toBeGreaterThan(balanced[2]);
      expect(strongYellow[0]).toBeGreaterThan(balanced[0]);
    });
  });

  describe("32~64가닥 멀티-브리스틀 젖은 물감 픽업·드래그 엔진", () => {
    it("붓모 가닥 수를 32~64 범위로 클램핑하고 비퇴화 필로택시스 분포를 유지한다", () => {
      const low = createBristleBundleState({ bristleCount: 8, baseColorLinearRgb: [0.8, 0.2, 0.1] });
      const high = createBristleBundleState({ bristleCount: 256, baseColorLinearRgb: [0.8, 0.2, 0.1] });
      const normal = createBristleBundleState({ bristleCount: 48, baseColorLinearRgb: [0.8, 0.2, 0.1] });

      expect(low.bristleCount).toBe(MIN_MULTI_BRISTLE_COUNT);
      expect(high.bristleCount).toBe(MAX_MULTI_BRISTLE_COUNT);
      expect(normal.bristles).toHaveLength(48);
      expect(new Set(normal.bristles.map((b) => `${b.offsetU.toFixed(3)},${b.offsetV.toFixed(3)}`)).size).toBe(48);
    });

    it("젖은 파랑 물감 위를 노랑 브리스틀 붓으로 끌면 파랑을 픽업해 인접 빈 영역에 자연 녹색으로 전이된다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(64, 32, { paperProfile: "linen-canvas" });
      const blueLin = srgbToLinearRgb([0.05, 0.2, 0.88]);
      const yellowLin = srgbToLinearRgb([0.97, 0.86, 0.05]);

      for (let y = 8; y <= 24; y += 1) {
        for (let x = 8; x <= 26; x += 1) {
          buffer.setPixel(x, y, {
            r: blueLin[0],
            g: blueLin[1],
            b: blueLin[2],
            a: 0.95,
            height: 0.4,
            wetness: 0.92,
          });
        }
      }

      const bristles = createBristleBundleState({
        bristleCount: 48,
        baseColorLinearRgb: yellowLin,
        initialLoad: 0.92,
        initialWetness: 0.8,
        seed: 404,
      });

      let pickupTotal = 0;
      for (let x = 16; x <= 46; x += 2) {
        const res = stampMultiBristlePhysicalDab(buffer, bristles, {
          x,
          y: 16,
          dirX: 1,
          dirY: 0,
          radiusPx: 6,
          pressure: 0.82,
          pickupRate: 0.58,
          wetMixStrength: 0.85,
          loadDepletionRate: 0.008,
        });
        pickupTotal += res.meanPickupTransfer;
      }
      expect(pickupTotal).toBeGreaterThan(0.25);

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let y = 14; y <= 18; y += 1) {
        for (let x = 35; x <= 44; x += 1) {
          const px = buffer.samplePixel(x, y);
          if (px.a > 0.2) {
            rSum += px.r;
            gSum += px.g;
            bSum += px.b;
            count += 1;
          }
        }
      }
      expect(count).toBeGreaterThan(10);
      const draggedSrgb = linearToSrgbRgb([rSum / count, gSum / count, bSum / count]);
      const draggedHC = srgbToHueAndChroma(draggedSrgb);
      expect(draggedSrgb[1]).toBeGreaterThan(draggedSrgb[0]);
      expect(draggedHC.hueDeg).toBeGreaterThan(80);
      expect(draggedHC.hueDeg).toBeLessThan(178);
    });

    it("멀티-브리스틀 유화 스트로크가 진행 수직 단면에 실제 붓결 이랑(Ridge) 높이 편차를 조각한다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(48, 36, { paperProfile: "linen-canvas" });
      const res = stampOilImpastoStroke(
        buffer,
        [
          { x: 8, y: 18, pressure: 0.85 },
          { x: 24, y: 18, pressure: 0.9 },
          { x: 40, y: 18, pressure: 0.82 },
        ],
        {
          variant: "oil",
          colorLinearRgb: [0.76, 0.34, 0.05],
          radiusPx: 9,
          bristleCount: 52,
          thicknessDeposit: 0.65,
          ridgeCarveStrength: 0.62,
        },
      );
      expect(res.maxHeight).toBeGreaterThan(0.5);
      expect(res.ridgeHeightStdDev).toBeGreaterThan(0.08);

      const crossHeights: number[] = [];
      for (let y = 12; y <= 24; y += 1) crossHeights.push(buffer.samplePixel(24, y).height);
      expect(Math.max(...crossHeights) - Math.min(...crossHeights)).toBeGreaterThan(0.25);
    });

    it("물감 보충 없이 장거리 드래그하면 브리스틀 잔량이 고갈되며 reloadBristleBundle로 복구된다", () => {
      const buffer = new PhysicalPaintCanvasBuffer(80, 24);
      const bristles = createBristleBundleState({
        bristleCount: 36,
        baseColorLinearRgb: [0.65, 0.12, 0.1],
        initialLoad: 0.9,
      });
      let firstLoad = 1;
      let lastLoad = 1;
      for (let step = 0; step < 30; step += 1) {
        const dab = stampMultiBristlePhysicalDab(buffer, bristles, {
          x: 6 + step * 2.2,
          y: 12,
          dirX: 1,
          dirY: 0,
          radiusPx: 4,
          pressure: 0.8,
          loadDepletionRate: 0.04,
          pickupRate: 0,
        });
        if (step === 0) firstLoad = dab.meanRemainingLoad;
        lastLoad = dab.meanRemainingLoad;
      }
      expect(lastLoad).toBeLessThan(firstLoad * 0.35);

      reloadBristleBundle(bristles, [0.1, 0.5, 0.2], 0.95, 0.8);
      expect(bristles.bristles[0].paintLoad).toBeCloseTo(0.95, 5);
      expect(bristles.bristles[0].loadedRgba[1]).toBeCloseTo(0.5, 5);
    });
  });

  describe("연필·목탄 Contact-Tooth 모델", () => {
    it("약한 필압 연필은 종이 봉우리(Peak)만 선택 긁힘, 강한 필압은 골짜기(Valley)까지 밀도 높게 채운다", () => {
      const lowBuf = createBimodalPaperBuffer(40, 40);
      const highBuf = createBimodalPaperBuffer(40, 40);
      const graphite: LinearRgbTuple = [0.05, 0.052, 0.058];

      const lowRes = stampDryMediaContactToothDab(
        lowBuf,
        { x: 20, y: 20, pressure: 0.2 },
        { variant: "pencil", colorLinearRgb: graphite, radiusPx: 11, hardness: 0.55 },
      );
      const highRes = stampDryMediaContactToothDab(
        highBuf,
        { x: 20, y: 20, pressure: 0.95 },
        { variant: "pencil", colorLinearRgb: graphite, radiusPx: 11, hardness: 0.55 },
      );

      expect(lowRes.peakCoverageMean).toBeGreaterThan(0.08);
      expect(lowRes.peakCoverageMean).toBeGreaterThan(lowRes.valleyCoverageMean * 5);
      expect(highRes.valleyCoverageMean).toBeGreaterThan(0.32);
      expect(highRes.valleyCoverageMean).toBeGreaterThan(lowRes.valleyCoverageMean * 8);
    });

    it("연필 틸트 각도가 커지면 접촉 타원이 틸트 방위각으로 길게 늘어나며 광폭 음영을 만든다", () => {
      const uprightBuf = new PhysicalPaintCanvasBuffer(64, 64, { paperProfile: "hot-press-smooth" });
      const tiltedBuf = new PhysicalPaintCanvasBuffer(64, 64, { paperProfile: "hot-press-smooth" });

      const upright = stampDryMediaContactToothDab(
        uprightBuf,
        { x: 32, y: 32, pressure: 0.55, tiltMagnitude: 0.0, tiltAzimuthRad: 0 },
        { variant: "pencil", colorLinearRgb: [0.06, 0.06, 0.065], radiusPx: 6 },
      );
      const tilted = stampDryMediaContactToothDab(
        tiltedBuf,
        { x: 32, y: 32, pressure: 0.55, tiltMagnitude: 0.95, tiltAzimuthRad: 0 },
        { variant: "pencil", colorLinearRgb: [0.06, 0.06, 0.065], radiusPx: 6 },
      );

      expect(tilted.effectiveAspectRatio).toBeGreaterThan(upright.effectiveAspectRatio * 1.8);
      expect(tilted.dirtyRect.width).toBeGreaterThan(tilted.dirtyRect.height * 1.6);
      expect(tilted.dirtyRect.width).toBeGreaterThan(upright.dirtyRect.width * 1.5);
    });

    it("강한 필압 흑연 연필은 무광 목탄보다 뚜렷한 흑연 스펙큘러 광택(meanGraphiteSheen)을 나타낸다", () => {
      const pencilBuf = new PhysicalPaintCanvasBuffer(40, 40, { paperProfile: "hot-press-smooth" });
      const charcoalBuf = new PhysicalPaintCanvasBuffer(40, 40, { paperProfile: "laid-charcoal" });
      const path: readonly StrokePointSample[] = [
        { x: 10, y: 20, pressure: 0.92 },
        { x: 30, y: 20, pressure: 0.95 },
      ];
      const pencilRes = strokeDryMediaContactTooth(pencilBuf, path, {
        variant: "pencil",
        colorLinearRgb: [0.05, 0.05, 0.055],
        radiusPx: 6,
      });
      const charcoalRes = strokeDryMediaContactTooth(charcoalBuf, path, {
        variant: "charcoal",
        colorLinearRgb: [0.02, 0.02, 0.02],
        radiusPx: 6,
      });
      expect(pencilRes.meanGraphiteSheen).toBeGreaterThan(0.08);
      expect(charcoalRes.meanGraphiteSheen).toBe(0);
    });

    it("목탄은 거친 종이 결 위에서 약한 필압일 때 봉우리와 골짜기 대비가 뚜렷하게 분리된다", () => {
      const charcoalBuf = createBimodalPaperBuffer(44, 44);
      const res = strokeDryMediaContactTooth(
        charcoalBuf,
        [
          { x: 12, y: 22, pressure: 0.25, tiltMagnitude: 0.5, tiltAzimuthRad: 0 },
          { x: 32, y: 22, pressure: 0.28, tiltMagnitude: 0.5, tiltAzimuthRad: 0 },
        ],
        { variant: "charcoal", colorLinearRgb: [0.02, 0.02, 0.02], radiusPx: 7 },
      );
      expect(res.pixelsTouched).toBeGreaterThan(60);
      expect(res.peakCoverageMean).toBeGreaterThan(res.valleyCoverageMean * 4);
    });
  });

  describe("수채화 골짜기 침착(Granulation)·가장자리 응집(Backrun)·습윤 확산", () => {
    it("수채화 안료는 연필과 반대로 종이 봉우리보다 종이 골짜기(Valley)에 더 짙게 침착한다", () => {
      const buffer = createBimodalPaperBuffer(44, 44);
      const dirty = stampWatercolorWetDab(buffer, {
        x: 22,
        y: 22,
        radiusPx: 13,
        pressure: 0.78,
        colorLinearRgb: srgbToLinearRgb([0.08, 0.18, 0.78]),
        granulationStrength: 0.75,
        opacity: 0.52,
      });
      const sim = stepWatercolorSimulation(buffer, {
        iterations: 6,
        granulationRate: 0.45,
        backrunEdgeStrength: 0.35,
        bounds: dirty,
      });
      expect(sim.meanValleyPigment).toBeGreaterThan(0.2);
      expect(sim.meanValleyPigment).toBeGreaterThan(sim.meanPeakPigment * 1.45);
    });

    it("수채화 시뮬레이션 후 가장자리(Backrun/Coffee-Ring) 안료 농도가 중심부 농도보다 유의하게 높다", () => {
      const flatTooth = new Float32Array(56 * 56).fill(0.5);
      const buffer = new PhysicalPaintCanvasBuffer(56, 56, { customPaperTooth: flatTooth });
      const cobaltBlue = srgbToLinearRgb([0.06, 0.24, 0.82]);
      const cx = 28;
      const cy = 28;
      const radius = 12;

      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          if (Math.hypot(x - cx, y - cy) <= radius) {
            buffer.setPixel(x, y, {
              r: cobaltBlue[0],
              g: cobaltBlue[1],
              b: cobaltBlue[2],
              a: 0.42,
              wetness: 0.86,
              height: 0.01,
            });
          }
        }
      }

      stepWatercolorSimulation(buffer, {
        iterations: 8,
        diffusionRate: 0.22,
        backrunEdgeStrength: 0.65,
        granulationRate: 0,
        evaporationRate: 0.04,
      });

      let centerSum = 0;
      let centerCount = 0;
      let edgeSum = 0;
      let edgeCount = 0;
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          const d = Math.hypot(x - cx, y - cy);
          const a = buffer.samplePixel(x, y).a;
          if (d <= 4.5) {
            centerSum += a;
            centerCount += 1;
          } else if (d >= radius - 2.2 && d <= radius) {
            edgeSum += a;
            edgeCount += 1;
          }
        }
      }
      expect(edgeSum / edgeCount).toBeGreaterThan((centerSum / centerCount) * 1.25);
    });

    it("인접한 젖은 파랑·노랑 수채화 워시가 습윤 확산되며 경계에 녹색 안료 블룸을 형성한다", () => {
      const flatTooth = new Float32Array(48 * 32).fill(0.5);
      const buffer = new PhysicalPaintCanvasBuffer(48, 32, { customPaperTooth: flatTooth });
      stampWatercolorWetDab(buffer, {
        x: 19,
        y: 16,
        radiusPx: 8,
        pressure: 0.8,
        colorLinearRgb: srgbToLinearRgb([0.05, 0.2, 0.88]),
        opacity: 0.62,
      });
      stampWatercolorWetDab(buffer, {
        x: 29,
        y: 16,
        radiusPx: 8,
        pressure: 0.8,
        colorLinearRgb: srgbToLinearRgb([0.97, 0.86, 0.05]),
        opacity: 0.62,
      });
      stepWatercolorSimulation(buffer, {
        iterations: 8,
        diffusionRate: 0.36,
        backrunEdgeStrength: 0.2,
        granulationRate: 0,
        evaporationRate: 0.02,
      });

      const mid = buffer.samplePixel(24, 16);
      const midSrgb = linearToSrgbRgb([mid.r, mid.g, mid.b]);
      expect(mid.a).toBeGreaterThan(0.25);
      expect(midSrgb[1]).toBeGreaterThan(midSrgb[0]);
      expect(midSrgb[1]).toBeGreaterThan(midSrgb[2]);
    });
  });

  describe("측면 광원(Raking Light) 임파스토 법선·스펙큘러 음영 합성", () => {
    it("임파스토 능선에 측면 광원을 조사하면 빛 받는 면(하이라이트)이 반대쪽 그늘 면보다 뚜렷하게 밝다", () => {
      const flatTooth = new Float32Array(48 * 48).fill(0.5);
      const buffer = new PhysicalPaintCanvasBuffer(48, 48, { customPaperTooth: flatTooth });
      const ochre = srgbToLinearRgb([0.78, 0.56, 0.18]);
      for (let y = 10; y <= 38; y += 1) {
        for (let x = 10; x <= 38; x += 1) {
          const dist = Math.hypot(x - 24, y - 24);
          const dome = dist < 12 ? Math.cos((dist / 12) * Math.PI * 0.5) * 1.4 : 0;
          buffer.setPixel(x, y, {
            r: ochre[0],
            g: ochre[1],
            b: ochre[2],
            a: 0.96,
            height: dome,
            wetness: dome > 0 ? 0.8 : 0.1,
          });
        }
      }

      const litLinear = compositeRakingLightImpastoRgba(buffer, {
        lightAzimuthDeg: 225,
        lightElevationDeg: 24,
        reliefStrength: 4.0,
        specularStrength: 0.55,
        shadowOcclusionStrength: 0.45,
      });
      const lumAt = (x: number, y: number): number => {
        const idx = (y * 48 + x) * 4;
        return relativeLuminanceLinear(litLinear[idx], litLinear[idx + 1], litLinear[idx + 2]);
      };

      expect(lumAt(19, 19)).toBeGreaterThan(lumAt(12, 12) * 1.25);
      expect(lumAt(29, 29)).toBeLessThan(lumAt(12, 12) * 0.85);
      expect(lumAt(19, 19)).toBeGreaterThan(lumAt(29, 29) * 1.6);

      const srgbOut = compositeRakingLightImpastoSrgbUint8(buffer, { lightAzimuthDeg: 225 });
      expect(srgbOut.length).toBe(48 * 48 * 4);
      expect(srgbOut[(19 * 48 + 19) * 4]).toBeGreaterThan(srgbOut[(29 * 48 + 29) * 4]);
    });

    it("측면 광원 방위각을 180° 반전하면 임파스토 하이라이트와 그늘 사면이 정확히 뒤바뀐다", () => {
      const flatTooth = new Float32Array(32 * 32).fill(0.5);
      const buffer = new PhysicalPaintCanvasBuffer(32, 32, { customPaperTooth: flatTooth });
      for (let y = 4; y < 28; y += 1) {
        for (let x = 4; x < 28; x += 1) {
          const ridge = Math.exp(-Math.pow((x - 16) / 4.2, 2)) * 1.3;
          buffer.setPixel(x, y, { r: 0.5, g: 0.32, b: 0.16, a: 1, height: ridge, wetness: 0.7 });
        }
      }

      expect(computeHeightFieldSobelNormal(buffer, 13, 16, { reliefStrength: 3.5 })[0]).toBeLessThan(-0.2);
      expect(computeHeightFieldSobelNormal(buffer, 19, 16, { reliefStrength: 3.5 })[0]).toBeGreaterThan(0.2);

      const fromLeft = compositeRakingLightImpastoRgba(buffer, { lightAzimuthDeg: 180, lightElevationDeg: 22 });
      const fromRight = compositeRakingLightImpastoRgba(buffer, { lightAzimuthDeg: 0, lightElevationDeg: 22 });
      const idxLeft = (16 * 32 + 13) * 4;
      const idxRight = (16 * 32 + 19) * 4;
      expect(fromLeft[idxLeft]).toBeGreaterThan(fromLeft[idxRight] * 1.3);
      expect(fromRight[idxRight]).toBeGreaterThan(fromRight[idxLeft] * 1.3);
    });
  });

  describe("G펜·마루펜 비선형 슬릿 벌어짐·테이퍼·모세관 번짐 및 통합 디스패처", () => {
    it("비선형 필압 슬릿 벌어짐과 날카로운 진입·이탈 테이퍼를 생성하며 마루펜이 더 가느다란 극세선을 유지한다", () => {
      const gLight = evaluateDipPenNibProfile({ x: 0, y: 0, pressure: 0.2 }, 0.5, { variant: "gpen" }, Math.PI * 0.5);
      const gHeavy = evaluateDipPenNibProfile({ x: 10, y: 10, pressure: 0.92 }, 0.5, { variant: "gpen" }, Math.PI * 0.5);
      const gExit = evaluateDipPenNibProfile(
        { x: 20, y: 20, pressure: 0.35, velocityPxPerSec: 1500 },
        0.97,
        { variant: "gpen" },
        Math.PI * 0.5,
      );
      const maruLight = evaluateDipPenNibProfile({ x: 0, y: 0, pressure: 0.2 }, 0.5, { variant: "marupen" }, Math.PI * 0.5);

      expect(gHeavy.widthPx).toBeGreaterThan(gLight.widthPx * 3.5);
      expect(gExit.widthPx).toBeLessThan(gHeavy.widthPx * 0.35);
      expect(maruLight.widthPx).toBeLessThan(gLight.widthPx);
    });

    it("G펜 잉킹 시 종이 섬유 골짜기를 따라 미세 모세관 번짐이 발생하면서도 코어 선명도를 유지한다", () => {
      const buffer = createBimodalPaperBuffer(48, 32);
      const res = stampDipPenInkStroke(
        buffer,
        [
          { x: 8, y: 16, pressure: 0.15 },
          { x: 24, y: 16, pressure: 0.88 },
          { x: 40, y: 16, pressure: 0.12 },
        ],
        { variant: "gpen", capillaryBleedStrength: 0.5 },
      );
      expect(res.maxObservedWidthPx).toBeGreaterThan(res.minObservedWidthPx * 2.5);
      expect(res.capillaryBleedPixels).toBeGreaterThan(10);
      expect(buffer.samplePixel(24, 16).a).toBeGreaterThan(0.9);
    });

    it("통합 디스패처 applyPhysicalMediaStroke가 5대 매체 전부를 물리 버퍼에 일관되게 렌더링한다", () => {
      const media: readonly TactileMediaPresetId[] = ["pencil", "charcoal", "watercolor", "oil", "gpen"];
      const stroke: readonly StrokePointSample[] = [
        { x: 10, y: 18, pressure: 0.35, tiltMagnitude: 0.35 },
        { x: 24, y: 18, pressure: 0.85, tiltMagnitude: 0.25 },
        { x: 38, y: 18, pressure: 0.3, tiltMagnitude: 0.4 },
      ];
      for (const medium of media) {
        const preset = PHYSICAL_MEDIA_TACTILE_PRESETS[medium];
        const buffer = new PhysicalPaintCanvasBuffer(48, 36, { paperProfile: preset.paperProfile });
        const summary = applyPhysicalMediaStroke(buffer, {
          medium,
          points: stroke,
          colorLinearRgb: preset.defaultPigmentLinearRgb,
          radiusPx: Math.min(8, preset.defaultRadiusPx),
        });
        expect(summary.medium).toBe(medium);
        expect(summary.dirtyRect.empty).toBe(false);
        expect(summary.paintedPixelsInBuffer).toBeGreaterThan(20);
        if (medium === "oil") expect(summary.maxImpastoHeight).toBeGreaterThan(0.35);
      }
    });
  });

  describe("WebGPU WGSL 셰이더 구문·바인딩 계약 및 5대 매체 프리셋", () => {
    it("TACTILE_IMPASTO_RELIEF_WGSL이 괄호 균형·바인딩 계약·컴퓨트/프래그먼트 진입점과 소벨/스펙큘러 연산을 충족한다", () => {
      const validation = validateWgslShaderContract(
        TACTILE_IMPASTO_RELIEF_WGSL,
        WGSL_TACTILE_BINDING_CONTRACTS.impastoRelief,
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.discoveredBindings).toEqual([0, 1, 2, 3, 4, 5]);
      expect(validation.discoveredEntryPoints).toContain("cs_tactile_impasto_relief");
      expect(validation.discoveredEntryPoints).toContain("vs_fullscreen_quad");
      expect(validation.discoveredEntryPoints).toContain("fs_tactile_impasto_relief");
      expect(TACTILE_IMPASTO_RELIEF_WGSL).toContain("computeSobelNormal");
      expect(TACTILE_IMPASTO_RELIEF_WGSL).toContain("shadowOcclusionStrength");
      expect(TACTILE_IMPASTO_RELIEF_WGSL).toContain("linearToSrgb3");
    });

    it("WATERCOLOR_GRANULATION_WGSL이 핑퐁 스토리지 바인딩 계약·Kubelka-Munk·백런·그래뉼레이션 연산을 충족한다", () => {
      const validation = validateWgslShaderContract(
        WATERCOLOR_GRANULATION_WGSL,
        WGSL_TACTILE_BINDING_CONTRACTS.watercolorGranulation,
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.discoveredBindings).toEqual([0, 1, 2, 3, 4, 5]);
      expect(validation.discoveredEntryPoints).toEqual(["cs_watercolor_granulation_step"]);
      expect(WATERCOLOR_GRANULATION_WGSL).toContain("kmMixRgb");
      expect(WATERCOLOR_GRANULATION_WGSL).toContain("backrunDelta");
      expect(WATERCOLOR_GRANULATION_WGSL).toContain("granulationDelta");
    });

    it("5대 매체 고감도 프리셋과 16-byte 정렬 GPU 유니폼 패커가 유효한 유한 수치를 생성한다", () => {
      const presetIds: readonly TactileMediaPresetId[] = ["pencil", "charcoal", "watercolor", "oil", "gpen"];
      expect(Object.keys(PHYSICAL_MEDIA_TACTILE_PRESETS).sort()).toEqual([...presetIds].sort());

      for (const id of presetIds) {
        const preset = PHYSICAL_MEDIA_TACTILE_PRESETS[id];
        expect(preset.labelKo.length).toBeGreaterThan(2);
        expect(preset.summaryKo.length).toBeGreaterThan(8);
        expect(preset.bristleCount).toBeGreaterThanOrEqual(MIN_MULTI_BRISTLE_COUNT);
        expect(preset.bristleCount).toBeLessThanOrEqual(MAX_MULTI_BRISTLE_COUNT);
      }
      expect(PHYSICAL_MEDIA_TACTILE_PRESETS.oil.reliefStrength).toBeGreaterThan(
        PHYSICAL_MEDIA_TACTILE_PRESETS.watercolor.reliefStrength * 2,
      );
      expect(PHYSICAL_MEDIA_TACTILE_PRESETS.watercolor.backrunEdgeStrength).toBeGreaterThan(0.4);
      expect(PHYSICAL_MEDIA_TACTILE_PRESETS.gpen.slitFlexExponent).toBeGreaterThan(1.6);

      const impastoUniforms = packImpastoReliefUniforms({
        width: 1920,
        height: 1080,
        lightAzimuthDeg: 315,
        lightElevationDeg: 24,
        reliefStrength: PHYSICAL_MEDIA_TACTILE_PRESETS.oil.reliefStrength,
      });
      expect(impastoUniforms.length).toBe(WGSL_TACTILE_BINDING_CONTRACTS.impastoRelief.uniformFloatCount);
      expect(impastoUniforms.byteLength).toBe(WGSL_TACTILE_BINDING_CONTRACTS.impastoRelief.uniformByteLength);
      expect(impastoUniforms.byteLength % 16).toBe(0);
      expect(Array.from(impastoUniforms).every((v) => Number.isFinite(v))).toBe(true);

      const wcUniforms = packWatercolorGranulationUniforms({
        width: 1920,
        height: 1080,
        backrunEdgeStrength: PHYSICAL_MEDIA_TACTILE_PRESETS.watercolor.backrunEdgeStrength,
        granulationRate: PHYSICAL_MEDIA_TACTILE_PRESETS.watercolor.granulationStrength,
      });
      expect(wcUniforms.length).toBe(WGSL_TACTILE_BINDING_CONTRACTS.watercolorGranulation.uniformFloatCount);
      expect(wcUniforms.byteLength).toBe(WGSL_TACTILE_BINDING_CONTRACTS.watercolorGranulation.uniformByteLength);
      expect(wcUniforms.byteLength % 16).toBe(0);
      expect(Array.from(wcUniforms).every((v) => Number.isFinite(v))).toBe(true);
    });
  });
});
