import { readFile, writeFile } from "node:fs/promises";
import { buffer } from "node:stream/consumers";

import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

import { BLENDER_PROP_GLTF_URLS } from "../../apps/web/src/domains/creator/vrm/studio-vrm-prop-assets";
import { openStudioAllTools } from "../../scripts/lib/studio-bg3d-ui-interactions";
import { openStudioMainMenu, selectStudioLayerThroughNavigator } from "../../scripts/lib/studio-shell-interactions";

import type { StudioVrmSceneDocument } from "../../apps/web/src/domains/creator/contracts/studio-vrm-scene-document-schema";

interface Cut {
  id: string; type: "image"; name: string; src: string; x: number; y: number;
  width: number; height: number; rotation: number; vrmScene: StudioVrmSceneDocument;
}
interface Manuscript {
  payload: { data: { title: string; pagesList: { elements: Cut[]; canvasH: number }[] } };
}

async function exportManuscript(page: Page): Promise<Manuscript> {
  const menu = await openStudioMainMenu(page, "file");
  const [download] = await Promise.all([
    page.waitForEvent("download"), menu.locator('[data-studio-menu-item-id="export-json"]').click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Studio did not export a readable manuscript");
  return JSON.parse((await buffer(stream)).toString("utf8"));
}

const shaperRoot = '[data-character-shaper="true"]';
const placed = (project: Manuscript) => project.payload.data.pagesList[0].elements;
async function saveShot(shaper: Locator) {
  const insert = shaper.locator('[data-character-dock-action="insert"]').filter({ visible: true }).first();
  // Move off the preset card as a user does before saving, to end hover audition.
  await insert.hover({ timeout: 120000 });
  await expect(insert).toBeEnabled({ timeout: 150000 });
  await insert.click({ timeout: 150000 });
  await expect(shaper).toBeHidden({ timeout: 120000 });
}

// Retain matching PNG/camera pairs from the real editor. A second look-alike character
// deliberately shares sample.vrm with the lead. None of this fixture startup is timed.
async function captureTemplate(page: Page, name: string, angle: string) {
  const catalog = await openStudioAllTools(page);
  await catalog.getByRole("searchbox", { name: "전체 도구 검색" }).fill("character-shaper");
  await catalog.locator('button[data-studio-catalog-tool-id="character-shaper"]').click();
  const shaper = page.locator(shaperRoot).filter({ visible: true }).first();
  const camera = shaper.getByRole("group", { name: "카메라 프리셋", exact: true });
  await expect(camera).toBeVisible({ timeout: 150000 });
  const zoom = shaper.locator('[data-character-shaper-hud] button[aria-label="확대"]').filter({ visible: true }).first();
  await expect(zoom).toBeEnabled({ timeout: 150000 });
  const choice = camera.getByRole("button", { name: angle, exact: true });
  await expect(choice).toBeEnabled({ timeout: 150000 });
  await choice.click({ timeout: 120000 });
  await saveShot(shaper);
  const project = await exportManuscript(page);
  const cut = placed(project).at(-1);
  if (!cut?.vrmScene?.characterDocumentId || cut.vrmScene.model.source !== "bundled" || cut.vrmScene.model.id !== "sample-vrm") {
    throw new Error("No authored sample VRM shot after inserting " + name);
  }
  return { project, cut };
}

async function seedManuscript(page: Page) {
  console.log("[studio-eight-cut] Capturing front template");
  const front = await captureTemplate(page, "front", "전신");
  console.log("[studio-eight-cut] Capturing oblique template");
  const angle = await captureTemplate(page, "oblique", "사선");
  expect(front.cut.vrmScene.camera).not.toEqual(angle.cut.vrmScene.camera);
  const lead = front.cut.vrmScene.characterDocumentId!;
  let control = angle.cut.vrmScene.characterDocumentId!;
  // A local profile can remember the current actor when a fresh Shaper opens. Create an
  // explicitly distinct source with the same production library API used by "Create character".
  if (control === lead) {
    control = await page.evaluate(async ({ id, documentModule, libraryModule }) => {
      const { getCharacterDocumentV3Repository } = await import(/* @vite-ignore */ documentModule);
      const { createStudioCharacterAsset } = await import(/* @vite-ignore */ libraryModule);
      const original = await getCharacterDocumentV3Repository().load(id);
      if (!original) throw new Error("Authored template not saved");
      const result = await createStudioCharacterAsset(original, "다른 등장인물");
      return String(result.asset.documentId);
    }, { id: lead, documentModule: "/src/domains/creator/character-platform/document/character-document-v3-repository.ts",
      libraryModule: "/src/domains/creator/character-shaper/studio-character-asset-library.ts" });
  }
  expect(control).not.toBe(lead);
  const project = angle.project;
  const data = project.payload.data;
  data.title = "연속 여덟 컷";
  const cuts = Array.from({ length: 8 }, (_, index) => {
    const source = index % 2 === 0 ? front.cut : angle.cut;
    return { ...source, id: "eight-cut-" + (index + 1), name: "원고 컷 " + (index + 1),
      x: 90 + (index % 4) * 130, y: 110 + Math.floor(index / 4) * 155, width: 116, height: 137, rotation: 0,
      vrmScene: { ...source.vrmScene, characterDocumentId: index < 6 ? lead : control } };
  });
  data.pagesList[0].elements = cuts;
  const file = await openStudioMainMenu(page, "file");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"), file.locator('[data-studio-menu-item-id="import-json"]').click(),
  ]);
  await chooser.setFiles({ name: "연속여덟컷.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.getByRole("heading", { name: data.title, exact: true }).first()).toBeVisible({ timeout: 90000 });
  const imported = placed(await exportManuscript(page));
  expect(imported).toHaveLength(8);
  expect(imported.map(layer => layer.id)).toEqual(cuts.map(layer => layer.id));
  return imported;
}

// Select and focus the real image through Studio before aiming the pointer. The page may
// open scrolled or clipped at its saved zoom, so the canvas container is not a world origin.
async function cutMenu(page: Page, cut: Cut) {
  console.log("[studio-eight-cut] Selecting layer", cut.id);
  await page.keyboard.press("v");
  try {
    await selectStudioLayerThroughNavigator(page, cut.id);
  } catch (cause) {
    const rows = await page.locator("[data-studio-layer-row]").evaluateAll(nodes =>
      nodes.map(node => [node.id, node.getAttribute("aria-selected")]));
    throw new Error("Studio layer navigator did not select " + cut.id + "; rows=" + JSON.stringify(rows), { cause });
  }
  console.log("[studio-eight-cut] Layer selected; focusing viewport", cut.id);
  await page.keyboard.press("Shift+f");
  let target: { x: number; y: number } | null = null;
  let diagnostics = "";
  try {
    await expect.poll(async () => {
      const attempt = await page.evaluate(({ id, x, y, width, height }) => {
        type Point = { x: number; y: number };
        type Shape = { attrs?: { studioElementId?: string }; getClassName(): string; getParent(): Shape | null };
        type Stage = { container(): HTMLElement; getAbsoluteTransform(): { point(p: Point): Point };
          getIntersection(p: Point): Shape | null };
        const stages = (window as Window & { Konva?: { stages?: Stage[] } }).Konva?.stages ?? [];
        const samples: string[] = [];
        for (const stage of stages) {
          const content = stage.container().querySelector<HTMLElement>(".konvajs-content");
          if (!content?.isConnected) continue;
          const bounds = content.getBoundingClientRect();
          for (const fy of [.5, .3, .7]) for (const fx of [.5, .3, .7]) {
            const local = stage.getAbsoluteTransform().point({ x: x + fx * width, y: y + fy * height });
            const client = { x: bounds.left + local.x, y: bounds.top + local.y };
            let hit = stage.getIntersection(local);
            const ancestry: string[] = [];
            while (hit && hit.attrs?.studioElementId !== id) {
              ancestry.push(hit.attrs?.studioElementId ?? hit.getClassName());
              hit = hit.getParent();
            }
            const visible = document.elementFromPoint(client.x, client.y);
            if (hit && visible && content.contains(visible)) return { point: client, diagnostics: "" };
            if (fx === .5 && fy === .5) samples.push(JSON.stringify({ client, local, ancestry,
              element: visible?.tagName, content: [bounds.left, bounds.top, bounds.width, bounds.height] }));
          }
        }
        return { point: null, diagnostics: "Stages=" + stages.length + " " + samples.join(" ") };
      }, { id: cut.id, x: cut.x, y: cut.y, width: cut.width, height: cut.height });
      target = attempt.point;
      diagnostics = attempt.diagnostics;
      return target !== null;
    }, { timeout: 25000, intervals: [250, 500, 1000] }).toBe(true);
  } catch (cause) {
    throw new Error("No visible canvas hit for " + cut.id + ": " + diagnostics, { cause });
  }
  if (!target) throw new Error("Missing Studio pointer target");
  const { x, y } = target as { x: number; y: number };
  console.log("[studio-eight-cut] Canvas hit verified", cut.id, { x, y });
  await page.mouse.click(x, y, { button: "right" });
  const menu = page.getByRole("menu").filter({ visible: true }).last();
  await expect(menu).toBeVisible({ timeout: 30000 });
  console.log("[studio-eight-cut] Canvas menu opened", cut.id, await menu.getByRole("menuitem").allTextContents());
  return menu;
}

async function activateGpuEditorSelection(button: Locator, selection: string) {
  await expect(button).toBeVisible({ timeout: 30000 });
  await expect(button).toBeEnabled({ timeout: 30000 });
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  const started = performance.now();
  // A mounted shelf may preview or rebuild the real GPU model before input is delivered.
  // Keep that full elapsed time in the task while bounding missing controls separately.
  await button.click({ timeout: 120000 });
  await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 120000 });
  console.log("[studio-eight-cut] Editor selection applied", selection, Math.round(performance.now() - started), "ms");
}

