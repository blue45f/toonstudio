export type StudioBg3dCaptureEnvironmentErrorCode = "missing" | "not-ready" | "not-applied" | "fingerprint-mismatch"
  | "failed" | "superseded" | "disposed" | "aborted" | "timeout" | "invalid-options" | "invalid-receipt";

const MESSAGES: Readonly<Record<StudioBg3dCaptureEnvironmentErrorCode, string>> = {
  missing: "현재 화면의 환경 준비 정보를 확인하지 못해 캡처하지 않았습니다.",
  "not-ready": "현재 화면의 환경 준비가 끝나지 않았습니다.",
  "not-applied": "준비된 환경이 현재 화면에 적용되지 않아 캡처하지 않았습니다.",
  "fingerprint-mismatch": "캡처 요청의 환경 설정과 현재 화면에 적용된 환경 설정이 다릅니다.",
  failed: "화면 환경을 준비하지 못해 캡처하지 않았습니다.",
  superseded: "캡처 중 화면 환경의 세대가 바뀌었습니다. 현재 화면에서 다시 시도해 주세요.",
  disposed: "화면 환경이 해제되어 캡처하지 않았습니다.",
  aborted: "화면 환경 준비 대기를 취소했습니다.",
  timeout: "화면 환경 준비 대기 시간이 지났습니다. 현재 화면에서 다시 시도해 주세요.",
  "invalid-options": "화면 환경 준비의 대기 시간 설정이 올바르지 않습니다.",
  "invalid-receipt": "검증된 화면 환경 영수증이 필요합니다.",
};

export class StudioBg3dCaptureEnvironmentError extends Error {
  constructor(readonly code: StudioBg3dCaptureEnvironmentErrorCode, options?: ErrorOptions) {
    super(MESSAGES[code], options);
    this.name = code === "aborted" ? "AbortError" : code === "timeout" ? "TimeoutError" : "StudioBg3dCaptureEnvironmentError";
  }
}

export interface StudioBg3dCaptureEnvironmentReceipt {
  readonly fingerprint: string;
  readonly assertCurrent: (expectedFingerprint?: string) => void;
}
export interface StudioBg3dCaptureEnvironmentProducer {
  readonly fingerprint: string;
  readonly ready: PromiseLike<boolean>;
  readonly isApplied: () => boolean;
}
export interface StudioBg3dCaptureEnvironmentAcquireOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

type Phase = "pending" | "ready" | "failed" | "superseded" | "disposed";
interface Entry {
  readonly fingerprint: string;
  readonly isApplied: () => boolean;
  readonly listeners: Set<() => void>;
  phase: Phase;
}

const scenes = new WeakMap<object, WeakMap<object, Entry>>();
const receiptGuards = new WeakMap<StudioBg3dCaptureEnvironmentReceipt, (expectedFingerprint?: string) => void>();
const outputReceipts = new WeakMap<object, Set<StudioBg3dCaptureEnvironmentReceipt>>();
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function error(code: StudioBg3dCaptureEnvironmentErrorCode): StudioBg3dCaptureEnvironmentError {
  return new StudioBg3dCaptureEnvironmentError(code);
}
function current(scene: object, renderer: object): Entry | undefined {
  return scenes.get(scene)?.get(renderer);
}
function notify(entry: Entry): void {
  // 알림 중 취소·새 publish가 재진입해도 시작 시점의 대기자만 깨운다.
  for (const listener of [...entry.listeners]) listener();
}
function assertIdentity(scene: object, renderer: object, entry: Entry): void {
  if (current(scene, renderer) !== entry || entry.phase === "superseded") throw error("superseded");
  if (entry.phase === "disposed") throw error("disposed");
  if (entry.phase === "failed") throw error("failed");
}
function assertApplied(scene: object, renderer: object, entry: Entry): void {
  assertIdentity(scene, renderer, entry);
  if (entry.phase !== "ready") throw error("not-ready");
  let applied: boolean;
  try { applied = entry.isApplied(); }
  catch (cause) { throw new StudioBg3dCaptureEnvironmentError("failed", { cause }); }
  // 실제 적용 확인 함수 안에서 새 요청이 발행되거나 기존 owner가 해제될 수도 있다.
  assertIdentity(scene, renderer, entry);
  if (entry.phase !== "ready") throw error("not-ready");
  if (applied !== true) throw error("not-applied");
}
function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StudioBg3dCaptureEnvironmentError("aborted", { cause: signal.reason });
}

