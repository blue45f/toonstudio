import type { StudioAppSettings, StudioToolbarPreferences } from "../../studio-app-settings";
import type { StudioUiPreferencesRepository } from "../../studio-ui-preferences-sqlite";

export interface StudioToolbarPinChange {
  readonly before: StudioToolbarPreferences;
  readonly restore?: boolean;
}

function applyPinChange(saved: StudioToolbarPreferences, proposed: StudioToolbarPreferences, change: StudioToolbarPinChange): StudioToolbarPreferences {
  if (change.restore) return proposed;
  const before = change.before.visibleIds;
  const savedIds = saved.configured ? saved.visibleIds : before;
  const added = proposed.visibleIds.filter(id => !before.includes(id));
  const retained = savedIds.filter(id => !before.includes(id) || proposed.visibleIds.includes(id));
  return { ...saved, version: 2, configured: true, activeProfileId: null, visibleIds: [...new Set([...retained, ...added])] };
}

/** 클릭한 핀만 적용한다. 저장 중 다른 환경설정이 바뀌면 그 설정에 다시 적용한 뒤 레일을 갱신한다. */
export async function persistStudioToolbarPinChange(
  repository: Pick<StudioUiPreferencesRepository, "loadAppSettings" | "saveAppSettings">,
  proposed: StudioToolbarPreferences,
  change: StudioToolbarPinChange,
  current: () => { revision: number; settings: StudioAppSettings },
  acknowledge: (settings: StudioAppSettings, previousToolbar: StudioToolbarPreferences) => void,
): Promise<void> {
  const saved = await repository.loadAppSettings();
  for (;;) {
    const snapshot = current();
    const settings = snapshot.revision ? snapshot.settings : saved;
    const next = { ...settings, toolbar: applyPinChange(settings.toolbar, proposed, change) };
    await repository.saveAppSettings(next);
    if (snapshot.revision === current().revision) {
      acknowledge(next, settings.toolbar);
      return;
    }
  }
}
