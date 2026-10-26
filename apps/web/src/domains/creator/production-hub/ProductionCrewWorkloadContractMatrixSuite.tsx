/**
 * ClickUp (번아웃 방지 워크로드 용량 뷰) + 위시켓(Wishket 표준계약·크레딧·저작재산권 분리 매트릭스)
 * 역공학 내재화 컴포넌트 (`ProductionTeamSurface.tsx` 탑재).
 */

import { useMemo, useState } from "react";
import { ArrowRightLeft, CheckCircle2, FileSignature, Scale, Sparkles } from "lucide-react";

import {
  INITIAL_CREW_SEAT_CONTRACT_RECORDS,
  evaluateCrewWorkloadAndContractMatrix,
  rebalanceOverloadedInkingCuts,
  type CrewSeatContractRecord,
} from "./production-crew-workload-contract-matrix-model";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionCrewWorkloadContractMatrixSuite() {
  const bt = useBilingual("ProductionCrewWorkloadContractMatrixSuite");
  const [records, setRecords] = useState<readonly CrewSeatContractRecord[]>(
    INITIAL_CREW_SEAT_CONTRACT_RECORDS
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const summary = useMemo(
    () => evaluateCrewWorkloadAndContractMatrix(records),
    [records]
  );

  function handleRebalanceInking() {
    setRecords((prev) => rebalanceOverloadedInkingCuts(prev, 8));
    setStatusMessage(
      bt(
        "메인 작화 좌석의 초과 물량 8컷을 선화 어시스턴트 좌석으로 이관하여 주간 번아웃 상한 이내로 재조정했습니다.",
        "Rebalanced 8 overloaded cuts from Lead Art to Inking Assistant within safe weekly capacity."
      )
    );
  }

  function handleToggleContractSigned(seatId: string) {
    setRecords((prev) =>
      prev.map((seat) =>
        seat.seatId === seatId
          ? { ...seat, standardContractSigned: !seat.standardContractSigned }
          : seat
      )
    );
    setStatusMessage(
      bt(
        `좌석(${seatId})의 표준계약·크레딧 합의 서명 상태를 갱신했습니다.`,
        `Updated standard contract & credit agreement status for seat (${seatId}).`
      )
    );
  }

  return (
    <ProductionSectionCard
      title={bt(
        "제작진 주간 컷 용량(Burnout Guard) & 표준계약·크레딧 보호 매트릭스",
        "Crew Weekly Cut Capacity (Burnout Guard) & Standard Contract/Credit Matrix"
      )}
      description={bt(
        "ClickUp Workload Capacity & Wishket 표준계약 보호 체계 역공학 내재화 — 생산성 순위·감시 지표를 만들지 않고, 주간 컷 과부하 분담과 역할·저작권·크레딧 분리 합의를 검증합니다.",
        "Internalized from ClickUp Workload Capacity & Wishket Standard Contract Guard — prevents burnout overloads and verifies separated role, IP rights, and credit attribution agreements without surveillance rankings."
      )}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ProductionPill tone="accent">
            <Sparkles className="mr-1 inline size-3" aria-hidden="true" />
            {bt("ClickUp · Wishket 역공학", "ClickUp · Wishket Internalized")}
          </ProductionPill>
          <ProductionPill tone={summary.readinessScore >= 90 ? "success" : "warning"}>
            {bt(
              `보호 지수 ${summary.readinessScore}/100`,
              `Protection Score ${summary.readinessScore}/100`
            )}
          </ProductionPill>
        </div>
      }
    >
      <div
        data-testid="production-crew-workload-contract-matrix-suite"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel p-3.5">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-fg">
              {bt("과부하 좌석", "Overloaded Seats")}:{" "}
              <strong
                data-testid="crew-overloaded-count"
                className={summary.overloadedSeatCount > 0 ? "text-bad" : "text-good"}
              >
                {summary.overloadedSeatCount}
              </strong>
            </span>
            <span className="text-fg-3">·</span>
            <span className="font-semibold text-fg">
              {bt("표준계약·크레딧 준수 좌석", "Contract-Compliant Seats")}:{" "}
              <strong data-testid="crew-compliant-count" className="text-good">
                {summary.compliantSeatCount}/{summary.seats.length}
              </strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="rebalance-inking-cuts-btn"
              onClick={handleRebalanceInking}
              className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              {bt(
                "메인 작화 초과 8컷 → 선화 어시 분담 이관",
                "Rebalance 8 Cuts: Lead Art → Inking Assist"
              )}
            </button>
          </div>
        </div>

        <div aria-live="polite">
          {statusMessage ? (
            <p
              data-testid="crew-matrix-status-banner"
              className="rounded-xl border border-good/40 bg-good/10 px-3.5 py-2 text-xs font-semibold text-fg"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-panel p-3">
          <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[0.6875rem] text-fg-3">
                <th className="py-2 pr-3">{bt("역할 좌석 · 작업자", "Role Seat & Member")}</th>
                <th className="px-2 py-2">{bt("주간 배정 / 상한 컷", "Assigned / Max Cuts")}</th>
                <th className="px-2 py-2">{bt("공식 크레딧 표기", "Public Credit Role")}</th>
                <th className="px-2 py-2">{bt("계약 유형 · 2차권 분리", "Contract & 2nd IP")}</th>
                <th className="px-2 py-2">{bt("표준계약 서명", "Contract Signed")}</th>
                <th className="pl-2 py-2">{bt("권고 진단", "Protection Advisory")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.seats.map((seat) => {
                const loadTone =
                  seat.loadState === "overloaded"
                    ? "danger"
                    : seat.loadState === "near-limit"
                      ? "warning"
                      : "success";
                return (
                  <tr
                    key={seat.seatId}
                    data-testid={`crew-seat-row-${seat.seatId}`}
                    className="border-b border-line/60 last:border-b-0"
                  >
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-fg">
                        {bt(seat.roleTitleKo, seat.roleTitleEn)}
                      </p>
                      <p className="text-[0.6875rem] text-fg-3">
                        {bt(seat.assigneeNameKo, seat.assigneeNameEn)}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-fg">
                          {seat.assignedEpisodeCuts}/{seat.weeklyMaxCutCapacity}컷 ({seat.utilizationPercent}%)
                        </span>
                        <ProductionPill tone={loadTone}>
                          {seat.loadState === "overloaded"
                            ? bt("과부하", "Overloaded")
                            : seat.loadState === "near-limit"
                              ? bt("상한 근접", "Near Cap")
                              : bt("적정", "Balanced")}
                        </ProductionPill>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-fg-2">
                      {bt(seat.creditAttributionRoleKo, seat.creditAttributionRoleEn)}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-2">
                        <Scale className="size-3 text-accent" aria-hidden="true" />
                        {seat.contractType} ·{" "}
                        {seat.secondaryRightsSeparated
                          ? bt("2차권 별도합의", "2nd IP Separated")
                          : bt("미분리", "Unseparated")}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        data-testid={`toggle-contract-btn-${seat.seatId}`}
                        onClick={() => handleToggleContractSigned(seat.seatId)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[0.6875rem] font-bold transition-colors ${
                          seat.standardContractSigned
                            ? "border-good/40 bg-good/10 text-good"
                            : "border-warn/40 bg-warn/10 text-warn"
                        }`}
                      >
                        {seat.standardContractSigned ? (
                          <>
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            {bt("서명 완료", "Signed")}
                          </>
                        ) : (
                          <>
                            <FileSignature className="size-3" aria-hidden="true" />
                            {bt("서명 확인", "Sign Contract")}
                          </>
                        )}
                      </button>
                    </td>
                    <td className="pl-2 py-2.5 text-[0.6875rem] leading-4 text-fg-2">
                      {bt(seat.advisoryKo, seat.advisoryEn)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ProductionSectionCard>
  );
}
