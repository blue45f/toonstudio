import { expect, test, type Page } from "@playwright/test";

import { createQualityBoard } from "../src/domains/operations/ci-quality/ci-quality-model";
import { getQualityStorageKey } from "../src/domains/operations/ci-quality/ci-quality-storage";

const boardPath = "/admin/platform/quality/";

async function adminFixture(page: Page, options: { id?: string; role?: string; status?: number } = {}) {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
  });
  await page.route("**/api/admin/me", (route) => route.fulfill({
    status: options.status ?? 200,
    json: options.status ? { message: "관리자 권한이 필요합니다." } : { id: options.id ?? "quality-admin-a", role: options.role ?? "admin", permissions: { scope: "full" } },
  }));
  return { writes };
}

async function currentLocalMinute(page: Page) {
  return page.evaluate(() => {
    const date = new Date(Date.now() - 60_000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
}

test("관리자 확인 뒤 12개 미확인 검사를 표시하며 초기 통계와 외부 실행을 추정하지 않는다", async ({ page }) => {
  const fixture = await adminFixture(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "CI·QA 검증", exact: true })).toBeVisible();
  await expect(page.locator(".ci-quality-table tbody tr")).toHaveCount(12);
  await expect(page.locator(".ci-quality-table .ci-quality-status--unknown")).toHaveCount(12);
  await expect(page.getByText("자동 CI 연결 없음", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "근거 기록", exact: true }).click();
  await expect(page.locator(".ci-quality-metric strong").filter({ hasText: /^미확인$/u })).toHaveCount(4);
  expect(fixture.writes).toEqual([]);
});

test("실패 분석·CI JSON·통계를 기록하고 다시 열어도 보존한다", async ({ page }) => {
  const fixture = await adminFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "Vitest 결과 기록", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Vitest 결과 기록", exact: true });
  await dialog.getByLabel("진행 상태", { exact: true }).selectOption("failed");
  await dialog.getByLabel("근거 범위", { exact: true }).fill("product shard · 브라우저 검증 fixture");
  await dialog.getByLabel("근거 커밋 SHA (40자리)").fill(createQualityBoard().commit.sha);
  await dialog.getByLabel("실행 시각 (이 기기의 시간대)").fill(await currentLocalMinute(page));
  await dialog.getByLabel("로그 URL", { exact: true }).fill("https://github.com/blue45f/toonstudio/actions/runs/1");
  await dialog.getByLabel("통과", { exact: true }).fill("9");
  await dialog.getByLabel("실패", { exact: true }).fill("1");
  await dialog.getByLabel("건너뜀", { exact: true }).fill("0");
  await dialog.getByLabel("전체", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "실패 분석", exact: true }).click();
  await dialog.getByLabel("실패 분류", { exact: true }).selectOption("regression");
  await dialog.getByLabel("관련 변경", { exact: true }).fill("예산 기준 변경");
  await dialog.getByLabel("이전 정상 상태 · SHA · 실행 시각", { exact: true }).fill("이전 정상 fixture SHA와 실행");
  await dialog.getByLabel("이전 정상 상태와의 차이", { exact: true }).fill("예상값과 실제값 차이");
  await dialog.getByLabel("원인 · 근거 (추정인 경우 표시)").fill("추정: 오래된 기대값");
  await dialog.getByLabel("권장 조치", { exact: true }).fill("수정안 검토 요청");
  await dialog.getByRole("button", { name: "CI 요약 JSON", exact: true }).click();
  await dialog.getByLabel("CI 결과 요약 JSON", { exact: true }).fill('{"workflow":"CI","conclusion":"failure","scope":"product shard"}');
  await dialog.getByRole("button", { name: "기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "실패 분석 1", exact: true }).click();
  await expect(page.getByText("예산 기준 변경", { exact: true })).toBeVisible();
  await expect(page.getByText("추정: 오래된 기대값", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "실행 로그 열기 ↗" })).toHaveAttribute("href", /github\.com/u);
  await page.getByRole("button", { name: "근거 기록", exact: true }).click();
  await expect(page.getByText("통계 입력된 검사 1개", { exact: false })).toBeVisible();
  expect(fixture.writes).toEqual([]);
});

test("완료와 stale SHA를 구분하고 필터·칸반·게이트 추가를 지원한다", async ({ page }) => {
  await adminFixture(page);
  const seed = createQualityBoard();
  seed.checks[0] = { ...seed.checks[0], status: "done", sha: "a".repeat(40), scope: "부분 실행", executedAt: new Date(Date.now() - 60_000).toISOString(), logUrl: "https://example.com/log" };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: getQualityStorageKey("quality-admin-a"), value: JSON.stringify(seed) });
  await page.goto(boardPath);
  await expect(page.getByText("stale · SHA 불일치", { exact: true })).toBeVisible();
  await expect(page.getByText("유효한 완료 근거 0개", { exact: true })).toBeVisible();
  await page.getByLabel("검사 검색", { exact: true }).fill("Vitest");
  await expect(page.locator(".ci-quality-table tbody tr")).toHaveCount(1);
  await page.getByLabel("검사 검색", { exact: true }).fill("");
  await page.getByRole("button", { name: "보드", exact: true }).click();
  await expect(page.getByRole("region", { name: "완료 검사", exact: true })).toBeVisible();
  await expect(page.locator(".ci-quality-kanban-column")).toHaveCount(5);
  await page.getByRole("button", { name: "전용 게이트 추가", exact: true }).click();
  const gate = page.getByRole("dialog", { name: "전용 게이트 추가", exact: true });
  await gate.getByLabel("게이트 이름", { exact: true }).fill("추가 품질 검증");
  await gate.getByLabel("참조 명령", { exact: true }).fill("참조 전용 명령");
  await gate.getByRole("button", { name: "게이트 추가", exact: true }).click();
  await expect(page.getByRole("button", { name: "추가 품질 검증 결과 기록" })).toBeVisible();
});

