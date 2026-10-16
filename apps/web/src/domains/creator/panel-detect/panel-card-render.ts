/**
 * 카드뉴스 카드를 PNG 로 굽는다 — 카드마다 1080×1350(4:5) 한 장.
 *
 * 카드 한 장은 원본의 가로 전체 × 계획의 행 범위를 카드 폭에 맞춰 그린 것이다. 조각이 카드보다 낮으면 위·아래(또는 아래)에
 * 계획의 바탕색이 남는다. 원본은 읽기만 하고, 카드 하나가 끝날 때마다 화면에 양보하며 취소 신호를 확인한다.
 */

import {
  canDrawSurface,
  defaultRenderYield,
  encodeRenderSurface,
  openRenderSurface,
  PanelRenderError,
  throwIfRenderAborted,
} from "./panel-render-core";

import type { PanelCanvasDeps, PanelDrawable } from "./panel-canvas-adapter";
import type { CardAlignment, CardSlice, CardSlicePlan } from "./panel-card-slice-types";

export interface CardRenderOptions {
  readonly alignment: CardAlignment;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
  readonly yieldNow?: () => Promise<void>;
}

export interface RenderedCard {
  /** 0부터. */
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly blob: Blob;
}

/** 카드 안에서 조각이 놓이는 세로 위치. */
export function cardContentOffset(plan: CardSlicePlan, card: CardSlice, alignment: CardAlignment): number {
  return alignment === "center" ? Math.floor((plan.cardHeight - card.outputHeight) / 2) : 0;
}

export function canRenderCards(plan: CardSlicePlan): boolean {
  return canDrawSurface(plan.cardWidth, plan.cardHeight);
}

export async function renderCardNewsCards(
  plan: CardSlicePlan,
  source: PanelDrawable,
  deps: PanelCanvasDeps,
  options: CardRenderOptions,
): Promise<RenderedCard[]> {
  if (!canRenderCards(plan)) throw new PanelRenderError("surface-unavailable", 1);
  const yieldNow = options.yieldNow ?? defaultRenderYield;
  const rendered: RenderedCard[] = [];
  for (const card of plan.cards) {
    throwIfRenderAborted(options.signal);
    const surface = openRenderSurface(deps, plan.cardWidth, plan.cardHeight, card.index + 1);
    surface.fill(plan.background);
    surface.drawSource(
      source,
      { x: 0, y: card.y0, width: plan.sourceWidth, height: card.y1 - card.y0 },
      { x: 0, y: cardContentOffset(plan, card, options.alignment), width: plan.cardWidth, height: card.outputHeight },
    );
    const blob = await encodeRenderSurface(surface, card.index + 1);
    rendered.push({ index: card.index, width: plan.cardWidth, height: plan.cardHeight, blob });
    options.onProgress?.(rendered.length, plan.cards.length);
    await yieldNow();
  }
  throwIfRenderAborted(options.signal);
  return rendered;
}
