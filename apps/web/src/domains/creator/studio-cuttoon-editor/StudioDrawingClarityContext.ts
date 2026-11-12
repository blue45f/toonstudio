import { createContext, useContext } from "react";

export type StudioDrawingClarityPanel = "layers" | "brush" | "pages";
export interface DrawingClarityState {
  readonly active: boolean;
  readonly available: boolean;
  readonly panel: StudioDrawingClarityPanel | null;
  readonly open: (panel: StudioDrawingClarityPanel, trigger: HTMLElement) => void;
  readonly reveal: (panel: StudioDrawingClarityPanel, trigger: HTMLElement) => void;
  readonly close: () => void;
  readonly chooseSimple: () => void;
  readonly showSavedLayout: () => void;
}
export const DrawingClarityContext = createContext<DrawingClarityState | null>(null);

export function useStudioDrawingClarity() { return useContext(DrawingClarityContext); }
