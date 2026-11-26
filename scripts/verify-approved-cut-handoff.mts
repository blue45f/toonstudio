/**
 * 새 합성 계정 두 개와 8컷 작품을 만들고 담당자가 받은 파일을 실제 편집기에서 연다.
 * 기존 로컬 개발 스택: TEST_DATABASE_URL, STUDIO_QA_BASE_URL, STUDIO_APPROVED_CUT_EVIDENCE_DIR 지정 후
 * pnpm exec tsx scripts/verify-approved-cut-handoff.mts [--isolated-browser]
 * 자체 개발 서버와 MinIO: docs/studio/virtual-studio-local-storage-acceptance-20260920.md의
 * 격리 PostgreSQL 및 저장소 환경을 준비하고 --with-stack을 추가한다.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalJson } from "@toonstudio/studio-project-model";
import { decodePng } from "image-js";
import { Pool } from "pg";
import { chromium, type BrowserContext, type Page, type APIResponse } from "playwright";

import { studioReviewCaptureSubjectSchema } from "../apps/api/src/modules/studio-project-graph/studio-review-capture-subject";
import { studioVirtualSpaceReviewHref } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-review-invitation";

import { prepareFilterMenuWorkspace } from "./lib/studio-filter-menu-workspace";
import { withStudioReviewHostQaRuntime } from "./studio-review-host-qa-runtime.mjs";
import { createStudioReviewHostFixture, inviteStudioReviewHostEditor } from "./studio-review-host-steps";
import { withStudioReviewLocalStorage } from "./studio-review-local-storage-runtime.mjs";

import type { PageState } from "../apps/web/src/domains/creator/studio-page-state";
import type { StudioReviewLocalStorage } from "./studio-review-storage-acceptance";

const out =
  process.env.STUDIO_APPROVED_CUT_EVIDENCE_DIR ?? join(tmpdir(), "approved-cut-browser-" + randomUUID());
await mkdir(out, { recursive: true });
const dedicatedBrowser = process.argv.includes("--isolated-browser");
async function verify(origin: URL) {
  assert.equal(origin.hostname, "127.0.0.1");
  assert.equal(origin.protocol, "http:");
  const database = new URL(process.env.TEST_DATABASE_URL ?? "");
  assert.equal(database.hostname, "127.0.0.1");
  assert(/(?:^|[_-])test(?:$|[_-])/u.test(database.pathname.slice(1)));
  const pool = new Pool({ connectionString: database.href, max: 1 });
  const browser = dedicatedBrowser
    ? await chromium.launch({ channel: "chrome", headless: true, args: ["--enable-unsafe-swiftshader"] })
    : await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true });
  const options = {
    viewport: { width: 1280, height: 880 },
    locale: "ko-KR",
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  };
  const owner = await browser.newContext(options),
    artist = await browser.newContext(options);
  for (const context of [owner, artist]) {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        ["blob:", "data:"].includes(url.protocol)
        ? route.continue()
        : route.abort();
    });
  }
  const ownerPage = await owner.newPage(),
    artistPage = await artist.newPage();
  const before = "내가 오늘까지 보내지 않을게.",
    after = "네가 내일까지 보내 줄래?";
  const scene = (i: number, revised: boolean): PageState => {
    const id = "cut-" + (i + 1),
      changed = revised && i === 3;
    const text =
      i === 3
        ? changed
          ? after
          : before
        : [
            "출발하자.",
            "표는 챙겼어?",
            "응, 여기 있어.",
            "",
            "다음 역이야.",
            "같이 내리자.",
            "우체통이 보여.",
            "도착했네.",
          ][i];
    return {
      id: "page-" + (i + 1),
      name: String(i + 1) + "컷",
      bg: "#ffffff",
      bgGrad: null,
      canvasH: 260,
      elements: [
        {
          id,
          type: "frame",
          x: 0,
          y: 0,
          width: 720,
          height: 260,
          bgColor: changed ? "#eed4a7" : "#bdd8d0",
          stroke: "#203a43",
          strokeWidth: 2,
        },
        {
          id: "line-" + (i + 1),
          type: "text",
          name: "식자 · " + (i + 1) + "컷",
          frameClipId: id,
          x: 48,
          y: 104,
          width: 620,
          text: text ?? "",
          fill: "#203a43",
          rotation: 0,
          align: "center",
          fontSize: 32,
        },
      ],
    };
  };
  async function raster(page: Page, source: PageState) {
    const encoded = await page.evaluate(async (pageJson: string) => {
      const savedPage = JSON.parse(pageJson) as PageState;
      const modulePath = "/src/domains/creator/render/studio-skia-document-export.ts";
      const { captureStudioSkiaDocumentForExport } = (await import(
        modulePath
      )) as typeof import("../apps/web/src/domains/creator/render/studio-skia-document-export");
      const result = await captureStudioSkiaDocumentForExport({
        page: savedPage,
        exportScale: 1,
        transparent: false,
      });
      if (result.status !== "captured") throw Error("원고 PNG 생성 실패 " + result.reason);
      return result.canvas.toDataURL("image/png").split(",")[1];
    }, JSON.stringify(source));
    return Buffer.from(encoded, "base64");
  }
  const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
  async function ok(res: APIResponse, step: string) {
    assert(res.ok(), step + " HTTP " + res.status() + " " + (await res.text()).slice(0, 400));
    return res.json();
  }
  const headers = { "x-toonstudio-csrf": "1", Origin: origin.origin, Referer: origin.origin + "/studio" };
  type Subject = ReturnType<typeof studioReviewCaptureSubjectSchema.parse>;
  const report: Record<string, unknown> = {
    status: "running",
    checkedAt: new Date().toISOString(),
    browser: dedicatedBrowser ? "isolated-chrome" : "cdp-9223",
    base: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  };
  let phase = "계정 준비";
  function stage(name: string) {
    phase = name;
    console.log(name);
  }
  async function capture(
    context: BrowserContext,
    workId: string,
    revision: number,
    doc: unknown,
    rasters: Buffer[],
  ) {
    const path = origin.origin + "/api/studio-project-graph/review-captures";
    const intent = await ok(
      await context.request.post(path + "/prepare", {
        headers,
        data: {
          workId,
          intentId: randomUUID(),
          sourceServerRevision: revision,
          sourceContentDigest: digest(doc),
          pageCount: 8,
          title: revision + "판 기차역에서",
          deviceId: "qa-browser",
          createdAt: new Date().toISOString(),
        },
      }),
      "캡처 준비",
    );
    const pages = [];
    for (const [ordinal, buffer] of rasters.entries()) {
      const part = await ok(
        await context.request.put(path + "/pages/" + ordinal, {
          headers,
          multipart: {
            intent: JSON.stringify(intent),
            file: { name: "panel.png", mimeType: "image/png", buffer },
          },
        }),
        "컷 " + (ordinal + 1),
      );
      pages.push({ ordinal, sha256: part.sha256 });
    }
    return studioReviewCaptureSubjectSchema.parse(
      (
        await ok(
          await context.request.post(path + "/complete", { headers, data: { intent, pages } }),
          "캡처 완료",
        )
      ).subject,
    );
  }
  async function open(page: Page, subject: Subject) {
    await page.bringToFront();
    await page.goto(new URL(studioVirtualSpaceReviewHref(subject), origin).href, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "이전 검수본과 비교", exact: true }).waitFor({ timeout: 120_000 });
  }
  async function approve(page: Page) {
    await page.getByRole("button", { name: "이 검수본 승인", exact: true }).click();
    await page.getByRole("button", { name: "승인 확정", exact: true }).click();
    await page.getByText("검수 승인됨", { exact: true }).first().waitFor();
  }
  const panel = (page: Page) => page.getByRole("region", { name: "공식 전달과 수신 확인", exact: true });
  async function prepare(page: Page, status: number) {
    const form = panel(page);
    await form.getByRole("checkbox", { name: /편집 담당자에게 승인 원고 JSON/ }).check();
    await form
      .getByRole("textbox", { name: "권리·사용 조건 확인 근거" })
      .fill("팀이 만든 합성 원고와 PNG를 편집 담당자에게 전달합니다.");
    await form.getByRole("checkbox", { name: /운영 모드와 위 근거/ }).check();
    const response = page.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/review-deliveries"),
    );
    await form.getByRole("button", { name: "전달 준비", exact: true }).click();
    const res = await response;
    assert.equal(res.status(), status);
    return res.json();
  }
  try {
    const fixture = await createStudioReviewHostFixture(owner, pool, origin);
    await inviteStudioReviewHostEditor(owner, artist, pool, origin, fixture.workId, headers);
    const sourcePath = origin.origin + "/api/creator/works/" + fixture.workId;
    const baseline = fixture.initialSaved.document.doc;
    assert(baseline, "원고 원본을 읽지 못했습니다.");
    async function write(revised: boolean) {
      const doc = {
        ...baseline,
        width: 720,
        currentPageId: "page-4",
        pagesList: Array.from({ length: 8 }, (_, i) => scene(i, revised)),
      };
      const prev = await ok(await owner.request.get(sourcePath + "/team/document"), "원고 읽기");
      await ok(
        await owner.request.patch(sourcePath, { headers, data: { doc, baseRevision: prev.revision } }),
        "합성 원고 변경",
      );
      const saved = await ok(await owner.request.get(sourcePath + "/team/document"), "저장 확인");
      assert.equal(saved.document.doc.pagesList.length, 8);
      return { revision: saved.revision, doc: saved.document.doc };
    }
    stage("첫 승인");
    const v1 = await write(false);
    const materialPage = await artist.newPage();
    await materialPage.goto(origin.origin + "/robots.txt");
    const raw: Buffer[] = [];
    for (let i = 0; i < 8; i++) raw.push(await raster(materialPage, v1.doc.pagesList[i]));
    const original = await capture(artist, fixture.workId, v1.revision, v1.doc, raw);
    await open(ownerPage, original);
    await approve(ownerPage);
    stage("수정본 고정");
    const v2 = await write(true);
    const raws = raw.slice();
    raws[3] = await raster(materialPage, v2.doc.pagesList[3]);
    const current = await capture(artist, fixture.workId, v2.revision, v2.doc, raws);
    stage("구버전 전달 차단");
    const denied = await prepare(ownerPage, 409);
    assert.equal(denied.code, "studio_review_delivery_source_changed");
    await panel(ownerPage).screenshot({ path: join(out, "01-stale-blocked.png") });
    stage("변경 컷 비교");
    await open(ownerPage, current);
    const start = performance.now();
    await ownerPage.getByRole("button", { name: "이전 검수본과 비교", exact: true }).click();
    const changes = ownerPage.getByRole("region", { name: "승인 후 변경 목록" });
    const menu = changes.getByRole("combobox");
    await menu.waitFor();
    assert.equal(await menu.locator("option").count(), 1);
    assert.match(await menu.innerText(), /4페이지.*(?:1컷|cut-4)/u);
    assert.match(await changes.innerText(), /내가 오늘까지 보내지 않을게\./u);
    assert.match(await changes.innerText(), /네가 내일까지 보내 줄래\?/u);
    report.detectionMs = Math.round(performance.now() - start);
    report.missedCuts = 0;
    await ownerPage.setViewportSize({ width: 1280, height: 1320 });
    const collapse = ownerPage.getByRole("button", { name: "서비스 상태 알림 접기", exact: true });
    if (await collapse.isVisible()) await collapse.click();
    await changes.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await changes.screenshot({ path: join(out, "02-changed-cut.png") });
    await changes.getByRole("button", { name: "변경 이미지 겹쳐 보기", exact: true }).click();
    await changes.getByRole("slider").fill("65");
    await changes.screenshot({ path: join(out, "02-overlay.png") });
    await changes.getByRole("button", { name: "변경 이미지 겹쳐 보기", exact: true }).click();
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    await changes.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    const layout = await changes.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return { viewport: window.innerWidth, width: el.scrollWidth, left: bounds.left, right: bounds.right };
    });
    assert(
      layout.left >= 0 && layout.right <= layout.viewport && layout.width <= layout.right - layout.left + 1,
    );
    report.mobile390 = layout;
    await changes.screenshot({ path: join(out, "02-mobile390.png") });
    await ownerPage.setViewportSize({ width: 1280, height: 1320 });
    await ownerPage.getByRole("button", { name: "전체 페이지 보기", exact: true }).click();
    const currentSelection = ownerPage.getByRole("combobox", { name: "기준 검수본 페이지", exact: true });
    const previousSelection = ownerPage.getByRole("combobox", { name: "비교 검수본 페이지", exact: true });
    await currentSelection.waitFor();
    assert.equal(await currentSelection.inputValue(), "3", "수정 원고는 전체 보기에서도 4페이지가 선택되어야 합니다.");
    assert.equal(await previousSelection.inputValue(), "3", "승인 원고는 전체 보기에서도 4페이지가 선택되어야 합니다.");
    await previousSelection.scrollIntoViewIfNeeded();
    await ownerPage.screenshot({
      path: join(out, "02-full-pages.png"),
    });
    await ownerPage.getByRole("button", { name: "변경만 검수", exact: true }).click();
    assert.match(await changes.getByRole("combobox").innerText(), /4페이지/u);
    report.fullPageSelection = [4, 4];
    stage("재승인·발행");
    await approve(ownerPage);
    await prepare(ownerPage, 200);
    const issue = ownerPage.waitForResponse(
      (r) => r.url().endsWith("/issue") && r.request().method() === "POST",
    );
    await panel(ownerPage).getByRole("button", { name: "전달 발행", exact: true }).click();
    assert.equal((await issue).status(), 200);
    stage("담당자 수령");
    await open(artistPage, current);
    const zipResponse = artistPage.waitForResponse(
      (r) => r.request().method() === "POST" && r.url().endsWith("/download"),
    );
    const download = artistPage.waitForEvent("download").catch(() => null);
    await panel(artistPage).getByRole("button", { name: "검증 ZIP 저장", exact: true }).click();
    const zip = await zipResponse;
    assert.equal(zip.status(), 200);
    assert.match(zip.headers()["content-type"] ?? "", /^application\/zip(?:;|$)/u);
    const downloaded = await download;
    assert(downloaded, "브라우저가 ZIP 저장을 시작하지 않았습니다.");
    const path = join(out, "approved.zip");
    await downloaded.saveAs(path);
    assert.equal(await downloaded.failure(), null);
    const archive = await readFile(path);
    const archiveSha256 = createHash("sha256").update(archive).digest("hex");
    const member = (name: string) => execFileSync("unzip", ["-p", path, name], { maxBuffer: 16_000_000 });
    const manifest = JSON.parse(member("manifest.json").toString());
    assert.equal(manifest.editableSource.path, "source/manuscript.toonstudio-work.json");
    const source = JSON.parse(member(manifest.editableSource.path).toString());
    assert.deepEqual(source, v2.doc);
    assert.equal(createHash("sha256").update(member(manifest.editableSource.path)).digest("hex"), manifest.editableSource.sha256);
    for (const [i, bytes] of raws.entries()) {
      const downloaded = member("pages/" + String(i + 1).padStart(6, "0") + ".png");
      const pixels = Buffer.from(decodePng(downloaded).getRawImage().data);
      assert.deepEqual(pixels, Buffer.from(decodePng(bytes).getRawImage().data));
      assert.equal(pixels.equals(Buffer.from(decodePng(raw[i]).getRawImage().data)), i !== 3);
    }
    const acceptance = artistPage.waitForResponse(
      (r) => r.url().endsWith("/accept") && r.request().method() === "POST",
    );
    await panel(artistPage).getByRole("button", { name: "수신 완료 확인", exact: true }).click();
    const receipt = await acceptance;
    assert.equal(receipt.status(), 200);
    const accepted = await receipt.json();
    assert.equal(accepted.state, "accepted");
    assert.equal(accepted.archiveSha256, archiveSha256);
    assert.equal(accepted.archiveByteLength, archive.byteLength);
    Object.assign(report, { archiveBytes: archive.byteLength, archiveSha256, matchedServerArchive: true });
    await panel(artistPage)
      .getByText(/· 수신 완료$/u)
      .waitFor();
    await panel(artistPage).screenshot({ path: join(out, "03-accepted.png") });
    stage("수령한 원고를 편집기에서 열기");
    const editor = await artist.newPage();
    await editor.bringToFront();
    editor.on("dialog", (dialog) => dialog.accept());
    await editor.goto(origin.origin + "/studio/canvas", { waitUntil: "domcontentloaded" });
    const picker = editor.getByLabel("프로젝트 JSON 가져오기", { exact: true });
    await picker.waitFor({ state: "attached", timeout: 180_000 });
    await editor.waitForFunction(
      () =>
        document.querySelector<HTMLInputElement>('input[aria-label="프로젝트 JSON 가져오기"]')?.disabled ===
        false,
      undefined,
      { timeout: 180000 },
    );
    await picker.setInputFiles({
      name: "manuscript.toonstudio-work.json",
      mimeType: "application/json",
      buffer: member(manifest.editableSource.path),
    });
    await editor.getByText(/현재 컷 4 \/ 8/u).first().waitFor({ timeout: 120_000 });
    for (const selector of ["[data-studio-quickstart-dismiss]", "[data-studio-page-sequence-close]"]) {
      const close = editor.locator(selector + ":visible").first();
      if (await close.isVisible()) await close.click();
    }
    const guide = editor.getByRole("button", { name: "시작 안내 닫기", exact: true }).first();
    if (await guide.isVisible()) await guide.click();
    if (!(await editor.getByText("웹툰/식자", { exact: true }).first().isVisible())) {
      await prepareFilterMenuWorkspace(editor, 25_000);
    }
    await editor.getByText("웹툰/식자", { exact: true }).first().click();
    await editor.getByRole("menuitem", { name: /대사 일괄 편집/ }).click();
    const editedLine = editor.getByRole("textbox", { name: "4페이지 텍스트 대사 수정" });
    await editedLine.waitFor({ timeout: 45_000 });
    assert.equal(await editedLine.inputValue(), after);
    const allLines = editor.getByRole("textbox", { name: /^[1-8]페이지 텍스트 대사 수정$/u });
    assert.equal(await allLines.count(), 8);
    const reopenedLines=await allLines.evaluateAll(rows=>rows.map(row=>(row as HTMLTextAreaElement).value));
    assert.deepEqual(reopenedLines, v2.doc.pagesList.map((page:PageState)=>page.elements.find(element=>element.type==="text")?.text));
    await editedLine.scrollIntoViewIfNeeded();
    await editor.screenshot({ path: join(out, "04-editor-reopened.png") });
    Object.assign(report, {
      status: "passed",
      reopenedSourceInEditor: true,
      expectedCuts: 8,
      changedCut: 4,
      matchedPngs: 8,
      editableSourceSha256: digest(source),
      staleStatus: 409,
      receipt: "accepted",
    });
  } catch (error) {
    report.status = "failed";
    report.phase = phase;
    report.error = String(error);
    await Promise.all([
      ownerPage.screenshot({ path: join(out, "failed-owner.png"), timeout: 3000 }).catch(() => {}),
      artistPage.screenshot({ path: join(out, "failed-artist.png"), timeout: 3000 }).catch(() => {}),
    ]);
    console.error(phase, String(error));
    process.exitCode = 1;
  } finally {
    await writeFile(join(out, "result.json"), JSON.stringify(report, null, 2));
    await owner.close();
    await artist.close();
    if (dedicatedBrowser) await browser.close();
    await pool.end();
  }
}
if (process.argv.includes("--with-stack")) {
  await withStudioReviewLocalStorage(process.env, out, (storage: StudioReviewLocalStorage) =>
    withStudioReviewHostQaRuntime(process.env, ({ origin }: { origin: URL }) => verify(origin), {
      localReviewStorage: storage.options,
    }),
  );
} else {
  await verify(new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5816"));
}
// 공유 Chrome에는 종료 명령을 보내지 않고 검증 프로세스의 CDP 연결만 해제한다.
if (!dedicatedBrowser) process.exit(process.exitCode ?? 0);
