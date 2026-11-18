import type { Page } from "playwright";

interface Point { readonly x: number; readonly y: number }
interface EraserFixtureObservation {
  readonly pixels: readonly number[][];
  readonly changedPixels: readonly number[];
}
export interface StudioEraserLatencyFixture {
  readonly points: readonly Point[];
  readonly baseline: readonly number[][];
  readonly strokeCount: number;
}

/** 측정 전에만 읽는 작은 패치다. 실제 안료가 없는 지우개 준비는 성공으로 간주하지 않는다. */
export function observeStudioEraserLatencyFixture(input: {
  readonly points: readonly Point[];
  readonly baseline?: readonly number[][];
}): EraserFixtureObservation | false {
  const stage = document.querySelector<HTMLElement>(".konvajs-content");
  if (!stage) throw new Error("지우개 지연 검증의 캔버스가 없습니다.");
  const compositor = stage.parentElement?.closest<HTMLElement>(".relative") ?? stage;
  const size = 12;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("지우개 준비 픽셀을 읽을 수 없습니다.");
  const pixels = input.points.map(point => {
    context.clearRect(0, 0, size, size);
    for (const layer of compositor.querySelectorAll<HTMLCanvasElement>("canvas")) {
      const rect = layer.getBoundingClientRect();
      if (layer.width <= 0 || layer.height <= 0 || rect.width <= 0 || rect.height <= 0) continue;
      context.drawImage(layer,
        (point.x - size / 2 - rect.left) * layer.width / rect.width,
        (point.y - size / 2 - rect.top) * layer.height / rect.height,
        size * layer.width / rect.width, size * layer.height / rect.height, 0, 0, size, size);
    }
    return Array.from(context.getImageData(0, 0, size, size).data);
  });
  if (!input.baseline) return { pixels, changedPixels: [] };
  if (input.baseline.length !== pixels.length || pixels.length === 0) {
    throw new Error("지우개 준비 패치의 개수가 일치하지 않습니다.");
  }
  const changedPixels = pixels.map((current, index) => {
    const before = input.baseline?.[index];
    if (!before || before.length !== current.length) throw new Error("지우개 준비 패치의 크기가 다릅니다.");
    let changed = 0;
    for (let offset = 0; offset < current.length; offset += 4) {
      if ([0, 1, 2, 3].some(channel => Math.abs((current[offset + channel] ?? 0) - (before[offset + channel] ?? 0)) >= 8)) changed += 1;
    }
    return changed;
  });
  return changedPixels.every(count => count >= 4) ? { pixels, changedPixels } : false;
}

/** 호출자가 선택한 실제 펜으로 지울 경로를 만든다. 지우개 제스처나 내부 상태 주입은 없다. */
export async function prepareStudioEraserLatencyFixture(
  page: Page,
  routes: readonly (readonly Point[])[],
): Promise<StudioEraserLatencyFixture> {
  const points = routes.flatMap(route => route.filter((_, index) => index === 0 || index === route.length - 1 || index % 6 === 0));
  if (routes.length === 0 || routes.some(route => route.length < 2)) throw new Error("지우개 준비에 그릴 경로가 없습니다.");
  await page.mouse.move(4, 4);
  const before = await page.evaluate(observeStudioEraserLatencyFixture, { points });
  if (!before) throw new Error("지우개 준비의 빈 기준 화면을 읽지 못했습니다.");
  for (const route of routes) {
    const first = route[0];
    if (!first) throw new Error("지우개 준비의 시작점이 없습니다.");
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const point of route.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
  }
  await page.mouse.move(4, 4);
  const fixture = { points, baseline: before.pixels, strokeCount: routes.length };
  await assertStudioEraserLatencyFixture(page, fixture);
  return fixture;
}

export async function assertStudioEraserLatencyFixture(
  page: Page,
  fixture: StudioEraserLatencyFixture,
): Promise<Readonly<{ strokeCount: number; sampledPoints: number; minimumChangedPixels: number }>> {
  const handle = await page.waitForFunction(observeStudioEraserLatencyFixture, {
    points: fixture.points, baseline: fixture.baseline,
  });
  try {
    const observed = await handle.jsonValue();
    if (!observed) throw new Error("지우개가 지울 안료가 실제로 준비되지 않았습니다.");
    return {
      strokeCount: fixture.strokeCount,
      sampledPoints: observed.changedPixels.length,
      minimumChangedPixels: Math.min(...observed.changedPixels),
    };
  } finally { await handle.dispose(); }
}
