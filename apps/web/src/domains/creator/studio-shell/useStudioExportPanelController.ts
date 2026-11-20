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

interface TargetDraftState {
  readonly draft: StudioExportDraftInput;
  readonly userEditedWidth: boolean;
  readonly userEditedHeight: boolean;
  readonly userEditedTextSize: boolean;
  readonly customEstimateOverride: boolean;
}

function createTargetDraftState(
  projectId: string,
  targetId: StudioExportTargetId,
  manuscript: StudioManuscriptExportFacts | null,
  selectionMode: "all" | "custom",
  selectionExpression: string,
): TargetDraftState {
  const basis = computeManuscriptBasis(manuscript, selectionMode, selectionExpression);
  const recommended = recommendedStudioExportDraft(projectId, targetId, basis);
  return {
    draft:
      manuscript && basis
        ? {
            ...recommended,
            documentId: manuscript.documentId,
            width: basis.sourceWidth,
            height: basis.sourceHeight,
            estimatedFileSizeBytes: estimateStudioExportBytes({
              width: basis.sourceWidth,
              height: basis.sourceHeight,
              format: recommended.format,
            }),
          }
        : recommended,
    userEditedWidth: false,
    userEditedHeight: false,
    userEditedTextSize: false,
    customEstimateOverride: false,
  };
}

