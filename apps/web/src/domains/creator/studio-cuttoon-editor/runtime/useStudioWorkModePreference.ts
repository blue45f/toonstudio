import { useCallback, useState } from "react";

import type {
  StudioUiChromeRegion,
  StudioUiFirstScreenExposure,
} from "../../studio-ui-density";
import {
  loadStudioWorkModeState,
  pickStudioWorkMode,
  resolveStudioWorkMode,
  saveStudioWorkModeState,
  studioWorkModeExposure,
  suggestStudioWorkModeForStage,
  type StudioWorkMode,
  type StudioWorkModeState,
} from "../../studio-work-mode";
import {
  composeStudioChromeExposure,
  type StudioChromeGateExposure,
} from "./studio-work-mode-gating";

interface UseStudioWorkModePreferenceOptions {
  /**
   * Current episode pipeline stage, when the host knows one. Null means
   * "no stage source": the saved mode then applies as-is and no suggestion
   * is produced.
   */
  readonly episodeStage?: string | null;
  /** Density first-screen exposure projection owned by useStudioUiDensityPreference. */
  readonly uiFirstScreenExposure: (
    region: StudioUiChromeRegion
  ) => StudioUiFirstScreenExposure;
  /** Persisted advanced-tools expansion choice; also lifts work-mode folds. */
  readonly uiAdvancedToolsExpanded: boolean;
}

/**
 * Owns the stage work-mode slice of Studio preferences: the persisted mode
 * pick, the stage suggestion, and the composed chrome gate (density
 * first-screen exposure × work-mode exposure). Extracted from
 * useStudioPreferencesRuntime alongside useStudioUiDensityPreference so each
 * runtime module stays inside the host-architecture line budget; the parent
 * runtime only wires the two slices together.
 */
export function useStudioWorkModePreference({
  episodeStage = null,
  uiFirstScreenExposure,
  uiAdvancedToolsExpanded,
}: UseStudioWorkModePreferenceOptions) {
  // Stage work mode (studio-work-mode.ts): persisted under its own storage key,
  // loaded with the same lazy localStorage pattern as the density state.
  // A manual pick always wins over the stage suggestion (resolveStudioWorkMode).
  const [workModeState, setWorkModeState] = useState<StudioWorkModeState>(() => {
    try {
      return loadStudioWorkModeState(
        typeof window === "undefined" ? null : window.localStorage,
      );
    } catch {
      return loadStudioWorkModeState(null);
    }
  });
  const [workModeSuggestionDismissed, setWorkModeSuggestionDismissed] = useState(false);
  const workMode = resolveStudioWorkMode(workModeState, episodeStage);
  const suggestedWorkMode: StudioWorkMode | null =
    !workModeSuggestionDismissed && !workModeState.userPicked && workModeState.followStage && episodeStage
      ? (() => {
          const suggested = suggestStudioWorkModeForStage(episodeStage);
          return suggested !== workMode ? suggested : null;
        })()
      : null;

  /** Pick a stage work mode: the pick is pinned (userPicked) and persisted;
   *  a storage failure keeps the in-session choice, mirroring setUiAdvancedToolsExpanded. */
  const setWorkMode = useCallback((mode: StudioWorkMode): void => {
    setWorkModeState((previous) => {
      const next = pickStudioWorkMode(previous, mode);
      try {
        saveStudioWorkModeState(
          typeof window === "undefined" ? null : window.localStorage,
          next,
        );
      } catch {
        // Storage unavailable — the in-memory pick still applies.
      }
      return next;
    });
    setWorkModeSuggestionDismissed(false);
  }, []);

  const dismissWorkModeSuggestion = useCallback((): void => {
    setWorkModeSuggestionDismissed(true);
  }, []);

  /**
   * Final chrome gate for a region: density first-screen exposure composed
   * with the work-mode exposure (studio-work-mode-gating.ts). Fold expansion
   * reuses uiAdvancedToolsExpanded — no new storage key. In work mode "all"
   * this returns the density verdict unchanged.
   */
  const uiChromeExposure = useCallback(
    (region: StudioUiChromeRegion): StudioChromeGateExposure =>
      composeStudioChromeExposure(
        uiFirstScreenExposure(region),
        studioWorkModeExposure(workMode, region),
        uiAdvancedToolsExpanded,
      ),
    [uiFirstScreenExposure, uiAdvancedToolsExpanded, workMode],
  );

  return {
    dismissWorkModeSuggestion,
    setWorkMode,
    suggestedWorkMode,
    uiChromeExposure,
    workMode,
    workModeState,
  } as const;
}
