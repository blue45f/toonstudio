/** 문서 hash·snapshot의 단일 경계. 기존 무재질 문서의 순서와 bytes를 보존한다. */
import { canonicalStudioCommandJson } from "../../studio-command-journal";
import { deserializeStudioEditableMesh, matchesStudioEditableMeshPersistedHash, serializeStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { createStudioGeometryAuthorityRegistry, registerStudioGeometryAuthority, type StudioGeometryAuthorityRegistry } from "../../studio-geometry-authority";
import { createStudioMeshModifierStack, deserializeStudioMeshModifierStack, hashStudioMeshModifierStack, serializeStudioMeshModifierStack } from "../../studio-mesh-modifier-stack";
import { sha256HexPortable } from "../../studio-sha256";
import { createStudioHybridDccIdentityTransform, hashStudioHybridDccObjectTransform, normalizeStudioHybridDccObjectTransform } from "../studio-hybrid-dcc-object-transform";
import { hashStudioHybridDccMaterials, normalizeStudioHybridDccMaterials } from "../materials/studio-hybrid-dcc-material-table";

import type { StudioHybridDccDocumentState, StudioHybridDccPersistedSnapshot, StudioHybridDccRestorableSnapshot } from "../studio-hybrid-dcc-document";

export const STUDIO_HYBRID_DCC_DOCUMENT_VERSION = 3 as const;
export const STUDIO_HYBRID_DCC_PREVIOUS_DOCUMENT_VERSION = 2 as const;
export const STUDIO_HYBRID_DCC_LEGACY_DOCUMENT_VERSION = 1 as const;
export const STUDIO_HYBRID_DCC_DOCUMENT_FORMAT =
  "toonstudio.hybrid-dcc-document" as const;
export const STUDIO_HYBRID_DCC_ENGINE_VERSION = "hybrid-dcc-engine-1" as const;

function stateHash(parts: readonly string[]): string {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(parts.join("|")))}`;
}

function computeStateHash(
  state: Omit<StudioHybridDccDocumentState, "stateHash">,
  meshFingerprints: readonly string[],
): string {
  return stateHash([
    state.documentId,
    String(state.version),
    String(state.commandCount),
    String(Object.keys(state.geometry.records).length),
    ...meshFingerprints,
    ...Object.keys(state.objectTransforms)
      .sort()
      .map((id) => `${id}:${hashStudioHybridDccObjectTransform(state.objectTransforms[id]!)}`),
    ...state.dirtyNodeIds,
    ...state.rightsBom
      .map((record) => canonicalStudioCommandJson(record))
      .sort(),
    ...state.dependencies
      .map((dependency) => canonicalStudioCommandJson(dependency))
      .sort(),
    state.milestoneLabel ?? "",
    ...(state.materials ? [hashStudioHybridDccMaterials(state.materials)] : []),
  ]);
}

function contentHashForMeshHash(meshHash: string): `sha256:${string}` {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(meshHash))}`;
}

function meshFingerprints(geometry: StudioGeometryAuthorityRegistry): string[] {
  return Object.keys(geometry.records)
    .sort()
    .map((id) => {
      const record = geometry.records[id]!;
      return `${id}:${record.meshHash}:${hashStudioMeshModifierStack(record.modifierStack)}`;
    });
}

export function finalizeState(
  partial: Omit<StudioHybridDccDocumentState, "stateHash">,
): StudioHybridDccDocumentState {
  const assetIds = Object.keys(partial.geometry.records).sort();
  const transformIds = Object.keys(partial.objectTransforms).sort();
  if (assetIds.length !== transformIds.length
    || assetIds.some((assetId, index) => assetId !== transformIds[index])) {
    throw new Error("object transform registry must match geometry authority assets exactly");
  }
  const { materials: inputMaterials, ...withoutMaterials } = partial;
  const materials = normalizeStudioHybridDccMaterials(inputMaterials, partial.geometry, true);
  const normalized = { ...withoutMaterials, ...(materials ? { materials } : {}) };
  return { ...normalized, stateHash: computeStateHash(normalized, meshFingerprints(partial.geometry)) };
}

