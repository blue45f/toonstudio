import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";

import { openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

import { restoreIfPrompted } from "./helpers/studio-editor-restore-readiness";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

type Stroke = { id: string; points: number[]; pressures: number[]; inkInput: { pointerType: string } };

async function exportedStroke(page: Page): Promise<Stroke> {
  const file = await openStudioMainMenu(page, "file");
  const [download] = await Promise.all([
    page.waitForEvent("download"), file.locator('[data-studio-menu-item-id="export-json"]').click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("다시 내보낸 원고 파일을 읽지 못했습니다.");
  const data = JSON.parse((await buffer(stream)).toString("utf8")).payload.data;
  expect(data.pagesList).toHaveLength(1);
  expect(data.pagesList[0].elements).toHaveLength(1);
  return data.pagesList[0].elements[0];
}

/** 원고 캔버스에서만 원본 잉크 색을 표본 검사한다. 작업 도구의 같은 강조색은 제외한다. */
async function visiblePurpleInk(page: Page): Promise<number> {
  return page.locator("[data-studio-canvas-viewport] .konvajs-content canvas").evaluateAll(layers => {
    let matches = 0;
    const sample = document.createElement("canvas");
    for (const layer of layers) {
      if (!(layer instanceof HTMLCanvasElement) || !layer.width || !layer.height) continue;
      const scale = Math.min(1, 512 / layer.width, 1280 / layer.height);
      sample.width = Math.max(1, Math.round(layer.width * scale));
      sample.height = Math.max(1, Math.round(layer.height * scale));
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) continue;
      context.drawImage(layer, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 100 && Math.abs(pixels[i] - 124) <= 12
          && Math.abs(pixels[i + 1] - 92) <= 12 && pixels[i + 2] >= 240) matches++;
      }
    }
    return matches;
  });
}

test("Safari에서 내려받은 터치 원고를 새 로컬 프로젝트로 복원하고 새로고침 뒤에도 같은 획을 편집한다", async ({ page }, info) => {
  test.setTimeout(180_000);
  const archive = resolve("e2e/fixtures/studio-import/ios-touch-v2.toonstudio");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  await page.goto("/studio/import", { waitUntil: "domcontentloaded" });
  const [picker] = await Promise.all([
    page.waitForEvent("filechooser"), page.getByLabel("파일 선택", { exact: true }).locator("..").tap(),
  ]);
  await picker.setFiles(archive);
  await page.getByRole("button", { name: "프로젝트 복원", exact: true }).tap();
  await expect(page).toHaveURL(/\/studio\/p\/import-[^/]+\/d\/import-document-[^/?]+/u, { timeout: 60_000 });
  const importedUrl = new URL(page.url());
  const inkSamples: number[] = [];
  let first: Stroke | undefined;
  for (const stage of ["가져오기", "다시 열기"]) {
    if (first) await page.reload({ waitUntil: "domcontentloaded" });
    await restoreIfPrompted(page, async () => await visiblePurpleInk(page) > 4);
    inkSamples.push(await visiblePurpleInk(page));
    const stroke = await exportedStroke(page);
    expect(stroke.id).toBe("f5f626bf-161b-4d74-a482-ccc52b27425d");
    expect(stroke.points).toHaveLength(106);
    expect(createHash("sha256").update(JSON.stringify(stroke.points)).digest("hex")).toBe("e37d9150224f843ed5fd287dbbf9da67f1454f22e55e98fffa74d8379d794cb2");
    expect(stroke.pressures).toEqual(Array<number>(53).fill(0));
    expect(stroke.inkInput.pointerType).toBe("touch");
    if (first) expect(stroke).toEqual(first);
    first = stroke;
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe(importedUrl.pathname);
    expect(currentUrl.searchParams.get("workspace")).toBe(importedUrl.searchParams.get("workspace"));
    await page.screenshot({ path: info.outputPath(stage + ".png") });
  }
  expect(errors).toEqual([]);
  await info.attach("원본과 복원 획", { body: JSON.stringify({
    archiveSha256: createHash("sha256").update(await readFile(archive)).digest("hex"),
    id: first?.id, points: first?.points, pressures: first?.pressures, inkSamples, errors,
  }), contentType: "application/json" });
});
