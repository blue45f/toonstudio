import { Film, GitBranch, Play, Sparkles, Tv } from "lucide-react";

import { MiniPoster } from "./rank-row";

import type { Title } from "@/shared/lib/types";

import { useInView } from "@/shared/hooks/use-in-view";
import { STATUS_LABEL, TYPE_LABEL } from "@/shared/lib/taxonomy";
import {
  MEDIA_KIND_LABEL,
  mediaLink,
  mediaThumb,
  type AdaptationEndingDiff,
  type AdaptationEndingDiffStatus,
  type MediaAdaptation,
} from "@/shared/lib/title-universe";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const EXT_ICON: Record<MediaAdaptation["kind"], typeof Tv> = {
  drama: Tv,
  movie: Film,
  anime: Sparkles,
  ott: Tv,
};

const ENDING_DIFF_META: Readonly<
  Record<AdaptationEndingDiffStatus, { readonly badgeKo: string; readonly toneClass: string }>
> = {
  same: { badgeKo: "결말 동일", toneClass: "border-good/40 bg-good/15 text-good" },
  diverged: { badgeKo: "결말 상이", toneClass: "border-warn/45 bg-warn/15 text-warn" },
  ongoing: { badgeKo: "연재·방영 중", toneClass: "border-cool/45 bg-cool/15 text-cool" },
  unknown: { badgeKo: "결말 비교 가능", toneClass: "border-line bg-panel text-fg-2" },
};

// 노드 등장 안무용 공통 스타일. step = 체인 상의 순서(0=원작).
function nodeReveal(inView: boolean, step: number): React.CSSProperties {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? "translateY(0)" : "translateY(8px)",
    transition: "opacity 420ms var(--ease-out-expo), transform 420ms var(--ease-out-quint)",
    transitionDelay: `${step * 130 + 90}ms`,
  };
}

function Node({
  title,
  role,
  highlight,
  inView,
  step,
}: {
  title: Title;
  role: string;
  highlight?: boolean;
  inView: boolean;
  step: number;
}) {
  return (
    <Link
      href={`/title/${title.slug}`}
      className={cn(
        "group flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center motion-reduce:transform-none motion-reduce:transition-none",
        highlight && "scale-[1.03]",
      )}
      style={nodeReveal(inView, step)}
    >
      <MiniPoster
        title={title}
        className={cn(
          "w-full ring-1 transition-shadow duration-150",
          highlight ? "ring-accent" : "ring-[oklch(0.95_0.01_85/0.14)] group-hover:ring-line-strong",
        )}
      />
      <span className="eyebrow text-[0.58rem] text-fg-3">{role}</span>
      <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight text-fg-2 group-hover:text-fg break-keep">
        {title.title}
      </span>
    </Link>
  );
}

// 영상화 노드 — 공식 예고편 썸네일 + 공식 시청/정보 페이지로 링크아웃.
function MediaNode({ media, inView, step }: { media: MediaAdaptation; inView: boolean; step: number }) {
  const Icon = EXT_ICON[media.kind] ?? Tv;
  const thumb = mediaThumb(media);
  return (
    <a
      href={mediaLink(media)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex w-[5.5rem] shrink-0 flex-col items-center gap-1.5 text-center motion-reduce:transform-none motion-reduce:transition-none"
      style={nodeReveal(inView, step)}
    >
      <span className="relative grid aspect-[3/4] w-full place-items-center overflow-hidden rounded-md border border-line-strong bg-[linear-gradient(145deg,oklch(0.245_0.011_64),oklch(0.185_0.009_68))] text-accent shadow-[inset_0_1px_0_oklch(1_0_0/0.05)] transition-colors duration-150 group-hover:border-accent/60">
        {thumb ? (
          <>
            <img src={thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none" />
            <span className="absolute inset-0 bg-[oklch(0.14_0.02_70/0.32)] transition-colors group-hover:bg-[oklch(0.14_0.02_70/0.12)]" />
            <span className="relative grid size-7 place-items-center rounded-full bg-[oklch(0.14_0.02_70/0.55)] text-[oklch(0.97_0.01_85)] backdrop-blur-sm">
              <Play size={13} className="fill-current" />
            </span>
          </>
        ) : (
          <>
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_0%,oklch(0.72_0.185_42/0.22),transparent_58%)]" />
            <Icon size={20} className="relative" />
          </>
        )}
      </span>
      <span className="eyebrow text-[0.58rem] text-fg-3">{MEDIA_KIND_LABEL[media.kind]}</span>
      <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight text-fg-2 group-hover:text-fg break-keep">
        {media.name}
        <span className="block text-[0.62rem] text-fg-3 tabular-nums">{media.year}</span>
      </span>
    </a>
  );
}