export function snapshotStudioHybridDccState(
  state: StudioHybridDccDocumentState,
): StudioHybridDccPersistedSnapshot {
  const assets = Object.values(state.geometry.records)
    .map((record) => ({
      assetId: record.assetId,
      meshHash: record.meshHash,
      revision: record.revision,
      mesh: serializeStudioEditableMesh(record.mesh),
      modifierStack: serializeStudioMeshModifierStack(record.modifierStack),
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  return {
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId: state.documentId,
    commandCount: state.commandCount,
    stateHash: state.stateHash,
    milestoneLabel: state.milestoneLabel,
    dirtyNodeIds: [...state.dirtyNodeIds],
    rightsBom: [...state.rightsBom],
    dependencies: [...state.dependencies],
    objectTransforms: Object.fromEntries(
      Object.keys(state.objectTransforms)
        .sort()
        .map((assetId) => [
          assetId,
          normalizeStudioHybridDccObjectTransform(state.objectTransforms[assetId]),
        ]),
    ),
    assets,
    ...(state.materials ? { materials: normalizeStudioHybridDccMaterials(state.materials, state.geometry) } : {}),
  };
}

export function restoreStudioHybridDccStateFromSnapshot(
  snapshot: StudioHybridDccRestorableSnapshot,
): StudioHybridDccDocumentState {
  if (snapshot.format !== STUDIO_HYBRID_DCC_DOCUMENT_FORMAT
    || (snapshot.version !== STUDIO_HYBRID_DCC_DOCUMENT_VERSION
      && snapshot.version !== STUDIO_HYBRID_DCC_PREVIOUS_DOCUMENT_VERSION
      && snapshot.version !== STUDIO_HYBRID_DCC_LEGACY_DOCUMENT_VERSION)) {
    throw new Error("unsupported Hybrid DCC document snapshot");
  }
  let geometry = createStudioGeometryAuthorityRegistry();
  for (const asset of snapshot.assets) {
    const mesh = deserializeStudioEditableMesh(asset.mesh);
    let modifierStack = createStudioMeshModifierStack(mesh);
    if (snapshot.version === STUDIO_HYBRID_DCC_DOCUMENT_VERSION) {
      if (!("modifierStack" in asset)) {
        throw new Error(`invalid modifier stack for ${asset.assetId}: v3 field is missing`);
      }
      const decoded = deserializeStudioMeshModifierStack(asset.modifierStack, mesh);
      if (!decoded.ok) {
        throw new Error(`invalid modifier stack for ${asset.assetId}: ${decoded.detail}`);
      }
      modifierStack = decoded.value;
    }
    const registered = registerStudioGeometryAuthority(geometry, asset.assetId, mesh, {
      modifierStack,
      recordRevision: asset.revision,
    });
    if (!registered.ok) throw new Error(registered.detail);
    geometry = registered.value;
    const current = geometry.records[asset.assetId]!;
    if (!matchesStudioEditableMeshPersistedHash(mesh, asset.meshHash)) {
      // Exact SHA-256 is current authority. A genuine legacy v2 fingerprint is migration-only.
      throw new Error(
        `mesh hash mismatch for ${asset.assetId}: ${current.meshHash} vs ${asset.meshHash}`,
      );
    }
  }
  const storedTransforms = snapshot.version !== STUDIO_HYBRID_DCC_LEGACY_DOCUMENT_VERSION
    ? snapshot.objectTransforms
    : {};
  const objectTransforms = Object.fromEntries(
    Object.keys(geometry.records).sort().map((assetId) => [
      assetId,
      snapshot.version !== STUDIO_HYBRID_DCC_LEGACY_DOCUMENT_VERSION
        ? normalizeStudioHybridDccObjectTransform(storedTransforms[assetId])
        : createStudioHybridDccIdentityTransform(),
    ]),
  );
  if (snapshot.version !== STUDIO_HYBRID_DCC_LEGACY_DOCUMENT_VERSION
    && Object.keys(storedTransforms).some((assetId) => !Object.hasOwn(geometry.records, assetId))) {
    throw new Error("object transform registry contains an unknown asset");
  }
  const materials = normalizeStudioHybridDccMaterials("materials" in snapshot ? snapshot.materials : undefined, geometry);
  if (materials && snapshot.version !== STUDIO_HYBRID_DCC_DOCUMENT_VERSION) throw new Error("이전 문서 버전은 툰 재질 권위를 포함할 수 없습니다.");
  return finalizeState({
    ...(materials ? { materials } : {}),
    format: STUDIO_HYBRID_DCC_DOCUMENT_FORMAT,
    version: STUDIO_HYBRID_DCC_DOCUMENT_VERSION,
    documentId: snapshot.documentId,
    geometry,
    objectTransforms,
    rightsBom: snapshot.rightsBom.map((record) => {
      const restored = geometry.records[record.assetId];
      return restored
        ? { ...record, contentHash: contentHashForMeshHash(restored.meshHash) }
        : record;
    }),
    dependencies: [...snapshot.dependencies],
    dirtyNodeIds: [...snapshot.dirtyNodeIds],
    milestoneLabel: snapshot.milestoneLabel,
    commandCount: snapshot.commandCount,
  });
}
