import { createStudioAutosaveSupersededError } from "../studio-cuttoon-editor/runtime/studio-autosave-monotonic-gate";

interface PendingSnapshot {
  run: (() => Promise<void>) | null;
  reject: (cause: unknown) => void;
}

/**
 * 진행 중 저장은 끝내고, 아직 시작하지 않은 연속 스냅샷은 최신 하나만 유지한다.
 * 읽기·삭제·flush·명시적 취소 신호는 순서 경계여서 양쪽 스냅샷을 합치지 않는다.
 */
export class StudioAutosaveOperationQueue {
  #tail: Promise<void> = Promise.resolve();
  #pendingSnapshot: PendingSnapshot | null = null;

  enqueue<T>(operation: () => Promise<T>, coalesceSnapshot = false): Promise<T> {
    if (!coalesceSnapshot) {
      this.#pendingSnapshot = null;
      const result = this.#tail.then(operation);
      this.#tail = result.then(() => undefined, () => undefined);
      return result;
    }
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        try { resolve(await operation()); }
        catch (cause) { reject(cause); }
      };
      const pending = this.#pendingSnapshot;
      if (pending) {
        // 기록하지 않은 옛 원고에 새 원고의 영수증을 돌려주지 않는다.
        pending.reject(createStudioAutosaveSupersededError());
        pending.run = run;
        pending.reject = reject;
        return;
      }
      const queued: PendingSnapshot = { run, reject };
      this.#pendingSnapshot = queued;
      this.#scheduleSnapshot(queued);
    });
  }

  // 실행 콜백의 클로저에 교체 전 operation의 원고 참조가 함께 남지 않도록 분리한다.
  #scheduleSnapshot(queued: PendingSnapshot): void {
    const result = this.#tail.then(async () => {
      if (this.#pendingSnapshot === queued) this.#pendingSnapshot = null;
      const execute = queued.run;
      queued.run = null;
      await execute?.();
    });
    this.#tail = result.then(() => undefined, () => undefined);
  }

  settled(): Promise<void> {
    return this.#tail;
  }
}
