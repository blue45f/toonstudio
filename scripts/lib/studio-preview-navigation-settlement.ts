import type { Page, Request } from "playwright";

type RequestSummary = Readonly<{ url: string; resourceType: string }>;
export interface StudioNavigationSettlementReceipt {
  readonly phase: string;
  readonly outcome: "settled" | "timeout";
  readonly timeoutMs: number;
  readonly quietMs: number;
  readonly elapsedMs: number;
  readonly pendingAtStart: readonly RequestSummary[];
  readonly completed: readonly RequestSummary[];
  readonly failed: readonly (RequestSummary & { error: string })[];
  readonly pendingAtEnd: readonly RequestSummary[];
}

const FINITE_GET_TYPES = new Set(["document", "script", "stylesheet", "image", "font", "xhr", "fetch"]);

/** 오류를 제외하지 않고, 검사기가 유발하는 이동·닫기 전에 관측 중인 유한 GET을 끝까지 기다린다. */
export function observeStudioPreviewNavigationRequests(page: Page, previewOrigin: string) {
  const origin = new URL(previewOrigin).origin;
  const pending = new Map<Request, RequestSummary>();
  const completed: RequestSummary[] = [];
  const failed: Array<RequestSummary & { error: string }> = [];
  const receipts: StudioNavigationSettlementReceipt[] = [];
  let lastChange = Date.now();
  const onRequest = (request: Request) => {
    if (request.method() !== "GET" || !FINITE_GET_TYPES.has(request.resourceType())) return;
    const url = new URL(request.url());
    // Socket.IO polling은 연결 자체가 지속된다. 유한 자산/API 준비와 다른 원래 진단 경로에 둔다.
    if (url.origin !== origin || url.pathname === "/socket.io/") return;
    pending.set(request, { url: request.url(), resourceType: request.resourceType() });
    lastChange = Date.now();
  };
  const onFinished = (request: Request) => {
    const summary = pending.get(request);
    if (!summary) return;
    pending.delete(request); completed.push(summary); lastChange = Date.now();
  };
  const onFailed = (request: Request) => {
    const summary = pending.get(request);
    if (!summary) return;
    pending.delete(request);
    failed.push({ ...summary, error: request.failure()?.errorText ?? "unknown failure" });
    lastChange = Date.now();
  };
  page.on("request", onRequest);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);

  return {
    receipts,
    async settle(phase: string, { timeoutMs = 5_000, quietMs = 100 } = {}): Promise<StudioNavigationSettlementReceipt> {
      if (!phase.trim() || !Number.isFinite(timeoutMs) || !Number.isFinite(quietMs)
        || timeoutMs <= 0 || quietMs < 0 || quietMs >= timeoutMs) {
        throw new Error("이동 전 요청 대기에는 단계 이름과 유효한 제한 시간이 필요합니다.");
      }
      const startedAt = Date.now(), completedStart = completed.length, failedStart = failed.length;
      const pendingAtStart = [...pending.values()];
      while (Date.now() - startedAt < timeoutMs) {
        if (pending.size === 0 && Date.now() - lastChange >= quietMs) {
          const receipt: StudioNavigationSettlementReceipt = {
            phase, outcome: "settled", timeoutMs, quietMs, elapsedMs: Date.now() - startedAt,
            pendingAtStart, completed: completed.slice(completedStart), failed: failed.slice(failedStart), pendingAtEnd: [],
          };
          receipts.push(receipt);
          return receipt;
        }
        await new Promise<void>(resolve => setTimeout(resolve, Math.min(25, timeoutMs - (Date.now() - startedAt))));
      }
      const receipt: StudioNavigationSettlementReceipt = {
        phase, outcome: "timeout", timeoutMs, quietMs, elapsedMs: Date.now() - startedAt,
        pendingAtStart, completed: completed.slice(completedStart), failed: failed.slice(failedStart), pendingAtEnd: [...pending.values()],
      };
      receipts.push(receipt);
      throw new Error(`${phase}: 이동 전 GET 요청이 ${timeoutMs}ms 안에 끝나지 않았습니다: ${JSON.stringify(receipt.pendingAtEnd)}`);
    },
    dispose(): void {
      page.off("request", onRequest);
      page.off("requestfinished", onFinished);
      page.off("requestfailed", onFailed);
    },
  };
}
