import { BookOpen, CalendarDays, ChevronRight, Heart, ListOrdered } from "lucide-react";
import { useState } from "react";

import type { Title } from "@/shared/lib/types";

import { getReaderProgress, isResumable } from "./reader-progress";
import {
  resolveTotalEpisodes,
  sortEpisodes,
  type EpisodeSortOrder,
  type TitleEpisode,
} from "./title-episodes";

import { CoverImage } from "@/shared/components/cover-image";
import {
  formatI18nTemplate,
  getActiveI18nLocale,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { STATUS_LABEL } from "@/shared/lib/taxonomy";
import { cn, formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleEpisodeSection", ko, en);

function formatEpisodeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(getActiveI18nLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function EpisodeRow({
  title,
  episode,
  isNewest,
  readBadge,
}: {
  title: Title;
  episode: TitleEpisode;
  isNewest: boolean;
  readBadge: string | null;
}) {
  const [coverFrom, coverTo] = title.cover;
  const scheduled = episode.status === "scheduled";
  const content = (
    <>
      <span className="relative block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg sm:w-28">
        {episode.thumbnailUrl ? (
          <CoverImage src={episode.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(150deg, color-mix(in oklch, ${coverFrom} 85%, oklch(0.24 0.012 66)), color-mix(in oklch, ${coverTo} 80%, oklch(0.15 0.008 70)))`,
            }}
          />
        )}
        <span className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.1_0.02_265/0.55),transparent_55%)]" aria-hidden />
        <span className="numeral absolute bottom-1.5 left-2 text-sm font-bold text-white">
          {episode.number}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[0.95rem] font-semibold text-fg">
            {episode.title ?? formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode.number) })}
          </span>
          {scheduled ? (
            <span className="rounded-md border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[0.68rem] font-semibold text-warn">
              {bi("공개 예정", "Scheduled")}
            </span>
          ) : isNewest ? (
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[0.68rem] font-bold text-on-accent">NEW</span>
          ) : null}
          {readBadge && (
            <span className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.68rem] font-semibold text-accent">
              {readBadge}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
          {episode.publishedAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays size={12} aria-hidden />
              {formatEpisodeDate(episode.publishedAt)}
            </span>
          )}
          {typeof episode.likes === "number" && (
            <span className="inline-flex items-center gap-1">
              <Heart size={12} aria-hidden />
              <span className="numeral">{formatCount(episode.likes)}</span>
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={18} aria-hidden className="shrink-0 self-center text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </>
  );

  const rowClass =
    "group flex gap-3.5 rounded-2xl border border-line bg-card p-3 transition-colors duration-150 hover:border-line-strong sm:gap-4 sm:p-3.5";
  if (scheduled) {
    return (
      <li className={cn(rowClass, "opacity-75 hover:border-line")} aria-label={bi("공개 예정 회차", "Scheduled episode")}>
        {content}
      </li>
    );
  }
  return (
    <li>
      <Link href={`/title/${encodeURIComponent(title.slug)}/read/${episode.number}`} className={rowClass}>
        {content}
      </Link>
    </li>
  );
}

/**
 * 작품 상세의 회차 블록.
 *
 * 회차별 데이터(제목·공개일·썸네일)는 2026-10-05 실측으로 어떤 계약에도 없어서
 * `episodes`가 주어진 경우에만 행을 그리고, 없으면 시안의 빈 상태로 정직하게
 * 안내한다. 행 렌더링·정렬·읽음 배지는 계약이 생기면 그대로 켜지도록 완성형으로
 * 두고 단위 테스트로 고정했다(title-episodes.ts의 경계 참고).
 */
export function TitleEpisodeSection({
  title,
  episodes,
}: {
  title: Title;
  episodes?: readonly TitleEpisode[];
}) {
  useBilingualI18nRevision();
  const [order, setOrder] = useState<EpisodeSortOrder>("latest");
  const [progress] = useState(() => getReaderProgress(title.slug));
  const total = resolveTotalEpisodes(title, episodes);
  const sorted = episodes ? sortEpisodes(episodes, order) : undefined;
  // NEW 배지는 공개 예정이 아닌 가장 최신 회차에만 붙인다.
  const newestNumber = episodes
    ?.filter((episode) => episode.status !== "scheduled")
    .reduce((max, episode) => Math.max(max, episode.number), 0);

  const readBadgeFor = (episode: TitleEpisode): string | null => {
    if (!progress) return null;
    if (episode.number < progress.episode) return bi("읽음", "Read");
    if (episode.number === progress.episode && isResumable(progress)) {
      return formatI18nTemplate(bi("읽는 중 {v0}%", "Reading {v0}%"), {
        v0: String(Math.round(progress.ratio * 100)),
      });
    }
    if (episode.number === progress.episode && progress.ratio >= 0.98) return bi("읽음", "Read");
    return null;
  };

  const continueTarget = (() => {
    if (!progress) return null;
    if (isResumable(progress)) {
      return {
        episode: progress.episode,
        label: formatI18nTemplate(bi("{v0}화 · {v1}% 읽음", "Episode {v0} · {v1}% read"), {
          v0: String(progress.episode),
          v1: String(Math.round(progress.ratio * 100)),
        }),
        action: bi("이어서 읽기", "Continue reading"),
      };
    }
    if (progress.ratio >= 0.98 && (total == null || progress.episode < total)) {
      return {
        episode: progress.episode + 1,
        label: formatI18nTemplate(bi("{v0}화를 다 읽었어요", "You finished episode {v0}"), {
          v0: String(progress.episode),
        }),
        action: bi("다음 화 보기", "Next episode"),
      };
    }
    return null;
  })();

  return (
    <section id="episodes" aria-labelledby="title-episodes-heading" className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">EPISODES</p>
          <h2 id="title-episodes-heading" className="mt-1 flex items-baseline gap-2.5 text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {bi("회차", "Episodes")}
            {total != null && (
              <span className="numeral text-base font-semibold text-fg-3">
                {formatI18nTemplate(bi("총 {v0}화", "{v0} episodes"), { v0: formatCount(total) })}
              </span>
            )}
          </h2>
        </div>
        {sorted && sorted.length > 1 && (
          <div className="flex rounded-full border border-line bg-card p-0.5" role="group" aria-label={bi("회차 정렬", "Episode order")}>
            {(
              [
                { value: "latest", label: bi("최신부터", "Newest first") },
                { value: "oldest", label: bi("첫 화부터", "Oldest first") },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={order === option.value}
                onClick={() => setOrder(option.value)}
                className={cn(
                  "min-h-9 rounded-full px-3.5 text-xs font-semibold transition-colors duration-150",
                  order === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {continueTarget && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/40 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
            <BookOpen size={16} aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium text-fg">{continueTarget.label}</p>
          <Link
            href={`/title/${encodeURIComponent(title.slug)}/read/${continueTarget.episode}`}
            className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-xs font-bold text-on-accent transition-colors hover:bg-accent/90"
          >
            {continueTarget.action}
          </Link>
        </div>
      )}

      {sorted ? (
        <ol className="flex flex-col gap-2.5">
          {sorted.map((episode) => (
            <EpisodeRow
              key={episode.number}
              title={title}
              episode={episode}
              isNewest={episode.number === newestNumber && episode.status !== "scheduled"}
              readBadge={readBadgeFor(episode)}
            />
          ))}
        </ol>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-card/50 p-6 sm:p-7">
          <span className="grid size-11 place-items-center rounded-2xl bg-raised text-fg-3">
            <ListOrdered size={20} aria-hidden />
          </span>
          <p className="mt-3.5 font-semibold text-fg">{bi("회차별 목록은 아직 제공되지 않아요", "Episode lists aren't available yet")}</p>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-2">
            {bi(
              "이 작품의 회차 제목·공개일은 연재 플랫폼에서만 공개되고 있어요. 회차별 정보가 연결되면 이 자리에 최신 회차부터 표시됩니다. 지금은 옆의 플랫폼 안내에서 바로 읽을 수 있어요.",
              "Episode titles and dates for this title are only published on its serial platforms. Once episode data is connected, it will appear here starting with the latest episode — for now, use the platform guide beside this section.",
            )}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <dt className="text-fg-3">{bi("연재 상태", "Status")}</dt>
              <dd className="font-medium text-fg">{STATUS_LABEL[title.status]}</dd>
            </div>
            {title.updateDays && title.updateDays.length > 0 && (
              <div className="flex items-center gap-2">
                <dt className="text-fg-3">{bi("연재 요일", "Schedule")}</dt>
                <dd className="font-medium text-fg">
                  {title.updateDays.join("·")} {bi("연재", "serial")}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
