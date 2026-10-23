import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Heart, ListOrdered } from "lucide-react";
import { useState } from "react";

import type { Title } from "@/shared/lib/types";

import { getReaderProgress, isResumable } from "./reader-progress";
import { resolveExternalPlatformGuide } from "./title-episode-empty-guide";
import {
  resolveTotalEpisodes,
  sortEpisodes,
  type EpisodeSortOrder,
  type TitleEpisode,
} from "./title-episodes";

import { useAppConfig } from "@/platform/environment/use-app-config";
import { PLATFORMS, PRICING_FULL } from "@/shared/lib/platforms";

import { CoverImage } from "@/shared/components/cover-image";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
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
          <CoverImage
            src={episode.thumbnailUrl}
            alt=""
            srcSet={coverStandardSrcSet(episode.thumbnailUrl)}
            sizes="(max-width: 639px) 6rem, 7rem"
            className="absolute inset-0 size-full object-cover"
          />
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
 *
 * 빈 상태는 막다른 화면이 아니다(discover D-9): 작품의 실제 연재처인
 * `title.availability`에서 검증된 외부 링크를 빈 상태 안에 직접 버튼으로
 * 잇는다(title-episode-empty-guide). 링크가 없으면 "링크 준비 중"으로
 * 정직하게 표시하고 작가 페이지·탐색 동선으로 이어지게 한다. 빈 배열([])도
 * 행이 없는 빈 상태로 취급한다 — 예전에는 빈 <ol>만 그려져 안내가 사라졌다.
 */
