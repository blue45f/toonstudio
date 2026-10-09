import {
  STUDIO_TEXTURE_LOD_WORKER_NO_OFFSCREEN,
  STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION,
  isStudioTextureLodWorkerResponse,
  type StudioTextureLodWorkerRequest,
  type StudioTextureLodWorkerSource,
} from "./studio-virtual-space-texture-lod-worker-protocol";
import type { StudioLodCell, StudioRgbaImage } from "./studio-virtual-space-texture-lod-pixels";

/** 워커가 이 시간 안에 답하지 않으면 실패로 보고 메인 스레드 계산으로 돌아간다. */
export const STUDIO_TEXTURE_LOD_WORKER_TIMEOUT_MS = 20_000;

interface WorkerMessageLike { readonly data: unknown }

export interface StudioTextureLodWorkerLike {
  postMessage(message: StudioTextureLodWorkerRequest, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: WorkerMessageLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
  terminate(): void;
}

export type StudioTextureLodWorkerFactory = () => StudioTextureLodWorkerLike | null;

export function createStudioTextureLodModuleWorker(): StudioTextureLodWorkerLike | null {
  if (typeof Worker !== "function") return null;
  return new Worker(new URL("./studio-virtual-space-texture-lod.worker.ts", import.meta.url), { type: "module", name: "toonstudio-texture-lod" });
}

export type StudioTextureLodWorkerTake =
  | { readonly status: "pending" }
  | { readonly status: "done"; readonly image: StudioRgbaImage }
  | { readonly status: "failed" };

interface Pending {
  readonly submittedAt: number;
  result: StudioTextureLodWorkerTake;
}

/**
 * 워커 하나를 게으르게 만들어 요청을 순서대로 보낸다. 결과는 콜백이 아니라 take()로 가져간다(GL 호출을 프레임 업데이트 안에서 하려고).
 * 워커가 없거나 한 번이라도 실패하면 available이 false가 되어 호출 측이 메인 스레드 계산으로 돌아간다.
 */
export class StudioTextureLodWorkerClient {
  private worker: StudioTextureLodWorkerLike | null = null;
  private broken = false;
  private bitmapSupported = true;
  private nextRequestId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly factory: StudioTextureLodWorkerFactory = createStudioTextureLodModuleWorker,
    private readonly now: () => number = () => globalThis.performance.now(),
    private readonly timeoutMs = STUDIO_TEXTURE_LOD_WORKER_TIMEOUT_MS,
  ) {}

  get available(): boolean {
    return !this.broken;
  }

  /** 워커가 비트맵을 직접 읽을 수 있는지(OffscreenCanvas). 한 번 안 된다고 답하면 이후엔 픽셀을 보내는 방식만 쓴다. */
  get bitmapAvailable(): boolean {
    return !this.broken && this.bitmapSupported;
  }

  /** 요청을 보낸다. 원본(픽셀 버퍼 또는 비트맵)은 전송되어 보낸 쪽에서는 쓸 수 없다. 워커를 쓸 수 없으면 null이다. */
  submit(input: { readonly level: number; readonly width: number; readonly height: number; readonly cells: readonly StudioLodCell[]; readonly source: StudioTextureLodWorkerSource }): number | null {
    if (this.broken) return null;
    const worker = this.ensureWorker();
    if (!worker) return null;
    const requestId = this.nextRequestId;
    this.nextRequestId = requestId >= Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
    this.pending.set(requestId, { submittedAt: this.now(), result: { status: "pending" } });
    const transfer: Transferable[] = input.source.kind === "pixels" ? [input.source.data] : [input.source.bitmap];
    try {
      worker.postMessage({ version: STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION, requestId, ...input }, transfer);
    } catch {
      this.pending.delete(requestId);
      this.markBroken();
      return null;
    }
    return requestId;
  }

  take(requestId: number): StudioTextureLodWorkerTake {
    const entry = this.pending.get(requestId);
    if (!entry) return { status: "failed" };
    if (entry.result.status === "pending" && this.now() - entry.submittedAt > this.timeoutMs) {
      this.markBroken();
      entry.result = { status: "failed" };
    }
    if (entry.result.status !== "pending") this.pending.delete(requestId);
    return entry.result;
  }

  /** 더는 필요 없는 요청(텍스처가 지워졌다 등)의 결과를 버린다. */
  cancel(requestId: number): void {
    this.pending.delete(requestId);
  }

  dispose(): void {
    this.markBroken();
    this.pending.clear();
  }

  private ensureWorker(): StudioTextureLodWorkerLike | null {
    if (this.worker) return this.worker;
    try {
      const worker = this.factory();
      if (!worker) { this.broken = true; return null; }
      worker.addEventListener("message", (event) => this.onMessage(event.data));
      worker.addEventListener("error", () => this.markBroken());
      worker.addEventListener("messageerror", () => this.markBroken());
      this.worker = worker;
      return worker;
    } catch {
      this.broken = true;
      return null;
    }
  }

  private onMessage(data: unknown): void {
    if (!isStudioTextureLodWorkerResponse(data)) { this.markBroken(); return; }
    const entry = this.pending.get(data.requestId);
    if (!entry) return;
    if (data.kind === "error" && data.message === STUDIO_TEXTURE_LOD_WORKER_NO_OFFSCREEN) this.bitmapSupported = false;
    entry.result = data.kind === "result"
      ? { status: "done", image: { data: new Uint8Array(data.data), width: data.width, height: data.height } }
      : { status: "failed" };
  }

  /** 워커가 죽었거나 이상한 응답을 보냈다. 기다리던 요청은 모두 실패로 돌려 호출 측이 메인 스레드에서 다시 계산하게 한다. */
  private markBroken(): void {
    this.broken = true;
    for (const entry of this.pending.values()) if (entry.result.status === "pending") entry.result = { status: "failed" };
    try { this.worker?.terminate(); } catch { /* 이미 끝난 워커 */ }
    this.worker = null;
  }
}
