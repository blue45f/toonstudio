import type { Page, TestInfo } from "@playwright/test";

interface DocumentBounds { width: number; height: number }
interface CaptureFrame {
  x: number; y: number; width: number; height: number;
  documentWidth: number; documentHeight: number;
}
interface CaptureTile { file: string; x: number; y: number; width: number; height: number }
interface DiscardedAttempt {
  attempt: number;
  phase: string;
  previousHeight: number;
  currentHeight: number;
  files: string[];
}
const MAX_CAPTURE_RESTARTS = 3;

class DocumentShrankError extends Error {
  constructor(readonly previousHeight: number, readonly currentHeight: number, readonly phase: string) {
    super(`화면 기록 중 문서 높이가 줄었습니다: ${previousHeight}px → ${currentHeight}px (${phase})`);
  }
}

async function readDocumentBounds(page: Page): Promise<DocumentBounds> {
  return page.evaluate(() => ({
    width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
    height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)),
  }));
}

async function readFrame(page: Page, top?: number): Promise<CaptureFrame> {
  return page.evaluate(async (target) => {
    if (target !== undefined) scrollTo({ left: 0, top: target, behavior: "instant" });
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {
      x: scrollX, y: scrollY, width: innerWidth, height: innerHeight,
      documentWidth: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
      documentHeight: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)),
    };
  }, top);
}

async function waitForStableDocumentBounds(page: Page, quietMs = 500, timeoutMs = 5_000): Promise<DocumentBounds> {
  let latest = await readDocumentBounds(page);
  let stableSince = Date.now();
  const deadline = stableSince + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const next = await readDocumentBounds(page);
    if (next.width === latest.width && next.height === latest.height) {
      if (Date.now() - stableSince >= quietMs) return next;
    } else {
      latest = next;
      stableSince = Date.now();
    }
  }
  throw new Error("화면 기록 전에 문서 크기가 안정되지 않았습니다. 동적 콘텐츠의 준비 상태를 확인하세요.");
}

function assertFrame(frame: CaptureFrame): void {
  if (frame.documentWidth < 1 || frame.documentWidth > 8192 || frame.documentHeight < 1 || frame.documentHeight > 200_000) {
    throw new Error(`Unexpected screenshot dimensions: ${frame.documentWidth} x ${frame.documentHeight}`);
  }
  if (frame.x > 1 || frame.width < frame.documentWidth - 2) {
    throw new Error(`Screenshot horizontal overflow: ${frame.documentWidth}px document in ${frame.width}px viewport at ${frame.x}, ${frame.y}`);
  }
}

function assertNoShrink(previous: number, current: number, phase: string): void {
  if (current < previous) throw new DocumentShrankError(previous, current, phase);
}

async function restorePageScroll(page: Page, original: Readonly<{ x: number; y: number }>): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.evaluate(({ x, y }) => scrollTo({ left: x, top: y, behavior: "instant" }), original);
  } catch (error) {
    if (page.isClosed()) return;
    throw error;
  }
}

