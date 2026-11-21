import { Vector3, type PerspectiveCamera } from "three";

import type { StudioVirtualSpacePeer } from "../studio-virtual-space-model";
import { studioCameraLerp, StudioPeerTimeline, STUDIO_PEER_TELEPORT_DISTANCE } from "../studio-virtual-space-presentation";
import { facingToYawRadians, shortestAngleLerp, STUDIO_THREE_SCALE } from "./studio-virtual-space-three-coordinates";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";
import type { StudioThreeCameraMode } from "./studio-virtual-space-three-stage-props";

export const STUDIO_THREE_FIRST_PERSON_EYE_HEIGHT_M = 1.52;
export const STUDIO_THREE_FIRST_PERSON_SEATED_EYE_HEIGHT_M = 1.12;
export const STUDIO_THREE_THIRD_PERSON_DEFAULT_PITCH = 0.24;
export const STUDIO_THREE_THIRD_PERSON_MIN_PITCH = -0.35;
export const STUDIO_THREE_THIRD_PERSON_MAX_PITCH = 0.95;
export const STUDIO_THREE_FIRST_PERSON_MIN_PITCH = -0.82;
export const STUDIO_THREE_FIRST_PERSON_MAX_PITCH = 0.82;

export function clampStudioThreeCameraPitch(mode: StudioThreeCameraMode, pitch: number): number {
  const safe = Number.isFinite(pitch) ? pitch : 0;
  if (mode === "first-person") {
    return Math.min(STUDIO_THREE_FIRST_PERSON_MAX_PITCH, Math.max(STUDIO_THREE_FIRST_PERSON_MIN_PITCH, safe));
  }
  if (mode === "third-person") {
    return Math.min(STUDIO_THREE_THIRD_PERSON_MAX_PITCH, Math.max(STUDIO_THREE_THIRD_PERSON_MIN_PITCH, safe));
  }
  return 0;
}

export function shouldHideSelfHeadForCameraMode(mode: StudioThreeCameraMode): boolean {
  return mode === "first-person";
}

export interface StudioThreeFollowCameraOptions {
  readonly mode?: StudioThreeCameraMode;
  readonly pitch?: number;
  readonly seated?: boolean;
}

/** 도착 시각과 송신 순번으로 동료의 이동을 재생한다. 퇴장하면 노드와 함께 표본도 버린다. */
export class StudioThreePeerMotion {
  private readonly timeline = new StudioPeerTimeline();
  private sequence: number | undefined;

  update(node: StudioThreeActorNode, peer: Pick<StudioVirtualSpacePeer, "sequence" | "state" | "lastSeen">, wallNow: number, dt: number): void {
    const first = this.sequence === undefined;
    if (this.sequence === undefined || peer.sequence > this.sequence) {
      this.sequence = peer.sequence;
      const { x, y, moving, facing } = peer.state;
      this.timeline.push({ x, y, moving, facing, at: peer.lastSeen, sequence: peer.sequence });
    }
    const pose = this.timeline.sample(wallNow);
    if (!pose) return;
    const x = pose.x * STUDIO_THREE_SCALE, z = pose.y * STUDIO_THREE_SCALE;
    const dx = x - node.group.position.x, dz = z - node.group.position.z;
    node.moving = pose.moving;
    const snapped = first || Math.hypot(dx, dz) > STUDIO_PEER_TELEPORT_DISTANCE * STUDIO_THREE_SCALE;
    if (snapped || !node.moving) node.targetYaw = facingToYawRadians(pose.facing);
    else if (Math.abs(dx) + Math.abs(dz) > 0.000001) node.targetYaw = Math.atan2(dx, dz);
    node.currentYaw = snapped ? node.targetYaw : shortestAngleLerp(node.currentYaw, node.targetYaw, studioCameraLerp(dt, 0.2));
    node.group.position.set(x, 0, z);
    node.group.rotation.y = node.currentYaw;
  }
}

