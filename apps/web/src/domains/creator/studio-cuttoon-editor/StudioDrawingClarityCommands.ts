import {
  createStudioCommandExecutionBindings,
  type StudioCommandExecutionBinding,
  type StudioCommandExecutionMenuGroup,
} from "../studio-command-execution-registry";

const SAVED_LAYOUT_COMMANDS = new Set([
  "window.left-panel", "window.right-panel", "window.collapse-side-panels",
  "window.command-bar", "window.page-sequence", "file.project-tools",
]);

/** 검색의 실행 권한과 원본 명령은 유지하고, 목적지가 보이도록 UI만 먼저 연다. */
export function createStudioDrawingClarityCommandBindings(
  groups: readonly StudioCommandExecutionMenuGroup[],
  presentation: { readonly showSavedLayout: () => void; readonly openInspector: () => void },
): readonly StudioCommandExecutionBinding[] {
  return createStudioCommandExecutionBindings(groups).map((binding) => {
    const reveal = SAVED_LAYOUT_COMMANDS.has(binding.commandId)
      ? presentation.showSavedLayout
      : binding.commandId === "view.navigator" ? presentation.openInspector : null;
    return reveal ? { ...binding, execute: () => { reveal(); binding.execute(); } } : binding;
  });
}
