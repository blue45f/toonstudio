/**
 * DiscoverMoodTempoCurator.tsx — 디스커버 1초 무드 × 읽기 시간 인터랙티브 큐레이터.
 *
 * 처음 온 독자도 "지금 기분"과 "읽을 시간" 두 번만 눌러 실제 카탈로그 스냅샷에서
 * 가장 잘 맞는 작품 3편을 즉시 추려 보고, 최근 취향 선택은 브라우저에 저장된다.
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Compass size={14} strokeWidth={1.5} aria-hidden="true" />
            {bt("1초 맞춤 고르기", "1-second mood picker")}
          </p>
          <h2 id="discover-mood-curator-title" className="mt-1 text-base font-semibold text-fg sm:text-lg">
            {bt("지금 기분과 남은 시간만 고르세요", "Pick your mood and reading time")}
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-fg-2">
            {bt(
              "복잡한 필터 없이 두 번만 누르면 지금 카탈로그에서 딱 맞는 작품 3편을 바로 추천해요.",
              "Two taps surface three matching stories from the live catalog with zero filter setup.",
            )}
          </p>
        </div>
        <Link
          href={exploreHref}
          className="ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {bt("조건 탐색으로 더 보기", "See more in Explore")}
          <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      {/* 1. 기분 선택 */}
      <div
        role="group"
        aria-label={bt("지금 기분 선택", "Choose your current mood")}
        className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4"
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
              className="discover-mood-chip flex min-h-11 flex-col items-start rounded-xl px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Icon size={15} strokeWidth={1.5} style={{ color: option.toneVar }} aria-hidden="true" />
                {bt(option.labelKo, option.labelEn)}
              </span>
              <span className="mt-0.5 text-xs text-fg-2">{bt(option.hintKo, option.hintEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 2. 읽기 시간 선택 */}
      <div
        role="group"
        aria-label={bt("읽을 시간 선택", "Choose reading time")}
        className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3"
      >
        <span className="inline-flex items-center gap-1 text-xs font-medium text-fg-2">
          <Clock size={14} strokeWidth={1.5} aria-hidden="true" />
          {bt("읽을 시간", "Reading time")}
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
                  ? "inline-flex min-h-11 items-center rounded-lg bg-accent px-3.5 text-xs font-semibold text-on-accent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  : "inline-flex min-h-11 items-center rounded-lg border border-line bg-card px-3.5 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
              }
            >
              {bt(tempo.labelKo, tempo.labelEn)}
            </button>
          );
        })}
      </div>

      {/* 3. 매칭 결과 카드 */}
      <div className="mt-4" aria-live="polite">
        {loading && picks.length === 0 ? (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="status" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-xl border border-line bg-card p-3">
                <span data-slot="skeleton" className="skeleton block h-4 w-24 rounded" />
                <span data-slot="skeleton" className="skeleton mt-2 block h-5 w-4/5 rounded" />
                <span data-slot="skeleton" className="skeleton mt-2 block h-3 w-3/5 rounded" />
              </div>
            ))}
          </div>
        ) : picks.length === 0 ? (
          <div
            data-testid="discover-mood-empty"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-card/70 px-4 py-3 text-xs text-fg-2"
          >
            <span>
              {bt(
                "아직 작품 스냅샷이 연결되지 않았어요. 조건 탐색에서 바로 원하는 작품을 고를 수 있어요.",
                "Live catalog picks are not loaded right now. Jump straight into Explore to filter stories.",
              )}
            </span>
            <Link
              href={exploreHref}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-accent px-3.5 font-semibold text-on-accent"
            >
              {bt("조건 탐색 열기", "Open Explore")}
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
                  className="discover-mood-pick-card flex h-full min-h-11 flex-col justify-between gap-2 rounded-xl p-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                        {bt(pick.matchReasonKo, pick.matchReasonEn)}
                      </span>
                      {(pick.title.stats?.ratingAvg ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-fg-2">
                          <Star size={12} strokeWidth={1.5} aria-hidden="true" />
                          {(pick.title.stats?.ratingAvg ?? 0).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 line-clamp-1 text-sm font-semibold text-fg">
                      {pick.title.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-xs text-fg-2">
                      {[pick.title.author, ...(Array.isArray(pick.title.genres) ? pick.title.genres.slice(0, 2) : [])]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span className="ink-arrow inline-flex items-center gap-1 text-xs font-medium text-accent">
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
