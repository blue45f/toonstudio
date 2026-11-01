import type { StudioOpfsRecoveryJournalIdentity } from "../../../studio-opfs-recovery-journal";

export const HISTORY_RECOVERY_ENGINE_VERSION = "studio-pages-history-command-journal-1";
export const HISTORY_RECOVERY_DOCUMENT_VERSION = 1;

export function hashStudioPagesHistoryIdentity(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function studioPagesHistoryRecoveryIdentity(
  firstPageId: string = "unsaved-document",
): StudioOpfsRecoveryJournalIdentity {
  const pageId = firstPageId.trim() || "unsaved-document";
  return Object.freeze({
    documentId: `history-${hashStudioPagesHistoryIdentity(pageId)}`,
    documentVersion: HISTORY_RECOVERY_DOCUMENT_VERSION,
    engineVersion: HISTORY_RECOVERY_ENGINE_VERSION,
  });
}

export function studioPagesHistoryRecoveryPageId(identity: StudioOpfsRecoveryJournalIdentity): string {
  return `page-${hashStudioPagesHistoryIdentity(identity.documentId)}`;
}

/** history 전용 문서 수명 잠금의 순수 식별자다. 저장소를 열지 않는다. */
export function studioPagesHistoryDocumentKey(firstPageId?: string): string {
  return `history:${studioPagesHistoryRecoveryIdentity(firstPageId).documentId}`;
}
