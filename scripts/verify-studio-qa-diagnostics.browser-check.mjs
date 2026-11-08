/** 실제 앱·사용자 데이터 없이 Chromium의 주입 및 실패 evidence 경로를 확인한다. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

import { closeStudioGroupQaContext, createStudioGroupQaContext, installStudioQaDiagnostics,
  saveStudioQaDiagnostics } from "./lib/studio-qa-diagnostics.mts";

test("실제 Chromium 실패 finally에서 선택형 JSON을 남기며 DOM/파일명/trace를 노출하지 않는다", async () => {
  process.env.TOONSTUDIO_QA_DIAGNOSTICS = "1";
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-qa-diagnostics-test-"));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await createStudioGroupQaContext(browser, "ko-KR");
    const page = await context.newPage();
    await page.goto("data:text/html,<body>private-body<input type=file></body>");
    await page.locator("input").setInputFiles({ name: "private-file.png", mimeType: "image/png", buffer: Buffer.from("synthetic") });
    const original = new Error("fixture-assertion-failure");
    const path = join(directory, "diagnostic-events.json");
    await assert.rejects(async () => {
      try { throw original; }
      finally { await closeStudioGroupQaContext(context, path); }
    }, (error) => error === original);
    const json = readFileSync(path, "utf8");
    assert.ok(!/private-|synthetic|trace|snapshot/u.test(json));
    const report = JSON.parse(json);
    assert.equal(report.pages[0].samples[0].files[0].size, 9);
    assert.equal(report.pages[0].samples[0].files[0].type, "image/png");
    const layout = await browser.newContext();
    await installStudioQaDiagnostics(layout, "layout");
    const layoutPage = await layout.newPage();
    await layoutPage.goto('data:text/html,<div data-character-shaper><div data-character-shaper-viewport><canvas width="400"></canvas></div><div role="status">private-status</div></div>');
    await layoutPage.waitForTimeout(150);
    await saveStudioQaDiagnostics(layout, join(directory, "layout.json"));
    const result = readFileSync(join(directory, "layout.json"), "utf8");
    assert.equal(JSON.parse(result).pages[0].samples[0].width, 400);
    assert.ok(!result.includes("private-status"));
    assert.equal(await layoutPage.evaluate(() => "__studioQaDiagnostics" in globalThis), false);
    await layout.close();
  } finally {
    await browser.close();
    rmSync(directory, { recursive: true, force: true });
    delete process.env.TOONSTUDIO_QA_DIAGNOSTICS;
  }
});
