import { isLabFailure } from "../../../contracts";

import type { ShaperGizmoMode } from "./shaper-control-points";
import type { DragPivot, JointDragOutcome } from "./viewport-interactions";
import type { ApplyPlan, BodyParamKey, CameraFraming, CharacterEngine, JointDragHandle, ParamValues, Pose, SkeletonData } from "../../../contracts";
import type { CSSProperties } from "react";

export interface DragSession {
  readonly pointerId: number;
  readonly target: SVGCircleElement;
  readonly engine: CharacterEngine;
  readonly skeleton: SkeletonData;
  readonly handle: JointDragHandle;
  readonly pivot: DragPivot;
  readonly startPose: Pose;
  readonly startPixel: readonly [number, number];
  readonly basePlan: ApplyPlan | null;
  readonly mode: ShaperGizmoMode;
  readonly baseBody: ParamValues<BodyParamKey>;
  outcome: JointDragOutcome | null;
  ikOutcome: { readonly pose: Pose; readonly labelKo: string } | null;
  scaleOutcome: { readonly key: BodyParamKey; readonly value: number; readonly labelKo: string } | null;
}

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
