// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addRedlineStroke,
  addVoicePin,
  canApproveAfterAdReview,
  computeOklchDeltaE,
  createRedlineReviewSession,
  createSampleAdQaInput,
  resolveVoicePin,
  runAdRegulationQaSuite,
  setWipePercent,
  stepBlinkVersion,
  toggleCompareMode,
} from "./ad-regulation-qa-engine";
import {
  checkoutBinaryAssetLock,
  createInitialBinaryLockRegistry,
  createSampleManuscriptRgbaBuffer,
  embedForensicLsbWatermark,
  extractForensicLsbWatermark,
  forceReclaimBinaryAssetLock,
  issueOutsourceScopedLink,
  purgeExpiredBinaryLocks,
  releaseBinaryAssetLock,
  verifyOutsourceScopedAccess,
} from "./binary-lock-forensic-guard";
import {
  autoStitchEpisodeSlices,
  createSampleEpisodeCuts,
  issueCutSliceLease,
  partitionEpisodeIntoCutSlices,
  transitionCutSliceStatus,
} from "./cut-slice-partition-stitch";
import {
  DIVISION_ROLE_IDS,
  LAYER_AUTHORITY_MATRIX,
  STANDARD_LAYER_FOLDERS,
  evaluateLayerWriteGuard,
  resolveSeatRolesForPreset,
} from "./layer-authority-rbac";
import {
  applyReassignmentRecommendation,
  createDefaultFiveWeekMatrix,
  detectPipelineBottlenecksAndRecommendations,
  simulateStageDelayRipple,
} from "./multi-episode-pipeline-scheduler";
import {
  accrueApprovedG3Cuts,
  calculateRoyaltySettlement,
  createDefaultStudioRoyaltyContracts,
  exportSettlementLedgerToCsv,
  exportSettlementLedgerToJson,
} from "./studio-royalty-ledger";

import { ProductionProjectPage } from "../ProductionHubPage";
import { resetProductionDemoSession } from "../production-demo-adapter";
import { useI18n } from "@/shared/lib/i18n";

const BASE_ISO = "2026-11-21T12:00:00.000Z";

async function settleLazy() {
  do {
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  } while (document.querySelector('[data-route-pending="production-project"]'));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetProductionDemoSession();
});

