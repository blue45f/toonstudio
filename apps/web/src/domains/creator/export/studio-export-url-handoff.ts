import { useEffect, useRef } from "react";

import type {
  StudioExportFindingLocation,
  StudioExportTargetId,
} from "../studio-export-preflight";
import { resolveStudioExportPageSelection } from "./studio-export-page-selection";
import type { ExportFormat } from "./studio-export-presets";

const VALID_EXPORT_TARGETS: readonly StudioExportTargetId[] = [
  "webtoon-platform",
  "social",
  "print",
  "image-pdf",
  "editable",
  "ebook",
  "video",
  "archive",
];

export interface StudioExportUrlHandoff {
  readonly openPanel: boolean;
  readonly format: ExportFormat | null;
  readonly scale: number | null;
  readonly presetId: string | null;
  readonly pageSelection: string | null;
  readonly firstSelectedPageIndex: number | null;
}

export interface StudioExportPanelUrlState {
  readonly target: StudioExportTargetId | null;
  readonly format: string | null;
  readonly width: number | null;
  readonly selectionMode: "all" | "custom" | null;
  readonly selectionExpression: string | null;
  readonly autoRecheck: boolean;
}

export interface StudioExportFocusHandoff {
  readonly focusPageId: string | null;
  readonly focusPageNumber: number | null;
  readonly focusCutId: string | null;
  readonly focusCutNumber: number | null;
  readonly focusElementId: string | null;
  readonly findingCode: string | null;
  readonly findingLabel: string | null;
  readonly returnToExport: string | null;
}

function normalizeEditorRasterFormat(raw: string | null | undefined): ExportFormat | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "png") return "png";
  if (lower === "jpg" || lower === "jpeg") return "jpg";
  if (lower === "webp") return "webp";
  return null;
}

function isValidExportTargetId(raw: string | null | undefined): raw is StudioExportTargetId {
  return typeof raw === "string" && (VALID_EXPORT_TARGETS as readonly string[]).includes(raw);
}

function sanitizeStudioInternalReturnHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/studio/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function resolveEditorExportPresetId(
  target: StudioExportTargetId,
  outputWidth: number,
  sourceWidth: number | null,
): string | null {
  if (target === "webtoon-platform") {
    if (outputWidth === 690) return "naver-challenge";
    if (outputWidth === 800) return "webtoon-canvas";
    if (outputWidth === 720) return "kakaopage";
    if (outputWidth === 1440) return "lezhin";
  }
  if (target === "social" && outputWidth === 1080) {
    return "instagram-portrait";
  }
  if (sourceWidth !== null && outputWidth === sourceWidth) {
    return "original";
  }
  return null;
}

