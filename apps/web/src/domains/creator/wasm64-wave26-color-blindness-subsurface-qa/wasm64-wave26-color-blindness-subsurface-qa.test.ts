import { describe, expect, it } from "vitest";

import {
  accumulateImpastoDab,
  accumulateImpastoStroke,
  auditCharacterContinuityLedger,
  auditPaletteCvdConfusions,
  composeImpastoRakingLight,
  createImpastoSurfaceCanvas,
  deriveImpastoMicroNormals,
  resolveExpectedScreenSide,
  sampleCrossStrokeHeightProfile,
  simulateCvdLinearRgbaBuffer,
  simulateCvdSrgb,
  solveOklchDaltonizedPalette,
  validateLedgerTimelineIntervals,
  type CharacterContinuitySheet,
  type CvdType,
  type EpisodeCutContinuityInput,
  type WebtoonPaletteEntry,
} from "./index";

describe("Wave 26 — 생리학적 LMS 색각 이상 시뮬레이터 및 OKLCH 달토나이제이션", () => {
  it("6500K D65 무채색 회색축 (v, v, v) 입력을 protan·deutan·tritan 전 영역에서 오차 1e-4 미만으로 보존한다", () => {
    const graySamples = [0, 12.5, 48, 128, 196.75, 255];
    const cvdTypes: readonly CvdType[] = ["protan", "deutan", "tritan"];
    const severities = [0, 0.25, 0.6, 1.0];

    for (const v of graySamples) {
      for (const cvdType of cvdTypes) {
        for (const severity of severities) {
          const simulated = simulateCvdSrgb({ r: v, g: v, b: v }, cvdType, severity);
          expect(Math.abs(simulated.r - v)).toBeLessThan(1e-4);
          expect(Math.abs(simulated.g - v)).toBeLessThan(1e-4);
          expect(Math.abs(simulated.b - v)).toBeLessThan(1e-4);
        }
      }
    }
  });

  it("Brettel 양날개 반평면 정사영이 생리학적 적색 감쇠(protan)와 황색-분홍 변위(tritan) 및 RGBA 버퍼 처리를 재현한다", () => {
    const vividRed = { r: 220, g: 38, b: 38 };
    const protanRed = simulateCvdSrgb(vividRed, "protan", 1.0);
    const deutanRed = simulateCvdSrgb(vividRed, "deutan", 1.0);

    // 장파장(L) 원추세포가 결손된 적색맹(protan)은 녹색맹(deutan)보다 순수 적색이 더 어둡게 지각된다.
    expect(protanRed.r).toBeLessThan(deutanRed.r);
    expect(protanRed.g).toBeLessThan(deutanRed.g);

    // 단파장(S) 결손 청색맹(tritan)에서 밝은 노란색은 청록-분홍 축으로 이동하며 B 채널이 크게 상승한다.
    const warmYellow = { r: 245, g: 215, b: 45 };
    const tritanYellow = simulateCvdSrgb(warmYellow, "tritan", 1.0);
    expect(tritanYellow.b).toBeGreaterThan(160);

    // 선형 Float32Array 버퍼 처리 시 무채색 픽셀 불변 및 알파 보존 검증
    const linearRgba = new Float32Array([0.5, 0.5, 0.5, 0.85, 0.8, 0.1, 0.1, 0.6]);
    const simBuf = simulateCvdLinearRgbaBuffer(linearRgba, "deutan", 1.0);
    expect(Math.abs((simBuf[0] ?? 0) - 0.5)).toBeLessThan(1e-6);
    expect(Math.abs((simBuf[1] ?? 0) - 0.5)).toBeLessThan(1e-6);
    expect(Math.abs((simBuf[2] ?? 0) - 0.5)).toBeLessThan(1e-6);
    expect(simBuf[3]).toBeCloseTo(0.85, 5);
    expect(simBuf[7]).toBeCloseTo(0.6, 5);
  });

  it("일반 시야에서는 뚜렷한 적·녹 진영 색상이 적·녹색각 이상에서 충돌함을 정확히 검출한다", () => {
    const factionPalette: readonly WebtoonPaletteEntry[] = [
      {
        id: "crimson-empire",
        labelKo: "홍련 제국군 진영색",
        role: "faction",
        srgb: { r: 196, g: 102, b: 48 },
      },
      {
        id: "verdant-guild",
        labelKo: "청림 길드 진영색",
        role: "faction",
        srgb: { r: 102, g: 148, b: 56 },
      },
      {
        id: "frost-tower",
        labelKo: "빙설 마탑 말풍선 테두리",
        role: "balloon",
        srgb: { r: 42, g: 118, b: 228 },
      },
    ];

    const audit = auditPaletteCvdConfusions(factionPalette, {
      minDistinguishableDeltaE: 0.1,
    });

    expect(audit.confusionPairs.length).toBeGreaterThanOrEqual(1);
    const topCollision = audit.confusionPairs[0];
    expect(topCollision).toBeDefined();
    expect(topCollision?.normalDeltaE).toBeGreaterThan(0.14);
    expect(topCollision?.worstCvdDeltaE).toBeLessThan(0.06);
    expect(["protan", "deutan"]).toContain(topCollision?.worstCvdType);
    expect(topCollision?.diagnosisKo).toContain("홍련 제국군 진영색");
  });

  it("OKLCH 달토나이제이션 솔버가 고정 배경색을 유지한 채 protan·deutan·tritan 전 시야의 식별성을 해결한다", () => {
    const collidingPalette: readonly WebtoonPaletteEntry[] = [
      {
        id: "paper-bg",
        labelKo: "원고 미색 배경",
        role: "background",
        srgb: { r: 248, g: 245, b: 238 },
        locked: true,
      },
      {
        id: "hero-crimson",
        labelKo: "적염 기사단 문장",
        role: "faction",
        srgb: { r: 198, g: 98, b: 52 },
      },
      {
        id: "forest-ranger",
        labelKo: "수풀 순찰대 문장",
        role: "faction",
        srgb: { r: 104, g: 146, b: 58 },
      },
      {
        id: "poison-alchemist",
        labelKo: "연금술사 독안개 말풍선",
        role: "balloon",
        srgb: { r: 92, g: 168, b: 158 },
      },
      {
        id: "azure-spirit",
        labelKo: "창공 정령 말풍선",
        role: "balloon",
        srgb: { r: 72, g: 154, b: 205 },
      },
    ];

    const solved = solveOklchDaltonizedPalette(collidingPalette, {
      minDistinguishableDeltaE: 0.095,
    });

    expect(solved.beforeAudit.confusionPairs.length).toBeGreaterThanOrEqual(2);
    expect(solved.afterAudit.confusionPairs).toHaveLength(0);
    expect(solved.allPairsDistinguishable).toBe(true);
    expect(solved.afterAudit.minCvdDeltaEByType.protan).toBeGreaterThanOrEqual(0.095);
    expect(solved.afterAudit.minCvdDeltaEByType.deutan).toBeGreaterThanOrEqual(0.095);
    expect(solved.afterAudit.minCvdDeltaEByType.tritan).toBeGreaterThanOrEqual(0.095);

    // 고정(locked)된 원고 배경색은 정확히 무변위로 보존되어야 한다.
    const bgEntry = solved.entries.find((e) => e.id === "paper-bg");
    expect(bgEntry?.normalVisionShiftDeltaE).toBe(0);
    // 일반 시야 색감 조화를 해치지 않도록 평균 색차 이동폭이 절제되어야 한다.
    expect(solved.meanNormalShiftDeltaE).toBeLessThan(0.14);
  });
});

