import {
  evaluateWorkflowPackRightsClearance,
  type StudioWorkflowPack,
  type WorkflowPackLicenseCode,
} from "./studio-workflow-pack";

export interface StudioWorkflowPackRightsReceiptAsset {
  readonly assetLabel: string;
  readonly license: WorkflowPackLicenseCode;
  readonly commercialStatus: "cleared" | "blocked";
}

export interface StudioWorkflowPackRightsReceipt {
  readonly receiptSchemaVersion: 1;
  readonly generatedAtIso: string;
  readonly packId: string;
  readonly packName: string;
  readonly genre: string;
  readonly platformId: StudioWorkflowPack["platformId"];
  readonly clearedForCommercialExport: boolean;
  readonly blockedLicenses: readonly WorkflowPackLicenseCode[];
  readonly summary: string;
  readonly assets: readonly StudioWorkflowPackRightsReceiptAsset[];
  readonly integrityHash: string;
}

const RESTRICTED_LICENSES: ReadonlySet<WorkflowPackLicenseCode> = new Set(["CC-BY-NC", "GPL-3.0"]);

/**
 * 브라우저·Node 어디서나 외부 의존성 없이 동일하게 재현되는 결정적 FNV-1a 32비트 해시.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 연재 플랫폼 제출·팀 검수용 `rights-bom-receipt.json` 증명서를 생성한다.
 */
export function generateWorkflowPackRightsReceipt(
  pack: StudioWorkflowPack,
  generatedAtIso = new Date().toISOString(),
): StudioWorkflowPackRightsReceipt {
  const clearance = evaluateWorkflowPackRightsClearance(pack);
  const assets: StudioWorkflowPackRightsReceiptAsset[] = pack.rightsBom.map((entry) => ({
    assetLabel: entry.assetLabel,
    license: entry.license,
    commercialStatus: RESTRICTED_LICENSES.has(entry.license) ? "blocked" : "cleared",
  }));

  const canonicalPayload = JSON.stringify({
    packId: pack.id,
    packName: pack.name,
    platformId: pack.platformId,
    clearedForCommercialExport: clearance.clearedForCommercialExport,
    assets,
  });

  return {
    receiptSchemaVersion: 1,
    generatedAtIso,
    packId: pack.id,
    packName: pack.name,
    genre: pack.genre,
    platformId: pack.platformId,
    clearedForCommercialExport: clearance.clearedForCommercialExport,
    blockedLicenses: clearance.blockedLicenses,
    summary: clearance.summary,
    assets,
    integrityHash: fnv1aHex(canonicalPayload),
  };
}

export function serializeWorkflowPackRightsReceipt(
  receipt: StudioWorkflowPackRightsReceipt,
): string {
  return JSON.stringify(receipt, null, 2);
}
