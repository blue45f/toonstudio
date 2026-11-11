import { ArrowUpRight, Eye, Heart, Layers, ShieldCheck, Store } from "lucide-react";

import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import {
  formatMarketByteSize,
  formatMarketDate,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import { palettePreviewColors } from "../models/market-preview";
import { resolveMarketCardPrice } from "../models/market-price";

import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketProductionFitBadge } from "./MarketProductionFitBadge";
import { MarketResourceCover } from "./MarketResourceCover";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketResourceCardProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
  readonly onQuickPreview?: (record: CreatorMarketplaceResourceRecord) => void;
}

/**
 * 마켓 리소스 카드: 커버 아트·가격·라이선스·Rights BOM·No-AI 공개·용량·사전점검 배지와 함께
 * 배급자 스토어 링크, 빠른 미리보기, 후보 비교(MarketCompareToggle), 원고 위 시험(Fit Lab)으로 바로 연결한다.
 */
export function MarketResourceCard({
  record,
  className,
  onQuickPreview,
}: MarketResourceCardProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const KindIcon = kind.icon;
  const paletteColors = palettePreviewColors(record);
  const { isWishlisted, toggleWishlist, storageError } = useMarketWishlist();
  const { config, isPaidMode } = useCommerceConfig();
  const price = resolveMarketCardPrice({
    isPaidMode,
    defaultPriceKrw: config?.defaultMarketPriceKrw,
  });
  const wishlisted = isWishlisted(record.id);
  const resourceSlug =
    (record as { readonly slug?: string }).slug ?? record.packageId ?? record.id;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-line bg-card shadow-sm",
        "transition-[border-color,transform,box-shadow] duration-200 ease-out-expo",
        "hover:-translate-y-1 hover:border-line-strong hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex aspect-[16/10] items-end justify-between overflow-hidden p-3.5",
          !paletteColors && "text-fg",
        )}
      >
        <Link
          href={`/market/resource/${record.id}`}
          aria-label={`${record.name} 상세 보기`}
          className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <span className="sr-only">{record.name} 상세 보기</span>
        </Link>

        <MarketResourceCover record={record} />

        <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => toggleWishlist(record)}
            aria-label={wishlisted ? `${record.name} 찜 해제` : `${record.name} 찜하기`}
            aria-pressed={wishlisted}
            className={cn(
              "flex size-11 items-center justify-center rounded-full bg-card/80 shadow-sm backdrop-blur-sm transition-transform hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              wishlisted ? "text-warn" : "text-fg-3 hover:text-warn",
            )}
          >
            <Heart
              className={cn("size-3.5", wishlisted && "fill-warn text-warn")}
              aria-hidden="true"
            />
          </button>
          {onQuickPreview ? (
            <button
              type="button"
              onClick={() => onQuickPreview(record)}
              aria-label={`${record.name} 빠른 미리보기`}
              className="flex size-11 items-center justify-center rounded-full bg-card/85 text-fg-2 shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <Eye className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <span className="relative z-[2] rounded-md bg-canvas px-1.5 py-1 font-display text-xs font-semibold uppercase tracking-[0.06em] text-fg shadow-sm">
          {kind.english}
        </span>

        <span
          data-market-license-badge="true"
          title={license.summary}
          className="relative z-[2] mx-1.5 max-w-[46%] truncate rounded-md bg-canvas px-1.5 py-1 text-xs font-semibold text-fg shadow-sm"
        >
          {license.label}
        </span>

        {!paletteColors ? (
          <KindIcon
            strokeWidth={1.5}
            className="relative z-[2] h-9 w-9 text-fg/45 transition-colors duration-200 group-hover:text-fg/75"
            aria-hidden="true"
          />
        ) : null}

        {!paletteColors ? (
          <span
            className="absolute inset-x-0 bottom-0 h-[3px]"
            style={{
              background: `linear-gradient(90deg, oklch(0.72 0.15 ${kind.hue}), oklch(0.62 0.12 ${(kind.hue + 40) % 360}), oklch(0.52 0.09 ${(kind.hue + 90) % 360}))`,
            }}
          />
        ) : null}

        <span className="numeral tnum absolute right-3.5 top-3 z-[2] inline-flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-fg shadow-sm">
          <Layers className="h-3 w-3" aria-hidden="true" />
          {record.entries.length}개
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/market/resource/${record.id}`}
            className="line-clamp-2 text-pretty text-sm font-semibold leading-snug text-fg transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {record.name}
          </Link>
          {price.kind === "free" ? (
            <span
              data-market-price="free"
              className="shrink-0 rounded bg-good/15 px-1.5 py-0.5 text-xs font-bold text-good"
            >
              {price.label}
            </span>
          ) : price.kind === "paid" ? (
            <span data-market-price="paid" className="flex shrink-0 flex-col items-end leading-none">
              <span className="numeral tnum text-sm font-bold text-fg">{price.label}</span>
              <span className="mt-1 text-[0.65rem] font-medium text-fg-3">{price.caption}</span>
            </span>
          ) : (
            <span
              data-market-price="paid-unknown"
              className="shrink-0 rounded bg-warn/15 px-1.5 py-0.5 text-xs font-bold text-warn"
            >
              {price.label}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
          <Link
            href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
            className="inline-flex min-h-11 min-w-0 items-center gap-1 truncate font-medium text-fg-2 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Store className="size-3 shrink-0 text-fg-3" aria-hidden="true" />
            <span className="truncate">{record.publisher.name}</span>
          </Link>
          <span className="numeral tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-[11px] font-semibold text-fg-2">
            v{record.resourceVersion} · {formatMarketByteSize(record.manifestByteSize)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MarketProductionFitBadge record={record} showCounts />
          {record.rightsConfirmed ? (
            <span
              data-market-rights-bom="true"
              className="inline-flex items-center gap-1 rounded-md border border-good/35 bg-good/10 px-2 py-0.5 text-[0.68rem] font-semibold text-good"
            >
              <ShieldCheck className="size-3" aria-hidden="true" />
              Rights BOM 자동 보존
            </span>
          ) : null}
          {!record.containsAi ? (
            <span
              data-market-no-ai-disclosed="true"
              className="inline-flex items-center gap-1 rounded-md border border-good/30 bg-good/10 px-2 py-0.5 text-[0.68rem] font-semibold text-good"
            >
              <ShieldCheck className="size-3" aria-hidden="true" />
              AI 미포함 공개
            </span>
          ) : null}
          {record.compatibility.engines.length > 0 ? (
            <span
              data-market-studio-ready="true"
              className="inline-flex items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-accent"
            >
              Studio 즉시 호환
            </span>
          ) : null}
        </div>

        {storageError ? (
          <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-fg">
            {storageError}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-fg-2">
          <span className="inline-flex items-center rounded bg-accent px-2 py-0.5 font-semibold text-on-accent">
            {kind.label}
          </span>
          <span className="truncate" title={license.summary}>
            {license.summary}
          </span>
          <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-fg-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" aria-hidden="true" />
        </div>

        {record.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {record.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded bg-raised px-1.5 py-0.5 text-xs text-fg-2">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 border-t border-line/60 pt-2">
          <MarketCompareToggle record={record} />
          <div className="flex flex-wrap items-center gap-1.5">
            {onQuickPreview ? (
              <button
                type="button"
                onClick={() => onQuickPreview(record)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              >
                <Eye className="size-3" aria-hidden="true" />
                미리보기
              </button>
            ) : null}
            <Link
              href={`/market/fit-lab?slug=${encodeURIComponent(resourceSlug)}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              원고 위 시험 (Fit Lab)
            </Link>
          </div>
        </div>
        <time dateTime={record.updatedAt} className="text-xs text-fg-2">
          {formatMarketDate(record.updatedAt)} 업데이트
        </time>
      </div>
    </article>
  );
}
