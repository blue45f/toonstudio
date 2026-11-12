import { synchronizeServerSessionState } from "@/domains/auth/public/session/auth-session-store";

import type { WorkDetail } from "@/platform/creator-client";

import type { StudioSharedDocument } from "./studio-shared-document-client";

interface StudioDocumentSourceSession {
  readonly workId: string | null;
  readonly authScopeKey: string | null;
  readonly signal: AbortSignal;
  readonly unavailableMessage: string;
}

/** 공개 UI의 ready와 구분해, owner가 없는 작품 소스의 익명 조회 여부만 서버 세션으로 확인한다. */
export async function verifyStudioDocumentSourceSession({
  workId, authScopeKey, signal, unavailableMessage,
}: StudioDocumentSourceSession): Promise<"current" | "identity-changed"> {
  signal.throwIfAborted();
  if (!workId || authScopeKey) return "current";
  const result = await synchronizeServerSessionState("manual");
  signal.throwIfAborted();
  if (result.status === "indeterminate") throw new Error(unavailableMessage);
  // 인증된 identity가 새로 생기면 Provider의 owner 갱신 effect가 private source를 다시 연다.
  return result.status === "authenticated" ? "identity-changed" : "current";
}

interface StudioDocumentSource {
  readonly work: {
    readonly title: string;
    readonly description: string;
    readonly tags: string[];
    readonly format: "cuttoon" | "upload";
    readonly doc: Record<string, unknown>;
  };
  readonly remixAuthorName: string;
  readonly shared: StudioSharedDocument | null;
  readonly detail: WorkDetail | null;
}

/** 소스 읽기만 선택한다. 취소·identity 전환은 null로 끝나 현재 원고를 hydrate하지 않는다. */
export async function loadStudioDocumentSource(options: StudioDocumentSourceSession & {
  readonly targetId: string;
  readonly remixId: string | null;
  readonly isCurrent: () => boolean;
}): Promise<StudioDocumentSource | null> {
  const { workId, authScopeKey, signal, targetId, remixId, isCurrent } = options;
  if (await verifyStudioDocumentSourceSession(options) === "identity-changed" || !isCurrent()) return null;
  if (workId && authScopeKey) {
    const { getStudioSharedDocument } = await import("./studio-shared-document-client");
    signal.throwIfAborted();
    if (!isCurrent()) return null;
    const shared = await getStudioSharedDocument(workId, signal);
    return { work: shared.document, remixAuthorName: "", shared, detail: null };
  }
  const { getWork } = await import("@/platform/creator-client");
  signal.throwIfAborted();
  if (!isCurrent()) return null;
  const work = await getWork(targetId, signal);
  return { work, remixAuthorName: work.author.name, shared: null, detail: remixId ? null : work };
}
