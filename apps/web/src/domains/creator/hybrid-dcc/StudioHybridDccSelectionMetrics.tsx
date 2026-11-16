import { useMemo } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { computeStudioHybridDccMeshQualitySummary } from "./studio-hybrid-dcc-primitives";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioHybridDccObjectTransform } from "./studio-hybrid-dcc-object-transform";

export interface StudioHybridDccSelectionMetricsProps {
  readonly mesh: StudioEditableMesh;
  readonly revision: number;
  readonly transform?: StudioHybridDccObjectTransform | null;
}

function formatMeters(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}m` : "0.00m";
}

/** 활성 오브젝트의 꼭짓점·면·삼각형·실측 치수(W×H×D) 및 매니폴드 닫힘 상태를 표시한다. */
export function StudioHybridDccSelectionMetrics({
  mesh,
  revision,
  transform,
}: StudioHybridDccSelectionMetricsProps) {
  const bt = useBilingual("StudioHybridDccSelectionMetrics");
  const summary = useMemo(() => computeStudioHybridDccMeshQualitySummary(mesh), [mesh]);
  const scaleX = Math.abs(transform?.scale[0] ?? 1);
  const scaleY = Math.abs(transform?.scale[1] ?? 1);
  const scaleZ = Math.abs(transform?.scale[2] ?? 1);
  const width = summary.dimensions.width * scaleX;
  const height = summary.dimensions.height * scaleY;
  const depth = summary.dimensions.depth * scaleZ;

  return (
    <div className="space-y-2" data-studio-hybrid-dcc-selection-metrics="true">
      <dl className="grid grid-cols-2 gap-1.5 text-xs">
        {([
          [bt("꼭짓점", "Vertices"), summary.vertexCount],
          [bt("면", "Faces"), summary.faceCount],
          [bt("방향 모서리", "Half-edges"), summary.halfEdgeCount],
          [bt("편집 버전", "Revision"), revision],
        ] as const).map(([term, value]) => (
          <div key={term} className="rounded-lg border border-line/65 bg-card/85 p-2">
            <dt className="text-[0.6875rem] text-fg-3 [word-break:keep-all]">{term}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-fg">{value.toLocaleString("ko-KR")}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-lg border border-line bg-canvas/55 px-2.5 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-semibold text-fg-3 [word-break:keep-all]">
            {bt("외형 치수 (가로 × 높이 × 깊이)", "Dimensions (W × H × D)")}
          </span>
          <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.65rem] tabular-nums text-fg-2">
            {summary.triangleEstimate.toLocaleString("ko-KR")} tris
          </span>
        </div>
        <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-fg">
          {formatMeters(width)} × {formatMeters(height)} × {formatMeters(depth)}
        </p>
        <p
          className={cn(
            "mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold [word-break:keep-all]",
            summary.isWatertight
              ? "border-good/35 bg-good/10 text-good"
              : "border-warn/35 bg-warn/10 text-warn",
          )}
          data-studio-hybrid-dcc-manifold-status={summary.isWatertight ? "watertight" : "open-boundary"}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", summary.isWatertight ? "bg-good" : "bg-warn")}
          />
          {summary.isWatertight
            ? bt("닫힌 매니폴드 · 불리언·GLB·STL 안전", "Watertight manifold · Safe for CSG, GLB & STL")
            : formatI18nTemplate(
                bt(
                  "열린 경계 모서리 {count}개 · 평면/열린 셸",
                  "{count} open boundary half-edges · Open surface",
                ),
                { count: summary.boundaryHalfEdgeCount },
              )}
        </p>
      </div>
    </div>
  );
}
