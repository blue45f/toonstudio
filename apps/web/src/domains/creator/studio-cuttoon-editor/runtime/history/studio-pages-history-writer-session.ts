import { StudioAutosaveDocumentBusyError } from "../../../studio-autosave-opfs-error";
import { withStudioHistoryCleanup } from "./studio-pages-history-cleanup";
import type { StudioAutosaveDocumentLease } from "../../../studio-autosave-document-leader";
import type { StudioPagesHistoryRecoveryPort } from "../../../studio-pages-history-durable-runtime";

// 같은 탭의 StrictMode 세대도 acquire→write→release 전체를 순서대로 수행한다.
const documentWrites = new Map<string, Promise<unknown>>();

export function createStudioPagesHistoryWriterSession(
  recovery: StudioPagesHistoryRecoveryPort,
  documentLease: StudioAutosaveDocumentLease,
): StudioPagesHistoryRecoveryPort {
  // 문서 수명 잠금이 없으면 기존 디스크 lease·TTL·fencing 계약을 유지한다.
  if (documentLease.basis === "locks-unavailable" || !recovery.releaseWriter) return recovery;
  let ownerId: string | null = null;
  const readLatestPayload = recovery.readLatestPayload?.bind(recovery);
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const previous = documentWrites.get(documentLease.lockName) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    documentWrites.set(documentLease.lockName, current);
    void current.finally(() => {
      if (documentWrites.get(documentLease.lockName) === current) documentWrites.delete(documentLease.lockName);
    }).catch(() => undefined);
    return current;
  };
  const assertLeader = (): void => {
    if (documentLease.role !== "leader") throw new StudioAutosaveDocumentBusyError();
  };
  const write = <T>(operation: () => Promise<T>): Promise<T> => serialize(async () => {
    assertLeader();
    if (!ownerId) throw new Error("편집 이력 writer가 초기화되지 않았습니다.");
    await recovery.acquireWriter({ ownerId });
    return withStudioHistoryCleanup(async () => {
      assertLeader();
      return await operation();
    }, async () => {
      // 완료한 쓰기는 TTL 만료를 기다리지 않는다. 탭 간 보호는 문서 Web Lock이 소유한다.
      await recovery.releaseWriter?.();
    });
  });
  return {
    scanLatest: (options) => recovery.scanLatest(options),
    acquireWriter: (input) => serialize(async () => {
      assertLeader();
      ownerId = input.ownerId;
      const writer = await recovery.acquireWriter(input);
      return withStudioHistoryCleanup(async () => { assertLeader(); return writer; }, async () => recovery.releaseWriter?.());
    }),
    appendCommand: (input, options) => write(() => recovery.appendCommand(input, options)),
    compact: (input, options) => write(() => recovery.compact(input, options)),
    flush: (options) => serialize(() => recovery.flush(options)),
    abort: (reason) => serialize(() => recovery.abort(reason)),
    ...(readLatestPayload ? { readLatestPayload } : {}),
  };
}
