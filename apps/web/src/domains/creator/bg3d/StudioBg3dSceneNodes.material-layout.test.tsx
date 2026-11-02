// @vitest-environment jsdom
// 실제 R3F 호스트의 재질 수명을 검사한다. GPU 렌더러만 대체하고 장면·맵 캐시는 정본을 쓴다.
import { createRoot, extend } from "@react-three/fiber";
import { act } from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BgPrimitiveMesh } from "./StudioBg3dSceneNodes";
import {
  clearStudioBg3dCc0PbrTextureCache,
  loadStudioBg3dCc0PbrTextureSet,
  setStudioBg3dCc0PbrTextureFactoryForTest,
} from "./studio-bg3d-cc0-pbr-texture-loader";
import { StudioBg3dPrimitiveGeometryPool } from "./studio-bg3d-render-optimization";
import { buildStudioBg3dSurfaceMaterialOverride } from "./studio-bg3d-surface-material-catalog";

import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { StudioBg3dMaterialOverride } from "./studio-bg3d-scene-document";

extend({ Group: THREE.Group, Mesh: THREE.Mesh, MeshStandardMaterial: THREE.MeshStandardMaterial });

const NATIVE_ID = "emaceart-plasticine-01-native-8k";
const OTHER_NATIVE_ID = "emaceart-plasticine-02-native-8k";
const GODOT_ID = "emaceart-plasticine-01-godot-2k";
const AO_ID = "polyhaven-wood-floor";
const MAP_SLOTS = ["map", "roughnessMap", "metalnessMap", "normalMap", "aoMap"] as const;
const noop = () => undefined;

function override(id: string): StudioBg3dMaterialOverride {
  const value = buildStudioBg3dSurfaceMaterialOverride(id);
  if (!value) throw new Error(`실제 표면 재질이 필요합니다: ${id}`);
  return value;
}

function primitive(materialOverride?: StudioBg3dMaterialOverride): BgPrimitive {
  return {
    id: "material-lifetime", kind: "box", position: [0, 0, 0], rotation: [0, 0, 0],
    scale: [1, 1, 1], color: "#9a6c42", ...(materialOverride ? { materialOverride } : {}),
  };
}

function fakeRenderer(canvas: HTMLCanvasElement) {
  return {
    domElement: canvas, render: noop, setSize: noop, setPixelRatio: noop,
    setClearAlpha: noop, setClearColor: noop, getPixelRatio: () => 1,
    getSize: (target: THREE.Vector2) => target.set(100, 100),
    dispose: noop, forceContextLoss: noop, compile: noop, setAnimationLoop: noop,
    xr: { enabled: false, isPresenting: false, addEventListener: noop, removeEventListener: noop, setAnimationLoop: noop },
    outputColorSpace: THREE.SRGBColorSpace, toneMapping: THREE.NoToneMapping,
  };
}

async function mountScene() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const root = createRoot(canvas);
  const pool = new StudioBg3dPrimitiveGeometryPool();
  const groupRef: { current: THREE.Group | null } = { current: null };
  const registerRef = (_id: string, value: THREE.Group | null) => { groupRef.current = value; };
  await root.configure({
    gl: fakeRenderer(canvas), size: { width: 100, height: 100, top: 0, left: 0 },
    frameloop: "never", dpr: 1, camera: { position: [0, 0, 8] },
  });

  return {
    async render(prim: BgPrimitive) {
      await act(async () => {
        root.render(<BgPrimitiveMesh prim={prim} geometryPool={pool} lineArt={false} showEdges={false}
          selected={false} onSelect={noop} onSurfacePick={() => false} registerRef={registerRef} />);
      });
      const mesh = groupRef.current?.children.find((child) => child instanceof THREE.Mesh);
      if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshStandardMaterial)) {
        throw new Error("R3F에 연결된 실제 프리미티브 표준 재질이 필요합니다.");
      }
      return { mesh, material: mesh.material };
    },
    async dispose() {
      await act(async () => { root.unmount(); });
      pool.dispose();
      canvas.remove();
    },
  };
}

