/**
 * 포스타입 Postype (공동창작 시리즈 유료 회차·후원금 RS 정산) +
 * Monday.com (크로스보드 미러 컬럼 & 100% 배터리 지분 게이지)
 * 역공학 내재화 스위트 (`CollaborationEditorPage.tsx` 탑재).
 */

import { useId, useMemo, useState } from "react";
import { CheckCircle2, Coins, Layers, Sparkles } from "lucide-react";

import {
  DEFAULT_COAUTHOR_LANES,
  evaluateCoauthorRevenueMirror,
  type CoauthorLaneShareInput,
  type CoauthorSettlementCycle,
} from "./collaboration-coauthor-revenue-mirror-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const SETTLEMENT_CYCLE_OPTIONS: readonly {
  readonly value: CoauthorSettlementCycle;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  {
    value: "monthly-25th",
    labelKo: "매월 25일 정기 RS 정산",
    labelEn: "Monthly 25th RS Payout",
  },
  {
    value: "per-episode-release",
    labelKo: "유료 회차 발행 즉시 정산",
    labelEn: "Per-Episode Instant Split",
  },
  {
    value: "mg-recoup-then-rs",
    labelKo: "최소보장금(MG) 차감 후 RS",
    labelEn: "MG Recoup Then RS Split",
  },
];

