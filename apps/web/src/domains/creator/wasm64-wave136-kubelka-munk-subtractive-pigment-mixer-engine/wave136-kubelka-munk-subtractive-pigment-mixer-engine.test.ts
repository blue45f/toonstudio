import { describe, expect, it } from "vitest";

import {
  buildMediumPigmentKs,
  buildSubtractivePigmentWgsl,
  compareMediumGlazingTriplet,
  compareSubtractiveVsRgbMix,
  computePigmentRecipeManifestHash,
  escapePigmentXml,
  evaluateKubelkaMunkBandOverSubstrate,
  evaluateKubelkaMunkLayerOverSubstrate,
  getPaperSubstrate,
  getStudioPigmentPreset,
  getWetMediumPreset,
  ksToReflectance,
  liftSrgbToSpectralReflectance,
  mixSubtractivePigments,
  reflectanceToKs,
  renderPigmentMixComparisonSvg,
  sha256HexSync,
  simulateMultiLayerGlazing,
  simulateWatercolorEdgeDarkening,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_WAVELENGTHS_NM,
  spectralKsToReflectance,
  spectralReflectanceToLinearRgb,
  spectralReflectanceToOklch,
  spectralReflectanceToSrgb,
  spectralReflectanceToXyz,
  STUDIO_PIGMENT_IDS,
  summarizePigmentMixAuditKo,
  validateSubtractivePigmentWgsl,
  WET_MEDIUM_PRESET_IDS,
  type SpectralTuple10,
} from "./index";

