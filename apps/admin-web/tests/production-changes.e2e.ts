import { expect, test, type Page } from "@playwright/test";
import { createRecord, emptyData, productionChangeCreateSchema, productionChangeSaveSchema, productionChangeTransitionSchema, transitionRecord, updateRecord } from "@toonstudio/contracts/admin-production-change";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

import type { RequestRecord } from "@toonstudio/contracts/admin-production-change";

const path = "/admin/production/changes/";
const actor = { userId: "production-admin-fixture", displayName: "합성 관리자" };
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGN8kRX3n4GBgYGJAQoAKbICsz0CgLcAAAAASUVORK5CYII=", "base64");
function fixture(): RequestRecord {
  const data = emptyData();
  Object.assign(data, { title: "합성 장면 변경 요청", description: "브라우저 검증용 합성 요청", project: "합성 프로젝트", episode: "합성 EP01", owner: "합성 담당자", nextAction: "로컬·원격 차이 확인", impact: "high", conflictState: "open" });
  data.conflict.local.revision = "local-fixture-r2";
  data.conflict.remote.revision = "remote-fixture-r3";
  return createRecord(data, actor);
}

/** 브라우저 상호작용만 합성 API로 검증한다. SQL·권한 정본은 실제 PostgreSQL suite가 검증한다. */
async function installServer(page: Page, role: "admin" | "operator" = "admin", initial: RequestRecord[] = []) {
  const server = { requests: initial, posts: 0, saveStatus: 200, identityStatus: 200, holdIdentity: false, releaseIdentity: () => {} };
  await page.route("**/api/admin/me", async route => {
    if (server.holdIdentity) await new Promise<void>(resolve => { server.releaseIdentity = resolve; });
    await route.fulfill({ status: server.identityStatus, json: server.identityStatus === 200 ? { id: actor.userId, role } : { message: "합성 권한 거부" } });
  });
  await page.route("**/api/admin/production-changes**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() === "GET") {
      await route.fulfill(url.pathname.includes("/captures/") ? { status: 200, contentType: "image/png", body: image } : { status: 200, json: { requests: server.requests } });
      return;
    }
    server.posts += 1;
    expect(request.headers()[TOONSPECTRUM_CSRF_HEADER.toLowerCase()]).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    if (server.saveStatus !== 200) { await route.fulfill({ status: server.saveStatus, json: { message: `합성 저장 오류 ${server.saveStatus}` } }); return; }
    if (url.pathname.endsWith("/captures")) {
      expect(request.headers()["content-type"]).toContain("multipart/form-data");
      await route.fulfill({ status: 201, json: { url: "/api/admin/production-changes/captures/ade9197e-dacd-4da0-83d1-5fabf6be6424" } }); return;
    }
    try {
      const id = url.pathname.split("/").at(-2);
      const previous = server.requests.find(record => record.id === id);
      let next: RequestRecord;
      if (url.pathname.endsWith("/save") && previous) {
        const command = productionChangeSaveSchema.parse(request.postDataJSON());
        if (command.expectedVersion !== previous.version) { await route.fulfill({ status: 409, json: { message: "버전 충돌" } }); return; }
        next = updateRecord(previous, command.data, actor);
      } else if (url.pathname.endsWith("/transition") && previous) {
        const command = productionChangeTransitionSchema.parse(request.postDataJSON());
        if (command.expectedVersion !== previous.version) { await route.fulfill({ status: 409, json: { message: "버전 충돌" } }); return; }
        next = transitionRecord(previous, { status: command.status, note: command.note }, actor);
      } else next = createRecord(productionChangeCreateSchema.parse(request.postDataJSON()).data, actor);
      server.requests = [next, ...server.requests.filter(record => record.id !== next.id)];
      await route.fulfill({ status: 200, json: { request: next } });
    } catch (error) { await route.fulfill({ status: 400, json: { message: error instanceof Error ? error.message : "합성 입력 오류" } }); }
  });
  return server;
}

