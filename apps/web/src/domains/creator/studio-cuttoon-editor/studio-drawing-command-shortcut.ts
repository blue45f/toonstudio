import { defaultStudioShortcuts, normalizeStudioShortcutChordKey, type StudioShortcutActionId } from "../studio-app-settings";

const defaults = defaultStudioShortcuts();
export type DrawingCommandSettings = { readonly shortcuts: Partial<Record<StudioShortcutActionId, string>> };

/** 기존 디스패처와 같은 설정·키 정규화를 써서 미지정 단축키를 안내하지 않는다. */
export function drawingCommandShortcut(settings: DrawingCommandSettings | undefined, id: StudioShortcutActionId, label: string) {
  const chord = normalizeStudioShortcutChordKey(settings?.shortcuts[id] ?? defaults[id]);
  if (!chord) return { title: label };
  const mod = chord.startsWith("Mod+");
  return {
    title: label + " · " + (mod ? chord.replace("Mod+", "Ctrl/⌘+") : chord),
    "aria-keyshortcuts": mod ? chord.replace("Mod+", "Control+") + " " + chord.replace("Mod+", "Meta+") : chord,
    keycap: chord.length === 1 ? chord : undefined,
  };
}
