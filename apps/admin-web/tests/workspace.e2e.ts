import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";
import {
  createAdminWorkspace, createWorkspaceRecord, parseAdminWorkspaceSave, validateWorkspaceTransition,
  type AdminWorkspace,
} from "@toonstudio/contracts/admin-workspace";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

const boardPath = "/admin/workspace/";

/** 합성 API 응답으로 UI 계약을 검증한다. 실제 SQL·역할 검증은 PostgreSQL suite가 맡는다. */
async function workspaceFixture(page: Page, options: { role?: "admin" | "operator"; denied?: boolean; unavailable?: boolean } = {}) {
  let state: AdminWorkspace | null = null;
  let revision = 0;
  let conflict = false;
  const writes: string[] = [];
  const role = options.role ?? "admin";
  page.on("request", request => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/admin/me", route => route.fulfill({
    status: options.denied ? 403 : 200,
    json: options.denied ? { message: "관리자 권한이 필요합니다." } : { id: "workspace-fixture-admin", role },
  }));
  await page.route("**/api/admin/workspaces/toonstudio**", async route => {
    if (options.unavailable) return route.fulfill({ status: 503, json: { message: "작업실 저장소를 확인해 주세요." } });
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: {
      boardId: "toonstudio", state, revision, updatedAt: revision ? new Date().toISOString() : null, canEdit: role === "admin",
    } });
    expect(request.headers()[TOONSPECTRUM_CSRF_HEADER]).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    expect(new URL(request.url()).pathname).toBe("/api/admin/workspaces/toonstudio/save");
    if (role !== "admin") return route.fulfill({ status: 403, json: { message: "읽기 전용입니다." } });
    const input: unknown = request.postDataJSON();
    const parsed = parseAdminWorkspaceSave(input);
    if (!parsed.ok) return route.fulfill({ status: 400, json: { message: parsed.errors.join(" ") } });
    if (conflict || parsed.value.expectedRevision !== revision) return route.fulfill({ status: 409, json: { message: "다른 관리자가 먼저 저장했습니다.", currentRevision: revision + 1 } });
    const errors = validateWorkspaceTransition(state, parsed.value.state);
    if (errors.length) return route.fulfill({ status: 400, json: { message: errors.join(" ") } });
    state = structuredClone(parsed.value.state);
    revision += 1;
    return route.fulfill({ json: { boardId: "toonstudio", revision, updatedAt: new Date().toISOString(), replayed: false } });
  });
  return { writes, state: () => state, conflict: () => { conflict = true; } };
}

test("5개 모듈·11개 작업과 미확인 주장을 열고 공유 기록을 저장·재조회한다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button")).toHaveCount(5);
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(11);
  await expect(page.getByRole("complementary", { name: "제출 준비 요약" })).toBeVisible();
  await page.getByRole("button", { name: "문제 인식 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "문제 인식", exact: true });
  await dialog.getByLabel("담당자", { exact: true }).fill("검증 담당 fixture");
  await dialog.getByLabel("다음 조치", { exact: true }).fill("원문 출처 대조");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.state()?.records.find(record => record.id === "task-01")?.owner).toBe("검증 담당 fixture");
  await page.reload();
  await expect(page.getByText("검증 담당 fixture", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "주장·근거", exact: true }).click();
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(9);
  await expect(page.getByText("수치 미확인", { exact: true })).toHaveCount(4);
  await expect(page.getByText("비교 결과 미확인", { exact: true })).toHaveCount(1);
  expect(fixture.writes).toEqual(["/api/admin/workspaces/toonstudio/save"]);
});

