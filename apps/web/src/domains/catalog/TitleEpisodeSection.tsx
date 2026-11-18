import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Heart } from "lucide-react";
import { useRef, useState } from "react";

import type { Title } from "@/shared/lib/types";

import { primaryAuthorName } from "./local-catalog-fallback";
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
import { runSameDocumentViewTransition } from "@/shared/navigation/webtoon-platform-router-ux-model";

type EpisodeViewMode = "list" | "compact";

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
  compact = false,
}: {
  title: Title;
  episode: TitleEpisode;
  isNewest: boolean;
  readBadge: string | null;
  compact?: boolean;
}) {
  const [coverFrom, coverTo] = title.cover;
  const scheduled = episode.status === "scheduled";
  const content = (
    <>
      {!compact ? (
        <span className="ink-cover ink-sheen relative block aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-lg border border-line sm:w-28">
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
                background: `linear-gradient(150deg, color-mix(in oklch, ${coverFrom} 85%, var(--color-panel)), color-mix(in oklch, ${coverTo} 80%, var(--color-canvas)))`,
              }}
            />
          )}
          <span className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.1_0.02_265/0.55),transparent_55%)]" aria-hidden />
          <span className="numeral absolute bottom-1.5 left-2 text-sm font-semibold tabular-nums text-white">
            {episode.number}
          </span>
        </span>
      ) : (
        <span className="numeral grid size-8 shrink-0 place-items-center rounded-md border border-line bg-raised text-xs font-semibold tabular-nums text-fg">
          {episode.number}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[0.9375rem] font-medium text-fg">
            {episode.title ?? formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode.number) })}
          </span>
          {scheduled ? (
            <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[0.68rem] font-medium text-warn">
              {bi("공개 예정", "Scheduled")}
            </span>
          ) : isNewest ? (
            <span className="rounded bg-accent px-1.5 py-0.5 text-[0.68rem] font-medium text-on-accent">NEW</span>
          ) : null}
          {readBadge && (
            <span className="rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[0.68rem] font-medium text-accent">
              {readBadge}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
          {episode.publishedAt && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays size={12} strokeWidth={1.5} aria-hidden />
              {formatEpisodeDate(episode.publishedAt)}
            </span>
          )}
          {typeof episode.likes === "number" && (
            <span className="inline-flex items-center gap-1">
              <Heart size={12} strokeWidth={1.5} aria-hidden />
              <span className="numeral tabular-nums">{formatCount(episode.likes)}</span>
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={17} strokeWidth={1.5} aria-hidden className="shrink-0 self-center text-fg-3 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </>
  );

  const rowClass =
    "ink-frame group flex gap-3.5 rounded-xl border border-line bg-card p-3 transition-colors duration-150 hover:border-line-strong hover:bg-raised sm:gap-4 sm:p-3.5";
  if (scheduled) {
    return (
      <li className={cn(rowClass, "opacity-75 hover:border-line hover:bg-card")} aria-label={bi("공개 예정 회차", "Scheduled episode")}>
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

export function TitleEpisodeSection({
  title,
  episodes,
}: {
  title: Title;
  episodes?: readonly TitleEpisode[];
}) {
  useBilingualI18nRevision();
  const { showAvailability } = useAppConfig();
  const [order, setOrder] = useState<EpisodeSortOrder>("latest");
  const [viewMode, setViewMode] = useState<EpisodeViewMode>("list");
  const [episodeQuery, setEpisodeQuery] = useState("");
  const episodeSearchRef = useRef<HTMLInputElement>(null);
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
    if (!progress || !episodes) return null;
    const currentEpisode = episodes.find((episode) => episode.number === progress.episode);
    if (!currentEpisode || currentEpisode.status === "scheduled") return null;
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
    const nextEpisode = episodes?.find((episode) => episode.number === progress.episode + 1);
    if (
      progress.ratio >= 0.98 &&
      (total == null || progress.episode < total) &&
      nextEpisode != null && nextEpisode.status !== "scheduled"
    ) {
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
          <h2 id="title-episodes-heading" className="mt-1 flex flex-wrap items-baseline gap-2.5 text-lg font-semibold tracking-tight text-fg sm:text-xl">
            {bi("회차", "Episodes")}
            {total != null && (
              <span className="numeral text-sm font-medium tabular-nums text-fg-3">
                {formatI18nTemplate(bi("총 {v0}화", "{v0} episodes"), { v0: formatCount(total) })}
              </span>
            )}
          </h2>
        </div>
      </div>

      {continueTarget && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <BookOpen size={16} strokeWidth={1.5} aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm font-medium text-fg">{continueTarget.label}</p>
          <Link
            href={`/title/${encodeURIComponent(title.slug)}/read/${continueTarget.episode}`}
            className="inline-flex min-h-12 [min-block-size:3rem]! items-center rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-colors hover:bg-accent-2"
          >
            {continueTarget.action}
          </Link>
        </div>
      )}

      {sorted && sorted.length > 1 && (
        <details className="title-episode-tools">
          <summary>{bi("회차 찾기 · 보기 설정", "Find episodes and change view")}</summary>
          <div className="title-episode-tools-controls">
            <input
              type="search"
              ref={episodeSearchRef}
              value={episodeQuery}
              onChange={(event) => setEpisodeQuery(event.target.value)}
              placeholder={bi("회차 번호·제목 검색", "Filter episode # or title")}
              aria-label={bi("회차 번호 또는 제목 검색", "Search episode number or title")}
              data-testid="episodes-search-input"
              className="min-h-12 [min-block-size:3rem]! w-full min-w-0 rounded-lg border border-line bg-card px-3 text-base text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent sm:w-64"
            />
            <div className="flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label={bi("회차 정렬", "Episode order")}>
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
                    "min-h-12 [min-block-size:3rem]! rounded-md px-3.5 text-xs font-medium transition-colors duration-150",
                    order === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div
              className="flex rounded-lg border border-line bg-card p-0.5"
              role="group"
              aria-label={bi("회차 표시 형식", "Episode view mode")}
              data-testid="episodes-rea-view-mode"
            >
              {(
                [
                  { value: "list", label: bi("리스트형", "List") },
                  { value: "compact", label: bi("컴팩트형", "Compact") },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={viewMode === option.value}
                  onClick={() => {
                    runSameDocumentViewTransition(() => {
                      setViewMode(option.value);
                    });
                  }}
                  className={cn(
                    "min-h-12 [min-block-size:3rem]! rounded-md px-3 text-xs font-medium transition-colors duration-150",
                    viewMode === option.value ? "bg-accent text-on-accent" : "text-fg-3 hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {hasEpisodes && sorted ? (
            <p data-testid="episodes-binge-estimate" className="pt-3 text-xs tabular-nums text-fg-2">
              {formatI18nTemplate(bi("예상 정주행 약 {v0}분", "Est. binge ~{v0}m"), { v0: String(Math.max(3, sorted.length * 3)) })}
            </p>
          ) : null}
        </details>
      )}

      {hasEpisodes && filteredEpisodes?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-card/50 p-5 sm:p-6">
          <p role="status" className="font-semibold text-fg">
            {bi("검색 결과가 없어요", "No matching episodes")}
          </p>
          <p className="mt-1 text-sm text-fg-2">
            {bi("다른 회차 번호나 제목으로 찾아보세요.", "Try a different episode number or title.")}
          </p>
          <button
            type="button"
            onClick={() => {
              setEpisodeQuery("");
              const tools = episodeSearchRef.current?.closest("details");
              if (tools) tools.open = true;
              episodeSearchRef.current?.focus();
            }}
            className="mt-3 inline-flex min-h-12 [min-block-size:3rem]! items-center rounded-lg border border-line bg-card px-4 text-sm font-medium text-fg transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {bi("검색 지우기", "Clear search")}
          </button>
        </div>
      ) : hasEpisodes && filteredEpisodes ? (
        <ol
          key={`${order}-${viewMode}`}
          className={cn("ink-cascade grid gap-2.5", viewMode === "compact" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}
        >
          {filteredEpisodes.map((episode) => (
            <EpisodeRow
              key={episode.number}
              title={title}
              episode={episode}
              isNewest={episode.number === newestNumber && episode.status !== "scheduled"}
              readBadge={readBadgeFor(episode)}
              compact={viewMode === "compact"}
            />
          ))}
        </ol>
      ) : (
        <div
          data-testid="title-episodes-empty"
          className="overflow-hidden rounded-xl border border-line bg-card"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-panel/60 p-4 sm:px-5">
            <div className="min-w-0 max-w-2xl">
              <p className="text-sm font-semibold text-fg [word-break:keep-all]">
                {bi("회차별 목록은 아직 제공되지 않아요", "Episode lists aren't available yet")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
                {externalGuide.state === "ready"
                  ? bi(
                      "작품은 아래 공식 연재 플랫폼에서 감상할 수 있어요. 회차별 제목과 공개일이 연결되면 이곳에 표시됩니다.",
                      "Read this title on an official platform below. Episode titles and dates will appear here once they are connected.",
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
            </div>
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="text-fg-3">{bi("연재 상태", "Status")}</dt>
                <dd className="font-medium text-fg">{STATUS_LABEL[title.status]}</dd>
              </div>
              {title.updateDays && title.updateDays.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <dt className="text-fg-3">{bi("연재 요일", "Schedule")}</dt>
                  <dd className="font-medium text-fg">
                    {title.updateDays.join("·")} {bi("연재", "serial")}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-fg">{bi("어디서 봐", "Where to read")}</h3>
                <p className="text-xs text-fg-3">
                  {bi("외부 플랫폼에서 보기", "View on an external platform")}
                </p>
              </div>
              {externalGuide.links.length > 0 ? (
                <span className="numeral text-xs tabular-nums text-fg-3">
                  {formatI18nTemplate(bi("{v0}곳 연결", "{v0} platforms"), { v0: String(externalGuide.links.length) })}
                </span>
              ) : null}
            </div>

            {externalGuide.state === "ready" ? (
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel/40">
                {visibleExternalLinks.map((link, index) => {
                  const platformMeta = PLATFORMS[link.platformId];
                  const platformName = platformMeta?.name ?? link.platformId;
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
                      className="group flex min-h-12 [min-block-size:3rem]! flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 text-sm transition-colors duration-150 hover:bg-raised sm:flex-nowrap sm:gap-3 motion-reduce:transition-none"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: platformMeta?.color ?? "var(--color-accent)" }}
                        />
                        <span className="truncate font-medium text-fg">
                          {formatI18nTemplate(bi("{v0}에서 보기", "View on {v0}"), { v0: platformName })}
                        </span>
                        {index === 0 ? (
                          <span className="shrink-0 whitespace-nowrap rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
                            {bi("추천 경로", "Best entry")}
                          </span>
                        ) : null}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3">
                        <span className="whitespace-nowrap text-xs text-fg-2">{PRICING_FULL[link.pricing]}</span>
                        <span className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg transition-colors duration-150 group-hover:border-accent group-hover:text-accent">
                          {bi("이동", "Open")}
                          <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
                        </span>
                      </span>
                    </a>
                  );
                })}
                {hiddenExternalLinkCount > 0 && (
                  <div className="bg-card/60 px-3.5 py-2">
                    <a
                      href="#title-availability"
                      className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-2"
                    >
                      {formatI18nTemplate(
                        bi("다른 플랫폼 {v0}곳 더 보기", "See {v0} more platforms"),
                        { v0: String(hiddenExternalLinkCount) },
                      )}
                      <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
                    </a>
                  </div>
                )}
              </div>
            ) : externalGuide.state === "no-url" ? (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel/40" aria-label={bi("연재 플랫폼", "Serial platforms")}>
                {externalGuide.knownPlatformIds.map((platformId) => {
                  const platformMeta = PLATFORMS[platformId];
                  return (
                    <li
                      key={platformId}
                      className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2 text-xs"
                    >
                      <span className="flex items-center gap-2 font-medium text-fg">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: platformMeta?.color ?? "var(--color-fg-3)" }}
                        />
                        {platformMeta?.name ?? platformId}
                      </span>
                      <span className="text-fg-3">{bi("링크 준비 중", "Link coming soon")}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-line bg-panel/30 px-3.5 py-3 text-xs leading-relaxed text-fg-3">
                {bi(
                  "아직 연결된 연재 플랫폼이 없어요.",
                  "No serial platform is connected to this title yet.",
                )}
              </p>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-3">
              {(() => {
                const leadAuthor = primaryAuthorName(title.author);
                return leadAuthor ? (
                  <Link
                    href={`/author/${encodeURIComponent(leadAuthor)}`}
                    className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-fg-2 transition-colors hover:text-accent"
                  >
                    {formatI18nTemplate(bi("{v0}의 다른 작품", "More by {v0}"), { v0: leadAuthor })}
                    <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                ) : null;
              })()}
              <Link
                href="/explore"
                className="ink-arrow inline-flex min-h-11 items-center gap-1 text-xs font-medium text-fg-2 transition-colors hover:text-accent"
              >
                {bi("비슷한 작품 탐색하기", "Explore similar titles")}
                <ArrowRight size={13} strokeWidth={1.5} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