test("Testifly 참고 결과와 승인 메모를 저장해도 외부 작업·정본 CI 성공으로 전환하지 않는다", async ({ page }) => {
  const fixture = await adminFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "외부 QA 카탈로그", exact: true }).click();
  await page.getByRole("button", { name: "참고 결과 기록", exact: true }).click();
  const qa = page.getByRole("dialog", { name: "외부 QA 참고 결과 기록", exact: true });
  await qa.getByLabel("참고 결과 제목", { exact: true }).fill("수동 참고 결과");
  await qa.getByLabel("참고 결과 상태", { exact: true }).selectOption("done");
  await qa.getByLabel("참고 결과 실행 시각 (이 기기의 시간대)").fill(await currentLocalMinute(page));
  await qa.getByLabel("참고 결과 URL", { exact: true }).fill("https://example.com/qa");
  await qa.getByRole("button", { name: "참고 결과 저장", exact: true }).click();
  await expect(page.getByText("reference-only · 연결 전 후보", { exact: true })).toBeVisible();
  await expect(page.getByText("정본 CI 통계·완료 수에서 제외", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  for (const title of ["코드 수정", "외부 배포", "계정 설정 변경"]) {
    await page.getByLabel(`${title} 검토 메모`, { exact: true }).fill(`${title} 검토만 요청`);
    await page.getByRole("button", { name: `${title} 메모 저장`, exact: true }).click();
  }
  await expect(page.locator(".ci-quality-approval-grid .ci-quality-status--approval")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  await expect(page.getByLabel("외부 배포 검토 메모", { exact: true })).toHaveValue("외부 배포 검토만 요청");
  expect(fixture.writes).toEqual([]);
});

test("JSON 내보내기·파일 가져오기·검토 후 대체와 정책 위반 차단을 검증한다", async ({ page }) => {
  await adminFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 관리", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "JSON 관리", exact: true });
  const exported = JSON.parse(await dialog.getByLabel("보드 JSON", { exact: true }).inputValue()) as ReturnType<typeof createQualityBoard>;
  expect(exported.checks).toHaveLength(12);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "현재 기록 내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^toonstudio-ci-qa-.*\.json$/u);
  const invalid = { ...exported, qa: { ...exported.qa, integration: "active" } };
  await dialog.getByLabel("보드 JSON", { exact: true }).fill(JSON.stringify(invalid));
  await dialog.getByRole("button", { name: "가져오기 검토", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("reference-only");
  exported.checks[0].summary = "가져오기 검증 fixture";
  await dialog.getByLabel("JSON 파일 가져오기", { exact: true }).setInputFiles({ name: "qa.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(dialog.getByRole("status")).toContainText("파일을 읽었습니다");
  await dialog.getByRole("button", { name: "가져오기 검토", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "가져오기 검토 결과" })).toBeVisible();
  await dialog.getByRole("button", { name: "전체 대체 확인", exact: true }).click();
  await page.getByRole("button", { name: "Vitest 결과 기록", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("검증 요약", { exact: true })).toHaveValue("가져오기 검증 fixture");
});

test("계정별 기록을 격리하고 권한 거부·비관리자에게 보드를 열지 않는다", async ({ page }) => {
  await adminFixture(page, { status: 403 });
  await page.goto(boardPath);
  await expect(page.getByRole("alert")).toContainText("관리자 권한이 필요합니다");
  await expect(page.getByRole("heading", { name: "CI·QA 검증", exact: true })).toHaveCount(0);
  await page.unroute("**/api/admin/me");
  await adminFixture(page, { role: "user" });
  await page.getByRole("button", { name: "관리자 권한 다시 확인", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("관리자 권한을 확인할 수 없습니다");
  await page.unroute("**/api/admin/me");
  await adminFixture(page, { id: "quality-admin-b", role: "operator" });
  const seed = createQualityBoard();
  seed.approvals[0].note = "다른 관리자의 비공유 메모";
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: getQualityStorageKey("quality-admin-a"), value: JSON.stringify(seed) });
  await page.getByRole("button", { name: "관리자 권한 다시 확인", exact: true }).click();
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  await expect(page.getByLabel("코드 수정 검토 메모", { exact: true })).toHaveValue("");
});

test("390px에서 화면 넘침 없이 키보드로 대화상자를 열고 닫는다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminFixture(page);
  await page.goto(boardPath);
  await expect(page.getByRole("heading", { name: "CI·QA 검증", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const open = page.getByRole("button", { name: "Vitest 결과 기록", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Vitest 결과 기록", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "대화상자 닫기" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "기록 저장", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.screenshot({ path: "artifacts/operation-policy-browser/ci-quality-390.png", fullPage: true });
});
