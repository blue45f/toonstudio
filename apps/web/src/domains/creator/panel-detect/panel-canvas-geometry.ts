/**
 * 컷 편집 화면의 좌표 계산 — 순수 함수. DOM 을 읽지 않고 필요한 값(경계 상자, 이미지 크기)을 인자로 받는다.
 *
 * 화면의 겹침 도구는 이미지와 같은 가로세로 비율의 상자 안에 있어서, 이미지 픽셀 좌표를 상자 대비 퍼센트로 두면
 * 이미지가 어떤 크기로 표시돼도 위치가 맞는다. 포인터 좌표는 상자 경계로 다시 이미지 픽셀로 되돌린다.
 */

import { PANEL_EDIT_MIN_SIDE } from "./panel-detect-edit";

import type { CSSProperties } from "react";
import type { PanelRect } from "./panel-detect-types";

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

export interface ClientBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ImagePoint {
  readonly x: number;
  readonly y: number;
}

function percent(value: number, whole: number): string {
  return `${Math.round((value / whole) * 100_000) / 1_000}%`;
}

/** 이미지 픽셀 사각형을 상자 대비 퍼센트 위치로 바꾼다. */
export function percentRectStyle(rect: PanelRect, image: ImageSize): CSSProperties {
  return {
    left: percent(rect.x, image.width),
    top: percent(rect.y, image.height),
    width: percent(rect.width, image.width),
    height: percent(rect.height, image.height),
  };
}

/** 화면 좌표를 이미지 픽셀 좌표로 바꾼다(이미지 안으로 맞춘다). 상자가 비어 있으면 null. */
export function clientToImagePoint(client: ImagePoint, bounds: ClientBounds, image: ImageSize): ImagePoint | null {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
  const x = ((client.x - bounds.left) / bounds.width) * image.width;
  const y = ((client.y - bounds.top) / bounds.height) * image.height;
  return {
    x: Math.min(image.width, Math.max(0, x)),
    y: Math.min(image.height, Math.max(0, y)),
  };
}

/** 이미지 1px 이 화면에서 몇 px 인지(표시 배율). */
export function displayScale(bounds: ClientBounds, image: ImageSize): number {
  return image.width > 0 ? bounds.width / image.width : 0;
}

/** 두 점으로 정규화한 정수 사각형. */
export function rectFromPoints(a: ImagePoint, b: ImagePoint): PanelRect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { x: Math.round(x0), y: Math.round(y0), width: Math.round(Math.max(a.x, b.x) - x0), height: Math.round(Math.max(a.y, b.y) - y0) };
}

/** 새 컷을 그릴 때 쓸 수 있는 크기인가(편집 모델의 최소 변 길이). */
export function isDrawableRect(rect: PanelRect): boolean {
  return rect.width >= PANEL_EDIT_MIN_SIDE && rect.height >= PANEL_EDIT_MIN_SIDE;
}

export interface ArrowKeyEvent {
  readonly shiftKey: boolean;
}

/**
 * 방향키 한 번에 움직일 이미지 픽셀 수. 화면 4px 정도를 기본으로 하고(작게 표시된 큰 이미지에서도 눈에 띄게),
 * Shift 를 누르면 정확히 1px.
 */
export function keyboardStep(event: ArrowKeyEvent, scale: number): number {
  if (event.shiftKey) return 1;
  return scale > 0 ? Math.max(1, Math.round(4 / scale)) : 1;
}

/** 가로선(horizontal)은 y 를, 세로선은 x 를 컷 안쪽으로 맞춘다. */
export function clampSplitPosition(rect: PanelRect, orientation: "horizontal" | "vertical", position: number): number {
  const start = orientation === "horizontal" ? rect.y : rect.x;
  const length = orientation === "horizontal" ? rect.height : rect.width;
  return Math.min(start + length - PANEL_EDIT_MIN_SIDE, Math.max(start + PANEL_EDIT_MIN_SIDE, Math.round(position)));
}

/**
 * 원본의 한 영역만 보여 주는 CSS 배경. 요소 크기가 영역 크기(source)에 비례한다면 어떤 크기로 표시돼도 맞다.
 * background-position 의 퍼센트는 (요소 − 배경) × p 이므로 p = 시작 ÷ (전체 − 영역) 이다.
 */
export function regionBackgroundStyle(imageUrl: string, image: ImageSize, region: PanelRect): CSSProperties {
  const spanX = image.width - region.width;
  const spanY = image.height - region.height;
  const px = spanX > 0 ? (region.x / spanX) * 100 : 0;
  const py = spanY > 0 ? (region.y / spanY) * 100 : 0;
  return {
    backgroundImage: `url("${imageUrl}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${(image.width / region.width) * 100}% ${(image.height / region.height) * 100}%`,
    backgroundPosition: `${Math.round(px * 1_000) / 1_000}% ${Math.round(py * 1_000) / 1_000}%`,
  };
}