export function buildStudioExportFinalizeHref(input: {
  readonly baseEditorHref: string;
  readonly target: StudioExportTargetId;
  readonly format: string;
  readonly scale: number;
  readonly outputWidth: number;
  readonly sourceWidth: number | null;
  readonly selectionMode: "all" | "custom";
  readonly selectedPageIndices: readonly number[];
}): string {
  const [pathname = input.baseEditorHref, rawSearch = ""] = input.baseEditorHref.split("?", 2);
  const params = new URLSearchParams(rawSearch);
  params.set("exportPanel", "1");

  const rasterFormat = normalizeEditorRasterFormat(input.format);
  if (rasterFormat) {
    params.set("exportFormat", rasterFormat);
  }
  if (Number.isFinite(input.scale) && input.scale > 0) {
    params.set(
      "exportScale",
      String(Math.round(Math.min(4, Math.max(0.25, input.scale)) * 1000) / 1000),
    );
  }
  const presetId = resolveEditorExportPresetId(input.target, input.outputWidth, input.sourceWidth);
  if (presetId) {
    params.set("exportPreset", presetId);
  } else {
    params.delete("exportPreset");
  }
  if (input.selectionMode === "custom" && input.selectedPageIndices.length > 0) {
    const compactPages = input.selectedPageIndices.map((index) => index + 1).join(",");
    params.set("exportPages", compactPages);
    params.delete("resume");
  } else {
    params.delete("exportPages");
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function buildStudioExportPreflightReturnHref(input: {
  readonly projectId: string;
  readonly target: StudioExportTargetId;
  readonly format: string;
  readonly width: number;
  readonly userEditedDimensions: boolean;
  readonly selectionMode: "all" | "custom";
  readonly selectionExpression: string;
  readonly autoRecheck?: boolean;
}): string {
  const pathname = `/studio/p/${encodeURIComponent(input.projectId)}/export`;
  const params = new URLSearchParams();
  params.set("exportTarget", input.target);
  if (input.format.trim()) {
    params.set("exportFormat", input.format.trim().toLowerCase());
  }
  if (input.userEditedDimensions && Number.isFinite(input.width) && input.width > 0) {
    params.set("exportWidth", String(Math.round(input.width)));
  }
  params.set("exportSelection", input.selectionMode);
  if (input.selectionMode === "custom" && input.selectionExpression.trim()) {
    params.set("exportPages", input.selectionExpression.trim());
  }
  if (input.autoRecheck ?? true) {
    params.set("autoRecheck", "1");
  }
  return `${pathname}?${params.toString()}`;
}

export function parseStudioExportPanelUrlState(search: string): StudioExportPanelUrlState | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const rawTarget = params.get("exportTarget");
  const target = isValidExportTargetId(rawTarget) ? rawTarget : null;
  const rawFormat = params.get("exportFormat")?.trim().toLowerCase() ?? "";
  const format = rawFormat.length > 0 ? rawFormat : null;
  const parsedWidth = Number(params.get("exportWidth"));
  const width =
    params.has("exportWidth") && Number.isFinite(parsedWidth) && parsedWidth > 0
      ? Math.round(parsedWidth)
      : null;
  const rawSelection = params.get("exportSelection");
  const selectionMode =
    rawSelection === "all" || rawSelection === "custom" ? rawSelection : null;
  const rawPages = params.get("exportPages")?.trim() ?? "";
  const selectionExpression = rawPages.length > 0 ? rawPages : null;
  const autoRecheck = params.get("autoRecheck") === "1";

  if (
    target === null &&
    format === null &&
    width === null &&
    selectionMode === null &&
    selectionExpression === null &&
    !autoRecheck
  ) {
    return null;
  }

  return Object.freeze({
    target,
    format,
    width,
    selectionMode,
    selectionExpression,
    autoRecheck,
  });
}

export function buildStudioExportFindingJumpHref(input: {
  readonly baseEditorHref: string;
  readonly location: StudioExportFindingLocation;
  readonly findingCode: string;
  readonly returnHref: string;
}): string {
  const [pathname = input.baseEditorHref, rawSearch = ""] = input.baseEditorHref.split("?", 2);
  const params = new URLSearchParams(rawSearch);
  params.delete("exportPanel");
  params.delete("resume");
  params.set("focusPageId", input.location.pageId);
  params.set("focusPageNumber", String(input.location.pageNumber));
  if (input.location.cutId) {
    params.set("focusCutId", input.location.cutId);
  } else {
    params.delete("focusCutId");
  }
  if (input.location.cutNumber !== null) {
    params.set("focusCutNumber", String(input.location.cutNumber));
  } else {
    params.delete("focusCutNumber");
  }
  if (input.location.elementId) {
    params.set("focusElementId", input.location.elementId);
  } else {
    params.delete("focusElementId");
  }
  params.set("findingCode", input.findingCode);
  if (input.location.label.trim()) {
    params.set("findingLabel", input.location.label.trim());
  } else {
    params.delete("findingLabel");
  }
  const safeReturn = sanitizeStudioInternalReturnHref(input.returnHref);
  if (safeReturn) {
    params.set("returnToExport", safeReturn);
  }
  const serialized = params.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

export function parseStudioExportFocusHandoff(search: string): StudioExportFocusHandoff | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const focusPageId = params.get("focusPageId")?.trim() || null;
  const rawPageNumber = Number(params.get("focusPageNumber"));
  const focusPageNumber =
    params.has("focusPageNumber") && Number.isSafeInteger(rawPageNumber) && rawPageNumber >= 1
      ? rawPageNumber
      : null;
  const focusCutId = params.get("focusCutId")?.trim() || null;
  const rawCutNumber = Number(params.get("focusCutNumber"));
  const focusCutNumber =
    params.has("focusCutNumber") && Number.isSafeInteger(rawCutNumber) && rawCutNumber >= 1
      ? rawCutNumber
      : null;
  const focusElementId = params.get("focusElementId")?.trim() || null;
  const findingCode = params.get("findingCode")?.trim() || null;
  const findingLabel = params.get("findingLabel")?.trim() || null;
  const returnToExport = sanitizeStudioInternalReturnHref(params.get("returnToExport"));

  if (!focusPageId && !focusCutId && !focusElementId && !returnToExport) {
    return null;
  }

  return Object.freeze({
    focusPageId,
    focusPageNumber,
    focusCutId,
    focusCutNumber,
    focusElementId,
    findingCode,
    findingLabel,
    returnToExport,
  });
}

export function parseStudioExportUrlHandoff(search: string): StudioExportUrlHandoff | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  const openPanel = params.get("exportPanel") === "1";
  const format = normalizeEditorRasterFormat(params.get("exportFormat"));
  const rawScale = Number(params.get("exportScale"));
  const scale =
    params.has("exportScale") && Number.isFinite(rawScale) && rawScale >= 0.25 && rawScale <= 4
      ? Math.round(rawScale * 1000) / 1000
      : null;
  const rawPreset = params.get("exportPreset")?.trim() ?? "";
  const presetId = rawPreset.length > 0 ? rawPreset : null;
  const rawPages = params.get("exportPages")?.trim() ?? "";
  const pageSelection = rawPages.length > 0 ? rawPages : null;
  let firstSelectedPageIndex: number | null = null;
  if (pageSelection) {
    const firstMatch = /^\s*(\d+)/u.exec(pageSelection);
    if (firstMatch) {
      const parsed = Number(firstMatch[1]);
      if (Number.isSafeInteger(parsed) && parsed >= 1) {
        firstSelectedPageIndex = parsed - 1;
      }
    }
  }
  if (
    !openPanel &&
    format === null &&
    scale === null &&
    presetId === null &&
    pageSelection === null
  ) {
    return null;
  }
  return Object.freeze({
    openPanel,
    format,
    scale,
    presetId,
    pageSelection,
    firstSelectedPageIndex,
  });
}

