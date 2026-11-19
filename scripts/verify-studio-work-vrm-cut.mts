/** 준비된 로컬 QA 웹·API·PostgreSQL·비공개 객체 저장소에서 실제 팀 컷을 저장하고 다시 연다. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@playwright/test";
import pg from "pg";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";

import { validateIsolatedMarketApiTarget } from "./isolated-market-api.mjs";
import { openStudioBg3dEnginePanel, openStudioBg3dProfessionalMode } from "./lib/studio-bg3d-ui-interactions";
import { openStudioLayerNavigator } from "./lib/studio-shell-interactions";
import { confirmStudioVrmCutRights, editStudioVrmCutChannels, paintStudioVrmCut, verifyStudioVrmCutBytes } from "./lib/studio-vrm-cut-paint-qa";
import { createStudioReviewHostActor, createStudioReviewHostFixture, inviteStudioReviewHostEditor, STUDIO_REVIEW_HOST_TITLE } from "./studio-review-host-steps";

const root = fileURLToPath(new URL("../", import.meta.url));
const sixPass = process.argv.includes("--six-pass");
const painted = sixPass || process.argv.includes("--painted");
const modelPath = path.resolve(root, "apps/web/public/vrm/Avatar_Orion.vrm");
const cutName = "팀 컷 원본 검증";
const timeout = 120_000;
const output = path.resolve(root, process.env.STUDIO_QA_OUTPUT ?? ".qa/studio-work-vrm-cut");

async function manuscript(context: BrowserContext, origin: URL, workId: string, errors: string[]) {
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(timeout);
  await page.goto(`${origin.origin}/studio/work/${encodeURIComponent(workId)}/canvas?language=ko`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: STUDIO_REVIEW_HOST_TITLE, exact: true }).waitFor();
  await page.getByTitle("전체 도구 35종 한눈에 열기", { exact: true }).waitFor();
  return page;
}

async function placeCharacter(page: Page) {
  await page.getByTitle("전체 도구 35종 한눈에 열기", { exact: true }).click();
  await page.getByRole("dialog", { name: "전체 도구", exact: true }).locator('button[data-studio-catalog-tool-id="vrm3d"]').click();
  const poser = page.locator("[data-studio-vrm-dialog]").filter({ visible: true });
  await poser.locator("canvas").first().waitFor();
  const authoredPixels = painted ? await paintStudioVrmCut(page, poser, modelPath, output) : {};
  const add = poser.getByRole("button", { name: /이 포즈로 추가/u });
  // 바탕 모델의 첫 프레임과 비동기 의상 평가가 동시에 끝나면 첫 캡처가 취소될 수 있다.
  await expect(async () => {
    if (await poser.isVisible()) await add.click();
    await expect(poser).toBeHidden({ timeout: 8_000 });
  }).toPass({ timeout });
  return authoredPixels;
}

async function openCutPanel(page: Page) {
  await page.getByTitle("3D 배경·캐릭터 배치 · 3", { exact: true }).click();
  const dialog = page.getByTestId("studio-bg3d-dialog");
  await openStudioBg3dProfessionalMode(dialog, timeout);
  await openStudioBg3dEnginePanel(dialog, timeout);
  const webgl = dialog.getByTestId("studio-bg3d-engine-preference-webgl2").filter({ visible: true }).first();
  if (await webgl.getAttribute("aria-pressed") !== "true") await webgl.click();
  await dialog.getByTestId("studio-bg3d-viewport").locator("canvas").first().waitFor();
  const panel = dialog.getByTestId("scene3d-cut-panel").filter({ visible: true }).first();
  await panel.waitFor();
  if (await panel.getAttribute("open") === null) await panel.locator(":scope > summary").click();
  return { panel, dialog };
}

async function readPinnedCut(panel: Locator) {
  const backup = panel.locator("details").filter({ hasText: "JSON 백업 다운로드" }).last();
  if (await backup.getAttribute("open") === null) await backup.locator(":scope > summary").click();
  await panel.getByRole("button", { name: "JSON 백업 다운로드", exact: true }).click();
  type Cut = { name: string; id: string; sourceHash: string; source: { linkedVrm?: { characters: { elementId: string; vrmScene: { model: { id?: string; hash?: string; source: string }; surfacePaint: { textures: { textureSlot: string; materialLocator: string; hash: string; byteSize: number }[] } } }[] } } };
  const value = JSON.parse(await panel.locator("textarea").inputValue()) as { shotVersions: { cuts: Cut[] } };
  const cut = value.shotVersions.cuts.find(c => c.name === cutName);
  const source = cut?.source.linkedVrm?.characters[0];
  assert(cut?.id && cut.sourceHash && source?.elementId);
  if (painted) {
    assert.equal(source.vrmScene.model.source, "attachment");
    assert.match(source.vrmScene.model.hash ?? "", /^sha256:[0-9a-f]{64}$/u);
  }
  else assert.equal(source.vrmScene.model.id, "sample-vrm");
  return { id: cut.id, hash: cut.sourceHash, elementId: source.elementId, modelId: source.vrmScene.model.id ?? source.vrmScene.model.hash, textures: source.vrmScene.surfacePaint.textures };
}

async function verify() {
  const target = validateIsolatedMarketApiTarget({ rawApiUrl: process.env.STUDIO_QA_BASE_URL,
    rawDatabaseUrl: process.env.TEST_DATABASE_URL });
  const origin = new URL(target.apiOrigin);
  const ready = await fetch(new URL("/api/health/ready", origin));
  assert.equal(ready.status, 200, "QA DB를 공식 부트스트랩하고 API의 준비 상태를 확인해 주세요.");
  const caps = await fetch(new URL("/api/health/capabilities", origin)).then(r => r.json());
  assert.equal(caps.capabilities?.studioCloudSave, "available");
  assert.equal(caps.capabilities?.realtimeCollaboration, "available");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true, isLocal: true, timeout });
  const pool = new pg.Pool({ connectionString: target.databaseUrl, max: 1 });
  const contexts: BrowserContext[] = [];
  async function freshContext() {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR" });
    contexts.push(c);
    return c;
  }
  const errors: string[] = [];
  await mkdir(output, { recursive: true });
  let page: Page | undefined;
  try {
    const owner = await freshContext(), editor = await freshContext(), outsider = await freshContext();
    const { workId, initialSaved, headers } = await createStudioReviewHostFixture(owner, pool, origin);
    const pageId = initialSaved.document.doc.currentPageId;
    await inviteStudioReviewHostEditor(owner, editor, pool, origin, workId, headers);
    await createStudioReviewHostActor(outsider, pool, origin);
    page = await manuscript(owner, origin, workId, errors);
    const authoredPixels = await placeCharacter(page);
    console.log("소유자가 포저에서 캐릭터를 원고에 배치했습니다.");
    const a = await openCutPanel(page);
    await a.panel.getByLabel("컷 이름", { exact: true }).fill(cutName);
    await a.panel.getByRole("button", { name: "현재 장면으로 컷 만들기", exact: true }).click();
    await a.panel.getByRole("button", { name: "이 컷으로 복귀", exact: true }).click();
    const before = await readPinnedCut(a.panel);
    await page.screenshot({ path: path.join(output, "owner-fixed.png") });
    const prefix = `/api/creator/works/${workId}/vrm-cuts/`;
    const [published] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname.startsWith(prefix) && r.request().method() === "PUT"),
      (async () => {
        await a.dialog.getByRole("button", { name: "팀에 새 컷 레이어 저장", exact: true }).click();
        if (painted) await confirmStudioVrmCutRights(page!);
      })(),
    ]);
    assert.equal(published.status(), 200, "실제 팀 컷 PUT이 성공해야 합니다.");
    const receipt = await published.json();
    assert.equal(receipt.workId, workId);
    assert.equal(receipt.pageId, pageId);
    const { anchorId, sceneSha256 } = receipt;
    const workApi = new URL(`/api/creator/works/${workId}`, origin).href;
    const originals = painted ? await verifyStudioVrmCutBytes(owner, workApi, modelPath, before.textures, receipt.attachments, authoredPixels) : null;
    assert.equal(new URL(published.url()).pathname, prefix + anchorId);
    await a.dialog.waitFor({ state: "hidden" });
    console.log("팀 컷 영수증을 확인하고 원고로 돌아왔습니다.");
    await page.locator('button[data-studio-clarity-save="true"]').filter({ visible: true }).click();
    const documentUrl = new URL(`/api/creator/works/${workId}/team/document`, origin).href;
    await expect.poll(async () => {
      const response = await editor.request.get(documentUrl);
      assert.equal(response.status(), 200);
      const doc = await response.json();
      const saved = (doc.document.doc.pagesList as { id: string; elements: { id: string; type: string }[] }[]).find(p => p.id === pageId);
      return doc.revision > initialSaved.revision && saved?.elements.some(e => e.id === anchorId && e.type === "image");
    }, { timeout, message: "팀원이 읽은 서버 원고에 새 이미지 레이어가 저장돼야 합니다." }).toBe(true);
    console.log("팀원이 새로 읽은 서버 원고에 고정 컷이 저장됐습니다.");
    await page.screenshot({ path: path.join(output, "owner-saved.png") });
    page = await manuscript(editor, origin, workId, errors);
    await openStudioLayerNavigator(page, timeout);
    const row = page.locator("[data-studio-layer-row]").filter({ hasText: cutName, visible: true });
    await row.click({ position: { x: 12, y: 18 } });
    await expect(row).toHaveAttribute("data-studio-layer-selected", "true");
    const [read, b] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === prefix + anchorId && r.request().method() === "GET"),
      openCutPanel(page),
    ]);
    assert.equal(read.status(), 200);
    const received = await read.json();
    assert.equal(received.sceneSha256, sceneSha256);
    await b.panel.getByRole("button", { name: "이 컷으로 복귀", exact: true }).click();
    const after = await readPinnedCut(b.panel);
    assert.deepEqual(after, before);
    if (painted) assert.deepEqual(await verifyStudioVrmCutBytes(editor, workApi, modelPath, after.textures, received.attachments, authoredPixels), originals);
    await page.screenshot({ path: path.join(output, "teammate-restored.png") });
    let editedAnchor: string | undefined;
    let sixPassBundle;
    if (sixPass) {
      const { verifyPaintedSixPass } = await import("./lib/studio-vrm-cut-six-pass-qa");
      sixPassBundle = await verifyPaintedSixPass({page, dialog: b.dialog, reopen: () => openCutPanel(page!), owner, outsider, workId, pageId, cutId: anchorId, sceneSha256, output, origin: origin.origin});
    } else if (painted) {
      await b.dialog.getByRole("button", { name: /새 버전으로 편집/u }).filter({ visible: true }).first().click();
      const poser = page.getByRole("dialog", { name: "팀 컷 표면 채색" });
      const editedPixels = await editStudioVrmCutChannels(poser, output, "teammate");
      await poser.getByRole("button", { name: "새 컷 버전에 적용", exact: true }).click();
      await expect(poser).toBeHidden({ timeout });
      await openStudioBg3dProfessionalMode(b.dialog, timeout);
      const [updated] = await Promise.all([
        page.waitForResponse(r => new URL(r.url()).pathname.startsWith(prefix) && r.request().method() === "PUT"),
        (async () => {
          await b.dialog.getByRole("button", { name: "팀에 새 컷 레이어 저장", exact: true }).click();
          await confirmStudioVrmCutRights(page!);
        })(),
      ]);
      assert.equal(updated.status(), 200);
      const revised = await updated.json();
      editedAnchor = revised.anchorId;
      assert(editedAnchor);
      assert.notEqual(editedAnchor, anchorId);
      const changed = revised.scene.pinnedVersionedCut.source.linkedVrm.characters[0].vrmScene;
      assert.equal(changed.model.hash, before.modelId);
      for (const original of before.textures) {
        const next = changed.surfacePaint.textures.find((entry: typeof original) => entry.materialLocator === original.materialLocator && entry.textureSlot === original.textureSlot);
        assert(next);
        assert.notEqual(next.hash, original.hash);
      }
      await verifyStudioVrmCutBytes(owner, workApi, modelPath, changed.surfacePaint.textures, revised.attachments, editedPixels);
      const preserved = await owner.request.get(`${workApi}/vrm-cuts/${anchorId}`);
      assert.equal((await preserved.json()).sceneSha256, sceneSha256);
      await writeFile(path.join(output, "teammate-revision.json"), JSON.stringify({originalAnchor:anchorId, editedAnchor, preservedHash:sceneSha256,
        model: changed.model.hash, editedPixels, textures: changed.surfacePaint.textures, sceneSha256:revised.sceneSha256}, null, 2));
      console.log("팀원이 다섯 채널을 수정한 새 앵커와 원본을 읽었습니다.");
      const save = page.locator('button[data-studio-clarity-save="true"]').filter({visible: true});
      if (await b.dialog.isVisible()) {
        await b.dialog.getByRole("button", { name: "2D 원고로 복귀", exact:true }).click();
      }
      await expect(b.dialog).toBeHidden({timeout});
      await save.click();
      await expect.poll(async () => {
        const reloaded = await owner.request.get(documentUrl);
        const payload = await reloaded.json();
        const currentPage = (payload.document.doc.pagesList as { id: string; elements: { id: string }[] }[]).find(p => p.id === pageId);
        return currentPage?.elements.filter(e => e.id === anchorId || e.id === editedAnchor).length;
      }, { timeout }).toBe(2);
      await page.screenshot({path:path.join(output, "teammate-saved.png")});
      console.log("팀원이 다섯 표면 채널을 새 컷으로 저장했고 작성자의 원본 영수증은 그대로였습니다.");
    }
    const deniedDocument = await outsider.request.get(documentUrl);
    const deniedCut = await outsider.request.get(new URL(prefix + anchorId, origin).href);
    assert.equal(deniedDocument.status(), 403);
    assert.equal(deniedCut.status(), 403);
    if (originals) {
      for (const [assetId, asset] of Object.entries(originals)) {
        const denied = await outsider.request.get(`${workApi}/assets/${encodeURIComponent(assetId)}/content?elementType=${asset.elementType}`);
        assert.equal(denied.status(), 403);
      }
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "report.json"), JSON.stringify({
      passed: true, workId, pageId, anchorId, sceneSha256, before, after, authoredPixels, originals, editedAnchor, sixPassBundle, unrelated: [deniedDocument.status(), deniedCut.status()], pageErrors: errors,
    }, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(output, "failure.png"), timeout: 10_000 }).catch(() => undefined);
    throw error;
  } finally {
    await Promise.allSettled(contexts.map(c => c.close()));
    await pool.end();
    await browser.close();
  }
}
await verify();