test("네이티브 메뉴에서 생성·충돌 비교·캡처 저장 후 서버 기록을 다시 연다", async ({ page }, info) => {
  const server = await installServer(page);
  await page.goto(path);
  await expect(page.getByRole("link", { name: "제작 변경", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "첫 변경 요청을 기록해 보세요" })).toBeVisible();
  await page.getByRole("button", { name: "새 변경 요청", exact: true }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("요청 제목 *", { exact: true }).fill("합성 제작 변경 브라우저 확인");
  await dialog.getByLabel("관련 프로젝트", { exact: true }).fill("브라우저 합성 프로젝트");
  await dialog.getByLabel("변경 목적과 요청 내용", { exact: true }).fill("합성 자료로 충돌 비교 폼 확인");
  await dialog.getByLabel("다음 조치", { exact: true }).fill("합성 로컬·원격 근거 확인");
  await dialog.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Conflict Center", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Conflict Center", exact: true }).click();
  await dialog.getByRole("combobox", { name: "충돌 여부", exact: true }).selectOption("open");
  const local = dialog.locator(".pc-comparison-side--local");
  const remote = dialog.locator(".pc-comparison-side--remote");
  await local.getByLabel("변경 Revision", { exact: true }).fill("local-browser-r2");
  await remote.getByLabel("변경 Revision", { exact: true }).fill("remote-browser-r3");
  await local.locator('input[type="file"]').setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: image });
  await expect(local.getByRole("img")).toBeVisible();
  await expect(local.getByRole("img")).toHaveJSProperty("naturalWidth", 2);
  await expect(local.getByRole("img")).toHaveJSProperty("naturalHeight", 2);
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByText("서버 기록과 일치", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("production-conflict-desktop.png"), fullPage: true });
  expect(server.requests).toHaveLength(1);
  expect(server.requests[0].data.conflict).toMatchObject({ local: { revision: "local-browser-r2" }, remote: { revision: "remote-browser-r3" } });
  expect(server.requests[0].approval).toBeNull();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /합성 제작 변경 브라우저 확인/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Conflict Center", exact: true }).click();
  await expect(dialog.locator(".pc-comparison-side--local").getByLabel("변경 Revision", { exact: true })).toHaveValue("local-browser-r2");
});

test("409의 초안을 보존하고 권한 재확인 중 최상위 모달도 숨긴다", async ({ page }) => {
  const server = await installServer(page, "admin", [fixture()]);
  await page.goto(path);
  await page.getByRole("button", { name: /합성 장면 변경 요청/ }).click();
  const dialog = page.getByRole("dialog");
  const notes = dialog.getByRole("textbox", { name: "작업 메모", exact: true });
  await notes.fill("보존할 합성 미저장 초안");
  server.saveStatus = 409;
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("다른 변경이 먼저 저장");
  await expect(notes).toHaveValue("보존할 합성 미저장 초안");
  server.holdIdentity = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialog).not.toBeVisible();
  server.holdIdentity = false; server.releaseIdentity();
  await expect(dialog).toBeVisible();
  await expect(notes).toHaveValue("보존할 합성 미저장 초안");
  server.identityStatus = 403;
  await page.evaluate(() => window.dispatchEvent(new Event("toonstudio:auth-session-changed")));
  await expect(page.getByText("합성 권한 거부", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(server.requests[0].data.notes).toBe("");
});

test("390px 운영자 화면에서 필터·10상태 칸반·읽기 전용 비교를 제공한다", async ({ page }, info) => {
  const server = await installServer(page, "operator", [fixture()]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(page.getByRole("button", { name: "새 변경 요청", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "영향도 필터", exact: true }).selectOption("low");
  await expect(page.getByRole("heading", { name: "조건에 맞는 요청이 없습니다" })).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await page.getByRole("button", { name: "칸반 보기", exact: true }).click();
  await expect(page.locator(".pc-kanban-column")).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("production-board-390.png"), fullPage: true });
  await page.getByRole("button", { name: /합성 장면 변경 요청/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("요청 제목 *", { exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Conflict Center", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "로컬 변경", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "원격 변경", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "기록 저장", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("production-conflict-390.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(server.posts).toBe(0);
});