export function readInitialExportPageSelectionFromSearch(
  search: string,
  pageCount: number,
): {
  readonly usePageSelection: boolean;
  readonly pageSelection: string;
  readonly rangeFromPage: number;
  readonly rangeToPage: number;
} {
  const safeCount = Math.max(1, pageCount);
  const handoff = parseStudioExportUrlHandoff(search);
  if (!handoff?.pageSelection) {
    return {
      usePageSelection: false,
      pageSelection: "",
      rangeFromPage: 1,
      rangeToPage: safeCount,
    };
  }
  const resolved = resolveStudioExportPageSelection(safeCount, handoff.pageSelection);
  if (resolved.ok && resolved.indices.length > 0) {
    return {
      usePageSelection: true,
      pageSelection: handoff.pageSelection,
      rangeFromPage: resolved.indices[0]! + 1,
      rangeToPage: resolved.indices[resolved.indices.length - 1]! + 1,
    };
  }
  return {
    usePageSelection: true,
    pageSelection: handoff.pageSelection,
    rangeFromPage: 1,
    rangeToPage: safeCount,
  };
}

export function useStudioExportUrlHandoffSync(options: {
  readonly pages: readonly { readonly id: string }[];
  readonly currentPageId?: string;
  readonly exportMenuOpen?: boolean;
  readonly workHydrated?: boolean;
  readonly setExportFormat: (format: ExportFormat) => void;
  readonly setExportScale: (scale: number) => void;
  readonly setExportPresetId: (presetId: string | null) => void;
  readonly setExportMenuOpen: (open: boolean) => void;
  readonly setCurrentPageId?: (pageId: string) => unknown;
  readonly setSelectedId?: (id: string | null) => void;
  readonly onScopedWriteLayer?: (layerId: string | null, frameId: string | null) => void;
}): void {
  const {
    pages,
    currentPageId,
    exportMenuOpen,
    workHydrated,
    setExportFormat,
    setExportScale,
    setExportPresetId,
    setExportMenuOpen,
    setCurrentPageId,
    setSelectedId,
    onScopedWriteLayer,
  } = options;
  const appliedParamsRef = useRef<string | null>(null);
  const userInteractedWhileOpenRef = useRef(false);
  const lastSearchRef = useRef<string | null>(null);
  const pageSwitchAppliedRef = useRef<string | null>(null);
  const focusTargetAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !exportMenuOpen) return;
    const markInteracted = () => {
      if (document.querySelector("[data-studio-export-menu-panel]")) {
        userInteractedWhileOpenRef.current = true;
      }
    };
    document.addEventListener("pointerdown", markInteracted, true);
    document.addEventListener("keydown", markInteracted, true);
    return () => {
      document.removeEventListener("pointerdown", markInteracted, true);
      document.removeEventListener("keydown", markInteracted, true);
    };
  }, [exportMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    if (lastSearchRef.current !== search) {
      lastSearchRef.current = search;
      userInteractedWhileOpenRef.current = false;
    }

    const hydrated = workHydrated ?? true;
    const pageList = pages ?? [];
    const focusHandoff = parseStudioExportFocusHandoff(search);
    if (hydrated && focusHandoff) {
      const targetPage =
        (focusHandoff.focusPageId
          ? pageList.find((page) => page.id === focusHandoff.focusPageId)
          : undefined) ??
        (focusHandoff.focusPageNumber !== null &&
        pageList.length >= focusHandoff.focusPageNumber
          ? pageList[focusHandoff.focusPageNumber - 1]
          : undefined);

      if (targetPage?.id) {
        const pageApplyKey = `focus:${search}:${targetPage.id}`;
        if (pageSwitchAppliedRef.current !== pageApplyKey && setCurrentPageId) {
          pageSwitchAppliedRef.current = pageApplyKey;
          setCurrentPageId(targetPage.id);
        }

        const onTargetPage =
          currentPageId === undefined || currentPageId === targetPage.id;
        const selectionKey = `focus-sel:${search}:${targetPage.id}`;
        if (onTargetPage && focusTargetAppliedRef.current !== selectionKey) {
          focusTargetAppliedRef.current = selectionKey;
          onScopedWriteLayer?.(
            focusHandoff.focusElementId ?? null,
            focusHandoff.focusCutId ?? null,
          );
          const nextSelectedId = focusHandoff.focusElementId ?? focusHandoff.focusCutId ?? null;
          if (nextSelectedId !== null) {
            setSelectedId?.(nextSelectedId);
          }
        }
      }
    }

    const handoff = parseStudioExportUrlHandoff(search);
    if (!handoff) return;

    if (appliedParamsRef.current !== search) {
      appliedParamsRef.current = search;
      if (handoff.format !== null) setExportFormat(handoff.format);
      if (handoff.scale !== null) setExportScale(handoff.scale);
      if (handoff.presetId !== null) setExportPresetId(handoff.presetId);
    }

    if (
      handoff.openPanel &&
      hydrated &&
      !exportMenuOpen &&
      !userInteractedWhileOpenRef.current
    ) {
      setExportMenuOpen(true);
    }

    if (
      hydrated &&
      !focusHandoff &&
      handoff.firstSelectedPageIndex !== null &&
      pageList.length > handoff.firstSelectedPageIndex &&
      setCurrentPageId
    ) {
      const targetPage = pageList[handoff.firstSelectedPageIndex];
      const applyKey = targetPage?.id ? `${search}:${targetPage.id}` : null;
      if (targetPage?.id && applyKey && pageSwitchAppliedRef.current !== applyKey) {
        pageSwitchAppliedRef.current = applyKey;
        setCurrentPageId(targetPage.id);
      }
    }
  }, [
    currentPageId,
    exportMenuOpen,
    onScopedWriteLayer,
    pages,
    setCurrentPageId,
    setExportFormat,
    setExportMenuOpen,
    setExportPresetId,
    setExportScale,
    setSelectedId,
    workHydrated,
  ]);
}
