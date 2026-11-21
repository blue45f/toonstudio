import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { HeroBg3dDeliveryContext } from "../../../bg3d/studio-bg3d-hero-tier-selector";
import { studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { createStudioThreeGlbLoader, disposeStudioThreeOwnedModel } from "../studio-virtual-space-three-asset-loader";
import { worldToThree } from "../studio-virtual-space-three-coords";
import {
  loadVirtualThreeHeroSceneSource,
  loadVirtualThreeThemeModelSource,
  type VirtualThreeVerifiedThemeModelSource,
} from "./virtual-three-theme-model-source";
import { VIRTUAL_THREE_THEME_MODEL_IDS } from "./virtual-three-theme-models";
import { createVirtualThreeThemePlacementPlanner, virtualThreeThemeModelDisplaySize } from "./virtual-three-theme-placement";
import type { VirtualThreeAssetRecipeTheme, VirtualThreeHeroSceneTheme } from "./virtual-three-theme-types";

export interface VirtualThreeStagedSourceInput {
  readonly id: string;
  readonly blobBytes: number;
  readonly bufferCopyBytes: number;
  readonly decodedGeometryBytes: number;
  readonly decodedImageBytes: number;
  readonly pendingDecode?: boolean;
}
export interface VirtualThreeThemeModelStage {
  readonly sourceInputs: readonly VirtualThreeStagedSourceInput[];
  readonly assertCurrent: () => void;
  readonly update: (deltaSeconds: number) => void;
  readonly dispose: () => void;
}
interface LoadedSource {
  readonly verified: VirtualThreeVerifiedThemeModelSource;
  readonly scene: THREE.Group;
  readonly animations: readonly THREE.AnimationClip[];
}
function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("3D 테마 준비가 취소됐습니다.", "AbortError");
}
function normalize(model: THREE.Object3D, display: ReturnType<typeof virtualThreeThemeModelDisplaySize>): THREE.Vector3 {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) throw new TypeError("3D 모델의 실제 경계를 읽을 수 없습니다.");
  const extent = display.axis === "ground-extent" ? Math.max(size.x, size.z) : size.y;
  model.scale.multiplyScalar(display.meters / extent);
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z));
  model.updateMatrixWorld(true);
  return box.getSize(size);
}

/** 기존 배치가 없을 때만 소품 footprint의 절반 간격을 목표로 추가 후보를 찾는다. */
function tabletopAxisCandidates(min: number, max: number, extent: number): number[] {
  const first = min + extent / 2 + 0.02, last = max - extent / 2 - 0.02;
  if (last < first) return [];
  if (last === first) return [first];
  const intervals = Math.min(32, Math.max(1, Math.ceil((last - first) / (extent / 2))));
  return Array.from({ length: intervals + 1 }, (_, index) => THREE.MathUtils.lerp(first, last, index / intervals));
}

