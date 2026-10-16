/**
 * 재배열 계획을 실제 PNG 로 굽는다 — 컷마다(Studio 문서 삽입용) 또는 페이지마다(내려받기용).
 *
 * 계획(panel-reflow-plan)은 픽셀을 만지지 않는다. 이 모듈이 원본 이미지의 컷 사각형을 계획의 배율로 그려 새 이미지를 만든다.
 * 원본 이미지는 읽기만 하고 바꾸지 않는다. 컷 하나가 끝날 때마다 화면에 양보하고 취소 신호를 확인한다.
 */

import {
  PanelRenderError,
  canDrawSurface,
  defaultRenderYield,
  encodeRenderSurface,
  openRenderSurface,
  throwIfRenderAborted,
} from "./panel-render-core";

import type { PanelCanvasDeps, PanelDrawable, PanelRenderSurface } from "./panel-canvas-adapter";
import type { PanelReflowPlan, ReflowPage, ReflowPlacement } from "./panel-reflow-plan";

/** Studio 문서(JSON)에 담을 PNG 바이트 합계 상한. base64 와 JSON 이스케이프를 더하면 약 1.4배가 된다. */
export const PANEL_STUDIO_INSERT_MAX_BYTES = 48 * 1024 * 1024;

export interface PanelRenderOptions {
  /** `#rrggbb` 또는 "transparent". 컷 가장자리 보간과 페이지 여백이 이 색으로 깔린다. */
  readonly background: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
  readonly yieldNow?: () => Promise<void>;
}

export interface RenderedCut {
  readonly panelId: string;
  readonly order: number;
  readonly width: number;
  readonly height: number;
  readonly blob: Blob;
}

export interface RenderedPage {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly blob: Blob;
}

/** 브라우저가 한 장으로 만들 수 없는 컷(순서 번호)을 모두 찾는다. 만들기 전에 화면이 미리 알려 줄 때 쓴다. */
export function findOversizedCuts(plan: PanelReflowPlan): number[] {
  return plan.placements.filter((placement) => !canDrawSurface(placement.dest.width, placement.dest.height)).map((placement) => placement.order);
}

/** 내려받기용 페이지 이미지를 만들 수 없는 페이지(번호 1부터)를 모두 찾는다. */
export function findOversizedPages(plan: PanelReflowPlan): number[] {
  return plan.pages.filter((page) => !canDrawSurface(plan.options.targetWidth, page.height)).map((page) => page.index + 1);
}

/**
 * 컷 하나를 면에 그린다. 면이 페이지 전체(폭 규격)이면 계획의 가로 위치(`dest.x`, 가운데 정렬)에 놓고,
 * 면이 컷 자신의 크기면 왼쪽 끝(0)에 놓는다. 컷 면에 `dest.x` 를 또 더하면 규격보다 좁은 컷("원본 크기 유지")이
 * 오른쪽으로 밀려 오른쪽이 잘리고 왼쪽에 빈 띠가 생긴다 — Studio 문서는 컷 이미지를 `문서 오프셋 + dest.x` 에 따로 놓는다.
 */
function paintPlacement(surface: PanelRenderSurface, source: PanelDrawable, placement: ReflowPlacement, origin: { readonly x: number; readonly y: number }): void {
  surface.drawSource(source, placement.source, {
    x: placement.dest.x - origin.x,
    y: placement.dest.y - origin.y,
    width: placement.dest.width,
    height: placement.dest.height,
  });
}

/** 컷마다 PNG 한 장을 만든다(읽기 순서대로). 이미지는 컷 크기 그대로이고 여백은 넣지 않는다. */
export async function renderReflowCuts(
  plan: PanelReflowPlan,
  source: PanelDrawable,
  deps: PanelCanvasDeps,
  options: PanelRenderOptions,
): Promise<RenderedCut[]> {
  const yieldNow = options.yieldNow ?? defaultRenderYield;
  const oversized = findOversizedCuts(plan);
  if (oversized.length > 0) throw new PanelRenderError("surface-unavailable", oversized[0]);
  const rendered: RenderedCut[] = [];
  let bytes = 0;
  for (const placement of plan.placements) {
    throwIfRenderAborted(options.signal);
    const surface = openRenderSurface(deps, placement.dest.width, placement.dest.height, placement.order);
    surface.fill(options.background);
    paintPlacement(surface, source, placement, placement.dest);
    const blob = await encodeRenderSurface(surface, placement.order);
    bytes += blob.size;
    if (bytes > PANEL_STUDIO_INSERT_MAX_BYTES) throw new PanelRenderError("too-large-for-studio", placement.order);
    rendered.push({
      panelId: placement.panelId,
      order: placement.order,
      width: placement.dest.width,
      height: placement.dest.height,
      blob,
    });
    options.onProgress?.(rendered.length, plan.placements.length);
    await yieldNow();
  }
  throwIfRenderAborted(options.signal);
  return rendered;
}

async function renderPage(plan: PanelReflowPlan, page: ReflowPage, source: PanelDrawable, deps: PanelCanvasDeps, background: string): Promise<RenderedPage> {
  const width = plan.options.targetWidth;
  const surface = openRenderSurface(deps, width, page.height, page.index + 1);
  surface.fill(background);
  for (const placement of page.placements) paintPlacement(surface, source, placement, { x: 0, y: 0 });
  const blob = await encodeRenderSurface(surface, page.index + 1);
  return { index: page.index, width, height: page.height, blob };
}

/** 페이지마다 PNG 한 장(폭 규격 × 페이지 높이)을 만든다. 컷 사이에는 계획의 여백이 배경색으로 남는다. */
export async function renderReflowPages(
  plan: PanelReflowPlan,
  source: PanelDrawable,
  deps: PanelCanvasDeps,
  options: PanelRenderOptions,
): Promise<RenderedPage[]> {
  const yieldNow = options.yieldNow ?? defaultRenderYield;
  const oversized = findOversizedPages(plan);
  if (oversized.length > 0) throw new PanelRenderError("surface-unavailable", oversized[0]);
  const pages: RenderedPage[] = [];
  for (const page of plan.pages) {
    throwIfRenderAborted(options.signal);
    pages.push(await renderPage(plan, page, source, deps, options.background));
    options.onProgress?.(pages.length, plan.pages.length);
    await yieldNow();
  }
  throwIfRenderAborted(options.signal);
  return pages;
}
