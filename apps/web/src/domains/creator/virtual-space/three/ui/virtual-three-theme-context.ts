import { createContext, useContext } from "react";

import type { VirtualThreeThemeNotice } from "../themes/virtual-three-theme-store";
import type { VirtualThreeTheme, VirtualThreeThemeId, VirtualThreeThemePreviewState } from "../themes/virtual-three-theme-types";

export interface VirtualThreeThemeContextValue {
  readonly theme: VirtualThreeTheme;
  readonly requestedThemeId: VirtualThreeThemeId;
  readonly shownThemeId: VirtualThreeThemeId;
  readonly savedThemeId: VirtualThreeThemeId | null;
  readonly requestRevision: number;
  readonly hydrated: boolean;
  readonly preview: VirtualThreeThemePreviewState;
  readonly notice: VirtualThreeThemeNotice | null;
  readonly requestTheme: (id: VirtualThreeThemeId) => void;
  readonly saveShownTheme: (id: VirtualThreeThemeId) => void;
  readonly revertTheme: () => void;
  readonly retryTheme: () => void;
  readonly dismissNotice: () => void;
  readonly onThemePreviewChange: (id: VirtualThreeThemeId, preview: VirtualThreeThemePreviewState) => void;
}

export const VirtualThreeThemeContext = createContext<VirtualThreeThemeContextValue | null>(null);

export function useVirtualThreeThemeContext(): VirtualThreeThemeContextValue {
  const value = useContext(VirtualThreeThemeContext);
  if (!value) throw new Error("3D 테마는 공간 범위의 provider 안에서 사용해야 합니다.");
  return value;
}
