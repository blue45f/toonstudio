import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

import type { StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { createStudioThreeGlbLoader, disposeStudioThreeOwnedModel } from "../studio-virtual-space-three-asset-loader";
import { loadVirtualThreeThemeModelSource, type VirtualThreeVerifiedThemeModelSource } from "./virtual-three-theme-model-source";
import { createVirtualThreeThemePlacementPlanner, virtualThreeThemeModelDisplaySize } from "./virtual-three-theme-placement";
import type { VirtualThreeAssetRecipeTheme } from "./virtual-three-theme-types";

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

/** 탁상 소품은 실제 테이블의 위를 향한 표면 교차점에만 놓는다. */
function tabletopPosition(tables: readonly THREE.Group[], size: THREE.Vector3, occupied: THREE.Box3[]): THREE.Vector3 {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  for (const table of tables) {
    table.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(table);
    for (const row of [0.3, 0.5, 0.7]) for (const column of [0.25, 0.5, 0.75]) {
      const x = THREE.MathUtils.lerp(box.min.x, box.max.x, column), z = THREE.MathUtils.lerp(box.min.z, box.max.z, row);
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
