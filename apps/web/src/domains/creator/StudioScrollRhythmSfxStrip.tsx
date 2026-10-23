/**
 * 스크롤 리듬 띠의 효과음 레인 — C-1 분석(`analyzeStudioScrollRhythm`)의 효과음 지표를
 * 기존 리듬 띠와 같은 자리에 겹쳐 보여주는 표시 전용 컴포넌트 (REPORT L-4).
 *
 * 띠의 너비는 페이지 길이 비례, 주황 채움 높이는 화면당 효과음 수 비례다.
 * 효과음이 없는 페이지는 점선 테두리로 비워 표시해 공백 구간이 한눈에 보이게 한다.
 * 판정은 분석기가 이미 끝낸 수치뿐이며, 이 컴포넌트는 새로 계산하지 않는다.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import type { ReactElement } from "react";

import {
  STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN,
  type StudioScrollRhythmAnalysis,
} from "./studio-scroll-rhythm";

import { cn } from "@/shared/lib/utils";

export interface StudioScrollRhythmSfxStripProps {
  analysis: StudioScrollRhythmAnalysis;
  onSelectPage?: (pageId: string) => void;
}

export function StudioScrollRhythmSfxStrip({
  analysis,
  onSelectPage,
}: StudioScrollRhythmSfxStripProps): ReactElement {
  const { pages } = analysis;
  const maxSfxPerScreen = Math.max(0, ...pages.map((page) => page.sfxPerScreen));

  return (
    <section aria-label="효과음 리듬" className="rounded-2xl border border-line bg-card/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-xs font-bold text-fg">효과음 리듬</h3>
        <p className="text-[11px] text-fg-3">
          {analysis.totalSfxCount > 0
            ? `효과음 ${analysis.totalSfxCount}개 · 화면당 밀집 페이지 ${analysis.sfxDensePageCount}곳 · 가장 긴 효과음 없는 구간 ${analysis.longestSfxGapScreens.toFixed(1)}화면`
            : r3c07StatusText("studio.panelStatus.r3c07.scrollRhythmSfx.sfxEmpty", "이 회차에는 효과음이 없습니다.")}
        </p>
      </div>

      {analysis.sfxCategoryCounts.length > 0 ? (
        <p className="mt-1 text-[11px] text-fg-3">
          {`종류별 — ${analysis.sfxCategoryCounts
            .map((entry) => `${entry.category} ${entry.count}`)
            .join(" · ")}`}
        </p>
      ) : null}

      {pages.length > 0 && analysis.totalSfxCount > 0 ? (
        <>
          <div
            className="mt-3 flex h-14 w-full items-stretch gap-[2px]"
            role="group"
            aria-label="페이지별 효과음 띠 — 페이지를 누르면 해당 페이지로 이동합니다"
          >
            {pages.map((page) => {
              const dense = page.sfxPerScreen > STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN;
              return (
                <button
                  key={page.pageId}
                  type="button"
                  disabled={!onSelectPage}
                  onClick={() => onSelectPage?.(page.pageId)}
                  title={`${page.pageId} · 효과음 ${page.sfxCount}개 · 화면당 ${page.sfxPerScreen}개 · 효과음 없는 최장 구간 ${page.longestSfxGapScreens.toFixed(1)}화면`}
                  aria-label={`${page.pageId}로 이동 — 효과음 ${page.sfxCount}개`}
                  className={cn(
                    "relative min-w-[4px] overflow-hidden rounded-sm border bg-raised/60",
                    page.sfxCount === 0
                      ? "border-dashed border-fg-3/60"
                      : dense
                        ? "border-amber-500/70"
                        : "border-line",
                    onSelectPage && "cursor-pointer hover:border-accent/60",
                  )}
                  style={{ flexGrow: Math.max(1, page.canvasHeight), flexBasis: 0 }}
                >
                  {page.sfxCount > 0 && maxSfxPerScreen > 0 ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 bg-amber-400/70"
                      style={{
                        height: `${Math.max(8, Math.round((page.sfxPerScreen / maxSfxPerScreen) * 100))}%`,
                      }}
                    />
                  ) : null}
                  <span className="sr-only">{`효과음 ${page.sfxCount}개`}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-fg-3">
            띠의 너비는 페이지 길이 비례, 주황 채움 높이는 화면당 효과음 수 비례입니다. 점선
            테두리는 효과음이 없는 페이지, 주황 테두리는 화면당 효과음이{" "}
            {STUDIO_SCROLL_RHYTHM_SFX_DENSE_PER_SCREEN}개를 넘는 페이지입니다.
          </p>
        </>
      ) : null}
    </section>
  );
}
