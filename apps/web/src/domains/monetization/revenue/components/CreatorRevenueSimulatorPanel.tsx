/**
 * CreatorRevenueSimulatorPanel.tsx — 실시간 인터랙티브 OKLCH 창작자 수익·후원·세무 시뮬레이터.
 *
 * 초보자도 3종 원클릭 시나리오 프리셋으로 1초 만에 예상 실수령액을 계산하고,
 * 4개 수익원 슬라이더와 세무·팀 배분 체계 조합을 브라우저에 자동 저장한다.
 */

import { Calculator, Minus, Plus, RotateCcw, Target } from "lucide-react";
import { useMemo, useState } from "react";

import {
  DEFAULT_SIMULATOR_INPUT,
  loadSimulatorInput,
  REVENUE_SCENARIO_PRESETS,
  saveSimulatorInput,
  simulateCreatorRevenue,
  type RevenueMixId,
  type RevenueSimulatorInput,
  type TaxRegimeId,
} from "../models/revenue-simulator";
import { formatKrw } from "../revenue-aggregator";

import "./revenue-simulator.css";

const REVENUE_MIX_OPTIONS: readonly {
  readonly id: RevenueMixId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "fastpass-cookie-pps",
    ko: "미리보기 쿠키·PPS 정산",
    en: "FastPass Cookie & PPS",
    detailKo: "유료 미리보기 쿠키와 페이지 수익 배분(PPS)을 합산해 월간 정산 주기를 시뮬레이션합니다.",
    detailEn: "Simulates monthly settlement combining FastPass preview cookies and PPS page revenue share.",
  },
  {
    id: "fanbox-patreon-membership",
    ko: "팬박스·패트리온 구독",
    en: "Fanbox & Patreon Tiers",
    detailKo: "월 정기 멤버십 구독료와 회차별 팬 후원 팁의 실수령 정산 비율을 계산합니다.",
    detailEn: "Calculates net creator payout across recurring membership tiers and episode fan tips.",
  },
  {
    id: "3d-brush-asset-royalty",
    ko: "3D 배경·브러시 로열티",
    en: "3D Asset & Brush Royalty",
    detailKo: "스튜디오 마켓에 등록한 3D 배경·브러시 소재 라이선스 판매 로열티를 집계합니다.",
    detailEn: "Aggregates licensing royalties from 3D backgrounds and custom brushes sold on the Studio market.",
  },
  {
    id: "ip-season-funding-royalty",
    ko: "IP 판권·시즌 펀딩·레이어 로열티",
    en: "IP Licensing, Season Funding & Layer Royalty",
    detailKo: "2차 판권 MG/RS, 시즌 완결 팬덤 펀딩, 수정 가능 레이어 재사용 로열티를 통합 시뮬레이션합니다.",
    detailEn: "Simulates combined payouts across secondary IP MG/RS, season fandom funding, and reusable layer royalties.",
  },
];

const TAX_REGIME_OPTIONS: readonly {
  readonly id: TaxRegimeId;
  readonly ko: string;
  readonly en: string;
  readonly detailKo: string;
  readonly detailEn: string;
}[] = [
  {
    id: "kr-withholding-33pct",
    ko: "국내 원천징수 3.3%",
    en: "KR Withholding 3.3%",
    detailKo: "국내 프리랜서 창작자 사업소득 원천징수(소득세 3% + 지방소득세 0.3%) 기준",
    detailEn: "Korean freelance creator withholding tax (3.0% income + 0.3% local tax) baseline",
  },
  {
    id: "us-w8ben-treaty",
    ko: "미국 W-8BEN 조세조약",
    en: "US W-8BEN Treaty",
    detailKo: "글로벌 플랫폼 W-8BEN 제출 시 한미 조세조약 저작권 로열티 감면 세율 기준",
    detailEn: "Global platform W-8BEN copyright royalty treaty rate for cross-border payouts",
  },
  {
    id: "studio-split-70-30",
    ko: "스튜디오 7:3 배분",
    en: "Studio 70:30 Split",
    detailKo: "메인 작가 70% · 선화·채색·배경 어시스턴트 파트너 풀 30% 자동 배분 기준",
    detailEn: "70% lead creator and 30% line/color/background assistant pool split baseline",
  },
];

