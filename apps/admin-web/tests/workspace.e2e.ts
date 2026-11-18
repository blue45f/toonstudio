import { readFile } from "node:fs/promises";

import { expect, test, type Download, type Page } from "@playwright/test";
import {
  createOperationsWorkspace, createWorkspaceRecord, parseAdminWorkspaceSave, projectWorkspaceScope, validateWorkspaceTransition,
  type AdminWorkspace, type AdminWorkspaceAccess, type AdminWorkspaceSave, type AdminWorkspaceScope,
} from "@toonstudio/contracts/admin-workspace";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";

const boardPath = "/admin/workspace/", endpoint = "/api/admin/workspaces/toonstudio";
const privateMarker = "합성 비공개 원문 fixture", reviewTitle = "합성 통합 검토 작업", fixtureTime = "2026-11-17T00:00:00Z";

function syntheticWorkspace(): AdminWorkspace {
  const state = createOperationsWorkspace();
  state.records = [
    { ...createWorkspaceRecord("synthetic-review", "coordination", "operation"), title: reviewTitle },
    { ...createWorkspaceRecord("synthetic-cloud", "cloud", "operation"), title: "합성 클라우드 이전 기록", category: "외부 배포", approvalOnly: true, approvalReason: "합성 승인 요청", status: "승인 대기" },
    { ...createWorkspaceRecord("synthetic-business", "business", "task"), title: "합성 비공개 이전 작업", notes: privateMarker },
  ];
  state.documents = [{ id: "synthetic-document", title: "합성 비공개 사업문서", purpose: "submission", working: { label: "합성 이전 작업본", url: "", content: privateMarker, updatedAt: fixtureTime }, submission: null, history: [] }];
  state.imports = [{ id: "synthetic-archive", label: "합성 이전 원문", importedAt: fixtureTime, format: "native-backup", archive: { note: privateMarker } }];
  return state;
}

/** 합성 API로 화면 경계만 검증한다. 실제 역할·SQL·revision 보장은 PostgreSQL suite가 맡는다. */
async function workspaceFixture(page: Page, options: { role?: "admin" | "operator"; privateAccess?: "owner" | "reader" | "none"; emptyBusiness?: boolean; denied?: boolean; unavailable?: boolean } = {}) {
  const source = syntheticWorkspace();
  const states: Record<AdminWorkspaceScope, AdminWorkspace> = { operations: projectWorkspaceScope(source, "operations"), business: options.emptyBusiness ? createOperationsWorkspace() : projectWorkspaceScope(source, "business") };
  const revisions: Record<AdminWorkspaceScope, number> = { operations: 1, business: options.emptyBusiness ? 0 : 1 };
  const writes: string[] = [], reads: string[] = [], saves: AdminWorkspaceSave[] = [];
  const role = options.role ?? "admin";
  let privateAccess = options.privateAccess ?? "none", conflict = false, revoked = false;
  const access = (): AdminWorkspaceAccess => ({
    operations: { canRead: true, canWrite: role === "admin", canExport: true, canManageAccess: false },
    business: { canRead: !revoked && privateAccess !== "none", canWrite: !revoked && privateAccess === "owner", canExport: !revoked && privateAccess === "owner", canManageAccess: !revoked && privateAccess === "owner" },
  });
  const view = (scope: AdminWorkspaceScope) => ({ boardId: "toonstudio", scope, state: states[scope], revision: revisions[scope], updatedAt: revisions[scope] ? fixtureTime : null, canEdit: access()[scope].canWrite, access: access() });
  page.on("request", request => { if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(new URL(request.url()).pathname); });
  await page.route("**/api/admin/me", route => route.fulfill({ status: options.denied ? 403 : 200, json: options.denied ? { message: "관리자 권한이 필요합니다." } : { id: "synthetic-owner", role } }));
  await page.route("**/api/admin/workspaces/toonstudio**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (options.unavailable) return route.fulfill({ status: 503, json: { message: "작업실 저장소를 확인해 주세요." } });
    if (request.method() === "GET") {
      reads.push(url.pathname + url.search);
      const scope = url.searchParams.get("scope") === "business" ? "business" : "operations";
      if (!access()[scope].canRead || (url.pathname.endsWith("/export") && !access()[scope].canExport)) return route.fulfill({ status: 403, json: { message: "비공개 이전 자료 권한이 없습니다." } });
      return route.fulfill({ json: view(scope) });
    }
    expect(request.headers()[TOONSPECTRUM_CSRF_HEADER]).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    expect(url.pathname).toBe(endpoint + "/save");
    const parsed = parseAdminWorkspaceSave(request.postDataJSON() as unknown);
    if (!parsed.ok) return route.fulfill({ status: 400, json: { message: parsed.errors.join(" ") } });
    const input = parsed.value, scope = input.scope ?? "operations";
    saves.push(structuredClone(input));
    if (input.claimBusinessOwnership) {
      if (role !== "admin" || scope !== "business" || revisions.business !== 0 || privateAccess !== "none") return route.fulfill({ status: 403, json: { message: "기존 비공개 보관함은 자동으로 인수할 수 없습니다." } });
      privateAccess = "owner";
    }
    if (!access()[scope].canWrite) return route.fulfill({ status: 403, json: { message: "읽기 전용입니다." } });
    if (conflict || input.expectedRevision !== revisions[scope]) return route.fulfill({ status: 409, json: { message: "다른 관리자가 먼저 저장했습니다.", currentRevision: revisions[scope] + 1 } });
    const errors = validateWorkspaceTransition(revisions[scope] ? states[scope] : null, input.state);
    if (errors.length) return route.fulfill({ status: 400, json: { message: errors.join(" ") } });
    states[scope] = projectWorkspaceScope(structuredClone(input.state), scope);
    revisions[scope] += 1;
    return route.fulfill({ json: { boardId: "toonstudio", scope, revision: revisions[scope], updatedAt: fixtureTime, replayed: false } });
  });
  return { writes, reads, saves, state: (scope: AdminWorkspaceScope = "operations") => states[scope], conflict: () => { conflict = true; }, revoke: () => { revoked = true; } };
}

