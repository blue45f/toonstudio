/**
 * 가져온 .skp 자산의 메타데이터 기록 — 변환 보고서 v1 을 자산 메타데이터(skpImport)로 남긴다.
 *
 * 규칙
 * - 이 기록은 편의 정보다. 저장하지 못해도 가져오기는 성공이며, 그 사실은 결과 화면에 그대로 알린다
 *   (조용히 건너뛰지 않는다).
 * - 식별자는 정규화된 GLB 의 SHA-256 하나다. 같은 해시의 기록이 이미 있으면 사용자 편집(즐겨찾기·태그·
 *   컬렉션)을 덮어쓰지 않도록 그대로 둔다.
 * - 저장소 모듈은 SQLite/OPFS 권한을 끌어오므로 실제로 쓸 때만 동적으로 불러온다.
 * - 보고서 이름 목록은 저장 한도(STUDIO_BG3D_SKP_STORED_MAX_NAMES)로 줄인다. 전체 개수는 total 에 남는다.
 */

import {
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
  type StudioBg3dAssetRightsReceipt,
} from "./studio-bg3d-asset-metadata";

import { notifyStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";
import { pickStudioBg3dImportedMetadata } from "./studio-bg3d-import-rights-receipt";
import {
  STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS,
  createStudioBg3dImportSaveScope,
  raceStudioBg3dImportSave,
} from "./studio-bg3d-import-save-interrupt";

import type { StudioBg3dImportAiUse } from "./studio-bg3d-import-ai-use";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSkpImportReport, StudioBg3dSkpReportNameList } from "./studio-bg3d-skp-import-report";

/** 변환 보고서가 자산 메타데이터에 어떻게 기록됐는지(결과 화면이 그대로 알린다). skipped 는 기록을 시도하지 않았다는 뜻이다. */
export type StudioBg3dSkpMetadataStatus = "saved" | "existing" | "failed" | "skipped";

/** 자산 메타데이터에 저장하는 이름 수(목록마다). 보고서 화면은 변환 직후 전체(최대 64)를 보여 준다. */
export const STUDIO_BG3D_SKP_STORED_MAX_NAMES = 16;

const FALLBACK_ASSET_NAME = "SketchUp 모델";

/** 저장소에 기록할 가져온 자산의 사실. 라이브러리 레코드에서 필요한 값만 추려 넘긴다. */
export interface StudioBg3dSkpImportedAsset {
  /** 가져오기 계획의 원본 경로(보고서와 짝을 맞추는 키). 메타데이터에는 저장하지 않는다. */
  readonly sourcePath: string;
  readonly name: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly triangles: number;
  readonly textures: number;
  readonly rights: Pick<StudioBg3dAttachmentRights, "status" | "commercialUse" | "licenseName">;
  /** 가져오기 권리 폼에서 고른 AI 사용 표기. 라이브러리 레코드가 담을 수 없어 따로 받는다. 없으면 미확인. */
  readonly aiUse?: StudioBg3dImportAiUse;
}

function compactNameList(list: StudioBg3dSkpReportNameList): StudioBg3dSkpReportNameList {
  if (list.items.length <= STUDIO_BG3D_SKP_STORED_MAX_NAMES) return list;
  return {
    available: list.available,
    items: list.items.slice(0, STUDIO_BG3D_SKP_STORED_MAX_NAMES),
    total: list.total,
    truncated: true,
  };
}

/** 저장용으로 이름 목록만 줄인 보고서 사본. 나머지 필드(계약 v1)는 그대로다. */
export function compactStudioBg3dSkpReportForStorage(report: StudioBg3dSkpImportReport): StudioBg3dSkpImportReport {
  return {
    ...report,
    names: {
      components: compactNameList(report.names.components),
      tags: compactNameList(report.names.tags),
      scenes: compactNameList(report.names.scenes),
    },
  };
}

function candidateRecord(
  asset: StudioBg3dSkpImportedAsset,
  report: StudioBg3dSkpImportReport,
  name: string,
  now: number,
  rights: StudioBg3dAssetRightsReceipt,
): unknown {
  return {
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: asset.contentHash,
    name,
    format: "skp",
    createdAt: now,
    updatedAt: now,
    byteSize: asset.byteSize,
    triangles: asset.triangles,
    textures: asset.textures,
    favorite: false,
    collections: [],
    tags: [],
    rights,
    skpImport: compactStudioBg3dSkpReportForStorage(report),
  };
}

