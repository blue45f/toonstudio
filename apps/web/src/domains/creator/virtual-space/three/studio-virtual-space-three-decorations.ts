import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import type {
  StudioVirtualDecorationState,
  StudioVirtualDecorPlacement,
  StudioVirtualDecorType,
} from "../studio-virtual-space-customization";
import { disposeStudioThreeOwnedModel } from "./studio-virtual-space-three-asset-loader";
import { worldToThree } from "./studio-virtual-space-three-coords";

interface DecorGlbSpec {
  readonly url: string;
  readonly heightMeters: number;
}

const DECOR_GLB_SPECS: Readonly<Partial<Record<StudioVirtualDecorType, DecorGlbSpec>>> = Object.freeze({
  sofa: { url: "/assets/3d/refined-v8/sofa.glb", heightMeters: 1.05 },
  "drawing-desk": { url: "/assets/3d/refined-v8/desk.glb", heightMeters: 1.08 },
  "review-board": { url: "/assets/3d/refined-v8/blackboard.glb", heightMeters: 1.82 },
  bench: { url: "/assets/3d/neom_bench_prop.glb", heightMeters: 0.92 },
  lamp: { url: "/assets/3d/street_lamp.glb", heightMeters: 2.35 },
});

function snapGroupToFloor(group: THREE.Object3D): void {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty() && Number.isFinite(box.min.y)) {
    group.position.y -= box.min.y;
  }
}

function addPart(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createProceduralDecorMesh(type: StudioVirtualDecorType): THREE.Group {
  const group = new THREE.Group();
  group.name = `decor-procedural-${type}`;
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d6748, roughness: 0.72, metalness: 0.04 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.45, metalness: 0.14 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4d8b55, roughness: 0.85, metalness: 0 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88, metalness: 0.02 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xf59e0b, emissiveIntensity: 0.45, roughness: 0.35 });

  switch (type) {
    case "tree":
      addPart(group, new THREE.CylinderGeometry(0.11, 0.15, 0.95, 10), wood, [0, 0.475, 0], "trunk");
      addPart(group, new THREE.SphereGeometry(0.55, 14, 12), leaf, [0, 1.32, 0], "canopy");
      break;
    case "flower-bed":
      addPart(group, new THREE.BoxGeometry(1.1, 0.24, 0.6), wood, [0, 0.12, 0], "planter");
      addPart(group, new THREE.SphereGeometry(0.22, 10, 8), leaf, [-0.28, 0.34, 0], "bush-l");
      addPart(group, new THREE.SphereGeometry(0.24, 10, 8), accent, [0, 0.36, 0], "bloom-c");
      addPart(group, new THREE.SphereGeometry(0.22, 10, 8), leaf, [0.28, 0.34, 0], "bush-r");
      break;
    case "lamp":
      addPart(group, new THREE.CylinderGeometry(0.05, 0.08, 1.75, 10), fabric, [0, 0.875, 0], "pole");
      addPart(group, new THREE.CylinderGeometry(0.22, 0.28, 0.28, 12), glow, [0, 1.82, 0], "shade");
      break;
    case "bench":
      addPart(group, new THREE.BoxGeometry(1.3, 0.1, 0.48), wood, [0, 0.45, 0], "seat");
      addPart(group, new THREE.BoxGeometry(1.3, 0.36, 0.08), wood, [0, 0.68, -0.2], "back");
      addPart(group, new THREE.BoxGeometry(0.1, 0.45, 0.44), fabric, [-0.52, 0.225, 0], "leg-l");
      addPart(group, new THREE.BoxGeometry(0.1, 0.45, 0.44), fabric, [0.52, 0.225, 0], "leg-r");
      break;
    case "sofa":
      addPart(group, new THREE.BoxGeometry(1.65, 0.42, 0.78), fabric, [0, 0.21, 0], "base");
      addPart(group, new THREE.BoxGeometry(1.65, 0.48, 0.18), fabric, [0, 0.62, -0.3], "backrest");
      addPart(group, new THREE.BoxGeometry(0.18, 0.52, 0.78), fabric, [-0.75, 0.32, 0], "arm-l");
      addPart(group, new THREE.BoxGeometry(0.18, 0.52, 0.78), fabric, [0.75, 0.32, 0], "arm-r");
      break;
    case "drawing-desk":
      addPart(group, new THREE.BoxGeometry(1.4, 0.08, 0.78), wood, [0, 0.76, 0], "top");
      addPart(group, new THREE.BoxGeometry(0.08, 0.74, 0.7), fabric, [-0.62, 0.37, 0], "leg-l");
      addPart(group, new THREE.BoxGeometry(0.08, 0.74, 0.7), fabric, [0.62, 0.37, 0], "leg-r");
      addPart(group, new THREE.BoxGeometry(0.54, 0.04, 0.38), accent, [0, 0.82, 0], "tablet");
      break;
    case "bookshelf":
      addPart(group, new THREE.BoxGeometry(1.1, 1.72, 0.38), wood, [0, 0.86, 0], "cabinet");
      addPart(group, new THREE.BoxGeometry(0.92, 0.22, 0.28), accent, [0, 1.25, 0.05], "books");
      break;
    case "review-board":
      addPart(group, new THREE.BoxGeometry(1.5, 1.05, 0.08), fabric, [0, 1.32, 0], "frame");
      addPart(group, new THREE.BoxGeometry(1.36, 0.9, 0.09), glow, [0, 1.32, 0.01], "board");
      addPart(group, new THREE.CylinderGeometry(0.04, 0.04, 1.15, 8), fabric, [-0.55, 0.575, 0], "stand-l");
      addPart(group, new THREE.CylinderGeometry(0.04, 0.04, 1.15, 8), fabric, [0.55, 0.575, 0], "stand-r");
      break;
    case "rug":
      addPart(group, new THREE.BoxGeometry(1.8, 0.025, 1.25), accent, [0, 0.0125, 0], "rug-mat");
      break;
    default:
      addPart(group, new THREE.BoxGeometry(0.75, 0.72, 0.75), wood, [0, 0.36, 0], "pedestal");
      addPart(group, new THREE.BoxGeometry(0.42, 0.28, 0.42), accent, [0, 0.86, 0], "ornament");
      break;
  }

  snapGroupToFloor(group);
  return group;
}

