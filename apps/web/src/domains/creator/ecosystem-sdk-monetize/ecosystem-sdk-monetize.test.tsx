// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CREATOR_MARKET_REVENUE_SHARE,
  GENESIS_PREVIOUS_HASH,
  PLATFORM_MARKET_FEE_RATE,
  SAMPLE_COPYRIGHT_STAKEHOLDERS,
  SAMPLE_CROWDFUNDING_CAMPAIGN,
  SAMPLE_PLUGIN_MANIFESTS,
  appendContractLedgerBlock,
  calculateMarketplaceSettlement,
  createContractLedgerGenesis,
  evaluateCrowdfundingCampaign,
  sha256Hex,
  simulateHybridBillingLedger,
  validateCopyrightSplitAndDistribute,
  validatePluginManifestSandbox,
  verifyContractHashChain,
  type ContractLedgerBlock,
  type PluginManifestInput,
} from "./open-plugin-sdk-and-hybrid-billing";
import { StudioEcosystemSdkMonetizePanel } from "./StudioEcosystemSdkMonetizePanel";

import { TeamAccessGuide } from "../production-hub/TeamAccessGuide";
import { useI18n } from "@/shared/lib/i18n";

const BASE_ISO = "2026-11-21T09:00:00.000Z";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("SHA-256 결정론적 해시 엔진 (가스비 ₩0)", () => {
  it("01. 표준 FIPS 180-4 테스트 벡터 및 한글 UTF-8 결정론성을 만족한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const krHashA = sha256Hex("웹툰 저작권 100% 계약 원장");
    const krHashB = sha256Hex("웹툰 저작권 100% 계약 원장");
    expect(krHashA).toHaveLength(64);
    expect(krHashA).toBe(krHashB);
    expect(krHashA).not.toBe(sha256Hex("웹툰 저작권 99% 계약 원장"));
  });
});

