import { isStaticPreviewReadinessResponse } from "./studio-preview-readiness";

import type { Locator } from "playwright";

export interface StudioSmartShapeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface StudioSmartShapeCanvasSpace {
  readonly canvas: StudioSmartShapeRect;
  readonly obstructions: readonly (StudioSmartShapeRect & { readonly label: string })[];
}

interface FixtureGeometry {
  readonly box: StudioSmartShapeRect;
  readonly path: readonly { readonly x: number; readonly y: number }[];
}

function validRect(rect: StudioSmartShapeRect): boolean {
  return [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
    && rect.right > rect.left && rect.bottom > rect.top;
}

function intersects(a: StudioSmartShapeRect, b: StudioSmartShapeRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** 기존 20px 증거 clip의 반올림 1px까지 포함하며 도형 자체는 확대·축소하지 않는다. */
export function placeStudioSmartShapeGrid<T extends FixtureGeometry>(fixtures: readonly T[], space: StudioSmartShapeCanvasSpace) {
  if (!validRect(space.canvas) || fixtures.length === 0 || space.obstructions.some((rect) => !validRect(rect))
    || fixtures.some((fixture) => !validRect(fixture.box) || fixture.path.length === 0
      || fixture.path.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
    throw new Error("Smart Shape 그리드와 실제 캔버스·가림 영역의 유효한 실측이 필요합니다.");
  }
  const padding = 21, gap = 8;
  const originalRoi = {
    left: Math.min(...fixtures.map(({ box }) => box.left), ...fixtures.flatMap(({ path }) => path.map(({ x }) => x))) - padding,
    top: Math.min(...fixtures.map(({ box }) => box.top), ...fixtures.flatMap(({ path }) => path.map(({ y }) => y))) - padding,
    right: Math.max(...fixtures.map(({ box }) => box.right), ...fixtures.flatMap(({ path }) => path.map(({ x }) => x))) + padding,
    bottom: Math.max(...fixtures.map(({ box }) => box.bottom), ...fixtures.flatMap(({ path }) => path.map(({ y }) => y))) + padding,
  };
  const obstacles = space.obstructions.map((rect) => ({
    left: rect.left - gap, top: rect.top - gap, right: rect.right + gap, bottom: rect.bottom + gap,
  }));
  const x = new Set([0, space.canvas.left + gap - originalRoi.left, space.canvas.right - gap - originalRoi.right]);
  const y = new Set([0, space.canvas.top + gap - originalRoi.top, space.canvas.bottom - gap - originalRoi.bottom]);
  for (const obstacle of obstacles) {
    x.add(obstacle.left - originalRoi.right); x.add(obstacle.right - originalRoi.left);
    y.add(obstacle.top - originalRoi.bottom); y.add(obstacle.bottom - originalRoi.top);
  }
  const xs = [...x].filter((value) => originalRoi.left + value >= space.canvas.left + gap
    && originalRoi.right + value <= space.canvas.right - gap);
  const ys = [...y].filter((value) => originalRoi.top + value >= space.canvas.top + gap
    && originalRoi.bottom + value <= space.canvas.bottom - gap);
  const candidates: Array<{ x: number; y: number; roi: StudioSmartShapeRect }> = [];
  for (const dx of xs) for (const dy of ys) {
    const roi = { left: originalRoi.left + dx, top: originalRoi.top + dy, right: originalRoi.right + dx, bottom: originalRoi.bottom + dy };
    if (obstacles.every((obstacle) => !intersects(roi, obstacle))) candidates.push({ x: dx, y: dy, roi });
  }
  candidates.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y
    || Math.abs(a.y) - Math.abs(b.y) || a.x - b.x || a.y - b.y);
  const selected = candidates[0];
  if (!selected) throw new Error("동일 크기 Smart Shape 그리드 전체를 가리지 않는 캔버스 영역이 없습니다.");
  const placed = fixtures.map((fixture) => ({
    ...fixture,
    box: { left: fixture.box.left + selected.x, top: fixture.box.top + selected.y, right: fixture.box.right + selected.x, bottom: fixture.box.bottom + selected.y },
    path: fixture.path.map((point) => ({ ...point, x: point.x + selected.x, y: point.y + selected.y })),
  }));
  return { fixtures: placed, translation: { x: selected.x, y: selected.y }, originalRoi, roi: selected.roi, ...space };
}

/** DOM 관측만 한다. overflow 경계와 실제 포인터를 받는 외부 controls를 모두 예약한다. */
export function measureStudioSmartShapeCanvasSpace(stage: Element): StudioSmartShapeCanvasSpace & { readonly floating: StudioSmartShapeFloatingReadiness } {
  const rect = stage.getBoundingClientRect();
  const canvas = { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) };
  for (let ancestor = stage.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
    const scaleX = ancestor.offsetWidth > 0 ? bounds.width / ancestor.offsetWidth : 1;
    const scaleY = ancestor.offsetHeight > 0 ? bounds.height / ancestor.offsetHeight : 1;
    if (/^(auto|scroll|hidden|clip|overlay)$/u.test(style.overflowX)) {
      canvas.left = Math.max(canvas.left, bounds.left + ancestor.clientLeft * scaleX);
      canvas.right = Math.min(canvas.right, bounds.left + (ancestor.clientLeft + ancestor.clientWidth) * scaleX);
    }
    if (/^(auto|scroll|hidden|clip|overlay)$/u.test(style.overflowY)) {
      canvas.top = Math.max(canvas.top, bounds.top + ancestor.clientTop * scaleY);
      canvas.bottom = Math.min(canvas.bottom, bounds.top + (ancestor.clientTop + ancestor.clientHeight) * scaleY);
    }
  }
  const obstructions = new Map<string, StudioSmartShapeCanvasSpace["obstructions"][number]>();
  for (const element of document.body.querySelectorAll("*")) {
    if (element.contains(stage) || stage.contains(element)) continue;
    const bounds = element.getBoundingClientRect();
    const left = Math.max(canvas.left, bounds.left), top = Math.max(canvas.top, bounds.top);
    const right = Math.min(canvas.right, bounds.right), bottom = Math.min(canvas.bottom, bounds.bottom);
    if (right <= left || bottom <= top) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.pointerEvents === "none") continue;
    const dx = Math.min(0.5, (right - left) / 2), dy = Math.min(0.5, (bottom - top) / 2);
    let blocks = false;
    for (const x of [left + dx, (left + right) / 2, right - dx]) {
      for (const y of [top + dy, (top + bottom) / 2, bottom - dy]) {
        const hit = document.elementFromPoint(x, y);
        if (hit === element) blocks = true;
      }
    }
    if (blocks) obstructions.set(`${left},${top},${right},${bottom}`, {
      left, top, right, bottom,
      label: element.closest("[data-studio-shell-floating-target]")?.getAttribute("data-studio-shell-floating-target")
        ?? element.getAttribute("aria-label") ?? element.tagName.toLowerCase(),
    });
  }
  const floating = {
    connectivity: document.documentElement.dataset.studioConnectivity ?? null,
    networkFeatures: document.documentElement.dataset.studioNetworkFeatures ?? null,
    canvas,
    targets: [...document.querySelectorAll('[data-studio-shell-floating-target="offline-readiness"], [data-studio-shell-floating-target="collaboration"]')]
      .map((node) => {
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return {
          id: node.getAttribute("data-studio-shell-floating-target"),
          managed: node.getAttribute("data-studio-shell-layout-managed"),
          hidden: node.getAttribute("data-studio-shell-layout-hidden"),
          localOnly: node.querySelector("[data-studio-offline-panel]")?.getAttribute("data-studio-local-only") ?? null,
          summary: node.querySelector("summary")?.textContent?.trim() ?? null,
          visible: rect.width > 0 && rect.height > 0 && style.display !== "none"
            && style.visibility !== "hidden" && style.visibility !== "collapse",
          rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        };
      }),
  };
  return { canvas, obstructions: [...obstructions.values()], floating };
}