describe("프리미티브 PBR 맵 슬롯의 재질 수명", () => {
  const textures: THREE.Texture[] = [];

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    textures.length = 0;
    setStudioBg3dCc0PbrTextureFactoryForTest((url) => {
      const texture = new THREE.Texture();
      texture.name = url;
      vi.spyOn(texture, "dispose");
      textures.push(texture);
      return texture;
    });
  });

  afterEach(() => {
    setStudioBg3dCc0PbrTextureFactoryForTest(null);
    clearStudioBg3dCc0PbrTextureCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function expectSharedTexturesAlive() {
    for (const texture of textures) expect(texture.dispose).not.toHaveBeenCalled();
  }

  it("8K 해제·재적용 시 재질만 교체하고 이전 네 맵과 캐시·geometry는 보존한다", async () => {
    const scene = await mountScene();
    try {
      const first = await scene.render(primitive(override(NATIVE_ID)));
      const maps = MAP_SLOTS.map((slot) => first.material[slot]);
      expect(maps.filter((texture) => texture !== null)).toHaveLength(4);
      const disposeMaterial = vi.spyOn(first.material, "dispose");
      const disposeGeometry = vi.spyOn(first.mesh.geometry, "dispose");

      const cleared = await scene.render(primitive());
      expect(cleared.mesh).toBe(first.mesh);
      expect(cleared.mesh.geometry).toBe(first.mesh.geometry);
      expect(cleared.material).not.toBe(first.material);
      expect(MAP_SLOTS.map((slot) => cleared.material[slot])).toEqual([null, null, null, null, null]);
      expect(MAP_SLOTS.map((slot) => first.material[slot])).toEqual(maps);
      expect(disposeMaterial).toHaveBeenCalledOnce();
      expect(disposeGeometry).not.toHaveBeenCalled();
      expectSharedTexturesAlive();

      const disposeCleared = vi.spyOn(cleared.material, "dispose");
      const reapplied = await scene.render(primitive(override(NATIVE_ID)));
      expect(reapplied.material).not.toBe(cleared.material);
      expect(reapplied.material).not.toBe(first.material);
      expect(reapplied.mesh).toBe(first.mesh);
      MAP_SLOTS.forEach((slot, index) => { expect(reapplied.material[slot]).toBe(maps[index]); });
      expect(disposeCleared).toHaveBeenCalledOnce();
      expect(disposeGeometry).not.toHaveBeenCalled();
      expectSharedTexturesAlive();
    } finally { await scene.dispose(); }
  });

  it("같은 슬롯의 다른 8K 맵·색·거칠기는 재사용하고 기존 topology 갱신은 유지한다", async () => {
    const scene = await mountScene();
    try {
      const first = await scene.render(primitive(override(NATIVE_ID)));
      const originalMap = first.material.map;
      const version = first.material.version;
      const disposeMaterial = vi.spyOn(first.material, "dispose");
      const changed = { ...override(OTHER_NATIVE_ID), color: "#5a72a4", roughness: 0.23 };
      const next = await scene.render(primitive(changed));
      const expected = loadStudioBg3dCc0PbrTextureSet(OTHER_NATIVE_ID);
      if (!expected) throw new Error("동일 네 채널의 다른 8K 재질이 필요합니다.");
      expect(next.material).toBe(first.material);
      expect(next.material.map).not.toBe(originalMap);
      expect(next.material.map).toBe(expected.baseColorMap);
      expect(next.material.roughnessMap).toBe(expected.roughnessMap);
      expect(next.material.metalnessMap).toBe(expected.metalnessMap);
      expect(next.material.normalMap).toBe(expected.normalMap);
      expect(next.material.color.getHexString()).toBe("5a72a4");
      expect(next.material.roughness).toBe(0.23);
      expect(next.material.version).toBe(version);
      expect(disposeMaterial).not.toHaveBeenCalled();

      const doubleSided = await scene.render(primitive({ ...changed, doubleSided: true }));
      expect(doubleSided.material).toBe(first.material);
      expect(doubleSided.material.side).toBe(THREE.DoubleSide);
      expect(doubleSided.material.version).toBe(version + 1);
      expectSharedTexturesAlive();
    } finally { await scene.dispose(); }
  });

  it("baseColor가 남아도 8K→2K의 금속성 슬롯 해제는 이전 재질을 변경하지 않는다", async () => {
    const scene = await mountScene();
    try {
      const first = await scene.render(primitive(override(NATIVE_ID)));
      const metalness = first.material.metalnessMap;
      expect(metalness).not.toBeNull();
      const disposeMaterial = vi.spyOn(first.material, "dispose");
      const next = await scene.render(primitive(override(GODOT_ID)));
      expect(next.material).not.toBe(first.material);
      expect(next.material.map).not.toBeNull();
      expect(next.material.metalnessMap).toBeNull();
      expect(first.material.metalnessMap).toBe(metalness);
      expect(disposeMaterial).toHaveBeenCalledOnce();
      expectSharedTexturesAlive();
    } finally { await scene.dispose(); }
  });

  it.each([[GODOT_ID, AO_ID], [AO_ID, GODOT_ID]])("AO 슬롯 전환 %s→%s도 재질 수명을 분리한다", async (from, to) => {
    const scene = await mountScene();
    try {
      const first = await scene.render(primitive(override(from)));
      const previousAo = first.material.aoMap;
      const disposeMaterial = vi.spyOn(first.material, "dispose");
      const next = await scene.render(primitive(override(to)));
      expect(first.material.aoMap).toBe(previousAo);
      expect(next.material.aoMap === null).not.toBe(previousAo === null);
      expect(next.material).not.toBe(first.material);
      expect(disposeMaterial).toHaveBeenCalledOnce();
      expectSharedTexturesAlive();
    } finally { await scene.dispose(); }
  });
});
