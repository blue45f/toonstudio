/**
 * DiscoverMoodTempoCurator.tsx — 디스커버 1초 무드 × 읽기 시간 인터랙티브 큐레이터.
 *
 * 모바일·초보자도 한눈에 바로 쓰도록 '지금 기분(4종) → 읽을 시간(3종) → 추천 3편'의
 * 간결한 2탭 흐름만 남기고 불필요한 보조 설명·중첩 박스를 제거한다.
 */

import { ArrowRight, Clock, Compass, Flame, Heart, Leaf, Sparkles, Star } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { DiscoverHomeSnapshot } from "./discover-home";
import {
  curateStoriesForMood,
  DISCOVER_MOOD_OPTIONS,
  DISCOVER_TEMPO_OPTIONS,
  exploreHrefForMoodSelection,
  loadMoodSelection,
  saveMoodSelection,
  type DiscoverMoodId,
  type DiscoverMoodSelection,
  type DiscoverTempoId,
} from "./discover-mood-curator";

import "./discover-mood-curator.css";

const MOOD_ICONS = {
  heart: Heart,
  cider: Flame,
  healing: Leaf,
  thrill: Sparkles,
} as const;

export interface DiscoverMoodTempoCuratorProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
}

export function DiscoverMoodTempoCurator({ snapshot, loading }: DiscoverMoodTempoCuratorProps) {
  const bt = useBilingual("DiscoverMoodTempoCurator");
  const [selection, setSelection] = useState<DiscoverMoodSelection>(() => loadMoodSelection());

  const updateSelection = (patch: Partial<DiscoverMoodSelection>) => {
    setSelection((prev) => {
      const next = { ...prev, ...patch };
      saveMoodSelection(next);
      return next;
    });
  };

  const activeMood =
    DISCOVER_MOOD_OPTIONS.find((item) => item.id === selection.moodId) ?? DISCOVER_MOOD_OPTIONS[0]!;
  const picks = useMemo(() => curateStoriesForMood(snapshot, selection, 3), [snapshot, selection]);
  const exploreHref = exploreHrefForMoodSelection(selection);

  return (
    <section
      data-testid="discover-mood-tempo-curator"
      aria-labelledby="discover-mood-curator-title"
      style={{ "--mood-active-tone": activeMood.toneVar } as CSSProperties}
      className="discover-mood-shell mt-8 break-keep p-4 sm:p-5"
    >
      <span className="discover-mood-ribbon" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="discover-mood-curator-title" className="flex items-center gap-1.5 text-base font-semibold text-fg">
            <Compass size={16} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
            {bt("기분과 시간만 고르면 바로 추천해요", "Pick a mood and reading time")}
          </h2>
          <p className="mt-0.5 text-xs text-fg-2">
            {bt(activeMood.hintKo, activeMood.hintEn)}
          </p>
        </div>
        <Link
          href={exploreHref}
          className="ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-accent transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {bt("더 찾아보기", "Explore more")}
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      {/* 1. 기분 선택 (모바일 2×2 콤팩트 44px 칩) */}
      <div
        role="group"
        aria-label={bt("지금 기분 선택", "Choose your current mood")}
        className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {DISCOVER_MOOD_OPTIONS.map((option) => {
          const Icon = MOOD_ICONS[option.id];
          const active = selection.moodId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`discover-mood-${option.id}`}
              aria-pressed={active}
              onClick={() => updateSelection({ moodId: option.id as DiscoverMoodId })}
              style={{ "--chip-tone": option.toneVar } as CSSProperties}
              className="discover-mood-chip inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon size={15} strokeWidth={1.5} style={{ color: option.toneVar }} aria-hidden="true" />
              <span>{bt(option.labelKo, option.labelEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 2. 읽기 시간 선택 */}
      <div
        role="group"
        aria-label={bt("읽을 시간 선택", "Choose reading time")}
        className="mt-2.5 flex flex-wrap items-center gap-1.5"
      >
        <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-3">
          <Clock size={13} strokeWidth={1.5} aria-hidden="true" />
          {bt("시간", "Time")}
        </span>
        {DISCOVER_TEMPO_OPTIONS.map((tempo) => {
          const active = selection.tempoId === tempo.id;
          return (
            <button
              key={tempo.id}
              type="button"
              data-testid={`discover-tempo-${tempo.id}`}
              aria-pressed={active}
              onClick={() => updateSelection({ tempoId: tempo.id as DiscoverTempoId })}
              className={
                active
                  ? "inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  : "inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              }
            >
              {bt(tempo.labelKo, tempo.labelEn)}
            </button>
          );
        })}
      </div>

      {/* 3. 매칭 결과 (깔끔한 3편 추천 리스트) */}
      <div className="mt-3.5 border-t border-line/60 pt-3.5" aria-live="polite">
        {loading && picks.length === 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="status" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-xl border border-line bg-card p-3">
                <span data-slot="skeleton" className="skeleton block h-4 w-24 rounded" />
                <span data-slot="skeleton" className="skeleton mt-2 block h-5 w-4/5 rounded" />
              </div>
            ))}
          </div>
        ) : picks.length === 0 ? (
          <div
            data-testid="discover-mood-empty"
            className="flex flex-wrap items-center justify-between gap-3 py-1 text-xs text-fg-2"
          >
            <span>
              {bt(
                "작품 목록을 불러오지 못했어요. 조건 탐색에서 바로 찾아볼 수 있어요.",
                "Live picks are unavailable right now. Browse stories directly in Explore.",
              )}
            </span>
            <Link
              href={exploreHref}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3.5 font-semibold text-on-accent"
            >
              {bt("작품 찾아보기", "Open Explore")}
              <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul
            key={`${selection.moodId}-${selection.tempoId}`}
            data-testid="discover-mood-results"
            className="ink-cascade grid grid-cols-1 gap-2.5 sm:grid-cols-3"
          >
            {picks.map((pick) => (
              <li key={pick.title.id}>
                <Link
                  href={`/title/${pick.title.slug}`}
                  className="discover-mood-pick-card flex h-full min-h-11 flex-col justify-between gap-1.5 rounded-xl p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-accent">
                        {bt(pick.matchReasonKo, pick.matchReasonEn)}
                      </span>
                      {(pick.title.stats?.ratingAvg ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-fg-2">
                          <Star size={12} strokeWidth={1.5} aria-hidden="true" />
                          {(pick.title.stats?.ratingAvg ?? 0).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-fg">
                      {pick.title.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-fg-2">
                      {[pick.title.author, ...(Array.isArray(pick.title.genres) ? pick.title.genres.slice(0, 2) : [])]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="ink-arrow inline-flex items-center gap-1 text-xs font-medium text-fg-2">
                    {bt("작품 보기", "View story")}
                    <ArrowRight size={12} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
