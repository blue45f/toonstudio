import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  FileCheck2,
  Layers,
  Link2,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  CREATOR_MARKET_REVENUE_SHARE,
  CREDIT_PACK_CATALOG,
  GENESIS_PREVIOUS_HASH,
  HYBRID_OPERATION_CATALOG,
  PLATFORM_MARKET_FEE_RATE,
  SAMPLE_PLUGIN_MANIFESTS,
  SDK_SCOPE_DEFINITIONS,
  SUBSCRIPTION_PLANS,
  type BillingCycle,
  type ContractChainVerificationResult,
  type ContractLedgerBlock,
  type CopyrightSplitValidationResult,
  type CopyrightStakeholder,
  type CreditPackId,
  type CrowdfundingCampaignInput,
  type CrowdfundingEvaluationResult,
  type HybridBillingLedger,
  type HybridOperationId,
  type IpFundingKind,
  type MarketplaceSettlementResult,
  type PluginManifestInput,
  type SdkPermissionScope,
  type SdkSandboxValidationResult,
  type SubscriptionTierId,
} from "./open-plugin-sdk-and-hybrid-billing";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

function formatKrw(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

export interface SdkSandboxSettlementTabViewProps {
  readonly selectedManifestId: string;
  readonly manifestDraft: PluginManifestInput;
  readonly sandboxResult: SdkSandboxValidationResult;
  readonly marketSettlement: MarketplaceSettlementResult;
  readonly unitPriceKrw: number;
  readonly grossSalesCount: number;
  readonly refundCount: number;
  readonly onSelectSampleManifest: (sample: PluginManifestInput) => void;
  readonly onToggleScope: (scope: SdkPermissionScope) => void;
  readonly onUnitPriceChange: (value: number) => void;
  readonly onGrossSalesChange: (value: number) => void;
  readonly onRefundCountChange: (value: number) => void;
}

export function SdkSandboxSettlementTabView({
  selectedManifestId,
  manifestDraft,
  sandboxResult,
  marketSettlement,
  unitPriceKrw,
  grossSalesCount,
  refundCount,
  onSelectSampleManifest,
  onToggleScope,
  onUnitPriceChange,
  onGrossSalesChange,
  onRefundCountChange,
}: SdkSandboxSettlementTabViewProps) {
  const bt = useBilingual("StudioEcosystemSdkMonetizePanel");
  const verdictTone =
    sandboxResult.verdict === "approved"
      ? "good"
      : sandboxResult.verdict === "review-required"
        ? "warn"
        : "bad";

  return (
    <div id="eco-tabpanel-sdk" role="tabpanel" aria-labelledby="eco-tab-sdk" className="mt-4 space-y-4">
      <div className="eco-sdk-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-fg">
            {bt("플러그인·소재 매니페스트 프리셋", "Plugin & Material Manifest Presets")}
          </h4>
          <span className="eco-sdk-pill" data-tone={verdictTone} data-testid="sdk-sandbox-verdict">
            {sandboxResult.verdict === "approved"
              ? bt("샌드박스 승인", "Sandbox Approved")
              : sandboxResult.verdict === "review-required"
                ? bt("확장 권한 심사 필요", "Review Required")
                : bt("위험 권한 차단", "Blocked by Sandbox")}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_PLUGIN_MANIFESTS.map((sample) => (
            <button
              key={sample.id}
              type="button"
              aria-pressed={selectedManifestId === sample.id}
              className="eco-sdk-btn"
              onClick={() => onSelectSampleManifest(sample)}
            >
              {sample.name}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="text-xs text-fg-3">{bt("패키지 ID · 버전", "Package ID & SemVer")}</span>
            <p className="mt-1 text-xs font-semibold text-fg eco-sdk-num">
              {manifestDraft.id}@{manifestDraft.version}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="text-xs text-fg-3">{bt("격리 실행 모드", "Isolation Mode")}</span>
            <p className="mt-1 text-xs font-semibold text-fg">{sandboxResult.sandboxProfile.isolationMode}</p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="text-xs text-fg-3">{bt("메모리·CPU 상한", "Memory & CPU Budget")}</span>
            <p className="mt-1 text-xs font-semibold text-fg eco-sdk-num">
              {sandboxResult.sandboxProfile.memoryCapMb} MB · {sandboxResult.sandboxProfile.cpuBudgetMs} ms
            </p>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <span className="text-xs text-fg-3">{bt("매니페스트 지문 (SHA-256)", "Manifest SHA-256")}</span>
            <p className="mt-1 text-fg eco-sdk-hash">{shortHash(sandboxResult.manifestFingerprintSha256)}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-fg-2">
            {bt("최소 권한 스코프 토글 (위험 조합 선택 시 즉시 차단 검증)", "Toggle least-privilege scopes (dangerous combinations are blocked immediately)")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SDK_SCOPE_DEFINITIONS.map((scope) => {
              const active = manifestDraft.requestedScopes.includes(scope.id);
              return (
                <button
                  key={scope.id}
                  type="button"
                  data-testid={`sdk-scope-${scope.id}`}
                  data-risk={scope.riskLevel}
                  aria-pressed={active}
                  className="eco-sdk-chip-btn"
                  onClick={() => onToggleScope(scope.id)}
                  title={scope.descriptionKo}
                >
                  <span>{scope.labelKo}</span>
                  <span className="text-xs text-fg-3">({scope.id})</span>
                </button>
              );
            })}
          </div>
        </div>

        {sandboxResult.violations.length > 0 ? (
          <ul className="mt-4 space-y-2" data-testid="sdk-sandbox-violations">
            {sandboxResult.violations.map((violation) => (
              <li
                key={`${violation.code}-${violation.scopes.join(",")}`}
                className="eco-sdk-banner flex items-start gap-2 text-xs leading-5"
                data-tone={violation.severity === "error" ? "bad" : "warn"}
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{violation.messageKo}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="eco-sdk-banner mt-4 flex items-center gap-2 text-xs" data-tone="good">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {bt(
                "최소 권한 샌드박스 검사 통과: 네트워크 차단 워커에서 안전하게 실행할 수 있습니다.",
                "Passed least-privilege sandbox audit: safe for network-isolated worker execution.",
              )}
            </span>
          </div>
        )}
      </div>

      <div className="eco-sdk-card">
        <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
          <Coins className="size-4 text-accent" aria-hidden="true" />
          {bt(
            `서드파티 소재·플러그인 투명 마켓 정산 (제작자 ${Math.round(CREATOR_MARKET_REVENUE_SHARE * 100)}% / 플랫폼 ${Math.round(PLATFORM_MARKET_FEE_RATE * 100)}%)`,
            `Transparent Marketplace Settlement (Creator ${Math.round(CREATOR_MARKET_REVENUE_SHARE * 100)}% / Platform ${Math.round(PLATFORM_MARKET_FEE_RATE * 100)}%)`,
          )}
        </h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="eco-unit-price" className="block text-xs font-semibold text-fg-2">
              {bt("판매 단가 (원)", "Unit price (KRW)")}
            </label>
            <input
              id="eco-unit-price"
              type="number"
              min={0}
              step={1000}
              value={unitPriceKrw}
              onChange={(event) => onUnitPriceChange(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
              className="eco-sdk-input mt-1"
            />
          </div>
          <div>
            <label htmlFor="eco-gross-sales" className="block text-xs font-semibold text-fg-2">
              {bt("총 판매 건수", "Gross sales count")}
            </label>
            <input
              id="eco-gross-sales"
              type="number"
              min={0}
              step={10}
              value={grossSalesCount}
              onChange={(event) => onGrossSalesChange(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
              className="eco-sdk-input mt-1"
            />
          </div>
          <div>
            <label htmlFor="eco-refund-count" className="block text-xs font-semibold text-fg-2">
              {bt("환불 건수", "Refund count")}
            </label>
            <input
              id="eco-refund-count"
              type="number"
              min={0}
              step={1}
              value={refundCount}
              onChange={(event) => onRefundCountChange(Math.max(0, Number.parseInt(event.target.value || "0", 10)))}
              className="eco-sdk-input mt-1"
            />
          </div>
        </div>

        {marketSettlement.valid ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="sdk-market-settlement">
            <div className="rounded-xl border border-line bg-canvas p-3">
              <dt className="text-xs text-fg-3">{bt("순매출 (환불 제외)", "Net revenue")}</dt>
              <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num">{formatKrw(marketSettlement.netRevenueKrw)}</dd>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3">
              <dt className="text-xs text-fg-3">{bt("제작자 정산액 (70%)", "Creator payout (70%)")}</dt>
              <dd className="mt-1 text-sm font-bold text-good eco-sdk-num" data-testid="sdk-creator-payout">
                {formatKrw(marketSettlement.creatorPayoutKrw)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3">
              <dt className="text-xs text-fg-3">{bt("플러그인 플랫폼 몫 (30%)", "Platform share (30%)")}</dt>
              <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num">
                {formatKrw(marketSettlement.platformGrossShareKrw)}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-canvas p-3">
              <dt className="text-xs text-fg-3">{bt("내부 부담 PG 추정(3.2%)", "PG fee inside platform 30%")}</dt>
              <dd className="mt-1 text-sm font-bold text-fg-2 eco-sdk-num">
                {formatKrw(marketSettlement.estimatedPgFeeKrw)}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="eco-sdk-banner mt-3 text-xs" data-tone="bad">
            {marketSettlement.errors.join(" ")}
          </div>
        )}
      </div>
    </div>
  );
}

export interface HybridBillingMeteringTabViewProps {
  readonly tierId: SubscriptionTierId;
  readonly billingCycle: BillingCycle;
  readonly packCounts: Readonly<Record<CreditPackId, number>>;
  readonly usageCounts: Readonly<Record<HybridOperationId, number>>;
  readonly billingLedger: HybridBillingLedger;
  readonly onSelectTier: (tierId: SubscriptionTierId) => void;
  readonly onSelectCycle: (cycle: BillingCycle) => void;
  readonly onAdjustPack: (packId: CreditPackId, delta: number) => void;
  readonly onAdjustUsage: (opId: HybridOperationId, delta: number) => void;
}

export function HybridBillingMeteringTabView({
  tierId,
  billingCycle,
  packCounts,
  usageCounts,
  billingLedger,
  onSelectTier,
  onSelectCycle,
  onAdjustPack,
  onAdjustUsage,
}: HybridBillingMeteringTabViewProps) {
  const bt = useBilingual("StudioEcosystemSdkMonetizePanel");

  return (
    <div id="eco-tabpanel-billing" role="tabpanel" aria-labelledby="eco-tab-billing" className="mt-4 space-y-4">
      <div
        className="eco-sdk-banner flex flex-wrap items-center justify-between gap-2 text-xs"
        data-tone="good"
        data-testid="billing-free-invariant"
      >
        <span className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          {bt(
            `₩0 무료 경로 불변식 통과: 로컬 작업·무료 AI ${billingLedger.freeOperationsCount}회 실행 · 차감 크레딧 ${billingLedger.freeOperationsCreditsCharged}`,
            `₩0 Free-Path Invariant Verified: ${billingLedger.freeOperationsCount} local/free-AI runs · ${billingLedger.freeOperationsCreditsCharged} credits used`,
          )}
        </span>
        <span className="eco-sdk-hash text-fg-2">{shortHash(billingLedger.ledgerDigestSha256)}</span>
      </div>

      <div className="eco-sdk-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-fg">{bt("구독 티어 및 결제 주기 선택", "Subscription Tier & Billing Cycle")}</h4>
          <div className="flex gap-2">
            <button
              type="button"
              className="eco-sdk-btn"
              aria-pressed={billingCycle === "monthly"}
              onClick={() => onSelectCycle("monthly")}
            >
              {bt("월간 기준", "Monthly")}
            </button>
            <button
              type="button"
              className="eco-sdk-btn"
              aria-pressed={billingCycle === "annual"}
              onClick={() => onSelectCycle("annual")}
            >
              {bt("연간 할인 (20%)", "Annual (-20%)")}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const selected = tierId === plan.id;
            const displayPrice = billingCycle === "annual" ? plan.annualMonthlyEquivalentKrw : plan.monthlyPriceKrw;
            return (
              <button
                key={plan.id}
                type="button"
                data-testid={`billing-plan-${plan.id}`}
                aria-pressed={selected}
                className="eco-sdk-btn flex-col items-start justify-between p-4 text-left"
                onClick={() => onSelectTier(plan.id)}
              >
                <span className="text-sm font-bold text-fg">{plan.nameKo}</span>
                <span className="mt-1 text-base font-bold text-accent eco-sdk-num">
                  {displayPrice === 0 ? bt("₩0 영구 무료", "₩0 Free Forever") : `${formatKrw(displayPrice)} / 월`}
                </span>
                <span className="mt-1 text-xs font-normal leading-5 text-fg-2">{plan.summaryKo}</span>
                <span className="mt-2 text-xs text-fg-3 eco-sdk-num">
                  {bt(
                    `포함 크레딧 ${plan.includedMonthlyCredits.toLocaleString("ko-KR")} · 클라우드 ${plan.cloudStorageGb}GB`,
                    `${plan.includedMonthlyCredits} credits · ${plan.cloudStorageGb}GB cloud`,
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="eco-sdk-card">
          <h4 className="text-sm font-bold text-fg">{bt("선택형 종량제 크레딧 팩", "Optional Pay-As-You-Go Credit Packs")}</h4>
          <p className="mt-1 text-xs text-fg-2">
            {bt("고속 클라우드 배치·추가 스토리지가 필요할 때만 충전합니다. 초과 자동 결제는 없습니다.", "Top up only when you want fast cloud batching or extra storage. No hidden overages.")}
          </p>
          <ul className="mt-3 space-y-2">
            {CREDIT_PACK_CATALOG.map((pack) => {
              const qty = packCounts[pack.id] ?? 0;
              return (
                <li key={pack.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fg">{pack.nameKo}</p>
                    <p className="text-xs text-fg-3 eco-sdk-num">
                      {pack.credits.toLocaleString("ko-KR")} 크레딧 · {formatKrw(pack.priceKrw)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`${pack.nameKo} 수량 감소`}
                      className="eco-sdk-btn"
                      onClick={() => onAdjustPack(pack.id, -1)}
                      disabled={qty <= 0}
                    >
                      -
                    </button>
                    <span className="min-w-6 text-center text-xs font-bold eco-sdk-num" data-testid={`pack-qty-${pack.id}`}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      data-testid={`pack-add-${pack.id}`}
                      aria-label={`${pack.nameKo} 수량 증가`}
                      className="eco-sdk-btn"
                      onClick={() => onAdjustPack(pack.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="eco-sdk-card">
          <h4 className="text-sm font-bold text-fg">{bt("월간 작업량 시뮬레이션", "Monthly Workload Simulator")}</h4>
          <ul className="mt-3 space-y-2">
            {HYBRID_OPERATION_CATALOG.map((op) => {
              const count = usageCounts[op.id] ?? 0;
              return (
                <li key={op.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-fg">{op.labelKo}</p>
                    <p className="text-xs text-fg-3 eco-sdk-num">
                      {op.guaranteedZeroCredit ? bt("₩0 영구 무료 (0 크레딧)", "₩0 Always Free (0 cr)") : `${op.unitCredits} 크레딧 / 회`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`${op.labelKo} 횟수 감소`}
                      className="eco-sdk-btn"
                      onClick={() => onAdjustUsage(op.id, -1)}
                      disabled={count <= 0}
                    >
                      -
                    </button>
                    <span className="min-w-8 text-center text-xs font-bold eco-sdk-num">{count}</span>
                    <button
                      type="button"
                      data-testid={`op-add-${op.id}`}
                      aria-label={`${op.labelKo} 횟수 증가`}
                      className="eco-sdk-btn"
                      onClick={() => onAdjustUsage(op.id, 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="eco-sdk-card">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("월 예상 합계", "Estimated monthly total")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num" data-testid="billing-total-krw">
              {formatKrw(billingLedger.totalEstimatedMonthlyKrw)}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("크레딧 소비 / 가용", "Credits used / available")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num" data-testid="billing-credits-summary">
              {billingLedger.creditsUsed} / {billingLedger.totalAvailableCredits}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("잔여 크레딧", "Remaining credits")}</dt>
            <dd className="mt-1 text-sm font-bold text-good eco-sdk-num">{billingLedger.creditsRemaining}</dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("잔여 부족 차단 항목", "Blocked paid items")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num" data-testid="billing-blocked-count">
              {billingLedger.blockedOperationsCount}건
            </dd>
          </div>
        </dl>

        <div className="eco-sdk-table-wrap mt-4">
          <table className="eco-sdk-table">
            <thead>
              <tr>
                <th>{bt("작업 항목", "Operation")}</th>
                <th>{bt("횟수", "Count")}</th>
                <th>{bt("차감 크레딧", "Credits")}</th>
                <th>{bt("원장 판정", "Ledger note")}</th>
              </tr>
            </thead>
            <tbody>
              {billingLedger.entries.map((entry) => (
                <tr key={entry.operationId}>
                  <td className="font-semibold text-fg">{entry.labelKo}</td>
                  <td className="eco-sdk-num">{entry.quantity}</td>
                  <td className="eco-sdk-num font-bold">{entry.creditsCharged}</td>
                  <td className={entry.blocked ? "text-bad" : "text-fg-2"}>{entry.noteKo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export interface IpCrowdfundingLedgerTabViewProps {
  readonly campaign: CrowdfundingCampaignInput;
  readonly fundingEval: CrowdfundingEvaluationResult;
  readonly stakeholders: readonly CopyrightStakeholder[];
  readonly splitEval: CopyrightSplitValidationResult;
  readonly activeChain: readonly ContractLedgerBlock[];
  readonly chainCheck: ContractChainVerificationResult;
  readonly isTamperedPreview: boolean;
  readonly ledgerNotice: string | null;
  readonly snapshotSignaturePreview: string;
  readonly onIpKindChange: (kind: IpFundingKind) => void;
  readonly onTierBackerChange: (tierId: string, value: number) => void;
  readonly onStakeholderShareChange: (partyId: string, share: number) => void;
  readonly onAppendContractBlock: () => void;
  readonly onSimulateTamper: () => void;
  readonly onRestoreChain: () => void;
}

export function IpCrowdfundingLedgerTabView({
  campaign,
  fundingEval,
  stakeholders,
  splitEval,
  activeChain,
  chainCheck,
  isTamperedPreview,
  ledgerNotice,
  snapshotSignaturePreview,
  onIpKindChange,
  onTierBackerChange,
  onStakeholderShareChange,
  onAppendContractBlock,
  onSimulateTamper,
  onRestoreChain,
}: IpCrowdfundingLedgerTabViewProps) {
  const bt = useBilingual("StudioEcosystemSdkMonetizePanel");

  return (
    <div id="eco-tabpanel-ip-ledger" role="tabpanel" aria-labelledby="eco-tab-ip-ledger" className="mt-4 space-y-4">
      <div className="eco-sdk-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
            <Layers className="size-4 text-accent" aria-hidden="true" />
            {bt("IP 크라우드펀딩 캠페인 정산 시뮬레이션", "IP Crowdfunding Campaign Settlement")}
          </h4>
          <span className="eco-sdk-pill" data-tone={fundingEval.isFunded ? "good" : "warn"} data-testid="ip-funding-rate">
            {bt(`달성률 ${fundingEval.achievementRatePercent}%`, `${fundingEval.achievementRatePercent}% Funded`)}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["print-edition", "단행본 출간"],
              ["merch-goods", "공식 굿즈"],
              ["spinoff-episode", "스핀오프 외전"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="eco-sdk-btn"
              aria-pressed={campaign.ipKind === kind}
              onClick={() => onIpKindChange(kind)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className="flex justify-between text-xs text-fg-2 eco-sdk-num">
            <span>{bt("총 모금액", "Total raised")}: {formatKrw(fundingEval.totalRaisedKrw)}</span>
            <span>{bt("목표액", "Goal")}: {formatKrw(fundingEval.goalAmountKrw)}</span>
          </div>
          <div className="eco-sdk-progress-track mt-1.5">
            <div
              className="eco-sdk-progress-bar"
              style={{ width: `${Math.min(100, fundingEval.achievementRatePercent)}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {campaign.rewardTiers.map((tier) => (
            <div key={tier.id} className="rounded-xl border border-line bg-canvas p-3">
              <label htmlFor={`tier-backers-${tier.id}`} className="block text-xs font-bold text-fg">
                {tier.title}
              </label>
              <p className="mt-1 text-xs text-fg-3 eco-sdk-num">
                {formatKrw(tier.priceKrw)} · 원가 {formatKrw(tier.unitFulfillmentCostKrw)}
              </p>
              <input
                id={`tier-backers-${tier.id}`}
                type="number"
                min={0}
                step={5}
                value={tier.backerCount}
                onChange={(event) => onTierBackerChange(tier.id, Number.parseInt(event.target.value || "0", 10))}
                className="eco-sdk-input mt-2"
              />
            </div>
          ))}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("후원자 합계", "Total backers")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num">{fundingEval.totalBackers}명</dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("플랫폼+결제 수수료", "Platform & PG fees")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num">
              {formatKrw(fundingEval.platformFeeKrw + fundingEval.paymentFeeKrw)}
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("제작·배송 원가", "Fulfillment cost")}</dt>
            <dd className="mt-1 text-sm font-bold text-fg eco-sdk-num">{formatKrw(fundingEval.fulfillmentCostKrw)}</dd>
          </div>
          <div className="rounded-xl border border-line bg-canvas p-3">
            <dt className="text-xs text-fg-3">{bt("최종 분배 가능 순수익", "Net distributable")}</dt>
            <dd className="mt-1 text-sm font-bold text-good eco-sdk-num" data-testid="ip-net-distributable">
              {formatKrw(fundingEval.netDistributableKrw)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="eco-sdk-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-sm font-bold text-fg">
            <FileCheck2 className="size-4 text-accent" aria-hidden="true" />
            {bt("참여 스태프·작가·스튜디오 지분 100% 계약 검증", "100% Revenue Split Contract Verification")}
          </h4>
          <span className="eco-sdk-pill" data-tone={splitEval.valid ? "good" : "bad"} data-testid="ip-split-total">
            {bt(`지분 합계 ${splitEval.totalSharePercent.toFixed(2)}%`, `Split total ${splitEval.totalSharePercent.toFixed(2)}%`)}
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stakeholders.map((party) => {
            const payout = splitEval.payouts.find((item) => item.partyId === party.partyId);
            return (
              <div key={party.partyId} className="rounded-xl border border-line bg-canvas p-3">
                <label htmlFor={`share-${party.partyId}`} className="block text-xs font-bold text-fg">
                  {party.name}
                </label>
                <input
                  id={`share-${party.partyId}`}
                  data-testid={`share-input-${party.partyId}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={party.sharePercent}
                  onChange={(event) => onStakeholderShareChange(party.partyId, Number.parseFloat(event.target.value || "0"))}
                  className="eco-sdk-input mt-2"
                />
                <p className="mt-1.5 text-xs text-fg-2 eco-sdk-num">
                  {bt("배분 예정", "Payout")}: {payout ? formatKrw(payout.payoutKrw) : bt("합계 100% 필요", "Requires 100%")}
                </p>
              </div>
            );
          })}
        </div>

        {!splitEval.valid ? (
          <div className="eco-sdk-banner mt-3 flex items-start gap-2 text-xs" data-tone="bad" data-testid="ip-split-error">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{splitEval.errors.join(" ")}</span>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="ip-append-block-btn"
            className="eco-sdk-btn"
            data-tone="good"
            disabled={!splitEval.valid}
            onClick={onAppendContractBlock}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>{bt("가스비 0원 계약 블록 서명·추가", "Sign & Append ₩0-Gas Block")}</span>
          </button>
          <button
            type="button"
            data-testid="ip-tamper-sim-btn"
            className="eco-sdk-btn"
            data-tone="warn"
            onClick={onSimulateTamper}
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            <span>{bt("변조 탐지 시뮬레이션", "Simulate Tamper Check")}</span>
          </button>
          {isTamperedPreview ? (
            <button
              type="button"
              data-testid="ip-restore-chain-btn"
              className="eco-sdk-btn"
              onClick={onRestoreChain}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              <span>{bt("원본 해시체인 복구", "Restore Valid Chain")}</span>
            </button>
          ) : null}
        </div>

        {ledgerNotice ? (
          <p className="mt-2 text-xs text-fg-2" role="status">
            {ledgerNotice}
          </p>
        ) : null}

        <div
          className="eco-sdk-banner mt-4 flex flex-wrap items-center justify-between gap-2 text-xs"
          data-tone={chainCheck.valid ? "good" : "bad"}
          data-testid="ip-chain-status"
        >
          <span className="flex items-center gap-2 font-semibold">
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
            {chainCheck.valid
              ? bt(
                  `해시체인 무결성 검증 통과 · 블록 ${chainCheck.blockCount}개 · 누적 가스비 ${formatKrw(chainCheck.totalGasFeeKrw)}`,
                  `Hash chain valid · ${chainCheck.blockCount} block(s) · Gas fee ${formatKrw(chainCheck.totalGasFeeKrw)}`,
                )
              : bt(
                  `변조 탐지 (블록 #${chainCheck.tamperedBlockIndex ?? 0}): ${chainCheck.issues[0] ?? "해시 불일치"}`,
                  `Tamper detected at block #${chainCheck.tamperedBlockIndex ?? 0}: ${chainCheck.issues[0] ?? "Hash mismatch"}`,
                )}
          </span>
          <span className="eco-sdk-hash text-fg-2">
            {bt("스냅샷 서명", "Snapshot")}: {shortHash(snapshotSignaturePreview)}
          </span>
        </div>

        <ol className="mt-3 space-y-2" data-testid="ip-ledger-blocks">
          {activeChain.map((block) => (
            <li key={`${block.index}-${block.blockHash}`} className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-fg eco-sdk-num">
                  #{block.index} · {block.summary}
                </span>
                <span className="eco-sdk-pill" data-tone={block.previousHash === GENESIS_PREVIOUS_HASH ? "accent" : "good"}>
                  {block.previousHash === GENESIS_PREVIOUS_HASH ? bt("제네시스", "Genesis") : bt("체인 연결", "Linked")} · 가스비 {formatKrw(block.gasFeeKrw)}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-3 eco-sdk-hash">
                prev: {shortHash(block.previousHash)} → hash: {shortHash(block.blockHash)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
