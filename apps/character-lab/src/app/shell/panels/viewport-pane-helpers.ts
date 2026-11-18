import { isLabFailure } from "../../../contracts";

import type { CameraFraming } from "../../../contracts";
import type { PaintSession } from "../../../paint/paint-session";
import type { CSSProperties } from "react";

export interface ViewportPaneProps {
  readonly paintSession?: PaintSession;
  readonly hudIntervalMs?: number;
  readonly initialOverlays?: { readonly handles?: boolean; readonly hud?: boolean; readonly controlPoints?: boolean };
}

export const DEFAULT_HUD_INTERVAL_MS = 250;
export const FRAMING_MODES: ReadonlyArray<{ readonly mode: CameraFraming["mode"]; readonly label: string }> = [
  { mode: "full-body", label: "전신" },
  { mode: "bust", label: "상반신" },
  { mode: "face", label: "얼굴" },
];
export const FILL: CSSProperties = { position: "absolute", inset: 0 };
export const CANVAS_KEY_SHORTCUTS = "ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Home";


export function failureText(error: unknown, fallback: string): string {
  return isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : fallback;
}

export function releaseCapture(el: Element | undefined, pointerId: number): void {
  if (el && typeof el.releasePointerCapture === "function" && el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
}
