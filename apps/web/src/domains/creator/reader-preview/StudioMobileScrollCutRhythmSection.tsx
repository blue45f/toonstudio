/**
 * Studio Mobile Scroll Cut Rhythm Section — 세로 스크롤 미리보기 내 모바일 390×844 컷 리듬 요약.
 *
 * `StudioScrollPreviewPanel`의 리듬 사이드바에 연결되어, 컷 간 여백 과소+대사 과밀(밀집 구간),
 * 늘어지는 빈 여백 구간, 모바일 1화면(844px) 내 동시 노출 컷 수를 점수화하고 한글 연출 피드백을
 * 제공한다. 항목을 클릭하면 해당 페이지 위치로 바로 이동할 수 있다.
 */

import { useMemo, type ReactElement } from "react";

import { analyzeStudioPagesMobileCutRhythm } from "./studio-mobile-scroll-cut-adapter";
import type { MobileScrollRhythmSeverity } from "./studio-mobile-scroll-cut-rhythm";
import type { StudioScrollRhythmPageLike } from "../studio-scroll-rhythm";

import { cn } from "@/shared/lib/utils";

export interface StudioMobileScrollCutRhythmSectionProps {
  readonly pages: readonly StudioScrollRhythmPageLike[];
  readonly pageLabels: ReadonlyMap<string, string>;
  readonly pageGapPx?: number;
  readonly canvasWidthPx?: number;
  readonly onJumpToPage?: (pageId: string) => void;
}

function severityBadge(severity: MobileScrollRhythmSeverity): {
  readonly label: string;
  readonly dotClass: string;
} {
  if (severity === "critical") {
    return { label: "경고", dotClass: "bg-danger" };
  }
  if (severity === "warning") {
    return { label: "주의", dotClass: "bg-amber-400" };
  }
  return { label: "참고", dotClass: "bg-accent" };
}

export function StudioMobileScrollCutRhythmSection({
  pages,
  pageLabels,
  pageGapPx = 24,
  canvasWidthPx,
  onJumpToPage,
}: StudioMobileScrollCutRhythmSectionProps): ReactElement {
  const report = useMemo(
    () =>
      analyzeStudioPagesMobileCutRhythm(pages, {
        pageGapPx,
        canvasWidthPx,
      }),
    [canvasWidthPx, pageGapPx, pages],
  );

  return (
    <section
      data-testid="mobile-scroll-cut-rhythm-section"
      aria-label="모바일 390px 컷 리듬 진단"
      className="mt-3 border-t border-line pt-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[0.68rem] font-bold text-fg-2">모바일 390×844 컷 리듬</h4>
        <span
          data-testid="mobile-cut-rhythm-score"
          className="text-[0.64rem] font-bold tabular-nums text-accent"
        >
          {report.grade} · {report.overallScore}점
        </span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-center tabular-nums">
        <div className="rounded-lg border border-line bg-card px-1.5 py-1.5">
          <p className="text-[0.58rem] text-fg-4">1화면 최대</p>
          <p className="mt-0.5 text-[0.7rem] font-bold text-fg">
            {report.screenDensity.maxCutsPerScreen}컷
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card px-1.5 py-1.5">
          <p className="text-[0.58rem] text-fg-4">밀집 구간</p>
          <p className="mt-0.5 text-[0.7rem] font-bold text-fg">
            {report.suffocatingZones.length}곳
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card px-1.5 py-1.5">
          <p className="text-[0.58rem] text-fg-4">빈 여백</p>
          <p className="mt-0.5 text-[0.7rem] font-bold text-fg">
            {report.draggingVoidZones.length}곳
          </p>
        </div>
      </div>

      {report.cutCount === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[0.64rem] leading-4 text-fg-3">
          분석할 컷이 없습니다.
        </p>
      ) : report.feedbacks.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[0.64rem] leading-4 text-fg-3">
          390×844 기준 밀집·빈 여백 경고가 없습니다.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5" aria-label="모바일 컷 리듬 연출 피드백">
          {report.feedbacks.slice(0, 4).map((feedback) => {
            const badge = severityBadge(feedback.severity);
            const pageLabel =
              feedback.pageId && pageLabels.has(feedback.pageId)
                ? pageLabels.get(feedback.pageId)
                : null;
            const cutRangeLabel =
              feedback.startCut === feedback.endCut
                ? `${feedback.startCut}컷`
                : `${feedback.startCut}~${feedback.endCut}컷`;
            const body = (
              <span className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={cn("mt-1 size-1.5 shrink-0 rounded-full", badge.dotClass)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.64rem] font-semibold text-fg">
                    {badge.label} · {cutRangeLabel}
                    {pageLabel ? (
                      <span className="ml-1 font-normal text-fg-4">· {pageLabel}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[0.62rem] leading-4 text-fg-3">
                    {feedback.messageKo}
                  </span>
                </span>
              </span>
            );

            const targetPageId = feedback.pageId;
            return (
              <li key={feedback.id} data-mobile-feedback-category={feedback.category}>
                {onJumpToPage && targetPageId ? (
                  <button
                    type="button"
                    onClick={() => onJumpToPage(targetPageId)}
                    className="min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="rounded-lg border border-line bg-card px-2.5 py-2">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
