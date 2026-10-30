/** 문서 권위와 별개인 표시 projection. 조형 preview는 이 경계를 넘어 저장되지 않는다. */
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { assertRenderCacheIsNotAuthority, type StudioGeometryAuthorityRecord, type StudioRenderMeshCache } from "../studio-geometry-authority";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, STUDIO_MESH_SURFACE_INTERACTIVE_TOTAL_EAR_TESTS } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { inspectStudioMeshSurfaceForInteractiveProjection, type StudioMeshSurfaceInteractiveInspection } from "../mesh-surface/studio-mesh-surface-interactive";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { deriveStudioHybridDccAssetLayout, STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS, type StudioHybridDccAssetLayoutInput } from "./studio-hybrid-dcc-asset-layout";
import { STUDIO_HYBRID_DCC_OBJECT_TRANSFORM_REVISION } from "./studio-hybrid-dcc-object-transform";
import { deriveStudioHybridDccToonAssetProjection, studioHybridDccToonPresentationSignature, type StudioHybridDccToonBindings, type StudioHybridDccToonMaterialPreview } from "./materials/studio-hybrid-dcc-toon-projection";
import type { StudioHybridDccSelectionMode } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import type { StudioSculptGeometryPreview } from "./studio-hybrid-dcc-sculpt-stroke-session";

