import { describe, expect, it } from "vitest";

import {
  applyGutterRecommendations,
  auditEpisodeScrollCognitiveLoad,
  buildDelaunayPuppetMesh,
  classifyAcousticKoreanSfx,
  countReadableDialogueChars,
  createInitialPuppetIdlerState,
  evaluateAsymmetricBlinkCurve,
  evaluatePhaseLaggedBreathing,
  extractAcousticEnvelopeFromPcm,
  inspectPuppetMeshTopology,
  synthesizeKoreanSfxContour,
  stepPuppetMicroIdler,
  type EpisodeCutSpec,
  type EpisodeScrollStripInput,
  type SfxPathCommand,
} from "./index";

function makeKoreanLine(targetVisibleChars: number): string {
  const basePhrase = "지금성벽너머로검은안개가밀려오고있어서모두당장태세를갖춰야해";
  let out = "";
  while (out.length < targetVisibleChars) {
    out += basePhrase;
  }
  const sliced = out.slice(0, targetVisibleChars);
  // 가독성을 위해 공백을 섞어도 가시 글자 수는 정확히 targetVisibleChars로 유지된다.
  return `${sliced.slice(0, 12)} ${sliced.slice(12, 24)} ${sliced.slice(24)}`;
}

describe("Wave 29 — 2D 들로네 캐릭터 무게중심 케이지 변형기 및 마이크로 아이들러", () => {
  it("수밀(watertight) 들로네 삼각 메쉬와 평균값 무게중심 좌표의 선형 정점 재현성을 보장한다", () => {
    const mesh = buildDelaunayPuppetMesh({
      widthPx: 256,
      heightPx: 384,
      boundarySegmentsPerEdge: 5,
    });

    expect(mesh.vertexCount).toBeGreaterThan(36);
    expect(mesh.triangleCount).toBeGreaterThan(50);
    expect(mesh.restTopology.watertight).toBe(true);
    expect(mesh.restTopology.minSignedArea).toBeGreaterThan(0);
    expect(mesh.restTopology.invertedTriangleCount).toBe(0);
    expect(mesh.restTopology.totalSignedArea).toBeCloseTo(256 * 384, 0);

    const cageCount = mesh.cageRestPoints.length;
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const u = mesh.uvs[i * 2] ?? -1;
      const v = mesh.uvs[i * 2 + 1] ?? -1;
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);

      let sumW = 0;
      let reproX = 0;
      let reproY = 0;
      for (let j = 0; j < cageCount; j += 1) {
        const w = mesh.cageWeights[i * cageCount + j] ?? 0;
        const cp = mesh.cageRestPoints[j];
        expect(w).toBeGreaterThan(0);
        sumW += w;
        reproX += w * (cp?.x ?? 0);
        reproY += w * (cp?.y ?? 0);
      }
      expect(sumW).toBeCloseTo(1, 5);
      expect(reproX).toBeCloseTo(mesh.restVertices[i * 2] ?? 0, 2);
      expect(reproY).toBeCloseTo(mesh.restVertices[i * 2 + 1] ?? 0, 2);
    }
  });

  it("120프레임 연속 호흡·고개 기울기·눈 깜빡임·3종 진자 흔들림 동안 뒤집힌 삼각형 0개를 유지한다", () => {
    const mesh = buildDelaunayPuppetMesh({ widthPx: 260, heightPx: 400 });
    let state = createInitialPuppetIdlerState(mesh);

    let peakFrontHairSwing = 0;
    let peakBackHairSwing = 0;
    let peakCapeSwing = 0;
    let observedBlinkClosure = 0;

    for (let frame = 0; frame < 120; frame += 1) {
      const tSec = (frame * 16.67) / 1000;
      const externalHeadTiltRad = Math.sin(tSec * Math.PI * 1.5) * 0.18;
      const windImpulsePxPerSec2 = Math.cos(tSec * Math.PI * 2.2) * 280;

      const stepResult = stepPuppetMicroIdler(mesh, state, {
        dtMs: 16.67,
        externalHeadTiltRad,
        windImpulsePxPerSec2,
        blinkOptions: { blinkIntervalMs: 1200 },
      });

      state = stepResult.state;
      expect(stepResult.minSignedArea).toBeGreaterThan(0);
      expect(stepResult.invertedTriangleCount).toBe(0);

      const liveTopo = inspectPuppetMeshTopology(stepResult.deformedVertices, mesh.indices);
      expect(liveTopo.watertight).toBe(true);
      expect(liveTopo.invertedTriangleCount).toBe(0);

      peakFrontHairSwing = Math.max(
        peakFrontHairSwing,
        Math.abs(state.chains["hair-front"].tipOffsetPx.x),
      );
      peakBackHairSwing = Math.max(
        peakBackHairSwing,
        Math.abs(state.chains["hair-back"].tipOffsetPx.x),
      );
      peakCapeSwing = Math.max(peakCapeSwing, Math.abs(state.chains.cape.tipOffsetPx.x));
      observedBlinkClosure = Math.max(observedBlinkClosure, stepResult.blink.leftClosure);
    }

    expect(peakFrontHairSwing).toBeGreaterThan(0.4);
    expect(peakBackHairSwing).toBeGreaterThan(0.4);
    expect(peakCapeSwing).toBeGreaterThan(0.4);
    expect(observedBlinkClosure).toBeGreaterThan(0.85);
  });

  it("55ms 빠른 감기와 110ms ease-out 뜨기 비대칭 깜빡임 및 횡격막-어깨 위상 지연을 정확히 계산한다", () => {
    const startSample = evaluateAsymmetricBlinkCurve(0, {
      blinkIntervalMs: 3000,
      closeDurationMs: 55,
      openDurationMs: 110,
      rightEyeLagMs: 0,
    });
    const peakCloseSample = evaluateAsymmetricBlinkCurve(55, {
      blinkIntervalMs: 3000,
      closeDurationMs: 55,
      openDurationMs: 110,
      rightEyeLagMs: 0,
    });
    const midOpenSample = evaluateAsymmetricBlinkCurve(55 + 55, {
      blinkIntervalMs: 3000,
      closeDurationMs: 55,
      openDurationMs: 110,
      rightEyeLagMs: 0,
    });
    const fullOpenSample = evaluateAsymmetricBlinkCurve(165, {
      blinkIntervalMs: 3000,
      closeDurationMs: 55,
      openDurationMs: 110,
      rightEyeLagMs: 0,
    });

    expect(startSample.leftClosure).toBeCloseTo(0, 5);
    expect(peakCloseSample.leftClosure).toBeCloseTo(1, 5);
    // ease-out 개방 중간점(u = 0.5)에서는 (1 - 0.5)^3 = 0.125로 절반 이상 이미 열린 상태다.
    expect(midOpenSample.leftClosure).toBeCloseTo(0.125, 4);
    expect(fullOpenSample.leftClosure).toBeCloseTo(0, 5);

    const quarterInhale = evaluatePhaseLaggedBreathing(1000, {
      breathPeriodMs: 4000,
      chestPhaseLagRad: 0.4,
      shoulderPhaseLagRad: 0.8,
    });
    expect(quarterInhale.diaphragmExpand).toBeGreaterThan(quarterInhale.chestLift);
    expect(quarterInhale.chestLift).toBeGreaterThan(quarterInhale.shoulderLift);
  });

  it("prefersReducedMotion 활성화 시 모든 호흡·깜빡임·진자 진동을 즉시 정지 자세로 동결한다", () => {
    const mesh = buildDelaunayPuppetMesh();
    let state = createInitialPuppetIdlerState(mesh);

    // 먼저 외력과 깜빡임이 진행 중인 활성 상태를 만든다.
    const activeFrame = stepPuppetMicroIdler(mesh, state, {
      dtMs: 55,
      externalHeadTiltRad: 0.2,
      windImpulsePxPerSec2: 600,
    });
    state = activeFrame.state;
    expect(activeFrame.blink.leftClosure).toBeGreaterThan(0.9);

    const frozenFrame = stepPuppetMicroIdler(mesh, state, {
      dtMs: 16.67,
      externalHeadTiltRad: 0.25,
      windImpulsePxPerSec2: 800,
      prefersReducedMotion: true,
    });

    expect(frozenFrame.blink.leftClosure).toBe(0);
    expect(frozenFrame.blink.rightClosure).toBe(0);
    expect(frozenFrame.breathing.diaphragmExpand).toBe(0);
    expect(frozenFrame.breathing.shoulderLift).toBe(0);
    expect(frozenFrame.appliedHeadTiltRad).toBe(0);
    expect(frozenFrame.state.chains["hair-front"].tipOffsetPx.x).toBe(0);
    expect(frozenFrame.state.chains["hair-back"].tipOffsetPx.x).toBe(0);
    expect(frozenFrame.state.chains.cape.tipOffsetPx.x).toBe(0);
    expect(frozenFrame.invertedTriangleCount).toBe(0);

    for (let i = 0; i < mesh.restVertices.length; i += 1) {
      expect(frozenFrame.deformedVertices[i]).toBeCloseTo(mesh.restVertices[i] ?? 0, 5);
    }
  });
});

