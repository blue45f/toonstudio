/**
 * RevenueSpectrumBar.tsx
 *
 * 수익원 구성 스펙트럼 바 — 선택 기간의 수익원별 비중을 한 줄로 보여준다.
 * 구간 너비는 실제 금액 비중 그대로이고, 범례(점·라벨·%)가
 * 스크린 리더로도 읽히는 표현을 맡는다 (막대 자체는 장식 처리).
 */
import type { RevenueSourceId, RevenueSourceSummary } from "../models/revenue-model";
import { revenueSourceColor, sharePercent } from "./revenue-source-presentation";

export function RevenueSpectrumBar({
  bySource,
  total,
  sourceLabel,
}: {
  readonly bySource: readonly RevenueSourceSummary[];
  readonly total: number;
  readonly sourceLabel: (sourceId: RevenueSourceId) => string;
}) {
  const segments = bySource.filter((bucket) => bucket.amount > 0 && total > 0);
  if (segments.length === 0) return null;

  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-fg/5" aria-hidden>
        {segments.map((bucket) => (
          <div
            key={bucket.sourceId}
            className="h-full"
            style={{
              width: `${(bucket.amount / total) * 100}%`,
              backgroundColor: revenueSourceColor(bucket.sourceId),
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((bucket) => (
          <li key={bucket.sourceId} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: revenueSourceColor(bucket.sourceId) }}
              aria-hidden
            />
            {sourceLabel(bucket.sourceId)}
            <span className="font-semibold tabular-nums text-fg">
              {sharePercent(bucket.amount, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
