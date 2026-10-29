/** 이전 v3 snapshot 해시 이관 전용. 새 툰 재질 권위에는 적용하지 않는다. */
import { canonicalStudioCommandJson } from "../../studio-command-journal";
import { serializeStudioMeshModifierStack } from "../../studio-mesh-modifier-stack";
import { sha256HexPortable } from "../../studio-sha256";
import { hashStudioHybridDccObjectTransform } from "../studio-hybrid-dcc-object-transform";

import type { StudioHybridDccDocumentState, StudioHybridDccPersistedSnapshot } from "../studio-hybrid-dcc-document";

const TEXT_ENCODER = new TextEncoder();

function hashPreSliceModifierStack(
  meshHash: string,
  stack: Parameters<typeof serializeStudioMeshModifierStack>[0],
): string {
  const canonical = JSON.stringify({
    sourceHash: meshHash,
    ...serializeStudioMeshModifierStack(stack),
  });
  return `modifier-stack:sha256:${sha256HexPortable(TEXT_ENCODER.encode(canonical))}`;
}

/**
 * Reconstructs the v3 state hash exactly as 7b039bbc did, while retaining the persisted legacy
 * mesh hashes and Rights BOM. This is verification-only; successful callers immediately mint a
 * fresh exact-SHA snapshot through snapshotStudioHybridDccState.
 */
export function hashPreSliceV3Snapshot(
  snapshot: StudioHybridDccPersistedSnapshot,
  state: StudioHybridDccDocumentState,
): string {
  const assetById = new Map(snapshot.assets.map((asset) => [asset.assetId, asset] as const));
  const assetIds = Object.keys(state.geometry.records).sort();
  const meshFingerprints = assetIds.map((assetId) => {
    const asset = assetById.get(assetId);
    const record = state.geometry.records[assetId];
    if (!asset || !record) {
      persistenceError("CORRUPT_PAYLOAD", `legacy v3 geometry asset ${assetId}가 누락되었습니다.`);
    }
    return `${assetId}:${asset.meshHash}:${hashPreSliceModifierStack(
      asset.meshHash,
      record.modifierStack,
    )}`;
  });
  const parts = [
    state.documentId,
    String(state.version),
    String(state.commandCount),
    String(assetIds.length),
    ...meshFingerprints,
    ...Object.keys(state.objectTransforms)
      .sort()
      .map((assetId) => (
        `${assetId}:${hashStudioHybridDccObjectTransform(state.objectTransforms[assetId]!)}`
      )),
    ...snapshot.dirtyNodeIds,
    ...snapshot.rightsBom.map((record) => canonicalStudioCommandJson(record)).sort(),
    ...snapshot.dependencies.map((dependency) => canonicalStudioCommandJson(dependency)).sort(),
    snapshot.milestoneLabel ?? "",
  ];
  return `sha256:${sha256HexPortable(TEXT_ENCODER.encode(parts.join("|")))}`;
}
