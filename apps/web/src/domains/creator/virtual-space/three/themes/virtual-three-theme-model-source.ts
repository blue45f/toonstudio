import type { StudioBg3dGlbMetrics } from "../../../bg3d/studio-bg3d-glb-validation";
import type { StudioBg3dAttachmentRights } from "../../../bg3d/studio-bg3d-scene-document";
import type { StudioBg3dBundleThemePackAsset, StudioBg3dBundleThemePacks } from "../../../bg3d/studio-bg3d-bundle-theme-packs";

import { STUDIO_THREE_GENERATED_ASSETS } from "../studio-virtual-space-three-generated-assets";
import { findVirtualThreeThemeModelRef } from "./virtual-three-theme-models";
import type {
  VirtualThreeThemeModelRef,
  VirtualThreeThemeModelRefBundle,
  VirtualThreeThemeModelRefGenerated,
} from "./virtual-three-theme-types";

/** 검증기가 소유한 바이트만 renderer에 넘긴다. URL 자체는 GLTFLoader에 전달하지 않는다. */
export interface VirtualThreeVerifiedThemeModelSource {
  readonly ref: VirtualThreeThemeModelRef;
  readonly blob: Blob;
  readonly contentHash: `sha256:${string}`;
  readonly byteLength: number;
  readonly metrics: StudioBg3dGlbMetrics;
  /** GLTF decode·복제 등 추가 await 이후, scene 설치 직전에 다시 호출한다. */
  readonly assertCurrent: () => void;
  /** 생성 모델의 기존 metadata를 새 상업 이용 승인으로 승격하지 않는다. */
  readonly rights: StudioBg3dAttachmentRights | null;
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("3D 모델 준비가 취소됐습니다.", "AbortError");
}

