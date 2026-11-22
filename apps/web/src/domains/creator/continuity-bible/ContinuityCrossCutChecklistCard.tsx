/**
 * 컨티뉴이티 바이블 컷 간 연속성 대조 체크리스트 & 수정 컷 점프 요약 카드 (Calm Atelier · ₩0 로컬).
 */

import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardCopy, Layers } from "lucide-react";
import { useState } from "react";

import {
  formatCrossCutJumpSummaryText,
  type CrossCutChecklistItem,
  type CrossCutContinuityReport,
  type CrossCutTraitCategory,
  type RevisionCutJumpTarget,
} from "./continuity-cross-cut-checklist";

export interface ContinuityCrossCutChecklistCardProps {
  readonly report: CrossCutContinuityReport;
  readonly activeJumpCutId: string | null;
  readonly onJumpToCut: (target: RevisionCutJumpTarget) => void;
  readonly onClearJumpCut: () => void;
  readonly onResolveItem: (item: CrossCutChecklistItem) => void;
  readonly onCopyJumpSummary: (payload: string) => void;
}

type ChecklistFilter = "actionable" | "mismatch" | "unverified" | CrossCutTraitCategory;

const FILTER_OPTIONS: readonly { readonly id: ChecklistFilter; readonly label: string }[] = [
  { id: "actionable", label: "확인 필요 전체" },
  { id: "mismatch", label: "불일치" },
  { id: "unverified", label: "미확인" },
  { id: "outfit", label: "복장" },
  { id: "prop", label: "소품" },
  { id: "scar", label: "상처" },
];

const CATEGORY_BADGE_LABEL: Readonly<Record<CrossCutTraitCategory, string>> = {
  outfit: "복장",
  prop: "소품",
  scar: "상처",
};

export function ContinuityCrossCutChecklistCard({
  report,
  activeJumpCutId,
  onJumpToCut,
  onClearJumpCut,
  onResolveItem,
  onCopyJumpSummary,
}: ContinuityCrossCutChecklistCardProps) {
  const [filter, setFilter] = useState<ChecklistFilter>("actionable");

  const filteredItems = report.actionableItems.filter((item) => {
    if (activeJumpCutId && item.cutId !== activeJumpCutId) return false;
    if (filter === "actionable") return true;
    if (filter === "mismatch") return item.status === "mismatch";
    if (filter === "unverified") return item.status === "unverified";
    return item.category === filter;
  });

  return (
    <section
      aria-label="컷 간 연속성 대조 체크리스트"
      data-testid="continuity-cross-cut-panel"
      className="space-y-3.5 rounded-xl border border-line bg-card p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="min-w-0 space-y-1">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Layers size={15} className="shrink-0 text-accent" aria-hidden="true" />
            컷 간 복장·소품·상처 자동 대조 체크리스트
          </h3>
          <p
            data-testid="continuity-cross-cut-summary"
            className="text-xs font-medium tabular-nums text-fg-2 [word-break:keep-all]"
          >
            {report.summaryLineKo}
          </p>
        </div>

        <button
          type="button"
          data-testid="continuity-copy-jump-summary-btn"
          onClick={() => onCopyJumpSummary(formatCrossCutJumpSummaryText(report))}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ClipboardCopy size={14} aria-hidden="true" />
          수정 컷 요약 복사
        </button>
      </header>

      {/* 수정 컷 점프 요약 바 */}
      <div className="space-y-2" data-testid="continuity-jump-targets">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-fg">
            수정 컷 점프 요약 ({report.jumpTargets.length}컷)
          </h4>
          {activeJumpCutId ? (
            <button
              type="button"
              data-testid="continuity-clear-jump-filter-btn"
              onClick={onClearJumpCut}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              전체 컷 보기
            </button>
          ) : null}
        </div>

        {report.jumpTargets.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-good/40 bg-good/10 px-3 py-2 text-xs font-semibold text-good">
            <CheckCircle2 size={14} aria-hidden="true" />
            모든 대조 컷의 복장·소품·상처 연속성이 일치합니다.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.jumpTargets.map((target) => {
              const isSelected = activeJumpCutId === target.cutId;
              return (
                <button
                  key={target.cutId}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`continuity-jump-cut-${target.cutNumber}`}
                  onClick={() => onJumpToCut(target)}
                  className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border p-3 text-left text-xs transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isSelected
                      ? "border-accent bg-accent-soft/35"
                      : target.highestSeverity === "error"
                        ? "border-bad/45 bg-bad/10 hover:border-bad"
                        : "border-warn/45 bg-warn/10 hover:border-warn"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 font-bold text-fg tabular-nums">
                    <span>
                      컷 #{target.cutNumber} · {target.sceneLabelKo}
                    </span>
                    <ArrowUpRight size={14} className="shrink-0 text-accent" aria-hidden="true" />
                  </span>
                  <span className="text-fg-2 tabular-nums [word-break:keep-all]">
                    불일치 {target.mismatchCount} · 미확인 {target.unverifiedCount} ·{" "}
                    {target.affectedCategories.map((c) => CATEGORY_BADGE_LABEL[c]).join("·")}
                  </span>
                  <span className="line-clamp-1 text-fg-3 [word-break:keep-all]">
                    {target.firstIssueReasonKo}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 필터 버튼 */}
      <div
        role="group"
        aria-label="컷 대조 항목 필터"
        className="flex flex-wrap items-center gap-1.5"
      >
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            data-testid={`continuity-filter-${option.id}`}
            onClick={() => setFilter(option.id)}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              filter === option.id
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-panel text-fg-2 hover:text-fg"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 불일치·미확인 체크리스트 */}
      <ul
        data-testid="continuity-cross-cut-list"
        className="space-y-2"
        aria-label="불일치 및 미확인 컷 항목 목록"
      >
        {filteredItems.length === 0 ? (
          <li className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-fg-3">
            선택한 조건에 해당하는 불일치·미확인 항목이 없습니다.
          </li>
        ) : (
          filteredItems.map((item) => (
            <li
              key={item.checkKey}
              data-testid={`continuity-cross-cut-item-${item.cutNumber}-${item.category}`}
              className={`flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3 py-2.5 text-xs ${
                item.status === "mismatch"
                  ? "border-bad/45 bg-bad/10"
                  : "border-warn/40 bg-warn/10"
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <AlertTriangle
                    size={13}
                    className={item.status === "mismatch" ? "text-bad" : "text-warn"}
                    aria-hidden="true"
                  />
                  <span className="font-mono font-bold tabular-nums text-fg">
                    컷 #{item.cutNumber}
                  </span>
                  <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-semibold text-fg">
                    {CATEGORY_BADGE_LABEL[item.category]}
                  </span>
                  <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-semibold text-fg-2">
                    {item.status === "mismatch" ? "불일치" : "미확인"}
                  </span>
                  <span className="font-bold text-fg">{item.characterName}</span>
                </div>
                <p className="font-semibold text-fg [word-break:keep-all]">{item.reasonKo}</p>
                <p className="text-fg-2 [word-break:keep-all]">{item.fixHintKo}</p>
              </div>

              <button
                type="button"
                data-testid={`continuity-resolve-btn-${item.cutNumber}-${item.category}-${item.traitId}`}
                onClick={() => onResolveItem(item)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-accent/45 bg-accent-soft px-3 text-xs font-semibold text-accent transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <CheckCircle2 size={13} aria-hidden="true" />
                수정 확인
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
