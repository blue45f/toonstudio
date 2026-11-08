/**
 * 실제 UI로 동일 6컷 원고의 회차→콘티→작화 연결과 패키지 준비 안내를 검증한다.
 * --blank-episode는 별도 새 작품에서 8개 샷의 명시적 페이지 생성과 재열기를 확인한다.
 * 독립 Chromium context와 새 로컬 프로젝트만 사용하며 서버 저장·사람 승인은 별도다.
 * 실행: TOONSTUDIO_SHORT_COMIC_ORIGIN=http://127.0.0.1:5511 node scripts/verify-studio-episode-handoff.mjs
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { enabledStudioHistoryControl } from "./lib/studio-verify-history-controls.mts";
import { completeStudioRecovery, observeStudioRecovery } from "./lib/studio-verify-recovery.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = new URL(process.env.TOONSTUDIO_SHORT_COMIC_ORIGIN ?? "http://127.0.0.1:5511");
assert(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)
  && origin.port && !origin.username && !origin.password && origin.pathname === "/"
  && !origin.search && !origin.hash, "명시 포트의 독립 로컬 주소만 허용합니다.");
const blankEpisode = process.argv.includes("--blank-episode");
const output = process.env.TOONSTUDIO_SHORT_COMIC_HANDOFF_DIR
  ?? join(tmpdir(), blankEpisode ? "toonstudio-blank-episode-handoff" : "toonstudio-short-comic-handoff");
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(join(root, "tests/corpus/studio/short-comic-six-pages.json"), "utf8"));
const originalPages = fixture.project.pagesList;
assert.equal(originalPages.length, 6, "원본 여섯 컷이 필요합니다.");
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
assert.equal(digest(originalPages), fixture.source.pagesSha256, "원본 컷 자료가 바뀌었습니다.");
const changedSources = [...new Set([
  ...execFileSync("git", ["diff", "--name-only", "--diff-filter=ACM", "origin/main...HEAD"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
  ...execFileSync("git", ["diff", "--name-only", "--diff-filter=ACM", "HEAD"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
  ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).trim().split("\n"),
])].filter((path) => path.startsWith("apps/web/src/domains/creator/")
  && /\.tsx?$/u.test(path) && !/\.test\.tsx?$/u.test(path)).sort();
const sourceFiles = await Promise.all(changedSources.map(async (path) => ({ path,
  sha256: createHash("sha256").update(await readFile(join(root, path))).digest("hex"),
})));

const report = {
  status: "running", startedAt: new Date().toISOString(),
  baseSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  baseMainSha: execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
  sourceFingerprint: digest(sourceFiles), sourceFiles,
  scenario: blankEpisode ? "blank-episode-eight-shots" : "existing-six-pages",
  ...(blankEpisode ? {} : { originalPagesSha256: fixture.source.pagesSha256 }),
  assertions: {}, pageErrors: [], observations: [],
  limitations: ["기기 원고의 UI 연결 검증이며 실제 계정·DB 시험은 별도 실행", "최종 사람 확인을 대신 체크하지 않음"],
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, locale: "ko-KR", acceptDownloads: true });
await observeStudioRecovery(context);
const page = await context.newPage();
page.setDefaultTimeout(45_000);
page.on("pageerror", (error) => report.pageErrors.push(String(error)));
page.on("dialog", async (dialog) => {
  // 새 시험 프로젝트에서 원본 fixture를 가져오는 확인만 허용한다.
  report.observations.push({ kind: "native-dialog", message: dialog.message() });
  await dialog.accept();
});
async function backup(name) {
  await page.keyboard.press("Escape");
  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  const pending = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("menuitem", { name: "백업 (.json)", exact: true }).click();
  const download = await pending;
  const path = join(output, name);
  await download.saveAs(path);
  assert.equal(await download.failure(), null, "원고 백업 다운로드가 실패했습니다.");
  const envelope = JSON.parse(await readFile(path, "utf8"));
  return envelope.payload?.data ?? envelope;
}
async function editorReady() {
  await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="프로젝트 JSON 가져오기"]');
    return input instanceof HTMLInputElement && !input.disabled;
  }, undefined, { timeout: 180_000 });
  const quickStart = page.getByRole("button", { name: "빠른 시작 닫기 (Esc)", exact: true });
  if (await quickStart.isVisible()) await quickStart.click();
  const welcome = page.getByRole("button", { name: "시작 안내 닫기", exact: true });
  if (await welcome.isVisible()) await welcome.click();
}
async function createProject(title) {
  await page.goto(new URL("studio/new?lane=idea&start=idea", origin).href,
    { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('[data-studio-mode-create="true"]').waitFor();
  await page.getByRole("textbox", { name: "프로젝트 이름", exact: true }).fill(title);
  await page.getByRole("button", { name: /^(프로젝트와 제작 계획 만들기|세로 연재 웹툰 시작)$/u }).click();
  await page.waitForURL(/\/studio\/p\/[^/]+\/story/u);
  const projectId = decodeURIComponent(new URL(page.url()).pathname.split("/")[3]);
  report.projectId = projectId;
  return projectId;
}
async function verifyExistingManuscript() {
  const projectId = await createProject("우산을 돌려주는 날 · 동일 6컷 인계 검증");
  console.log("새 시험 프로젝트를 만들었습니다.");
  await page.getByRole("link", { name: "이어서 그리기", exact: true }).click();
  await editorReady();
  const documentId = decodeURIComponent(new URL(page.url()).pathname.split("/")[5]);
  report.documentId = documentId;
  await page.getByLabel("프로젝트 JSON 가져오기", { exact: true }).setInputFiles({
    name: "short-comic-six-pages.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture.project)),
  });
  await page.getByRole("button", { name: "06 내일도 빌려줄게 선택", exact: true }).waitFor();
  assert.deepEqual((await backup("imported.json")).pagesList, originalPages);
  report.assertions.originalSixPagesImported = true;
  console.log("원본 여섯 컷의 가져오기와 백업 일치를 확인했습니다.");
  await page.waitForTimeout(3_000);

  await page.goto(new URL(`studio/p/${encodeURIComponent(projectId)}/story?view=episodes`, origin).href,
    { waitUntil: "domcontentloaded", timeout: 120_000 });
  const form = page.getByRole("form", { name: "1화 줄거리", exact: true });
  await form.waitFor();
  await form.getByLabel("이번 화의 목표", { exact: true }).fill("우산을 빌려 주고 작은 친절을 돌려받는다");
  await form.getByLabel("줄거리", { exact: true }).fill("민서가 고양이에게 우산을 빌려 주고, 수선집에서 함께 고친 우산을 되찾는다.");
  await form.getByLabel("핵심 사건 (한 줄에 하나씩)", { exact: true })
    .fill(originalPages.map((entry) => entry.note).join("\n"));
  await form.getByRole("link", { name: "이 회차 콘티 시작하기", exact: true }).click();
  await editorReady();
  report.storyboardRecovery = await completeStudioRecovery(page, 30_000);
  assert.deepEqual((await backup("storyboard-reopened.json")).pagesList, originalPages);
  const storyboard = new URL(page.url());
  assert.equal(decodeURIComponent(storyboard.pathname.split("/")[3]), projectId);
  assert.equal(decodeURIComponent(storyboard.pathname.split("/")[5]), documentId);
  const episodeId = storyboard.searchParams.get("episode");
  assert(episodeId, "회차 문맥이 콘티에 전달되어야 합니다.");
  const handoff = page.locator('[data-studio-episode-document-handoff="ready"]');
  await handoff.waitFor();
  await handoff.locator("summary").first().click();
  assert.match(await handoff.innerText(), /샷 6개/u);
  const apply = handoff.getByRole("button", { name: "샷 6개로 콘티 페이지 만들기", exact: true });
  await apply.waitFor();
  assert.equal(await apply.isDisabled(), true, "이미 작화한 원고에는 샷을 적용할 수 없습니다.");
  report.assertions.populatedManuscriptProtected = true;
  const art = handoff.getByRole("link", { name: "이 회차 작화 시작하기", exact: true });
  const href = new URL(await art.getAttribute("href"), origin);
  assert.equal(href.searchParams.get("episode"), episodeId);
  assert.equal(href.searchParams.get("workspace"), "draw");
  await page.screenshot({ path: join(output, "storyboard-six-shots.png") });
  await art.click();
  await page.waitForURL((url) => url.searchParams.get("workspace") === "draw");
  assert.equal(new URL(page.url()).pathname, storyboard.pathname);
  assert.equal(new URL(page.url()).searchParams.get("episode"), episodeId);
  assert.deepEqual((await backup("after-art-handoff.json")).pagesList, originalPages);
  const libraryCount = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("toonspectrum:studio-project-library:v1") ?? "{}").projects?.length);
  assert.equal(libraryCount, 1, "인계 중 다른 작품을 만들면 안 됩니다.");
  report.assertions.sameProjectDocumentEpisodeAndSixPages = true;
  console.log("같은 작품·원고·회차의 콘티와 작화 연결을 확인했습니다.");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('[data-studio-editor="true"]').waitFor({ timeout: 180_000 });
  report.recovery = await completeStudioRecovery(page, 30_000);
  await editorReady();
  assert.deepEqual((await backup("reopened.json")).pagesList, originalPages);
  report.assertions.reloadPreservesSixPages = true;
  console.log("실제 자동 복구와 원본 여섯 컷의 재열기 백업 일치를 확인했습니다.");

  if (await handoff.locator("details").first().getAttribute("open") === null) {
    await handoff.locator("summary").first().click();
  }
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1200 });
    const geometry = await handoff.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: innerWidth, overflow: element.scrollWidth - element.clientWidth };
    });
    assert(geometry.left >= 0 && geometry.right <= width + 1 && geometry.overflow <= 1);
    report.observations.push({ kind: "handoff-layout", width, geometry });
  }
  const accessibility = await new AxeBuilder({ page }).include("[data-studio-episode-document-handoff]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(accessibility.violations, [], "새 회차 인계 영역의 접근성을 확인해 주세요.");
  report.assertions.handoffResponsiveAndAccessible = true;
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  await page.getByRole("menuitem", { name: "게시 패키지…", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Publish Package", exact: true }) });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("button", { name: "패키지 내보내기", exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByText("내보내기 가능", { exact: true }).count(), 0);
  await dialog.getByRole("button", { name: "필수 점검 열기", exact: true }).waitFor();
  await page.screenshot({ path: join(output, "package-human-checks-pending.png") });
  report.assertions.humanChecksRemainPendingAndExportBlocked = true;
}

async function verifyBlankEpisode() {
  const shots = [
    "C01 종이 대출표 마지막 날", "C02 소라가 녹음기를 꺼냄", "C03 유진이 종에 손을 댐", "C04 소라가 책의 대출표를 펼침",
    "C05 녹음기에 종이 라벨을 붙임", "C06 마지막 도장의 소리를 녹음함", "C07 처음과 마지막 칸의 꽃이 겹쳐 보임", "C08 둘이 함께 녹음을 재생함",
  ];
  const projectId = await createProject("소리도 대출됩니다");
  await page.goto(new URL(`studio/p/${encodeURIComponent(projectId)}/story?view=episodes`, origin).href,
    { waitUntil: "domcontentloaded", timeout: 120_000 });
  const form = page.getByRole("form", { name: "1화 줄거리", exact: true });
  await form.getByLabel("이번 화의 목표", { exact: true }).fill("마지막 종이 대출 도장의 소리를 남긴다.");
  await form.getByLabel("줄거리", { exact: true }).fill("소라와 유진이 도서관의 마지막 종이 대출 도장 소리를 녹음하고 함께 듣는다.");
  await form.getByLabel("핵심 사건 (한 줄에 하나씩)", { exact: true }).fill(shots.join("\n"));
  await form.getByRole("link", { name: "이 회차 콘티 시작하기", exact: true }).click();
  await editorReady();
  const handoff = page.locator('[data-studio-episode-document-handoff="ready"]');
  await handoff.locator("summary").first().click();
  const apply = handoff.getByRole("button", { name: "샷 8개로 콘티 페이지 만들기", exact: true });
  await apply.waitFor();
  const before = (await backup("before-apply.json")).pagesList;
  assert.equal(before.length, 1, "콘티를 명시적으로 적용하기 전에는 단일 빈 페이지만 있어야 합니다.");
  assert.equal(before[0].elements.length, 0);
  const path = new URL(page.url()).pathname;
  const episodeId = new URL(page.url()).searchParams.get("episode");
  assert(episodeId && decodeURIComponent(path.split("/")[3]) === projectId);
  await apply.click();
  const pages = (await backup("after-apply.json")).pagesList;
  assert.equal(pages.length, shots.length);
  assert.equal(pages[0].id, before[0].id, "기존 빈 페이지의 ID가 유지되어야 합니다.");
  assert.equal(new Set(pages.map((p) => p.id)).size, shots.length);
  for (const [index, shot] of shots.entries()) {
    const code = `C${String(index + 1).padStart(2, "0")}`;
    assert.equal(pages[index].name, code, `${code} 컷 이름과 순서를 확인하세요.`);
    assert.equal(pages[index].note, shot, `${code} 메모가 계획에서 입력한 샷과 다릅니다.`);
  }
  assert.equal(await apply.isDisabled(), true, "같은 원고에 다시 적용하면 안 됩니다.");
  await (await enabledStudioHistoryControl(page, "undo")).click();
  assert.deepEqual((await backup("after-one-undo.json")).pagesList, before);
  await (await enabledStudioHistoryControl(page, "redo")).click();
  assert.deepEqual((await backup("after-one-redo.json")).pagesList, pages);
  report.assertions.singleUndoAndRedoRestoreExactPages = true;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await editorReady();
  report.recovery = await completeStudioRecovery(page, 30_000);
  assert.equal(new URL(page.url()).pathname, path);
  assert.equal(new URL(page.url()).searchParams.get("episode"), episodeId);
  await handoff.locator("summary").first().click();
  await apply.waitFor();
  assert.equal(await apply.isDisabled(), true, "재열기 후에도 중복 적용이 차단되어야 합니다.");
  assert.deepEqual((await backup("blank-reopened.json")).pagesList, pages);
  await page.screenshot({ path: join(output, "blank-reopened.png") });
  report.documentId = decodeURIComponent(path.split("/")[5]);
  report.episodeId = episodeId;
  report.createdPageIds = pages.map((p) => p.id);
  report.assertions.explicitEightShotPagesPreservedOnReopen = true;
}
try {
  if (blankEpisode) await verifyBlankEpisode();
  else await verifyExistingManuscript();
  assert.deepEqual(report.pageErrors, [], "제품 JavaScript 오류가 있습니다.");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  report.failureUrl = page.url();
  report.failureVisibleText = (await page.locator("body").innerText().catch(() => "")).slice(-12_000);
  report.failureStorage = await page.evaluate(() => ({
    localKeys: Object.keys(localStorage).filter((key) => /studio|spectrum/u.test(key))
      .map((key) => ({ key, length: localStorage.getItem(key)?.length })),
    roomOwner: sessionStorage.getItem("toonspectrum:studio-live-owner-room:v1"),
  })).catch(() => null);
  await page.screenshot({ path: join(output, "failure.png") }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await context.close();
  await browser.close();
  console.log(JSON.stringify({ status: report.status, evidence: join(output, "report.json"), error: report.error }));
}
