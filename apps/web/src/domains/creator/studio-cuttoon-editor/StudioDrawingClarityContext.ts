import { createContext, useContext } from "react";

export type StudioDrawingClarityPanel = "layers" | "brush" | "pages" | "commands";
export interface DrawingClarityState {
  readonly active: boolean;
  readonly available: boolean;
  readonly presentation?: "integrated" | "app";
  readonly selectionHost?: HTMLDivElement | null;
  readonly setSelectionHost?: (host: HTMLDivElement | null) => void;
  readonly panel: StudioDrawingClarityPanel | null;
  readonly open: (panel: StudioDrawingClarityPanel, trigger: HTMLElement) => void;
  readonly reveal: (panel: StudioDrawingClarityPanel, trigger: HTMLElement) => void;
  readonly close: () => void;
  readonly chooseSimple: () => void;
  readonly showSavedLayout: () => void;
}
export const DrawingClarityContext = createContext<DrawingClarityState | null>(null);

export function useStudioDrawingClarity() { return useContext(DrawingClarityContext); }
