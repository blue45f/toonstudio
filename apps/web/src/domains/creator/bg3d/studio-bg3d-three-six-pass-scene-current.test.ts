import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createStudioBg3dThreeSixPassSceneGuard } from "./studio-bg3d-three-six-pass-scene-current";

function fixture() {
  const scene = new THREE.Scene();
  const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: "#806020", map: texture });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  mesh.morphTargetInfluences = [0]; scene.add(mesh);
  const light = new THREE.DirectionalLight(); scene.add(light);
  const renderer = { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace } as THREE.WebGLRenderer;
  material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -1)];
  const assertCurrent = createStudioBg3dThreeSixPassSceneGuard(scene, renderer);
  return { scene, texture, material, mesh, light, renderer, assertCurrent,
    dispose: () => { texture.dispose(); material.dispose(); mesh.geometry.dispose(); } };
}

describe("순차 6패스의 작화 상태 경계", () => {
  it.each([
    ["이동", (f: ReturnType<typeof fixture>) => { f.mesh.position.x = 1; }],
    ["재질 색상", (f: ReturnType<typeof fixture>) => { f.material.color.set("#ffffff"); }],
    ["재질 바인딩", (f: ReturnType<typeof fixture>) => { f.mesh.material = f.material.clone(); }],
    ["형상 업로드", (f: ReturnType<typeof fixture>) => { f.mesh.geometry.attributes.position.needsUpdate = true; }],
    ["morph", (f: ReturnType<typeof fixture>) => { if (f.mesh.morphTargetInfluences) f.mesh.morphTargetInfluences[0] = .5; }],
    ["텍스처 업로드", (f: ReturnType<typeof fixture>) => { f.texture.needsUpdate = true; }],
    ["단면 평면", (f: ReturnType<typeof fixture>) => { if (f.material.clippingPlanes) f.material.clippingPlanes[0].constant = 2; }],
    ["광원 색상", (f: ReturnType<typeof fixture>) => { f.light.color.set("red"); }],
    ["광량", (f: ReturnType<typeof fixture>) => { f.light.intensity = .2; }],
    ["그림자 카메라", (f: ReturnType<typeof fixture>) => { f.light.shadow.camera.far = 90; }],
    ["배경", (f: ReturnType<typeof fixture>) => { f.scene.background = new THREE.Color("red"); }],
    ["안개", (f: ReturnType<typeof fixture>) => { f.scene.fog = new THREE.Fog("red", 1, 10); }],
    ["렌더 노출", (f: ReturnType<typeof fixture>) => { f.renderer.toneMappingExposure = 2; }],
    ["계층 추가", (f: ReturnType<typeof fixture>) => { f.scene.add(new THREE.Group()); }],
  ] as const)("%s 변경을 혼합 출력으로 반환하지 않는다", (_name, mutate) => {
    const f = fixture();
    expect(f.assertCurrent).not.toThrow(); mutate(f);
    expect(f.assertCurrent).toThrow(/장면이 변경/);
    if (f.mesh.material !== f.material) f.mesh.material.dispose();
    f.dispose();
  });

  it("렌더러의 파생 행렬·shadow map·listener 갱신은 새 작화 변경으로 오인하지 않는다", () => {
    const f = fixture();
    f.scene.updateMatrixWorld(true); f.texture.updateMatrix();
    f.light.shadow.matrix.makeTranslation(1, 2, 3);
    f.light.shadow.needsUpdate = false;
    f.material.addEventListener("dispose", () => {});
    expect(f.assertCurrent).not.toThrow(); f.dispose();
  });
});
