import assert from "node:assert/strict";

import type { BrowserContext, Page } from "playwright";

export interface DrawingCaptureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export const drawingCaptureRegions = new WeakMap<Page, DrawingCaptureRegion>();
interface CaptureGeometry { readonly width: number; readonly height: number; }
interface CapturePoint { readonly x: number; readonly y: number; }
interface AuthoredPath { readonly author: number; readonly zoom: number; readonly points: readonly CapturePoint[]; }
interface CaptureAlignment { readonly desiredX: number; readonly desiredY: number; readonly shiftX: number; readonly shiftY: number; }
interface CaptureProof { readonly page: number; readonly zoom: number; readonly region: DrawingCaptureRegion; readonly alignment: CaptureAlignment; readonly paths: readonly { readonly author: number; readonly pointCount: number; readonly brushMarginPx: number; readonly bounds: DrawingCaptureRegion }[]; }
const captureAlignments = new WeakMap<Page, CaptureAlignment>();
const captureGeometries = new WeakMap<BrowserContext, CaptureGeometry>();
const authoredPaths = new WeakMap<BrowserContext, AuthoredPath[]>();
const captureProofs = new WeakMap<BrowserContext, CaptureProof[]>();

async function viewportBounds(page: Page): Promise<DrawingCaptureRegion> {
  const viewport = await page.locator('[data-studio-canvas-viewport="true"]').first().boundingBox();
  assert.ok(viewport, "그리기 픽셀 영역의 캔버스 위치를 읽지 못했습니다.");
  return viewport;
}
async function visibleZoom(page: Page): Promise<number> {
  const text = await page.locator('[data-studio-status-bar="true"]:visible').first().innerText();
  const percent = /([0-9]+(?:\.[0-9]+)?)%/u.exec(text)?.[1];
  assert.ok(percent, `실제 보기 배율을 읽지 못했습니다: ${text}`);
  const zoom = Number(percent) / 100;
  assert.ok(Number.isFinite(zoom) && zoom > 0, "보기 배율은 유한한 양수여야 합니다.");
  return zoom;
}

/** 크롬 높이가 바뀌어도 같은 pixel 크기를 현재 원고 뷰포트 중심에 정렬한다. */
export async function drawingCaptureRegion(page: Page): Promise<DrawingCaptureRegion> {
  const viewport = await viewportBounds(page);
  const columns = Array.from({ length: 13 }, (_, index) => viewport.x + viewport.width * (0.08 + 0.84 * index / 12));
  const band = await drawableCanvasBand(page, viewport, columns);
  const context = page.context();
  let geometry = captureGeometries.get(context);
  if (!geometry) {
    geometry = { width: Math.floor(viewport.width * 0.86), height: Math.floor(Math.min(520, (band.bottom - band.top) * 0.6)) };
    captureGeometries.set(context, geometry);
  }
  assert.ok(geometry.width >= 100 && geometry.height >= 100, "전체 시험 획을 담을 측정 영역이 부족합니다.");
  const desiredX = Math.round(viewport.x + viewport.width / 2 - geometry.width / 2);
  const desiredY = Math.round(viewport.y + viewport.height / 2 - geometry.height / 2);
  assert.ok(band.bottom - band.top >= geometry.height + 16,
    `같은 pixel 크기를 보존할 가시 캔버스 띠가 부족합니다: ${JSON.stringify({ geometry, band, viewport })}`);
  // 같은 크기를 지키면서 원래 도움 버튼·복구 안내와 겹친 부분만 가시 띠 안으로 최소 이동한다.
  const region = { x: desiredX, y: Math.max(Math.ceil(band.top + 8), Math.min(desiredY, Math.floor(band.bottom - geometry.height - 8))), ...geometry };
  captureAlignments.set(page, { desiredX, desiredY, shiftX: region.x - desiredX, shiftY: region.y - desiredY });
  assert.ok(region.x >= viewport.x && region.x + region.width <= viewport.x + viewport.width
    && region.y >= band.top && region.y + region.height <= band.bottom,
  `고정 크기 측정 영역이 가시 캔버스를 벗어났습니다: ${JSON.stringify({ region, band, viewport })}`);
  drawingCaptureRegions.set(page, region);
  return region;
}

/** 입력한 전체 49점 경로를 캔버스 중심·실제 보기 배율 기준으로 보관한다. */
export async function recordDrawingStrokePath(page: Page, path: readonly CapturePoint[]): Promise<void> {
  const viewport = await viewportBounds(page), zoom = await visibleZoom(page);
  const context = page.context(), paths = authoredPaths.get(context) ?? [];
  paths.push({ author: context.pages().indexOf(page), zoom, points: path.map(point => ({
    x: (point.x - viewport.x - viewport.width / 2) / zoom,
    y: (point.y - viewport.y - viewport.height / 2) / zoom,
  })) });
  authoredPaths.set(context, paths);
}

/** 모든 탭의 실제 입력 경로를 현재 배율로 투영해 매 합성 캡처의 전체 경로 포함을 증명한다. */
export async function verifyDrawingCapturePaths(page: Page, region: DrawingCaptureRegion): Promise<void> {
  const viewport = await viewportBounds(page), zoom = await visibleZoom(page), context = page.context();
  const paths = (authoredPaths.get(context) ?? []).map(path => {
    const projected = path.points.map(point => ({ x: viewport.x + viewport.width / 2 + point.x * zoom, y: viewport.y + viewport.height / 2 + point.y * zoom }));
    const margin = Math.max(8, 4 * zoom);
    assert.ok(projected.every(point => point.x - margin >= region.x && point.x + margin <= region.x + region.width
      && point.y - margin >= region.y && point.y + margin <= region.y + region.height),
    `시험 획 전체 경로가 측정 영역에 들어오지 않습니다: ${JSON.stringify({ author: path.author, zoom, region, projected })}`);
    const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
    return { author: path.author, pointCount: projected.length, brushMarginPx: margin, bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } };
  });
  const proofs = captureProofs.get(context) ?? [];
  const alignment = captureAlignments.get(page);
  assert.ok(alignment, "pixel 영역의 중심 정렬·최소 이동 영수증이 없습니다.");
  proofs.push({ page: context.pages().indexOf(page), zoom, region, alignment, paths });
  captureProofs.set(context, proofs);
}
export function drawingCaptureEvidence(page: Page): unknown {
  const context = page.context();
  const paths = authoredPaths.get(context) ?? [];
  assert.equal(paths.length, 4, "전체 4획의 입력 경로가 기록되어야 합니다.");
  assert.ok(paths.every(path => path.points.length === 49), "각 시험 획의 전체 49점이 보존되어야 합니다.");
  return { geometry: captureGeometries.get(context), authoredPaths: paths, snapshots: captureProofs.get(context) };
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
    await peer.bringToFront();
    await peer.mouse.move(x, band.top + 24);
    // rAF·커서 전송 throttle이 문서 안의 마지막 위치를 먼저 게시하게 한다.
    await peer.waitForTimeout(150);
    await peer.mouse.move(8, 8);
  }
}
