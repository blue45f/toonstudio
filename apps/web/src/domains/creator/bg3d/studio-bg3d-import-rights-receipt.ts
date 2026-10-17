/**
 * 가져온 소재의 라이브러리 권리를 메타데이터 권리 영수증으로 옮길 때 쓰는 후보 목록.
 *
 * 라이브러리는 라이선스 이름에 `<`·`>`·URL 같은 글자를 받아들이지만, 메타데이터 저장 규칙은 그런 글자를 거절하고 권리 전체를
 * 미확인으로 내린다. 그러면 라이브러리에는 "구매·허가"로 적힌 소재가 저장소에는 "미확인"으로 남아, 두 기록이 어긋난다.
 * 상태·상업 사용·AI 표기는 이름 글자와 무관하므로, 이름이 거절되면 안전한 자리표시 이름(구매·허가) 또는 이름 없음으로 바꿔
 * 상태를 지킨다. 표시할 라이선스 이름은 어디서나 라이브러리 기록을 쓴다.
 *
 * 이 모듈은 의존하는 모듈이 없다(타입만 가져온다). 저장 규칙을 아는 `build` 는 호출한 쪽이 넘긴다.
 */

import type { StudioBg3dAssetRightsReceipt } from "./studio-bg3d-asset-metadata";
import type { StudioBg3dImportAiUse } from "./studio-bg3d-import-ai-use";
import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

/** 라이선스 이름이 저장 규칙에 맞지 않을 때 대신 적는 이름. 표시에는 쓰이지 않는다(표시는 라이브러리 기록). */
export const STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER = "라이브러리 기록 참고";

export type StudioBg3dImportedRightsInput = Pick<StudioBg3dAttachmentRights, "status" | "commercialUse" | "licenseName">;

function receiptWith(
  rights: StudioBg3dImportedRightsInput,
  aiUse: StudioBg3dImportAiUse | undefined,
  license: string | undefined,
): StudioBg3dAssetRightsReceipt {
  return {
    status: rights.status,
    commercialUse: rights.status !== "unknown" && rights.commercialUse,
    // 팀 공유는 이 가져오기가 확인한 적이 없으므로 항상 금지한다.
    teamShareAllowed: false,
    ...(license ? { license } : {}),
    ...(aiUse?.aiGenerated ? { aiGenerated: aiUse.aiGenerated } : {}),
    ...(aiUse?.aiTraining ? { aiTraining: aiUse.aiTraining } : {}),
  };
}

/**
 * 시도할 영수증 후보(앞이 우선). 원래 이름 → 자리표시 이름 → 이름 없음 순이다.
 * 자리표시 이름은 이름이 있었는데 저장 규칙에 걸린 구매·허가에만 쓴다. 이름 자체가 없던 구매·허가는 그대로 미확인으로
 * 내려가야 하므로 상태를 넓히지 않는다.
 */
export function listStudioBg3dImportRightsReceipts(
  rights: StudioBg3dImportedRightsInput,
  aiUse: StudioBg3dImportAiUse | undefined,
): readonly StudioBg3dAssetRightsReceipt[] {
  const licenses: Array<string | undefined> = [];
  if (rights.licenseName) {
    licenses.push(rights.licenseName);
    if (rights.status === "licensed") licenses.push(STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER);
  }
  licenses.push(undefined);
  return licenses.map((license) => receiptWith(rights, aiUse, license));
}

/**
 * 후보를 차례로 `build` 에 넣어 라이브러리와 같은 권리 상태를 지킨 첫 기록을 돌려준다. 어느 후보도 상태를 지키지 못하면
 * (예: 이름 없는 구매·허가) 저장 규칙이 내린 첫 기록을 그대로 돌려준다 — 상태를 넓히지 않는 쪽으로만 어긋난다.
 * 기록을 하나도 만들 수 없으면 null.
 */
export function pickStudioBg3dImportedMetadata<T extends { readonly rights: { readonly status: string } }>(
  rights: StudioBg3dImportedRightsInput,
  aiUse: StudioBg3dImportAiUse | undefined,
  build: (receipt: StudioBg3dAssetRightsReceipt) => T | null,
): T | null {
  let downgraded: T | null = null;
  for (const receipt of listStudioBg3dImportRightsReceipts(rights, aiUse)) {
    const record = build(receipt);
    if (!record) continue;
    if (record.rights.status === rights.status) return record;
    downgraded ??= record;
  }
  return downgraded;
}
