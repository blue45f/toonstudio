/**
 * PosePanel 보조 순수 계산 및 하위 UI 블록(`CoordInputs`, `PoseDisabledDiagnostics`, `PoseAdvancedDiagnostics`).
 * 파일명을 소문자 하이픈(`pose-panel-helpers.tsx`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 */
import { createReferenceSkeleton } from "../../../animation/reference-skeleton";
import { computeWorldTransforms } from "../../../animation/skeleton-fk";
import { IK_CHAINS } from "../../../contracts";

import { safeComputeWorldTransforms, type SkeletonBoundaryOptions } from "./skeleton-boundary-guard";

import type { HumanoidBoneName, IkChainId, LabFailure, Pose, Quat, RecipeSource, SkeletonData, SlotCapability, Vec3 } from "../../../contracts";

export type IkTargetId = IkChainId | "head";
export const IK_TARGET_IDS: readonly IkTargetId[] = ["leftArm", "rightArm", "leftLeg", "rightLeg", "head"];
export const IK_TARGET_LABELS_KO: Readonly<Record<IkTargetId, string>> = {
  leftArm: "왼손",
  rightArm: "오른손",
  leftLeg: "왼발",
  rightLeg: "오른발",
  head: "머리(척추 체인)",
};

export type HandSide = "both" | "left" | "right";
export const HAND_SIDE_LABELS_KO: Readonly<Record<HandSide, string>> = { both: "양손", left: "왼손", right: "오른손" };
export const HAND_SIDES: readonly HandSide[] = ["both", "left", "right"];

export const REFERENCE_SKELETON = createReferenceSkeleton();
export const REST_WORLD_TRANSFORMS = computeWorldTransforms(REFERENCE_SKELETON, {});

export interface Coords {
  readonly x: string;
  readonly y: string;
  readonly z: string;
}

export function isIkTargetId(value: string): value is IkTargetId {
  return (IK_TARGET_IDS as readonly string[]).includes(value);
}

export function isHandSide(value: string): value is HandSide {
  return (HAND_SIDES as readonly string[]).includes(value);
}

export function mirrorHumanoidPoseLeftRight(pose: Pose): Pose {
  const swapBoneName = (bone: HumanoidBoneName): HumanoidBoneName => {
    if (bone.startsWith("left")) return `right${bone.slice(4)}` as HumanoidBoneName;
    if (bone.startsWith("right")) return `left${bone.slice(5)}` as HumanoidBoneName;
    return bone;
  };
  const mirrorQuat = (q: Quat): Quat => [q[0], -q[1], -q[2], q[3]];
  const out: Partial<Record<HumanoidBoneName, Quat>> = {};
  for (const [bone, q] of Object.entries(pose) as Array<[HumanoidBoneName, Quat | undefined]>) {
    if (!q) continue;
    out[swapBoneName(bone)] = mirrorQuat(q);
  }
  return out;
}

function endBoneOf(target: IkTargetId): HumanoidBoneName {
  return target === "head" ? "head" : IK_CHAINS[target][2];
}

function midBoneOf(target: IkTargetId): HumanoidBoneName {
  return target === "head" ? "chest" : IK_CHAINS[target][1];
}

export function ikEndPosition(pose: Pose, target: IkTargetId, skeleton: SkeletonData = REFERENCE_SKELETON, options?: SkeletonBoundaryOptions): Vec3 {
  const fk = safeComputeWorldTransforms(skeleton, pose, options);
  if (!fk.ok) return REST_WORLD_TRANSFORMS.get(endBoneOf(target))?.position ?? [0, 0, 0];
  return fk.transforms.get(endBoneOf(target))?.position ?? [0, 0, 0];
}

export function midPosition(pose: Pose, target: IkTargetId, skeleton: SkeletonData = REFERENCE_SKELETON, options?: SkeletonBoundaryOptions): Vec3 {
  const fk = safeComputeWorldTransforms(skeleton, pose, options);
  if (!fk.ok) return REST_WORLD_TRANSFORMS.get(midBoneOf(target))?.position ?? [0, 0, 0];
  return fk.transforms.get(midBoneOf(target))?.position ?? [0, 0, 0];
}

export function toCoords(v: Vec3): Coords {
  return { x: v[0].toFixed(3), y: v[1].toFixed(3), z: v[2].toFixed(3) };
}

export function parseCoords(coords: Coords): Vec3 | null {
  const parts = [coords.x, coords.y, coords.z].map((text) => (text.trim() === "" ? Number.NaN : Number(text)));
  const [x, y, z] = parts;
  if (x === undefined || y === undefined || z === undefined || !parts.every(Number.isFinite)) return null;
  return [x, y, z];
}

export interface IkOutcome {
  readonly reached: boolean;
  readonly error: number;
  readonly status: string;
  readonly reasonKo?: string;
}

