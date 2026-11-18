import type { Page } from "@playwright/test";

export interface Bg3dSampleSurface {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly bufferWidth: number;
  readonly bufferHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly dpr: number;
}

/** Refuse clipping, resizing and target drift instead of sampling a different rectangle. */
export function assertBg3dSampleSurface(
  actual: Bg3dSampleSurface,
  expected?: Bg3dSampleSurface,
): void {
  if (Object.values(actual).some((value) => !Number.isFinite(value))
    || actual.width <= 0 || actual.height <= 0
    || actual.cssWidth <= 0 || actual.cssHeight <= 0
    || actual.bufferWidth <= 0 || actual.bufferHeight <= 0
    || actual.dpr !== 1 || actual.x < 0 || actual.y < 0
    || actual.x + actual.width > actual.viewportWidth + 0.01
    || actual.y + actual.height > actual.viewportHeight + 0.01) {
    throw new Error(`BG3D capture requires a fully visible, nonempty 1x surface: ${JSON.stringify(actual)}`);
  }
  if (expected && (Object.keys(expected) as (keyof Bg3dSampleSurface)[])
    .some((key) => Math.abs(actual[key] - expected[key]) > 0.01)) {
    throw new Error(`BG3D capture surface changed: ${JSON.stringify({ expected, actual })}`);
  }
}

/** Match the pinned Playwright element screenshot's enclosing integer pixel rectangle.
 * A CSS origin such as y=123.796875 with height=766 covers 767 device pixels at 1x.
 * Passing that fractional origin straight to CDP instead produces a 766px crop. Enclose the
 * same rectangle as locator.screenshot(), without moving the page or altering/resampling PNGs.
 * The 1e-3 tolerance matches Playwright 1.62.1 server/helper.ts: enclosingIntRect.
 */
export function resolveBg3dCompositorClip(surface: Bg3dSampleSurface) {
  assertBg3dSampleSurface(surface);
  const epsilon = 1e-3;
  const x = Math.floor(surface.x + epsilon);
  const y = Math.floor(surface.y + epsilon);
  const right = Math.ceil(surface.x + surface.width - epsilon);
  const bottom = Math.ceil(surface.y + surface.height - epsilon);
  if (right <= x || bottom <= y || right > surface.viewportWidth || bottom > surface.viewportHeight) {
    throw new Error("BG3D enclosing pixel rectangle is empty or outside the viewport");
  }
  return { x, y, width: right - x, height: bottom - y, scale: 1 };
}

/**
 * Sample the same visible Chromium compositor surface without repeating locator.screenshot's
 * scroll/actionability/font/animation-frame preparation for every observation. No renderer calls,
 * paused animations, synthetic frames, viewport changes or image edits are performed here.
 * The runtime separately cross-checks a settled sample with the original locator screenshot.
 */
export async function createBg3dCompositorSampler(page: Page, selector: string) {
  const read = () => page.locator(selector).evaluate((element): Bg3dSampleSurface => {
    const canvas = element as HTMLCanvasElement;
    if (!canvas.isConnected) throw new Error("BG3D canvas detached during capture");
    const rect = canvas.getBoundingClientRect();
    // 창 안에 있어도 스크롤 조상 뒤에 가려진 픽셀은 장면 증거가 아니다.
    // locator.screenshot의 자동 스크롤 전에 두 캡처가 같은 온전한 표면인지 확인한다.
    for (let parent = canvas.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const box = parent.getBoundingClientRect();
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;
      // clientWidth/Height는 정수이므로 소수 CSS 크기의 온전한 표면도 잘렸다고 오판한다.
      // 실제 경계는 BCR에서 보더와 네이티브 스크롤바 폭만 제외해 구한다.
      const scrollbarWidth = Math.max(0, parent.offsetWidth - parent.clientWidth - Math.round(borderLeft + borderRight));
      const scrollbarHeight = Math.max(0, parent.offsetHeight - parent.clientHeight - Math.round(borderTop + borderBottom));
      const leftScrollbar = style.direction === "rtl" ? scrollbarWidth : 0;
      const left = box.left + borderLeft + leftScrollbar;
      const top = box.top + borderTop;
      const right = box.right - borderRight - scrollbarWidth + leftScrollbar;
      const bottom = box.bottom - borderBottom - scrollbarHeight;
      const clips = (overflow: string) => /^(hidden|auto|scroll|clip)$/u.test(overflow);
      if ((clips(style.overflowX) && (rect.left < left - 0.01 || rect.right > right + 0.01))
        || (clips(style.overflowY) && (rect.top < top - 0.01 || rect.bottom > bottom + 0.01))) {
        throw new Error(`BG3D canvas is clipped by ${parent.tagName}: ${JSON.stringify({ canvas: rect.toJSON(), clip: box.toJSON() })}`);
      }
    }
    return {
      cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight,
      bufferWidth: canvas.width, bufferHeight: canvas.height,
      x: rect.x + window.scrollX, y: rect.y + window.scrollY,
      width: rect.width, height: rect.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
    };
  });
  const initial = await read();
  assertBg3dSampleSurface(initial);
  const session = await page.context().newCDPSession(page);
  let disposed = false;
  return {
    async assertUnchanged() {
      if (disposed) throw new Error("BG3D compositor sampler has been disposed");
      assertBg3dSampleSurface(await read(), initial);
    },
    async capture() {
      if (disposed) throw new Error("BG3D compositor sampler has been disposed");
      const before = await read();
      assertBg3dSampleSurface(before, initial);
      const started = Date.now();
      const result = await session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
        clip: resolveBg3dCompositorClip(before),
      });
      const captureMs = Date.now() - started;
      const surface = await read();
      assertBg3dSampleSurface(surface, before);
      return { png: Buffer.from(result.data, "base64"), surface, captureMs };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await session.detach();
    },
  };
}
