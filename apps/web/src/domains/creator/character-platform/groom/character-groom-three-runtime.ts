import { MToonMaterial } from "@pixiv/three-vrm";
import { BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, Quaternion, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";

import { executeCharacterAuthoringTaskInBrowser } from "../runtime/character-authoring-worker-client";
import { validateCharacterGroomDocument, type CharacterGroomDocument } from "./character-groom-document";

import type { CharacterAuthoringWorkerExecutionOptions } from "../runtime/character-authoring-worker-client";
import type { CharacterAuthoringWorkerResultPayload, CharacterAuthoringWorkerTask } from "../runtime/character-authoring-worker-protocol";
import { characterSurfaceSourceMap, characterSurfaceTopologyRevision } from "../surface-ink/character-surface-ink-three-mesh";
import { resolveCharacterGroomSurfaceBinding } from "./character-groom-surface-binding";

import type { CharacterGroomSurfaceBinding } from "./character-groom-surface-binding";
import type { CharacterMaterialOverrideV3 } from "../document/character-document-v3";
import type { Material, Matrix4, Object3D, Scene } from "three";

export interface CharacterGroomSurfaceContext {
  readonly scene: Scene;
  readonly modelKey: string;
}

export interface CharacterGroomRenderOptions {
  readonly anatomicalToRawHead?: Matrix4;
  readonly surface?: CharacterGroomSurfaceContext;
  readonly onSurfaceInvalidated?: (guideId: string, reason: string) => void;
  readonly materialOverrides?: readonly CharacterMaterialOverrideV3[];
}

export type CharacterGroomTaskExecutor = (
  task: CharacterAuthoringWorkerTask,
  options?: CharacterAuthoringWorkerExecutionOptions,
) => Promise<CharacterAuthoringWorkerResultPayload>;

export interface CharacterGroomRuntimeResult {
  readonly status: "ready" | "stale";
  readonly guideCount: number;
  readonly triangleCount: number;
  readonly skippedGuideCount: number;
  readonly notices?: readonly string[];
  readonly attachedGuideIds?: readonly string[];
}

/** 리본 단면 법선을 좌우 가장자리로 완만히 굽혀 납작한 종이띠 대신 둥근 머리카락 다발처럼 음영이 잡히게 한다. */
function crownGroomRibbonNormals(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!position || !normal || !uv || position.count < 2) return;
  const left = new Vector3();
  const right = new Vector3();
  const across = new Vector3();
  const current = new Vector3();
  for (let row = 0; row + 1 < position.count; row += 2) {
    left.fromBufferAttribute(position, row);
    right.fromBufferAttribute(position, row + 1);
    across.subVectors(right, left);
    if (across.lengthSq() < 1e-10) continue;
    across.normalize();
    for (const offset of [0, 1] as const) {
      const index = row + offset;
      current.fromBufferAttribute(normal, index);
      if (current.lengthSq() < 1e-10) continue;
      const sideSign = uv.getX(index) < 0.5 ? -1 : 1;
      current.normalize().addScaledVector(across, sideSign * 0.42).normalize();
      normal.setXYZ(index, current.x, current.y, current.z);
    }
  }
  normal.needsUpdate = true;
}

export function disposeCharacterGroomGroup(group: Group): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  group.removeFromParent();
  group.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
}

