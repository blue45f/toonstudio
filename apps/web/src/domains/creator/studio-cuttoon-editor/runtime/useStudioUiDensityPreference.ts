import { useCallback, useState } from "react";

import {
  defaultStudioAppSettings,
  type StudioAppSettings,
} from "../../studio-app-settings";
import {
  applyStudioLaunchDensity,
  type StudioLaunchDensity,
} from "../../studio-launch-mode";
import {
  loadStudioUiDensityState,
  saveStudioUiDensityState,
  studioUiDensityAdvancedExpanded,
  studioUiDensityFirstScreenExposure,
  type StudioUiChromeRegion,
  type StudioUiDensityMode,
  type StudioUiFirstScreenExposure,
} from "../../studio-ui-density";

interface UseStudioUiDensityPreferenceOptions {
  /** Explicit launch hint captured once by the preferences runtime. */
  readonly launchDensity: StudioLaunchDensity | null;
  readonly appSettingsRef: { current: StudioAppSettings };
  readonly setAppSettings: (next: StudioAppSettings) => void;
  readonly persistAppSettings: (next: StudioAppSettings) => void;
  readonly closeRightPanelForFocusModeRef: { current: () => void };
}

/**
 * Owns the UI-density slice of Studio preferences: the current density mode,
 * the simple-mode advanced-tools expansion (persisted in the density
 * preference storage, independent of the document), and the first-screen
 * exposure projection. Extracted from useStudioPreferencesRuntime so each
 * runtime module stays inside the host-architecture line budget; the parent
 * runtime keeps owning app-settings state, persistence, and hydration.
 */
export function useStudioUiDensityPreference({
  launchDensity,
  appSettingsRef,
  setAppSettings,
  persistAppSettings,
  closeRightPanelForFocusModeRef,
}: UseStudioUiDensityPreferenceOptions) {
  const [uiDensityMode, setUiDensityMode] = useState<StudioUiDensityMode>(
    () => applyStudioLaunchDensity(defaultStudioAppSettings(), launchDensity).general.densityMode,
  );
  // First-screen diet: in simple mode the advanced toolbar clusters start folded behind
  // one expander. The choice persists in the density preference storage, independent of
  // the document, and defaults to folded for anyone who never expanded them.
  const [uiAdvancedToolsExpanded, setUiAdvancedToolsExpandedState] = useState<boolean>(() => {
    try {
      return studioUiDensityAdvancedExpanded(
        loadStudioUiDensityState(typeof window === "undefined" ? null : window.localStorage),
      );
    } catch {
      return false;
    }
  });

  const setStudioUiDensity = useCallback((mode: StudioUiDensityMode): void => {
    if (mode === "focus" && !appSettingsRef.current.general.colorPanelPinned) closeRightPanelForFocusModeRef.current();
    setUiDensityMode(mode);
    const current = appSettingsRef.current;
    const next = current.general.densityMode === mode
      ? current
      : { ...current, general: { ...current.general, densityMode: mode } };
    appSettingsRef.current = next;
    if (next !== current) setAppSettings(next);
    persistAppSettings(next);
  }, [appSettingsRef, closeRightPanelForFocusModeRef, persistAppSettings, setAppSettings]);

  const setUiAdvancedToolsExpanded = useCallback((expanded: boolean): void => {
    setUiAdvancedToolsExpandedState(expanded);
    try {
      saveStudioUiDensityState(
        typeof window === "undefined" ? null : window.localStorage,
        { mode: appSettingsRef.current.general.densityMode, advancedExpanded: expanded },
      );
    } catch {
      // Storage unavailable (private mode etc.) — the in-memory choice still applies.
    }
  }, [appSettingsRef]);

  /** First-screen exposure for a chrome region under the current mode + expansion choice. */
  const uiFirstScreenExposure = useCallback(
    (region: StudioUiChromeRegion): StudioUiFirstScreenExposure =>
      studioUiDensityFirstScreenExposure(uiDensityMode, region, uiAdvancedToolsExpanded),
    [uiDensityMode, uiAdvancedToolsExpanded],
  );

  return {
    setStudioUiDensity,
    setUiAdvancedToolsExpanded,
    setUiDensityMode,
    uiAdvancedToolsExpanded,
    uiDensityMode,
    uiFirstScreenExposure,
  } as const;
}
