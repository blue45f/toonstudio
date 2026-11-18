import { expect, test, type Page } from "@playwright/test";

import { createAiOperationsStarter } from "../src/domains/operations/ai-operations/ai-operations-starter";

import type { AiOperationsSave, AiOperationsView, BoardSnapshot } from "@toonstudio/contracts/ai-operations";

const boardPath = "/admin/platform/ai-operations/";
const modelId = "@cf/google/gemma-4-26b-a4b-it";

/** 화면 테스트용 서버 응답이며 운영 API·외부 제공자는 호출하지 않는다. */
async function boardFixture(page: Page, options: { empty?: boolean; operator?: boolean; unavailable?: boolean; denied?: boolean } = {}) {
  let state: AiOperationsView = { snapshot: options.empty ? null : createAiOperationsStarter(), revision: options.empty ? 0 : 1, updatedAt: options.empty ? null : new Date(Date.now() - 60_000).toISOString(), canEdit: !options.operator, audit: [] };
  const writes: AiOperationsSave[] = [];
  const mutations: string[] = [];
  let denied = options.denied ?? false;
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) mutations.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: denied ? 403 : 200, json: denied ? { message: "관리자 권한이 필요합니다." } : { id: "ai-operations-browser-fixture", role: options.operator ? "operator" : "admin", permissions: { scope: "full" } } }));
  await page.route("**/api/admin/ai-operations", async (route) => {
    if (options.unavailable) { await route.fulfill({ status: 503, json: { message: "운영 기록 저장소를 사용할 수 없습니다." } }); return; }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as AiOperationsSave;
      writes.push(body);
      if (body.expectedRevision !== state.revision) { await route.fulfill({ status: 409, json: { message: "다른 관리자가 먼저 저장했습니다." } }); return; }
      const at = new Date().toISOString();
      state = { ...state, snapshot: body.snapshot, revision: state.revision + 1, updatedAt: at, audit: [{ revision: state.revision + 1, actorUserId: "ai-operations-browser-fixture", at, beforeDigest: "a".repeat(64), afterDigest: "b".repeat(64) }, ...state.audit] };
    }
    await route.fulfill({ json: state });
  });
  return { writes, mutations, saved: () => state, setDenied: () => { denied = true; }, advance: () => { state = { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString() }; } };
}

async function openModel(page: Page) {
  await page.getByRole("button", { name: "Cloudflare 모델", exact: true }).click();
  await page.getByLabel("기록 검색", { exact: true }).fill(modelId);
  await page.getByRole("button", { name: modelId, exact: true }).click();
  return page.getByRole("dialog", { name: "모델 상세 기록", exact: true });
}

