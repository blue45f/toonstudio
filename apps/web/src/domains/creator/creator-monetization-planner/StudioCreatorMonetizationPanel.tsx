/**
 * Wave 42C — 독립·프로 웹툰 작가 수익화 퍼널 · 굿즈 BEP · 세율 가정 계산 · 주간 마감 번아웃 예측 3탭 플래너.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 및 원시 팔레트 색 0건)
 * - 모든 시뮬레이션 결과에 `추정` 배지 명시 (허위 실측 통계 금지)
 * - props 기본 빈 객체 미사용 · `<StudioCreatorMonetizationPanel />` 단독 렌더링 지원
 */

import {
  Activity, AlertTriangle, Calculator, CheckCircle2, Coins, Package,
  RotateCcw, ShieldAlert, TrendingUp, Users,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  BURNOUT_SCENARIO_PRESETS, DEFAULT_GOODS_UNIT_ECONOMICS_INPUT, DEFAULT_KOREAN_SETTLEMENT_INPUT,
  DEFAULT_PAYWALL_FUNNEL_INPUT, DEFAULT_WEEKLY_BURNOUT_INPUT, GOODS_PRESETS, PAYWALL_SCENARIO_PRESETS,
  calculateGoodsUnitEconomics, calculateKoreanCreatorSettlement, forecastWeeklyBurnoutRisk,
  formatKrw, simulatePaywallFunnel,
  type BurnoutRiskLevel, type GoodsItemType, type GoodsUnitEconomicsInput,
  type KoreanCreatorSettlementInput, type MgRecoupmentStatus, type PaywallFunnelInput,
  type ProductionStageId, type VatContractMode,
} from "./monetization-burnout-engine";

import { ExampleNotificationStatus } from "./ExampleNotificationStatus";
import { useExampleNotification } from "./use-example-notification";

export type MonetizationPlannerTabId = "paywall" | "goods-tax" | "burnout";

export interface StudioCreatorMonetizationPanelProps {
  readonly initialTab?: MonetizationPlannerTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onTabChange?: (tabId: MonetizationPlannerTabId) => void | Promise<void>;
  readonly onDelegationApply?: (stages: readonly ProductionStageId[]) => void | Promise<void>;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const TAB_BTN = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const PILL_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING}`;
const SOLID_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const ACTIVE_TONE = "border-accent bg-accent-soft text-accent";
const SOLID_ACTIVE = "border-accent bg-accent text-on-accent";
const IDLE_TONE = "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-medium text-fg tabular-nums transition-colors motion-reduce:transition-none hover:border-line-strong ${FOCUS_RING}`;

interface NumberFieldSpec<K extends string> {
  readonly key: K; readonly testId: string;
  readonly labelKo: string; readonly labelEn: string;
  readonly min: number; readonly max?: number; readonly step: number;
  readonly suffixKo?: string; readonly suffixEn?: string;
}

const PAYWALL_FIELDS: readonly NumberFieldSpec<keyof PaywallFunnelInput>[] = [
  { key: "freeEpisodeReaders", testId: "input-free-readers", labelKo: "무료 최신화 독자 수", labelEn: "Free Episode Readers", min: 0, step: 1000, suffixKo: "명", suffixEn: "readers" },
  { key: "previewEpisodeCount", testId: "input-preview-count", labelKo: "유료 미리보기 화수", labelEn: "Paid Preview Episodes", min: 1, max: 20, step: 1, suffixKo: "화", suffixEn: "eps" },
  { key: "initialPreviewConversionPct", testId: "input-initial-conversion", labelKo: "미리보기 1화 전환율", labelEn: "Ep. 1 Conversion Rate", min: 0, max: 100, step: 0.5, suffixKo: "%", suffixEn: "%" },
  { key: "stepRetentionRatePct", testId: "input-step-retention", labelKo: "다음 화 연속 결제 유지율", labelEn: "Next-Ep Retention", min: 0, max: 100, step: 1, suffixKo: "%", suffixEn: "%" },
  { key: "pricePerPreviewEpisodeKrw", testId: "input-preview-price", labelKo: "회차당 유료 객단가", labelEn: "Price / Preview Ep.", min: 0, step: 100, suffixKo: "원", suffixEn: "KRW" },
  { key: "platformFeePct", testId: "input-platform-fee", labelKo: "플랫폼 배분 수수료", labelEn: "Platform Fee", min: 0, max: 90, step: 1, suffixKo: "%", suffixEn: "%" },
  { key: "mgPerEpisodeKrw", testId: "input-mg-per-episode", labelKo: "회차당 MG (미니멈 개런티)", labelEn: "MG per Episode", min: 0, step: 100000, suffixKo: "원", suffixEn: "KRW" },
  { key: "upfrontAdvanceKrw", testId: "input-upfront-advance", labelKo: "추가 선인세·누적 MG", labelEn: "Upfront Advance / MG", min: 0, step: 500000, suffixKo: "원", suffixEn: "KRW" },
];

const SETTLEMENT_RATE_FIELDS = [
  { key: "nationalIncomeTaxRatePct", labelKo: "국세율 가정", labelEn: "Assumed National Tax", fallback: 3 },
  { key: "localIncomeTaxRatePct", labelKo: "지방세율 가정", labelEn: "Assumed Local Tax", fallback: 0.3 },
  { key: "vatRatePct", labelKo: "부가세율 가정", labelEn: "Assumed VAT", fallback: 10 },
] as const;

