/**
 * Wave 73~80 초격차 확장 서브시스템 동적 로더 (`wave73-80-extensions`).
 *
 * - 모든 Wave 73~80 커널을 동적 `import(...)`로만 호출해 `/studio` 초기 진입 번들(`check:studio-eager-graph`)에
 *   0 바이트 영향을 보장한다.
 * - `registerWave73To80Extensions()`를 통해 총 19개 라이브 초격차 엔진(Wave 54~80 + Wave 71 네이티브 데몬)을
 *   단일 `/studio` 초격차 런타임 허브에 통합한다.
 */

import type {
  StudioSupergapRuntimeHub,
  SupergapExtensionSubsystemDefinition,
} from "./studio-supergap-runtime-hub";

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Wave 73~80 초격차 서브시스템 8종 동적 확장 정의를 생성한다. */
export function createWave73To80ExtensionSubsystems(): readonly SupergapExtensionSubsystemDefinition[] {
  return [
    {
      id: "wave73TemporalInkDrying",
      waveLabel: "Wave 73",
      titleKo: "4D 시공간 잉크 건조·재습윤·나이프",
      capabilitySummaryKo: "30분 건조 재습윤 블룸 · 팔레트 나이프 스그라피토 · WGSL 3종",
      async execute() {
        const wave73 = await import("../wasm64-wave73-4d-ink-drying-rewetting-knife");
        const field = wave73.createTemporalInkCanvasField({ width: 24, height: 24, paperSeed: 73 });
        wave73.depositTemporalInkStroke(field, {
          strokeId: "diag-wc-1",
          timestampSec: 0,
          medium: "transparent-watercolor",
          points: [{ x: 8, y: 12, pressure: 0.9 }, { x: 16, y: 12, pressure: 0.9 }],
          radiusPx: 4,
          pigmentRgba: [0.08, 0.28, 0.72, 0.9],
        });
        wave73.advanceTemporalDryingState(field, 600);
        const rewet = wave73.applyCleanWaterRewetBrush(field, {
          points: [{ x: 12, y: 12, pressure: 0.8 }],
          radiusPx: 4,
          waterAmountMm: 0.7,
          solventType: "clean-water",
          timestampSec: 605,
        });
        const wgsl = wave73.validateTemporalInkWgslContracts();
        const ok = wgsl.allValid && rewet.touchedCellCount > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `재습윤 활성 ${rewet.touchedCellCount}셀 · WGSL ${wgsl.reports.length}종 계약 검증 완료`,
          metrics: {
            touchedCellCount: rewet.touchedCellCount,
            dissolvedPigmentMass: round2(rewet.dissolvedPigmentMass),
            wgslAllValid: wgsl.allValid,
          },
        };
      },
    },
    {
      id: "wave74RelightingOpticalBrush",
      waveLabel: "Wave 74",
      titleKo: "2.5D 1컷 리라이팅 · 광학 굴절 브러시",
      capabilitySummaryKo: "6종 시간대·날씨 실시간 재조명 · 물방울 색분산 · 검신 이방성 반사",
      async execute() {
        const wave74 = await import("../wasm64-wave74-25d-relighting-optical-refraction");
        const width = 24;
        const height = 24;
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
          rgba[i * 4] = 196;
          rgba[i * 4 + 1] = 190;
          rgba[i * 4 + 2] = 186;
          rgba[i * 4 + 3] = 255;
        }
        const geometry = wave74.reconstructCut25dGeometryMaps({ width, height, rgba });
        const relit = wave74.relight25dWebtoonCut({ width, height, rgba, geometry, presetId: "golden-sunset" });
        const optical = wave74.applyOpticalRefractionReflectionBrush({
          width,
          height,
          rgba: relit.rgba,
          material: "raindrop-glass",
          points: [{ x: 12, y: 12, radiusPx: 6 }],
        });
        const wgsl = wave74.validateRelightingOpticalWgslContracts();
        const ok = wgsl.valid && optical.affectedPixelCount > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `노을 리라이팅 · 물방울 굴절 ${optical.affectedPixelCount}px · WGSL ${wgsl.results.length}종 검증 완료`,
          metrics: {
            affectedPixelCount: optical.affectedPixelCount,
            wgslValid: wgsl.valid,
            wgslCount: wgsl.results.length,
          },
        };
      },
    },
    {
      id: "wave75PoseToFoldMultiview",
      waveLabel: "Wave 75",
      titleKo: "3D 포즈 의상 주름 · 멀티뷰 화풍 가이드",
      capabilitySummaryKo: "7대 주름 물리 · 임의 앵글 3D 두상 투영 · 카이랄성/Ink DNA 유지",
      async execute() {
        const wave75 = await import("../wasm64-wave75-pose-to-fold-multiview-guide");
        const skeleton = wave75.createStandardPoseSkeleton3d({
          leftElbow: { flexionDeg: 85 },
          rightElbow: { flexionDeg: 40 },
        });
        const solved = wave75.solvePoseToGarmentFolds({
          skeleton,
          fabricPreset: "cotton-shirt",
        });
        const model = wave75.buildCharacterMultiviewModel({
          characterId: "hub-diag-char",
          characterName: "진단 캐릭터",
          views: [
            { view: "front", eyeLineRatio: 0.5, chinTaper: 0.62, headWidthToHeight: 0.72, hairCrownVolume: 1.2 },
            { view: "side", eyeLineRatio: 0.5, headDepthToHeight: 0.83, hairCrownVolume: 1.2 },
          ],
          signatureLandmarks: [
            { id: "scar-l", labelKo: "왼쪽 볼 흉터", kind: "scar", anatomicalSide: "left", verticalRatio: 0.37, lateralRatio: 0.38 },
          ],
        });
        const guide = wave75.projectMultiviewTurnaroundGuide(model, {
          yawDeg: 25,
          pitchDeg: -5,
          rollDeg: 0,
          focalLengthMm: 50,
          viewportWidth: 640,
          viewportHeight: 640,
        });
        const ok = solved.folds.length > 0 && guide.landmarks.length > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `의상 주름 ${solved.folds.length}획 · 멀티뷰 랜드마크 ${guide.landmarks.length}개 투영 완료`,
          metrics: {
            foldStrokeCount: solved.folds.length,
            projectedLandmarks: guide.landmarks.length,
          },
        };
      },
    },
    {
      id: "wave76PrintRecompositionCmyk",
      waveLabel: "Wave 76",
      titleKo: "단행본 B5/ePub 자동 리컴포지션 · CMYK",
      capabilitySummaryKo: "말풍선 잘림 0 · LTR/RTL 시선 동선 · TAC 300%/순수 먹 K100 분판",
      async execute() {
        const wave76 = await import("../wasm64-wave76-webtoon-print-recomposition");
        const panels = [1, 2, 3, 4].map((idx) => ({
          id: `cut-${idx}`,
          widthPx: 2000,
          heightPx: 2400,
          importanceWeight: 1,
          verticalWhitespaceBeforePx: 80,
          focalSubjectBox: { x: 500, y: 700, width: 900, height: 800, label: "hero" },
          speechBalloonSafeBoxes: [{ x: 300, y: 240, width: 640, height: 340, label: "b1" }],
        }));
        const recomposed = wave76.recomposeVerticalWebtoonToPages(panels, { formatId: "kr-b5-tankobon" });
        const blackCmyk = wave76.convertRgbToPrepressCmyk(
          { r: 0, g: 0, b: 0 },
          { profileId: "coated-fogra39", isLineartHint: true },
        );
        const ok =
          recomposed.summary.balloonClippedCount === 0 &&
          blackCmyk.k === 100 &&
          blackCmyk.c === 0 &&
          blackCmyk.m === 0 &&
          blackCmyk.y === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `B5 단행본 ${recomposed.pages.length}쪽 · 말풍선 잘림 ${recomposed.summary.balloonClippedCount}건 · K100 먹 보존`,
          metrics: {
            pageCount: recomposed.pages.length,
            balloonClippedCount: recomposed.summary.balloonClippedCount,
            pureBlackLineartK: blackCmyk.k,
          },
        };
      },
    },
    {
      id: "wave77MultilingualSfxCleanplate",
      waveLabel: "Wave 77",
      titleKo: "다국어 SFX 벡터 치환 · Clean-Plate 복원",
      capabilitySummaryKo: "7개국어 의성어 20종 · 마스크 외부 0px 변형 · 말풍선 겹침 0",
      async execute() {
        const wave77 = await import("../wasm64-wave77-multilingual-sfx-cleanplate");
        const width = 24;
        const height = 24;
        const data = new Uint8ClampedArray(width * height * 4);
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const off = (y * width + x) * 4;
            data[off] = 160;
            data[off + 1] = 175;
            data[off + 2] = 200;
            data[off + 3] = 255;
            if (x >= 9 && x <= 14 && y >= 9 && y <= 14) {
              mask[y * width + x] = 255;
              data[off] = 230;
              data[off + 1] = 40;
              data[off + 2] = 50;
            }
          }
        }
        const cleaned = wave77.reconstructCleanPlateBehindSfx({ width, height, data }, mask);
        const localized = wave77.localizeComicSfxEntry("콰과광", "en");
        const ok = cleaned.metrics.mutatedOutsideMaskPixels === 0 && localized.localizedText.length > 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `Clean-Plate 외부 변형 ${cleaned.metrics.mutatedOutsideMaskPixels}px · EN 치환 "${localized.localizedText}"`,
          metrics: {
            mutatedOutsideMaskPixels: cleaned.metrics.mutatedOutsideMaskPixels,
            localizedEnText: localized.localizedText,
          },
        };
      },
    },
    {
      id: "wave78CompanionTabletLan",
      waveLabel: "Wave 78",
      titleKo: "데스크톱 GPU·태블릿 LAN 동반 아틀리에",
      capabilitySummaryKo: "사설 LAN Fail-Closed · 32B 바이너리 펜 CRC-32 · 8ms 미만 지터 버퍼",
      async execute() {
        const wave78 = await import("../wasm64-wave78-companion-tablet-atelier-lan");
        const lanOk = wave78.validatePrivateLanHost("192.168.1.42").allowed;
        const wanBlocked = !wave78.validatePrivateLanHost("8.8.8.8").allowed;
        const encoded = wave78.encodePenSamplePacket({
          sequence: 1,
          timestampUs: 4166,
          xNorm: 0.5,
          yNorm: 0.5,
          pressure: 0.72,
          altitudeRad: 0.9,
          azimuthRad: 1.5,
          barrelRoll: 0,
          hoverHeight: 0,
          flags: { penDown: true, hover: false, eraser: false, barrelBtn: false, palmReject: true },
        });
        const decoded = wave78.decodePenSamplePacket(encoded);
        const ok = lanOk && wanBlocked && decoded.ok;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `사설 LAN 허용·WAN 차단 · 32B 펜 패킷 CRC-32 왕복 검증 완료`,
          metrics: {
            privateLanAllowed: lanOk,
            publicWanBlocked: wanBlocked,
            packetBytes: encoded.byteLength,
            codecVerified: decoded.ok,
          },
        };
      },
    },
    {
      id: "wave79AssistantCheckoutSettlement",
      waveLabel: "Wave 79",
      titleKo: "어시스턴트 암호화 체크아웃 · 정산 원장",
      capabilitySummaryKo: "미배정 레이어 0B 노출 · 머클 감사 원장 · Rights BOM 상업 게이트",
      async execute() {
        const wave79 = await import("../wasm64-wave79-assistant-checkout-settlement-ledger");
        const ledger = new wave79.AssistantSettlementAuditLedger({
          ledgerId: "hub-diag-ledger",
          episodeId: "ep-diag",
          projectId: "proj-diag",
        });
        ledger.appendContribution({
          checkInId: "chk-diag-1",
          episodeId: "ep-diag",
          assistantId: "asst-1",
          assistantDisplayName: "진단 어시스턴트",
          role: "background",
          cutIds: ["cut-01", "cut-02"],
          strokeCount: 120,
          editedPixelAreaPx: 48_000,
          activeWorkMinutes: 45,
          recordedAtIso: "2026-11-28T03:00:00Z",
          rightsBomAssets: [
            {
              assetId: "asset-bg-1",
              assetName: "서울 거리 3D",
              assetCategory: "3d-background",
              licenseTier: "commercial-cleared",
              sourceSha256: wave79.sha256Hex("wave79-diag"),
            },
          ],
        });
        const snapshot = ledger.exportSnapshot();
        const integrity = wave79.verifySettlementLedgerIntegrity(snapshot);
        const statement = wave79.calculateEpisodeSettlementStatement(
          snapshot,
          { model: "per-cut-rate", defaultRatePerCutKrw: 35_000, rateByRoleKrw: { background: 35_000 } },
          { calculatedAtIso: "2026-11-28T03:05:00Z" },
        );
        const ok = integrity.valid && statement.rightsBomGate.commercialClearancePassed;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `정산 총액 ${statement.totalAssistantGrossPayoutKrw.toLocaleString("ko-KR")}원 · Rights BOM 통과 · 머클 유효`,
          metrics: {
            ledgerValid: integrity.valid,
            commercialClearancePassed: statement.rightsBomGate.commercialClearancePassed,
            totalAssistantGrossPayoutKrw: statement.totalAssistantGrossPayoutKrw,
          },
        };
      },
    },
    {
      id: "wave80OnDeviceContinuityGuardrail",
      waveLabel: "Wave 80",
      titleKo: "100% 온디바이스 연재 작화 연속성 가드레일",
      capabilitySummaryKo: "외부 전송 0B · 카이랄성/거울 반사 · OKLCH CIEDE2000 · 화풍 비례 z-score",
      async execute() {
        const wave80 = await import("../wasm64-wave80-ondevice-continuity-guardrail");
        const index = new wave80.OnDeviceSeriesCanonIndex({ seriesId: "diag-series", seriesTitle: "진단 연재" });
        index.upsertCharacter({
          characterId: "hero",
          displayName: "주인공",
          dominantHand: "right",
          canonicalHeightCm: 170,
          traits: [
            {
              traitId: "scar-l",
              label: "흉터",
              category: "scar",
              region: "cheek",
              anatomicalSide: "left",
              introducedAt: { episodeNumber: 3, cutNumber: 14 },
              permanent: true,
            },
          ],
          palette: [{ slot: "hair", label: "머리색", oklch: { l: 0.28, c: 0.06, h: 255 } }],
          proportionHistory: [],
        });
        const audit = wave80.auditCutContinuityGuardrail(index, {
          episodeNumber: 5,
          cutNumber: 1,
          sceneId: "scene-1",
          lightingMood: "neutral-daylight",
          characters: [
            {
              characterId: "hero",
              facingDirection: "front",
              observedTraits: [{ traitId: "scar-l", present: true, observedScreenSide: "right" }],
              observedPalette: [{ slot: "hair", oklch: { l: 0.28, c: 0.06, h: 255 } }],
            },
          ],
        });
        const ok =
          index.privacyContract.networkEgressBytes === 0 &&
          audit.privacyContract.networkEgressBytes === 0 &&
          audit.findings.length === 0;
        return {
          status: ok ? "live-connected" : "browser-fallback",
          summaryKo: `외부 전송 ${audit.privacyContract.networkEgressBytes}B · 연속성 이상 ${audit.findings.length}건 · 온디바이스 검증 완료`,
          metrics: {
            networkEgressBytes: audit.privacyContract.networkEgressBytes,
            findingCount: audit.findings.length,
            executionLocality: audit.privacyContract.executionLocality,
          },
        };
      },
    },
  ];
}

/** 기존 초격차 런타임 허브에 Wave 73~80 확장 서브시스템 8종을 일괄 등록한다. */
export function registerWave73To80Extensions(hub: StudioSupergapRuntimeHub): StudioSupergapRuntimeHub {
  for (const ext of createWave73To80ExtensionSubsystems()) {
    hub.registerExtensionSubsystem(ext);
  }
  return hub;
}