/**
 * 가져온 자산과 보고서로 메타데이터 기록을 만든다. 이름이 저장 규칙(마크업·URL 금지 등)에 맞지 않으면
 * 일반 이름으로 바꿔 다시 시도하고, 그래도 안 되면 null.
 */
export function buildStudioBg3dSkpAssetMetadata(
  asset: StudioBg3dSkpImportedAsset,
  report: StudioBg3dSkpImportReport,
  now: number,
): StudioBg3dAssetMetadata | null {
  // 라이선스 이름이 저장 규칙에 걸려도 권리 상태·AI 표기는 지킨다(→ studio-bg3d-import-rights-receipt).
  const build = (name: string) => pickStudioBg3dImportedMetadata(asset.rights, asset.aiUse, (rights) =>
    normalizeStudioBg3dAssetMetadata(candidateRecord(asset, report, name, now, rights)));
  return build(asset.name) ?? build(FALLBACK_ASSET_NAME);
}

/** 메타데이터 저장소 중 이 모듈이 쓰는 두 동작. 테스트는 가짜를 주입한다. */
export interface StudioBg3dSkpMetadataStore {
  readonly get: (contentHash: string, signal?: AbortSignal) => Promise<StudioBg3dAssetMetadata | null>;
  readonly put: (values: readonly StudioBg3dAssetMetadata[], signal?: AbortSignal) => Promise<unknown>;
}

export interface StudioBg3dSkpMetadataDeps {
  readonly now?: () => number;
  readonly loadStore?: () => Promise<StudioBg3dSkpMetadataStore>;
  /** 가져오기 취소 신호. 서면 저장을 멈추고 failed 로 돌려준다. */
  readonly signal?: AbortSignal;
  /** 저장소가 응답하지 않을 때 기다리는 한도(ms). 넘으면 failed 로 돌려준다. */
  readonly timeoutMs?: number;
}

/** 기본 저장소(V12 SQLite/OPFS 권한)를 처음 쓸 때 불러온다. */
export async function loadStudioBg3dSkpMetadataStore(): Promise<StudioBg3dSkpMetadataStore> {
  const store = await import("./studio-bg3d-asset-metadata-store");
  return {
    get: (contentHash, signal) => store.getStudioBg3dAssetMetadata(contentHash, { signal }),
    put: (values, signal) => store.putStudioBg3dAssetMetadataAtomically(values, { signal }),
  };
}

/**
 * 변환 보고서를 자산 메타데이터에 기록한다. 결과는 사용자에게 그대로 알리는 상태값이다.
 * saved: 새로 기록 / existing: 같은 자산의 기록이 이미 있어 그대로 둠 / failed: 저장하지 못함.
 * 가져오기 취소 신호나 시간 한도(기본 15초)에 걸리면 기다림을 멈추고 failed 로 돌려준다. 저장소 쪽 작업이 이미 쓰는 중일 수 있어
 * 쓰지 않았다는 보장은 아니다.
 */
export async function persistStudioBg3dSkpAssetMetadata(
  asset: StudioBg3dSkpImportedAsset,
  report: StudioBg3dSkpImportReport,
  deps: StudioBg3dSkpMetadataDeps = {},
): Promise<StudioBg3dSkpMetadataStatus> {
  if (deps.signal?.aborted) return "failed";
  const scope = createStudioBg3dImportSaveScope(deps.signal, deps.timeoutMs ?? STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS);
  try {
    const record = buildStudioBg3dSkpAssetMetadata(asset, report, (deps.now ?? Date.now)());
    if (!record) return "failed";
    const store = await raceStudioBg3dImportSave((deps.loadStore ?? loadStudioBg3dSkpMetadataStore)(), scope);
    if (await raceStudioBg3dImportSave(store.get(record.contentHash, scope.signal), scope)) return "existing";
    await raceStudioBg3dImportSave(store.put([record], scope.signal), scope);
    notifyStudioBg3dAssetRightsChanged();
    return "saved";
  } catch {
    return "failed";
  } finally {
    scope.dispose();
  }
}
