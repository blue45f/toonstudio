import { expect, test } from "@playwright/test";

import { openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

test("390px 원고는 44px 도구와 안전 여백을 지키며 도크 위에 작업 면적을 확보한다", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/draft/mobile-workspace-size?uiMode=full", { waitUntil: "domcontentloaded" });
  const editor = page.locator('[data-studio-editor][data-studio-drawing-clarity-mobile="true"]');
  const header = editor.locator(".studio-drawing-clarity-mobile-header");
  const dock = editor.locator('[data-studio-mobile-editing-dock="true"]');
  await expect(header).toBeVisible({ timeout: 60_000 });
  await expect(dock).toBeVisible();
  const read = () => editor.evaluate(node => {
    const canvas = node.querySelector<HTMLElement>("[data-studio-canvas-viewport]")?.getBoundingClientRect();
    const toolbar = node.querySelector<HTMLElement>("[data-studio-mobile-editing-dock]")?.getBoundingClientRect();
    if (!canvas || !toolbar) throw new Error("원고와 모바일 도구가 필요합니다.");
    const controls = [...node.querySelectorAll<HTMLElement>(".studio-drawing-clarity-mobile-header button, .studio-drawing-clarity-mobile-context button, [data-studio-mobile-editing-dock] :is(button,summary)")]
      .map(button => button.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
    return {
      usable: canvas.width * (Math.min(canvas.bottom, toolbar.top) - canvas.top) / (innerWidth * innerHeight),
      buttonCount: controls.length,
      minimumWidth: Math.min(...controls.map(rect => rect.width)),
      minimumHeight: Math.min(...controls.map(rect => rect.height)),
      leftmost: Math.min(...controls.map(rect => rect.left)),
      rightmost: Math.max(...controls.map(rect => rect.right)),
      topmost: Math.min(...controls.map(rect => rect.top)),
      bottommost: Math.max(...controls.map(rect => rect.bottom)),
    };
  });
  const edit = editor.getByRole("button", { name: "편집", exact: true });
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await edit.click();
  for (const label of ["검색", "공유·초대", "되돌리기 · 실행취소"]) {
    await expect(editor.getByRole("button", { name: label, exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
  await edit.click();
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  for (const label of ["펜", "지우개"]) {
    await expect(editor.getByRole("button", { name: label, exact: true }).filter({ visible: true }).first()).toBeVisible();
  }
  const normal = await read();
  expect(normal.usable).toBeGreaterThanOrEqual(0.82);
  expect(normal.buttonCount).toBeGreaterThanOrEqual(10);
  expect(normal.minimumWidth).toBeGreaterThanOrEqual(44);
  expect(normal.minimumHeight).toBeGreaterThanOrEqual(44);
  expect(normal.leftmost).toBeGreaterThanOrEqual(0);
  expect(normal.rightmost).toBeLessThanOrEqual(390);
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 24, bottom: 34 } });
      await expect.poll(async () => (await read()).topmost).toBeGreaterThanOrEqual(24);
      await expect.poll(async () => (await read()).bottommost).toBeLessThanOrEqual(844 - 34);
    } finally {
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: {} });
      await cdp.detach();
    }
  }
});