describe("Wave 7 Division OS — 6종 핵심 엔진 단위 검증", () => {
  it("T-001: 80컷 분할·앞뒤 1컷 읽기 전용 컨텍스트·단독 Lease·무손실 합본 및 충돌/누락 차단", () => {
    const cuts = createSampleEpisodeCuts("ep-12", 80);
    expect(cuts).toHaveLength(80);

    const slices = partitionEpisodeIntoCutSlices({
      episodeId: "ep-12",
      cuts,
      strategy: "by-cut-count",
      targetSliceSize: 20,
      createdAtIso: BASE_ISO,
    });
    expect(slices).toHaveLength(4);
    expect(slices[0]?.previousCutContext).toBeNull();
    expect(slices[0]?.nextCutContext?.cutIndex).toBe(21);
    expect(slices[0]?.nextCutContext?.readOnly).toBe(true);
    expect(slices[1]?.previousCutContext?.cutIndex).toBe(20);
    expect(slices[3]?.nextCutContext).toBeNull();

    // 단독 Lease 발급 및 타인 점유 충돌 차단
    const leased = issueCutSliceLease(slices[0], {
      holderId: "artist-a",
      holderName: "박서윤",
      role: "line",
      nowIso: BASE_ISO,
      ttlMinutes: 60,
    });
    expect(leased.ok).toBe(true);
    const conflict = issueCutSliceLease(leased.slice, {
      holderId: "artist-b",
      holderName: "최도현",
      role: "line",
      nowIso: "2026-11-21T12:30:00.000Z",
      ttlMinutes: 60,
    });
    expect(conflict.ok).toBe(false);
    // 만료 후 재발급 허용
    const afterExpiry = issueCutSliceLease(leased.slice, {
      holderId: "artist-b",
      holderName: "최도현",
      role: "line",
      nowIso: "2026-11-21T13:05:00.000Z",
      ttlMinutes: 60,
    });
    expect(afterExpiry.ok).toBe(true);

    // 미승인 상태에서는 합본 Fail-Closed
    const unapprovedStitch = autoStitchEpisodeSlices({
      episodeId: "ep-12",
      expectedTotalCuts: 80,
      slices,
    });
    expect(unapprovedStitch.ok).toBe(false);
    expect(unapprovedStitch.unapprovedSliceIds).toHaveLength(4);

    // 전 슬라이스 승인 시 무손실(충돌 0, 누락 0) 합본
    const approved = slices.map((slice) =>
      transitionCutSliceStatus(slice, { type: "approve", actorId: "pd-1", nowIso: BASE_ISO }),
    );
    const stitched = autoStitchEpisodeSlices({
      episodeId: "ep-12",
      expectedTotalCuts: 80,
      slices: approved,
    });
    expect(stitched.ok).toBe(true);
    expect(stitched.collisionCount).toBe(0);
    expect(stitched.gapCount).toBe(0);
    expect(stitched.manuscript?.totalCuts).toBe(80);
    expect(stitched.manuscript?.manuscriptChecksum).toMatch(/^ms-/u);

    // 중복(충돌) 및 누락(갭) 주입 시 차단 검증
    const corrupted = [
      approved[0],
      approved[0], // 1~20컷 충돌, 21~40컷 누락
      approved[2],
      approved[3],
    ];
    const brokenStitch = autoStitchEpisodeSlices({
      episodeId: "ep-12",
      expectedTotalCuts: 80,
      slices: corrupted,
    });
    expect(brokenStitch.ok).toBe(false);
    expect(brokenStitch.collisionCount).toBe(20);
    expect(brokenStitch.gapCount).toBe(20);
  });

  it("T-002 & T-011: 9직군 × 8레이어 폴더 RBAC 매트릭스 · 슬라이스 잠금 가드 · 소규모 미니 프리셋", () => {
    expect(DIVISION_ROLE_IDS).toHaveLength(9);
    expect(STANDARD_LAYER_FOLDERS).toHaveLength(8);
    expect(LAYER_AUTHORITY_MATRIX.line["20_LINE"]).toBe("write");
    expect(LAYER_AUTHORITY_MATRIX.line["40_SHADE"]).toBe("none");
    expect(LAYER_AUTHORITY_MATRIX.pd["20_LINE"]).toBe("read");
    expect(LAYER_AUTHORITY_MATRIX.art_director["99_AD_REDLINE"]).toBe("admin");

    // 1~2인 미니 프리셋: 메인 작가는 선화·명암 쓰기 가능, 배경 파트너는 10_BG_3D만 쓰기 허용
    const leadRoles = resolveSeatRolesForPreset("solo-plus-bg", "seat-main-author");
    const bgRoles = resolveSeatRolesForPreset("solo-plus-bg", "seat-bg-partner");
    expect(
      evaluateLayerWriteGuard({ roles: leadRoles, folder: "20_LINE", operation: "write" }).allowed,
    ).toBe(true);
    expect(
      evaluateLayerWriteGuard({ roles: bgRoles, folder: "10_BG_3D", operation: "write" }).allowed,
    ).toBe(true);
    expect(
      evaluateLayerWriteGuard({ roles: bgRoles, folder: "20_LINE", operation: "write" }).allowed,
    ).toBe(false);

    // 타인 슬라이스 잠금 시 일반 직군 쓰기 차단
    const locked = evaluateLayerWriteGuard({
      roles: ["line"],
      folder: "20_LINE",
      operation: "write",
      sliceLockedByOther: true,
      lockedByHolderName: "박서윤",
    });
    expect(locked.allowed).toBe(false);
    expect(locked.blockedBySliceLock).toBe(true);
  });

  it("T-003: 5주 × 9공정 매트릭스 지연 파급 시뮬레이션 · 병목 탐지 및 인력 재배정", () => {
    const matrix = createDefaultFiveWeekMatrix("밤의 우편배달부", 12);
    expect(matrix.episodes).toHaveLength(5);
    expect(matrix.episodes[0]?.cells).toHaveLength(9);

    const ripple = simulateStageDelayRipple(matrix, {
      episodeId: "ep-13",
      stageId: "shade",
      delayHours: 24,
    });
    expect(ripple.impactedCells.length).toBeGreaterThan(3);
    expect(ripple.impactedCells.some((cell) => cell.impactKind === "dependency")).toBe(true);
    expect(ripple.impactedCells.some((cell) => cell.impactKind === "resource_contention")).toBe(true);
    expect(ripple.riskLevel).toBe("critical");

    const bottlenecks = detectPipelineBottlenecksAndRecommendations(matrix);
    expect(bottlenecks.bottlenecks.length).toBeGreaterThan(0);
    expect(bottlenecks.recommendations.length).toBeGreaterThan(0);

    const firstRec = bottlenecks.recommendations[0];
    const updated = applyReassignmentRecommendation(matrix, firstRec);
    const updatedCell = updated.episodes
      .find((ep) => ep.episodeId === firstRec.episodeId)
      ?.cells.find((cell) => cell.stageId === firstRec.stageId);
    expect(updatedCell?.assigneeId).toBe(firstRec.toMemberId);
  });

  it("T-004 & T-005: AD 5종 자동 QA(OKLCH ΔE · 선폭 CV · 무드 · 375px · NC/GPL 차단) 및 레드라인/비교", () => {
    expect(computeOklchDeltaE({ l: 0.5, c: 0.1, h: 200 }, { l: 0.5, c: 0.1, h: 200 })).toBe(0);
    expect(computeOklchDeltaE({ l: 0.4, c: 0.14, h: 20 }, { l: 0.55, c: 0.2, h: 80 })).toBeGreaterThan(7.5);

    const sampleInput = createSampleAdQaInput("ep-12");
    const report = runAdRegulationQaSuite(sampleInput);
    expect(report.checks).toHaveLength(5);
    expect(report.blockedRightsAssetIds).toEqual(["bom-brush-rain"]);
    expect(report.overallSeverity).toBe("fail");

    // NC 에셋 교체 + 정상 칩 조정 시 ALL PASS
    const cleanReport = runAdRegulationQaSuite({
      ...sampleInput,
      colorChips: sampleInput.colorChips.map((chip) => ({
        ...chip,
        sampledOklch: chip.targetOklch,
      })),
      rightsBomAssets: sampleInput.rightsBomAssets.map((asset) => ({
        ...asset,
        licenseCode: "CC0-1.0",
      })),
    });
    expect(cleanReport.failCount).toBe(0);
    expect(cleanReport.overallSeverity).toBe("pass");

    // 선폭 변동계수 초과 + 375px 최소 폰트 미달 + GPL 라이선스 차단 개별 검증
    const severeFail = runAdRegulationQaSuite({
      ...sampleInput,
      strokeWidthsPx: [1.0, 4.5, 1.2, 5.0],
      mobileCuts: [{ cutIndex: 1, manuscriptWidthPx: 800, cutHeightPx: 3100, smallestFontPx: 18 }],
      rightsBomAssets: [
        { assetId: "gpl-1", nameKo: "GPL 텍스처", nameEn: "GPL Texture", kind: "texture", licenseCode: "GPL-3.0" },
      ],
    });
    expect(severeFail.checks.find((c) => c.id === "line_weight_cv")?.severity).toBe("fail");
    expect(severeFail.checks.find((c) => c.id === "mobile_375_readability")?.severity).toBe("fail");
    expect(severeFail.checks.find((c) => c.id === "rights_bom_license")?.severity).toBe("fail");

    // 비동기 레드라인 · 음성 핀 · v1↔v2 비교 & 승인 게이트
    let session = createRedlineReviewSession("ep-12");
    expect(canApproveAfterAdReview(cleanReport, session).allowed).toBe(false);
    session = addRedlineStroke(session, {
      id: "rl-2",
      cutIndex: 52,
      authorId: "ad-1",
      colorToken: "warn",
      widthPx: 2,
      points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
      createdAtIso: BASE_ISO,
    });
    session = addVoicePin(session, {
      id: "vp-polish",
      cutIndex: 52,
      xPercent: 50,
      yPercent: 50,
      authorId: "ad-1",
      authorName: "김도영 AD",
      durationSec: 10,
      transcriptKo: "배경 톤 정리",
      transcriptEn: "Adjust BG tone",
      severity: "polish",
      status: "open",
      createdAtIso: BASE_ISO,
    });
    session = toggleCompareMode(session, "blink");
    session = stepBlinkVersion(session);
    expect(session.compare.activeBlinkVersion).toBe("v1");
    session = setWipePercent(toggleCompareMode(session, "wipe"), 75);
    expect(session.compare.wipePercent).toBe(75);
    session = resolveVoicePin(session, "vp-1");
    expect(canApproveAfterAdReview(cleanReport, session).allowed).toBe(true);
  });

  it("T-007: Studio No.9 기본(컷 단가+인세%) · 한국 CP(MG 선공제+RS%) · 3.3% 세금 · G3 적립 · CSV/JSON", () => {
    const baseContracts = createDefaultStudioRoyaltyContracts();
    const accrued = accrueApprovedG3Cuts(baseContracts, { contributorId: "c-line-1", addedG3Cuts: 10 });
    expect(accrued.find((c) => c.contributorId === "c-line-1")?.approvedG3Cuts).toBe(90);

    const no9 = calculateRoyaltySettlement({
      projectId: "sample-project",
      projectTitle: "밤의 우편배달부",
      periodLabel: "2026-11",
      mode: "studio-no9-cut-plus-royalty",
      grossPlatformRevenueKrw: 20_000_000,
      platformFeeRate: 0.35,
      contributors: accrued,
    });
    // 순매출 = 20,000,000 * 0.65 = 13,000,000
    expect(no9.netDistributableRevenueKrw).toBe(13_000_000);
    const lineArtistNo9 = no9.lines.find((line) => line.contributorId === "c-line-1");
    // 90컷 * 24,000 = 2,160,000 + 13,000,000 * 12% = 1,560,000 => 총 3,720,000
    expect(lineArtistNo9?.baseCutPayKrw).toBe(2_160_000);
    expect(lineArtistNo9?.royaltyOrRsGrossKrw).toBe(1_560_000);
    expect(lineArtistNo9?.grossPayoutKrw).toBe(3_720_000);
    expect(lineArtistNo9?.taxDeltaKrw).toBe(-Math.floor(3_720_000 * 0.033));
    expect(lineArtistNo9?.netPayoutKrw).toBe(3_720_000 - Math.floor(3_720_000 * 0.033));

    // 한국 CP 표준 (MG 선공제 + RS%)
    const cp = calculateRoyaltySettlement({
      projectId: "sample-project",
      projectTitle: "밤의 우편배달부",
      periodLabel: "2026-11",
      mode: "korean-cp-mg-rs",
      grossPlatformRevenueKrw: 20_000_000,
      platformFeeRate: 0.35,
      contributors: accrued,
    });
    const lineArtistCp = cp.lines.find((line) => line.contributorId === "c-line-1");
    // RS 25% of 13,000,000 = 3,250,000; 미상환 MG = 3,600,000 - 2,100,000 = 1,500,000 공제 => 지급 1,750,000
    expect(lineArtistCp?.baseCutPayKrw).toBe(0);
    expect(lineArtistCp?.mgRecoupedThisPeriodKrw).toBe(1_500_000);
    expect(lineArtistCp?.grossPayoutKrw).toBe(1_750_000);

    const csv = exportSettlementLedgerToCsv(no9);
    expect(csv).toContain("settlement_mode");
    expect(csv).toContain("studio-no9-cut-plus-royalty");
    expect(csv).toContain("TOTAL");

    const parsedJson = JSON.parse(exportSettlementLedgerToJson(cp)) as { mode: string };
    expect(parsedJson.mode).toBe("korean-cp-mg-rs");
  });

  it("T-008 & T-009: 바이너리 락(.clip/.psd/.blend/.skp/.vrm) · 외주 링크 · 실제 RGBA LSB 비트 인코딩/복원·변조 탐지", () => {
    let reg = createInitialBinaryLockRegistry(BASE_ISO);
    // 지원 확장자 .vrm 체크아웃 성공, 미지원 .txt 차단
    const unsupported = checkoutBinaryAssetLock(reg, {
      assetPath: "notes/readme.txt",
      holderId: "u-1",
      holderName: "작업자",
      holderRole: "line",
      nowIso: BASE_ISO,
    });
    expect(unsupported.ok).toBe(false);

    const vrmCheckout = checkoutBinaryAssetLock(reg, {
      assetPath: "ep12/10_BG_3D/haewon.vrm",
      holderId: "u-1",
      holderName: "정우진",
      holderRole: "bg3d",
      nowIso: BASE_ISO,
      ttlMinutes: 60,
    });
    expect(vrmCheckout.ok).toBe(true);
    reg = vrmCheckout.registry;

    // 일반 직군 강제 회수 차단, PD 강제 회수 허용
    expect(
      forceReclaimBinaryAssetLock(reg, {
        assetPath: "ep12/10_BG_3D/haewon.vrm",
        actorId: "u-2",
        actorRole: "line",
        reason: "임의 회수",
        nowIso: BASE_ISO,
      }).ok,
    ).toBe(false);

    const reclaimed = forceReclaimBinaryAssetLock(reg, {
      assetPath: "ep12/10_BG_3D/haewon.vrm",
      actorId: "m-pd-1",
      actorRole: "pd",
      reason: "마감 긴급 인계",
      nowIso: BASE_ISO,
    });
    expect(reclaimed.ok).toBe(true);
    expect(reclaimed.registry.locks["ep12/10_BG_3D/haewon.vrm"]).toBeUndefined();

    // 본인 해제 & 만료 정리 검증
    const released = releaseBinaryAssetLock(reclaimed.registry, {
      assetPath: "ep12/20_LINE/ep12_slice01_line.clip",
      actorId: "m-line-1",
      nowIso: BASE_ISO,
    });
    expect(released.ok).toBe(true);
    const purged = purgeExpiredBinaryLocks(released.registry, "2026-11-22T00:00:00.000Z");
    expect(Object.keys(purged.locks)).toHaveLength(0);

    // 외주 시한부 스코프 링크 검증
    const link = issueOutsourceScopedLink({
      projectId: "sample-project",
      episodeId: "ep-12",
      sliceId: "ep-12-slice-02",
      allowedFolders: ["10_BG_3D"],
      vendorId: "vendor-99",
      vendorName: "외주 배경팀",
      nowIso: BASE_ISO,
      ttlHours: 24,
    });
    expect(
      verifyOutsourceScopedAccess(link, { sliceId: "ep-12-slice-02", folder: "10_BG_3D", nowIso: BASE_ISO }).allowed,
    ).toBe(true);
    expect(
      verifyOutsourceScopedAccess(link, { sliceId: "ep-12-slice-02", folder: "20_LINE", nowIso: BASE_ISO }).allowed,
    ).toBe(false);
    expect(
      verifyOutsourceScopedAccess(link, {
        sliceId: "ep-12-slice-02",
        folder: "10_BG_3D",
        nowIso: "2026-11-23T12:00:00.000Z",
      }).allowed,
    ).toBe(false);

    // 실제 Uint8ClampedArray RGBA 비가시 LSB 포렌식 워터마크 비트 인코딩/복원 증명
    const rawRgba = createSampleManuscriptRgbaBuffer(64, 32);
    const embedded = embedForensicLsbWatermark(rawRgba, 64, 32, link.watermarkPayload);
    expect(embedded.ok).toBe(true);
    expect(embedded.watermarkedRgba).not.toBeNull();
    expect(embedded.maxChannelDelta).toBeLessThanOrEqual(1);
    expect(embedded.psnrDb).toBeGreaterThan(51);

    // 알파 채널 100% 보존 증명
    const wmRgba = embedded.watermarkedRgba as Uint8ClampedArray;
    for (let i = 3; i < wmRgba.length; i += 4) {
      expect(wmRgba[i]).toBe(rawRgba[i]);
    }

    const extracted = extractForensicLsbWatermark(wmRgba);
    expect(extracted.found).toBe(true);
    expect(extracted.verified).toBe(true);
    expect(extracted.payload).toBe(link.watermarkPayload);
    expect(extracted.crc16Hex).toBe(embedded.crc16Hex);

    // 1비트 변조 시 CRC-16 무결성 검증 실패 확인
    const tampered = new Uint8ClampedArray(wmRgba);
    tampered[64] = (tampered[64] ?? 0) ^ 1;
    const tamperedResult = extractForensicLsbWatermark(tampered);
    expect(tamperedResult.found).toBe(true);
    expect(tamperedResult.verified).toBe(false);
  });
});

