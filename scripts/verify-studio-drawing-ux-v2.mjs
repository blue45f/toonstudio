import { createStudioDrawingIsolatedOrigin } from "./lib/studio-drawing-isolated-origin.mjs";
import { auditDrawingControls, measureDrawingColorInteraction } from "./lib/studio-drawing-acceptance-checks.mjs";
import { verifyRestrictedDrawingContext } from "./lib/studio-restricted-drawing-context.mjs";
import { openStudioDrawingContext } from "./lib/studio-drawing-browser-context.mjs";
import { expectedDrawingPersistence, hasOpfsEntryPoint } from "./lib/studio-drawing-storage-capability.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit, expect } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:5219";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) throw new Error("Use an isolated loopback fixture, never a production account.");
const engines = (process.argv[3] ?? "chromium").split(",");
const output = path.resolve("artifacts/drawing-ux-v2");
await fs.mkdir(output, { recursive: true });
const report = { checks: [], errors: [], engines: [], storageModes: [], accessibility: [], performance: [], consoleErrors: [] };
const isolated = await createStudioDrawingIsolatedOrigin(origin);
const url = new URL("/tools/browser-harnesses/drawing-ux-v2.html", isolated.origin).href;
report.origin = isolated.origin;
const options = { timeout: 45000 };
// 콜드 Vite dev 서버는 하니스의 모듈 그래프를 처음 변환·최적화하느라 기본 탐색 한도(30초, load 대기)를 넘긴다
// (CI 에서 같은 픽스처의 첫 탐색이 36초 걸린 것이 관측됐다). 같은 서버를 쓰는 verify-studio-discovery-ux 와
// 같은 예산(탐색·첫 컴포넌트 준비 120초, domcontentloaded)을 하니스 진입에 주고, 이후 상태 전이는 45초 expect 로 판정한다.
const coldStart = { timeout: 120_000 };
const navigation = { waitUntil: "domcontentloaded", ...coldStart };
const pinIds = async (page) => JSON.parse(await page.getByTestId("pins").textContent());
// persistence 는 엔진의 저장 능력이 정한다(expectedDrawingPersistence). 기본은 실제 "saved" 이고, OPFS 진입점이 없는 빌드만
// 제품이 문서화한 "session-only" 를 정확히 기대한다(둘 다 다른 값으로 바뀌면 실패한다).
async function ready(page, persistence = "saved") {
  await page.goto(url, navigation);
  await expect(page.getByTestId("drawing-fixture")).toHaveAttribute("data-persistence", persistence, coldStart);
  await expect(page.getByTestId("drawing-fixture")).toHaveAttribute("data-history-persistence", persistence, options);
}
async function saved(page) { await expect(page.getByTestId("drawing-fixture")).toHaveAttribute("data-persistence", "saved", options); }
async function apply(page) { await page.getByRole("button", { name: "색상 적용", exact: true }).click(); }
// 보기 방식·일괄 편집은 점진 공개(<details>)라 구성 창을 열 때마다 접힌 채 시작한다. 사용 전에 사용자처럼 펼친다.
async function openBulkEdit(page) { await page.getByText("보기 방식·일괄 편집", { exact: true }).click(); }
async function openColor(page, target = "주 색") {
  const mobileColor = page.locator('[data-studio-mobile-primary-actions="true"]').getByRole("button", { name: "브러시 색상", exact: true });
  if (await mobileColor.isVisible() && await mobileColor.getAttribute("aria-expanded") !== "true") await mobileColor.click();
  await page.getByRole("button", { name: target, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `${target} 선택`, exact: true });
  // 휴대폰 폭의 첫 색상 시트는 지연 청크라 콜드 dev 서버에서 처음 열릴 때 변환 시간(실측 2.5초, 부하 시 5초 초과)이 든다.
  await expect(dialog).toBeVisible(options);
  return dialog;
}
async function desktop(page, engine) {
  await ready(page);
  await page.getByRole("button", { name: "설정 열기", exact: true }).click();
  await openBulkEdit(page);
  await page.getByRole("button", { name: "모든 도구 고정", exact: true }).click();
  const pinned = page.getByRole("region", { name: "도구막대에 표시", exact: true });
  const boxes = pinned.getByRole("checkbox");
  for (let index = 27; index < 35; index += 1) await boxes.nth(index).check();
  await page.getByRole("button", { name: "선택 제거", exact: true }).click();
  await page.getByRole("combobox", { name: "도구막대 보기 방식", exact: true }).selectOption("double");
  await pinned.getByRole("button", { name: / 맨 위로$/u }).nth(26).click();
  await page.getByRole("button", { name: "구성 적용", exact: true }).click();
  await saved(page);
  const custom = await pinIds(page);
  assert.equal(custom.length, 27);
  await expect(page.locator('[data-studio-tool-rail-view="double"]')).toBeVisible();
  assert.deepEqual(await page.locator('[data-studio-rail-tool-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.studioRailToolId)), custom);
  await page.reload(); await saved(page);
  assert.deepEqual(await pinIds(page), custom);
  await page.getByRole("combobox", { name: "화면 밀도", exact: true }).selectOption("focus"); await saved(page);
  assert.deepEqual(await pinIds(page), custom);
  await expect(page.locator('[data-studio-rail-tool-id]')).toHaveCount(27);
  const tabStops = await page.locator('[data-studio-tool-rail] button:not([disabled])').evaluateAll((buttons) => buttons.filter((button) => button.tabIndex === 0).length);
  assert.equal(tabStops, 1);
  await page.screenshot({ path: path.join(output, `${engine}-toolbar-27.png`) });
  await page.getByRole("button", { name: "전체 도구", exact: true }).click();
  const catalog = page.getByRole("dialog", { name: "전체 도구", exact: true });
  await catalog.getByRole("searchbox").fill("스포이드");
  const beforeTool = await page.getByTestId("tool").textContent();
  await catalog.getByRole("button", { name: "색 가져오기 사용", exact: true }).click();
  await expect(page.getByTestId("tool")).toHaveText("eyedropper");
  assert.deepEqual(await pinIds(page), custom);
  assert.notEqual(beforeTool, "eyedropper");
  await page.getByRole("button", { name: "전체 도구", exact: true }).click();
  await catalog.getByRole("searchbox").fill("회전");
  await catalog.getByRole("button", { name: / 고정$/u }).first().click();
  await expect(page.getByTestId("tool")).toHaveText("eyedropper");
  await catalog.getByRole("button", { name: "모든 도구 고정", exact: true }).click();
  await saved(page);
  const all = await pinIds(page);
  assert.equal(all.length, 35); assert.deepEqual(all.slice(0, 27), custom);
  await catalog.getByRole("button", { name: "전체 도구 닫기", exact: true }).click();
  report.checks.push(`${engine}: exact 27 pins, SQLite reload, focus density, keyboard entry, use/pin separation, ordered 35-tool extension`);

  await page.getByRole("button", { name: "설정 열기", exact: true }).click();
  await openBulkEdit(page);
  await page.getByText("작업별 구성 · 내 구성 저장", { exact: true }).click();
  await page.getByRole("textbox", { name: "새 도구 구성 이름" }).fill("회귀 선화");
  await page.getByRole("button", { name: "구성 저장", exact: true }).click();
  await page.getByRole("textbox", { name: "새 도구 구성 이름" }).fill(" 회귀 선화 ");
  await expect(page.getByRole("button", { name: "구성 저장", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "새 도구 구성 이름" }).fill("");
  await page.getByRole("button", { name: "회귀 선화 구성 이름 변경" }).click();
  const profileName = page.getByRole("textbox", { name: "회귀 선화 구성 새 이름" });
  await profileName.fill("키보드 작업"); await profileName.press("Enter");
  await page.getByRole("combobox", { name: "도구막대 보기 방식", exact: true }).selectOption("list");
  await expect(page.getByRole("button", { name: "키보드 작업", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "키보드 작업 구성을 현재 배치로 업데이트" }).click();
  await page.getByRole("button", { name: "업데이트 취소", exact: true }).click();
  await page.getByRole("button", { name: "키보드 작업 구성을 현재 배치로 업데이트" }).click();
  await page.getByRole("button", { name: "키보드 작업 구성 업데이트 확인" }).click();

  await page.getByRole("button", { name: "구성 적용", exact: true }).click();
  await saved(page); await page.reload(); await saved(page);
  await page.getByRole("button", { name: "설정 열기", exact: true }).click();
  await openBulkEdit(page);
  await page.getByText("작업별 구성 · 내 구성 저장", { exact: true }).click();
  await expect(page.getByRole("button", { name: "키보드 작업", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "키보드 작업", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("combobox", { name: "도구막대 보기 방식" })).toHaveValue("list");
  await page.getByRole("button", { name: "키보드 작업 구성 삭제" }).click();
  await page.getByRole("button", { name: "삭제 취소", exact: true }).click();
  await expect(page.getByRole("button", { name: "키보드 작업", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "키보드 작업 구성 삭제" }).click();
  await page.getByRole("button", { name: "키보드 작업 구성 삭제 확인" }).click();
  await page.getByRole("button", { name: "구성 적용", exact: true }).click();
  await saved(page); await page.reload(); await saved(page);
  assert.deepEqual(await pinIds(page), all);
  report.checks.push(`${engine}: profile duplicate guard, confirmed layout update/rename persists, confirmed deletion preserves order`);

  let dialog = await openColor(page);
  const hex = dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true });
  await hex.fill(""); await hex.pressSequentially("#123456");
  await expect(hex).toHaveValue("#123456");
  await expect(page.getByTestId("primary")).toHaveText("#397be5");
  await expect(page.getByTestId("recent")).toHaveText("[]");
  await dialog.getByRole("button", { name: "색상 선택 취소", exact: true }).click();
  await expect(page.getByTestId("primary")).toHaveText("#397be5");
  dialog = await openColor(page);
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#12gg");
  await expect(dialog.getByRole("button", { name: "색상 코드 복사" })).toBeDisabled();
  await page.mouse.click(800, 370);
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true })).toHaveValue("#12gg");
  await expect(page.getByTestId("strokes")).toHaveText("0");
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#123456");
  await apply(page);
  await expect(page.getByTestId("primary")).toHaveText("#123456");
  await expect(page.getByTestId("drawing-fixture")).toHaveAttribute("data-history-persistence", "saved", options);
  assert.deepEqual(JSON.parse(await page.getByTestId("recent").textContent()), ["#123456"]);
  dialog = await openColor(page, "보조 색");
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#abcdef");
  await apply(page);
  await expect(page.getByTestId("secondary")).toHaveText("#abcdef");
  await expect(page.getByTestId("primary")).toHaveText("#123456");
  await expect(page.getByTestId("undo")).toHaveText("0");
  await expect(page.getByTestId("drawing-fixture")).toHaveAttribute("data-history-persistence", "saved", options);
  await page.reload(); await saved(page);
  await expect(page.getByTestId("recent")).toContainText("#123456", options);
  await expect(page.getByTestId("recent")).toContainText("#abcdef", options);
  report.checks.push(`${engine}: local HEX draft, invalid-outside guard, cancel, per-target commit, real SQLite recent-color replay`);

  dialog = await openColor(page);
  const swatches = dialog.getByRole("group", { name: "최근 선택 색 목록", exact: true }).getByRole("button");
  assert.equal(await swatches.evaluateAll((buttons) => buttons.filter((button) => button.tabIndex === 0).length), 1);
  const originalPrimary = await page.getByTestId("primary").textContent();
  await swatches.first().focus(); await swatches.first().press("ArrowRight");
  await expect(swatches.nth(1)).toBeFocused();
  await expect(page.getByTestId("primary")).toHaveText(originalPrimary);
  await swatches.nth(1).press("Enter");
  await expect(dialog.getByRole("textbox", { name: "헥스 색상 코드" })).toHaveValue("#123456");
  await dialog.getByRole("button", { name: "색상 선택 취소", exact: true }).click();
  await expect(page.getByTestId("primary")).toHaveText(originalPrimary);
  report.checks.push(`${engine}: swatches use one Tab entry, arrows move focus, Enter previews and cancel preserves document`);

  dialog = await openColor(page, "원고 도형 색");
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#cc2244");
  await page.getByRole("button", { name: "문서 전환", exact: true }).evaluate((button) => button.click());
  await expect(dialog).toHaveCount(0); await expect(page.getByTestId("undo")).toHaveText("0");
  dialog = await openColor(page, "원고 도형 색");
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#44aa88");
  await apply(page); await expect(page.getByTestId("undo")).toHaveText("1");
  dialog = await openColor(page);
  await dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true }).fill("#224466");
  const canvas = await page.getByTestId("canvas").boundingBox(); assert(canvas);
  await page.mouse.click(canvas.x + canvas.width - 8, canvas.y + canvas.height - 8);
  await expect(dialog).toHaveCount(0); await expect(page.getByTestId("strokes")).toHaveText("0");
  report.checks.push(`${engine}: document target invalidation, one object Undo, outside click never reaches canvas`);

  dialog = await openColor(page);
  await dialog.getByRole("button", { name: "색상 패널 고정", exact: true }).click();
  await saved(page);
  const dock = page.getByRole("region", { name: "고정 색상 작업실", exact: true });
  await expect(dock).toBeVisible();
  await page.getByRole("button", { name: "보조 색", exact: true }).click();
  await expect(page.locator('[data-studio-color-popover]')).toHaveCount(0);
  await expect(dock.getByRole("combobox", { name: "고정 색상 편집 대상", exact: true })).toHaveValue("secondary");
  const dockHex = dock.getByRole("textbox", { name: "헥스 색상 코드", exact: true });
  await dockHex.fill("#335577"); await dockHex.press("Enter");
  await expect(page.getByTestId("secondary")).toHaveText("#335577");
  await page.screenshot({ path: path.join(output, `${engine}-pinned-color.png`) });
  await dock.getByRole("button", { name: "색상 패널 고정 해제", exact: true }).click();
  await saved(page);
  report.checks.push(`${engine}: one pinned editor, secondary targeting, gesture commit, layers remain available`);
  const beforePrecision = await page.getByTestId("primary").textContent();
  dialog = await openColor(page);
  await dialog.getByRole("textbox", { name: "헥스 색상 코드" }).fill("#ff0000");
  await dialog.getByText("정밀 수치 · RGB / HSV / HSL", { exact: true }).click();
  const red = dialog.getByRole("spinbutton", { name: "빨강 수치 입력", exact: true });
  await red.fill(""); await expect(red).toHaveValue("");
  await expect(dialog.getByRole("textbox", { name: "헥스 색상 코드" })).toHaveValue("#ff0000");
  await red.pressSequentially("128"); await red.press("Enter");
  await expect(red).toBeFocused(); await expect(page.getByTestId("primary")).toHaveText(beforePrecision);
  await dialog.getByRole("tab", { name: "HSV / HSB 슬라이더" }).click();
  await dialog.getByRole("spinbutton", { name: "HSV 명도 V 수치 입력" }).fill("0");
  await dialog.getByRole("spinbutton", { name: "HSV 색상 H 수치 입력" }).fill("240");
  await dialog.getByRole("spinbutton", { name: "HSV 명도 V 수치 입력" }).fill("100");
  await expect(dialog.getByRole("textbox", { name: "헥스 색상 코드" })).toHaveValue("#0000ff");
  await dialog.getByRole("tab", { name: "CIELAB 슬라이더" }).click();
  const lab = dialog.getByRole("spinbutton", { name: "CIELAB 적녹 a* 수치 입력" });
  await lab.fill("-10.5"); await expect(lab).toHaveValue("-10.5");
  await page.screenshot({ path: path.join(output, `${engine}-precision-numbers.png`) });
  await dialog.getByRole("button", { name: "색상 선택 취소", exact: true }).click();
  await expect(page.getByTestId("primary")).toHaveText(beforePrecision);
  report.checks.push(`${engine}: RGB blank/retype, local numeric Enter, HSV hue retained through black, signed CIELAB and cancellation`);

}