async function downloadedText(download: Download): Promise<string> {
  const path = await download.path();
  if (!path) throw new Error("합성 백업 파일이 없습니다.");
  return readFile(path, "utf8");
}

test("운영 범위와 여섯 전문 보드를 먼저 열고 통합 검토만 저장·재조회한다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button")).toHaveCount(6);
  await expect(page.getByRole("region", { name: "전문 작업 보드 연결" }).getByRole("link", { name: "상세 보드 열기", exact: true })).toHaveCount(6);
  await expect(page.locator(".workspace-table tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "비공개 이전 자료 보기", exact: true })).toHaveCount(0);
  await expect(page.getByText(privateMarker, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: reviewTitle + " 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: reviewTitle, exact: true });
  await dialog.getByLabel("담당자", { exact: true }).fill("합성 검증 담당");
  await dialog.getByLabel("다음 조치", { exact: true }).fill("기존 PR 근거 대조");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.state().records.find(record => record.id === "synthetic-review")?.owner).toBe("합성 검증 담당");
  await page.reload();
  await expect(page.getByText("합성 검증 담당", { exact: true })).toBeVisible();
  expect(fixture.reads.every(path => path.endsWith("?scope=operations"))).toBe(true);
  expect(fixture.saves).toHaveLength(1);
  expect(fixture.saves[0].scope).toBe("operations");
  expect(fixture.saves[0].expectedRevision).toBe(1);
  expect(JSON.stringify(fixture.saves)).not.toContain(privateMarker);
  expect(fixture.writes).toEqual([endpoint + "/save"]);
});

test("근거 없는 사실 확인과 최종 완료를 저장하지 않는다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: reviewTitle + " 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("사실 확인 상태", { exact: true }).selectOption("확인");
  await dialog.getByLabel("진행 상태", { exact: true }).selectOption("최종 확인");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("근거");
  expect(fixture.writes).toEqual([]);
});

