import { isLabFailure } from "../../../contracts";
import { clientToRenderPixel } from "../../../render/viewport-math";

import { DUO_SHOT_DISTANCES, SHAPER_DUO_PARTNER_PROFILES, computeWebtoonDuoEyeContact, resolveSubjectHeightMetrics } from "./viewport-duo-shot-guide";
import { findWebtoonHandPropSpec } from "./viewport-hand-prop-controls";
import { hudRows } from "./viewport-interactions";

import type { ShaperGizmoMode, ShaperProjectedControlPoint } from "./shaper-control-points";
import type { DuoShotState } from "./viewport-duo-shot-guide";
import type { DragPivot, JointDragOutcome } from "./viewport-interactions";
import type { ApplyPlan, BodyParamKey, CameraFraming, CharacterEngine, CharacterRecipe, FaceParamKey, HandPropId, HandPropSide, HudSample, JointDragHandle, ParamValues, Pose, SkeletonData } from "../../../contracts";
import type { PaintSession } from "../../../paint/paint-session";
import type { ViewportCameraInfo } from "../../../render/viewport-camera";
import type { ClientBox } from "../../../render/viewport-math";
import type { CSSProperties } from "react";

export interface ViewportPaneProps {
  readonly paintSession?: PaintSession;
  readonly hudIntervalMs?: number;
  readonly initialOverlays?: { readonly handles?: boolean; readonly hud?: boolean; readonly controlPoints?: boolean };
}

export const DEFAULT_HUD_INTERVAL_MS = 250;

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

export function viewportDuoShotDetails(recipe: Pick<CharacterRecipe, "source" | "body">, duoShot: DuoShotState) {
  const subjectHeight = resolveSubjectHeightMetrics(recipe.source, recipe.body);
  const duoPartner = SHAPER_DUO_PARTNER_PROFILES.find((item) => item.id === duoShot.partnerId) ?? SHAPER_DUO_PARTNER_PROFILES[0]!;
  const duoEyeContact = computeWebtoonDuoEyeContact({
    subjectHeightCm: subjectHeight.heightCm,
    subjectEyeHeightCm: subjectHeight.eyeHeightCm,
    partnerHeightCm: duoPartner.heightCm,
    partnerEyeHeightCm: duoPartner.eyeHeightCm,
    distanceMeters: DUO_SHOT_DISTANCES[duoShot.distanceKey].meters,
    side: duoShot.side,
  });
  return { subjectHeight, duoPartner, duoEyeContact };
}

export function describeHandPropAttachment(nextPropId: HandPropId | "", nextSide: HandPropSide): string {
  const spec = nextPropId ? findWebtoonHandPropSpec(nextPropId) : null;
  return spec
    ? `손 소품 장착: ${spec.labelKo} (${nextSide === "rightHand" ? "오른손" : "왼손"})`
    : "손 소품을 해제했습니다.";
}

export function viewportPresentation(
  hud: HudSample | null,
  renderSize: { readonly width: number; readonly height: number } | null,
  engine: CharacterEngine | null,
  showHandles: boolean,
  handles: readonly JointDragHandle[],
  draggingBone: string | null,
) {
  const hudList = hud ? hudRows(hud) : [];
  const viewBox = renderSize ? `0 0 ${renderSize.width} ${renderSize.height}` : undefined;
  const noHandleReason = engine && showHandles && handles.length === 0 ? "이 소스에는 스켈레톤이 없어 표시할 관절 핸들이 없습니다." : null;
  const activeHandle = draggingBone ? handles.find((entry) => entry.bone === draggingBone) ?? null : null;
  return { hudList, viewBox, noHandleReason, activeHandle };
}

export function viewportPointerPixel(
  event: { readonly clientX: number; readonly clientY: number },
  box: ClientBox | undefined,
  camera: ViewportCameraInfo,
): readonly [number, number] | null {
  return box ? clientToRenderPixel(event.clientX, event.clientY, box, camera) : null;
}
