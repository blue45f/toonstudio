/**
 * 실제 앱 라우트와 UI에서 자체 안료의 저장·입력·재열기·명시 전환을 검사한다.
 * 원본 Mixbox 색·속도와 같다는 단언, 테스트 전용 제품 hook, 권한/저장소 대체 구현은 없다.
 */
import { readFile } from "node:fs/promises";

import { createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { createBrushStudioV6MaterialReceipt } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-receipt";
import { serializeStudioAutosave, studioAutosaveKey } from "../apps/web/src/domains/creator/studio-autosave";
import { studioDocumentPersistenceWorkId } from "../apps/web/src/domains/creator/studio-document-persistence-scope";
import { parseStudioWorkspaceRoute } from "../apps/web/src/domains/creator/studio-workspace-route";
import { withStudioCaptureCpuProfile } from "../scripts/lib/studio-capture-cpu-profile";
import { withStudioCaptureNativeTrace } from "../scripts/lib/studio-capture-native-trace";
import {
  readDurableStudioAutosaveDocument,
  resolveDurableStudioAutosaveModuleUrl,
  seedDurableStudioAutosaveDocument,
} from "../scripts/lib/studio-verify-durable-autosave.mjs";
import { enabledStudioHistoryControl } from "../scripts/lib/studio-verify-history-controls.mts";

import { expect, test } from "./fixtures/non-studio-test";
import { waitForStudioCaptureDownload } from "./helpers/studio-capture-download";
import { installGuestOfflineEnvironment } from "./helpers/studio-editor-a11y";
import { restoreIfPrompted, waitForStudioPageRestored } from "./helpers/studio-editor-restore-readiness";
import { clickPigmentBlockedPngExport } from "./helpers/studio-pigment-blocked-export";
import { waitForPigmentEditorSettled as waitForEditorSettled } from "./helpers/studio-pigment-editor-entry";

import type { BrushStudioV6MaterialConfig } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import type { DrawEl } from "../apps/web/src/domains/creator/studio-element-model";
import type { PageState } from "../apps/web/src/domains/creator/studio-page-state";
import type { Download, Page, TestInfo } from "@playwright/test";

const INTERNAL_PROVIDER = "toonstudio-latent-pigment-v1";
const RECIPE_ID = "mixbox-pigment-spray";
const BLOCKED_RECIPE_ID = "mixbox-palette-knife";
const CAPTURE_TIMEOUT_TEXT = "페이지 렌더링 준비 시간이 초과되어 잘못된 페이지 캡처를 막았어요.";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("객체가 필요한 관측값입니다.");
  return Object.fromEntries(Object.entries(value));
}
function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("배열이 필요한 관측값입니다.");
  return value.map(record);
}
function material(element: Record<string, unknown>): Record<string, unknown> {
  return record(record(element.brushEnginePrograms).material);
}
function internalV2(element: Record<string, unknown>): void {
  const config = material(element);
  expect(config.version).toBe(2);
  const bindings = records(record(config.runtime).bindings);
  expect(bindings).toContainEqual(expect.objectContaining({ providerId: INTERNAL_PROVIDER, rights: "internal" }));
  expect(bindings.some((entry) => entry.providerId === "mixbox-js-v2")).toBe(false);
}
function currentKey(page: Page): string {
  const url = new URL(page.url());
  const route = parseStudioWorkspaceRoute({ pathname: url.pathname, search: url.search });
  if (!route.valid) throw new Error("현재 페이지가 실제 Studio 원고 라우트가 아닙니다.");
  return studioAutosaveKey({ workId: studioDocumentPersistenceWorkId({
    workId: route.projectId && route.documentId ? null : route.workId,
    remixId: route.remixSourceWorkId,
    projectId: route.projectId,
    documentId: route.documentId,
    draftId: route.draftId,
  }), remixId: route.remixSourceWorkId });
}
async function savedPage(page: Page, key: string, pageId?: string): Promise<Record<string, unknown>> {
  const saved = await readDurableStudioAutosaveDocument(page, key);
  const selected = saved?.pagesList.find((candidate) => pageId ? candidate.id === pageId : candidate.id === saved.currentPageId);
  if (!selected) throw new Error("실제 OPFS/SQLite에서 현재 페이지를 읽지 못했습니다.");
  return record(selected);
}
async function fileBytes(download: Download, testInfo: TestInfo, name: string): Promise<Buffer> {
  expect(await download.failure()).toBeNull();
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  return readFile(path);
}
async function menu(page: Page, itemId: string): Promise<void> {
  await page.locator('[data-studio-main-menu-trigger="file"]').click();
  await page.locator(`[data-studio-menu-item-id="${itemId}"]`).click();
}
async function downloadPng(page: Page, testInfo: TestInfo, name: string): Promise<Buffer> {
  return withStudioCaptureNativeTrace(process.env.TOONSTUDIO_TRACE_CAPTURE_FRAMES === "1" && name === "v2-converted.png", {
    createSession: async () => {
      const browser = page.context().browser();
      if (!browser) throw new Error("프레임 관측용 Chromium 연결이 없습니다.");
      const client = await browser.newBrowserCDPSession();
      return {
        start: (options) => client.send("Tracing.start", options),
        stop: () => new Promise<{ stream?: string; dataLossOccurred?: boolean }>((resolve, reject) => {
          const completed = (event: { stream?: string; dataLossOccurred?: boolean }) => resolve(event);
          client.once("Tracing.tracingComplete", completed);
          void client.send("Tracing.end").catch((error: unknown) => {
            client.off("Tracing.tracingComplete", completed);
            reject(error);
          });
        }),
        read: (stream, size) => client.send("IO.read", { handle: stream, size }),
        close: (stream) => client.send("IO.close", { handle: stream }),
        detach: () => client.detach(),
      };
    },
    attach: (attachment, body) => testInfo.attach(attachment, { body, contentType: "application/json" }),
  }, name, () => withStudioCaptureCpuProfile(process.env.TOONSTUDIO_PROFILE_CAPTURE_CPU === "1", {
    createSession: async () => {
      const client = await page.context().newCDPSession(page);
      return {
        enable: () => client.send("Profiler.enable"),
        start: () => client.send("Profiler.start"),
        stop: async () => (await client.send("Profiler.stop")).profile,
        disable: () => client.send("Profiler.disable"),
        detach: () => client.detach(),
      };
    },
    attach: (attachment, body) => testInfo.attach(attachment, { body, contentType: "application/json" }),
  }, name, async () => {
    await attachCaptureState(page, testInfo, `${name}.before.json`);
    await page.bringToFront();
    const download = await waitForStudioCaptureDownload(page, async () => {
      const button = page.locator('button[data-studio-primary-action="export"]');
      await expect(button).toHaveAttribute("aria-label", /PNG/u);
      await button.click();
    }, page.getByText(CAPTURE_TIMEOUT_TEXT, { exact: true }).first());
    const bytes = await fileBytes(download, testInfo, name);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(0);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(0);
    return bytes;
  }));
}
async function downloadSvg(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  const exchange = page.locator('[data-studio-export-section="exchange"]');
  await exchange.locator("summary").click();
  await expect(exchange).toHaveAttribute("open", "");
  const pending = page.waitForEvent("download");
  await exchange.getByRole("button", { name: "SVG (벡터, 현재 페이지)", exact: true }).click();
  const text = (await fileBytes(await pending, testInfo, name)).toString("utf8");
  expect(text).toContain("<svg");
  expect(text).toContain("material-contact-v1");
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
}
async function downloadClippedAppearanceSvg(page: Page, testInfo: TestInfo, name: string, png: Buffer): Promise<void> {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  await expect(panel.getByRole("button", { name: "2×", exact: true })).toHaveAttribute("aria-pressed", "true");
  const summary = panel.locator('[data-studio-export-output-summary="true"]');
  await expect(summary).toContainText(`PNG · ${width} × ${height} px`);
  await expect(summary.getByText("배경 유지", { exact: true })).toBeVisible();
  await expect(summary.getByText("사용 안 함", { exact: true })).toBeVisible();
  const exchange = panel.locator('[data-studio-export-section="exchange"]');
  await exchange.locator("summary").click();
  await expect(exchange).toHaveAttribute("open", "");

  // 클리핑을 잃는 벡터 저장은 거부하고, 사용자가 고르는 별도 외관 보존 형식으로 이어진다.
  const vector = exchange.getByRole("button", { name: "SVG (벡터, 현재 페이지)", exact: true });
  const refused = exchange.getByText(/^외관이 달라지는 요소가 있어 벡터 SVG 저장을 중단했어요\./u);
  await expect(refused).toHaveCount(0);
  const unexpected: Download[] = [];
  const observe = (download: Download) => unexpected.push(download);
  page.on("download", observe);
  try {
    await vector.click();
    await expect(refused).toBeVisible();
    await expect(refused).toContainText("아래 레이어로 자르기(클리핑 마스크)는 SVG에서 지원되지 않아 자르지 않고 표시돼요.");
    await expect(refused).toContainText("외관 보존 SVG를 선택해 주세요.");
    await expect(vector).toBeEnabled();
    expect(unexpected).toHaveLength(0);
  } finally {
    page.off("download", observe);
  }

  const appearance = exchange.getByRole("button", { name: "SVG (외관 보존, 현재 페이지)", exact: true });
  await expect(appearance).toHaveAccessibleDescription("외관 보존 SVG는 선택한 내보내기 해상도의 PNG를 담아 질감·클리핑을 유지해요. 획과 글자는 벡터로 편집할 수 없어요.");
  const pending = page.waitForEvent("download");
  await appearance.click();
  const text = (await fileBytes(await pending, testInfo, name)).toString("utf8");
  const { metadata, pngBase64 } = await page.evaluate((svg) => {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (document.querySelector("parsererror")) throw new Error("외관 보존 SVG의 XML을 읽지 못했습니다.");
    const root = document.documentElement;
    const image = root.querySelector("image");
    const href = image?.getAttribute("href");
    const prefix = "data:image/png;base64,";
    if (!href?.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/u.test(href.slice(prefix.length))) {
      throw new Error("외관 보존 SVG의 내장 PNG가 없습니다.");
    }
    return {
      metadata: {
        root: root.localName, namespace: root.namespaceURI,
        width: root.getAttribute("width"), height: root.getAttribute("height"), viewBox: root.getAttribute("viewBox"),
        children: Array.from(root.children, (child) => child.localName),
        title: root.querySelector("title")?.textContent, description: root.querySelector("desc")?.textContent,
        imageWidth: image?.getAttribute("width"), imageHeight: image?.getAttribute("height"),
      },
      pngBase64: href.slice(prefix.length),
    };
  }, text);
  expect(metadata).toEqual({
    root: "svg", namespace: "http://www.w3.org/2000/svg", width: String(width), height: String(height), viewBox: `0 0 ${width} ${height}`,
    children: ["title", "desc", "image"], title: "원고 외관 보존 · 무손실 PNG",
    description: "현재 내보내기 해상도의 원고 픽셀을 보존합니다. 획과 글자는 벡터로 편집할 수 없습니다.",
    imageWidth: String(width), imageHeight: String(height),
  });
  const embedded = Buffer.from(pngBase64, "base64");
  expect([...embedded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(embedded.readUInt32BE(16)).toBe(width);
  expect(embedded.readUInt32BE(20)).toBe(height);
  // 두 UI 경로는 같은 배율·배경·색보정 캡처를 쓴다. 인쇄용 PNG 태그 대신 실제 RGBA를 비교한다.
  const changedPixels = await pixelsChanged(page, png, embedded);
  await testInfo.attach(`${name}.pixel-comparison.json`, { body: JSON.stringify({ width, height, changedPixels }), contentType: "application/json" });
  expect(changedPixels).toBe(0);
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
}
async function downloadBackup(page: Page, testInfo: TestInfo, name: string): Promise<Record<string, unknown>> {
  const pending = page.waitForEvent("download");
  await menu(page, "export-json");
  const envelope = record(JSON.parse((await fileBytes(await pending, testInfo, name)).toString("utf8")));
  // 현재 실제 파일 메뉴는 canonical document envelope를 내려준다. 느슨한 다른 모양으로 우회하지 않는다.
  expect(record(envelope.format).id).toBe("toonstudio.studio-project");
  const payload = record(envelope.payload);
  expect(payload.type).toBe("project");
  return record(payload.data);
}
async function pixelsChanged(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(async ({ first, second }) => {
    const decode = async (bytes: number[]) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PNG 검증용 Canvas2D를 열지 못했습니다.");
      context.drawImage(bitmap, 0, 0); bitmap.close();
      return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const a = await decode(first), b = await decode(second);
    if (a.width !== b.width || a.height !== b.height) throw new Error("같은 문서의 PNG 크기가 달라졌습니다.");
    let changed = 0;
    for (let index = 0; index < a.data.length; index += 4) {
      if (a.data[index] !== b.data[index] || a.data[index + 1] !== b.data[index + 1]
        || a.data[index + 2] !== b.data[index + 2] || a.data[index + 3] !== b.data[index + 3]) changed += 1;
    }
    return changed;
  }, { first: [...before], second: [...after] });
}

async function attachCaptureState(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (page.isClosed()) {
    await testInfo.attach(name, { body: JSON.stringify({ pageClosed: true }), contentType: "application/json" });
    return;
  }
  const state = await page.evaluate(() => ({
    visibility: document.visibilityState,
    fonts: { status: document.fonts.status, count: document.fonts.size },
    konvaContainers: document.querySelectorAll(".konvajs-content").length,
    canvases: Array.from(document.querySelectorAll("canvas")).slice(0, 32).map((canvas) => ({
      width: canvas.width, height: canvas.height, connected: canvas.isConnected,
      visible: canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().height > 0,
    })),
    captureMarks: performance.getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("toonstudio:capture:")).slice(-64)
      .map((entry) => ({ name: entry.name, startTime: entry.startTime, detail: (entry as PerformanceMark).detail })),
    cacheMarks: performance.getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("toonstudio:raster-cache:")).slice(-64)
      .map((entry) => ({ name: entry.name, startTime: entry.startTime, detail: (entry as PerformanceMark).detail })),
  }));
  await testInfo.attach(name, { body: JSON.stringify(state, null, 2), contentType: "application/json" });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    await attachCaptureState(page, testInfo, "failed-capture-state.json");
  } catch {
    await testInfo.attach("capture-state-unavailable.json", {
      body: JSON.stringify({ observationUnavailable: true }), contentType: "application/json",
    });
  }
});

