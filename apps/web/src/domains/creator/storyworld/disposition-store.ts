/** 이슈 처리 상태의 로컬 저장 래퍼 — 보조 저장소(universe-store의 aux store)를 공유한다. */
import {
  EMPTY_STORYWORLD_ISSUE_DISPOSITIONS,
  parseStoryworldIssueDispositions,
  storyworldIssueDispositionKey,
  type StoryworldIssueDispositionDocument,
} from "./studio-storyworld-issue-dispositions";
import { storyworldAuxStore } from "./universe-store";

export async function loadStoryworldIssueDispositions(scopeKey: string): Promise<StoryworldIssueDispositionDocument> {
  const raw = await storyworldAuxStore.load(storyworldIssueDispositionKey(scopeKey));
  if (raw === null) return { ...EMPTY_STORYWORLD_ISSUE_DISPOSITIONS, scopeKey };
  return parseStoryworldIssueDispositions(raw, scopeKey);
}

export function saveStoryworldIssueDispositions(document: StoryworldIssueDispositionDocument): Promise<void> {
  return storyworldAuxStore.save(
    storyworldIssueDispositionKey(document.scopeKey),
    JSON.stringify({ version: 1, dispositions: document.dispositions }),
  );
}
