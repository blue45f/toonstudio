import * as Y from "yjs";
import { normalizeStudioBrushR8TextureGrainSource, serializeStudioBrushR8TextureGrainSourceCanonical } from "@toonstudio/contracts/studio-brush-r8-grain-asset-contract";
import type { StudioBrushR8TextureGrainSource } from "@toonstudio/contracts/studio-brush-r8-grain-asset-contract";
import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";

function materializeExistingMapRoot(doc: Y.Doc, name: string): Y.Map<unknown> | undefined {
  if (!doc.share.has(name)) return undefined;
  try { return doc.getMap<unknown>(name); } catch { return undefined; }
}
export interface StudioCrdtR8GrainReferenceSnapshot {
  /** Canonical immutable source keyed by the durable stroke identity that owns it. */
  byStrokeId: ReadonlyMap<string, Readonly<StudioBrushR8TextureGrainSource>>;
  /** One canonical source per durable work-asset identity. */
  byAssetId: ReadonlyMap<string, Readonly<StudioBrushR8TextureGrainSource>>;
  /** True when one asset ID was poisoned with two different canonical content identities. */
  hasConflictingAssetId: boolean;
}

/**
 * Snapshots every canonical renderer-significant R8 source from the durable stroke map.
 *
 * Root-schema validation runs before callers consume this snapshot, but this helper still
 * normalizes independently and ignores malformed candidates so it is safe to use while comparing
 * a pre-update document with a candidate update.
 */
export function snapshotStudioCrdtR8GrainReferences(
  doc: Y.Doc
): StudioCrdtR8GrainReferenceSnapshot {
  const byStrokeId = new Map<string, Readonly<StudioBrushR8TextureGrainSource>>();
  const byAssetId = new Map<string, Readonly<StudioBrushR8TextureGrainSource>>();
  let hasConflictingAssetId = false;
  const strokes = materializeExistingMapRoot(doc, "strokes");
  if (!(strokes instanceof Y.Map)) {
    return { byStrokeId, byAssetId, hasConflictingAssetId };
  }
  for (const [strokeId, value] of strokes) {
    if (!isBoundedStudioCrdtId(strokeId) || !(value instanceof Y.Map)) continue;
    const brushDynamics = value.get("brushDynamics");
    if (!brushDynamics || typeof brushDynamics !== "object" || Array.isArray(brushDynamics)) {
      continue;
    }
    const grain = (brushDynamics as Record<string, unknown>).grain;
    if (!grain || typeof grain !== "object" || Array.isArray(grain)) continue;
    const source = normalizeStudioBrushR8TextureGrainSource(
      (grain as Record<string, unknown>).source
    );
    if (!source) continue;
    byStrokeId.set(strokeId, source);
    const existing = byAssetId.get(source.asset.assetId);
    if (
      existing
      && serializeStudioBrushR8TextureGrainSourceCanonical(existing)
        !== serializeStudioBrushR8TextureGrainSourceCanonical(source)
    ) {
      hasConflictingAssetId = true;
      continue;
    }
    byAssetId.set(source.asset.assetId, source);
  }
  return { byStrokeId, byAssetId, hasConflictingAssetId };
}