/** 탁상 소품은 실제 테이블의 위를 향한 표면 교차점에만 놓는다. */
function tabletopPosition(tables: readonly THREE.Group[], size: THREE.Vector3, occupied: THREE.Box3[]): THREE.Vector3 {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  // 모든 테이블의 기존 3×3 배치를 먼저 보존한 뒤에만 제한된 추가 격자를 쓴다.
  for (const detailed of [false, true]) for (const table of tables) {
    table.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(table);
    const columns = detailed ? tabletopAxisCandidates(box.min.x, box.max.x, size.x)
      : [0.25, 0.5, 0.75].map((column) => THREE.MathUtils.lerp(box.min.x, box.max.x, column));
    const rows = detailed ? tabletopAxisCandidates(box.min.z, box.max.z, size.z)
      : [0.3, 0.5, 0.7].map((row) => THREE.MathUtils.lerp(box.min.z, box.max.z, row));
    for (const z of rows) for (const x of columns) {
      ray.set(new THREE.Vector3(x, box.max.y + 0.5, z), down);
      for (const hit of ray.intersectObject(table, true)) {
        if (!hit.face) continue;
        normal.copy(hit.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
        if (normal.y < 0.8) continue;
        const position = new THREE.Vector3(x, hit.point.y + 0.012, z);
        const bounds = new THREE.Box3(new THREE.Vector3(x - size.x / 2 - 0.02, position.y, z - size.z / 2 - 0.02), new THREE.Vector3(x + size.x / 2 + 0.02, position.y + size.y, z + size.z / 2 + 0.02));
        if (bounds.min.x < box.min.x || bounds.max.x > box.max.x || bounds.min.z < box.min.z || bounds.max.z > box.max.z || occupied.some((other) => other.intersectsBox(bounds))) continue;
        // 중앙만 맞고 모서리가 구멍·빈 공간에 뜨는 얇은 상판을 거부한다.
        const supported = [-1, 1].every((sideX) => [-1, 1].every((sideZ) => {
          ray.set(new THREE.Vector3(x + sideX * size.x / 2, box.max.y + 0.5, z + sideZ * size.z / 2), down);
          return ray.intersectObject(table, true).some((corner) => {
            if (!corner.face || Math.abs(corner.point.y - hit.point.y) > 0.025) return false;
            normal.copy(corner.face.normal).applyMatrix3(normalMatrix.getNormalMatrix(corner.object.matrixWorld)).normalize();
            return normal.y >= 0.8;
          });
        }));
        if (!supported) continue;
        occupied.push(bounds);
        return position;
      }
    }
  }
  throw new Error("탁상 소품을 원본 테이블의 안전한 표면에 배치할 수 없습니다.");
}

/** 검증된 바이트를 한 소스씩 준비한다. stage는 controller commit 전에는 실제 장면에 붙지 않는다. */
export async function prepareVirtualThreeThemeModels(options: {
  readonly scene: THREE.Scene;
  readonly occupiedScene?: THREE.Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly theme: VirtualThreeAssetRecipeTheme;
  readonly signal: AbortSignal;
  readonly onProgress: (loaded: number, total: number) => void;
  /** GLTFParser가 큰 이미지·GPU 자원을 준비하기 전에 누적 peak 상한을 검사한다. */
  readonly onBeforeDecode?: (sources: readonly VirtualThreeStagedSourceInput[]) => void;
  readonly onAssetError?: (url: string, kind: "model") => void;
}): Promise<VirtualThreeThemeModelStage> {
  const { scene, manifest, theme, signal } = options;
  const loader = createStudioThreeGlbLoader();
  const sources = new Map<string, LoadedSource>();
  const sourceInputs: VirtualThreeStagedSourceInput[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  const instances = new Set<THREE.InstancedMesh>();
  const roots: THREE.Group[] = [], tables: THREE.Group[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    const failures: unknown[] = [];
    const release = (action: () => void) => { try { action(); } catch (error) { failures.push(error); } };
    for (const mixer of mixers) release(() => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); });
    for (const skeleton of skeletons) release(() => skeleton.dispose());
    for (const instance of instances) release(() => instance.dispose());
    for (const root of roots) root.removeFromParent();
    for (const source of sources.values()) release(() => disposeStudioThreeOwnedModel(source.scene));
    if (failures.length) throw new AggregateError(failures, "3D 테마 모델 해제에 실패했습니다.");
  };
  try {
    for (const id of theme.modelAssetIds) {
      assertActive(signal);
      const verified = await loadVirtualThreeThemeModelSource(id, signal);
      assertActive(signal);
      if (verified.metrics.undeterminedImageDimensions !== 0) throw new TypeError("3D 테마 이미지의 decode 크기를 확인할 수 없습니다.");
      // 앞서 parse한 원본들도 아직 clone/장면 설치 전이므로 GPU 준비 예약을 계속 포함한다.
      options.onBeforeDecode?.([...sourceInputs.map((source) => ({ ...source, pendingDecode: true })), { id, blobBytes: verified.byteLength, bufferCopyBytes: verified.byteLength,
        decodedGeometryBytes: verified.metrics.estimatedDecodedGeometryBytes, decodedImageBytes: verified.metrics.estimatedDecodedImageBytes, pendingDecode: true }]);
      // GLTFParser의 BIN view와 Blob이 함께 살아 있는 보수적 peak를 기록한다.
      const bytes = await verified.blob.arrayBuffer();
      assertActive(signal);
      let gltf: Awaited<ReturnType<typeof loader.parseAsync>>;
      try { gltf = await loader.parseAsync(bytes, ""); }
      catch (error) { options.onAssetError?.(id, "model"); throw error; }
      // 취소가 parse 중 발생해도 결과 root를 소유한 뒤 finally 경로에서 해제한다.
      sources.set(id, { verified, scene: gltf.scene, animations: gltf.animations });
      sourceInputs.push({ id, blobBytes: verified.byteLength, bufferCopyBytes: bytes.byteLength,
        decodedGeometryBytes: verified.metrics.estimatedDecodedGeometryBytes, decodedImageBytes: verified.metrics.estimatedDecodedImageBytes });
      assertActive(signal);
      verified.assertCurrent();
      options.onProgress(sources.size, theme.modelAssetIds.length);
    }
    const planner = createVirtualThreeThemePlacementPlanner(manifest, options.occupiedScene);
    const tabletopBounds: THREE.Box3[] = [];
    for (const role of theme.layoutRoles) for (let index = 0; index < role.count; index += 1) {
      assertActive(signal);
      const source = sources.get(role.modelAssetId);
      if (!source) throw new TypeError("3D 테마 역할의 검증된 모델이 없습니다.");
      const model = clone(source.scene);
      const root = new THREE.Group();
      const normalization = new THREE.Group();
      root.name = `theme-model-${role.id}-${index}`;
      // 내장 animation이 원본 node transform을 바꿔도 표시 정규화는 별도 부모가 보존한다.
      normalization.add(model); root.add(normalization); roots.push(root);
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
        if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
        if (node instanceof THREE.InstancedMesh) instances.add(node);
      });
      // 지정 차량의 표시 부모만 돌려 차고의 가로 긴 비보행 영역에 배치한다.
      if (role.kind === "focal-object" && role.modelAssetId === VIRTUAL_THREE_THEME_MODEL_IDS.car) normalization.rotation.y = Math.PI / 2;
      const size = normalize(normalization, virtualThreeThemeModelDisplaySize(role.kind, role.modelAssetId));
      if (role.kind === "tabletop") root.position.copy(tabletopPosition(tables, size, tabletopBounds));
      else {
        const placement = planner.place(size, role.kind);
        root.position.copy(placement.position);
        scene.traverse((node) => {
          if (node.userData.sourceFootprintId === placement.sourceFootprintId && node.userData.replaceableByThemeAsset === true) node.visible = false;
        });
      }
      scene.add(root);
      if (role.kind === "workstation" && /table/iu.test(role.modelAssetId)) tables.push(root);
      if (source.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        for (const clip of source.animations) mixer.clipAction(clip).play();
        mixer.update(0); mixers.push(mixer);
      }
    }
    const assertCurrent = () => {
      assertActive(signal);
      if (disposed) throw new Error("이미 해제된 3D 테마 모델입니다.");
      for (const source of sources.values()) source.verified.assertCurrent();
    };
    assertCurrent();
    return { sourceInputs, assertCurrent, dispose: cleanup, update(delta) {
      if (disposed) return;
      for (const mixer of mixers) mixer.update(Math.min(0.1, Math.max(0, delta)));
    } };
  } catch (error) {
    try { cleanup(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "3D 테마 준비와 해제에 실패했습니다.", { cause: cleanupError }); }
    throw error;
  }
}