async function selectDesktopShelf(shaper: Locator, category: string, slot: string) {
  console.log("[studio-eight-cut] Choosing desktop category and slot", category, slot);
  const categoryButton = shaper.locator('[data-character-category-rail="desktop"] [data-character-category="' + category + '"]');
  await activateGpuEditorSelection(categoryButton, category);
  // Hair and props have one shelf each. Pose has separate body and hand subslots.
  if (slot === "hand-pose") {
    const tab = shaper.locator('[data-character-subslot-tabs="pose"] [data-character-slot="hand-pose"]');
    await activateGpuEditorSelection(tab, slot);
  }
  const shelf = shaper.locator('[data-character-shaper-shelf="' + slot + '"]');
  await expect(shelf).toBeVisible({ timeout: 120000 });
  return shelf;
}

async function chooseCard(shelf: Locator, id: string) {
  console.log("[studio-eight-cut] Waiting for preset card", id);
  const card = shelf.locator('[data-character-slot-card="' + id + '"]');
  await activateGpuEditorSelection(card, id);
}

async function pixels(page: Page, src: string) {
  return page.evaluate(async url => {
    const image = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not decode saved cut");
    ctx.drawImage(image, 0, 0);
    const bytes = ctx.getImageData(0, 0, image.width, image.height).data;
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
    const visible = bytes.some((value, i) => i % 4 === 3 && value > 0);
    if (!visible) throw new Error("Empty cut raster");
    const result = { width:image.width, height:image.height, sha256:Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,"0")).join("") };
    image.close();
    return result;
  }, src);
}

