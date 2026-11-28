import type { VRM } from "@pixiv/three-vrm";

type Wait = (signal?: AbortSignal) => Promise<void> | undefined;
const active = new WeakMap<VRM, Set<Wait>>();

function aborted() {
  return new DOMException("소품 장착 상태가 바뀌거나 캡처가 취소되었습니다.", "AbortError");
}

/** 이미 준비된 프레임은 클릭 시점에 곧바로 동결하고, 미완료 장착 세대만 기다린다. */
export function pendingStudioVrmGripSettlement(vrm: VRM | null | undefined, signal?: AbortSignal): Promise<void> | undefined {
  if (signal?.aborted) return Promise.reject(aborted());
  const pending: Promise<void>[] = [];
  if (vrm) for (const wait of active.get(vrm) ?? []) {
    const job = wait(signal);
    if (job) pending.push(job);
  }
  return pending.length ? Promise.all(pending).then(() => undefined) : undefined;
}

export async function waitForStudioVrmGripSettlement(vrm: VRM | null | undefined, signal?: AbortSignal): Promise<void> {
  await pendingStudioVrmGripSettlement(vrm, signal);
}

export function createStudioVrmGripSettlement(vrm: VRM, invalidate: () => void) {
  let settled = false;
  const waiters = new Set<(error?: Error) => void>();
  const wait: Wait = signal => settled ? undefined : new Promise<void>((resolve, reject) => {
    const abort = () => finish(aborted());
    const finish = (error?: Error) => {
      waiters.delete(finish);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    waiters.add(finish);
    signal?.addEventListener("abort", abort, { once: true });
    invalidate();
  });
  const jobs = active.get(vrm) ?? new Set<Wait>();
  active.set(vrm, jobs);
  jobs.add(wait);
  return {
    ready(done: boolean) {
      settled = done;
      if (done) for (const finish of waiters) finish();
    },
    dispose() {
      jobs.delete(wait);
      if (!jobs.size) active.delete(vrm);
      for (const finish of waiters) finish(aborted());
    },
  };
}
