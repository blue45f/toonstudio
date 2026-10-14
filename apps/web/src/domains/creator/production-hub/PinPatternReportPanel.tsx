import { CheckCircle2, Plus } from "lucide-react";

import {
  type PinPatternEntry,
  type PinPatternReport,
} from "./pin-pattern-report-model";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

function PatternRow({
  entry,
  rank,
  promoted,
  onPromote,
}: {
  readonly entry: PinPatternEntry;
  readonly rank: number;
  readonly promoted: boolean;
  readonly onPromote?: (entry: PinPatternEntry) => void;
}) {
  const bt = useBilingual("PinPatternReportPanel");
  const sharePercent = Math.round(entry.share * 100);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.6875rem] font-bold text-accent">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-semibold leading-5 text-fg">{bt(entry.label.ko, entry.label.en)}</p>
          <ProductionPill tone="accent">
            {bt(`${entry.count}건`, `${entry.count}`)} · {sharePercent}%
          </ProductionPill>
          {entry.urgentCount > 0 ? (
            <ProductionPill tone="danger">{bt(`긴급 ${entry.urgentCount}건`, `${entry.urgentCount} urgent`)}</ProductionPill>
          ) : null}
          {entry.pageCount > 1 ? (
            <ProductionPill>{bt(`${entry.pageCount}개 페이지`, `${entry.pageCount} pages`)}</ProductionPill>
          ) : null}
          {promoted ? (
            <ProductionPill tone="success">
              <CheckCircle2 className="size-3" aria-hidden="true" />
              {bt("승격됨", "Promoted")}
            </ProductionPill>
          ) : null}
        </div>
        {entry.examples.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5">
            {entry.examples.map((example) => (
              <li key={example.threadId} className="truncate text-[0.6875rem] leading-4 text-fg-3">
                “{example.body}”
              </li>
            ))}
          </ul>
        ) : null}
        {!entry.promotable && !promoted ? (
          <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
            {bt("반복으로 확인되면 승격할 수 있어요.", "Promotable once it repeats enough.")}
          </p>
        ) : null}
      </div>
      {entry.promotable && !promoted && onPromote ? (
        <button
          type="button"
          className={buttonClass({ variant: "outline", size: "sm", className: "min-h-9 shrink-0 gap-1" })}
          onClick={() => onPromote(entry)}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {bt("QC·플레이북 승격", "Promote")}
        </button>
      ) : null}
    </li>
  );
}

/**
 * 검수 핀 패턴 리포트 (REPORT R-2).
 *
 * 해결된 핀을 유형별로 집계한 '반복 지적 TOP'을 보여 주고, 반복이 확인된
 * 패턴은 QC 체크리스트 항목·팀 플레이북 규칙으로 승격할 수 있게 한다.
 * 집계·승격 재료는 pin-pattern-report-model이 만들고, 이 컴포넌트는 표시와
 * 승격 요청 전달만 한다 (승격의 영속 저장은 호스트의 몫).
 */
export function PinPatternReportPanel({
  report,
  promotedCategoryIds,
  onPromote,
  className,
}: {
  readonly report: PinPatternReport;
  /** 이미 승격된 유형 ID 목록. 승격 버튼 대신 '승격됨'으로 표시한다. */
  readonly promotedCategoryIds?: readonly string[];
  readonly onPromote?: (entry: PinPatternEntry) => void;
  readonly className?: string;
}) {
  const bt = useBilingual("PinPatternReportPanel");
  const promotedSet = new Set(promotedCategoryIds ?? []);
  return (
    <ProductionSectionCard
      className={cn(className)}
      title={bt("검수 핀 패턴 리포트", "Review pin pattern report")}
      description={bt(
        `해결된 핀 ${report.resolvedPinCount}건을 유형별로 모았어요. 자주 반복되는 지적은 QC 항목과 팀 플레이북 규칙으로 승격해 다음 회차부터 미리 막을 수 있어요.`,
        `${report.resolvedPinCount} resolved pin(s) grouped by type. Promote recurring notes to QC checks and playbook rules to prevent them next episode.`,
      )}
    >
      {report.topPatterns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-panel p-4 text-xs leading-5 text-fg-3">
          {bt(
            "아직 해결된 검수 핀이 없어요. 핀이 해결되면 반복되는 지적 패턴이 여기에 모입니다.",
            "No resolved review pins yet. Repeated note patterns will collect here as pins get resolved.",
          )}
        </p>
      ) : (
        <ol className="space-y-2">
          {report.topPatterns.map((entry, index) => (
            <PatternRow
              key={entry.categoryId}
              entry={entry}
              rank={index + 1}
              promoted={promotedSet.has(entry.categoryId)}
              onPromote={onPromote}
            />
          ))}
        </ol>
      )}
    </ProductionSectionCard>
  );
}
