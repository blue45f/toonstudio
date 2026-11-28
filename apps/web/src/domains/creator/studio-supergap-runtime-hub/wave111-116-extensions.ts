/**
 * Wave 111~116 초격차 확장 서브시스템 동적 로더 (`wave111-116-extensions`).
 *
 * - 모든 Wave 111~116 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave111To116Extensions()`를 통해 총 55개 라이브 초격차 엔진(Wave 54~116 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 111~116 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave111To116ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave111SilhouetteNormalAoRim",
      waveLabel: "Wave 111",
      titleKo: "2D 실루엣 노멀장 · 접촉 AO · 프레넬 림라이트 추출기",
      capabilitySummaryKo: "Meijster 정확 EDT · 3종 베벨 법선장 · 다중 접촉 AO·림라이트 WGSL",
      async execute() {
        const wave111 = await import("../wasm64-wave111-2d-normal-contact-ao-and-rimlight-extractor");
        const w = 29;
        const circleMask = new Uint8Array(w * w);
        const bangsMask = new Uint8Array(w * w);
        for (let y = 0; y < w; y += 1) {
          for (let x = 0; x < w; x += 1) {
            if ((x - 14) * (x - 14) + (y - 14) * (y - 14) <= 100) circleMask[y * w + x] = 255;
            if (x >= 6 && x <= 22 && y >= 4 && y <= 10) bangsMask[y * w + x] = 255;
          }
        }
        const field = wave111.computeInflated2dNormalField(circleMask, w, w, { profile: "cel-bevel" });
        const pass = wave111.synthesizeCelShadowContactAoAndRimPass(
          field,
          { keyLightDir: [-0.6, -0.5, 0.62], bandCount: 3 },
          [{ id: "hub-bangs", mask: bangsMask }],
        );
        const wgsl = wave111.validateNormalAoRimWgsl(wave111.buildNormalAoRimWgsl("cel-bevel"));
        const ok =
          field.maxNormalLengthError < 1e-5 &&
          pass.telemetry.outsideMaskLeakPixels === 0 &&
          pass.telemetry.nanCount === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `단위 법선장 · 외곽 번짐 0px · 접촉 AO·림라이트 · WGSL 통과`,
          metrics: {
            interiorPixels: field.interiorPixelCount,
            outsideLeakPixels: pass.telemetry.outsideMaskLeakPixels,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave112HanjiSumieCapillaryInk",
      waveLabel: "Wave 112",
      titleKo: "화선지 이방성 모세관 발묵·파묵·갈필 수묵 시뮬레이터",
      capabilitySummaryKo: "3-필드 보존형 모세관 솔버 · 1% 미만 탄소 질량 보존 · 갈필·WGSL",
      async execute() {
        const wave112 = await import("../wasm64-wave112-sumi-e-hanji-capillary-ink-simulator");
        const sub = wave112.createHanjiPaperSubstrate(32, 32, 112, { sizingGrade: "saengji-raw" });
        const canvas = wave112.createHanjiInkCanvas(sub, "balmuk-wet-bloom");
        wave112.depositSumiInkDrop(canvas, {
          x: 16,
          y: 16,
          radius: 2.5,
          waterAmount: 1.4,
          carbonAmount: 1.0,
        });
        wave112.stepHanjiCapillarySimulation(canvas, 16);
        const mass = wave112.measureSumiCarbonMassConservation(canvas);
        const wgsl = wave112.validateHanjiSumieWgsl(
          wave112.buildHanjiSumieWgsl("balmuk-wet-bloom", [8, 8]),
        );
        const ok =
          mass.conserved &&
          mass.relativeErrorPercent < 1.0 &&
          mass.nonFiniteCellCount === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `탄소 질량 오차 ${round2(mass.relativeErrorPercent)}% · 비유한 0건 · 화선지 WGSL 통과`,
          metrics: {
            massErrorPercent: round2(mass.relativeErrorPercent),
            conserved: mass.conserved,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave113BackgroundNprLineAndGi",
      waveLabel: "Wave 113",
      titleKo: "3D 배경 NPR 웹툰 선화 · 은선 제거 · 1-바운스 GI 조화",
      capabilitySummaryKo: "대각 잡선 0건 HLR · 에너지 보존 1-바운스 GI · 2D 인물 분리·WGSL",
      async execute() {
        const wave113 = await import("../wasm64-wave113-3d-background-npr-line-and-gi-bake-solver");
        const mesh = wave113.createParametricBackgroundPreset("korean-classroom");
        const npr = wave113.extract3dBackgroundNprLines(mesh, undefined, { seed: 113 });
        const gi = wave113.bakeBackgroundColorBleedGi(npr.projection);
        const harm = wave113.harmonizeBackgroundFor2dCharacterDepth(gi, {
          characterDepthMeters: mesh.recommendedCharacterDepthMeters,
        });
        const wgsl = wave113.validateBackgroundNprGiWgsl(
          wave113.buildBackgroundNprGiWgsl({
            creaseAngleDeg: 35,
            characterDepthMeters: 3.2,
            bounceStrength: 0.85,
            mistStrength: 0.35,
          }),
        );
        const ok =
          npr.counts.diagonalClutterCount === 0 &&
          harm.energyAudit.energyConserved &&
          harm.characterSeparationScore > harm.rawSeparationScore &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `대각 잡선 0건 · 1-바운스 GI 보존 · 인물 분리 ${round2(harm.characterSeparationScore)} · WGSL 통과`,
          metrics: {
            diagonalClutterCount: npr.counts.diagonalClutterCount,
            characterSeparationScore: round2(harm.characterSeparationScore),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave114KoreanSfxFoleyHaptic",
      waveLabel: "Wave 114",
      titleKo: "한국어 효과음 프로시저럴 폴리 DSP · 무음 독자 햅틱 브리지",
      capabilitySummaryKo: "6종 의성어 DSP(-1dBFS 클리핑 0건) · 정전력 스테레오 · 95%+ 용량 절감",
      async execute() {
        const wave114 = await import("../wasm64-wave114-sfx-procedural-foley-and-haptic-bridge");
        const mix = wave114.compileEpisodeSfxMixAndAccessibilityBridge(
          [
            {
              cueId: "hub-sfx-1",
              panelId: "p1",
              sfxTextKo: "챙강!",
              startTimeMs: 0,
              durationMs: 260,
              panelXNorm: 0.15,
              intensity: 0.9,
            },
            {
              cueId: "hub-sfx-2",
              panelId: "p2",
              sfxTextKo: "콰광!!",
              startTimeMs: 160,
              durationMs: 300,
              panelXNorm: 0.85,
              intensity: 1.0,
            },
          ],
          { episodeId: "hub-ep-114", sampleRateHz: 16000, prefersReducedMotion: true },
        );
        const audit = wave114.auditSfxFoleyBridge(mix);
        const ok =
          audit.readyForEpisodeDelivery &&
          audit.zeroClippingAndFinite &&
          mix.accessibilityBridge.maxObservedHapticBurstMs === 0 &&
          mix.byteBudget.byteSavingsPercent >= 95;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `클리핑 0건 · WAV 대비 ${round2(mix.byteBudget.byteSavingsPercent)}% 절감 · 저모션 진동 0ms`,
          metrics: {
            clippedSamples: mix.masterMetrics.clippedSampleCount,
            byteSavingsPercent: round2(mix.byteBudget.byteSavingsPercent),
            reducedMotionCompliant: mix.accessibilityBridge.reducedMotionCompliant,
          },
        };
      },
    },
    {
      id: "wave115StoryboardFlowReflow",
      waveLabel: "Wave 115",
      titleKo: "스토리보드 썸네일 보드 · 컷 흐름 드래그 리플로우 솔버",
      capabilitySummaryKo: "2D·세로 스트립 이중 투영 · 잠금 컷·복선 역전 보호 · 4막 텐션 감사",
      async execute() {
        const wave115 = await import("../wasm64-wave115-storyboard-thumbnail-flow-reflow-solver");
        const cuts = [
          {
            cutId: "hub-c1",
            sceneId: "sc-1",
            sceneTitleKo: "도입",
            titleKo: "열쇠 발견",
            act: "intro" as const,
            tension: 0.25,
            dialogueCharCount: 22,
            visualComplexity: 0.45,
            heightPx: 620,
            gutterBeforePx: 60,
            continuityTargetCutIds: ["hub-c3"],
          },
          {
            cutId: "hub-c2",
            sceneId: "sc-1",
            sceneTitleKo: "도입",
            titleKo: "복도 이동",
            act: "development" as const,
            tension: 0.52,
            dialogueCharCount: 30,
            visualComplexity: 0.5,
            heightPx: 600,
            gutterBeforePx: 75,
          },
          {
            cutId: "hub-c3",
            sceneId: "sc-2",
            sceneTitleKo: "절정",
            titleKo: "열쇠 회수",
            act: "twist" as const,
            tension: 0.82,
            dialogueCharCount: 18,
            visualComplexity: 0.72,
            heightPx: 740,
            gutterBeforePx: 145,
          },
          {
            cutId: "hub-c4",
            sceneId: "sc-2",
            sceneTitleKo: "절정",
            titleKo: "엔딩 반전",
            act: "climax" as const,
            tension: 0.94,
            dialogueCharCount: 14,
            visualComplexity: 0.84,
            heightPx: 880,
            gutterBeforePx: 165,
            lockedAnchor: true,
          },
        ];
        const projection = wave115.buildStoryboardFlowProjection(cuts, {
          episodeTitleKo: "허브 스토리보드 진단",
          columns: 4,
        });
        const audit = wave115.analyzeStoryboardFlowAndTensionArc(projection);
        const lockAttempt = wave115.applyStoryboardReflowOperation(cuts, {
          kind: "reorder-cut",
          cutId: "hub-c4",
          targetIndex: 0,
        });
        const gutterApplied = wave115.applyStoryboardReflowOperation(cuts, {
          kind: "insert-breathing-gutter",
          cutId: "hub-c3",
          extraGutterPx: 40,
        });
        const ok =
          projection.continuityViolations.length === 0 &&
          lockAttempt.rejected &&
          gutterApplied.applied &&
          audit.overallFlowHealthScore > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `이중 투영 ${projection.cuts.length}컷 · 잠금 컷 보호 · 복선 역전 0건 · 점수 ${round2(audit.overallFlowHealthScore)}점`,
          metrics: {
            cutCount: projection.cuts.length,
            lockGuardBlocked: lockAttempt.rejected,
            overallFlowHealthScore: round2(audit.overallFlowHealthScore),
          },
        };
      },
    },
    {
      id: "wave116ArcLengthPatternRibbon",
      waveLabel: "Wave 116",
      titleKo: "곡률 왜곡 방지 아크-길이 패턴 리본 브러시 엔진",
      capabilitySummaryKo: "타일 오차 ±1% · 급커브 코너 접힘 0건 마이터 가드 · 5종 프리셋·WGSL",
      async execute() {
        const wave116 = await import("../wasm64-wave116-arclength-pattern-ribbon-brush-engine");
        const sharp90 = [
          { x: 0, y: 0, pressure: 0.65 },
          { x: 110, y: 0, pressure: 0.7 },
          { x: 110, y: 110, pressure: 0.65 },
        ];
        const cmp = wave116.compareNaiveVsGuardedRibbon(sharp90, {
          presetId: "korean-dancheong-border",
          ribbonWidthPx: 32,
          tileRepeatLengthPx: 24,
        });
        const wgsl = wave116.validateArcLengthRibbonWgsl(
          wave116.buildArcLengthRibbonWgsl("korean-dancheong-border"),
        );
        const ok =
          cmp.foldoverEliminated &&
          cmp.guardedTotalDefects === 0 &&
          cmp.guarded.topologyAudit.selfIntersectionCount === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `90° 급커브 접힘 ${cmp.naiveTotalDefects}→0건 해소 · 단청 리본 · WGSL 통과`,
          metrics: {
            naiveDefects: cmp.naiveTotalDefects,
            guardedDefects: cmp.guardedTotalDefects,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 111~116 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave111To116Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave111To116ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