async function buildGroup(
  document: CharacterGroomDocument,
  topologyRevision: string,
  color: string,
  execute: CharacterGroomTaskExecutor,
  signal: AbortSignal,
  options: CharacterGroomRenderOptions,
): Promise<{ readonly group: Group; readonly result: CharacterGroomRuntimeResult }> {
  const valid = validateCharacterGroomDocument(document);
  const group = new Group();
  group.name = "character-authoring-groom";
  group.userData.characterAuthoringDerivative = "groom";
  let guideCount = 0;
  let triangleCount = 0;
  let skippedGuideCount = 0;
  const notices = new Set<string>();
  const attachedGuideIds: string[] = [];
  const sources = options.surface ? characterSurfaceSourceMap(options.surface.scene) : new Map<string, Mesh>();
  try {
    for (const source of valid.groups) {
      if (!source.visible) continue;
      for (const guide of source.guides) {
        let surfaceBinding: CharacterGroomSurfaceBinding | undefined;
        let renderGuide = guide;
        const hasAnchor = guide.points.some((point) => point.surfaceAnchor);
        if (hasAnchor) {
          const resolved = options.surface
            ? resolveCharacterGroomSurfaceBinding(guide, sources, options.surface.modelKey)
            : { status: "unsupported" as const, reason: "표면을 확인할 모델 장면이 아직 준비되지 않았습니다. 원본은 보존됩니다." };
          if (resolved.status !== "ready") {
            skippedGuideCount += 1;
            notices.add(resolved.reason);
            continue;
          }
          surfaceBinding = resolved.binding;
          renderGuide = surfaceBinding.guide;
        } else if (guide.status !== "valid" || valid.topologyRevision !== topologyRevision || source.scalpRegionId !== "scalp:head-local"
          || (guide.coordinateSpace === "anatomical-head" && !options.anatomicalToRawHead)) {
          skippedGuideCount += 1;
          notices.add("머리 본 좌표 또는 토폴로지를 확인할 수 없어 표시를 보류했습니다. 원본은 보존됩니다.");
          continue;
        }
        if (signal.aborted) throw new DOMException("헤어 메시 생성을 취소했습니다.", "AbortError");
        const payload = await execute({ kind: "build-groom-ribbon", guide: renderGuide, profile: source.profile }, {
          signal, allowMainThreadFallback: false,
        });
        if (signal.aborted) throw new DOMException("헤어 메시 생성을 취소했습니다.", "AbortError");
        if (surfaceBinding && options.surface
          && characterSurfaceTopologyRevision(options.surface.modelKey, surfaceBinding.source) !== surfaceBinding.root.topologyRevision) {
          skippedGuideCount += 1;
          notices.add("헤어를 생성하는 동안 두피 토폴로지가 바뀌어 표시를 보류했습니다. 원본은 보존됩니다.");
          continue;
        }
        if (payload.kind !== "mesh") throw new Error("헤어 Worker가 메시를 반환하지 않았습니다.");
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(payload.positions), 3));
        geometry.setAttribute("normal", new BufferAttribute(new Float32Array(payload.normals), 3));
        geometry.setAttribute("uv", new BufferAttribute(new Float32Array(payload.uvs), 2));
        geometry.setIndex(new BufferAttribute(new Uint32Array(payload.indices), 1));
        crownGroomRibbonNormals(geometry);
        // 중심선과 함께 리본 폭·법선까지 실제 머리 본의 축으로 변환한다.
        if (!surfaceBinding && guide.coordinateSpace === "anatomical-head" && options.anatomicalToRawHead) {
          geometry.applyMatrix4(options.anatomicalToRawHead);
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const override = options.materialOverrides?.find((entry) => entry.materialId === source.materialId);
        const requestedColor = override?.baseColor ?? color;
        const colorAlpha = /^#[0-9a-f]{8}$/iu.test(requestedColor) ? Number.parseInt(requestedColor.slice(7), 16) / 255 : 1;
        const opacity = (override?.opacity ?? 1) * colorAlpha;
        const baseColor = new Color(requestedColor.slice(0, 7));
        const shadeColor = override?.shadowColor
          ? new Color(override.shadowColor.slice(0, 7))
          : baseColor.clone().multiply(new Color("#c8d0e8")).multiplyScalar(0.66);
        const outlineColor = override?.outlineColor
          ? new Color(override.outlineColor.slice(0, 7))
          : shadeColor.clone().multiplyScalar(0.38).lerp(new Color("#14101a"), 0.52);
        const outlineWidth = override?.outlineWidth !== undefined
          ? Math.max(0, Math.min(0.05, override.outlineWidth))
          : 0.0014;
        const wireframe = source.profile.lineOnly || !source.profile.fill;
        const material = new MToonMaterial({
          color: baseColor,
          shadeColorFactor: shadeColor,
          shadingToonyFactor: 0.86,
          shadingShiftFactor: -0.08,
          giEqualizationFactor: 0.88,
          parametricRimColorFactor: baseColor.clone().lerp(new Color("#fff7ee"), 0.62),
          rimLightingMixFactor: 0.42,
          parametricRimFresnelPowerFactor: 4.5,
          parametricRimLiftFactor: 0.08,
          outlineWidthMode: outlineWidth > 0 ? "worldCoordinates" : "none",
          outlineWidthFactor: outlineWidth,
          outlineColorFactor: outlineColor,
          outlineLightingMixFactor: 0.55,
          opacity,
          transparent: opacity < 1,
          depthWrite: opacity >= 1,
          side: DoubleSide,
          wireframe,
        });
        // 기존 호스트 mask 분류는 이름을, 새 component capture는 명시적 역할을 읽는다.
        material.name = `Hair Groom ${source.materialId}`;
        material.userData.toonstudioComponent = "hair";
        material.userData.characterMaterialId = source.materialId;
        const mesh = surfaceBinding?.source instanceof SkinnedMesh ? new SkinnedMesh(geometry, material) : new Mesh(geometry, material);
        mesh.userData.toonstudioComponent = "hair";
        mesh.userData.characterMaterialId = source.materialId;
        if (surfaceBinding && options.surface) {
          attachSurfaceGroom(mesh, group, surfaceBinding, options.surface, () => options.onSurfaceInvalidated?.(guide.guideId, "두피 메시 또는 토폴로지가 변경되어 표시를 중지했습니다. 원본은 보존되며 표면 다시 확인으로 복원할 수 있습니다."));
          attachedGuideIds.push(guide.guideId);
        }
        if (!wireframe && opacity >= 0.99 && outlineWidth > 0) {
          const outlineMaterial = new MToonMaterial({
            color: new Color(0xffffff),
            isOutline: true,
            side: BackSide,
            transparent: false,
            depthWrite: true,
            outlineWidthMode: "worldCoordinates",
            outlineWidthFactor: outlineWidth,
            outlineColorFactor: outlineColor.clone(),
            outlineLightingMixFactor: 0.55,
            shadeColorFactor: shadeColor.clone(),
            shadingToonyFactor: 0.86,
            shadingShiftFactor: -0.08,
            giEqualizationFactor: 0.88,
          });
          outlineMaterial.name = `Hair Groom Outline ${source.materialId}`;
          outlineMaterial.userData.toonstudioComponent = "hair";
          const outlineMesh = mesh instanceof SkinnedMesh
            ? new SkinnedMesh(geometry, outlineMaterial)
            : new Mesh(geometry, outlineMaterial);
          if (mesh instanceof SkinnedMesh && outlineMesh instanceof SkinnedMesh) {
            outlineMesh.bindMode = mesh.bindMode;
            outlineMesh.bind(mesh.skeleton, mesh.bindMatrix);
            outlineMesh.bindMatrixInverse.copy(mesh.bindMatrixInverse);
            outlineMesh.frustumCulled = false;
          }
          outlineMesh.name = `character-hair-groom-outline:${guide.guideId}`;
          outlineMesh.userData.characterAuthoringDerivative = "groom";
          outlineMesh.userData.studioVrmCustomPartOutline = true;
          outlineMesh.userData.toonstudioComponent = "hair";
          outlineMesh.raycast = () => undefined;
          outlineMesh.castShadow = false;
          outlineMesh.receiveShadow = false;
          mesh.add(outlineMesh);
        }
        mesh.name = `character-hair-groom:${guide.guideId}`;
        mesh.userData.characterAuthoringDerivative = "groom";
        mesh.raycast = () => undefined;
        mesh.userData.characterGroomGuideId = guide.guideId;
        mesh.userData.characterGroomGroupId = source.groupId;
        mesh.userData.characterGroomMaterialId = source.materialId;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        guideCount += 1;
        triangleCount += payload.triangleCount;
      }
    }
    return { group, result: { status: "ready", guideCount, triangleCount, skippedGuideCount, notices: [...notices], attachedGuideIds } };
  } catch (error) {
    disposeCharacterGroomGroup(group);
    throw error;
  }
}

