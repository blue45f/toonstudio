import { Clock, Trash2 } from "lucide-react";

import { useMarketRecentlyViewed } from "../hooks/use-market-recently-viewed";
import {
  formatMarketByteSize,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketRecentlyViewedStripProps {
  readonly excludeId?: string;
  readonly className?: string;
}

/**
 * 최근 열어본 마켓 소재를 계정별로 최대 16개까지 기억해 탐색·홈·상세 하단에서 즉시 재진입하도록 돕는 선반.
 */
export function MarketRecentlyViewedStrip({
  excludeId,
  className,
}: MarketRecentlyViewedStripProps) {
  const t = useBilingual("MarketRecentlyViewedStrip");
  const { recentlyViewed, clearRecentlyViewed } = useMarketRecentlyViewed();
  const visible = excludeId
    ? recentlyViewed.filter((item) => item.id !== excludeId)
    : recentlyViewed;

  if (visible.length === 0) return null;

  return (
    <section
      aria-label={t("최근 열어본 소재", "Recently viewed materials")}
      data-testid="market-recently-viewed-strip"
      className={cn(
        "rounded-2xl border border-line bg-card/75 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-accent" aria-hidden="true" />
          <h2 className="text-sm font-bold text-fg">
            {t("최근 열어본 소재", "Recently viewed materials")}
          </h2>
          <span className="numeral tnum rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2">
            {visible.length}
          </span>
        </div>
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          {t("기록 비우기", "Clear history")}
        </button>
      </div>

      <ul className="mt-3 flex snap-x gap-2.5 overflow-x-auto pb-1">
        {visible.slice(0, 8).map((item) => {
          const kind = marketKindMeta(item.kind);
          const license = marketLicenseMeta(item.license);
          const KindIcon = kind.icon;
          return (
            <li
              key={item.id}
              className="w-56 shrink-0 snap-start rounded-xl border border-line bg-panel p-3 transition-colors hover:border-line-strong"
            >
              <div className="flex items-center justify-between gap-1.5 text-[11px] font-semibold text-fg-3">
                <span className="inline-flex items-center gap-1 text-accent">
                  <KindIcon className="size-3.5" aria-hidden="true" />
                  {kind.label}
                </span>
                <span className="numeral tnum">
                  v{item.resourceVersion} · {formatMarketByteSize(item.manifestByteSize)}
                </span>
              </div>
              <Link
                href={`/market/resource/${encodeURIComponent(item.id)}`}
                className="mt-1.5 line-clamp-1 block text-xs font-bold text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                {item.name}
              </Link>
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-fg-2">
                <Link
                  href={`/market/creator/${encodeURIComponent(item.publisher.id)}`}
                  className="truncate hover:text-accent hover:underline"
                >
                  {item.publisher.name}
                </Link>
                <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold">
                  {item.containsAi ? license.label : `No-AI · ${license.label}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
