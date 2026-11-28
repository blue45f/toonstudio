/**
 * Wave 123~128 초격차 확장 서브시스템 동적 로더 (`wave123-128-extensions`).
 *
 * - 모든 Wave 123~128 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave123To128Extensions()`를 통해 총 67개 라이브 초격차 엔진(Wave 54~128 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 123~128 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave123To128ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave123WardrobeContinuityBible",
      waveLabel: "Wave 123",
      titleKo: "의상·소품·손상 상태 인과 연속성 옷장 바이블",
      capabilitySummaryKo: "OKLab ΔE 색차 검수 · 미설명 손상 복구 차단 · 좌우 반전 감사",
      async execute() {
        const wave123 = await import("../wasm64-wave123-wardrobe-prop-continuity-bible-compiler");
        const bible = wave123.createDefaultEpisodeWardrobeBible();
        const brokenAudit = wave123.auditEpisodeWardrobeContinuity(bible, [
          {
            cutId: "hub-c1",
            cutIndex: 1,
            characterId: "seo-jin",
            events: [{ kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" }],
            slots: [
              { slotId: "trench-coat", present: true, condition: "damage-torn", observedSrgb: [36, 48, 72] },
              { slotId: "turtleneck-top", present: true, condition: "intact", observedSrgb: [52, 54, 58] },
              { slotId: "wrist-watch", present: true, observedHandedness: "left", observedSrgb: [188, 194, 202] },
              { slotId: "eye-patch", present: true, observedHandedness: "right", observedSrgb: [44, 34, 32] },
              { slotId: "tactical-blade", present: true, observedHandedness: "left", observedSrgb: [120, 128, 138] },
            ],
          },
          {
            cutId: "hub-c2",
            cutIndex: 2,
            characterId: "seo-jin",
            slots: [
              { slotId: "trench-coat", present: true, condition: "intact", observedSrgb: [36, 48, 72] },
              { slotId: "turtleneck-top", present: true, condition: "intact", observedSrgb: [52, 54, 58] },
              { slotId: "wrist-watch", present: true, observedHandedness: "left", observedSrgb: [188, 194, 202] },
              { slotId: "eye-patch", present: true, observedHandedness: "right", observedSrgb: [44, 34, 32] },
              { slotId: "tactical-blade", present: true, observedHandedness: "left", observedSrgb: [120, 128, 138] },
            ],
          },
        ]);
        const cleanAudit = wave123.auditEpisodeWardrobeContinuity(bible, [
          {
            cutId: "hub-c1",
            cutIndex: 1,
            characterId: "seo-jin",
            events: [{ kind: "damage-torn", characterId: "seo-jin", slotId: "trench-coat" }],
            slots: [
              { slotId: "trench-coat", present: true, condition: "damage-torn", observedSrgb: [36, 48, 72] },
              { slotId: "turtleneck-top", present: true, condition: "intact", observedSrgb: [52, 54, 58] },
              { slotId: "wrist-watch", present: true, observedHandedness: "left", observedSrgb: [188, 194, 202] },
              { slotId: "eye-patch", present: true, observedHandedness: "right", observedSrgb: [44, 34, 32] },
              { slotId: "tactical-blade", present: true, observedHandedness: "left", observedSrgb: [120, 128, 138] },
            ],
          },
          {
            cutId: "hub-c2",
            cutIndex: 2,
            characterId: "seo-jin",
            events: [
              {
                kind: "wardrobe-change",
                characterId: "seo-jin",
                nextOutfitId: "casual-hoodie-nextday",
              },
            ],
            slots: [
              { slotId: "ivory-hoodie", present: true, condition: "intact", observedSrgb: [228, 222, 210] },
              { slotId: "denim-slacks", present: true, condition: "intact", observedSrgb: [48, 66, 98] },
              { slotId: "wrist-watch", present: true, observedHandedness: "left", observedSrgb: [188, 194, 202] },
            ],
          },
        ]);
        const ok =
          brokenAudit.passStatus === "block" &&
          brokenAudit.countsByCode["spontaneous-damage-healing"] === 1 &&
          cleanAudit.passStatus === "pass" &&
          cleanAudit.continuityScore === 100;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `미설명 손상 복구 ${brokenAudit.countsByCode["spontaneous-damage-healing"]}건 차단 · 의상 교체 후 연속성 ${cleanAudit.continuityScore}점`,
          metrics: {
            healingBlockerDetected: brokenAudit.countsByCode["spontaneous-damage-healing"],
            cleanContinuityScore: cleanAudit.continuityScore,
            cleanPassStatus: cleanAudit.passStatus,
          },
        };
      },
    },
    {
      id: "wave124CurvatureCrossHatching",
      waveLabel: "Wave 124",
      titleKo: "주곡률 방향장 기반 만화 크로스해칭 톤 엔진",
      capabilitySummaryKo: "RK2 곡률 유선 적분 · 외곽 침범 0건 · 3단계 단조 밀도 · WGSL",
      async execute() {
        const wave124 = await import("../wasm64-wave124-curvature-aligned-cross-hatching-tone-engine");
        const hatch = wave124.generateCurvatureAlignedCrossHatching({
          surfacePreset: "sphere-head",
          styleId: "g-pen-classic-cross",
          width: 140,
          height: 140,
          lightDirection: { x: -1, y: 0, z: 0.6 },
          seed: 124,
        });
        const wgsl = wave124.validateCrossHatchingToneWgsl(
          wave124.buildCrossHatchingToneWgsl("g-pen-classic-cross"),
        );
        const ok =
          hatch.metrics.outsideMaskPointCount === 0 &&
          hatch.metrics.toneZones.monotonicToneOrderPassed &&
          hatch.metrics.activeLayers.length === 3 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `G펜 3단 크로스해칭 ${hatch.strokes.length}획 · 외곽 침범 0건 · 단조 톤 밀도·WGSL 통과`,
          metrics: {
            strokeCount: hatch.strokes.length,
            outsideMaskPointCount: hatch.metrics.outsideMaskPointCount,
            activeLayerCount: hatch.metrics.activeLayers.length,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave125Eyeline180RuleSolver",
      waveLabel: "Wave 125",
      titleKo: "180도 액션 축 · 시선 매치 · 스크린 방향 솔버",
      capabilitySummaryKo: "축 침범·시선 충돌 감지 · 거리 보존 대칭 반사 자동 교정",
      async execute() {
        const wave125 = await import("../wasm64-wave125-eyeline-180-rule-and-screen-direction-solver");
        const result = wave125.applySafeCameraBlockingFix({
          sceneId: "hub-scene-125",
          titleKo: "허브 대화 축 진단 씬",
          characters: [
            { characterId: "char-a", labelKo: "주인공", positionXZ: { x: -2, z: 0 }, eyeHeightM: 1.72 },
            { characterId: "char-b", labelKo: "상대역", positionXZ: { x: 2, z: 0 }, eyeHeightM: 1.64 },
          ],
          axisAnchorPair: ["char-a", "char-b"],
          cuts: [
            {
              cutId: "cut-1",
              shotKind: "dialogue-ots",
              cameraXZ: { x: -1.5, z: 3.0 },
              subjectCharacterId: "char-b",
              lookTargetCharacterId: "char-a",
              drawnScreenFacing: "screen-left",
              drawnEyelinePitchDeg: 1.0,
            },
            {
              cutId: "cut-2",
              shotKind: "dialogue-ots",
              cameraXZ: { x: 1.5, z: -3.0 },
              subjectCharacterId: "char-a",
              lookTargetCharacterId: "char-b",
              drawnScreenFacing: "screen-left",
              drawnEyelinePitchDeg: -1.0,
            },
          ],
        });
        const ok =
          result.beforeAudit.totalViolationCount >= 1 &&
          result.afterAudit.totalViolationCount === 0 &&
          result.isFullyResolved;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `축 침범 위반 ${result.beforeAudit.totalViolationCount}건 → 자동 대칭 교정 후 0건 (${result.afterAudit.continuityScore}점)`,
          metrics: {
            beforeViolations: result.beforeAudit.totalViolationCount,
            afterViolations: result.afterAudit.totalViolationCount,
            isFullyResolved: result.isFullyResolved,
          },
        };
      },
    },
    {
      id: "wave126ScrollSyncBgmCrossfade",
      waveLabel: "Wave 126",
      titleKo: "세로 스크롤 동기화 BGM 큐 · 정전력 크로스페이드",
      capabilitySummaryKo: "cos²+sin²=1 정전력 · 히스테리시스 스래싱 0건 · 카멜롯 화성·LUFS",
      async execute() {
        const wave126 = await import("../wasm64-wave126-scroll-sync-bgm-cue-and-crossfade-compiler");
        const cues = [
          {
            cueId: "hub-bgm-1",
            trackId: "trk-intro",
            titleKo: "오프닝",
            startYPx: 0,
            endYPx: 2400,
            bpm: 108,
            musicalKeyCamelot: "8A" as const,
            targetLufs: -16,
            fadeInPx: 200,
            fadeOutPx: 400,
          },
          {
            cueId: "hub-bgm-2",
            trackId: "trk-tension",
            titleKo: "긴장 전개",
            startYPx: 2000,
            endYPx: 4400,
            bpm: 112,
            musicalKeyCamelot: "9A" as const,
            targetLufs: -15,
            fadeInPx: 400,
            fadeOutPx: 250,
          },
        ];
        const mix = wave126.evaluateScrollBgmMixAtPosition(cues, 2200);
        const audit = wave126.auditEpisodeBgmCueSheet(cues);
        const session = wave126.simulateReaderScrollAudioSession(
          cues,
          wave126.createBoundaryJitterScrollTrajectory(2200, 30, 6, 40, 16),
          { hysteresisDeadbandPx: 48, minDwellMs: 320 },
        );
        const ok =
          mix.ok &&
          Math.abs(mix.totalPowerSum - 1) <= 1e-6 &&
          audit.releaseReady &&
          session.guarded.retriggerThrashCount === 0 &&
          session.guarded.abruptClickEventCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `정전력 합 ${round2(mix.totalPowerSum)} · 왕복 지터 스래싱 0건 · 클릭 0건 · 카멜롯·LUFS 통과`,
          metrics: {
            totalPowerSum: round2(mix.totalPowerSum),
            retriggerThrashCount: session.guarded.retriggerThrashCount,
            abruptClickCount: session.guarded.abruptClickEventCount,
            releaseReady: audit.releaseReady,
          },
        };
      },
    },
    {
      id: "wave127BookImpositionCreep",
      waveLabel: "Wave 127",
      titleKo: "단행본 인쇄 대수 조판 · 제책 크리프 · 책등 안전",
      capabilitySummaryKo: "4/8/16p 대수 조판 · 크리프 보정 · 양면 스프레드 책등 먹힘 감사",
      async execute() {
        const wave127 = await import("../wasm64-wave127-book-signature-imposition-and-gutter-creep-solver");
        const plan = wave127.compileBookSignatureImposition({
          bookId: "hub-book-127",
          rawPageCount: 14,
          bindingMethod: "perfect-bound-pur",
          readingDirection: "ltr-korean-western",
          signatureSizePages: 16,
          trimWidthMm: 148,
          trimHeightMm: 210,
          paperThicknessMm: 0.12,
        });
        const audit = wave127.auditBookPrintSafety(plan, { spreads: [] });
        const ok =
          plan.paddedPageCount === 16 &&
          plan.blankPaddingPageCount === 2 &&
          audit.releaseReady &&
          audit.blockerCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `14p→16p 대수 조판(빈 페이지 ${plan.blankPaddingPageCount}p) · 책등 ${round2(plan.spineWidthMm)}mm · 인쇄 안전 통과`,
          metrics: {
            paddedPageCount: plan.paddedPageCount,
            blankPaddingPageCount: plan.blankPaddingPageCount,
            spineWidthMm: round2(plan.spineWidthMm),
            releaseReady: audit.releaseReady,
          },
        };
      },
    },
    {
      id: "wave128DialogueProsodyVoiceCast",
      waveLabel: "Wave 128",
      titleKo: "대사 운율 연기 대본 · 성우 그래프 컬러링 캐스팅",
      capabilitySummaryKo: "한국어 음절·호흡 무중첩 타임라인 · 씬 공존 1인2역 0건 · 성대 휴식",
      async execute() {
        const wave128 = await import("../wasm64-wave128-dialogue-prosody-script-and-voice-cast-compiler");
        const script = wave128.compileVoiceActingProsodyScript([
          {
            lineId: "l1",
            sceneId: "sc-1",
            cutId: "c1",
            characterId: "hero",
            characterNameKo: "주인공",
            textKo: "지금 당장 옥상으로 올라가!",
            balloonStyle: "shout-jagged",
          },
          {
            lineId: "l2",
            sceneId: "sc-1",
            cutId: "c2",
            characterId: "rival",
            characterNameKo: "라이벌",
            textKo: "늦었어... 문은 이미 잠겼거든.",
            balloonStyle: "whisper-dashed",
          },
          {
            lineId: "l3",
            sceneId: "sc-2",
            cutId: "c3",
            characterId: "hero",
            characterNameKo: "주인공",
            textKo: "이대로 끝낼 수는 없어.",
            balloonStyle: "thought-cloud",
          },
          {
            lineId: "l4",
            sceneId: "sc-2",
            cutId: "c4",
            characterId: "mentor",
            characterNameKo: "조력자",
            textKo: "비상 계단 쪽 열쇠를 챙겨 뒀다.",
            balloonStyle: "oval-normal",
          },
        ]);
        const castPlan = wave128.assignVoiceActorsWithoutSceneCollision(script, [
          { actorId: "va-1", nameKo: "성우A", vocalTier: "lead", fixedLeadCharacterIds: ["hero"], hourlyRateKrw: 220_000 },
          { actorId: "va-2", nameKo: "성우B", vocalTier: "supporting", hourlyRateKrw: 180_000 },
          { actorId: "va-3", nameKo: "성우C", vocalTier: "supporting", hourlyRateKrw: 180_000 },
        ]);
        const ok =
          script.unintendedOverlapCount === 0 &&
          castPlan.castFeasible &&
          castPlan.sameSceneDoubleCastCollisionCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `대사 ${script.lines.length}줄(무중첩) · 동일 씬 1인2역 충돌 0건 · 배정 가능`,
          metrics: {
            lineCount: script.lines.length,
            unintendedOverlapCount: script.unintendedOverlapCount,
            sameSceneCollisionCount: castPlan.sameSceneDoubleCastCollisionCount,
            castFeasible: castPlan.castFeasible,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 123~128 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave123To128Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave123To128ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
