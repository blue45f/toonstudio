/**
 * Hybrid DCC workspace shared types and geometry authority synchronization leaf.
 * Extracted from `studio-hybrid-dcc-workspace.ts` to eliminate circular dependencies with
 * `studio-hybrid-dcc-uv-edit.ts` and `native-import/studio-hybrid-dcc-native-import-workspace.ts`.
 */

import type { StudioMeshExportResult } from "../export/studio-mesh-export-adapters";
import {
  createStudioSharedSet,
  STUDIO_TOON_PASS_KINDS,
  type StudioLiveBridgeDocument,
} from "../live/studio-live-2d3d-bridge";
import type {
  StudioRetargetReport,
  StudioSpringBone,
} from "../studio-character-animation-p2";
import type {
  StudioClothXpbdCapsuleFrameV2,
  StudioClothXpbdVec3V2,
} from "../studio-cloth-xpbd-kernel-v2";
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { assertRenderCacheIsNotAuthority } from "../studio-geometry-authority";
import type { StudioManufacturingBom } from "../studio-manufacturing-bom-lite";
import type { StudioUvMap } from "../studio-uv-unwrap-lite";

import type { StudioDccCollabRoom } from "./studio-dcc-collab-shell";
import type { StudioHybridDccSession } from "./studio-hybrid-dcc-document";
import { parseStudioHybridDccRoomPartMetadata } from "./studio-hybrid-dcc-room-authority";

/** OCCT result shape (lazy-loaded; browser fetch or Node loader). */
export type StudioOcctSolidResult = {
  readonly ok: true;
  readonly bodyKind: import("../studio-occt-wasm-facade").StudioOcctBodyKind;
  readonly mesh: StudioEditableMesh;
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly volumeApprox: number;
  readonly topology: import("../studio-occt-wasm-facade").StudioOcctTopologyReceipt;
  readonly massProperties: import("../studio-occt-wasm-facade").StudioOcctMassProperties;
  readonly backend: "opencascade-wasm";
  readonly operation: string;
  readonly loadPath?: "browser" | "node";
};

export const STUDIO_HYBRID_DCC_WORKSPACE_REVISION = 4 as const;

/** A deliberately small runtime-only LRU so asset switching cannot grow solver memory without bound. */
export const STUDIO_HYBRID_DCC_CLOTH_CACHE_MAX_ENTRIES = 4 as const;

/**
 * Transient solver cache. Canonical geometry is committed after every admitted step and persists;
 * velocity/rest state intentionally restarts after a cold load unless a future bake-cache format
 * explicitly versions it.
 */
export interface StudioHybridDccClothRuntimeCache {
  readonly kind: "studio-hybrid-dcc-cloth-runtime-cache";
  readonly version: 1;
  readonly assetId: string;
  readonly meshHash: string;
  readonly sourceMeshSha256: `sha256:${string}`;
  readonly objectTransformHash: string;
  readonly topologySha256: string;
  readonly restPositions: Float32Array;
  readonly triangleIndices: Uint32Array;
  readonly fixedParticleIndices: Uint32Array;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly stepIndex: number;
  readonly lastReceiptSha256: string;
  readonly simulationConfigSha256: `sha256:${string}`;
}

export interface StudioHybridDccClothRuntimeCacheStore {
  readonly kind: "studio-hybrid-dcc-cloth-runtime-cache-store";
  readonly version: 1;
  readonly maxEntries: typeof STUDIO_HYBRID_DCC_CLOTH_CACHE_MAX_ENTRIES;
  /** Oldest entry first, newest entry last (Map insertion order). */
  readonly entries: ReadonlyMap<string, StudioHybridDccClothRuntimeCache>;
}

export interface StudioHybridDccClothStepOptions {
  readonly gravity?: StudioClothXpbdVec3V2;
  readonly selfCollisionEnabled?: boolean;
  readonly solverIterations?: number;
  readonly capsules?: readonly StudioClothXpbdCapsuleFrameV2[];
}

