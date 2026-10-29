import { FrontSide, Mesh, MeshStandardMaterial } from "three";

import { checkStudioBg3dThreeBudgets, measureStudioBg3dThreeMetrics } from "../studio-background-3d-model";
import { normalizeStudioBg3dGlbAttachment } from "./studio-bg3d-scene-document";
import { readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

import type { StudioBg3dPrimitiveEditReplacementAsset, StudioBg3dPrimitiveEditReplacementCache } from "./studio-bg3d-primitive-edit-replacement";
import type { StudioBg3dModelAttachment, StudioBg3dSceneBudgets } from "./studio-bg3d-scene-document-types";

type RecordIdentity = StudioBg3dPrimitiveEditReplacementAsset["record"];
type MeasuredMetrics = Extract<ReturnType<typeof measureStudioBg3dThreeMetrics>, { readonly ok: true }>["metrics"];
export interface StudioBg3dEditReplacementAssetHost {
  readonly modelRenderer?: unknown;
  readonly materialBackend?: StudioBg3dMaterialBackend;
  readonly isMaterialBackendCurrent?: () => boolean;
  readonly modelRootCacheRef: { readonly current: ReadonlyMap<string, StudioBg3dPrimitiveEditReplacementCache> };
  readonly attachmentByStorageModelIdRef: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
}
type Failure = {
  readonly ok: false; readonly code: "asset-mismatch" | "invalid-replacement" | "budget-exceeded"; readonly messageKo: string;
};
export type StudioBg3dEditReplacementAssetResult = { readonly ok: true; readonly normalizationScale: number } | Failure;
export type StudioBg3dEditReplacementMetricsResult = { readonly ok: true; readonly metrics: MeasuredMetrics } | Failure;
function failure(code: Failure["code"], messageKo: string): Failure {
  return { ok: false, code, messageKo };
}

function sameRecord(a: RecordIdentity, b: RecordIdentity): boolean {
  return a.id === b.id && a.contentHash === b.contentHash && a.byteSize === b.byteSize && a.mime === b.mime
    && sameRights(a.rights, b.rights);
}

function sameRights(a: RecordIdentity["rights"], b: RecordIdentity["rights"]): boolean {
  return a.status === b.status && a.commercialUse === b.commercialUse && a.attributionRequired === b.attributionRequired
    && a.attribution === b.attribution && a.licenseName === b.licenseName;
}

function normalizedCache(asset: StudioBg3dPrimitiveEditReplacementAsset): number | null {
  const { root, normalizationScale: scale } = asset.cache;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return null;
  const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  if (![root.scale.x, root.scale.y, root.scale.z].every((value) => close(value, scale))
    || !root.position.toArray().every((value) => close(value, 0))
    || ![root.quaternion.x, root.quaternion.y, root.quaternion.z].every((value) => close(value, 0))
    || !close(Math.abs(root.quaternion.w), 1)) return null;
  return scale;
}

/** 현 exporter의 무텍스처 StandardMaterial만 허용한다. false override로 원본 DoubleSide·투명도를 지울 수 없다. */
function plainGeneratedMaterial(asset: StudioBg3dPrimitiveEditReplacementAsset): boolean {
  let supported = true;
  let meshes = 0;
  asset.cache.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes += 1;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof MeshStandardMaterial) || material.side !== FrontSide || material.opacity !== 1
        || material.transparent || !material.depthWrite || !material.depthTest || !material.toneMapped
        || material.map || material.normalMap || material.roughnessMap || material.metalnessMap
        || material.emissiveMap || material.aoMap || material.alphaMap || material.bumpMap || material.displacementMap
        || material.lightMap || material.envMap) supported = false;
    }
  });
  return supported && meshes > 0;
}

/** 기존 primitive 교체의 저장 연결·정규화·실측 검사를 같은 의미로 재사용한다. */
export function validateStudioBg3dEditReplacementAsset(
  host: StudioBg3dEditReplacementAssetHost, asset: StudioBg3dPrimitiveEditReplacementAsset,
): StudioBg3dEditReplacementAssetResult {
  const { record, attachment, cache, storageModelId } = asset;
    let backend: StudioBg3dMaterialBackend;
    try { backend = resolveStudioBg3dMaterialBackend({ renderer: host.modelRenderer, materialBackend: host.materialBackend }); }
    catch { return failure("asset-mismatch", "교체 모델의 현재 재질 backend를 확인하지 못했습니다."); }
    const bound = host.attachmentByStorageModelIdRef.current.get(storageModelId);
    const normalizedAttachment = normalizeStudioBg3dGlbAttachment(attachment);
    if (host.isMaterialBackendCurrent?.() === false || storageModelId !== record.id || readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, storageModelId, backend) !== cache
      || !sameRecord(record, cache.record) || !normalizedAttachment || !bound
      || JSON.stringify(normalizeStudioBg3dGlbAttachment(bound)) !== JSON.stringify(normalizedAttachment) || attachment.id === storageModelId
      || attachment.hash !== record.contentHash || attachment.byteSize !== record.byteSize || attachment.mime !== record.mime
      || !sameRights(attachment.rights, record.rights)) {
      return failure("asset-mismatch", "저장한 모델·캐시·장면 원본 연결이 달라 상자를 교체하지 않았습니다.");
    }
    const scale = normalizedCache(asset);
    if (scale === null || !plainGeneratedMaterial(asset)) return failure("invalid-replacement", "모델 원점·정규화 배율·기본 재질을 안전하게 확인할 수 없습니다.");
  return { ok: true, normalizationScale: scale };
}

/** 호출자는 기존 순서대로 역배율을 확인한 다음 실측 예산을 확인한다. */
export function measureStudioBg3dEditReplacementAsset(asset: StudioBg3dPrimitiveEditReplacementAsset, budgets: StudioBg3dSceneBudgets): StudioBg3dEditReplacementMetricsResult {
    const { cache } = asset;
    const measured = measureStudioBg3dThreeMetrics([cache.root], []);
    if (!measured.ok) return failure("invalid-replacement", "교체 모델의 실제 렌더 구조를 확인하지 못했습니다.");
    const cachedMetrics: Readonly<Record<string, number>> = { ...cache.metrics };
    if (Object.entries(measured.metrics).some(([key, value]) => cachedMetrics[key] !== value)
      || measured.metrics.textures !== 0 || measured.metrics.animations !== 0 || measured.metrics.skins !== 0
      || measured.metrics.joints !== 0 || measured.metrics.morphTargets !== 0 || measured.metrics.triangles < 1
      || checkStudioBg3dThreeBudgets(measured.metrics, budgets)) {
      return failure("budget-exceeded", "교체 모델의 실제 렌더 정보가 admission 또는 현재 장면 예산과 다릅니다.");
    }
  return { ok: true, metrics: measured.metrics };
}