export function useStudioExportPanelController(projectId: string, locale: "ko" | "en", owner: string | null | undefined) {
  const bt = useBilingual("StudioExportPanel");
  const location = useLocation();
  const urlState = useMemo(() => parseStudioExportPanelUrlState(location.search), [location.search]);
  const loadKey = `${projectId}:${locale}:${location.key}:${location.search}`;

  const workspace = useStudioProjectWorkspace(projectId, locale, owner);
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
  const [selectionDirtySinceCheck, setSelectionDirtySinceCheck] = useState(false);

  // 대상별로 조정한 초안과 편집 플래그를 보존해 목적을 오가도 입력값이 사라지지 않게 한다.
  const [targetStates, setTargetStates] = useState<
    Partial<Record<StudioExportTargetId, TargetDraftState>>
  >(() => {
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
      [initialTarget]: {
        draft: {
          ...base,
          format: nextFormat,
          width: nextWidth,
          height: nextHeight,
          estimatedFileSizeBytes: estimateStudioExportBytes({
            width: nextWidth,
            height: nextHeight,
            format: nextFormat,
          }),
        },
        userEditedWidth: urlState?.width !== null && urlState?.width !== undefined,
        userEditedHeight: false,
        userEditedTextSize: false,
        customEstimateOverride: false,
      },
    };
  });

  const activeState = useMemo(
    () =>
      targetStates[target] ??
      createTargetDraftState(projectId, target, manuscript, selectionMode, selectionExpression),
    [manuscript, projectId, selectionExpression, selectionMode, target, targetStates],
  );
  const {
    draft,
    userEditedWidth,
    userEditedHeight,
    userEditedTextSize,
    customEstimateOverride,
  } = activeState;

  const [result, setResult] = useState<StudioExportPreflightResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appliedSearchRef = useRef<string>(location.search);
  const autoRecheckedKeyRef = useRef<string | null>(null);
  const lastActionRef = useRef<string | null>(null);

  // 같은 동작의 연속(더블) 클릭을 한 번만 처리한다.
  const runGuarded = useCallback((key: string, fn: () => void) => {
    if (lastActionRef.current === key) return;
    lastActionRef.current = key;
    queueMicrotask(() => {
      if (lastActionRef.current === key) lastActionRef.current = null;
    });
    fn();
  }, []);

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
    const targetProfile = STUDIO_EXPORT_TARGET_PROFILES[nextTarget];
    const basis = computeManuscriptBasis(manuscript, nextMode, nextExpr);
    setTargetStates((prev) => {
      const current =
        prev[nextTarget] ??
        createTargetDraftState(projectId, nextTarget, manuscript, nextMode, nextExpr);
      const nextFormat =
        urlState.format && targetProfile.allowedFormats.includes(urlState.format)
          ? urlState.format
          : current.draft.format;
      const nextWidth = urlState.width ?? current.draft.width;
      const scale = basis ? clampStudioExportScale(nextWidth / basis.sourceWidth) : 1;
      const nextHeight = basis
        ? Math.max(1, Math.round(basis.sourceHeight * scale))
        : current.draft.height;
      return {
        ...prev,
        [nextTarget]: {
          ...current,
          userEditedWidth: urlState.width !== null ? true : current.userEditedWidth,
          draft: {
            ...current.draft,
            target: nextTarget,
            format: nextFormat,
            width: nextWidth,
            height: nextHeight,
            estimatedFileSizeBytes: estimateStudioExportBytes({
              width: nextWidth,
              height: nextHeight,
              format: nextFormat,
            }),
          },
        },
      };
    });
  }, [location.search, manuscript, projectId, selectionExpression, selectionMode, target, urlState]);

  useEffect(() => {
    if (typeof window === "undefined" || owner === undefined) return;
    let cancelled = false;
    void loadPersistedManuscriptExportFacts(window.localStorage, projectId, locale, owner).then(
      (loaded) => {
        if (cancelled) return;
        if (loaded) {
          setPersistedManuscript(loaded);
          if (loaded.sourceAuthority === "manuscript-snapshot") {
            const basis = computeManuscriptBasis(loaded, selectionMode, selectionExpression);
            if (basis) {
              setTargetStates((prev) => {
                const next: Partial<Record<StudioExportTargetId, TargetDraftState>> = {};
                for (const [key, state] of Object.entries(prev) as [
                  StudioExportTargetId,
                  TargetDraftState,
                ][]) {
                  const nextWidth = state.userEditedWidth ? state.draft.width : basis.sourceWidth;
                  const scale = clampStudioExportScale(nextWidth / basis.sourceWidth);
                  const nextHeight = state.userEditedHeight
                    ? state.draft.height
                    : Math.max(1, Math.round(basis.sourceHeight * scale));
                  next[key] = {
                    ...state,
                    draft: {
                      ...state.draft,
                      documentId: loaded.documentId,
                      width: nextWidth,
                      height: nextHeight,
                      estimatedFileSizeBytes: state.customEstimateOverride
                        ? state.draft.estimatedFileSizeBytes
                        : estimateStudioExportBytes({
                            width: nextWidth,
                            height: nextHeight,
                            format: state.draft.format,
                          }),
                    },
                  };
                }
                return next;
              });
            }
          }
        }
        setPersistedLoadedKey(loadKey);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadKey, locale, owner, projectId, selectionExpression, selectionMode]);

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

  const savedResult = owner === undefined ? null :
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
    setTargetStates((prev) => {
      const current =
        prev[target] ??
        createTargetDraftState(projectId, target, manuscript, nextMode, nextExpression);
      const scale = clampStudioExportScale(current.draft.width / nextBasis.sourceWidth);
      const nextWidth = Math.max(1, Math.round(nextBasis.sourceWidth * scale));
      const nextHeight = Math.max(1, Math.round(nextBasis.sourceHeight * scale));
      return {
        ...prev,
        [target]: {
          ...current,
          draft: {
            ...current.draft,
            width: nextWidth,
            height: nextHeight,
            estimatedFileSizeBytes: current.customEstimateOverride
              ? current.draft.estimatedFileSizeBytes
              : estimateStudioExportBytes({
                  width: nextWidth,
                  height: nextHeight,
                  format: current.draft.format,
                }),
          },
        },
      };
    });
  };

  const handleChangeSelectionMode = (nextMode: "all" | "custom") => {
    lastActionRef.current = null;
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
    lastActionRef.current = null;
    setSelectionExpression(nextExpression);
    syncDraftHeightForSelection("custom", nextExpression);
    setSelectionDirtySinceCheck(true);
    setResult(null);
    setMessage(null);
  };

  const selectTarget = (nextTarget: StudioExportTargetId) => {
    runGuarded(`target:${nextTarget}`, () => {
      setTarget(nextTarget);
      setTargetStates((prev) =>
        prev[nextTarget]
          ? prev
          : {
              ...prev,
              [nextTarget]: createTargetDraftState(
                projectId,
                nextTarget,
                manuscript,
                selectionMode,
                selectionExpression,
              ),
            },
      );
      setSelectionDirtySinceCheck(false);
      setResult(null);
      setMessage(null);
      setError(null);
    });
  };

  const resetToRecommendedSpec = () => {
    runGuarded("reset-draft", () => {
      const next = recommendedStudioExportDraft(projectId, target, manuscriptBasis);
      setTargetStates((prev) => {
        const current =
          prev[target] ??
          createTargetDraftState(projectId, target, manuscript, selectionMode, selectionExpression);
        return {
          ...prev,
          [target]: {
            ...current,
            userEditedWidth: true,
            userEditedHeight: false,
            customEstimateOverride: false,
            draft: manuscript ? { ...next, documentId: manuscript.documentId } : next,
          },
        };
      });
      setResult(null);
      setMessage(
        bt(
          "선택한 올릴 곳의 권장 해상도·형식으로 되돌렸어요.",
          "Restored the recommended resolution and format for this destination.",
        ),
      );
      setError(null);
    });
  };

  const patch = <K extends keyof StudioExportDraftInput>(
    key: K,
    value: StudioExportDraftInput[K],
  ) => {
    lastActionRef.current = null;
    setTargetStates((prev) => {
      const current =
        prev[target] ??
        createTargetDraftState(projectId, target, manuscript, selectionMode, selectionExpression);
      const nextCustomEstimate =
        key === "estimatedFileSizeBytes" ? true : current.customEstimateOverride;
      const nextWidth = key === "width" && typeof value === "number" ? value : current.draft.width;
      let nextHeight =
        key === "height" && typeof value === "number" ? value : current.draft.height;
      if (key === "width" && typeof value === "number" && manuscriptBasis) {
        const scale = clampStudioExportScale(value / manuscriptBasis.sourceWidth);
        nextHeight = Math.max(1, Math.round(manuscriptBasis.sourceHeight * scale));
      }
      const nextFormat =
        key === "format" && typeof value === "string" ? value : current.draft.format;
      const shouldAutoEstimate =
        key !== "estimatedFileSizeBytes" &&
        !nextCustomEstimate &&
        (key === "width" || key === "height" || key === "format");
      return {
        ...prev,
        [target]: {
          userEditedWidth: key === "width" ? true : current.userEditedWidth,
          userEditedHeight: key === "height" ? true : current.userEditedHeight,
          userEditedTextSize: key === "minimumTextPx" ? true : current.userEditedTextSize,
          customEstimateOverride: nextCustomEstimate,
          draft: {
            ...current.draft,
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
          },
        },
      };
    });
    setResult(null);
    setMessage(null);
  };

  const retryFromError = () => {
    runGuarded("retry-error", () => {
      setError(null);
      workspace.reload();
    });
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
    retryFromError,
    handleChangeSelectionMode,
    handleChangeSelectionExpression,
    syncReturnStateInHistory,
    runPreflight: () =>
      runGuarded("run-preflight", () => executePreflight({ fromAutoRecheck: false })),
  };
}
