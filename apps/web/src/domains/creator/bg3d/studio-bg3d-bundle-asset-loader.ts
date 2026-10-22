import type {
  Bg3dModelImportItem,
  Bg3dModelVerificationOptions,
  Bg3dVerifiedStoredRecord,
} from "./bg3d-model-library";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document";
import {
  findStudioBg3dBundleAsset,
  findStudioBg3dBundleAssetByHash,
  isStudioBg3dBundleAssetId,
  loadStudioBg3dBundleThemePacks,
  studioBg3dBundleAssetUrl,
  type StudioBg3dBundleThemePackAsset,
  type StudioBg3dBundleThemePacks,
} from "./studio-bg3d-bundle-theme-packs";

/**
 * Creator Bundle 테마 팩 에셋의 배포 바이트 로더와 검증 레코드 해석기.
 *
 * 환경 팩 로더(`studio-bg3d-bundled-environment-loader`)와 같은 규율을 따른다: 바이트는
 * 참조 URL에서만 읽고, 크기·GLB 헤더를 확인한 뒤 검증 파이프라인(모델 라이브러리가 주입)에
 * 넘긴다. 모델 파일 자체를 다운로드/내보내기 하는 경로는 만들지 않으며, 장면은 에셋 id와
 * 해시 참조로만 저장된다.
 */

export interface StudioBg3dBundleAssetBytes {
  readonly bytes: Uint8Array;
  readonly mimeType: "model/gltf-binary";
}

export type StudioBg3dBundleAssetBytesFetcher = (
  url: string,
  init: { readonly signal?: AbortSignal },
) => Promise<StudioBg3dBundleAssetBytes>;

export interface StudioBg3dBundleRecordSource {
  readonly id: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly sha256: `sha256:${string}`;
  readonly rights: StudioBg3dAttachmentRights;
  readonly loadSource: () => Promise<StudioBg3dBundleAssetBytes>;
  readonly releaseSource: () => void;
}

/** 모델 라이브러리의 검증 레코드 준비 함수. 순환 import를 피하려고 호출자가 주입한다. */
export type StudioBg3dBundleRecordPreparer = (
  input: Bg3dModelImportItem,
  options: Bg3dModelVerificationOptions,
) => Promise<Bg3dVerifiedStoredRecord>;

/** 팩별 권리가 없는 번들 에셋(원장 이전 스냅샷 데이터)은 권리 미상으로 닫는다 — 상업 이용도 허용하지 않는다. */
const UNPROVEN_BUNDLE_RIGHTS: StudioBg3dAttachmentRights = Object.freeze({
  status: "unknown",
  commercialUse: false,
  attributionRequired: false,
});

/**
 * 번들 에셋의 레코드 권리. 소속 팩의 권리 블록(권리 원장이 allow한 팩에만 생성기가 싣는다)에서 옮기고,
 * 블록이 없으면 unknown이다. 전 팩 일괄 licensed 상수는 쓰지 않는다.
 */
export function studioBg3dBundleAssetRights(
  asset: StudioBg3dBundleThemePackAsset,
  data: Pick<StudioBg3dBundleThemePacks, "packs">,
): StudioBg3dAttachmentRights {
  const rights = data.packs[asset.packIndex]?.rights;
  if (!rights) return UNPROVEN_BUNDLE_RIGHTS;
  return Object.freeze({
    status: rights.status,
    commercialUse: rights.commercialUse,
    attributionRequired: rights.attributionRequired,
    licenseName: rights.licenseName,
  });
}

const byteCache = new Map<string, Promise<StudioBg3dBundleAssetBytes>>();
const verifiedRecordPromiseById = new Map<string, Promise<Bg3dVerifiedStoredRecord>>();