export async function runStudioEightCutTask(page: Page, info: TestInfo) {
  // A cold software GPU can block even a visible preset button during the untimed fixture.
  page.setDefaultTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio/draft/eight-cut-task?language=ko", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-studio-canvas-viewport]").first()).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 180000 });
  const glassesUrl = BLENDER_PROP_GLTF_URLS.glasses;
  const glasses = await page.request.get(new URL(glassesUrl, page.url()).href);
  expect(glasses.ok(), "The public Studio glasses GLB must be served").toBe(true);
  const served = await glasses.body();
  const tracked = await readFile("apps/web/public" + glassesUrl);
  expect(served.subarray(0, 4).toString("ascii")).toBe("glTF");
  expect(served.readUInt32LE(4)).toBe(2);
  expect(served.readUInt32LE(8)).toBe(served.length);
  expect(served.equals(tracked), "The browser URL must return the checked-out GLB bytes").toBe(true);
  console.log("[studio-eight-cut] Verified public glasses GLB", glassesUrl, served.length);
  const before = await seedManuscript(page);
  console.log("[studio-eight-cut] Eight cuts imported and exported");
  const local = before[2];
  const beforePixels: Awaited<ReturnType<typeof pixels>>[] = [];
  for (const cut of before) beforePixels.push(await pixels(page, cut.src));
  console.log("[studio-eight-cut] Decoded eight baseline rasters");
  // User-task navigation stays bounded independently from actual GPU capture and batch work.
  page.setDefaultTimeout(30_000);
  const individuallyOpened: string[] = [];
  const start = performance.now();
  const tools = await cutMenu(page, local);
  await tools.getByRole("menuitem", {name:"3D 캐릭터 편집", exact:true}).click();
  individuallyOpened.push(local.id);
  const shaper = page.locator(shaperRoot).filter({visible:true}).first();
  await expect(shaper).toBeVisible({ timeout: 120000 });
  console.log("[studio-eight-cut] Selected cut editor opened", local.id);
  const hair = await selectDesktopShelf(shaper, "hair", "hair");
  await chooseCard(hair, "hair:ponytail");
  console.log("[studio-eight-cut] Hairstyle applied");
  const accessories = await selectDesktopShelf(shaper, "props", "accessory");
  await chooseCard(accessories, "accessory:glasses");
  console.log("[studio-eight-cut] Glasses applied");
  const handPoses = await selectDesktopShelf(shaper, "pose", "hand-pose");
  const rightHand = handPoses.getByRole("group", { name: "적용할 손", exact: true })
    .getByRole("button", { name: "오른손", exact: true });
  await rightHand.click();
  await expect(rightHand).toHaveAttribute("aria-pressed", "true");
  await chooseCard(handPoses, "hand-pose:fist");
  console.log("[studio-eight-cut] Right-hand pose applied");
  await saveShot(shaper);
  const editMs = performance.now() - start;
  console.log("[studio-eight-cut] Individual cut saved", local.id, editMs);
  // A different cut of the same actor is a stable refresh entry even if the edited shot was selected.
  const refresh = await cutMenu(page, before[0]);
  await refresh.getByRole("menuitem", { name:"이 페이지의 같은 캐릭터 컷 갱신", exact:true }).click();
  const receipt = page.getByRole("dialog", { name:"캐릭터 컷 갱신", exact:true });
  await expect(receipt).toBeVisible({ timeout: 30000 });
  console.log("[studio-eight-cut] Page refresh started");
  await expect(receipt.getByRole("button", { name:"닫기", exact:true })).toBeVisible({ timeout: 480000 });
  const settledMs = performance.now() - start;
  const summary = await receipt.innerText();
  console.log("[studio-eight-cut-summary]", summary);
  const counts = /갱신\s+(\d+)\s*·\s*건너뜀\s+(\d+)\s*·\s*실패\s+(\d+)/u.exec(summary);
  if (!counts) throw new Error("Missing Studio refresh counts: " + summary);
  const batch = { updated: Number(counts[1]), skipped: Number(counts[2]), failed: Number(counts[3]) };
  // The individually saved cut may already match its batch render. The decoded
  // images below still have to change from the original on every one of the six cuts.
  expect(batch.failed).toBe(0);
  expect(batch.updated + batch.skipped).toBe(6);
  expect(batch.skipped).toBeLessThanOrEqual(1);
  await receipt.getByRole("button", {name:"닫기", exact:true}).click();
  const after = placed(await exportManuscript(page));
  expect(after.map(c => c.id)).toEqual(before.map(c => c.id));
  const report = [];
  for (const [i, cut] of after.entries()) {
    const original = before[i], a = cut.vrmScene, b = original.vrmScene;
    expect(a.model).toEqual(b.model);
    expect(a.characterDocumentId).toBe(b.characterDocumentId);
    expect(a.camera).toEqual(b.camera);
    expect(a.expressions).toEqual(b.expressions);
    expect([cut.x,cut.y,cut.width,cut.height,cut.rotation]).toEqual([original.x,original.y,original.width,original.height,original.rotation]);
    const output = await pixels(page, cut.src);
    expect([output.width, output.height], cut.id + " PNG dimensions").toEqual([beforePixels[i].width, beforePixels[i].height]);
    if (i >= 6) {
      expect(cut).toEqual(original);
      expect(output).toEqual(beforePixels[i]);
    } else {
      expect(JSON.stringify(a.appearance.avatarForge)).toContain('"style":"ponytail"');
      expect(JSON.stringify(a.props)).toContain('"propId":"glasses"');
      expect(output.sha256).not.toBe(beforePixels[i].sha256);
      if (cut.id !== local.id) expect(a.pose).toEqual(b.pose);
      else {
        const { fingerOverrides: oldFingers, ...oldBody } = b.pose, { fingerOverrides: newFingers, ...newBody } = a.pose;
        expect(newBody).toEqual(oldBody);
        const keys = [...new Set([...Object.keys(oldFingers),...Object.keys(newFingers)])] as (keyof typeof oldFingers)[];
        const changed = keys.filter(key => JSON.stringify(oldFingers[key]) !== JSON.stringify(newFingers[key]));
        expect(changed.length).toBeGreaterThan(0);
        expect(changed.every(key => key.startsWith("right"))).toBe(true);
      }
    }
    report.push({ id:cut.id, authoredId:a.characterDocumentId, camera:a.camera, before:beforePixels[i], after:output });
  }
  const changedRasters = report.filter(cut => cut.before.sha256 !== cut.after.sha256);
  const controlId = before[6].vrmScene.characterDocumentId;
  const recorded = { scope:"automated Studio task from context-menu entry to completed user-visible refresh receipt; fixture setup and postcondition export excluded",
    browser:page.context().browser()?.version(), viewport:page.viewportSize(), editMs, settledMs, batch,
    individualEdits:individuallyOpened, additionalIndividualRepairs:Math.max(0,individuallyOpened.length - 1),
    changedCharacterCuts:changedRasters.length, unaffectedControls:report.filter(cut=>cut.authoredId===controlId && cut.before.sha256===cut.after.sha256).length,
    unintendedRasterChanges:changedRasters.filter(cut=>cut.authoredId===controlId).length, cuts:report };
  await writeFile(info.outputPath("eight-cut-task.json"), JSON.stringify(recorded,null,2));
  await writeFile(info.outputPath("hero-before.png"),Buffer.from(local.src.split(",")[1],"base64"));
  await writeFile(info.outputPath("hero-after.png"),Buffer.from(after[2].src.split(",")[1],"base64"));
  console.log("[studio-eight-cut-task]", JSON.stringify(recorded));
}
