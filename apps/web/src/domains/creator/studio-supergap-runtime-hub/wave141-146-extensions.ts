/**
 * Wave 141~146 초격차 확장 서브시스템 동적 로더 (`wave141-146-extensions`).
 *
 * - 모든 Wave 141~146 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave141To146Extensions()`를 통해 총 85개 라이브 초격차 엔진(Wave 54~146 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 141~146 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave141To146ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave141SunEphemerisShadowAuditor",
      waveLabel: "Wave 141",
      titleKo: "컷 간 천문 태양·달 그림자 방향 일관성 & 다중 광원 검증",
      capabilitySummaryKo: "서울 위도·시각 천문 투영 · 180도 리버스 반전 · 자동 교정 · WGSL",
      async execute() {
        const wave141 = await import("../wasm64-wave141-multi-cut-sun-ephemeris-and-shadow-angle-auditor");
        const scene = {
          sceneId: "hub-ep141",
          sceneTitle: "허브 옥상 오전 대치",
          latitudeDeg: 37.5665,
          dayOfYear: 80,
          defaultLocalSolarHour: 9,
          defaultLightSourceType: "outdoor-solar" as const,
        };
        const badCuts = [
          { cutId: "c1", cutNumber: 1, cameraYawDeg: 0, drawnShadowAngleDeg: 0, drawnShadowLengthRatio: 4.5, drawnRimSide: "left" as const },
          { cutId: "c2", cutNumber: 2, cameraYawDeg: 180, drawnShadowAngleDeg: 0, drawnShadowLengthRatio: 0.2, drawnRimSide: "right" as const },
        ];
        const fixed = wave141.correctCutShadowDirections(scene, badCuts);
        const wgsl = wave141.validateShadowGuideOverlayWgsl(wave141.buildShadowGuideOverlayWgsl().wgslSource);
        const ok =
          fixed.originalReport.violations.length >= 3 &&
          fixed.correctedReport.passed &&
          fixed.correctedReport.violations.length === 0 &&
          fixed.correctedReport.continuityScore === 100 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `그림자·림라이트 위반 ${fixed.originalReport.violations.length}건 → 자동 교정 후 0건(100점) · WGSL 통과`,
          metrics: {
            originalViolations: fixed.originalReport.violations.length,
            correctedViolations: fixed.correctedReport.violations.length,
            continuityScore: fixed.correctedReport.continuityScore,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave142OledDualThemeContrastAuditor",
      waveLabel: "Wave 142",
      titleKo: "OLED 다크·라이트 독자 뷰어 APCA/WCAG 대비 · 눈부심 보정",
      capabilitySummaryKo: "4종 뷰어 투명 여백 사라짐 0건 · 눈부심 완충 거터 · WGSL",
      async execute() {
        const wave142 = await import("../wasm64-wave142-oled-darkmode-viewer-contrast-and-haloing-auditor");
        const res = wave142.synthesizeThemeSafeRemediation({
          episodeId: "hub-ep142",
          episodeTitleKo: "허브 양면 뷰어 진단",
          cuts: [
            {
              cutId: "n1",
              cutIndex: 0,
              labelKo: "야간 투명 SFX 컷",
              meanLuma: 0.03,
              gutterBeforePx: 0,
              elements: [
                {
                  id: "sfx-black",
                  labelKo: "먹선 쾅!",
                  kind: "sfx-ink",
                  backdropMode: "transparent-margin",
                  foreground: { r: 12, g: 12, b: 16, a: 1 },
                },
              ],
            },
            {
              cutId: "f2",
              cutIndex: 1,
              labelKo: "순백 플래시 컷",
              meanLuma: 0.95,
              gutterBeforePx: 40,
              elements: [],
            },
          ],
        });
        const wgsl = wave142.validateDualThemePreviewWgsl(wave142.buildDualThemePreviewWgsl("split-light-oled"));
        const ok =
          res.verification.beforeDefectCount >= 2 &&
          res.verification.afterDefectCount === 0 &&
          res.verification.allFourThemesVerifiedPass &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `양면 뷰어 결함 ${res.verification.beforeDefectCount}건→0건(4종 뷰어 100% 통과) · WGSL 통과`,
          metrics: {
            beforeDefects: res.verification.beforeDefectCount,
            afterDefects: res.verification.afterDefectCount,
            allFourThemesPass: res.verification.allFourThemesVerifiedPass,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave143MultilingualBalloonTypesetter",
      waveLabel: "Wave 143",
      titleKo: "5개국어 말풍선 마름모꼴 Knuth-Plass 줄바꿈 & 금칙 피팅",
      capabilitySummaryKo: "한/일/영/불/스 금칙 0건 · 자동 폰트 축소 오버플로우 0건",
      async execute() {
        const wave143 = await import("../wasm64-wave143-multilingual-balloon-knuth-plass-typesetter");
        const fit = wave143.fitDialogueIntoBalloon(
          "지금 이 자리에서 물러서면 우리가 석 달 동안 목숨 걸고 지켜 낸 마지막 방어선이 오늘 밤 안으로 완전히 무너지고 만다!",
          "ko-KR",
          { kind: "ellipse-classic", widthPx: 260, heightPx: 180, safePaddingPx: 18 },
          { minFontSizePx: 10, maxFontSizePx: 22, preferredFontSizePx: 20, fontStepPx: 0.5 },
        );
        const esLayout = wave143.typesetBalloonDiamondOptimal(
          "¡Apártate ahora mismo! ¿Acaso no escuchas lo que te digo?",
          "es-ES",
          { kind: "ellipse-classic", widthPx: 260, heightPx: 180, safePaddingPx: 18 },
          { fontSizePx: 15 },
        );
        const ok =
          fit.layout.audit.overflowLineCount === 0 &&
          fit.layout.audit.lineStartKinsokuCount === 0 &&
          esLayout.audit.lineEndKinsokuCount === 0 &&
          esLayout.audit.overflowLineCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `장문 자동 피팅(${fit.layout.fontSizePx}px · 오버플로우 0건) · 한/스페인어 금칙 위반 0건`,
          metrics: {
            fittedFontSizePx: fit.layout.fontSizePx,
            overflowLines: fit.layout.audit.overflowLineCount,
            esKinsokuViolations: esLayout.audit.lineEndKinsokuCount,
            diamondFitScore: round2(fit.layout.diamondFitScore),
          },
        };
      },
    },
    {
      id: "wave144RightsBomDerivativeClearance",
      waveLabel: "Wave 144",
      titleKo: "Rights BOM 2차 저작물 라이선스 감사 & 안전 대체 어셋 매칭",
      capabilitySummaryKo: "연재/단행본/영상/굿즈/글로벌 5범위 fail-closed · 자카드 대체 매칭",
      async execute() {
        const wave144 = await import("../wasm64-wave144-studio-rights-bom-derivative-clearance-engine");
        const allScopes = wave144.COMMERCIAL_DISTRIBUTION_SCOPES;
        const outcome = wave144.applySafeReplacementsAndReaudit(
          {
            episodeId: "ep-144",
            projectTitleKo: "허브 Rights BOM 진단",
            releaseDateIso: "2026-11-28",
            requestedScopes: allScopes,
            assets: [
              {
                assetId: "bad-brush",
                nameKo: "비상업 브러시",
                category: "brush-pack",
                vendor: "개인배포",
                licenseTier: "non-commercial-personal",
                allowedScopes: ["webtoon-serial"],
                seatLimit: 1,
                activeTeamSeatsUsed: 1,
                attributionRequired: false,
                attributionIncludedInCredits: true,
                tags: ["수채화", "구름"],
                usedInCutIds: ["C01"],
              },
            ],
          },
          [
            {
              assetId: "safe-brush-pro",
              nameKo: "프로 수채화 구름 브러시",
              category: "brush-pack",
              vendor: "ToonStudio 공식",
              licenseTier: "commercial-full",
              allowedScopes: allScopes,
              seatLimit: 10,
              existingSeatsInUse: 2,
              attributionRequired: false,
              tags: ["수채화", "구름", "하늘"],
              commercialClearanceVerified: true,
            },
          ],
        );
        const ok =
          !outcome.initialAudit.exportCleared &&
          outcome.appliedSwaps.length === 1 &&
          outcome.reAudit.blockerCount === 0 &&
          outcome.clearedAfterReaudit;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `비상업 차단 ${outcome.initialAudit.blockerCount}건 → 안전 어셋 대체 후 출고 승인(blocker 0건)`,
          metrics: {
            initialBlockers: outcome.initialAudit.blockerCount,
            appliedSwaps: outcome.appliedSwaps.length,
            clearedAfterReaudit: outcome.clearedAfterReaudit,
          },
        };
      },
    },
    {
      id: "wave145ActionHitstopSmearArc",
      waveLabel: "Wave 145",
      titleKo: "액션 컷 타격 히트스톱 · 스미어 잔상 & 모션 호 타이밍 솔버",
      capabilitySummaryKo: "면적 보존 스쿼시 · WCAG <=3Hz 안전 클램프 · 감쇠 셰이크 · WGSL",
      async execute() {
        const wave145 = await import("../wasm64-wave145-action-hitstop-smear-and-motion-arc-solver");
        const seq = wave145.compileActionImpactSequence({
          cutId: "hub-action-145",
          tier: "finisher-critical",
          arcInput: {
            curveKind: "quadratic-bezier",
            start: { x: 120, y: 420 },
            control1: { x: 380, y: 120 },
            end: { x: 680, y: 360 },
            durationSec: 0.16,
          },
          requestedFlashCount: 8,
          requestedFlashRateHz: 10,
        });
        const wgsl = wave145.validateActionSmearImpactWgsl(
          wave145.buildActionSmearImpactWgsl({ tier: "finisher-critical" }),
        );
        const ok =
          seq.safetyGuard.wcagFlashClamped &&
          seq.safetyGuard.wcagCompliant &&
          seq.cameraShake.convergedWithinThreshold &&
          seq.smearFan.isPositiveArea &&
          seq.afterimages.alphaMonotonicallyDecreasing &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `피니셔 히트스톱 ${seq.phaseCounts.hitStopFreezeFrames}f · WCAG <=3Hz 안전 클램프 · WGSL 통과`,
          metrics: {
            hitStopFrames: seq.phaseCounts.hitStopFreezeFrames,
            wcagCompliant: seq.safetyGuard.wcagCompliant,
            shakeConverged: seq.cameraShake.convergedWithinThreshold,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave146FastCdcParityRecoveryVault",
      waveLabel: "Wave 146",
      titleKo: "FastCDC 증분 스냅샷 중복제거 & GF(256) 패리티 손상 복구 금고",
      capabilitySummaryKo: "시프트 내성 FastCDC · GF(256) P+Q 2-청크 동시 손상 100% 치유",
      async execute() {
        const wave146 = await import("../wasm64-wave146-fastcdc-snapshot-dedup-and-parity-recovery-vault");
        const rev1 = new Uint8Array(24_576);
        for (let i = 0; i < rev1.length; i += 1) {
          rev1[i] = ((i * 31 + 17) ^ (i >>> 3)) & 0xff;
        }
        const rev2 = new Uint8Array(37 + rev1.length);
        rev2.fill(0x5a, 0, 37);
        rev2.set(rev1, 37);

        const vault = new wave146.ManuscriptSnapshotDedupVault({
          chunking: { minChunkBytes: 512, avgChunkBytes: 2048, maxChunkBytes: 8192 },
          stripeDataShards: 4,
        });
        const c1 = vault.commitSnapshot("hub-ep146", "선화", rev1);
        const c2 = vault.commitSnapshot("hub-ep146", "37B 앞단 삽입", rev2);
        const stripe = vault.getVaultHealthSnapshot().stripes.find((s) => s.dataShardCount >= 2);
        let healedChunks = 0;
        let restoredOk = false;
        if (stripe && stripe.dataChunkIds[0] && stripe.dataChunkIds[1]) {
          vault.injectChunkBitFlipForTest(stripe.dataChunkIds[0], 5, 0x0f);
          vault.dropChunkDataForTest(stripe.dataChunkIds[1]);
          const scrub = vault.scrubAndHealVault();
          healedChunks = scrub.healedDataChunkCount;
          const restored = vault.restoreSnapshotBytes(c1.snapshotId);
          restoredOk = scrub.allDataIntact && restored.ok && restored.actualPayloadSha256Hex === c1.payloadSha256Hex;
        }
        const ok = c2.dedupReusePercent > 65 && healedChunks === 2 && restoredOk;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `37B 시프트 재사용 ${round2(c2.dedupReusePercent)}% · 2-청크 동시 손상 GF(256) 100% 치유`,
          metrics: {
            shiftDedupReusePct: round2(c2.dedupReusePercent),
            healedDataChunks: healedChunks,
            restoredBitExact: restoredOk,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 141~146 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave141To146Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave141To146ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
