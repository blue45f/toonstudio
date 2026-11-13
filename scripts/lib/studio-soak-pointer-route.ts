import { createStudioPointerStrokePoints } from "./studio-pointer-input-driver.mjs";
import { measureStudioSmartShapeCanvasSpace, type StudioSmartShapeCanvasSpace, type StudioSmartShapeRect } from "./studio-smart-shape-visible-grid";

import type { Page } from "playwright";

const valid = (rect: StudioSmartShapeRect) => [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
  && rect.right > rect.left && rect.bottom > rect.top;

/** 실측 가림의 경계만 사용해 최대 가용 사각형을 고른다. UI를 숨기거나 임의 여백을 더하지 않는다. */
export function selectStudioSoakCanvasRect({ canvas, obstructions }: StudioSmartShapeCanvasSpace) {
  if (!valid(canvas) || obstructions.some((rect) => !valid(rect))) {
    throw new Error("소크 입력에는 유효한 실제 캔버스와 가림 영역 실측이 필요합니다.");
  }
  const obstacles = obstructions.map((rect) => ({
    left: Math.max(canvas.left, rect.left), right: Math.min(canvas.right, rect.right),
    top: Math.max(canvas.top, rect.top), bottom: Math.min(canvas.bottom, rect.bottom),
  })).filter(valid);
  const edges = [...new Set([canvas.left, canvas.right, ...obstacles.flatMap((rect) => [rect.left, rect.right])])].sort((a, b) => a - b);
  const best: { box: { x: number; y: number; width: number; height: number } | null } = { box: null };
  const consider = (left: number, right: number, top: number, bottom: number) => {
    const width = right - left, height = bottom - top;
    if (width < 120 || height < 120) return;
    const selected = best.box;
    const area = width * height, bestArea = selected ? selected.width * selected.height : -1;
    if (!selected || area > bestArea || area === bestArea && (width > selected.width
      || width === selected.width && (top < selected.y || top === selected.y && left < selected.x))) {
      best.box = { x: left, y: top, width, height };
    }
  };
  for (let l = 0; l < edges.length - 1; l += 1) for (let r = l + 1; r < edges.length; r += 1) {
    const left = edges[l]!, right = edges[r]!;
    if (right - left < 120) continue;
    const intervals = obstacles.filter((rect) => rect.left < right && rect.right > left)
      .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    let top = canvas.top;
    for (const rect of intervals) {
      consider(left, right, top, rect.top);
      top = Math.max(top, rect.bottom);
    }
    consider(left, right, top, canvas.bottom);
  }
  if (!best.box) throw new Error("실제 가림을 피하는 120×120 이상의 소크 입력 영역이 없습니다.");
  return best.box;
}

/** 기존 포인터 드라이버의 압력·기울기·회전과 29점 경로를 그대로 사용한다. */
export async function prepareStudioSoakPointerRoute(page: Page, cycle: number) {
  const stage = page.locator(".konvajs-content").first();
  const space = await stage.evaluate(measureStudioSmartShapeCanvasSpace);
  const box = selectStudioSoakCanvasRect(space);
  return { box, points: createStudioPointerStrokePoints(box, cycle, { steps: 28 }) };
}

/** screenshot의 애니메이션 정리 후 입력 직전에 모든 점의 실제 포인터 수신자를 확인한다. */
export async function assertStudioSoakPointerRoute(page: Page, points: readonly { x: number; y: number }[]) {
  if (points.length !== 29) throw new Error("소크 입력에는 원래 드라이버의 전체 29점이 필요합니다.");
  const blocked = await page.locator(".konvajs-content").first().evaluate((stage, route) => route.flatMap((point, index) => {
    const hit = document.elementFromPoint(point.x, point.y);
    return hit instanceof HTMLCanvasElement && stage.contains(hit) ? [] : [{
      index, x: point.x, y: point.y, target: hit?.tagName ?? null,
      control: hit?.closest("[data-studio-shell-floating-target]")?.getAttribute("data-studio-shell-floating-target") ?? null,
    }];
  }), [...points]);
  if (blocked.length > 0) throw new Error(`소크 포인터 경로가 실제 캔버스에 닿지 않습니다: ${JSON.stringify(blocked)}`);
}
