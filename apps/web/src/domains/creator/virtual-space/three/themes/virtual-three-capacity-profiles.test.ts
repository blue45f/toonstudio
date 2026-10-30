import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { VIRTUAL_THREE_DESKTOP_HIGH_QUALITY_CAPACITY_PROFILE as desktop } from "./virtual-three-capacity-profiles";
import { assertVirtualThreeSceneCapacity, VirtualThreeRendererCapacityError, VIRTUAL_THREE_RENDERER_CAPACITY_POLICY, type VirtualThreeSceneInventoryInput } from "./virtual-three-renderer-inventory";

/** 실제 이미지를 할당하지 않고 원본과 같은 texture 치수 계약을 검사한다. */
function representativeScene(count: number, size: number): THREE.Scene {
  const scene = new THREE.Scene();
  for (let index = 0; index < count; index += 1) {
    const texture = new THREE.Texture({ width: size, height: size });
    texture.generateMipmaps = true;
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: texture })));
  }
  return scene;
}
function input(activeScene = representativeScene(9, 2048)): VirtualThreeSceneInventoryInput {
  return {
    activeScene, camera: new THREE.PerspectiveCamera(), sourceInputs: [],
    framebuffer: { width: 3840, height: 2160, samples: 4, depth: true, contextAvailable: true },
    shadowsEnabled: true, maxTextureSize: 4096,
  };
}
function dispose(scene: THREE.Object3D): void {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
      material.dispose();
    }
  });
}

describe("고정 desktop 품질 후보의 전체 자원 예산", () => {
  it("4K·MSAA4와 기존 자원을 보존하고 명시 주입한 후보만 사용한다", () => {
    const current = input();
    try {
      expect(() => assertVirtualThreeSceneCapacity(current)).toThrow(VirtualThreeRendererCapacityError);
      const report = assertVirtualThreeSceneCapacity({ ...current, capacityProfile: desktop });
      expect(report.accountedTotalBytes).toBeGreaterThan(VIRTUAL_THREE_RENDERER_CAPACITY_POLICY.maxAccountedBytes);
      expect(report.accountedTotalBytes).toBeLessThan(desktop.policy.maxAccountedBytes);
      expect(report.policyReservation).toMatchObject({ capacityProfileId: "desktop-high-quality-v1", capacityProfileValidation: "candidate" });
      expect(report.deviceVramMeasured).toBe(false);
      expect(report.physicalRamMeasured).toBe(false);
      expect(report.calibrated).toBe(false);
      expect(current.framebuffer).toEqual({ width: 3840, height: 2160, samples: 4, depth: true, contextAvailable: true });
    } finally { dispose(current.activeScene); }
  });

  it("후보에서도 기존·신규 scene과 decode의 동시 peak를 합산해 상한 초과를 거부한다", () => {
    const current = input(), stagedScene = representativeScene(18, 4096);
    try {
      expect(() => assertVirtualThreeSceneCapacity({ ...current, stagedScene, capacityProfile: desktop })).toThrow(VirtualThreeRendererCapacityError);
      expect(() => assertVirtualThreeSceneCapacity({ ...current, capacityProfile: desktop, sourceInputs: [{
        id: "staged:pending", blobBytes: 1024, bufferCopyBytes: 1024,
        decodedGeometryBytes: 0, decodedImageBytes: 1024 * 1024 * 1024, pendingDecode: true,
      }] })).toThrow(VirtualThreeRendererCapacityError);
      expect(current.activeScene.children).toHaveLength(9);
      expect(stagedScene.children).toHaveLength(18);
    } finally { dispose(current.activeScene); dispose(stagedScene); }
  });

  it("원장 계산을 바꾸지 않고 2GiB를 넘는 동일 품질 준비량을 유한 3GiB 후보에서 평가한다", () => {
    const current = input();
    const sourceInputs = [{ id: "staged:fixed-quality", blobBytes: 1024, bufferCopyBytes: 1024,
      decodedGeometryBytes: 0, decodedImageBytes: 512 * 1024 * 1024, pendingDecode: true }];
    try {
      expect(() => assertVirtualThreeSceneCapacity({ ...current, sourceInputs,
        policy: { ...desktop.policy, maxAccountedBytes: 2 * 1024 * 1024 * 1024 } })).toThrow(VirtualThreeRendererCapacityError);
      const report = assertVirtualThreeSceneCapacity({ ...current, sourceInputs, capacityProfile: desktop });
      expect(report.accountedTotalBytes).toBeGreaterThan(2 * 1024 * 1024 * 1024);
      expect(report.accountedTotalBytes).toBeLessThan(desktop.policy.maxAccountedBytes);
      expect(report.calibrated).toBe(false);
      expect(report.physicalRamMeasured).toBe(false);
      expect(current.activeScene.children).toHaveLength(9);
    } finally { dispose(current.activeScene); }
  });

  it("후보에서도 미확인 texture·중복 lease·서로 충돌하는 정책 지정을 거부한다", () => {
    const unknown = representativeScene(1, 0), current = input(unknown);
    try {
      expect(() => assertVirtualThreeSceneCapacity({ ...current, capacityProfile: desktop })).toThrow(VirtualThreeRendererCapacityError);
      const empty = input(new THREE.Scene());
      const source = { id: "same", blobBytes: 0, bufferCopyBytes: 0, decodedGeometryBytes: 0, decodedImageBytes: 0 };
      expect(() => assertVirtualThreeSceneCapacity({ ...empty, capacityProfile: desktop, sourceInputs: [source, source] })).toThrow(VirtualThreeRendererCapacityError);
      expect(() => assertVirtualThreeSceneCapacity({ ...empty, capacityProfile: desktop, policy: VIRTUAL_THREE_RENDERER_CAPACITY_POLICY })).toThrow(VirtualThreeRendererCapacityError);
    } finally { dispose(unknown); }
  });
});
