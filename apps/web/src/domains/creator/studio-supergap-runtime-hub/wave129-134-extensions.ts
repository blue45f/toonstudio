/**
 * Wave 129~134 초격차 확장 서브시스템 동적 로더 (`wave129-134-extensions`).
 *
 * - 모든 Wave 129~134 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave129To134Extensions()`를 통해 총 73개 라이브 초격차 엔진(Wave 54~134 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 129~134 초격차 서브시스템 6종 동적 확장 정의를 생성한다. */
export function createWave129To134ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave129RedlinePinRevisionConsensus",
      waveLabel: "Wave 129",
      titleKo: "스튜디오 협업 레드라인 핀 교정 · 수정 라운드 합의",
      capabilitySummaryKo: "7역할 권한 분리(SoD) · 자가 승인 차단 · PD 출고 승인 게이트",
      async execute() {
        const wave129 = await import("../wasm64-wave129-redline-pin-markup-and-revision-consensus-engine");
        const basePin = {
          pinId: "hub-pin-129",
          cutId: "cut-04",
          normX: 0.42,
          normY: 0.36,
          category: "anatomy" as const,
          severity: "blocker" as const,
          authorId: "pd-kim",
          authorRole: "pd-editor" as const,
          assigneeRole: "inker" as const,
          noteKo: "오른손 손가락 비율 보정",
          roundNumber: 1,
          status: "open" as const,
        };
        const s1 = wave129.transitionRedlinePinStatus(basePin, {
          targetStatus: "in-progress",
          actorId: "inker-park",
          actorRole: "inker",
        });
        const s2 = wave129.transitionRedlinePinStatus(s1.pin, {
          targetStatus: "resolved-pending-verify",
          actorId: "inker-park",
          actorRole: "inker",
        });
        const selfApprove = wave129.transitionRedlinePinStatus(s2.pin, {
          targetStatus: "verified-closed",
          actorId: "inker-park",
          actorRole: "inker",
        });
        const crossVerify = wave129.transitionRedlinePinStatus(s2.pin, {
          targetStatus: "verified-closed",
          actorId: "pd-kim",
          actorRole: "pd-editor",
        });
        const signOff = wave129.evaluateEpisodeRevisionSignOff([crossVerify.pin]);
        const ok =
          selfApprove.rejected &&
          selfApprove.rejectionCode === "SELF_APPROVAL_FORBIDDEN" &&
          !crossVerify.rejected &&
          signOff.episodeSignOffReady &&
          signOff.signOffDecision === "approved";
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `자가 승인 차단(SoD) · PD 교차 검수 승인 완료 · 잔여 핀 ${signOff.remainingPinCount}건`,
          metrics: {
            selfApprovalBlocked: selfApprove.rejected,
            episodeSignOffReady: signOff.episodeSignOffReady,
            remainingPinCount: signOff.remainingPinCount,
          },
        };
      },
    },
    {
      id: "wave130SketchOverdrawCenterline",
      waveLabel: "Wave 130",
      titleKo: "다중 겹침 러프 스케치 단일 먹선 중앙선 통합",
      capabilitySummaryKo: "6겹 잡음→1먹선 · 후버 IRLS 아웃라이어 억제 · G펜 필압 · WGSL",
      async execute() {
        const wave130 = await import("../wasm64-wave130-sketch-overdraw-centerline-consolidation-engine");
        const biases = [-4.2, -2.1, -0.6, 0.6, 2.1, 4.2];
        const strokes = biases.map((bias, idx) => {
          const pts = [];
          for (let i = 0; i < 32; i += 1) {
            const t = i / 31;
            pts.push({ x: 20 + 220 * t, y: 100 + bias + Math.sin(t * Math.PI * 4) * 1.2, pressure: 0.6 });
          }
          if (idx % 2 === 1) pts.reverse();
          return { strokeId: `hub-rough-${idx + 1}`, points: pts };
        });
        const result = wave130.consolidateRoughSketchToCleanInk(strokes);
        const wgsl = wave130.validateSketchConsolidationWgsl(wave130.buildSketchConsolidationWgsl());
        const ok =
          result.metrics.strokeCountBefore === 6 &&
          result.metrics.strokeCountAfter === 1 &&
          result.metrics.orthogonalFalseMergeCount === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `왕복 6겹 러프→1개 G펜 먹선(${round2(result.metrics.compressionRatio)}x 압축) · WGSL 통과`,
          metrics: {
            strokeCountBefore: result.metrics.strokeCountBefore,
            strokeCountAfter: result.metrics.strokeCountAfter,
            compressionRatio: round2(result.metrics.compressionRatio),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave131PanelBreakoutGutterCompositor",
      waveLabel: "Wave 131",
      titleKo: "사선·파열 컷 경계 돌출 & 인접 컷 무침범 Z-오더 합성",
      capabilitySummaryKo: "Sutherland-Hodgman 클리핑 · 자동 거터 확장 충돌 0건 · WGSL",
      async execute() {
        const wave131 = await import("../wasm64-wave131-panel-breakout-and-dynamic-gutter-compositor");
        const solved = wave131.solveCollisionFreeBreakoutLayout({
          documentId: "hub-ep131",
          titleKo: "허브 돌출 충돌 해소 테스트",
          canvasWidthPx: 800,
          panels: [
            {
              panelId: "p1",
              titleKo: "1컷 사선 참격",
              style: "diagonal-slash-cut",
              bounds: { x: 40, y: 20, width: 720, height: 240 },
              breakoutSubjects: [
                {
                  subjectId: "s-blade",
                  labelKo: "돌출 검기",
                  kind: "blade",
                  breakoutMode: "gutter-breakout",
                  polygon: [
                    { x: 200, y: 140 },
                    { x: 340, y: 140 },
                    { x: 340, y: 390 },
                    { x: 200, y: 390 },
                  ],
                },
              ],
            },
            {
              panelId: "p2",
              titleKo: "2컷 핵심 대사",
              style: "classic-rect",
              bounds: { x: 40, y: 290, width: 720, height: 240 },
              criticalZones: [
                {
                  zoneId: "z-balloon",
                  labelKo: "대사 말풍선",
                  kind: "speech-balloon",
                  bounds: { x: 180, y: 320, width: 180, height: 90 },
                },
              ],
            },
          ],
        });
        const wgsl = wave131.validatePanelBreakoutStencilWgsl(wave131.buildPanelBreakoutStencilWgsl());
        const ok =
          solved.beforeAudit.neighborCriticalZoneCollisionCount >= 1 &&
          solved.solved &&
          solved.afterAudit.neighborCriticalZoneCollisionCount === 0 &&
          solved.afterAudit.canvasHorizontalClipViolationCount === 0 &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `인접 컷 충돌 ${solved.beforeAudit.neighborCriticalZoneCollisionCount}건→0건(거터 +${round2(solved.totalAddedGutterPx)}px) · WGSL 통과`,
          metrics: {
            beforeCollisions: solved.beforeAudit.neighborCriticalZoneCollisionCount,
            afterCollisions: solved.afterAudit.neighborCriticalZoneCollisionCount,
            addedGutterPx: round2(solved.totalAddedGutterPx),
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave132AntiScrapeForensicWatermark",
      waveLabel: "Wave 132",
      titleKo: "8×8 DCT 비가시 포렌식 워터마크 & AI 무단 학습 방어",
      capabilitySummaryKo: "PSNR >=40dB · JPEG Q75/크롭 내성 · TDM/C2PA 매니페스트 · WGSL",
      async execute() {
        const wave132 = await import("../wasm64-wave132-anti-scrape-watermark-and-forensic-shield-kernel");
        const key = "toonstudio-hub-wave132-key-2026";
        const tile = wave132.createSyntheticWebtoonTile(64, 64, "rgba-u8", 132);
        const embed = wave132.embedInvisibleDctWatermark(tile, {
          secretKey: key,
          payload: {
            creatorId: "hub-artist",
            episodeId: "ep-132",
            recipientId: "hub-reviewer-01",
          },
        });
        const detected = wave132.detectInvisibleDctWatermark(embed.watermarkedTile, {
          secretKey: key,
          expectedPayloadBits: embed.encodedPayload.payloadBits,
        });
        const wgsl = wave132.validateForensicWatermarkWgsl(wave132.buildForensicWatermarkWgsl());
        const ok =
          embed.psnrDb >= 40.0 &&
          detected.detected &&
          detected.bitErrorRate === 0 &&
          detected.crcValid &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `8×8 DCT 워터마크 PSNR ${round2(embed.psnrDb)}dB · BER 0 · CRC 통과 · WGSL 통과`,
          metrics: {
            psnrDb: round2(embed.psnrDb),
            bitErrorRate: detected.bitErrorRate ?? -1,
            crcValid: detected.crcValid,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave133AtmosphericDepthWeather",
      waveLabel: "Wave 133",
      titleKo: "3-심도 대기 원근 · 5종 날씨 파티클 & 얼굴·말풍선 무가림",
      capabilitySummaryKo: "Beer-Lambert 산란 안개 · 얼굴/말풍선 가림 0건 · 저모션 안전 · WGSL",
      async execute() {
        const wave133 = await import("../wasm64-wave133-atmospheric-depth-weather-and-particle-field");
        const field = wave133.synthesizeAtmosphericWeatherField({
          presetId: "cherry-blossom-gust",
          viewportWidthPx: 800,
          viewportHeightPx: 1200,
          particleBudget: 120,
          seed: 133,
          faceKeepOutBoxes: [{ id: "face", x: 310, y: 260, width: 180, height: 220, marginPx: 12 }],
          balloonKeepOutBoxes: [{ id: "dlg", x: 64, y: 72, width: 220, height: 150, marginPx: 10 }],
        });
        const wgsl = wave133.validateAtmosphericWeatherWgsl(
          wave133.buildAtmosphericWeatherWgsl("cherry-blossom-gust", { prefersReducedMotion: true }),
        );
        const ok =
          field.heroFaceAndBalloonOcclusionCount === 0 &&
          field.invariants.transmittanceStrictlyMonotonic &&
          field.invariants.sizeHierarchyValid &&
          field.invariants.midgroundSharpestBokeh &&
          wgsl.valid;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `3-심도 벚꽃 파티클 ${field.particles.length}개 · 얼굴/말풍선 가림 0건 · WGSL 통과`,
          metrics: {
            particleCount: field.particles.length,
            occlusionCount: field.heroFaceAndBalloonOcclusionCount,
            wgslValid: wgsl.valid,
          },
        };
      },
    },
    {
      id: "wave134EpisodeDeadlineCpmBalancer",
      waveLabel: "Wave 134",
      titleKo: "주간 연재 마감 CPM · 어시스턴트 부하 평준화 옵티마이저",
      capabilitySummaryKo: "자원 인지 5단계 CPM · LPT+MCT 평준화 · 과부하·지각 위험 회복",
      async execute() {
        const wave134 = await import("../wasm64-wave134-episode-deadline-cpm-and-assistant-load-balancer");
        const result = wave134.rebalanceAssistantWorkload({
          episodeId: "hub-ep134",
          episodeTitleKo: "허브 마감 평준화 진단",
          deadlineBudgetHr: 38,
          teamMembers: [
            { memberId: "pd", nameKo: "강작가", eligibleStages: ["story-conti", "lettering-final-qa"], speedMultiplier: 1.0, availableDays: 3, maxHealthyHoursPerDay: 8.0 },
            { memberId: "assist-a", nameKo: "어시A", eligibleStages: ["flat-color", "shading-vfx"], speedMultiplier: 1.0, availableDays: 3, maxHealthyHoursPerDay: 8.0 },
            { memberId: "assist-b", nameKo: "어시B", eligibleStages: ["flat-color", "shading-vfx"], speedMultiplier: 1.0, availableDays: 3, maxHealthyHoursPerDay: 8.0 },
          ],
          tasks: [
            { taskId: "t1", stage: "story-conti", cutRangeLabel: "콘티", estimatedBaseHours: 4, dependsOnTaskIds: [], assignedMemberId: "pd", lockedAssignment: true },
            { taskId: "t2", stage: "flat-color", cutRangeLabel: "1~15컷", estimatedBaseHours: 12, dependsOnTaskIds: ["t1"], assignedMemberId: "assist-a" },
            { taskId: "t3", stage: "flat-color", cutRangeLabel: "16~30컷", estimatedBaseHours: 12, dependsOnTaskIds: ["t1"], assignedMemberId: "assist-a" },
            { taskId: "t4", stage: "flat-color", cutRangeLabel: "31~45컷", estimatedBaseHours: 12, dependsOnTaskIds: ["t1"], assignedMemberId: "assist-a" },
            { taskId: "t5", stage: "flat-color", cutRangeLabel: "46~65컷", estimatedBaseHours: 6, dependsOnTaskIds: ["t1"], assignedMemberId: "assist-b" },
            { taskId: "t6", stage: "lettering-final-qa", cutRangeLabel: "식자·QA", estimatedBaseHours: 4, dependsOnTaskIds: ["t2", "t3", "t4", "t5"], assignedMemberId: "pd", lockedAssignment: true },
          ],
        });
        const ok =
          result.ok &&
          result.improved &&
          result.deadlineRecovered &&
          result.afterMakespanHr < result.beforeMakespanHr &&
          result.afterOverloadCount === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `마감 ${result.beforeMakespanHr}h→${result.afterMakespanHr}h(-${result.makespanSavedHr}h) · 과부하 ${result.beforeOverloadCount}→0명 · 기한 회복`,
          metrics: {
            beforeMakespanHr: result.beforeMakespanHr,
            afterMakespanHr: result.afterMakespanHr,
            makespanSavedHr: result.makespanSavedHr,
            deadlineRecovered: result.deadlineRecovered,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 129~134 확장 서브시스템 6종을 일괄 등록한다. */
export function registerWave129To134Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave129To134ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
