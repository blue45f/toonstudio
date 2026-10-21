/**
 * 가져온 3D 소재의 AI 사용 표기를 자산 메타데이터 저장소에 남긴다.
 *
 * 라이브러리 레코드의 권리(`StudioBg3dAttachmentRights`)는 장면 문서에 그대로 실리는 닫힌 형식이라 AI 표기를 담을 수
 * 없다. 그래서 사용자가 가져오기 권리 폼에서 AI 표기를 고른 경우에만 메타데이터 기록(V3)을 만든다.
 *
 * 규칙
 * - AI 표기를 하나도 고르지 않았다면(모두 "모름") 아무것도 쓰지 않는다. 기록이 없으면 미확인으로 읽힌다.
 * - 같은 콘텐츠 해시의 기록이 이미 있으면 덮어쓰지 않고 그 사실을 상태로 알린다(사용자 편집 보존).
 * - 저장하지 못해도 가져오기 자체는 성공이다. 대신 결과를 상태로 돌려주어 호출한 쪽이 사용자에게 그대로 알린다.
 * - 가져오기 취소 신호를 받으면 멈추고, 저장소가 응답하지 않아도 시간 한도 뒤에 멈춘다. 호출한 쪽은 장면 반영을 끝낸 뒤에
 *   부르므로, 저장이 느려도 가져오기가 멈추지 않는다.
 * - 새 기록이 쓰이면 권리 읽기 훅이 다시 읽도록 알린다(카드는 저장보다 먼저 그려진다).
 * - 이 모듈은 asset-metadata(zod 폐포)를 끌어오므로 편집기 정적 그래프에서 불러오지 않는다. 가져오기 동작은 AI 답이 있을 때만
 *   동적으로 불러온다. 읽기·상태·안내 문구는 의존 없는 studio-bg3d-import-ai-use 에 있다.
 * - 저장소 모듈은 SQLite/OPFS 권한을 끌어오므로 실제로 쓸 때만 동적으로 불러온다.
 * - .skp 는 변환 보고서와 함께 별도 경로(studio-bg3d-skp-asset-metadata)가 기록하므로 이 모듈은 건드리지 않는다.
 */