describe("Wave 26 — 2D 표지 임파스토 물감 높이장 및 GGX 사광 미세 법선 합성기", () => {
  it("붓 가장자리 물감 밀림(edge bead)과 폭 방향 강모 결(bristle ridge) 단면 프로파일을 형성한다", () => {
    const beadCanvas = createImpastoSurfaceCanvas(96, 96);
    accumulateImpastoDab(beadCanvas, {
      centerX: 48,
      centerY: 48,
      radiusAlongPx: 28,
      radiusAcrossPx: 22,
      tangentAngleRad: 0,
      thickness: 0.65,
      bristleRidgeCount: 8,
      bristleGrooveDepth: 0.22,
      edgeBeadStrength: 0.55,
      pigmentRgba: { r: 0.78, g: 0.24, b: 0.18, a: 1 },
    });

    const flatCanvas = createImpastoSurfaceCanvas(96, 96);
    accumulateImpastoDab(flatCanvas, {
      centerX: 48,
      centerY: 48,
      radiusAlongPx: 28,
      radiusAcrossPx: 22,
      tangentAngleRad: 0,
      thickness: 0.65,
      bristleRidgeCount: 0,
      bristleGrooveDepth: 0,
      edgeBeadStrength: 0,
      pigmentRgba: { r: 0.78, g: 0.24, b: 0.18, a: 1 },
    });

    const beadProfile = sampleCrossStrokeHeightProfile(beadCanvas, 48, 48, 0, 22, 45);
    const flatProfile = sampleCrossStrokeHeightProfile(flatCanvas, 48, 48, 0, 22, 45);

    expect(beadProfile.edgeBeadToCenterRatio).toBeGreaterThan(1.12);
    expect(beadProfile.leftRimPeakHeight).toBeGreaterThan(beadProfile.centerHeight);
    expect(beadProfile.rightRimPeakHeight).toBeGreaterThan(beadProfile.centerHeight);
    expect(flatProfile.edgeBeadToCenterRatio).toBeLessThanOrEqual(1.001);
  });

  it("Sobel 및 중심차분 미세 법선장이 단위 벡터 정규화 조건과 사면 방향 부호를 정확히 만족한다", () => {
    const canvas = createImpastoSurfaceCanvas(48, 48);
    accumulateImpastoDab(canvas, {
      centerX: 24,
      centerY: 24,
      radiusAlongPx: 12,
      radiusAcrossPx: 12,
      tangentAngleRad: 0,
      thickness: 0.8,
      bristleRidgeCount: 0,
      bristleGrooveDepth: 0,
      edgeBeadStrength: 0.2,
      pigmentRgba: { r: 0.5, g: 0.5, b: 0.6, a: 1 },
    });

    const sobelNormals = deriveImpastoMicroNormals(canvas.heightField, 48, 48, {
      heightScale: 3.0,
      kernel: "sobel",
    });
    const centralNormals = deriveImpastoMicroNormals(canvas.heightField, 48, 48, {
      heightScale: 3.0,
      kernel: "central-difference",
    });

    for (let i = 0; i < 48 * 48; i++) {
      const b = i * 3;
      const lenSobel = Math.hypot(
        sobelNormals[b] ?? 0,
        sobelNormals[b + 1] ?? 0,
        sobelNormals[b + 2] ?? 0
      );
      const lenCentral = Math.hypot(
        centralNormals[b] ?? 0,
        centralNormals[b + 1] ?? 0,
        centralNormals[b + 2] ?? 0
      );
      expect(lenSobel).toBeCloseTo(1, 5);
      expect(lenCentral).toBeCloseTo(1, 5);
      expect(sobelNormals[b + 2] ?? 0).toBeGreaterThan(0);
    }

    // 중심(x=24) 좌측 사면(x=14)은 높이가 +x로 증가하므로 법선 Nx가 음수(-x 방향)를 가리켜야 한다.
    const leftSlopeBase = (24 * 48 + 14) * 3;
    const rightSlopeBase = (24 * 48 + 34) * 3;
    expect(sobelNormals[leftSlopeBase] ?? 0).toBeLessThan(-0.05);
    expect(sobelNormals[rightSlopeBase] ?? 0).toBeGreaterThan(0.05);
  });

  it("낮은 고도 사광(15°)이 수직 조명(85°) 대비 물감 결 입체 대비율과 지평선 자가 그림자를 크게 증폭한다", () => {
    const canvas = createImpastoSurfaceCanvas(84, 84);
    const stamped = accumulateImpastoStroke(canvas, {
      points: [
        { x: 16, y: 42, pressure: 0.85 },
        { x: 42, y: 38, pressure: 1.0 },
        { x: 68, y: 44, pressure: 0.9 },
      ],
      brushRadiusPx: 14,
      spacingRatio: 0.28,
      baseThickness: 0.72,
      bristleRidgeCount: 10,
      bristleGrooveDepth: 0.42,
      edgeBeadStrength: 0.48,
      pigmentRgba: { r: 0.82, g: 0.62, b: 0.22, a: 1 },
    });
    expect(stamped).toBeGreaterThan(6);

    // 붓 진행(약 0°)과 직교하는 +Y(90°) 방향에서 비추어 강모 이랑을 가로지르는 사광 형성
    const grazing15 = composeImpastoRakingLight(canvas, {
      lightAzimuthDeg: 90,
      lightElevationDeg: 15,
      heightScale: 3.2,
      roughness: 0.24,
      shadowSteps: 18,
    });

    const overhead85 = composeImpastoRakingLight(canvas, {
      lightAzimuthDeg: 90,
      lightElevationDeg: 85,
      heightScale: 3.2,
      roughness: 0.24,
      shadowSteps: 18,
    });

    expect(grazing15.reliefContrastRatio).toBeGreaterThan(overhead85.reliefContrastRatio * 2.5);
    expect(grazing15.shadowedPixelFraction).toBeGreaterThan(0.12);
    expect(overhead85.shadowedPixelFraction).toBe(0);
  });

  it("에너지 보존 유전체 GGX 반사가 저거칠기 바니시 표면에서 하이라이트 글린트를 만들고 RGBA 범위를 지킨다", () => {
    const canvas = createImpastoSurfaceCanvas(64, 64);
    accumulateImpastoStroke(canvas, {
      points: [
        { x: 14, y: 32, pressure: 1.0 },
        { x: 50, y: 32, pressure: 1.0 },
      ],
      brushRadiusPx: 12,
      baseThickness: 0.75,
      bristleRidgeCount: 9,
      bristleGrooveDepth: 0.38,
      edgeBeadStrength: 0.4,
      pigmentRgba: { r: 0.16, g: 0.3, b: 0.62, a: 1 },
    });

    const glossy = composeImpastoRakingLight(canvas, {
      lightAzimuthDeg: 90,
      lightElevationDeg: 35,
      heightScale: 3.0,
      roughness: 0.16,
      lightIntensity: 1.35,
    });

    const matte = composeImpastoRakingLight(canvas, {
      lightAzimuthDeg: 90,
      lightElevationDeg: 35,
      heightScale: 3.0,
      roughness: 0.88,
      lightIntensity: 1.35,
    });

    expect(glossy.specularGlintPixelCount).toBeGreaterThan(matte.specularGlintPixelCount);
    for (let i = 0; i < glossy.shadedRgba.length; i++) {
      const val = glossy.shadedRgba[i] ?? 0;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

describe("Wave 26 — 캐릭터 비대칭 좌우 반전 검출기 및 다회차 연속성 원장 감사기", () => {
  const protagonistSheet: CharacterContinuitySheet = {
    characterId: "kang-shiwoo",
    nameKo: "강시우",
    landmarks: {
      scarSide: {
        anatomicalSide: "character-left",
        labelKo: "왼쪽 눈썹 칼자국",
      },
      hairPartingSide: {
        anatomicalSide: "character-right",
        labelKo: "오른쪽 7:3 가르마",
      },
      moleSide: {
        anatomicalSide: "character-left",
        labelKo: "왼쪽 눈 밑 눈물점",
      },
      monocleEye: {
        anatomicalSide: "character-right",
        labelKo: "오른쪽 감정 모노클",
        fromEpisode: 10,
      },
      swordSheathHip: {
        anatomicalSide: "character-left",
        labelKo: "왼쪽 허리 검집",
      },
      dominantHand: {
        anatomicalSide: "character-right",
        labelKo: "오른손 검 파지",
      },
    },
    timelineStates: [
      {
        stateId: "sword-intact",
        category: "prop",
        itemKey: "frost-blade",
        stateTag: "intact",
        labelKo: "온전한 서리검",
        fromEpisode: 1,
        toEpisode: 14,
      },
      {
        stateId: "sword-broken",
        category: "prop",
        itemKey: "frost-blade",
        stateTag: "broken-blade",
        labelKo: "부러진 서리검",
        fromEpisode: 15,
        toEpisode: 22,
      },
      {
        stateId: "sword-reforged",
        category: "prop",
        itemKey: "frost-blade",
        stateTag: "reforged-blade",
        labelKo: "재련된 서리검",
        fromEpisode: 23,
        toEpisode: null,
      },
      {
        stateId: "shoulder-bandage-arc2",
        category: "injury-bandage",
        itemKey: "shoulder-bandage",
        stateTag: "bloodstained-wrap",
        labelKo: "어깨 압박 붕대",
        fromEpisode: 15,
        toEpisode: 19,
        requiredWhenPresent: true,
      },
    ],
  };

  it("정면(front) 대 후면(back) 시점 패리티를 수학적으로 구분해 정상 뒷모습을 오탐하지 않고 정면 좌우 반전 실수만 잡아낸다", () => {
    // 기하 패리티 직접 확인: 캐릭터 신체 좌측 -> 정면에서는 화면 우측, 뒷모습에서는 화면 좌측
    expect(resolveExpectedScreenSide("character-left", "front")).toBe("screen-right");
    expect(resolveExpectedScreenSide("character-left", "back")).toBe("screen-left");
    expect(resolveExpectedScreenSide("character-right", "three-quarter-front")).toBe("screen-left");
    expect(resolveExpectedScreenSide("character-right", "three-quarter-back")).toBe("screen-right");

    const cuts: readonly EpisodeCutContinuityInput[] = [
      {
        episodeNumber: 12,
        cutNumber: 1,
        cutId: "ep12-c01-valid-front",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedLandmarks: {
              scarSide: "screen-right",
              hairPartingSide: "screen-left",
              moleSide: "screen-right",
              swordSheathHip: "screen-right",
              dominantHand: "screen-left",
            },
          },
        ],
      },
      {
        episodeNumber: 12,
        cutNumber: 2,
        cutId: "ep12-c02-valid-back",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "back",
            // 뒷모습이므로 신체 좌측 검집이 화면 좌측, 오른손이 화면 우측에 오는 것이 완전히 정상!
            observedLandmarks: {
              swordSheathHip: "screen-left",
              dominantHand: "screen-right",
            },
          },
        ],
      },
      {
        episodeNumber: 12,
        cutNumber: 3,
        cutId: "ep12-c03-flipped-front",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            // 작화가가 정면 컷을 캔버스 좌우 반전한 채 저장한 전형적 사고
            observedLandmarks: {
              scarSide: "screen-left",
              hairPartingSide: "screen-right",
              swordSheathHip: "screen-left",
            },
          },
        ],
      },
    ];

    const report = auditCharacterContinuityLedger([protagonistSheet], cuts);
    expect(report.correctlyMatchedBackViewCount).toBe(1);
    expect(report.landmarkFlipFindings).toHaveLength(1);

    const flipFinding = report.landmarkFlipFindings[0];
    expect(flipFinding?.cutId).toBe("ep12-c03-flipped-front");
    expect(flipFinding?.violationKind).toBe("canvas-horizontal-flip");
    expect(flipFinding?.invertedLandmarks).toHaveLength(3);
    expect(flipFinding?.fixNoteKo).toContain("캔버스 좌우 반전");
  });

  it("컷 전체 좌우 반전과 단일 파츠 설정 착오 및 도입 회차 이전 조기 노출 표식을 정확히 구별한다", () => {
    const cuts: readonly EpisodeCutContinuityInput[] = [
      {
        episodeNumber: 12,
        cutNumber: 7,
        cutId: "ep12-c07-single-part-mistake",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "three-quarter-front",
            observedLandmarks: {
              scarSide: "screen-right",
              hairPartingSide: "screen-left",
              // 흉터와 가르마는 정상인데 모노클만 반대쪽 눈에 잘못 착용
              monocleEye: "screen-right",
            },
          },
        ],
      },
      {
        episodeNumber: 6,
        cutNumber: 4,
        cutId: "ep06-c04-premature-monocle",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedLandmarks: {
              // 10화 획득 예정인 모노클이 6화에 등장
              monocleEye: "screen-left",
            },
          },
        ],
      },
    ];

    const report = auditCharacterContinuityLedger([protagonistSheet], cuts);
    expect(report.landmarkFlipFindings).toHaveLength(2);
    expect(report.landmarkFlipFindings[0]?.violationKind).toBe("single-landmark-inversion");
    expect(report.landmarkFlipFindings[1]?.violationKind).toBe("out-of-era-landmark");
  });

  it("파손된 성검이 온전한 구버전 에셋으로 회귀하거나 재련 전 조기 노출되는 타임라인 오류를 검출하되 회상 컷은 정상 통과시킨다", () => {
    const cuts: readonly EpisodeCutContinuityInput[] = [
      {
        episodeNumber: 18,
        cutNumber: 5,
        cutId: "ep18-c05-intact-regression",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedStates: [
              // 15~22화는 '부러진 서리검' 구간인데 1~14화 '온전한 서리검'을 잘못 그림
              { category: "prop", itemKey: "frost-blade", stateTag: "intact" },
              {
                category: "injury-bandage",
                itemKey: "shoulder-bandage",
                stateTag: "bloodstained-wrap",
              },
            ],
          },
        ],
      },
      {
        episodeNumber: 18,
        cutNumber: 9,
        cutId: "ep18-c09-premature-reforged",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedStates: [
              // 23화 재련 예정인 검이 18화에 조기 등장
              { category: "prop", itemKey: "frost-blade", stateTag: "reforged-blade" },
              {
                category: "injury-bandage",
                itemKey: "shoulder-bandage",
                stateTag: "bloodstained-wrap",
              },
            ],
          },
        ],
      },
      {
        episodeNumber: 18,
        cutNumber: 12,
        cutId: "ep18-c12-flashback-to-ep10",
        // 10화 시점 과거 회상이므로 온전한 서리검이 맞고 어깨 붕대 의무도 없음
        flashbackTargetEpisode: 10,
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedStates: [
              { category: "prop", itemKey: "frost-blade", stateTag: "intact" },
            ],
          },
        ],
      },
    ];

    const report = auditCharacterContinuityLedger([protagonistSheet], cuts);
    expect(report.timelineAnachronismFindings).toHaveLength(2);

    const regression = report.timelineAnachronismFindings[0];
    expect(regression?.cutId).toBe("ep18-c05-intact-regression");
    expect(regression?.anachronismKind).toBe("past-state-regression");
    expect(regression?.expectedStateTag).toBe("broken-blade");
    expect(regression?.fixNoteKo).toContain("부러진 서리검");

    const premature = report.timelineAnachronismFindings[1];
    expect(premature?.cutId).toBe("ep18-c09-premature-reforged");
    expect(premature?.anachronismKind).toBe("future-state-spoiling");
  });

  it("필수 부상 붕대 누락과 원장 자체의 회차 구간 중복 모순을 함께 검증한다", () => {
    const missingBandageCuts: readonly EpisodeCutContinuityInput[] = [
      {
        episodeNumber: 16,
        cutNumber: 2,
        cutId: "ep16-c02-missing-bandage",
        characters: [
          {
            characterId: "kang-shiwoo",
            cameraPose: "front",
            observedStates: [
              { category: "prop", itemKey: "frost-blade", stateTag: "broken-blade" },
            ],
          },
        ],
      },
    ];

    const report = auditCharacterContinuityLedger([protagonistSheet], missingBandageCuts);
    expect(report.timelineAnachronismFindings).toHaveLength(1);
    expect(report.timelineAnachronismFindings[0]?.anachronismKind).toBe("missing-required-state");
    expect(report.timelineAnachronismFindings[0]?.expectedRuleLabelKo).toBe("어깨 압박 붕대");

    const overlappingSheet: CharacterContinuitySheet = {
      characterId: "overlap-test",
      nameKo: "중복검증캐릭터",
      landmarks: {},
      timelineStates: [
        {
          stateId: "c1",
          category: "costume",
          itemKey: "uniform",
          stateTag: "cadet",
          labelKo: "생도 제복",
          fromEpisode: 1,
          toEpisode: 15,
        },
        {
          stateId: "c2",
          category: "costume",
          itemKey: "uniform",
          stateTag: "captain",
          labelKo: "대장 제복",
          fromEpisode: 14,
          toEpisode: 30,
        },
      ],
    };

    const overlaps = validateLedgerTimelineIntervals([overlappingSheet]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.firstStateId).toBe("c1");
    expect(overlaps[0]?.secondStateId).toBe("c2");
  });
});
