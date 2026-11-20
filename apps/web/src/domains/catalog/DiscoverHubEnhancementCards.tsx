import { ArrowRight, X } from "lucide-react";
import { useMemo, useState } from "react";

import { shouldPromptTasteOnboarding } from "@/domains/engagement/public/taste-onboarding-entry-bridge";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  DISCOVER_TAG_FINDER_CHIPS,
  buildTagTriggerExploreHref,
  toggleTagTriggerFilterChip,
  type TagTriggerFilterState,
} from "./discover-tag-trigger-finder";

const TASTE_DISMISSED_STORAGE_KEY = "toonstudio:taste-onboarding-dismissed-at";

function readInitialTasteDismissedAt(): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(TASTE_DISMISSED_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function DiscoverTasteOnboardingBanner({
  hydrated,
  ratedTitleCount,
}: {
  readonly hydrated: boolean;
  readonly ratedTitleCount: number;
}) {
  const bt = useBilingual("DiscoverHubPage");
  const [mountNowMs] = useState(() => Date.now());
  const [tasteDismissedAt, setTasteDismissedAt] = useState<number | null>(
    readInitialTasteDismissedAt,
  );

  const tastePromptDecision = useMemo(
    () =>
      shouldPromptTasteOnboarding({
        dismissedAtMs: tasteDismissedAt,
        ratedTitleCount,
        nowMs: mountNowMs,
      }),
    [mountNowMs, ratedTitleCount, tasteDismissedAt],
  );

  if (!hydrated || !tastePromptDecision.shouldPrompt) {
    return null;
  }

  const dismissTastePrompt = () => {
    const now = Date.now();
    setTasteDismissedAt(now);
    try {
      globalThis.localStorage?.setItem(TASTE_DISMISSED_STORAGE_KEY, String(now));
    } catch {
      // 저장 공간 제한 시 세션 상태만 유지한다.
    }
  };

  return (
    <aside
      aria-label={bt("5문항 취향 테스트 안내", "5-question taste onboarding")}
      data-testid="discover-taste-onboarding-prompt"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-fg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg [word-break:keep-all]">
          {bt(
            "30초 5문항 취향 테스트로 맞춤 작품을 바로 받아보세요",
            "Get instant tailored picks with a 30-second 5-question taste test",
          )}
        </p>
        <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
          {bt(
            "선호 장르·전개 속도·분위기만 고르면 18개 플랫폼 통합 추천이 즉시 맞춰집니다.",
            "Pick your favorite genres, pacing, and mood to tune recommendations across 18 platforms.",
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/onboarding/taste"
          className={buttonClass({
            size: "sm",
            className: "min-h-11 gap-1.5 rounded-lg px-3.5 text-xs font-semibold",
          })}
        >
          {bt("취향 테스트 시작", "Start taste test")}
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={dismissTastePrompt}
          aria-label={bt("취향 테스트 안내 닫기", "Dismiss taste test prompt")}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export function DiscoverTagTriggerFinderCard() {
  const bt = useBilingual("DiscoverHubPage");
  const [tagTriggerState, setTagTriggerState] = useState<TagTriggerFilterState>(() => ({
    includeTagIds: [],
    excludeTriggerIds: [],
  }));
  const tagTriggerExploreHref = useMemo(
    () => buildTagTriggerExploreHref(tagTriggerState),
    [tagTriggerState],
  );

  return (
    <div
      data-testid="discover-tag-trigger-finder"
      role="group"
      aria-label={bt("키워드·트리거워닝 안전 파인더", "Keyword & trigger-warning safe finder")}
      className="mt-4 rounded-xl border border-line bg-panel p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg">
          {bt(
            "취향 코드 포함 · 트리거워닝 제외 파인더",
            "Include tropes · Exclude trigger warnings",
          )}
        </p>
        <Link
          href={tagTriggerExploreHref}
          data-testid="discover-tag-trigger-apply"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2"
        >
          {bt("조합 조건으로 탐색", "Explore with selected filters")}
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {DISCOVER_TAG_FINDER_CHIPS.map((chip) => {
          const isExclude = chip.axis === "trigger-exclude";
          const active = isExclude
            ? tagTriggerState.excludeTriggerIds.includes(chip.id)
            : tagTriggerState.includeTagIds.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setTagTriggerState((current) => toggleTagTriggerFilterChip(current, chip))
              }
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
                active
                  ? isExclude
                    ? "border-bad/45 bg-bad/15 text-bad"
                    : "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
              )}
            >
              {bt(chip.labelKo, chip.labelEn)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