test.beforeEach(async ({ page }) => {
  await installGuestOfflineEnvironment(page, { dismissStartDock: true });
  // page의 기존 API fixture가 우선한다. 나머지 요청도 로컬 앱 외 호스트에는 연결하지 않는다.
  await page.context().route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? route.continue()
      : route.abort("blockedbyclient");
  });
});

test("기본 권리 차단과 자체 안료 선택·SQLite 저장·재열기·원고 입력·내구 저장·PNG/SVG", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/studio/assets/brushes/new", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "브러시 레시피 검색", exact: true }).fill(BLOCKED_RECIPE_ID);
  await page.getByRole("button", { name: /^자체 안료 팔레트 나이프/u }).click();
  const save = page.getByRole("button", { name: "브러시로 저장", exact: true });
  await expect(save).toBeDisabled();
  await expect(page.getByText("Normal-mapped Tip 라이선스 프로필에서 제외", { exact: true }).first()).toBeVisible();
  // 레시피 선택은 재료·질감 영역을 연다. 실제 탐색 버튼으로 목록을 다시 연다.
  await page.getByRole("navigation", { name: "브러시 스튜디오 영역", exact: true })
    .getByRole("button", { name: /^시작 레시피 \d+$/u }).click();
  await page.getByRole("searchbox", { name: "브러시 레시피 검색", exact: true }).fill(RECIPE_ID);
  await page.getByRole("button", { name: /^자체 잠재 안료 스프레이/u }).click();
  await page.getByRole("textbox", { name: "브러시 이름", exact: true }).fill("QA 자체 안료 기능 보존");
  await expect(save).toBeEnabled(); // 기본 permissive-only를 유지한다. 프로필 우회 없음.
  await save.click(); // 제품 함수가 SQLite put→get 검증에 성공해야 링크가 생성된다.
  const use = page.getByRole("link", { name: "원고에서 사용하기", exact: true });
  await expect(use).toBeVisible();
  const href = await use.getAttribute("href");
  if (!href) throw new Error("실제 저장 영수증의 원고 링크가 없습니다.");
  const brushId = new URL(href, page.url()).searchParams.get("materialBrush");
  if (!brushId) throw new Error("저장 브러시 식별자가 없습니다.");
  const originalAuthoring = await page.evaluate(() => localStorage.getItem("toonstudio.brush-program-v6:draft"));
  const expectedMaterial = record(record(JSON.parse(originalAuthoring ?? "null")).materialReceipt);

  // 다른 editor scope에서 다시 열어 원래 draft 대신 실제 SQLite 행을 읽게 한다.
  await page.goto(`/studio/assets/brushes/${encodeURIComponent(brushId)}/edit`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "브러시 이름", exact: true })).toHaveValue("QA 자체 안료 기능 보존");
  const restoredAuthoring = await page.evaluate((key) => localStorage.getItem(key), `toonstudio.brush-program-v6:${encodeURIComponent(`brush:${brushId}`)}`);
  expect(record(JSON.parse(restoredAuthoring ?? "null")).materialReceipt).toEqual(expectedMaterial);
  await page.goto(href, { waitUntil: "domcontentloaded" });
  await waitForEditorSettled(page);
  await expect(page.locator("[data-studio-brush-active-pill]")).toContainText("QA 자체 안료 기능 보존");
  const originalUrl = page.url();
  const key = currentKey(page);
  const emptyPng = await downloadPng(page, testInfo, "before-drawing.png");
  await page.locator('[data-studio-rail-tool-id="pen"]').click();
  const stage = page.locator("[data-studio-canvas-viewport] .konvajs-content").first();
  await expect(stage).toBeVisible();
  const box = await stage.boundingBox();
  if (!box) throw new Error("실제 문서 Canvas 위치를 읽지 못했습니다.");
  await page.mouse.move(box.x + box.width * 0.25, box.y + Math.min(180, box.height * 0.3));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + Math.min(260, box.height * 0.45), { steps: 18 });
  await page.mouse.up();
  await expect.poll(async () => records((await savedPage(page, key)).elements).filter((element) => element.type === "draw").length).toBeGreaterThan(0);
  const committedPage = await savedPage(page, key);
  const drawn = records(committedPage.elements).find((element) => element.type === "draw");
  if (!drawn) throw new Error("제품 pointer 경로가 획을 커밋하지 못했습니다.");
  internalV2(drawn);
  expect(material(drawn)).toEqual(expectedMaterial);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForStudioPageRestored(page, committedPage);
  expect(currentKey(page)).toBe(key);
  await waitForEditorSettled(page);
  expect(page.url()).toBe(originalUrl);
  expect((await savedPage(page, key, String(committedPage.id))).elements).toEqual(committedPage.elements);
  const exported = await downloadBackup(page, testInfo, "reopened-project.json");
  const reopenedPage = records(exported.pagesList).find((candidate) => candidate.id === committedPage.id);
  expect(reopenedPage?.elements).toEqual(committedPage.elements);
  const renderedPng = await downloadPng(page, testInfo, "after-reopen.png");
  expect(await pixelsChanged(page, emptyPng, renderedPng)).toBeGreaterThan(8);
  await downloadSvg(page, testInfo, "after-reopen.svg");
  expect(pageErrors).toEqual([]);
});