function createProceduralFixtureMesh(fixture: StudioBuildPlacedFixture): THREE.Group {
  const group = new THREE.Group();
  group.name = `placed-fixture-${fixture.objectId}`;
  group.userData.fixtureObjectId = fixture.objectId;
  group.userData.fixtureKind = fixture.kind;

  const metal = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.55 });
  const warmGlow = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfbbf24, emissiveIntensity: 0.55, roughness: 0.3 });
  const board = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.05 });
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x38bdf8, emissiveIntensity: 0.32, roughness: 0.25 });

  if (fixture.kind === "light-switch") {
    addPart(group, new THREE.CylinderGeometry(0.18, 0.22, 0.06, 12), metal, [0, 0.03, 0], "lamp-base");
    addPart(group, new THREE.CylinderGeometry(0.035, 0.04, 1.55, 10), metal, [0, 0.8, 0], "lamp-stem");
    addPart(group, new THREE.CylinderGeometry(0.2, 0.28, 0.32, 14), warmGlow, [0, 1.68, 0], "lamp-shade");
  } else if (fixture.kind === "whiteboard") {
    addPart(group, new THREE.BoxGeometry(1.45, 0.98, 0.08), metal, [0, 1.34, 0], "wb-frame");
    addPart(group, new THREE.BoxGeometry(1.32, 0.86, 0.09), board, [0, 1.34, 0.01], "wb-surface");
    addPart(group, new THREE.BoxGeometry(0.07, 1.15, 0.07), metal, [-0.55, 0.575, 0], "wb-leg-l");
    addPart(group, new THREE.BoxGeometry(0.07, 1.15, 0.07), metal, [0.55, 0.575, 0], "wb-leg-r");
  } else {
    addPart(group, new THREE.BoxGeometry(0.5, 0.06, 0.34), metal, [0, 0.03, 0], "screen-base");
    addPart(group, new THREE.BoxGeometry(0.1, 1.18, 0.08), metal, [0, 0.62, 0], "screen-post");
    addPart(group, new THREE.BoxGeometry(1.42, 0.82, 0.07), metal, [0, 1.35, 0], "screen-frame");
    addPart(group, new THREE.BoxGeometry(1.32, 0.72, 0.08), screenMat, [0, 1.35, 0.01], "screen-panel");
  }

  snapGroupToFloor(group);
  return group;
}

function mapDecorPoint(
  placement: StudioVirtualDecorPlacement,
  decorations: StudioVirtualDecorationState,
  worldSize: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  const sourceWidth = decorations.layoutWidth && decorations.layoutWidth > 0 ? decorations.layoutWidth : worldSize.width;
  const sourceHeight = decorations.layoutHeight && decorations.layoutHeight > 0 ? decorations.layoutHeight : worldSize.height;
  return {
    x: (placement.x / sourceWidth) * worldSize.width,
    y: (placement.y / sourceHeight) * worldSize.height,
  };
}

export interface StudioThreeDecorationsController {
  readonly group: THREE.Group;
  readonly sync: (input: {
    readonly decorations?: StudioVirtualDecorationState;
    readonly placedFixtures?: readonly StudioBuildPlacedFixture[];
    readonly worldSize: { readonly width: number; readonly height: number };
  }) => void;
  readonly getPlacedCount: () => number;
  readonly dispose: () => void;
}