/** 실제 화면 크기를 유지하며 겹치는 타일로 기록한다. 축소된 문서는 처음부터 다시 기록한다. */
export async function capturePageEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const discardedAttempts: DiscardedAttempt[] = [];
  try {
    await page.evaluate(async () => { await document.fonts.ready; });
    for (let attempt = 0; attempt <= MAX_CAPTURE_RESTARTS; attempt += 1) {
      // 무한 피드는 이번 시도의 시작 경계까지만 기록한다. 축소 시에는 경계를 새로 정한다.
      if (attempt > 0) await readFrame(page, 0);
      const snapshotBounds = await waitForStableDocumentBounds(page);
      const tiles: CaptureTile[] = [];
      const files: string[] = [];
      let coveredHeight = 0;
      let observedDocumentHeight = snapshotBounds.height;
      let observedDocumentWidth = snapshotBounds.width;
      let previousHeight = snapshotBounds.height;
      let targetY = 0;
      let gapRewinds = 0;
      try {
        for (let index = 0; index < 500; index += 1) {
          const frame = await readFrame(page, targetY);
          assertFrame(frame);
          assertNoShrink(previousHeight, frame.documentHeight, "scroll");
          previousHeight = frame.documentHeight;
          observedDocumentHeight = Math.max(observedDocumentHeight, frame.documentHeight);
          observedDocumentWidth = Math.max(observedDocumentWidth, frame.documentWidth);
          if (frame.y > coveredHeight + 1) {
            if (gapRewinds >= 8) throw new Error(`Screenshot coverage gap at ${frame.x}, ${frame.y}`);
            const overlap = Math.min(160, Math.floor(frame.height / 3));
            targetY = Math.max(0, coveredHeight - overlap);
            gapRewinds += 1;
            await page.waitForTimeout(50);
            continue;
          }
          gapRewinds = 0;
          if (frame.y + frame.height <= coveredHeight) throw new Error("Screenshot scroll made no forward progress");
          const file = `${name}-attempt-${attempt + 1}-part-${String(tiles.length + 1).padStart(3, "0")}.jpg`;
          files.push(file);
          await page.screenshot({
            path: testInfo.outputPath(file), type: "jpeg", quality: 85, scale: "css",
            fullPage: false, animations: "disabled", timeout: 30_000,
          });
          // screenshot의 애니메이션 종료 처리로 높이가 바뀔 수 있어 촬영 후에도 확인한다.
          const after = await readFrame(page);
          assertFrame(after);
          assertNoShrink(frame.documentHeight, after.documentHeight, "screenshot");
          if (after.x !== frame.x || after.y !== frame.y || after.width !== frame.width || after.height !== frame.height) {
            throw new Error("촬영 중 화면 위치 또는 크기가 바뀌었습니다. 해당 타일을 완료 증거로 사용할 수 없습니다.");
          }
          previousHeight = after.documentHeight;
          observedDocumentHeight = Math.max(observedDocumentHeight, after.documentHeight);
          observedDocumentWidth = Math.max(observedDocumentWidth, after.documentWidth);
          tiles.push({ file, x: frame.x, y: frame.y, width: frame.width, height: frame.height });
          coveredHeight = Math.max(coveredHeight, Math.min(snapshotBounds.height, frame.y + frame.height));
          if (coveredHeight >= snapshotBounds.height) break;
          const overlap = Math.min(160, Math.floor(frame.height / 3));
          targetY = Math.max(0, coveredHeight - overlap);
        }
        if (coveredHeight < snapshotBounds.height) throw new Error("Screenshot coverage limit reached before the document end");
        const finalBounds = await waitForStableDocumentBounds(page);
        assertNoShrink(previousHeight, finalBounds.height, "finalize");
        const finalFrame = await readFrame(page);
        assertFrame(finalFrame);
        assertNoShrink(finalBounds.height, finalFrame.documentHeight, "finalize");
        observedDocumentWidth = Math.max(observedDocumentWidth, finalFrame.documentWidth);
        observedDocumentHeight = Math.max(observedDocumentHeight, finalBounds.height, finalFrame.documentHeight);
        await testInfo.attach(`${name}-coverage`, {
          body: JSON.stringify({
            url: page.url(), width: observedDocumentWidth, height: snapshotBounds.height, coveredHeight,
            observedDocumentWidth, observedDocumentHeight,
            grewDuringCapture: observedDocumentHeight > snapshotBounds.height,
            shrankDuringCapture: discardedAttempts.length > 0,
            restartCount: discardedAttempts.length,
            successfulAttempt: attempt + 1,
            // 중단된 파일은 진단용으로만 보존한다. 완료 타일 목록과 섞지 않는다.
            discardedAttempts, tiles,
          }, null, 2),
          contentType: "application/json",
        });
        return;
      } catch (error) {
        if (!(error instanceof DocumentShrankError)) throw error;
        discardedAttempts.push({
          attempt: attempt + 1, phase: error.phase,
          previousHeight: error.previousHeight, currentHeight: error.currentHeight, files,
        });
        if (attempt >= MAX_CAPTURE_RESTARTS) {
          await testInfo.attach(`${name}-capture-failure`, {
            body: JSON.stringify({ status: "incomplete", reason: "repeated-document-shrink", discardedAttempts }, null, 2),
            contentType: "application/json",
          });
          throw new Error(`문서 높이가 반복해서 줄어 ${MAX_CAPTURE_RESTARTS}회 재시작 후 화면 기록을 중단했습니다. 페이지 로딩과 재배치를 확인하세요.`, { cause: error });
        }
      }
    }
  } finally {
    await restorePageScroll(page, original);
  }
}