type GoodsNumericKey = Exclude<keyof GoodsUnitEconomicsInput, "goodsType">;
const GOODS_FIELDS: readonly NumberFieldSpec<GoodsNumericKey>[] = [
  { key: "sellingPriceKrw", testId: "input-goods-price", labelKo: "판매가", labelEn: "Selling Price", min: 0, step: 500, suffixKo: "원", suffixEn: "KRW" },
  { key: "unitManufacturingCostKrw", testId: "input-goods-unit-cost", labelKo: "개당 제작 원가", labelEn: "Unit Mfg. Cost", min: 0, step: 100, suffixKo: "원", suffixEn: "KRW" },
  { key: "packagingAndShippingPerUnitKrw", testId: "input-goods-shipping", labelKo: "개당 포장·배송비", labelEn: "Packaging & Shipping", min: 0, step: 100, suffixKo: "원", suffixEn: "KRW" },
  { key: "fixedSetupCostKrw", testId: "input-goods-setup-cost", labelKo: "고정 셋업·편집비", labelEn: "Fixed Setup Cost", min: 0, step: 10000, suffixKo: "원", suffixEn: "KRW" },
  { key: "moqUnits", testId: "input-goods-moq", labelKo: "최소 발주 수량 (MOQ)", labelEn: "MOQ Units", min: 1, step: 10, suffixKo: "개", suffixEn: "units" },
  { key: "plannedOrderUnits", testId: "input-goods-order-units", labelKo: "발주 계획 수량", labelEn: "Planned Order", min: 1, step: 10, suffixKo: "개", suffixEn: "units" },
  { key: "expectedSellThroughPct", testId: "input-goods-sell-through", labelKo: "예상 판매율", labelEn: "Expected Sell-Through", min: 0, max: 100, step: 5, suffixKo: "%", suffixEn: "%" },
  { key: "channelFeePct", testId: "input-goods-channel-fee", labelKo: "판매 플랫폼·PG 수수료", labelEn: "Channel / PG Fee", min: 0, max: 60, step: 0.5, suffixKo: "%", suffixEn: "%" },
];

type BurnoutScalarKey = "weeklyCutCount" | "availableWorkHoursPerWeek" | "consecutiveCrunchWeeks" | "revisionBufferPct";
const BURNOUT_FIELDS: readonly NumberFieldSpec<BurnoutScalarKey>[] = [
  { key: "weeklyCutCount", testId: "input-weekly-cuts", labelKo: "주간 작업 컷 수", labelEn: "Weekly Cut Count", min: 1, max: 200, step: 5, suffixKo: "컷", suffixEn: "cuts" },
  { key: "availableWorkHoursPerWeek", testId: "input-available-hours", labelKo: "주간 가용 작업시간", labelEn: "Available Hours / Week", min: 5, max: 112, step: 1, suffixKo: "시간", suffixEn: "hrs" },
  { key: "consecutiveCrunchWeeks", testId: "input-crunch-weeks", labelKo: "연속 마감 과부하 주차", labelEn: "Consecutive Crunch Weeks", min: 0, max: 52, step: 1, suffixKo: "주", suffixEn: "wks" },
  { key: "revisionBufferPct", testId: "input-revision-buffer", labelKo: "수정·검수 버퍼", labelEn: "Revision Buffer", min: 0, max: 50, step: 5, suffixKo: "%", suffixEn: "%" },
];

function parseSafeNumber(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mgStatusTone(status: MgRecoupmentStatus): string {
  if (status === "surplus-immediate" || status === "no-mg") return "border-good bg-good-soft text-good";
  return status === "recouping-advance" ? "border-line-strong bg-info-soft text-cool" : "border-bad bg-bad-soft text-bad";
}

function mgStatusLabel(status: MgRecoupmentStatus, months: number | null, isEn: boolean): string {
  if (status === "no-mg") return isEn ? "Pure RS (No MG)" : "무MG 순수 RS";
  if (status === "surplus-immediate") return isEn ? "Recouped each ep." : "매 회차 MG 초과 회수";
  if (status === "recouping-advance") return isEn ? `Est. ${months ?? 0} mo to recoup` : `선인세 약 ${months ?? 0}개월 회수(추정)`;
  return isEn ? "MG Deficit (Needs uplift)" : "MG 미달 (전환·독자 보강 필요)";
}

function burnoutTone(level: BurnoutRiskLevel): string {
  if (level === "safe") return "border-good bg-good-soft text-good";
  if (level === "caution") return "border-line-strong bg-info-soft text-cool";
  return level === "high" ? "border-warn bg-warning-soft text-warn" : "border-bad bg-bad-soft text-bad";
}

function burnoutBarTone(level: BurnoutRiskLevel): string {
  if (level === "safe") return "bg-good";
  if (level === "caution") return "bg-cool";
  return level === "high" ? "bg-warn" : "bg-bad";
}

function burnoutLevelLabel(level: BurnoutRiskLevel, isEn: boolean): string {
  if (level === "safe") return isEn ? "Safe" : "안정";
  if (level === "caution") return isEn ? "Caution" : "주의";
  return level === "high" ? (isEn ? "High Risk" : "위험") : (isEn ? "Burnout Alert" : "번아웃 경보");
}

interface NumericFieldProps {
  readonly id: string; readonly label: string; readonly value: number;
  readonly min?: number; readonly max?: number; readonly step?: number;
  readonly suffix?: string; readonly testId?: string;
  readonly onChange: (next: number) => void;
}

function NumericField({ id, label, value, min = 0, max, step = 1, suffix, testId, onChange }: NumericFieldProps): ReactElement {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs font-semibold text-fg-2">
        <span>{label}</span>
        {suffix ? <span className="text-[11px] font-normal text-fg-3">{suffix}</span> : null}
      </label>
      <input
        id={id} data-testid={testId} type="number" inputMode="decimal"
        min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(parseSafeNumber(event.target.value, value))}
        className={INPUT_CLS}
      />
    </div>
  );
}

interface MetricTileProps {
  readonly label: string; readonly value: string; readonly detail: string;
  readonly testId?: string; readonly valueToneClass?: string;
}

function MetricTile({ label, value, detail, testId, valueToneClass = "text-fg" }: MetricTileProps): ReactElement {
  return (
    <div className="space-y-1 rounded-xl border border-line bg-card p-3">
      <div className="text-[11px] font-semibold text-fg-3">{label}</div>
      <div data-testid={testId} className={`text-sm font-bold tabular-nums sm:text-base ${valueToneClass}`}>{value}</div>
      <div className="text-[11px] text-fg-2 tabular-nums">{detail}</div>
    </div>
  );
}

