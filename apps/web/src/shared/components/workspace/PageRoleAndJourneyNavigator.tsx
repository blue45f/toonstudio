import { ArrowRight, Check, Compass, Search } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useUi } from "@/shared/lib/ui-store";
import Link from "@/shared/navigation/router-link";

import {
  CREATOR_JOURNEY_STAGES,
  accentToneBadgeClasses,
  accentToneChipClasses,
  resolvePageRoleJourney,
} from "./page-role-journey-map";
import {
  workspaceNavigationHref,
  type WorkspaceNavigationContext,
} from "./workspace-navigation-model";

const GlobalAssetSearchPalette = lazyRetry(
  () =>
    import("./GlobalAssetSearchPalette").then((module) => ({
      default: module.GlobalAssetSearchPalette,
    })),
  "GlobalAssetSearchPalette",
);

interface PageRoleAndJourneyNavigatorProps {
  readonly pathname: string;
  readonly context?: WorkspaceNavigationContext;
  readonly compact?: boolean;
}

/**
 * PC·태블릿·모바일 공통 5단계 창작 여정 진행 바 + 현재 페이지 역할 1줄 안내 + 다음 추천 동선 칩.
 * WorkspaceTaskFrame에 지연 연결되어 진입 번들 비용 없이 현재 위치와 다음 행동을 즉시 안내하며,
 * 전역 소재 검색 커맨드 팔레트(⌘⇧K)를 지연 로딩 런처로 함께 제공한다.
 */