test("근거 없는 사실 확인과 최종 완료를 저장하지 않는다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "주장·근거", exact: true }).click();
  await page.getByRole("button", { name: "시장 규모·지표 교차검증 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("사실 확인 상태", { exact: true }).selectOption("확인");
  await dialog.getByLabel("진행 상태", { exact: true }).selectOption("최종 확인");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("원문");
  expect(fixture.writes).toEqual([]);
});

test("JSON 미리보기로 운영 기록과 승인 제한을 가져온다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  const imported = createAdminWorkspace();
  imported.records.push({ ...createWorkspaceRecord("cloud-fixture-1", "cloud", "operation"), title: "클라우드 배포 검토 fixture", category: "외부 배포", approvalOnly: true, approvalReason: "승인 요청만 기록", status: "승인 대기" });
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  await page.getByLabel("백업 JSON 파일", { exact: true }).setInputFiles({ name: "synthetic-workspace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole("region", { name: "가져오기 미리보기" })).toBeVisible();
  const before = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 기록 백업 후 가져오기", exact: true }).click();
  await before;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button", { name: /클라우드 작업/u }).click();
  await page.getByRole("button", { name: "클라우드 배포 검토 fixture 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("진행 상태", { exact: true }).locator("option")).toHaveCount(1);
  await expect(dialog.getByLabel("진행 상태", { exact: true })).toHaveValue("승인 대기");
  expect(fixture.state()?.records.find(record => record.id === "cloud-fixture-1")?.approvalOnly).toBe(true);
  expect(fixture.writes.every(path => path === "/api/admin/workspaces/toonstudio/save")).toBe(true);
});

test("작업본 편집·제출 후보 고정·변경 비교가 원래 후보를 보존한다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "문서·버전", exact: true }).click();
  await page.getByRole("button", { name: "사업계획서 원문·변경 비교", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "사업계획서", exact: true });
  await dialog.getByLabel("작업본 원문", { exact: true }).fill("문제 정의 초안\n근거 미확인");
  await dialog.getByRole("button", { name: "작업본 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const document = page.locator("article").filter({ has: page.getByRole("heading", { name: "사업계획서", exact: true }) });
  await document.getByRole("button", { name: "제출 후보 고정", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "제출 후보로 고정", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "사업계획서 원문·변경 비교", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "사업계획서", exact: true });
  await dialog.getByLabel("작업본 원문", { exact: true }).fill("문제 정의 보완\n근거 미확인");
  await expect(dialog.locator(".workspace-diff-line--removed")).toContainText("문제 정의 초안");
  await expect(dialog.locator(".workspace-diff-line--added")).toContainText("문제 정의 보완");
  await dialog.getByRole("button", { name: "작업본 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.state()?.documents[0]?.submission?.content).toBe("문제 정의 초안\n근거 미확인");
  expect(fixture.state()?.documents[0]?.working.content).toBe("문제 정의 보완\n근거 미확인");
  await expect(document).toContainText("고정 후 변경");
});

test("revision 충돌에는 초안을 유지하고 백업하며 추가 쓰기를 잠근다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  fixture.conflict();
  await page.goto(boardPath);
  await page.getByRole("button", { name: "문제 인식 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("검토 메모", { exact: true }).fill("충돌해도 남아야 하는 초안 fixture");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("현재 편집은 유지");
  await dialog.getByRole("button", { name: "상세창 닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "JSON 가져오기", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 편집 백업", exact: true }).click();
  const file = await (await download).path();
  if (!file) throw new Error("충돌 초안 백업 파일이 없습니다.");
  expect(await readFile(file, "utf8")).toContain("충돌해도 남아야 하는 초안 fixture");
  expect(fixture.state()).toBeNull();
  expect(fixture.writes).toHaveLength(1);
});

test("운영자는 조회만 가능하고 거부된 사용자는 데이터를 열지 않는다", async ({ page }) => {
  const fixture = await workspaceFixture(page, { role: "operator" });
  await page.goto(boardPath);
  await expect(page.getByText("읽기 전용", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON 가져오기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "기록 추가", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "문제 인식 상세 보기", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("담당자", { exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "기록 저장", exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
  await page.unrouteAll();
  await workspaceFixture(page, { denied: true });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 필요");
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toHaveCount(0);
});

test("저장소가 준비되지 않으면 빈 보드를 성공으로 표시하지 않는다", async ({ page }) => {
  await workspaceFixture(page, { unavailable: true });
  await page.goto(boardPath);
  await expect(page.getByRole("alert")).toContainText("작업실 저장소를 확인");
  await expect(page.locator(".workspace-table")).toHaveCount(0);
});

test("좁은 화면과 키보드에서도 상세창에 머물고 원래 초점으로 돌아온다", async ({ page }, testInfo) => {
  await workspaceFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(boardPath);
  await expect(page.getByRole("columnheader", { name: "상세", exact: true })).toHaveCount(1);
  const tableWidth = await page.locator(".workspace-table-wrap").evaluate(element => ({ content: element.scrollWidth, visible: element.clientWidth }));
  expect(tableWidth.content).toBeGreaterThan(tableWidth.visible);
  const open = page.getByRole("button", { name: "문제 인식 상세 보기", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "상세창 닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog").getByRole("button", { name: "기록 저장", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  const pageWidth = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport + 1);
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
});
