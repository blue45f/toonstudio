import {
  createStudioCommandExecutionBindings,
  type StudioCommandExecutionBinding,
  type StudioCommandExecutionMenuGroup,
} from "../studio-command-execution-registry";

export interface StudioDrawingCommandPresentation {
  readonly showSavedLayout: () => void;
  readonly openInspector: () => void;
  readonly openPages: () => void;
  readonly closePanels: () => void;
}

/** 메뉴와 검색이 같은 원고 패널에서 원래 명령을 한 번만 실행한다. */
export function studioDrawingCommandDestination(id: string | undefined, ui: StudioDrawingCommandPresentation) {
  switch (id) {
    case "window.left-panel":
    case "window.page-sequence": return ui.openPages;
    case "window.right-panel":
    case "canvas.document-settings":
    case "view.navigator":
    case "filter.levels":
    case "filter.tone-curve": return ui.openInspector;
    case "window.collapse-side-panels": return ui.closePanels;
    case "window.command-bar":
    case "file.project-tools": return ui.showSavedLayout;
    default: return undefined;
  }
}

export function createStudioDrawingClarityCommandBindings(
  groups: readonly StudioCommandExecutionMenuGroup[],
  presentation: StudioDrawingCommandPresentation,
): readonly StudioCommandExecutionBinding[] {
  return createStudioCommandExecutionBindings(groups).map((binding) => {
    const reveal = studioDrawingCommandDestination(binding.commandId, presentation);
    return reveal && !binding.disabled ? { ...binding, execute: () => { reveal(); binding.execute(); } } : binding;
  });
}
