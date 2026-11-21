import {
  ArrowDown,
  Box,
  CheckCircle2,
  Flame,
  PenLine,
  RotateCcw,
  Sparkles,
  UsersRound,
} from "lucide-react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  COLLABORATION_QUICK_MATCH_SCENARIOS,
  hasActiveCollaborationFilters,
  resolveActiveQuickMatchScenario,
  type CollaborationQuickMatchId,
  type CollaborationQuickMatchScenario,
} from "./collaboration-quick-match";
import { collabButton, collabPrimary } from "./collaboration-ui";

import "./collaboration-quick-match.css";

const SCOPE = "domains.collaboration.CollaborationQuickMatchStrip";

function ScenarioIcon({ id }: { readonly id: CollaborationQuickMatchId }) {
  switch (id) {
    case "deadline-ink-assist":
      return <Flame size={16} aria-hidden="true" />;
    case "background-3d-cut":
      return <Box size={16} aria-hidden="true" />;
    case "longterm-serial-partner":
      return <UsersRound size={16} aria-hidden="true" />;
    case "portfolio-availability":
      return <Sparkles size={16} aria-hidden="true" />;
  }
}

export interface CollaborationQuickMatchStripProps {
  readonly params: URLSearchParams;
  readonly onSelectScenario: (scenario: CollaborationQuickMatchScenario) => void;
  readonly onResetFilters: () => void;
}

/**
 * 3탭 마감 공정 퀵매치 스트립.
 *
 * 초보 웹툰 창작자가 복잡한 검색 필터 대신 지금 급한 상황 1개를 눌러
 * `type`과 `role` 파라미터를 동시에 적용하고, 초보자 합의 체크포인트와
 * 예시 공고 작성을 바로 시작할 수 있게 돕는다.
 */
export function CollaborationQuickMatchStrip({
  params,
  onSelectScenario,
  onResetFilters,
}: CollaborationQuickMatchStripProps) {
  const bt = useBilingual(SCOPE);
  const activeScenario = resolveActiveQuickMatchScenario(params);
  const hasFilters = hasActiveCollaborationFilters(params);

  return (
    <section
      aria-labelledby="collaboration-quick-match-title"
      data-testid="collaboration-quick-match-strip"
      className="collab-qm-shell mt-6 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-accent [word-break:keep-all]">
            {bt("3탭 마감 공정 퀵매치", "3-tap deadline quick match")}
          </p>
          <h2
            id="collaboration-quick-match-title"
            className="mt-1 text-lg font-bold tracking-tight text-fg [word-break:keep-all] sm:text-xl"
          >
            {bt(
              "지금 급한 상황을 고르면 공고와 작성 예시를 바로 맞춰드려요",
              "Pick your urgent workflow need to filter posts and open a matching template",
            )}
          </h2>
          <p className="mt-1 text-xs leading-6 text-fg-3 [word-break:keep-all]">
            {bt(
              "1번 탭으로 모집 유형과 작업 분야를 동시에 적용하고, 거래 전 꼭 합의할 3가지를 바로 확인하세요.",
              "Apply post type and stage role in one tap, with a 3-point beginner agreement guide.",
            )}
          </p>
        </div>

        {hasFilters ? (
          <button
            type="button"
            data-testid="collaboration-quick-match-reset"
            onClick={onResetFilters}
            className={`${collabButton} shrink-0 text-xs [word-break:keep-all]`}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>{bt("필터 초기화", "Reset filters")}</span>
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label={bt("긴급 협업 시나리오 퀵매치", "Urgent collaboration scenario quick match")}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {COLLABORATION_QUICK_MATCH_SCENARIOS.map((scenario) => {
          const isActive = activeScenario?.id === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={isActive}
              data-quick-match-id={scenario.id}
              data-tone={scenario.tone}
              onClick={() => onSelectScenario(scenario)}
              className="collab-qm-card min-h-11 p-4 [word-break:keep-all]"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="collab-qm-badge">
                  <span aria-hidden="true" className="collab-qm-dot" />
                  <ScenarioIcon id={scenario.id} />
                  <span>{bt(scenario.badgeKo, scenario.badgeEn)}</span>
                </span>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{bt("적용됨", "Active")}</span>
                  </span>
                ) : null}
              </div>

              <span className="text-sm font-bold leading-snug text-fg">
                {bt(scenario.titleKo, scenario.titleEn)}
              </span>
              <span className="text-xs leading-relaxed text-fg-2">
                {bt(scenario.subtitleKo, scenario.subtitleEn)}
              </span>
            </button>
          );
        })}
      </div>

      {activeScenario ? (
        <div
          data-testid="collaboration-quick-match-active-guide"
          data-tone={activeScenario.tone}
          className="collab-qm-guide mt-4 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-fg-2 [word-break:keep-all]">
                {bt(
                  `선택한 공정 체크포인트 · ${activeScenario.titleKo}`,
                  `Stage agreement checklist · ${activeScenario.titleEn}`,
                )}
              </p>
              <p className="mt-0.5 text-xs text-fg-3 [word-break:keep-all]">
                {bt(
                  "아래 3가지만 먼저 적어 두면 초보자도 분쟁 없이 협업을 시작할 수 있어요.",
                  "Agree on these 3 points before starting work to prevent scope disputes.",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={activeScenario.composeHref}
                data-testid="collaboration-quick-match-compose-cta"
                className={`${collabPrimary} text-xs [word-break:keep-all]`}
              >
                <PenLine size={15} aria-hidden="true" />
                <span>{bt("예시로 공고 바로 쓰기", "Draft post with template")}</span>
              </Link>
              <a
                href="#collaboration-results"
                className={`${collabButton} text-xs [word-break:keep-all]`}
              >
                <ArrowDown size={15} aria-hidden="true" />
                <span>{bt("필터된 공고 보기", "Jump to matching posts")}</span>
              </a>
            </div>
          </div>

          <ol className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {activeScenario.checkpoints.map((point) => (
              <li
                key={point.step}
                className="rounded-xl border border-line bg-panel/90 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="collab-qm-step-chip tabular-nums">
                    {point.step}
                  </span>
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">
                    {bt(point.labelKo, point.labelEn)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                  {bt(point.detailKo, point.detailEn)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-xs text-fg-3 [word-break:keep-all]">
          {bt(
            "위 4가지 상황 중 하나를 누르면 공고 필터와 초보자용 3줄 합의 가이드가 바로 열립니다.",
            "Tap any scenario above to apply matching filters and view the 3-step agreement guide.",
          )}
        </p>
      )}
    </section>
  );
}
