/** 현재 표시 장면을 cache 소유 자원과 분리된 Three 그래프로 옮긴다. */
import * as THREE from "three";
import { createStudioBg3dEditableThreeClone } from "../studio-background-3d-model";
import { makeGeometry } from "../studio-background-3d-primitives";
import { collectStudioBg3dEffectivelyVisibleEntityIds, readStudioBg3dHiddenTagSet, resolveStudioBg3dHierarchy } from "./studio-bg3d-hierarchy";
import { parseStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { readStudioBg3dPrimitiveEditDepthBias, STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY } from "./studio-bg3d-primitive-edit-material-runtime";
import { applyStudioBg3dSceneGlbModelState, retargetStudioBg3dSceneGlbClips, type StudioBg3dSceneGlbAnimationState } from "./studio-bg3d-scene-glb-animation";
import { assertSceneGlbActive, StudioBg3dSceneGlbGraphError, type StudioBg3dSceneGlbGraphErrorCode } from "./studio-bg3d-scene-glb-errors";
import { createStudioBg3dSceneGlbMaterials } from "./studio-bg3d-scene-glb-materials";
import { readStudioBg3dSceneGlbSourceMetadata, type StudioBg3dSceneGlbSourceMetadata } from "./studio-bg3d-scene-glb-source-metadata";
import { assertStudioBg3dSceneGlbPackedMapCompatibility, normalizeStudioBg3dSceneGlbTextureTransform,
  type StudioBg3dSceneGlbMetalRoughPacking } from "./studio-bg3d-scene-glb-texture-transform";
import { bakeStudioBg3dSceneGlbMeshUvs } from "./studio-bg3d-scene-glb-uv-bake";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";

export type { StudioBg3dSceneGlbGraphErrorCode } from "./studio-bg3d-scene-glb-errors";
export type { StudioBg3dSceneGlbAnimationState } from "./studio-bg3d-scene-glb-animation";
export type { StudioBg3dSceneGlbSourceMetadata } from "./studio-bg3d-scene-glb-source-metadata";

export interface StudioBg3dSceneGlbModelRoot {
  readonly root: THREE.Object3D;
  readonly animations: readonly THREE.AnimationClip[];
  readonly sourceBytes: Uint8Array;
}
export interface StudioBg3dSceneGlbGraphInput {
  readonly document: StudioBg3dSceneDocument;
  readonly modelRoots: ReadonlyMap<string, StudioBg3dSceneGlbModelRoot>;
  readonly signal?: AbortSignal;
  readonly animationTimeSecondsByNodeId?: ReadonlyMap<string, number>;
  readonly createCanvas?: (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;
  /** 개인 raw packing을 후속 bridge에서 완료하는 artifact 경로만 지정한다. */
  readonly metalRoughPacking?: StudioBg3dSceneGlbMetalRoughPacking;
}
export type StudioBg3dSceneGlbGraphResult = { readonly ok: true; readonly scene: THREE.Scene;
  readonly animations: readonly THREE.AnimationClip[]; readonly hiddenNodeIds: readonly string[];
  readonly sourceMetadata: readonly StudioBg3dSceneGlbSourceMetadata[];
  readonly animationState: readonly StudioBg3dSceneGlbAnimationState[]; dispose(): void }
  | { readonly ok: false; readonly code: StudioBg3dSceneGlbGraphErrorCode; readonly messageKo: string; readonly nodeIds?: readonly string[]; readonly reason?: string };

function detachMaterialTextures(material: THREE.Material, textures: Map<THREE.Texture, THREE.Texture>, disposals: (() => void)[], nodeId: string,
  packing: StudioBg3dSceneGlbMetalRoughPacking = "shared-only"): void {
  for (const key of Object.keys(material)) {
    const descriptor = Object.getOwnPropertyDescriptor(material, key), original: unknown = descriptor && "value" in descriptor ? descriptor.value : null;
    if (!(original instanceof THREE.Texture)) continue;
    let owned = textures.get(original);
    if (!owned) {
      // Texture.copy의 needsUpdate는 Source.version도 올린다. subclass copy는 유지하되 Source 권위만 분리한다.
      const source = new THREE.Source(original.source.data); source.dataReady = original.source.dataReady;
      const isolated = new Proxy(original, { get(target, property, receiver) {
        if (property === "source") return source; if (property === "userData") return {};
        return Reflect.get(target, property, receiver);
      } });
      owned = isolated.clone(); owned.name = "";
      // 화면에 디코딩된 pixel은 PNG로 보존한다. 원래 codec 정보는 sourceMetadata에만 남긴다.
      owned.userData = { mimeType: "image/png" };
      textures.set(original, owned); const disposable = owned; disposals.push(() => disposable.dispose());
    }
    Object.defineProperty(material, key, { ...descriptor, value: owned });
  }
  assertStudioBg3dSceneGlbPackedMapCompatibility(material, nodeId, packing);
}

/** KHR로 동등하게 표현할 수 없는 affine 변환만 mesh UV에 굽는다. 기존 KHR 경로는 유지한다. */
function normalizeOrBakeMeshUvs(root: THREE.Object3D, nodeId: string, disposals: (() => void)[], signal: AbortSignal,
  packing: StudioBg3dSceneGlbMetalRoughPacking = "shared-only"): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    const binding: THREE.Material | THREE.Material[] = object.material; let needsBake = false;
    for (const material of Array.isArray(binding) ? binding : [binding]) {
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        try { normalizeStudioBg3dSceneGlbTextureTransform(value, nodeId); }
        catch (error) {
          if (!(error instanceof StudioBg3dSceneGlbGraphError) || error.reason !== "texture-uv-shear-or-decomposition"
            || !(object instanceof THREE.Mesh)) throw error;
          needsBake = true;
        }
      }
    }
    if (!needsBake || !(object instanceof THREE.Mesh)) return;
    const baked = bakeStudioBg3dSceneGlbMeshUvs(object, nodeId, signal, packing);
    if (!baked.ok) throw new StudioBg3dSceneGlbGraphError(baked.code, [nodeId], baked.reason);
    const geometry = object.geometry, material = object.material;
    object.geometry = baked.geometry; object.material = baked.material;
    disposals.push(() => { object.geometry = geometry; object.material = material; baked.dispose(); });
  });
}

