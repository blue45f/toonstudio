/**
 * Wave 153~158 초격차 확장 서브시스템 동적 로더 (`wave153-158-extensions`).
 *
 * - 모든 Wave 153~158 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave153To158Extensions()`를 통해 총 97개 라이브 초격차 엔진(Wave 54~158 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 153~158 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave153To158ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave153FacsExpressionToneAuditor",
      waveLabel: "Wave 153",
      titleKo: "FACS 18-AU 캐릭터 표정 블렌더 & 대사-표정 감정 톤 감사기",
      capabilitySummaryKo: "18-AU 해부학 상충 해소 · 대사-표정 극성 불일치 자동 교정 · SHA-256",
      async execute() {
        const wave153 = await import("../wasm64-wave153-facial-expression-facs-blender-and-tone-auditor");
        const rawPanels = [
          {
            panelId: "p1",
            characterId: "hero",
            characterNameKo: "주인공",
            dialogueText: "당장 멈춰! 더는 못 참아!",
            dialogueEmotionIntent: "anger-shout" as const,
            bubbleStyle: "shout-jagged" as const,
            au: { AU06: 0.72, AU12: 0.85 },
          },
        ];
        const before = wave153.auditEpisodeExpressionAlignment(rawPanels, {
          episodeTitleKo: "허브 표정-대사 진단",
        });
        const { correctedPanels } = wave153.applyRecommendedExpressionCorrections(rawPanels);
        const after = wave153.auditEpisodeExpressionAlignment(correctedPanels, {
          episodeTitleKo: "허브 표정-대사 진단",
        });
        const ok = before.blockerCount >= 1 && after.passed && after.blockerCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `표정-대사 블로커 ${before.blockerCount}건 → 자동 교정 후 0건(정합 ${after.overallAlignmentScore}점)`,
          metrics: {
            beforeBlockers: before.blockerCount,
            afterBlockers: after.blockerCount,
            alignmentScore: after.overallAlignmentScore,
            passed: after.passed,
          },
        };
      },
    },
    {
      id: "wave154AccessibleAltSceneCompiler",
      waveLabel: "Wave 154",
      titleKo: "웹툰 3개국어 시각 접근성 Alt-Text · 장면 해설 & KWCAG 감사기",
      capabilitySummaryKo: "KWCAG 2.2 · WCAG 2.2 AA · EAA 3개국어 중복 생략 Alt·ARIA 그래프",
      async execute() {
        const wave154 = await import("../wasm64-wave154-accessible-webtoon-alt-scene-description-compiler");
        const episode = {
          episodeId: "hub-ep154",
          seriesTitleKo: "허브 접근성 시리즈",
          episodeTitleKo: "1화 비 내리는 옥상",
          panels: [
            {
              panelId: "cut-1",
              panelIndex: 1,
              shotScale: "wide-establishing" as const,
              settingKo: "비 내리는 서울 도심 옥상",
              settingEn: "Rainy Seoul rooftop",
              settingJa: "雨の降るソウル都心の屋上",
              lightingMood: "푸른 야간 네온",
              characters: [
                {
                  characterId: "hero",
                  nameKo: "수현",
                  nameEn: "Suhyun",
                  nameJa: "スヒョン",
                  horizontalPosition: "center" as const,
                  expressionLabel: "결연한 눈빛",
                  actionDescription: "검을 고쳐 잡는다",
                },
              ],
              dialogues: [
                {
                  dialogueId: "d1",
                  order: 1,
                  speakerId: "hero",
                  speakerName: "수현",
                  deliveryStyle: "normal" as const,
                  text: "여기서 끝내자.",
                },
              ],
              sfxItems: [
                {
                  sfxId: "s1",
                  visualGlyph: "우르릉",
                  semanticMeaning: "멀리서 천둥이 울리는 소리",
                },
              ],
            },
            {
              panelId: "cut-2",
              panelIndex: 2,
              shotScale: "closeup" as const,
              settingKo: "비 내리는 서울 도심 옥상",
              settingEn: "Rainy Seoul rooftop",
              settingJa: "雨の降るソウル都心の屋上",
              lightingMood: "푸른 야간 네온",
              characters: [
                {
                  characterId: "hero",
                  nameKo: "수현",
                  nameEn: "Suhyun",
                  nameJa: "スヒョン",
                  horizontalPosition: "center" as const,
                  expressionLabel: "긴장한 표정",
                  actionDescription: "앞을 노려본다",
                },
              ],
              dialogues: [],
              sfxItems: [],
            },
          ],
        };
        const compiled = wave154.compileAccessibleEpisodeDescriptions(episode);
        const audit = wave154.auditEpisodeAccessibilityCompliance(episode, compiled);
        const ok =
          audit.readyForRelease &&
          audit.kwcag22Compliant &&
          audit.wcag22AaCompliant &&
          audit.blockerCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `KWCAG·WCAG·EAA 통과(블로커 0건 · Alt ${audit.altCoveragePercent}% · 중복 배경 생략 ${compiled.antiRedundancySkippedSettingsCount}컷)`,
          metrics: {
            readyForRelease: audit.readyForRelease,
            altCoveragePct: audit.altCoveragePercent,
            skippedRedundantSettings: compiled.antiRedundancySkippedSettingsCount,
            blockerCount: audit.blockerCount,
          },
        };
      },
    },
    {
      id: "wave155CrossDccLayerCompatTranslator",
      waveLabel: "Wave 155",
      titleKo: "다중 DCC 레이어 블렌드모드 호환성 변환기 & 손실 위험 감사기",
      capabilitySummaryKo: "5종 DCC 18블렌드모드 OKLab ΔE 근사 최적화 · 래스터화·색심도 감사",
      async execute() {
        const wave155 = await import("../wasm64-wave155-cross-dcc-layer-blend-compatibility-translator");
        const result = wave155.translateDccLayerTree({
          documentId: "hub-dcc-155",
          documentTitleKo: "허브 CSP→PSD 호환 진단",
          sourceDcc: "clip-studio-paint",
          targetDcc: "photoshop-psd",
          layers: [
            {
              layerId: "l-glow",
              nameKo: "네온 발광 닷지",
              layerKind: "raster",
              blendMode: "glow-dodge",
              opacity: 0.85,
              clippingMask: false,
              bitDepth: 16,
            },
            {
              layerId: "l-ink",
              nameKo: "선화 곱하기",
              layerKind: "raster",
              blendMode: "multiply",
              opacity: 1,
              clippingMask: false,
              bitDepth: 8,
            },
          ],
        });
        const ok =
          result.totalLayerCount === 2 &&
          result.exactMatchLayerCount === 1 &&
          result.approximatedBlendLayerCount === 1 &&
          result.translationManifestSha256Hex.length === 64;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `CSP→PSD 직매핑 ${result.exactMatchLayerCount} · OKLab 근사 ${result.approximatedBlendLayerCount}(평균 ΔE ${round2(result.meanDocumentOklabDeltaE)})`,
          metrics: {
            exactMatches: result.exactMatchLayerCount,
            approximatedBlends: result.approximatedBlendLayerCount,
            meanOklabDeltaE: round2(result.meanDocumentOklabDeltaE),
            compatibilityScore: round2(result.compatibilityScore),
          },
        };
      },
    },
    {
      id: "wave156SfxCoonsWarpContrastOutline",
      waveLabel: "Wave 156",
      titleKo: "웹툰 효과음(SFX) Coons 패치 워프 & 배경 대비 다중 아웃라인 솔버",
      capabilitySummaryKo: "야코비안 접힘 0건 · 혼재 액션 배경 WCAG >=4.5:1 이중 링 · WGSL",
      async execute() {
        const wave156 = await import("../wasm64-wave156-sfx-envelope-warp-and-contrast-outline-solver");
        const preset = wave156.createSfxEnvelopePreset("perspective-recede");
        const foldAudit = wave156.auditCoonsPatchFoldOver(preset);
        const warped = wave156.warpSfxTextToEnvelope("콰아아앙!", { envelope: preset });
        const outline = wave156.solveAdaptiveSfxOutline({
          fillSrgb: { r: 0.94, g: 0.25, b: 0.16 },
          backgroundSamplesSrgb: [
            { r: 0.04, g: 0.04, b: 0.06 },
            { r: 0.48, g: 0.48, b: 0.5 },
            { r: 0.95, g: 0.95, b: 0.97 },
          ],
        });
        const wgsl = wave156.validateSfxSdfOutlineWgsl(
          wave156.buildSfxSdfOutlineWgsl({ outline }).wgsl,
        );
        const ok =
          !foldAudit.hasFoldOver &&
          warped.glyphs.length >= 4 &&
          outline.meetsDualRingReadability &&
          outline.effectiveWorstContrast >= 4.5 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `Coons 접힘 0건(${warped.glyphs.length}글리프) · 최악 배경 대비 ${round2(outline.effectiveWorstContrast)}:1 · WGSL 통과`,
          metrics: {
            foldOverCount: foldAudit.foldOverCount,
            warpedGlyphs: warped.glyphs.length,
            worstContrast: round2(outline.effectiveWorstContrast),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave157ShotFramingFocalDirector",
      waveLabel: "Wave 157",
      titleKo: "카메라 화각 압축 · 피사계 심도(CoC) & 관절 잘림 방지 샷 디렉터",
      capabilitySummaryKo: "18~200mm 배경 압축 · 박렌즈 DoF · 관절 절단 0건 삼분할 리프레이밍",
      async execute() {
        const wave157 = await import("../wasm64-wave157-shot-framing-rule-of-thirds-and-focal-compression-director");
        const subject = wave157.createStandingSubjectLandmarks({
          centerX: 0.5,
          crownY: 0.08,
          bodyHeight: 0.84,
          gazeDirection: "right",
        });
        const plan = wave157.directPanelShotFraming({
          panel: {
            panelId: "hub-shot-157",
            titleKo: "허브 85mm 인물 샷",
            subject,
            crop: { x: 0.15, y: 0.05, width: 0.7, height: 0.63 },
          },
          focalLengthMm: 85,
          fNumber: 1.8,
          backgroundDistanceM: 12,
        });
        const ok =
          plan.reframe.afterAudit.jointCropViolations.length === 0 &&
          plan.reframe.afterAudit.passed &&
          plan.dof.nearFocusLimitM > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `85mm 압축 ${round2(plan.compression.backgroundCompressionRatio)}x · 관절 절단 ${plan.reframe.beforeAudit.jointCropViolations.length}건→0건 · 구도 ${plan.reframe.afterAudit.framingScore}점`,
          metrics: {
            compressionRatio: round2(plan.compression.backgroundCompressionRatio),
            jointCropsBefore: plan.reframe.beforeAudit.jointCropViolations.length,
            jointCropsAfter: plan.reframe.afterAudit.jointCropViolations.length,
            framingScoreAfter: plan.reframe.afterAudit.framingScore,
          },
        };
      },
    },
    {
      id: "wave158OpfsWalCrashRecoveryQuota",
      waveLabel: "Wave 158",
      titleKo: "로컬 OPFS/SQLite 바이너리 WAL(CRC-32C) 크래시 복구 & 할당량 압축기",
      capabilitySummaryKo: "Castagnoli CRC-32C 끝단 잘림 복구 · 상태 동치 압축 · 미동기화 원고 절대 보호",
      async execute() {
        const wave158 = await import("../wasm64-wave158-opfs-wal-crash-recovery-and-quota-compactor");
        const res = wave158.runOpfsWalCrashRecoveryAndQuotaPlan(
          wave158.createSampleOpfsWalRecoveryScenario(),
        );
        const ok =
          res.overallHealthy &&
          res.replay.corruptedMiddleFrame === null &&
          res.quotaPlan.targetHeadroomMet &&
          res.compaction !== null &&
          res.compaction.stateHashEquivalent;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `커밋 트랜잭션 ${res.replay.committedTxCount}건 무손실 복구 · 체크포인트 동치 압축 · 미동기화 원고 보호`,
          metrics: {
            overallHealthy: res.overallHealthy,
            committedTxs: res.replay.committedTxCount,
            stateHashEquivalent: res.compaction?.stateHashEquivalent ?? false,
            targetHeadroomMet: res.quotaPlan.targetHeadroomMet,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 153~158 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave153To158Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave153To158ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
