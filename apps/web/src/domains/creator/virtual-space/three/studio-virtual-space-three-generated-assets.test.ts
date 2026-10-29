import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { STUDIO_OFFICE_ENVIRONMENT_KEYS, studioOfficeEnvironmentManifest } from "../studio-virtual-space-office-environments";
import { studioWorldInteractions } from "../studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "../studio-virtual-space-world-pathfinding";
import { createStudioThreeGlbLoader, loadStudioThreeModelProps } from "./studio-virtual-space-three-asset-loader";
import { STUDIO_THREE_GENERATED_ASSETS, studioThreeGeneratedProps, studioThreeManifestProps } from "./studio-virtual-space-three-generated-assets";
import { buildStudioThreeWorldArchitecture, studioThreeRoomSigns } from "./studio-virtual-space-three-world-layout";

const PUBLIC_ROOT = resolve(import.meta.dirname, "../../../../../public");

interface CompressedView {
  readonly extensions?: { readonly EXT_meshopt_compression?: {
    readonly byteOffset?: number; readonly byteLength: number; readonly byteStride: number;
    readonly count: number; readonly mode: string; readonly filter?: string;
  } };
}

describe("실생성 Tripo·Varco 3D 장비 연결", () => {
  it("실제 바이너리의 SHA·크기·필수 codec을 확인하고 Meshopt 데이터를 복호화한다", async () => {
    const decoder = createStudioThreeGlbLoader().meshoptDecoder;
    if (!decoder) throw new Error("Meshopt decoder가 연결되지 않았습니다.");
    await decoder.ready;
    for (const asset of STUDIO_THREE_GENERATED_ASSETS) {
      const bytes = readFileSync(resolve(PUBLIC_ROOT, asset.url.slice(1)));
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(bytes.byteLength).toBeGreaterThan(900_000);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
      const jsonLength = bytes.readUInt32LE(12);
      const document: { asset: { generator?: string }; extensionsRequired?: string[]; bufferViews: CompressedView[]; skins?: unknown[]; animations?: unknown[] } = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
      expect(document.asset.generator ?? "").not.toContain("Worldbuild Pipeline");
      expect(document.extensionsRequired).toContain("EXT_meshopt_compression");
      const compressed = document.bufferViews.flatMap((view) => view.extensions?.EXT_meshopt_compression ? [view.extensions.EXT_meshopt_compression] : []);
      expect(compressed.length).toBeGreaterThan(0);
      const binary = bytes.subarray(28 + jsonLength);
      for (const view of compressed) {
        const output = new Uint8Array(view.count * view.byteStride);
        const offset = view.byteOffset ?? 0;
        expect(() => decoder.decodeGltfBuffer(output, view.count, view.byteStride, binary.subarray(offset, offset + view.byteLength), view.mode, view.filter ?? "NONE")).not.toThrow();
      }
      if (asset.animated) {
        expect(document.skins?.length).toBeGreaterThan(0);
        expect(document.animations?.length).toBeGreaterThan(0);
      }
    }
  });

  it.each([false, true])("본사와 캠퍼스 모두 실생성 모델을 해당 방 내부에 배치한다(personal=%s)", (personal) => {
    for (const manifest of [studioVirtualToonHqManifest(personal), studioVirtualCampusManifest(personal)]) {
      const placements = studioThreeGeneratedProps(manifest);
      expect(placements).toHaveLength(STUDIO_THREE_GENERATED_ASSETS.length);
      for (const prop of placements) {
        expect(manifest.rooms.some((room) => prop.x >= room.x && prop.x <= room.x + room.width && prop.y >= room.y && prop.y <= room.y + room.height)).toBe(true);
      }
    }
  });

  it("본사 건축·명판·워크스테이션은 manifest의 방 좌표를 따르고 캠퍼스 건축은 유지한다", () => {
    const hq = studioVirtualToonHqManifest(false);
    const scene = new THREE.Scene();
    const world = buildStudioThreeWorldArchitecture(scene, hq);
    expect(world.floorMesh.name).toBe("manifest-walkable-floor");
    expect(hq.interactions).toHaveLength(0);
    expect(world.workstationRings.length).toBeGreaterThan(0);
    expect(world.workstationRings.map((ring) => ring.id)).toEqual(studioWorldInteractions(hq).map((interaction) => interaction.id));
    expect(studioThreeManifestProps(hq)).toHaveLength(studioWorldInteractions(hq).length);
    expect(studioThreeRoomSigns(hq).map((sign) => sign.roomId)).toEqual(hq.rooms.map((room) => room.id));
    for (const room of hq.rooms) expect(scene.getObjectByName(`room-floor-${room.id}`)).toBeDefined();
    const campus = buildStudioThreeWorldArchitecture(new THREE.Scene(), studioVirtualCampusManifest(false));
    expect(campus.floorMesh.name).toBe("campus-walkable-floor");
    expect(campus.waterMeshes).toHaveLength(2);
  });

  it.each(STUDIO_OFFICE_ENVIRONMENT_KEYS)("%s의 실제 생성 모델은 기존 가구 영역에 두고 스폰·좌석·도구를 막지 않는다", (key) => {
    const manifest = studioOfficeEnvironmentManifest(key);
    if (!manifest) throw new Error(`새 환경이 없습니다: ${key}`);
    const placements = studioThreeGeneratedProps(manifest);
    expect(placements.length).toBeGreaterThanOrEqual(1);
    for (const prop of placements) {
      expect(STUDIO_THREE_GENERATED_ASSETS.some((asset) => asset.url === prop.url)).toBe(true);
      expect(studioWorldCanOccupy(manifest, prop)).toBe(false);
      const targets = [...manifest.spawns.map((spawn) => spawn.point), ...manifest.interactions.map((item) => item.point), ...(manifest.interactionSlots ?? []).flatMap((slot) => [slot.anchorPoint, slot.approachPoint, slot.exitPoint])];
      for (const target of targets) expect(Math.hypot(prop.x - target.x, prop.y - target.y)).toBeGreaterThan(64);
    }
  });

  it("같은 URL은 한 번 읽고 내장 모션을 재생하며 해제 후 장면에서 제거한다", async () => {
    const loader = createStudioThreeGlbLoader();
    const gltf = await loader.parseAsync(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] }), "");
    gltf.scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    gltf.animations.push(new THREE.AnimationClip("idle", 1, [new THREE.NumberKeyframeTrack(".rotation[y]", [0, 1], [0, 0.5])]));
    const load = vi.spyOn(loader, "loadAsync").mockResolvedValue(gltf);
    const scene = new THREE.Scene();
    const props = ["a", "b"].map((id) => ({ id, url: "/same.glb", x: 100, y: 100, heightMeters: 1, animated: true }));
    const controller = loadStudioThreeModelProps(scene, loader, props, () => false);
    await vi.waitFor(() => expect(scene.children).toHaveLength(2));
    expect(load).toHaveBeenCalledTimes(1);
    controller.update(0.1);
    expect(scene.children[0]?.children[0]?.rotation.y).toBeGreaterThan(0);
    controller.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("동작 줄이기 설정은 한 번 조회하고 실행 중 변경에도 원본 모션을 정지·재개한다", async () => {
    const query = { matches: true };
    const matchMedia = vi.fn(() => query);
    vi.stubGlobal("window", { matchMedia });
    try {
      const loader = createStudioThreeGlbLoader();
      const gltf = await loader.parseAsync(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] }), "");
      gltf.scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      const track = new THREE.NumberKeyframeTrack(".rotation[y]", [0, 1], [0, 0.5]);
      gltf.animations.push(new THREE.AnimationClip("idle", 1, [track]));
      const originalValues = Array.from(track.values);
      vi.spyOn(loader, "loadAsync").mockResolvedValue(gltf);
      const scene = new THREE.Scene();
      const controller = loadStudioThreeModelProps(scene, loader, [{ id: "idle", url: "/idle.glb", x: 100, y: 100, heightMeters: 1, animated: true }], () => false);
      await vi.waitFor(() => expect(scene.children).toHaveLength(1));
      const model = scene.children[0]?.children[0];
      if (!model) throw new Error("idle 캐릭터가 없습니다.");
      controller.update(0.1);
      expect(model.rotation.y).toBe(0);
      query.matches = false;
      controller.update(0.1);
      expect(model.rotation.y).toBeGreaterThan(0);
      const paused = model.rotation.y;
      query.matches = true;
      controller.update(0.1);
      expect(model.rotation.y).toBe(paused);
      expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(prefers-reduced-motion: reduce)");
      expect(Array.from(track.values)).toEqual(originalValues);
      controller.dispose();
    } finally { vi.unstubAllGlobals(); }
  });

  it("복제한 SkinnedMesh의 개별 Skeleton과 bone texture를 모두 한 번씩 해제한다", async () => {
    const loader = createStudioThreeGlbLoader();
    const gltf = await loader.parseAsync(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] }), "");
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const count = geometry.getAttribute("position").count;
    const weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex += 1) weights[vertex * 4] = 1;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    gltf.scene.add(mesh);
    vi.spyOn(loader, "loadAsync").mockResolvedValue(gltf);
    const scene = new THREE.Scene();
    const props = ["rig-a", "rig-b"].map((id) => ({ id, url: "/same-rig.glb", x: 100, y: 100, heightMeters: 1 }));
    const controller = loadStudioThreeModelProps(scene, loader, props, () => false);
    await vi.waitFor(() => expect(scene.children).toHaveLength(2));
    const clones: THREE.SkinnedMesh[] = [];
    scene.traverse((child) => { if (child instanceof THREE.SkinnedMesh) clones.push(child); });
    expect(clones).toHaveLength(2);
    expect(new Set(clones.map((clone) => clone.skeleton)).size).toBe(2);
    const receipts = clones.map((clone) => {
      expect(clone.skeleton).not.toBe(mesh.skeleton);
      clone.skeleton.computeBoneTexture();
      const texture = clone.skeleton.boneTexture;
      if (!texture) throw new Error("렌더링용 bone texture가 없습니다.");
      return { skeleton: clone.skeleton, dispose: vi.spyOn(clone.skeleton, "dispose"), textureDispose: vi.spyOn(texture, "dispose") };
    });
    controller.dispose();
    controller.dispose();
    for (const receipt of receipts) {
      expect(receipt.dispose).toHaveBeenCalledTimes(1);
      expect(receipt.textureDispose).toHaveBeenCalledTimes(1);
      expect(receipt.skeleton.boneTexture).toBeNull();
    }
  });

  it("모델 실패는 관측 가능하게 알리고 기존 공간을 보존하며 자동 재시도하지 않는다", async () => {
    const loader = createStudioThreeGlbLoader();
    const load = vi.spyOn(loader, "loadAsync").mockRejectedValue(new Error("test load failure"));
    const scene = new THREE.Scene();
    const base = new THREE.Group();
    scene.add(base);
    const onError = vi.fn();
    const controller = loadStudioThreeModelProps(scene, loader, [{ id: "missing", url: "/missing.glb", x: 10, y: 10, heightMeters: 1 }], () => false, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith("/missing.glb"));
    expect(scene.children).toEqual([base]);
    expect(load).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});
