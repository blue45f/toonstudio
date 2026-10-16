/**
 * 컷 사각형을 내용에 맞춰 줄인다 — 사용자가 대충 그린 사각형이나 분할 제안으로 나눈 조각의 여백을 걷어 낸다.
 *
 * 감지와 같은 규칙(여백색 허용 오차, 줄 길이의 1.2% 허용)으로 사각형 안에서 내용이 있는 첫·끝 행/열을 찾는다.
 * 사각형 안에 내용이 없으면 null.
 */

import { PANEL_DETECT_INK_TOLERANCE } from "./panel-detect-runtime";
import { allowedInk } from "./panel-detect-profile";
import { createInkTest } from "./panel-detect-raster";

import type { GutterInfo, PanelDetectRaster, PanelRect } from "./panel-detect-types";

export function tightenRectToContent(
  raster: PanelDetectRaster,
  gutter: GutterInfo,
  rect: PanelRect,
): PanelRect | null {
  if (gutter.kind === "none") return rect;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(raster.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(raster.height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return null;
  const isInk = createInkTest(gutter);
  const data = raster.data;
  const rowCounts = new Int32Array(y1 - y0);
  const colCounts = new Int32Array(x1 - x0);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (isInk(data, (y * raster.width + x) * 4)) {
        rowCounts[y - y0] += 1;
        colCounts[x - x0] += 1;
      }
    }
  }
  const rowAllowed = allowedInk(x1 - x0, PANEL_DETECT_INK_TOLERANCE);
  const colAllowed = allowedInk(y1 - y0, PANEL_DETECT_INK_TOLERANCE);
  let top = -1;
  let bottom = -1;
  for (let i = 0; i < rowCounts.length; i += 1) {
    if (rowCounts[i] > rowAllowed) {
      if (top < 0) top = i;
      bottom = i;
    }
  }
  let left = -1;
  let right = -1;
  for (let i = 0; i < colCounts.length; i += 1) {
    if (colCounts[i] > colAllowed) {
      if (left < 0) left = i;
      right = i;
    }
  }
  if (top < 0 || left < 0) return null;
  return { x: x0 + left, y: y0 + top, width: right - left + 1, height: bottom - top + 1 };
}