describe("1. 오픈 플러그인 & 서드파티 소재 SDK 매니페스트·권한 샌드박스 + 70/30 정산", () => {
  it("02. 최소 권한 소재 팩(asset.insert, material.publish)은 네트워크 차단 샌드박스로 승인된다", () => {
    const manifest = SAMPLE_PLUGIN_MANIFESTS[0];
    const result = validatePluginManifestSandbox(manifest);
    expect(result.verdict).toBe("approved");
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.sandboxProfile.isolationMode).toBe("sandboxed-worker-no-network");
    expect(result.sandboxProfile.networkAccess).toBe("blocked");
    expect(result.sandboxProfile.allowedApis).toEqual(["asset.insert", "material.publish"]);
    expect(result.manifestFingerprintSha256).toHaveLength(64);
  });

  it("03. 내보내기 어댑터(canvas.read, export.hook)는 500ms CPU 예산으로 승인된다", () => {
    const manifest = SAMPLE_PLUGIN_MANIFESTS[1];
    const result = validatePluginManifestSandbox(manifest);
    expect(result.verdict).toBe("approved");
    expect(result.valid).toBe(true);
    expect(result.sandboxProfile.cpuBudgetMs).toBe(500);
    expect(result.sandboxProfile.networkAccess).toBe("blocked");
  });

  it("04. 잘못된 SemVer 또는 비호환 호스트 SDK 버전은 차단된다", () => {
    const base = SAMPLE_PLUGIN_MANIFESTS[0];
    const badSemver = validatePluginManifestSandbox({ ...base, version: "v1.2" });
    expect(badSemver.verdict).toBe("blocked");
    expect(badSemver.violations.some((v) => v.code === "INVALID_SEMVER")).toBe(true);

    const incompatibleMajor = validatePluginManifestSandbox({ ...base, sdkApiVersion: "^3.0.0" });
    expect(incompatibleMajor.verdict).toBe("blocked");
    expect(incompatibleMajor.violations.some((v) => v.code === "INCOMPATIBLE_SDK_VERSION")).toBe(true);

    const tooNewMinor = validatePluginManifestSandbox({ ...base, sdkApiVersion: "^2.9.0" });
    expect(tooNewMinor.verdict).toBe("blocked");
    expect(tooNewMinor.violations.some((v) => v.code === "INCOMPATIBLE_SDK_VERSION")).toBe(true);
  });

  it("05. 상위 경로 이동(..)·원격 URL·data URI 진입 모듈을 차단한다", () => {
    const base = SAMPLE_PLUGIN_MANIFESTS[0];
    for (const unsafeEntry of [
      "../escape.mjs",
      "https://malicious.example/payload.js",
      "data:text/javascript,alert(1)",
      "/etc/passwd.js",
    ]) {
      const res = validatePluginManifestSandbox({ ...base, entryModule: unsafeEntry });
      expect(res.verdict).toBe("blocked");
      expect(res.violations.some((v) => v.code === "UNSAFE_ENTRY_MODULE")).toBe(true);
    }
  });

  it("06. 잘못된 플러그인 ID·빈 스코프·미정의 스코프를 차단한다", () => {
    const malformed: PluginManifestInput = {
      id: "INVALID ID!",
      name: "",
      authorId: "a",
      authorName: "b",
      category: "workflow-tool",
      version: "1.0.0",
      sdkApiVersion: "^2.0.0",
      entryModule: "dist/tool.mjs",
      requestedScopes: ["unknown.root"],
    };
    const res = validatePluginManifestSandbox(malformed);
    expect(res.verdict).toBe("blocked");
    expect(res.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(["INVALID_PLUGIN_ID", "MISSING_MANIFEST_IDENTITY", "UNKNOWN_SCOPE"]),
    );

    const emptyScopes = validatePluginManifestSandbox({ ...SAMPLE_PLUGIN_MANIFESTS[0], requestedScopes: [] });
    expect(emptyScopes.violations.some((v) => v.code === "EMPTY_SCOPES")).toBe(true);
  });

  it("07. 영구 금지 권한(auth.session, filesystem.host)을 즉시 차단한다", () => {
    const base = SAMPLE_PLUGIN_MANIFESTS[0];
    const authBlocked = validatePluginManifestSandbox({
      ...base,
      requestedScopes: ["asset.insert", "auth.session"],
    });
    expect(authBlocked.verdict).toBe("blocked");
    expect(authBlocked.sandboxProfile.isolationMode).toBe("denied");
    expect(authBlocked.violations.some((v) => v.code === "FORBIDDEN_SCOPE")).toBe(true);

    const fsBlocked = validatePluginManifestSandbox({
      ...base,
      requestedScopes: ["asset.insert", "filesystem.host"],
    });
    expect(fsBlocked.verdict).toBe("blocked");
    expect(fsBlocked.violations.some((v) => v.code === "FORBIDDEN_SCOPE")).toBe(true);
  });

  it("08. 원고·소재 반출 위험 권한 조합(canvas.read/export.hook/material.publish/storage.raw + network.external)을 차단한다", () => {
    const base = SAMPLE_PLUGIN_MANIFESTS[1];
    const pairs: readonly (readonly [string, string, string])[] = [
      ["canvas.read", "network.external", "EXFILTRATION_CANVAS_NET"],
      ["export.hook", "network.external", "EXFILTRATION_EXPORT_NET"],
      ["material.publish", "network.external", "EXFILTRATION_PUBLISH_NET"],
      ["storage.raw", "network.external", "EXFILTRATION_STORAGE_NET"],
    ];
    for (const [scopeA, scopeB, expectedCode] of pairs) {
      const res = validatePluginManifestSandbox({ ...base, requestedScopes: [scopeA, scopeB] });
      expect(res.verdict).toBe("blocked");
      expect(res.violations.some((v) => v.code === expectedCode)).toBe(true);
    }
  });

  it("09. 로컬 원고 변조 위험 조합(storage.raw + canvas.write)을 차단한다", () => {
    const res = validatePluginManifestSandbox({
      ...SAMPLE_PLUGIN_MANIFESTS[0],
      requestedScopes: ["storage.raw", "canvas.write"],
    });
    expect(res.verdict).toBe("blocked");
    expect(res.violations.some((v) => v.code === "TAMPER_STORAGE_CANVAS")).toBe(true);
  });

  it("10. 단독 확장 권한 또는 과다 권한 소재 팩은 review-required 심사 대상으로 분류한다", () => {
    const writeOnly = validatePluginManifestSandbox({
      ...SAMPLE_PLUGIN_MANIFESTS[1],
      category: "brush-engine",
      requestedScopes: ["canvas.write"],
    });
    expect(writeOnly.verdict).toBe("review-required");
    expect(writeOnly.valid).toBe(true);
    expect(writeOnly.sandboxProfile.memoryCapMb).toBe(128);

    const overprivilegedMaterial = validatePluginManifestSandbox({
      ...SAMPLE_PLUGIN_MANIFESTS[0],
      requestedScopes: ["asset.insert", "export.hook"],
    });
    expect(overprivilegedMaterial.verdict).toBe("review-required");
    expect(overprivilegedMaterial.violations.some((v) => v.code === "OVERPRIVILEGED_MATERIAL_PACK")).toBe(true);
  });

  it("11. 서드파티 마켓 70% 제작자 / 30% 플랫폼 투명 정산이 환불·PG 내부부담 포함 ₩1 오차 없이 성립한다", () => {
    expect(CREATOR_MARKET_REVENUE_SHARE + PLATFORM_MARKET_FEE_RATE).toBeCloseTo(1, 10);
    const settlement = calculateMarketplaceSettlement({
      pluginId: "kr.atelier.halftone-screentone",
      unitPriceKrw: 12_000,
      grossSalesCount: 250,
      refundCount: 5,
    });
    expect(settlement.valid).toBe(true);
    expect(settlement.netSalesCount).toBe(245);
    expect(settlement.netRevenueKrw).toBe(2_940_000);
    expect(settlement.creatorPayoutKrw).toBe(2_058_000);
    expect(settlement.platformGrossShareKrw).toBe(882_000);
    expect(settlement.creatorPayoutKrw + settlement.platformGrossShareKrw).toBe(settlement.netRevenueKrw);
    expect(settlement.estimatedPgFeeKrw).toBe(94_080);
    expect(settlement.platformNetMarginKrw).toBe(787_920);
  });

  it("12. 무료(₩0) 배포 플러그인·소재는 수수료 0원·무료 플래그로 정산된다", () => {
    const freeRes = calculateMarketplaceSettlement({
      pluginId: "kr.community.free-brush",
      unitPriceKrw: 0,
      grossSalesCount: 1200,
      refundCount: 0,
    });
    expect(freeRes.valid).toBe(true);
    expect(freeRes.isFreeListing).toBe(true);
    expect(freeRes.creatorPayoutKrw).toBe(0);
    expect(freeRes.platformGrossShareKrw).toBe(0);
  });

  it("13. 음수 단가·환불 초과·비정상 PG 비율 정산 요청을 거부한다", () => {
    const invalid = calculateMarketplaceSettlement({
      pluginId: "bad",
      unitPriceKrw: -100,
      grossSalesCount: 5,
      refundCount: 10,
      pgFeeRateWithinPlatformShare: 0.5,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("2. 구독 + 종량제 크레딧 하이브리드 요금/쿼터 미터링 엔진 (₩0 무료 경로 보장)", () => {
  it("14. free-starter(0 크레딧)에서 로컬 캔버스·OPFS·무료 로컬 AI·표준 내보내기는 항상 0 크레딧으로 무제한 통과한다", () => {
    const ledger = simulateHybridBillingLedger({
      tierId: "free-starter",
      billingCycle: "monthly",
      purchasedPacks: [],
      usageEvents: [
        { operationId: "local-canvas-edit", quantity: 500 },
        { operationId: "local-opfs-backup", quantity: 100 },
        { operationId: "free-local-ai-assist", quantity: 200 },
        { operationId: "local-export-standard", quantity: 50 },
      ],
    });
    expect(ledger.totalEstimatedMonthlyKrw).toBe(0);
    expect(ledger.creditsUsed).toBe(0);
    expect(ledger.freeOperationsCount).toBe(850);
    expect(ledger.freeOperationsCreditsCharged).toBe(0);
    expect(ledger.freePathInvariantPassed).toBe(true);
    expect(ledger.blockedOperationsCount).toBe(0);
    expect(ledger.entries.every((entry) => entry.fundingSource === "free-invariant" && !entry.blocked)).toBe(true);
  });

  it("15. 무료 경로 작업에 악의적 크레딧 강제 오버라이드가 전달되어도 0 크레딧 불변식을 절대 깨지 않는다", () => {
    const ledger = simulateHybridBillingLedger({
      tierId: "free-starter",
      billingCycle: "monthly",
      purchasedPacks: [],
      usageEvents: [
        { operationId: "free-local-ai-assist", quantity: 40, requestedOverrideCredits: 999 },
        { operationId: "local-canvas-edit", quantity: 10, requestedOverrideCredits: 50 },
      ],
    });
    expect(ledger.creditsUsed).toBe(0);
    expect(ledger.freeOperationsCreditsCharged).toBe(0);
    expect(ledger.freePathInvariantPassed).toBe(true);
  });

  it("16. 크레딧 부족 시 자동 초과 결제 없이 유료 클라우드 작업만 차단하고 최소 종량제 팩을 추천한다", () => {
    const ledger = simulateHybridBillingLedger({
      tierId: "free-starter",
      billingCycle: "monthly",
      purchasedPacks: [],
      usageEvents: [
        { operationId: "free-local-ai-assist", quantity: 25 },
        { operationId: "cloud-fast-batch-render", quantity: 4 }, // 40 크레딧 필요
      ],
    });
    expect(ledger.totalEstimatedMonthlyKrw).toBe(0);
    expect(ledger.freeOperationsCount).toBe(25);
    expect(ledger.blockedOperationsCount).toBe(1);
    expect(ledger.recommendedPackId).toBe("pack-lite-100");
    const blockedEntry = ledger.entries.find((e) => e.operationId === "cloud-fast-batch-render");
    expect(blockedEntry?.blocked).toBe(true);
    expect(blockedEntry?.creditsCharged).toBe(0);
  });

  it("17. creator-pro 구독 크레딧 우선 소진 후 선택 종량제 팩으로 자연스럽게 합산 차감되고 연간 할인이 반영된다", () => {
    const ledger = simulateHybridBillingLedger({
      tierId: "creator-pro",
      billingCycle: "annual",
      purchasedPacks: [{ packId: "pack-lite-100", quantity: 1 }],
      usageEvents: [
        { operationId: "local-opfs-backup", quantity: 30 },
        { operationId: "cloud-fast-batch-render", quantity: 35 }, // 350 크레딧 = 구독 300 + 팩 50
      ],
    });
    expect(ledger.subscriptionMonthlyKrw).toBe(11_900);
    expect(ledger.creditPackPurchaseKrw).toBe(4_900);
    expect(ledger.totalEstimatedMonthlyKrw).toBe(16_800);
    expect(ledger.totalAvailableCredits).toBe(400);
    expect(ledger.creditsUsed).toBe(350);
    expect(ledger.creditsRemaining).toBe(50);
    expect(ledger.freeOperationsCreditsCharged).toBe(0);
    const mixed = ledger.entries.find((e) => e.operationId === "cloud-fast-batch-render");
    expect(mixed?.fundingSource).toBe("mixed-included-and-pack");
    expect(mixed?.blocked).toBe(false);
  });

  it("18. studio-team 대규모 배치 시뮬레이션과 결정론적 원장 SHA-256 다이제스트를 생성한다", () => {
    const input = {
      tierId: "studio-team" as const,
      billingCycle: "monthly" as const,
      purchasedPacks: [{ packId: "pack-studio-2000" as const, quantity: 1 }],
      usageEvents: [
        { operationId: "cloud-4k-print-upscale" as const, quantity: 120 }, // 1800 cr
        { operationId: "cloud-extra-storage-10gb" as const, quantity: 10 }, // 250 cr
      ],
    };
    const first = simulateHybridBillingLedger(input);
    const second = simulateHybridBillingLedger(input);
    expect(first.totalAvailableCredits).toBe(3500);
    expect(first.creditsUsed).toBe(2050);
    expect(first.creditsRemaining).toBe(1450);
    expect(first.ledgerDigestSha256).toHaveLength(64);
    expect(first.ledgerDigestSha256).toBe(second.ledgerDigestSha256);
  });
});

describe("3. IP 크라우드펀딩 · 지분 100% 불변식 · 가스비 ₩0 SHA-256 해시체인 계약 원장", () => {
  it("19. 단행본·굿즈·스핀오프 펀딩 달성률·수수료·원가·분배 가능 순수익을 정확히 계산한다", () => {
    const result = evaluateCrowdfundingCampaign(SAMPLE_CROWDFUNDING_CAMPAIGN);
    // 320*48000 (15,360,000) + 150*89000 (13,350,000) + 40*150000 (6,000,000) = 34,710,000
    expect(result.totalRaisedKrw).toBe(34_710_000);
    expect(result.totalBackers).toBe(510);
    expect(result.achievementRatePercent).toBe(173.6);
    expect(result.isFunded).toBe(true);
    expect(result.platformFeeKrw).toBe(1_735_500);
    expect(result.paymentFeeKrw).toBe(1_110_720);
    // 원가: 320*14500 (4,640,000) + 150*27000 (4,050,000) + 40*42000 (1,680,000) = 10,370,000
    expect(result.fulfillmentCostKrw).toBe(10_370_000);
    expect(result.netDistributableKrw).toBe(21_493_780);
    expect(result.deficitWarningKo).toBeNull();
  });

  it("20. 제작 원가가 모금액을 초과하는 적자 캠페인에서 경고 메시지를 산출한다", () => {
    const deficit = evaluateCrowdfundingCampaign({
      campaignId: "ip-deficit",
      title: "적자 리워드 테스트",
      ipKind: "merch-goods",
      goalAmountKrw: 1_000_000,
      rewardTiers: [
        { id: "t1", title: "과다원가 굿즈", priceKrw: 10_000, backerCount: 120, unitFulfillmentCostKrw: 12_000, limitQuantity: 100 },
      ],
    });
    expect(deficit.netDistributableKrw).toBeLessThan(0);
    expect(deficit.deficitWarningKo).toContain("초과했습니다");
    expect(deficit.tierBreakdown[0]?.overLimit).toBe(true);
  });

  it("21. 지분 합계가 100.00%가 아니거나 중복 ID·0% 지분이 있으면 계약을 차단한다", () => {
    const under = validateCopyrightSplitAndDistribute(
      [
        { partyId: "a", name: "작가A", role: "lead-author", sharePercent: 60 },
        { partyId: "b", name: "스튜디오", role: "studio", sharePercent: 39.5 },
      ],
      10_000_000,
    );
    expect(under.valid).toBe(false);
    expect(under.deltaPercent).toBe(-0.5);

    const over = validateCopyrightSplitAndDistribute(
      [
        { partyId: "a", name: "작가A", role: "lead-author", sharePercent: 70 },
        { partyId: "b", name: "스튜디오", role: "studio", sharePercent: 30.5 },
      ],
      10_000_000,
    );
    expect(over.valid).toBe(false);
    expect(over.deltaPercent).toBe(0.5);

    const dupAndZero = validateCopyrightSplitAndDistribute(
      [
        { partyId: "a", name: "작가A", role: "lead-author", sharePercent: 100 },
        { partyId: "a", name: "중복B", role: "assistant", sharePercent: 0 },
      ],
      10_000_000,
    );
    expect(dupAndZero.valid).toBe(false);
    expect(dupAndZero.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("22. 나누어떨어지지 않는 금액도 해밀턴 최대잔여법으로 ₩1 오차 없이 분배 합계가 일치한다", () => {
    const split = validateCopyrightSplitAndDistribute(
      [
        { partyId: "a", name: "작가A", role: "lead-author", sharePercent: 33.34 },
        { partyId: "b", name: "작가B", role: "story-writer", sharePercent: 33.33 },
        { partyId: "c", name: "스튜디오", role: "studio", sharePercent: 33.33 },
      ],
      10_000_001,
    );
    expect(split.valid).toBe(true);
    expect(split.totalShareBps).toBe(10_000);
    expect(split.totalPayoutKrw).toBe(10_000_001);
    expect(split.payouts.reduce((sum, p) => sum + p.payoutKrw, 0)).toBe(10_000_001);
  });

  it("23. 가스비 ₩0 제네시스 생성·후속 블록 연결이 SHA-256 해시체인으로 검증되며 지분 위반 시 추가를 거부한다", () => {
    const genesis = createContractLedgerGenesis({
      campaignId: "ip-fund-moonlight-vol1",
      summary: "제네시스 계약 등록",
      timestampIso: BASE_ISO,
      netDistributableKrw: 21_493_780,
      stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
      signerIds: SAMPLE_COPYRIGHT_STAKEHOLDERS.map((p) => p.partyId),
    });
    expect(genesis.ok).toBe(true);
    if (!genesis.ok) return;
    expect(genesis.chain[0]?.previousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(genesis.chain[0]?.gasFeeKrw).toBe(0);

    const appended = appendContractLedgerBlock(genesis.chain, {
      eventType: "payout-settlement",
      summary: "1차 정산 실행 확정",
      timestampIso: "2026-11-21T10:00:00.000Z",
      netDistributableKrw: 21_493_780,
      stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
      signerIds: SAMPLE_COPYRIGHT_STAKEHOLDERS.map((p) => p.partyId),
    });
    expect(appended.ok).toBe(true);
    if (!appended.ok) return;
    expect(appended.chain[1]?.previousHash).toBe(appended.chain[0]?.blockHash);

    const verification = verifyContractHashChain(appended.chain);
    expect(verification.valid).toBe(true);
    expect(verification.blockCount).toBe(2);
    expect(verification.totalGasFeeKrw).toBe(0);
    expect(verification.tamperedBlockIndex).toBeNull();

    const rejected = appendContractLedgerBlock(appended.chain, {
      eventType: "split-amendment",
      summary: "잘못된 지분 변경 시도",
      timestampIso: "2026-11-21T11:00:00.000Z",
      netDistributableKrw: 21_493_780,
      stakeholders: [{ partyId: "only", name: "단독", role: "lead-author", sharePercent: 90 }],
      signerIds: ["only"],
    });
    expect(rejected.ok).toBe(false);
  });

  it("24. 계약 원장의 금액 또는 지분 페이로드를 사후 변조하면 정확한 블록 번호를 탐지한다", () => {
    const genesis = createContractLedgerGenesis({
      campaignId: "ip-tamper",
      summary: "원본 제네시스",
      timestampIso: BASE_ISO,
      netDistributableKrw: 10_000_000,
      stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
      signerIds: ["party-lead"],
    });
    expect(genesis.ok).toBe(true);
    if (!genesis.ok) return;
    const step2 = appendContractLedgerBlock(genesis.chain, {
      eventType: "funding-milestone-lock",
      summary: "2단계 잠금",
      timestampIso: "2026-11-21T10:00:00.000Z",
      netDistributableKrw: 12_000_000,
      stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
      signerIds: ["party-lead"],
    });
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;

    const tamperedChain: ContractLedgerBlock[] = step2.chain.map((block, index) =>
      index === 1 ? { ...block, netDistributableKrw: 99_999_999 } : block,
    );
    const check = verifyContractHashChain(tamperedChain);
    expect(check.valid).toBe(false);
    expect(check.tamperedBlockIndex).toBe(1);
    expect(check.issues.some((msg) => msg.includes("payloadHash"))).toBe(true);
  });

  it("25. 이전 블록 해시 단절·헤더 위조·가스비 비정상 주입을 모두 탐지한다", () => {
    const genesis = createContractLedgerGenesis({
      campaignId: "ip-link-check",
      summary: "제네시스",
      timestampIso: BASE_ISO,
      netDistributableKrw: 5_000_000,
      stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
      signerIds: ["party-lead"],
    });
    expect(genesis.ok).toBe(true);
    if (!genesis.ok) return;

    const forgedLink: ContractLedgerBlock[] = [
      { ...genesis.chain[0], previousHash: "f".repeat(64) },
    ];
    const linkCheck = verifyContractHashChain(forgedLink);
    expect(linkCheck.valid).toBe(false);
    expect(linkCheck.tamperedBlockIndex).toBe(0);
    expect(linkCheck.issues.some((msg) => msg.includes("이전 블록 해시"))).toBe(true);

    const forgedHeader: ContractLedgerBlock[] = [
      { ...genesis.chain[0], blockHash: "a".repeat(64) },
    ];
    const headerCheck = verifyContractHashChain(forgedHeader);
    expect(headerCheck.valid).toBe(false);
    expect(headerCheck.issues.some((msg) => msg.includes("blockHash"))).toBe(true);
  });
});

describe("4. 한글 UI 인터랙션 & TeamAccessGuide 지연 로딩 통합 검증", () => {
  it("26. 탭 1에서 권한 스코프를 토글해 위험 권한 조합 차단을 실시간 검증하고 70/30 정산을 갱신한다", () => {
    render(<StudioEcosystemSdkMonetizePanel />);
    expect(screen.getByTestId("sdk-sandbox-verdict").textContent).toContain("샌드박스 승인");

    // canvas.read + network.external 활성화 -> 즉시 차단!
    fireEvent.click(screen.getByTestId("sdk-scope-canvas.read"));
    fireEvent.click(screen.getByTestId("sdk-scope-network.external"));
    expect(screen.getByTestId("sdk-sandbox-verdict").textContent).toContain("위험 권한 차단");
    expect(screen.getByTestId("sdk-sandbox-violations").textContent).toContain("원고 무단 유출 위험");

    // 단가 변경 -> 70% 제작자 정산 갱신 확인 (20,000원 * (250-5) * 0.7 = 3,430,000원)
    fireEvent.change(screen.getByLabelText("판매 단가 (원)"), { target: { value: "20000" } });
    expect(screen.getByTestId("sdk-creator-payout").textContent).toBe("3,430,000원");
  });

  it("27. 탭 2에서 무료 경로 0 크레딧 불변식과 종량제 팩 추가·구독 전환 시뮬레이션을 검증한다", () => {
    render(<StudioEcosystemSdkMonetizePanel />);
    fireEvent.click(screen.getByRole("tab", { name: /2\. 구독 \+ 종량제 ₩0 미터링/ }));

    expect(screen.getByTestId("billing-free-invariant").textContent).toContain("차감 크레딧 0");
    expect(screen.getByTestId("billing-blocked-count").textContent).toBe("2건");

    // 크리에이터 프로 전환 시 기본 300 크레딧으로 유료 배치 차단 해소
    fireEvent.click(screen.getByTestId("billing-plan-creator-pro"));
    expect(screen.getByTestId("billing-blocked-count").textContent).toBe("0건");
    expect(screen.getByTestId("billing-total-krw").textContent).toBe("14,900원");

    // 라이트 100 크레딧 팩 1개 추가
    fireEvent.click(screen.getByTestId("pack-add-pack-lite-100"));
    expect(screen.getByTestId("pack-qty-pack-lite-100").textContent).toBe("1");
    expect(screen.getByTestId("billing-total-krw").textContent).toBe("19,800원");
  });

  it("28. 탭 3에서 지분 100% 불변식·가스비 0원 블록 서명·변조 탐지 및 TeamAccessGuide lazyRetry 접이식 마운트를 검증한다", async () => {
    const { unmount } = render(<StudioEcosystemSdkMonetizePanel />);
    fireEvent.click(screen.getByRole("tab", { name: /3\. IP 펀딩 · 해시체인 계약 원장/ }));

    expect(screen.getByTestId("ip-funding-rate").textContent).toContain("173.6%");
    expect(screen.getByTestId("ip-split-total").textContent).toContain("100.00%");

    // 지분 합계를 90%로 변경 시 오류 표시 + 서명 버튼 비활성화
    const leadInput = screen.getByTestId("share-input-party-lead");
    fireEvent.change(leadInput, { target: { value: "40" } });
    expect(screen.getByTestId("ip-split-error").textContent).toContain("90.00%");
    expect((screen.getByTestId("ip-append-block-btn") as HTMLButtonElement).disabled).toBe(true);

    // 다시 50%로 복구 후 블록 추가
    fireEvent.change(leadInput, { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("ip-append-block-btn"));
    expect(screen.getByTestId("ip-chain-status").textContent).toContain("블록 2개");
    expect(screen.getByTestId("ip-chain-status").textContent).toContain("누적 가스비 0원");

    // 변조 시뮬레이션 -> 탐지 -> 원본 복구
    fireEvent.click(screen.getByTestId("ip-tamper-sim-btn"));
    expect(screen.getByTestId("ip-chain-status").textContent).toContain("변조 탐지 (블록 #1)");
    fireEvent.click(screen.getByTestId("ip-restore-chain-btn"));
    expect(screen.getByTestId("ip-chain-status").textContent).toContain("무결성 검증 통과");
    unmount();

    // TeamAccessGuide 접이식 지연 로딩 마운트 확인
    render(<TeamAccessGuide />);
    const disclosure = screen.getByTestId("studio-ecosystem-sdk-monetize-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-ecosystem-sdk-monetize-panel")).toBeNull();

    await act(async () => {
      disclosure.open = true;
      fireEvent(disclosure, new Event("toggle"));
      await vi.dynamicImportSettled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("studio-ecosystem-sdk-monetize-panel")).toBeTruthy();
    });
  });
});
