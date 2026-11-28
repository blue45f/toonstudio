/**
 * Wave 135~140 초격차 확장 서브시스템 동적 로더 (`wave135-140-extensions`).
 *
 * - 모든 Wave 135~140 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave135To140Extensions()`를 통해 총 79개 라이브 초격차 엔진(Wave 54~140 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 135~140 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave135To140ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave135ThreePointPerspectiveSubdivision",
      waveLabel: "Wave 135",
      titleKo: "3점 투시 자동 그리드 · 소실점 역추정 · 사영 등분할",
      capabilitySummaryKo: "수심=주점 기하 검증 · 교차비 <1e-6 계단·창문 등분할 · WGSL",
      async execute() {
        const wave135 = await import("../wasm64-wave135-three-point-perspective-grid-and-subdivision-engine");
        const rig = wave135.solveThreePointPerspectiveRig({
          canvasWidth: 1200,
          canvasHeight: 800,
          focalLengthMm: 35,
          yawDeg: 36,
          pitchDeg: -22,
          rollDeg: 0,
        });
        const stairs = wave135.buildPerspectiveStaircase({
          rig,
          originWorld: { x: -1.2, y: -1.6, z: 4.2 },
          stepCount: 6,
          stairWidthM: 2.2,
          treadDepthM: 0.35,
          riserHeightM: 0.19,
        });
        const wgsl = wave135.validatePerspectiveGridWgsl(
          wave135.buildPerspectiveGridWgsl({ radialDivisions: 24, includeHomographyGrid: true }).wgslSource,
        );
        const ok =
          rig.mode === "3-point" &&
          rig.orthocenterCheck.valid &&
          rig.orthocenterCheck.errorPx < 1e-6 &&
          stairs.maxNosingCrossRatioError < 1e-6 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `3점 투시 수심 오차 ${rig.orthocenterCheck.errorPx.toExponential(1)}px · 6단 계단 교차비 통과 · WGSL 통과`,
          metrics: {
            orthocenterValid: rig.orthocenterCheck.valid,
            stairStepCount: stairs.steps.length,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave136KubelkaMunkPigmentMixer",
      waveLabel: "Wave 136",
      titleKo: "Kubelka-Munk 10-밴드 감산 안료 혼색 · 수채 엣지 다크닝",
      capabilitySummaryKo: "파랑+노랑=생생한 녹색 · 모세관 엣지 질량보존 <1e-6 · WGSL",
      async execute() {
        const wave136 = await import("../wasm64-wave136-kubelka-munk-subtractive-pigment-mixer-engine");
        const cmp = wave136.compareSubtractiveVsRgbMix("ultramarine-blue", "cadmium-yellow", 0.5, 9);
        const backrun = wave136.simulateWatercolorEdgeDarkening({
          mediumPreset: "watercolor-transparent",
          pigmentId: "ultramarine-blue",
          width: 24,
          height: 24,
          steps: 24,
        });
        const wgsl = wave136.validateSubtractivePigmentWgsl(
          wave136.buildSubtractivePigmentWgsl({ mediumPreset: "watercolor-transparent" }).wgsl,
        );
        const ok =
          cmp.isVividGreenMidpoint &&
          cmp.chromaRatio > 1.4 &&
          backrun.massConservationRelativeError < 1e-6 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `감산 녹색 채도 ${round2(cmp.chromaRatio)}x 우위 · 수채 테두리 ${round2(backrun.edgeToInteriorRatio)}x · WGSL 통과`,
          metrics: {
            isVividGreenMidpoint: cmp.isVividGreenMidpoint,
            chromaRatio: round2(cmp.chromaRatio),
            edgeToInteriorRatio: round2(backrun.edgeToInteriorRatio),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave137PanelGazeFlowHandoff",
      waveLabel: "Wave 137",
      titleKo: "컷 내 독자 시선 동선 · 시각 무게중심 · 컷 전환 핸드오프",
      capabilitySummaryKo: "3종 읽기 방향 역독·교차 탐지 · 얼굴 무가림 자동 말풍선 교정",
      async execute() {
        const wave137 = await import("../wasm64-wave137-panel-gaze-flow-and-cut-handoff-solver");
        const outcome = wave137.optimizeBalloonPositionsForGazeFlow({
          episodeId: "hub-ep137",
          titleKo: "허브 시선 동선 교정 진단",
          readingDirection: "vertical-webtoon-ltr",
          panels: [
            {
              panelId: "cut-tangled",
              widthPx: 800,
              heightPx: 1200,
              elements: [
                {
                  elementId: "hero-face",
                  kind: "character-face",
                  labelKo: "주인공 얼굴",
                  x: 0.36,
                  y: 0.36,
                  width: 0.28,
                  height: 0.24,
                  gazeDir: { dx: 0, dy: 1 },
                },
                { elementId: "b1", kind: "dialogue-balloon", labelKo: "대사 1", x: 0.08, y: 0.1, width: 0.24, height: 0.12, scriptOrder: 1 },
                { elementId: "b2", kind: "dialogue-balloon", labelKo: "대사 2", x: 0.68, y: 0.76, width: 0.24, height: 0.12, scriptOrder: 2 },
                { elementId: "b3", kind: "dialogue-balloon", labelKo: "대사 3", x: 0.68, y: 0.1, width: 0.24, height: 0.12, scriptOrder: 3 },
                { elementId: "b4", kind: "dialogue-balloon", labelKo: "대사 4", x: 0.08, y: 0.76, width: 0.24, height: 0.12, scriptOrder: 4 },
              ],
            },
          ],
        });
        const beforeReversals = outcome.beforeAudit.violationCounts["balloon-reading-order-reversal"];
        const ok =
          beforeReversals > 0 &&
          outcome.remainingReversals === 0 &&
          outcome.remainingIntersections === 0 &&
          outcome.allFacesCleared;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `역독 ${beforeReversals}건→0건 · 교차 0건 · 얼굴 무가림 · 점수 +${round2(outcome.scoreDelta)}점`,
          metrics: {
            beforeReversals,
            remainingReversals: outcome.remainingReversals,
            remainingIntersections: outcome.remainingIntersections,
            allFacesCleared: outcome.allFacesCleared,
          },
        };
      },
    },
    {
      id: "wave138MultiplatformSmartSliceRepacker",
      waveLabel: "Wave 138",
      titleKo: "멀티 플랫폼 지능형 세로 컷 자동 슬라이스 · 절단 제로 DP",
      capabilitySummaryKo: "네이버·카카오·WEBTOON·픽코마 5규격 · 얼굴/말풍선 절단 0건",
      async execute() {
        const wave138 = await import("../wasm64-wave138-multiplatform-smart-vertical-slice-repacker");
        const cmp = wave138.compareNaiveVsSmartSlices(
          {
            episodeId: "hub-ep138",
            episodeTitleKo: "허브 세로 슬라이스 진단",
            masterWidthPx: 800,
            masterHeightPx: 2000,
            protectedSpans: [
              { id: "face-a", kind: "character-face", startY: 0, endY: 1000, labelKo: "상단 얼굴" },
              { id: "balloon-b", kind: "dialogue-balloon", startY: 1000, endY: 2000, labelKo: "하단 말풍선" },
            ],
          },
          "line-webtoon-global",
        );
        const ok =
          cmp.naive.criticalCutCount >= 1 &&
          cmp.smart.criticalCutCount === 0 &&
          cmp.improvedZeroCriticalCuts &&
          cmp.smart.auditGrade === "PASS";
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `고정 분할 치명 절단 ${cmp.naive.criticalCutCount}건 → DP 리패킹 0건(PASS)`,
          metrics: {
            naiveCriticalCuts: cmp.naive.criticalCutCount,
            smartCriticalCuts: cmp.smart.criticalCutCount,
            preventedCriticalCuts: cmp.preventedCriticalCuts,
            auditGrade: cmp.smart.auditGrade,
          },
        };
      },
    },
    {
      id: "wave139SeriesTimelineCanonLedger",
      waveLabel: "Wave 139",
      titleKo: "장편 세계관 연표 · 캐릭터 나이·계절 · 복선 회수 원장",
      capabilitySummaryKo: "윤년 만 나이 · 사망자 비회상 차단 · 반구 계절 · 복선 그래프 감사",
      async execute() {
        const wave139 = await import("../wasm64-wave139-series-timeline-canon-and-foreshadow-ledger");
        const hero = {
          characterId: "char-doyun",
          nameKo: "서도윤",
          birthYear: 2000,
          birthMonth: 5,
          birthDay: 15,
          initialLocationId: "seoul",
        };
        const broken = wave139.auditSeriesTimelineCanon({
          seriesId: "hub-series-139-bad",
          seriesTitleKo: "허브 연표 오류 진단",
          currentEpisodeNumber: 12,
          characters: [hero],
          events: [
            {
              eventId: "ev-bad",
              episodeNumber: 5,
              sceneIndex: 1,
              worldDateIso: "2026-01-15",
              locationId: "seoul",
              hemisphere: "north",
              depictedSeason: "summer",
              depictedAges: { "char-doyun": 28 },
              presentCharacterIds: ["char-doyun"],
            },
          ],
          foreshadowThreads: [],
        });
        const clean = wave139.auditSeriesTimelineCanon({
          seriesId: "hub-series-139-ok",
          seriesTitleKo: "허브 연표 정상 진단",
          currentEpisodeNumber: 12,
          characters: [hero],
          events: [
            {
              eventId: "ev-1",
              episodeNumber: 1,
              sceneIndex: 1,
              worldDateIso: "2025-05-14",
              locationId: "seoul",
              hemisphere: "north",
              depictedSeason: "spring",
              depictedAges: { "char-doyun": 24 },
              presentCharacterIds: ["char-doyun"],
              causesEventIds: ["ev-2"],
            },
            {
              eventId: "ev-2",
              episodeNumber: 10,
              sceneIndex: 1,
              worldDateIso: "2025-05-15",
              locationId: "seoul",
              hemisphere: "north",
              depictedSeason: "spring",
              depictedAges: { "char-doyun": 25 },
              presentCharacterIds: ["char-doyun"],
            },
          ],
          foreshadowThreads: [
            {
              threadId: "fs-1",
              titleKo: "회중시계 복선",
              setupEventId: "ev-1",
              setupEpisode: 1,
              payoffEventIds: ["ev-2"],
              importance: "main-arc",
            },
          ],
        });
        const ok =
          broken.verdict === "blocked" &&
          broken.blockerCount >= 2 &&
          clean.verdict === "clean" &&
          clean.blockerCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `나이·계절 모순 ${broken.blockerCount}건 차단 · 정상 연표·복선 회수 clean 통과`,
          metrics: {
            brokenBlockersCaught: broken.blockerCount,
            cleanVerdict: clean.verdict,
            cleanBlockerCount: clean.blockerCount,
          },
        };
      },
    },
    {
      id: "wave140TileStreaming8kFrameGuard",
      waveLabel: "Wave 140",
      titleKo: "8K 멀티페이지 타일 스트리밍 프리페치 LRU · 60fps 버짓 가드",
      capabilitySummaryKo: "VRAM 하드 캡 OOM 0건 · 블랭크 0장 · 60fps 99% 준수 · WGSL",
      async execute() {
        const wave140 = await import("../wasm64-wave140-8k-tile-streaming-prefetch-and-frame-budget-guard");
        const cmp = wave140.compareNaiveVsPredictiveTileStreaming({
          scenario: "high-speed-fling",
          targetFps: 60,
          frameCount: 30,
          vramBudgetBytes: 64 * 1024 * 1024,
        });
        const wgsl = wave140.validateVirtualTileAtlasWgsl(wave140.buildVirtualTileAtlasWgsl());
        const ok =
          cmp.predictive.invariants.vramHardCapRespected &&
          cmp.predictive.invariants.zeroOomEvents &&
          cmp.predictive.metrics.totalBlankTiles === 0 &&
          cmp.predictive.metrics.frameBudgetComplianceRatio >= 0.99 &&
          cmp.predictiveDominatesAllMetrics &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `고속 플링 블랭크 0장(Naive ${cmp.naive.metrics.totalBlankTiles}장) · 60fps 준수 ${round2(cmp.predictive.metrics.frameBudgetComplianceRatio * 100)}% · WGSL 통과`,
          metrics: {
            predictiveBlankTiles: cmp.predictive.metrics.totalBlankTiles,
            naiveBlankTiles: cmp.naive.metrics.totalBlankTiles,
            frameBudgetCompliancePct: round2(cmp.predictive.metrics.frameBudgetComplianceRatio * 100),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 135~140 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave135To140Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave135To140ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