// 기존 Vitest의 legacyPigmentStroke와 같이 실제 제품 receipt에서 만드는 합성 입력이다.
function legacyPage(version: 1 | 2): { page: PageState; source: DrawEl } {
  const program = { ...createBrushStudioV6Program("mixbox-pigment-spray"), licenseProfile: "noncommercial-full" as const };
  const receipt = createBrushStudioV6MaterialReceipt(program);
  const sourceMaterial: BrushStudioV6MaterialConfig = version === 1
    ? { version: 1, seed: receipt.seed, slots: receipt.slots, tuning: receipt.tuning, input: receipt.input }
    : { ...receipt, runtime: { ...receipt.runtime, bindings: receipt.runtime.bindings.map((binding) => binding.nodeIds.includes("pigment-mixbox")
      ? { providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0", rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"] }
      : binding) } };
  const source: DrawEl = { id: "old-stroke", type: "draw", kind: "freehand", mode: "pen", points: [40, 60, 100, 80, 240, 120], pressures: [0.3, 0.7, 0.8],
    tiltXs: [0, 0, 0], tiltYs: [0, 0, 0], twists: [0, 0, 0], speeds: [0, 0, 0], tangentialPressures: [0, 0, 0],
    name: "합성 외부 혼색 원본", groupId: "paint-group", hidden: false, locked: false, clipBelow: true, stroke: "#fde000", strokeWidth: 20,
    brushEnginePrograms: { version: 1, material: sourceMaterial } };
  const underlay: DrawEl = { id: "base-stroke", type: "draw", kind: "freehand", mode: "pen", groupId: "paint-group", points: [30, 60, 260, 120], stroke: "#202020", strokeWidth: 60 };
  return { source, page: { id: `legacy-page-v${version}`, elements: [underlay, source], groups: [{ id: "paint-group", name: "합성 원본 그룹" }],
    bg: "#ffffff", bgGrad: null, canvasH: 640, animTimeline: { fps: 12, frameCount: 24, tracks: {} } } };
}
function assertPreserved(source: DrawEl, before: Record<string, unknown>, after: Record<string, unknown>): void {
  const elements = records(after.elements);
  const active = elements.find((element) => element.id === source.id);
  const archive = elements.find((element) => element.legacyPigmentArchive !== undefined);
  if (!active || !archive) throw new Error("활성 사본 또는 숨긴 원본이 없습니다.");
  const provenance = record(archive.legacyPigmentArchive);
  expect(provenance).toEqual({ version: 1, sourceElementId: source.id, sourceGroupId: source.groupId, sourceIndex: 1, sourceHidden: false });
  expect(archive.id).not.toBe(source.id); expect(archive.hidden).toBe(true);
  const restored = { ...archive }; delete restored.legacyPigmentArchive; delete restored.groupId; delete restored.hidden;
  restored.id = provenance.sourceElementId; restored.groupId = provenance.sourceGroupId; restored.hidden = provenance.sourceHidden;
  expect(restored).toEqual(source);
  const archiveGroup = records(after.groups).find((group) => group.id === archive.groupId);
  expect(archiveGroup).toMatchObject({ hidden: true, locked: true });
  const { brushEnginePrograms: _oldPrograms, ...oldData } = source;
  const { brushEnginePrograms: _newPrograms, ...activeData } = active;
  expect(activeData).toEqual(oldData);
  expect(material(active).version).toBe(material(record(source)).version);
  expect(material(active).tuning).toEqual(material(record(source)).tuning);
  expect(material(active).input).toEqual(material(record(source)).input);
  expect(material(active).seed).toEqual(material(record(source)).seed);
  if (material(active).version === 2) internalV2(active);
  else expect(record(material(active).slots).pigment).toBe("pigment-latent");
  expect(elements.filter((element) => element.id !== archive.id).map((element) => element.id))
    .toEqual(records(before.elements).map((element) => element.id));
  expect(after.animTimeline).toEqual(before.animTimeline);
}

for (const version of [1, 2] as const) {
  test(`실제 V${version} 원고의 원본 다운로드·명시 전환·undo/redo·재열기·내보내기`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixture = legacyPage(version);
    const route = `/studio/draft/qa-pigment-v${version}?workspace=draw`;
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await waitForEditorSettled(page);
    const key = currentKey(page);
    const moduleUrl = await resolveDurableStudioAutosaveModuleUrl(page);
    expect(moduleUrl).not.toBeNull();
    await page.goto("/studio", { waitUntil: "domcontentloaded" }); // 편집기 writer lease를 먼저 반환한다.
    await seedDurableStudioAutosaveDocument(page, key, serializeStudioAutosave({ version: 2, savedAt: new Date().toISOString(),
      currentPageId: fixture.page.id, pagesList: [fixture.page] }), moduleUrl);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    const warning = page.getByRole("region", { name: "이전 혼색 획 확인", exact: true });
    await restoreIfPrompted(page, () => warning.isVisible());
    await expect(warning).toContainText("색이 달라질 수 있습니다");
    const before = await savedPage(page, key, fixture.page.id);
    expect(records(before.elements).find((element) => element.id === fixture.source.id)).toEqual(fixture.source);
    expect(records(before.elements).some((element) => element.legacyPigmentArchive !== undefined)).toBe(false);

    const originalDownload = page.waitForEvent("download");
    await warning.getByRole("button", { name: "원본 파일 내려받기", exact: true }).click();
    const original = record(JSON.parse((await fileBytes(await originalDownload, testInfo, `v${version}-original.json`)).toString("utf8")));
    expect(original.format).toBe("toonstudio-legacy-pigment-source");
    expect(original.elements).toEqual(before.elements);
    expect(original.groups).toEqual(before.groups);

    // 실제 UI 내보내기 경계: 실패 문구를 기다리고 그 작업에서 download가 발생하지 않았음을 확인한다.
    const unexpected: Download[] = [];
    const observe = (download: Download) => unexpected.push(download);
    const exportError = page.getByText("이전 Mixbox 획은 색 확인 후 자체 혼색 사본으로 전환해야 표시·내보내기할 수 있습니다. 원본은 유지됩니다.", { exact: true }).first();
    await expect(exportError).toHaveCount(0);
    page.on("download", observe);
    await clickPigmentBlockedPngExport(page, exportError);
    await expect(exportError).toBeVisible();
    expect(unexpected).toHaveLength(0);
    page.off("download", observe);
    await warning.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기", exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect.poll(async () => records((await savedPage(page, key, fixture.page.id)).elements)
      .some((element) => element.legacyPigmentArchive !== undefined)).toBe(true);
    const converted = await savedPage(page, key, fixture.page.id);
    assertPreserved(fixture.source, before, converted);

    await (await enabledStudioHistoryControl(page, "undo")).click();
    await expect(warning).toBeVisible();
    await expect.poll(async () => (await savedPage(page, key, fixture.page.id)).elements).toEqual(before.elements);
    await (await enabledStudioHistoryControl(page, "redo")).click();
    await expect(warning).toHaveCount(0);
    await expect.poll(async () => (await savedPage(page, key, fixture.page.id)).elements).toEqual(converted.elements);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForStudioPageRestored(page, converted);
    expect(currentKey(page)).toBe(key);
    await waitForEditorSettled(page);
    const project = await downloadBackup(page, testInfo, `v${version}-converted-project.json`);
    const reopened = records(project.pagesList).find((candidate) => candidate.id === fixture.page.id);
    if (!reopened) throw new Error("다시 연 원고의 제품 백업에 대상 페이지가 없습니다.");
    expect(reopened.elements).toEqual(converted.elements);
    assertPreserved(fixture.source, before, reopened);
    const png = await downloadPng(page, testInfo, `v${version}-converted.png`);
    await downloadClippedAppearanceSvg(page, testInfo, `v${version}-converted.appearance.svg`, png);
    expect(errors).toEqual([]);
  });
}

