import { useCallback, useRef, useState } from "react";

import {
  normalizeStudioEffectFavoriteState,
  rememberStudioEffectRecent,
  toggleStudioEffectFavorite,
  type StudioEffectFavoriteState,
  type StudioEffectId,
} from "../../studio-effect-favorites";
import { acquireProductStudioUiPreferencesRepository } from "../../studio-legacy-editor-runtime-helpers";

/** 효과 목록과 저장 revision을 소유하며, 부모 수화 과정에도 같은 ref를 제공한다. */
export function useStudioEffectFavoritePreference(
  setPersistenceState: (state: "session-only") => void,
) {
  const [effectFavoriteState, setEffectFavoriteState] = useState<StudioEffectFavoriteState>(() =>
    normalizeStudioEffectFavoriteState(undefined),
  );
  const effectFavoriteStateRef = useRef(effectFavoriteState);
  const effectFavoriteUserRevisionRef = useRef(0);
  effectFavoriteStateRef.current = effectFavoriteState;

  const persistEffectFavoriteState = useCallback((next: StudioEffectFavoriteState): void => {
    const revision = ++effectFavoriteUserRevisionRef.current;
    effectFavoriteStateRef.current = next;
    setEffectFavoriteState(next);
    void acquireProductStudioUiPreferencesRepository()
      .then((repository) => repository.saveEffectFavorites(next))
      .catch(() => {
        if (effectFavoriteUserRevisionRef.current === revision) {
          setPersistenceState("session-only");
        }
      });
  }, [setPersistenceState]);

  const toggleEffectFavoriteCommand = useCallback((effectId: StudioEffectId): void => {
    persistEffectFavoriteState(toggleStudioEffectFavorite(effectFavoriteStateRef.current, effectId));
  }, [persistEffectFavoriteState]);

  const rememberEffectRecent = useCallback((effectId: StudioEffectId): void => {
    persistEffectFavoriteState(rememberStudioEffectRecent(effectFavoriteStateRef.current, effectId));
  }, [persistEffectFavoriteState]);

  return {
    effectFavoriteState,
    effectFavoriteStateRef,
    effectFavoriteUserRevisionRef,
    rememberEffectRecent,
    setEffectFavoriteState,
    toggleEffectFavoriteCommand,
  } as const;
}
