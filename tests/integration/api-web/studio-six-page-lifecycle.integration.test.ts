import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { materializeStudioAuthoringFromCrdt } from "@toonstudio/contracts/studio-crdt-authoring";
import { unzipSync } from "fflate";
import { decodePng } from "image-js";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from "vitest";
import * as Y from "yjs";

import { createCanvasHarness } from "../../../apps/api/src/modules/creator/studio-role-pipeline-canvas-test-harness";
import { enabledStudioHistoryControl } from "../../../scripts/lib/studio-verify-history-controls.mts";
import { validatePostgresIntegrationUrl } from "../../../scripts/run-postgres-integration-tests.mjs";
import fixture from "../../corpus/studio/short-comic-six-pages.json";

import { captureSixPageRendererReceipt, captureSixPageReview, downloadSixPagePngs, exportSixPageSnapshot, openSixPageCanvas, technicalPackage, temporaryPointer, type SixPageRendererReceipt } from "./studio-six-page-browser-support";
import { digest, registerActors, shared, sixPageProduction, type Actor } from "./studio-six-page-test-support";

import type { StudioReviewPreviewSubject } from "../../../apps/api/src/modules/studio-project-graph/studio-review-preview";
import type { StudioReviewPreviewResult } from "../../../apps/api/src/modules/studio-project-graph/studio-review-preview.service";

const databaseUrl = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
const origin = process.env.TOONSTUDIO_RBAC_BROWSER_ORIGIN?.trim();
const output = process.env.TOONSTUDIO_SIX_PAGE_EVIDENCE_DIR ?? ".qa/short-comic-six-page-integration";
const outputRelative = relative(resolve(".qa"), resolve(output));
if (outputRelative.startsWith("..") || isAbsolute(outputRelative)) throw new Error("계정이 포함된 시험 증거는 ignored .qa 안에서만 저장합니다.");
const pageIds = fixture.source.pageIds;
const originalPagesHash = "e06fa6d22e86f9a6755832ed19df57fb918997d557da27ab30c7ab900bb37e10";
if (origin) {
  const parsed = new URL(origin);
  if (parsed.hostname !== "127.0.0.1" || parsed.protocol !== "http:" || !parsed.port) throw new Error("6컷 시험 웹은 명시 포트의 loopback만 허용합니다.");
}

function assertOriginal(doc: Record<string, unknown>): void {
  expect(doc.pagesList).toEqual(fixture.project.pagesList);
  for (const field of ["aiProvenance", "writerRoom", "characterBible", "aiImageReferences", "referenceBoard", "publishPack"]) {
    expect(Reflect.get(doc, field), `${field} 원본 보존`).toEqual(Reflect.get(fixture.project, field));
  }
}
function documentRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("정본 원고 객체가 없습니다.");
  return value as Record<string, unknown>;
}
function pngPixels(bytes: Uint8Array) {
  const image = decodePng(bytes), raw = image.getRawImage().data;
  return { width: image.width, height: image.height, rgbaSha256: digest(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)) };
}
function compareHistoricalPixels(current: Uint8Array, historical: Uint8Array, background: string) {
  const actual = decodePng(current), reference = decodePng(historical), a = actual.getRawImage().data, b = reference.getRawImage().data;
  const bg = background.slice(1).match(/.{2}/gu)?.map(hex => Number.parseInt(hex, 16));
  if (!bg || actual.width !== reference.width || actual.height !== reference.height || a.length !== b.length) {
    throw new Error("교차 버전 PNG의 크기·색상 비교 조건을 확인해 주세요.");
  }
  let changedPixels = 0, maxChannelDelta = 0, backgroundPixels = 0;
  for (let p = 0; p < a.length; p += 4) {
    if (a[p] === bg[0] && a[p + 1] === bg[1] && a[p + 2] === bg[2]) backgroundPixels++;
    let changed = false;
    for (let c = 0; c < 4; c++) { const delta = Math.abs(a[p + c] - b[p + c]); changed ||= delta > 0; maxChannelDelta = Math.max(maxChannelDelta, delta); }
    if (changed) changedPixels++;
  }
  const total = actual.width * actual.height;
  return { changedPixels, changedRatio: changedPixels / total, maxChannelDelta, backgroundPixels,
    nonBackgroundPixels: total - backgroundPixels, exactAcrossVersions: changedPixels === 0 };
}
describe("실제 제작한 6컷 정본 fixture", () => {
  it("원본 페이지 ID·순서·모든 text/draw/bg와 미확인 사람 점검을 바꾸지 않는다", () => {
    expect(digest(JSON.stringify(fixture.project.pagesList))).toBe(originalPagesHash);
    expect(fixture.source.pagesSha256).toBe(originalPagesHash);
    expect(fixture.project.pagesList.map(p => p.id)).toEqual(pageIds);
    expect(fixture.project.pagesList).toHaveLength(6);
    expect(fixture.project.pagesList.reduce((sum, p) => sum + p.elements.length, 0)).toBe(57);
    expect(fixture.project.aiProvenance.operations).toEqual([]);
    expect(fixture.project.publishPack.compliance.ownershipRightsConfirmed).toBe(false);
    expect(fixture.project.publishPack.compliance.audienceRating).toBeNull();
    for (const reference of fixture.source.referencePngs) {
      const bytes = readFileSync(new URL(`../../corpus/studio/${reference.fileName}`, import.meta.url));
      expect(digest(bytes)).toBe(reference.sha256);
      expect(pngPixels(bytes)).toEqual({ width: reference.width, height: reference.height, rgbaSha256: reference.rgbaSha256 });
      expect(reference.nonBackgroundPixels).toBeGreaterThan(1_000);
      expect(reference.backgroundPixels).toBeGreaterThan(1_000);
    }
  });
});

