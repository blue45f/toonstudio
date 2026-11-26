import { describe, expect, it } from "vitest";

import {
  buildCurvedSleeveSurfaceMesh,
  buildDomedPauldronSurfaceMesh,
  buildDrapedCapeSurfaceMesh,
  computeBoundedJamoDistance1,
  computeGeodesicGarmentWrap,
  computePerceptualWarmth,
  decomposeHangulText,
  DEFAULT_BM25F_FIELD_CONFIGS,
  harmonizeEpisodeColorScript,
  KoreanJamoBm25fManuscriptEngine,
  oklchToSrgb,
  sampleGarmentPatternOnWrap,
  srgbToOklab,
  srgbToOklch,
  stripKoreanParticle,
  type EpisodeCutInput,
  type GarmentSurfaceMesh,
  type ManuscriptCutDocument,
  type TriangleFace,
  type Vec3,
} from "./index";

function buildFlatGridMesh(size = 16, extent = 0.4): GarmentSurfaceMesh {
  const vertices: Vec3[] = [];
  const triangles: TriangleFace[] = [];
  for (let r = 0; r <= size; r++) {
    const y = ((r / size) - 0.5) * extent;
    for (let c = 0; c <= size; c++) {
      const x = ((c / size) - 0.5) * extent;
      vertices.push({ x, y, z: 0 });
    }
  }
  const stride = size + 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i0 = r * stride + c;
      triangles.push([i0, i0 + 1, i0 + stride + 1], [i0, i0 + stride + 1, i0 + stride]);
    }
  }
  return { id: "flat-reference-grid", labelKo: "평면 기준 격자", vertices, triangles };
}

