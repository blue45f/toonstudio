/**
 * 가져오기 권리 폼의 AI 사용 표기 — 읽기·결과 상태·사용자 안내 문구.
 *
 * 이 모듈은 의존하는 모듈이 없다(타입만 가져온다). 편집기 정적 그래프에 들어가는 가져오기 동작이 이것만 불러오고,
 * 메타데이터 저장 본체(studio-bg3d-import-asset-metadata, zod 폐포 포함)는 AI 답이 있을 때만 동적으로 불러온다.
 */

import type { StudioBg3dAssetAiGenerated, StudioBg3dAssetAiTraining } from "./studio-bg3d-asset-metadata";

export interface StudioBg3dImportAiUse {
  readonly aiGenerated?: StudioBg3dAssetAiGenerated;
  readonly aiTraining?: StudioBg3dAssetAiTraining;
}

/**
 * 저장 결과. skipped: 쓸 답이 없음 / saved: 새로 기록 / existing: 이미 기록이 있어 그대로 둠 /
 * partial: 일부만 기록 / failed: 저장 못 함 / cancelled: 가져오기를 취소해 저장하지 않음.
 */
export type StudioBg3dImportAiUseStatus = "skipped" | "saved" | "existing" | "partial" | "failed" | "cancelled";

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

/**
 * 여러 묶음(.skp와 그 밖의 형식을 함께 가져온 경우)의 결과를 하나로 합친다.
 * 쓴 것이 없는 묶음(skipped)은 결과에 영향을 주지 않고, 실패·취소가 있으면 그대로 드러내며, 서로 다르면 일부만 기록한 것이다.
 */
export function combineStudioBg3dImportAiUseStatus(
  left: StudioBg3dImportAiUseStatus,
  right: StudioBg3dImportAiUseStatus,
): StudioBg3dImportAiUseStatus {
  if (left === "skipped") return right;
  if (right === "skipped") return left;
  if (left === "failed" || right === "failed") return "failed";
  if (left === "cancelled" || right === "cancelled") return "cancelled";
  return left === right ? left : "partial";
}

export interface StudioBg3dImportAiUseNotice {
  readonly tone: "info" | "success" | "error";
  readonly message: string;
}

const NOTICES: Readonly<Partial<Record<StudioBg3dImportAiUseStatus, StudioBg3dImportAiUseNotice>>> = {
  saved: { tone: "success", message: "AI 사용 표기를 저장했어요." },
  existing: {
    tone: "info",
    message: "같은 모델의 기록이 이미 있어서 AI 사용 표기를 바꾸지 않았어요. 기존 기록이 그대로 보여요.",
  },
  partial: {
    tone: "info",
    message: "일부 모델은 같은 모델의 기록이 이미 있어서 AI 사용 표기를 바꾸지 않았어요. 나머지는 표기를 저장했어요.",
  },
  failed: {
    tone: "error",
    message: "AI 사용 표기를 저장하지 못했어요. 모델은 가져왔고 목록에는 'AI 미확인'으로 보여요. 저장소 상태를 확인해 주세요. 같은 모델을 다시 가져오면 표기를 다시 남길 수 있어요.",
  },
  cancelled: {
    tone: "info",
    message: "가져오기를 취소해서 AI 사용 표기가 저장되지 않았을 수 있어요. 카드의 권리 상세에서 확인하고, 필요하면 같은 모델을 다시 가져와 주세요.",
  },
};

/** 사용자에게 알려야 하는 결과면 안내(톤 포함), 쓸 답이 없었으면 null. */
export function describeStudioBg3dImportAiUseNotice(status: StudioBg3dImportAiUseStatus): StudioBg3dImportAiUseNotice | null {
  return NOTICES[status] ?? null;
}
