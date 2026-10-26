import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ReceiptText, ShieldCheck } from "lucide-react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { ProductionPill, ProductionSectionCard } from "./production-ui";
import {
  calculateDivisionSettlementItem,
  DEFAULT_DIVISION_OUTSOURCING_ORDERS,
  type DivisionOutsourcingOrder,
  type EscrowOrderGateState,
  summarizeDivisionSettlementLedger,
} from "./production-outsourcing-settlement-guard-model";

export function ProductionOutsourcingSettlementGuardSuite() {
  const bt = useBilingual("ProductionOutsourcingSettlementGuardSuite");
  const [orders, setOrders] = useState<readonly DivisionOutsourcingOrder[]>(
    DEFAULT_DIVISION_OUTSOURCING_ORDERS,
  );

  const rows = useMemo(
    () => orders.map((order) => ({ order, calc: calculateDivisionSettlementItem(order) })),
    [orders],
  );

  const summary = useMemo(
    () => summarizeDivisionSettlementLedger(orders),
    [orders],
  );

  const handleAdjustRevisionRound = (orderId: string, delta: number) => {
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId
          ? {
              ...order,
              requestedRevisionRounds: Math.max(0, order.requestedRevisionRounds + delta),
            }
          : order,
      ),
    );
  };

  const handleCycleEscrowState = (orderId: string) => {
    const nextMap: Record<EscrowOrderGateState, EscrowOrderGateState> = {
      "escrow-funded": "inspection-gate",
      "inspection-gate": "released-settled",
      "released-settled": "escrow-funded",
    };
    setOrders((prev) =>
      prev.map((order) =>
        order.id === orderId ? { ...order, escrowState: nextMap[order.escrowState] } : order,
      ),
    );
  };

  const handleSettleAllEscrow = () => {
    setOrders((prev) =>
      prev.map((order) => ({
        ...order,
        escrowState: "released-settled",
      })),
    );
  };

  return (
    <ProductionSectionCard
      title={bt(
        "분업 외주 에스크로 정산 · 무료 수정 횟수(Scope Creep) 가드 · 원천징수/비즈 후불 원장 (Kmong Enterprise)",
        "Division Outsourcing Escrow Settlement · Revision Scope Guard · 3.3% Withholding / Biz Postpaid Ledger",
      )}
      description={bt(
        "크몽 엔터프라이즈(/enterprise/simple-apply/gate · /kmongbiz/biz-postpaid/histories) 역공학 근거를 바탕으로 컷 단가·난이도 할증·무료 수정 초과 할증·3.3% 원천징수/10% 세금계산서를 자동 정산합니다.",
        "Automated per-cut rate, scene difficulty multiplier, excess revision surcharge guard, and 3.3% freelancer withholding vs. 10% corporate VAT settlement ledger.",
      )}
      action={(
        <div className="flex flex-wrap items-center gap-1.5">
          <ProductionPill tone={summary.scopeCreepOrderCount > 0 ? "warning" : "success"}>
            {bt(
              `수정 초과 할증 ${summary.scopeCreepOrderCount}건`,
              `${summary.scopeCreepOrderCount} Revision Surcharge(s)`,
            )}
          </ProductionPill>
          <ProductionPill tone={summary.settledOrderCount === summary.totalOrders ? "success" : "accent"}>
            {bt(
              `에스크로 정산 ${summary.settledOrderCount}/${summary.totalOrders}`,
              `Settled ${summary.settledOrderCount}/${summary.totalOrders}`,
            )}
          </ProductionPill>
        </div>
      )}
    >
      {/* Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.6875rem] text-fg-3">{bt("총 공급가액 (난이도·할증 포함)", "Gross Supply Amount")}</p>
          <p className="mt-1 text-base font-black text-fg">
            {summary.totalGrossSupplyKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {bt(
              `수정 횟수 초과 할증 ${summary.totalRevisionSurchargeKrw.toLocaleString("ko-KR")}원 포함`,
              `Includes ${summary.totalRevisionSurchargeKrw.toLocaleString("ko-KR")} KRW revision surcharge`,
            )}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.6875rem] text-fg-3">{bt("프리랜서 3.3% 원천징수 공제액", "3.3% Withholding Tax Deducted")}</p>
          <p className="mt-1 text-base font-black text-fg">
            -{summary.totalWithholdingTaxKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {bt("국세 3.0% + 지방소득세 0.3% 원천징수 영수증 자동 분리", "3.0% national + 0.3% local withholding receipt")}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[0.6875rem] text-fg-3">{bt("법인·비즈 후불 부가세 (VAT 10%)", "Corporate VAT (10% Postpaid)")}</p>
          <p className="mt-1 text-base font-black text-fg">
            +{summary.totalVatKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
          </p>
          <p className="mt-0.5 text-[0.6875rem] text-fg-3">
            {bt("전자세금계산서·법인카드 후불 정산 기준", "Electronic tax invoice / corporate postpaid")}
          </p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.6875rem] text-fg-3">{bt("실지급·청구 확정 총액", "Total Net Disbursement")}</p>
            <Calculator className="size-3.5 text-accent" aria-hidden="true" />
          </div>
          <p className="mt-1 text-base font-black text-accent">
            {summary.totalNetDisbursementKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
          </p>
          <button
            type="button"
            className="mt-1.5 text-[0.6875rem] font-bold text-accent underline-offset-2 hover:underline"
            onClick={handleSettleAllEscrow}
          >
            {bt("전 공정 에스크로 검수 승인 및 정산 완료 처리", "Approve & Release All Escrow Orders")}
          </button>
        </div>
      </div>

      {/* Division Outsourcing Settlement Table */}
      <div
        role="region"
        aria-labelledby="outsourcing-settlement-ledger-caption"
        className="mt-4 overflow-x-auto rounded-xl border border-line bg-panel"
      >
        <table className="w-full border-collapse text-left text-xs">
          <caption id="outsourcing-settlement-ledger-caption" className="sr-only">
            {bt("웹툰 분업 공정별 외주 정산 및 수정 횟수 가드 원장", "Webtoon division outsourcing settlement and revision round guard ledger")}
          </caption>
          <thead className="sticky top-0 z-10 border-b border-line bg-raised text-[0.6875rem] text-fg-3">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("분업 공정 · 파트너", "Stage & Partner")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("컷수 × 단가 (난이도)", "Cuts × Rate (Tier)")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("수정 횟수 가드", "Revision Round Guard")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("세무 유형", "Tax & Billing")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("실지급/청구액", "Net Settlement")}</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">{bt("에스크로 게이트", "Escrow Gate")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(({ order, calc }) => (
              <tr key={order.id} className="hover:bg-raised/60">
                <th scope="row" className="px-3 py-2.5 font-bold text-fg">
                  <div>{bt(order.stageLabelKo, order.stageLabelEn)}</div>
                  <div className="mt-0.5 text-[0.6875rem] font-normal text-fg-3">
                    {order.partnerName} · <span className="font-mono">{order.orderCode}</span>
                  </div>
                </th>
                <td className="px-3 py-2.5 text-fg-2">
                  <div>
                    {order.contractedCuts}컷 × {order.baseCutRateKrw.toLocaleString("ko-KR")}원 (×{calc.difficultyMultiplier})
                  </div>
                  <div className="text-[0.6875rem] text-fg-3">
                    {bt("기본 공급가", "Base")}: {calc.baseSupplyKrw.toLocaleString("ko-KR")}원
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-fg">
                      {bt(
                        `요청 ${order.requestedRevisionRounds}회 / 무료 ${order.freeRevisionRoundsIncluded}회`,
                        `Used ${order.requestedRevisionRounds} / Free ${order.freeRevisionRoundsIncluded}`,
                      )}
                    </span>
                    <button
                      type="button"
                      aria-label={bt(`${order.partnerName} 수정 횟수 감소`, `Decrease revisions for ${order.partnerName}`)}
                      className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6875rem] font-bold hover:bg-panel"
                      onClick={() => handleAdjustRevisionRound(order.id, -1)}
                    >
                      -
                    </button>
                    <button
                      type="button"
                      aria-label={bt(`${order.partnerName} 수정 횟수 증가`, `Increase revisions for ${order.partnerName}`)}
                      className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.6875rem] font-bold hover:bg-panel"
                      onClick={() => handleAdjustRevisionRound(order.id, 1)}
                    >
                      +
                    </button>
                  </div>
                  {calc.scopeCreepDetected ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-bad">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {bt(
                        `초과 ${calc.excessRevisionRounds}회 (+${calc.revisionSurchargeKrw.toLocaleString("ko-KR")}원)`,
                        `+${calc.excessRevisionRounds} extra (+${calc.revisionSurchargeKrw.toLocaleString("ko-KR")} KRW)`,
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] text-good">
                      <ShieldCheck className="size-3" aria-hidden="true" />
                      {bt("무료 수정 범위 내", "Within free revisions")}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-fg-2">
                  <div className="inline-flex items-center gap-1 font-semibold">
                    <ReceiptText className="size-3.5 text-fg-3" aria-hidden="true" />
                    {order.taxMode === "freelancer-withholding-3.3"
                      ? bt("3.3% 사업소득 원천징수", "3.3% Freelancer Withholding")
                      : bt("법인 세금계산서 (VAT 10%)", "Corporate Tax Invoice (10%)")}
                  </div>
                  <div className="text-[0.6875rem] text-fg-3">
                    {order.taxMode === "freelancer-withholding-3.3"
                      ? bt(`공제 -${calc.withholdingTax33Krw.toLocaleString("ko-KR")}원`, `Deducted -${calc.withholdingTax33Krw.toLocaleString("ko-KR")} KRW`)
                      : bt(`부가세 +${calc.vat10Krw.toLocaleString("ko-KR")}원`, `VAT +${calc.vat10Krw.toLocaleString("ko-KR")} KRW`)}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-black text-fg">
                  {calc.netPayoutOrInvoiceKrw.toLocaleString("ko-KR")}{bt("원", " KRW")}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    className={buttonClass({ size: "sm", variant: "secondary" })}
                    onClick={() => handleCycleEscrowState(order.id)}
                  >
                    {order.escrowState === "released-settled" ? (
                      <CheckCircle2 className="mr-1 size-3.5 text-good" aria-hidden="true" />
                    ) : null}
                    {order.escrowState === "escrow-funded"
                      ? bt("에스크로 예치됨", "Escrow Funded")
                      : order.escrowState === "inspection-gate"
                        ? bt("검수 게이트 대기", "Inspection Gate")
                        : bt("정산 지급 완료", "Released & Settled")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ProductionSectionCard>
  );
}