async function handheld(browser, engine, size, persistence = "saved") {
  const session = await openStudioDrawingContext({ chromium, firefox, webkit }[engine], browser, engine,
    { viewport: size, hasTouch: true, ...(engine !== "firefox" ? { isMobile: true } : {}) });
  const context = session.context;
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(`${engine} mobile: ${error.message}`));
  try {
    await ready(page, persistence);
    const controls = page.locator('[data-studio-mobile-primary-actions="true"]');
    await expect(controls).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `mobile horizontal overflow ${overflow}`);
    await expect(controls.getByRole("button")).toHaveCount(6);
    for (const name of ["펜", "지우개", "브러시 색상", "실행취소", "다시실행", "작업 메뉴"]) {
      const target = controls.getByRole("button", { name, exact: true });
      const box = await target.boundingBox();
      assert(box && box.width >= 43.5 && box.height >= 43.5 && box.x >= 0 && box.x + box.width <= size.width + 1, `${name}: ${JSON.stringify(box)}`);
    }
    const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
    const openWorkMenu = async () => {
      const toggle = dock.locator('[data-studio-mobile-workspace-toggle="true"]');
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    };
    await page.screenshot({ path: path.join(output, `${engine}-mobile-${size.width}-essential.png`) });
    await controls.getByRole("button", { name: "브러시 색상", exact: true }).click();
    const colors = dock.locator('[data-studio-mobile-color-controls="true"]');
    for (const name of ["주 색", "보조 색", "주 색과 보조 색 교체", "캔버스 스포이드"]) {
      const box = await colors.getByRole("button", { name, exact: true }).boundingBox();
      assert(box && box.width >= 43.5 && box.height >= 43.5 && box.x >= 0 && box.x + box.width <= size.width + 1, `${name}: ${JSON.stringify(box)}`);
    }
    await page.keyboard.press("Escape");
    await expect(controls.getByRole("button", { name: "브러시 색상", exact: true })).toBeFocused();
    await openWorkMenu();
    for (const name of ["레이어 열기", "전체 도구 열기"]) {
      const box = await dock.getByRole("button", { name, exact: true }).boundingBox();
      assert(box && box.width >= 43.5 && box.height >= 43.5 && box.x >= 0 && box.x + box.width <= size.width + 1, `${name}: ${JSON.stringify(box)}`);
    }
    await page.screenshot({ path: path.join(output, `${engine}-mobile-${size.width}-work-menu.png`) });
    await dock.getByRole("button", { name: "브러시 설정 (굵기·색·프리셋)", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "브러시 설정", exact: true });
    await expect(sheet).toBeVisible();
    const sheetBounds = await sheet.boundingBox(); const dockBounds = await dock.boundingBox();
    assert(sheetBounds && dockBounds && sheetBounds.y + sheetBounds.height <= dockBounds.y + 1, "brush sheet overlaps the dock");
    await sheet.locator('[data-studio-open-brush-library="true"]').click();
    await expect(page.getByTestId("action")).toHaveText("brush-library");
    await sheet.getByRole("button", { name: "브러시 설정 닫기", exact: true }).click();
    await openWorkMenu();
    await dock.getByRole("button", { name: "전체 도구 열기", exact: true }).click();
    let catalog = page.getByRole("dialog", { name: "전체 도구", exact: true });
    await expect(catalog).toBeVisible();
    await catalog.getByRole("searchbox").fill("스포이드");
    await catalog.getByRole("button", { name: "색 가져오기 사용", exact: true }).click();
    await expect(page.getByTestId("tool")).toHaveText("eyedropper");
    await page.getByRole("button", { name: "캔버스 전용 전환", exact: true }).click();
    await openWorkMenu();
    await dock.getByRole("button", { name: "전체 도구 열기", exact: true }).click();
    catalog = page.getByRole("dialog", { name: "전체 도구", exact: true });
    await expect(catalog).toBeVisible();
    await catalog.getByRole("button", { name: "전체 도구 닫기", exact: true }).click();
    const dialog = await openColor(page);
    await expect(dialog).toHaveAttribute("data-layout", "sheet");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const hex = dialog.getByRole("textbox", { name: "헥스 색상 코드", exact: true });
    await hex.fill("#abcdef");
    await expect.poll(async () => {
      const input = await hex.boundingBox(); const footer = await dialog.locator("footer").boundingBox();
      return Boolean(input && footer && input.y + input.height <= footer.y + 1);
    }).toBe(true);
    const copy = await dialog.getByRole("button", { name: "색상 코드 복사" }).boundingBox();
    assert(copy && copy.width >= 43.5 && copy.height >= 43.5, "color copy target below 44px");
    await hex.evaluate((input) => input.setSelectionRange(2, 4));
    await page.setViewportSize({ width: size.width, height: 420 });
    await expect.poll(async () => {
      const input = await hex.boundingBox(); const body = await dialog.locator("[data-studio-color-scroll]").boundingBox();
      return Boolean(input && body && input.y >= body.y - 1 && input.y + input.height <= body.y + body.height + 1);
    }).toBe(true);
    assert.deepEqual(await hex.evaluate((input) => [input.selectionStart, input.selectionEnd]), [2, 4]);
    await page.setViewportSize(size);
    await dialog.getByText("정밀 수치 · RGB / HSV / HSL", { exact: true }).click();
    const red = dialog.getByRole("spinbutton", { name: "빨강 수치 입력", exact: true });
    await red.fill(""); await expect(red).toHaveValue(""); await expect(hex).toHaveValue("#abcdef");
    await red.pressSequentially("171"); await red.press("Enter");
    const redBounds = await red.boundingBox();
    const sliderBounds = await dialog.getByRole("slider", { name: "빨강 채널 R", exact: true }).boundingBox();
    assert(redBounds && redBounds.height >= 43.5 && sliderBounds && sliderBounds.height >= 43.5, "precision touch target");
    await dialog.getByText("정밀 수치 · RGB / HSV / HSL", { exact: true }).click();

    await page.screenshot({ path: path.join(output, `${engine}-mobile-${size.width}.png`) });
    const box = await dialog.boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `sheet clipped: ${JSON.stringify(box)}`);
    await apply(page);
    await expect(page.getByTestId("primary")).toHaveText("#abcdef");
    await expect(page.getByTestId("undo")).toHaveText("0");
    report.checks.push(`${engine}: actual mobile dock ${size.width}x${size.height}, brush-sheet target clearance, touch targets, canvas-only catalog, shared modal color commit`);
  } finally { await session.close(); }
}