/**
 * Hero 3D BG 6씬(Desktop 8노드 / Mobile 4노드)을 `createStudioThreeGlbLoader()`(MeshoptDecoder 내장)로
 * 파싱해 바닥 정렬(Y=0)·스폰 앵커 정렬 상태로 스테이징한다.
 */
export async function prepareVirtualThreeHeroSceneStage(options: {
  readonly scene: THREE.Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly theme: VirtualThreeHeroSceneTheme;
  readonly signal: AbortSignal;
  readonly onProgress: (loaded: number, total: number) => void;
  readonly onBeforeDecode?: (sources: readonly VirtualThreeStagedSourceInput[]) => void;
  readonly onAssetError?: (url: string, kind: "model") => void;
  readonly deliveryContext?: Partial<HeroBg3dDeliveryContext>;
}): Promise<VirtualThreeThemeModelStage> {
  const { scene, manifest, theme, signal } = options;
  assertActive(signal);
  const loader = createStudioThreeGlbLoader();
  let rootGroup: THREE.Group | null = null;
  let disposed = false;

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (rootGroup) {
      rootGroup.removeFromParent();
      disposeStudioThreeOwnedModel(rootGroup);
      rootGroup.clear();
      rootGroup = null;
    }
  };

  try {
    const verified = await loadVirtualThreeHeroSceneSource(theme, {
      signal,
      deliveryContext: options.deliveryContext,
    });
    assertActive(signal);

    const stagedInput: VirtualThreeStagedSourceInput = {
      id: verified.ref.assetId,
      blobBytes: verified.byteLength,
      bufferCopyBytes: verified.byteLength,
      decodedGeometryBytes: verified.estimatedDecodedGeometryBytes,
      decodedImageBytes: verified.estimatedDecodedImageBytes,
      pendingDecode: true,
    };
    options.onBeforeDecode?.([stagedInput]);

    const bytes = await verified.blob.arrayBuffer();
    assertActive(signal);

    let gltf: Awaited<ReturnType<typeof loader.parseAsync>>;
    try {
      gltf = await loader.parseAsync(bytes, "");
    } catch (error) {
      options.onAssetError?.(verified.url, "model");
      throw error;
    }

    const model = gltf.scene;
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // 외벽·천장이 내부 바닥을 통째로 가리는 암전 그림자를 막고 가구·기둥만 부드러운 접지 그림자를 드리운다.
        child.castShadow = !/^BG_(?:Ceiling|Roof|Wall_)/iu.test(child.name);
        child.receiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 1, 1.35);
            mat.needsUpdate = true;
          }
        }
      }
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
    }

    const spawnAnchor = worldToThree(studioWorldSpawn(manifest).point, 0);
    const wrapper = new THREE.Group();
    wrapper.name = `hero-bg-scene-${theme.heroSlug}`;
    wrapper.userData.heroSceneSlug = theme.heroSlug;
    wrapper.userData.heroThemeId = theme.id;
    wrapper.userData.heroDeliveryTier = verified.tier;
    wrapper.position.set(
      spawnAnchor.x - verified.preset.spawnMeters[0],
      0,
      spawnAnchor.z - verified.preset.spawnMeters[2],
    );
    wrapper.add(model);
    rootGroup = wrapper;
    scene.add(wrapper);

    assertActive(signal);
    verified.assertCurrent();
    options.onProgress(1, 1);

    const sourceInputs: readonly VirtualThreeStagedSourceInput[] = [
      {
        id: verified.ref.assetId,
        blobBytes: verified.byteLength,
        bufferCopyBytes: bytes.byteLength,
        decodedGeometryBytes: verified.estimatedDecodedGeometryBytes,
        decodedImageBytes: verified.estimatedDecodedImageBytes,
      },
    ];
    const assertCurrent = () => {
      assertActive(signal);
      if (disposed) throw new Error("이미 해제된 Hero 3D 배경 무대입니다.");
      verified.assertCurrent();
    };
    return {
      sourceInputs,
      assertCurrent,
      update: () => {},
      dispose: cleanup,
    };
  } catch (error) {
    try { cleanup(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Hero 3D 배경 무대 준비와 해제에 실패했습니다.", { cause: cleanupError });
    }
    throw error;
  }
}
