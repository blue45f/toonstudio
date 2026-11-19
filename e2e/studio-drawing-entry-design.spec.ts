import { expect, test, type Page } from "@playwright/test";

import { parseStudioDocumentLocation } from "../apps/web/src/domains/creator/studio-document-workspace";
import { studioExactResumeStorageKey } from "../apps/web/src/domains/creator/studio-exact-resume-context";
import { openStudioLayerNavigator, openStudioMainMenu, showStudioProjectWindowTools } from "../scripts/lib/studio-shell-interactions";

async function expectManuscriptChrome(page: Page) {
  const editor = page.locator('[data-studio-editor="true"]');
  const header = editor.locator('[data-studio-drawing-clarity-header="true"]').filter({ visible: true });
  await expect(header).toHaveCount(1, { timeout: 60_000 });
  await expect(editor).toHaveAttribute("data-studio-drawing-presentation", "integrated");
  await expect(editor.locator('[data-studio-drawing-app-bar="true"], [data-work-mode-bar]')).toHaveCount(0);
  await expect(editor.locator('[data-studio-brush-workbench-dock="true"]').filter({ visible: true })).toHaveCount(0);
  await expect(editor.locator("[data-studio-canvas-viewport]").first()).toBeVisible();
}

function drawingTool(page: Page, id: "pen" | "eraser") {
  const mobile = page.locator('[data-studio-mobile-editing-dock="true"]').getByRole("button", { name: id === "pen" ? "펜" : "지우개", exact: true });
  return page.locator(`[data-studio-rail-tool-id="${id}"]`).or(mobile).filter({ visible: true }).first();
}

test("설치 안내와 설치 앱 바로가기가 웹과 같은 작품 보관함을 연다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/draw-app/install.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "툰스튜디오 드로잉 설치" })).toBeVisible();
  await page.getByRole("link", { name: "브라우저에서 작품 보관함 열기" }).click();
  const library = page.locator('[data-workspace-surface="works"]').getByRole("region", { name: "작품 관리" });
  await expect(library).toBeVisible();
  await page.goto("/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa");
  await expect(library).toBeVisible();
  await expect(page.locator("[data-studio-drawing-home-chrome]")).toHaveCount(0);
});

