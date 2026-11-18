import { expect, test, type Page } from "@playwright/test";
import { createEmptyBusinessPlanState } from "@toonstudio/contracts/business-plan";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

import type { BusinessPlanRecord, SaveBusinessPlanRequest } from "@toonstudio/contracts/business-plan";

const boardPath = "/admin/growth/business-plan/";

/** HTTP fixture로 화면을 검증한다. 실제 트랜잭션·권한 경계는 별도 PostgreSQL suite가 담당한다. */
async function boardFixture(page: Page, initial: BusinessPlanRecord = { board: null, revision: 0, updatedAt: null }) {
  let record = structuredClone(initial);
  let role = "admin";
  let nextSaveStatus = 200;
  const writes: string[] = [];
  const saves: SaveBusinessPlanRequest[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { id: "business-plan-admin", role, permissions: { scope: "full" } } }));
  await page.route("**/api/admin/business-plan", (route) => route.fulfill({ json: record }));
  await page.route("**/api/admin/business-plan/save", async (route) => {
    const input = route.request().postDataJSON() as SaveBusinessPlanRequest;
    saves.push(input);
    expect(route.request().headers()[TOONSPECTRUM_CSRF_HEADER]).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    const status = nextSaveStatus;
    nextSaveStatus = 200;
    if (status !== 200) return route.fulfill({ status, json: { message: status === 409 ? "수정 충돌" : "관리자 권한 만료" } });
    record = { board: input.board, revision: input.expectedRevision + 1, updatedAt: new Date().toISOString() };
    return route.fulfill({ json: record });
  });
  return { writes, saves, record: () => record, role: (value: string) => { role = value; }, failSave: (status: number) => { nextSaveStatus = status; }, replace: (value: BusinessPlanRecord) => { record = value; } };
}