test("휴대폰·태블릿의 브러시와 필터는 독립된 44px 조작 영역이며 확대와 안전 여백에도 서로 가리지 않는다", async ({ page, browserName }, info) => {
  test.setTimeout(160_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/draft/mobile-primary-actions", { waitUntil: "domcontentloaded" });
  const dock = page.locator('[data-studio-mobile-primary-layout="simple"] [data-studio-mobile-primary-actions]');
  const brush = dock.getByRole("button", { name: "브러시", exact: true });
  await expect(brush).toBeVisible({ timeout: 90_000 });
  const cdp = browserName === "chromium" ? await page.context().newCDPSession(page) : null;
  try {
    for (const [width, height, doubleText, bottom] of [
      [320, 640, false, 0], [390, 844, true, 34], [195, 422, false, 0],
      [768, 1024, false, 0], [844, 390, false, 21],
    ] as const) {
      await page.setViewportSize({ width, height });
      await cdp?.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: bottom ? 24 : 0, bottom } });
      await page.evaluate(double => { document.documentElement.style.fontSize = double ? "200%" : ""; }, doubleText);
      if (width === 320 && height === 640) {
        const edit = page.getByRole("button", { name: "편집", exact: true });
        await expect(edit).toHaveAttribute("aria-expanded", "false");
        const canvas = await page.locator("[data-studio-canvas-viewport]").first().boundingBox();
        const dockBounds = await dock.boundingBox();
        if (!canvas || !dockBounds) throw new Error("모바일 원고와 하단 도구가 필요합니다.");
        expect(canvas.width * (dockBounds.y - canvas.y) / (width * height)).toBeGreaterThanOrEqual(.82);
        await edit.click();
        await expect(page.getByRole("button", { name: "검색", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "되돌리기 · 실행취소", exact: true })).toBeVisible();
        await edit.click();
        await expect(page.locator("#studio-mobile-edit-options")).toBeHidden();
      }
      if (width === 195) {
        const header = page.locator("[data-studio-drawing-clarity-mobile-header]");
        const summary = header.locator("button[data-studio-drawing-save-summary]");
        const save = header.locator("[data-studio-clarity-save]");
        await expect(summary).toBeVisible();
        for (const target of [summary, save]) {
          expect(await target.evaluate(button => {
            const rect = button.getBoundingClientRect();
            return [0.1, 0.5, 0.9].every(x => [0.15, 0.5, 0.85].every(y =>
              button.contains(document.elementFromPoint(rect.x + x * rect.width, rect.y + y * rect.height)),
            ));
          })).toBe(true);
        }
      }
      await expect.poll(async () => dock.evaluate(node => {
        const controls = [...node.querySelectorAll<HTMLElement>("button,summary,select")]
          .map(element => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0);
        return controls.filter(({ element, rect }) => rect.width >= 44 && rect.height >= 44
          && rect.left >= 0 && rect.right <= innerWidth + 0.5 && rect.top >= 0 && rect.bottom <= innerHeight + 0.5
          && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))).length;
      })).toBe(7);
      if (cdp) {
        await expect.poll(async () => dock.evaluate(node => Math.max(...[...node.querySelectorAll("button,summary,select")].map(e => e.getBoundingClientRect().bottom))))
          .toBeLessThanOrEqual(height - bottom + 0.5);
      }
      await info.attach(`그리기 도구 ${width}x${height}${doubleText ? " 글꼴 200%" : ""}`, { body: await page.screenshot(), contentType: "image/png" });
    }
    await cdp?.send("Emulation.setSafeAreaInsetsOverride", { insets: {} });
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(dock).toBeHidden();
    await expect(page.locator('[data-studio-drawing-clarity-header]:visible')).toBeVisible();
    await info.attach("태블릿 가로 1024x768", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    await cdp?.detach();
  }
});

test.describe("작업공간 복원을 지연시킨 모바일 원고", () => {
  // SW 캐시가 응답하면 Playwright가 런타임 요청을 잡을 수 없어 의도한 지연을 재현하지 못한다.
  test.use({ serviceWorkers: "block" });

test("하단 브러시는 관리자를 열고 필터는 단일 효과 또는 스택을 원고에 적용한다", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  let resumeWorkspace!: () => void;
  const layoutGate = new Promise<void>(resolve => { resumeWorkspace = resolve; });
  let workspaceRequested = false;
  await page.route(/\/studio-workspace-sqlite-runtime[^/]*\.(?:js|ts)(?:\?|$)/u, async route => {
    workspaceRequested = true;
    await layoutGate;
    await route.continue();
  });
  await page.goto("/studio/draft/mobile-dock-brush-and-filter", { waitUntil: "domcontentloaded" });
  const dock = page.locator('[data-studio-mobile-primary-layout="simple"] [data-studio-mobile-primary-actions]');
  const brush = dock.getByRole("button", { name: "브러시", exact: true });
  const manager = page.getByRole("dialog", { name: "내 브러시 관리", exact: true });
  try {
    await expect(brush).toBeVisible({ timeout: 90_000 });
    await expect.poll(() => workspaceRequested).toBe(true);
    await brush.click();
    await expect(manager).toBeVisible();
  } finally {
    resumeWorkspace();
  }
  await expect(page.locator("[data-studio-editor]")).toHaveAttribute("data-studio-workspace-layout-source", /^(default|current)$/u, { timeout: 30_000 });
  await expect(manager).toBeVisible();
  await manager.getByRole("button", { name: "브러시 관리 닫기" }).click();
  await expect(brush).toBeFocused();
  const canvas = await page.locator("[data-studio-canvas-viewport]").first().boundingBox();
  if (!canvas) throw new Error("원고 캔버스가 표시되지 않았습니다.");
  await page.mouse.move(canvas.x + canvas.width * 0.45, canvas.y + canvas.height * 0.34);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.58, canvas.y + canvas.height * 0.48, { steps: 12 });
  await page.mouse.up();
  const filter = dock.getByRole("combobox", { name: "현재 페이지 합성본 필터 선택", exact: true });
  await expect(filter.getByRole("option")).toHaveCount(60);
  await filter.selectOption("filter-gallery");
  const gallery = page.getByRole("dialog", { name: "필터 갤러리", exact: true });
  await expect(gallery).toBeVisible({ timeout: 45_000 });
  await gallery.getByRole("button", { name: "취소", exact: true }).click();
  await expect(gallery).toBeHidden();
  await filter.selectOption("mosaic");
  const mosaic = page.getByRole("dialog", { name: "모자이크 / 픽셀화", exact: true });
  await expect(mosaic).toBeVisible({ timeout: 45_000 });
  await mosaic.getByRole("button", { name: "적용", exact: true }).click();
  await expect(mosaic).toBeHidden({ timeout: 45_000 });
  await expect(page.getByRole("status").filter({ hasText: "원본을 보존한 페이지 필터 레이어를 추가했어요" }).first()).toBeVisible();
});
});