describe("Wave 29 — 음향 기술자 기반 한국어 의성어(SFX) 벡터 컨투어 합성기", () => {
  it("저주파 폭발음과 고주파 금속 참격음을 각각 impact-burst와 blade-slash 닫힌 유한 벡터 경로로 결정론적 합성한다", () => {
    const explosiveInput = {
      rms: 0.88,
      spectralCentroidHz: 230,
      attackSlope: 18.5,
      zeroCrossingRate: 0.07,
      durationMs: 280,
    };
    const bladeInput = {
      rms: 0.74,
      spectralCentroidHz: 4900,
      attackSlope: 16.2,
      zeroCrossingRate: 0.17,
      durationMs: 190,
    };

    const impactA = synthesizeKoreanSfxContour(explosiveInput, { anchorX: 120, anchorY: 200 });
    const impactB = synthesizeKoreanSfxContour(explosiveInput, { anchorX: 120, anchorY: 200 });
    const slash = synthesizeKoreanSfxContour(bladeInput, { anchorX: 120, anchorY: 200 });

    expect(impactA.classification.style).toBe("impact-burst");
    expect(["쾅", "퍼엉"]).toContain(impactA.classification.lexemeKo);
    expect(impactA.svgPathData).toBe(impactB.svgPathData);
    expect(impactA.isClosedPath).toBe(true);
    expect(impactA.allCoordinatesFinite).toBe(true);

    expect(slash.classification.style).toBe("blade-slash");
    expect(["스릉", "챙"]).toContain(slash.classification.lexemeKo);
    expect(slash.isClosedPath).toBe(true);
    expect(slash.allCoordinatesFinite).toBe(true);
    expect(slash.svgPathData.startsWith("M ")).toBe(true);
    expect(slash.svgPathData.endsWith(" Z")).toBe(true);
  });

  it("고영교차 방전음(electric-jolt)과 초저역 심박음(heartbeat-pulse)을 분류하고 M/L/Q/C/Z 전 명령을 생성한다", () => {
    const electric = synthesizeKoreanSfxContour({
      rms: 0.64,
      spectralCentroidHz: 3900,
      attackSlope: 14,
      zeroCrossingRate: 0.49,
    });
    const heartbeat = synthesizeKoreanSfxContour({
      rms: 0.36,
      spectralCentroidHz: 112,
      attackSlope: 2.3,
      zeroCrossingRate: 0.04,
    });

    expect(electric.classification.style).toBe("electric-jolt");
    expect(["찌릿", "파직"]).toContain(electric.classification.lexemeKo);
    expect(electric.isClosedPath).toBe(true);
    expect(electric.allCoordinatesFinite).toBe(true);

    expect(heartbeat.classification.style).toBe("heartbeat-pulse");
    expect(["두근", "쿵"]).toContain(heartbeat.classification.lexemeKo);
    expect(heartbeat.isClosedPath).toBe(true);
    expect(heartbeat.allCoordinatesFinite).toBe(true);

    const collectOps = (cmds: readonly SfxPathCommand[]): Set<string> =>
      new Set(cmds.map((c) => c.op));
    const combinedOps = new Set<string>([
      ...collectOps(electric.commands),
      ...collectOps(heartbeat.commands),
    ]);
    expect(combinedOps.has("M")).toBe(true);
    expect(combinedOps.has("L")).toBe(true);
    expect(combinedOps.has("Q")).toBe(true);
    expect(combinedOps.has("C")).toBe(true);
    expect(combinedOps.has("Z")).toBe(true);
  });

  it("원근 전단·스트로크 테이퍼 프로파일·고대비 이중 외곽선 오프셋 메타데이터를 일관되게 구성한다", () => {
    const slash = synthesizeKoreanSfxContour(
      {
        rms: 0.78,
        spectralCentroidHz: 3400,
        attackSlope: 9.5,
        zeroCrossingRate: 0.16,
      },
      {
        anchorX: 50,
        anchorY: 80,
        baseRadiusPx: 80,
        perspectiveShearX: -0.4,
      },
    );

    expect(slash.classification.lexemeKo).toBe("스릉");
    expect(slash.perspectiveShear.shearX).toBeCloseTo(-0.4, 3);
    expect(slash.taperProfile.entryWidthRatio).toBeLessThan(0.1);
    expect(slash.taperProfile.exitWidthRatio).toBeLessThan(0.06);
    expect(slash.taperProfile.maxWidthPx).toBeGreaterThan(slash.taperProfile.minWidthPx * 10);
    expect(slash.doubleOutline.estimatedContrastRatio).toBeGreaterThanOrEqual(7);
    expect(slash.doubleOutline.outerHaloOffsetPx).toBeGreaterThan(
      slash.doubleOutline.innerOutlineOffsetPx,
    );
    expect(slash.doubleOutline.outerHaloSvgPath.endsWith(" Z")).toBe(true);
  });

  it("원시 PCM 파형에서 음향 포락선을 추출해 저역 타격음과 고역 참격음을 구분한다", () => {
    const sampleRateHz = 44100;
    const len = 4410;
    const bassBoomPcm = new Float32Array(len);
    const metalRingPcm = new Float32Array(len);

    for (let i = 0; i < len; i += 1) {
      const t = i / sampleRateHz;
      const env = Math.exp(-t * 18);
      bassBoomPcm[i] = Math.sin(2 * Math.PI * 180 * t) * env * 0.95;
      metalRingPcm[i] =
        (0.7 * Math.sin(2 * Math.PI * 3800 * t) + 0.3 * Math.sin(2 * Math.PI * 5200 * t)) *
        env *
        0.85;
    }

    const bassDesc = extractAcousticEnvelopeFromPcm(bassBoomPcm, sampleRateHz);
    const metalDesc = extractAcousticEnvelopeFromPcm(metalRingPcm, sampleRateHz);

    expect(classifyAcousticKoreanSfx(bassDesc).style).toBe("impact-burst");
    expect(classifyAcousticKoreanSfx(metalDesc).style).toBe("blade-slash");
  });
});

