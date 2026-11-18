import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { applyNestFixture, nestBoardFixture } from "./nestjs-quality-fixtures";

import type { NestBoardMutation, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

const boardPath = "/admin/platform/quality/?view=nestjs";
async function installServer(page: Page, role: "admin" | "operator" = "admin") {
  const server = { view: nestBoardFixture(role === "admin"), posts: [] as NestBoardMutation[], saveStatus: 200, identityStatus: 200 };
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: server.identityStatus, json: server.identityStatus === 200 ? { id: `nest-${role}-a`, role } : { message: "합성 관리자 권한 거부" } }));
  await page.route("**/api/admin/quality/nestjs", async (route) => {
    if (route.request().method() === "GET") { await route.fulfill({ status: 200, json: server.view }); return; }
    const mutation = route.request().postDataJSON() as NestBoardMutation;
    server.posts.push(mutation);
    if (server.saveStatus !== 200) { await route.fulfill({ status: server.saveStatus, json: { message: `합성 저장 응답 ${server.saveStatus}` } }); return; }
    server.view = applyNestFixture(server.view, mutation);
    await route.fulfill({ status: 200, json: server.view });
  });
  return server;
}
async function openScenario(page: Page): Promise<void> {
  await page.getByRole("button", { name: "검증 시나리오", exact: true }).click();
  await page.getByRole("button", { name: /실제 Socket.IO 연결·namespace·room 참가/u }).click();
}

