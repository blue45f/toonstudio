import {
  generateWorkflowPackRightsReceipt,
  serializeWorkflowPackRightsReceipt,
  type StudioWorkflowPackRightsReceipt,
} from "./studio-workflow-pack-rights-receipt";

import type { StudioWorkflowPack } from "./studio-workflow-pack";

export const RIGHTS_RECEIPT_FILENAME = "rights-bom-receipt.json";
export const PNG_RIGHTS_TEXT_KEYWORD = "ToonStudioRightsBOM";

export interface WorkflowPackExportReceiptAttachment {
  readonly filename: typeof RIGHTS_RECEIPT_FILENAME;
  readonly mimeType: "application/json";
  readonly content: string;
  readonly receipt: StudioWorkflowPackRightsReceipt;
  readonly pngTextChunk: {
    readonly keyword: typeof PNG_RIGHTS_TEXT_KEYWORD;
    readonly text: string;
  };
}

/**
 * ZIP/원고 내보내기 파이프라인에 바로 동봉할 수 있는 `rights-bom-receipt.json` 첨부물과
 * PNG tEXt 청크용 경량 메타데이터 페이로드를 함께 생성한다.
 */
export function buildWorkflowPackExportReceiptAttachment(
  pack: StudioWorkflowPack,
  generatedAtIso = new Date().toISOString(),
): WorkflowPackExportReceiptAttachment {
  const receipt = generateWorkflowPackRightsReceipt(pack, generatedAtIso);
  const content = serializeWorkflowPackRightsReceipt(receipt);
  const pngTextPayload = JSON.stringify({
    v: receipt.receiptSchemaVersion,
    packId: receipt.packId,
    cleared: receipt.clearedForCommercialExport,
    hash: receipt.integrityHash,
  });

  return {
    filename: RIGHTS_RECEIPT_FILENAME,
    mimeType: "application/json",
    content,
    receipt,
    pngTextChunk: {
      keyword: PNG_RIGHTS_TEXT_KEYWORD,
      text: pngTextPayload,
    },
  };
}

/**
 * 내보낸 증명서의 `integrityHash`가 현재 팩 상태와 일치하는지 재계산하여 무결성을 검증한다.
 */
export function verifyWorkflowPackReceiptIntegrity(
  pack: StudioWorkflowPack,
  receipt: StudioWorkflowPackRightsReceipt,
): boolean {
  const recomputed = generateWorkflowPackRightsReceipt(pack, receipt.generatedAtIso);
  return recomputed.integrityHash === receipt.integrityHash;
}