/**
 * 사용자의 장식(`decorations`)과 빌드 배치 고정물(`placedFixtures`)을 3D 씬에 바닥 스냅해 배치·동기화하고
 * 언마운트 시 모든 geometry/material을 안전하게 해제한다.
 */
export function createStudioThreeDecorationsController(
  scene: THREE.Scene,
  loader?: GLTFLoader | null,
): StudioThreeDecorationsController {
  const root = new THREE.Group();
  root.name = "studio-three-user-decorations";
  scene.add(root);

  const items = new Map<string, { readonly signature: string; readonly wrapper: THREE.Group }>();
  let disposed = false;
  let epoch = 0;

  const removeItem = (key: string) => {
    const existing = items.get(key);
    if (!existing) return;
    items.delete(key);
    existing.wrapper.removeFromParent();
    disposeStudioThreeOwnedModel(existing.wrapper);
    existing.wrapper.clear();
  };

  const tryUpgradeWithGlb = (
    key: string,
    placementType: StudioVirtualDecorType,
    wrapper: THREE.Group,
    expectedEpoch: number,
  ) => {
    if (!loader) return;
    const spec = DECOR_GLB_SPECS[placementType];
    if (!spec) return;
    loader.load(
      spec.url,
      (gltf) => {
        if (disposed || expectedEpoch !== epoch || items.get(key)?.wrapper !== wrapper) {
          disposeStudioThreeOwnedModel(gltf.scene);
          return;
        }
        const model = gltf.scene;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        const scaleFactor = spec.heightMeters / Math.max(0.05, size.y);
        model.scale.setScalar(scaleFactor);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);

        const oldChildren = [...wrapper.children];
        const trash = new THREE.Group();
        for (const child of oldChildren) trash.add(child);
        wrapper.add(model);
        disposeStudioThreeOwnedModel(trash);
        trash.clear();
      },
      undefined,
      () => {
        // GLB 로드 실패 시 프로시저럴 3D 가구 폴백을 그대로 유지한다.
      },
    );
  };

  return {
    group: root,
    sync({ decorations, placedFixtures, worldSize }) {
      if (disposed) return;
      const nextKeys = new Set<string>();
      epoch += 1;
      const currentEpoch = epoch;

      for (const placement of decorations?.placements ?? []) {
        const key = `decor:${placement.id}`;
        nextKeys.add(key);
        const mapped = mapDecorPoint(placement, decorations!, worldSize);
        const signature = `${placement.type}:${Math.round(mapped.x)}:${Math.round(mapped.y)}:${placement.rotation}:${placement.scale}`;
        const existing = items.get(key);
        if (existing?.signature === signature) continue;
        if (existing) removeItem(key);

        const wrapper = new THREE.Group();
        wrapper.name = `decor-item-${placement.id}`;
        wrapper.userData.decorId = placement.id;
        wrapper.userData.decorType = placement.type;
        const pos = worldToThree(mapped, 0);
        wrapper.position.set(pos.x, 0, pos.z);
        wrapper.rotation.y = THREE.MathUtils.degToRad(placement.rotation);
        const clampedScale = Math.min(1.5, Math.max(0.5, placement.scale || 1));
        wrapper.scale.setScalar(clampedScale);
        wrapper.add(createProceduralDecorMesh(placement.type));
        root.add(wrapper);
        items.set(key, { signature, wrapper });
        tryUpgradeWithGlb(key, placement.type, wrapper, currentEpoch);
      }

      for (const fixture of placedFixtures ?? []) {
        const key = `fixture:${fixture.objectId}`;
        nextKeys.add(key);
        const signature = `${fixture.kind}:${Math.round(fixture.point.x)}:${Math.round(fixture.point.y)}`;
        const existing = items.get(key);
        if (existing?.signature === signature) continue;
        if (existing) removeItem(key);

        const wrapper = new THREE.Group();
        wrapper.name = `fixture-item-${fixture.objectId}`;
        wrapper.userData.fixtureObjectId = fixture.objectId;
        const pos = worldToThree(fixture.point, 0);
        wrapper.position.set(pos.x, 0, pos.z);
        wrapper.add(createProceduralFixtureMesh(fixture));
        root.add(wrapper);
        items.set(key, { signature, wrapper });
      }

      for (const existingKey of [...items.keys()]) {
        if (!nextKeys.has(existingKey)) removeItem(existingKey);
      }
    },
    getPlacedCount: () => items.size,
    dispose() {
      if (disposed) return;
      disposed = true;
      epoch += 1;
      for (const key of [...items.keys()]) removeItem(key);
      root.removeFromParent();
      root.clear();
    },
  };
}