export type StudioHybridDccViewportRenderSource = "authority-source" | "authority-edit-cage" | "authority-cache-fallback" | "modifier-cache" | "sculpt-preview";
export interface StudioHybridDccViewportAssetSnapshot {
  readonly assetId: string;
  readonly meshHash: string;
  readonly meshRevision: number;
  /** 선택 provenance는 원본 권위 메시다. preview 좌표 배열을 권위로 위장하지 않는다. */
  readonly mesh: StudioEditableMesh;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly cornerUvs?: Float32Array;
  readonly cornerNormals?: Float32Array;
  readonly triangleMaterialSlots?: Float64Array;
  readonly toonMaterials?: StudioHybridDccToonBindings;
  readonly renderHash: string;
  readonly renderSource: StudioHybridDccViewportRenderSource;
  readonly materialId: string;
  readonly materialColor: `#${string}` | null;
  readonly position: readonly [number, number, number];
  readonly rotationEulerRad: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly worldMin: readonly [number, number, number];
  readonly worldMax: readonly [number, number, number];
  readonly normalMode: "flat" | "smooth" | "split";
  readonly vertexCount: number;
  readonly triangleCount: number;
}
export interface StudioHybridDccViewportSnapshot {
  readonly assets: readonly StudioHybridDccViewportAssetSnapshot[];
  readonly errors: readonly { readonly assetId: string; readonly message: string }[];
  readonly warnings: readonly { readonly assetId: string; readonly message: string }[];
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly gridSize: number;
  readonly signature: string;
  readonly totalVertices: number;
  readonly totalTriangles: number;
}
const PROFILE = Object.freeze({
  maxSynchronousTrianglesPerAsset: STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET.maxTriangles,
  maxSynchronousLinearWorkPerAsset: STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET.maxLinearWork,
  maxSynchronousLinearWorkTotal: 2_000_000,
  maxSynchronousPolygonPairWorkTotal: 3_000_000,
  maxSynchronousTrianglesTotal: 180_000,
});
interface MeshRenderData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly cornerNormals?: Float32Array;
  readonly cornerUvs?: Float32Array;
  readonly triangleMaterialSlots?: Float64Array;
}
interface RenderProjection extends MeshRenderData {
  readonly renderHash: string;
  readonly renderSource: StudioHybridDccViewportRenderSource;
  readonly validationWork: number;
}
type CacheValidation = { readonly ok: true; readonly value: RenderProjection } | { readonly ok: false; readonly message: string };
type MeshPreflight = StudioMeshSurfaceInteractiveInspection;
const inspectMesh = inspectStudioMeshSurfaceForInteractiveProjection;
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function meshRenderData(mesh: StudioEditableMesh): MeshRenderData {
  const inspection = inspectMesh(mesh);
  if (!inspection.ok) throw new Error(inspection.message);
  return projectStudioMeshSurfaceForRender(mesh, inspection.value.plan);
}
function resolveRoomMaterialColor(materialId: string): `#${string}` | null {
  const color = /^room-color:(#[0-9a-f]{6})$/iu.exec(materialId)?.[1];
  return color ? color.toLowerCase() as `#${string}` : null;
}
function validateRenderCache(record: StudioGeometryAuthorityRecord, cache: StudioRenderMeshCache, expectedGeometryHash: string | null): CacheValidation {
  let modifierSourceHash: string;
  try { modifierSourceHash = hashStudioEditableMesh(record.modifierStack.source); }
  catch { return { ok: false, message: "변형 스택의 원본 구조를 검증하지 못해 현재 권위 메시로 표시합니다." }; }
  if (modifierSourceHash !== record.meshHash) return { ok: false, message: "변형 스택의 원본 해시가 현재 권위 메시와 달라 원본 메시로 표시합니다." };
  if (!expectedGeometryHash) return { ok: false, message: "공유 장면에 화면용 메시의 provenance가 없어 원본 메시로 표시합니다." };
  if (!/^(?:mesh:[0-9a-f]{8}|mesh:sha256:[0-9a-f]{64}|sha256:[0-9a-f]{64})$/iu.test(cache.derivedFromHash)
    || cache.derivedFromHash !== expectedGeometryHash) return { ok: false, message: "화면용 메시의 파생 해시가 현재 장면과 달라 원본 메시로 표시합니다." };
  if (!(cache.positions instanceof Float32Array) || cache.positions.length === 0 || cache.positions.length % 3 !== 0) {
    return { ok: false, message: "화면용 메시의 정점 배열이 잘못되어 원본 메시로 표시합니다." };
  }
  if (!(cache.indices instanceof Uint32Array) || cache.indices.length === 0 || cache.indices.length % 3 !== 0) {
    return { ok: false, message: "화면용 메시의 삼각형 배열이 잘못되어 원본 메시로 표시합니다." };
  }
  const vertexCount = cache.positions.length / 3, triangleCount = cache.indices.length / 3;
  if (vertexCount > STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS.maxVerticesPerAsset || triangleCount > PROFILE.maxSynchronousTrianglesPerAsset) {
    return { ok: false, message: "화면용 메시가 안전한 동기 표시 예산을 넘어 원본 메시로 표시합니다." };
  }
  const validationWork = cache.positions.length + cache.indices.length;
  if (validationWork > PROFILE.maxSynchronousLinearWorkPerAsset) return { ok: false, message: "화면용 메시 검사 예산을 넘어 원본 메시로 표시합니다." };
  for (const coordinate of cache.positions) {
    if (!Number.isFinite(coordinate)) return { ok: false, message: "화면용 메시에 유한하지 않은 좌표가 있어 원본 메시로 표시합니다." };
    if (Math.abs(coordinate) > STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS.maxAbsoluteCoordinate) return { ok: false, message: "화면용 메시 좌표가 안전 범위를 넘어 원본 메시로 표시합니다." };
  }
  for (let offset = 0; offset < cache.indices.length; offset += 3) {
    const a = cache.indices[offset]!, b = cache.indices[offset + 1]!, c = cache.indices[offset + 2]!;
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) return { ok: false, message: "화면용 메시 인덱스가 정점 범위를 넘어 원본 메시로 표시합니다." };
    if (a === b || b === c || a === c) return { ok: false, message: "화면용 메시의 퇴화 삼각형을 감지해 원본 메시로 표시합니다." };
  }
  if (record.renderCache !== cache || !assertRenderCacheIsNotAuthority(record)) return { ok: false, message: "화면용 메시의 원본·변형·내용 해시가 현재 권위 상태와 달라 원본 메시로 표시합니다." };
  if (!cache.surface) return { ok: false, message: "화면용 캐시에 공통 표면 속성이 없어 원본 편집 메시로 표시합니다." };
  return { ok: true, value: {
    positions: cache.positions, indices: cache.indices, cornerNormals: cache.surface.cornerNormals,
    cornerUvs: cache.surface.cornerUvs, triangleMaterialSlots: cache.surface.triangleMaterialSlots,
    renderHash: cache.derivedFromHash, renderSource: "modifier-cache", validationWork,
  } };
}
function sourceProjection(record: StudioGeometryAuthorityRecord, renderSource: "authority-source" | "authority-edit-cage" | "authority-cache-fallback"): RenderProjection {
  return { ...meshRenderData(record.mesh), renderHash: record.meshHash, renderSource, validationWork: 0 };
}
/** preview는 source identity·revision·실제 hash를 모두 묶고 candidate 자체도 정본/표면 검사를 한다. */
function sculptProjection(record: StudioGeometryAuthorityRecord, preview: StudioSculptGeometryPreview) {
  if (preview.sourceMesh !== record.mesh || preview.sourceMeshRevision !== record.revision
    || preview.sourceMeshHash !== record.meshHash || hashStudioEditableMesh(record.mesh) !== preview.sourceMeshHash
    || !Number.isSafeInteger(preview.strokeRevision) || preview.strokeRevision < 1) throw new Error("조형 미리보기의 원본·수정 번호가 현재 메시와 다릅니다.");
  const canonical = validateStudioEditableMeshSerializableAuthority(preview.mesh);
  if (!canonical.ok) throw new Error(`조형 미리보기 메시가 올바르지 않습니다: ${canonical.detail}`);
  if (hashStudioEditableMesh(preview.mesh) !== preview.meshHash) throw new Error("조형 미리보기의 내용 해시가 실제 메시와 다릅니다.");
  const preflight = inspectMesh(preview.mesh);
  if (!preflight.ok) throw new Error(preflight.message);
  const projection: RenderProjection = { ...projectStudioMeshSurfaceForRender(preview.mesh, preflight.value.plan),
    renderHash: preview.meshHash, renderSource: "sculpt-preview", validationWork: 0 };
  return { projection, preflight: preflight.value };
}

