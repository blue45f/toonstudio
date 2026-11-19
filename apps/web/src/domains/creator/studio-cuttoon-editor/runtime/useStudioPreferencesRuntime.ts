import { useCallback, useEffect, useRef, useState } from "react";

import {
  defaultStudioAppSettings,
  type StudioAppSettings,
  type StudioAppSettingsTab,
  type StudioRailToolId,
} from "../../studio-app-settings";
import {
  normalizeStudioEffectFavoriteState,
  rememberStudioEffectRecent,
  toggleStudioEffectFavorite,
  type StudioEffectFavoriteState,
  type StudioEffectId,
} from "../../studio-effect-favorites";
import { acquireProductStudioUiPreferencesRepository } from "../../studio-legacy-editor-runtime-helpers";
import { applyStudioLaunchDensity, readStudioLaunchDensity } from "../../studio-launch-mode";

import type { StudioDocumentWorkspaceId } from "../../studio-document-workspace";
import { preserveStudioTaskToolbarPreference, projectStudioTaskAppSettings } from "../../studio-task-tools";
import type { StudioToolbarPinChange } from "./studio-toolbar-pin-persistence";
import { hydrateStudioPreference } from "./studio-preference-hydration";
import { useStudioWorkModePreference } from "./useStudioWorkModePreference";
import type { StudioUiBooleanPreferenceKey } from "../../studio-ui-preferences-sqlite";
import { useStudioUiDensityPreference } from "./useStudioUiDensityPreference";

interface UseStudioPreferencesRuntimeOptions {
  readonly launchSearch: string;
  readonly taskWorkspace?: StudioDocumentWorkspaceId | null;
  /**
   * Current episode pipeline stage, when the host knows one. The host passes
   * the episode-pipeline-rail derivation verbatim — no new derivation is made
   * here. Null means "no stage source": the saved mode then applies as-is and
   * no suggestion is produced.
   */
  readonly episodeStage?: string | null;
  readonly applyMirroredSettings: (settings: StudioAppSettings) => void;
  readonly closeRightPanelForFocusMode: () => void;
}

/**
 * Owns user-level Studio preferences and the SQLite-backed persistence policy.
 * Document state must never be introduced here: this runtime may survive or hydrate independently
 * from the current canvas document and only exposes explicit UI-setting commands.
 */
