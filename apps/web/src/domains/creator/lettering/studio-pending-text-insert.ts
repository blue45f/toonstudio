import type { TextEl } from "../studio-element-model";

export interface StudioLetteringEditTarget {
  readonly id: string;
  readonly pendingText?: TextEl;
}

export function createStudioTextAt(id: string, cx: number, cy: number, fill: string): TextEl {
  return { id, type: "text", text: "텍스트", x: cx - 110, y: cy - 24, width: 220, fontSize: 40, fill, rotation: 0 };
}
