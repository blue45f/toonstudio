import { Eye, Heart, ShieldCheck, Store } from "lucide-react";

import { useCommerceConfig } from "../hooks/use-commerce-config";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import { marketKindMeta, marketLicenseMeta } from "../models/market-kind";
import { palettePreviewColors } from "../models/market-preview";
import { resolveMarketCardPrice } from "../models/market-price";

import { MarketProductionFitBadge } from "./MarketProductionFitBadge";
import { MarketResourceCover } from "./MarketResourceCover";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("MarketResourceCard", ko, en);

interface MarketResourceCardProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly className?: string;
  readonly presentation?: "card" | "row";
  readonly onQuickPreview?: (record: CreatorMarketplaceResourceRecord) => void;
}

function licenseStatusDotClass(license: CreatorMarketplaceResourceRecord["license"]): string {
  if (license === "cc0-1.0" || license === "cc-by-4.0") return "bg-good";
  if (license === "cc-by-nc-4.0") return "bg-warn";
  return "bg-accent";
}

/**
 * 선택에 필요한 표지·가격·이용 조건을 먼저 보여 준다.
 * 비교·원고 위 시험·상세 메타데이터는 기존 상세와 미리보기에서 이어서 확인한다.
 */
export function MarketResourceCard({
  record,
  className,
  presentation = "card",
  onQuickPreview,
}: MarketResourceCardProps) {
  useBilingualI18nRevision();
  const kind = marketKindMeta(record.kind);
  const license = marketLicenseMeta(record.license);
  const paletteColors = palettePreviewColors(record);
  const { isWishlisted, toggleWishlist, storageError } = useMarketWishlist();
  const { config, isPaidMode } = useCommerceConfig();
  const price = resolveMarketCardPrice({
    isPaidMode,
    defaultPriceKrw: config?.defaultMarketPriceKrw,
  });
  const wishlisted = isWishlisted(record.id);
  const licenseDot = licenseStatusDotClass(record.license);

  if (presentation === "row") {
    const usageCondition =
      record.license === "cc-by-nc-4.0"
        ? bi("비상업 · 출처 표기 필요", "Non-commercial · attribution required")
        : record.license === "cc-by-4.0"
          ? bi("출처 표기 필요", "Attribution required")
          : record.license === "cc0-1.0"
            ? bi("공개 이용", "Open use")
            : bi("리소스 재배포 불가", "No raw redistribution");

    return (
      <article
        className={cn(
          "market-resource-card--row ink-frame relative overflow-hidden rounded-[14px] border border-line bg-card transition-colors duration-150 hover:border-line-strong",
          className,
        )}
      >
        <div className="market-resource-card__cover ink-cover ink-sheen relative overflow-hidden rounded-[10px] border border-line/70 bg-panel">
          <Link
            href={`/market/resource/${record.id}`}
            aria-label={bi(`${record.name} 상세 보기`, `View ${record.name} details`)}
            className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
          >
            <span className="sr-only">
              {bi(`${record.name} 상세 보기`, `View ${record.name} details`)}
            </span>
          </Link>
          <MarketResourceCover record={record} />
        </div>
        <div className="market-resource-card__body min-w-0">
          <div className="market-resource-card__heading flex min-w-0 items-start justify-between gap-2">
            <h3 className="market-resource-card__title min-w-0 text-sm font-semibold leading-snug text-fg [word-break:keep-all]">
              <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">
                {record.name}
              </span>
            </h3>
            <span
              data-market-price={price.kind}
              className={cn(
                "market-resource-card__price shrink-0 text-right text-xs font-medium tabular-nums",
                price.kind === "free" ? "text-good" : "text-fg",
              )}
            >
              {price.label}
              {price.caption ? (
                <span className="block text-[0.65rem] font-normal text-fg-3">{price.caption}</span>
              ) : null}
            </span>
          </div>
          <p className="market-resource-card__conditions flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-relaxed text-fg-2">
            <span>{bi(kind.label, kind.english)}</span>
            <span aria-hidden="true" className="text-fg-3/50">
              ·
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", licenseDot)} />
              <span data-market-license-badge="true">{license.label}</span>
            </span>
            <span>{usageCondition}</span>
          </p>
          {storageError ? (
            <p role="alert" className="rounded-[8px] border border-bad/30 bg-bad/10 p-2 text-xs text-fg">
              {storageError}
            </p>
          ) : null}
          <div
            className={cn(
              "market-resource-card__actions grid gap-1.5",
              onQuickPreview ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {onQuickPreview ? (
              <button
                type="button"
                onClick={() => onQuickPreview(record)}
                aria-label={bi(`${record.name} 미리보기`, `Preview ${record.name}`)}
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[8px] bg-accent px-2 text-xs font-medium text-on-accent transition-colors duration-150 hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none"
              >
                {bi("미리보기", "Preview")}
              </button>
            ) : null}
            <Link
              href={`/market/resource/${record.id}#market-trust-guarantee-heading`}
              aria-label={bi(`${record.name} 이용 조건`, `Usage terms for ${record.name}`)}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[8px] border border-line bg-panel px-2 text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none"
            >
              {bi("이용 조건", "Usage terms")}
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "ink-frame group relative flex flex-col overflow-hidden rounded-[14px] border border-line bg-card transition-colors duration-150 hover:border-line-strong",
        className,
      )}
    >
      <div
        className={cn(
          "ink-cover ink-sheen relative aspect-[16/10] overflow-hidden bg-panel",
          !paletteColors && "text-fg",
        )}
      >
        <Link
          href={`/market/resource/${record.id}`}
          aria-label={bi(`${record.name} 상세 보기`, `View ${record.name} details`)}
          className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
        >
          <span className="sr-only">
            {bi(`${record.name} 상세 보기`, `View ${record.name} details`)}
          </span>
        </Link>

        <MarketResourceCover record={record} />

        <div className="absolute left-2.5 top-2.5 z-10">
          <button
            type="button"
            onClick={() => toggleWishlist(record)}
            aria-label={
              wishlisted
                ? bi(`${record.name} 찜 해제`, `Remove ${record.name} from wishlist`)
                : bi(`${record.name} 찜하기`, `Save ${record.name}`)
            }
            aria-pressed={wishlisted}
            className={cn(
              "flex size-11 min-h-11 min-w-11 items-center justify-center rounded-[8px] border border-line/70 bg-canvas/85 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] transition-colors duration-150 enabled:active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
              wishlisted ? "text-warn" : "text-fg-2 hover:border-line-strong hover:text-fg",
            )}
          >
            <Heart
              className={cn("size-3.5", wishlisted && "fill-warn text-warn")}
              aria-hidden="true"
            />
          </button>
        </div>

        <span className="absolute bottom-2.5 left-2.5 z-[3] whitespace-nowrap rounded-[6px] border border-line/70 bg-canvas px-2 py-0.5 text-xs font-medium text-fg">
          {bi(kind.label, kind.english)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-line p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/market/resource/${record.id}`}
            className="line-clamp-2 min-h-12 min-w-0 text-pretty text-sm font-semibold leading-snug text-fg transition-colors duration-150 [word-break:keep-all] hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {record.name}
          </Link>
          {price.kind === "free" ? (
            <span
              data-market-price="free"
              className="shrink-0 rounded-[6px] border border-good/30 bg-good/10 px-2 py-0.5 text-xs font-medium text-good tabular-nums"
            >
              {price.label}
            </span>
          ) : price.kind === "paid" ? (
            <span
              data-market-price="paid"
              className="flex shrink-0 flex-col items-end leading-none tabular-nums"
            >
              <span className="numeral tnum text-sm font-semibold text-fg tabular-nums">
                {price.label}
              </span>
              <span className="mt-1 text-[0.65rem] font-normal text-fg-3">{price.caption}</span>
            </span>
          ) : (
            <span
              data-market-price="paid-unknown"
              className="shrink-0 rounded-[6px] border border-warn/30 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn tabular-nums"
            >
              {price.label}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-fg-2">
          <Link
            href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
            className="inline-flex min-h-11 min-w-0 items-center gap-1.5 truncate font-medium text-fg-2 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <Store className="size-3.5 shrink-0 text-fg-3" aria-hidden="true" />
            <span className="truncate">{record.publisher.name}</span>
          </Link>
          <span className="numeral tnum shrink-0 text-[11px] text-fg-3 tabular-nums">
            v{record.resourceVersion} · {bi(`${record.entries.length}종`, `${record.entries.length}`)}
          </span>
        </div>

        <div className="space-y-1 text-xs leading-relaxed text-fg-2">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 py-0.5 font-medium text-fg">
            <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", licenseDot)} />
            <span data-market-license-badge="true" className="break-words">
              {license.label}
            </span>
          </span>
          <p className="break-words text-fg-2 [word-break:keep-all]">{license.summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <MarketProductionFitBadge record={record} />
          {!record.containsAi ? (
            <span
              data-market-no-ai-disclosed="true"
              className="inline-flex items-center gap-1 rounded-[6px] border border-good/30 bg-good/10 px-2 py-0.5 text-[0.68rem] font-medium text-good"
            >
              <ShieldCheck className="size-3" aria-hidden="true" />
              {bi("AI 미포함 공개", "No-AI disclosed")}
            </span>
          ) : null}
          {record.compatibility.engines.length > 0 ? (
            <span
              data-market-studio-ready="true"
              className="inline-flex items-center gap-1 rounded-[6px] border border-line bg-panel px-2 py-0.5 text-[0.68rem] font-medium text-fg-2"
            >
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              {bi("호환 정보 있음", "Compatibility info")}
            </span>
          ) : null}
        </div>

        {storageError ? (
          <p role="alert" className="rounded-[8px] border border-bad/30 bg-bad/10 p-2 text-xs text-fg">
            {storageError}
          </p>
        ) : null}

        <div
          className={cn(
            "mt-auto grid gap-1.5 border-t border-line/70 pt-2.5",
            onQuickPreview ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <Link
            href={`/market/resource/${record.id}`}
            aria-label={bi(`${record.name} 자세히 보기`, `View ${record.name} details`)}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-[8px] border border-accent/45 bg-accent-soft text-xs font-medium text-accent transition-colors duration-150 hover:border-accent hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            {bi("자세히", "Details")}
          </Link>
          {onQuickPreview ? (
            <button
              type="button"
              onClick={() => onQuickPreview(record)}
              aria-label={bi(`${record.name} 미리보기`, `Preview ${record.name}`)}
              className="inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-[8px] border border-line bg-panel text-xs font-medium text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <Eye className="hidden size-3.5 shrink-0 sm:inline" aria-hidden="true" />
              {bi("미리보기", "Preview")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
