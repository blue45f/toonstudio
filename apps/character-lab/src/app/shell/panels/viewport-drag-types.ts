import type { ShaperGizmoMode, ShaperProjectedControlPoint } from "./shaper-control-points";
import type { DragPivot, JointDragOutcome } from "./viewport-interactions";
import type { ApplyPlan, BodyParamKey, CharacterEngine, FaceParamKey, JointDragHandle, ParamValues, Pose, SkeletonData } from "../../../contracts";

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

export interface ControlPointDragSession {
  readonly pointerId: number;
  readonly target: SVGCircleElement;
  readonly controlPoint: ShaperProjectedControlPoint;
  readonly startPixel: readonly [number, number];
  readonly baseFace: ParamValues<FaceParamKey>;
  readonly baseBody: ParamValues<BodyParamKey>;
  changes: ReadonlyArray<{ readonly group: "face" | "body"; readonly key: FaceParamKey | BodyParamKey; readonly value: number }>;
}