describe("Wave 136 — Kubelka-Munk 10-밴드 감산 안료 혼색 및 수채·과슈 엣지 다크닝 엔진", () => {
  describe("1. Kubelka-Munk K/S ↔ 반사율 스펙트럼 변환 및 색채학", () => {
    it("10개 가시광선 파장 밴드가 400nm~700nm 구간에 단조 증가 배치된다", () => {
      expect(SPECTRAL_BAND_COUNT).toBe(10);
      expect(SPECTRAL_WAVELENGTHS_NM).toHaveLength(10);
      expect(SPECTRAL_WAVELENGTHS_NM[0]).toBeGreaterThanOrEqual(400);
      expect(SPECTRAL_WAVELENGTHS_NM[9]).toBeLessThanOrEqual(700);
      for (let i = 1; i < SPECTRAL_WAVELENGTHS_NM.length; i += 1) {
        expect(SPECTRAL_WAVELENGTHS_NM[i]).toBeGreaterThan(SPECTRAL_WAVELENGTHS_NM[i - 1]);
      }
    });

    it("reflectanceToKs → ksToReflectance 왕복 오차가 전 범위에서 1e-6 미만이다", () => {
      const samples = [0.001, 0.01, 0.05, 0.15, 0.33, 0.5, 0.72, 0.9, 0.99, 0.999];
      let maxErr = 0;
      for (const r of samples) {
        const ks = reflectanceToKs(r);
        const recovered = ksToReflectance(ks);
        const err = Math.abs(recovered - r);
        if (err > maxErr) {
          maxErr = err;
        }
      }
      expect(maxErr).toBeLessThan(1e-6);
    });

    it("10-밴드 벡터 왕복 변환이 모든 8종 화방 안료 프리셋에서 1e-6 미만 오차를 보인다", () => {
      expect(STUDIO_PIGMENT_IDS.length).toBeGreaterThanOrEqual(8);
      for (const id of STUDIO_PIGMENT_IDS) {
        const preset = getStudioPigmentPreset(id);
        const ks = preset.reflectance.map((r) => reflectanceToKs(r)) as unknown as SpectralTuple10;
        const back = spectralKsToReflectance(ks);
        for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
          expect(Math.abs(back[b] - preset.reflectance[b])).toBeLessThan(1e-6);
        }
      }
    });

    it("극단적인 고흡수 K/S(1e5)에서도 수치 소거 없이 양수 유한 반사율을 반환한다", () => {
      const rDark = ksToReflectance(1e5);
      expect(Number.isFinite(rDark)).toBe(true);
      expect(rDark).toBeGreaterThan(0);
      expect(rDark).toBeLessThan(1e-4);
      expect(ksToReflectance(0)).toBe(1);
      expect(ksToReflectance(-5)).toBe(1);
    });

    it("평탄 백색 스펙트럼 R(λ)=1은 정확한 D65 백색점과 선형 sRGB (1,1,1)로 사상된다", () => {
      const flatWhite: SpectralTuple10 = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      const xyz = spectralReflectanceToXyz(flatWhite);
      expect(xyz[0]).toBeCloseTo(0.95047, 5);
      expect(xyz[1]).toBeCloseTo(1.0, 5);
      expect(xyz[2]).toBeCloseTo(1.08883, 5);
      const lin = spectralReflectanceToLinearRgb(flatWhite);
      expect(lin[0]).toBeCloseTo(1, 4);
      expect(lin[1]).toBeCloseTo(1, 4);
      expect(lin[2]).toBeCloseTo(1, 4);
      const oklch = spectralReflectanceToOklch(flatWhite);
      expect(oklch.l).toBeCloseTo(1, 3);
      expect(oklch.c).toBeLessThan(0.002);
    });

    it("8종 화방 안료 프리셋 각각이 물리적으로 타당한 색상각과 명도 범위를 가진다", () => {
      const blue = spectralReflectanceToOklch(getStudioPigmentPreset("ultramarine-blue").reflectance);
      const yellow = spectralReflectanceToOklch(getStudioPigmentPreset("cadmium-yellow").reflectance);
      const white = spectralReflectanceToOklch(getStudioPigmentPreset("titanium-white").reflectance);
      const black = spectralReflectanceToOklch(getStudioPigmentPreset("carbon-black").reflectance);
      const red = spectralReflectanceToOklch(getStudioPigmentPreset("vermilion-red").reflectance);

      expect(blue.h).toBeGreaterThan(230);
      expect(blue.h).toBeLessThan(285);
      expect(yellow.h).toBeGreaterThan(80);
      expect(yellow.h).toBeLessThan(118);
      expect(white.l).toBeGreaterThan(0.95);
      expect(black.l).toBeLessThan(0.25);
      expect(red.c).toBeGreaterThan(0.14);
    });

    it("임의 sRGB 색상의 스펙트럼 업샘플링 재투영 색차가 낮고 매끄럽다", () => {
      const testColors: readonly (readonly [number, number, number])[] = [
        [0.5, 0.5, 0.5],
        [0.78, 0.34, 0.28],
        [0.24, 0.62, 0.48],
        [0.32, 0.44, 0.78],
        [0.86, 0.74, 0.3],
      ];
      for (const srgb of testColors) {
        const lifted = liftSrgbToSpectralReflectance(srgb);
        expect(lifted.maxChannelError).toBeLessThan(0.03);
        expect(lifted.oklchDeltaE).toBeLessThan(0.03);
        for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
          expect(lifted.reflectance[b]).toBeGreaterThan(0);
          expect(lifted.reflectance[b]).toBeLessThan(1);
        }
      }
    });

    it("무채색 회색 sRGB 업샘플링은 거칠기 0에 가까운 평탄 스펙트럼을 산출한다", () => {
      const gray = liftSrgbToSpectralReflectance([0.55, 0.55, 0.55]);
      expect(gray.roughnessScore).toBeLessThan(0.005);
      expect(gray.maxChannelError).toBeLessThan(0.002);
    });
  });

  describe("2. 감산 안료 혼색 핵심 불변량 (파랑+노랑=생생한 녹색 vs RGB 회색화)", () => {
    it("울트라마린 블루 + 카드뮴 옐로 50:50 감산 혼색이 선명한 녹색(H 115°~165°, C > 0.08)을 산출한다", () => {
      const mix = mixSubtractivePigments([
        { pigmentId: "ultramarine-blue", weight: 0.5 },
        { pigmentId: "cadmium-yellow", weight: 0.5 },
      ]);
      expect(mix.oklch.h).toBeGreaterThanOrEqual(115);
      expect(mix.oklch.h).toBeLessThanOrEqual(165);
      expect(mix.oklch.c).toBeGreaterThan(0.08);
      // 530nm 녹색 대역 반사율이 청색(440nm) 및 적색(620nm)보다 뚜렷하게 높아야 한다.
      expect(mix.reflectance[4]).toBeGreaterThan(mix.reflectance[1]);
      expect(mix.reflectance[4]).toBeGreaterThan(mix.reflectance[7]);
    });

    it("compareSubtractiveVsRgbMix에서 파랑+노랑 감산 혼색이 RGB 선형 보간 대비 뚜렷한 채도 우위를 증명한다", () => {
      const cmp = compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow", 0.5, 11);
      expect(cmp.isVividGreenMidpoint).toBe(true);
      expect(cmp.subtractiveMidpoint.oklch.h).toBeGreaterThanOrEqual(115);
      expect(cmp.subtractiveMidpoint.oklch.h).toBeLessThanOrEqual(165);
      expect(cmp.subtractiveMidpoint.oklch.c).toBeGreaterThan(0.08);
      expect(cmp.subtractiveMidpoint.oklch.c).toBeGreaterThan(cmp.rgbLinearMidpointOklch.c);
      expect(cmp.chromaAdvantage).toBeGreaterThan(0.03);
      expect(cmp.chromaRatio).toBeGreaterThan(1.4);
      expect(cmp.stops).toHaveLength(11);
    });

    it("단일 상수 K/S 모드에서도 파랑+노랑 50:50 혼합이 녹색 대역을 유지한다", () => {
      const singleKm = mixSubtractivePigments(
        [
          { pigmentId: "ultramarine-blue", weight: 1 },
          { pigmentId: "cadmium-yellow", weight: 1 },
        ],
        { useTwoConstantKm: false },
      );
      expect(singleKm.usedTwoConstantKm).toBe(false);
      expect(singleKm.oklch.h).toBeGreaterThanOrEqual(115);
      expect(singleKm.oklch.h).toBeLessThanOrEqual(165);
      expect(singleKm.oklch.c).toBeGreaterThan(0.08);
    });

    it("프탈로 시안 + 카드뮴 옐로 감산 혼색은 에메랄드계 고채도 녹색을 산출한다", () => {
      const emerald = compareSubtractiveVsRgbMix("phthalo-cyan", "cadmium-yellow", 0.5);
      expect(emerald.isVividGreenMidpoint).toBe(true);
      expect(emerald.subtractiveMidpoint.oklch.c).toBeGreaterThan(0.1);
      expect(emerald.chromaAdvantage).toBeGreaterThan(0.02);
    });

    it("퀴나크리돈 마젠타 + 카드뮴 옐로 감산 혼색은 선명한 주황/다홍 계열로 이동한다", () => {
      const orange = mixSubtractivePigments([
        { pigmentId: "quinacridone-magenta", weight: 0.5 },
        { pigmentId: "cadmium-yellow", weight: 0.5 },
      ]);
      expect(orange.oklch.h).toBeGreaterThan(20);
      expect(orange.oklch.h).toBeLessThan(70);
      expect(orange.oklch.c).toBeGreaterThan(0.11);
    });

    it("티타늄 화이트를 섞으면 명도가 상승하고 카본 블랙을 섞으면 명도가 하락한다", () => {
      const baseRed = mixSubtractivePigments([{ pigmentId: "vermilion-red", weight: 1 }]);
      const tintRed = mixSubtractivePigments([
        { pigmentId: "vermilion-red", weight: 0.5 },
        { pigmentId: "titanium-white", weight: 0.5 },
      ]);
      const shadeRed = mixSubtractivePigments([
        { pigmentId: "vermilion-red", weight: 0.5 },
        { pigmentId: "carbon-black", weight: 0.5 },
      ]);
      const baseBlue = mixSubtractivePigments([{ pigmentId: "ultramarine-blue", weight: 1 }]);
      const tintBlue = mixSubtractivePigments([
        { pigmentId: "ultramarine-blue", weight: 0.5 },
        { pigmentId: "titanium-white", weight: 0.5 },
      ]);
      expect(tintRed.oklch.l).toBeGreaterThan(baseRed.oklch.l + 0.06);
      expect(shadeRed.oklch.l).toBeLessThan(baseRed.oklch.l - 0.14);
      expect(tintBlue.oklch.l).toBeGreaterThan(baseBlue.oklch.l + 0.12);
    });

    it("단일 안료 100% 혼합은 원래 프리셋 반사율과 일치하고, 빈 입력은 안전 폴백을 반환한다", () => {
      const preset = getStudioPigmentPreset("burnt-sienna");
      const single = mixSubtractivePigments([{ pigmentId: "burnt-sienna", weight: 3.5 }]);
      for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
        expect(Math.abs(single.reflectance[b] - preset.reflectance[b])).toBeLessThan(1e-6);
      }
      const empty = mixSubtractivePigments([]);
      expect(empty.totalWeight).toBe(0);
      expect(empty.oklch.l).toBeGreaterThan(0.95);
    });

    it("커스텀 sRGB 입력을 안료 레시피에 섞어도 유한한 OKLCH 결과를 생성한다", () => {
      const mixed = mixSubtractivePigments([
        { pigmentId: "ultramarine-blue", weight: 0.5 },
        { customSrgb: [0.95, 0.82, 0.12], weight: 0.5 },
      ]);
      expect(Number.isFinite(mixed.oklch.l)).toBe(true);
      expect(mixed.oklch.h).toBeGreaterThanOrEqual(110);
      expect(mixed.oklch.h).toBeLessThanOrEqual(170);
      expect(mixed.oklchCss.startsWith("oklch(")).toBe(true);
    });
  });

  describe("3. 유한 두께 Kubelka-Munk 글레이징 (수채·과슈·알코올 마카)", () => {
    it("3종 매체 프리셋이 모두 등록되어 있으며 산란 계수 서열(마카 < 수채 << 과슈)을 따른다", () => {
      expect(WET_MEDIUM_PRESET_IDS).toHaveLength(3);
      const wc = getWetMediumPreset("watercolor-transparent");
      const gouache = getWetMediumPreset("gouache-opaque");
      const marker = getWetMediumPreset("alcohol-marker-blend");
      expect(marker.scatteringScale).toBeLessThan(wc.scatteringScale);
      expect(wc.scatteringScale).toBeLessThan(gouache.scatteringScale);
      expect(wc.capillaryRimStrength).toBeGreaterThan(gouache.capillaryRimStrength * 5);
    });

    it("유한 두께 KM 방정식의 경계 극한(X=0 → 기판, X→∞ → R∞, S=0 → Beer-Lambert)이 정확하다", () => {
      const rZero = evaluateKubelkaMunkBandOverSubstrate(1.5, 0.8, 0, 0.92);
      expect(rZero).toBeCloseTo(0.92, 10);

      const rInfExpected = ksToReflectance(1.5 / 0.8);
      const rThick = evaluateKubelkaMunkBandOverSubstrate(1.5, 0.8, 25, 0.05);
      expect(rThick).toBeCloseTo(rInfExpected, 6);

      const rBeer = evaluateKubelkaMunkBandOverSubstrate(0.7, 0, 0.5, 0.9);
      expect(rBeer).toBeCloseTo(0.9 * Math.exp(-0.7), 6);

      const rWhiteScatter = evaluateKubelkaMunkBandOverSubstrate(0, 2.0, 5.0, 0.05);
      expect(rWhiteScatter).toBeGreaterThan(0.9);
    });

    it("투명 수채 글레이징은 1→4회 덧칠할수록 명도가 단조 감소하고 초기 도포에서 종이 밝기가 투과된다", () => {
      const glaze = simulateMultiLayerGlazing(
        [
          { pigmentId: "ultramarine-blue", mediumPreset: "watercolor-transparent" },
          { pigmentId: "ultramarine-blue", mediumPreset: "watercolor-transparent" },
          { pigmentId: "ultramarine-blue", mediumPreset: "watercolor-transparent" },
          { pigmentId: "ultramarine-blue", mediumPreset: "watercolor-transparent" },
        ],
        "cotton-cold-press",
      );
      expect(glaze.lightnessMonotonicDecreasing).toBe(true);
      expect(glaze.coats).toHaveLength(4);
      // 1회 도포는 투명하므로 종이 바탕 영향으로 4회 도포보다 확연히 밝다.
      expect(glaze.coats[0].oklch.l).toBeGreaterThan(glaze.coats[3].oklch.l + 0.06);
      expect(glaze.coats[0].oklch.l).toBeLessThan(glaze.substrateOklch.l);
    });

    it("불투명 과슈는 암흑 차콜 바탕 위에서도 밝은 카드뮴 옐로로 바탕을 강하게 은폐한다", () => {
      const darkPaper = getPaperSubstrate("charcoal-dark-test");
      const { absorptionK, scatteringS } = buildMediumPigmentKs("cadmium-yellow", "gouache-opaque");
      const thickGouache = evaluateKubelkaMunkLayerOverSubstrate(
        absorptionK,
        scatteringS,
        3.0,
        darkPaper.reflectance,
      );
      const wcKs = buildMediumPigmentKs("cadmium-yellow", "watercolor-transparent");
      const thinWatercolor = evaluateKubelkaMunkLayerOverSubstrate(
        wcKs.absorptionK,
        wcKs.scatteringS,
        0.5,
        darkPaper.reflectance,
      );
      const yellowIntrinsic = spectralReflectanceToOklch(
        getStudioPigmentPreset("cadmium-yellow").reflectance,
      );

      expect(thickGouache.hidingPower).toBeGreaterThan(0.92);
      expect(thickGouache.oklch.l).toBeGreaterThan(0.75);
      expect(Math.abs(thickGouache.oklch.l - yellowIntrinsic.l)).toBeLessThan(0.06);
      // 같은 어두운 종이에서 투명 수채는 바탕을 못 가려 훨씬 어둡다.
      expect(thickGouache.oklch.l).toBeGreaterThan(thinWatercolor.oklch.l + 0.45);
    });

    it("알코올 마카는 코튼/브리스톨지 위에서 투명 적층 시 명도가 단계적으로 깊어진다", () => {
      const markerGlaze = simulateMultiLayerGlazing(
        [
          { pigmentId: "quinacridone-magenta", mediumPreset: "alcohol-marker-blend" },
          { pigmentId: "quinacridone-magenta", mediumPreset: "alcohol-marker-blend" },
          { pigmentId: "quinacridone-magenta", mediumPreset: "alcohol-marker-blend" },
        ],
        "hot-press-bright",
      );
      expect(markerGlaze.lightnessMonotonicDecreasing).toBe(true);
      expect(markerGlaze.coats[2].oklch.l).toBeLessThan(markerGlaze.coats[0].oklch.l);
      expect(markerGlaze.coats[0].oklch.c).toBeGreaterThan(0.08);
    });

    it("이종 안료 다층 글레이징(노랑 바탕 + 파랑 수채 상도)이 녹색 계열 투과 혼색을 만든다", () => {
      const glazedGreen = simulateMultiLayerGlazing(
        [
          { pigmentId: "cadmium-yellow", mediumPreset: "watercolor-transparent", thicknessScale: 1.4 },
          { pigmentId: "ultramarine-blue", mediumPreset: "watercolor-transparent", thicknessScale: 1.0 },
        ],
        "cotton-cold-press",
      );
      expect(glazedGreen.finalOklch.h).toBeGreaterThan(110);
      expect(glazedGreen.finalOklch.h).toBeLessThan(175);
      expect(glazedGreen.finalOklch.c).toBeGreaterThan(0.06);
    });

    it("compareMediumGlazingTriplet은 3종 매체 모두에 대해 일관된 코트 수를 반환한다", () => {
      const triplet = compareMediumGlazingTriplet("ultramarine-blue", 4, "cotton-cold-press");
      expect(triplet["watercolor-transparent"].coats).toHaveLength(4);
      expect(triplet["gouache-opaque"].coats).toHaveLength(4);
      expect(triplet["alcohol-marker-blend"].coats).toHaveLength(4);
      expect(triplet["gouache-opaque"].finalHidingPower).toBeGreaterThan(
        triplet["watercolor-transparent"].finalHidingPower,
      );
    });
  });

  describe("4. 2D 수채 모세관 엣지 다크닝(Coffee-Ring) & 질량 보존", () => {
    it("수채 32×32 타일에서 테두리 안료 농도가 내부보다 유의미하게 높고 시각 명도도 더 어둡다", () => {
      const sim = simulateWatercolorEdgeDarkening({
        width: 32,
        height: 32,
        pigmentId: "ultramarine-blue",
        mediumPreset: "watercolor-transparent",
        steps: 40,
      });
      expect(sim.nonFiniteCount).toBe(0);
      expect(sim.wetCellCount).toBeGreaterThan(200);
      expect(sim.edgeToInteriorRatio).toBeGreaterThan(1.3);
      expect(sim.edgeMeanConcentration).toBeGreaterThan(sim.interiorMeanConcentration);
      expect(sim.edgeDarkerThanInterior).toBe(true);
      expect(sim.edgeMeanLightness).toBeLessThan(sim.interiorMeanLightness);
      expect(sim.minWetConcentration).toBeGreaterThanOrEqual(0);
    });

    it("수채·과슈·마카 전 매체에서 전체 안료 질량 보존 상대 오차가 1e-6 미만이다", () => {
      for (const mediumPreset of WET_MEDIUM_PRESET_IDS) {
        const sim = simulateWatercolorEdgeDarkening({
          width: 32,
          height: 32,
          pigmentId: "burnt-sienna",
          mediumPreset,
          steps: 36,
        });
        expect(sim.nonFiniteCount).toBe(0);
        expect(sim.initialTotalMass).toBeGreaterThan(0);
        expect(sim.massConservationRelativeError).toBeLessThan(1e-6);
      }
    });

    it("과슈 및 알코올 마카는 수채보다 테두리 농축(Coffee-Ring) 비율이 확연히 낮다", () => {
      const wc = simulateWatercolorEdgeDarkening({
        mediumPreset: "watercolor-transparent",
        pigmentId: "quinacridone-magenta",
        steps: 36,
      });
      const gouache = simulateWatercolorEdgeDarkening({
        mediumPreset: "gouache-opaque",
        pigmentId: "quinacridone-magenta",
        steps: 36,
      });
      const marker = simulateWatercolorEdgeDarkening({
        mediumPreset: "alcohol-marker-blend",
        pigmentId: "quinacridone-magenta",
        steps: 36,
      });
      expect(wc.edgeToInteriorRatio).toBeGreaterThan(gouache.edgeToInteriorRatio + 0.2);
      expect(wc.edgeToInteriorRatio).toBeGreaterThan(marker.edgeToInteriorRatio + 0.2);
    });

    it("동일 시드와 파라미터로 실행하면 2D 안료 필드가 비트 단위로 결정론적이다", () => {
      const run1 = simulateWatercolorEdgeDarkening({ seed: 99136, steps: 24 });
      const run2 = simulateWatercolorEdgeDarkening({ seed: 99136, steps: 24 });
      expect(run1.finalTotalMass).toBe(run2.finalTotalMass);
      expect(run1.edgeToInteriorRatio).toBe(run2.edgeToInteriorRatio);
      for (let i = 0; i < run1.finalPigmentField.length; i += 1) {
        expect(run1.finalPigmentField[i]).toBe(run2.finalPigmentField[i]);
      }
    });

    it("수채 반경 프로파일은 중심(r≈0)보다 외곽 접촉선(r≈1) 구간 농도가 뚜렷이 높다", () => {
      const sim = simulateWatercolorEdgeDarkening({
        mediumPreset: "watercolor-transparent",
        steps: 42,
      });
      const inner = sim.radialProfile[1];
      const outer = sim.radialProfile[sim.radialProfile.length - 1];
      expect(outer.meanConcentration).toBeGreaterThan(inner.meanConcentration * 1.25);
    });
  });

  describe("5. WebGPU WGSL 감산 안료 셰이더 생성 및 구조 검증", () => {
    it("3종 매체 모두에 대해 16바이트 정렬 유니폼·@compute·@fragment WGSL이 통과 검증된다", () => {
      for (const mediumPreset of WET_MEDIUM_PRESET_IDS) {
        const artifact = buildSubtractivePigmentWgsl({ mediumPreset });
        expect(artifact.uniformBufferByteLength % 16).toBe(0);
        expect(artifact.uniformBufferByteLength).toBe(96);
        expect(artifact.bindings).toHaveLength(5);
        expect(artifact.entryPoints).toContain("cs_subtractive_mix_and_backrun");
        expect(artifact.entryPoints).toContain("fs_subtractive_pigment_preview");

        const report = validateSubtractivePigmentWgsl(artifact.wgsl);
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(report.uniformBufferAligned).toBe(true);
        expect(report.hasComputeEntry).toBe(true);
        expect(report.hasFragmentEntry).toBe(true);
        expect(report.bindingCount).toBe(5);
      }
    });

    it("손상된 괄호·GLSL 금지어·중복 바인딩·비정렬 유니폼을 검증기가 정확히 차단한다", () => {
      const base = buildSubtractivePigmentWgsl().wgsl;

      const badBrace = validateSubtractivePigmentWgsl(`${base}\nfn broken( {`);
      expect(badBrace.valid).toBe(false);
      expect(badBrace.errors.some((e) => e.includes("괄호"))).toBe(true);

      const badGlsl = validateSubtractivePigmentWgsl(
        base.replace("return vec4<f32>(srgb, 1.0);", "return vec4(gl_FragCoord.xy, 0.0, 1.0);"),
      );
      expect(badGlsl.valid).toBe(false);
      expect(badGlsl.errors.some((e) => e.includes("gl_FragCoord"))).toBe(true);

      const dupBinding = validateSubtractivePigmentWgsl(
        base.replace("@binding(1)", "@binding(0)"),
      );
      expect(dupBinding.valid).toBe(false);
      expect(dupBinding.errors.some((e) => e.includes("중복된 WGSL 바인딩"))).toBe(true);

      const badAlign = validateSubtractivePigmentWgsl(
        base.replace("qa_flags: vec4<f32>,", "qa_flags: f32,"),
      );
      expect(badAlign.valid).toBe(false);
      expect(badAlign.uniformBufferAligned).toBe(false);

      const emptyCheck = validateSubtractivePigmentWgsl("   ");
      expect(emptyCheck.valid).toBe(false);
    });
  });

  describe("6. 순수 OKLCH SVG 렌더러, XSS 방어, 한국어 브리프 및 FIPS 180-4 SHA-256", () => {
    it("순수 ES2017 동기 FIPS 180-4 SHA-256이 NIST 공식 테스트 벡터와 정확히 일치한다", () => {
      expect(sha256HexSync("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256HexSync("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(
        sha256HexSync("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
      // 한글 UTF-8 다바이트 결정론 검증
      const ko1 = sha256HexSync("울트라마린 블루 + 카드뮴 옐로");
      const ko2 = sha256HexSync("울트라마린 블루 + 카드뮴 옐로");
      expect(ko1).toHaveLength(64);
      expect(ko1).toBe(ko2);
    });

    it("안료 레시피 매니페스트 해시가 동일 입력에 대해 결정론적이고 파라미터 변경에 민감하다", () => {
      const h1 = computePigmentRecipeManifestHash({
        pigmentAId: "ultramarine-blue",
        pigmentBId: "cadmium-yellow",
        midpointRatioB: 0.5,
        mediumPreset: "watercolor-transparent",
        substrateId: "cotton-cold-press",
        coatCount: 4,
        tileWidth: 32,
        tileHeight: 32,
        simulationSteps: 36,
      });
      const h2 = computePigmentRecipeManifestHash({
        pigmentAId: "ultramarine-blue",
        pigmentBId: "cadmium-yellow",
        midpointRatioB: 0.5,
        mediumPreset: "watercolor-transparent",
        substrateId: "cotton-cold-press",
        coatCount: 4,
        tileWidth: 32,
        tileHeight: 32,
        simulationSteps: 36,
      });
      const hChanged = computePigmentRecipeManifestHash({
        pigmentAId: "ultramarine-blue",
        pigmentBId: "cadmium-yellow",
        midpointRatioB: 0.6,
        mediumPreset: "watercolor-transparent",
        substrateId: "cotton-cold-press",
        coatCount: 4,
        tileWidth: 32,
        tileHeight: 32,
        simulationSteps: 36,
      });
      expect(h1).toHaveLength(64);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(hChanged);
    });

    it("SVG 진단 시트는 순수 oklch(...) 색상만 사용하며 원시 hex/rgb/hsl이 0건이다", () => {
      const comparison = compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow", 0.5, 11);
      const backrun = simulateWatercolorEdgeDarkening({
        pigmentId: "ultramarine-blue",
        mediumPreset: "watercolor-transparent",
        steps: 36,
      });
      const svg = renderPigmentMixComparisonSvg(comparison, backrun);

      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(/#[0-9a-fA-F]{3,8}\b/.test(svg)).toBe(false);
      expect(/\brgba?\s*\(/i.test(svg)).toBe(false);
      expect(/\bhsla?\s*\(/i.test(svg)).toBe(false);
      expect(/\b(?:NaN|Infinity)\b/.test(svg)).toBe(false);
    });

    it("SVG 제목·메모에 포함된 XSS 스크립트 태그와 따옴표를 완벽히 이스케이프한다", () => {
      const comparison = compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow");
      const backrun = simulateWatercolorEdgeDarkening();
      const xssPayload = `<script>alert("xss")</script> & 'quote'`;
      const svg = renderPigmentMixComparisonSvg(comparison, backrun, {
        titleKo: xssPayload,
        artistNoteKo: `메모: <img src=x onerror="evil()">`,
      });

      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<img ");
      expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
      expect(svg).toContain("&amp; &apos;quote&apos;");
      expect(escapePigmentXml(`a<b&c>"'d`)).toBe("a&lt;b&amp;c&gt;&quot;&apos;d");
    });

    it("한국어 채색 감독 QA 브리프가 정상 조건에서 PASS를 판정하고 번역투 없이 실무 요약한다", () => {
      const comparison = compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow");
      const backrun = simulateWatercolorEdgeDarkening({
        pigmentId: "ultramarine-blue",
        mediumPreset: "watercolor-transparent",
        steps: 40,
      });
      const glazingTriplet = compareMediumGlazingTriplet("ultramarine-blue", 4, "cotton-cold-press");
      const wgslValidation = validateSubtractivePigmentWgsl(buildSubtractivePigmentWgsl().wgsl);
      const report = summarizePigmentMixAuditKo({
        comparison,
        backrun,
        glazingTriplet,
        ksRoundTripMaxError: 1e-12,
        wgslValidation,
        generatedDateIso: "2026-11-28",
      });

      expect(report.grade).toBe("PASS");
      expect(report.passed).toBe(true);
      expect(report.recipeHash).toHaveLength(64);
      expect(report.checks).toHaveLength(5);
      expect(report.checks.every((c) => c.passed)).toBe(true);
      expect(report.headlineKo).toContain("2026-11-28");
      expect(report.summaryParagraphKo).not.toContain("가능하게 합니다");
      expect(report.summaryParagraphKo).not.toContain("제공합니다");
    });

    it("WGSL 오류나 질량 오차 위반이 주입되면 한국어 QA 브리프가 FAIL을 보고한다", () => {
      const comparison = compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow");
      const backrun = simulateWatercolorEdgeDarkening();
      const glazingTriplet = compareMediumGlazingTriplet("ultramarine-blue");
      const brokenWgsl = validateSubtractivePigmentWgsl("broken wgsl {");
      const report = summarizePigmentMixAuditKo({
        comparison,
        backrun,
        glazingTriplet,
        ksRoundTripMaxError: 0.05,
        wgslValidation: brokenWgsl,
      });

      expect(report.grade).toBe("FAIL");
      expect(report.passed).toBe(false);
      expect(report.checks.filter((c) => !c.passed).length).toBeGreaterThanOrEqual(2);
    });

    it("스펙트럼 sRGB 변환 결과의 모든 채널이 [0, 1] 유한 범위 안에 있다", () => {
      for (const id of STUDIO_PIGMENT_IDS) {
        const srgb = spectralReflectanceToSrgb(getStudioPigmentPreset(id).reflectance);
        for (const ch of srgb) {
          expect(Number.isFinite(ch)).toBe(true);
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