async function editTask(page: Page, note: string) {
  await page.getByRole("button", { name: "문제 인식 작업 편집", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("작업 메모", { exact: true }).fill(note);
  await dialog.getByRole("button", { name: "보드에 반영", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("11개 작업·6상태·16개 미확인 주장과 4개 고정 승인 대기를 서버에 저장한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "사업계획서 고도화·제출 준비", exact: true })).toBeVisible();
  await expect(page.locator(".bp-task-row")).toHaveCount(11);
  await expect(page.locator(".bp-table tbody tr")).toHaveCount(16);
  await expect(page.locator(".bp-table tbody td:nth-child(2) .bp-badge").filter({ hasText: /^미확인$/u })).toHaveCount(16);
  await expect(page.locator(".bp-approval-row .bp-badge").filter({ hasText: /^승인 대기$/u })).toHaveCount(4);
  await page.getByRole("button", { name: "칸반", exact: true }).click();
  await expect(page.locator(".bp-kanban-column")).toHaveCount(6);
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByText("서버 저장본과 동일", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("서버 버전 1", { exact: false })).toBeVisible();
  expect(fixture.record().board?.approvals.every((item) => item.status === "승인 대기")).toBe(true);
  expect(fixture.writes).toEqual(["/api/admin/business-plan/save"]);
});

test("작업 상태·담당 기록과 제출용 고정 사본을 보존하며 수정한 작업용과 구분한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "문제 인식 작업 편집", exact: true }).click();
  const task = page.getByRole("dialog");
  await task.getByLabel("작업 상태", { exact: true }).selectOption("근거 확인 중");
  await task.getByLabel("담당자", { exact: true }).fill("검토 담당");
  await task.getByLabel("담당 작업", { exact: true }).fill("고객 인터뷰 원문 대조");
  await task.getByLabel("다음 조치", { exact: true }).fill("인터뷰 출처 연결");
  await task.getByRole("button", { name: "보드에 반영", exact: true }).click();
  await page.getByRole("button", { name: "작업용 편집", exact: true }).click();
  const document = page.getByRole("dialog");
  await document.getByLabel("변경 전 원문", { exact: true }).fill("이전 문장");
  await document.getByLabel("작업용 원문", { exact: true }).fill("  제출 후보 문장\n");
  await document.getByRole("button", { name: "보드에 반영", exact: true }).click();
  await page.getByRole("button", { name: "제출용 사본 만들기", exact: true }).click();
  await page.getByLabel("제출용 버전 이름", { exact: true }).fill("제출 후보 1");
  await page.getByRole("button", { name: "제출용 사본 반영", exact: true }).click();
  await page.getByRole("button", { name: "작업용 편집", exact: true }).click();
  await page.getByLabel("작업용 원문", { exact: true }).fill("  추가 검토 문장\n");
  await page.getByRole("dialog").getByRole("button", { name: "보드에 반영", exact: true }).click();
  await expect(page.getByText("제출용에 미반영 변경 있음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByText("서버 저장본과 동일", { exact: true })).toBeVisible();
  expect(fixture.record().board?.tasks[0]).toMatchObject({ status: "근거 확인 중", owner: "검토 담당", assignment: "고객 인터뷰 원문 대조" });
  expect(fixture.record().board?.documents[0]).toMatchObject({ workingText: "  추가 검토 문장\n", submission: { text: "  제출 후보 문장\n" } });
  await page.reload();
  await expect(page.getByText("제출용에 미반영 변경 있음", { exact: true })).toBeVisible();
});

test("수정 충돌 시 덮어쓰기를 막고 백업·명시적 최신본 읽기로 복구한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  await editTask(page, "보존할 미저장 변경");
  fixture.failSave(409);
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("덮어쓰기를 중단");
  await expect(page.getByRole("button", { name: "서버에 저장", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "JSON 관리", exact: true }).click();
  await expect(page.getByLabel("사업계획서 보드 JSON", { exact: true })).toHaveValue(/보존할 미저장 변경/u);
  await page.keyboard.press("Escape");
  const latest = createEmptyBusinessPlanState();
  latest.tasks[0].notes = "다른 관리자의 최신 변경";
  fixture.replace({ board: latest, revision: 2, updatedAt: new Date().toISOString() });
  await page.getByRole("button", { name: "서버 기록 다시 읽기", exact: true }).click();
  await page.getByRole("button", { name: "미저장 변경을 버리고 최신본 읽기", exact: true }).click();
  await expect(page.getByText("서버 버전 2", { exact: false })).toBeVisible();
  await expect(page.getByText("서버 저장본과 동일", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "문제 인식 작업 편집", exact: true }).click();
  await expect(page.getByLabel("작업 메모", { exact: true })).toHaveValue("다른 관리자의 최신 변경");
  expect(fixture.saves).toHaveLength(1);
});

test("operator를 차단하고 서버 권한 거부 시 초안과 대화상자를 즉시 숨긴다", async ({ page }) => {
  const fixture = await boardFixture(page);
  fixture.role("operator");
  await page.goto(boardPath);
  await expect(page.getByRole("alert")).toContainText("서비스 관리자만");
  await expect(page.locator(".business-plan")).toHaveCount(0);
  fixture.role("admin");
  await page.getByRole("button", { name: "관리자 권한 다시 확인", exact: true }).click();
  await editTask(page, "권한 만료 시 숨길 내용");
  fixture.failSave(403);
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("접근 권한");
  await expect(page.locator(".business-plan")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".business-plan")).toHaveCount(0);
});

test("JSON 형식 검증과 교체 전 백업을 거치며 미확인 수치를 확정하지 않는다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 관리", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const exported = createEmptyBusinessPlanState();
  const invalid = { ...exported, approvals: exported.approvals.map((item) => ({ ...item, status: "실행 완료" })) };
  await dialog.getByLabel("사업계획서 보드 JSON", { exact: true }).fill(JSON.stringify(invalid));
  await dialog.getByRole("button", { name: "가져오기 검토", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("승인 대기");
  exported.claims[4].value = "987654";
  exported.tasks[0].notes = "이전 보드에서 가져온 기록";
  await dialog.getByLabel("JSON 파일 선택", { exact: true }).setInputFiles({ name: "board.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(dialog.getByText("가져오기 검토 완료", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "현재 기록 백업 후 가져오기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^business-plan-before-import-/u);
  await expect(page.locator(".bp-table")).not.toContainText("987654");
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByText("서버 저장본과 동일", { exact: true })).toBeVisible();
  expect(fixture.record().board?.tasks[0].notes).toBe("이전 보드에서 가져온 기록");
});

test("390px 다크 화면과 데스크톱에서 넘침 없이 키보드 대화상자·초안 보존을 지원한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await boardFixture(page);
  await page.goto(boardPath);
  const open = page.getByRole("button", { name: "문제 인식 작업 편집", exact: true });
  await expect(open).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await open.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "대화상자 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "보드에 반영", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(open).toBeFocused();
  await editTask(page, "포커스 재확인 뒤에도 보존");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "문제 인식 작업 편집", exact: true }).click();
  await expect(page.getByLabel("작업 메모", { exact: true })).toHaveValue("포커스 재확인 뒤에도 보존");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("business-plan-390-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("business-plan-1440.png"), fullPage: true });
});
