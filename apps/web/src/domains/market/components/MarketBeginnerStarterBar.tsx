import { ArrowRight, RotateCcw, Sparkles } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  MARKET_BEGINNER_GOALS,
  resolveMarketBeginnerGoal,
  type MarketBeginnerGoal,
  type MarketBeginnerGoalId,
} from "../models/market-beginner-starter";
import "./market-beginner-starter.css";

export interface MarketBeginnerStarterBarProps {
  readonly activeGoalId: MarketBeginnerGoalId | null;
  readonly matchedCount: number;
  readonly onSelectGoal: (goal: MarketBeginnerGoal) => void;
  readonly onClearGoal: () => void;
}

/**
 * 소재 마켓 초보자 3초 스타터 바.
 *
 * 복잡한 필터 용어 대신 지금 막힌 작업을 1탭으로 고르면
 * 실제 프리셋·라이선스 필터를 즉시 적용하고 바로 쓸 경로를 안내한다.
 */
export function MarketBeginnerStarterBar({
  activeGoalId,
  matchedCount,
  onSelectGoal,
  onClearGoal,
}: MarketBeginnerStarterBarProps) {
  const t = useBilingual("MarketBeginnerStarterBar");
  const activeGoal = resolveMarketBeginnerGoal(activeGoalId);

  return (
    <section
      aria-label={t("처음 오셨다면 3초 만에 소재 고르기", "Pick your first material in 3 seconds")}
      data-testid="market-beginner-starter-bar"
      data-active={activeGoal ? "true" : "false"}
      className="market-starter-bar mt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-fg [word-break:keep-all]">
            {t("지금 급한 작업부터 고르세요", "Start with what you need right now")}
          </h2>
        </div>
        {activeGoal ? (
          <button
            type="button"
            onClick={onClearGoal}
            className="market-starter-reset inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium [word-break:keep-all]"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            <span>{t("선택 해제", "Clear pick")}</span>
          </button>
        ) : (
          <span className="text-xs text-fg-3 [word-break:keep-all]">
            {t("1탭으로 아래 목록을 바로 걸러드려요", "Filters the list below in one tap")}
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label={t("초보자 작업 목표 선택", "Beginner task goal picker")}
        className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {MARKET_BEGINNER_GOALS.map((goal) => {
          const pressed = goal.id === activeGoalId;
          return (
            <button
              key={goal.id}
              type="button"
              aria-pressed={pressed}
              data-tone={goal.tone}
              onClick={() => onSelectGoal(goal)}
              className="market-starter-chip inline-flex min-h-11 items-center justify-start gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold [word-break:keep-all]"
            >
              <span aria-hidden="true" className="market-starter-dot" />
              <span>{t(goal.labelKo, goal.labelEn)}</span>
            </button>
          );
        })}
      </div>

      {activeGoal ? (
        <div
          data-testid="market-beginner-starter-guide"
          className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-5 text-fg-2 [word-break:keep-all]" aria-live="polite">
              {t(activeGoal.guideKo, activeGoal.guideEn)}
            </p>
            <p className="mt-0.5 text-xs font-medium text-fg-3 [word-break:keep-all]">
              {t(
                `아래 최근 공유에서 ${matchedCount}개 바로 확인 가능`,
                `${matchedCount} matching items ready in recently shared below`,
              )}
            </p>
          </div>
          <Link
            href={activeGoal.ctaHref}
            className="market-starter-cta inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold [word-break:keep-all]"
          >
            <span>{t(activeGoal.ctaLabelKo, activeGoal.ctaLabelEn)}</span>
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
