import "./ecosystem-sdk-monetize.css";

import { Lock, Package, Scale, ShieldCheck, Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import {
  HybridBillingMeteringTabView,
  IpCrowdfundingLedgerTabView,
  SdkSandboxSettlementTabView,
} from "./EcosystemSdkMonetizeTabViews";
import {
  CREATOR_MARKET_REVENUE_SHARE,
  CREDIT_PACK_CATALOG,
  DEFAULT_USAGE_EVENTS,
  HYBRID_OPERATION_CATALOG,
  SAMPLE_COPYRIGHT_STAKEHOLDERS,
  SAMPLE_CROWDFUNDING_CAMPAIGN,
  SAMPLE_PLUGIN_MANIFESTS,
  SDK_HOST_VERSION,
  appendContractLedgerBlock,
  calculateMarketplaceSettlement,
  createContractLedgerGenesis,
  evaluateCrowdfundingCampaign,
  sha256Hex,
  simulateHybridBillingLedger,
  validateCopyrightSplitAndDistribute,
  validatePluginManifestSandbox,
  verifyContractHashChain,
  type BillingCycle,
  type ContractLedgerBlock,
  type CopyrightStakeholder,
  type CreditPackId,
  type CrowdfundingCampaignInput,
  type HybridOperationId,
  type IpFundingKind,
  type PluginManifestInput,
  type SdkPermissionScope,
  type SubscriptionTierId,
} from "./open-plugin-sdk-and-hybrid-billing";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type EcosystemTabId = "sdk" | "billing" | "ip-ledger";

const FIXED_LEDGER_BASE_ISO = "2026-11-21T09:00:00.000Z";

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function buildInitialUsageMap(): Record<HybridOperationId, number> {
  const initial: Record<HybridOperationId, number> = {
    "local-canvas-edit": 0,
    "local-opfs-backup": 0,
    "free-local-ai-assist": 0,
    "local-export-standard": 0,
    "cloud-fast-batch-render": 0,
    "cloud-extra-storage-10gb": 0,
    "cloud-4k-print-upscale": 0,
  };
  for (const event of DEFAULT_USAGE_EVENTS) {
    initial[event.operationId] = event.quantity;
  }
  return initial;
}

function buildInitialLedger(): readonly ContractLedgerBlock[] {
  const initialEval = evaluateCrowdfundingCampaign(SAMPLE_CROWDFUNDING_CAMPAIGN);
  const genesis = createContractLedgerGenesis({
    campaignId: SAMPLE_CROWDFUNDING_CAMPAIGN.campaignId,
    summary: "단행본·굿즈·스핀오프 1차 저작권 및 수익 분배 기준 등록",
    timestampIso: FIXED_LEDGER_BASE_ISO,
    netDistributableKrw: initialEval.netDistributableKrw,
    stakeholders: SAMPLE_COPYRIGHT_STAKEHOLDERS,
    signerIds: SAMPLE_COPYRIGHT_STAKEHOLDERS.map((party) => party.partyId),
  });
  return genesis.ok ? genesis.chain : [];
}

/**
 * 오픈 플러그인 SDK · 하이브리드 요금/₩0 크레딧 · IP 크라우드펀딩 및 해시체인 계약 원장 관제 패널.
 */
export function StudioEcosystemSdkMonetizePanel() {
  const bt = useBilingual("StudioEcosystemSdkMonetizePanel");
  const [activeTab, setActiveTab] = useState<EcosystemTabId>("sdk");

  // 1) 오픈 플러그인 SDK & 70/30 정산 상태
  const [selectedManifestId, setSelectedManifestId] = useState<string>(SAMPLE_PLUGIN_MANIFESTS[0]?.id ?? "");
  const [manifestDraft, setManifestDraft] = useState<PluginManifestInput>(
    () => SAMPLE_PLUGIN_MANIFESTS[0] ?? {
      id: "kr.atelier.tone-pack",
      name: "아틀리에 스크린톤 팩",
      authorId: "creator-1",
      authorName: "김민지 톤 공방",
      category: "material-pack",
      version: "1.0.0",
      sdkApiVersion: "^2.1.0",
      entryModule: "dist/index.mjs",
      requestedScopes: ["asset.insert", "material.publish"],
    },
  );
  const [unitPriceKrw, setUnitPriceKrw] = useState<number>(12_000);
  const [grossSalesCount, setGrossSalesCount] = useState<number>(250);
  const [refundCount, setRefundCount] = useState<number>(5);

  // 2) 구독 + 종량제 크레딧 하이브리드 미터링 상태
  const [tierId, setTierId] = useState<SubscriptionTierId>("free-starter");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [packCounts, setPackCounts] = useState<Record<CreditPackId, number>>({
    "pack-lite-100": 0,
    "pack-boost-500": 0,
    "pack-studio-2000": 0,
  });
  const [usageCounts, setUsageCounts] = useState<Record<HybridOperationId, number>>(buildInitialUsageMap);

  // 3) IP 크라우드펀딩 & 해시체인 저작권·수익 분배 계약 원장 상태
  const [campaign, setCampaign] = useState<CrowdfundingCampaignInput>(SAMPLE_CROWDFUNDING_CAMPAIGN);
  const [stakeholders, setStakeholders] = useState<readonly CopyrightStakeholder[]>(SAMPLE_COPYRIGHT_STAKEHOLDERS);
  const [canonicalChain, setCanonicalChain] = useState<readonly ContractLedgerBlock[]>(buildInitialLedger);
  const [tamperedPreview, setTamperedPreview] = useState<readonly ContractLedgerBlock[] | null>(null);
  const [ledgerNotice, setLedgerNotice] = useState<string | null>(null);

  const sandboxResult = useMemo(() => validatePluginManifestSandbox(manifestDraft), [manifestDraft]);
  const marketSettlement = useMemo(
    () =>
      calculateMarketplaceSettlement({
        pluginId: manifestDraft.id,
        unitPriceKrw,
        grossSalesCount,
        refundCount,
      }),
    [manifestDraft.id, unitPriceKrw, grossSalesCount, refundCount],
  );
  const billingLedger = useMemo(
    () =>
      simulateHybridBillingLedger({
        tierId,
        billingCycle,
        purchasedPacks: CREDIT_PACK_CATALOG.map((pack) => ({
          packId: pack.id,
          quantity: packCounts[pack.id] ?? 0,
        })),
        usageEvents: HYBRID_OPERATION_CATALOG.map((op) => ({
          operationId: op.id,
          quantity: usageCounts[op.id] ?? 0,
        })),
      }),
    [tierId, billingCycle, packCounts, usageCounts],
  );
  const fundingEval = useMemo(() => evaluateCrowdfundingCampaign(campaign), [campaign]);
  const splitEval = useMemo(
    () => validateCopyrightSplitAndDistribute(stakeholders, fundingEval.netDistributableKrw),
    [stakeholders, fundingEval.netDistributableKrw],
  );
  const activeChain = tamperedPreview ?? canonicalChain;
  const chainCheck = useMemo(() => verifyContractHashChain(activeChain), [activeChain]);
  const snapshotSignaturePreview = useMemo(
    () => sha256Hex(`${campaign.campaignId}:${fundingEval.netDistributableKrw}:${splitEval.totalShareBps}`),
    [campaign.campaignId, fundingEval.netDistributableKrw, splitEval.totalShareBps],
  );

  function handleSelectSampleManifest(sample: PluginManifestInput) {
    setSelectedManifestId(sample.id);
    setManifestDraft({ ...sample, requestedScopes: [...sample.requestedScopes] });
  }

  function handleToggleScope(scope: SdkPermissionScope) {
    setManifestDraft((prev) => {
      const exists = prev.requestedScopes.includes(scope);
      const nextScopes = exists
        ? prev.requestedScopes.filter((item) => item !== scope)
        : [...prev.requestedScopes, scope];
      return { ...prev, requestedScopes: nextScopes };
    });
  }

  function handleAdjustPack(packId: CreditPackId, delta: number) {
    setPackCounts((prev) => ({ ...prev, [packId]: Math.max(0, (prev[packId] ?? 0) + delta) }));
  }

  function handleAdjustUsage(opId: HybridOperationId, delta: number) {
    setUsageCounts((prev) => ({ ...prev, [opId]: Math.max(0, (prev[opId] ?? 0) + delta) }));
  }

  function handleIpKindChange(ipKind: IpFundingKind) {
    setCampaign((prev) => ({ ...prev, ipKind }));
  }

  function handleTierBackerChange(tierIdTarget: string, nextValue: number) {
    const safeBackers = Number.isFinite(nextValue) ? Math.max(0, Math.floor(nextValue)) : 0;
    setCampaign((prev) => ({
      ...prev,
      rewardTiers: prev.rewardTiers.map((tier) =>
        tier.id === tierIdTarget ? { ...tier, backerCount: safeBackers } : tier,
      ),
    }));
  }

  function handleStakeholderShareChange(partyId: string, nextShare: number) {
    const safeShare = Number.isFinite(nextShare) ? Math.max(0, Math.min(100, nextShare)) : 0;
    setStakeholders((prev) =>
      prev.map((party) => (party.partyId === partyId ? { ...party, sharePercent: safeShare } : party)),
    );
  }

  function handleAppendContractBlock() {
    setTamperedPreview(null);
    const nextTimestamp = `2026-11-21T${String(10 + canonicalChain.length).padStart(2, "0")}:00:00.000Z`;
    const appended = appendContractLedgerBlock(canonicalChain, {
      eventType: fundingEval.isFunded ? "payout-settlement" : "funding-milestone-lock",
      summary: fundingEval.isFunded
        ? `달성률 ${fundingEval.achievementRatePercent}% 정산 계약 확정 (${formatKrw(fundingEval.netDistributableKrw)})`
        : `진행률 ${fundingEval.achievementRatePercent}% 중간 지분 스냅샷 잠금`,
      timestampIso: nextTimestamp,
      netDistributableKrw: fundingEval.netDistributableKrw,
      stakeholders,
      signerIds: stakeholders.map((party) => party.partyId),
    });
    if (!appended.ok) {
      setLedgerNotice(appended.errors[0] ?? "계약 블록을 기록할 수 없습니다.");
      return;
    }
    setCanonicalChain(appended.chain);
    setLedgerNotice(`블록 #${appended.chain.length - 1} 서명 완료 (가스비 0원 · SHA-256 해시체인 연결).`);
  }

  function handleSimulateTamper() {
    if (canonicalChain.length === 0) return;
    const targetIndex = canonicalChain.length - 1;
    const mutated = canonicalChain.map((block, index) =>
      index === targetIndex
        ? { ...block, netDistributableKrw: block.netDistributableKrw + 5_000_000 }
        : block,
    );
    setTamperedPreview(mutated);
    setLedgerNotice(`블록 #${targetIndex}의 분배 금액을 임의 변조해 해시체인 검증기로 탐지합니다.`);
  }

  function handleRestoreChain() {
    setTamperedPreview(null);
    setLedgerNotice("서명된 원본 해시체인 원장을 복구했습니다.");
  }

  return (
    <section
      data-testid="studio-ecosystem-sdk-monetize-panel"
      aria-label={bt("오픈 생태계 SDK · 하이브리드 요금 · IP 계약 원장", "Open Ecosystem SDK, Hybrid Billing & IP Contract Ledger")}
      className="eco-sdk-shell p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-fg">
            {bt("오픈 생태계 SDK · 하이브리드 요금 · IP 계약 원장", "Open Ecosystem SDK · Hybrid Billing · IP Contract Ledger")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              `SDK 호스트 v${SDK_HOST_VERSION} · 제작자 ${Math.round(CREATOR_MARKET_REVENUE_SHARE * 100)}% 정산 · 로컬/무료 AI 0 크레딧 보장 · 가스비 0원 SHA-256 원장`,
              `SDK Host v${SDK_HOST_VERSION} · ${Math.round(CREATOR_MARKET_REVENUE_SHARE * 100)}% creator payout · 0-credit local & free AI · ₩0-gas SHA-256 ledger`,
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="eco-sdk-pill" data-tone="good">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {bt("로컬·무료 AI 0 크레딧", "Local & Free AI: 0 Credits")}
          </span>
          <span className="eco-sdk-pill" data-tone="accent">
            <Lock className="size-3.5" aria-hidden="true" />
            {bt("가스비 0원 해시체인", "₩0 Gas Hash Chain")}
          </span>
        </div>
      </header>

      <div
        role="tablist"
        aria-label={bt("생태계 및 수익화 관제 영역", "Ecosystem and monetization tabs")}
        className="eco-sdk-tablist mt-4"
      >
        <button
          id="eco-tab-sdk"
          type="button"
          role="tab"
          aria-selected={activeTab === "sdk"}
          aria-controls="eco-tabpanel-sdk"
          className="eco-sdk-tab"
          onClick={() => setActiveTab("sdk")}
        >
          <Package className="size-4 shrink-0" aria-hidden="true" />
          <span>{bt("1. 오픈 플러그인 SDK · 70/30 정산", "1. Open Plugin SDK · 70/30 Split")}</span>
        </button>
        <button
          id="eco-tab-billing"
          type="button"
          role="tab"
          aria-selected={activeTab === "billing"}
          aria-controls="eco-tabpanel-billing"
          className="eco-sdk-tab"
          onClick={() => setActiveTab("billing")}
        >
          <Wallet className="size-4 shrink-0" aria-hidden="true" />
          <span>{bt("2. 구독 + 종량제 ₩0 미터링", "2. Hybrid Plans & ₩0 Metering")}</span>
        </button>
        <button
          id="eco-tab-ip-ledger"
          type="button"
          role="tab"
          aria-selected={activeTab === "ip-ledger"}
          aria-controls="eco-tabpanel-ip-ledger"
          className="eco-sdk-tab"
          onClick={() => setActiveTab("ip-ledger")}
        >
          <Scale className="size-4 shrink-0" aria-hidden="true" />
          <span>{bt("3. IP 펀딩 · 해시체인 계약 원장", "3. IP Funding & Hash Ledger")}</span>
        </button>
      </div>

      {activeTab === "sdk" ? (
        <SdkSandboxSettlementTabView
          selectedManifestId={selectedManifestId}
          manifestDraft={manifestDraft}
          sandboxResult={sandboxResult}
          marketSettlement={marketSettlement}
          unitPriceKrw={unitPriceKrw}
          grossSalesCount={grossSalesCount}
          refundCount={refundCount}
          onSelectSampleManifest={handleSelectSampleManifest}
          onToggleScope={handleToggleScope}
          onUnitPriceChange={setUnitPriceKrw}
          onGrossSalesChange={setGrossSalesCount}
          onRefundCountChange={setRefundCount}
        />
      ) : null}

      {activeTab === "billing" ? (
        <HybridBillingMeteringTabView
          tierId={tierId}
          billingCycle={billingCycle}
          packCounts={packCounts}
          usageCounts={usageCounts}
          billingLedger={billingLedger}
          onSelectTier={setTierId}
          onSelectCycle={setBillingCycle}
          onAdjustPack={handleAdjustPack}
          onAdjustUsage={handleAdjustUsage}
        />
      ) : null}

      {activeTab === "ip-ledger" ? (
        <IpCrowdfundingLedgerTabView
          campaign={campaign}
          fundingEval={fundingEval}
          stakeholders={stakeholders}
          splitEval={splitEval}
          activeChain={activeChain}
          chainCheck={chainCheck}
          isTamperedPreview={tamperedPreview !== null}
          ledgerNotice={ledgerNotice}
          snapshotSignaturePreview={snapshotSignaturePreview}
          onIpKindChange={handleIpKindChange}
          onTierBackerChange={handleTierBackerChange}
          onStakeholderShareChange={handleStakeholderShareChange}
          onAppendContractBlock={handleAppendContractBlock}
          onSimulateTamper={handleSimulateTamper}
          onRestoreChain={handleRestoreChain}
        />
      ) : null}
    </section>
  );
}
