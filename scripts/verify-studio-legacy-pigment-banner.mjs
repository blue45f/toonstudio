/**
 * 실제 production build에서 이전 안료 안내의 터치·키보드·원본 보존·이주를 검사한다.
 * 실행: pnpm exec tsx scripts/verify-studio-legacy-pigment-banner.mjs
 * 생산 빌드를 loopback preview로 제공하며 API/외부 네트워크는 연결하지 않는다.
 * TOONSTUDIO_LEGACY_BANNER_DIST_DIR로 보존된 기존 dist와 분리한 빌드를 선택한다.
 * 외부 Mixbox 픽셀·구형 reader·서버 권한 검증이 아니다. CSS/React 상태를 주입하지 않는다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { findFreePort, spawnVitePreview, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const dist = path.resolve(process.env.TOONSTUDIO_LEGACY_BANNER_DIST_DIR ?? path.join(root, "dist"));
const output = path.resolve(process.env.TOONSTUDIO_LEGACY_BANNER_VERIFY_DIR
  ?? path.join(tmpdir(), `toonstudio-legacy-banner-${Date.now()}`));
await mkdir(output, { recursive: true });
const fixturePath = path.join(root, "tests/corpus/studio/legacy-pigment-project-v2.json");
const fixtureBytes = await readFile(fixturePath);
const fixture = JSON.parse(fixtureBytes.toString());
const original = fixture.payload.data.pagesList[0].elements;
const report = {
  status: "running", startedAt: new Date().toISOString(),
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceFiles: await Promise.all([
    "apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorView.tsx",
    "scripts/verify-studio-legacy-pigment-banner.mjs", "tests/corpus/studio/legacy-pigment-project-v2.json",
  ].map(async (file) => ({ path: file, sha256: createHash("sha256").update(await readFile(path.join(root, file))).digest("hex") }))),
  runtimeIndexSha256: createHash("sha256").update(await readFile(path.join(dist, "index.html"))).digest("hex"),
  runtimeManifestSha256: createHash("sha256").update(await readFile(path.join(dist, ".vite/manifest.json"))).digest("hex"),
  dirtyRuntimeDiffSha256: createHash("sha256").update(execFileSync("git", ["diff", "--binary", "HEAD", "--", "apps/web/src", "apps/web/config", "apps/web/vite.config.ts", "packages", "package.json", "pnpm-lock.yaml"], { cwd: root })).digest("hex"),
  fixtureSha256: createHash("sha256").update(fixtureBytes).digest("hex"),
  scope: "현재 production build의 로컬 공개 UI. 서버 권한·외부 원본 픽셀·구형 reader 검증 아님",
  cases: [],
};
const port = await findFreePort();
const preview = spawnVitePreview({ port, runner: "node-vite-bin", outDir: dist, logPath: path.join(output, "preview.log") });
let browser;
const noticeName = "이전 혼색 획 확인", originalName = "원본 파일 내려받기";
const copyName = "원본 보존·자체 혼색 사본 만들기";

async function centerTap(page, locator, row, label) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox(); assert.ok(box, `${label}: 버튼 위치가 없습니다.`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const hit = await locator.evaluate((element, p) => {
    const top = document.elementFromPoint(p.x, p.y);
    return { owned: Boolean(top && (element === top || element.contains(top))),
      topTag: top?.tagName, topId: top?.id, topLabel: top?.getAttribute("aria-label") };
  }, point);
  (row.touches ??= []).push({ label, box, point, hit });
  assert.ok(hit.owned, `${label}: 다른 요소가 버튼 중심을 가립니다: ${JSON.stringify(hit)}`);
  assert.ok(point.x >= 0 && point.x < row.width && point.y >= 0 && point.y < row.height, `${label}: 화면 밖입니다.`);
  await page.touchscreen.tap(point.x, point.y);
}

async function dismissOptionalGuides(page, row) {
  for (const label of ["모바일 편집 안내 닫기", "안내 닫기", "빠른 시작 닫기 (Esc)", "시작 안내 닫기"]) {
    const button = page.getByRole("button", { name: label, exact: true }).first();
    if (await button.count() && await button.isVisible()) {
      // 초기 도움말은 공개 키보드 동작으로 닫는다. 검사 대상 버튼은 아래에서 실제 중심 터치한다.
      await button.press("Enter"); (row.optionalGuidesDismissed ??= []).push(label);
    }
  }
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    };
    const editor = document.querySelector('[data-studio-editor="true"]');
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      immersive: editor?.getAttribute("data-studio-mobile-immersive"),
      headerBlock: editor ? getComputedStyle(editor).getPropertyValue("--studio-immersive-menubar-block") : null,
      menu: rect(document.querySelector('[data-studio-app-menubar="true"]')),
      notice: rect(document.querySelector('[data-studio-legacy-pigment-notice="true"]')),
      canvas: rect(document.querySelector('[data-studio-canvas-viewport]')) };
  });
}

try {
  await waitForServer(`http://127.0.0.1:${port}/`, { timeoutMs: 30_000 });
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [[320, 1100], [360, 1100], [768, 1100], [1023, 1100], [1024, 1100], [1440, 1100], [320, 640], [360, 640], [768, 640], [1023, 640]]) {
    const row = { width, height, pageErrors: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true,
      locale: "ko-KR", serviceWorkers: "block", acceptDownloads: true });
    const origin = `http://127.0.0.1:${port}`;
    await context.routeWebSocket("**", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.abort(); return; }
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) {
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"isolated-browser-verification"}' }); return;
      }
      await route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) => row.pageErrors.push(String(error)));
    page.on("dialog", (dialog) => dialog.accept());
    try {
      await page.goto(`${origin}/studio/draft/legacy-banner-${width}-${height}?workspace=draw`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 120_000 });
      await page.waitForFunction(() => {
        const input = document.querySelector('input[aria-label="프로젝트 JSON 가져오기"]');
        return input instanceof HTMLInputElement && !input.disabled && new URL(location.href).searchParams.has("room");
      });
      await page.waitForTimeout(2_500);
      await page.getByLabel("프로젝트 JSON 가져오기", { exact: true }).setInputFiles(fixturePath);
      const notice = page.getByRole("region", { name: noticeName, exact: true }); await notice.waitFor();
      await dismissOptionalGuides(page, row);
      await page.locator('[data-studio-legacy-pigment-notice="true"]').waitFor();
      row.geometry = await geometry(page);
      assert.ok(row.geometry.documentWidth <= width + 1, "문서가 가로로 넘칩니다.");
      assert.ok(row.geometry.notice.scrollWidth <= row.geometry.notice.clientWidth + 1, "안내가 가로로 넘칩니다.");
      assert.ok(row.geometry.canvas.height > 0, "안내가 캔버스 영역을 모두 소모했습니다.");
      if (row.geometry.immersive === "true" && width < 1024) {
        assert.ok(row.geometry.notice.y >= row.geometry.menu.bottom, "안내가 몰입 메뉴와 겹칩니다.");
      }
      await centerTap(page, page.getByRole("combobox", { name: "문서 작업공간", exact: true }), row, "작업공간 선택");
      await page.keyboard.press("Escape");
      const [download] = await Promise.all([page.waitForEvent("download"),
        centerTap(page, notice.getByRole("button", { name: originalName, exact: true }), row, "원본 다운로드")]);
      const saved = path.join(output, `${width}x${height}-original.json`); await download.saveAs(saved);
      assert.deepEqual(JSON.parse(await readFile(saved, "utf8")).elements, original);
      await page.keyboard.press("Tab");
      assert.ok(await notice.getByRole("button", { name: copyName, exact: true }).evaluate((element) => element === document.activeElement), "Tab이 사본 만들기를 건너뜁니다.");
      await page.keyboard.press("Shift+Tab");
      assert.ok(await notice.getByRole("button", { name: originalName, exact: true }).evaluate((element) => element === document.activeElement), "Shift+Tab이 원본 다운로드를 건너뜁니다.");
      await page.keyboard.press("Escape"); assert.equal(await notice.count(), 1);
      await page.screenshot({ path: path.join(output, `${width}x${height}-notice.png`), fullPage: true });
      const history = Number(await page.locator('[data-studio-editor="true"]').getAttribute("data-studio-history-undo-depth"));
      await centerTap(page, notice.getByRole("button", { name: copyName, exact: true }), row, "사본 만들기");
      await notice.waitFor({ state: "detached" });
      await page.waitForFunction((before) => Number(document.querySelector('[data-studio-editor="true"]')?.getAttribute("data-studio-history-undo-depth")) === before + 1, history);
      assert.deepEqual(row.pageErrors, []); row.status = "passed";
    } catch (error) {
      row.status = "failed"; row.error = String(error);
      await page.screenshot({ path: path.join(output, `${width}x${height}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await browser?.close(); preview.kill("SIGTERM");
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, output, error: report.error }));
}