interface SliderSpec {
  readonly key: "paidReaders" | "membershipSubscribers" | "monthlyTipsKrw" | "monthlyAssetSalesKrw";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number, isKo: boolean) => string;
}

const SLIDER_SPECS: readonly SliderSpec[] = [
  {
    key: "paidReaders",
    labelKo: "월 유료 미리보기 독자",
    labelEn: "Monthly paid preview readers",
    min: 0,
    max: 3000,
    step: 50,
    format: (value, isKo) =>
      isKo ? `${value.toLocaleString("ko-KR")}명` : `${value.toLocaleString("en-US")} readers`,
  },
  {
    key: "membershipSubscribers",
    labelKo: "월 정기 멤버십 구독자",
    labelEn: "Monthly membership subscribers",
    min: 0,
    max: 1000,
    step: 10,
    format: (value, isKo) =>
      isKo ? `${value.toLocaleString("ko-KR")}명` : `${value.toLocaleString("en-US")} members`,
  },
  {
    key: "monthlyTipsKrw",
    labelKo: "월 회차 후원 팁",
    labelEn: "Monthly episode tips",
    min: 0,
    max: 2_000_000,
    step: 50_000,
    format: (value, isKo) =>
      isKo ? formatKrw(value) : `KRW ${value.toLocaleString("en-US")}`,
  },
  {
    key: "monthlyAssetSalesKrw",
    labelKo: "월 3D·브러시 소재 판매",
    labelEn: "Monthly 3D & brush asset sales",
    min: 0,
    max: 2_000_000,
    step: 50_000,
    format: (value, isKo) =>
      isKo ? formatKrw(value) : `KRW ${value.toLocaleString("en-US")}`,
  },
];

function formatMoney(amount: number, isKo: boolean): string {
  return isKo ? formatKrw(amount) : `KRW ${Math.round(amount).toLocaleString("en-US")}`;
}

