import * as THREE from "three";
import { MeshBasicNodeMaterial, type WebGPURenderer } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";

import { StudioMToonNodeMaterial } from "../mesh-materials/studio-mtoon-node-material";
import { updateStudioMToonInstanceMaterials } from "../mesh-materials/studio-mtoon-instance-materials";
import { createStudioBg3dThreeWebGpuCaptureAdapter } from "./studio-bg3d-three-webgpu-capture";

/** 실제 material/adapter를 사용하고 GPU draw/readback만 기록기로 대체한다. 픽셀 증거가 아니다. */
describe("실제 WebGPU capture의 툰 기하 제출과 수명", () => {
  it.each(["resolve", "reject", "dispose", "submit-failure"] as const)("복사의 %s까지 임시 본체와 clock을 소유하고 제출 상태는 즉시 복원한다", async (finish) => {
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const mask = new THREE.DataTexture(new Uint8Array([0, 0, 128, 255]), 1, 1);
    const body = new StudioMToonNodeMaterial({ side: THREE.DoubleSide, alphaTest: .5 });
    body.map = map; body.uvAnimationMaskTexture = mask;
    body.uvAnimationScrollXSpeedFactor = .4; body.update(.5);
    body.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -.1)];
    const outline = body.clone(); outline.isOutline = true; outline.side = THREE.BackSide;
    const geometry = new THREE.BoxGeometry(); geometry.clearGroups();
    geometry.addGroup(0, geometry.index!.count, 0); geometry.addGroup(0, geometry.index!.count, 1);
    const original = [body, outline], mesh = new THREE.Mesh(geometry, original), scene = new THREE.Scene(); scene.add(mesh);
    const fences = Array.from({ length: finish === "submit-failure" ? 1 : 3 }, () => Promise.withResolvers<Uint8Array>());
    const passDisposed = vi.fn(), snapshotsDisposed = vi.fn();
    const sourceVersion = map.source.version, maskVersion = mask.source.version, originalGroups = JSON.stringify(geometry.groups);
    let target: THREE.RenderTarget | null = null, mrt: unknown = null, reads = 0, geometryDraws = 0;
    const recorder = {
      isWebGPURenderer: true, domElement: { width: 2, height: 2 }, autoClear: true, xr: { enabled: false },
      toneMapping: THREE.NeutralToneMapping, getRenderTarget: () => target, setRenderTarget: (value: THREE.RenderTarget | null) => { target = value; },
      getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, getMRT: () => mrt, setMRT: (value: unknown) => { mrt = value; },
      getClearColor: (value: THREE.Color) => value.set(0), getClearAlpha: () => 0, setClearColor: () => undefined,
      getViewport: (value: THREE.Vector4) => value.set(0, 0, 2, 2), getScissor: (value: THREE.Vector4) => value.set(0, 0, 2, 2),
      getScissorTest: () => false, setViewport: () => undefined, setScissor: () => undefined, setScissorTest: () => undefined,
      render(current: THREE.Object3D) {
        if (current !== scene || mesh.material === original) return;
        geometryDraws += 1; expect(scene.overrideMaterial).toBeNull(); expect(mesh.frustumCulled).toBe(false); expect(mrt).not.toBeNull();
        if (!Array.isArray(mesh.material) || !(mesh.material[0] instanceof MeshBasicNodeMaterial)) throw new Error("실제 Node 기하 pass가 없습니다.");
        const pass = mesh.material[0]; pass.addEventListener("dispose", passDisposed);
        expect(pass).not.toBe(body); expect(pass.side).toBe(THREE.DoubleSide); expect(pass.alphaTest).toBe(.5);
        expect(pass.fragmentNode).toBeNull(); expect(pass.outputNode).not.toBeNull(); expect(pass.normalNode).toBeNull(); expect(mesh.material[1]?.visible).toBe(false);
        expect(pass.map).not.toBe(map); expect(pass.map?.source).not.toBe(map.source); expect(pass.map?.image).toBe(map.image);
        pass.map?.addEventListener("dispose", snapshotsDisposed);
        expect(pass.clippingPlanes).toEqual(body.clippingPlanes); expect(pass.opacity).toBe(body.opacity);
        if (finish === "submit-failure") throw new Error("기하 제출 실패");
      },
      readRenderTargetPixelsAsync() {
        const fence = fences[reads++]; if (!fence) throw new Error("예상하지 않은 GPU 복사입니다."); return fence.promise;
      },
    };
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: recorder as unknown as WebGPURenderer, scene, camera: new THREE.PerspectiveCamera() });
    try {
      const pending = adapter.capture({ width: 2, height: 2, includeDepth: true, includeNormals: true, background: { color: "#ffffff", alpha: 0 } });
      const verification = finish === "resolve" ? expect(pending).resolves.toMatchObject({ width: 2, height: 2 })
        : expect(pending).rejects.toThrow(finish === "submit-failure" ? "기하 제출 실패" : undefined);
      expect(reads).toBe(fences.length); expect(geometryDraws).toBe(1); expect(mesh.material).toBe(original); expect(mesh.frustumCulled).toBe(true);
      expect(scene.overrideMaterial).toBeNull(); expect(target).toBeNull(); expect(mrt).toBeNull();
      expect(JSON.stringify(geometry.groups)).toBe(originalGroups); expect(map.source.version).toBe(sourceVersion); expect(mask.source.version).toBe(maskVersion);
      updateStudioMToonInstanceMaterials([body], .25); expect(body.uvAnimationScrollXOffset).toBeCloseTo(.2);
      if (finish === "dispose") adapter.dispose?.();
      expect(passDisposed).not.toHaveBeenCalled(); expect(snapshotsDisposed).not.toHaveBeenCalled();
      if (finish === "submit-failure") fences[0]!.reject(new Error("색 복사도 나중에 실패"));
      else {
        fences[0]!.resolve(new Uint8Array(16).fill(255)); fences[1]!.resolve(new Uint8Array(16)); await Promise.resolve();
        expect(passDisposed).not.toHaveBeenCalled(); expect(snapshotsDisposed).not.toHaveBeenCalled();
        if (finish === "reject") fences[2]!.reject(new Error("법선 복사 실패")); else fences[2]!.resolve(new Uint8Array(16).fill(128));
      }
      await verification;
      expect(passDisposed).toHaveBeenCalledOnce(); expect(snapshotsDisposed).toHaveBeenCalledOnce();
      updateStudioMToonInstanceMaterials([body], .25); expect(body.uvAnimationScrollXOffset).toBeCloseTo(.3);
    } finally { adapter.dispose?.(); body.dispose(); outline.dispose(); geometry.dispose(); map.dispose(); mask.dispose(); }
  });
});
