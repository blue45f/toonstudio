import {
  ArrowUpRight,
  ExternalLink,
  Heart,
  Layers,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { useMarketRecentlyViewed } from "../hooks/use-market-recently-viewed";
import { useMarketWishlist } from "../hooks/use-market-wishlist";
import {
  formatMarketByteSize,
  formatMarketDate,
  marketKindMeta,
  marketLicenseMeta,
} from "../models/market-kind";
import { marketStudioResourceHref } from "../models/market-studio-handoff";

import { MarketCompareToggle } from "./MarketCompareToggle";
import { MarketProductionFitBadge } from "./MarketProductionFitBadge";
import { MarketResourceCover } from "./MarketResourceCover";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketQuickPreviewDialogProps {
  readonly record: CreatorMarketplaceResourceRecord | null;
  readonly onClose: () => void;
}

/**
 * 탐색·홈·배급자 스토어 목록을 벗어나지 않고 핵심 manifest 사양·권리·사전점검 결과를 확인하는 빠른 미리보기 모달.
 * `<dialog closedby="any">` + `showModal()` 표준을 사용하며, Safari 호환을 위한 backdrop 좌표 경계 클릭 닫기 폴백을 함께 제공한다.
 */
export function MarketQuickPreviewDialog({
  record,
  onClose,
}: MarketQuickPreviewDialogProps) {
  const t = useBilingual("MarketQuickPreviewDialog");
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const { recordRecentlyViewed } = useMarketRecentlyViewed();
  const { isWishlisted, toggleWishlist } = useMarketWishlist();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (record) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [record]);

  useEffect(() => {
    if (!record) return;
    recordRecentlyViewed(record);
  }, [record, recordRecentlyViewed]);

  const closeSafely = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") {
      dialog.close();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      // 합성 클릭(clientX/Y 0, rect 크기 0) 환경에서는 닫히지 않도록 실제 경계가 있을 때만 좌표 밖 클릭으로 판정한다.
      if (rect.width === 0 && rect.height === 0) {
        closeSafely();
        return;
      }
      const clickedInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!clickedInDialog) {
        closeSafely();
      }
    };
    dialog.addEventListener("click", handleBackdropClick);
    return () => {
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [closeSafely]);

  const kind = record ? marketKindMeta(record.kind) : null;
  const license = record ? marketLicenseMeta(record.license) : null;
  const wishlisted = record ? isWishlisted(record.id) : false;
  const fitLabSlug = record
    ? (record as { readonly slug?: string }).slug ?? record.packageId ?? record.id
    : "";

  return (
    <dialog
      ref={dialogRef}
      // HTML Standard light-dismiss attribute (`closedby="any"`) + Safari backdrop coordinate fallback
      {...({ closedby: "any" } as Record<string, string>)}
      aria-labelledby={record ? "market-quick-preview-title" : undefined}
      onClose={onClose}
      data-testid="market-quick-preview-dialog"
      className={cn(
        "m-auto w-[min(44rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl",
        "backdrop:bg-fg/45 backdrop:backdrop-blur-[2px]",
      )}
    >
      {record && kind && license ? (
        <div className="max-h-[min(86vh,48rem)] overflow-y-auto">
          <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-line bg-card">
            <MarketResourceCover record={record} />
            <div className="absolute left-3.5 top-3.5 z-10 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-canvas/95 px-2 py-1 font-display text-xs font-bold uppercase tracking-wider text-fg shadow-sm">
                {kind.english}
              </span>
              <span className="rounded-md bg-canvas/95 px-2 py-1 text-xs font-semibold text-fg shadow-sm">
                {license.label}
              </span>
              <span
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-semibold shadow-sm",
                  record.containsAi
                    ? "bg-warn/20 text-fg"
                    : "bg-good/20 text-fg",
                )}
              >
                {record.containsAi
                  ? t("AI 사용 포함 공개", "AI usage disclosed")
                  : t("AI 사용 미포함으로 공개", "Disclosed as No-AI")}
              </span>
            </div>
            <button
              type="button"
              onClick={closeSafely}
              aria-label={t("빠른 미리보기 닫기", "Close quick preview")}
              className="absolute right-3 top-3 z-10 inline-flex size-10 items-center justify-center rounded-full border border-line bg-canvas/90 text-fg shadow-sm transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-accent">
                  {kind.label} · v{record.resourceVersion} ·{" "}
                  {formatMarketByteSize(record.manifestByteSize)}
                </p>
                <h2
                  id="market-quick-preview-title"
                  className="mt-1 text-lg font-bold leading-snug text-fg sm:text-xl"
                >
                  {record.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-2">
                  <Link
                    href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
                    onClick={closeSafely}
                    className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                  >
                    <Store className="size-3.5" aria-hidden="true" />
                    {record.publisher.name}
                  </Link>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t(
                      `${formatMarketDate(record.updatedAt)} 업데이트`,
                      `Updated ${formatMarketDate(record.updatedAt)}`,
                    )}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={wishlisted}
                  onClick={() => toggleWishlist(record)}
                  className={buttonClass({
                    variant: wishlisted ? "solid" : "outline",
                    size: "sm",
                    className: "min-h-9 gap-1.5",
                  })}
                >
                  <Heart
                    className={cn("size-3.5", wishlisted && "fill-current")}
                    aria-hidden="true"
                  />
                  {wishlisted ? t("찜함", "Saved") : t("찜하기", "Save")}
                </button>
                <MarketCompareToggle record={record} />
              </div>
            </div>

            <p className="text-sm leading-relaxed text-fg-2">{record.description}</p>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-3">
              <MarketProductionFitBadge record={record} showCounts />
              <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-xs font-medium text-fg-2">
                <Layers className="size-3.5 text-accent" aria-hidden="true" />
                {t(`구성 항목 ${record.entries.length}개`, `${record.entries.length} entries`)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-xs font-medium text-fg-2">
                <ShieldCheck className="size-3.5 text-accent" aria-hidden="true" />
                Studio ≥ v{record.minimumStudioVersion}
              </span>
              {record.compatibility.engines.map((engine) => (
                <span
                  key={engine}
                  className="rounded-md border border-line bg-panel px-2 py-0.5 font-mono text-[11px] font-semibold text-fg-2"
                >
                  {engine}
                </span>
              ))}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-card/70 p-3 text-xs">
                <span className="font-bold text-fg">{t("사용권 요약", "License summary")}</span>
                <p className="mt-1 leading-relaxed text-fg-2">
                  <strong className="text-fg">{license.label}</strong> — {license.summary}
                </p>
                {record.attributionText ? (
                  <p className="mt-1 truncate text-fg-3">
                    {t("출처 표기:", "Attribution:")} {record.attributionText}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-line bg-card/70 p-3 text-xs">
                <span className="font-bold text-fg">
                  {t("패키지 구성 미리보기", "Package entries")}
                </span>
                <ul className="mt-1 space-y-1 text-fg-2">
                  {record.entries.slice(0, 3).map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-fg">{entry.name}</span>
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">
                        {entry.delivery.mode}
                      </span>
                    </li>
                  ))}
                  {record.entries.length > 3 ? (
                    <li className="text-[11px] text-fg-3">
                      {t(
                        `외 ${record.entries.length - 3}개 항목 더 포함`,
                        `+${record.entries.length - 3} more entries`,
                      )}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            {record.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {record.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                    onClick={closeSafely}
                    className="rounded-lg bg-raised px-2 py-1 text-xs font-medium text-fg-2 transition-colors hover:text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              <Link
                href={`/market/fit-lab?slug=${encodeURIComponent(fitLabSlug)}`}
                onClick={closeSafely}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "min-h-10 gap-1.5",
                })}
              >
                <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                {t("원고 위 시험 (Fit Lab)", "Test on manuscript (Fit Lab)")}
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={marketStudioResourceHref(record.id)}
                  onClick={closeSafely}
                  className={buttonClass({
                    variant: "outline",
                    size: "sm",
                    className: "min-h-10 gap-1.5",
                  })}
                >
                  {t("Studio에서 열기", "Open in Studio")}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </Link>
                <Link
                  href={`/market/resource/${encodeURIComponent(record.id)}`}
                  onClick={closeSafely}
                  className={buttonClass({
                    variant: "solid",
                    size: "sm",
                    className: "min-h-10 gap-1.5",
                  })}
                >
                  {t("상세 페이지 보기", "View full details")}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
