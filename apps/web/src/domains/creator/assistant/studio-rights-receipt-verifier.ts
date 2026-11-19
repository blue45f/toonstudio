import { verifyWorkflowPackReceiptIntegrity } from "./studio-workflow-pack-export-bundle";

import type { StudioWorkflowPack, WorkflowPackLicenseCode } from "./studio-workflow-pack";
import type { StudioWorkflowPackRightsReceipt } from "./studio-workflow-pack-rights-receipt";

export interface RightsReceiptVerificationResult {
  readonly validFormat: boolean;
  readonly clearedForCommercialExport: boolean;
  readonly integrityVerified: boolean | null;
  readonly packId: string | null;
  readonly packName: string | null;
  readonly integrityHash: string | null;
  readonly blockedLicenses: readonly WorkflowPackLicenseCode[];
  readonly summary: string;
}

const VALID_LICENSES = new Set<WorkflowPackLicenseCode>([
  "CC0",
  "MIT",
  "COMMERCIAL",
  "CC-BY-NC",
  "GPL-3.0",
]);

function parseReceiptObject(raw: string): StudioWorkflowPackRightsReceipt | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.receiptSchemaVersion !== 1) return null;
    if (typeof obj.packId !== "string" || obj.packId.trim().length === 0) return null;
    if (typeof obj.packName !== "string" || obj.packName.trim().length === 0) return null;
    if (typeof obj.generatedAtIso !== "string") return null;
    if (typeof obj.clearedForCommercialExport !== "boolean") return null;
    if (typeof obj.integrityHash !== "string" || !/^fnv1a-[0-9a-f]{8}$/.test(obj.integrityHash)) {
      return null;
    }
    if (!Array.isArray(obj.blockedLicenses) || !Array.isArray(obj.assets)) return null;
    for (const lic of obj.blockedLicenses) {
      if (!VALID_LICENSES.has(lic as WorkflowPackLicenseCode)) return null;
    }
    return parsed as StudioWorkflowPackRightsReceipt;
  } catch {
    return null;
  }
}

/**
 * 외부에서 제출된 `rights-bom-receipt.json` 문자열을 파싱·검증한다.
 * 선택적으로 원본 `StudioWorkflowPack` 을 함께 넘기면 `integrityHash` 변조 여부까지 대조한다.
 */
export function verifySubmittedRightsReceipt(
  rawJson: string,
  referencePack?: StudioWorkflowPack,
): RightsReceiptVerificationResult {
  const receipt = parseReceiptObject(rawJson.trim());
  if (!receipt) {
    return {
      validFormat: false,
      clearedForCommercialExport: false,
      integrityVerified: null,
      packId: null,
      packName: null,
      integrityHash: null,
      blockedLicenses: [],
      summary: "올바른 rights-bom-receipt.json(schemaVersion: 1) 형식이 아닙니다.",
    };
  }

  const integrityVerified = referencePack
    ? verifyWorkflowPackReceiptIntegrity(referencePack, receipt)
    : null;

  if (integrityVerified === false) {
    return {
      validFormat: true,
      clearedForCommercialExport: false,
      integrityVerified: false,
      packId: receipt.packId,
      packName: receipt.packName,
      integrityHash: receipt.integrityHash,
      blockedLicenses: receipt.blockedLicenses,
      summary: "해시 불일치: 증명서 발급 이후 팩 구성 또는 라이선스가 변경되었습니다.",
    };
  }

  if (!receipt.clearedForCommercialExport || receipt.blockedLicenses.length > 0) {
    return {
      validFormat: true,
      clearedForCommercialExport: false,
      integrityVerified,
      packId: receipt.packId,
      packName: receipt.packName,
      integrityHash: receipt.integrityHash,
      blockedLicenses: receipt.blockedLicenses,
      summary: `상업 연재 제한 항목 감지 (${receipt.blockedLicenses.join(", ")})`,
    };
  }

  return {
    validFormat: true,
    clearedForCommercialExport: true,
    integrityVerified,
    packId: receipt.packId,
    packName: receipt.packName,
    integrityHash: receipt.integrityHash,
    blockedLicenses: [],
    summary:
      integrityVerified === true
        ? `무결성 대조 완료 · 상업 연재 클린 (${receipt.integrityHash})`
        : `형식 및 상업 라이선스 클린 확인 (${receipt.integrityHash})`,
  };
}
