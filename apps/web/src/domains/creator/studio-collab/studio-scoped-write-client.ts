import { StudioScopedWriteManagementCommandSchema, StudioScopedWritePolicySchema,
  type StudioScopedWriteManagementCommand, type StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { api } from "@/platform/api";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";

interface InFlightPolicy {
  readonly actorId: string; readonly revision: number; readonly controller: AbortController;
  readonly promise: Promise<StudioScopedWritePolicy>; readonly consumers: Set<symbol>; settled: boolean;
}
const inFlight = new Map<string, InFlightPolicy>();
const cancelled = () => new DOMException("편집 정책 조회를 취소했습니다.", "AbortError");
listeners.add(() => {
  for (const [key, entry] of inFlight) if (entry.actorId !== getAuthUserId() || entry.revision !== getAuthSessionRevision()) {
    inFlight.delete(key); entry.controller.abort();
  }
});

function path(workId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(workId)) throw new Error("실제 작품을 선택하세요.");
  return `/creator/works/${encodeURIComponent(workId)}/scoped-write`;
}
function policy(raw: unknown, workId: string): StudioScopedWritePolicy {
  const value = StudioScopedWritePolicySchema.parse(raw);
  if (value.workId !== workId) throw new Error("다른 작품의 편집 정책을 사용할 수 없습니다.");
  return value;
}
export async function getStudioScopedWritePolicy(workId: string, signal?: AbortSignal): Promise<StudioScopedWritePolicy> {
  const endpoint = path(workId), actorId = getAuthUserId(), revision = getAuthSessionRevision();
  if (signal?.aborted) throw cancelled();
  // 실제 계정을 아직 모르면 다른 소비자와 응답을 공유하지 않는다.
  if (!actorId) {
    const raw = await api.get<unknown>(endpoint, { signal });
    if (actorId !== getAuthUserId() || revision !== getAuthSessionRevision()) throw cancelled();
    return policy(raw, workId);
  }
  const key = JSON.stringify([actorId, revision, workId]);
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = api.get<unknown>(endpoint, { signal: controller.signal }).then((raw) => {
      if (controller.signal.aborted || actorId !== getAuthUserId() || revision !== getAuthSessionRevision()) throw cancelled();
      return policy(raw, workId);
    });
    entry = { actorId, revision, controller, promise, consumers: new Set(), settled: false }; inFlight.set(key, entry);
    const current = entry;
    const complete = () => { current.settled = true; if (inFlight.get(key) === current) inFlight.delete(key); };
    // 실패도 관찰하여 마지막 소비자가 먼저 취소해도 미처리 rejection을 만들지 않는다.
    void promise.then(complete, complete);
  }
  const current = entry, consumer = Symbol("scoped-policy-consumer"); current.consumers.add(consumer);
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true; signal?.removeEventListener("abort", abort); current.controller.signal.removeEventListener("abort", abort); current.consumers.delete(consumer);
      if (!current.settled && current.consumers.size === 0) { if (inFlight.get(key) === current) inFlight.delete(key); current.controller.abort(); }
      return true;
    };
    const abort = () => { if (release()) reject(cancelled()); };
    signal?.addEventListener("abort", abort, { once: true });
    current.controller.signal.addEventListener("abort", abort, { once: true });
    if (signal?.aborted || current.controller.signal.aborted) abort();
    void current.promise.then((value) => { if (release()) {
      if (actorId !== getAuthUserId() || revision !== getAuthSessionRevision()) reject(cancelled()); else resolve(value);
    } }, (error: unknown) => { if (release()) reject(error); });
  });
}
export async function manageStudioScopedWritePolicy(workId: string, input: StudioScopedWriteManagementCommand): Promise<StudioScopedWritePolicy> {
  const parsed = StudioScopedWriteManagementCommandSchema.parse(input);
  const actorId = getAuthUserId(), revision = getAuthSessionRevision();
  const raw = await api.post<unknown>(path(workId), parsed);
  if (actorId !== getAuthUserId() || revision !== getAuthSessionRevision()) throw cancelled();
  return policy(raw, workId);
}
