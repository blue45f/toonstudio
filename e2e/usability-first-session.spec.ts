import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { unzipSync } from "fflate";

const IDEA = "비 오는 날 작은 서점에서 학생이 길 잃은 고양이를 만난다.";
const ANSWERS = [
  "학생과 서점 주인, 길 잃은 고양이",
  "가을 저녁, 골목의 작은 서점",
  "책장 뒤에 고양이가 숨어 있는 것을 발견한다.",
  "낯설던 둘은 함께 고양이를 돌보며 안심한다.",
  "고양이에게 따뜻한 자리를 내어 주며 서점 문을 닫는다.",
];

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

// 인증·문서 저장소·서버 응답은 모의하지 않는다. 새 브라우저의 기기 저장 경로를 사용한다.
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(page.locator('[data-studio-beta-notice="true"]'), async (notice) => {
    await notice.locator('[data-studio-beta-notice-acknowledge="true"]').click();
    await expect(notice).toBeHidden();
  });
});

for (const width of [390, 1280]) {
  test(`처음 시작 화면의 주 행동과 접근성 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/create", { waitUntil: "domcontentloaded" });
    const starts = page.getByTestId("create-start-persona-guide");
    await expect(starts).toBeVisible();
    await expect(starts.getByRole("link")).toHaveCount(3);
    await expect(starts.getByRole("button", { name: /일단 펜으로 바로 그리고 싶어요/u })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "작품 시작하기", exact: true })).toBeVisible();
    await expect(page.getByTestId("site-creation-compass")).toHaveCount(0);
    await expect(page.locator('div[data-phase="show"], div[data-phase="fade"]').filter({ has: page.locator('img[src$="/images/hero-main-intro.webp"]') })).toHaveCount(0);
    await expect(page.locator('[data-public-wayfinder]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    const firstChoice = starts.getByRole("link", { name: /그림·스토리 모두 처음이에요/u });
    const bounds = await firstChoice.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.y).toBeLessThan(600);
    await capture(page, testInfo, `create-${width}`);
    const accessibility = await new AxeBuilder({ page })
      .include("#main-content")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await firstChoice.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/create\?intent=my-story$/u);
  });
}

for (const count of [4, 8]) {
  test(`홈 아이디어를 ${count}컷 대본으로 만들고 집중 편집으로 이어가기`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const ideaInput = page.getByRole("textbox", { name: "아이디어 입력", exact: true });
    await ideaInput.fill(IDEA);
    await ideaInput.press("Enter");
    await expect(page).toHaveURL(/\/create\?intent=my-story&topic=free-story&idea=/u);
    const answer = page.locator("main textarea");
    await expect(answer).toHaveValue(IDEA);
    await expect(answer).toBeFocused();
    await answer.press("ControlOrMeta+Enter");
    for (const answerText of ANSWERS) {
      await answer.fill(answerText);
      await answer.press("ControlOrMeta+Enter");
    }
    await expect(page.getByRole("heading", { name: "초안 미리보기", exact: true })).toBeVisible();
    await expect(page.locator('[data-beta-open-prompt]')).toHaveCount(0);
    await page.getByLabel("작품 제목", { exact: true }).fill(`사용성 검증 ${count}컷 이야기`);
    await page.getByText(`${count}컷`, { exact: true }).click();
    await expect(page.getByRole("radio", { name: `${count}컷`, exact: true })).toBeChecked();
    await expect(page.getByRole("list", { name: "컷 초안", exact: true }).locator(":scope > li")).toHaveCount(count);
    await capture(page, testInfo, `draft-${count}`);
    await page.getByRole("button", { name: "스튜디오에서 열기", exact: true }).click();
    await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/story\?/u);
    expect(new URL(page.url()).searchParams.get("uiMode")).toBe("simple");
    const continueDrawing = page.locator('[data-studio-project-header-continue="true"]');
    await expect(continueDrawing).toBeVisible();
    await expect(continueDrawing).toHaveAttribute("href", /uiMode=simple/u);
    const script = page.getByRole("textbox", { name: "대본", exact: true });
    await expect(script).toBeVisible();
    await expect(script).toHaveValue(new RegExp(IDEA.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    expect((await script.boundingBox())?.y).toBeLessThan(650);
    await expect(page.locator("[data-studio-current-panel-plan] summary")).toHaveText(`현재 컷 계획 ${count}컷 · 내용 확인과 수정`);
    await expect(page.getByRole("button", { name: "새 컷 계획으로 교체", exact: true })).toBeHidden();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, `story-${count}`);
    const revisedScript = `${await script.inputValue()}\n검증 메모: 고양이의 표정을 따뜻하게 그린다.`;
    await script.fill(revisedScript);
    await expect(page.getByText("이 기기에 대본 저장됨", { exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(script).toHaveValue(revisedScript);
    await expect(page.locator("[data-studio-current-panel-plan] summary")).toHaveText(`현재 컷 계획 ${count}컷 · 내용 확인과 수정`);
    if (count === 8) {
      await page.setViewportSize({ width: 390, height: 900 });
      await expectNoHorizontalOverflow(page);
      await capture(page, testInfo, "story-390");
      const a11y = await new AxeBuilder({ page }).include("#main-content").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(a11y.violations).toEqual([]);
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await continueDrawing.click();
    await expect(page.locator('[data-studio-editor="true"]')).toBeVisible({ timeout: 60_000 });
    expect(new URL(page.url()).searchParams.get("uiMode")).toBe("simple");
    await expect(page.locator('[data-studio-rail-tool-id="pen"]')).toBeVisible();
    await expect(page.locator("[data-studio-brush-active-pill]")).toBeVisible();
    await expect(page.locator('[data-studio-page-sequence-strip="true"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "가이드 숨기기", exact: true })).toHaveCount(0);
    await capture(page, testInfo, `editor-${count}`);
    await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
    const exports = page.locator('[data-studio-export-menu-panel="true"]');
    await exports.getByRole("button", { name: "PNG", exact: true }).click();
    await exports.getByRole("button", { name: "1×", exact: true }).click();
    await expect(exports.getByRole("heading", { name: `전체 ${count}페이지 PNG · ZIP`, exact: true })).toBeVisible();
    await downloadPagePackage(page, testInfo, `all-${count}`, Array.from({ length: count }, (_, index) => index));
    if (count === 8) {
      await exports.locator('[data-studio-export-section="range"] summary').click();
      await exports.getByRole("button", { name: "직접 지정", exact: true }).click();
      await exports.getByRole("textbox", { name: "내보내기 페이지 직접 지정", exact: true }).fill("8, 1, 3, 1");
      await expect(exports.getByRole("heading", { name: "선택 3페이지 PNG · ZIP", exact: true })).toBeVisible();
      await downloadPagePackage(page, testInfo, "selected-1-3-8", [0, 2, 7]);
    }
  });
}

async function downloadPagePackage(page: Page, testInfo: TestInfo, name: string, indices: readonly number[]) {
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  const size = await panel.getByText(/^\d+ × \d+ px$/u).textContent();
  const dimensions = size?.match(/^(\d+) × (\d+) px$/u);
  if (!dimensions) throw new Error("내보낼 페이지 크기가 표시되지 않았습니다.");
  const pending = page.waitForEvent("download");
  await panel.getByRole("button", { name: "페이지 ZIP 다운로드", exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.zip$/u);
  const path = testInfo.outputPath(name + ".zip");
  await download.saveAs(path);
  const entries = unzipSync(await readFile(path));
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("다운로드한 ZIP에 페이지 목록이 없습니다.");
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as {
    pageCount: number;
    pages: Array<{ sourceIndex: number; pageNumber: number; path: string; width: number; height: number; bytes: number; sha256: string }>;
  };
  expect(manifest.pageCount).toBe(indices.length);
  expect(manifest.pages.map((entry) => entry.sourceIndex)).toEqual(indices);
  expect(Object.keys(entries).filter((entry) => entry.endsWith(".png"))).toHaveLength(indices.length);
  for (const [index, entry] of manifest.pages.entries()) {
    const encoded = entries[entry.path];
    if (!encoded) throw new Error("페이지 목록에 있는 이미지가 ZIP에 없습니다.");
    const png = Buffer.from(encoded);
    expect(entry.pageNumber).toBe(index + 1);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([Number(dimensions[1]), Number(dimensions[2])]);
    expect([entry.width, entry.height]).toEqual([png.readUInt32BE(16), png.readUInt32BE(20)]);
    expect(entry.bytes).toBe(png.byteLength);
    expect(entry.sha256).toBe(createHash("sha256").update(png).digest("hex"));
  }
  await testInfo.attach(name, { path, contentType: "application/zip" });
}

async function downloadCurrentPng(page: Page, testInfo: TestInfo, name: string) {
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  await expect(panel.getByRole("heading", { name: "이미지로 저장", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "PNG", exact: true }).click();
  await panel.getByRole("button", { name: "1×", exact: true }).click();
  const size = await panel.getByText(/^\d+ × \d+ px$/u).textContent();
  const dimensions = size?.match(/^(\d+) × (\d+) px$/u);
  if (!dimensions) throw new Error("내보내기 창에 저장할 이미지 크기가 표시되지 않았습니다.");
  await capture(page, testInfo, name + "-menu");
  const pending = page.waitForEvent("download");
  await panel.getByRole("button", { name: "현재 페이지 PNG 다운로드", exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.png$/u);
  const path = testInfo.outputPath(name + ".png");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(Number(dimensions[1]));
  expect(bytes.readUInt32BE(20)).toBe(Number(dimensions[2]));
  expect(bytes.readUInt32BE(16) / bytes.readUInt32BE(20)).toBe(4 / 3);
  expect(bytes.length).toBeGreaterThan(1024);
  // PNG 인코딩 메타데이터가 달라져도 실제 그림의 픽셀 변화만 비교한다.
  const pixelDigest = await page.evaluate(async (encoded) => {
    const png = Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([png], { type: "image/png" }));
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("다운로드한 PNG의 픽셀을 읽을 수 없습니다.");
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      const digest = await crypto.subtle.digest("SHA-256", pixels.data);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } finally {
      bitmap.close();
    }
  }, bytes.toString("base64"));
  await testInfo.attach(name, { path, contentType: "image/png" });
  // 열린 내보내기 메뉴가 다음 Undo/Redo 키 입력을 가로채지 않도록 정상 버튼으로 닫는다.
  if (await panel.isVisible()) await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  await expect(panel).toBeHidden();
  return { bytes, pixelDigest };
}

test("새 캔버스의 잉크·Undo·Redo를 다운로드로 확인하고 다시 열어 같은 그림을 복원한다", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource") && !message.text().includes("404")) {
      consoleErrors.push(message.text());
    }
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /일단 펜으로 바로 그리고 싶어요/u }).click();
  await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/d\/[^?]+\?/u);
  expect(new URL(page.url()).searchParams.get("uiMode")).toBe("focus");
  const documentPath = new URL(page.url()).pathname;
  await expect(page.locator('[data-studio-editor="true"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-studio-brush-active-pill]")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-studio-cinematic-canvas-welcome="true"]')).toHaveCount(0);
  await expect(page.locator('[data-studio-page-sequence-strip="true"]')).toHaveCount(0);
  const surface = page.locator("[data-studio-skia-document-surface]");
  const canvas = page.locator(".konvajs-content");
  await expect(canvas).toBeVisible();
  const blankImage = await downloadCurrentPng(page, testInfo, "drawing-blank");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error("실제 캔버스 위치를 확인하지 못했습니다.");
  await page.mouse.move(bounds.x + bounds.width * 0.35, bounds.y + bounds.height * 0.42);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.52, { steps: 15 });
  await page.mouse.up();
  await expect(surface).toHaveAttribute("data-studio-skia-cached-items", "1", { timeout: 45_000 });
  await expect(surface).toHaveAttribute("data-studio-skia-phase", "presented");
  const firstImage = await downloadCurrentPng(page, testInfo, "drawing-original");
  expect(firstImage.pixelDigest).not.toBe(blankImage.pixelDigest);

  await page.keyboard.press("ControlOrMeta+z");
  const undoneImage = await downloadCurrentPng(page, testInfo, "drawing-undone");
  expect(undoneImage.pixelDigest).toBe(blankImage.pixelDigest);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(surface).toHaveAttribute("data-studio-skia-phase", "presented");
  const redoneImage = await downloadCurrentPng(page, testInfo, "drawing-redone");
  expect(redoneImage.pixelDigest).toBe(firstImage.pixelDigest);
  await expect(page.locator("[data-studio-save-status-bar]")).toContainText("이 기기에 저장됨");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === documentPath && url.searchParams.get("uiMode") === "focus");
  await expect(page.locator('[data-studio-editor="true"]')).toBeVisible({ timeout: 60_000 });
  await expect(surface).toHaveAttribute("data-studio-skia-cached-items", "1", { timeout: 45_000 });
  await expect(surface).toHaveAttribute("data-studio-skia-phase", "presented");
  const reopenedImage = await downloadCurrentPng(page, testInfo, "drawing-reopened");
  expect(reopenedImage.pixelDigest).toBe(firstImage.pixelDigest);
  expect(reopenedImage.bytes.equals(firstImage.bytes)).toBe(true);
  const exports = page.locator('[data-studio-export-menu-panel="true"]');
  await expect(exports).toBeHidden();
  await page.setViewportSize({ width: 390, height: 900 });
  await expectNoHorizontalOverflow(page);
  await expect(exports).toBeHidden();
  await capture(page, testInfo, "editor-390");
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  await expect(exports).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "export-390");
  expect(consoleErrors).toHaveLength(0);
});

test("밝은 테마와 고대비에서도 시작 행동과 글자를 구분할 수 있다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  for (const theme of [{ label: "페이퍼", mode: "light", name: "paper" }, { label: "고대비", mode: "dark", name: "contrast" }]) {
    await page.getByRole("button", { name: "디자인 테마", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    const radio = dialog.getByRole("radio", { name: theme.label, exact: true });
    await dialog.locator("label").filter({ has: page.getByRole("radio", { name: theme.label, exact: true }) }).click();
    await expect(radio).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.mode);
    await page.getByRole("heading", { name: "작품 시작하기", exact: true }).scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
    const result = await new AxeBuilder({ page }).include("#main-content").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
    await capture(page, testInfo, "create-" + theme.name);
  }
});