// 커넥터 — reveal 시 라인이 좌→우로 그려진 뒤 노드 도트가 들어온다.
function Connector({ inView, step }: { inView: boolean; step: number }) {
  const lineDelay = `${step * 130}ms`;
  const dotDelay = `${step * 130 + 60}ms`;
  return (
    <div className="flex shrink-0 items-center self-start pt-7" aria-hidden>
      <span
        className="h-px w-4 origin-left bg-[linear-gradient(90deg,var(--color-accent),var(--color-cool))] transition-transform duration-[360ms] ease-out-quint motion-reduce:transform-none motion-reduce:transition-none sm:w-7"
        style={{ transform: inView ? "scaleX(1)" : "scaleX(0)", transitionDelay: lineDelay }}
      />
      <span
        className="size-1.5 rounded-full bg-accent transition-[opacity,transform] duration-200 ease-out-expo motion-reduce:transform-none motion-reduce:transition-none"
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? "scale(1)" : "scale(0.2)",
          transitionDelay: dotDelay,
        }}
      />
    </div>
  );
}

function formatRatingDelta(originalRating: number, targetRating: number): string | null {
  if (!(originalRating > 0) || !(targetRating > 0)) return null;
  const diff = Number((targetRating - originalRating).toFixed(1));
  if (Math.abs(diff) < 0.1) return "원작과 평점 동일";
  return diff > 0 ? `원작보다 평점 +${diff.toFixed(1)}` : `원작이 평점 +${Math.abs(diff).toFixed(1)} 높음`;
}

function resolveTitleEndingDiff(
  original: Title,
  adaptation: Title,
  explicit?: AdaptationEndingDiff,
): AdaptationEndingDiff {
  if (explicit) return explicit;
  if (original.status === "completed" && adaptation.status === "completed") {
    return { status: "unknown", summaryKo: "원작·각색 모두 완결되어 결말 비교가 가능합니다." };
  }
  if (original.status === "completed" && adaptation.status !== "completed") {
    return { status: "ongoing", summaryKo: "원작은 완결됐고 각색 버전은 아직 결말 전입니다." };
  }
  if (original.status !== "completed" && adaptation.status === "completed") {
    return { status: "diverged", summaryKo: "각색 버전이 먼저 완결되어 오리지널 결말 가능성이 있습니다." };
  }
  return { status: "ongoing", summaryKo: "원작과 각색 모두 연재 중이라 결말이 아직 확정되지 않았습니다." };
}

