import { ArrowLeft, CheckCircle2, Crosshair, ImagePlus, Trash2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useInRouterContext, useLocation, useNavigate } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  parseStudioExportFocusHandoff,
  useStudioExportUrlHandoffSync,
} from "../export/studio-export-url-handoff";
import {
  extractPrimaryFontFamily,
  isStudioExportFontFamilyAvailable,
} from "../studio-shell/studio-manuscript-preflight-targets";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

const RELINKED_PLACEHOLDER_SVG_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">' +
      '<rect width="320" height="240" rx="12" fill="#f4efe6" stroke="#c8b99e" stroke-width="4"/>' +
      '<circle cx="96" cy="88" r="22" fill="#d9cbb3"/>' +
      '<path d="M36 196 L118 118 L184 176 L232 136 L284 196 Z" fill="#b9a585"/>' +
      "</svg>",
  );

function RouterAwareLocationBridge({
  session,
}: {
  readonly session: StudioCuttoonEditorViewSession;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <StudioExportPreflightReturnBannerContent
      session={session}
      search={location.search}
      onNavigate={(href) => navigate(href)}
    />
  );
}

function StudioExportPreflightReturnBannerContent({
  session,
  search,
  onNavigate,
}: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly search: string;
  readonly onNavigate: (href: string) => void;
}) {
  const bt = useBilingual("StudioExportPanel");
  const [returning, setReturning] = useState(false);
  const autoRestoredSearchRef = useRef<string | null>(null);
  const handoff = parseStudioExportFocusHandoff(search);

  useStudioExportUrlHandoffSync({
    pages: session.pages ?? [],
    currentPageId: session.currentPageId,
    exportMenuOpen: session.exportMenuOpen,
    workHydrated: session.workHydrated,
    setExportFormat: session.setExportFormat ?? (() => {}),
    setExportScale: session.setExportScale ?? (() => {}),
    setExportPresetId: session.setExportPresetId ?? (() => {}),
    setExportMenuOpen: session.setExportMenuOpen ?? (() => {}),
    setCurrentPageId: session.setCurrentPageId,
    setSelectedId: session.setSelectedId,
    onScopedWriteLayer: session.onScopedWriteLayer,
  });

  useEffect(() => {
    if (!handoff?.returnToExport || !handoff.focusPageId) return;
    if (session.workId || !session.hasAutosave || session.autosaveRestoreBlockedReason) return;
    if ((session.pages ?? []).some((page) => page.id === handoff.focusPageId)) return;
    if (autoRestoredSearchRef.current === search) return;
    autoRestoredSearchRef.current = search;
    void session.studioCanvasViewportHandlers?.restoreAutosave?.();
  }, [
    handoff?.focusPageId,
    handoff?.returnToExport,
    search,
    session.autosaveRestoreBlockedReason,
    session.hasAutosave,
    session.pages,
    session.studioCanvasViewportHandlers,
    session.workId,
  ]);

  if (!handoff?.returnToExport) return null;

  const returnHref = handoff.returnToExport;
  const readOnly =
    session.collaborationReadOnly ||
    session.pageEditLocked ||
    Boolean(session.activeSurfaceReviewLocked);

  const targetElement = handoff.focusElementId
    ? session.elements.find((el) => el.id === handoff.focusElementId)
    : undefined;

  const elementRecord = targetElement as unknown as Record<string, unknown> | undefined;
  const hasMissingImage =
    targetElement?.type === "image" &&
    (!targetElement.src.trim() ||
      targetElement.src.trim().startsWith("missing:") ||
      targetElement.src.trim().startsWith("broken:") ||
      elementRecord?.missing === true ||
      elementRecord?.broken === true ||
      elementRecord?.loadError === true ||
      elementRecord?.assetStatus === "missing");

  const rawFont =
    targetElement && (targetElement.type === "bubble" || targetElement.type === "text")
      ? targetElement.font ?? ""
      : "";
  const primaryFont = extractPrimaryFontFamily(rawFont);
  const hasUnavailableFont =
    Boolean(targetElement && (targetElement.type === "bubble" || targetElement.type === "text")) &&
    (elementRecord?.missingFont === true ||
      (primaryFont !== null && !isStudioExportFontFamilyAvailable(primaryFont)));

  const pageCutBadge =
    handoff.focusPageNumber !== null
      ? handoff.focusCutNumber !== null
        ? bt(
            `${handoff.focusPageNumber}페이지 · ${handoff.focusCutNumber}컷`,
            `Page ${handoff.focusPageNumber} · Cut ${handoff.focusCutNumber}`,
          )
        : bt(`${handoff.focusPageNumber}페이지`, `Page ${handoff.focusPageNumber}`)
      : bt("대상 작업 위치", "Target cut");

  const handleRefocusTarget = () => {
    if (handoff.focusPageId && session.currentPageId !== handoff.focusPageId) {
      session.setCurrentPageId(handoff.focusPageId);
    }
    session.onScopedWriteLayer?.(handoff.focusElementId ?? null, handoff.focusCutId ?? null);
    session.setSelectedId(handoff.focusElementId ?? handoff.focusCutId ?? null);
  };

  const handleSwitchToSafeFont = () => {
    if (readOnly || !targetElement) return;
    const nextElements = session.elements.map((el) => {
      if (el.id !== targetElement.id) return el;
      if (el.type !== "bubble" && el.type !== "text") return el;
      const cloned: Record<string, unknown> = {
        ...(el as unknown as Record<string, unknown>),
        font: "Pretendard, sans-serif",
      };
      delete cloned["missingFont"];
      return cloned as unknown as typeof el;
    });
    if (session.commit(nextElements)) {
      session.requestSaveFlush();
    }
  };

  const handleRelinkPlaceholderAsset = () => {
    if (readOnly || !targetElement || targetElement.type !== "image") return;
    const nextElements = session.elements.map((el) => {
      if (el.id !== targetElement.id || el.type !== "image") return el;
      const cloned: Record<string, unknown> = {
        ...(el as unknown as Record<string, unknown>),
        src: RELINKED_PLACEHOLDER_SVG_DATA_URL,
      };
      delete cloned["missing"];
      delete cloned["broken"];
      delete cloned["loadError"];
      delete cloned["assetStatus"];
      return cloned as unknown as typeof el;
    });
    if (session.commit(nextElements)) {
      session.requestSaveFlush();
    }
  };

  const handleRemoveMissingLayer = () => {
    if (readOnly || !targetElement) return;
    const nextElements = session.elements.filter((el) => el.id !== targetElement.id);
    if (session.commit(nextElements)) {
      session.setSelectedId(handoff.focusCutId ?? null);
      session.requestSaveFlush();
    }
  };

  const handleReturnAndRecheck = async () => {
    if (returning) return;
    setReturning(true);
    session.requestSaveFlush();
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 250);
    });
    onNavigate(returnHref);
  };

  const resolvedOnCurrentPage =
    handoff.focusPageId === session.currentPageId &&
    Boolean(handoff.focusElementId) &&
    !hasMissingImage &&
    !hasUnavailableFont &&
    (handoff.findingCode === "missing-assets" || handoff.findingCode === "missing-fonts");

  return (
    <div
      role="region"
      aria-label={bt("내보내기 경고 직행 복귀 안내", "Export preflight fix & return bar")}
      data-testid="studio-export-preflight-return-banner"
      className="mx-2 my-1 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/45 bg-panel px-3 py-2 text-xs text-fg shadow-sm"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">
          {resolvedOnCurrentPage ? (
            <CheckCircle2 size={13} aria-hidden="true" />
          ) : (
            <Crosshair size={13} aria-hidden="true" />
          )}
          {pageCutBadge}
        </span>
        <span className="font-semibold text-fg-2">
          {resolvedOnCurrentPage
            ? bt(
                "이 컷의 경고가 정리되었어요. 돌아가서 같은 범위를 다시 검사하세요.",
                "Issue resolved on this cut. Return to recheck the same page range.",
              )
            : handoff.findingLabel
              ? bt(
                  `점검 항목: ${handoff.findingLabel}`,
                  `Preflight target: ${handoff.findingLabel}`,
                )
              : bt(
                  "내보내기 점검 경고 대상 컷으로 이동했어요.",
                  "Jumped to the target cut from export preflight.",
                )}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="studio-preflight-refocus-cut"
          onClick={handleRefocusTarget}
          className={buttonClass({
            size: "sm",
            variant: "outline",
            className: "min-h-9 gap-1 px-2.5 text-[0.7rem]",
          })}
        >
          <Crosshair size={12} aria-hidden="true" />
          {bt("대상 컷 포커스", "Focus cut")}
        </button>

        {!readOnly && hasUnavailableFont ? (
          <button
            type="button"
            data-testid="studio-preflight-fix-safe-font"
            onClick={handleSwitchToSafeFont}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: "min-h-9 gap-1 px-2.5 text-[0.7rem]",
            })}
          >
            <Type size={12} aria-hidden="true" />
            {bt("안전 서체(Pretendard)로 교체", "Replace with Pretendard")}
          </button>
        ) : null}

        {!readOnly && hasMissingImage ? (
          <>
            <button
              type="button"
              data-testid="studio-preflight-fix-missing-asset"
              onClick={handleRelinkPlaceholderAsset}
              className={buttonClass({
                size: "sm",
                variant: "outline",
                className: "min-h-9 gap-1 px-2.5 text-[0.7rem]",
              })}
            >
              <ImagePlus size={12} aria-hidden="true" />
              {bt("대체 소재 연결", "Relink asset")}
            </button>
            <button
              type="button"
              data-testid="studio-preflight-remove-missing-asset"
              onClick={handleRemoveMissingLayer}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-9 gap-1 px-2 text-[0.7rem]",
              })}
            >
              <Trash2 size={12} aria-hidden="true" />
              {bt("누락 레이어 제거", "Remove layer")}
            </button>
          </>
        ) : null}

        <button
          type="button"
          data-testid="studio-export-return-to-preflight"
          disabled={returning}
          onClick={() => void handleReturnAndRecheck()}
          className={buttonClass({
            size: "sm",
            variant: "solid",
            className: "min-h-9 gap-1.5 px-3 text-[0.72rem]",
          })}
        >
          <ArrowLeft size={13} aria-hidden="true" />
          {bt("수정 완료 · 같은 범위 다시 검사", "Done · Recheck same range")}
        </button>
      </div>
    </div>
  );
}

export function StudioExportPreflightReturnBanner({
  session,
}: {
  readonly session: StudioCuttoonEditorViewSession;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <RouterAwareLocationBridge session={session} />;
  }
  const fallbackSearch = typeof window !== "undefined" ? window.location.search : "";
  return (
    <StudioExportPreflightReturnBannerContent
      session={session}
      search={fallbackSearch}
      onNavigate={(href) => {
        if (typeof window !== "undefined") {
          window.location.assign(href);
        }
      }}
    />
  );
}