/** 두피의 root 스킨 가중치를 가닥에 적용하고 morph 변경 때만 파생 좌표를 갱신한다. */
function attachSurfaceGroom(mesh: Mesh, group: Group, binding: CharacterGroomSurfaceBinding, context: CharacterGroomSurfaceContext, onInvalidated: () => void): void {
  const { source, root } = binding;
  const position = mesh.geometry.getAttribute("position");
  const normal = mesh.geometry.getAttribute("normal");
  const basePositions = Float32Array.from(position.array);
  const baseNormals = Float32Array.from(normal.array);
  if (source instanceof SkinnedMesh && mesh instanceof SkinnedMesh) {
    const indices = new Uint16Array(position.count * 4);
    const weights = new Float32Array(position.count * 4);
    for (let index = 0; index < position.count; index += 1) {
      indices.set(root.skinIndices, index * 4);
      weights.set(root.skinWeights, index * 4);
    }
    mesh.geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
    mesh.geometry.setAttribute("skinWeight", new BufferAttribute(weights, 4));
    mesh.bindMode = source.bindMode;
    mesh.bind(source.skeleton, source.bindMatrix.clone());
    mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
  }
  let morphKey = JSON.stringify(source.morphTargetInfluences ?? []);
  const initialTopology = root.topologyRevision;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  const updateMatrixWorld = mesh.updateMatrixWorld.bind(mesh);
  let invalidated = false;
  const invalidateSurface = () => {
    mesh.visible = false;
    if (!invalidated) { invalidated = true; onInvalidated(); }
  };
  mesh.updateMatrixWorld = (force) => {
    if (invalidated) return;
    source.updateWorldMatrix(true, false);
    // 토폴로지가 바뀌면 다른 삼각형에 부착하지 않는다. 원본 메시 복원은 다음 재생에서 확인한다.
    if (context.scene.getObjectById(source.id) !== source
      || characterSurfaceTopologyRevision(context.modelKey, source) !== initialTopology) {
      invalidateSurface();
      return;
    }
    const nextMorphKey = JSON.stringify(source.morphTargetInfluences ?? []);
    if (nextMorphKey !== morphKey) {
      const current = binding.evaluate();
      if (!current) { invalidateSurface(); return; }
      const rotation = new Quaternion().setFromUnitVectors(new Vector3(...root.localNormal), new Vector3(...current.localNormal));
      const vertex = new Vector3();
      const initialRoot = new Vector3(...root.position);
      const currentRoot = new Vector3(...current.position);
      for (let index = 0; index < position.count; index += 1) {
        vertex.fromArray(basePositions, index * 3).sub(initialRoot).applyQuaternion(rotation).add(currentRoot);
        position.setXYZ(index, vertex.x, vertex.y, vertex.z);
        vertex.fromArray(baseNormals, index * 3).applyQuaternion(rotation);
        normal.setXYZ(index, vertex.x, vertex.y, vertex.z);
      }
      position.needsUpdate = normal.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      morphKey = nextMorphKey;
    }
    mesh.matrix.copy(group.matrixWorld).invert().multiply(source.matrixWorld);
    updateMatrixWorld(force);
  };
}

