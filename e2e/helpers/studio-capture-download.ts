import type { Download, Locator, Page } from "@playwright/test";

type CaptureOutcome = { kind: "download"; download: Download } | { kind: "error"; error: unknown };

/** 실제 내보내기 한 번에 속한 대기만 유지하고 종료 전에 남은 감시를 취소한다. */
export async function waitForStudioCaptureDownload(
  page: Page,
  trigger: () => Promise<void>,
  renderTimeout: Locator,
): Promise<Download> {
  const controller = new AbortController();
  // 클릭 중 먼저 실패해도 미처리 거부가 생기지 않게 생성 즉시 결과를 보존한다.
  const waiters: Promise<CaptureOutcome>[] = [page.waitForEvent("download", { signal: controller.signal }).then(
    (download): CaptureOutcome => ({ kind: "download", download }),
    (error: unknown): CaptureOutcome => ({ kind: "error", error }),
  )];
  try {
    await trigger();
    waiters.push(renderTimeout.waitFor({ state: "visible", timeout: 180_000, signal: controller.signal }).then(
      (): CaptureOutcome => ({ kind: "error", error: new Error("실제 PNG 내보내기가 render-timeout 오류를 표시했습니다.") }),
      (error: unknown): CaptureOutcome => ({ kind: "error", error }),
    ));
    const result = await Promise.race(waiters);
    if (result.kind === "error") throw result.error;
    return result.download;
  } finally {
    // 다운로드 성공 뒤에도 DOM 감시가 reload와 다음 locator handler까지 남지 않게 한다.
    controller.abort();
    await Promise.allSettled(waiters);
  }
}
