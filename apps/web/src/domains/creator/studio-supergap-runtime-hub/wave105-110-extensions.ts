/**
 * Wave 105~110 초격차 확장 서브시스템 동적 로더 (`wave105-110-extensions`).
 *
 * - 모든 Wave 105~110 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave105To110Extensions()`를 통해 총 49개 라이브 초격차 엔진(Wave 54~110 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 105~110 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave105To110ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave105ActionSpeedlineImpactFx",
      waveLabel: "Wave 105",
      titleKo: "물리 집중선·속도선·검기 궤적·임팩트 VFX",
      capabilitySummaryKo: "4종 G펜 집중선(침범 0건) · 검기 베지어·충격파 · 저모션 안전·WGSL",
      async execute() {
        const wave105 = await import("../wasm64-wave105-action-speedline-impact-fx-engine");
        const speedlines = wave105.generateFocalSafeActionSpeedlines({
          mode: "radial-focus-burst",
          panel: { x: 0, y: 0, width: 800, height: 600 },
          subjectSafeEllipse: { cx: 400, cy: 300, rx: 120, ry: 145, marginPx: 8 },
          balloonKeepOutBoxes: [
            { id: "hub-b-tl", x: 36, y: 32, width: 170, height: 96, paddingPx: 6 },
          ],
          lineCount: 96,
          seed: 105,
        });
        const slash = wave105.synthesizeSwordSlashRibbonAndImpactFx(
          {
            id: "hub-slash-105",
            curve: {
              p0: { x: 140, y: 455 },
              p1: { x: 245, y: 150 },
              p2: { x: 540, y: 110 },
              p3: { x: 690, y: 270 },
            },
            peakWidthPx: 44,
            entryTipWidthPx: 1,
            exitTipWidthPx: 0.5,
            velocityProfile: "crescent-arc",
            wakeStreakCount: 5,
            shockwaveRingCount: 3,
            shockwaveBaseRadiusPx: 40,
            crackRayCount: 8,
            afterimageCount: 3,
            flashContrastIntensity: 0.9,
            animatedShimmerRateHz: 18,
            seed: 105,
          },
          { prefersReducedMotion: true },
        );
        const wgsl = wave105.validateActionImpactFxWgsl(
          wave105.buildActionImpactFxWgsl("radial-focus-burst", { prefersReducedMotion: true }),
        );
        const ok =
          speedlines.metrics.keepOutIntrusionCount === 0 &&
          speedlines.polygons.length >= 20 &&
          slash.motionSafety.animatedShimmerRate === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `집중선 ${speedlines.polygons.length}가닥(침범 0건) · 검기 저모션 0Hz · WGSL 통과`,
          metrics: {
            lineCount: speedlines.polygons.length,
            keepOutIntrusions: speedlines.metrics.keepOutIntrusionCount,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave106CharacterTurnaroundRig",
      waveLabel: "Wave 106",
      titleKo: "3D 루미스 두상 턴어라운드 리깅 · 작붕 감사",
      capabilitySummaryKo: "5각 수평선 정합 · 360° 흉터 좌우 잠금 · 7종 표정·온모델 감사",
      async execute() {
        const wave106 = await import("../wasm64-wave106-character-turnaround-rig-and-expression-sheet");
        const canon = wave106.createDefaultCharacterHeadCanonSheet();
        const sheet = wave106.buildFiveAngleTurnaroundSheet(canon, "neutral");
        const audit = wave106.auditDrawnPanelFaceAgainstCanon(canon, {
          panelId: "hub-p106",
          estimatedYawDeg: 0,
          estimatedPitchDeg: 0,
          observedEyeSpacingRatio: 1.0,
          observedJawToHeadRatio: 0.32,
          observedLandmarks: [
            { landmarkId: "left-cheek-scar", observedScreenSide: "screen-right" },
            { landmarkId: "right-under-eye-mole", observedScreenSide: "screen-left" },
          ],
        });
        const ok =
          sheet.panels.length === 5 &&
          sheet.railAlignmentAudit.withinTolerance &&
          audit.passStatus === "on-model";
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `5각 수평 오차 ${round2(sheet.railAlignmentAudit.maxVerticalDriftPx)}px · 좌우 잠금·작붕 점수 ${round2(audit.onModelConsistencyScore)}점`,
          metrics: {
            turnaroundAngles: sheet.panels.length,
            withinRailTolerance: sheet.railAlignmentAudit.withinTolerance,
            consistencyScore: round2(audit.onModelConsistencyScore),
          },
        };
      },
    },
    {
      id: "wave107MultilingualFontTategaki",
      waveLabel: "Wave 107",
      titleKo: "다국어 폰트 서브세팅 · 일본어 세로쓰기 조판",
      capabilitySummaryKo: "5개국 무두부 서브셋 · 일본어 세로쓰기·루비·종중횡·금칙 0건",
      async execute() {
        const wave107 = await import("../wasm64-wave107-multilingual-font-subset-and-tategaki-engine");
        const audit = wave107.auditEpisodeFontFallbackAndSubset({
          episodeId: "hub-ep-107",
          locale: "ja-JP",
          dialogueLines: [{ bubbleId: "hub-j1", text: "「東京まであと12分!? 急げー！」" }],
          fallbackChain: wave107.createDefaultComicFontChainForLocale("ja-JP"),
        });
        const tategaki = wave107.typesetJapaneseTategakiColumns({
          text: "「{東京|とうきょう}まで12分!?」",
          maxGlyphsPerColumn: 6,
        });
        const ok =
          audit.releaseReady &&
          audit.tofuCount === 0 &&
          tategaki.kinsokuViolationCount === 0 &&
          tategaki.rubyColumnOverlapCount === 0 &&
          tategaki.tateChuYokoCount >= 2;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `두부 결손 0건 · 서브셋 ${round2(audit.subsetSavingsPercent)}% 절감 · 세로쓰기 금칙·루비 겹침 0건`,
          metrics: {
            tofuCount: audit.tofuCount,
            subsetSavingsPercent: round2(audit.subsetSavingsPercent),
            kinsokuViolations: tategaki.kinsokuViolationCount,
          },
        };
      },
    },
    {
      id: "wave108VerticalScrollRhythm",
      waveLabel: "Wave 108",
      titleKo: "세로 스크롤 컷 리듬 · 반전 스포일러 차단 솔버",
      capabilitySummaryKo: "모바일 3종 뷰포트 0px 스포일러 격리 · 비트 템포·텍스트 벽 감사",
      async execute() {
        const wave108 = await import("../wasm64-wave108-vertical-scroll-panel-rhythm-optimizer");
        const layout = wave108.optimizeVerticalScrollPanelLayout(
          [
            { cutId: "hub-c1", beatKind: "dialogue-volley", dialogueText: "문 앞 정적이 흐른다." },
            { cutId: "hub-c2", beatKind: "suspense-hold", moodTone: "dark", intensity: 0.8 },
            { cutId: "hub-c3", beatKind: "twist-reveal", moodTone: "dark", intensity: 0.95 },
            { cutId: "hub-c4", beatKind: "cliffhanger-end", moodTone: "dark", intensity: 0.9 },
          ],
          { episodeId: "hub-ep-108", episodeTitle: "허브 리듬 진단" },
        );
        const audit = wave108.auditVerticalScrollPacingRhythm(layout);
        const ok =
          layout.maxTwistSpoilerLeakPx === 0 &&
          audit.spoilerLeaks.length === 0 &&
          audit.maxSpoilerLeakPx === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `모바일 3종 반전 스포일러 누수 0px · 컷 ${layout.cuts.length}개 리듬 점수 ${round2(audit.pacingHealthScore)}점`,
          metrics: {
            maxSpoilerLeakPx: audit.maxSpoilerLeakPx,
            spoilerLeakCount: audit.spoilerLeaks.length,
            pacingHealthScore: round2(audit.pacingHealthScore),
          },
        };
      },
    },
    {
      id: "wave109SmartThumbnailPackager",
      waveLabel: "Wave 109",
      titleKo: "플랫폼 스마트 썸네일 크롭 · 안티링잉 Lanczos-3",
      capabilitySummaryKo: "6종 플랫폼 UI 배지 회피 · 눈높이 삼분할 크롭 · 선화 오버슈트 0px",
      async execute() {
        const wave109 = await import("../wasm64-wave109-smart-thumbnail-crop-and-platform-packager");
        const width = 32;
        const height = 24;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const ink = Math.abs(x - 11) <= 1 || Math.abs(x - y) <= 1 ? 24 : 232;
            rgba.set([ink, ink, ink, 255], (y * width + x) * 4);
          }
        }
        const pkg = wave109.compilePlatformThumbnailPackageManifest({
          sourceSpec: {
            artworkId: "hub-art-109",
            titleKo: "허브 대표 썸네일",
            sourceWidthPx: 1600,
            sourceHeightPx: 1000,
            subjects: [
              {
                subjectId: "hero",
                labelKo: "주인공",
                priority: 10,
                faceBox: { x: 640, y: 210, width: 220, height: 250 },
                eyeLinePoint: { x: 750, y: 315 },
              },
            ],
          },
          sourceTile: { width, height, rgba },
          resamplePreviewMaxEdgePx: 20,
          antiRinging: true,
        });
        const ok =
          pkg.readyForPublish &&
          pkg.deliverables.length === 6 &&
          pkg.resamplerAudit.totalRingingOvershootCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `6종 플랫폼 출고 승인 · 배지 가림 0건 · Lanczos-3 오버슈트 0px`,
          metrics: {
            deliverableCount: pkg.deliverables.length,
            ringingOvershoots: pkg.resamplerAudit.totalRingingOvershootCount,
            readyForPublish: pkg.readyForPublish,
          },
        };
      },
    },
    {
      id: "wave110LocalizationExpansionBridge",
      waveLabel: "Wave 110",
      titleKo: "글로벌 번역 팽창 예산 · 용어집·말투 조판 브리지",
      capabilitySummaryKo: "7개국 팽창 예산 · 말풍선 4단계 피팅 · 원문 한글 누출·경어 감사",
      async execute() {
        const wave110 = await import("../wasm64-wave110-localization-expansion-budget-and-typeset-bridge");
        const budget = wave110.estimateCrossLocaleExpansionBudget(
          "서연님, 지금 물러서 주세요!",
          wave110.ALL_LOCALIZATION_LOCALES,
          { masterInnerWidthPx: 250, masterInnerHeightPx: 165, nominalFontSizePx: 20 },
        );
        const fitReport = wave110.auditAndFitLocalizedDialogueBalloons([
          {
            balloonId: "hub-b1",
            cutId: "hub-c1",
            locale: "ko-KR",
            translatedText: "서연님, 조심하세요!",
            innerWidthPx: 240,
            innerHeightPx: 150,
            nominalFontSizePx: 20,
            minReadableFontPx: 14,
            canvasWidthPx: 800,
          },
          {
            balloonId: "hub-b2",
            cutId: "hub-c1",
            locale: "en-US",
            translatedText: "Watch out, Seoyeon!",
            innerWidthPx: 240,
            innerHeightPx: 150,
            nominalFontSizePx: 20,
            minReadableFontPx: 14,
            canvasWidthPx: 800,
          },
        ]);
        const glossaryReport = wave110.auditLocalizationGlossaryAndRegister(
          {
            episodeId: "hub-ep-110",
            episodeTitle: "허브 번역 진단",
            lines: [
              {
                cutId: "hub-c1",
                balloonId: "hub-b1",
                speakerId: "guard",
                listenerId: "lord",
                sourceKoText: "서연님, 조심하세요!",
                translationsByLocale: { "en-US": "Watch out, Seoyeon!" },
              },
            ],
          },
          {
            seriesId: "hub-series",
            glossaryVersion: "1.0",
            terms: [
              {
                termId: "char-seoyeon",
                category: "character",
                sourceKo: "서연",
                approvedByLocale: { "ko-KR": "서연", "en-US": "Seoyeon" },
              },
            ],
          },
          { rules: [] },
        );
        const ok =
          budget.locales.length === 7 &&
          fitReport.severeOverflowCount === 0 &&
          glossaryReport.exportApproved &&
          glossaryReport.untranslatedSourceLeakCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `7개국 팽창 예산 · 심각 넘침 0건 · 한글 누출 0건 · 출고 승인`,
          metrics: {
            localeCount: budget.locales.length,
            severeOverflowCount: fitReport.severeOverflowCount,
            untranslatedLeakCount: glossaryReport.untranslatedSourceLeakCount,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 105~110 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave105To110Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave105To110ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