describe("Wave 7 Division OS — ProductionHubPage 지연 마운트 및 4대 역할 작업대 통합 UX", () => {
  it("접힘 기본값으로 기존 ProductionProjectPage를 보존하고, 펼치면 4대 역할 전 워크플로가 인터랙티브하게 동작한다", async () => {
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
        <Routes>
          <Route
            path="/production/projects/:projectId/overview"
            element={<ProductionProjectPage surface="overview" />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await settleLazy();

    const disclosure = screen.getByTestId("studio-division-os-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-division-os-hub")).toBeNull();

    // 작업대 펼침 → 지연 로드
    await act(async () => {
      disclosure.open = true;
      fireEvent(disclosure, new Event("toggle"));
    });
    await settleLazy();

    const hub = await screen.findByTestId("studio-division-os-hub");
    expect(hub).toBeTruthy();

    // 1) PD 관제탑: 씬 분할 → 일괄 승인·무손실 합본 → +24h 지연 시뮬레이션 → 추천 재배정
    fireEvent.click(within(hub).getByRole("button", { name: "씬 기준 분할" }));
    fireEvent.click(within(hub).getByRole("button", { name: "일괄 승인 후 마스터 합본" }));
    expect(within(hub).getByTestId("divos-stitch-result").textContent).toContain("무손실 마스터 합본 완료");

    fireEvent.click(within(hub).getByRole("button", { name: "+24h 심각 지연" }));
    expect(within(hub).getByTestId("divos-delay-report").textContent).toContain("파급");

    // 2) AD 검수실: 5종 QA → NC 교체 → 블링크 비교 전환 → 블로커 핀 해결 → 최종 승인 가능
    fireEvent.click(within(hub).getByRole("tab", { name: "AD 검수실" }));
    expect(within(hub).getByTestId("divos-panel-ad")).toBeTruthy();
    fireEvent.click(within(hub).getByRole("button", { name: "AD 5종 검사 실행" }));
    fireEvent.click(within(hub).getByRole("button", { name: "NC 브러시를 CC0로 교체" }));
    fireEvent.click(within(hub).getByRole("button", { name: "블링크 비교" }));
    fireEvent.click(within(hub).getByRole("button", { name: "v1 ↔ v2 전환" }));
    fireEvent.click(within(hub).getByRole("button", { name: "핀 해결 완료" }));
    await waitFor(() =>
      expect(within(hub).getByTestId("divos-ad-gate").textContent).toContain("AD 최종 승인 가능"),
    );

    // 3) 작업자 인박스: 미니 프리셋 전환 → 8레이어 RBAC 가드 → 슬라이스 Lease → 바이너리 체크아웃
    fireEvent.click(within(hub).getByRole("button", { name: /1~2인 미니/u }));
    fireEvent.click(within(hub).getByRole("tab", { name: "작업자 인박스" }));
    expect(within(hub).getByTestId("divos-panel-worker")).toBeTruthy();
    fireEvent.change(within(hub).getByLabelText("분업 OS 작업 좌석 선택"), {
      target: { value: "seat-bg-partner" },
    });
    fireEvent.click(within(hub).getByRole("button", { name: "20_캐릭터 선화" }));
    expect(within(hub).getByTestId("divos-rbac-decision").textContent).toContain("쓰기 차단");
    fireEvent.click(within(hub).getByRole("button", { name: "10_3D 배경" }));
    expect(within(hub).getByTestId("divos-rbac-decision").textContent).toContain("쓰기 허용");
    fireEvent.click(within(hub).getAllByRole("button", { name: "체크아웃" })[0]);

    // 4) 외주·정산 데스크: 한국 CP MG/RS 전환 → G3 컷 적립 → CSV 생성 → RGBA 포렌식 워터마크 검증
    fireEvent.click(within(hub).getByRole("tab", { name: "외주·정산 데스크" }));
    expect(within(hub).getByTestId("divos-panel-outsource")).toBeTruthy();
    fireEvent.click(within(hub).getByRole("button", { name: /한국 CP 표준/u }));
    fireEvent.click(within(hub).getByRole("button", { name: "G3 승인 컷 +10 적립" }));
    fireEvent.click(within(hub).getByRole("button", { name: "CSV 정산서 생성" }));
    expect(within(hub).getByTestId("divos-settlement-export").textContent).toContain("korean-cp-mg-rs");

    fireEvent.click(within(hub).getByRole("button", { name: "RGBA 워터마크 삽입·복원 검증" }));
    expect(within(hub).getByTestId("divos-watermark-proof").textContent).toContain("CRC-16 검증 PASS");
  });

  it("영문(en) 로케일에서도 한/영 이중언어 UI가 누락 없이 렌더링된다", async () => {
    const previousLanguage = useI18n.getState().lang;
    try {
      act(() => useI18n.setState({ lang: "en" }));
      render(
        <MemoryRouter initialEntries={["/production/projects/sample-project/overview"]}>
          <Routes>
            <Route
              path="/production/projects/:projectId/overview"
              element={<ProductionProjectPage surface="overview" />}
            />
          </Routes>
        </MemoryRouter>,
      );
      await settleLazy();
      const disclosure = screen.getByTestId("studio-division-os-disclosure") as HTMLDetailsElement;
      await act(async () => {
        disclosure.open = true;
        fireEvent(disclosure, new Event("toggle"));
      });
      await settleLazy();
      const hub = await screen.findByTestId("studio-division-os-hub");
      expect(within(hub).getByText("Industrial Webtoon Division OS")).toBeTruthy();
      expect(within(hub).getByRole("tab", { name: "PD Control Tower" })).toBeTruthy();
      expect(within(hub).getByRole("tab", { name: "AD QA Room" })).toBeTruthy();
      expect(within(hub).getByRole("tab", { name: "Worker Inbox" })).toBeTruthy();
      expect(within(hub).getByRole("tab", { name: "Outsource & Royalty" })).toBeTruthy();
    } finally {
      act(() => useI18n.setState({ lang: previousLanguage }));
    }
  });
});