function assertGlbHeader(bytes: Uint8Array, byteSize: number): void {
  if (bytes.byteLength !== byteSize) throw new Error("번들 에셋 응답 크기가 테마 팩 메타데이터와 다릅니다.");
  if (bytes.byteLength < 12) throw new Error("번들 에셋 응답이 GLB로 보기에는 너무 짧습니다.");
  // GLB magic "glTF"를 확인한다. 버전·길이·구조 검증은 GLB 검증 파이프라인의 몫이다.
  if (bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
    throw new Error("번들 에셋 응답이 GLB 형식이 아닙니다.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== 2) throw new Error("번들 에셋 응답의 GLB 버전이 지원 범위 밖입니다.");
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error("번들 에셋 응답의 GLB 길이가 헤더와 다릅니다.");
}

async function fetchAssetBytes(asset: StudioBg3dBundleThemePackAsset, url: string, signal?: AbortSignal): Promise<StudioBg3dBundleAssetBytes> {
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (!response.ok) throw new Error(`번들 에셋을 불러오지 못했습니다 (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertGlbHeader(bytes, asset.bytes);
  return { bytes, mimeType: "model/gltf-binary" };
}

export function loadStudioBg3dBundleAssetBytes(
  asset: StudioBg3dBundleThemePackAsset,
  url: string,
  options: { readonly signal?: AbortSignal; readonly fetcher?: StudioBg3dBundleAssetBytesFetcher } = {},
): Promise<StudioBg3dBundleAssetBytes> {
  const existing = byteCache.get(asset.id);
  if (existing) return existing;
  const fetcher = options.fetcher ?? ((input, init) => fetchAssetBytes(asset, input, init.signal));
  const pending = fetcher(url, { signal: options.signal }).then((loaded) => {
    assertGlbHeader(loaded.bytes, asset.bytes);
    return loaded;
  });
  byteCache.set(asset.id, pending);
  void pending.catch(() => {
    if (byteCache.get(asset.id) === pending) byteCache.delete(asset.id);
  });
  return pending;
}

export function releaseStudioBg3dBundleAssetBytes(id: string): void {
  byteCache.delete(id);
}

function toRecordSource(
  asset: StudioBg3dBundleThemePackAsset,
  data: StudioBg3dBundleThemePacks,
): StudioBg3dBundleRecordSource {
  const url = studioBg3dBundleAssetUrl(asset, data);
  return {
    id: asset.id,
    fileName: asset.path.split("/").at(-1) ?? asset.id,
    byteSize: asset.bytes,
    sha256: asset.sha256,
    rights: studioBg3dBundleAssetRights(asset, data),
    loadSource: () => loadStudioBg3dBundleAssetBytes(asset, url),
    releaseSource: () => releaseStudioBg3dBundleAssetBytes(asset.id),
  };
}

export interface StudioBg3dBundleResolveOptions {
  readonly signal?: AbortSignal;
  readonly loadData?: () => Promise<StudioBg3dBundleThemePacks>;
}

/**
 * 테마 팩 데이터 로드. 번들 해석은 모델 라이브러리의 보조 경로라, 데이터 로드 실패가
 * 로컬 라이브러리 해석까지 막으면 안 된다 — 실패는 "번들 에셋 아님"으로 폴백한다.
 * (패널처럼 번들을 직접 여는 표면에서는 같은 로더의 오류가 그대로 드러난다.)
 */
async function loadThemePacksForResolution(
  loadData: StudioBg3dBundleResolveOptions["loadData"],
): Promise<StudioBg3dBundleThemePacks | null> {
  try {
    return await (loadData ?? loadStudioBg3dBundleThemePacks)();
  } catch {
    return null;
  }
}

export async function resolveStudioBg3dBundleRecordSource(
  id: string,
  options: StudioBg3dBundleResolveOptions = {},
): Promise<StudioBg3dBundleRecordSource | null> {
  if (!isStudioBg3dBundleAssetId(id)) return null;
  const data = await loadThemePacksForResolution(options.loadData);
  if (!data) return null;
  const asset = findStudioBg3dBundleAsset(id);
  return asset ? toRecordSource(asset, data) : null;
}

export async function resolveStudioBg3dBundleRecordSourceByHash(
  hash: `sha256:${string}`,
  options: StudioBg3dBundleResolveOptions = {},
): Promise<StudioBg3dBundleRecordSource | null> {
  const data = await loadThemePacksForResolution(options.loadData);
  if (!data) return null;
  const asset = findStudioBg3dBundleAssetByHash(hash);
  return asset ? toRecordSource(asset, data) : null;
}

export { isStudioBg3dBundleAssetId };

async function loadRecordFromSource(
  source: StudioBg3dBundleRecordSource,
  executionBackend: Bg3dModelVerificationOptions["executionBackend"],
  prepare: StudioBg3dBundleRecordPreparer,
): Promise<Bg3dVerifiedStoredRecord> {
  let pending = verifiedRecordPromiseById.get(source.id);
  if (!pending) {
    pending = source.loadSource().then((loaded) => prepare({
      file: {
        name: source.fileName,
        size: source.byteSize,
        type: loaded.mimeType,
        arrayBuffer: () => Promise.resolve(Uint8Array.from(loaded.bytes).buffer as ArrayBuffer),
      },
      rights: source.rights,
      expectedSha256: source.sha256,
    }, {
      // 가장 엄격한 프로필로 준비해 데스크톱 전용 장면을 사용 가능으로 주장하지 않는다.
      // 런타임 admission은 문서의 실제 예산으로 다시 검증한다.
      profile: "mobile",
      idFactory: () => source.id,
      now: 0,
      executionBackend,
    }).finally(() => {
      // 검증된 레코드가 Blob을 소유하므로 배포 바이트는 놓는다 (메모리 이중 보유 방지).
      source.releaseSource();
    }));
    verifiedRecordPromiseById.set(source.id, pending);
    void pending.catch(() => {
      if (verifiedRecordPromiseById.get(source.id) === pending) verifiedRecordPromiseById.delete(source.id);
    });
  }
  return pending;
}

export async function loadStudioBg3dBundleThemePackRecord(
  id: string,
  signal: AbortSignal | undefined,
  executionBackend: Bg3dModelVerificationOptions["executionBackend"],
  prepare: StudioBg3dBundleRecordPreparer,
): Promise<Bg3dVerifiedStoredRecord | null> {
  const source = await resolveStudioBg3dBundleRecordSource(id, { signal });
  return source ? loadRecordFromSource(source, executionBackend, prepare) : null;
}

export async function loadStudioBg3dBundleThemePackRecordByHash(
  hash: `sha256:${string}`,
  signal: AbortSignal | undefined,
  executionBackend: Bg3dModelVerificationOptions["executionBackend"],
  prepare: StudioBg3dBundleRecordPreparer,
): Promise<Bg3dVerifiedStoredRecord | null> {
  const source = await resolveStudioBg3dBundleRecordSourceByHash(hash, { signal });
  return source ? loadRecordFromSource(source, executionBackend, prepare) : null;
}