import {
  STUDIO_BG3D_ASSET_METADATA_LIMITS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import { notifyStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";
import { hasImportAiUseLazy } from "./studio-bg3d-import-ai-use-lazy";
import { pickStudioBg3dImportedMetadata } from "./studio-bg3d-import-rights-receipt";
import {
  STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS,
  StudioBg3dImportSaveInterrupted,
  createStudioBg3dImportSaveScope,
  raceStudioBg3dImportSave,
} from "./studio-bg3d-import-save-interrupt";

import type { StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";
import type { StudioBg3dImportAiUse, StudioBg3dImportAiUseStatus } from "./studio-bg3d-import-ai-use";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

/** 저장된 라이브러리 레코드 중 이 모듈이 읽는 필드. */
export interface StudioBg3dImportedRecordLike {
  readonly name: string;
  readonly contentHash: string;
  readonly byteSize: number;
  readonly validatorMetrics: { readonly triangles: number; readonly textures: number };
  readonly rights: StudioBg3dAttachmentRights;
}

const FALLBACK_ASSET_NAME = "3D 모델";

function boundedMetric(value: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

/**
 * 가져온 레코드와 AI 표기로 메타데이터 기록을 만든다. 저장 규칙에 맞는 기록을 만들 수 없으면 null.
 * 라이선스 이름이 저장 규칙에 걸려도 권리 상태·AI 표기는 지킨다(→ studio-bg3d-import-rights-receipt).
 */
export function buildStudioBg3dImportedAssetMetadata(
  record: StudioBg3dImportedRecordLike,
  aiUse: StudioBg3dImportAiUse,
  now: number,
): StudioBg3dAssetMetadata | null {
  const build = (name: string) => pickStudioBg3dImportedMetadata(record.rights, aiUse, (rights) =>
    normalizeStudioBg3dAssetMetadata({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: record.contentHash,
      name,
      format: "glb",
      createdAt: now,
      updatedAt: now,
      byteSize: record.byteSize,
      triangles: boundedMetric(record.validatorMetrics.triangles, STUDIO_BG3D_ASSET_METADATA_LIMITS.triangles),
      textures: boundedMetric(record.validatorMetrics.textures, STUDIO_BG3D_ASSET_METADATA_LIMITS.textures),
      favorite: false,
      collections: [],
      tags: [],
      rights,
    }));
  return build(record.name) ?? build(FALLBACK_ASSET_NAME);
}

/** 메타데이터 저장소 중 이 모듈이 쓰는 두 동작. 시험은 가짜를 주입한다. */
export interface StudioBg3dImportMetadataStore {
  readonly get: (contentHash: string, signal?: AbortSignal) => Promise<StudioBg3dAssetMetadata | null>;
  readonly put: (values: readonly StudioBg3dAssetMetadata[], signal?: AbortSignal) => Promise<unknown>;
}

export interface StudioBg3dImportMetadataDeps {
  readonly now?: () => number;
  readonly loadStore?: () => Promise<StudioBg3dImportMetadataStore>;
  /** 가져오기 취소 신호. 서면 저장을 멈추고 cancelled 로 돌려준다. */
  readonly signal?: AbortSignal;
  /** 저장소가 응답하지 않을 때 기다리는 한도(ms). 넘으면 failed 로 돌려준다. */
  readonly timeoutMs?: number;
}

/** 저장소 응답을 기다리는 기본 한도. 지역 저장소라 정상이면 훨씬 짧게 끝난다(.skp 경로와 같은 값을 쓴다). */
export const STUDIO_BG3D_IMPORT_AI_USE_SAVE_TIMEOUT_MS = STUDIO_BG3D_IMPORT_SAVE_TIMEOUT_MS;

async function loadDefaultStore(): Promise<StudioBg3dImportMetadataStore> {
  const store = await import("./studio-bg3d-asset-metadata-store");
  return {
    get: (contentHash, signal) => store.getStudioBg3dAssetMetadata(contentHash, { signal }),
    put: (values, signal) => store.putStudioBg3dAssetMetadataAtomically(values, { signal }),
  };
}

/** AI 표기를 가져온 소재의 메타데이터 기록으로 남긴다. 어떤 경우에도 던지지 않는다. */
export async function persistStudioBg3dImportedAiUse(
  records: readonly StudioBg3dImportedRecordLike[],
  aiUse: StudioBg3dImportAiUse | undefined,
  deps: StudioBg3dImportMetadataDeps = {},
): Promise<StudioBg3dImportAiUseStatus> {
  if (!hasImportAiUseLazy(aiUse) || records.length === 0) return "skipped";
  if (deps.signal?.aborted) return "cancelled";
  const scope = createStudioBg3dImportSaveScope(deps.signal, deps.timeoutMs ?? STUDIO_BG3D_IMPORT_AI_USE_SAVE_TIMEOUT_MS);
  try {
    const now = (deps.now ?? Date.now)();
    const store = await raceStudioBg3dImportSave((deps.loadStore ?? loadDefaultStore)(), scope);
    const fresh: StudioBg3dAssetMetadata[] = [];
    let existing = 0;
    for (const record of records) {
      const metadata = buildStudioBg3dImportedAssetMetadata(record, aiUse, now);
      if (!metadata) return "failed";
      if (await raceStudioBg3dImportSave(store.get(metadata.contentHash, scope.signal), scope)) existing += 1;
      else if (!fresh.some(({ contentHash }) => contentHash === metadata.contentHash)) fresh.push(metadata);
    }
    if (fresh.length === 0) return "existing";
    await raceStudioBg3dImportSave(store.put(fresh, scope.signal), scope);
    notifyStudioBg3dAssetRightsChanged();
    return existing > 0 ? "partial" : "saved";
  } catch (cause) {
    if (cause instanceof StudioBg3dImportSaveInterrupted) return cause.reason === "cancelled" ? "cancelled" : "failed";
    return "failed";
  } finally {
    scope.dispose();
  }
}