describe("Wave 23 — 측지선 등각 의복 문양·체크무늬 래퍼", () => {
  it("평면 격자 위에서 구면파 삼각형 전개로 정확한 유클리드 반경과 무왜곡 좌표를 복원한다", () => {
    const flatMesh = buildFlatGridMesh(16, 0.4);
    const wrap = computeGeodesicGarmentWrap(flatMesh, {
      anchorPoint: { x: 0, y: 0, z: 0 },
      upHint: { x: 0, y: 1, z: 0 },
      patchRadius: 0.16,
    });

    expect(wrap.geodesicMetrics.evaluatedTriangleCount).toBeGreaterThan(40);
    expect(wrap.geodesicMetrics.pinchedTriangleCount).toBe(0);
    expect(wrap.geodesicMetrics.rmsIsometricError).toBeLessThan(0.015);
    expect(wrap.geodesicMetrics.meanAreaRatio).toBeCloseTo(1, 2);

    for (const coord of wrap.vertexCoords) {
      if (!coord.insidePatch) continue;
      const v = flatMesh.vertices[coord.vertexIndex]!;
      const trueR = Math.hypot(v.x - wrap.anchorPosition.x, v.y - wrap.anchorPosition.y);
      expect(Math.abs(coord.radiusMeters - trueR)).toBeLessThan(1e-3);
    }
  });

  it("굽은 소매 옆·뒷면을 감쌀 때 평면 투영의 UV 끼임을 0건으로 제거하고 왜곡을 크게 줄인다", () => {
    const sleeve = buildCurvedSleeveSurfaceMesh({
      radialSegments: 36,
      axialSegments: 24,
      baseRadius: 0.075,
      wristRadius: 0.058,
      length: 0.42,
      bendAngleRad: 0.72,
    });

    const wrap = computeGeodesicGarmentWrap(sleeve, {
      anchorPoint: { x: 0, y: 0.18, z: 0.12 },
      upHint: { x: 0, y: 1, z: 0 },
      patchRadius: 0.125,
    });

    expect(wrap.patchTriangleIndices.length).toBeGreaterThan(80);
    expect(wrap.planarBaselineMetrics.pinchedTriangleCount).toBeGreaterThan(10);
    expect(wrap.geodesicMetrics.pinchedTriangleCount).toBe(0);
    expect(wrap.geodesicMetrics.rmsIsometricError).toBeLessThan(
      wrap.planarBaselineMetrics.rmsIsometricError * 0.45,
    );
    expect(wrap.stretchErrorReductionRatio).toBeGreaterThan(0.55);
  });

  it("주름 망토와 돔 어깨 갑옷 곡면에서도 끼임 없이 타탄 체크와 문장 자수를 샘플링한다", () => {
    const cape = buildDrapedCapeSurfaceMesh({ pleatCount: 4, pleatDepth: 0.065 });
    const capeWrap = computeGeodesicGarmentWrap(cape, {
      anchorPoint: { x: 0.02, y: 0.04, z: 0 },
      patchRadius: 0.18,
    });
    expect(capeWrap.geodesicMetrics.pinchedTriangleCount).toBe(0);
    expect(capeWrap.geodesicMetrics.rmsIsometricError).toBeLessThan(
      capeWrap.planarBaselineMetrics.rmsIsometricError,
    );

    const plaidSamples = sampleGarmentPatternOnWrap(capeWrap, {
      kind: "tartan-plaid",
      pitchMeters: 0.045,
      accentLineRatio: 0.12,
    });
    expect(plaidSamples.length).toBeGreaterThan(40);
    expect(plaidSamples.some((s) => s.accentWeight === 1)).toBe(true);
    expect(plaidSamples.every((s) => s.primaryWeight >= 0 && s.primaryWeight <= 1)).toBe(true);

    const pauldron = buildDomedPauldronSurfaceMesh({ rings: 20, sectors: 32, radius: 0.14, maxPolarRad: 1.53 });
    const baseWrap = computeGeodesicGarmentWrap(pauldron, { anchorVertexIndex: 0, patchRadius: 0.212, rotationRad: 0 });
    const rotatedWrap = computeGeodesicGarmentWrap(pauldron, {
      anchorVertexIndex: 0,
      patchRadius: 0.212,
      rotationRad: Math.PI / 4,
    });

    expect(baseWrap.geodesicMetrics.pinchedTriangleCount).toBe(0);
    expect(baseWrap.planarBaselineMetrics.pinchedTriangleCount).toBeGreaterThan(0);
    expect(rotatedWrap.geodesicMetrics.rmsIsometricError).toBeCloseTo(
      baseWrap.geodesicMetrics.rmsIsometricError,
      6,
    );

    const crestSamples = sampleGarmentPatternOnWrap(rotatedWrap, {
      kind: "royal-crest",
      pitchMeters: 0.05,
      crestPetalCount: 6,
    });
    expect(crestSamples.length).toBeGreaterThan(50);
    expect(crestSamples.some((s) => s.embroideryRelief > 0.8)).toBe(true);
  });
});