export function describeIkOutcome(labelKo: string, outcome: IkOutcome): string {
  const mm = (outcome.error * 1000).toFixed(1);
  if (outcome.reached) return `${labelKo} 목표 도달 (오차 ${mm} mm)`;
  return `${labelKo} 목표 미도달(${outcome.status}): ${outcome.reasonKo ?? "사유 없음"} · 오차 ${mm} mm`;
}

export type IkStatusTone = "reached" | "clamped" | "unreachable";

export function ikStatusTone(outcome: IkOutcome): IkStatusTone {
  if (outcome.reached) return "reached";
  return outcome.status === "clamped" ? "clamped" : "unreachable";
}

export function describeActiveRigSourceKo(source: RecipeSource): string {
  switch (source.kind) {
    case "kit":
      return `모듈식 키트 (${source.kitId} · ${source.baseId === "female" ? "여성 베이스" : "남성 베이스"})`;
    case "package":
      return `제작 패키지 (${source.characterId})`;
    case "procedural":
      return "절차적 휴머노이드";
    default: {
      const exhaustive: never = source;
      return String((exhaustive as { kind?: unknown }).kind);
    }
  }
}

export interface CoordInputsProps {
  readonly idPrefix: string;
  readonly labelPrefix: string;
  readonly value: Coords;
  readonly disabled?: boolean;
  readonly onChange: (next: Coords) => void;
}

export function CoordInputs({ idPrefix, labelPrefix, value, disabled, onChange }: CoordInputsProps) {
  const axes: ReadonlyArray<readonly [keyof Coords, string]> = [["x", "X"], ["y", "Y"], ["z", "Z"]];
  return (
    <div className="cl-pose-row cl-pose-coords">
      {axes.map(([key, axis]) => (
        <span key={key} className="cl-pose-coord">
          <label htmlFor={`${idPrefix}-${key}`}>{`${labelPrefix} ${axis}`}</label>
          <input id={`${idPrefix}-${key}`} type="number" step={0.01} disabled={disabled} value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
        </span>
      ))}
    </div>
  );
}

export interface PoseDisabledReasonDetailsProps {
  readonly ids: string;
  readonly skeletonFailure: LabFailure | null;
  readonly poseCapability: SlotCapability;
  readonly handCapability: SlotCapability;
  readonly sharedUnavailableReason: boolean;
  readonly hasEmptySkeleton: boolean;
  readonly handDisabled: boolean;
  readonly unsupportedPoseReason?: string;
  readonly unsupportedHandReason?: string;
}

export function PoseDisabledReasonDetails(props: PoseDisabledReasonDetailsProps) {
  const { ids, skeletonFailure, poseCapability, handCapability, sharedUnavailableReason, hasEmptySkeleton, handDisabled, unsupportedPoseReason, unsupportedHandReason } = props;
  return (
    <details className="cl-pose-advanced-diagnostics" data-testid="pose-disabled-reason-details">
      <summary className="cl-pose-diagnostics-summary" data-testid="pose-disabled-reason-summary">비활성 상세 사유 보기</summary>
      <div className="cl-pose-diagnostics-body">
        {skeletonFailure ? <p className="cl-pose-reason" data-testid="pose-skeleton-failure-detail">상세 진단: {skeletonFailure.reasonKo}</p> : null}
        {poseCapability.status !== "available" ? (
          <p id={`${ids}-pose-reason`} className="cl-pose-reason" role="note" data-testid="pose-capability-reason">
            {sharedUnavailableReason ? "포즈·손 포즈 슬롯 미지원" : `포즈 슬롯 ${poseCapability.status === "partial" ? "부분 지원" : "미지원"}`}: {poseCapability.reasonKo ?? "사유 없음"}
          </p>
        ) : hasEmptySkeleton ? (
          <p id={`${ids}-pose-reason`} className="cl-pose-reason" role="note" data-testid="pose-capability-reason">
            포즈·손 포즈 슬롯 미지원: 엔진이 보고한 포즈 가능 본이 0개(정적 메시)입니다.
          </p>
        ) : null}
        {handDisabled && !sharedUnavailableReason ? (
          <p className="cl-pose-reason" role="note" data-testid="pose-hand-capability-reason">
            손 포즈 슬롯 미지원: {handCapability.reasonKo ?? "사유 없음"}
          </p>
        ) : null}
        {unsupportedPoseReason && unsupportedPoseReason !== poseCapability.reasonKo ? <p className="cl-pose-reason" role="status">현재 포즈가 적용되지 않았습니다: {unsupportedPoseReason}</p> : null}
        {unsupportedHandReason && unsupportedHandReason !== handCapability.reasonKo && unsupportedHandReason !== poseCapability.reasonKo ? (
          <p className="cl-pose-reason" role="status">현재 손 포즈가 적용되지 않았습니다: {unsupportedHandReason}</p>
        ) : null}
      </div>
    </details>
  );
}