// 수동 부분 진단만 추가 등록한다. 각 test의 새 context와 고유 localhost draft에서 같은 V2 입력을 쓴다.
if (process.env.TOONSTUDIO_PIGMENT_CLIP_CONTRAST === "1") {
  for (const clipBelow of [false, true]) {
    test(`분리 진단: V2 클리핑 clipBelow=${clipBelow} 원본 보존·전환·재열기·PNG`, async ({ page }, testInfo) => {
      if (testInfo.project.use.storageState !== undefined) throw new Error("클리핑 대조는 저장 상태를 재사용하지 않는 새 context가 필요합니다.");
      const baseURL = testInfo.project.use.baseURL;
      if (!baseURL || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)) {
        throw new Error("클리핑 분리 진단은 고유 localhost QA 문서에서만 실행합니다.");
      }
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const originalFixture = legacyPage(2);
      const source = { ...originalFixture.source, clipBelow };
      const fixture = { source, page: { ...originalFixture.page,
        elements: originalFixture.page.elements.map((element) => element.id === source.id ? source : element) } };
      const label = clipBelow ? "on" : "off";
      const route = `/studio/draft/qa-pigment-v2-clip-${label}-${crypto.randomUUID()}?workspace=draw`;
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await waitForEditorSettled(page);
      const originalUrl = page.url();
      const key = currentKey(page);
      const moduleUrl = await resolveDurableStudioAutosaveModuleUrl(page);
      expect(moduleUrl).not.toBeNull();
      await page.goto("/studio", { waitUntil: "domcontentloaded" }); // 편집기 writer lease를 먼저 반환한다.
      await seedDurableStudioAutosaveDocument(page, key, serializeStudioAutosave({ version: 2, savedAt: new Date().toISOString(),
        currentPageId: fixture.page.id, pagesList: [fixture.page] }), moduleUrl);
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const warning = page.getByRole("region", { name: "이전 혼색 획 확인", exact: true });
      await restoreIfPrompted(page, () => warning.isVisible());
      await expect(warning).toContainText("색이 달라질 수 있습니다");
      const before = await savedPage(page, key, fixture.page.id);
      expect(records(before.elements).find((element) => element.id === source.id)).toEqual(source);
      expect(records(before.elements).some((element) => element.legacyPigmentArchive !== undefined)).toBe(false);

      const originalDownload = page.waitForEvent("download");
      await warning.getByRole("button", { name: "원본 파일 내려받기", exact: true }).click();
      const original = record(JSON.parse((await fileBytes(await originalDownload, testInfo, `v2-clip-${label}-original.json`)).toString("utf8")));
      expect(original.format).toBe("toonstudio-legacy-pigment-source");
      expect(original.elements).toEqual(before.elements);
      expect(original.groups).toEqual(before.groups);

      const unexpected: Download[] = [];
      const observe = (download: Download) => unexpected.push(download);
      const exportError = page.getByText("이전 Mixbox 획은 색 확인 후 자체 혼색 사본으로 전환해야 표시·내보내기할 수 있습니다. 원본은 유지됩니다.", { exact: true }).first();
      await expect(exportError).toHaveCount(0);
      page.on("download", observe);
      await clickPigmentBlockedPngExport(page, exportError);
      await expect(exportError).toBeVisible();
      expect(unexpected).toHaveLength(0);
      page.off("download", observe);
      await warning.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기", exact: true }).click();
      await expect(warning).toHaveCount(0);
      await expect.poll(async () => records((await savedPage(page, key, fixture.page.id)).elements)
        .some((element) => element.legacyPigmentArchive !== undefined)).toBe(true);
      const converted = await savedPage(page, key, fixture.page.id);
      assertPreserved(source, before, converted);
      await (await enabledStudioHistoryControl(page, "undo")).click();
      await expect(warning).toBeVisible();
      await expect.poll(async () => (await savedPage(page, key, fixture.page.id)).elements).toEqual(before.elements);
      await (await enabledStudioHistoryControl(page, "redo")).click();
      await expect(warning).toHaveCount(0);
      await expect.poll(async () => (await savedPage(page, key, fixture.page.id)).elements).toEqual(converted.elements);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForStudioPageRestored(page, converted);
      expect(currentKey(page)).toBe(key);
      await waitForEditorSettled(page);
      expect(page.url()).toBe(originalUrl);
      const project = await downloadBackup(page, testInfo, `v2-clip-${label}-converted-project.json`);
      const reopened = records(project.pagesList).find((candidate) => candidate.id === fixture.page.id);
      if (!reopened) throw new Error("클리핑 대조의 제품 백업에 대상 페이지가 없습니다.");
      expect(reopened.elements).toEqual(converted.elements);
      assertPreserved(source, before, reopened);
      // native 관측 입력을 켜면 기존 파일명 조건으로 true 대조 한 번만 수집한다.
      await downloadPng(page, testInfo, clipBelow ? "v2-converted.png" : "v2-clip-off-converted.png");
      expect(errors).toEqual([]);
    });
  }
}