export function TitleEpisodeSection({
  title,
  episodes,
}: {
  title: Title;
  episodes?: readonly TitleEpisode[];
}) {
  useBilingualI18nRevision();
  // 플랫폼 노출 킬스위치 — AvailabilityRouter와 같은 규칙으로, 꺼져 있으면
  // 빈 상태에서도 외부 플랫폼 이름·링크를 노출하지 않는다.
  const { showAvailability } = useAppConfig();
  const [order, setOrder] = useState<EpisodeSortOrder>("latest");
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [progress] = useState(() => getReaderProgress(title.slug));
  const total = resolveTotalEpisodes(title, episodes);
  const sorted = episodes ? sortEpisodes(episodes, order) : undefined;
  const hasEpisodes = Boolean(sorted && sorted.length > 0);
  const filteredEpisodes = sorted
    ? episodeQuery.trim().length > 0
      ? sorted.filter((ep) => {
          const q = episodeQuery.trim().toLocaleLowerCase("ko-KR");
          return (
            String(ep.number).includes(q) ||
            (ep.title ?? "").toLocaleLowerCase("ko-KR").includes(q)
          );
        })
      : sorted
    : undefined;
  const externalGuide = resolveExternalPlatformGuide(title.availability, {
    availabilityVisible: showAvailability,
  });
  const visibleExternalLinks = externalGuide.links.slice(0, 3);
  const hiddenExternalLinkCount = externalGuide.links.length - visibleExternalLinks.length;
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
          <h2 id="title-episodes-heading" className="mt-1 flex flex-wrap items-baseline gap-2.5 text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {bi("회차", "Episodes")}
            {total != null && (
              <span className="numeral text-base font-semibold text-fg-3">
                {formatI18nTemplate(bi("총 {v0}화", "{v0} episodes"), { v0: formatCount(total) })}
              </span>
            )}
            {hasEpisodes && sorted ? (
              <span
                data-testid="episodes-binge-estimate"
                className="rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-semibold text-fg-2"
              >
                {formatI18nTemplate(
                  bi("예상 정주행 약 {v0}분", "Est. binge ~{v0}m"),
                  { v0: String(Math.max(3, sorted.length * 3)) },
                )}
              </span>
            ) : null}
          </h2>
        </div>
        {sorted && sorted.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={episodeQuery}
              onChange={(event) => setEpisodeQuery(event.target.value)}
              placeholder={bi("회차 번호·제목 검색", "Filter episode # or title")}
              aria-label={bi("회차 번호 또는 제목 검색", "Search episode number or title")}
              data-testid="episodes-search-input"
              className="h-9 w-40 rounded-full border border-line bg-card px-3 text-xs text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent sm:w-48"
            />
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

      {hasEpisodes && filteredEpisodes ? (
        <ol className="flex flex-col gap-2.5">
          {filteredEpisodes.map((episode) => (
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
        <div
          data-testid="title-episodes-empty"
          className="rounded-2xl border border-dashed border-line bg-card/50 p-6 sm:p-7"
        >
          <span className="grid size-11 place-items-center rounded-2xl bg-raised text-fg-3">
            <ListOrdered size={20} aria-hidden />
          </span>
          <p className="mt-3.5 font-semibold text-fg">{bi("회차별 목록은 아직 제공되지 않아요", "Episode lists aren't available yet")}</p>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-2">
            {externalGuide.state === "ready"
              ? bi(
                  "이 작품의 회차 제목·공개일은 연재 플랫폼에서만 공개되고 있어요. 회차별 정보가 연결되면 이 자리에 최신 회차부터 표시됩니다. 그때까지는 아래 연재 플랫폼에서 바로 읽을 수 있어요.",
                  "Episode titles and dates for this title are only published on its serial platforms. Once episode data is connected, it will appear here starting with the latest episode — until then, you can read it right away on a serial platform below.",
                )
              : externalGuide.state === "no-url"
                ? bi(
                    "이 작품의 회차 제목·공개일은 연재 플랫폼에서만 공개되고 있어요. 연재 플랫폼은 확인되지만 바로가기 링크가 아직 준비되지 않았어요. 아래 동선에서 작품을 계속 둘러볼 수 있어요.",
                    "Episode titles and dates for this title are only published on its serial platforms. We know the platforms, but a direct link isn't ready yet — keep exploring from the options below.",
                  )
                : bi(
                    "이 작품의 회차 제목·공개일은 아직 연결되지 않았어요. 회차별 정보가 연결되면 이 자리에 최신 회차부터 표시됩니다. 아래 동선에서 작품을 계속 둘러볼 수 있어요.",
                    "Episode information for this title isn't connected yet. Once it is, episodes will appear here starting with the latest — keep exploring from the options below.",
                  )}
          </p>

          <div className="mt-5 border-t border-line/70 pt-4">
            <p className="text-sm font-semibold text-fg">
              {bi("외부 플랫폼에서 보기", "View on an external platform")}
            </p>
            {externalGuide.state === "ready" ? (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {visibleExternalLinks.map((link, index) => {
                  const platformName = PLATFORMS[link.platformId]?.name ?? link.platformId;
                  return (
                    <a
                      key={link.platformId}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={formatI18nTemplate(
                        bi("{v0}에서 보기 (새 탭)", "View on {v0} (new tab)"),
                        { v0: platformName },
                      )}
                      className={
                        index === 0
                          ? "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-on-accent transition-colors hover:bg-accent/90"
                          : "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
                      }
                    >
                      {formatI18nTemplate(bi("{v0}에서 보기", "View on {v0}"), { v0: platformName })}
                      <span className="text-xs font-medium opacity-80">{PRICING_FULL[link.pricing]}</span>
                      <ArrowUpRight size={15} aria-hidden />
                    </a>
                  );
                })}
                {hiddenExternalLinkCount > 0 && (
                  <a
                    href="#title-availability"
                    className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent transition-colors hover:text-accent-2"
                  >
                    {formatI18nTemplate(
                      bi("다른 플랫폼 {v0}곳 더 보기", "See {v0} more platforms"),
                      { v0: String(hiddenExternalLinkCount) },
                    )}
                  </a>
                )}
              </div>
            ) : externalGuide.state === "no-url" ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label={bi("연재 플랫폼", "Serial platforms")}>
                {externalGuide.knownPlatformIds.map((platformId) => (
                  <li
                    key={platformId}
                    className="inline-flex min-h-9 items-center gap-2 rounded-full border border-dashed border-line bg-card/60 px-3 text-xs font-medium text-fg-2"
                  >
                    {PLATFORMS[platformId]?.name ?? platformId}
                    <span className="text-fg-3">{bi("링크 준비 중", "Link coming soon")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-fg-3">
                {bi(
                  "아직 연결된 연재 플랫폼이 없어요.",
                  "No serial platform is connected to this title yet.",
                )}
              </p>
            )}

            {/* 외부로 나가지 않아도 흐름이 끊기지 않게 하는 내부 후속 동선.
                외부 링크 유무와 무관하게 항상 제공한다. */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <Link
                href={`/author/${encodeURIComponent(title.author)}`}
                className="inline-flex min-h-10 items-center text-sm font-semibold text-accent transition-colors hover:text-accent-2"
              >
                {formatI18nTemplate(bi("{v0}의 다른 작품", "More by {v0}"), { v0: title.author })}
              </Link>
              <Link
                href="/explore"
                className="inline-flex min-h-10 items-center text-sm font-semibold text-accent transition-colors hover:text-accent-2"
              >
                {bi("비슷한 작품 탐색하기", "Explore similar titles")}
              </Link>
            </div>
          </div>

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