test("빈 저장소는 명시적으로 시작하고 공개 근거·여섯 상태와 미확인 관측을 표시한다", async ({ page }, testInfo) => {
  const fixture = await boardFixture(page, { empty: true });
  await page.goto(boardPath);
  await page.getByRole("button", { name: "공개 기준으로 시작", exact: true }).click();
  await expect(page.getByText("아직 서버에 저장하지 않은 변경 있음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cloudflare 모델", exact: true }).click();
  await expect(page.locator(".ai-ops-table-wrap tbody tr")).toHaveCount(28);
  await page.getByLabel("기록 검색", { exact: true }).fill("@cf/black-forest-labs/flux-1-schnell");
  await expect(page.locator(".ai-ops-table-wrap tbody tr")).toHaveCount(1);
  await expect(page.locator(".ai-ops-table-wrap tbody")).toContainText("미확인");
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await page.getByRole("button", { name: "Onpod 알림", exact: true }).click();
  await expect(page.locator(".ai-ops-table-wrap tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "원인 가설", exact: true }).click();
  await expect(page.locator(".ai-ops-table-wrap tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "작업 보드", exact: true }).click();
  await expect(page.locator(".ai-ops-lane")).toHaveCount(6);
  await page.getByRole("button", { name: "운영 배포 · 승인 기록", exact: true }).click();
  const approval = page.getByRole("dialog");
  await expect(approval.getByLabel("진행 상태", { exact: true })).toHaveValue("승인 대기");
  await expect(approval.getByLabel("진행 상태", { exact: true }).locator("option").filter({ hasText: /^검증 완료$/u })).toBeDisabled();
  await expect(approval.getByLabel("운영 변경 승인 대기로 관리", { exact: true })).toBeDisabled();
  await approval.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "통합 현황", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("ai-operations-overview.png"), fullPage: true });
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.mutations).toEqual([]);
});

test("관측 기록은 명시적 서버 저장 뒤 다시 열어도 남고 완료 근거 없는 전환은 차단한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  const dialog = await openModel(page);
  await dialog.getByLabel("진행 상태", { exact: true }).selectOption("검증 완료");
  await dialog.getByRole("button", { name: "변경 적용", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(fixture.writes).toHaveLength(0);
  await dialog.getByLabel("진행 상태", { exact: true }).selectOption("분석 중");
  await dialog.getByLabel("메모", { exact: true }).fill("브라우저 fixture: 운영 호출 빈도는 아직 미확인");
  await dialog.getByRole("button", { name: "변경 적용", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByText("저장본과 일치", { exact: true })).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]?.expectedRevision).toBe(1);
  expect(fixture.saved().snapshot?.meta.snapshotAt).toBe(createAiOperationsStarter().meta.snapshotAt);
  await page.reload();
  const reloaded = await openModel(page);
  await expect(reloaded.getByLabel("메모", { exact: true })).toHaveValue("브라우저 fixture: 운영 호출 빈도는 아직 미확인");
  await expect(reloaded.getByLabel("진행 상태", { exact: true })).toHaveValue("분석 중");
  expect(fixture.mutations).toEqual(["/api/admin/ai-operations"]);
});

test("저장 충돌은 초안을 보존하고 JSON 백업 후 명시적 폐기·재조회로 복구한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  const dialog = await openModel(page);
  await dialog.getByLabel("메모", { exact: true }).fill("충돌 전 미저장 기록");
  await dialog.getByRole("button", { name: "변경 적용", exact: true }).click();
  fixture.advance();
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다른 관리자가 먼저 저장");
  await expect(page.getByRole("button", { name: "서버에 저장", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("toonstudio-ai-operations.json");
  await page.getByRole("button", { name: "저장 기록 새로 읽기", exact: true }).click();
  await page.getByRole("dialog", { name: "최신 저장본 다시 읽기", exact: true }).getByRole("button", { name: "변경을 버리고 다시 읽기", exact: true }).click();
  await expect(page.getByText("저장본과 일치", { exact: true })).toBeVisible();
  const reloaded = await openModel(page);
  await expect(reloaded.getByLabel("메모", { exact: true })).not.toHaveValue("충돌 전 미저장 기록");
  expect(fixture.writes).toHaveLength(1);
});

test("Sites 형식 JSON은 검토·대체 확인을 거치고 기존 승인 항목과 원래 관측 시각을 보존한다", async ({ page }) => {
  const fixture = await boardFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 가져오기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "운영 보드 JSON 가져오기", exact: true });
  const imported: BoardSnapshot = createAiOperationsStarter();
  imported.items = [imported.items[0]!];
  imported.items[0] = { ...imported.items[0]!, notes: "Sites 형식 가져오기 fixture" };
  const legacy = { ...imported, revision: 999, activity: [{ id: "legacy-1", itemId: imported.items[0]!.id, title: "외부 가져오기 이력 fixture", at: imported.meta.snapshotAt }], exportedAt: new Date().toISOString() };
  await dialog.getByLabel("또는 JSON 붙여넣기", { exact: true }).fill(JSON.stringify(legacy));
  await dialog.getByRole("button", { name: "가져오기 내용 검토", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "가져오기 검토", exact: true })).toContainText("5");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "검토한 기록을 화면에 적용", exact: true }).click();
  expect(fixture.writes).toHaveLength(0);
  await page.getByRole("button", { name: "서버에 저장", exact: true }).click();
  await expect(page.getByText("저장본과 일치", { exact: true })).toBeVisible();
  expect(fixture.saved().revision).toBe(2);
  expect(fixture.saved().snapshot?.items.filter((item) => item.approvalRequired)).toHaveLength(5);
  expect(fixture.saved().snapshot?.meta.snapshotAt).toBe(imported.meta.snapshotAt);
  expect(fixture.saved().snapshot?.importedActivity).toHaveLength(1);
});

test("운영자는 열람만 하며 권한 회수·저장소 장애에는 비공개 기록과 빈 보드 생성을 차단한다", async ({ page }) => {
  const fixture = await boardFixture(page, { operator: true });
  await page.goto(boardPath);
  await expect(page.getByText("운영자 열람 전용", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "서버에 저장", exact: true })).toHaveCount(0);
  const dialog = await openModel(page);
  await expect(dialog.getByLabel("메모", { exact: true })).toBeDisabled();
  fixture.setDenied();
  await page.evaluate(() => window.dispatchEvent(new Event("toonstudio:auth-session-changed")));
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 필요합니다");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "AI·무료 플랜 운영", exact: true })).toHaveCount(0);
  await page.unroute("**/api/admin/me");
  await page.unroute("**/api/admin/ai-operations");
  await boardFixture(page, { unavailable: true });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("운영 기록 저장소를 사용할 수 없습니다");
  await expect(page.getByRole("button", { name: "공개 기준으로 시작", exact: true })).toHaveCount(0);
  expect(fixture.mutations).toEqual([]);
});