/** 공유 fetch/Worker를 중단하지 않고 취소한 구독자의 대기만 끝낸다. */
function awaitForCaller<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("3D 모델 준비가 취소됐습니다.", "AbortError"));
    };
    // 취소 이후 공유 작업이 실패해도 미처리 rejection으로 남기지 않는다.
    task.then((value) => {
      signal.removeEventListener("abort", abort);
      resolve(value);
    }, (error: unknown) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function assertExpectedBytes(ref: VirtualThreeThemeModelRef): void {
  if (!Number.isSafeInteger(ref.byteLength) || ref.byteLength <= 0 || ref.byteLength > 64 * 1024 * 1024) {
    throw new TypeError("3D 테마 모델의 선언된 크기가 유효하지 않습니다.");
  }
  const hash = ref.source === "bundle" ? ref.expectedSha256 : `sha256:${ref.sha256}`;
  if (!/^sha256:[a-f0-9]{64}$/u.test(hash)) throw new TypeError("3D 테마 모델의 예상 해시가 유효하지 않습니다.");
}

async function loadBundleSource(
  ref: VirtualThreeThemeModelRefBundle,
  signal?: AbortSignal,
): Promise<VirtualThreeVerifiedThemeModelSource> {
  // 이 어댑터는 선택형 3D 무대 내부에만 있다. BG3D/Worker는 실제 모델 요청 시에 읽는다.
  const [catalog, loader, library] = await awaitForCaller(Promise.all([
    import("../../../bg3d/studio-bg3d-bundle-theme-packs"),
    import("../../../bg3d/studio-bg3d-bundle-asset-loader"),
    import("../../../bg3d/bg3d-model-library"),
  ]), signal);
  assertActive(signal);
  const data = await awaitForCaller(catalog.loadStudioBg3dBundleThemePacks(), signal);
  assertActive(signal);
  const asset = data.assets.find((candidate) => candidate.id === ref.assetId);
  const pack = asset ? data.packs[asset.packIndex] : undefined;
  if (!asset || asset.sha256 !== ref.expectedSha256 || asset.bytes !== ref.byteLength
    || !pack?.catalogIds.includes(ref.catalogId) || pack.rights?.commercialUse !== true) {
    throw new TypeError("3D 테마 모델의 현재 팩·권리·해시·크기가 카탈로그와 다릅니다.");
  }
  const identityOf = (snapshot: StudioBg3dBundleThemePacks, item: StudioBg3dBundleThemePackAsset) => JSON.stringify([
    item.id, item.sha256, item.bytes, item.path, catalog.studioBg3dBundleAssetUrl(item, snapshot),
    snapshot.packs[item.packIndex]?.catalogIds, snapshot.packs[item.packIndex]?.ingestPackIds,
    loader.studioBg3dBundleAssetRights(item, snapshot),
  ]);
  const rightsIdentity = (rights: StudioBg3dAttachmentRights) => JSON.stringify([
    rights.status, rights.commercialUse, rights.attributionRequired, rights.licenseName ?? null,
    rights.attribution ?? null,
  ]);
  const expectedRights = rightsIdentity(loader.studioBg3dBundleAssetRights(asset, data));
  const expectedIdentity = identityOf(data, asset);
  let admittedPublicationRevision: number | null = null;
  const assertCurrent = () => {
    const current = catalog.findStudioBg3dBundleAsset(ref.assetId);
    const snapshot = catalog.getLoadedStudioBg3dBundleThemePacks();
    if (!current || !snapshot || (admittedPublicationRevision !== null
      && catalog.getStudioBg3dBundleThemePacksPublicationRevision() !== admittedPublicationRevision)
      || identityOf(snapshot, current) !== expectedIdentity) {
      throw new TypeError("3D 테마 모델을 준비하는 동안 출처 또는 권리가 변경됐습니다.");
    }
  };
  const record = await awaitForCaller(loader.loadStudioBg3dBundleThemePackRecord(
    ref.assetId, signal, "worker", library.prepareVerifiedBg3dModelRecord,
  ), signal);
  assertActive(signal);
  if (!record || record.contentHash !== ref.expectedSha256 || record.byteSize !== ref.byteLength
    || record.blob.size !== ref.byteLength || record.rights.commercialUse !== true
    || rightsIdentity(record.rights) !== expectedRights) {
    throw new TypeError("3D 테마 모델의 검증된 바이트가 현재 참조와 다릅니다.");
  }
  // record loader의 정상 카탈로그 재조회까지 끝난 최종 발행 세대를 설치 대기 기준으로 고정한다.
  admittedPublicationRevision = catalog.getStudioBg3dBundleThemePacksPublicationRevision();
  assertCurrent();
  return {
    ref, blob: record.blob, contentHash: record.contentHash,
    byteLength: record.byteSize, metrics: record.validatorMetrics, rights: record.rights, assertCurrent,
  };
}

async function readExactGeneratedBody(
  ref: VirtualThreeThemeModelRefGenerated,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(ref.url, { credentials: "same-origin", redirect: "error", signal });
  if (!response.ok) throw new Error(`생성 3D 모델을 불러오지 못했습니다 (HTTP ${response.status}).`);
  const declaredLength = response.headers.get("content-length");
  // 압축 전송의 Content-Length는 원본 길이와 다르므로 실제 해제된 스트림 길이를 검사한다.
  if (!response.headers.get("content-encoding") && declaredLength !== null
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) !== ref.byteLength)) {
    throw new TypeError("생성 3D 모델 응답의 크기가 예상값과 다릅니다.");
  }
  if (!response.body) throw new TypeError("생성 3D 모델 응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(ref.byteLength);
  let offset = 0;
  try {
    while (true) {
      assertActive(signal);
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength > bytes.byteLength - offset) {
        throw new TypeError("생성 3D 모델 응답이 예상 크기를 넘습니다.");
      }
      bytes.set(result.value, offset);
      offset += result.value.byteLength;
    }
    if (offset !== bytes.byteLength) throw new TypeError("생성 3D 모델 응답이 완전하지 않습니다.");
    return bytes;
  } finally {
    // 완료·실패·취소 모두 reader의 소유권을 반환한다. 오류를 성공으로 바꾸지 않는다.
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

async function loadGeneratedSource(
  ref: VirtualThreeThemeModelRefGenerated,
  signal?: AbortSignal,
): Promise<VirtualThreeVerifiedThemeModelSource> {
  const assertCurrent = () => {
    const original = STUDIO_THREE_GENERATED_ASSETS.find((candidate) => candidate.id === ref.provenanceId);
    if (!original || original.id !== ref.id || original.url !== ref.url
      || original.sha256 !== ref.sha256 || original.byteLength !== ref.byteLength) {
      throw new TypeError("생성 3D 모델 참조가 기존 출처 metadata와 다릅니다.");
    }
  };
  assertCurrent();
  const [validation, worker, meshopt] = await Promise.all([
    import("../../../bg3d/studio-bg3d-glb-validation"),
    import("../../../bg3d/studio-bg3d-glb-validation-worker-client"),
    import("../../../bg3d/studio-bg3d-meshopt"),
  ]);
  assertActive(signal);
  const bytes = await readExactGeneratedBody(ref, signal);
  const outcome = await worker.validateStudioBg3dGlbOffMainThread(bytes, {
    declared: { byteSize: ref.byteLength, sha256: ref.sha256, mimeType: "model/gltf-binary" },
    cumulative: { usedBytes: 0, maximumBytes: 64 * 1024 * 1024 },
    profile: "mobile",
    budgets: validation.DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    supportedRequiredExtensions: meshopt.STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
  }, { executionBackend: "worker", signal });
  assertActive(signal);
  assertCurrent();
  if (!outcome.result.ok) throw new TypeError(`생성 3D 모델 검증에 실패했습니다 (${outcome.result.code}).`);
  const snapshot = Uint8Array.from(outcome.result.verifiedBytes);
  return {
    ref, blob: new Blob([snapshot.buffer], { type: "model/gltf-binary" }),
    contentHash: `sha256:${ref.sha256}`, byteLength: snapshot.byteLength,
    metrics: outcome.result.metrics, rights: null, assertCurrent,
  };
}

/** registry에 등록된 ID만 받는다. 새 URL·임의 SHA·미검증 Tripo 후보를 호출자가 주입하지 않는다. */
export async function loadVirtualThreeThemeModelSource(
  modelAssetId: string,
  signal?: AbortSignal,
): Promise<VirtualThreeVerifiedThemeModelSource> {
  assertActive(signal);
  const ref = findVirtualThreeThemeModelRef(modelAssetId);
  if (!ref) throw new TypeError("3D 테마에 등록되지 않은 모델입니다.");
  assertExpectedBytes(ref);
  return ref.source === "bundle" ? loadBundleSource(ref, signal) : loadGeneratedSource(ref, signal);
}