export function PageRoleAndJourneyNavigator({
  pathname,
  context = {},
  compact = false,
}: PageRoleAndJourneyNavigatorProps) {
  const bt = useBilingual("PageRoleAndJourneyNavigator");
  const isKo = useI18n((state) => state.lang.toLowerCase().startsWith("ko"));
  const entry = resolvePageRoleJourney(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => {
    if (useUi.getState().commandPaletteOpen) {
      useUi.getState().setCommandPaletteOpen(false);
    }
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === "k";
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && isK) {
        event.preventDefault();
        setPaletteOpen((prev) => {
          const next = !prev;
          if (next && useUi.getState().commandPaletteOpen) {
            useUi.getState().setCommandPaletteOpen(false);
          }
          return next;
        });
        return;
      }
      // 전역 CommandPaletteHost(⌘K)가 열릴 때 소재 검색 팔레트가 겹쳐 남지 않도록 즉시 닫는다.
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && isK) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  return (
    <section
      data-role-journey-bar="true"
      data-journey-stage={entry.stageNumber}
      data-accent-tone={entry.accentTone}
      aria-label={bt("페이지 역할과 5단계 창작 여정", "Page role and 5-stage creation journey")}
      className={cx(
        "mb-3 rounded-2xl border border-line bg-panel/95 text-fg shadow-xs",
        compact ? "p-2.5 sm:p-3" : "p-3 sm:p-3.5",
      )}
    >
      <ol
        aria-label={bt("5단계 창작 여정", "5-stage creation journey")}
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 snap-x lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
      >
        {CREATOR_JOURNEY_STAGES.map((stage) => {
          const isCurrent = stage.stageNumber === entry.stageNumber;
          const isCompleted = stage.stageNumber < entry.stageNumber;
          const stageHref = workspaceNavigationHref(stage.primaryHref, context);
          const stageLabel = isKo ? stage.shortLabelKo : stage.shortLabelEn;
          const stageSub = isKo ? stage.subtitleKo : stage.subtitleEn;

          return (
            <li key={stage.stageId} className="shrink-0 snap-start lg:min-w-0">
              <Link
                href={stageHref}
                aria-current={isCurrent ? "step" : undefined}
                data-journey-stage={stage.stageNumber}
                data-accent-tone={stage.accentTone}
                data-stage-state={isCurrent ? "current" : isCompleted ? "completed" : "upcoming"}
                title={`${isKo ? stage.badgeKo : stage.badgeEn} · ${stageSub}`}
                className={cx(
                  "flex min-h-11 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                  accentToneChipClasses(stage.accentTone, isCurrent),
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "grid size-6 shrink-0 place-items-center rounded-lg border font-mono text-[11px] font-bold tabular-nums",
                    isCurrent
                      ? accentToneBadgeClasses(stage.accentTone)
                      : isCompleted
                        ? "border-success/40 bg-success-soft text-success"
                        : "border-line bg-panel text-fg-3",
                  )}
                >
                  {isCompleted ? <Check size={12} strokeWidth={2.25} /> : stage.stepCode}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold leading-tight text-fg">
                    {stageLabel}
                  </span>
                  {!compact ? (
                    <span className="mt-0.5 hidden truncate text-[11px] leading-tight text-fg-3 xl:block">
                      {stageSub}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5 flex flex-col gap-2.5 border-t border-line/80 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              data-accent-tone={entry.accentTone}
              className={cx(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums [word-break:keep-all]",
                accentToneBadgeClasses(entry.accentTone),
              )}
            >
              <Compass size={12} strokeWidth={1.8} aria-hidden="true" />
              <span>{isKo ? entry.stageBadgeKo : entry.stageBadgeEn}</span>
            </span>
            <span className="text-[11px] font-semibold text-fg-3 [word-break:keep-all]">
              {bt("이 페이지에서 할 일", "What you do here")} · {isKo ? entry.pageLabelKo : entry.pageLabelEn}
            </span>
            <button
              type="button"
              data-testid="journey-asset-search-launcher"
              data-accent-tone="market"
              aria-haspopup="dialog"
              aria-expanded={paletteOpen}
              onClick={openPalette}
              title={bt("어느 화면에서든 ⌘⇧K로 통합 소재 검색 열기", "Open unified asset search anywhere with ⌘⇧K")}
              className={cx(
                "ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                accentToneChipClasses("market", paletteOpen),
              )}
            >
              <Search size={14} strokeWidth={2} aria-hidden="true" className="shrink-0 text-warning" />
              <span>{bt("소재 검색 (⌘⇧K)", "Assets (⌘⇧K)")}</span>
            </button>
          </div>
          <p className="mt-1 text-sm font-semibold leading-snug text-fg [word-break:keep-all]">
            {isKo ? entry.roleHeadlineKo : entry.roleHeadlineEn}
          </p>
          {!compact ? (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3 [word-break:keep-all]">
              {isKo ? entry.clearDistinctionKo : entry.clearDistinctionEn}
            </p>
          ) : null}
        </div>

        <nav
          aria-label={bt("다음 추천 동선", "Recommended next steps")}
          className="min-w-0 lg:max-w-[52%] lg:shrink-0"
        >
          <span className="mb-1 block text-[11px] font-semibold text-fg-3 [word-break:keep-all]">
            {bt("다음 추천 동선", "Recommended next")}
          </span>
          <ul className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 snap-x sm:flex-wrap sm:overflow-visible sm:pb-0">
            {entry.recommendedNextSteps.map((next) => {
              const label = isKo ? next.labelKo : next.labelEn;
              const reason = isKo ? next.reasonKo : next.reasonEn;
              return (
                <li key={next.href} className="shrink-0 snap-start">
                  <Link
                    href={workspaceNavigationHref(next.href, context)}
                    title={reason}
                    data-next-step-href={next.href}
                    data-accent-tone={next.accentTone}
                    className={cx(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]",
                      accentToneChipClasses(next.accentTone, false),
                    )}
                  >
                    <span>{label}</span>
                    <span className="sr-only"> — {reason}</span>
                    <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-fg-3" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {paletteOpen ? (
        <Suspense fallback={null}>
          <GlobalAssetSearchPalette open={paletteOpen} onClose={closePalette} />
        </Suspense>
      ) : null}
    </section>
  );
}

export default PageRoleAndJourneyNavigator;
