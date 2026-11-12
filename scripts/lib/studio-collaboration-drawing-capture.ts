import assert from "node:assert/strict";

import type { Page } from "playwright";

export interface DrawingCaptureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export const drawingCaptureRegions = new WeakMap<Page, DrawingCaptureRegion>();

/** 실제 획 경로 전체가 들어가는 가시 캔버스 띠를 고정해 떠 있는 크롬을 잉크로 세지 않는다. */
export async function drawingCaptureRegion(page: Page): Promise<DrawingCaptureRegion> {
  const existing = drawingCaptureRegions.get(page);
  if (existing) return existing;
  const viewport = await page.locator('[data-studio-canvas-viewport="true"]').first().boundingBox();
  assert.ok(viewport, "그리기 픽셀 영역의 캔버스 위치를 읽지 못했습니다.");
  const left = viewport.x + viewport.width * 0.25;
  const right = viewport.x + viewport.width * 0.71;
  const columns = Array.from({ length: 13 }, (_, index) => left + (right - left) * index / 12);
  const band = await drawableCanvasBand(page, viewport, columns);
  const region = { x: left, y: band.top + 8, width: right - left, height: band.bottom - band.top - 16 };
  assert.ok(region.height > 40, "실제 획을 담을 가시 캔버스 띠가 부족합니다.");
  drawingCaptureRegions.set(page, region);
  return region;
}

/**
 * 캔버스 뷰포트 위에는 플로팅 크롬(캔버스 상태 막대·프레즌스 독·복구 안내)이 겹쳐 있고, 탭마다 상단 안내
 * 높이가 달라 같은 뷰포트 비율이 서로 다른 화면 위치가 된다. 뷰포트 경계 비율만으로 고른 획은 크롬 위에
 * 떨어져 캔버스에 닿지 않고 조용히 사라지므로, 실제로 펜 입력을 받는 가장 긴 캔버스 띠를 찾는다.
 */
export async function drawableCanvasBand(
  page: Page,
  bounds: { readonly y: number; readonly height: number },
  columns: readonly number[],
): Promise<{ readonly top: number; readonly bottom: number }> {
  const band = await page.evaluate(({ top, bottom, xs }) => {
    let best = { top: 0, bottom: -1 };
    let runTop = -1;
    let lastOpen = -1;
    for (let y = Math.ceil(top) + 1; y < bottom; y += 2) {
      const open = xs.every((x) => {
        const hit = document.elementFromPoint(x, y);
        return hit instanceof HTMLCanvasElement
          && hit.closest('[data-studio-canvas-viewport="true"]') !== null;
      });
      if (open) {
        if (runTop < 0) runTop = y;
        lastOpen = y;
      } else if (runTop >= 0) {
        if (lastOpen - runTop > best.bottom - best.top) best = { top: runTop, bottom: lastOpen };
        runTop = -1;
      }
    }
    if (runTop >= 0 && lastOpen - runTop > best.bottom - best.top) best = { top: runTop, bottom: lastOpen };
    return best;
  }, { top: bounds.y, bottom: bounds.y + bounds.height, xs: [...columns] });
  assert.ok(
    band.bottom - band.top >= bounds.height * 0.4,
    `drawable canvas band is too small: ${JSON.stringify({ band, bounds })}`,
  );
  return band;
}

/** 각 탭의 마지막 문서 내 커서 위치를 측정 띠 밖으로 옮긴 뒤 크롬 바깥에 둔다. */
export async function parkStudioCollaborationCursors(page: Page): Promise<void> {
  for (const peer of page.context().pages()) {
    if (peer.isClosed()) continue;
    const bounds = await peer.locator('[data-studio-canvas-viewport="true"]').first().boundingBox();
    if (!bounds) continue;
    const x = bounds.x + bounds.width * 0.08;
    const band = await drawableCanvasBand(peer, bounds, [x]);
    await peer.mouse.move(x, (band.top + band.bottom) / 2);
    await peer.mouse.move(8, 8);
  }
}
