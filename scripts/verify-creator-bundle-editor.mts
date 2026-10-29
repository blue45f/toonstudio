/** 고립된 loopback 브라우저에서 실제 Studio host의 번들 삽입·저장·아카이브 왕복을 검증한다. */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

import { installBetaEventDismissal } from "./lib/public-page-event-gate.mjs";
import { readDurableStudioAutosaveDocument } from "./lib/studio-verify-durable-autosave.mjs";
import { completeStudioRecovery, observeStudioRecovery } from "./lib/studio-verify-recovery";

const origin = new URL(process.env.TOONSTUDIO_BUNDLE_EDITOR_ORIGIN ?? "http://127.0.0.1:5217");
if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1") throw new Error("고립 loopback origin만 검증할 수 있습니다.");
const output = resolve(process.env.TOONSTUDIO_BUNDLE_EDITOR_OUTPUT ?? "/tmp/toonstudio-bundle-editor-20261028");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce", serviceWorkers: "block" });
await observeStudioRecovery(context);
const network: { blocked: string[]; api: { method: string; path: string }[] } = { blocked: [], api: [] };
await context.route("**/*", async route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin.origin) { network.blocked.push(`${url.origin}${url.pathname}`); await route.abort(); return; }
  if (url.pathname.startsWith("/api/")) {
    network.api.push({ method: route.request().method(), path: url.pathname });
    await route.fulfill({ status: url.pathname === "/api/auth/session" ? 200 : 503, json: url.pathname === "/api/auth/session" ? { authenticated: false, user: null } : { message: "격리 브라우저: 운영 API 차단" } });
    return;
  }
  await route.continue();
});
await context.routeWebSocket("**/*", route => {
  const url = new URL(route.url());
  if (url.hostname === origin.hostname && url.port === origin.port && !url.pathname.startsWith("/studio-live") && !url.pathname.startsWith("/socket.io")) route.connectToServer();
  else { network.blocked.push(`websocket:${url.origin}${url.pathname}`); route.close(); }
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors: string[] = [];
page.on("dialog", dialog => { void (dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss()); });
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") process.stderr.write(`${message.text().slice(0, 500)}\n`); });
await installBetaEventDismissal(page);
let preserveExportMenuDuringSuggestionDismissal = false;
await page.addLocatorHandler(page.locator('[data-studio-first-publish-suggestion="true"]'), async suggestion => {
  if (await page.locator('[data-studio-export-menu-panel="true"]').isVisible()) {
    await page.keyboard.press("Escape");
  }
  await suggestion.getByRole("button", { name: "게시 준비 제안 닫기" }).click();
  // 안내 바깥 클릭이 메뉴를 닫으면 현재 검수 중인 내보내기 설정을 다시 연다.
  if (preserveExportMenuDuringSuggestionDismissal && !await page.locator('[data-studio-export-menu-panel="true"]').isVisible()) {
    await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  }
});
await page.addInitScript(() => {
  localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
  localStorage.setItem("toonstudio-studio-beta-notice-acknowledged", "2026-09-24-data-and-policy-v1");
  localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
  localStorage.setItem("toonstudio-studio-mobile-hint-dismissed", "1");
  sessionStorage.setItem("toonstudio-compat-dismissed", "true");
});
const draftId = `itch-bundle-${Date.now()}`;
const draftUrl = `${origin.origin}/studio/draft/${draftId}?workspace=draw&preset=illustration&assetMarket=community`;
try {
  const pngArchive = process.env.TOONSTUDIO_BUNDLE_EDITOR_PNG_ARCHIVE;
  if (pngArchive) {
    await page.goto(draftUrl, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.locator('[data-studio-bundle-library="true"]').waitFor({ timeout: 180_000 });
    await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
    await page.locator('input[aria-label="프로젝트 아카이브 가져오기"]').setInputFiles(resolve(pngArchive));
    await page.getByRole("status").filter({ hasText: /SHA-256.*복구했어요/u }).waitFor({ timeout: 120_000 });
    await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
    preserveExportMenuDuringSuggestionDismissal = true;
    const settings = page.locator('[data-studio-export-menu-panel="true"]');
    await settings.getByRole("button", { name: "1×", exact: true }).click();
    await settings.getByRole("button", { name: "PNG", exact: true }).click();
    await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
    const [pngDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.locator('button[data-studio-primary-action="export"]').click(),
    ]);
    assert.equal(await pngDownload.failure(), null);
    const pngPath = resolve(output, "restored-page.png");
    await pngDownload.saveAs(pngPath);
    const png = await readFile(pngPath);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, 720); assert.equal(height, 1080);
    const pixels = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(image.width, image.height);
      const drawing = canvas.getContext("2d");
      if (!drawing) throw new Error("제작 결과의 픽셀을 읽지 못했습니다.");
      drawing.drawImage(image, 0, 0); image.close();
      const data = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0, nonWhite = 0, brown = 0;
      const colors = new Set<number>();
      for (let index = 0; index < data.length; index += 4) {
        if ((data[index + 3] ?? 0) < 16) continue;
        const r = data[index] ?? 0, g = data[index + 1] ?? 0, b = data[index + 2] ?? 0;
        visible += 1;
        if (Math.min(r, g, b) < 235) nonWhite += 1;
        if (r > g * 1.15 && g > b * 1.15 && r > 45) brown += 1;
        colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      }
      return { visible, nonWhite, brown, distinctColors: colors.size };
    }, png.toString("base64"));
    assert.ok(pixels.nonWhite > 10_000 && pixels.brown > 5_000 && pixels.distinctColors > 50, "빈 캔버스 또는 벤치 픽셀이 없는 PNG입니다.");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve(output, "05-png-export-host.png") });
    await writeFile(resolve(output, "png-report.json"), JSON.stringify({ ok: true, source: "복구한 실제 Studio host의 UI PNG 1× 내보내기", width, height, pixels, byteSize: png.length, sha256: createHash("sha256").update(png).digest("hex"), errors, network }, null, 2));
    process.stdout.write(`실제 host PNG PASS: ${width}×${height}, 비백색 ${pixels.nonWhite}, 갈색 ${pixels.brown} pixels\n`);
  } else {
  process.stdout.write(`실제 host 열기: ${draftUrl}\n`);
  await page.goto(draftUrl, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.locator("[data-studio-canvas-viewport]").first().waitFor({ timeout: 240_000 });
  await page.screenshot({ path: resolve(output, "01-host.png") });
  const library = page.locator('[data-studio-bundle-library="true"]');
  await library.locator("summary").click({ timeout: 120_000 });
  const card = library.locator("[data-bundle-asset-id]").first();
  await card.waitFor({ timeout: 90_000 });
  const assetId = await card.getAttribute("data-bundle-asset-id");
  if (!assetId) throw new Error("소재 ID가 없습니다.");
  await card.getByRole("button", { name: "캔버스에 삽입", exact: true }).click();
  await page.waitForTimeout(300);
  process.stdout.write(`실제 host 삽입 완료: ${assetId}\n`);
  await page.screenshot({ path: resolve(output, "02-inserted.png") });
  const key = `toonstudio-studio-autosave:v12:guest:work:${encodeURIComponent(`draft:${draftId}`)}`;
  let stored: Awaited<ReturnType<typeof readDurableStudioAutosaveDocument>> = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    stored = await readDurableStudioAutosaveDocument(page, key);
    if (stored && JSON.stringify(stored.pagesList).includes(assetId)) break;
    await page.waitForTimeout(300);
  }
  if (!stored || !JSON.stringify(stored.pagesList).includes(assetId)) throw new Error("정본 autosave에서 새 소재를 찾지 못했습니다.");
  await writeFile(resolve(output, "autosave.json"), JSON.stringify(stored, null, 2));
  process.stdout.write("정본 autosave 확인\n");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.locator("[data-studio-canvas-viewport]").first().waitFor({ timeout: 180_000 });
  const recovery = await completeStudioRecovery(page, 120_000);
  process.stdout.write(`실제 UI reload 복구: ${recovery.recoveryMode}\n`);
  await page.screenshot({ path: resolve(output, "03-reloaded.png") });
  await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator('button[title^="프로젝트 JSON과 이미지"]').click(),
  ]);
  if (await download.failure()) throw new Error("아카이브 다운로드가 실패했습니다.");
  const firstPath = resolve(output, "before.toonproject.zip");
  await download.saveAs(firstPath);
  process.stdout.write(`아카이브 다운로드: ${(await readFile(firstPath)).length} bytes\n`);
  const before = await readArchiveEvidence(page, firstPath);
  assert.equal(before.isSelfContained, true);
  const placed = before.placed.filter(entry => entry.credit.assetId === assetId);
  assert.equal(placed.length, 1);
  assert.equal(placed[0]?.bodyHash, placed[0]?.credit.contentHash);
  await page.goto(`${origin.origin}/studio/draft/${draftId}-restored?workspace=draw&assetMarket=community`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.locator("[data-studio-canvas-viewport]").first().waitFor({ timeout: 180_000 });
  // 새 초안의 hydration이 끝나 메뉴 deep link가 실제로 처리된 뒤 import한다.
  await page.locator('[data-studio-bundle-library="true"]').waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
  await page.locator('input[aria-label="프로젝트 아카이브 가져오기"]').setInputFiles(firstPath);
  await page.getByRole("status").filter({ hasText: /SHA-256.*복구했어요/u }).waitFor({ timeout: 120_000 });
  const [secondDownload] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    page.locator('button[title^="프로젝트 JSON과 이미지"]').click(),
  ]);
  assert.equal(await secondDownload.failure(), null);
  const secondPath = resolve(output, "restored.toonproject.zip");
  await secondDownload.saveAs(secondPath);
  const after = await readArchiveEvidence(page, secondPath);
  assert.deepEqual(after.placed.filter(entry => entry.credit.assetId === assetId), placed);
  assert.deepEqual(after.attachments, before.attachments);
  assert.equal(after.isSelfContained, true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: resolve(output, "04-restored.png") });
  const report = { ok: true, recovery, source: "실제 제품 Studio host · guest local document · 운영 API 차단", assetId, key, draftUrl, before, after, errors, network,
    archives: await Promise.all([firstPath, secondPath].map(async path => { const bytes = await readFile(path); return { file: path, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; })) };
  await writeFile(resolve(output, "report.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`실제 host 저장·reload·archive 복구·재내보내기 PASS: ${assetId}\n`);
  }
} catch (error) {
  await page.screenshot({ path: resolve(output, "failure.png") }).catch(() => undefined);
  await writeFile(resolve(output, "failure-dom.txt"), await page.locator("body").innerText().catch(() => ""));
  await writeFile(resolve(output, "failure.json"), JSON.stringify({ message: error instanceof Error ? error.message : String(error), errors, network }, null, 2));
  throw error;
} finally { await context.close(); await browser.close(); }

async function readArchiveEvidence(ownerPage: Page, path: string) {
  const base64 = (await readFile(path)).toString("base64");
  return ownerPage.evaluate(async encoded => {
    const moduleUrl = new URL("/src/domains/creator/studio-project-archive.ts", location.origin).href;
    const runtime = await import(moduleUrl) as Pick<typeof import("../apps/web/src/domains/creator/studio-project-archive"), "importStudioProjectArchive">;
    const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const archive = await runtime.importStudioProjectArchive(new Blob([bytes]));
    const creditModuleUrl = new URL("/src/domains/creator/catalog/studio-bundle-source-credit.ts", location.origin).href;
    const { requireStudioBundleSourceCredit } = await import(creditModuleUrl) as Pick<typeof import("../apps/web/src/domains/creator/catalog/studio-bundle-source-credit"), "requireStudioBundleSourceCredit">;
    const placed = await Promise.all(archive.project.pagesList.flatMap(page => page.elements.flatMap(element => {
      if (!element || typeof element !== "object" || Array.isArray(element)) return [];
      const record = element as Record<string, unknown>;
      if ((record.type !== "image" && record.type !== "frame") || !record.bundleSourceCredit) return [];
      const credit = requireStudioBundleSourceCredit(record.bundleSourceCredit);
      const source = record.type === "frame" ? record.bg : record.src;
      return [(async () => {
        if (typeof source !== "string" || !source.startsWith("data:image/")) throw new Error("복구된 실제 래스터 바이트가 없습니다.");
        const body = Uint8Array.from(atob(source.split(",")[1] ?? ""), character => character.charCodeAt(0));
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body)), byte => byte.toString(16).padStart(2, "0")).join("");
        return { id: record.id, type: record.type, x: record.x, y: record.y, width: record.width, height: record.height,
          credit, bodyHash: `sha256:${hash}`, byteSize: body.length };
      })()];
    })));
    return { isSelfContained: archive.isSelfContained, placed, attachments: archive.manifest.attachments.map(attachment => ({ sha256: attachment.sha256, byteSize: attachment.byteSize, mimeType: attachment.mimeType })) };
  }, base64);
}