/** BufferGeometry userData도 exporter가 읽으므로 모델 geometry는 별도 복제해 runtime metadata를 지운다. */
function detachGeometryAndMetadata(root: THREE.Object3D, disposals: (() => void)[], sourceMetadata: StudioBg3dSceneGlbSourceMetadata, nodeId: string,
  packing: StudioBg3dSceneGlbMetalRoughPacking = "shared-only"): void {
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const textures = new Map<THREE.Texture, THREE.Texture>();
  const visitedMaterials = new Set<THREE.Material>();
  const sourceHasMarker = sourceMetadata.metadata.indexed.materials?.some((entry) => {
    const extras = entry.extras;
    return extras && typeof extras === "object" && STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY in extras
      && readStudioBg3dPrimitiveEditDepthBias(extras[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]) !== null;
  });
  root.traverse((object) => {
    object.userData = {};
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    const original: THREE.BufferGeometry = object.geometry;
    let copied = geometries.get(original);
    if (!copied) {
      copied = original.clone(); copied.userData = {}; geometries.set(original, copied);
      const owned = copied; disposals.push(() => owned.dispose());
    }
    object.geometry = copied;
    const binding: THREE.Material | THREE.Material[] = object.material;
    for (const material of Array.isArray(binding) ? binding : [binding]) {
      if (visitedMaterials.has(material)) continue; visitedMaterials.add(material);
      const marker = sourceHasMarker ? readStudioBg3dPrimitiveEditDepthBias(material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]) : null;
      material.userData = marker ? { [STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]: marker } : {};
      detachMaterialTextures(material, textures, disposals, nodeId, packing);
    }
    if (object instanceof THREE.InstancedMesh) {
      if (object.morphTexture) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [], "instanced-morph-texture-not-exported");
      disposals.push(() => object.dispose());
    }
  });
}