function deriveDisplayLayout(inputs: readonly StudioHybridDccAssetLayoutInput[], sculptAssetId: string | undefined) {
  const displayed = deriveStudioHybridDccAssetLayout(inputs);
  if (!sculptAssetId || displayed.sourceTransforms === "canonical") return displayed;
  // 레거시 inspection-grid도 그리는 동안 원본 표시 TRS를 고정한다. 문서 transform은 만들지 않는다.
  const source = deriveStudioHybridDccAssetLayout(inputs.map((input) => input.assetId === sculptAssetId
    ? { ...input, presentation: undefined } : input));
  const inputById = new Map(inputs.map((input) => [input.assetId, input]));
  const locked = deriveStudioHybridDccAssetLayout(source.items.flatMap((item) => {
    const input = inputById.get(item.assetId);
    return input ? [{ ...input, transform: { revision: STUDIO_HYBRID_DCC_OBJECT_TRANSFORM_REVISION,
      position: item.position, rotationEulerRad: item.rotationEulerRad, scale: item.scale } }] : [];
  }));
  return { ...locked, errors: [...source.errors, ...locked.errors] };
}

/** 원본 선택 provenance와 임시 표시 stream을 분리하고 기존 cache 검사·진단 순서를 유지한다. */
export function deriveStudioHybridDccViewportSnapshot(
  workspace: StudioHybridDccWorkspace,
  selectionMode: StudioHybridDccSelectionMode = "object",
  preferSource = false,
  toonPreview?: StudioHybridDccToonMaterialPreview,
  sculptPreview?: StudioSculptGeometryPreview,
): StudioHybridDccViewportSnapshot {
  const sharedObjectById = new Map(workspace.bridge.set.objects.map((object) => [object.id, object]));
  const records = Object.values(workspace.session.state.geometry.records)
    .filter((record) => sharedObjectById.get(record.assetId)?.visible !== false)
    .toSorted((a, b) => compareCodeUnits(a.assetId, b.assetId));
  const errors: Array<{ readonly assetId: string; readonly message: string }> = [];
  const warnings: Array<{ readonly assetId: string; readonly message: string }> = [];
  const boundedRecords = records.slice(0, STUDIO_HYBRID_DCC_ASSET_LAYOUT_LIMITS.maxAssets);
  for (const record of records.slice(boundedRecords.length)) errors.push({ assetId: record.assetId, message: "동시 표시 에셋 예산을 초과했습니다." });
  const accepted: StudioGeometryAuthorityRecord[] = [];
  const acceptedByAsset = new Map<string, StudioGeometryAuthorityRecord>();
  const preflightByAsset = new Map<string, MeshPreflight>();
  const projectionByAsset = new Map<string, RenderProjection>();
  let cumulativeLinearWork = 0, cumulativePolygonPairWork = 0, cumulativeEarTests = 0, cumulativeTriangles = 0;
  for (const record of boundedRecords) {
    const sourcePreflight = inspectMesh(record.mesh);
    if (!sourcePreflight.ok) { errors.push({ assetId: record.assetId, message: sourcePreflight.message }); continue; }
    let preflight = sourcePreflight.value;
    let projection: RenderProjection;
    try {
      if (sculptPreview?.assetId === record.assetId && workspace.activeAssetId === record.assetId && preferSource) {
        try {
          const candidate = sculptProjection(record, sculptPreview);
          projection = candidate.projection; preflight = candidate.preflight;
        } catch (error) {
          warnings.push({ assetId: record.assetId, message: error instanceof Error ? error.message : "조형 미리보기를 확인하지 못해 원본 메시로 표시합니다." });
          projection = sourceProjection(record, "authority-edit-cage");
        }
      } else if (selectionMode === "object" && !preferSource && record.renderCache) {
        const validated = validateRenderCache(record, record.renderCache, sharedObjectById.get(record.assetId)?.geometryHash ?? null);
        if (validated.ok) projection = validated.value;
        else { warnings.push({ assetId: record.assetId, message: validated.message }); projection = sourceProjection(record, "authority-cache-fallback"); }
      } else projection = sourceProjection(record, selectionMode === "object" && !preferSource ? "authority-source" : "authority-edit-cage");
    } catch (error) {
      errors.push({ assetId: record.assetId, message: error instanceof Error ? error.message : "메시 변환에 실패했습니다." }); continue;
    }
    const projectionTriangles = projection.indices.length / 3;
    if (projection.renderSource !== "modifier-cache" && projectionTriangles !== preflight.triangleCount) {
      errors.push({ assetId: record.assetId, message: "권위 메시와 파생 삼각형 수가 일치하지 않습니다." }); continue;
    }
    const nextLinearWork = cumulativeLinearWork + preflight.linearWork + projection.validationWork;
    const nextPolygonPairWork = cumulativePolygonPairWork + preflight.polygonPairWork;
    const nextEarTests = cumulativeEarTests + preflight.earTests, nextTriangles = cumulativeTriangles + projectionTriangles;
    if (nextLinearWork > PROFILE.maxSynchronousLinearWorkTotal || nextPolygonPairWork > PROFILE.maxSynchronousPolygonPairWorkTotal
      || nextTriangles > PROFILE.maxSynchronousTrianglesTotal || nextEarTests > STUDIO_MESH_SURFACE_INTERACTIVE_TOTAL_EAR_TESTS) {
      errors.push({ assetId: record.assetId, message: "동시 표시 변환 예산을 초과했습니다. 에셋을 나누거나 대용량 worker 경로를 사용해 주세요." }); continue;
    }
    cumulativeLinearWork = nextLinearWork; cumulativePolygonPairWork = nextPolygonPairWork;
    cumulativeEarTests = nextEarTests; cumulativeTriangles = nextTriangles;
    accepted.push(record); acceptedByAsset.set(record.assetId, record); preflightByAsset.set(record.assetId, preflight); projectionByAsset.set(record.assetId, projection);
  }
  const layout = deriveDisplayLayout(accepted.map((record) => ({
    assetId: record.assetId, meshHash: record.meshHash, mesh: record.mesh,
    transform: workspace.session.state.objectTransforms[record.assetId],
    presentation: ["modifier-cache", "sculpt-preview"].includes(projectionByAsset.get(record.assetId)?.renderSource ?? "")
      ? { positions: projectionByAsset.get(record.assetId)!.positions, derivedFromHash: projectionByAsset.get(record.assetId)!.renderHash } : undefined,
  })), sculptPreview && projectionByAsset.get(sculptPreview.assetId)?.renderSource === "sculpt-preview" ? sculptPreview.assetId : undefined);
  errors.push(...layout.errors);
  const assets: StudioHybridDccViewportAssetSnapshot[] = [];
  for (const item of layout.items) {
    try {
      const record = acceptedByAsset.get(item.assetId), projection = projectionByAsset.get(item.assetId), preflight = preflightByAsset.get(item.assetId);
      if (!record || !projection || !preflight) throw new Error("뷰포트 메시 projection을 찾지 못했습니다.");
      if (projection.renderHash !== item.presentationHash) throw new Error("뷰포트 경계와 화면용 메시의 파생 해시가 일치하지 않습니다.");
      const materialId = sharedObjectById.get(item.assetId)?.materialId ?? "default";
      assets.push({
        assetId: item.assetId, meshHash: item.meshHash, meshRevision: record.revision, mesh: item.mesh,
        positions: projection.positions, indices: projection.indices,
        ...deriveStudioHybridDccToonAssetProjection(workspace.session.state, item.assetId, item.mesh, item.meshHash, projection.indices.length / 3, projection.renderSource === "modifier-cache", toonPreview, projection.triangleMaterialSlots),
        ...(projection.cornerUvs ? { cornerUvs: projection.cornerUvs } : {}),
        renderHash: projection.renderHash, renderSource: projection.renderSource, materialId, materialColor: resolveRoomMaterialColor(materialId),
        position: item.position, rotationEulerRad: item.rotationEulerRad, scale: item.scale, worldMin: item.worldMin, worldMax: item.worldMax,
        normalMode: preflight.normalMode, ...(projection.cornerNormals ? { cornerNormals: projection.cornerNormals } : {}),
        vertexCount: projection.positions.length / 3, triangleCount: projection.indices.length / 3,
      });
    } catch (error) { errors.push({ assetId: item.assetId, message: error instanceof Error ? error.message : "메시 변환에 실패했습니다." }); }
  }
  return { assets, errors, warnings, center: layout.center, radius: layout.radius, gridSize: layout.gridSize,
    signature: layout.signature + studioHybridDccToonPresentationSignature(workspace.session.state, toonPreview),
    totalVertices: assets.reduce((sum, asset) => sum + asset.vertexCount, 0), totalTriangles: assets.reduce((sum, asset) => sum + asset.triangleCount, 0) };
}