function EstimateNoticeBar({ badgeLabel, notice }: { readonly badgeLabel: string; readonly notice: string }): ReactElement {
  return (
    <div data-testid="tab-estimate-notice" className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-xs text-fg-2">
      <span className="inline-flex shrink-0 items-center rounded-full border border-warn bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warn">
        {badgeLabel}
      </span>
      <span className="leading-relaxed">{notice}</span>
    </div>
  );
}

/** Wave 42C 독립·프로 웹툰 작가 수익화 퍼널 · 굿즈 BEP · 세율 가정 계산 · 주간 마감 번아웃 예측 플래너. */
export function StudioCreatorMonetizationPanel(props: StudioCreatorMonetizationPanelProps): ReactElement {
  const { initialTab = "paywall", locale, className, onTabChange, onDelegationApply } = props;
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "en";
  const tabNotification = useExampleNotification(onTabChange);
  const delegationNotification = useExampleNotification(onDelegationApply);
  const pending = tabNotification.status === "pending" || delegationNotification.status === "pending";
  function isPending(): boolean { return tabNotification.isPending() || delegationNotification.isPending(); }
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<MonetizationPlannerTabId>(initialTab);
  const [paywallInput, setPaywallInput] = useState<PaywallFunnelInput>(DEFAULT_PAYWALL_FUNNEL_INPUT);
  const [goodsInput, setGoodsInput] = useState<GoodsUnitEconomicsInput>(DEFAULT_GOODS_UNIT_ECONOMICS_INPUT);
  const [settlementInput, setSettlementInput] = useState<KoreanCreatorSettlementInput>(DEFAULT_KOREAN_SETTLEMENT_INPUT);
  const [burnoutInput, setBurnoutInput] = useState(DEFAULT_WEEKLY_BURNOUT_INPUT);
  const [delegatedStages, setDelegatedStages] = useState<readonly ProductionStageId[]>([]);

  const paywallResult = useMemo(() => simulatePaywallFunnel(paywallInput), [paywallInput]);
  const goodsResult = useMemo(() => calculateGoodsUnitEconomics(goodsInput), [goodsInput]);
  const settlementResult = useMemo(() => calculateKoreanCreatorSettlement(settlementInput), [settlementInput]);
  const burnoutResult = useMemo(() => forecastWeeklyBurnoutRisk({ ...burnoutInput, delegatedStages }), [burnoutInput, delegatedStages]);

  const selectTab = (nextTab: MonetizationPlannerTabId): void => {
    if (isPending()) return;
    setActiveTab(nextTab);
    tabNotification.notify(nextTab);
  };

  const applyGoodsPreset = (goodsType: GoodsItemType): void => {
    const preset = GOODS_PRESETS.find((item) => item.id === goodsType);
    if (preset) setGoodsInput(preset.input);
  };

  const toggleDelegatedStage = (stageId: ProductionStageId): void => {
    if (isPending()) return;
    const nextStages = delegatedStages.includes(stageId)
      ? delegatedStages.filter((id) => id !== stageId)
      : [...delegatedStages, stageId];
    setDelegatedStages(nextStages);
    delegationNotification.notify(nextStages);
  };

  const applyRecommendedDelegations = (): void => {
    if (isPending()) return;
    const nextStages = Array.from(new Set([...delegatedStages, ...burnoutResult.recommendedDelegations.map((item) => item.stageId)]));
    setDelegatedStages(nextStages);
    delegationNotification.notify(nextStages);
  };

  const clearDelegations = (): void => {
    if (isPending()) return;
    setDelegatedStages([]);
    delegationNotification.notify([]);
  };

  const tabs: readonly { readonly id: MonetizationPlannerTabId; readonly labelKo: string; readonly labelEn: string; readonly icon: ReactElement }[] = [
    { id: "paywall", labelKo: "유료 미리보기·MG 회수", labelEn: "Paywall & MG Recoup", icon: <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
    { id: "goods-tax", labelKo: "굿즈 BEP·세율 가정", labelEn: "Goods BEP & KR Tax", icon: <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
    { id: "burnout", labelKo: "주간 마감 번아웃·어시 배분", labelEn: "Burnout & Delegation", icon: <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> },
  ];

  const maxStepReaders = Math.max(1, paywallResult.step1PayingReaders);

  return (
    <section
      data-testid="creator-monetization-planner-panel"
      aria-label={pick("독립·프로 웹툰 작가 수익화·굿즈 BEP·세무 정산·주간 번아웃 예측 플래너", "Webtoon Creator Monetization, Goods BEP, KR Settlement & Weekly Burnout Planner")}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] sm:p-5 ${className ?? ""}`}
    >
      <p data-testid="monetization-example-scope" className="rounded-lg border border-line bg-card p-3 text-xs text-fg-2">{pick("입력 가정에 따른 메모리 계산 예제입니다. 원고·계정 설정을 읽거나 저장하지 않습니다. 위임 선택은 예제 계산에만 반영되며 의학적 진단·세무 판단·실측 성과가 아닙니다.", "In-memory examples from input assumptions; documents and account settings are not read or saved. Delegation only changes this example, not medical or tax advice or measured outcomes. Inputs are not saved.")}</p>
      <ExampleNotificationStatus status={tabNotification.status} retry={tabNotification.retry} retryTestId="retry-tab-notification" isEn={isEn} />
      <ExampleNotificationStatus status={delegationNotification.status} retry={delegationNotification.retry} retryTestId="retry-delegation-notification" isEn={isEn} />
      <fieldset disabled={pending} className="min-w-0 space-y-4 border-0 p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-fg-2">
              <Coins className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <span>{pick("웹툰 작가 수익·마감 플래너", "Creator Monetization & Schedule Planner")}</span>
            </span>
            <span data-testid="monetization-estimate-badge" className="inline-flex items-center gap-1 rounded-full border border-warn bg-warning-soft px-2.5 py-1 text-[11px] font-bold text-warn">
              <Calculator className="h-3 w-3" aria-hidden="true" />
              <span>{pick("시나리오 추정 (Estimate)", "Scenario Estimate")}</span>
            </span>
          </div>
          <h2 className="text-base font-bold text-fg sm:text-lg">
            {pick("유료 미리보기·MG 회수 · 굿즈 손익분기 · 세율 가정 계산 · 번아웃 예측", "Paywall & MG Recoupment · Goods BEP · Assumed Tax Rates · Weekly Burnout")}
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-fg-2">
            {pick(
              "모든 수치는 입력 시나리오 기반 추정치입니다. 연재 전환율·굿즈 MOQ·한국 세무 정산·공정별 컷 시간을 직접 조정해 수익성과 마감 지속 가능성을 함께 점검하세요.",
              "All outputs are deterministic estimates from your inputs. Tune paywall conversion, goods MOQ, Korean tax splits, and weekly cut workload side by side.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">{pick("월 예상 RS(추정)", "Est. Monthly RS")}</div>
            <div className="font-bold text-fg">{formatKrw(paywallResult.monthlyCreatorRsKrw)}</div>
          </div>
          <div className="rounded-xl border border-line bg-card px-3 py-2">
            <div className="text-[11px] text-fg-3">{pick("주간 번아웃 지수(추정)", "Est. Burnout")}</div>
            <div data-testid="header-burnout-score" className="font-bold text-fg">
              {burnoutResult.burnoutScore}/100 · {burnoutLevelLabel(burnoutResult.burnoutLevel, isEn)}
            </div>
          </div>
        </div>
      </header>

      <div role="tablist" aria-label={pick("수익화 및 번아웃 플래너 탭", "Monetization and burnout planner tabs")} className="flex flex-col gap-2 sm:flex-row">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id} id={`${uid}-tab-${tab.id}`} data-testid={`planner-tab-${tab.id}`}
              type="button" role="tab" aria-selected={selected} aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => selectTab(tab.id)} className={`${TAB_BTN} ${selected ? SOLID_ACTIVE : IDLE_TONE}`}
            >
              {tab.icon}
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 유료 미리보기 · MG 회수 */}
      {activeTab === "paywall" ? (
        <div id={`${uid}-panel-paywall`} role="tabpanel" aria-labelledby={`${uid}-tab-paywall`} data-testid="tabpanel-paywall" className="space-y-4">
          <EstimateNoticeBar
            badgeLabel={isEn ? paywallResult.provenance.badgeLabelEn : paywallResult.provenance.badgeLabelKo}
            notice={isEn ? paywallResult.provenance.noticeEn : paywallResult.provenance.noticeKo}
          />
          <div className="flex flex-wrap gap-2">
            {PAYWALL_SCENARIO_PRESETS.map((preset) => (
              <button key={preset.id} type="button" data-testid={`paywall-preset-${preset.id}`} onClick={() => setPaywallInput(preset.input)} className={`${PILL_BTN} ${IDLE_TONE}`}>
                <span>{isEn ? preset.labelEn : preset.labelKo}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
            {PAYWALL_FIELDS.map((field) => (
              <NumericField
                key={field.key} id={`${uid}-${field.key}`} testId={field.testId}
                label={isEn ? field.labelEn : field.labelKo} value={paywallInput[field.key]}
                min={field.min} max={field.max} step={field.step}
                suffix={isEn ? field.suffixEn : field.suffixKo}
                onChange={(val) => setPaywallInput((prev) => ({ ...prev, [field.key]: val }))}
              />
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              testId="kpi-paywall-monthly-gross" label={pick("월 유료 미리보기 총매출 (추정)", "Est. Monthly Gross")}
              value={formatKrw(paywallResult.monthlyGrossRevenueKrw)}
              detail={pick(`회차당 ${formatKrw(paywallResult.grossRevenuePerEpisodeKrw)} × 월 ${paywallResult.sanitizedInput.episodesPerMonth}화`, `${formatKrw(paywallResult.grossRevenuePerEpisodeKrw)}/ep × ${paywallResult.sanitizedInput.episodesPerMonth} eps`)}
            />
            <MetricTile
              testId="kpi-paywall-monthly-rs" label={pick("월 작가 RS 정산액 (추정)", "Est. Monthly Creator RS")}
              value={formatKrw(paywallResult.monthlyCreatorRsKrw)} valueToneClass="text-accent"
              detail={pick(`순배분율 ${paywallResult.netRealizationRatePct}% · 1인당 ${formatKrw(paywallResult.effectiveArppuKrw)}`, `Net share ${paywallResult.netRealizationRatePct}% · ARPPU ${formatKrw(paywallResult.effectiveArppuKrw)}`)}
            />
            <MetricTile
              testId="kpi-mg-recoupment" label={pick("MG 회수 시점·상태 (추정)", "Est. MG Recoupment")}
              value={mgStatusLabel(paywallResult.mgRecoupmentStatus, paywallResult.mgRecoupmentMonths, isEn)}
              valueToneClass={paywallResult.mgRecoupmentStatus === "mg-deficit" ? "text-bad" : paywallResult.mgRecoupmentStatus === "recouping-advance" ? "text-cool" : "text-good"}
              detail={paywallResult.mgCoverageRatioPct !== null ? pick(`회차당 MG 대비 RS 충당률 ${paywallResult.mgCoverageRatioPct}%`, `Per-ep MG coverage ${paywallResult.mgCoverageRatioPct}%`) : pick("무MG 계약 · 첫 결제부터 RS 정산", "No MG · RS paid from first unlock")}
            />
            <MetricTile
              testId="kpi-mg-required-conversion" label={pick("MG 100% 회수 최소 1화 전환율 (추정)", "Min Ep.1 Conv. for MG")}
              value={paywallResult.requiredInitialConversionPctForMg !== null ? `${paywallResult.requiredInitialConversionPctForMg}%` : pick("해당 없음", "N/A")}
              detail={paywallResult.requiredFreeReadersForMg !== null ? pick(`현재 전환율 기준 필요 독자 ${paywallResult.requiredFreeReadersForMg.toLocaleString("ko-KR")}명`, `Needs ${paywallResult.requiredFreeReadersForMg.toLocaleString("ko-KR")} free readers`) : pick("MG 0원 시나리오", "Zero-MG scenario")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg">
                  {pick(`유료 미리보기 ${paywallResult.previewSteps.length}화 단계별 전환 퍼널 (추정)`, `${paywallResult.previewSteps.length}-Episode Paid Preview Funnel (Estimate)`)}
                </h3>
                <span data-testid="mg-status-pill" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${mgStatusTone(paywallResult.mgRecoupmentStatus)}`}>
                  {mgStatusLabel(paywallResult.mgRecoupmentStatus, paywallResult.mgRecoupmentMonths, isEn)}
                </span>
              </div>
              <div className="space-y-2">
                {paywallResult.previewSteps.map((step) => {
                  const widthPct = Math.max(4, Math.round((step.payingReaders / maxStepReaders) * 100));
                  return (
                    <div key={step.stepIndex} data-testid={`paywall-step-${step.stepIndex}`} className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-fg">{isEn ? step.episodeLabelEn : step.episodeLabelKo}</span>
                        <span className="text-fg-2">
                          {step.conversionFromFreePct}% · {step.payingReaders.toLocaleString("ko-KR")}{pick("명", " buyers")} · {formatKrw(step.stepCreatorRsKrw)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-raised">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${widthPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <h3 className="text-xs font-bold text-fg">{pick("보수·기준·낙관 전환 시나리오 비교 (추정)", "Conservative / Base / Optimistic Bands (Estimate)")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-line text-[11px] text-fg-3">
                      <th className="py-2 pr-2 font-semibold">{pick("구간", "Band")}</th>
                      <th className="py-2 pr-2 font-semibold">{pick("월 총매출", "Monthly Gross")}</th>
                      <th className="py-2 pr-2 font-semibold">{pick("월 작가 RS", "Monthly RS")}</th>
                      <th className="py-2 font-semibold">{pick("MG 판정", "MG Status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paywallResult.sensitivityBands.map((band) => (
                      <tr key={band.bandId} className="border-b border-line/60 last:border-b-0">
                        <td className="py-2 pr-2 font-semibold text-fg">{isEn ? band.labelEn : band.labelKo}</td>
                        <td className="py-2 pr-2 text-fg-2">{formatKrw(band.monthlyGrossRevenueKrw)}</td>
                        <td className="py-2 pr-2 font-semibold text-fg">{formatKrw(band.monthlyCreatorRsKrw)}</td>
                        <td className="py-2 text-fg-2">{mgStatusLabel(band.mgRecoupmentStatus, band.mgRecoupmentMonths, isEn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1 border-t border-line pt-2 text-[11px] text-fg-3">
                {paywallResult.formulaNotesKo.map((note) => <li key={note}>· {note}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 2: 굿즈 BEP · 한국 3.3% / 10% 정산 */}
      {activeTab === "goods-tax" ? (
        <div id={`${uid}-panel-goods-tax`} role="tabpanel" aria-labelledby={`${uid}-tab-goods-tax`} data-testid="tabpanel-goods-tax" className="space-y-4">
          <EstimateNoticeBar
            badgeLabel={isEn ? goodsResult.provenance.badgeLabelEn : goodsResult.provenance.badgeLabelKo}
            notice={isEn ? goodsResult.provenance.noticeEn : goodsResult.provenance.noticeKo}
          />

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("1) 굿즈 제작 손익분기(MOQ/BEP) 계산기 (추정)", "1) Goods MOQ / Break-Even Calculator (Estimate)")}</h3>
              <div className="flex flex-wrap gap-2">
                {GOODS_PRESETS.map((preset) => (
                  <button
                    key={preset.id} type="button" data-testid={`goods-preset-${preset.id}`}
                    aria-pressed={goodsInput.goodsType === preset.id} onClick={() => applyGoodsPreset(preset.id)}
                    className={`${PILL_BTN} ${goodsInput.goodsType === preset.id ? ACTIVE_TONE : IDLE_TONE}`}
                  >
                    {isEn ? preset.labelEn : preset.labelKo}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {GOODS_FIELDS.map((field) => (
                <NumericField
                  key={field.key} id={`${uid}-${field.key}`} testId={field.testId}
                  label={isEn ? field.labelEn : field.labelKo} value={goodsInput[field.key]}
                  min={field.min} max={field.max} step={field.step}
                  suffix={isEn ? field.suffixEn : field.suffixKo}
                  onChange={(val) => setGoodsInput((prev) => ({ ...prev, [field.key]: val }))}
                />
              ))}
            </div>

            {goodsResult.belowMoqWarning ? (
              <div role="status" data-testid="goods-moq-warning" className="flex items-center gap-2 rounded-lg border border-warn bg-warning-soft px-3 py-2 text-xs font-semibold text-warn">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {pick(
                    `발주 계획(${goodsResult.sanitizedInput.plannedOrderUnits}개)이 MOQ(${goodsResult.sanitizedInput.moqUnits}개)보다 적어 MOQ 기준으로 선투자 원가를 산정했습니다.`,
                    `Planned order (${goodsResult.sanitizedInput.plannedOrderUnits}) is below MOQ (${goodsResult.sanitizedInput.moqUnits}); upfront outlay uses MOQ.`,
                  )}
                </span>
              </div>
            ) : null}

            {!goodsResult.isUnitMarginPositive ? (
              <div role="alert" data-testid="goods-negative-margin-alert" className="flex items-center gap-2 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs font-semibold text-bad">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{pick("개당 변동비(제작+배송+수수료)가 판매가 이상이어서 손익분기(BEP)에 도달할 수 없습니다.", "Variable cost per unit meets or exceeds selling price; break-even is unreachable.")}</span>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                testId="kpi-goods-bep-units" label={pick("선투자 회수 BEP 수량 (추정)", "Upfront Outlay BEP Units")}
                value={goodsResult.breakEvenUnits !== null ? `${goodsResult.breakEvenUnits.toLocaleString("ko-KR")}${pick("개", " units")}` : pick("도달 불가", "Unreachable")}
                valueToneClass={goodsResult.moqAchievable ? "text-good" : "text-bad"}
                detail={goodsResult.breakEvenSellThroughPct !== null ? pick(`발주 ${goodsResult.effectiveOrderUnits}개 중 ${goodsResult.breakEvenSellThroughPct}% 판매 시 회수`, `${goodsResult.breakEvenSellThroughPct}% of ${goodsResult.effectiveOrderUnits} ordered`) : pick("단가·수수료 조정 필요", "Adjust price or unit cost")}
              />
              <MetricTile
                testId="kpi-goods-unit-margin" label={pick("개당 공헌이익 (추정)", "Unit Contribution Margin")}
                value={formatKrw(goodsResult.contributionMarginPerUnitKrw)}
                detail={pick(`공헌이익률 ${goodsResult.contributionMarginPct}% · 수수료 ${formatKrw(goodsResult.unitChannelFeeKrw)}`, `Margin ${goodsResult.contributionMarginPct}% · Fee ${formatKrw(goodsResult.unitChannelFeeKrw)}`)}
              />
              <MetricTile
                testId="kpi-goods-net-profit" label={pick("예상 순이익 (추정)", "Est. Net Profit")}
                value={formatKrw(goodsResult.netProfitKrw)} valueToneClass={goodsResult.netProfitKrw >= 0 ? "text-good" : "text-bad"}
                detail={pick(`선투자 ${formatKrw(goodsResult.totalUpfrontManufacturingOutlayKrw)} · ROI ${goodsResult.roiPct}%`, `Upfront ${formatKrw(goodsResult.totalUpfrontManufacturingOutlayKrw)} · ROI ${goodsResult.roiPct}%`)}
              />
              <MetricTile
                testId="kpi-goods-net-margin" label={pick("순이익률 · 잔여 재고 (추정)", "Net Margin & Unsold")}
                value={`${goodsResult.netProfitMarginPct}%`}
                detail={pick(`판매 ${goodsResult.expectedSoldUnits}개 / 재고 ${goodsResult.unsoldInventoryUnits}개`, `Sold ${goodsResult.expectedSoldUnits} / Unsold ${goodsResult.unsoldInventoryUnits}`)}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-fg">{pick("2) 입력 세율에 따른 원천징수·부가세 현금흐름 비교 (추정)", "2) Withholding & VAT Cashflow from Assumed Rates (Estimate)")}</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button" data-testid="sync-goods-to-tax" className={`${PILL_BTN} ${IDLE_TONE}`}
                  onClick={() => setSettlementInput((prev) => ({ ...prev, grossContractAmountKrw: goodsResult.grossRevenueKrw, deductibleExpenseKrw: goodsResult.totalCostKrw }))}
                >
                  {pick("위 굿즈 매출·원가 연동", "Sync Goods Totals")}
                </button>
                <button
                  type="button" data-testid="sync-paywall-to-tax" className={`${PILL_BTN} ${IDLE_TONE}`}
                  onClick={() => setSettlementInput((prev) => ({ ...prev, grossContractAmountKrw: paywallResult.monthlyCashflowBeforeTaxKrw }))}
                >
                  {pick("유료 미리보기 월 정산 연동", "Sync Monthly RS")}
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumericField
                id={`${uid}-tax-gross`} testId="input-tax-gross" label={pick("정산 기준 금액", "Gross Settlement Amount")}
                value={settlementInput.grossContractAmountKrw} min={0} step={100000} suffix={pick("원", "KRW")}
                onChange={(grossContractAmountKrw) => setSettlementInput((prev) => ({ ...prev, grossContractAmountKrw }))}
              />
              <NumericField
                id={`${uid}-tax-expense`} testId="input-tax-expense" label={pick("적격증빙 경비 지출 (부가세 포함)", "Deductible Expenses (VAT incl.)")}
                value={settlementInput.deductibleExpenseKrw} min={0} step={50000} suffix={pick("원", "KRW")}
                onChange={(deductibleExpenseKrw) => setSettlementInput((prev) => ({ ...prev, deductibleExpenseKrw }))}
              />
              <div className="space-y-1">
                <span className="block text-xs font-semibold text-fg-2">{pick("사업자 부가세 계약 방식", "VAT Contract Mode")}</span>
                <div className="flex gap-2">
                  {(["vat-exclusive", "vat-inclusive"] as readonly VatContractMode[]).map((mode) => (
                    <button
                      key={mode} type="button" data-testid={`vat-mode-${mode}`}
                      aria-pressed={settlementInput.vatContractMode === mode}
                      onClick={() => setSettlementInput((prev) => ({ ...prev, vatContractMode: mode }))}
                      className={`${PILL_BTN} flex-1 ${settlementInput.vatContractMode === mode ? ACTIVE_TONE : IDLE_TONE}`}
                    >
                      {mode === "vat-exclusive" ? pick("부가세 별도", "VAT Exclusive") : pick("부가세 포함", "VAT Inclusive")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {SETTLEMENT_RATE_FIELDS.map((field) => (
                <NumericField key={field.key} id={`${uid}-${field.key}`} testId={`input-${field.key}`} label={pick(field.labelKo, field.labelEn)}
                  value={settlementInput[field.key] ?? field.fallback} min={0} max={100} step={0.1} suffix="%"
                  onChange={(value) => setSettlementInput((prev) => ({ ...prev, [field.key]: value }))} />
              ))}
            </div>
            <p className="text-xs text-fg-2">{isEn ? settlementResult.provenance.noticeEn : settlementResult.provenance.noticeKo}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg">{pick(`원천징수 가정 ${settlementResult.freelancer.withholdingRatePct}%`, `Assumed Withholding ${settlementResult.freelancer.withholdingRatePct}%`)}</span>
                  <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-fg-2">{`${settlementResult.freelancer.nationalIncomeTaxRatePct}% + ${settlementResult.freelancer.localIncomeTaxRatePct}%`}</span>
                </div>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-fg-2">{pick("가정 원천징수액", "Assumed Withholding")}</dt>
                    <dd data-testid="tax-freelancer-withholding" className="font-semibold text-bad">-{formatKrw(settlementResult.freelancer.totalWithholdingTaxKrw)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-2">{pick("즉시 통장 실수령액", "Immediate Net Payout")}</dt>
                    <dd data-testid="tax-freelancer-net" className="font-bold text-fg">{formatKrw(settlementResult.freelancer.immediateNetPayoutKrw)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1">
                    <dt className="text-fg-2">{pick("경비 지출 후 세전 가용 현금", "Cash After Expenses")}</dt>
                    <dd className="font-bold text-fg">{formatKrw(settlementResult.freelancer.netAfterExpensesKrw)}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-2 rounded-xl border border-line bg-panel p-3 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-fg">{pick(`부가세 가정 ${settlementResult.businessVat.vatRatePct}%`, `Assumed VAT ${settlementResult.businessVat.vatRatePct}%`)}</span>
                  <span className="rounded-full border border-accent bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{pick("세금계산서·매입세액 공제", "Tax Invoice + Input Credit")}</span>
                </div>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-fg-2">{pick("세금계산서 합계 (즉시 입금)", "Invoice Total (Cash In)")}</dt>
                    <dd data-testid="tax-business-invoice" className="font-semibold text-fg">{formatKrw(settlementResult.businessVat.invoiceTotalKrw)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-2">{pick(`매출부가세(${formatKrw(settlementResult.businessVat.outputVatKrw)}) - 매입공제(${formatKrw(settlementResult.businessVat.inputVatCreditKrw)})`, `Output VAT - Input Credit (${formatKrw(settlementResult.businessVat.inputVatCreditKrw)})`)}</dt>
                    <dd data-testid="tax-business-vat-payable" className="font-semibold text-warn">
                      {settlementResult.businessVat.vatRefundKrw > 0
                        ? `+${formatKrw(settlementResult.businessVat.vatRefundKrw)} ${pick("환급", "refund")}`
                        : `-${formatKrw(settlementResult.businessVat.netVatPayableKrw)} ${pick("납부", "due")}`}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-line/60 pt-1">
                    <dt className="text-fg-2">{pick("부가세 정산·경비 후 실수령", "Post-VAT Cash After Exp.")}</dt>
                    <dd data-testid="tax-business-net-after-expenses" className="font-bold text-good">{formatKrw(settlementResult.businessVat.netAfterVatAndExpensesKrw)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div role="status" data-testid="tax-comparison-summary" className="space-y-1 rounded-xl border border-line bg-raised p-3 text-xs">
              <p className="font-semibold text-fg">{isEn ? settlementResult.comparison.summaryEn : settlementResult.comparison.summaryKo}</p>
              <p className="text-[11px] text-fg-3">{isEn ? settlementResult.comparison.taxDisclaimerEn : settlementResult.comparison.taxDisclaimerKo}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 3: 주간 마감 번아웃 · 어시 배분 */}
      {activeTab === "burnout" ? (
        <div id={`${uid}-panel-burnout`} role="tabpanel" aria-labelledby={`${uid}-tab-burnout`} data-testid="tabpanel-burnout" className="space-y-4">
          <EstimateNoticeBar
            badgeLabel={isEn ? burnoutResult.provenance.badgeLabelEn : burnoutResult.provenance.badgeLabelKo}
            notice={isEn ? burnoutResult.provenance.noticeEn : burnoutResult.provenance.noticeKo}
          />
          <div className="flex flex-wrap gap-2">
            {BURNOUT_SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.id} type="button" data-testid={`burnout-preset-${preset.id}`} className={`${PILL_BTN} ${IDLE_TONE}`}
                onClick={() => { setBurnoutInput(preset.input); setDelegatedStages(preset.input.delegatedStages ?? []); }}
              >
                {isEn ? preset.labelEn : preset.labelKo}
              </button>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
            {BURNOUT_FIELDS.map((field) => (
              <NumericField
                key={field.key} id={`${uid}-${field.key}`} testId={field.testId}
                label={isEn ? field.labelEn : field.labelKo} value={burnoutInput[field.key]}
                min={field.min} max={field.max} step={field.step}
                suffix={isEn ? field.suffixEn : field.suffixKo}
                onChange={(val) => setBurnoutInput((prev) => ({ ...prev, [field.key]: val }))}
              />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-fg">{pick("번아웃 위험도 예측 (0~100 · 추정)", "Burnout Risk Forecast (0–100 · Estimate)")}</h3>
                <span data-testid="burnout-level-badge" className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${burnoutTone(burnoutResult.burnoutLevel)}`}>
                  {burnoutLevelLabel(burnoutResult.burnoutLevel, isEn)}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between tabular-nums">
                  <span data-testid="burnout-score-value" className="text-2xl font-bold text-fg">
                    {burnoutResult.burnoutScore}<span className="text-xs font-medium text-fg-3"> / 100</span>
                  </span>
                  {burnoutResult.burnoutReliefPoints > 0 ? (
                    <span data-testid="burnout-relief-badge" className="text-xs font-semibold text-good">
                      {pick(`위임 전 ${burnoutResult.burnoutScoreBeforeDelegation} → -${burnoutResult.burnoutReliefPoints}pt 경감`, `Down -${burnoutResult.burnoutReliefPoints}pt from ${burnoutResult.burnoutScoreBeforeDelegation}`)}
                    </span>
                  ) : null}
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-raised">
                  <div className={`h-full rounded-full transition-all motion-reduce:transition-none ${burnoutBarTone(burnoutResult.burnoutLevel)}`} style={{ width: `${burnoutResult.burnoutScore}%` }} />
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <MetricTile
                  testId="kpi-author-hours" label={pick("작가 직접 투입 시간 (추정)", "Author Direct Hours")}
                  value={`${burnoutResult.remainingAuthorHours}h / ${burnoutResult.sanitizedInput.availableWorkHoursPerWeek}h`}
                  valueToneClass={burnoutResult.overtimeHours > 0 ? "text-bad" : "text-good"}
                  detail={pick(`가동률 ${burnoutResult.utilizationPct}% · 초과 ${burnoutResult.overtimeHours}h`, `Utilization ${burnoutResult.utilizationPct}% · OT ${burnoutResult.overtimeHours}h`)}
                />
                <MetricTile
                  testId="kpi-sustainable-cuts" label={pick("권장 지속 가능 컷 수 · 위임 예산", "Sustainable Cuts & Budget")}
                  value={`${burnoutResult.sustainableCutCapacity}${pick("컷", " cuts")}`}
                  detail={pick(`위임 추정 예산 주 ${formatKrw(burnoutResult.weeklyDelegationBudgetKrw)}`, `Est. weekly delegation ${formatKrw(burnoutResult.weeklyDelegationBudgetKrw)}`)}
                />
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <Users className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>{pick("외주·어시스트 위임 추천 공정", "Recommended Delegation Plan")}</span>
                  </h4>
                  <div className="flex gap-2">
                    <button type="button" data-testid="btn-apply-recommended-delegation" disabled={burnoutResult.recommendedDelegations.length === 0} onClick={applyRecommendedDelegations} className={SOLID_BTN}>
                      {pick("예제 위임 일괄 선택", "Select Example Delegations")}
                    </button>
                    {delegatedStages.length > 0 ? (
                      <button type="button" data-testid="btn-clear-delegation" onClick={clearDelegations} className={`${PILL_BTN} ${IDLE_TONE}`}>
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pick("해제", "Reset")}</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {burnoutResult.recommendedDelegations.length === 0 ? (
                  <div data-testid="burnout-safe-banner" className="flex items-center gap-2 rounded-lg border border-good bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{pick("현재 가용 시간 안에서 안정적으로 소화 가능한 작업량입니다.", "Current workload sits comfortably within your weekly capacity.")}</span>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {burnoutResult.recommendedDelegations.map((rec) => (
                      <li key={rec.stageId} data-testid={`delegation-rec-${rec.stageId}`} className="rounded-lg border border-line bg-panel p-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                          <span className="font-bold text-fg">{isEn ? rec.labelEn : rec.labelKo} · -{rec.hoursSaved}h</span>
                          <span className="font-semibold text-good">
                            {pick(`위임 후 예상 ${rec.projectedBurnoutScoreAfter}점 · 주 ${formatKrw(rec.estimatedWeeklyCostKrw)}`, `Est. ${rec.projectedBurnoutScoreAfter}pt after · ${formatKrw(rec.estimatedWeeklyCostKrw)}/wk`)}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-fg-2">{isEn ? rec.reasonEn : rec.reasonKo}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <h3 className="text-xs font-bold text-fg">{pick("5대 공정별 컷당 소요시간(분) & 직접/위임 토글", "Per-Cut Minutes & Delegation Toggle")}</h3>
              <div className="space-y-2.5">
                {burnoutResult.stages.map((stage) => (
                  <div key={stage.stageId} data-testid={`stage-row-${stage.stageId}`} className={`rounded-xl border p-3 ${stage.isDelegated ? "border-accent bg-accent-soft" : "border-line bg-panel"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-fg">{isEn ? stage.labelEn : stage.labelKo}</span>
                          <span className="text-[11px] text-fg-2 tabular-nums">
                            {stage.totalHoursWithBuffer}h ({stage.sharePct}%) · {pick("주 추정", "est.")} {formatKrw(stage.estimatedWeeklyOutsourcingKrw)}
                          </span>
                        </div>
                        <p className="text-[11px] text-fg-3">{isEn ? stage.delegationRationaleEn : stage.delegationRationaleKo}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24">
                          <label htmlFor={`${uid}-stage-${stage.stageId}`} className="sr-only">
                            {pick(`${stage.labelKo} 컷당 분`, `${stage.labelEn} minutes per cut`)}
                          </label>
                          <input
                            id={`${uid}-stage-${stage.stageId}`} data-testid={`input-stage-min-${stage.stageId}`}
                            type="number" min={0} max={180} step={1} value={burnoutInput.stageMinutesPerCut[stage.stageId]}
                            onChange={(event) => {
                              const nextVal = parseSafeNumber(event.target.value, burnoutInput.stageMinutesPerCut[stage.stageId]);
                              setBurnoutInput((prev) => ({ ...prev, stageMinutesPerCut: { ...prev.stageMinutesPerCut, [stage.stageId]: nextVal } }));
                            }}
                            className={INPUT_CLS}
                          />
                        </div>
                        <button
                          type="button" data-testid={`toggle-delegate-${stage.stageId}`}
                          aria-pressed={stage.isDelegated} onClick={() => toggleDelegatedStage(stage.stageId)}
                          className={`${PILL_BTN} ${stage.isDelegated ? SOLID_ACTIVE : IDLE_TONE}`}
                        >
                          {stage.isDelegated ? pick("예제 위임", "Example Delegation") : pick("직접 수행", "Author")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </fieldset>
    </section>
  );
}