test("기존 관리자 경로에서 전체 근거와 16개 시나리오의 실제 기록을 읽는다", async ({ page }) => {
  const server = await installServer(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "NestJS 호환성 검증", exact: true })).toBeVisible();
  await expect(page.getByText("서버 버전 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "NestJS 호환성", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/자료 확인 후 24시간/u)).toBeVisible();
  await page.getByRole("button", { name: "버전 · PR · CI", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(server.view.document.snapshot.packages.length + 1);
  await page.getByRole("button", { name: "API · 실시간 경로", exact: true }).click();
  await expect(page.getByRole("button", { name: "WsAdapter 적용 판정 기록 열기" })).toBeVisible();
  await page.getByRole("button", { name: "검증 시나리오", exact: true }).click();
  await expect(page.getByText("16개 표시", { exact: true })).toBeVisible();
  await expect(page.getByText("확인 결과: 미확인", { exact: true })).toHaveCount(server.view.document.tasks.filter((task) => task.category === "검증 시나리오" && task.result === "미확인").length);
  expect(server.posts).toHaveLength(0);
});

test("관리 상태·전후 증거 저장과 서버 재열기 및 변경 이력을 확인한다", async ({ page }) => {
  const server = await installServer(page); await page.goto(boardPath); await openScenario(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "관리 상태", exact: true }).selectOption("진행 중");
  await dialog.getByLabel("메모 · 차단 요인", { exact: true }).fill("합성 테스트에서 재연결 검증을 준비합니다.");
  await dialog.getByRole("button", { name: "전후 증거 · 링크", exact: true }).click();
  await dialog.getByLabel("변경 전 증거", { exact: true }).fill("합성 기준 요청 로그 확인");
  await dialog.getByLabel("변경 후 증거", { exact: true }).fill("미확인 · 실행 증거 없음");
  await dialog.getByRole("button", { name: "검증 기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.posts).toHaveLength(1);
  expect(server.view.document.tasks.find((task) => task.id === "nest-010")).toMatchObject({ status: "진행 중", result: "미확인", verificationDate: "", beforeEvidence: "합성 기준 요청 로그 확인" });
  await page.reload(); await openScenario(page);
  await expect(page.getByRole("dialog").getByLabel("메모 · 차단 요인", { exact: true })).toHaveValue("합성 테스트에서 재연결 검증을 준비합니다.");
  await page.getByRole("button", { name: "NestJS 대화상자 닫기" }).click();
  await page.getByRole("button", { name: "근거 · 변경 이력", exact: true }).click();
  await expect(page.getByText(/기록한 관리자: nest-admin-a/u)).toBeVisible();
});

test("operator는 읽기·내보내기만 가능하고 편집·가져오기는 열리지 않는다", async ({ page }) => {
  const server = await installServer(page, "operator"); await page.goto(boardPath); await openScenario(page);
  await expect(page.getByRole("button", { name: "검증 기록 저장", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("메모 · 차단 요인", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "NestJS 대화상자 닫기" }).click();
  await page.getByRole("button", { name: "NestJS JSON 관리" }).click();
  await expect(page.getByLabel("가져올 JSON", { exact: true })).toHaveCount(0);
  expect(server.posts).toHaveLength(0);
});

test("403 응답 뒤 저장된 기록을 숨기고 재인증을 요구한다", async ({ page }) => {
  const server = await installServer(page); await page.goto(boardPath); await openScenario(page);
  await page.getByLabel("메모 · 차단 요인", { exact: true }).fill("거부 후 노출하면 안 되는 합성 초안");
  server.saveStatus = 403; server.identityStatus = 403;
  await page.getByRole("button", { name: "검증 기록 저장", exact: true }).click();
  await expect(page.getByText(/관리자 권한을 다시 확인해야 합니다/u)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "NestJS 보드 화면" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "관리자 권한 다시 확인" }).click();
  await expect(page.getByText("합성 관리자 권한 거부", { exact: true })).toBeVisible();
});

test("저장 충돌은 초안 내보내기와 확인 후 재읽기로 복구한다", async ({ page }) => {
  const server = await installServer(page); await page.goto(boardPath); await openScenario(page);
  await page.getByLabel("메모 · 차단 요인", { exact: true }).fill("충돌해도 보존할 초안"); server.saveStatus = 409;
  await page.getByRole("button", { name: "검증 기록 저장", exact: true }).click();
  await expect(page.getByText(/다른 기록이 먼저 저장되었습니다/u)).toBeVisible();
  await expect(page.getByLabel("메모 · 차단 요인", { exact: true })).toHaveValue("충돌해도 보존할 초안");
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "초안 JSON 내보내기", exact: true }).click();
  const download = await downloadPromise; const path = await download.path();
  if (!path) throw new Error("초안 다운로드 파일이 없습니다.");
  const exported = JSON.parse(await readFile(path, "utf8")) as { draft: boolean; document: NestBoardView["document"]; history: unknown[] };
  expect(exported.draft).toBe(true); expect(exported.history).toEqual([]);
  expect(exported.document.tasks.find((task) => task.id === "nest-010")?.notes).toBe("충돌해도 보존할 초안");
  await page.getByRole("button", { name: "최신 기록 읽기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "초안을 버리고 최신 기록 읽기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(server.view.revision).toBe(0);
});

test("JSON 파일 미리보기·확인 저장과 전체 기록 내보내기를 지원한다", async ({ page }) => {
  const server = await installServer(page); await page.goto(boardPath);
  await page.getByRole("button", { name: "NestJS JSON 관리" }).click();
  const incoming = structuredClone(server.view.document); incoming.snapshot.packages[0].targetNote = "합성 peer 비교 근거 갱신";
  await page.getByLabel("JSON 파일 선택", { exact: true }).setInputFiles({ name: "nestjs-review.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ document: incoming })) });
  await page.getByRole("button", { name: "JSON 검증·미리보기" }).click();
  await expect(page.getByRole("region", { name: "가져오기 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "검토한 JSON으로 서버 기록 교체" })).toBeDisabled();
  expect(server.posts).toHaveLength(0);
  await page.getByRole("checkbox", { name: /비교 내용과 제거 항목을 검토/u }).check();
  await page.getByRole("button", { name: "검토한 JSON으로 서버 기록 교체" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "기록 내보내기", exact: true }).click();
  const download = await downloadPromise; const path = await download.path();
  if (!path) throw new Error("전체 기록 다운로드 파일이 없습니다.");
  const exported = JSON.parse(await readFile(path, "utf8")) as { document: NestBoardView["document"]; history: unknown[] };
  expect(exported.document).toEqual(incoming); expect(exported.history).toHaveLength(1);
});

test("390px에서 넘침 없이 시나리오와 키보드 편집을 제공한다", async ({ page }, testInfo) => {
  await installServer(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(boardPath);
  await expect(page.getByText("서버 버전 0", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("nestjs-overview-390.png"), fullPage: true });
  await openScenario(page);
  await expect(page.getByRole("button", { name: "NestJS 대화상자 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(page.getByRole("button", { name: "검증 기록 저장", exact: true })).toBeFocused();
  await page.getByLabel("메모 · 차단 요인", { exact: true }).fill("모바일 초안");
  await page.keyboard.press("Escape"); await expect(page.getByText("저장하지 않은 변경이 있습니다.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 편집", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("nestjs-editor-390.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "검증 기록 저장", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