// QA 제안: 현재 spec 전체 뒤에만 추가해 기존 비공개 helper와 원래 시험을 보존한다.
// 승인 전 실제 실행하지 않은 추가안이며 제품 경로 또는 원본 fixture를 바꾸지 않는다.
type ClipSemanticVariant = "baseline" | "clipped" | "unclipped";
type ClipSemanticScale = 2 | 4;
type ClipSemanticImageControl = Extract<PageState["elements"][number], { type: "image" }>;
type ClipSemanticRoiName = "inside" | "outside-top" | "outside-bottom";
interface ClipSemanticRoi {
  readonly name: ClipSemanticRoiName;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface ClipSemanticCounts {
  readonly name: ClipSemanticRoiName;
  readonly pixels: number;
  readonly baselineNonWhite: number;
  readonly clippedVsBaseline: number;
  readonly unclippedVsBaseline: number;
  readonly clippedVsUnclipped: number;
}

function clipSemanticPixelRois(pixelWidth: number, pixelHeight: number, logicalWidth: number, logicalHeight: number, scale: ClipSemanticScale) {
  const sx = pixelWidth / logicalWidth, sy = pixelHeight / logicalHeight;
  if (![pixelWidth, pixelHeight, logicalWidth, logicalHeight].every((value) => Number.isSafeInteger(value) && value > 0)
    || ![2, 4].includes(scale) || sx !== scale || sy !== scale) throw new Error("클리핑 시험은 선택한 2× 또는 4× PNG와 현재 문서 크기가 일치해야 합니다.");
  const logical: readonly [ClipSemanticRoiName, number, number, number, number][] = [
    ["inside", 140, 90, 160, 110],
    ["outside-top", 125, 25, 175, 55],
    ["outside-bottom", 125, 145, 175, 175],
  ];
  const rois: ClipSemanticRoi[] = logical.map(([name, x0, y0, x1, y1]) => {
    const x = Math.ceil(x0 * sx), y = Math.ceil(y0 * sy);
    const right = Math.floor(x1 * sx), bottom = Math.floor(y1 * sy);
    if (x < 0 || y < 0 || right > pixelWidth || bottom > pixelHeight || right <= x || bottom <= y) {
      throw new Error("클리핑 고정 검사 영역이 실제 PNG 범위를 벗어났습니다.");
    }
    return { name, x, y, width: right - x, height: bottom - y };
  });
  return { sx, sy, minimumChangedPixels: Math.ceil(8 * sx * sy), rois };
}

function clipSemanticVerdict(counts: readonly ClipSemanticCounts[], minimumChangedPixels: number): string[] {
  const failures: string[] = [];
  const names: readonly ClipSemanticRoiName[] = ["inside", "outside-top", "outside-bottom"];
  if (counts.length !== names.length || new Set(counts.map((item) => item.name)).size !== names.length
    || names.some((name) => !counts.some((item) => item.name === name))) return ["검사 영역이 누락되거나 중복됐습니다."];
  if (!Number.isSafeInteger(minimumChangedPixels) || minimumChangedPixels < 1) return ["최소 변화 픽셀 수가 올바르지 않습니다."];
  for (const item of counts) {
    if (![item.pixels, item.baselineNonWhite, item.clippedVsBaseline, item.unclippedVsBaseline, item.clippedVsUnclipped]
      .every((value) => Number.isSafeInteger(value) && value >= 0)
      || item.pixels < minimumChangedPixels
      || [item.baselineNonWhite, item.clippedVsBaseline, item.unclippedVsBaseline, item.clippedVsUnclipped]
        .some((value) => value > item.pixels)) {
      failures.push(`${item.name}: 관측 픽셀 수가 올바르지 않습니다.`);
      continue;
    }
    if (item.name === "inside") {
      if (item.clippedVsBaseline <= minimumChangedPixels) failures.push("inside: 클리핑 안의 안료가 기준 아래 획과 구별되지 않습니다.");
      if (item.unclippedVsBaseline <= minimumChangedPixels) failures.push("inside: 클리핑 해제 대조의 안료를 확인하지 못했습니다.");
      if (item.clippedVsUnclipped !== 0) failures.push("inside: 마스크 내부의 안료 외관이 두 대조에서 다릅니다.");
    } else {
      if (item.baselineNonWhite !== 0) failures.push(`${item.name}: 기준 PNG가 흰 배경이 아니어서 영역의 독립성이 성립하지 않습니다.`);
      if (item.unclippedVsBaseline <= minimumChangedPixels) failures.push(`${item.name}: 잘려야 할 안료를 해제 대조에서 확인하지 못했습니다.`);
      if (item.clippedVsBaseline !== 0) failures.push(`${item.name}: 마스크 밖에 안료 또는 다른 출력 차이가 남았습니다.`);
    }
  }
  return failures;
}

function createCrossingLegacyClipFixture() {
  const fixture = legacyPage(2);
  const underlay = fixture.page.elements.find((element) => element.id === "base-stroke");
  if (!underlay || underlay.type !== "draw") throw new Error("기존 합성 아래 획을 찾지 못했습니다.");
  const source: DrawEl = { ...structuredClone(fixture.source), points: [150, 20, 150, 100, 150, 180] };
  const svgDataUrl = (content: string) => `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${content}</svg>`,
  ).toString("base64")}`;
  // 자연 크기가 같은 원본·알파 마스크를 둔다. 교차 안료 ROI와는 겹치지 않는다.
  const image: ClipSemanticImageControl = {
    id: "qa-clip-semantic-masked-image", type: "image", x: 400, y: 200, width: 64, height: 64, rotation: 0,
    src: svgDataUrl('<rect width="64" height="64" fill="#1e78c8"/>'),
    maskSrc: svgDataUrl('<rect width="32" height="64" fill="#ffffff"/>'), maskEnabled: true, clipBelow: false,
  };
  const page: PageState = {
    ...structuredClone(fixture.page), id: "qa-clip-semantic-v28-page",
    elements: [{ ...structuredClone(underlay), points: [30, 100, 260, 100], strokeWidth: 60 }, source, image],
  };
  return { page, source, image };
}

function assertClipSemanticImagePreserved(document: Record<string, unknown>, image: ClipSemanticImageControl): void {
  expect(records(document.elements).filter((element) => element.id === image.id)).toEqual([image]);
}

function clipSemanticImagePixelRois(scale: ClipSemanticScale) {
  if (![2, 4].includes(scale)) throw new Error("이미지 마스크 대조는 2× 또는 4×만 검사합니다.");
  return [
    { name: "image-inside", x: 408 * scale, y: 216 * scale, width: 12 * scale, height: 16 * scale, expected: [30, 120, 200, 255] },
    { name: "image-outside", x: 444 * scale, y: 216 * scale, width: 12 * scale, height: 16 * scale, expected: [255, 255, 255, 255] },
  ];
}

async function verifyClipSemanticMaskedImagePng(page: Page, testInfo: TestInfo, png: Buffer, scale: ClipSemanticScale, logicalHeight: number, name: string): Promise<void> {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const { STUDIO_CANVAS_WIDTH } = await import("../apps/web/src/domains/creator/canvas/studio-canvas-constants");
  clipSemanticPixelRois(width, height, STUDIO_CANVAS_WIDTH, logicalHeight, scale);
  const rois = clipSemanticImagePixelRois(scale);
  const counts = await page.evaluate(async ({ bytes, width, height, rois }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    try {
      if (bitmap.width !== width || bitmap.height !== height) throw new Error("이미지 마스크 대조 PNG의 실제 크기가 헤더와 다릅니다.");
      return rois.map((roi) => {
        if (roi.x < 0 || roi.y < 0 || roi.x + roi.width > width || roi.y + roi.height > height) throw new Error("이미지 마스크 ROI가 PNG 밖입니다.");
        const canvas = document.createElement("canvas"); canvas.width = roi.width; canvas.height = roi.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("이미지 마스크 대조의 Canvas2D를 만들지 못했습니다.");
        context.drawImage(bitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
        const data = context.getImageData(0, 0, roi.width, roi.height).data;
        let mismatchedPixels = 0;
        for (let offset = 0; offset < data.length; offset += 4) {
          if (roi.expected.some((channel, index) => {
            const actual = data[offset + index];
            return actual === undefined || Math.abs(actual - channel) > 1;
          })) mismatchedPixels += 1;
        }
        return { ...roi, pixels: roi.width * roi.height, mismatchedPixels };
      });
    } finally { bitmap.close(); }
  }, { bytes: [...png], width, height, rois });
  await testInfo.attach(`${name}.masked-image.json`, { body: JSON.stringify({ width, height, scale, tolerancePerChannel: 1, counts }, null, 2), contentType: "application/json" });
  expect(counts.map((roi) => roi.name)).toEqual(["image-inside", "image-outside"]);
  expect(counts.map((roi) => roi.mismatchedPixels)).toEqual([0, 0]);
}

function clipSemanticControlPage(converted: Record<string, unknown>, sourceId: string, variant: ClipSemanticVariant): Record<string, unknown> {
  const control = structuredClone(converted);
  const elements = records(control.elements);
  if (elements.filter((element) => element.id === sourceId).length !== 1) throw new Error("대조 문서의 활성 안료 획이 유일하지 않습니다.");
  control.elements = elements.map((element) => element.id !== sourceId ? element
    : variant === "baseline" ? { ...element, hidden: true }
      : variant === "unclipped" ? { ...element, clipBelow: false } : element);
  // 숨긴 원본, 그룹, 순서, seed·입력 채널은 바꾸지 않는다. 활성 획의 단일 대조 플래그만 허용한다.
  const activeBefore = elements.find((element) => element.id === sourceId);
  const activeAfter = records(control.elements).find((element) => element.id === sourceId);
  expect(activeAfter).toEqual(variant === "baseline" ? { ...activeBefore, hidden: true }
    : variant === "unclipped" ? { ...activeBefore, clipBelow: false } : activeBefore);
  expect(records(control.elements).filter((element) => element.id !== sourceId)).toEqual(elements.filter((element) => element.id !== sourceId));
  expect(control.groups).toEqual(converted.groups);
  return control;
}

async function seedClipSemanticDraft(page: Page, route: string, raw: string, ready: () => Promise<boolean>): Promise<string> {
  if (!/^\/studio\/draft\/qa-clip-semantic-v28-[a-z0-9-]+\?workspace=draw$/u.test(route)) {
    throw new Error("클리핑 시험 전용 임시 원고 경로가 아닙니다.");
  }
  await page.goto(route, { waitUntil: "domcontentloaded" });
  const url = new URL(page.url());
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("클리핑 시험은 로컬 시험 서버에서만 문서를 저장할 수 있습니다.");
  const actualRoute = parseStudioWorkspaceRoute({ pathname: url.pathname, search: url.search });
  if (!actualRoute.valid || actualRoute.projectId || actualRoute.documentId || !actualRoute.draftId?.startsWith("qa-clip-semantic-v28-")) {
    throw new Error("현재 경로가 공유 프로젝트와 분리된 시험 draft인지 확인하지 못했습니다.");
  }
  await waitForEditorSettled(page);
  const key = currentKey(page);
  const existing = await readDurableStudioAutosaveDocument(page, key);
  if (existing?.pagesList.some((candidate) => Array.isArray(candidate.elements) && candidate.elements.length > 0)) {
    throw new Error("시험 draft에 이미 그려진 요소가 있어 덮어쓰기를 중단했습니다.");
  }
  const moduleUrl = await resolveDurableStudioAutosaveModuleUrl(page);
  if (!moduleUrl) throw new Error("제품의 내구 저장 모듈을 찾지 못했습니다.");
  await page.goto("/studio", { waitUntil: "domcontentloaded" });
  await seedDurableStudioAutosaveDocument(page, key, raw, moduleUrl);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(currentKey(page)).toBe(key);
  await restoreIfPrompted(page, ready);
  await waitForEditorSettled(page);
  return key;
}

async function verifyClipSemanticExportSettings(page: Page, scale: ClipSemanticScale, logicalHeight: number, transparent = false): Promise<void> {
  const { STUDIO_CANVAS_WIDTH } = await import("../apps/web/src/domains/creator/canvas/studio-canvas-constants");
  if (STUDIO_CANVAS_WIDTH !== 720 || logicalHeight !== 640) throw new Error("공개 UI 4× 권장값의 고정 원고 크기가 달라졌습니다.");
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  const print = panel.locator('[data-studio-export-section="print"]');
  const openPrint = async () => {
    if (await print.getAttribute("open") === null) await print.locator("summary").click();
    await expect(print).toHaveAttribute("open", "");
  };
  await openPrint();
  // 이전 원고의 인쇄 목표는 기본 화면 preset으로 해제하며 배율은 아래에서 따로 선택한다.
  await print.getByTestId("export-geometry-preset-webtoon72").click();
  if (scale === 2) {
    const scaleButton = panel.locator('[data-studio-export-basic="true"]').getByRole("button", { name: "2×", exact: true });
    await scaleButton.click();
    await expect(scaleButton).toHaveAttribute("aria-pressed", "true");
  } else {
    // 고정 4× 버튼은 없다. 기존 인쇄 권장 UI가 정확 4×를 계산하는 값만 사용한다.
    await openPrint();
    await print.getByTestId("export-geometry-dpi").fill("254");
    await print.getByTestId("export-geometry-bleed").fill("0");
    await print.getByTestId("export-geometry-trim-w").fill("287.9");
    await print.getByTestId("export-geometry-trim-h").fill("255.9");
    const recommended = print.getByTestId("export-geometry-recommend-scale");
    await expect(recommended).toHaveText(/^배율 권장 4× · 254DPI$/u);
    await recommended.click();
    await expect(print.getByTestId("export-geometry-actual")).toContainText("실제 저장: 4×");
    // 권장 적용으로 details가 닫힐 수 있으므로 다시 열고 printmetadata만 기본값으로 복원한다.
    await openPrint();
    await print.getByTestId("export-geometry-preset-webtoon72").click();
  }
  await expect(print.getByTestId("export-geometry-preset-webtoon72")).toHaveAttribute("aria-pressed", "true");
  await expect(print.getByTestId("export-geometry-dpi")).toHaveValue("72");
  for (const field of ["export-geometry-trim-w", "export-geometry-trim-h", "export-geometry-bleed"]) {
    await expect(print.getByTestId(field)).toHaveValue("");
  }
  await expect(print.getByTestId("export-geometry-dpi-alert")).toHaveCount(0);
  const actual = print.getByTestId("export-geometry-actual");
  await expect(actual).toContainText(`실제 저장: ${scale}×`);
  await expect(actual).toContainText(`${STUDIO_CANVAS_WIDTH * scale}×${logicalHeight * scale}px`);
  if (transparent) await setClipSemanticTransparencyInPanel(panel, true);
  const summary = panel.locator('[data-studio-export-output-summary="true"]');
  await expect(summary).toContainText(`PNG · ${STUDIO_CANVAS_WIDTH * scale} × ${logicalHeight * scale} px`);
  await expect(summary.getByText(transparent ? "투명 배경 켜짐" : "배경 유지", { exact: true })).toBeVisible();
  await expect(summary.getByText("사용 안 함", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  await expect(panel).toHaveCount(0);
}

async function countClipSemanticPixels(page: Page, pngs: Record<ClipSemanticVariant, Buffer>, logicalHeight: number, scale: ClipSemanticScale) {
  const width = pngs.clipped.readUInt32BE(16), height = pngs.clipped.readUInt32BE(20);
  for (const png of Object.values(pngs)) {
    expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(height);
  }
  const { STUDIO_CANVAS_WIDTH } = await import("../apps/web/src/domains/creator/canvas/studio-canvas-constants");
  const geometry = clipSemanticPixelRois(width, height, STUDIO_CANVAS_WIDTH, logicalHeight, scale);
  const counts = await page.evaluate(async ({ images, pixelWidth, pixelHeight, rois }) => {
    // 한 장씩 디코딩하고 작은 ROI만 복사한다. 전체 RGBA 세 장을 동시에 복제하지 않는다.
    const decoded = new Map<string, Uint8ClampedArray[]>();
    for (const [variant, bytes] of Object.entries(images)) {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      try {
        if (bitmap.width !== pixelWidth || bitmap.height !== pixelHeight) throw new Error("헤더와 실제 PNG 디코딩 크기가 다릅니다.");
        decoded.set(variant, rois.map((roi) => {
          const canvas = document.createElement("canvas"); canvas.width = roi.width; canvas.height = roi.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("클리핑 픽셀 검사용 Canvas2D를 만들지 못했습니다.");
          context.drawImage(bitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
          return context.getImageData(0, 0, roi.width, roi.height).data;
        }));
      } finally { bitmap.close(); }
    }
    const baseline = decoded.get("baseline"), clipped = decoded.get("clipped"), unclipped = decoded.get("unclipped");
    if (!baseline || !clipped || !unclipped) throw new Error("세 PNG 대조가 모두 준비되지 않았습니다.");
    return rois.map((roi, index) => {
      const b = baseline[index], c = clipped[index], u = unclipped[index];
      if (!b || !c || !u) throw new Error("PNG 대조의 고정 검사 영역이 없습니다.");
      let baselineNonWhite = 0, clippedVsBaseline = 0, unclippedVsBaseline = 0, clippedVsUnclipped = 0;
      for (let offset = 0; offset < b.length; offset += 4) {
        let white = true, cb = false, ub = false, cu = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const bv = b[offset + channel]!, cv = c[offset + channel]!, uv = u[offset + channel]!;
          white &&= Math.abs(bv - 255) <= 1;
          cb ||= Math.abs(cv - bv) > 1; ub ||= Math.abs(uv - bv) > 1; cu ||= Math.abs(cv - uv) > 1;
        }
        baselineNonWhite += Number(!white); clippedVsBaseline += Number(cb);
        unclippedVsBaseline += Number(ub); clippedVsUnclipped += Number(cu);
      }
      return { name: roi.name, pixels: roi.width * roi.height, baselineNonWhite, clippedVsBaseline, unclippedVsBaseline, clippedVsUnclipped };
    });
  }, { images: { baseline: [...pngs.baseline], clipped: [...pngs.clipped], unclipped: [...pngs.unclipped] }, pixelWidth: width, pixelHeight: height, rois: geometry.rois });
  return { width, height, ...geometry, tolerancePerChannel: 1, counts, failures: clipSemanticVerdict(counts, geometry.minimumChangedPixels) };
}

// 교차 시험의 기존 helper를 재사용하며 투명 배경도 공개 UI로만 선택한다.
async function setClipSemanticTransparencyInPanel(panel: ReturnType<Page["locator"]>, transparent: boolean): Promise<void> {
  const appearance = panel.locator('[data-studio-export-section="appearance"]');
  if (await appearance.getAttribute("open") === null) await appearance.locator("summary").click();
  const checkbox = appearance.getByRole("checkbox", { name: "투명 배경 (PNG·WebP)", exact: true });
  await expect(checkbox).toBeEnabled();
  await checkbox.setChecked(transparent);
  if (transparent) await expect(checkbox).toBeChecked();
  else await expect(checkbox).not.toBeChecked();
}

async function restoreClipSemanticOpaqueUi(page: Page): Promise<void> {
  const panel = page.locator('[data-studio-export-menu-panel="true"]');
  if (await panel.count() === 0) await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  await setClipSemanticTransparencyInPanel(panel, false);
  await expect(panel.locator('[data-studio-export-output-summary="true"]').getByText("배경 유지", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "내보내기 옵션", exact: true }).click();
  await expect(panel).toHaveCount(0);
}

function clipSemanticPureMaterialPage(converted: Record<string, unknown>, sourceId: string, image: ClipSemanticImageControl): Record<string, unknown> {
  const pure = clipSemanticControlPage(converted, sourceId, "unclipped");
  const elements = records(pure.elements);
  for (const id of ["base-stroke", image.id]) expect(elements.filter((element) => element.id === id)).toHaveLength(1);
  pure.elements = elements.map((element) => element.id === "base-stroke" || element.id === image.id ? { ...element, hidden: true } : element);
  expect(records(pure.elements)).toEqual(elements.map((element) => element.id === "base-stroke" || element.id === image.id ? { ...element, hidden: true } : element));
  expect(pure.groups).toEqual(converted.groups);
  assertClipSemanticImagePreserved(pure, { ...image, hidden: true });
  return pure;
}

async function countClipSemanticAlphaReference(page: Page, baseline: Buffer, clipped: Buffer, material: Buffer, logicalHeight: number, scale: ClipSemanticScale) {
  const width = baseline.readUInt32BE(16), height = baseline.readUInt32BE(20);
  for (const png of [clipped, material]) {
    expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(height);
  }
  const { STUDIO_CANVAS_WIDTH } = await import("../apps/web/src/domains/creator/canvas/studio-canvas-constants");
  const geometry = clipSemanticPixelRois(width, height, STUDIO_CANVAS_WIDTH, logicalHeight, scale);
  const observations = await page.evaluate(async ({ images, width, height, rois, blankRois }) => {
    const decoded = new Map<string, Uint8ClampedArray[]>();
    const transparentBackground: { name: string; pixels: number; nonzeroAlphaPixels: number }[] = [];
    for (const [kind, bytes] of Object.entries(images)) {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      try {
        if (bitmap.width !== width || bitmap.height !== height) throw new Error("P 참조 PNG의 실제 크기가 헤더와 다릅니다.");
        const readRoi = (roi: { x: number; y: number; width: number; height: number }) => {
          if (roi.x < 0 || roi.y < 0 || roi.x + roi.width > width || roi.y + roi.height > height) throw new Error("P 참조 ROI가 PNG 밖입니다.");
          const canvas = document.createElement("canvas"); canvas.width = roi.width; canvas.height = roi.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("P 참조 Canvas2D를 만들지 못했습니다.");
          context.drawImage(bitmap, roi.x, roi.y, roi.width, roi.height, 0, 0, roi.width, roi.height);
          return context.getImageData(0, 0, roi.width, roi.height).data;
        };
        decoded.set(kind, rois.map(readRoi));
        if (kind === "material") for (const roi of blankRois) {
          const data = readRoi(roi);
          if (data.length !== roi.width * roi.height * 4) throw new Error("P의 빈 alpha ROI byte 길이가 다릅니다.");
          let nonzeroAlphaPixels = 0;
          for (let offset = 3; offset < data.length; offset += 4) if (data[offset] !== 0) nonzeroAlphaPixels += 1;
          transparentBackground.push({ name: roi.name, pixels: roi.width * roi.height, nonzeroAlphaPixels });
        }
      } finally { bitmap.close(); }
    }
    const b = decoded.get("baseline"), c = decoded.get("clipped"), p = decoded.get("material");
    if (!b || !c || !p) throw new Error("B/C/P 참조 PNG가 모두 준비되지 않았습니다.");
    const counts = rois.map((roi, index) => {
      const bg = b[index], actual = c[index], pure = p[index];
      const pixels = roi.width * roi.height;
      if (!bg || !actual || !pure || [bg, actual, pure].some((data) => data.length !== pixels * 4)) throw new Error("P 참조 ROI byte 길이가 다릅니다.");
      const expectedMaskAlpha = roi.name === "inside" ? 1 : 0;
      const expectedBaseline = expectedMaskAlpha === 1 ? [32, 32, 32, 255] : [255, 255, 255, 255];
      let baselinePreconditionMismatches = 0, materialNonzeroAlphaPixels = 0, referenceMismatchedPixels = 0;
      let materialAlphaMin = 255, materialAlphaMax = 0;
      const maxAbsoluteDeltaRGBA = [0, 0, 0, 0], absoluteSums = [0, 0, 0, 0];
      for (let offset = 0; offset < pure.length; offset += 4) {
        const alpha = pure[offset + 3];
        if (alpha === undefined) throw new Error("P alpha가 없습니다.");
        materialNonzeroAlphaPixels += Number(alpha > 0);
        materialAlphaMin = Math.min(materialAlphaMin, alpha); materialAlphaMax = Math.max(materialAlphaMax, alpha);
        baselinePreconditionMismatches += Number(expectedBaseline.some((value, channel) => bg[offset + channel] !== value));
        let mismatch = false;
        for (let channel = 0; channel < 4; channel += 1) {
          const pValue = pure[offset + channel], bValue = bg[offset + channel], cValue = actual[offset + channel];
          if (pValue === undefined || bValue === undefined || cValue === undefined) throw new Error("P 참조 RGBA 채널이 없습니다.");
          // B alpha=1인 ROI만 허용한다. premul byte 중간 반올림 없이 마지막에 한 번 양자화한다.
          const expected = channel === 3 ? 255 : expectedMaskAlpha === 0 ? bValue
            : Math.round((pValue * alpha + bValue * (255 - alpha)) / 255);
          const delta = Math.abs(cValue - expected);
          const previousMax = maxAbsoluteDeltaRGBA[channel], previousSum = absoluteSums[channel];
          if (previousMax === undefined || previousSum === undefined) throw new Error("P 참조 집계 채널이 없습니다.");
          maxAbsoluteDeltaRGBA[channel] = Math.max(previousMax, delta); absoluteSums[channel] = previousSum + delta;
          mismatch ||= delta > 1;
        }
        referenceMismatchedPixels += Number(mismatch);
      }
      return { name: roi.name, pixels, expectedMaskAlpha, baselinePreconditionMismatches, materialNonzeroAlphaPixels,
        materialAlphaMin, materialAlphaMax, referenceMismatchedPixels, maxAbsoluteDeltaRGBA,
        meanAbsoluteDeltaRGBA: absoluteSums.map((sum) => sum / pixels) };
    });
    return { counts, transparentBackground };
  }, { images: { baseline: [...baseline], clipped: [...clipped], material: [...material] }, width, height,
    rois: geometry.rois, blankRois: clipSemanticImagePixelRois(scale) });
  const failures: string[] = [];
  for (const row of observations.counts) {
    if (row.baselinePreconditionMismatches !== 0) failures.push(`${row.name}: B의 고정 불투명/빈 마스크 전제가 성립하지 않습니다.`);
    if (row.materialNonzeroAlphaPixels <= geometry.minimumChangedPixels) failures.push(`${row.name}: P의 유의미한 안료 alpha를 확인하지 못했습니다.`);
    if (row.referenceMismatchedPixels !== 0) failures.push(`${row.name}: 별도 P-over-B 참조와 C가 허용 차이1을 넘습니다.`);
  }
  for (const row of observations.transparentBackground) if (row.nonzeroAlphaPixels !== 0) failures.push(`${row.name}: P의 빈 영역 alpha가0이 아닙니다.`);
  return { width, height, scale, tolerancePerChannel: 1, minimumChangedPixels: geometry.minimumChangedPixels,
    formula: "inside E=round((P.rgb*P.a+B.rgb*(255-P.a))/255), E.a=255; outside E=B", ...observations, failures };
}

if (process.env.TOONSTUDIO_PIGMENT_CLIP_CONTRAST === "1") {
  test("분리 진단: V2 클리핑 교차 픽셀 의미", async ({ page }, testInfo) => {
    // 다섯 draft·여덟 번 내보내기를 포함하되 전체 540초·제품 8초 한도는 유지한다.
    test.setTimeout(480_000);
    const baseURL = testInfo.project.use.baseURL;
    if (!baseURL || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)
      || testInfo.project.use.storageState !== undefined) {
      throw new Error("이 초안은 저장 상태를 재사용하지 않는 로컬 새 Playwright 문맥에서만 실행할 수 있습니다.");
    }
    if (process.env.TOONSTUDIO_PROFILE_CAPTURE_CPU === "1") throw new Error("클리핑 의미 시험은 CPU 관측을 끈 별도 진단으로 실행해야 합니다.");
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    const fixture = createCrossingLegacyClipFixture();
    const nonce = crypto.randomUUID();
    const routeFor = (suffix: string) => `/studio/draft/qa-clip-semantic-v28-${nonce}-${suffix}?workspace=draw`;
    const warning = page.getByRole("region", { name: "이전 혼색 획 확인", exact: true });
    const sourceRoute = routeFor("source");
    const sourceKey = await seedClipSemanticDraft(page, sourceRoute, serializeStudioAutosave({
      version: 2, savedAt: new Date().toISOString(), currentPageId: fixture.page.id, pagesList: [fixture.page],
    }), () => warning.isVisible());
    const before = await savedPage(page, sourceKey, fixture.page.id);
    expect(before.elements).toEqual(fixture.page.elements);
    const originalPending = page.waitForEvent("download");
    await warning.getByRole("button", { name: "원본 파일 내려받기", exact: true }).click();
    const original = record(JSON.parse((await fileBytes(await originalPending, testInfo, "clip-v2-original.json")).toString("utf8")));
    expect(original.format).toBe("toonstudio-legacy-pigment-source");
    expect(original.elements).toEqual(before.elements); expect(original.groups).toEqual(before.groups);
    await warning.getByRole("button", { name: "원본 보존·자체 혼색 사본 만들기", exact: true }).click();
    await expect(warning).toHaveCount(0);
    await expect.poll(async () => records((await savedPage(page, sourceKey, fixture.page.id)).elements)
      .some((element) => element.legacyPigmentArchive !== undefined)).toBe(true);
    const converted = await savedPage(page, sourceKey, fixture.page.id);
    assertPreserved(fixture.source, before, converted);
    assertClipSemanticImagePreserved(converted, fixture.image);
    await page.reload({ waitUntil: "domcontentloaded" });
    await restoreIfPrompted(page, () => page.locator("[data-studio-canvas-viewport]").first().isVisible());
    await waitForEditorSettled(page);
    const sourceAfterReopen = await savedPage(page, sourceKey, fixture.page.id);
    expect(sourceAfterReopen.elements).toEqual(converted.elements);
    assertPreserved(fixture.source, before, sourceAfterReopen);
    assertClipSemanticImagePreserved(sourceAfterReopen, fixture.image);
    const sourceProject = await downloadBackup(page, testInfo, "clip-v2-source-converted-project.json");
    const sourceBackupPage = records(sourceProject.pagesList).find((candidate) => candidate.id === fixture.page.id);
    expect(sourceBackupPage?.elements).toEqual(sourceAfterReopen.elements);
    if (!sourceBackupPage) throw new Error("이미지 마스크를 보존한 source 백업 페이지가 없습니다.");
    assertClipSemanticImagePreserved(sourceBackupPage, fixture.image);
    const durable = await readDurableStudioAutosaveDocument(page, sourceKey);
    if (!durable) throw new Error("대조용으로 복제할 내구 원고를 읽지 못했습니다.");
    const payload = record(JSON.parse(durable.raw));
    const pngs: Record<ClipSemanticScale, Partial<Record<ClipSemanticVariant, Buffer>>> = { 2: {}, 4: {} };
    const keys = new Set([sourceKey]);
    for (const variant of ["baseline", "unclipped", "clipped"] as const) {
      const control = clipSemanticControlPage(sourceAfterReopen, fixture.source.id, variant);
      const controlRaw = JSON.stringify({ ...payload, savedAt: new Date().toISOString(), currentPageId: fixture.page.id, pagesList: [control] });
      const route = routeFor(variant);
      const key = await seedClipSemanticDraft(page, route, controlRaw,
        () => page.locator("[data-studio-canvas-viewport]").first().isVisible());
      expect(keys.has(key)).toBe(false); keys.add(key);
      const persisted = await savedPage(page, key, fixture.page.id);
      expect(persisted.elements).toEqual(control.elements); expect(persisted.groups).toEqual(control.groups);
      expect(persisted.animTimeline).toEqual(control.animTimeline);
      assertClipSemanticImagePreserved(persisted, fixture.image);
      if (variant === "clipped") assertPreserved(fixture.source, before, persisted);
      const backup = await downloadBackup(page, testInfo, `clip-v2-${variant}-project.json`);
      const backupPage = records(backup.pagesList).find((candidate) => candidate.id === fixture.page.id);
      expect(backupPage?.elements).toEqual(control.elements); expect(backupPage?.groups).toEqual(control.groups);
      for (const scale of [2, 4] as const) {
        await verifyClipSemanticExportSettings(page, scale, fixture.page.canvasH);
        // 기존 native 관측은 clipped 2× 한 장에만 연결하고 나머지 다섯 파일명은 고유하게 둔다.
        const filename = variant === "clipped" && scale === 2 ? "v2-converted.png" : `clip-v2-${variant}-${scale}x.png`;
        const png = await downloadPng(page, testInfo, filename);
        pngs[scale][variant] = png;
        await verifyClipSemanticMaskedImagePng(page, testInfo, png, scale, fixture.page.canvasH, filename);
        const afterCapture = await savedPage(page, key, fixture.page.id);
        expect(afterCapture.elements).toEqual(control.elements);
        assertClipSemanticImagePreserved(afterCapture, fixture.image);
        expect(await savedPage(page, sourceKey, fixture.page.id)).toEqual(sourceAfterReopen);
      }
    }
    // 기존 B/U/C 6PNG 뒤에서 두 배율의 strict 진단을 먼저 보존한다. 최종 assertion은 아래에 유지한다.
    const strictResults: { scale: ClipSemanticScale; result: Awaited<ReturnType<typeof countClipSemanticPixels>> }[] = [];
    for (const scale of [2, 4] as const) {
      const density = pngs[scale];
      if (!density.baseline || !density.clipped || !density.unclipped) throw new Error(`${scale}× 실제 UI PNG 세 장을 모두 받지 못했습니다.`);
      const result = await countClipSemanticPixels(page, { baseline: density.baseline, clipped: density.clipped, unclipped: density.unclipped }, fixture.page.canvasH, scale);
      await testInfo.attach(`clip-v2-semantic-pixels-${scale}x.json`, { body: JSON.stringify({ status: "executed-strict-CU-diagnostic", strictContractUnchanged: true, scale, ...result }, null, 2), contentType: "application/json" });
      strictResults.push({ scale, result });
    }

    const purePage = clipSemanticPureMaterialPage(sourceAfterReopen, fixture.source.id, fixture.image);
    const pureRaw = JSON.stringify({ ...payload, savedAt: new Date().toISOString(), currentPageId: fixture.page.id, pagesList: [purePage] });
    const pureKey = await seedClipSemanticDraft(page, routeFor("material-alpha"), pureRaw,
      () => page.locator("[data-studio-canvas-viewport]").first().isVisible());
    expect(keys.has(pureKey)).toBe(false); keys.add(pureKey); expect(keys.size).toBe(5);
    const purePersisted = await savedPage(page, pureKey, fixture.page.id);
    expect(purePersisted.elements).toEqual(purePage.elements); expect(purePersisted.groups).toEqual(purePage.groups);
    assertClipSemanticImagePreserved(purePersisted, { ...fixture.image, hidden: true });
    const pureBackup = await downloadBackup(page, testInfo, "clip-v2-material-alpha-project.json");
    expect(records(pureBackup.pagesList).find((candidate) => candidate.id === fixture.page.id)?.elements).toEqual(purePage.elements);
    const purePngs: Partial<Record<ClipSemanticScale, Buffer>> = {};
    let pureCaptureFailure: { error: unknown } | undefined;
    let opaqueRestoreFailure: { error: unknown } | undefined;
    try {
      for (const scale of [2, 4] as const) {
        await verifyClipSemanticExportSettings(page, scale, fixture.page.canvasH, true);
        purePngs[scale] = await downloadPng(page, testInfo, `clip-v2-material-alpha-${scale}x.png`);
        expect((await savedPage(page, pureKey, fixture.page.id)).elements).toEqual(purePage.elements);
        expect(await savedPage(page, sourceKey, fixture.page.id)).toEqual(sourceAfterReopen);
      }
    } catch (error) { pureCaptureFailure = { error }; }
    finally {
      try { await restoreClipSemanticOpaqueUi(page); }
      catch (error) { opaqueRestoreFailure = { error }; }
    }
    if (pureCaptureFailure) {
      if (opaqueRestoreFailure) throw Object.assign(new Error("P 캡처와 투명 배경 설정 복원에 실패했습니다."), {
        cause: pureCaptureFailure.error, transparentRestoreError: opaqueRestoreFailure.error,
      });
      throw pureCaptureFailure.error;
    }
    if (opaqueRestoreFailure) throw opaqueRestoreFailure.error;
    // 실패한 캡처·복원은 먼저 다시 던져 관측 첨부 오류가 원래 오류를 덮지 않게 한다.
    await testInfo.attach("clip-v2-P-export-preferences.json", { body: JSON.stringify({ capturedPNGCount: Object.keys(purePngs).length,
      captureFailed: false, restoredTransparentFalse: true }), contentType: "application/json" });

    const referenceResults: Awaited<ReturnType<typeof countClipSemanticAlphaReference>>[] = [];
    for (const strict of strictResults) {
      const density = pngs[strict.scale], pure = purePngs[strict.scale];
      if (!density.baseline || !density.clipped || !pure) throw new Error("B/C/P의 두 배율 PNG를 모두 받지 못했습니다.");
      const reference = await countClipSemanticAlphaReference(page, density.baseline, density.clipped, pure, fixture.page.canvasH, strict.scale);
      await testInfo.attach(`clip-v2-alpha-reference-${strict.scale}x.json`, { body: JSON.stringify({ status: "executed-auxiliary-reference",
        strictCUDiagnostic: strict.result, reference }, null, 2), contentType: "application/json" });
      referenceResults.push(reference);
    }
    // P가 설명하더라도 기존 strict C-U 실패를 통과로 바꾸지 않는다. 모든 참조 첨부를 확보한 뒤 같은 assertion을 실행한다.
    for (const { result } of strictResults) expect(result.failures).toEqual([]);
    for (const reference of referenceResults) expect(reference.failures).toEqual([]);
    expect(errors).toEqual([]);
  });
}
