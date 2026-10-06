import type { PwaOutboxItem } from "./pwa-offline-outbox";

export type PwaSyncHandler = (item: PwaOutboxItem) => Promise<void>;

async function defaultSyncOne(item: PwaOutboxItem): Promise<void> {
  // 실제 전송은 각 도메인이 outbox 항목 kind에 맞는 syncOne을 등록해 처리한다.
  // 등록되지 않은 kind는 조용히 성공 처리하지 않고, kind를 포함한 오류로
  // 다음 온라인 때 다시 시도하게 한다.
  throw new Error(`no-sync-handler:${item.kind}`);
}

let fallbackSyncHandler: PwaSyncHandler = defaultSyncOne;
const kindSyncHandlers = new Map<string, PwaSyncHandler>();

/**
 * 도메인별 동기화 핸들러 등록.
 * 예: 노트 도메인이 kind="note"인 아웃박스 항목을 서버에 전송하는 함수를 등록한다.
 */
export function registerPwaOutboxSyncHandler(handler: PwaSyncHandler): () => void {
  fallbackSyncHandler = handler;
  return () => {
    fallbackSyncHandler = defaultSyncOne;
  };
}

/**
 * 특정 kind 전용 동기화 핸들러 등록. 같은 kind에 여러 도메인이 등록하면
 * 마지막 등록이 이긴다. 해제 함수는 등록 시점의 핸들러와 일치할 때만 비운다.
 */
export function registerPwaOutboxSyncHandlerForKind(
  kind: string,
  handler: PwaSyncHandler,
): () => void {
  kindSyncHandlers.set(kind, handler);
  return () => {
    if (kindSyncHandlers.get(kind) === handler) {
      kindSyncHandlers.delete(kind);
    }
  };
}

/** 등록된 kind 목록 (진단용). */
export function listRegisteredPwaOutboxSyncKinds(): readonly string[] {
  return [...kindSyncHandlers.keys()];
}

/** 현재 등록된 동기화 핸들러 반환 (내부용). */
export function getRegisteredPwaSyncHandler(): PwaSyncHandler {
  return async (item: PwaOutboxItem) => {
    const kindHandler = kindSyncHandlers.get(item.kind);
    if (kindHandler) {
      await kindHandler(item);
      return;
    }
    await fallbackSyncHandler(item);
  };
}