export interface StudioSmartShapeFloatingReadiness {
  readonly connectivity: string | null;
  readonly networkFeatures: string | null;
  readonly canvas: StudioSmartShapeRect | null;
  readonly targets: readonly {
    readonly id: string | null;
    readonly managed: string | null;
    readonly hidden: string | null;
    readonly localOnly: string | null;
    readonly summary: string | null;
    readonly visible: boolean;
    readonly rect: StudioSmartShapeRect;
  }[];
}

/** 부분 degraded와 정적 preview의 실제 API 부재를 혼동하지 않는다. */
export function requiresStudioSmartShapeOfflinePanel(ownsStaticPreview: boolean, diagnostics: readonly string[], studioUrl: string): boolean {
  const url = new URL("/api/health/capabilities", studioUrl).href;
  return ownsStaticPreview && isStaticPreviewReadinessResponse(502, url, studioUrl)
    && diagnostics.includes(`smart-shapes: 502 ${url}`);
}

export function studioSmartShapeFloatingReady(state: StudioSmartShapeFloatingReadiness, requiresOfflinePanel: boolean): boolean {
  if (state.targets.some((target) => target.visible && (target.managed !== "true" || target.hidden !== "false" || !validRect(target.rect)))) return false;
  if (!requiresOfflinePanel) return true;
  const offline = state.targets.filter(({ id }) => id === "offline-readiness");
  const target = offline[0], canvas = state.canvas;
  // 새 context에는 사용자 저장 배치가 없다. checking 중의 화면 가장자리 배치를 확정하지 않는다.
  return state.connectivity === "server-unavailable" && state.networkFeatures === "local-only"
    && offline.length === 1 && Boolean(target?.visible) && target?.localOnly === "true"
    && Boolean(canvas && validRect(canvas) && target && target.rect.left >= canvas.left
      && target.rect.top >= canvas.top && target.rect.right <= canvas.right && target.rect.bottom <= canvas.bottom);
}

/** 새 대기 시간을 더하지 않고 기존 준비 기한 안에서 연속 프레임의 실제 배치를 확인한다. */
export async function waitForStudioSmartShapeFloatingReady(stage: Locator, deadline: number, requiresOfflinePanel: () => boolean) {
  let previous: string | null = null, stableFrames = 0;
  while (Date.now() < deadline) {
    const measurement = await stage.evaluate(measureStudioSmartShapeCanvasSpace);
    const key = JSON.stringify(measurement.floating);
    stableFrames = studioSmartShapeFloatingReady(measurement.floating, requiresOfflinePanel()) && key === previous ? stableFrames + 1 : 0;
    if (stableFrames >= 2 && Date.now() < deadline) return measurement;
    previous = key;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const frame = await stage.page().waitForFunction(() => new Promise<boolean>((resolve) => requestAnimationFrame(() => resolve(true))),
      undefined, { timeout: remaining });
    await frame.dispose();
  }
  throw new Error("Smart Shape 초기 준비 기한 안에 연결 안내의 실제 표시·배치를 확인하지 못했습니다.");
}