describe.skipIf(!databaseUrl || !origin)("동일 6컷의 실제 저장·협업·검수·인계와 게시 준비 경계", () => {
  let h: Awaited<ReturnType<typeof createCanvasHarness>>, browser: Browser;
  let owner: Actor, worker: Actor;
  const workIds: string[] = [], openPages: Page[] = [];
  beforeAll(async () => {
    await mkdir(output, { recursive: true });
    h = await createCanvasHarness(databaseUrl!, workIds, origin!, validatePostgresIntegrationUrl);
    [owner, worker] = await registerActors(h);
    await writeFile(join(output, "accounts.json"), JSON.stringify([owner, worker].map(a => ({ email: a.email, password: a.password }))), { mode: 0o600 });
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  }, 180_000);
  afterAll(async () => { await browser?.close(); await h?.close(); });

  async function liveDocument(workId: string): Promise<Record<string, unknown>> {
    const baseline = (await shared(h, workId, owner)).document.doc;
    const sync = await h.crdt.syncBytes(workId), document = new Y.Doc();
    try { Y.applyUpdate(document, sync.update); return documentRecord(materializeStudioAuthoringFromCrdt({ baseline, doc: document })); }
    finally { document.destroy(); }
  }
  async function previews(subject: StudioReviewPreviewSubject, actor = owner) {
    const query = new URLSearchParams(Object.entries(subject).filter(([key]) => !["schemaVersion", "reviewId"].includes(key)).map(([key, value]) => [key, String(value)]));
    const response = await h.request<StudioReviewPreviewResult>(
      `/studio-project-graph/reviews/${subject.reviewId}/previews?${query}`, { cookie: actor.cookie });
    expect(response.status).toBe(200);
    if (!response.body.ok) throw new Error("6컷의 서버 고정 검수 미리보기가 준비되지 않았습니다.");
    const entries = response.body.previews;
    expect(entries).toHaveLength(6);
    expect(entries.map(p => p.ordinal)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(entries.map(p => p.mapping.status === "mapped" ? p.mapping.page.id : null)).toEqual(pageIds);
    return entries;
  }
  it("같은 6page를 실계정 서버에 저장하고 실제 PNG 검수·승인·다음 공정·재로그인까지 보존한다", async () => {
    onTestFailed(async () => {
      for (const [i, page] of openPages.entries()) if (!page.isClosed()) {
        try {
          await page.screenshot({ path: join(output, `failure-${i}.png`), timeout: 15_000 });
          await writeFile(join(output, `failure-${i}.txt`), await page.locator("body").innerText(), { mode: 0o600 });
        } catch (error) {
          await writeFile(join(output, `diagnostic-failure-${i}.json`), JSON.stringify({ errorType: error instanceof Error ? error.name : typeof error }), { mode: 0o600 });
        }
      }
    });
    const created = await h.request<{ id: string }>("/creator/works", { cookie: owner.cookie,
      body: { title: fixture.project.title, description: fixture.project.description, format: "cuttoon", status: "draft", cover: "", pages: [], doc: fixture.project } });
    expect(created.status).toBe(201);
    const workId = created.body.id; workIds.push(workId);
    assertOriginal((await shared(h, workId, owner)).document.doc);
    const team = await h.request("/creator/works/" + workId + "/team", { cookie: owner.cookie, body: { userId: worker.id, role: "editor" } });
    expect(team.status).toBe(201);
    const inbox = await h.request<{ workId: string; invitationId: string }[]>("/creator/team/invitations?limit=50", { cookie: worker.cookie });
    const invitation = inbox.body.find(i => i.workId === workId);
    if (!invitation) throw new Error("6컷 작품의 실제 초대가 없습니다.");
    expect((await h.request(`/creator/works/${workId}/team/invitations/respond`, { cookie: worker.cookie,
      body: { action: "accept", invitationId: invitation.invitationId } })).status).toBe(201);
    const production = await sixPageProduction(h, owner, worker, workId);

    // 최초 원고 등록은 공개 API, CRDT 초기 상태는 앱의 실제 Web serializer를 사용한다.
    const setup = await browser.newPage();
    await setup.goto(origin!, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const initialUpdates = await setup.evaluate<number[][]>(`(async source => {
      const prefix='/src/domains/creator/live/';
      const {StudioCrdtDocument}=await import(prefix+'studio-crdt-document.ts');
      const bridge=await import(prefix+'studio-crdt-page-bridge.ts');
      const doc=new StudioCrdtDocument(), updates=[]; let vector=doc.encodeStateVector();
      const capture=()=>{updates.push(Array.from(doc.encodeStateAsUpdate(vector)));vector=doc.encodeStateVector();};
      try { for(const page of source.pagesList) {doc.addPage(bridge.studioPageToCrdtPage(page));capture();
        for(const e of page.elements) {if(e.type==='draw')doc.addStroke(bridge.studioDrawElementToCrdtStroke(page.id,e));
        else doc.addSceneElement(bridge.studioElementToCrdtSceneElement(page.id,e));capture();}}
        return updates;
      } finally {doc.destroy();}
    })(${JSON.stringify(fixture.project)})`);
    await setup.close();
    const initial = await shared(h, workId, owner), document = new Y.Doc();
    try {
      for (const bytes of initialUpdates) Y.applyUpdate(document, Uint8Array.from(bytes));
      const canonical = documentRecord(materializeStudioAuthoringFromCrdt({ baseline: initial.document.doc, doc: document }));
      assertOriginal(canonical);
      // 6페이지 전체 snapshot을 한 update로 보내지 않는다. 제품의 기존 update 예산 안에서 순서대로 등록한다.
      let serverSequence = "0";
      for (const bytes of initialUpdates) {
        const seeded = await h.crdt.applyUpdateBytes({ workId, actorUserId: owner.id, updateId: crypto.randomUUID(), data: Uint8Array.from(bytes) });
        serverSequence = seeded.serverSequence;
      }
      expect((await h.request(`/creator/works/${workId}/team/document`, { method: "PATCH", cookie: owner.cookie,
        body: { baseRevision: initial.revision, crdtServerSequence: serverSequence, doc: canonical } })).status).toBe(200);
    } finally { document.destroy(); }
    const manager = await openSixPageCanvas(browser, h, owner, workId, origin!); openPages.push(manager.page);
    const firstSnapshot = await exportSixPageSnapshot(manager.page, join(output, "owner-before.json"));
    assertOriginal(firstSnapshot);
    const payloadKeys = [...new Set([...Object.keys(fixture.project), ...Object.keys(firstSnapshot)])];
    const payloadDifferenceFields = payloadKeys.filter(key => JSON.stringify(Reflect.get(fixture.project, key)) !== JSON.stringify(firstSnapshot[key]));
    expect(payloadDifferenceFields.filter(key => key !== "savedAt")).toEqual([]);
    const baselinePngs = await downloadSixPagePngs(manager.page, output, "candidate-current-baseline");
    const currentBaseline = baselinePngs.map((bytes, i) => {
      const historical = readFileSync(new URL(`../../corpus/studio/${fixture.source.referencePngs[i].fileName}`, import.meta.url));
      const comparison = compareHistoricalPixels(bytes, historical, fixture.project.pagesList[i].bg);
      expect(comparison.backgroundPixels).toBeGreaterThan(1_000); expect(comparison.nonBackgroundPixels).toBeGreaterThan(1_000);
      return { pageId: pageIds[i], ...pngPixels(bytes), historicalComparison: comparison };
    });
    const exportRendererReceipts: (SixPageRendererReceipt & { pageId: string })[] = [];
    for (const [index, source] of fixture.project.pagesList.entries()) {
      const expected = currentBaseline[index];
      if (!expected) throw new Error("같은 컷의 UI 내보내기 기준본이 없습니다.");
      const receipt = await captureSixPageRendererReceipt(manager.page, source);
      expect(receipt).toMatchObject({ status: "captured", backend: "skia-document", rgbaSha256: expected.rgbaSha256, reason: null });
      exportRendererReceipts.push({ pageId: source.id, ...receipt });
    }
    await writeFile(join(output, "candidate-current-baseline.json"), JSON.stringify({ payloadDifferenceFields, currentBaseline,
      exportRendererReceipts, historicalBaselineMain: "8d315c85d6fde4a3a30255612c756d3e299a95b0", crossVersionPixelEqualityClaimed: false }, null, 2));
    const collaborator = await openSixPageCanvas(browser, h, worker, workId, origin!); openPages.push(collaborator.page);
    assertOriginal(await exportSixPageSnapshot(collaborator.page, join(output, "worker-before.json")));
    const baselineCount = fixture.project.pagesList.at(-1)!.elements.length;
    const lastElementCount = async () => {
      const doc = await liveDocument(workId), pages: unknown = doc.pagesList;
      if (!Array.isArray(pages)) throw new Error("서버 6페이지가 없습니다.");
      const last: unknown = pages.at(-1); if (!last || typeof last !== "object") throw new Error("마지막 컷이 없습니다.");
      const elements: unknown = Reflect.get(last, "elements"); if (!Array.isArray(elements)) throw new Error("마지막 컷 요소가 없습니다.");
      return elements.length;
    };
    await temporaryPointer(collaborator.page);
    await expect.poll(lastElementCount, { timeout: 30_000 }).toBe(baselineCount + 1);
    await (await enabledStudioHistoryControl(collaborator.page, "undo")).click();
    await expect.poll(lastElementCount, { timeout: 30_000 }).toBe(baselineCount);
    await (await enabledStudioHistoryControl(collaborator.page, "redo")).click();
    await expect.poll(lastElementCount, { timeout: 30_000 }).toBe(baselineCount + 1);
    await (await enabledStudioHistoryControl(collaborator.page, "undo")).click();
    await expect.poll(lastElementCount, { timeout: 30_000 }).toBe(baselineCount);
    assertOriginal(await liveDocument(workId)); expect(collaborator.proof.updateAcks).toBeGreaterThan(0);
    const beforeSave = (await shared(h, workId, owner)).revision;
    await collaborator.page.getByRole("button", { name: "공동 저장", exact: true }).click();
    await expect.poll(async () => (await shared(h, workId, owner)).revision, { timeout: 30_000 }).toBeGreaterThan(beforeSave);
    assertOriginal((await shared(h, workId, owner)).document.doc);
    await collaborator.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await collaborator.page.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
    assertOriginal(await exportSixPageSnapshot(collaborator.page, join(output, "worker-reloaded.json")));

    await manager.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await manager.page.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
    const subject = await captureSixPageReview(manager.page), captured = await previews(subject);
    const pixelProof = [];
    for (const preview of captured) {
      const bytes = h.readPrivateObjectBytes(`sha256:${preview.sha256}`);
      if (!bytes) throw new Error("실제 업로드한 6컷 PNG가 없습니다.");
      expect(digest(bytes)).toBe(preview.sha256); expect(bytes.byteLength).toBe(preview.byteLength);
      const pixels = pngPixels(bytes), reference = currentBaseline[preview.ordinal];
      if (!reference) throw new Error("원본 컷 PNG 근거가 없습니다.");
      await writeFile(join(output, `review-cut-${preview.ordinal + 1}.png`), bytes);
      await writeFile(join(output, `review-pixels-${preview.ordinal + 1}.json`), JSON.stringify({ pageId: pageIds[preview.ordinal], actual: pixels, reference }));
      expect(pixels).toEqual({ width: reference.width, height: reference.height, rgbaSha256: reference.rgbaSha256 });
      pixelProof.push({ pageId: pageIds[preview.ordinal], ordinal: preview.ordinal, sha256: preview.sha256,
        ...pixels, matchesCurrentCandidateBaselinePixels: true });
    }
    const query = new URLSearchParams({ view: "versions", sharedReview: subject.reviewId, artifact: subject.artifactId,
      revision: subject.revisionId, digest: subject.rootGraphHash, graphProject: subject.projectId });
    await manager.page.bringToFront();
    await manager.page.goto(`${origin}/studio/p/${workId}/review?${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const pinned = manager.page.getByRole("region", { name: "고정된 검수본", exact: true });
    await pinned.waitFor({ timeout: 120_000 });
    for (let i = 0; i < 6; i++) {
      const image = manager.page.getByRole("img", { name: `검수 미리보기 ${i + 1}`, exact: true });
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 2), { timeout: 30_000 }).toBe(true);
    }
    await manager.page.screenshot({ path: join(output, "same-six-review.png") });
    const context = await production.configure(subject, fixture.project.pagesList);
    const approved = await production.approve(subject, pageIds, context);
    await collaborator.page.bringToFront();
    await collaborator.page.goto(`${origin}/production/projects/${production.projectId}/settings`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await collaborator.page.getByText("실제 원고의 담당 편집 범위 배정", { exact: true }).click();
    const pipeline = collaborator.page.getByRole("region", { name: "실제 직군별 원고 보호", exact: true });
    await pipeline.getByRole("button", { name: "승인된 제출을 확인하고 실제 다음 공정으로 인계", exact: true }).click();
    await expect.poll(async () => (await production.policy(worker)).rolePipeline?.activeStageId).toBe("storyboard-conte");
    expect((await production.policy(worker)).rolePipeline?.frozenStageIds).toContain("story-script");
    assertOriginal((await shared(h, workId, owner)).document.doc);

    for (const actorPage of [manager, collaborator]) {
      expect((await actorPage.context.request.post(`${origin}/api/auth/logout`, { headers: { Origin: origin!, "x-toonstudio-csrf": "1" }, data: {} })).status()).toBe(201);
      await actorPage.context.close();
    }
    const reopenedOwner = await openSixPageCanvas(browser, h, owner, workId, origin!); openPages.push(reopenedOwner.page);
    const reopenedWorker = await openSixPageCanvas(browser, h, worker, workId, origin!); openPages.push(reopenedWorker.page);
    assertOriginal(await exportSixPageSnapshot(reopenedOwner.page, join(output, "owner-relogged.json")));
    assertOriginal(await exportSixPageSnapshot(reopenedWorker.page, join(output, "worker-relogged.json")));
    expect((await production.policy(worker)).rolePipeline?.activeStageId).toBe("storyboard-conte");
    const stablePreviews = await previews(subject, worker);
    expect(stablePreviews.map(p => p.sha256)).toEqual(captured.map(p => p.sha256));
    const reopenedPngs = await downloadSixPagePngs(reopenedOwner.page, output);
    for (const [i, bytes] of reopenedPngs.entries()) expect(pngPixels(bytes)).toEqual({
      width: pixelProof[i].width, height: pixelProof[i].height, rgbaSha256: pixelProof[i].rgbaSha256 });

    await reopenedOwner.page.getByRole("menuitem", { name: "파일", exact: true }).click();
    await reopenedOwner.page.getByRole("menuitem", { name: "게시 패키지…", exact: true }).click();
    const packageDialog = reopenedOwner.page.getByRole("dialog").filter({ has: reopenedOwner.page.getByRole("heading", { name: "Publish Package", exact: true }) }); await packageDialog.waitFor();
    const exportButton = packageDialog.getByRole("button", { name: "패키지 내보내기", exact: true });
    expect(await exportButton.isDisabled()).toBe(true);
    await writeFile(join(output, "workflow-before-package-proof.json"), JSON.stringify({
      status: "same-six-workflow-passed-technical-package-pending", source: fixture.source, workId,
      currentBaseline, pixels: pixelProof, pointerUndoRedoUndoRestored: true,
      bothAccountsRelogged: true, actualSixPageReview: subject, approvedSubmission: approved,
      activeStage: "storyboard-conte", reloggedCanvasPixelsMatchCurrentBaseline: true,
      humanPublicationChecksConfirmed: false, uiPackageBlocked: true,
    }, null, 2));
    const technical = await technicalPackage(reopenedOwner.page, stablePreviews.map(p => ({ pageId: pageIds[p.ordinal], url: p.url })), fixture.project.publishPack.packageSettings);
    const zip = Uint8Array.from(technical.bytes), files = unzipSync(zip);
    await writeFile(join(output, "same-six-technical-review-draft.zip"), zip);
    for (const file of technical.files) {
      expect(files[file.fileName]?.byteLength).toBe(file.byteSize); expect(digest(files[file.fileName])).toBe(file.sha256);
    }
    expect(technical.episodeFiles.map(f => f.sourcePageId)).toEqual(pageIds);
    for (const [i, file] of technical.episodeFiles.entries()) expect(pngPixels(files[file.fileName])).toEqual({
      width: pixelProof[i].width, height: pixelProof[i].height, rgbaSha256: pixelProof[i].rgbaSha256 });
    expect(technical.manifest.totals.episodeImageCount).toBe(6);
    expect((await shared(h, workId, owner)).document.doc.publishPack).toEqual(fixture.project.publishPack);
    await writeFile(join(output, "flow-proof.json"), JSON.stringify({ status: "passed-with-human-publication-gate", source: fixture.source,
      admission: "공개 API로 새 서버 작품에 등록했다. 원본 로컬 프로젝트와 같은 ID라는 주장이 아니다.", workId,
      initialCrdtUpdates: { count: initialUpdates.length, maxBytes: Math.max(...initialUpdates.map(bytes => bytes.length)), budgetUnchanged: true },
      candidateCurrentBaseline: { payloadDifferenceFields, pages: currentBaseline, strictCurrentWorkflowComparison: true,
        crossVersionPixelEqualityClaimed: false, historicalBaselineMain: "8d315c85d6fde4a3a30255612c756d3e299a95b0" },
      pagesDeepEqual: true, pixels: pixelProof, exportRendererReceipts, pointerUndoRedoUndoRestored: true, workerLive: collaborator.proof,
      bothAccountsReloadedAndRelogged: true, actualSixPageReview: subject, approvedSubmission: approved,
      activeStage: "storyboard-conte", originalProvenancePreserved: true, sourceHistoryJournalPresent: false,
      humanPublicationChecksConfirmed: false, uiPackageBlocked: true,
      reloggedCanvasPixelsMatchCurrentBaseline: true, packagePixelsMatchCapturedCurrentBaseline: true,
      technicalPackage: { bytes: zip.byteLength, sha256: digest(zip), files: technical.files, manifest: technical.manifest },
      limitations: ["외부 메일과 private object storage는 기존 시험 port", "기술 ZIP은 공개 허가나 사람의 권리·등급 확인을 나타내지 않는다"] }, null, 2));
  }, 600_000);
});
