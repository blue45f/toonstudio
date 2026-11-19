import { Vector3, type PerspectiveCamera } from "three";
import type { StudioVirtualSpacePeer } from "../studio-virtual-space-model";
import { studioCameraLerp, StudioPeerTimeline, STUDIO_PEER_TELEPORT_DISTANCE } from "../studio-virtual-space-presentation";
import { facingToYawRadians, shortestAngleLerp, STUDIO_THREE_SCALE } from "./studio-virtual-space-three-coordinates";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";

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

/** 카메라 위치와 시선이 한 기준점을 추적해야 등속 이동과 정지 때 사진기의 기울기가 변하지 않는다. */
export class StudioThreeFollowCamera {
  private readonly focus: Vector3;
  private readonly target = new Vector3();

  constructor(x: number, z: number) {
    this.focus = new Vector3(x, 10.8, z);
  }

  update(camera: PerspectiveCamera, x: number, z: number, yaw: number, zoom: number, dt: number, snap: boolean): void {
    this.target.set(x, 10.8 / zoom, z);
    this.focus.lerp(this.target, snap ? 1 : studioCameraLerp(dt, 0.16));
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const distance = this.focus.y * (12.8 / 10.8);
    camera.position.set(this.focus.x + sin * distance, this.focus.y, this.focus.z + cos * distance);
    camera.lookAt(this.focus.x - sin * 0.8, 1.05, this.focus.z - cos * 0.8);
  }
}
