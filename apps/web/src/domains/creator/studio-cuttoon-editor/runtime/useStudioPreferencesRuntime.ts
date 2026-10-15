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
import { useStudioWorkModePreference } from "./useStudioWorkModePreference";
import type { StudioUiBooleanPreferenceKey } from "../../studio-ui-preferences-sqlite";
import { useStudioUiDensityPreference } from "./useStudioUiDensityPreference";

interface UseStudioPreferencesRuntimeOptions {
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
  taskWorkspace = null,
  episodeStage = null,
  applyMirroredSettings,
  closeRightPanelForFocusMode,
}: UseStudioPreferencesRuntimeOptions) {
  // Capture an explicit launch hint once. Merge it into loaded preferences instead of
  // persisting defaults before hydration, which would lose unrelated user settings.
  const [launchDensity] = useState(() => readStudioLaunchDensity(typeof window === "undefined" ? "" : window.location.search));
  const [appSettings, setAppSettings] = useState<StudioAppSettings>(
    () => applyStudioLaunchDensity(defaultStudioAppSettings(), launchDensity),
  );
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [appSettingsInitialTab, setAppSettingsInitialTab] =
    useState<StudioAppSettingsTab>("general");
  const [appSettingsPersistenceState, setAppSettingsPersistenceState] = useState<
    "loading" | "saved" | "session-only"
  >("loading");
  const [railMoreOpen, setRailMoreOpen] = useState(false);
  const appSettingsRef = useRef(appSettings);
  const appSettingsUserRevisionRef = useRef(0);
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
    if (launchDensity === "focus") closeRightPanelForFocusModeRef.current();
  }, [launchDensity]);

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

        let degraded = false;
        if (settingsResult.status === "fulfilled") {
          if (appSettingsUserRevisionRef.current === settingsRevisionAtStart) {
            const hydrated = applyStudioLaunchDensity(settingsResult.value, launchDensity);
            // A launch URL is a session override, not a claim that preferences were saved.
            if (hydrated !== settingsResult.value) degraded = true;
            appSettingsRef.current = hydrated;
            setAppSettings(hydrated);
            setUiDensityMode(hydrated.general.densityMode);
            if (hydrated.general.densityMode === "focus" && !hydrated.general.colorPanelPinned) {
              closeRightPanelForFocusModeRef.current();
            }
            applyMirroredSettingsRef.current(hydrated);
          } else {
            try {
              await repository.saveAppSettings(appSettingsRef.current);
            } catch {
              degraded = true;
            }
          }
        } else if (appSettingsUserRevisionRef.current !== settingsRevisionAtStart) {
          try {
            await repository.saveAppSettings(appSettingsRef.current);
          } catch {
            degraded = true;
          }
        } else {
          degraded = true;
        }

        if (favoritesResult.status === "fulfilled") {
          if (effectFavoriteUserRevisionRef.current === favoritesRevisionAtStart) {
            effectFavoriteStateRef.current = favoritesResult.value;
            setEffectFavoriteState(favoritesResult.value);
          } else {
            try {
              await repository.saveEffectFavorites(effectFavoriteStateRef.current);
            } catch {
              degraded = true;
            }
          }
        } else if (effectFavoriteUserRevisionRef.current !== favoritesRevisionAtStart) {
          try {
            await repository.saveEffectFavorites(effectFavoriteStateRef.current);
          } catch {
            degraded = true;
          }
        } else {
          degraded = true;
        }

        if (!cancelled) {
          setAppSettingsPersistenceState(degraded ? "session-only" : "saved");
        }
      })
      .catch(() => {
        if (!cancelled) setAppSettingsPersistenceState("session-only");
      });

    return () => {
      cancelled = true;
    };
  }, [launchDensity, setUiDensityMode]);

  const persistStudioUiBooleanPreference = useCallback((
    key: StudioUiBooleanPreferenceKey,
    value: boolean,
  ): void => {
    uiBooleanPreferenceRevisionsRef.current[key] += 1;
    void acquireProductStudioUiPreferencesRepository()
      .then((repository) => repository.saveBooleanPreference(key, value))
      .catch(() => setAppSettingsPersistenceState("session-only"));
  }, []);

  const commitAppSettings = useCallback((proposed: StudioAppSettings): void => {
    const stored = appSettingsRef.current;
    const next = preserveStudioTaskToolbarPreference(stored,
      projectStudioTaskAppSettings(stored, taskWorkspace, stored.general.densityMode), proposed);
    appSettingsRef.current = next;
    setAppSettings(next);
    persistAppSettings(next);
    setUiDensityMode(next.general.densityMode);
    applyMirroredSettingsRef.current(next);
  }, [persistAppSettings, setUiDensityMode, taskWorkspace]);

  // Effect Events cannot cross a custom-hook boundary. The public command remains stable while the
  // callback refs above keep its host-owned side effects current without restarting hydration.
  const setStudioUiDensityFromCompanion = setStudioUiDensity;
  const presentedSettings = projectStudioTaskAppSettings(appSettings, taskWorkspace, uiDensityMode);
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