export async function buildStudioBg3dSceneGlbGraph(input: StudioBg3dSceneGlbGraphInput): Promise<StudioBg3dSceneGlbGraphResult> {
  const controller = new AbortController(), abort = () => controller.abort();
  input.signal?.addEventListener("abort", abort, { once: true }); if (input.signal?.aborted) abort();
  const signal = controller.signal;
  const scene = new THREE.Scene(), disposals: (() => void)[] = [];
  const materialOwner = createStudioBg3dSceneGlbMaterials(input.createCanvas);
  // paint texture를 먼저 원복·정리한 뒤 인스턴스 재질과 독립 geometry를 해제한다.
  const dispose = () => { controller.abort(); input.signal?.removeEventListener("abort", abort);
    materialOwner.dispose(); for (const cleanup of disposals.splice(0).reverse()) cleanup(); scene.clear(); };
  let activeNodeId: string | undefined;
  try {
    assertSceneGlbActive(signal);
    const serialized = serializeStudioBg3dSceneDocument(input.document);
    const document = serialized ? parseStudioBg3dSceneDocument(serialized) : null;
    if (!document) throw new StudioBg3dSceneGlbGraphError("invalid-document");
    const hierarchy = resolveStudioBg3dHierarchy(document.nodes);
    if (hierarchy.repairedCycles || hierarchy.repairedOrphans || hierarchy.repairedSelfParents) throw new StudioBg3dSceneGlbGraphError("invalid-document");
    const visible = collectStudioBg3dEffectivelyVisibleEntityIds(document.nodes, readStudioBg3dHiddenTagSet(document));
    const hiddenNodeIds = document.nodes.filter(({ id }) => !visible.has(id)).map(({ id }) => id);
    const groups = new Map<string, THREE.Group>(), animations: THREE.AnimationClip[] = [], animationState: StudioBg3dSceneGlbAnimationState[] = [];
    const sourceMetadata = new Map<string, StudioBg3dSceneGlbSourceMetadata>();
    for (const node of document.nodes) {
      if (!visible.has(node.id)) continue;
      const group = new THREE.Group(); group.name = node.name;
      group.position.fromArray(node.transform.position); group.rotation.fromArray([...node.transform.rotation, "XYZ"]); group.scale.fromArray(node.transform.scale);
      group.userData = { toonstudioSceneNode: { id: node.id, kind: node.kind, ...(node.tags ? { tags: [...node.tags] } : {}) } };
      groups.set(node.id, group);
    }
    for (const node of document.nodes) {
      const group = groups.get(node.id); if (!group) continue;
      const parent = node.parentId ? groups.get(node.parentId) : undefined; (parent ?? scene).add(group);
    }
    for (const node of document.nodes) {
      const group = groups.get(node.id); if (!group) continue;
      activeNodeId = node.id; assertSceneGlbActive(signal);
      if (node.surface) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [node.id], "procedural-surface-reference");
      if (node.kind === "primitive") {
        const geometry = makeGeometry(node.primitiveKind); disposals.push(() => geometry.dispose());
        const material = materialOwner.primitive(node), mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = node.castsShadow; mesh.receiveShadow = node.receivesShadow; group.add(mesh);
        await materialOwner.ready(group, node.id, signal); detachMaterialTextures(material, new Map(), disposals, node.id, input.metalRoughPacking);
        normalizeOrBakeMeshUvs(group, node.id, disposals, signal, input.metalRoughPacking); continue;
      }
      const attachment = document.attachments.find(({ id }) => id === node.attachmentId), source = input.modelRoots.get(node.attachmentId);
      if (!attachment || !source) throw new StudioBg3dSceneGlbGraphError("model-unavailable", [node.id]);
      // InstancedMesh.copy도 morphTexture.clone을 호출하므로 cache Source에 닿기 전에 소실 경로를 막는다.
      source.root.traverse((object) => {
        if (object instanceof THREE.InstancedMesh && object.morphTexture) throw new StudioBg3dSceneGlbGraphError("unsupported-feature", [node.id], "instanced-morph-texture-not-exported");
      });
      if (!sourceMetadata.has(attachment.hash)) sourceMetadata.set(attachment.hash,
        await readStudioBg3dSceneGlbSourceMetadata(source.sourceBytes, attachment.hash, attachment.byteSize, node.id, signal));
      const clone = await createStudioBg3dEditableThreeClone(source.root); disposals.push(() => clone.dispose());
      assertSceneGlbActive(signal);
      clone.applyMaterialOverride(node.materialOverride);
      await materialOwner.ready(clone.root, node.id, signal);
      materialOwner.paintModel(clone.root, node);
      const clips = retargetStudioBg3dSceneGlbClips(source.root, clone.root, source.animations, node.id);
      const metadata = sourceMetadata.get(attachment.hash);
      if (!metadata) throw new StudioBg3dSceneGlbGraphError("asset-mismatch", [node.id]);
      detachGeometryAndMetadata(clone.root, disposals, metadata, node.id, input.metalRoughPacking);
      normalizeOrBakeMeshUvs(clone.root, node.id, disposals, signal, input.metalRoughPacking);
      clone.root.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = node.castsShadow; object.receiveShadow = node.receivesShadow; } });
      group.add(clone.root); scene.updateMatrixWorld(true);
      animationState.push(applyStudioBg3dSceneGlbModelState(clone, node, clips, input.animationTimeSecondsByNodeId?.get(node.id)));
      animations.push(...clips);
      group.userData = { toonstudioSceneNode: { id: node.id, kind: node.kind, attachmentHash: attachment.hash,
        rights: { ...attachment.rights }, ...(node.tags ? { tags: [...node.tags] } : {}) } };
    }
    assertSceneGlbActive(signal); scene.updateMatrixWorld(true);
    return { ok: true, scene, animations, hiddenNodeIds, sourceMetadata: [...sourceMetadata.values()], animationState, dispose };
  } catch (error) {
    try { dispose(); } catch { return { ok: false, code: "build-failed", messageKo: "장면 그래프의 임시 자원 정리를 확인하지 못했습니다.", reason: "resource-cleanup-failed" }; }
    const failure = error instanceof StudioBg3dSceneGlbGraphError ? error : new StudioBg3dSceneGlbGraphError("build-failed", activeNodeId ? [activeNodeId] : []);
    return { ok: false, code: failure.code, messageKo: failure.message, ...(failure.nodeIds.length ? { nodeIds: failure.nodeIds } : activeNodeId ? { nodeIds: [activeNodeId] } : {}),
      ...(failure.reason ? { reason: failure.reason } : {}) };
  }
}
