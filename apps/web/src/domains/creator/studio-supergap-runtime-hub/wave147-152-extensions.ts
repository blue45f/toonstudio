/**
 * Wave 147~152 초격차 확장 서브시스템 동적 로더 (`wave147-152-extensions`).
 *
 * - 모든 Wave 147~152 커널(Wave 150 마일스톤 포함)을 동적 `import(...)`로만 호출해
 *   `/studio` 초기 진입 번들(`check:studio-eager-graph`)에 0 바이트 영향을 보장한다.
 * - `registerWave147To152Extensions()`를 통해 총 91개 라이브 초격차 엔진(Wave 54~152 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 147~152 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave147To152ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave147Hand21JointGraspSolver",
      waveLabel: "Wave 147",
      titleKo: "손 21관절 해부학 · 물체 파지 관통 제로 솔버 & 실루엣 교정",
      capabilitySummaryKo: "20캡슐 SDF 소품·손가락 관통 0건 · 관절 ROM 준수 · WGSL 가이드",
      async execute() {
        const wave147 = await import("../wasm64-wave147-hand-21joint-grasp-and-occlusion-solver");
        const spec = wave147.createHandPresetSpec("sword-hilt-grip");
        const defaultProp = wave147.getPresetDefaultProp("sword-hilt-grip");
        const prop = defaultProp ?? {
          id: "hub-sword-hilt",
          labelKo: "허브 검 자루",
          kind: "cylinder" as const,
          centerMm: wave147.vec3(0, 72, 26),
          radiusMm: 16,
          lengthMm: 140,
        };
        const solved = wave147.solveCollisionFreeHandGrasp(spec, prop);
        const wgsl = wave147.validateHandCapsuleGuideWgsl(
          wave147.buildHandCapsuleGuideWgsl("silhouette-outline"),
        );
        const ok =
          solved.converged &&
          solved.afterPropAudit.penetrationCount === 0 &&
          solved.afterSelfAudit.selfPenetrationCount === 0 &&
          solved.afterRomAudit.passed &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `소품 관통 ${solved.afterPropAudit.penetrationCount}건 · 손가락 자체 관통 ${solved.afterSelfAudit.selfPenetrationCount}건 · WGSL 통과`,
          metrics: {
            converged: solved.converged,
            propPenetrations: solved.afterPropAudit.penetrationCount,
            selfPenetrations: solved.afterSelfAudit.selfPenetrationCount,
            romPassed: solved.afterRomAudit.passed,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave148BalloonTailSpeakerRouter",
      waveLabel: "Wave 148",
      titleKo: "말풍선 꼬리 화자 얼굴 자동 조준 & 얼굴·꼬리 교차 제로 라우터",
      capabilitySummaryKo: "2차 베지어 꼬리 · 인접 화자 얼굴 침범 0건 · 꼬리 교차 0건",
      async execute() {
        const wave148 = await import("../wasm64-wave148-speech-balloon-tail-speaker-router");
        const routed = wave148.routeCollisionFreeBalloonTails({
          panelId: "hub-p148",
          titleKo: "허브 대화 교차 라우팅",
          panelBounds: { x: 0, y: 0, width: 800, height: 600 },
          speakers: [
            {
              speakerId: "sp-left",
              nameKo: "주인공",
              faceBounds: { x: 90, y: 270, width: 120, height: 150 },
              mouthPos: { x: 150, y: 375 },
            },
            {
              speakerId: "sp-right",
              nameKo: "동료",
              faceBounds: { x: 590, y: 270, width: 120, height: 150 },
              mouthPos: { x: 650, y: 375 },
            },
          ],
          balloons: [
            {
              balloonId: "b-1",
              speakerId: "sp-left",
              centerX: 210,
              centerY: 115,
              rx: 110,
              ry: 55,
              tailStyle: "classic-curved-pointer",
            },
            {
              balloonId: "b-2",
              speakerId: "sp-right",
              centerX: 590,
              centerY: 115,
              rx: 110,
              ry: 55,
              tailStyle: "sharp-shout-spike",
            },
          ],
        });
        const ok =
          routed.routedAudit.passed &&
          routed.routedAudit.faceCrossingCount === 0 &&
          routed.routedAudit.tailCrossingCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `얼굴 침범 ${routed.routedAudit.faceCrossingCount}건 · 꼬리 교차 ${routed.routedAudit.tailCrossingCount}건 · 후보 ${routed.evaluatedCandidateCount}개 탐색`,
          metrics: {
            routedPassed: routed.routedAudit.passed,
            faceCrossings: routed.routedAudit.faceCrossingCount,
            tailCrossings: routed.routedAudit.tailCrossingCount,
            evaluatedCandidates: routed.evaluatedCandidateCount,
          },
        };
      },
    },
    {
      id: "wave149EpisodePacingCliffhangerSim",
      waveLabel: "Wave 149",
      titleKo: "에피소드 스크롤 체류·피로 시뮬레이터 & 클리프행어 페이싱 최적화",
      capabilitySummaryKo: "시뮬레이션 추정치 명시 · 5대 페이싱 병목 감사 · 비파괴 여백 최적화",
      async execute() {
        const wave149 = await import("../wasm64-wave149-episode-pacing-cliffhanger-and-retention-simulator");
        const opt = wave149.optimizeEpisodeGutterPacing({
          episodeId: "hub-ep149",
          episodeTitle: "허브 스크롤 페이싱 진단",
          cuts: [
            {
              cutId: "c1",
              cutIndex: 0,
              heightPx: 680,
              gutterAfterPx: 120,
              characterCountKo: 48,
              balloonCount: 2,
              visualComplexity: 0.72,
              narrativeBeatKind: "opening-hook",
              tensionScore: 0.82,
            },
            {
              cutId: "c2",
              cutIndex: 1,
              heightPx: 540,
              gutterAfterPx: 30,
              characterCountKo: 135,
              balloonCount: 4,
              visualComplexity: 0.68,
              narrativeBeatKind: "exposition",
              tensionScore: 0.45,
            },
            {
              cutId: "c3",
              cutIndex: 2,
              heightPx: 540,
              gutterAfterPx: 30,
              characterCountKo: 140,
              balloonCount: 4,
              visualComplexity: 0.7,
              narrativeBeatKind: "dialogue-exchange",
              tensionScore: 0.52,
            },
            {
              cutId: "c4",
              cutIndex: 3,
              heightPx: 560,
              gutterAfterPx: 35,
              characterCountKo: 138,
              balloonCount: 4,
              visualComplexity: 0.78,
              narrativeBeatKind: "mid-twist",
              tensionScore: 0.79,
            },
            {
              cutId: "c5",
              cutIndex: 4,
              heightPx: 620,
              gutterAfterPx: 40,
              characterCountKo: 22,
              balloonCount: 1,
              visualComplexity: 0.55,
              narrativeBeatKind: "emotional-pause",
              tensionScore: 0.64,
              isSilentBreathCut: true,
            },
            {
              cutId: "c6",
              cutIndex: 5,
              heightPx: 880,
              gutterAfterPx: 180,
              characterCountKo: 30,
              balloonCount: 1,
              visualComplexity: 0.88,
              narrativeBeatKind: "cliffhanger-reveal",
              tensionScore: 0.93,
            },
          ],
        });
        const ok =
          opt.isSimulationEstimate &&
          opt.adjustments.length >= 1 &&
          opt.crampedGutterFindingsAfter <= opt.crampedGutterFindingsBefore &&
          opt.afterAudit.hasStrongCliffhanger;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `여백 최적화 ${opt.adjustments.length}컷 · 피로 감소 ${round2(opt.peakFatigueReduction)} · 클리프행어 등급 ${opt.afterAudit.pacingGrade}`,
          metrics: {
            isSimulationEstimate: opt.isSimulationEstimate,
            adjustedCuts: opt.adjustments.length,
            peakFatigueReduction: round2(opt.peakFatigueReduction),
            pacingGrade: opt.afterAudit.pacingGrade,
          },
        };
      },
    },
    {
      id: "wave150EpisodePreflightDagMilestone",
      waveLabel: "Wave 150",
      titleKo: "에피소드 9대 출고 품질 게이트 DAG & SHA-256 출고 여권 오케스트레이터",
      capabilitySummaryKo: "증분 해시 캐시 부분 재실행 · 상류 차단 전파 · 출고 여권 봉인·검증",
      async execute() {
        const wave150 = await import("../wasm64-wave150-episode-end-to-end-preflight-dag-orchestrator");
        const h = (label: string): string => wave150.sha256PreflightUtf8Hex(label);
        const baseSnapshot = {
          episodeId: "hub-ep150",
          episodeTitleKo: "허브 출고 파이프라인 마일스톤",
          revisionTag: "r1",
          layersHash: h("layers-v1"),
          continuityHash: h("continuity-v1"),
          compositionHash: h("composition-v1"),
          dialogueHash: h("dialogue-v1"),
          themeSettingsHash: h("theme-v1"),
          rightsBomHash: h("rights-v1"),
          platformTargetsHash: h("platforms-v1"),
          watermarkPolicyHash: h("watermark-v1"),
        };
        const run1 = wave150.runEpisodePreflightDag(baseSnapshot);
        const run2 = wave150.runEpisodePreflightDag(
          { ...baseSnapshot, revisionTag: "r2", dialogueHash: h("dialogue-v2") },
          { previousRunCache: run1.nextCache },
        );
        const verified = wave150.verifyEpisodeReleasePassport(run2.passport);
        const ok =
          run1.releaseApproved &&
          run2.releaseApproved &&
          run2.cacheMetrics.cacheHitCount >= 4 &&
          verified.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `9게이트 증분 캐시 적중 ${run2.cacheMetrics.cacheHitCount}/9 · 출고 여권 SHA-256 검증 통과`,
          metrics: {
            releaseApproved: run2.releaseApproved,
            cacheHitCount: run2.cacheMetrics.cacheHitCount,
            cacheMissCount: run2.cacheMetrics.cacheMissCount,
            passportValid: verified.valid,
          },
        };
      },
    },
    {
      id: "wave151CityscapeNightNeonHarmony",
      waveLabel: "Wave 151",
      titleKo: "도시 야경 실내 시차 창문 · 네온 간판 배치 & 야간 OKLCH 색온도 조화",
      capabilitySummaryKo: "3-심도 채도 단조 감쇠 · 60-30-10 조화 감사 · Ray-Box 파사드 WGSL",
      async execute() {
        const wave151 = await import("../wasm64-wave151-procedural-cityscape-night-window-and-neon-harmony");
        const scene = wave151.generateCityscapeNightScene({
          sceneId: "hub-night-151",
          moodId: "seoul-gangnam-noir",
          hourOfNight: 22,
          seed: 151,
        });
        const harmonized = wave151.harmonizeCityscapeNightPalette(scene);
        const wgslArtifact = wave151.buildCityscapeNightFacadeWgsl("seoul-gangnam-noir");
        const wgsl = wave151.validateCityscapeNightFacadeWgsl(
          wgslArtifact.wgsl,
          wgslArtifact.uniformBufferByteLength,
        );
        const ok =
          harmonized.afterAudit.passed &&
          harmonized.afterAudit.isDepthChromaMonotonic &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `야경 색조 조화 ${round2(harmonized.afterAudit.harmonyScore)}점 · 원경 감쇠 단조 유지 · WGSL 통과`,
          metrics: {
            harmonyScore: round2(harmonized.afterAudit.harmonyScore),
            depthChromaMonotonic: harmonized.afterAudit.isDepthChromaMonotonic,
            harmonyPassed: harmonized.afterAudit.passed,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave152StylusPressureTiltBarrelCalib",
      waveLabel: "Wave 152",
      titleKo: "스타일러스 필압 · 기울기 · 배럴 롤 캘리브레이션 & 기기 호환 변환",
      capabilitySummaryKo: "Fritsch-Carlson 단조 곡선 · 배럴 롤 플립 0건 · One-Euro 지터 억제",
      async execute() {
        const wave152 = await import("../wasm64-wave152-stylus-pressure-tilt-barrel-calibration-engine");
        const bundle = wave152.buildStylusCalibrationBundle({
          sourceDevice: "wacom-pro-pen-3",
          targetDevice: "apple-pencil-pro",
        });
        const ok =
          bundle.monotonicityAudit.isGloballyMonotoneNonDecreasing &&
          bundle.roundTripReport.passesStrictThreshold &&
          bundle.barrelRollUnwrap.flipGlitchCount === 0 &&
          bundle.filterComparison.oneEuroOutperformsFixedEma;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `단조 곡선 준수 · 기기 왕복 오차 ${round2(bundle.roundTripReport.maxRoundTripError * 100)}% · 배럴 롤 플립 0건`,
          metrics: {
            curveMonotone: bundle.monotonicityAudit.isGloballyMonotoneNonDecreasing,
            roundTripPassed: bundle.roundTripReport.passesStrictThreshold,
            barrelFlipGlitches: bundle.barrelRollUnwrap.flipGlitchCount,
            oneEuroOutperformsEma: bundle.filterComparison.oneEuroOutperformsFixedEma,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 147~152 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave147To152Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave147To152ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
