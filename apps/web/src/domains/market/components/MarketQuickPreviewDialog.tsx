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
import { useCallback, useEffect, useRef, useState } from "react";

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

function applyBodyScrollState(overflow: string, targetScrollY: number | null) {
  document.body.style.overflow = overflow;
  if (
    targetScrollY !== null &&
    (targetScrollY !== 0 || Math.round(window.scrollY) !== 0)
  ) {
    try {
      window.scrollTo(0, targetScrollY);
    } catch {
      // ignore in non-scrolling test environments
    }
  }
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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pendingFocusRestoreRef = useRef(false);
  const savedScrollYRef = useRef<number | null>(null);
  const savedBodyOverflowRef = useRef<string | null>(null);
  const [failedCoverRecordId, setFailedCoverRecordId] = useState<string | null>(null);
  const { recordRecentlyViewed } = useMarketRecentlyViewed();
  const { isWishlisted, toggleWishlist } = useMarketWishlist();

  const restoreBackgroundScroll = useCallback((clearSaved = false) => {
    const prevOverflow = savedBodyOverflowRef.current;
    const targetY = savedScrollYRef.current;
    if (clearSaved) {
      savedBodyOverflowRef.current = null;
      savedScrollYRef.current = null;
    }
    if (prevOverflow !== null || targetY !== null) {
      applyBodyScrollState(prevOverflow ?? "", targetY);
    }
  }, []);

  const restoreTriggerFocus = useCallback(() => {
    if (!pendingFocusRestoreRef.current) return;
    pendingFocusRestoreRef.current = false;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && trigger.isConnected && !trigger.hasAttribute("disabled")) {
      trigger.focus({ preventScroll: true });
      return;
    }
    const fallback =
      document.querySelector<HTMLElement>(
        '#main-content button:not([disabled]), #main-content input:not([disabled]), #main-content a[href], main button:not([disabled]), main input:not([disabled]), main a[href]',
      ) ?? document.querySelector<HTMLElement>("#main-content, main");
    if (fallback) {
      if (!fallback.hasAttribute("tabindex") && fallback.tabIndex < 0) {
        fallback.setAttribute("tabindex", "-1");
      }
      fallback.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    if (record) {
      pendingFocusRestoreRef.current = true;
      if (savedScrollYRef.current === null) {
        savedScrollYRef.current = window.scrollY;
      }
      if (savedBodyOverflowRef.current === null) {
        savedBodyOverflowRef.current = document.body.style.overflow;
      }
      applyBodyScrollState("hidden", savedScrollYRef.current);
      if (
        document.activeElement instanceof HTMLElement &&
        !dialog.contains(document.activeElement)
      ) {
        triggerRef.current = document.activeElement;
      }
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      }
      applyBodyScrollState("hidden", savedScrollYRef.current);
      closeButtonRef.current?.focus({ preventScroll: true });
    } else {
      if (dialog.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }
      restoreTriggerFocus();
      restoreBackgroundScroll(true);
    }

    return () => {
      if (!dialog.open) {
        restoreBackgroundScroll(true);
      }
    };
  }, [record, restoreBackgroundScroll, restoreTriggerFocus]);

  useEffect(
    () => () => {
      restoreBackgroundScroll(true);
    },
    [restoreBackgroundScroll],
  );

  useEffect(() => {
    if (!record) return;
    recordRecentlyViewed(record);
  }, [record, recordRecentlyViewed]);

  const closeSafely = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
    restoreTriggerFocus();
    restoreBackgroundScroll(false);
    onClose();
  }, [onClose, restoreBackgroundScroll, restoreTriggerFocus]);

  const handleDialogClose = useCallback(() => {
    restoreTriggerFocus();
    restoreBackgroundScroll(false);
    onClose();
  }, [onClose, restoreBackgroundScroll, restoreTriggerFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !record) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSafely();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last || !dialog.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSafely, record]);

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
  const coverImageFailed = Boolean(record && failedCoverRecordId === record.id);
  const fitLabSlug = record
    ? (record as { readonly slug?: string }).slug ?? record.packageId ?? record.id
    : "";

  return (
    <dialog
      ref={dialogRef}
      // HTML Standard light-dismiss attribute (`closedby="any"`) + Safari backdrop coordinate fallback
      {...({ closedby: "any" } as Record<string, string>)}
      aria-modal={record ? "true" : undefined}
      aria-labelledby={record ? "market-quick-preview-title" : undefined}
      onClose={handleDialogClose}
      data-testid="market-quick-preview-dialog"
      data-own-control-size=""
      className={cn(
        "m-auto w-[min(44rem,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-2xl border border-line bg-panel p-0 text-fg shadow-2xl",
        "backdrop:bg-fg/45 backdrop:backdrop-blur-[2px]",
      )}
    >
      {record && kind && license ? (
        <div className="relative">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={closeSafely}
            aria-label={t("빠른 미리보기 닫기", "Close quick preview")}
            className="absolute right-3 top-3 z-20 inline-flex size-11 min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-canvas/95 text-fg shadow-md transition-colors motion-reduce:transition-none hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
          >
            <X className="size-4" aria-hidden="true" />
          </button>

          <div
            data-testid="market-quick-preview-scroll"
            className="max-h-[min(86vh,48rem)] overflow-y-auto overscroll-contain"
          >
            <div
              data-testid="market-quick-preview-cover"
              onErrorCapture={(event) => {
                if (event.target instanceof HTMLImageElement) {
                  event.target.style.display = "none";
                  setFailedCoverRecordId(record.id);
                }
              }}
              className="relative aspect-[16/9] max-h-[28vh] w-full overflow-hidden border-b border-line bg-card sm:max-h-56"
            >
              <MarketResourceCover record={record} />
              {coverImageFailed ? (
                <div
                  data-testid="market-cover-fallback"
                  className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-1 bg-card/90 px-4 pt-8 text-center text-xs font-medium text-fg-2"
                >
                  <Layers className="size-5 text-accent" aria-hidden="true" />
                  <span>
                    {t(
                      "미리보기 이미지를 불러오지 못해 기본 표지로 표시합니다.",
                      "Preview image unavailable; showing default cover.",
                    )}
                  </span>
                </div>
              ) : null}
              <div className="absolute left-3 right-16 top-3 z-10 flex flex-wrap items-center gap-1.5">
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
            </div>

            <div className="space-y-4 p-4 sm:p-6 [overflow-wrap:anywhere]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-accent">
                    {kind.label} · v{record.resourceVersion} ·{" "}
                    {formatMarketByteSize(record.manifestByteSize)}
                  </p>
                  <h2
                    id="market-quick-preview-title"
                    className="mt-1 break-words text-lg font-bold leading-snug text-fg sm:text-xl [overflow-wrap:anywhere]"
                  >
                    {record.name}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-2">
                    <Link
                      href={`/market/creator/${encodeURIComponent(record.publisher.id)}`}
                      onClick={closeSafely}
                      className="inline-flex min-h-11 min-w-11 max-w-full items-center gap-1 rounded-lg px-1.5 font-semibold text-accent [overflow-wrap:anywhere] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      <Store className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="break-words [overflow-wrap:anywhere]">
                        {record.publisher.name}
                      </span>
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

                <div className="flex flex-wrap items-center gap-2 [&_button]:min-h-11 [&_button]:min-w-11">
                  <button
                    type="button"
                    aria-pressed={wishlisted}
                    onClick={() => toggleWishlist(record)}
                    className={buttonClass({
                      variant: wishlisted ? "solid" : "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 gap-1.5 px-3.5",
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
                <div className="flex flex-wrap gap-2">
                  {record.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/market/browse?tag=${encodeURIComponent(tag)}`}
                      onClick={closeSafely}
                      className="inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-fg-2 [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-col gap-2.5 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeSafely}
                    data-testid="market-quick-preview-footer-close"
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 gap-1.5 px-3.5",
                    })}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    {t("닫기", "Close")}
                  </button>
                  <Link
                    href={`/market/fit-lab?slug=${encodeURIComponent(fitLabSlug)}`}
                    onClick={closeSafely}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 gap-1.5 px-3.5",
                    })}
                  >
                    <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                    {t("원고 위 시험 (Fit Lab)", "Test on manuscript (Fit Lab)")}
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={marketStudioResourceHref(record.id)}
                    onClick={closeSafely}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "min-h-11 min-w-11 gap-1.5 px-3.5",
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
                      className: "min-h-11 min-w-11 gap-1.5 px-3.5",
                    })}
                  >
                    {t("상세 페이지 보기", "View full details")}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
