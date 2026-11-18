import { expect, test, type Page } from "@playwright/test";

import { createQualityBoard } from "../src/domains/operations/ci-quality/ci-quality-model";
import { getQualityStorageKey } from "../src/domains/operations/ci-quality/ci-quality-storage";
import { createDependencyReviewBoard } from "../src/domains/operations/ci-quality/dependency-review/dependency-review-seed";
import { getDependencyReviewStorageKey } from "../src/domains/operations/ci-quality/dependency-review/dependency-review-storage";

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
  await dialog.getByRole("combobox", { name: "진행 상태", exact: true }).selectOption("failed");
  await dialog.getByLabel("근거 범위", { exact: true }).fill("product shard · 브라우저 검증 fixture");
  await dialog.getByLabel("근거 커밋 SHA (40자리)").fill(createQualityBoard().commit.sha);
  await dialog.getByLabel("실행 시각 (이 기기의 시간대)").fill(await currentLocalMinute(page));
  await dialog.getByLabel("로그 URL", { exact: true }).fill("https://github.com/blue45f/toonstudio/actions/runs/1");
  await dialog.getByLabel("통과", { exact: true }).fill("9");
  await dialog.getByLabel("실패", { exact: true }).fill("1");
  await dialog.getByLabel("건너뜀", { exact: true }).fill("0");
  await dialog.getByLabel("전체", { exact: true }).fill("10");
  await dialog.getByRole("button", { name: "실패 분석", exact: true }).click();
  await dialog.getByRole("combobox", { name: "실패 분류", exact: true }).selectOption("regression");
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
  await expect(page.getByText("유효한 완료 근거 0개", { exact: true })).toBeHidden();
  await page.locator("summary").filter({ hasText: /^검증 전체 현황과 기준 커밋$/u }).click();
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
  await qa.getByRole("combobox", { name: "참고 결과 상태", exact: true }).selectOption("done");
  await qa.getByLabel("참고 결과 실행 시각 (이 기기의 시간대)").fill(await currentLocalMinute(page));
  await qa.getByLabel("참고 결과 URL", { exact: true }).fill("https://example.com/qa");
  await qa.getByRole("button", { name: "참고 결과 저장", exact: true }).click();
  await expect(page.getByText("reference-only · 연결 전 후보", { exact: true })).toBeVisible();
  await expect(page.getByText("정본 CI 통계·완료 수에서 제외", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  for (const title of ["코드 수정", "외부 배포", "계정 설정 변경"]) {
    await page.getByRole("textbox", { name: `${title} 검토 메모`, exact: true }).fill(`${title} 검토만 요청`);
    await page.getByRole("button", { name: `${title} 메모 저장`, exact: true }).click();
  }
  await expect(page.locator(".ci-quality-approval-grid .ci-quality-status--approval")).toHaveCount(3);
  await page.reload();
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "외부 배포 검토 메모", exact: true })).toHaveValue("외부 배포 검토만 요청");
  expect(fixture.writes).toEqual([]);
});

test("JSON 내보내기·파일 가져오기·검토 후 대체와 정책 위반 차단을 검증한다", async ({ page }) => {
  await adminFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "JSON 관리", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "JSON 관리", exact: true });
  const exported = JSON.parse(await dialog.getByRole("textbox", { name: "보드 JSON", exact: true }).inputValue()) as ReturnType<typeof createQualityBoard>;
  expect(exported.checks).toHaveLength(12);
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "현재 기록 내보내기", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^toonstudio-ci-qa-.*\.json$/u);
  const invalid = { ...exported, qa: { ...exported.qa, integration: "active" } };
  await dialog.getByRole("textbox", { name: "보드 JSON", exact: true }).fill(JSON.stringify(invalid));
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

test("같은 관리자의 두 탭 저장 충돌은 기존 기록을 보호하고 백업·최신본 읽기를 제공한다", async ({ page, context }) => {
  await adminFixture(page);
  await page.goto(boardPath);
  await page.getByRole("button", { name: "승인 대기 3", exact: true }).click();
  const second = await context.newPage();
  await adminFixture(second);
  await second.goto(boardPath);
  await second.getByRole("button", { name: "승인 대기 3", exact: true }).click();

  await page.bringToFront();
  await page.getByRole("textbox", { name: "코드 수정 검토 메모", exact: true }).fill("첫 탭에서 저장한 기록");
  await page.getByRole("button", { name: "코드 수정 메모 저장", exact: true }).click();
  await second.bringToFront();
  await second.getByRole("textbox", { name: "외부 배포 검토 메모", exact: true }).fill("둘째 탭의 미저장 기록");
  await second.getByRole("button", { name: "외부 배포 메모 저장", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText("다른 창에서 저장된 기록이 변경되었습니다");
  await expect(second.getByRole("button", { name: "저장 다시 시도", exact: true })).toBeDisabled();
  const saved = await second.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), getQualityStorageKey("quality-admin-a"));
  expect(saved.approvals[0].note).toBe("첫 탭에서 저장한 기록");
  expect(saved.approvals[1].note).toBe("");

  await second.getByRole("button", { name: "복구 JSON 관리", exact: true }).click();
  const backup = second.getByRole("dialog", { name: "JSON 관리", exact: true });
  await expect(backup.getByRole("textbox", { name: "보드 JSON", exact: true })).toHaveValue(/둘째 탭의 미저장 기록/u);
  await backup.getByRole("button", { name: "대화상자 닫기", exact: true }).click();
  await second.getByRole("button", { name: "저장된 기록 다시 읽기", exact: true }).click();
  await second.getByRole("button", { name: "미저장 변경을 버리고 최신 저장본 읽기", exact: true }).click();
  await expect(second.getByRole("textbox", { name: "코드 수정 검토 메모", exact: true })).toHaveValue("첫 탭에서 저장한 기록");
  await expect(second.getByRole("textbox", { name: "외부 배포 검토 메모", exact: true })).toHaveValue("");
});