/** 원본 가이드의 파생 메시만 교체하고 늦은 Worker 결과는 장면에 게시하지 않는다. */
export class CharacterGroomThreeRuntime {
  #generation = 0;
  #abort: AbortController | null = null;
  #group: Group | null = null;
  #disposed = false;

  constructor(
    readonly parent: Object3D,
    readonly invalidate: () => void,
    readonly execute: CharacterGroomTaskExecutor = executeCharacterAuthoringTaskInBrowser,
  ) {}

  async update(document: CharacterGroomDocument, topologyRevision: string, color = "#32251f", options: CharacterGroomRenderOptions = {}): Promise<CharacterGroomRuntimeResult> {
    if (this.#disposed) throw new Error("종료된 헤어 런타임입니다.");
    this.#abort?.abort();
    const generation = ++this.#generation;
    const abort = new AbortController();
    this.#abort = abort;
    try {
      const built = await buildGroup(document, topologyRevision, color, this.execute, abort.signal, options);
      if (this.#disposed || generation !== this.#generation || abort.signal.aborted) {
        disposeCharacterGroomGroup(built.group);
        return { ...built.result, status: "stale" };
      }
      if (this.#group) disposeCharacterGroomGroup(this.#group);
      this.#group = built.group;
      this.parent.add(built.group);
      this.invalidate();
      return built.result;
    } catch (error) {
      if (this.#disposed || generation !== this.#generation || abort.signal.aborted) {
        return { status: "stale", guideCount: 0, triangleCount: 0, skippedGuideCount: 0 };
      }
      throw error;
    } finally {
      if (this.#abort === abort) this.#abort = null;
    }
  }

  clear(): void {
    this.#generation += 1;
    this.#abort?.abort();
    this.#abort = null;
    if (this.#group) disposeCharacterGroomGroup(this.#group);
    this.#group = null;
    this.invalidate();
  }

  dispose(): void {
    this.#disposed = true;
    this.clear();
  }
}
