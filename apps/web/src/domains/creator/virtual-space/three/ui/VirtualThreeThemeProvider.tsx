import { useCallback, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_VIRTUAL_THREE_THEME, findVirtualThreeTheme } from "../themes/virtual-three-theme-catalog";
import { useVirtualThreeTheme } from "../themes/use-virtual-three-theme";
import type { VirtualThreeThemeStorage } from "../themes/virtual-three-theme-store";
import type { VirtualThreeThemeId, VirtualThreeThemePreviewState } from "../themes/virtual-three-theme-types";
import { VirtualThreeThemeContext, type VirtualThreeThemeContextValue } from "./virtual-three-theme-context";

interface VirtualThreeThemeProviderProps {
  readonly spaceScopeId: string;
  readonly children: ReactNode;
  readonly acquireStorage?: () => VirtualThreeThemeStorage | null;
}

function ScopedThemeOwner({ spaceScopeId, children, acquireStorage }: VirtualThreeThemeProviderProps) {
  const { selection, persistedSelection, hydrated, notice, dismissNotice, selectTheme } = useVirtualThreeTheme(spaceScopeId, acquireStorage);
  const [requestedOverride, setRequestedOverride] = useState<VirtualThreeThemeId | null>(null);
  const [shownThemeId, setShownThemeId] = useState<VirtualThreeThemeId>(DEFAULT_VIRTUAL_THREE_THEME.id);
  const [preview, setPreview] = useState<VirtualThreeThemePreviewState>({ status: "idle" });
  const [requestRevision, setRequestRevision] = useState(0);
  const requestedThemeId = requestedOverride ?? selection?.themeId ?? DEFAULT_VIRTUAL_THREE_THEME.id;
  const theme = findVirtualThreeTheme(requestedThemeId) ?? DEFAULT_VIRTUAL_THREE_THEME;
  const savedThemeId = persistedSelection?.themeId ?? null;

  const beginRequest = useCallback((id: VirtualThreeThemeId, force = false) => {
    const next = findVirtualThreeTheme(id);
    if (!next || (!force && id === requestedThemeId && preview.status !== "error")) return;
    setRequestedOverride(id);
    setRequestRevision(current => current + 1);
    setPreview({ status: "loading", loaded: 0, total: next.kind === "asset-recipe" ? next.modelAssetIds.length : 0 });
    dismissNotice();
  }, [dismissNotice, preview.status, requestedThemeId]);
  const requestTheme = useCallback((id: VirtualThreeThemeId) => beginRequest(id), [beginRequest]);
  const retryTheme = useCallback(() => beginRequest(requestedThemeId, true), [beginRequest, requestedThemeId]);
  const revertTheme = useCallback(() => beginRequest(savedThemeId ?? DEFAULT_VIRTUAL_THREE_THEME.id), [beginRequest, savedThemeId]);
  const onThemePreviewChange = useCallback((id: VirtualThreeThemeId, next: VirtualThreeThemePreviewState) => {
    if (id !== requestedThemeId) return;
    setPreview(next);
    if (next.status === "ready") setShownThemeId(id);
  }, [requestedThemeId]);
  const saveShownTheme = useCallback((id: VirtualThreeThemeId) => {
    if (!hydrated || preview.status !== "ready" || id !== shownThemeId || shownThemeId !== requestedThemeId) return;
    selectTheme(id);
  }, [hydrated, selectTheme, preview.status, requestedThemeId, shownThemeId]);
  const value = useMemo<VirtualThreeThemeContextValue>(() => ({
    theme, requestedThemeId, shownThemeId, savedThemeId, requestRevision, preview,
    hydrated, notice,
    requestTheme, saveShownTheme, revertTheme, retryTheme, onThemePreviewChange, dismissNotice,
  }), [theme, requestedThemeId, shownThemeId, savedThemeId, requestRevision, preview, hydrated, notice,
    requestTheme, saveShownTheme, revertTheme, retryTheme, onThemePreviewChange, dismissNotice]);
  return <VirtualThreeThemeContext.Provider value={value}>{children}</VirtualThreeThemeContext.Provider>;
}

/** 공간 scope 변경에만 owner를 새로 만들며 2D/3D 화면 전환에서는 같은 선택을 유지한다. */
export function VirtualThreeThemeProvider(props: VirtualThreeThemeProviderProps) {
  return <ScopedThemeOwner key={props.spaceScopeId} {...props} />;
}
