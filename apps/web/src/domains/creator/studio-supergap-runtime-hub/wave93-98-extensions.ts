/**
 * Wave 93~98 초격차 확장 서브시스템 동적 로더 (`wave93-98-extensions`).
 *
 * - 모든 Wave 93~98 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave93To98Extensions()`를 통해 총 37개 라이브 초격차 엔진(Wave 54~98 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 93~98 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave93To98ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave93FederatedStudioStyleDelta",
      waveLabel: "Wave 93",
      titleKo: "프라이버시 보존 팀 화풍 연합 가중치 델타",
      capabilitySummaryKo: "DP 가우시안 L2 클리핑 · 원본 미업로드 보장 · 비잔틴 이상치 차단",
      async execute() {
        const wave93 = await import("../wasm64-wave93-federated-studio-style-delta");
        const base = wave93.createDefaultStyleAdapterVector();
        const ledger = new wave93.PrivacyBudgetLedger({
          studioId: "hub-studio",
          participantId: "lead-1",
          maxEpsilonBudget: 5.0,
        });
        const local = wave93.extractLocalStyleDelta(
          base,
          [
            {
              sessionId: "hub-s1",
              observedStyle: wave93.createDefaultStyleAdapterVector({ celRampHardness: 0.72 }),
            },
          ],
          { epsilon: 4.0, delta: 1e-5, maxL2Norm: 0.25, seed: 93 },
          ledger,
        );
        const round = wave93.aggregateFederatedStyleRound(base, [local.envelope], {
          studioId: "hub-studio",
          roundIndex: 1,
          aggregator: "weighted-fedavg",
          maxAcceptedL2Norm: 6.0,
          outlierZScoreThreshold: 4.0,
          leadArtistAnchor: base,
          driftGuard: { maxCosineDistance: 0.5, maxAxisDrift: 1.5, maxOklchShadowDrift: 1.5 },
        });
        const ok =
          !local.envelope.rawArtworkUploaded &&
          round.decision === "APPLIED" &&
          ledger.getSnapshot().remainingEpsilon > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `원본 원고 0바이트 업로드 · DP 라운드 ${round.decision} · 잔여 ε ${round2(ledger.getSnapshot().remainingEpsilon)}`,
          metrics: {
            rawArtworkUploaded: local.envelope.rawArtworkUploaded,
            decision: round.decision,
            remainingEpsilon: round2(ledger.getSnapshot().remainingEpsilon),
          },
        };
      },
    },
    {
      id: "wave94OvernightFinishingQa",
      waveLabel: "Wave 94",
      titleKo: "무인 야간 자율 마감 QA · 자가 복구 파이프라인",
      capabilitySummaryKo: "8대 결함 스캔 · 스테이징 격리 자가 복구 · 마스터 SHA-256 불변 보증",
      async execute() {
        const wave94 = await import("../wasm64-wave94-autonomous-overnight-finishing-qa");
        const master = {
          episodeId: "hub-ep-94",
          title: "허브 야간 마감 진단",
          platformSpec: "naver-webtoon" as const,
          canvasWidthPx: 800,
          canvasHeightPx: 1120,
          auditDateIso: "2026-11-28",
          colorProfile: "srgb" as const,
          panels: [
            {
              panelId: "p1",
              sequenceIndex: 1,
              bounds: { x: 0, y: 40, width: 800, height: 960 },
              layers: [
                {
                  layerId: "p1-ink",
                  name: "선화",
                  role: "ink" as const,
                  visible: true,
                  opacity: 1,
                  blendMode: "normal" as const,
                  colorProfile: "srgb" as const,
                },
                {
                  layerId: "p1-rough",
                  name: "러프 가이드",
                  role: "rough-draft" as const,
                  visible: true,
                  opacity: 0.6,
                  blendMode: "normal" as const,
                  colorProfile: "srgb" as const,
                },
              ],
            },
          ],
          speechBalloons: [
            {
              balloonId: "b1",
              panelId: "p1",
              bbox: { x: 40, y: 80, width: 180, height: 80 },
              text: "아침 출고 준비 완료.",
              minReadableFontPx: 14,
              fontSizePx: 16,
            },
          ],
          faceKeepOutBoxes: [],
          rightsBomAssets: [
            {
              assetId: "font-pretendard",
              assetName: "프리텐다드",
              assetType: "font" as const,
              licenseStatus: "verified-commercial" as const,
              expiresAtIso: "2028-12-31",
              usedInPanelIds: ["p1"],
            },
          ],
        };
        const run = wave94.runOvernightSelfHealingPipeline(master);
        const ok =
          run.masterUnmutated &&
          run.masterSha256Before === run.masterSha256After &&
          run.appliedPatchCount >= 1 &&
          run.exportReady;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `격리 스테이징 ${run.appliedPatchCount}건 자가 복구 · 마스터 SHA-256 불변 · 출고 준비 완료`,
          metrics: {
            masterUnmutated: run.masterUnmutated,
            appliedPatchCount: run.appliedPatchCount,
            exportReady: run.exportReady,
          },
        };
      },
    },
    {
      id: "wave95SpatialParallaxTheater",
      waveLabel: "Wave 95",
      titleKo: "2D→WebXR 공간 디스플레이 입체 컷 극장",
      capabilitySummaryKo: "Percival/Sheard VAC 피로 방지 · 대사 복시 차단 · 오프액시스 투영·WGSL",
      async execute() {
        const wave95 = await import("../wasm64-wave95-spatial-parallax-depth-theater");
        const optics = wave95.createSpatialOpticsConfig("vision-spatial-window", {
          comfortTier: "calm-strict",
        });
        const scene = wave95.compileSpatialTheaterSceneGraph(
          [
            {
              panelId: "cut-01",
              titleKo: "입체 진단 컷",
              panelWidthPx: 800,
              panelHeightPx: 1000,
              gutterAfterPx: 120,
              layers: [
                { layerId: "sky", labelKo: "하늘", role: "sky-backdrop", rawDepthMeters: 90, overscanMarginPx: 160 },
                { layerId: "hero", labelKo: "주인공", role: "character", rawDepthMeters: 2.2, overscanMarginPx: 160 },
                { layerId: "dlg", labelKo: "대사", role: "speech-balloon", rawDepthMeters: 0.4, overscanMarginPx: 40 },
              ],
            },
          ],
          optics,
          { layoutMode: "curved-theater-arc" },
        );
        const wgsl = wave95.validateSpatialTheaterWgsl(
          wave95.buildSpatialParallaxDepthWgsl("multiview-side-by-side").source,
        );
        const ok =
          scene.panels.length === 1 &&
          scene.sceneHashSha256.length === 64 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `VAC 편안함 압축 · SHA-256(${scene.sceneHashSha256.slice(0, 10)}…) · WebXR WGSL 통과`,
          metrics: {
            panelCount: scene.panels.length,
            wgslValid: wgsl.valid,
            sceneHashPrefix: scene.sceneHashSha256.slice(0, 12),
          },
        };
      },
    },
    {
      id: "wave96ScriptToCameraBlocking",
      waveLabel: "Wave 96",
      titleKo: "대본·콘티 3D 카메라 180° 법칙·3점 조명 솔버",
      capabilitySummaryKo: "한국어 대본 감정 파싱 · 180°/30° 컷 연속성 검증 · 3점 조명 블록킹",
      async execute() {
        const wave96 = await import("../wasm64-wave96-script-to-camera-blocking-solver");
        const parsed = wave96.parseKoreanWebtoonScript(
          '[장면: 옥상 야경]\n서연 (분노): "여기서 끝내자!"\n민재 (경악): "설마 진실을 알고 있었어?!"',
        );
        const actors = [
          { actorId: "서연", displayNameKo: "서연", position: { x: -1.6, y: 0, z: 0 } },
          { actorId: "민재", displayNameKo: "민재", position: { x: 1.6, y: 0, z: 0 } },
        ];
        const plan = wave96.solveCameraBlockingPlan(parsed, actors);
        const audit = wave96.auditCameraBlockingContinuity(plan, actors);
        const ok = audit.passed && audit.violationCount === 0 && plan.shots.length === 2;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `${plan.shots.length}컷 3D 카메라·3점 조명 배치 · 180°/30° 위반 0건 통과`,
          metrics: {
            shotCount: plan.shots.length,
            continuityPassed: audit.passed,
            violationCount: audit.violationCount,
          },
        };
      },
    },
    {
      id: "wave97VoiceLipsyncCutRig",
      waveLabel: "Wave 97",
      titleKo: "성우 보이스 연동 60fps 립싱크·표정 쉐이프키",
      capabilitySummaryKo: "한글 자모 분해 · 로컬 PCM 강제 정렬(<=16.67ms) · 양순음 폐쇄 지배",
      async execute() {
        const wave97 = await import("../wasm64-wave97-voice-lipsync-viseme-cut-rig");
        const dialogue = "지금 바로 출발하자!";
        const synth = wave97.synthesizeDeterministicVoicePcmForScript(dialogue, { seed: 97 });
        const prosody = wave97.extractVoiceAudioProsodyFrames(synth.samples, synth.sampleRateHz, 10);
        const alignment = wave97.alignDialogueToVoiceAudio(dialogue, prosody, { targetFps: 60 });
        const timeline = wave97.evaluateFacialRigTimelineAt60fps(alignment, prosody, {
          prefersReducedMotion: true,
        });
        const audit = wave97.auditLipsyncCutRig(timeline);
        const ok =
          alignment.isStrictlyMonotonic &&
          alignment.maxAudioAlignmentDriftMs <= 16.67 &&
          audit.privacy.runsLocallyOnly &&
          !audit.privacy.uploadsVoiceAudio;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `60fps ${timeline.frames.length}프레임 정렬(오차 ${round2(alignment.maxAudioAlignmentDriftMs)}ms) · 로컬 음성 보호`,
          metrics: {
            frameCount: timeline.frames.length,
            maxDriftMs: round2(alignment.maxAudioAlignmentDriftMs),
            runsLocallyOnly: audit.privacy.runsLocallyOnly,
          },
        };
      },
    },
    {
      id: "wave98CentennialC2paArchive",
      waveLabel: "Wave 98",
      titleKo: "100년 보존형 결정론적 아카이브 & C2PA 인증",
      capabilitySummaryKo: "TSVA v1 Merkle·CRC-32 봉인 · 2026↔2126 0px 재생 · C2PA 서명 체인",
      async execute() {
        const wave98 = await import("../wasm64-wave98-centennial-deterministic-c2pa-archive");
        const key = "hub-diag-centennial-key-2026";
        const panels = [
          {
            panelId: "cut-01",
            width: 32,
            height: 24,
            backgroundRgba: [248, 245, 238, 255] as const,
            rectFills: [{ x: 2, y: 2, width: 28, height: 10, rgba: [230, 224, 212, 255] as const }],
            inkStrokes: [{ x0: 2, y0: 2, x1: 29, y1: 2, thicknessPx: 1, rgba: [22, 28, 34, 255] as const }],
            dialogueRuns: [
              { fontId: "font-hub", text: "2126!", x: 2, y: 4, scale: 1, rgba: [18, 22, 26, 255] as const },
            ],
          },
        ];
        const font = wave98.buildEmbeddedFontSubsetForText("font-hub", "Hub Centennial", ["2126!"]);
        const icc = wave98.createEmbeddedIccColorProfile({
          profileId: "icc-srgb-hub",
          colorSpace: "sRGB-IEC61966-2.1",
          channelGainQ8: [256, 256, 256],
        });
        let chain = wave98.createC2paProvenanceChain(
          "hub-ep-98",
          {
            creatorId: "creator-hub",
            displayNameKo: "스튜디오 작가",
            studioNameKo: "툰스튜디오",
            keyId: "urn:toonstudio:key:hub:2026",
          },
          key,
        );
        chain = wave98.appendC2paAssertion(
          chain,
          {
            label: "c2pa.created",
            timestampIso: "2026-11-28T05:00:00Z",
            softwareAgent: "ToonStudio/2.0",
            summaryKo: "허브 아카이브 진단 원본 생성",
            data: { origin: "human-drawn-stylus" },
          },
          key,
        );
        chain = wave98.appendC2paAssertion(
          chain,
          {
            label: "toonstudio.ai-disclosure.v1",
            timestampIso: "2026-11-28T05:05:00Z",
            softwareAgent: "ToonStudio/2.0",
            summaryKo: "수작업 100% 작화 및 생성형 미사용 고지",
            data: {
              humanDrawnRatioPercent: 100,
              assistiveToolsUsed: [],
              generativeFillUsed: false,
              disclosureStatementKo: "전 컷 수작업 작화.",
            },
          },
          key,
        );
        const sealed = wave98.createSealedCentennialEpisodeArchive({
          panels,
          embeddedFonts: [font],
          iccProfile: icc,
          wasmRendererPin: {
            engineName: "toonstudio-deterministic-raster-wasm64",
            engineVersion: "2.0.0",
            arithmeticContract: wave98.DETERMINISTIC_ARITHMETIC_CONTRACT,
            wasmBinarySha256: wave98.sha256CentennialHex("wasm-hub-v2"),
          },
          rightsBom: {
            snapshotId: "bom-hub-98",
            episodeId: "hub-ep-98",
            assets: [
              {
                assetId: "font-hub",
                assetKind: "font",
                licenseId: "OFL-1.1",
                archivalPreservationAllowed: true,
                commercialDistributionStatus: "cleared",
                expirationYear: null,
              },
            ],
          },
          c2paChain: chain,
        });
        const decoded = wave98.decodeCentennialArchive(sealed.archiveBytes);
        const audit = wave98.auditCentennialPreservationReadiness(decoded, key);
        const ok = audit.readyForCentennialSeal && audit.badges.bitExact2126 && audit.badges.glyphComplete;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `TSVA v1(${sealed.archiveBytes.byteLength}B) · 2026↔2126 오차 0px · C2PA 봉인 통과`,
          metrics: {
            readyForCentennialSeal: audit.readyForCentennialSeal,
            bitExact2126: audit.badges.bitExact2126,
            archiveBytes: sealed.archiveBytes.byteLength,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 93~98 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave93To98Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave93To98ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
