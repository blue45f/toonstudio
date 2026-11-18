import type { StudioVrmPngWorkerFactory, StudioVrmPngWorkerLike } from "./studio-vrm-png-worker-client";

/** 한 작업 화면에서 검증을 마친 Worker 하나만 다음 출력까지 보관한다. */
export class StudioVrmPngWorkerSession {
  private idle: StudioVrmPngWorkerLike | null = null;
  private readonly active = new Map<StudioVrmPngWorkerLike, () => void>();
  private closed = false;

  acquire(factory: StudioVrmPngWorkerFactory, abort: () => void) {
    if (this.closed) {
      abort();
      return null;
    }
    const warm = this.idle !== null;
    const worker = this.idle ?? factory();
    if (!worker) return null;
    this.idle = null;
    this.active.set(worker, abort);
    return { worker, warm };
  }

  release(worker: StudioVrmPngWorkerLike, verified: boolean): void {
    if (!this.active.delete(worker)) return;
    if (verified && !this.closed && !this.idle) this.idle = worker;
    else worker.terminate();
  }

  dispose(): void {
    this.closed = true;
    for (const abort of this.active.values()) abort();
    this.idle?.terminate();
    this.idle = null;
  }
}
