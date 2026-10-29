import { ChevronDown, Gauge } from "lucide-react";
import { Suspense, useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { AggregatePreSerializationBufferPanel } from "./PreSerializationBufferPanel";
import { ProductionProjectDashboard } from "./ProductionProjectDashboard";
import { ProductionProjectLoading } from "./ProductionProjectLoading";
import type { ProductionSurfaceProps as SurfaceProps } from "./production-surface-props";

const ProductionManagementWorkspace = lazyRetry(() => import("./ProductionManagementWorkspace").then((module) => ({ default: module.ProductionManagementWorkspace })), "ProductionManagementWorkspace");
const ProductionStudioRevisionBridgePanel = lazyRetry(() => import("./ProductionStudioRevisionBridgePanel").then((module) => ({ default: module.ProductionStudioRevisionBridgePanel })), "ProductionStudioRevisionBridgePanel");

/**
 * 개요: 네 가지 판단(진행률·마감 임박 회차·내 할 일·최근 피드백)을 보여 준다.
 * 표지 무대는 여기 두지 않고 페이지 컬럼 맨 위(가이드·표면 헤더보다 앞)에
 * 세운다 — 이 안에 두면 무대가 첫 화면 폴드 아래로 밀려 표지가 잘렸다.
 * 위험 미리 보기·복구 계획·담당자 추천 같은 운영 상세는 펼칠 때만 계산해 그린다.
 */
export function ProductionOverviewSurface({ aggregate, access, roleLens, execute, executeStrict, isDemo, viewerAssignmentIds, viewerUserId }: SurfaceProps) {
  const bt = useBilingual("ProductionOverviewSurface");
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <div className="space-y-4">
      <ProductionProjectDashboard aggregate={aggregate} roleLens={roleLens} viewerAssignmentIds={viewerAssignmentIds} />
      <AggregatePreSerializationBufferPanel aggregate={aggregate} roleLens={roleLens} />
      <details
        className="group rounded-2xl border border-line bg-card"
        onToggle={(event) => setDetailOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Gauge className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-fg">{bt("운영 자세히 보기", "Operations detail")}</span>
              <span className="block truncate text-xs text-fg-3">{bt("건강 점수 근거·위험 미리 보기·복구 계획·담당자 추천·팀 작업량", "Health score evidence, risk outlook, recovery plans, assignee suggestions, workload")}</span>
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        {detailOpen ? (
          <Suspense fallback={<ProductionProjectLoading />}><div className="space-y-4 border-t border-line p-4">
            <ProductionManagementWorkspace aggregate={aggregate} roleLens={roleLens} execute={execute} executeRecovery={executeStrict} canEdit={access.edit} actorUserId={viewerUserId} />
            <ProductionStudioRevisionBridgePanel aggregate={aggregate} execute={execute} canEdit={access.edit} enabled={!isDemo} />
          </div></Suspense>
        ) : null}
      </details>
    </div>
  );
}