export function CollaborationCoauthorRevenueMirrorSuite({
  onApplySummaryToTerms,
}: {
  readonly onApplySummaryToTerms?: (summaryLineKo: string) => void;
}) {
  const bt = useBilingual("CollaborationCoauthorRevenueMirrorSuite");
  const tableCaptionId = useId();
  const ledgerCodeId = useId();

  const [ledgerCode, setLedgerCode] = useState("POSTYPE-RS-2026");
  const [settlementCycle, setSettlementCycle] =
    useState<CoauthorSettlementCycle>("monthly-25th");
  const [projectedGrossKrw, setProjectedGrossKrw] = useState<number>(12_000_000);
  const [includeFanSponsorshipPool, setIncludeFanSponsorshipPool] =
    useState<boolean>(true);
  const [lanes, setLanes] = useState<readonly CoauthorLaneShareInput[]>(
    () => DEFAULT_COAUTHOR_LANES,
  );

  const evaluation = useMemo(
    () =>
      evaluateCoauthorRevenueMirror({
        ledgerCode,
        settlementCycle,
        projectedGrossKrw,
        platformFeePct: 10,
        includeFanSponsorshipPool,
        lanes,
      }),
    [ledgerCode, settlementCycle, projectedGrossKrw, includeFanSponsorshipPool, lanes],
  );

  function applyEqualSplitPreset() {
    setLanes((prev) =>
      prev.map((lane) => ({
        ...lane,
        revenueSharePct: 25,
        secondaryRightsPct: 25,
        mirrorColumnLinked: true,
      })),
    );
  }

  function applyStandardWebtoonCrewPreset() {
    setLanes(DEFAULT_COAUTHOR_LANES);
  }

  return (
    <section
      data-testid="collaboration-coauthor-revenue-mirror-suite"
      aria-label={bt(
        "포스타입·Monday.com 역공학 공동창작 수익배분(RS) 및 크로스보드 미러링 원장",
        "Postype & Monday.com Co-Author Revenue Share & Cross-Board Mirror Ledger",
      )}
      className="rounded-2xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
              <Coins className="size-3.5" aria-hidden="true" />
              {bt("Postype Co-Author RS · Monday.com Mirror Column 내재화", "Postype Co-Author RS · Monday.com Mirror Column")}
            </span>
            <span
              data-testid="coauthor-rs-battery-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-xs font-semibold tabular-nums text-fg-2"
            >
              <Layers className="size-3.5 text-good" aria-hidden="true" />
              {bt(
                `연재 RS ${evaluation.totalSharePct}% · 2차 판권 ${evaluation.totalSecondaryRightsPct}% · 미러 ${evaluation.mirroredLaneCount}/4`,
                `Episode RS ${evaluation.totalSharePct}% · Secondary ${evaluation.totalSecondaryRightsPct}% · Mirrored ${evaluation.mirroredLaneCount}/4`,
              )}
            </span>
          </div>
          <h2 className="mt-2 text-base font-bold text-fg sm:text-lg">
            {bt(
              "공동창작 시리즈 4대 공정 수익배분(RS) 배터리 & Monday.com 크로스보드 미러링",
              "Co-Authored Series 4-Lane Revenue Share Battery & Cross-Board Mirroring",
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "유료 회차 미리보기·소장권·포스타입 팬 후원금·2차 판권 지분을 4대 공정별로 투명하게 설계하고, 정합성 100% 검증 결과를 공고 본문과 프로덕션 정산 미러 컬럼에 즉시 동기화합니다.",
              "Design transparent revenue splits across 4 webtoon production lanes and sync 100%-verified share ratios to your gig post and production mirror columns.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="coauthor-equal-split-btn"
            onClick={applyEqualSplitPreset}
            className="rounded-xl border border-line bg-raised px-3 py-1.5 text-xs font-bold text-fg-2 hover:border-accent"
          >
            {bt("4인 균등 배분 (25%씩)", "4-Way Equal Split (25%)")}
          </button>
          <button
            type="button"
            data-testid="coauthor-standard-preset-btn"
            onClick={applyStandardWebtoonCrewPreset}
            className="inline-flex items-center gap-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {bt("웹툰 표준 지분 (35:35:20:10)", "Standard Crew (35:35:20:10)")}
          </button>
        </div>
      </div>

      {/* 정산 주기 선택 컨트롤 (modern-web-guidance: forms — <6 mutually exclusive options as radio buttons inside fieldset/legend) */}
      <div className="mt-4 grid gap-4 rounded-xl border border-line bg-raised/40 p-3.5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-fg">
            {bt("포스타입·연재 정산 정산 주기 선택", "Settlement Payout Cycle")}
          </legend>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {SETTLEMENT_CYCLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg-2"
              >
                <input
                  type="radio"
                  name="coauthor-settlement-cycle"
                  value={option.value}
                  checked={settlementCycle === option.value}
                  data-testid={`settlement-cycle-${option.value}`}
                  onChange={() => setSettlementCycle(option.value)}
                />
                <span>{bt(option.labelKo, option.labelEn)}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-fg-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                name="include-fan-sponsorship"
                data-testid="toggle-fan-sponsorship"
                checked={includeFanSponsorshipPool}
                onChange={(event) =>
                  setIncludeFanSponsorshipPool(event.target.checked)
                }
              />
              <span>
                {bt(
                  "포스타입 팬 후원금·멤버십 보너스 풀(+8%) 공동 배분 포함",
                  "Include Postype fan sponsorship bonus pool (+8%)",
                )}
              </span>
            </label>
          </div>
        </fieldset>

        <div className="flex flex-col justify-between gap-1.5">
          <label htmlFor={ledgerCodeId} className="text-xs font-bold text-fg">
            {bt("미러 원장 식별 코드", "Mirror Ledger Code")}
          </label>
          <input
            id={ledgerCodeId}
            name="mirror-ledger-code"
            type="text"
            value={ledgerCode}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            onChange={(event) => setLedgerCode(event.target.value)}
            className="rounded-lg border border-line bg-panel px-2.5 py-1.5 font-mono text-xs text-fg"
          />
          <button
            type="button"
            data-testid="coauthor-gross-boost-btn"
            onClick={() => setProjectedGrossKrw((v) => v + 3_000_000)}
            className="rounded-lg border border-line bg-panel px-2 py-1 text-[0.6875rem] font-semibold text-fg-2 hover:border-accent"
          >
            {bt(
              `예상 월 총매출: ${projectedGrossKrw.toLocaleString("ko-KR")}원 (+300만 시뮬레이션)`,
              `Gross: KRW ${projectedGrossKrw.toLocaleString("en-US")} (+3M)`,
            )}
          </button>
        </div>
      </div>

      {/* 반응형 지분 배분 테이블 (modern-web-guidance: responsive-table — tabindex="0" role="region" aria-labelledby + sticky headers) */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Modern Web Guidance responsive-table keyboard scrollable region */}
      <div tabIndex={0}
        role="region"
        aria-labelledby={tableCaptionId}
        className="mt-4 max-w-full overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <caption id={tableCaptionId} className="sr-only">
            {bt(
              "공동창작 공정별 연재 수익배분 및 2차 판권 지분 시뮬레이션 표",
              "Co-author production lane revenue share and secondary rights table",
            )}
          </caption>
          <thead className="sticky top-0 z-10 bg-raised text-fg-2">
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("분업 공정 파트너", "Production Lane")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("연재·후원 RS 지분", "Episode & Fan RS %")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("2차 판권·MD 지분", "Secondary Rights %")}
              </th>
              <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                {bt("월 예상 정산액 (세전)", "Est. Monthly Net Payout")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-panel">
            {evaluation.lanes.map((lane) => (
              <tr key={lane.laneId} data-testid={`coauthor-lane-row-${lane.laneId}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-panel px-3 py-2.5 font-bold text-fg"
                >
                  {bt(lane.roleLabelKo, lane.roleLabelEn)}
                </th>
                <td className="px-3 py-2.5 font-mono font-bold text-accent tabular-nums">
                  {lane.revenueSharePct}%
                </td>
                <td className="px-3 py-2.5 font-mono text-fg-2 tabular-nums">
                  {lane.secondaryRightsPct}%
                </td>
                <td
                  data-testid={`coauthor-payout-${lane.laneId}`}
                  className="px-3 py-2.5 font-mono font-bold text-fg tabular-nums"
                >
                  {lane.estimatedMonthlyNetKrw.toLocaleString("ko-KR")}원
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        aria-live="polite"
        data-testid="coauthor-rs-status-banner"
        className={`mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
          evaluation.allocationBalanced
            ? "border-good/40 bg-good/10 text-fg"
            : "border-warn/40 bg-warn/10 text-fg"
        }`}
      >
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden="true" />
          <span>{bt(evaluation.statusSummaryKo, evaluation.statusSummaryEn)}</span>
        </span>
        {onApplySummaryToTerms && (
          <button
            type="button"
            data-testid="coauthor-insert-terms-btn"
            onClick={() => onApplySummaryToTerms(evaluation.statusSummaryKo)}
            className="rounded-lg border border-accent/40 bg-panel px-2.5 py-1 text-[0.6875rem] font-bold text-accent hover:bg-accent/10"
          >
            {bt("공고 권리·보수 조건에 반영", "Insert into post terms")}
          </button>
        )}
      </div>
    </section>
  );
}
