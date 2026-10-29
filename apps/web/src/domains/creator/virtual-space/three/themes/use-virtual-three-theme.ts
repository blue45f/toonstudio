import { useCallback, useEffect, useRef, useState } from 'react';
import { readVirtualThreeThemeChoice, virtualThreeThemeStorageKey, writeVirtualThreeThemeChoice, VIRTUAL_THREE_THEME_NOTICES } from './virtual-three-theme-store';
import type { VirtualThreeThemeChoice, VirtualThreeThemeSelectionState, VirtualThreeThemeStorage, VirtualThreeThemeWriteResult } from './virtual-three-theme-store';

function browserStorage(): VirtualThreeThemeStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}
function storageFrom(factory: () => VirtualThreeThemeStorage | null): VirtualThreeThemeStorage | null {
  try { return factory(); } catch { return null; }
}
interface HookState {
  readonly hydrated: boolean;
  readonly value: VirtualThreeThemeSelectionState;
  readonly persistedSelection: VirtualThreeThemeChoice | null;
}
function pending(spaceScopeId: string): HookState {
  return { hydrated: false, persistedSelection: null, value: { spaceScopeId, selection: null, persistence: 'memory-only', notice: null } };
}

/** 공간 scope별 browser-local 선택만 다루며 공유 문서나 다른 테마 상태는 참조하지 않는다. */
export function useVirtualThreeTheme(spaceScopeId: string, acquireStorage: () => VirtualThreeThemeStorage | null = browserStorage) {
  const storageKey = virtualThreeThemeStorageKey(spaceScopeId);
  const acquireStorageRef = useRef(acquireStorage);
  const [state, setState] = useState<HookState>(() => pending(spaceScopeId));
  const hydrated = state.hydrated && state.value.spaceScopeId === spaceScopeId;
  const value = state.value.spaceScopeId === spaceScopeId ? state.value : pending(spaceScopeId).value;
  useEffect(() => { acquireStorageRef.current = acquireStorage; }, [acquireStorage]);
  useEffect(() => {
    let disposed = false;
    const read = () => {
      const next = readVirtualThreeThemeChoice(storageFrom(acquireStorageRef.current), spaceScopeId);
      if (!disposed) setState({ hydrated: true, value: next, persistedSelection: next.persistence === 'browser-local' ? next.selection : null });
    };
    read();
    const changed = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) read(); };
    if (typeof window !== 'undefined') window.addEventListener('storage', changed);
    return () => { disposed = true; if (typeof window !== 'undefined') window.removeEventListener('storage', changed); };
  }, [spaceScopeId, storageKey]);
  const selectTheme = useCallback((themeId: unknown): VirtualThreeThemeWriteResult => {
    if (!hydrated) return { accepted: false, notice: VIRTUAL_THREE_THEME_NOTICES.notHydrated };
    const result = writeVirtualThreeThemeChoice(storageFrom(acquireStorageRef.current), spaceScopeId, themeId);
    if (result.accepted) setState(current => ({
      hydrated: true, value: result.state,
      persistedSelection: result.persisted ? result.state.selection : current.persistedSelection,
    }));
    else setState(current => ({ ...current, value: { ...current.value, notice: result.notice } }));
    return result;
  }, [spaceScopeId, hydrated]);
  const dismissNotice = useCallback(() => setState(current => ({ ...current, value: { ...current.value, notice: null } })), []);
  return { ...value, hydrated, persistedSelection: state.value.spaceScopeId === spaceScopeId ? state.persistedSelection : null, selectTheme, dismissNotice };
}
