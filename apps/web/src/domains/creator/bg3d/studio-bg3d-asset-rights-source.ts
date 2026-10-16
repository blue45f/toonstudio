/**
 * 3D 소재 권리 보기의 읽기 원천 — 라이브러리 레코드의 권리와 메타데이터 저장소 기록을 한 번에 읽는다.
 *
 * - 두 원천은 서로 독립이다. 한쪽을 읽지 못해도 다른 쪽 결과는 쓰고, 읽지 못한 쪽은 `failed` 로 알린다
 *   (조용히 "없음"으로 바꾸지 않는다. 호출한 쪽이 사용자에게 알린다).
 * - 모델 파일(바이너리)은 읽지 않는다. 매니페스트의 권리 필드만 쓴다.
 * - 라이브러리와 저장소 모듈은 SQLite/OPFS 권한을 끌어오므로 실제로 읽을 때만 동적으로 불러온다.
 */

import type { StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dAssetRightsSourceData {
  /** 라이브러리 레코드의 권리. 키는 라이브러리 행 ID. */
  readonly libraryRightsById: ReadonlyMap<string, StudioBg3dAttachmentRights>;
  /** 메타데이터 저장소 기록. 키는 정규화된 콘텐츠 해시. */
  readonly metadataByHash: ReadonlyMap<string, StudioBg3dAssetMetadata>;
}

export interface StudioBg3dAssetRightsSourceResult extends StudioBg3dAssetRightsSourceData {
  readonly failed: { readonly library: boolean; readonly metadata: boolean };
}

export interface StudioBg3dAssetRightsSourceOptions {
  readonly signal?: AbortSignal;
  /** 시험용 권한 주입. 없으면 제품 기본 권한을 쓴다. */
  readonly authority?: StudioBg3dLibrariesAuthority;
  /** 시험용 읽기 대체. */
  readonly readLibraryRights?: () => Promise<ReadonlyMap<string, StudioBg3dAttachmentRights>>;
  readonly readMetadata?: () => Promise<readonly StudioBg3dAssetMetadata[]>;
}

async function resolveAuthority(provided: StudioBg3dLibrariesAuthority | undefined): Promise<StudioBg3dLibrariesAuthority> {
  if (provided) return provided;
  return (await import("./studio-bg3d-libraries-sqlite-opfs-authority")).getStudioBg3dLibrariesAuthority();
}

/** 모델 매니페스트의 권리만 읽는다(바이너리는 읽지 않는다). 손상된 매니페스트는 던진다. */
export async function readStudioBg3dModelLibraryRights(
  authority?: StudioBg3dLibrariesAuthority,
): Promise<ReadonlyMap<string, StudioBg3dAttachmentRights>> {
  const [library, source] = await Promise.all([import("./bg3d-model-library"), resolveAuthority(authority)]);
  const manifest = library.parseV12ModelManifest(await source.readManifest("models"));
  return new Map(manifest.records.map((record) => [record.id, record.rights] as const));
}

export async function loadStudioBg3dAssetRightsSources(
  options: StudioBg3dAssetRightsSourceOptions = {},
): Promise<StudioBg3dAssetRightsSourceResult> {
  const readLibrary = options.readLibraryRights ?? (() => readStudioBg3dModelLibraryRights(options.authority));
  const readMetadata = options.readMetadata ?? (async () => {
    const store = await import("./studio-bg3d-asset-metadata-store");
    return store.listStudioBg3dAssetMetadata({ authority: options.authority, signal: options.signal });
  });
  const [library, metadata] = await Promise.allSettled([readLibrary(), readMetadata()]);
  return Object.freeze({
    libraryRightsById: library.status === "fulfilled" ? library.value : new Map<string, StudioBg3dAttachmentRights>(),
    metadataByHash: metadata.status === "fulfilled"
      ? new Map(metadata.value.map((record) => [record.contentHash, record] as const))
      : new Map<string, StudioBg3dAssetMetadata>(),
    failed: Object.freeze({
      library: library.status === "rejected",
      metadata: metadata.status === "rejected",
    }),
  });
}