/** 준비 중인 새 세대도 즉시 권위를 차지한다. 이전 표시 자원이나 GPU 자원은 여기서 바꾸지 않는다. */
export function publishStudioBg3dCaptureEnvironment(scene: object, renderer: object,
  producer: StudioBg3dCaptureEnvironmentProducer): { dispose(): void } {
  let renderers = scenes.get(scene);
  if (!renderers) { renderers = new WeakMap<object, Entry>(); scenes.set(scene, renderers); }
  const previous = renderers.get(renderer);
  const entry: Entry = { fingerprint: producer.fingerprint, isApplied: producer.isApplied,
    listeners: new Set(), phase: "pending" };
  renderers.set(renderer, entry);
  if (previous) { previous.phase = "superseded"; notify(previous); }
  // 실제 true 완료만 받는다. 원래 준비 작업을 취소하거나 실패 후 자동 재시작하지 않는다.
  void Promise.resolve(producer.ready).then((ready) => {
    if (entry.phase !== "pending") return;
    entry.phase = ready === true ? "ready" : "failed"; notify(entry);
  }, () => {
    if (entry.phase !== "pending") return;
    entry.phase = "failed"; notify(entry);
  });
  let disposed = false;
  return Object.freeze({ dispose() {
    if (disposed) return;
    disposed = true; entry.phase = "disposed"; notify(entry);
    // 현재 entry를 삭제해 이전 세대를 되살리지 않는다. 해제된 tombstone도 실패 상태다.
  } });
}

async function waitUntilApplied(scene: object, renderer: object, entry: Entry,
  options: StudioBg3dCaptureEnvironmentAcquireOptions, timeoutMs: number, deadline: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      entry.listeners.delete(check);
      options.signal?.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    };
    const finish = (failure?: unknown) => {
      if (settled) return;
      settled = true; cleanup();
      if (failure !== undefined) reject(failure); else resolve();
    };
    const onAbort = () => finish(new StudioBg3dCaptureEnvironmentError("aborted", { cause: options.signal?.reason }));
    const check = () => {
      if (settled) return;
      try {
        assertNotAborted(options.signal); assertIdentity(scene, renderer, entry);
        if (Date.now() > deadline) throw error("timeout");
        if (entry.phase === "pending") return;
        assertApplied(scene, renderer, entry); finish();
      } catch (failure) { finish(failure); }
    };
    const timer = setTimeout(() => finish(error("timeout")), timeoutMs);
    entry.listeners.add(check);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    check();
  });
  assertNotAborted(options.signal);
  if (Date.now() > deadline) throw error("timeout");
  assertApplied(scene, renderer, entry);
}

/** none/off도 생산자의 명시 ready=true가 필요하다. 영수증은 자원을 pin하지 않고 현재 세대만 확인한다. */
export async function acquireStudioBg3dCaptureEnvironmentReceipt(scene: object, renderer: object,
  options: StudioBg3dCaptureEnvironmentAcquireOptions = {}): Promise<StudioBg3dCaptureEnvironmentReceipt> {
  assertNotAborted(options.signal);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_TIMER_DELAY_MS) throw error("invalid-options");
  const entry = current(scene, renderer);
  if (!entry) throw error("missing");
  const deadline = Date.now() + timeoutMs;
  await waitUntilApplied(scene, renderer, entry, options, timeoutMs, deadline);
  assertNotAborted(options.signal);
  if (Date.now() > deadline) throw error("timeout");
  assertApplied(scene, renderer, entry);
  const assertCurrent = (expectedFingerprint?: string) => {
    if (expectedFingerprint !== undefined && expectedFingerprint !== entry.fingerprint) throw error("fingerprint-mismatch");
    assertApplied(scene, renderer, entry);
  };
  const receipt = Object.freeze({ fingerprint: entry.fingerprint, assertCurrent });
  receiptGuards.set(receipt, assertCurrent);
  return receipt;
}

/** 이전 출력의 guard를 덮지 않는다. 같은 영수증을 여러 번 붙이면 한 번만 확인한다. */
export function attachStudioBg3dCaptureEnvironmentReceipt(output: object, receipt: StudioBg3dCaptureEnvironmentReceipt): void {
  if (!receiptGuards.has(receipt)) throw error("invalid-receipt");
  let receipts = outputReceipts.get(output);
  if (!receipts) { receipts = new Set(); outputReceipts.set(output, receipts); }
  receipts.add(receipt);
}
export function inheritStudioBg3dCaptureEnvironmentReceipt(output: object, source: object): void {
  const receipts = outputReceipts.get(source);
  if (!receipts) return;
  for (const receipt of receipts) attachStudioBg3dCaptureEnvironmentReceipt(output, receipt);
}
/** 기대 fingerprint는 호출자의 동결 요청이다. scene에서 역추론하지 않으며 레거시 출력은 그대로 둔다. */
export function assertStudioBg3dCaptureEnvironmentCurrent(output: object, expectedFingerprint?: string): void {
  const receipts = outputReceipts.get(output);
  if (!receipts) return;
  for (const receipt of receipts) receipt.assertCurrent(expectedFingerprint);
}
