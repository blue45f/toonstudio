import type { CDPSession, Locator } from "playwright";

export async function readNativeTouchScrollGeometry(handle: Locator) {
  return handle.evaluate((element) => {
    const section = element.closest("[data-bg3d-professional-workspace]");
    if (!section) throw new Error("3D scroll handle has no professional workspace scroll container");
    const box = element.getBoundingClientRect();
    const clip = section.getBoundingClientRect();
    const left = Math.max(box.left, clip.left, 0);
    const top = Math.max(box.top, clip.top, 0);
    const right = Math.min(box.right, clip.right, innerWidth);
    const bottom = Math.min(box.bottom, clip.bottom, innerHeight);
    return {
      width: right - left, height: bottom - top,
      x: (left + right) / 2, y: (top + bottom) / 2,
      scrollTop: section.scrollTop, scrollHeight: section.scrollHeight, clientHeight: section.clientHeight,
      viewportWidth: innerWidth, viewportHeight: innerHeight, deviceScaleFactor: devicePixelRatio,
      visualViewportScale: visualViewport?.scale ?? 1,
      touchAction: getComputedStyle(element).touchAction,
      sectionTouchAction: getComputedStyle(section).touchAction,
      sectionOverflowY: getComputedStyle(section).overflowY,
    };
  });
}

/** Send every native touch point; the scroll assertions still decide whether the page consumed it. */
export async function dispatchNativeTouchDrag(
  cdp: CDPSession,
  { x, y, yDistance, speed }: { x: number; y: number; yDistance: number; speed: number },
): Promise<void> {
  const steps = Math.max(1, Math.ceil(Math.abs(yDistance) / speed * 60));
  const intervalMs = Math.abs(yDistance) / speed * 1_000 / steps;
  const point = (nextY: number) => ({ id: 1, x, y: nextY });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(y)] });
  try {
    for (let step = 1; step <= steps; step += 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [point(y + yDistance * step / steps)],
      });
    }
  } finally {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
}
