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
 * - 저장소 모듈은 SQLite/OPFS 권한을 끌어오므로 실제로 쓸 때만 동적으로 불러온다.
 * - .skp 는 변환 보고서와 함께 별도 경로(studio-bg3d-skp-asset-metadata)가 기록하므로 이 모듈은 건드리지 않는다.
 */

import {
  STUDIO_BG3D_ASSET_METADATA_LIMITS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";

import type {
  StudioBg3dAssetAiGenerated,
  StudioBg3dAssetAiTraining,
  StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

export interface StudioBg3dImportAiUse {
  readonly aiGenerated?: StudioBg3dAssetAiGenerated;
  readonly aiTraining?: StudioBg3dAssetAiTraining;
}

/** 저장 결과. skipped: 쓸 것이 없음 / saved: 새로 기록 / existing: 이미 기록이 있어 그대로 둠 / partial: 일부만 기록 / failed: 저장 못 함. */
export type StudioBg3dImportAiUseStatus = "skipped" | "saved" | "existing" | "partial" | "failed";

/** 가져오기 권리 폼 값에서 AI 표기만 골라 낸다. 알 수 없는 값은 미확인(없음)으로 본다. */
export function readStudioBg3dImportAiUse(rights: unknown): StudioBg3dImportAiUse {
  if (typeof rights !== "object" || rights === null) return {};
  const { aiGenerated, aiTraining } = rights as Record<string, unknown>;
  return {
    ...(aiGenerated === "yes" || aiGenerated === "no" ? { aiGenerated } : {}),
    ...(aiTraining === "allowed" || aiTraining === "prohibited" ? { aiTraining } : {}),
  };
}

export function hasStudioBg3dImportAiUse(aiUse: StudioBg3dImportAiUse | undefined): aiUse is StudioBg3dImportAiUse {
  return aiUse?.aiGenerated !== undefined || aiUse?.aiTraining !== undefined;
}

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

/** 가져온 레코드와 AI 표기로 메타데이터 기록을 만든다. 저장 규칙에 맞는 기록을 만들 수 없으면 null. */
export function buildStudioBg3dImportedAssetMetadata(
  record: StudioBg3dImportedRecordLike,
  aiUse: StudioBg3dImportAiUse,
  now: number,
): StudioBg3dAssetMetadata | null {
  const known = record.rights.status !== "unknown";
  const build = (name: string) => normalizeStudioBg3dAssetMetadata({
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
    rights: {
      status: record.rights.status,
      commercialUse: known && record.rights.commercialUse,
      // 팀 공유는 이 가져오기가 확인한 적이 없으므로 항상 금지한다.
      teamShareAllowed: false,
      ...(record.rights.licenseName ? { license: record.rights.licenseName } : {}),
      ...(aiUse.aiGenerated ? { aiGenerated: aiUse.aiGenerated } : {}),
      ...(aiUse.aiTraining ? { aiTraining: aiUse.aiTraining } : {}),
    },
  });
  return build(record.name) ?? build(FALLBACK_ASSET_NAME);
}

/** 메타데이터 저장소 중 이 모듈이 쓰는 두 동작. 시험은 가짜를 주입한다. */
export interface StudioBg3dImportMetadataStore {
  readonly get: (contentHash: string) => Promise<StudioBg3dAssetMetadata | null>;
  readonly put: (values: readonly StudioBg3dAssetMetadata[]) => Promise<unknown>;
}

export interface StudioBg3dImportMetadataDeps {
  readonly now?: () => number;
  readonly loadStore?: () => Promise<StudioBg3dImportMetadataStore>;
}

async function loadDefaultStore(): Promise<StudioBg3dImportMetadataStore> {
  const store = await import("./studio-bg3d-asset-metadata-store");
  return {
    get: (contentHash) => store.getStudioBg3dAssetMetadata(contentHash),
    put: (values) => store.putStudioBg3dAssetMetadataAtomically(values),
  };
}

/** AI 표기를 가져온 소재의 메타데이터 기록으로 남긴다. 어떤 경우에도 던지지 않는다. */
export async function persistStudioBg3dImportedAiUse(
  records: readonly StudioBg3dImportedRecordLike[],
  aiUse: StudioBg3dImportAiUse | undefined,
  deps: StudioBg3dImportMetadataDeps = {},
): Promise<StudioBg3dImportAiUseStatus> {
  if (!hasStudioBg3dImportAiUse(aiUse) || records.length === 0) return "skipped";
  try {
    const now = (deps.now ?? Date.now)();
    const store = await (deps.loadStore ?? loadDefaultStore)();
    const fresh: StudioBg3dAssetMetadata[] = [];
    let existing = 0;
    for (const record of records) {
      const metadata = buildStudioBg3dImportedAssetMetadata(record, aiUse, now);
      if (!metadata) return "failed";
      if (await store.get(metadata.contentHash)) existing += 1;
      else if (!fresh.some(({ contentHash }) => contentHash === metadata.contentHash)) fresh.push(metadata);
    }
    if (fresh.length > 0) await store.put(fresh);
    if (fresh.length === 0) return "existing";
    return existing > 0 ? "partial" : "saved";
  } catch {
    return "failed";
  }
}

const STATUS_NOTICE: Readonly<Partial<Record<StudioBg3dImportAiUseStatus, string>>> = {
  failed: "AI 사용 표기를 저장하지 못했습니다. 모델은 가져왔으며 목록에서는 'AI 미확인'으로 표시됩니다. 저장소 상태를 확인한 뒤 다시 가져오면 표기를 남길 수 있습니다.",
  existing: "같은 모델의 기록이 이미 있어 AI 사용 표기를 바꾸지 않았습니다. 기존 기록이 그대로 표시됩니다.",
  partial: "일부 모델은 같은 모델의 기록이 이미 있어 AI 사용 표기를 바꾸지 않았습니다. 나머지는 표기를 저장했습니다.",
};

/** 사용자에게 알려야 하는 결과면 안내 문구, 아니면 null. */
export function describeStudioBg3dImportAiUseNotice(status: StudioBg3dImportAiUseStatus): string | null {
  return STATUS_NOTICE[status] ?? null;
}
