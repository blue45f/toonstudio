import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { assertStudioBg3dThreeSixPassScene, captureStudioBg3dThreeSixPassPlanes,
  linearizeStudioBg3dSixPassDepth } from "./studio-bg3d-three-six-pass-capture";

describe("6패스 LT 분리 캡처", () => {
  it("원근 깊이의 near/far와 실제 거리, 평행 깊이를 별도로 보존한다", () => {
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 101);
    const deviceDepthAt11m = 101 / 100 - 101 / (100 * 11);
    const result = linearizeStudioBg3dSixPassDepth(Float32Array.from([0, deviceDepthAt11m, 1]), camera);
    expect(result.linearDepthNearMeters).toBe(1);
    expect(result.linearDepthFarMeters).toBe(101);
    expect(result.linearDepth[0]).toBe(0);
    expect(result.linearDepth[1]).toBeCloseTo(.1, 6);
    expect(result.linearDepth[2]).toBe(1);
    const ortho = linearizeStudioBg3dSixPassDepth(Float32Array.from([0, .25, 1]),
      new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 100));
    expect(Array.from(ortho.linearDepth)).toEqual([0, .25, 1]);
  });

  it("지원하지 않는 셰이더·알파 컷 재질을 실패로 알린다", () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.ShaderMaterial());
    scene.add(mesh);
    expect(() => assertStudioBg3dThreeSixPassScene(scene)).toThrow(/표준 재질/);
    mesh.material.dispose();
    scene.remove(mesh);
    const alpha = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ alphaTest: .5 }));
    scene.add(alpha);
    expect(() => assertStudioBg3dThreeSixPassScene(scene)).toThrow(/알파 컷/);
    alpha.geometry.dispose(); alpha.material.dispose(); mesh.geometry.dispose();
  });

  it("GPU 대기 중에도 원본 재질·fog·tone mapping을 복원하고 실패한 복사도 배수한다", async () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ color: "#806020" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    const fog = new THREE.Fog("white", 1, 10); scene.fog = fog;
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.7,
      shadowMap: { autoUpdate: false, needsUpdate: false } } as THREE.WebGLRenderer;
    let finishFirst: (pixels: Uint8ClampedArray) => void = () => {};
    const first = new Promise<Uint8ClampedArray>((resolve) => { finishFirst = resolve; });
    const captureColor = vi.fn().mockImplementationOnce(() => {
      expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(scene.fog).toBeNull();
      return first;
    }).mockImplementationOnce(() => {
      expect(mesh.material).toBeInstanceOf(THREE.ShadowMaterial);
      return Promise.reject(new Error("GPU copy failed"));
    });
    const pending = captureStudioBg3dThreeSixPassPlanes({ scene, renderer, camera: new THREE.PerspectiveCamera(),
      request: { width: 1, height: 1, includeDepth: true, includeSixPass: true, background: { color: "#ffffff", alpha: 0 } },
      captureColor });
    expect(mesh.material).toBe(material);
    expect(scene.fog).toBe(fog);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.7);
    expect(renderer.shadowMap).toEqual({ autoUpdate: false, needsUpdate: false });
    const expectedFailure = expect(pending).rejects.toThrow("GPU copy failed");
    finishFirst(new Uint8ClampedArray(4));
    await expectedFailure;
    expect(mesh.material).toBe(material);
    mesh.geometry.dispose(); material.dispose();
  });
});
