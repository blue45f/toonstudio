import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { studioVirtualSpaceState } from "../studio-virtual-space-model";
import { createStylized3DCharacterNode, STUDIO_THREE_SCALE } from "./studio-virtual-space-three-scene";
import { applyStudioThreeActorPose } from "./studio-virtual-space-three-motion";
import { StudioThreeFollowCamera, StudioThreePeerMotion } from "./studio-virtual-space-three-follow";

const packet = (sequence: number, lastSeen: number, x: number, moving: boolean) => ({
  sequence, lastSeen, state: studioVirtualSpaceState({ x, y: 400 }, "right", "available", moving),
});

describe("3D 공간의 원격 보행과 카메라 추적", () => {
  it.each([30, 60, 144])("%iHz에서 80·160ms 간격의 송신 사이에 동료가 멈추거나 뒤로 튀지 않는다", (hz) => {
    const motion = new StudioThreePeerMotion();
    const node = createStylized3DCharacterNode("peer", 0x446688, false);
    const samples = [0, 80, 240, 320, 480, 560, 720, 800, 960].map((at, k) => packet(k + 1, at, 400 + at * 0.2, k !== 8));
    let previous = 0;
    let latest = 0;
    for (let frame = 0; frame <= hz * 1.4; frame++) {
      const now = (1000 * frame) / hz;
      while (latest + 1 < samples.length && samples[latest + 1]!.lastSeen <= now) latest++;
      motion.update(node, samples[latest]!, now, 1 / hz);
      expect(node.group.position.x).toBeGreaterThanOrEqual(previous);
      previous = node.group.position.x;
      if (now > 100 && now < 1060) expect(node.moving).toBe(true);
      if (now > 1060) expect(node.moving).toBe(false);
    }
    expect(previous).toBeCloseTo(592 * STUDIO_THREE_SCALE, 8);
  });

  it("멈춘 아바타의 발 높이는 시간과 무관하고, 같은 걸음 거리는 서버 시각과 무관하다", () => {
    const phaseAt = (startMs: number) => {
      const node = createStylized3DCharacterNode("actor", 0x446688, false);
      for (const delta of [0, 83, 239, 1800]) {
        applyStudioThreeActorPose(node, startMs + delta, 1 / 60);
        expect(node.rigGroup.position.y).toBe(0);
      }
      node.moving = true;
      node.group.position.x += 0.2;
      applyStudioThreeActorPose(node, startMs + 1900, 1 / 60);
      const legAngle = node.leftLeg.rotation.x;
      applyStudioThreeActorPose(node, startMs + 2000, 1 / 60);
      expect(node.leftLeg.rotation.x).toBe(legAngle);
      return legAngle;
    };
    expect(phaseAt(0)).toBeGreaterThan(0);
    expect(phaseAt(0)).toBe(phaseAt(9172));
  });

  it("순번이 오래된 패킷은 버리고 새 장소로 순간 이동하며 이후 수신이 끊기면 보행을 멈춘다", () => {
    const motion = new StudioThreePeerMotion();
    const node = createStylized3DCharacterNode("peer", 0x446688, false);
    motion.update(node, packet(10, 1000, 400, true), 1000, 1 / 60);
    motion.update(node, packet(11, 1080, 1000, true), 1080, 1 / 60);
    expect(node.group.position.x).toBe(1000 * STUDIO_THREE_SCALE);
    motion.update(node, packet(9, 1500, 100, true), 1600, 1 / 60);
    expect(node.group.position.x).toBe(1000 * STUDIO_THREE_SCALE);
    expect(node.moving).toBe(false);
  });

  it("30·60·144Hz의 추적 시상수가 같고, 이동과 반전 때 카메라의 기울기가 흔들리지 않는다", () => {
    const end = [30, 60, 144].map((hz) => {
      const camera = new PerspectiveCamera();
      const follow = new StudioThreeFollowCamera(0, 0);
      follow.update(camera, 0, 0, 0.7, 1, 0, true);
      const initial = new Quaternion().copy(camera.quaternion);
      for (let frame = 1; frame <= hz; frame++) {
        follow.update(camera, frame <= hz / 2 ? 5 : -1, 3, 0.7, 1, 1 / hz, false);
        expect(camera.quaternion.angleTo(initial)).toBeLessThan(1e-6);
      }
      const result = camera.position.clone();
      follow.update(camera, 110, 200, 0, 2, 0, true);
      expect(camera.position.distanceTo(new Vector3(110, 5.4, 206.4))).toBeLessThan(1e-9);
      return result;
    });
    expect(end[0]!.distanceTo(end[1]!)).toBeLessThan(1e-9);
    expect(end[0]!.distanceTo(end[2]!)).toBeLessThan(1e-9);
  });
});