describe("Wave 29 — 모바일 뷰포트(390×844) 스크롤 인지 부하 및 호흡 여백 감사기", () => {
  it("72컷 에피소드 내 5화면 연속 대사 과밀 구간(wall-of-text-streak)을 검출하고 여백 삽입 후 연속 과밀을 0건으로 해소한다", () => {
    const cuts: EpisodeCutSpec[] = [];
    for (let i = 0; i < 72; i += 1) {
      // 컷 20~31(총 12컷): 높이 380px + 간격 36px = 416px 주기로 한 화면(844px)에 2컷씩 겹치며
      // 화면당 약 220자(> 160자)가 5연속 이상 뷰포트에 걸쳐 이어지도록 구성한다.
      if (i >= 20 && i <= 31) {
        cuts.push({
          cutId: `cut-${i}`,
          heightPx: 380,
          gutterAfterPx: 36,
          pacingBeat: "dialogue-heavy",
          focalPointCount: 3,
          visualComplexity: 0.65,
          balloons: [
            { balloonId: `b-${i}-1`, textKo: makeKoreanLine(56) },
            { balloonId: `b-${i}-2`, textKo: makeKoreanLine(56) },
          ],
        });
      } else if (i === 71) {
        cuts.push({
          cutId: `cut-${i}`,
          heightPx: 640,
          gutterAfterPx: 0,
          pacingBeat: "cliffhanger",
          focalPointCount: 2,
          visualComplexity: 0.72,
          balloons: [{ balloonId: `b-${i}-1`, textKo: makeKoreanLine(28) }],
        });
      } else {
        cuts.push({
          cutId: `cut-${i}`,
          heightPx: 520,
          gutterAfterPx: 220,
          pacingBeat: "normal",
          focalPointCount: 1,
          visualComplexity: 0.35,
          balloons: [{ balloonId: `b-${i}-1`, textKo: makeKoreanLine(34) }],
        });
      }
    }

    const episode: EpisodeScrollStripInput = {
      episodeId: "ep-72-dense-streak",
      cuts,
    };

    const report = auditEpisodeScrollCognitiveLoad(episode);

    expect(report.initialMetrics.cutCount).toBe(72);
    expect(report.initialMetrics.maxConsecutiveDenseScreens).toBeGreaterThanOrEqual(5);
    expect(report.initialMetrics.wallOfTextStreaks.length).toBeGreaterThanOrEqual(1);
    expect(report.initialMetrics.wallOfTextStreaks[0]?.kind).toBe("wall-of-text-streak");
    expect(report.initialMetrics.peakCognitiveLoad).toBeGreaterThan(report.comfortThreshold);

    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.projectedMetrics.wallOfTextStreaks).toHaveLength(0);
    expect(report.projectedMetrics.maxConsecutiveDenseScreens).toBe(0);
    expect(report.projectedMetrics.peakCognitiveLoad).toBeLessThanOrEqual(report.comfortThreshold);

    // 권고 여백을 실제 스트립에 적용해 재감사해도 연속 과밀 구간이 0건인지 독립 검증한다.
    const stabilizedStrip = applyGutterRecommendations(episode, report.recommendations);
    const reaudit = auditEpisodeScrollCognitiveLoad(stabilizedStrip);
    expect(reaudit.initialMetrics.wallOfTextStreaks).toHaveLength(0);
    expect(reaudit.initialMetrics.maxConsecutiveDenseScreens).toBe(0);
    expect(reaudit.initialMetrics.peakCognitiveLoad).toBeLessThanOrEqual(reaudit.comfortThreshold);
  });

  it("클리프행어 진입 전 암색(dark) 서스펜스 리드인 여백을 부여하고 일반 대사 구간에는 백색(white) 여백을 배정한다", () => {
    const episode: EpisodeScrollStripInput = {
      episodeId: "ep-cliffhanger-tone",
      cuts: [
        {
          cutId: "cut-0",
          heightPx: 380,
          gutterAfterPx: 30,
          pacingBeat: "dialogue-heavy",
          balloons: [{ balloonId: "b0", textKo: makeKoreanLine(110) }],
        },
        {
          cutId: "cut-1",
          heightPx: 380,
          gutterAfterPx: 40,
          pacingBeat: "dialogue-heavy",
          balloons: [{ balloonId: "b1", textKo: makeKoreanLine(110) }],
        },
        {
          cutId: "cut-2",
          heightPx: 720,
          gutterAfterPx: 0,
          pacingBeat: "cliffhanger",
          balloons: [{ balloonId: "b2", textKo: makeKoreanLine(24) }],
        },
      ],
    };

    const report = auditEpisodeScrollCognitiveLoad(episode, {
      minCliffhangerLeadInGutterPx: 400,
    });

    const dialogueRec = report.recommendations.find((r) => r.afterCutId === "cut-0");
    const cliffLeadRec = report.recommendations.find((r) => r.afterCutId === "cut-1");

    expect(dialogueRec?.gutterTone).toBe("white");
    expect(cliffLeadRec?.gutterTone).toBe("dark");
    expect(cliffLeadRec?.targetTotalGutterPx).toBeGreaterThanOrEqual(400);
    expect(report.projectedMetrics.cliffhangerPacingPreserved).toBe(true);
  });

  it("단일 장신 컷 내부 다중 말풍선 과부하도 이전 여백 위상 이동으로 뷰포트 경계를 분할해 완화한다", () => {
    const episode: EpisodeScrollStripInput = {
      episodeId: "ep-tall-cut-split",
      cuts: [
        {
          cutId: "intro-cut",
          heightPx: 420,
          gutterAfterPx: 424,
          pacingBeat: "establishing",
          balloons: [{ balloonId: "b-intro", textKo: makeKoreanLine(20) }],
        },
        {
          cutId: "monologue-tall",
          heightPx: 780,
          gutterAfterPx: 60,
          pacingBeat: "dialogue-heavy",
          focalPointCount: 3,
          visualComplexity: 0.7,
          balloons: [
            { balloonId: "m1", textKo: makeKoreanLine(95), offsetYPx: 40, heightPx: 140 },
            { balloonId: "m2", textKo: makeKoreanLine(95), offsetYPx: 520, heightPx: 140 },
          ],
        },
        {
          cutId: "outro-cut",
          heightPx: 500,
          gutterAfterPx: 0,
          pacingBeat: "normal",
          balloons: [{ balloonId: "b-out", textKo: makeKoreanLine(25) }],
        },
      ],
    };

    const report = auditEpisodeScrollCognitiveLoad(episode);
    expect(report.initialMetrics.peakCharsPerViewport).toBeGreaterThan(160);
    expect(report.projectedMetrics.peakCognitiveLoad).toBeLessThanOrEqual(report.comfortThreshold);
    expect(report.projectedMetrics.wallOfTextStreaks).toHaveLength(0);
  });

  it("여백과 호흡이 충분한 60컷 에피소드는 불필요한 추가 여백 삽입 없이 0px 변경으로 통과한다", () => {
    expect(countReadableDialogueChars("안녕 하세요\n\t웹툰 독자님")).toBe(10);

    const calmCuts: EpisodeCutSpec[] = Array.from({ length: 60 }, (_, idx) => ({
      cutId: `calm-${idx}`,
      heightPx: 500,
      gutterAfterPx: idx === 58 ? 420 : 380,
      pacingBeat: idx === 59 ? "cliffhanger" : "normal",
      focalPointCount: 1,
      visualComplexity: 0.3,
      balloons: [{ balloonId: `cb-${idx}`, textKo: makeKoreanLine(42) }],
    }));

    const report = auditEpisodeScrollCognitiveLoad({
      episodeId: "ep-60-calm",
      cuts: calmCuts,
    });

    expect(report.initialMetrics.wallOfTextStreaks).toHaveLength(0);
    expect(report.initialMetrics.peakCognitiveLoad).toBeLessThanOrEqual(report.comfortThreshold);
    expect(report.recommendations).toHaveLength(0);
    expect(report.totalRecommendedGutterAddPx).toBe(0);
  });
});
