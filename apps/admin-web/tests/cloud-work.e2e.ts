import { expect, test, type Page } from "@playwright/test";
import { blankTask, emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";

import type { Board, CloudWorkboardSave, Task } from "@toonstudio/contracts/admin-cloud-workboard";

const boardPath = "/admin/platform/quality/?view=cloud-work";

function sampleTask(id = "TEST-001", title = "검토할 샘플 변경"): Task {
  return { ...blankTask(), id, title, repo: "https://example.com/repository", changeKey: "browser-fixture-change", localBranch: "review/fixture", remoteBranch: "review/fixture", localSha: "a".repeat(40), remoteSha: "b".repeat(40), nextAction: "전체 SHA와 기존 main 내용 비교" };
}

async function fixture(page: Page, board: Board = emptyBoard()) {
  const state = { board, revision: 0, storedAt: null as string | null, role: "admin", authStatus: 200, getStatus: 200, saveStatus: 200, gets: 0, writes: [] as CloudWorkboardSave[], requests: [] as string[] };
  page.on("request", request => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) state.requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  await page.route("**/api/**", route => route.fulfill({ status: 404, json: { message: "이 브라우저 검증에는 외부 실행 API가 없습니다." } }));
  await page.route("**/api/admin/me", route => route.fulfill({ status: state.authStatus, json: state.authStatus === 200 ? { id: "cloud-admin-test", role: state.role } : { message: "관리자 권한이 만료되었습니다." } }));
  await page.route("**/api/admin/cloud-workboard", async route => {
    if (route.request().method() === "GET") {
      state.gets += 1;
      await route.fulfill({ status: state.getStatus, json: state.getStatus === 200 ? { board: state.board, revision: state.revision, storedAt: state.storedAt } : { message: "작업 저장소 연결 미확인" } });
      return;
    }
    const body = route.request().postDataJSON() as CloudWorkboardSave;
    state.writes.push(body);
    if (state.saveStatus !== 200 || body.expectedRevision !== state.revision) {
      await route.fulfill({ status: state.saveStatus !== 200 ? state.saveStatus : 409, json: { message: "저장할 수 없습니다." } });
      return;
    }
    const at = new Date().toISOString();
    state.board = { ...body.board, audit: [{ id: crypto.randomUUID(), at, taskId: body.board.tasks[0]?.id ?? "board", title: "서버 저장 이력", detail: "브라우저 검증용 서버 fixture" }, ...state.board.audit] };
    state.revision += 1;
    state.storedAt = at;
    await route.fulfill({ json: { board: state.board, revision: state.revision, storedAt: at } });
  });
  return state;
}

test("새 관리자 보드는 빈 상태로 시작하고 저장소 실패와 운영자 거부를 구분한다", async ({ page }) => {
  const server = await fixture(page);
  server.getStatus = 503;
  await page.goto(boardPath);
  await expect(page.getByRole("alert")).toContainText("마이그레이션");
  await expect(page.getByRole("button", { name: "작업 추가", exact: true })).toBeDisabled();
  await expect(page.getByText("아직 저장된 작업이 없습니다", { exact: true })).toHaveCount(0);
  server.getStatus = 200;
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "아직 저장된 작업이 없습니다" })).toBeVisible();
  expect(server.board.tasks).toHaveLength(0);
  expect(server.requests).toEqual([]);
  server.role = "operator";
  await page.evaluate(() => window.dispatchEvent(new Event("toonstudio:auth-session-changed")));
  await expect(page.getByRole("alert")).toContainText("운영자 권한으로는 열 수 없습니다");
  await expect(page.getByRole("heading", { name: "클라우드 작업 보드", exact: true })).toHaveCount(0);
  expect(server.gets).toBe(2);
});