try {
  for (const engine of engines) {
    const launcher = { chromium, firefox, webkit }[engine];
    if (!launcher) throw new Error(`Unknown engine ${engine}`);
    const browser = await launcher.launch({ headless: true });
    report.engines.push({ engine, version: browser.version() });
    try {
      const session = await openStudioDrawingContext(launcher, browser, engine, { viewport: { width: 1440, height: 900 } });
      let persistence = "saved";
      try {
        if (engine === "webkit") {
          // 저장 능력은 콘솔 오류를 모으지 않는 별도 페이지로 잰다(OPFS 진입점이 없는 빌드는 제품이 오류를 정직하게 남긴다).
          const probe = await session.context.newPage();
          try {
            await probe.goto(url, navigation);
            persistence = expectedDrawingPersistence(engine, await hasOpfsEntryPoint(probe));
          } finally { await probe.close(); }
        }
        report.storageModes.push({ engine, mode: session.mode, persistence });
        if (persistence === "saved") {
          const page = await session.context.newPage();
          page.on("pageerror", (error) => report.errors.push(`${engine}: ${error.message}`));
          page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(`${engine}: ${message.text()}`); });
          await desktop(page, engine);
          if (engine === "chromium") {
            report.accessibility.push(...await auditDrawingControls(page));
            report.performance.push(await measureDrawingColorInteraction(page, url));
          }
          if (session.reopen) {
            const pins = await pinIds(page);
            const recent = await page.getByTestId("recent").textContent();
            const reopened = await session.reopen();
            const restored = await reopened.newPage();
            restored.on("pageerror", (error) => report.errors.push(`${engine} restored: ${error.message}`));
            await ready(restored);
            assert.deepEqual(await pinIds(restored), pins);
            await expect(restored.getByTestId("recent")).toHaveText(recent, options);
            report.checks.push(`${engine}: complete browser shutdown and fresh process restore real SQLite pins and recent colors`);
          }
        } else {
          // 내구 저장 시나리오는 OPFS 가 있어야 성립한다. 없는 빌드에서는 저장을 흉내 내지 않고, 모바일 도크의 정확한 세션 전용
          // 상태와 아래 제한 컨텍스트 검증(경고·편집 가능·가짜 저장 표시 없음)으로 문서화한 계약을 확인한다.
          report.checks.push(`${engine}: OPFS entry point is absent in this build; durable SQLite scenarios are not claimed, session-only contract is verified instead`);
        }
      } finally { await session.close(); }
      await handheld(browser, engine, { width: 390, height: 700 }, persistence);
      await handheld(browser, engine, { width: 360, height: 640 }, persistence);
      await handheld(browser, engine, { width: 320, height: 640 }, persistence);
      await handheld(browser, engine, { width: 412, height: 800 }, persistence);
      if (engine === "webkit") report.storageModes.push({ engine, ...await verifyRestrictedDrawingContext(browser, url) });
    } finally { await browser.close(); }
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await isolated.close();
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
