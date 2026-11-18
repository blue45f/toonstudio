import {
  Bookmark,
  Check,
  ExternalLink,
  Maximize2,
  Search,
  Sparkles,
} from "lucide-react";

import { AssetImage } from "./reference-asset-ui";

import type { CreatorResource } from "@/shared/lib/creator-resources";
import type { ReferenceDensity } from "@/shared/lib/reference-assets";
import type { ReactNode } from "react";

import { formatReferenceDateRange } from "@/shared/lib/reference-assets";

export function ResultSkeleton({ density }: { density: ReferenceDensity }) {
  return (
    <div className={`grid gap-4 ${density === "compact" ? "sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className={`${density === "compact" ? "aspect-square" : "aspect-[4/3]"} animate-pulse bg-raised`} />
          <div className="space-y-3 p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-raised" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-raised" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-raised" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AssetCard({
  item,
  density,
  saved,
  compared,
  savingDisabled,
  onOpen,
  onToggleSaved,
  onToggleCompare,
}: {
  item: CreatorResource;
  density: ReferenceDensity;
  saved: boolean;
  compared: boolean;
  savingDisabled: boolean;
  onOpen: (trigger: HTMLElement) => void;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
}) {
  const asset = item.asset;
  const date = formatReferenceDateRange(item);
  return (
    <article data-saved={saved || undefined} data-compared={compared || undefined} className="resource-asset-card ink-frame group flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-line-strong">
      <div className="relative">
        <button
          type="button"
          className="ink-cover ink-sheen relative block w-full overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          onClick={(event) => onOpen(event.currentTarget)}
          aria-label={`${item.title} 상세 보기`}
        >
          <AssetImage fit="cover" item={item} className={`w-full ${density === "compact" ? "aspect-square" : "aspect-[4/3]"}`} />
        </button>
        <span className="pointer-events-none absolute left-3 top-3 inline-flex min-h-7 items-center rounded-md border border-line bg-canvas/88 px-2 text-xs font-semibold text-fg backdrop-blur">
          CC0
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1.5">
          {asset?.isHighlight ? (
            <span className="pointer-events-none inline-flex min-h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold text-on-accent">
              <Sparkles size={12} aria-hidden="true" /> 대표작
            </span>
          ) : null}
          <button
            type="button"
            className={`grid size-9 place-items-center rounded-lg border backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${compared ? "border-accent bg-accent text-on-accent" : "border-line bg-canvas/88 text-fg hover:bg-canvas"}`}
            aria-pressed={compared}
            aria-label={compared ? "비교에서 제거" : "비교에 추가"}
            title={compared ? "비교에서 제거" : "비교에 추가"}
            onClick={onToggleCompare}
          >
            <Check size={16} aria-hidden="true" />
          </button>
        </span>
        <span className="pointer-events-none absolute bottom-3 right-3 grid size-9 place-items-center rounded-lg border border-line bg-canvas/88 text-fg opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Maximize2 size={16} aria-hidden="true" />
        </span>
      </div>
      <div className={`flex flex-1 flex-col ${density === "compact" ? "p-3.5" : "p-4"}`}>
        <div className="flex flex-wrap gap-1.5">
          {asset?.department ? <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{asset.department}</span> : null}
          {asset?.classification ? <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-fg-2">{asset.classification}</span> : null}
        </div>
        <h3 className={`mt-2.5 break-words font-semibold leading-snug text-fg ${density === "compact" ? "text-sm" : "text-base"}`}>{item.title}</h3>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-2">
          {item.creator || "제작자 미상"}
          {date ? ` · ${date}` : ""}
        </p>
        {density === "comfortable" && asset?.medium ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-fg-2">{asset.medium}</p> : null}
        <div className="resource-asset-actions mt-auto grid grid-cols-2 gap-2 pt-4">
          <button
            type="button"
            className={`inline-flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${saved ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:bg-raised"}`}
            aria-pressed={saved}
            disabled={savingDisabled}
            onClick={onToggleSaved}
            title={saved ? "저장 해제" : "연구 보드에 저장"}
          >
            {saved ? <Check size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}
            <span className="sr-only">{saved ? "저장됨" : "저장"}</span>
          </button>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line text-fg-2 transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Met 원문 열기"
          >
            <ExternalLink size={15} aria-hidden="true" />
            <span className="sr-only">원문 열기</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="resource-empty-state grid min-h-64 place-items-center rounded-3xl border border-dashed border-line bg-panel p-8 text-center">
      <div className="max-w-lg">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent"><Search size={24} aria-hidden="true" /></span>
        <h3 className="mt-5 text-xl font-bold text-fg">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-fg-2">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
