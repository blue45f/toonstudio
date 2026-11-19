import { getLatestWorkflowPackRuntimeBindings } from "../assistant/use-workflow-pack-runtime-consumer";

import type { WorkflowPackExportReceiptAttachment } from "../assistant/studio-workflow-pack-export-bundle";

export interface ExportArchiveRightsPayload {
  readonly attached: boolean;
  readonly clearedForCommercialExport: boolean;
  readonly filename: string | null;
  readonly content: string | null;
  readonly pngKeyword: string | null;
  readonly pngText: string | null;
  readonly summary: string;
}

/**
 * 원고 ZIP / PNG 내보내기 시 현재 활성 Workflow Pack 의 `rights-bom-receipt.json` 첨부물과
 * 상업 연재 클린 여부를 어댑터 형식으로 반환한다.
 */
export function resolveExportRightsReceiptPayload(
  explicitAttachment?: WorkflowPackExportReceiptAttachment | null,
): ExportArchiveRightsPayload {
  const attachment =
    explicitAttachment ?? getLatestWorkflowPackRuntimeBindings()?.exportReceiptAttachment ?? null;

  if (!attachment) {
    return {
      attached: false,
      clearedForCommercialExport: true,
      filename: null,
      content: null,
      pngKeyword: null,
      pngText: null,
      summary: "적용된 Workflow Pack 없음 (기본 내보내기 진행)",
    };
  }

  return {
    attached: true,
    clearedForCommercialExport: attachment.receipt.clearedForCommercialExport,
    filename: attachment.filename,
    content: attachment.content,
    pngKeyword: attachment.pngTextChunk.keyword,
    pngText: attachment.pngTextChunk.text,
    summary: attachment.receipt.summary,
  };
}