test("혼합 백업의 비공개 원문을 운영 저장·내보내기에서 제외하고 전문 보드 기록은 읽기만 허용한다", async ({ page }) => {
  const fixture = await workspaceFixture(page), imported = syntheticWorkspace();
  imported.records.push({ ...createWorkspaceRecord("synthetic-imported-cloud", "cloud", "operation"), title: "합성 가져온 클라우드 승인", category: "외부 배포", approvalOnly: true, approvalReason: "합성 승인 요청만 기록", status: "승인 대기", origin: { importId: "synthetic-archive", sourceId: "synthetic-cloud-board", sourceRecordId: "original-1", raw: { note: privateMarker } }, changeIdentity: { source: { provider: "sites", boardId: "synthetic-site-project", recordId: "original-1" } } });
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  await page.getByLabel("백업 JSON 파일", { exact: true }).setInputFiles({ name: "synthetic-mixed-workspace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole("region", { name: "가져오기 미리보기" })).toBeVisible();
  const before = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 기록 백업 후 가져오기", exact: true }).click();
  expect(await downloadedText(await before)).not.toContain(privateMarker);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button", { name: /클라우드 작업/u }).click();
  await expect(page.getByRole("button", { name: "기록 추가", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "전문 작업 보드 연결" }).getByRole("link", { name: "상세 보드 열기", exact: true })).toHaveAttribute("href", "/admin/platform/quality/?view=cloud-work");
  await page.getByRole("button", { name: "합성 가져온 클라우드 승인 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("진행 상태", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("진행 상태", { exact: true })).toHaveValue("승인 대기");
  await expect(dialog.getByRole("button", { name: "기록 저장", exact: true })).toHaveCount(0);
  await expect(dialog.getByText("보존한 원본 기록", { exact: false })).toHaveCount(0);
  const saved = fixture.state().records.find(record => record.id === "synthetic-imported-cloud");
  expect(saved?.approvalOnly).toBe(true);
  expect(saved?.origin).toBeNull();
  expect(saved?.changeIdentity?.source?.recordId).toBe("original-1");
  expect(fixture.state().documents).toEqual([]);
  expect(fixture.state().imports).toEqual([]);
  expect(JSON.stringify(fixture.saves)).not.toContain(privateMarker);
  expect(fixture.reads).toContain(endpoint + "/export?scope=operations");
  expect(fixture.writes.every(path => path === endpoint + "/save")).toBe(true);
});

test("허용된 계정만 비공개 이전 문서를 열고 전문 문서의 편집·고정은 복제하지 않는다", async ({ page }) => {
  const fixture = await workspaceFixture(page, { privateAccess: "reader" });
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "이전 자료 접근 권한", exact: true })).toHaveCount(0);
  expect(fixture.reads).toEqual([endpoint + "?scope=operations"]);
  await page.getByRole("button", { name: "비공개 이전 자료 보기", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "제출 준비 요약" })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON 백업", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "JSON 가져오기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "문서·버전", exact: true }).click();
  await page.getByRole("button", { name: "합성 비공개 사업문서 원문·변경 비교", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "합성 비공개 사업문서", exact: true });
  await expect(dialog.getByLabel("작업본 원문", { exact: true })).toHaveValue(privateMarker);
  await expect(dialog.getByLabel("작업본 원문", { exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "작업본 저장", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "상세창 닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "제출 후보 고정", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "가져온 원문", exact: true }).click();
  await page.getByText("가져온 원본 전체 보기", { exact: true }).click();
  await expect(page.locator(".workspace-source-details pre")).toContainText(privateMarker);
  await page.getByRole("button", { name: "운영 기록으로 돌아가기", exact: true }).click();
  await expect(page.getByText(privateMarker, { exact: false })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
});

test("비공개 내보내기는 서버 재인가가 거부되면 파일 없이 화면의 이전 자료를 비운다", async ({ page }) => {
  const fixture = await workspaceFixture(page, { privateAccess: "owner" }), downloads: Download[] = [];
  page.on("download", download => downloads.push(download));
  await page.goto(boardPath);
  await page.getByRole("button", { name: "비공개 이전 자료 보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "합성 비공개 이전 작업 상세 보기", exact: true })).toBeVisible();
  fixture.revoke();
  await page.getByRole("button", { name: "JSON 백업", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("비공개 이전 자료 권한이 없습니다");
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toHaveCount(0);
  expect(downloads).toEqual([]);
  expect(fixture.reads).toContain(endpoint + "/export?scope=business");
  expect(fixture.writes).toEqual([]);
});

test("빈 비공개 보관함 소유자는 별도 확인 버튼을 누른 뒤에만 지정한다", async ({ page }) => {
  const fixture = await workspaceFixture(page, { emptyBusiness: true });
  await page.goto(boardPath);
  await page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button", { name: /사업계획·제출/u }).click();
  await page.getByRole("button", { name: "비공개 이전 자료 보관함 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "비공개 이전 자료 보관함 만들기", exact: true });
  await expect(dialog).toContainText("기존 자료나 다른 소유자가 있으면 생성하지 않습니다");
  expect(fixture.writes).toEqual([]);
  await dialog.getByRole("button", { name: "내 계정을 소유자로 지정", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이전 자료 접근 권한", exact: true })).toBeVisible();
  expect(fixture.saves).toHaveLength(1);
  expect(fixture.saves[0]).toMatchObject({ scope: "business", claimBusinessOwnership: true, expectedRevision: 0 });
  expect(fixture.state("business").records).toEqual([]);
});

test("revision 충돌에는 통합 검토 초안을 유지하고 백업하며 추가 쓰기를 잠근다", async ({ page }) => {
  const fixture = await workspaceFixture(page);
  fixture.conflict();
  await page.goto(boardPath);
  await page.getByRole("button", { name: reviewTitle + " 상세 보기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("검토 메모", { exact: true }).fill("충돌 후 보존할 합성 초안");
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("현재 편집은 유지");
  await dialog.getByRole("button", { name: "상세창 닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "JSON 가져오기", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "현재 편집 백업", exact: true }).click();
  expect(await downloadedText(await download)).toContain("충돌 후 보존할 합성 초안");
  expect(fixture.state().records[0].notes).toBe("");
  expect(fixture.writes).toHaveLength(1);
});

test("운영자는 조회만 가능하고 인증이 거부된 사용자는 데이터를 열지 않는다", async ({ page }) => {
  const fixture = await workspaceFixture(page, { role: "operator" });
  await page.goto(boardPath);
  await expect(page.getByText("읽기 전용", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "JSON 가져오기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "기록 추가", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button", { name: /사업계획·제출/u }).click();
  await expect(page.getByRole("button", { name: "비공개 이전 자료 보관함 만들기", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "업무 모듈" }).getByRole("button", { name: /통합 검토/u }).click();
  await page.getByRole("button", { name: reviewTitle + " 상세 보기", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("담당자", { exact: true })).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("button", { name: "기록 저장", exact: true })).toHaveCount(0);
  expect(fixture.writes).toEqual([]);
  await page.unrouteAll();
  const denied = await workspaceFixture(page, { denied: true });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 필요");
  await expect(page.getByRole("heading", { name: "사업계획·운영 작업실", exact: true })).toHaveCount(0);
  expect(denied.reads).toEqual([]);
});

test("저장소가 준비되지 않으면 빈 보드를 성공으로 표시하지 않는다", async ({ page }) => {
  await workspaceFixture(page, { unavailable: true });
  await page.goto(boardPath);
  await expect(page.getByRole("alert")).toContainText("작업실 저장소를 확인");
  await expect(page.locator(".workspace-table")).toHaveCount(0);
});

test("모바일·데스크톱에서 여섯 보드가 넘치지 않고 키보드 상세창 초점을 복원한다", async ({ page }, testInfo) => {
  await workspaceFixture(page, { privateAccess: "owner" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto(boardPath);
  const open = page.getByRole("button", { name: reviewTitle + " 상세 보기", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "상세창 닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog").getByRole("button", { name: "기록 저장", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.getByRole("region", { name: "전문 작업 보드 연결" }).getByRole("link", { name: "상세 보드 열기", exact: true })).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("workspace-desktop.png"), fullPage: true });
});
