import { VirtualThreeThemePicker } from "./VirtualThreeThemePicker";
import { useVirtualThreeThemeContext } from "./virtual-three-theme-context";

export function VirtualThreeThemePanel() {
  const value = useVirtualThreeThemeContext();
  return <VirtualThreeThemePicker shownThemeId={value.shownThemeId} requestedThemeId={value.requestedThemeId}
    savedThemeId={value.savedThemeId} hydrated={value.hydrated} preview={value.preview} notice={value.notice}
    onPreview={value.requestTheme} onApply={value.saveShownTheme} onRevert={value.revertTheme}
    onRetry={value.retryTheme} onDismissNotice={value.dismissNotice} />;
}