test("필터·칸반·중복 비교·승인 보기와 네 편집 탭을 보존하며 기록 API만 호출한다", async ({ page }, testInfo) => {
  const first = sampleTask();
  const second: Task = { ...sampleTask("TEST-002", "배포 전 검토"), action: "외부 배포", stage: "승인 대기", scope: "샘플 환경", risks: { ...first.risks, deployBlock: "감지" } };
  const server = await fixture(page, { ...emptyBoard(), tasks: [first, second] });
  await page.goto(boardPath);
  await expect(page.locator(".cw-task-table tbody tr")).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath("cloud-work-desktop.png"), fullPage: true });
  await page.getByLabel("작업 검색", { exact: true }).fill("TEST-001");
  await expect(page.locator(".cw-task-table tbody tr")).toHaveCount(1);
  await page.getByLabel("작업 검색", { exact: true }).fill("");
  await page.getByRole("button", { name: "칸반 보기", exact: true }).click();
  await expect(page.locator(".cw-kanban-column")).toHaveCount(6);
  await page.getByRole("button", { name: "변경 비교", exact: true }).click();
  await expect(page.locator(".cw-comparison-card")).toHaveCount(2);
  await expect(page.getByText("같은 변경 그룹 TEST-002 · 내용 비교 필요", { exact: true })).toBeVisible();
  await page.locator(".cw-sidebar").getByRole("button", { name: /^승인 대기/u }).click();
  await expect(page.locator(".cw-approval-card")).toHaveCount(1);
  await expect(page.getByText("샘플 환경", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전체 작업", exact: true }).click();
  await page.getByRole("button", { name: first.title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: first.title, exact: true });
  await dialog.getByLabel("담당 조치 유형", { exact: true }).selectOption("코드 수정");
  await expect(dialog.getByLabel("현재 상태", { exact: false })).toHaveValue("승인 대기");
  await dialog.getByLabel("영향 범위", { exact: true }).fill("관리자 화면 검토");
  await dialog.getByRole("tab", { name: "소스·CI", exact: true }).click();
  await expect(dialog.getByLabel("원격 전체 SHA", { exact: true })).toHaveValue("b".repeat(40));
  await dialog.getByRole("tab", { name: "운영·신호", exact: true }).click();
  await dialog.getByLabel("회귀 신호", { exact: true }).selectOption("감지");
  await dialog.getByRole("tab", { name: "근거·로그", exact: true }).click();
  await dialog.getByRole("button", { name: "근거 추가", exact: true }).click();
  await dialog.getByLabel("근거 1 제목", { exact: true }).fill("브라우저 검증 근거");
  await dialog.getByLabel("근거 1 URL", { exact: true }).fill("https://example.com/evidence");
  await dialog.getByLabel("근거 1 확인 내용", { exact: true }).fill("검토 대상이 존재함을 확인한 샘플");
  await dialog.getByRole("button", { name: "로그 추가", exact: true }).click();
  await dialog.getByLabel("로그 1 이름", { exact: true }).fill("샘플 로그");
  await dialog.getByLabel("로그 1 URL", { exact: true }).fill("https://example.com/log");
  await dialog.getByRole("button", { name: "작업 기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.writes).toHaveLength(1);
  expect(server.board.tasks[0]).toMatchObject({ action: "코드 수정", stage: "승인 대기", scope: "관리자 화면 검토", risks: { regression: "감지" }, verifiedAt: "" });
  expect(server.board.snapshotAt).toBe("");
  expect(server.requests).toEqual(["POST /api/admin/cloud-workboard"]);
  await page.getByRole("button", { name: "활동 기록", exact: true }).click();
  await expect(page.getByText("서버 저장 이력", { exact: true })).toBeVisible();
});

test("Sites JSON을 검토 후 병합하고 과거 감사 이력을 서버 이력으로 옮기지 않는다", async ({ page }) => {
  const task = sampleTask();
  const server = await fixture(page, { ...emptyBoard(), tasks: [task], audit: [{ id: "server-existing", at: "2026-11-17T01:00:00.000Z", taskId: task.id, title: "기존 서버 이력", detail: "보존" }] });
  await page.goto(boardPath);
  await expect(page.locator(".cw-task-table tbody tr")).toHaveCount(1);
  const incoming: Board = { ...emptyBoard(), snapshotAt: "2026-11-17T02:00:00.000Z", tasks: [{ ...task, title: "가져온 작업" }, sampleTask("TEST-003", "가져온 새 작업")], audit: [{ id: "external-history", at: "2026-11-17T01:00:00.000Z", taskId: task.id, title: "원본의 과거 이력", detail: "서버에 승격하지 않음" }] };
  await page.getByLabel("작업 보드 JSON 파일", { exact: true }).setInputFiles({ name: "sites-workboard.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(incoming)) });
  const dialog = page.getByRole("dialog", { name: "JSON 가져오기 미리보기", exact: true });
  await expect(dialog).toContainText("새 작업 1개를 추가하고 동일 ID 1개");
  expect(server.writes).toHaveLength(0);
  await expect(dialog.getByRole("button", { name: "확인한 내용 병합 저장" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "추가·교체 범위와 최신 기록을 확인했습니다" }).check();
  await dialog.getByRole("button", { name: "확인한 내용 병합 저장" }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.board.tasks.map(item => item.title)).toEqual(["가져온 작업", "가져온 새 작업"]);
  expect(server.board.audit.map(item => item.id)).toContain("server-existing");
  expect(server.board.audit.map(item => item.id)).not.toContain("external-history");
  expect(server.board.snapshotAt).toBe(incoming.snapshotAt);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^cloud-workboard-.*\.json$/u);
  const invalid = { ...incoming, tasks: [{ ...task, action: "외부 배포", stage: "검증 완료" }] };
  await page.getByLabel("작업 보드 JSON 파일", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.getByRole("alert")).toContainText("승인 대기");
  expect(server.writes).toHaveLength(1);
});

test("409 충돌은 편집본 다운로드와 최신 기록 비교 뒤에만 재저장한다", async ({ page }) => {
  const task = sampleTask();
  const server = await fixture(page, { ...emptyBoard(), tasks: [task] });
  await page.goto(boardPath);
  await page.getByRole("button", { name: task.title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: task.title, exact: true });
  await dialog.getByLabel("다음 조치", { exact: true }).fill("보존할 미저장 편집본");
  server.revision = 1;
  server.board = { ...server.board, tasks: [{ ...task, nextAction: "다른 기기에서 저장한 내용" }] };
  await dialog.getByRole("button", { name: "작업 기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("편집본은 유지");
  await expect(dialog.getByLabel("다음 조치", { exact: true })).toHaveValue("보존할 미저장 편집본");
  await expect(dialog.getByRole("button", { name: "작업 기록 저장", exact: true })).toBeDisabled();
  const backup = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "편집본 JSON", exact: true }).click();
  expect((await backup).suggestedFilename()).toContain("-draft-");
  await dialog.getByRole("button", { name: "최신 기록 불러오기", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "작업 기록 저장", exact: true })).toBeDisabled();
  await dialog.locator("summary").filter({ hasText: "최신 서버 작업 보기" }).click();
  await expect(dialog.locator("pre")).toContainText("다른 기기에서 저장한 내용");
  await dialog.getByRole("checkbox", { name: "최신 기록과 편집본을 비교했습니다" }).check();
  await dialog.getByRole("button", { name: "작업 기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(server.writes.map(item => item.expectedRevision)).toEqual([0, 1]);
  expect(server.board.tasks[0].nextAction).toBe("보존할 미저장 편집본");
});

test("저장 중 관리자 권한이 만료되면 보드와 편집 대화상자를 제거한다", async ({ page }) => {
  const task = sampleTask();
  const server = await fixture(page, { ...emptyBoard(), tasks: [task] });
  await page.goto(boardPath);
  await page.getByRole("button", { name: task.title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: task.title, exact: true });
  await dialog.getByLabel("다음 조치", { exact: true }).fill("개인 검토 내용");
  server.saveStatus = 403;
  server.authStatus = 403;
  await dialog.getByRole("button", { name: "작업 기록 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("이전 작업 기록을 닫았습니다");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".cloud-workboard")).toHaveCount(0);
  await expect(page.getByText("개인 검토 내용", { exact: true })).toHaveCount(0);
});

test("390px에서 내용이 넘치지 않고 키보드 대화상자와 보드 전환을 지원한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const task = sampleTask();
  await fixture(page, { ...emptyBoard(), tasks: [task] });
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "클라우드 작업 보드", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const open = page.getByRole("button", { name: task.title, exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: task.title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "대화상자 닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "작업 기록 저장", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "변경 비교", exact: true }).click();
  await expect(page.locator(".cw-comparison-card")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cloud-work-390.png"), fullPage: true });
});
