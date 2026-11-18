import { Command } from "cmdk";
import { ArrowRight, Brush } from "lucide-react";

import type { UnavailableStudioFeatureMatch } from "./unified-search";

export function CommandPaletteUnavailableStudioSection({
  items,
  query,
  onNavigate,
}: {
  readonly items: readonly UnavailableStudioFeatureMatch[];
  readonly query: string;
  readonly onNavigate: (href: string, searchRecordQuery?: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Command.Group
      forceMount
      data-unavailable-in-document="true"
      heading={
        <div className="px-2 py-1 text-[11px] font-medium text-accent">
          현 문서에서 바로 사용 불가 · 원고 편집기 기능 안내 ({items.length})
        </div>
      }
    >
      {items.map((item) => (
        <Command.Item
          forceMount
          key={`unavailable-studio-${item.id}`}
          value={`unavailable-studio-${item.id}`}
          onSelect={() => onNavigate(item.primaryHref, query)}
          className="mb-1 flex flex-col items-stretch gap-1.5 rounded-xl border border-accent/25 bg-accent-soft/30 px-3 py-2.5 text-left text-xs transition-colors data-[selected=true]:border-accent/60 data-[selected=true]:bg-accent-soft/55"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-card text-accent">
                <Brush size={13} aria-hidden />
              </span>
              <span className="truncate text-sm font-semibold text-fg">
                {item.label}
              </span>
            </div>
            <span className="shrink-0 rounded-full border border-line bg-card px-2 py-0.5 text-[10px] font-semibold text-fg-3">
              현 문서 불가
            </span>
          </div>
          <p className="truncate text-[11px] text-fg-3">{item.location}</p>
          <p
            data-search-unavailable-reason="true"
            className="text-[11px] leading-relaxed text-fg-2"
          >
            이유: {item.reason}
          </p>
          <p
            data-search-required-mode="true"
            className="text-[11px] font-semibold text-accent"
          >
            {item.requiredMode}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              data-search-alternative-action="true"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate(item.primaryHref, query);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-accent bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span>{item.primaryActionLabel}</span>
              <ArrowRight size={12} aria-hidden />
            </button>
            <button
              type="button"
              data-search-alternative-action="true"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate(item.secondaryHref, query);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-fg-2 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span>{item.secondaryActionLabel}</span>
            </button>
          </div>
        </Command.Item>
      ))}
    </Command.Group>
  );
}
