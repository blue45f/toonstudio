import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { openStudioBg3dProfessionalMode, selectStudioBg3dTaskTab } from "../scripts/lib/studio-bg3d-ui-interactions";
import { openStudioLayerNavigator, openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

const shots = [
  { model: "hangang_riverside_pavilion", label: "웹툰 한강 공원 쉼터", subject: "쉼터 벤치와 물결 처마", wide: 34, detail: 44 },
  { model: "coastal_signal_station", label: "붉은 등대와 방파제", subject: "부두 난간", wide: 39, detail: 40 },
  { model: "harbor_boat_repair_shed", label: "항구 목선 수리소", subject: "선체 이음부", wide: 40, detail: 38 },
  { model: "botanical_illustration_room", label: "식물 세밀화 작업실", subject: "표본 작업대", wide: 37, detail: 30 },
  { model: "botanical_glasshouse", label: "햇살 드는 유리온실", subject: "모종 작업대", wide: 39, detail: 37 },
  { model: "fantasy_ruin_courtyard", label: "판타지 유적 안뜰", subject: "룬 분수", wide: 44, detail: 17.6 },
  { model: "korean_school_rooftop", label: "한국 학교 옥상", subject: "옥상 급수탱크", wide: 46, detail: 18.4 },
  { model: "webtoon_school_gate_module", label: "웹툰 한국 학교 정문", subject: "교문 돌기둥", wide: 50, detail: 20 },
] as const;
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const angle = (value: number) => value.toFixed(1) + "°";
const button = (root: Page | Locator, name: string) => root.getByRole("button", { name, exact: true }).filter({ visible: true });
const desktop = { width: 1440, height: 960 };

async function openEditor(page: Page, dialog: Locator) {
  const close = button(page, "프로젝트 도구 닫기");
  if (await close.isVisible()) await close.click();
  await page.locator('[data-studio-rail-tool-id="bg3d"]:visible').first().click({ timeout: 120_000 });
  await openStudioBg3dProfessionalMode(dialog, 60_000);
}
async function openLens(dialog: Locator) {
  await selectStudioBg3dTaskTab(dialog, "view", 60_000);
  await dialog.locator("#bg3d-view-tab-prosuite").press("Enter");
  return dialog.locator("#bg3d-view-section-prosuite").getByRole("tabpanel", { name: "구도", exact: true }).getByLabel("현재 화각");
}
interface Layer {
  id: string;
  src: string;
  bg3dScene?: { camera: { fovDegrees: number }; nodes: { kind: string; name: string }[]; attachments: { hash: string }[] };
}
async function readSavedLayer(page: Page, imagePath?: string) {
  const menu = await openStudioMainMenu(page, "file");
  const [file] = await Promise.all([page.waitForEvent("download"), menu.locator('[data-studio-menu-item-id="export-json"]').press("Enter")]);
  const path = await file.path();
  if (!path) throw new Error("원고 백업 파일을 읽을 수 없습니다.");
  const doc = JSON.parse(await readFile(path, "utf8")) as { payload: { data: { pagesList: { elements: Layer[] }[] } } };
  const layer = doc.payload.data.pagesList[0]?.elements.find(element => element.bg3dScene);
  if (!layer?.bg3dScene) throw new Error("원고에 삽입된 3D 배경 레이어가 없습니다.");
  expect(layer.src).toMatch(/^data:image\/png;base64,/u);
  if (imagePath) await writeFile(imagePath, Buffer.from(layer.src.slice(layer.src.indexOf(",") + 1), "base64"));
  return { id: layer.id, imageHash: sha(layer.src), scene: layer.bg3dScene };
}

test.use({ hasTouch: true, viewport: desktop, locale: "ko-KR" });
for (const shot of shots) {
  test(`${shot.label} 세부 구도를 배치하고 같은 원고에서 원본을 다시 연다`, async ({ page }, info) => {
    test.setTimeout(300_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/studio/draft/environment-detail-${shot.model}?workspace=draw`, { waitUntil: "commit" });
    const dialog = page.getByTestId("studio-bg3d-dialog").filter({ visible: true });
    const viewport = dialog.getByTestId("studio-bg3d-viewport");
    await openEditor(page, dialog);
    await selectStudioBg3dTaskTab(dialog, "models", 60_000);
    await dialog.getByLabel("3D 모델 라이브러리 검색").fill(shot.label);
    const addModel = button(dialog, shot.label + " 장면에 추가");
    await expect(addModel).toBeEnabled();
    await addModel.focus();
    await expect(addModel).toBeFocused();
    const [model] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith("/" + shot.model + ".glb")),
      page.keyboard.press("Enter"),
    ]);
    expect(model.status()).toBe(200);
    // 큰 GLB는 DevTools 응답 버퍼에서 제거될 수 있다. 작업 화면이 받은 바로 그 URL의 원본과 저장된 첨부 해시를 대조한다.
    const source = await page.request.get(model.url());
    expect(source.status()).toBe(200);
    const assetHash = "sha256:" + sha(await source.body());
    await source.dispose();
    const canvas = viewport.locator("canvas:visible").first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("3D 캔버스가 열리지 않았습니다.");
    await expect(dialog.getByText(/포인터.*배치|클릭.*배치|클릭.*놓|배치 미리보기/).filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
    await viewport.click({ position: { x: Math.round(bounds.width * .50), y: Math.round(bounds.height * .58) } });
    await expect(viewport).toHaveAttribute("data-studio-bg3d-viewport-selected-ids", /.+/u, { timeout: 60_000 });
    const lens = await openLens(dialog);
    await button(dialog, "선택한 공간의 추천 구도 적용").click();
    await expect(lens).toHaveText(angle(shot.wide));
    const detail = button(dialog, "세부 구도 적용 · " + shot.subject);
    if (shot.model === "coastal_signal_station") await page.setViewportSize({ width: 390, height: 844 });
    await detail.scrollIntoViewIfNeeded();
    const hit = await detail.evaluate(el => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { width, height, atCenter: el.contains(document.elementFromPoint(x + width / 2, y + height / 2)) };
    });
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.atCenter).toBe(true);
    await detail.tap();
    if (shot.model === "coastal_signal_station") await page.setViewportSize(desktop);
    await expect(lens).toHaveText(angle(shot.detail));
    await button(dialog, "실행 취소").click();
    await expect(lens).toHaveText(angle(shot.wide));
    await button(dialog, "다시 실행").click();
    await expect(lens).toHaveText(angle(shot.detail));
    const engine = await canvas.getAttribute("data-engine");
    await viewport.screenshot({ path: info.outputPath("detail.png") });
    await button(dialog, "컬러 배경 추가").press("Enter");
    await dialog.waitFor({ state: "hidden", timeout: 120_000 });
    const saved = await readSavedLayer(page, info.outputPath("inserted.png"));
    expect(saved.scene.camera.fovDegrees).toBe(shot.detail);
    expect(saved.scene.attachments.map(asset => asset.hash)).toEqual([assetHash]);
    expect(saved.scene.nodes.filter(node => node.kind === "model").map(node => node.name)).toEqual([shot.model + " 1"]);
    await page.keyboard.press("ControlOrMeta+s");
    await page.reload({ waitUntil: "commit" });
    await page.locator('[data-studio-canvas-input-state="ready"]:visible').first().waitFor({ timeout: 120_000 });
    expect(await readSavedLayer(page)).toEqual(saved);
    await openStudioLayerNavigator(page, 50_000);
    const row = page.getByRole("tree", { name: "레이어 트리" }).locator(`[id="studio-layer-${saved.id}"]`);
    await row.click({ position: { x: 12, y: 18 } });
    if (!await row.isVisible()) await openStudioLayerNavigator(page, 50_000);
    await expect(row).toHaveAttribute("aria-selected", "true");
    await openEditor(page, dialog);
    await expect(button(dialog, "3D 배경 업데이트")).toBeVisible();
    await expect(await openLens(dialog)).toHaveText(angle(shot.detail));
    await viewport.screenshot({ path: info.outputPath("reopened.png") });
    await writeFile(info.outputPath("verified.json"), JSON.stringify({ ...shot, hit, engine, saved, errors }, null, 2));
    expect(errors).toEqual([]);
  });
}