test("휴대폰 가로에서 창 메뉴의 캔버스만 보기를 열어 그리고 복원 버튼으로 같은 원고에 돌아온다", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/studio/draft/mobile-canvas-only", { waitUntil: "domcontentloaded" });
  const editor = page.locator("[data-studio-editor]");
  const dock = editor.locator("[data-studio-mobile-editing-dock]");
  await expect(dock).toBeVisible({ timeout: 100_000 });
  const pen = dock.getByRole("button", { name: "펜", exact: true });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  const url = page.url();

  const windowMenu = await openStudioMainMenu(page, "window");
  await windowMenu.locator('[data-studio-menu-item-id="canvas-only"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-studio-canvas-only", "true");
  await expect(dock).toBeHidden();
  const restore = page.getByRole("button", { name: /도구막대 복원/u });
  await expect(restore).toBeVisible();
  const hit = await restore.boundingBox();
  expect(hit?.height).toBeGreaterThanOrEqual(44);
  expect(hit?.width).toBeGreaterThanOrEqual(44);
  const viewport = editor.locator("[data-studio-canvas-viewport]");
  await expect(viewport).toHaveAttribute("data-studio-canvas-input-state", "ready");
  const stage = viewport.locator(".konvajs-content");
  const canvas = await viewport.boundingBox();
  const paper = await stage.boundingBox();
  if (!canvas || !paper) throw Error("캔버스만 보기에서 원고를 찾을 수 없습니다.");
  const x = Math.floor(canvas.x + canvas.width * .48);
  const y = Math.floor(canvas.y + canvas.height * .47);
  expect(await stage.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), { x, y })).toBe(true);
  // 도구막대나 편집 기록을 열어도 같은 원고의 같은 부분만 비교한다. 커서는 검사 영역 밖으로 옮긴다.
  const offset = { x: x + 8 - paper.x, y: y - paper.y };
  const strokePixels = async () => {
    const box = await stage.boundingBox();
    if (!box) throw Error("획을 확인할 원고가 닫혔습니다.");
    return page.screenshot({ clip: { x: Math.round(box.x + offset.x), y: Math.round(box.y + offset.y), width: 24, height: 18 } });
  };
  await page.mouse.move(x - 50, y - 30);
  const blank = await strokePixels();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 20, { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(x - 50, y - 30);
  await expect.poll(async () => (await strokePixels()).equals(blank)).toBe(false);

  await restore.click();
  await expect(page.locator("html")).not.toHaveAttribute("data-studio-canvas-only", "true");
  await expect(editor.locator("[data-studio-drawing-clarity-header]")).toBeVisible();
  await expect(dock).toBeVisible();
  const undo = editor.getByRole("button", { name: "되돌리기 · 실행취소", exact: true });
  if (!await undo.isVisible()) await editor.getByRole("button", { name: "편집", exact: true }).click();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(async () => (await strokePixels()).equals(blank)).toBe(true);
  const redo = editor.getByRole("button", { name: "다시 · 다시실행", exact: true });
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(async () => (await strokePixels()).equals(blank)).toBe(false);
  expect(page.url()).toBe(url);
});