for (const size of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`드로잉 진입 경로가 달라도 같은 원고 도구와 캔버스 배치를 사용한다 (${size.width}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    const manuscript = "/studio/draft/drawing-entry-design";
    const editor = page.locator("[data-studio-editor=true]");
    const canvas = editor.locator("[data-studio-canvas-viewport]").first();
    const eraser = drawingTool(page, "eraser");
    let initialCanvas: Awaited<ReturnType<typeof canvas.boundingBox>> = null;

    async function verifyEditor() {
      await expectManuscriptChrome(page);
      if (await eraser.getAttribute("aria-pressed") !== "true") await eraser.click();
      await drawingTool(page, "pen").click();
      await expect(drawingTool(page, "pen")).toHaveAttribute("aria-pressed", "true");
      await eraser.click();
      await expect(eraser).toHaveAttribute("aria-pressed", "true");
      const bounds = await canvas.boundingBox();
      expect(bounds).not.toBeNull();
      if (initialCanvas) expect(bounds).toEqual(initialCanvas);
      else initialCanvas = bounds;
    }

    for (const query of ["", "?drawingShell=integrated", "?drawingShell=app&uiMode=focus&startTool=draw"]) {
      await page.goto(manuscript + query, { waitUntil: "domcontentloaded" });
      await verifyEditor();
    }
    await page.goto("/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-workspace-surface="works"]').getByRole("region", { name: "작품 관리" })).toBeVisible();
    await expect(page.locator("[data-studio-drawing-home-chrome]")).toHaveCount(0);
    await page.goto(manuscript, { waitUntil: "domcontentloaded" });
    await verifyEditor();

    if (size.width === 1440) {
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("원고 캔버스를 찾지 못했습니다.");
      await canvas.click({ button: "right", position: { x: Math.floor(bounds.width) - 10, y: Math.floor(bounds.height) - 10 } });
      const menu = page.getByRole("menu", { name: "캔버스 작업" });
      await expect(menu).toBeVisible();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(size.width);
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(size.height);
      const last = menu.getByRole("menuitem", { name: "스마트 도형 켜기" });
      const hitPoints = await last.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        return [rect.left + rect.width / 2, rect.right - 4].map(x => button.contains(document.elementFromPoint(x, y)));
      });
      expect(hitPoints).toEqual([true, true]);
      await last.click();
      await expect(menu).toHaveCount(0);
      await canvas.click({ button: "right", position: { x: Math.floor(bounds.width) - 10, y: Math.floor(bounds.height) - 10 } });
      await menu.getByRole("menuitem", { name: "펜으로 그리기" }).click();
      await expect(menu).toHaveCount(0);
      await expect(eraser).toHaveAttribute("aria-pressed", "false");
      await canvas.focus();
      await page.keyboard.press("Shift+F10");
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(canvas).toBeFocused();
    }

    await showStudioProjectWindowTools(page);
    const projectTools = page.locator('[data-studio-drawing-project-tools="true"]');
    await expect(projectTools.getByRole("combobox", { name: "작업 단계" })).toBeVisible();
    await expectManuscriptChrome(page);
    await projectTools.getByRole("button", { name: "프로젝트 도구 닫기" }).click();
    await expect(projectTools).toBeHidden();
    await page.goto(manuscript + "?drawingShell=app&uiMode=focus&startTool=draw", { waitUntil: "domcontentloaded" });
    await expectManuscriptChrome(page);
  });
}

test("선화·검수 역할과 오래된 역할 링크가 같은 원고 셸을 유지한다", async ({ page }) => {
  const manuscript = "/studio/draft/drawing-role-entry";
  await page.goto(manuscript, { waitUntil: "domcontentloaded" });
  await expectManuscriptChrome(page);
  const canvas = page.locator("[data-studio-canvas-viewport]").first();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  for (const role of ["lineart", "retired-workspace", "review"]) {
    await page.goto(manuscript + "?roleWorkspace=" + role, { waitUntil: "domcontentloaded" });
    await expectManuscriptChrome(page);
    await drawingTool(page, "pen").click();
    await expect(drawingTool(page, "pen")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => canvas.boundingBox()).toEqual(bounds);
  }
  await page.goBack();
  await expect(page).toHaveURL(/roleWorkspace=retired-workspace/);
  await expectManuscriptChrome(page);
});

test("이전 개인 배치와 상세 모드에서 원고 단계를 바꿔도 같은 헤더와 사용자 설정을 유지한다", async ({ page }) => {
  test.setTimeout(120_000);
  const oldChoice = { "guest:lineart": false, "guest:review": false, "guest:pro-comic": false };
  const choiceKey = "toonstudio:studio-drawing-clarity-choice:v1";
  // 구버전 사용자가 명시적으로 저장한 값을 최초 입장 전에 한 번만 제공한다.
  await page.addInitScript(({ key, saved }) => {
    if (sessionStorage.getItem("qa-private-layout-loaded")) return;
    localStorage.setItem(key, JSON.stringify(saved));
    sessionStorage.setItem("qa-private-layout-loaded", "true");
  }, { key: choiceKey, saved: oldChoice });
  const manuscript = "/studio/draft/drawing-private-layout";
  await page.goto(manuscript + "?roleWorkspace=lineart&uiMode=full", { waitUntil: "domcontentloaded" });
  await expectManuscriptChrome(page);
  const editor = page.locator('[data-studio-editor="true"]');
  await expect(editor).toHaveAttribute("data-studio-ui-density", "full");
  const panel = page.locator('[data-studio-drawing-project-tools="true"]');
  await showStudioProjectWindowTools(page);
  const stage = panel.getByRole("combobox", { name: "작업 단계" });
  for (const mode of ["storyboard", "draw", "color", "post", "lettering", "finish"]) {
    await stage.selectOption(mode);
    await expect(editor).toHaveAttribute("data-studio-work-mode", mode);
    await expect(stage).toHaveValue(mode);
    await expectManuscriptChrome(page);
  }
  const menu = await openStudioMainMenu(page, "view");
  await expect(menu.getByRole("menuitem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "프로젝트 도구 닫기" }).click();
  await expect(panel).toBeHidden();
  await openStudioLayerNavigator(page);
  await expectManuscriptChrome(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectManuscriptChrome(page);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), choiceKey)).toEqual(oldChoice);
});

test("같은 원고에서 간단한 그리기와 퀵·일반 모드를 전환하고 방문 기록의 도구를 복원한다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "캔버스 열기", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/d\/[^?]+\?.*\broom=/, { timeout: 60_000 });
  const ownerUrl = new URL(page.url());
  const manuscript = ownerUrl.pathname;
  const ownerRoom = ownerUrl.searchParams.get("room");
  const editor = page.locator("[data-studio-editor=true]");
  const railTool = (tool: string) => editor.locator(`[data-studio-rail-tool-id="${tool}"]`).filter({ visible: true }).first();

  async function expectMode(density: string, tool: string, room = ownerRoom) {
    await expectManuscriptChrome(page);
    await expect(editor).toHaveAttribute("data-studio-ui-density", density, { timeout: 60_000 });
    await expect(railTool(tool)).toHaveAttribute("aria-pressed", "true");
    const url = new URL(page.url());
    expect(url.pathname).toBe(manuscript);
    expect(url.searchParams.get("room")).toBe(room);
    expect(url.hash).toBe("#canvas");
  }

  const route = parseStudioDocumentLocation(ownerUrl);
  if (route.kind !== "document" || !route.projectId || !route.documentId) throw new Error("생성한 원고의 주소를 확인할 수 없습니다.");
  const resumeKey = studioExactResumeStorageKey(route.projectId, route.documentId);
  await expectManuscriptChrome(page);
  await railTool("eraser").click();
  await expect(railTool("eraser")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.drawMode, resumeKey)).toBe("eraser");

  ownerUrl.searchParams.set("uiMode", "full");
  ownerUrl.searchParams.set("startTool", "select");
  ownerUrl.hash = "canvas";
  await page.goto(ownerUrl.href, { waitUntil: "domcontentloaded" });
  await expectMode("full", "eraser");
  const firstEditor = await editor.elementHandle();

  await page.getByRole("button", { name: "퀵모드", exact: true }).filter({ visible: true }).first().click();
  await expectMode("focus", "pen");
  await page.getByRole("button", { name: "일반 모드", exact: true }).filter({ visible: true }).first().click();
  await expectMode("simple", "select");
  expect(new URL(page.url()).searchParams.get("uiMode")).toBe("basic");
  await page.goBack();
  await expectMode("focus", "pen");
  await page.goForward();
  await expectMode("simple", "select");

  await railTool("eraser").click();
  await expectMode("simple", "eraser");
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("room", "qa-room-change");
    history.pushState(history.state, "", url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  });
  await expectMode("simple", "eraser", "qa-room-change");
  await page.goBack();
  await expectMode("simple", "eraser");
  expect(await firstEditor?.evaluate((node) => node === document.querySelector("[data-studio-editor=true]"))).toBe(true);
});

test("데스크톱 원고의 첫 도구 검색에서 찾은 채우기 속성을 실행한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/canvas?uiMode=basic", { waitUntil: "domcontentloaded" });
  await expectManuscriptChrome(page);
  await page.getByLabel("더보기 · 작업 설정과 도움말", { exact: true }).click();
  const menu = page.getByRole("dialog", { name: "원고 도구" });
  await menu.getByRole("button", { name: /그리기 도구/ }).click();
  await menu.getByRole("button", { name: "도구·기능 검색" }).click();
  const search = page.getByRole("dialog").filter({ has: page.getByRole("combobox") });
  const query = search.getByRole("combobox");
  await expect(query).toBeVisible();
  await query.fill("틈 닫기");
  await search.getByRole("option", { name: /참조 레이어 · 틈 닫기 채우기/ }).click();
  await expect(search).toBeHidden();
  await expect(page.locator("#studio-drawing-clarity-panel-layers")).toBeVisible();
});

test("원고 파일·편집 메뉴에서 실행한 작업과 레이어·출고 패널의 복귀 지점을 보존한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/drawing-file-edit-actions", { waitUntil: "domcontentloaded" });
  const quick = page.getByRole("navigation", { name: "원고 빠른 메뉴" });
  const file = quick.getByRole("menuitem", { name: "파일", exact: true });
  const edit = quick.getByRole("menuitem", { name: "편집", exact: true });
  await expect(file).toBeVisible({ timeout: 60_000 });
  await file.focus();
  await file.press("ArrowRight");
  await expect(edit).toBeFocused();
  await edit.press("ArrowDown");
  const editMenu = page.getByRole("menu", { name: "편집" });
  await expect(editMenu.locator('[data-studio-menu-item-id="undo"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(edit).toBeFocused();
  await file.click();
  const fileMenu = page.getByRole("menu", { name: "파일" });
  await expect(fileMenu.locator('[data-studio-menu-item-id="save-draft"]')).toBeVisible();
  await fileMenu.locator('[data-studio-menu-item-id="export"]').click();
  const output = page.locator("[data-studio-export-menu-panel]");
  await expect(output.getByRole("button", { name: "현재 페이지 PNG 다운로드" })).toBeVisible();
  await output.getByRole("button", { name: "출력 설정 닫기" }).click();
  await expect(file).toBeFocused();

  const directExport = quick.locator("..").getByRole("button", { name: "출고", exact: true });
  await directExport.click();
  await expect(output).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(directExport).toBeFocused();

  await drawingTool(page, "pen").click();
  const canvas = page.locator("[data-studio-canvas-viewport]").first();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("원고 캔버스가 표시되지 않았습니다.");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 32, rect.y + rect.height / 2 + 12, { steps: 8 });
  await page.mouse.up();
  const layers = quick.getByRole("button", { name: "레이어", exact: true });
  await layers.click();
  const panel = page.locator("#studio-drawing-clarity-panel-layers");
  await expect(panel.getByRole("treeitem").first()).toBeVisible();
  await panel.getByRole("button", { name: "레이어·속성 · 닫기" }).click();
  await expect(panel).toBeHidden();
  await expect(layers).toBeFocused();
});
