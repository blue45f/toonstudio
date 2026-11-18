import { isLabFailure } from "../../../contracts";

import type { CameraFraming } from "../../../contracts";
import type { CSSProperties } from "react";

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
