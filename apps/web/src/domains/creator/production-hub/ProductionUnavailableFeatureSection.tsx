import { ArrowRight, Brush } from "lucide-react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type { ProductionUnavailableMatch } from "./useProductionUnavailableStudioMatches";

export function ProductionUnavailableFeatureSection({
  matches,
  aggregate,
  onNavigateHref,
}: {
  readonly matches: readonly ProductionUnavailableMatch[];
  readonly aggregate: ProductionProjectAggregate;
  readonly onNavigateHref: (href: string) => void;
}) {
  if (matches.length === 0) return null;

  const encodedProjectId = encodeURIComponent(aggregate.projectId);
  const firstEpisode = aggregate.episodes[0];
  const episodeHref = firstEpisode
    ? `/production/projects/${encodedProjectId}/episodes/${encodeURIComponent(firstEpisode.episodeId)}`
    : `/production/projects/${encodedProjectId}/episodes`;
  const episodeLabel = firstEpisode
    ? `${firstEpisode.episodeId} 공동 작업실 열기`
    : "회차·원고 목록 열기";
  const editorHref = `/studio/work/${encodedProjectId}/canvas`;

  return (
    <div
      role="region"
      aria-label="현 문서에서 바로 사용할 수 없는 원고 기능 안내"
      data-unavailable-in-document="true"
      className="mx-2 mb-2 rounded-xl border border-accent/30 bg-accent-soft/35 p-3 text-left text-xs"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
        현 문서 불가 · 원고 편집 전용 기능 안내 ({matches.length})
      </p>
      <div className="mt-2 space-y-2">
        {matches.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-line bg-card/90 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-fg">
                <Brush className="size-3.5 text-accent" aria-hidden />
                {item.label}
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] text-fg-3">
                현 문서 불가
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-fg-3">{item.location}</p>
            <p
              data-search-unavailable-reason="true"
              className="mt-1 text-[11px] leading-relaxed text-fg-2"
            >
              이유: 현재 제작·기획 관리 문서에서는 원고 캔버스 편집 기능을 직접 적용할 수 없습니다.
            </p>
            <p
              data-search-required-mode="true"
              className="mt-0.5 text-[11px] font-semibold text-accent"
            >
              {item.requiredMode}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-search-alternative-action="true"
                onClick={() => onNavigateHref(editorHref)}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-accent bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span>스튜디오 원고 편집기 열기</span>
                <ArrowRight className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                data-search-alternative-action="true"
                onClick={() => onNavigateHref(episodeHref)}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span>{episodeLabel}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
