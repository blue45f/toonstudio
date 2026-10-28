import {
  canonicalizeStudioAssetContentHash,
  findStudioAssetCandidatesByContentIdentity,
  saveAsset,
  type StudioAsset,
  type StudioAssetRightsMetadata,
  type StudioAssetWithContentHash,
} from "../studio-asset-library";
import { parseStudioBundleSourceCredit, requireStudioBundleSourceCredit } from "./studio-bundle-source-credit";

import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.panelStatus.bundleLibrary.licenseSpecificUsage": "이용 권리는 각 소품 카드의 라이선스를 따릅니다. CC0 소품은 CC0 조건에 따라 이용·수정·재배포할 수 있습니다. 이 라이브러리는 렌더 이미지 삽입을 제공하며 원본 3D 모델을 내려받는 동선은 제공하지 않습니다.",
  "studio.panelStatus.bundleLibrary.personalSave.action": "개인 라이브러리에 저장",
  "studio.panelStatus.bundleLibrary.personalSave.saving": "개인 라이브러리에 저장 중…",
  "studio.panelStatus.bundleLibrary.personalSave.saved": "개인 라이브러리에 저장됨",
  "studio.panelStatus.bundleLibrary.personalSave.retry": "저장 다시 시도",
  "studio.panelStatus.bundleLibrary.personalSave.success": "개인 라이브러리에 저장했습니다. ‘내 에셋’ 탭에서 다시 사용할 수 있습니다.",
  "studio.panelStatus.bundleLibrary.personalSave.existing": "이미 저장된 소품입니다. ‘내 에셋’ 탭에서 다시 사용할 수 있습니다.",
  "studio.panelStatus.bundleLibrary.personalSave.failed": "개인 라이브러리에 저장하지 못했습니다. 저장 공간과 접근 권한을 확인한 뒤 다시 시도해 주세요.",
  "studio.panelStatus.bundleLibrary.personalSave.refreshFailed": "개인 라이브러리에 저장했습니다. 소재 서재를 다시 열어 ‘내 에셋’ 탭에서 확인해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.panelStatus.bundleLibrary.licenseSpecificUsage": "Usage rights follow each item's license. CC0 items may be used, modified and redistributed under CC0. This library inserts rendered images and does not provide downloads of the original 3D models.",
  "studio.panelStatus.bundleLibrary.personalSave.action": "Save to personal library",
  "studio.panelStatus.bundleLibrary.personalSave.saving": "Saving to personal library…",
  "studio.panelStatus.bundleLibrary.personalSave.saved": "Saved to personal library",
  "studio.panelStatus.bundleLibrary.personalSave.retry": "Retry saving",
  "studio.panelStatus.bundleLibrary.personalSave.success": "Saved to your personal library. Reuse it from the My Assets tab.",
  "studio.panelStatus.bundleLibrary.personalSave.existing": "This item is already saved. Reuse it from the My Assets tab.",
  "studio.panelStatus.bundleLibrary.personalSave.failed": "Could not save to your personal library. Check storage space and permissions, then retry.",
  "studio.panelStatus.bundleLibrary.personalSave.refreshFailed": "Saved to your personal library. Reopen the asset library and check the My Assets tab.",
});

const RIGHTS_IDENTITY_FIELDS: readonly (keyof StudioAssetRightsMetadata)[] = [
  "sourceKind", "sourceId", "licenseId", "licenseLabel", "licenseUrl", "attributionRequired",
  "attributionText", "rightsConfirmed",
];

/** 바이트가 같아도 출처·권리가 다르면 기존 개인 에셋에 합치지 않는다. 이름 변경은 보존한다. */
function sameBundleAssetIdentity(candidate: StudioAsset, record: StudioAsset): boolean {
  const expectedHash = canonicalizeStudioAssetContentHash(record.contentHash);
  const currentCredit = parseStudioBundleSourceCredit(record.bundleSourceCredit);
  const candidateCredit = parseStudioBundleSourceCredit(candidate.bundleSourceCredit);
  return expectedHash !== null && canonicalizeStudioAssetContentHash(candidate.contentHash) === expectedHash
    && candidate.width === record.width && candidate.height === record.height && candidate.kind === record.kind
    && currentCredit !== null && candidateCredit !== null
    && JSON.stringify(candidateCredit) === JSON.stringify(currentCredit)
    && candidate.rights !== undefined && record.rights !== undefined
    && RIGHTS_IDENTITY_FIELDS.every(key => candidate.rights?.[key] === record.rights?.[key]);
}

export interface StudioBundlePersonalSaveResult {
  readonly asset: StudioAssetWithContentHash;
  readonly reused: boolean;
}

/** SQLite/OPFS 제품 포트로만 저장한다. 실패를 메모리 보관이나 캔버스 삽입으로 대체하지 않는다. */
export async function saveStudioBundleToPersonalLibrary(
  record: StudioAsset,
  signal?: AbortSignal,
): Promise<StudioBundlePersonalSaveResult> {
  const contentHash = canonicalizeStudioAssetContentHash(record.contentHash);
  const credit = requireStudioBundleSourceCredit(record.bundleSourceCredit);
  if (!contentHash || credit.contentHash !== contentHash || !record.rights?.rightsConfirmed) {
    throw new TypeError("번들 이미지의 콘텐츠 해시·권리·출처 기록이 일치하지 않습니다.");
  }
  signal?.throwIfAborted();
  const candidates = await findStudioAssetCandidatesByContentIdentity({contentHash, signal});
  signal?.throwIfAborted();
  const existing = candidates.find(candidate => sameBundleAssetIdentity(candidate, record));
  if (existing) return {asset: {...existing, contentHash}, reused: true};
  const saved = await saveAsset({
    name: record.name, dataUrl: record.dataUrl, width: record.width, height: record.height,
    kind: record.kind, contentHash, rights: record.rights, bundleSourceCredit: credit,
  });
  // 저장이 끝난 뒤 취소됐어도 이미 완료된 커밋을 실패로 보고하지 않는다.
  if (!sameBundleAssetIdentity(saved, record)) throw new TypeError("저장한 번들 이미지의 권리·출처 기록을 확인하지 못했습니다.");
  return {asset: saved, reused: false};
}
