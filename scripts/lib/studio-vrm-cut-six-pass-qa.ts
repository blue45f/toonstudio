import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { expect } from "@playwright/test";
import { parseStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { decodePng } from "image-js";

import { openStudioBg3dProfessionalMode } from "./studio-bg3d-ui-interactions";
import { openStudioLayerNavigator } from "./studio-shell-interactions";
import { confirmStudioVrmCutRights, editStudioVrmCutChannels, verifyStudioVrmCutBytes } from "./studio-vrm-cut-paint-qa";

import type { BrowserContext, Locator, Page } from "playwright";

/** 팀원이 복원한 WebGL2 컷에서 실제 분리 패스를 만들고 작품 소유자가 각 원본을 다시 받는다. */
export async function verifyPaintedSixPass(options: {
  page: Page; dialog: Locator; owner: BrowserContext; outsider: BrowserContext;
  reopen(): Promise<{ dialog: Locator; panel: Locator }>;
  origin: string; workId: string; pageId: string; cutId: string; sceneSha256: string; output: string;
}) {
  const { page, dialog, owner, outsider, workId, pageId, cutId, sceneSha256, output } = options;
  const base = new URL(`/api/creator/works/${workId}/bg3d-bundles/`, options.origin);
  const capability = await owner.request.get(new URL("capabilities?manifestVersion=2", base).href);
  assert.equal(capability.status(), 200);
  const support = await capability.json();
  assert.equal(support.readerCapability, "bg3d-sixpass-bundle.v2", "실제 배포된 QA API에 v2 읽기·봉인 기능이 필요합니다.");
  assert.equal(support.enabled, true);

  const format = dialog.getByRole("combobox", { name: "원고 출력 형식" });
  await format.selectOption("six-pass");
  await expect(format).toHaveValue("six-pass");
  await page.screenshot({ path: path.join(output, "teammate-six-pass-enabled.png") });

  const onSeal = page.waitForResponse(r => {
    const requestPath = new URL(r.url()).pathname;
    return requestPath.startsWith(base.pathname) && requestPath.endsWith("/seal") && r.request().method() === "PUT";
  }, {timeout: 120_000});
  const saveButton = dialog.getByRole("button", { name: /^고정 컷 6패스 (저장|추가)$/u });
  const commitFailure = dialog.getByRole("alert").filter({hasText:/6패스|원본|캡처|레이어 잠금|장면이 변경|편집 문서가 변경/u}).first();
  const [seal] = await Promise.all([Promise.race([onSeal, commitFailure.waitFor({ state: "visible", timeout: 120_000 }).then(async () => {
    throw new Error(await commitFailure.innerText());
  })]), saveButton.click()]);
  assert.equal(seal.status(), 200);
  const record = await seal.json();
  const manifest = parseStudioBg3dSixPassBundleManifest(record.manifest);
  assert.equal(manifest.version, 2);
  assert.equal(manifest.pageId, pageId);
  assert.equal(record.state, "sealed");
  assert.equal(manifest.workVrmCut.anchorId, cutId);
  assert.equal(manifest.workVrmCut.sceneSha256, sceneSha256);
  assert.equal(new Set(record.uploadedRoles).size, 7);
  const revision = new URL(`${encodeURIComponent(manifest.bundleId)}/revisions/${encodeURIComponent(manifest.renderRevisionId)}`, base).href;
  assert.equal((await outsider.request.get(revision)).status(), 403);
  const ownerRead = await owner.request.get(revision);
  assert.equal(ownerRead.status(), 200);
  assert.deepEqual((await ownerRead.json()).manifest, manifest);
  async function readArtifact(location: string, role: string, descriptor: { byteSize: number; contentHash: string }) {
    const result = await owner.request.get(`${location}/artifacts/${role}`);
    assert.equal(result.status(), 200);
    const locator = await result.json();
    assert.equal(locator.role, role);
    const signed = new URL(locator.signedRead.url);
    assert(["localhost", "127.0.0.1", "[::1]"].includes(signed.hostname), "QA 원본은 로컬 비공개 스토리지에서만 읽습니다.");
    const raw = await fetch(signed, { redirect: "error", credentials: "omit" });
    assert.equal(raw.status, 200);
    const bytes = Buffer.from(await raw.arrayBuffer());
    assert.equal(bytes.length, descriptor.byteSize);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, descriptor.contentHash);
    return bytes;
  }
  async function downloadLayers(current: typeof manifest, location: string, prefix: string) {
    const scene = await readArtifact(location, "scene", current.scene);
    assert(JSON.parse(scene.toString("utf8")).pinnedVersionedCut.source.linkedVrm.characters.length > 0);
    await writeFile(path.join(output, `${prefix}-scene.json`), scene);
    const payloads = new Map<string, Buffer>();
    for (const {role, artifact} of current.layers) {
      const png = await readArtifact(location, role, artifact);
      assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(png.readUInt32BE(16), current.width);
      assert.equal(png.readUInt32BE(20), current.height);
      await writeFile(path.join(output, `${prefix}-${role}.png`), png);
      payloads.set(role, png);
    }
    return payloads;
  }
  const originalLayers = await downloadLayers(manifest, revision, "six-pass");
  await writeFile(path.join(output, "six-pass-manifest.json"), JSON.stringify(manifest, null, 2));
  await expect(dialog).toBeHidden({timeout: 60_000});
  await page.screenshot({ path: path.join(output, "teammate-six-pass-inserted.png") });
  const documentUrl = new URL(`/api/creator/works/${workId}/team/document`, options.origin).href;
  const v2Reader = { "x-studio-reader-capabilities": JSON.stringify([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_BG3D_SIX_PASS_VRM_BUNDLE_CAPABILITY]) };
  async function savedRevisionIds() {
    const response = await owner.request.get(documentUrl, { headers: v2Reader });
    assert.equal(response.status(), 200);
    const pages = (await response.json()).document.doc.pagesList as Array<{ id: string; elements: Array<{ id: string; bg3dLtBundleReference?: { renderRevisionId: string } }> }>;
    const saved = pages.find(item => item.id === pageId);
    assert(saved);
    return saved.elements.filter(element => manifest.layers.some(layer => layer.elementId === element.id)).map(element => element.bg3dLtBundleReference?.renderRevisionId);
  }
  async function saveManuscript(revisionId: string) {
    await page.locator('button[data-studio-clarity-save="true"]').filter({ visible: true }).click();
    await expect.poll(savedRevisionIds, { timeout: 120_000 }).toEqual(Array(6).fill(revisionId));
  }
  await saveManuscript(manifest.renderRevisionId);
  assert.equal((await owner.request.get(documentUrl)).status(), 409, "읽기 버전을 알리지 않은 계정은 보호된 원고를 열 수 없습니다.");
  assert.equal((await owner.request.get(documentUrl, {headers:{"x-studio-reader-capabilities":JSON.stringify([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY])}})).status(), 409);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openStudioLayerNavigator(page, 120_000);
  const row = page.locator("[data-studio-layer-row]").filter({ hasText: "3D LT · 주선", visible: true }).first();
  if (!await row.isVisible()) {
    const expand = page.getByRole("button", { name: /3D LT 배경.*그룹 펼치기/u }).first();
    if (await expand.isVisible()) await expand.click();
  }
  await row.getByText("3D LT · 주선", { exact: true }).click();
  await expect(row).toHaveAttribute("data-studio-layer-selected", "true");
  const reopened = await options.reopen();
  await expect(reopened.dialog.getByRole("button", { name: "고정 컷 6패스 저장" })).toBeVisible();
  await page.screenshot({ path: path.join(output, "six-pass-reopened.png") });
  await reopened.dialog.getByRole("button", { name: /새 버전으로 편집/u }).filter({ visible: true }).first().click();
  const poser = page.getByRole("dialog", { name: "팀 컷 표면 채색" });
  const editedChannels = await editStudioVrmCutChannels(poser, output, "teammate");
  await poser.getByRole("button", { name: "새 컷 버전에 적용", exact: true }).click();
  await expect(poser).toBeHidden({ timeout: 60_000 });
  await openStudioBg3dProfessionalMode(reopened.dialog, 60_000);
  // 두 버전의 실제 밑색 차이를 비교할 수 있도록 카메라와 조명은 그대로 둔다.
  const [updated] = await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname.startsWith(base.pathname) && new URL(r.url()).pathname.endsWith("/seal") && r.request().method() === "PUT", { timeout: 120_000 }),
    (async () => {
      await reopened.dialog.getByRole("button", { name: "고정 컷 6패스 저장" }).click();
      await confirmStudioVrmCutRights(page);
    })(),
  ]);
  assert.equal(updated.status(), 200);
  const revised = parseStudioBg3dSixPassBundleManifest((await updated.json()).manifest);
  assert.equal(revised.version, 2);
  assert.equal(revised.bundleId, manifest.bundleId);
  assert.equal(revised.parentRevisionId, manifest.renderRevisionId);
  assert.notEqual(revised.workVrmCut.anchorId, manifest.workVrmCut.anchorId);
  assert.deepEqual(revised.layers.map(layer => layer.elementId), manifest.layers.map(layer => layer.elementId));
  assert.notEqual(revised.layers.find(layer => layer.role === "color")?.artifact.contentHash, manifest.layers.find(layer => layer.role === "color")?.artifact.contentHash);
  const nextUrl = new URL(`${encodeURIComponent(revised.bundleId)}/revisions/${encodeURIComponent(revised.renderRevisionId)}`, base).href;
  const revisedLayers = await downloadLayers(revised, nextUrl, "six-pass-revised");
  const changedPixels: Record<string, number> = {};
  for (const [role, bytes] of originalLayers) {
    const before = decodePng(bytes), after = decodePng(revisedLayers.get(role)!);
    assert.equal(before.width, after.width);
    assert.equal(before.height, after.height);
    let changed = 0;
    for (let i = 0; i < before.size; i++) {
      for (let channel = 0; channel < before.channels; channel++) {
        if (before.getValueByIndex(i, channel) === after.getValueByIndex(i, channel)) continue;
        changed++; break;
      }
    }
    changedPixels[role] = changed;
  }
  assert(changedPixels.color > 0, "팀원이 바꾼 표면색이 고정 카메라의 실제 밑색에 보여야 합니다.");
  await writeFile(path.join(output, "six-pass-pixel-changes.json"), JSON.stringify(changedPixels, null, 2));
  await expect(reopened.dialog).toBeHidden({ timeout: 60_000 });
  const workApi = new URL(`/api/creator/works/${workId}`, options.origin).href;
  const revisedCut = await owner.request.get(`${workApi}/vrm-cuts/${encodeURIComponent(revised.workVrmCut.anchorId)}`);
  assert.equal(revisedCut.status(), 200);
  const source = await revisedCut.json();
  assert.equal(source.sceneSha256, revised.workVrmCut.sceneSha256);
  const actor = source.scene.pinnedVersionedCut.source.linkedVrm.characters[0];
  await verifyStudioVrmCutBytes(owner, workApi, path.resolve("apps/web/public/vrm/Avatar_Orion.vrm"), actor.vrmScene.surfacePaint.textures, source.attachments, editedChannels);
  await saveManuscript(revised.renderRevisionId);
  const original = await owner.request.get(revision);
  assert.deepEqual((await original.json()).manifest, manifest);
  await writeFile(path.join(output, "six-pass-revised-manifest.json"), JSON.stringify(revised, null, 2));
  return { revisedId: revised.renderRevisionId, revisedSource: revised.workVrmCut, bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId, roles: record.uploadedRoles, anchor: manifest.workVrmCut };
}