describe("Wave 23 — 60~80컷 회차 OKLCH 컬러 스크립트 바코드 & 감정선 조화기", () => {
  it("sRGB <-> OKLCH 왕복 정밀도와 난색·한색 온기 지수 부호를 정확히 유지한다", () => {
    const warmSunset = { r: 238, g: 142, b: 68 };
    const coolMoonlight = { r: 64, g: 126, b: 214 };
    const neutralGray = { r: 132, g: 132, b: 132 };

    const warmRoundtrip = oklchToSrgb(srgbToOklch(warmSunset));
    expect(Math.abs(warmRoundtrip.r - warmSunset.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(warmRoundtrip.g - warmSunset.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(warmRoundtrip.b - warmSunset.b)).toBeLessThanOrEqual(1);

    expect(computePerceptualWarmth(srgbToOklab(warmSunset))).toBeGreaterThan(0.35);
    expect(computePerceptualWarmth(srgbToOklab(coolMoonlight))).toBeLessThan(-0.35);
    expect(Math.abs(computePerceptualWarmth(srgbToOklab(neutralGray)))).toBeLessThan(0.02);

    const outOfGamut = oklchToSrgb({ l: 0.72, c: 0.46, hDeg: 32 });
    expect(outOfGamut.r).toBeGreaterThanOrEqual(0);
    expect(outOfGamut.r).toBeLessThanOrEqual(255);
    expect(outOfGamut.g).toBeGreaterThanOrEqual(0);
    expect(outOfGamut.b).toBeGreaterThanOrEqual(0);
  });

  it("68컷 회차에서 회상·절정 연출 전환은 보존하고 동일 씬 비트의 단일 컷 화이트밸런스 이탈만 보정한다", () => {
    const cuts: EpisodeCutInput[] = [];
    for (let cutNum = 1; cutNum <= 68; cutNum++) {
      if (cutNum <= 20) {
        const isAccidentalCoolSpike = cutNum === 11;
        cuts.push({
          cutNumber: cutNum,
          cutId: `ep12-c${cutNum}`,
          sceneBeatId: "beat-courtyard-afternoon",
          narrativeTag: "normal",
          swatches: isAccidentalCoolSpike
            ? [
                { srgb: { r: 88, g: 162, b: 224 }, weight: 0.72 },
                { srgb: { r: 34, g: 58, b: 92 }, weight: 0.28 },
              ]
            : [
                { srgb: { r: 228, g: 182, b: 126 }, weight: 0.7 },
                { srgb: { r: 78, g: 52, b: 38 }, weight: 0.2 },
                { srgb: { r: 246, g: 214, b: 148 }, weight: 0.1 },
              ],
        });
      } else if (cutNum <= 32) {
        cuts.push({
          cutNumber: cutNum,
          cutId: `ep12-c${cutNum}`,
          sceneBeatId: "beat-sepia-flashback",
          narrativeTag: "flashback",
          swatches: [
            { srgb: { r: 168, g: 148, b: 122 }, weight: 0.78 },
            { srgb: { r: 96, g: 82, b: 66 }, weight: 0.22 },
          ],
        });
      } else if (cutNum <= 50) {
        const isAccidentalWarmSpike = cutNum === 42;
        cuts.push({
          cutNumber: cutNum,
          cutId: `ep12-c${cutNum}`,
          sceneBeatId: "beat-night-throne",
          narrativeTag: "normal",
          swatches: isAccidentalWarmSpike
            ? [
                { srgb: { r: 236, g: 174, b: 74 }, weight: 0.74 },
                { srgb: { r: 112, g: 72, b: 26 }, weight: 0.26 },
              ]
            : [
                { srgb: { r: 62, g: 94, b: 148 }, weight: 0.68 },
                { srgb: { r: 22, g: 32, b: 56 }, weight: 0.22 },
                { srgb: { r: 128, g: 176, b: 235 }, weight: 0.1 },
              ],
        });
      } else {
        cuts.push({
          cutNumber: cutNum,
          cutId: `ep12-c${cutNum}`,
          sceneBeatId: "beat-crimson-duel",
          narrativeTag: "climax",
          swatches: [
            { srgb: { r: 198, g: 38, b: 48 }, weight: 0.62 },
            { srgb: { r: 20, g: 12, b: 18 }, weight: 0.28 },
            { srgb: { r: 252, g: 186, b: 84 }, weight: 0.1 },
          ],
        });
      }
    }

    const result = harmonizeEpisodeColorScript(cuts);
    expect(result.harmonizedCells).toHaveLength(68);
    expect(result.emotionalArcPhases).toHaveLength(4);

    const outlierCutNums = result.detectedOutliers.map((o) => o.cutNumber);
    expect(outlierCutNums).toEqual([11, 42]);
    expect(result.detectedOutliers[0]!.directionKo).toContain("한색");
    expect(result.detectedOutliers[1]!.directionKo).toContain("난색");

    const orig11 = result.originalCells[10]!;
    const harm11 = result.harmonizedCells[10]!;
    const neighbor10 = result.harmonizedCells[9]!;
    expect(orig11.warmth).toBeLessThan(-0.2);
    expect(harm11.warmth).toBeGreaterThan(0.2);
    expect(Math.abs(harm11.warmth - neighbor10.warmth)).toBeLessThan(0.15);

    const harm42 = result.harmonizedCells[41]!;
    const neighbor41 = result.harmonizedCells[40]!;
    expect(Math.abs(harm42.warmth - neighbor41.warmth)).toBeLessThan(0.15);

    const transitionToCuts = result.preservedTransitions.map((t) => t.toCutNumber);
    expect(transitionToCuts).toContain(21);
    expect(transitionToCuts).toContain(33);
    expect(transitionToCuts).toContain(51);

    for (let idx = 20; idx < 32; idx++) {
      expect(result.harmonizedCells[idx]!.meanOklab).toEqual(result.originalCells[idx]!.meanOklab);
    }
    for (let idx = 50; idx < 68; idx++) {
      expect(result.harmonizedCells[idx]!.meanOklab).toEqual(result.originalCells[idx]!.meanOklab);
    }
  });
});

describe("Wave 23 — 한글 초성·자모 분해 + 퍼지 BM25F 다회차 원고 검색 엔진", () => {
  it("한글 음절을 초성·자모열로 분해하고 받침 음운 규칙에 맞춰 조사를 안전하게 분리한다", () => {
    const word = decomposeHangulText("황궁");
    expect(word.choseong).toBe("ㅎㄱ");
    expect(word.jamo).toBe("ㅎㅘㅇㄱㅜㅇ");
    expect(word.syllableCount).toBe(2);
    expect(word.isChoseongOnly).toBe(false);

    const choOnly = decomposeHangulText("ㅎㄱ");
    expect(choOnly.isChoseongOnly).toBe(true);
    expect(choOnly.choseong).toBe("ㅎㄱ");

    expect(stripKoreanParticle("황궁에서")).toBe("황궁");
    expect(stripKoreanParticle("황궁의")).toBe("황궁");
    expect(stripKoreanParticle("황궁으로")).toBe("황궁");
    expect(stripKoreanParticle("황궁으로부터")).toBe("황궁");
    expect(stripKoreanParticle("검을")).toBe("검");
    expect(stripKoreanParticle("교실로")).toBe("교실");
    expect(stripKoreanParticle("바다로")).toBe("바다");
    expect(stripKoreanParticle("노을")).toBe("노을");

    expect(computeBoundedJamoDistance1("ㅎㅘㅇㄱㅜㅇ", "ㅎㅘㄱㅜㅇ")).toBe(1);
    expect(computeBoundedJamoDistance1("ㅎㅘㅇㄱㅜㅇ", "ㅎㅘㅎㄱㅜㅇ")).toBe(1);
    expect(computeBoundedJamoDistance1("ㅎㅘㅇㄱㅜㅇ", "ㅁㅏㅌㅏㅂ")).toBe(2);
  });

  it("초성 검색(ㅎㄱ -> 황궁), 조사 비민감 매칭, 필드 가중치 BM25F, 1자모 오타 허용을 정확히 수행한다", () => {
    const sampleDocs: ManuscriptCutDocument[] = [
      {
        id: "ep1-c03",
        episodeNumber: 1,
        cutNumber: 3,
        character: "카엘",
        dialogue: "황궁에서 내려온 밀서를 지금 확인해야 한다!",
        note: "야간 성벽 클로즈업",
        sfx: "스릉",
      },
      {
        id: "ep1-c14",
        episodeNumber: 1,
        cutNumber: 14,
        character: "황궁수비대장",
        dialogue: "성문을 봉쇄하라!",
        note: "정문 전경",
        sfx: "쿵쾅",
      },
      {
        id: "ep2-c08",
        episodeNumber: 2,
        cutNumber: 8,
        character: "세라",
        dialogue: "북쪽 대황궁의 봉화가 피어올랐어.",
        note: "원경 팬",
        sfx: "화르륵",
      },
      {
        id: "ep2-c21",
        episodeNumber: 2,
        cutNumber: 21,
        character: "아린",
        dialogue: "오늘 밤엔 기필코 빠져나가자.",
        note: "배경 소품에 황궁 문장 깃발 배치",
        sfx: "펄럭",
      },
      {
        id: "ep3-c05",
        episodeNumber: 3,
        cutNumber: 5,
        character: "황궁",
        dialogue: "침입자를 색출하라.",
        note: "내전 경보 방송 레이어",
        sfx: "우우웅",
      },
    ];

    expect(DEFAULT_BM25F_FIELD_CONFIGS.character.weight).toBeGreaterThan(
      DEFAULT_BM25F_FIELD_CONFIGS.dialogue.weight,
    );
    expect(DEFAULT_BM25F_FIELD_CONFIGS.dialogue.weight).toBeGreaterThan(
      DEFAULT_BM25F_FIELD_CONFIGS.note.weight,
    );

    const engine = new KoreanJamoBm25fManuscriptEngine(sampleDocs);

    const stemRes = engine.search("황궁으로");
    expect(stemRes.hits.length).toBeGreaterThanOrEqual(3);
    expect(stemRes.hits[0]!.documentId).toBe("ep3-c05");
    expect(stemRes.hits.find((h) => h.documentId === "ep1-c03")!.score).toBeGreaterThan(
      stemRes.hits.find((h) => h.documentId === "ep2-c21")!.score,
    );

    const choseongRes = engine.search("ㅎㄱ");
    const choseongIds = choseongRes.hits.map((h) => h.documentId);
    expect(choseongIds).toContain("ep3-c05");
    expect(choseongIds).toContain("ep1-c03");
    expect(choseongIds).toContain("ep1-c14");
    expect(choseongIds).toContain("ep2-c08");

    const typoMissingBatchim = engine.search("화궁");
    expect(typoMissingBatchim.hits.some((h) => h.documentId === "ep1-c03")).toBe(true);
    expect(typoMissingBatchim.hits[0]!.matchKinds).toContain("jamo-typo-1");

    const typoSubConsonant = engine.search("홯궁");
    expect(typoSubConsonant.hits.some((h) => h.documentId === "ep3-c05")).toBe(true);

    const filteredEp2 = engine.search("ㅎㄱ", { episodeNumbers: [2] });
    expect(filteredEp2.hits.every((h) => h.episodeNumber === 2)).toBe(true);
  });

  it("300컷 다회차 원고 코퍼스에서 초성·어간·1자모 오타 질의를 평균 1ms 미만으로 응답한다", () => {
    const bulkDocs: ManuscriptCutDocument[] = [];
    const speakers = ["카엘", "세라", "마탑주", "단장", "연금술사", "그림자호위"];
    const places = ["성채에서", "지하미궁으로", "변경백령의", "종탑에", "훈련장에서", "도서관의"];
    const sfxPool = ["콰아앙", "챙그랑", "스르릉", "두근두근", "파직", "휘이잉"];

    for (let ep = 1; ep <= 5; ep++) {
      for (let cut = 1; cut <= 60; cut++) {
        const idx = (ep - 1) * 60 + cut;
        const isSpecialTarget = idx === 137 || idx === 244;
        bulkDocs.push({
          id: `ep${ep}-c${cut}`,
          episodeNumber: ep,
          cutNumber: cut,
          character: speakers[idx % speakers.length]!,
          dialogue: isSpecialTarget
            ? "황궁에서 보낸 흑요석 인장을 봉인해라!"
            : `${places[idx % places.length]!} 검기와 마력 회로를 정밀 점검한다.`,
          note: `레이어_${ep}_${cut} 역광 보정 및 말풍선 여백 점검`,
          sfx: sfxPool[idx % sfxPool.length]!,
        });
      }
    }

    const engine = new KoreanJamoBm25fManuscriptEngine(bulkDocs);
    expect(engine.getStats().documentCount).toBe(300);

    engine.search("황궁");
    engine.search("ㅎㄱ");
    engine.search("화궁");

    const queries = ["황궁의", "ㅎㄱ", "화궁", "흑요석 인장", "콰아앙"];
    const start = performance.now();
    const iterations = 20;
    for (let round = 0; round < iterations; round++) {
      for (const q of queries) {
        const res = engine.search(q, { limit: 10 });
        expect(res.hits.length).toBeGreaterThan(0);
      }
    }
    const meanMsPerQuery = (performance.now() - start) / (iterations * queries.length);
    expect(meanMsPerQuery).toBeLessThan(1.0);
  });
});
