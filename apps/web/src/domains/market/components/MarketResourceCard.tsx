import { ArrowUpRight, Heart, Layers } from "lucide-react";

import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import { formatMarketDate, marketKindMeta, marketLicenseMeta } from "../models/market-kind";
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
  className?: string;
}

/**
 * 마켓 리소스 카드: 커버 아트·가격·라이선스·사전점검 배지와 함께
 * 카드 푸터에서 후보 비교(MarketCompareToggle) 및 원고 위 시험(Fit Lab)으로 바로 연결한다.
 */
export function MarketResourceCard({ record, className }: MarketResourceCardProps) {
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const KindIcon = kind.icon;
  const paletteColors = palettePreviewColors(record);
  const { isWishlisted, toggleWishlist, storageError } = useMarketWishlist();
  const { config, isPaidMode } = useCommerceConfig();
  // 가격 1차 정보 (P-4): 목록 계약에 리소스별 가격이 없어 공개 설정의 표준
  // 가격으로만 표시하고, 미확정이면 금액을 지어내지 않는다 (market-price 모델).
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
      {/* 소재 아트가 주인공인 커버 (BLUEPRINT §6.3: 마켓 변형 16:10).
          가격·라이선스 배지는 이 아트 위에 얹어 목록에서도 바로 비교하게 한다. */}
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

        <span className="numeral tnum absolute right-3.5 top-3 z-[2] inline-flex min-h-6 items-center gap-1 rounded-md bg-canvas px-1.5 text-xs font-semibold text-fg shadow-sm">
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
          <span className="truncate">{record.publisher.name}</span>
          <span className="numeral tnum shrink-0 rounded bg-raised px-1.5 py-0.5 text-xs font-semibold text-fg-2">
            v{record.resourceVersion}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MarketProductionFitBadge record={record} showCounts />
          {record.compatibility.engines.length > 0 ? (
            <span
              data-market-studio-ready="true"
              className="inline-flex min-h-6 items-center rounded-md border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.68rem] font-semibold text-accent"
            >
              Studio 즉시 호환
            </span>
          ) : null}
        </div>
        {storageError ? <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 p-2 text-xs text-fg">{storageError}</p> : null}
        <div className="mt-auto flex items-center gap-1.5 pt-1.5 text-xs text-fg-2">
          <span className="inline-flex min-h-6 items-center rounded bg-accent px-2 font-semibold text-on-accent">
            {kind.label}
          </span>
          {/* 라이선스 라벨은 아트 위 배지로 올라갔고, 여기서는 조건 요약만 남긴다. */}
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
          <Link
            href={`/market/fit-lab?slug=${encodeURIComponent(resourceSlug)}`}
            className="inline-flex min-h-8 items-center rounded-lg border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            원고 위 시험 (Fit Lab)
          </Link>
        </div>
        <time dateTime={record.updatedAt} className="text-xs text-fg-2">
          {formatMarketDate(record.updatedAt)} 업데이트
        </time>
      </div>
    </article>
  );
}