export interface StudioHybridDccWorkspace {
  readonly revision: typeof STUDIO_HYBRID_DCC_WORKSPACE_REVISION;
  session: StudioHybridDccSession;
  bridge: StudioLiveBridgeDocument;
  activeAssetId: string | null;
  lastImportReport: unknown | null;
  lastUvMap: StudioUvMap | null;
  lastRetarget: StudioRetargetReport | null;
  lastExport: StudioMeshExportResult | null;
  lastSpring: StudioSpringBone | null;
  lastOcct: StudioOcctSolidResult | null;
  lastDynatopo: {
    readonly facesBefore: number;
    readonly facesAfter: number;
    readonly boundaryEdges: number;
    readonly mode: string;
  } | null;
  lastRetopo: {
    readonly facesBefore: number;
    readonly facesAfter: number;
    readonly targetFaces: number;
    readonly meanError: number;
  } | null;
  bom: StudioManufacturingBom;
  collab: StudioDccCollabRoom;
  clothStep: number;
  /** Runtime-only continuation state; authoritative stepped positions live in session geometry. */
  clothRuntimeCache: StudioHybridDccClothRuntimeCacheStore | null;
  animSampleTime: number;
}

export function isBoundedClothRuntimeCacheStore(
  store: StudioHybridDccClothRuntimeCacheStore | null,
): store is StudioHybridDccClothRuntimeCacheStore {
  return store?.kind === "studio-hybrid-dcc-cloth-runtime-cache-store"
    && store.version === 1
    && store.maxEntries === STUDIO_HYBRID_DCC_CLOTH_CACHE_MAX_ENTRIES
    && store.entries instanceof Map
    && store.entries.size <= STUDIO_HYBRID_DCC_CLOTH_CACHE_MAX_ENTRIES;
}

export function pruneClothRuntimeCacheStore(
  store: StudioHybridDccClothRuntimeCacheStore | null,
  records: Readonly<Record<string, unknown>>,
): StudioHybridDccClothRuntimeCacheStore | null {
  if (!isBoundedClothRuntimeCacheStore(store)) return null;
  let entries: Map<string, StudioHybridDccClothRuntimeCache> | null = null;
  for (const assetId of store.entries.keys()) {
    if (Object.hasOwn(records, assetId)) continue;
    entries ??= new Map(store.entries);
    entries.delete(assetId);
  }
  if (!entries) return store;
  return entries.size === 0 ? null : { ...store, entries };
}

function canonicalBridgeMaterialId(
  session: StudioHybridDccSession,
  assetId: string,
): string | null {
  const rights = session.state.rightsBom.find((entry) => entry.assetId === assetId);
  if (!rights) return null;
  const metadata = parseStudioHybridDccRoomPartMetadata(rights.derivative);
  if (!metadata) return null;
  const instanceId = metadata.groupId.slice("room:".length);
  return assetId.startsWith(`room-${instanceId}-part-`)
    ? metadata.materialId
    : null;
}

/**
 * Rebuilds the renderer-neutral shared set from canonical document state. A validated modifier
 * cache remains the current presentation hash, while room material identity is recoverable from
 * the persisted Rights BOM after undo/redo and cold restore.
 */
export function synchronizeWorkspaceGeometryAuthority(
  ws: StudioHybridDccWorkspace,
  session: StudioHybridDccSession,
): StudioHybridDccWorkspace {
  const previousAuthorityIds = new Set(Object.keys(ws.session.state.geometry.records));
  const nextRecords = session.state.geometry.records;
  const previousObjectById = new Map(
    ws.bridge.set.objects.map((object) => [object.id, object] as const),
  );
  const retained = ws.bridge.set.objects.filter((object) => (
    !previousAuthorityIds.has(object.id) && !Object.hasOwn(nextRecords, object.id)
  ));
  const canonicalObjects = Object.values(nextRecords)
    .toSorted((left, right) => left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0)
    .map((record) => {
      const previous = previousObjectById.get(record.assetId);
      const validPresentationCache = record.renderCache
        && assertRenderCacheIsNotAuthority(record)
        ? record.renderCache
        : null;
      return {
        id: record.assetId,
        geometryHash: validPresentationCache?.derivedFromHash ?? record.meshHash,
        visible: previous?.visible ?? true,
        materialId: previous?.materialId
          ?? canonicalBridgeMaterialId(session, record.assetId)
          ?? "default",
        transform: session.state.objectTransforms[record.assetId]!,
      };
    });
  const set = createStudioSharedSet(ws.bridge.set.id, [...retained, ...canonicalObjects]);
  const bridge: StudioLiveBridgeDocument = {
    ...ws.bridge,
    set,
    shots: ws.bridge.shots.map((shot) => ({
      ...shot,
      dirtyPasses: [...STUDIO_TOON_PASS_KINDS],
    })),
    commandSequence: ws.bridge.commandSequence + 1,
  };
  return {
    ...ws,
    session,
    bridge,
    clothRuntimeCache: pruneClothRuntimeCacheStore(ws.clothRuntimeCache, nextRecords),
  };
}