// 원작 → 웹툰 → 영상화 그래프 + 노블코믹스 버전 비교(평점·완결·결말 차이) 매트릭스(AC-013)
export function AdaptationGraph({
  original,
  adaptations,
  externalMedia = [],
  endingDiffs,
  currentId,
  className,
}: {
  original: Title;
  adaptations: Title[];
  externalMedia?: MediaAdaptation[];
  endingDiffs?: Readonly<Record<string, AdaptationEndingDiff>>;
  currentId?: string;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const comparableVersions: {
    readonly title: Title;
    readonly role: string;
    readonly deltaLabel: string | null;
    readonly endingDiff: AdaptationEndingDiff | null;
  }[] = [
    {
      title: original,
      role: original.type === "webnovel" ? "원작 소설" : "원작",
      deltaLabel: null,
      endingDiff: null,
    },
    ...adaptations.map((a) => ({
      title: a,
      role: `${TYPE_LABEL[a.type]}화`,
      deltaLabel: formatRatingDelta(original.stats.ratingAvg, a.stats.ratingAvg),
      endingDiff: resolveTitleEndingDiff(original, a, endingDiffs?.[a.id]),
    })),
  ];

  const hasComparisonRows = comparableVersions.length > 1 || externalMedia.length > 0;

  return (
    <div ref={ref} className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-1 overflow-x-auto rail pb-1">
        <Node
          title={original}
          role={original.type === "webnovel" ? "원작 소설" : "원작"}
          highlight={original.id === currentId}
          inView={inView}
          step={0}
        />
        {adaptations.map((a, i) => (
          <div key={a.id} className="flex items-start gap-1">
            <Connector inView={inView} step={i + 1} />
            <Node
              title={a}
              role={TYPE_LABEL[a.type] + "화"}
              highlight={a.id === currentId}
              inView={inView}
              step={i + 1}
            />
          </div>
        ))}
        {externalMedia.map((e, i) => {
          const step = adaptations.length + 1 + i;
          return (
            <div key={`${e.kind}-${e.name}-${e.year}`} className="flex items-start gap-1">
              <Connector inView={inView} step={step} />
              <MediaNode media={e} inView={inView} step={step} />
            </div>
          );
        })}
      </div>

      {hasComparisonRows && (
        <div
          data-testid="adaptation-version-comparison"
          className="border-t border-line/60 pt-3"
        >
          <p className="eyebrow mb-2 flex items-center gap-1.5 text-[0.65rem] text-fg-3">
            <GitBranch size={12} className="text-accent" aria-hidden="true" />
            버전별 평점 · 완결 · 결말 차이 비교
          </p>
          <ul className="divide-y divide-line/50 text-xs">
            {comparableVersions.map(({ title, role, deltaLabel, endingDiff }) => {
              const diffMeta = endingDiff ? ENDING_DIFF_META[endingDiff.status] : null;
              return (
                <li
                  key={title.id}
                  data-testid={`adaptation-compare-row-${title.id}`}
                  className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[0.65rem] font-semibold text-fg-2">
                        {role}
                      </span>
                      <Link
                        href={`/title/${title.slug}`}
                        className={cn(
                          "truncate font-medium transition-colors hover:text-accent",
                          title.id === currentId ? "text-accent" : "text-fg",
                        )}
                      >
                        {title.title}
                      </Link>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 text-[0.7rem] text-fg-2">
                      <span className="font-display font-semibold text-fg tabular-nums">
                        ★ {title.stats.ratingAvg.toFixed(1)}
                      </span>
                      <span className="text-fg-3">{STATUS_LABEL[title.status]}</span>
                      {deltaLabel && (
                        <span className="rounded-md bg-panel px-2 py-0.5 text-[0.65rem] font-medium text-accent break-keep">
                          {deltaLabel}
                        </span>
                      )}
                      {diffMeta && (
                        <span
                          data-testid={`adaptation-ending-diff-${title.id}`}
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[0.65rem] font-bold break-keep",
                            diffMeta.toneClass,
                          )}
                        >
                          {diffMeta.badgeKo}
                        </span>
                      )}
                    </div>
                  </div>
                  {endingDiff ? (
                    <p className="text-[0.7rem] leading-relaxed text-fg-3 break-keep">
                      결말 차이: {endingDiff.summaryKo}
                    </p>
                  ) : null}
                </li>
              );
            })}

            {externalMedia.map((media) => {
              const diff = media.endingDiff ?? {
                status: "unknown" as const,
                summaryKo: "영상화 각색에 따라 세부 전개·결말이 원작과 달라질 수 있습니다.",
              };
              const diffMeta = ENDING_DIFF_META[diff.status];
              return (
                <li
                  key={`media:${media.kind}:${media.name}:${media.year}`}
                  data-testid={`adaptation-compare-media-${media.kind}-${media.year}`}
                  className="flex flex-col gap-1.5 py-2.5 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-cool/15 px-2 py-0.5 text-[0.65rem] font-semibold text-cool">
                        {MEDIA_KIND_LABEL[media.kind]} ({media.year})
                      </span>
                      <a
                        href={mediaLink(media)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-medium text-fg transition-colors hover:text-accent"
                      >
                        {media.name}
                      </a>
                    </div>
                    <span
                      data-testid={`adaptation-ending-diff-media-${media.kind}`}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.65rem] font-bold break-keep",
                        diffMeta.toneClass,
                      )}
                    >
                      {diffMeta.badgeKo}
                    </span>
                  </div>
                  <p className="text-[0.7rem] leading-relaxed text-fg-3 break-keep">
                    결말 차이: {diff.summaryKo}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