export function useStudioPreferencesRuntime({
  launchSearch,
  taskWorkspace = null,
  episodeStage = null,
  applyMirroredSettings,
  closeRightPanelForFocusMode,
}: UseStudioPreferencesRuntimeOptions) {
  const launchDensity = readStudioLaunchDensity(launchSearch);
  const launchDensityRef = useRef(launchDensity);
  launchDensityRef.current = launchDensity;
  const [appSettings, setAppSettings] = useState<StudioAppSettings>(defaultStudioAppSettings);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [appSettingsInitialTab, setAppSettingsInitialTab] =
    useState<StudioAppSettingsTab>("general");
  const [appSettingsPersistenceState, setAppSettingsPersistenceState] = useState<
    "loading" | "saved" | "session-only"
  >("loading");
  const [railMoreOpen, setRailMoreOpen] = useState(false);
  const appSettingsRef = useRef(appSettings);
  const appSettingsUserRevisionRef = useRef(0);
  const hydratedSettings = useRef(false);
  const pendingPinWrites = useRef(Promise.resolve());
  const previousPinnedToolbar = useRef<StudioAppSettings["toolbar"] | null>(null);
  const applyMirroredSettingsRef = useRef(applyMirroredSettings);
  const closeRightPanelForFocusModeRef = useRef(closeRightPanelForFocusMode);
  const uiBooleanPreferenceRevisionsRef = useRef<
    Record<StudioUiBooleanPreferenceKey, number>
  >({
    "ai-notice-acknowledged": 0,
    "quick-start-dismissed": 0,
    "mobile-hint-dismissed": 0,
    "comment-pins-hidden": 0,
  });
  appSettingsRef.current = appSettings;
  applyMirroredSettingsRef.current = applyMirroredSettings;
  closeRightPanelForFocusModeRef.current = closeRightPanelForFocusMode;

  const persistAppSettings = useCallback((next: StudioAppSettings): void => {
    const revision = ++appSettingsUserRevisionRef.current;
    setAppSettingsPersistenceState("loading");
    void acquireProductStudioUiPreferencesRepository()
      .then((repository) => repository.saveAppSettings(next))
      .then(() => {
        if (appSettingsUserRevisionRef.current === revision) {
          setAppSettingsPersistenceState("saved");
        }
      })
      .catch(() => {
        if (appSettingsUserRevisionRef.current === revision) {
          setAppSettingsPersistenceState("session-only");
        }
      });
  }, []);

  // Companion modules replace settings through this path so the ref (owned and written here) and state never diverge.
  const replaceAppSettings = useCallback((next: StudioAppSettings): void => {
    appSettingsRef.current = next;
    setAppSettings(next);
  }, []);

  // Density mode, advanced-tools expansion, and first-screen exposure live in their own
  // runtime module; this hook only wires them to the shared ref and persistence owned here.
  const {
    setStudioUiDensity,
    setUiAdvancedToolsExpanded,
    setUiDensityMode,
    uiAdvancedToolsExpanded,
    uiDensityMode,
    uiFirstScreenExposure,
  } = useStudioUiDensityPreference({
    launchDensity,
    appSettingsRef,
    replaceAppSettings,
    persistAppSettings,
    closeRightPanelForFocusModeRef,
  });

  // Stage work mode lives in its own runtime module too (useStudioWorkModePreference).
  const { dismissWorkModeSuggestion, setWorkMode, suggestedWorkMode, uiChromeExposure, workMode, workModeState } = useStudioWorkModePreference({ episodeStage, uiFirstScreenExposure, uiAdvancedToolsExpanded });

  const [effectFavoriteState, setEffectFavoriteState] = useState<StudioEffectFavoriteState>(() =>
    normalizeStudioEffectFavoriteState(undefined),
  );
  const effectFavoriteStateRef = useRef(effectFavoriteState);
  const effectFavoriteUserRevisionRef = useRef(0);
  effectFavoriteStateRef.current = effectFavoriteState;

  useEffect(() => {
    const mode = launchDensity ?? appSettingsRef.current.general.densityMode;
    setUiDensityMode(mode);
    if (mode === "focus" && !appSettingsRef.current.general.colorPanelPinned) closeRightPanelForFocusModeRef.current();
  }, [launchDensity, setUiDensityMode]);

  const applySavedPresentation = useCallback((saved: StudioAppSettings) => {
    const hydrated = applyStudioLaunchDensity(saved, launchDensityRef.current);
    setUiDensityMode(hydrated.general.densityMode);
    if (hydrated.general.densityMode === "focus" && !hydrated.general.colorPanelPinned) closeRightPanelForFocusModeRef.current();
    applyMirroredSettingsRef.current(hydrated);
    hydratedSettings.current = true;
  }, [setUiDensityMode]);

  useEffect(() => {
    let cancelled = false;
    const settingsRevisionAtStart = appSettingsUserRevisionRef.current;
    const favoritesRevisionAtStart = effectFavoriteUserRevisionRef.current;

    void acquireProductStudioUiPreferencesRepository()
      .then(async (repository) => {
        const [settingsResult, favoritesResult] = await Promise.allSettled([
          repository.loadAppSettings(),
          repository.loadEffectFavorites(),
        ]);
        if (cancelled) return;

        const settingsReady = await hydrateStudioPreference(
          settingsResult, appSettingsUserRevisionRef.current === settingsRevisionAtStart,
          saved => { replaceAppSettings(saved); applySavedPresentation(saved); },
          () => repository.saveAppSettings(appSettingsRef.current),
        );
        if (cancelled) return;
        const favoritesReady = await hydrateStudioPreference(
          favoritesResult, effectFavoriteUserRevisionRef.current === favoritesRevisionAtStart,
          saved => { effectFavoriteStateRef.current = saved; setEffectFavoriteState(saved); },
          () => repository.saveEffectFavorites(effectFavoriteStateRef.current),
        );
        if (!cancelled) setAppSettingsPersistenceState(settingsReady && favoritesReady ? "saved" : "session-only");
      })
      .catch(() => {
        if (!cancelled) setAppSettingsPersistenceState("session-only");
      });

    return () => {
      cancelled = true;
    };
  }, [applySavedPresentation, replaceAppSettings]);

  const persistStudioUiBooleanPreference = useCallback((
    key: StudioUiBooleanPreferenceKey,
    value: boolean,
  ): void => {
    uiBooleanPreferenceRevisionsRef.current[key] += 1;
    void acquireProductStudioUiPreferencesRepository()
      .then((repository) => repository.saveBooleanPreference(key, value))
      .catch(() => setAppSettingsPersistenceState("session-only"));
  }, []);

  const commitAppSettings = useCallback((proposed: StudioAppSettings, pinChange?: StudioToolbarPinChange): void | Promise<void> => {
    if (pinChange) {
      setAppSettingsPersistenceState("loading");
      const write = pendingPinWrites.current.then(async () => {
        const { persistStudioToolbarPinChange } = await import("./studio-toolbar-pin-persistence");
        const toolbar = pinChange.restore ? previousPinnedToolbar.current ?? proposed.toolbar : proposed.toolbar;
        await persistStudioToolbarPinChange(await acquireProductStudioUiPreferencesRepository(), toolbar, pinChange,
          () => ({ revision: appSettingsUserRevisionRef.current, settings: appSettingsRef.current }),
          (saved, previousToolbar) => {
            if (!hydratedSettings.current && !appSettingsUserRevisionRef.current) applySavedPresentation(saved);
            previousPinnedToolbar.current = pinChange.restore ? null : previousToolbar;
            appSettingsUserRevisionRef.current++;
            replaceAppSettings(saved);
            setAppSettingsPersistenceState("saved");
          });
      });
      pendingPinWrites.current = write.catch(() => setAppSettingsPersistenceState("session-only"));
      return write;
    }
    const stored = appSettingsRef.current;
    const presented = projectStudioTaskAppSettings(applyStudioLaunchDensity(stored, uiDensityMode), taskWorkspace, uiDensityMode);
    const next = preserveStudioTaskToolbarPreference(stored, presented,
      proposed.general.densityMode === uiDensityMode ? applyStudioLaunchDensity(proposed, stored.general.densityMode) : proposed);
    appSettingsRef.current = next;
    setAppSettings(next);
    persistAppSettings(next);
    setUiDensityMode(proposed.general.densityMode);
    applyMirroredSettingsRef.current(applyStudioLaunchDensity(next, proposed.general.densityMode));
  }, [applySavedPresentation, persistAppSettings, replaceAppSettings, setUiDensityMode, taskWorkspace, uiDensityMode]);

  // Effect Events cannot cross a custom-hook boundary. The public command remains stable while the
  // callback refs above keep its host-owned side effects current without restarting hydration.
  const setStudioUiDensityFromCompanion = setStudioUiDensity;
  const presentedSettings = projectStudioTaskAppSettings(applyStudioLaunchDensity(appSettings, uiDensityMode), taskWorkspace, uiDensityMode);
  const isRailToolVisible = useCallback(
    (id: StudioRailToolId): boolean => presentedSettings.toolbar.visibleIds.includes(id),
    [presentedSettings.toolbar.visibleIds],
  );

  const persistEffectFavoriteState = useCallback((next: StudioEffectFavoriteState): void => {
    const revision = ++effectFavoriteUserRevisionRef.current;
    effectFavoriteStateRef.current = next;
    setEffectFavoriteState(next);
    void acquireProductStudioUiPreferencesRepository()
      .then((repository) => repository.saveEffectFavorites(next))
      .catch(() => {
        if (effectFavoriteUserRevisionRef.current === revision) {
          setAppSettingsPersistenceState("session-only");
        }
      });
  }, []);

  const toggleEffectFavoriteCommand = useCallback((effectId: StudioEffectId): void => {
    persistEffectFavoriteState(toggleStudioEffectFavorite(effectFavoriteStateRef.current, effectId));
  }, [persistEffectFavoriteState]);

  const rememberEffectRecent = useCallback((effectId: StudioEffectId): void => {
    persistEffectFavoriteState(rememberStudioEffectRecent(effectFavoriteStateRef.current, effectId));
  }, [persistEffectFavoriteState]);

  return {
    appSettings: presentedSettings,
    appSettingsInitialTab,
    appSettingsOpen,
    appSettingsPersistenceState,
    appSettingsRef,
    appSettingsUserRevisionRef,
    commitAppSettings,
    effectFavoriteState,
    effectFavoriteStateRef,
    effectFavoriteUserRevisionRef,
    isRailToolVisible,
    persistAppSettings,
    persistStudioUiBooleanPreference,
    railMoreOpen,
    rememberEffectRecent,
    setAppSettings,
    setAppSettingsInitialTab,
    setAppSettingsOpen,
    setAppSettingsPersistenceState,
    setEffectFavoriteState,
    setRailMoreOpen,
    setStudioUiDensity,
    setStudioUiDensityFromCompanion,
    setUiDensityMode,
    setUiAdvancedToolsExpanded,
    toggleEffectFavorite: toggleEffectFavoriteCommand,
    uiAdvancedToolsExpanded,
    uiBooleanPreferenceRevisionsRef,
    uiDensityMode,
    uiFirstScreenExposure,
    dismissWorkModeSuggestion,
    setWorkMode,
    suggestedWorkMode,
    uiChromeExposure,
    workMode,
    workModeState,
  } as const;
}
