import { describe, expect, it } from "vitest";

import {
  applyOpaqueWhiteoutStrokes,
  applyTetrahedralLutToRgbaBuffer,
  bakeStudioMoodLut3D,
  boundedLevenshteinAtMostOne,
  compareTetrahedralVsTrilinearLut,
  createBrilliantGemPolyhedron,
  createEquilateralPrismPolyhedron,
  evaluateCauchyRefractiveIndex,
  evaluateTetrahedralLutSample,
  evaluateTrilinearLutSample,
  generateAnalogManuscriptTemplate,
  harmonizeKoreanJosa,
  lintSeriesLoreConsistency,
  MANUSCRIPT_DIMENSION_PRESETS,
  parseCubeLut,
  PRISM_MATERIAL_PRESETS,
  renderInteriorMappedFacadeBuffer,
  sampleInteriorMappedFacadePoint,
  sampleKentPaperFiberReflectance,
  scrapeScreentoneWithKnife,
  serializeCubeLut,
  SPECTRAL_WAVELENGTHS_NM,
  STUDIO_MOOD_LUT_PRESETS,
  traceSpectralPrismRay,
  type Lut3DTable,
} from "./index";

describe("wasm64-wave19-atelier-perfection", () => {
  describe("1. 아날로그 만화 원고지·칼끝 톤 깎기·화이트 수정액 커널", () => {
    it("상업지 B4 및 동인지 A4 원고지의 내측 테두리·재단선·도련선·모서리 톰보 동심 계층을 정밀 생성한다", () => {
      const b4 = generateAnalogManuscriptTemplate({ presetId: "b4-commercial", dpi: 300 });
      const a4 = generateAnalogManuscriptTemplate({ presetId: "a4-doujin", dpi: 300 });

      expect(b4.labelKo).toBe(MANUSCRIPT_DIMENSION_PRESETS["b4-commercial"].labelKo);
      expect(b4.serverCostKrw).toBe(0);
      expect(b4.canvasWidthPx).toBeGreaterThan(a4.canvasWidthPx);
      expect(b4.canvasHeightPx).toBeGreaterThan(a4.canvasHeightPx);

      // 내측 안전선 ⊂ 재단선 ⊂ 도련선 ⊂ 용지 외곽 포함 관계 검증
      expect(b4.innerFrameRectPx.x).toBeGreaterThan(b4.trimRectPx.x);
      expect(b4.trimRectPx.x).toBeGreaterThan(b4.bleedRectPx.x);
      expect(b4.bleedRectPx.x).toBeGreaterThan(b4.paperRectPx.x);

      expect(b4.innerFrameRectPx.width).toBeLessThan(b4.trimRectPx.width);
      expect(b4.trimRectPx.width).toBeLessThan(b4.bleedRectPx.width);
      expect(b4.bleedRectPx.width).toBeLessThan(b4.paperRectPx.width);

      // 4개 모서리 × (재단 L마크 2선분 + 도련 L마크 2선분) = 16선분
      expect(b4.cornerTonboSegments).toHaveLength(16);
      expect(b4.centerTonboSegments.some((s) => s.role === "spine-tick")).toBe(true);
      expect(b4.rulerTickSegments.length).toBeGreaterThan(20);

      const g0 = sampleKentPaperFiberReflectance(12, 34, 99);
      const g1 = sampleKentPaperFiberReflectance(12, 34, 99);
      expect(g0).toBe(g1);
      expect(g0).toBeGreaterThanOrEqual(0.968);
      expect(g0).toBeLessThanOrEqual(1.0);
    });

    it("아트나이프 방향성 톤 깎기가 진행 끝단으로 갈수록 망점 밀도를 더 깊게 깎아 그라데이션을 만든다", () => {
      const width = 96;
      const height = 48;
      const uniformTone = new Float32Array(width * height).fill(0.75);

      const scraped = scrapeScreentoneWithKnife({
        width,
        height,
        baseToneCoverage: uniformTone,
        strokes: [
          {
            x0: 10,
            y0: 24,
            x1: 86,
            y1: 24,
            bladeWidthPx: 20,
            pressure: 0.9,
            striationPitchPx: 3.5,
            featherExponent: 1.3,
          },
        ],
      });

      expect(scraped.serverCostKrw).toBe(0);
      expect(scraped.scrapedPixelCount).toBeGreaterThan(400);
      expect(scraped.meanCoverageAfter).toBeLessThan(scraped.meanCoverageBefore);

      // 진입부(x=16)보다 칼끝 날림부(x=80)의 잔여 톤 밀도가 확연히 낮아야 한다.
      const entrySample = scraped.coverageBuffer[24 * width + 16]!;
      const tipSample = scraped.coverageBuffer[24 * width + 80]!;
      expect(tipSample).toBeLessThan(entrySample);

      // 스트로크 바깥 영역(y=2)은 원본 밀도(0.75)를 그대로 유지해야 한다.
      expect(scraped.coverageBuffer[2 * width + 48]).toBeCloseTo(0.75, 5);
    });

    it("불투명 화이트 수정액이 검은 먹선을 완벽히 차폐하고 가장자리 물감 두께감과 붓 튀김 입자를 합성한다", () => {
      const width = 80;
      const height = 60;
      const darkInk = new Float32Array(width * height).fill(0.04);

      const result = applyOpaqueWhiteoutStrokes({
        width,
        height,
        inkLuminanceBuffer: darkInk,
        strokes: [
          {
            x0: 14,
            y0: 30,
            x1: 46,
            y1: 30,
            brushRadiusPx: 6,
            opacity: 0.98,
            ridgeThickness: 0.85,
            splatterCount: 14,
            splatterSpreadPx: 20,
            seed: 4242,
          },
        ],
      });

      expect(result.serverCostKrw).toBe(0);
      expect(result.coveredInkPixelCount).toBeGreaterThan(250);
      expect(result.dropletCount).toBeGreaterThan(5);
      // 원본 버퍼 불변성 유지
      expect(darkInk[30 * width + 30]).toBeCloseTo(0.04, 5);
      // 획 중심은 불투명 화이트(>0.96)로 덮여야 한다.
      expect(result.compositedLuminance[30 * width + 30]!).toBeGreaterThan(0.96);

      // 중심(y=30)보다 물감 테두리(y=35, 반경 ~0.83R 부근)의 단면 높이(Meniscus Ridge)가 높게 형성된다.
      const centerHeight = result.pigmentRidgeHeightMap[30 * width + 30]!;
      const rimHeight = result.pigmentRidgeHeightMap[35 * width + 30]!;
      expect(rimHeight).toBeGreaterThan(centerHeight);
    });
  });

  describe("2. 코시 파장 분산 및 보석·마법 프리즘 굴절 커널", () => {
    it("코시 방정식에서 청색(450nm) 굴절률이 녹색(550nm)·적색(650nm)보다 단조 증가하며 무지개 색분산을 일으킨다", () => {
      for (const preset of Object.values(PRISM_MATERIAL_PRESETS)) {
        const nR = evaluateCauchyRefractiveIndex(
          SPECTRAL_WAVELENGTHS_NM.red,
          preset.cauchyA,
          preset.cauchyB,
        );
        const nG = evaluateCauchyRefractiveIndex(
          SPECTRAL_WAVELENGTHS_NM.green,
          preset.cauchyA,
          preset.cauchyB,
        );
        const nB = evaluateCauchyRefractiveIndex(
          SPECTRAL_WAVELENGTHS_NM.blue,
          preset.cauchyA,
          preset.cauchyB,
        );
        expect(nB).toBeGreaterThan(nG);
        expect(nG).toBeGreaterThan(nR);
      }

      const prism = createEquilateralPrismPolyhedron(60, 0.65, 1.5);
      const flintTrace = traceSpectralPrismRay({
        rayOrigin: { x: -1.5, y: -0.22, z: 0.4 },
        rayDirection: { x: 1.0, y: 0.38, z: -0.35 },
        crystal: prism,
        material: "flint-crystal",
        receiverPlaneZ: -2.0,
      });

      expect(flintTrace.serverCostKrw).toBe(0);
      expect(flintTrace.red.hitCrystal).toBe(true);
      expect(flintTrace.green.hitCrystal).toBe(true);
      expect(flintTrace.blue.hitCrystal).toBe(true);
      expect(flintTrace.red.internalBounceCount).toBe(0);
      expect(flintTrace.angularDispersionDeg).toBeGreaterThan(0.8);
      expect(flintTrace.receiverChromaticSpread).toBeGreaterThan(0.03);
      expect(flintTrace.blue.emergentDirection.y).toBeLessThan(flintTrace.red.emergentDirection.y);
      expect(flintTrace.causticConcentration).toBeGreaterThan(0.05);
    });

    it("브릴리언트 컷 다이아몬드 보석 내부에서 임계각 초과 시 전반사(TIR) 바운스를 추적한다", () => {
      const gem = createBrilliantGemPolyhedron(0.9, 1.0);
      const gemTrace = traceSpectralPrismRay({
        rayOrigin: { x: 0.28, y: 0.05, z: 1.4 },
        rayDirection: { x: 0.12, y: 0.0, z: -1.0 },
        crystal: gem,
        material: "diamond",
        receiverPlaneZ: 2.0,
        maxInternalBounces: 8,
      });

      expect(gemTrace.materialLabelKo).toBe("브릴리언트 다이아몬드");
      expect(gemTrace.blue.hitCrystal).toBe(true);
      expect(
        gemTrace.red.internalBounceCount +
          gemTrace.green.internalBounceCount +
          gemTrace.blue.internalBounceCount,
      ).toBeGreaterThanOrEqual(3);
      expect(gemTrace.angularDispersionDeg).toBeGreaterThan(0.2);
    });
  });

  describe("3. 2-삼각형 의사 3D 실내 매핑 빌딩 외벽 셰이더 커널", () => {
    it("실내 폴리곤 0개·외벽 삼각형 2개만으로 시선 각도에 따라 천장·바닥·좌우 측벽·뒷벽·창틀을 정확히 교차한다", () => {
      const cfg = {
        columns: 4,
        rows: 4,
        roomDepthRatio: 0.8,
        mullionThicknessU: 0.08,
        mullionThicknessV: 0.08,
        litWindowProbability: 1.0,
        buildingSeed: 7,
      };

      const mullionHit = sampleInteriorMappedFacadePoint(0.01, 0.5, { x: 0, y: 0, z: 1 }, cfg);
      expect(mullionHit.hitSurface).toBe("mullion-frame");

      // 호실 중앙(fu=0.5, fv=0.5) 창문을 통해 다섯 방향으로 들여다볼 때 각각 대응 벽면에 적중해야 한다.
      const centerU = 0.125;
      const centerV = 0.125;
      const noBlindCfg = { ...cfg, buildingSeed: 1 };
      expect(
        sampleInteriorMappedFacadePoint(centerU, centerV, { x: 0, y: 0, z: 1 }, noBlindCfg)
          .hitSurface,
      ).toBe("back-wall");
      expect(
        sampleInteriorMappedFacadePoint(centerU, centerV, { x: 0, y: 2.2, z: 0.5 }, noBlindCfg)
          .hitSurface,
      ).toBe("ceiling");
      expect(
        sampleInteriorMappedFacadePoint(centerU, centerV, { x: 0, y: -2.2, z: 0.5 }, noBlindCfg)
          .hitSurface,
      ).toBe("floor");
      expect(
        sampleInteriorMappedFacadePoint(centerU, centerV, { x: 2.2, y: 0, z: 0.5 }, noBlindCfg)
          .hitSurface,
      ).toBe("right-wall");
      expect(
        sampleInteriorMappedFacadePoint(centerU, centerV, { x: -2.2, y: 0, z: 0.5 }, noBlindCfg)
          .hitSurface,
      ).toBe("left-wall");
    });

    it("수백 개 호실 외벽을 2-삼각형 버퍼로 렌더링하고 야간 점등 확률을 결정론적으로 반영한다", () => {
      const nightRender = renderInteriorMappedFacadeBuffer({
        width: 64,
        height: 80,
        columns: 12,
        rows: 20,
        litWindowProbability: 0.45,
        cameraPosition: { x: 4.5, y: -3.0, z: 14.0 },
        buildingSeed: 202619,
      });

      expect(nightRender.facadeTriangleCount).toBe(2);
      expect(nightRender.interiorGeometryPolygonCount).toBe(0);
      expect(nightRender.totalRoomCount).toBe(240);
      expect(nightRender.litRoomCount).toBeGreaterThan(60);
      expect(nightRender.litRoomCount).toBeLessThan(180);
      expect(nightRender.rgba).toHaveLength(64 * 80 * 4);
      expect(nightRender.surfaceHitCounts["mullion-frame"]).toBeGreaterThan(0);
      expect(nightRender.surfaceHitCounts["back-wall"]).toBeGreaterThan(0);
      expect(
        nightRender.surfaceHitCounts.ceiling + nightRender.surfaceHitCounts.floor,
      ).toBeGreaterThan(0);

      const blackout = renderInteriorMappedFacadeBuffer({
        width: 16,
        height: 16,
        columns: 5,
        rows: 5,
        litWindowProbability: 0,
        cameraPosition: { x: 0, y: 0, z: 10 },
      });
      expect(blackout.litRoomCount).toBe(0);
    });
  });

  describe("4. 사면체 3D 색보정 LUT(17³ / .cube) 분위기 베이커 및 보간기", () => {
    it("비분리형 채도 왜곡 격자에서 표준 삼선형 보간의 무채색 색 번짐을 사면체 보간이 정확히 0으로 제거한다", () => {
      // 주대각선(r=g=b)은 순수 무채색(t,t,t)으로 고정하되 주변 유채색 꼭짓점에 비대칭 색조 이동을 준 3D LUT
      const size = 5;
      const data = new Float32Array(size * size * size * 3);
      for (let bi = 0; bi < size; bi += 1) {
        for (let gi = 0; gi < size; gi += 1) {
          for (let ri = 0; ri < size; ri += 1) {
            const r = ri / (size - 1);
            const g = gi / (size - 1);
            const b = bi / (size - 1);
            const off = ((bi * size + gi) * size + ri) * 3;
            if (ri === gi && gi === bi) {
              data[off] = r;
              data[off + 1] = g;
              data[off + 2] = b;
            } else {
              data[off] = Math.min(1, r * 1.25);
              data[off + 1] = g * 0.72;
              data[off + 2] = Math.min(1, b * 0.85 + 0.14);
            }
          }
        }
      }
      const stressLut: Lut3DTable = {
        title: "Neutral Spine Stress LUT",
        size,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data,
      };

      const diag = compareTetrahedralVsTrilinearLut(stressLut, 160);
      expect(diag.serverCostKrw).toBe(0);
      expect(diag.tetrahedralNeutralChromaLeak).toBeLessThan(1e-7);
      expect(diag.trilinearNeutralChromaLeak).toBeGreaterThan(0.05);

      // 6개 하위 사면체 영역 전체에서 항등(Identity) LUT가 정확히 입력 RGB를 복원하는지 확인
      const identityData = new Float32Array(2 * 2 * 2 * 3);
      for (let bi = 0; bi < 2; bi += 1) {
        for (let gi = 0; gi < 2; gi += 1) {
          for (let ri = 0; ri < 2; ri += 1) {
            const off = ((bi * 2 + gi) * 2 + ri) * 3;
            identityData[off] = ri;
            identityData[off + 1] = gi;
            identityData[off + 2] = bi;
          }
        }
      }
      const idLut: Lut3DTable = {
        title: "Identity",
        size: 2,
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        data: identityData,
      };

      const sixSimplexSamples: readonly (readonly [number, number, number])[] = [
        [0.82, 0.51, 0.19], // r >= g >= b
        [0.84, 0.18, 0.55], // r >= b > g
        [0.52, 0.17, 0.86], // b > r >= g
        [0.54, 0.85, 0.21], // g > r >= b
        [0.16, 0.83, 0.57], // g >= b > r
        [0.14, 0.49, 0.88], // b > g > r
      ];
      for (const [sr, sg, sb] of sixSimplexSamples) {
        const out = evaluateTetrahedralLutSample(idLut, sr, sg, sb);
        const tri = evaluateTrilinearLutSample(idLut, sr, sg, sb);
        expect(out[0]).toBeCloseTo(sr, 6);
        expect(out[1]).toBeCloseTo(sg, 6);
        expect(out[2]).toBeCloseTo(sb, 6);
        expect(tri[0]).toBeCloseTo(sr, 6);
      }
    });

    it("4종 연출 분위기(새벽 청명·황혼 회상·심야 추격·과거 세피아 필름) 17³ LUT 생성 및 .cube 왕복 직렬화를 검증한다", () => {
      expect(STUDIO_MOOD_LUT_PRESETS["dawn-clarity"].labelKo).toBe("새벽 청명");
      expect(STUDIO_MOOD_LUT_PRESETS["dusk-flashback"].labelKo).toBe("황혼 회상");
      expect(STUDIO_MOOD_LUT_PRESETS["midnight-pursuit"].labelKo).toBe("심야 추격");
      expect(STUDIO_MOOD_LUT_PRESETS["vintage-sepia-film"].labelKo).toBe("과거 세피아 필름");

      const dawnLut = bakeStudioMoodLut3D("dawn-clarity", 17);
      const duskLut = bakeStudioMoodLut3D("dusk-flashback", 17);
      const pursuitLut = bakeStudioMoodLut3D("midnight-pursuit", 17);
      const sepiaLut = bakeStudioMoodLut3D("vintage-sepia-film", 17);

      expect(dawnLut.data).toHaveLength(17 * 17 * 17 * 3);

      // 새벽 청명 암부는 청색 채널이 적색보다 우세하고, 과거 세피아 필름 중간톤은 R > G > B 순서를 띤다.
      const dawnShadow = evaluateTetrahedralLutSample(dawnLut, 0.18, 0.18, 0.18);
      expect(dawnShadow[2]).toBeGreaterThan(dawnShadow[0]);

      const duskMid = evaluateTetrahedralLutSample(duskLut, 0.5, 0.5, 0.5);
      expect(duskMid[0]).toBeGreaterThan(duskMid[2]);

      const pursuitShadow = evaluateTetrahedralLutSample(pursuitLut, 0.2, 0.2, 0.2);
      expect(pursuitShadow[2]).toBeGreaterThan(pursuitShadow[0]);

      const sepiaMid = evaluateTetrahedralLutSample(sepiaLut, 0.45, 0.45, 0.45);
      expect(sepiaMid[0]).toBeGreaterThan(sepiaMid[1]);
      expect(sepiaMid[1]).toBeGreaterThan(sepiaMid[2]);

      // .cube 포맷 직렬화 -> 파싱 무손실 왕복
      const cubeText = serializeCubeLut(sepiaLut);
      expect(cubeText).toContain("LUT_3D_SIZE 17");
      const parsed = parseCubeLut(`# 스튜디오 색보정 프리셋\n${cubeText}`);
      expect(parsed.size).toBe(17);
      expect(parsed.title).toContain("과거 세피아 필름");

      const sOrig = evaluateTetrahedralLutSample(sepiaLut, 0.33, 0.61, 0.78);
      const sParsed = evaluateTetrahedralLutSample(parsed, 0.33, 0.61, 0.78);
      expect(sParsed[0]).toBeCloseTo(sOrig[0], 5);
      expect(sParsed[1]).toBeCloseTo(sOrig[1], 5);
      expect(sParsed[2]).toBeCloseTo(sOrig[2], 5);

      // RGBA 버퍼 적용 시 알파 채널 보존 검증
      const srcRgba = new Uint8ClampedArray([120, 120, 120, 173]);
      const gradedRgba = applyTetrahedralLutToRgbaBuffer(srcRgba, sepiaLut, 1.0);
      expect(gradedRgba[3]).toBe(173);
      expect(gradedRgba[0]!).toBeGreaterThan(gradedRgba[2]!);
    });
  });

  describe("5. 연재 세계관 고유명사·시대착오·번역 표기 일관성 검사기", () => {
    it("한국어 받침 유무 및 ㄹ 받침에 맞춰 조사 호응을 교정하고 Levenshtein <= 1을 O(N)으로 판정한다", () => {
      expect(harmonizeKoreanJosa("남궁혁", "는")).toBe("은");
      expect(harmonizeKoreanJosa("독고소", "은")).toBe("는");
      expect(harmonizeKoreanJosa("청운검", "로")).toBe("으로");
      expect(harmonizeKoreanJosa("천마신교", "으로")).toBe("로");
      expect(harmonizeKoreanJosa("비설", "으로")).toBe("로"); // ㄹ 받침 -> '로'

      expect(boundedLevenshteinAtMostOne("천마신교", "천마신교")).toBe(0);
      expect(boundedLevenshteinAtMostOne("천마신교", "천마신고")).toBe(1);
      expect(boundedLevenshteinAtMostOne("독고연", "독고연아")).toBe(1);
      expect(boundedLevenshteinAtMostOne("천마신교", "화산검파")).toBe(2);
    });

    it("Aho-Corasick + 편집거리 스캐너로 다회차 오탈자·시대착오·로마자 흔들림을 잡고 정본 부분문자열 오탐을 방지한다", () => {
      const report = lintSeriesLoreConsistency(
        [
          {
            episodeId: "ep-01",
            episodeNumber: 1,
            text: "천마신교에서 내려온 독고연이 청운검을 뽑았다. 영문판 표기는 Cheonma Cult로 확정한다.",
          },
          {
            episodeId: "ep-02",
            episodeNumber: 2,
            text: "천마교에서 보낸 전갈을 스마트폰으로 확인한 남궁혀는 독고얀에게 Chunma Cult의 움직임을 알렸다.",
          },
        ],
        {
          worldEra: "murim-historical",
          entries: [
            {
              entryId: "clan-cheonma",
              category: "clan",
              canonicalKo: "천마신교",
              canonicalRomanization: "Cheonma Cult",
              knownMisspellings: ["천마교"],
              nonCanonicalTranslations: ["Chunma Cult"],
            },
            {
              entryId: "char-dokgo",
              category: "character",
              canonicalKo: "독고연",
              canonicalRomanization: "Dokgo Yeon",
            },
            {
              entryId: "char-namgung",
              category: "character",
              canonicalKo: "남궁혁",
              canonicalRomanization: "Namgung Hyeok",
            },
            {
              entryId: "art-sword",
              category: "artifact",
              canonicalKo: "청운검",
            },
          ],
        },
      );

      expect(report.serverCostKrw).toBe(0);
      expect(report.automatonStateCount).toBeGreaterThan(20);

      // 1화는 모두 정본 표기이므로 검출 건수가 0건이어야 한다 ('천마신교' 안의 '천마교' 오탐 없음).
      const ep1Findings = report.findings.filter((f) => f.episodeId === "ep-01");
      expect(ep1Findings).toHaveLength(0);

      // 2화 검출: 천마교(등록 오기), 스마트폰(시대착오), 남궁혀는(퍼지 오탈자+조사 호응), 독고얀에게(퍼지 오탈자), Chunma Cult(로마자 흔들림)
      const ep2Findings = report.findings.filter((f) => f.episodeId === "ep-02");
      expect(ep2Findings.map((f) => f.issueKind)).toEqual([
        "misspelled-proper-noun",
        "forbidden-anachronism",
        "fuzzy-typo-proper-noun",
        "fuzzy-typo-proper-noun",
        "inconsistent-romanization",
      ]);

      expect(report.crossEpisodeDriftTerms).toContain("천마신교");
      expect(report.crossEpisodeDriftTerms).toContain("Cheonma Cult");
      expect(report.crossEpisodeDriftTerms).toContain("독고연");

      // 자동 교정 원고에서 받침 조사까지 완벽히 복원되는지 확인 ('스마트폰으로' -> '전음부로', '남궁혀는' -> '남궁혁은')
      const fixedEp2 = report.autoFixedEpisodes.find((e) => e.episodeId === "ep-02")!;
      expect(fixedEp2.appliedFixCount).toBe(5);
      expect(fixedEp2.fixedText).toBe(
        "천마신교에서 보낸 전갈을 전음부로 확인한 남궁혁은 독고연에게 Cheonma Cult의 움직임을 알렸다.",
      );

      // 현대물 설정에서는 '스마트폰'이 시대착오 금칙어로 잡히지 않아야 한다.
      const modernReport = lintSeriesLoreConsistency(
        [{ episodeId: "mod-1", episodeNumber: 1, text: "스마트폰으로 연락했다." }],
        { worldEra: "modern-urban", entries: [] },
      );
      expect(modernReport.findings).toHaveLength(0);
    });
  });
});