test("390px에서 화면 넘침 없이 키보드로 대화상자를 열고 닫는다", async ({ page }, testInfo) => {
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
  await page.screenshot({ path: testInfo.outputPath("ci-quality-390.png"), fullPage: true });
});

test("의존성 탭의 두 원인·다섯 검사를 대조하고 기존 CI·QA 기록과 독립적으로 저장한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await adminFixture(page);
  const legacy = createQualityBoard();
  legacy.approvals[0].note = "기존 CI·QA 승인 메모 보존";
  const legacyJson = JSON.stringify(legacy);
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: getQualityStorageKey("quality-admin-a"), value: legacyJson });
  await page.goto(boardPath);
  await page.getByRole("button", { name: "의존성·회귀", exact: true }).click();
  await expect(page.getByRole("heading", { name: "의존성·회귀 검토", exact: true })).toBeVisible();
  await expect(page.locator(".dependency-cause-card")).toHaveCount(2);
  await expect(page.locator(".dependency-check-table tbody tr")).toHaveCount(5);
  await expect(page.locator(".dependency-check-table .dependency-status--unknown")).toHaveCount(5);
  await expect(page.locator(".dependency-approvals .dependency-status--approval")).toHaveCount(4);
  await page.getByRole("combobox", { name: "원인별 보기", exact: true }).selectOption("remotion");
  await expect(page.locator(".dependency-check-table tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "작업 필터 초기화", exact: true }).click();

  const build = createDependencyReviewBoard().records.find(record => record.id === "build")!;
  await page.getByRole("button", { name: `${build.title} 기록 열기`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `${build.title} 기록`, exact: true });
  await dialog.getByRole("combobox", { name: "작업 관리 상태", exact: true }).selectOption("진행 중");
  await dialog.getByRole("textbox", { name: "메모", exact: true }).fill("브라우저에서 저장한 수동 검토 메모");
  await dialog.getByRole("button", { name: "검토 기록 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "의존성·회귀", exact: true }).click();
  await page.getByRole("button", { name: `${build.title} 기록 열기`, exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "작업 관리 상태", exact: true })).toHaveValue("진행 중");
  await expect(dialog.getByRole("textbox", { name: "메모", exact: true })).toHaveValue("브라우저에서 저장한 수동 검토 메모");
  await dialog.getByRole("button", { name: "대화상자 닫기", exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), getQualityStorageKey("quality-admin-a"))).toBe(legacyJson);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), getDependencyReviewStorageKey("quality-admin-a"));
  expect(stored.records.find((record: { id: string }) => record.id === "build")).toMatchObject({ status: "진행 중", result: "미확인", recordedResult: "미확인" });
  expect(fixture.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dependency-review-desktop.png") });
});

test("390px에서 Sites 원본 완료 주장을 검토 상태로 가져오고 중복 적용을 차단한다", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await adminFixture(page);
  const baseline = createDependencyReviewBoard();
  const source = {
    title: "ToonStudio 의존성 및 CI 검증 보드",
    exportedAt: new Date(Date.now() - 60_000).toISOString(),
    snapshot: baseline.snapshot,
    records: baseline.records.map(record => record.id === "build" ? {
      ...record, status: "검증 완료", result: "통과", verifiedAt: new Date(Date.now() - 60_000).toISOString(),
      evidence: `브라우저 가져오기 fixture · 원본 증빙 ${baseline.snapshot.sha}`,
    } : record),
    dependencies: baseline.dependencies, prs: baseline.prs, commands: baseline.commands,
    history: baseline.history, policy: "수동 기록은 최신 CI 성공을 뜻하지 않습니다.",
  };
  await page.goto(boardPath);
  await page.getByRole("button", { name: "의존성·회귀", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const open = page.getByRole("button", { name: "의존성 JSON 관리", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "의존성 JSON 가져오기·백업", exact: true });
  await expect(dialog.getByRole("button", { name: "대화상자 닫기", exact: true })).toBeFocused();
  await dialog.getByLabel("의존성 JSON 파일", { exact: true }).setInputFiles({ name: "sites.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(source)) });
  await expect(dialog.getByRole("status")).toContainText("파일을 읽었습니다");
  await dialog.getByRole("button", { name: "변환 검토", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "의존성 가져오기 검토 결과" })).toContainText("Sites 내보내기 · 원본 12개");
  await expect(dialog.getByText("원본 검증 완료 / 통과 → 검토 필요", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "검토한 변경 가져오기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".dependency-check-table .dependency-status--review")).toHaveCount(5);
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), getDependencyReviewStorageKey("quality-admin-a"));
  expect(stored.snapshot.sha).toBe(baseline.snapshot.sha);
  expect(stored.imports).toHaveLength(1);
  expect(stored.records.find((record: { id: string }) => record.id === "build")).toMatchObject({ status: "검토 필요", result: "미확인", sourceStatus: "검증 완료", sourceResult: "통과" });
  await open.click();
  await dialog.getByLabel("가져올 의존성 JSON", { exact: true }).fill(JSON.stringify(source));
  await dialog.getByRole("button", { name: "변환 검토", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "검토한 변경 가져오기", exact: true })).toBeDisabled();
  await expect(dialog.getByText("이미 가져온 원본입니다. 중복 적용하지 않습니다.", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "가져오기 입력을 버리고 닫기", exact: true }).click();
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "6단계 보드", exact: true }).click();
  await expect(page.locator(".dependency-kanban .ci-quality-kanban-column")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(fixture.writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("dependency-review-390.png") });
});
