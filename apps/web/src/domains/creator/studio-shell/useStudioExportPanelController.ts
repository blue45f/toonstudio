import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  buildStudioExportFinalizeHref,
  buildStudioExportPreflightReturnHref,
  parseStudioExportPanelUrlState,
} from "../export/studio-export-url-handoff";
import {
  runStudioExportPreflight,
  STUDIO_EXPORT_TARGET_PROFILES,
  type StudioExportPreflightResult,
  type StudioExportTargetId,
} from "../studio-export-preflight";
import {
  clampStudioExportScale,
  createStudioProjectExportSnapshot,
  estimateStudioExportBytes,
  recommendedStudioExportDraft,
  summarizeStudioExportPreExportScope,
  type StudioExportDraftInput,
  type StudioManuscriptExportFacts,
} from "../studio-project-export-snapshot";
import {
  buildInitialDraft,
  computeManuscriptBasis,
  updatePreflight,
} from "./studio-export-panel-helpers";
import {
  loadPersistedManuscriptExportFacts,
  readSyncLocalManuscriptExportFacts,
} from "./studio-manuscript-export-facts";
import { aggregateSelectedScopePreflightFacts } from "./studio-manuscript-preflight-targets";
import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

export function useStudioExportPanelController(projectId: string, locale: "ko" | "en") {
  const bt = useBilingual("StudioExportPanel");
  const location = useLocation();
  const urlState = useMemo(() => parseStudioExportPanelUrlState(location.search), [location.search]);
  const loadKey = `${projectId}:${locale}:${location.key}:${location.search}`;

  const workspace = useStudioProjectWorkspace(projectId, locale);
  const syncManuscript =
    typeof window !== "undefined"
      ? readSyncLocalManuscriptExportFacts(window.localStorage, projectId, locale)
      : null;
  const [persistedManuscript, setPersistedManuscript] =
    useState<StudioManuscriptExportFacts | null>(null);
  const [persistedLoadedKey, setPersistedLoadedKey] = useState<string | null>(null);

  const manuscript =
    persistedManuscript?.documentId === syncManuscript?.documentId && persistedManuscript !== null
      ? persistedManuscript
      : syncManuscript;

  const [target, setTarget] = useState<StudioExportTargetId>(
    () => urlState?.target ?? "webtoon-platform",
  );
  const [selectionMode, setSelectionMode] = useState<"all" | "custom">(() =>
    urlState?.selectionMode ?? (urlState?.selectionExpression ? "custom" : "all"),
  );
  const [selectionExpression, setSelectionExpression] = useState<string>(
    () => urlState?.selectionExpression ?? "",
  );
  const [userEditedWidth, setUserEditedWidth] = useState<boolean>(
    () => urlState?.width !== null && urlState?.width !== undefined,
  );
  const [userEditedHeight, setUserEditedHeight] = useState(false);
  const [userEditedTextSize, setUserEditedTextSize] = useState(false);
  const [customEstimateOverride, setCustomEstimateOverride] = useState(false);
  const [selectionDirtySinceCheck, setSelectionDirtySinceCheck] = useState(false);

  const [draft, setDraft] = useState<StudioExportDraftInput>(() => {
    const initialTarget = urlState?.target ?? "webtoon-platform";
    const initialMode =
      urlState?.selectionMode ?? (urlState?.selectionExpression ? "custom" : "all");
    const initialExpr = urlState?.selectionExpression ?? "";
    const base = buildInitialDraft(projectId, initialTarget, syncManuscript);
    const targetProfile = STUDIO_EXPORT_TARGET_PROFILES[initialTarget];
    const nextFormat =
      urlState?.format && targetProfile.allowedFormats.includes(urlState.format)
        ? urlState.format
        : base.format;
    const basis = computeManuscriptBasis(syncManuscript, initialMode, initialExpr);
    const nextWidth = urlState?.width ?? (basis ? basis.sourceWidth : base.width);
    const scale = basis ? clampStudioExportScale(nextWidth / basis.sourceWidth) : 1;
    const nextHeight = basis ? Math.max(1, Math.round(basis.sourceHeight * scale)) : base.height;
    return {
      ...base,
      format: nextFormat,
      width: nextWidth,
      height: nextHeight,
      estimatedFileSizeBytes: estimateStudioExportBytes({
        width: nextWidth,
        height: nextHeight,
        format: nextFormat,
      }),
    };
  });

  const [result, setResult] = useState<StudioExportPreflightResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appliedSearchRef = useRef<string>(location.search);
  const autoRecheckedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedSearchRef.current === location.search) return;
    appliedSearchRef.current = location.search;
    if (!urlState) return;
    const nextTarget = urlState.target ?? target;
    const nextMode =
      urlState.selectionMode ?? (urlState.selectionExpression ? "custom" : selectionMode);
    const nextExpr = urlState.selectionExpression ?? (nextMode === "all" ? "" : selectionExpression);
    if (urlState.target) setTarget(urlState.target);
    setSelectionMode(nextMode);
    setSelectionExpression(nextExpr);
    if (urlState.width !== null) {
      setUserEditedWidth(true);
    }
    const targetProfile = STUDIO_EXPORT_TARGET_PROFILES[nextTarget];
    const basis = computeManuscriptBasis(manuscript, nextMode, nextExpr);
    setDraft((current) => {
      const nextFormat =
        urlState.format && targetProfile.allowedFormats.includes(urlState.format)
          ? urlState.format
          : current.format;
      const nextWidth = urlState.width ?? current.width;
      const scale = basis ? clampStudioExportScale(nextWidth / basis.sourceWidth) : 1;
      const nextHeight = basis
        ? Math.max(1, Math.round(basis.sourceHeight * scale))
        : current.height;
      return {
        ...current,
        target: nextTarget,
        format: nextFormat,
        width: nextWidth,
        height: nextHeight,
        estimatedFileSizeBytes: estimateStudioExportBytes({
          width: nextWidth,
          height: nextHeight,
          format: nextFormat,
        }),
      };
    });
  }, [location.search, manuscript, selectionExpression, selectionMode, target, urlState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void loadPersistedManuscriptExportFacts(window.localStorage, projectId, locale).then(
      (loaded) => {
        if (cancelled) return;
        if (loaded) {
          setPersistedManuscript(loaded);
          if (loaded.sourceAuthority === "manuscript-snapshot") {
            setDraft((current) => {
              const basis = computeManuscriptBasis(loaded, selectionMode, selectionExpression);
              if (!basis) return current;
              const nextWidth = userEditedWidth ? current.width : basis.sourceWidth;
              const scale = clampStudioExportScale(nextWidth / basis.sourceWidth);
              const nextHeight = userEditedHeight
                ? current.height
                : Math.max(1, Math.round(basis.sourceHeight * scale));
              return {
                ...current,
                documentId: loaded.documentId,
                width: nextWidth,
                height: nextHeight,
                estimatedFileSizeBytes: customEstimateOverride
                  ? current.estimatedFileSizeBytes
                  : estimateStudioExportBytes({
                      width: nextWidth,
                      height: nextHeight,
                      format: current.format,
                    }),
              };
            });
          }
        }
        setPersistedLoadedKey(loadKey);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    customEstimateOverride,
    loadKey,
    locale,
    projectId,
    selectionExpression,
    selectionMode,
    userEditedHeight,
    userEditedWidth,
  ]);

  const manuscriptBasis = useMemo(
    () => computeManuscriptBasis(manuscript, selectionMode, selectionExpression),
    [manuscript, selectionMode, selectionExpression],
  );
  const profile = STUDIO_EXPORT_TARGET_PROFILES[target];
  const recommendedDraft = useMemo(
    () => recommendedStudioExportDraft(projectId, target, manuscriptBasis),
    [projectId, target, manuscriptBasis],
  );
  const scopeSummary = useMemo(
    () =>
      summarizeStudioExportPreExportScope({
        target,
        draft,
        manuscript,
        selectionMode,
        selectionExpression,
        customEstimateOverride,
      }),
    [customEstimateOverride, draft, manuscript, selectionExpression, selectionMode, target],
  );

  const scopePreflightFacts = useMemo(
    () =>
      aggregateSelectedScopePreflightFacts({
        manuscript,
        selectedPageIndices: scopeSummary.actual.selectedPageIndices,
        plannedExportScale: scopeSummary.actual.plannedExportScale,
        minimumRecommendedTextPx: profile.minimumTextPx ?? null,
      }),
    [
      manuscript,
      profile.minimumTextPx,
      scopeSummary.actual.plannedExportScale,
      scopeSummary.actual.selectedPageIndices,
    ],
  );

  const effectiveDraft = useMemo<StudioExportDraftInput>(() => {
    if (!scopePreflightFacts) return draft;
    return {
      ...draft,
      missingAssetIds: [
        ...new Set([...draft.missingAssetIds, ...scopePreflightFacts.missingAssetIds]),
      ],
      missingFontIds: [
        ...new Set([...draft.missingFontIds, ...scopePreflightFacts.missingFontIds]),
      ],
      minimumTextPx:
        !userEditedTextSize && scopePreflightFacts.minimumTextPx !== null
          ? scopePreflightFacts.minimumTextPx
          : draft.minimumTextPx,
      findingLocations: scopePreflightFacts.findingLocations,
    };
  }, [draft, scopePreflightFacts, userEditedTextSize]);

  const returnHref = useMemo(
    () =>
      buildStudioExportPreflightReturnHref({
        projectId,
        target,
        format: draft.format,
        width: draft.width,
        userEditedDimensions: userEditedWidth || userEditedHeight,
        selectionMode,
        selectionExpression,
        autoRecheck: true,
      }),
    [
      draft.format,
      draft.width,
      projectId,
      selectionExpression,
      selectionMode,
      target,
      userEditedHeight,
      userEditedWidth,
    ],
  );

  const syncReturnStateInHistory = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.history.replaceState(window.history.state, "", returnHref);
    } catch {
      // 격리 테스트 라우터 환경에서는 history replace 실패를 무시한다.
    }
  }, [returnHref]);

  const hasCustomSpec =
    draft.width !== recommendedDraft.width ||
    draft.height !== recommendedDraft.height ||
    draft.format !== recommendedDraft.format ||
    draft.dpi !== recommendedDraft.dpi ||
    draft.colorSpace !== recommendedDraft.colorSpace;
  const isAtActualManuscriptSize =
    manuscriptBasis !== null &&
    draft.width === manuscriptBasis.sourceWidth &&
    draft.height === manuscriptBasis.sourceHeight;

  const savedResult =
    workspace.state?.exportPreflights.find(
      (item) => item.target === target && item.policyVersion === profile.policyVersion,
    ) ?? null;
  const displayedResult = selectionDirtySinceCheck ? result : (result ?? savedResult);

  const projectFacts = useMemo(() => {
    const state = workspace.state;
    return {
      blockedAssets: state?.assets.filter((asset) => asset.status === "blocked").length ?? 0,
      warningAssets: state?.assets.filter((asset) => asset.status === "warning").length ?? 0,
      localization:
        state?.localization.reduce((sum, item) => sum + item.blockingIssueCount, 0) ?? 0,
      comments:
        state?.reviewSession.threads.filter((thread) => thread.status === "open").length ?? 0,
    };
  }, [workspace.state]);

  const syncDraftHeightForSelection = (nextMode: "all" | "custom", nextExpression: string) => {
    const nextBasis = computeManuscriptBasis(manuscript, nextMode, nextExpression);
    if (!nextBasis) return;
    setDraft((current) => {
      const scale = clampStudioExportScale(current.width / nextBasis.sourceWidth);
      const nextWidth = Math.max(1, Math.round(nextBasis.sourceWidth * scale));
      const nextHeight = Math.max(1, Math.round(nextBasis.sourceHeight * scale));
      return {
        ...current,
        width: nextWidth,
        height: nextHeight,
        estimatedFileSizeBytes: customEstimateOverride
          ? current.estimatedFileSizeBytes
          : estimateStudioExportBytes({
              width: nextWidth,
              height: nextHeight,
              format: current.format,
            }),
      };
    });
  };

  const handleChangeSelectionMode = (nextMode: "all" | "custom") => {
    const nextExpression =
      nextMode === "custom" && !selectionExpression.trim()
        ? manuscript && manuscript.pages.length > 1
          ? `1–${manuscript.pages.length}`
          : "1"
        : selectionExpression;
    setSelectionMode(nextMode);
    setSelectionExpression(nextExpression);
    syncDraftHeightForSelection(nextMode, nextExpression);
    setSelectionDirtySinceCheck(true);
    setResult(null);
    setMessage(null);
  };

  const handleChangeSelectionExpression = (nextExpression: string) => {
    setSelectionExpression(nextExpression);
    syncDraftHeightForSelection("custom", nextExpression);
    setSelectionDirtySinceCheck(true);
    setResult(null);
    setMessage(null);
  };

  const selectTarget = (nextTarget: StudioExportTargetId) => {
    setTarget(nextTarget);
    setUserEditedWidth(false);
    setUserEditedHeight(false);
    setUserEditedTextSize(false);
    setCustomEstimateOverride(false);
    setSelectionDirtySinceCheck(false);
    const nextBasis = computeManuscriptBasis(manuscript, selectionMode, selectionExpression);
    const nextRecommended = recommendedStudioExportDraft(projectId, nextTarget, nextBasis);
    setDraft(
      manuscript && nextBasis
        ? {
            ...nextRecommended,
            documentId: manuscript.documentId,
            width: nextBasis.sourceWidth,
            height: nextBasis.sourceHeight,
            estimatedFileSizeBytes: estimateStudioExportBytes({
              width: nextBasis.sourceWidth,
              height: nextBasis.sourceHeight,
              format: nextRecommended.format,
            }),
          }
        : nextRecommended,
    );
    setResult(null);
    setMessage(null);
    setError(null);
  };

  const resetToRecommendedSpec = () => {
    const next = recommendedStudioExportDraft(projectId, target, manuscriptBasis);
    setUserEditedWidth(true);
    setUserEditedHeight(false);
    setCustomEstimateOverride(false);
    setDraft(manuscript ? { ...next, documentId: manuscript.documentId } : next);
    setResult(null);
    setMessage(
      bt(
        "선택한 올릴 곳의 권장 해상도·형식으로 되돌렸어요.",
        "Restored the recommended resolution and format for this destination.",
      ),
    );
    setError(null);
  };

  const patch = <K extends keyof StudioExportDraftInput>(
    key: K,
    value: StudioExportDraftInput[K],
  ) => {
    if (key === "width") setUserEditedWidth(true);
    if (key === "height") setUserEditedHeight(true);
    if (key === "minimumTextPx") setUserEditedTextSize(true);
    if (key === "estimatedFileSizeBytes") setCustomEstimateOverride(true);
    setDraft((current) => {
      const nextWidth = key === "width" && typeof value === "number" ? value : current.width;
      let nextHeight = key === "height" && typeof value === "number" ? value : current.height;
      if (key === "width" && typeof value === "number" && manuscriptBasis) {
        const scale = clampStudioExportScale(value / manuscriptBasis.sourceWidth);
        nextHeight = Math.max(1, Math.round(manuscriptBasis.sourceHeight * scale));
      }
      const nextFormat = key === "format" && typeof value === "string" ? value : current.format;
      const shouldAutoEstimate =
        key !== "estimatedFileSizeBytes" &&
        !customEstimateOverride &&
        (key === "width" || key === "height" || key === "format");
      return {
        ...current,
        [key]: value,
        ...(key === "width" ? { height: nextHeight } : {}),
        ...(shouldAutoEstimate
          ? {
              estimatedFileSizeBytes: estimateStudioExportBytes({
                width: nextWidth,
                height: nextHeight,
                format: nextFormat,
              }),
            }
          : {}),
      };
    });
    setResult(null);
    setMessage(null);
  };

  const executePreflight = useCallback(
    (options?: { readonly fromAutoRecheck?: boolean }) => {
      if (!scopeSummary.actual.selectionValid) {
        setError(
          scopeSummary.actual.selectionError ??
            bt(
              "내보낼 페이지 번호 범위를 먼저 확인해 주세요.",
              "Check the selected page range first.",
            ),
        );
        return;
      }
      if (!workspace.state) {
        setError(
          bt(
            "작품 정보를 아직 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 검사해 주세요.",
            "Reload project state before running preflight.",
          ),
        );
        return;
      }
      try {
        const next = runStudioExportPreflight(
          target,
          createStudioProjectExportSnapshot(workspace.state, { ...effectiveDraft, target }),
        );
        const updated = workspace.update((current) => ({
          ...current,
          exportPreflights: updatePreflight(current.exportPreflights, next),
        }));
        if (!updated) throw new Error("검사 결과를 기기에 저장하지 못했어요.");
        setSelectionDirtySinceCheck(false);
        setResult(next);
        setMessage(
          options?.fromAutoRecheck
            ? bt(
                "편집기에서 돌아와 이전과 같은 범위를 최신 원고 기준으로 다시 검사했어요.",
                "Returned from editor and rechecked the same page range against the updated manuscript.",
              )
            : bt(
                "지금 설정으로 출고 전 점검을 마치고 결과를 저장했어요.",
                "Saved preflight from the current project state.",
              ),
        );
        setError(null);
        if (!options?.fromAutoRecheck) {
          syncReturnStateInHistory();
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : bt(
                "출고 전 점검을 실행하지 못했어요. 잠시 후 다시 눌러 주세요.",
                "Preflight could not be completed.",
              ),
        );
      }
    },
    [
      bt,
      effectiveDraft,
      scopeSummary.actual.selectionError,
      scopeSummary.actual.selectionValid,
      syncReturnStateInHistory,
      target,
      workspace,
    ],
  );

  useEffect(() => {
    if (!urlState?.autoRecheck) return;
    if (persistedLoadedKey !== loadKey) return;
    if (!workspace.state) return;
    if (autoRecheckedKeyRef.current === loadKey) return;
    autoRecheckedKeyRef.current = loadKey;
    executePreflight({ fromAutoRecheck: true });
  }, [executePreflight, loadKey, persistedLoadedKey, urlState?.autoRecheck, workspace.state]);

  const editorHref = manuscript
    ? buildStudioExportFinalizeHref({
        baseEditorHref: manuscript.localEditorHref,
        target,
        format: draft.format,
        scale: scopeSummary.actual.plannedExportScale,
        outputWidth: scopeSummary.actual.plannedOutputWidth,
        sourceWidth: scopeSummary.actual.sourceCanvasWidth,
        selectionMode,
        selectedPageIndices: scopeSummary.actual.selectedPageIndices,
      })
    : `/studio/work/${encodeURIComponent(projectId)}/publish`;
  const communityPublishHref = manuscript
    ? "/studio/publish"
    : `/studio/work/${encodeURIComponent(projectId)}/publish`;

  return {
    workspaceError: workspace.error,
    manuscript,
    target,
    profile,
    draft,
    effectiveDraft,
    recommendedDraft,
    scopeSummary,
    hasCustomSpec,
    isAtActualManuscriptSize,
    displayedResult,
    projectFacts,
    returnHref,
    editorHref,
    communityPublishHref,
    message,
    error,
    selectTarget,
    resetToRecommendedSpec,
    patch,
    handleChangeSelectionMode,
    handleChangeSelectionExpression,
    syncReturnStateInHistory,
    runPreflight: () => executePreflight({ fromAutoRecheck: false }),
  };
}
