import { getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";

export const ADMIN_READ_TIMEOUT_MS = 30_000;

interface PendingAdminRead {
  controller: AbortController;
  promise: Promise<string>;
  subscribers: number;
}

// 응답 캐시는 두지 않는다. 같은 브라우저 인증 세대에서 진행 중인 읽기만 공유한다.
const pendingReads = new Map<string, PendingAdminRead>();

/** 쓰기 완료 뒤의 새 조회는 쓰기 이전·도중에 시작한 응답을 재사용하지 않는다. */
export function invalidateAdminReads(): void {
  pendingReads.clear();
}

function cancelledRead(): DOMException {
  return new DOMException("관리자 조회가 취소되었습니다.", "AbortError");
}

function createRead(
  key: string | null,
  request: (signal: AbortSignal) => Promise<Response>,
): PendingAdminRead {
  const controller = new AbortController();
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason ?? cancelledRead());
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = globalThis.setTimeout(() => {
    controller.abort(new DOMException(
      "관리자 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      "TimeoutError",
    ));
  }, ADMIN_READ_TIMEOUT_MS);
  const responseText = Promise.resolve().then(async () => {
    controller.signal.throwIfAborted();
    const response = await request(controller.signal);
    const text = response.status === 204 ? "" : await response.text();
    controller.signal.throwIfAborted();
    return text;
  });
  const entry: PendingAdminRead = {
    controller,
    promise: Promise.race([responseText, aborted]),
    subscribers: 0,
  };
  entry.promise = entry.promise.finally(() => {
    globalThis.clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
    if (key !== null && pendingReads.get(key) === entry) pendingReads.delete(key);
  });
  return entry;
}

/** 본문 수신까지 30초로 제한하고, 호출자 하나의 취소가 다른 화면의 조회를 취소하지 않게 한다. */
export function readAdminResponse(
  path: string,
  uid: string,
  headers: Headers,
  callerSignal: AbortSignal | null | undefined,
  request: (signal: AbortSignal) => Promise<Response>,
): Promise<string> {
  callerSignal?.throwIfAborted();
  const revision = getAuthSessionRevision();
  // 서버 실행에서는 요청 간 인증 상태를 공유하지 않는다. 헤더가 다른 조회도 분리한다.
  const key = typeof window === "undefined" ? null : JSON.stringify([
    revision, uid, path, Array.from(headers.entries()).sort(([left], [right]) => left.localeCompare(right)),
  ]);
  let entry = key === null ? undefined : pendingReads.get(key);
  if (!entry) {
    entry = createRead(key, request);
    if (key !== null) pendingReads.set(key, entry);
  }
  const current = entry;
  current.subscribers += 1;

  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      callerSignal?.removeEventListener("abort", onCallerAbort);
      current.subscribers -= 1;
      return true;
    };
    const onCallerAbort = () => {
      if (!finish()) return;
      reject(callerSignal?.reason ?? cancelledRead());
      if (current.subscribers === 0) {
        if (key !== null && pendingReads.get(key) === current) pendingReads.delete(key);
        current.controller.abort(cancelledRead());
      }
    };
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    current.promise.then(
      (text) => {
        if (!finish()) return;
        // 계정 전환·로그아웃·권한 갱신 뒤 이전 세대의 성공 응답을 화면에 전달하지 않는다.
        if (getAuthSessionRevision() !== revision) reject(cancelledRead());
        else resolve(text);
      },
      (error: unknown) => { if (finish()) reject(error); },
    );
  });
}