export function CreatorRevenueSimulatorPanel({ isKo }: Readonly<{ isKo: boolean }>) {
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [input, setInput] = useState<RevenueSimulatorInput>(() => loadSimulatorInput());

  const updateInput = (patch: Partial<RevenueSimulatorInput>) => {
    setInput((prev) => {
      const next = { ...prev, ...patch };
      saveSimulatorInput(next);
      return next;
    });
  };

  const activeMix =
    REVENUE_MIX_OPTIONS.find((item) => item.id === input.revenueMix) ?? REVENUE_MIX_OPTIONS[0]!;
  const activeTax =
    TAX_REGIME_OPTIONS.find((item) => item.id === input.taxRegime) ?? TAX_REGIME_OPTIONS[0]!;
  const result = useMemo(() => simulateCreatorRevenue(input), [input]);

  const activePresetId =
    REVENUE_SCENARIO_PRESETS.find(
      (preset) =>
        preset.input.revenueMix === input.revenueMix
        && preset.input.taxRegime === input.taxRegime
        && preset.input.paidReaders === input.paidReaders
        && preset.input.membershipSubscribers === input.membershipSubscribers,
    )?.id ?? null;

  return (
    <section
      data-testid="revenue-dashboard-rea-payout-bar"
      aria-label={pickLang("창작자 수익 정산 벤치마크 워크벤치", "Creator revenue settlement benchmark workbench")}
      className="rev-sim-shell mb-5 break-keep [overflow-wrap:break-word] rounded-2xl border border-line bg-card p-4 sm:p-5"
    >
      <span className="rev-sim-ribbon" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold leading-[1.4] tracking-[-0.01em] text-accent">
          <Calculator size={15} strokeWidth={1.5} aria-hidden="true" />
          {pickLang("수익원 믹스 · 세무 정산 실시간 시뮬레이터", "Live Revenue Mix & Tax Payout Simulator")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-panel px-2.5 py-1 font-mono text-xs text-fg-3">
            Patreon · Pixiv Fanbox · Gumroad · Naver PPS · Postype
          </span>
          <button
            type="button"
            data-testid="revenue-sim-reset-btn"
            onClick={() => updateInput(DEFAULT_SIMULATOR_INPUT)}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg-2 transition-[border-color,color] duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
          >
            <RotateCcw size={13} strokeWidth={1.5} aria-hidden="true" />
            {pickLang("기본 예시로 되돌리기", "Reset example")}
          </button>
        </div>
      </div>

      {/* 초보자 1클릭 시나리오 프리셋 */}
      <div className="mt-3">
        <p className="text-xs font-medium text-fg-2">
          {pickLang(
            "처음이라면 아래 연재 유형 하나를 눌러 바로 예상 실수령액을 확인해 보세요 (예상 시뮬레이션 수치이며 실제 정산과는 다릅니다).",
            "New here? Pick one starter scenario below to estimate monthly net payout (simulated estimate, separate from actual payouts).",
          )}
        </p>
        <div
          className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"
          role="group"
          aria-label={pickLang("시나리오 빠른 선택", "Starter scenarios")}
        >
          {REVENUE_SCENARIO_PRESETS.map((preset) => {
            const active = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`revenue-sim-preset-${preset.id}`}
                aria-pressed={active}
                onClick={() => updateInput(preset.input)}
                className="rev-sim-preset flex min-h-11 flex-col items-start rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="text-xs font-semibold text-fg">
                  {pickLang(preset.labelKo, preset.labelEn)}
                </span>
                <span className="mt-0.5 text-xs text-fg-2">
                  {pickLang(preset.subtitleKo, preset.subtitleEn)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 수익 모델 & 세무·배분 체계 */}
      <div
        className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-line/60 pb-1 pt-3 sm:flex-wrap sm:overflow-visible sm:pb-0"
        role="group"
        aria-label={pickLang("수익원 믹스 모델", "Revenue mix model")}
      >
        <span className="shrink-0 text-xs font-semibold text-fg-2">
          {pickLang("수익 모델", "Revenue Mix")}
        </span>
        {REVENUE_MIX_OPTIONS.map((item) => {
          const active = item.id === input.revenueMix;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`revenue-rea-mix-${item.id}`}
              aria-pressed={active}
              onClick={() => updateInput({ revenueMix: item.id })}
              className={
                active
                  ? "min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  : "min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>

      <div
        className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
        role="group"
        aria-label={pickLang("세무·배분 체계", "Tax and split regime")}
      >
        <span className="shrink-0 text-xs font-semibold text-fg-2">
          {pickLang("세무·배분", "Tax Regime")}
        </span>
        {TAX_REGIME_OPTIONS.map((item) => {
          const active = item.id === input.taxRegime;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`revenue-rea-tax-${item.id}`}
              aria-pressed={active}
              onClick={() => updateInput({ taxRegime: item.id })}
              className={
                active
                  ? "min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  : "min-h-11 shrink-0 whitespace-nowrap rounded-lg bg-panel px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          );
        })}
      </div>

      {/* 실시간 4축 수익 슬라이더 */}
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line/60 pt-4 md:grid-cols-2">
        {SLIDER_SPECS.map((spec) => {
          const value = input[spec.key];
          const label = pickLang(spec.labelKo, spec.labelEn);
          return (
            <div key={spec.key} className="rounded-xl border border-line bg-panel/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`rev-sim-${spec.key}`} className="text-xs font-semibold text-fg">
                  {label}
                </label>
                <span
                  data-testid={`revenue-sim-value-${spec.key}`}
                  className="text-xs font-semibold tabular-nums text-accent"
                >
                  {spec.format(value, isKo)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  data-testid={`revenue-sim-dec-${spec.key}`}
                  aria-label={pickLang(`${label} 줄이기`, `Decrease ${label}`)}
                  onClick={() => updateInput({ [spec.key]: Math.max(spec.min, value - spec.step) })}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                >
                  <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <input
                  id={`rev-sim-${spec.key}`}
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={value}
                  onChange={(event) => updateInput({ [spec.key]: Number(event.target.value) })}
                  className="rev-sim-range"
                />
                <button
                  type="button"
                  data-testid={`revenue-sim-inc-${spec.key}`}
                  aria-label={pickLang(`${label} 늘리기`, `Increase ${label}`)}
                  onClick={() => updateInput({ [spec.key]: Math.min(spec.max, value + spec.step) })}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                >
                  <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 실시간 OKLCH 스펙트럼 실수령 결과 카드 */}
      <div className="mt-4 rounded-xl border border-line bg-panel p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-fg-2">
              {pickLang("월 예상 실수령액 (예시)", "Estimated monthly net")}
            </p>
            <p
              data-testid="revenue-sim-net-output"
              className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-fg"
            >
              {formatMoney(result.netCreatorKrw, isKo)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-fg-2">
              {pickLang("월 총 예상 매출", "Estimated monthly gross")}
            </p>
            <p
              data-testid="revenue-sim-gross-output"
              className="mt-1 text-lg font-semibold tabular-nums text-fg-2"
            >
              {formatMoney(result.grossKrw, isKo)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-fg-2">
              {pickLang("연간 환산 실수령", "Annualized net")}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-good">
              {formatMoney(result.annualizedNetKrw, isKo)}
            </p>
          </div>
        </div>

        {/* 스펙트럼 분해 막대 */}
        <div className="mt-3">
          <div className="rev-sim-bar-track" aria-hidden="true">
            {result.netCreatorKrw > 0 ? (
              <span className="rev-sim-bar-segment rev-sim-bar-segment--net" style={{ flexGrow: result.netCreatorKrw }} />
            ) : null}
            {result.partnerSplitKrw > 0 ? (
              <span className="rev-sim-bar-segment rev-sim-bar-segment--partner" style={{ flexGrow: result.partnerSplitKrw }} />
            ) : null}
            {result.taxWithholdingKrw > 0 ? (
              <span className="rev-sim-bar-segment rev-sim-bar-segment--tax" style={{ flexGrow: result.taxWithholdingKrw }} />
            ) : null}
            {result.platformAndPgFeeKrw > 0 ? (
              <span className="rev-sim-bar-segment rev-sim-bar-segment--fee" style={{ flexGrow: result.platformAndPgFeeKrw }} />
            ) : null}
          </div>
          <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs tabular-nums text-fg-2">
            <div className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-good" aria-hidden="true" />
              <dt>{pickLang("작가 실수령", "Creator net")}</dt>
              <dd className="font-semibold text-fg">{result.netSharePct}%</dd>
            </div>
            {result.partnerSplitKrw > 0 ? (
              <div className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-accent-2" aria-hidden="true" />
                <dt>{pickLang("어시스턴트 30%", "Partner 30%")}</dt>
                <dd className="font-semibold text-fg">
                  {formatMoney(result.partnerSplitKrw, isKo)} ({result.partnerSharePct}%)
                </dd>
              </div>
            ) : null}
            <div className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-warn" aria-hidden="true" />
              <dt>{pickLang("원천세/조약세", "Withholding tax")}</dt>
              <dd className="font-semibold text-fg">
                {formatMoney(result.taxWithholdingKrw, isKo)} ({result.taxSharePct}%)
              </dd>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-fg-3" aria-hidden="true" />
              <dt>{pickLang("플랫폼·결제 수수료", "Platform & payment fee")}</dt>
              <dd className="font-semibold text-fg">
                {formatMoney(result.platformAndPgFeeKrw, isKo)} ({result.feeSharePct}%)
              </dd>
            </div>
          </dl>
        </div>

        {/* 월 목표 달성률 */}
        <div className="mt-3 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg-2">
              <Target size={14} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
              {pickLang("월 목표 달성률", "Monthly goal progress")} ({formatMoney(input.monthlyGoalKrw, isKo)})
            </span>
            <span data-testid="revenue-sim-goal-pct" className="font-semibold tabular-nums text-fg">
              {result.goalProgressPct}%
            </span>
          </div>
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-raised"
            role="progressbar"
            aria-label={pickLang("월 목표 달성률", "Monthly goal progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={result.goalProgressPct}
          >
            <div
              className="rev-sim-goal-fill"
              style={{ transform: `scaleX(${result.goalProgressPct / 100})` }}
            />
          </div>
        </div>
      </div>

      <p
        data-testid="revenue-dashboard-rea-status"
        aria-live="polite"
        className="mt-3 rounded-xl bg-panel px-3 py-2 font-mono text-xs leading-[1.6] text-fg"
      >
        {pickLang(
          `${activeMix.ko} + ${activeTax.ko} · ${activeMix.detailKo} (${activeTax.detailKo})`,
          `${activeMix.en} + ${activeTax.en} · ${activeMix.detailEn} (${activeTax.detailEn})`,
        )}
      </p>
    </section>
  );
}