/**
 * 3모드(쿼터뷰 · 3인칭 숄더 오빗 · 1인칭 눈높이) 추종 카메라.
 * 쿼터뷰 기본 경로는 기존 시상수와 정밀 좌표를 100% 보존한다.
 */
export class StudioThreeFollowCamera {
  private readonly focus: Vector3;
  private readonly target = new Vector3();
  private lastMode: StudioThreeCameraMode = "quarter";

  constructor(x: number, z: number) {
    this.focus = new Vector3(x, 10.8, z);
  }

  update(
    camera: PerspectiveCamera,
    x: number,
    z: number,
    yaw: number,
    zoom: number,
    dt: number,
    snap: boolean,
    options?: StudioThreeFollowCameraOptions,
  ): void {
    const mode: StudioThreeCameraMode = options?.mode ?? "quarter";
    const modeSwitched = mode !== this.lastMode;
    this.lastMode = mode;
    const safeZoom = Math.max(0.5, Math.min(2.5, Number.isFinite(zoom) && zoom > 0 ? zoom : 1));
    const lerpAlpha = snap || modeSwitched ? 1 : studioCameraLerp(dt, 0.16);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    if (mode === "first-person") {
      const eyeY = options?.seated
        ? STUDIO_THREE_FIRST_PERSON_SEATED_EYE_HEIGHT_M
        : STUDIO_THREE_FIRST_PERSON_EYE_HEIGHT_M;
      const pitch = clampStudioThreeCameraPitch("first-person", options?.pitch ?? 0);
      this.target.set(x, eyeY, z);
      this.focus.lerp(this.target, lerpAlpha);
      // 1인칭에서는 아바타 정면(-sin, -cos) 방향으로 눈높이 시점을 둔다.
      const cosPitch = Math.cos(pitch);
      const lookDist = 4.0;
      camera.position.set(this.focus.x - sin * 0.06, this.focus.y, this.focus.z - cos * 0.06);
      camera.lookAt(
        this.focus.x - sin * cosPitch * lookDist,
        this.focus.y - Math.sin(pitch) * lookDist,
        this.focus.z - cos * cosPitch * lookDist,
      );
      return;
    }

    if (mode === "third-person") {
      const pitch = clampStudioThreeCameraPitch("third-person", options?.pitch ?? STUDIO_THREE_THIRD_PERSON_DEFAULT_PITCH);
      const anchorY = options?.seated ? 1.18 : 1.48;
      this.target.set(x, anchorY, z);
      this.focus.lerp(this.target, lerpAlpha);
      const distance = 3.85 / Math.max(0.65, Math.min(1.65, safeZoom));
      const horiz = Math.cos(pitch) * distance;
      const camY = Math.max(0.45, this.focus.y + Math.sin(pitch) * distance);
      // 우측 숄더 오프셋 (+0.32m)으로 캐릭터가 화면 중심을 가리지 않게 한다.
      const shoulderOffset = 0.32;
      const rightX = cos * shoulderOffset;
      const rightZ = -sin * shoulderOffset;
      camera.position.set(
        this.focus.x + sin * horiz + rightX,
        camY,
        this.focus.z + cos * horiz + rightZ,
      );
      camera.lookAt(
        this.focus.x + rightX * 0.65 - sin * 0.5,
        this.focus.y + 0.06,
        this.focus.z + rightZ * 0.65 - cos * 0.5,
      );
      return;
    }

    // 기본 쿼터뷰 (기존 동작·정밀도 100% 보존)
    this.target.set(x, 10.8 / zoom, z);
    this.focus.lerp(this.target, lerpAlpha);
    const distance = this.focus.y * (12.8 / 10.8);
    camera.position.set(this.focus.x + sin * distance, this.focus.y, this.focus.z + cos * distance);
    camera.lookAt(this.focus.x - sin * 0.8, 1.05, this.focus.z - cos * 0.8);
  }
}
