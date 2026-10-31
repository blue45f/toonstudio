import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { register } from "tsx/cjs/api";

import type { StudioHybridDccWorkspace } from "../../src/domains/creator/hybrid-dcc/studio-hybrid-dcc-workspace";

/** 제품 코덱을 그대로 읽고, 테스트 수집에 사용한 범위 지정 TypeScript 로더를 해제한다. */
function loadWorkfileReader() {
  const loader = register({ namespace: "toonstudio-native-uv-workfile-reader" });
  try {
    const workfile: typeof import("../../src/domains/creator/hybrid-dcc/studio-hybrid-dcc-workfile") = loader.require("../../src/domains/creator/hybrid-dcc/studio-hybrid-dcc-workfile.ts", __filename);
    const mesh: typeof import("../../src/domains/creator/studio-editable-half-edge-mesh") = loader.require("../../src/domains/creator/studio-editable-half-edge-mesh.ts", __filename);
    return { decodeStudioHybridDccWorkfile: workfile.decodeStudioHybridDccWorkfile, serializeStudioEditableMesh: mesh.serializeStudioEditableMesh };
  } finally {
    loader.unregister();
  }
}

const { decodeStudioHybridDccWorkfile, serializeStudioEditableMesh } = loadWorkfileReader();
const DOCUMENT_ID = "native-auto-uv-browser-proof";
const PROVIDER_WORKER = "studio-xatlas-uv-provider.worker";

function activeMesh(workspace: StudioHybridDccWorkspace) {
  const id = workspace.activeAssetId;
  const record = id ? workspace.session.state.geometry.records[id] : undefined;
  if (!record) throw new Error("작업파일의 활성 정본 메시가 없습니다.");
  const snapshot = serializeStudioEditableMesh(record.mesh);
  const { uvLayer, ...geometry } = snapshot;
  return { snapshot, uvLayer, geometry };
}

function geometryCommits(workspace: StudioHybridDccWorkspace): number {
  return workspace.session.journal.records.filter((record) =>
    record.recordType === "command" && record.command.kind === "geometry.commit",
  ).length;
}

async function saveWorkfile(page: Page, panel: Locator, info: TestInfo, name: string) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "작업파일 저장", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.toon3d$/u);
  const path = info.outputPath(`${name}.toon3d`);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  const workspace = decodeStudioHybridDccWorkfile(Uint8Array.from(await readFile(path)), { documentId: DOCUMENT_ID });
  return { path, workspace, mesh: activeMesh(workspace) };
}

async function recordHardware(page: Page, canvas: Locator, info: TestInfo) {
  const session = await page.context().newCDPSession(page);
  try {
    const version: unknown = await session.send("Browser.getVersion");
    const command: unknown = await session.send("Browser.getBrowserCommandLine");
    if (!command || typeof command !== "object" || !("arguments" in command)
      || !Array.isArray(command.arguments) || !command.arguments.every((argument: unknown) => typeof argument === "string")) {
      throw new Error("실행한 Chrome의 명령행을 확인하지 못했습니다.");
    }
    const argumentsList: readonly unknown[] = command.arguments;
    const executable = argumentsList[0];
    if (typeof executable !== "string") throw new Error("실행한 Chrome 경로가 없습니다.");
    expect(executable).toMatch(/chrome|chromium/iu);
    expect(executable).not.toMatch(/headless[_-]shell/iu);
    const forcedSoftware = argumentsList.filter((argument) => typeof argument === "string" && (
      argument === "--disable-gpu"
      || /^--(?:use-angle|use-vulkan|use-webgpu-adapter)=.*(?:swiftshader|llvmpipe|lavapipe|software)/iu.test(argument)
    ));
    expect(forcedSoftware).toEqual([]);
    const webgl = await canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) throw new Error("실제 3D 렌더 캔버스가 아닙니다.");
      const gl = element.getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      if (!gl || !extension) throw new Error("실제 WebGL2 장치 식별 정보를 읽을 수 없습니다.");
      const renderer: unknown = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
      const vendor: unknown = gl.getParameter(extension.UNMASKED_VENDOR_WEBGL);
      if (typeof renderer !== "string" || typeof vendor !== "string") throw new Error("WebGL2 장치 정보가 올바르지 않습니다.");
      return { renderer, vendor, width: element.width, height: element.height, contextLost: gl.isContextLost() };
    });
    expect(webgl.contextLost).toBe(false);
    expect(webgl.width).toBeGreaterThan(0);
    expect(webgl.height).toBeGreaterThan(0);
    expect(webgl.renderer).toMatch(/Apple|Metal|NVIDIA|AMD|Intel|Adreno|Mali/iu);
    expect(webgl.renderer).not.toMatch(/SwiftShader|llvmpipe|lavapipe|software/iu);
    await info.attach("hardware-browser.json", { body: JSON.stringify({ lane: "hardware", version, arguments: argumentsList, webgl }, null, 2), contentType: "application/json" });
    return webgl;
  } finally {
    await session.detach();
  }
}

/** 인증·저장소·Worker 대역 없이 제품의 새 로컬 문서와 실제 파일 선택기를 사용한다. */
test("기본 UV Worker의 단일 적용·되돌리기·작업파일 왕복이 실제 제품 화면에서 유지된다", async ({ page }, info) => {
  const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: info.config.rootDir, encoding: "utf8" }).trim();
  const sourceStatus = execFileSync("git", ["status", "--porcelain"], { cwd: info.config.rootDir, encoding: "utf8" });
  const specSha256 = createHash("sha256").update(await readFile(info.file)).digest("hex");
  await info.attach("source-provenance.json", { body: JSON.stringify({ sourceHead, sourceStatus, specSha256 }, null, 2), contentType: "application/json" });
  const fatal: string[] = [];
  const workerUrls: string[] = [];
  const wasmRequests: string[] = [];
  const wasm: Array<{ url: string; status: number; contentType: string; sha256: string; magic: number[] }> = [];
  const assetErrors: string[] = [];
  const assetReads: Promise<void>[] = [];
  page.on("pageerror", (error) => fatal.push(error.message));
  page.on("worker", (worker) => { if (worker.url().includes(PROVIDER_WORKER)) workerUrls.push(worker.url()); });
  page.context().on("request", (request) => {
    if (request.resourceType() !== "script" && /\/xatlas[^/]*\.wasm(?:\?|$)/u.test(request.url())) wasmRequests.push(request.url());
  });
  page.context().on("response", (response) => {
    if (response.request().resourceType() === "script" || !/\/xatlas[^/]*\.wasm(?:\?|$)/u.test(response.url())) return;
    assetReads.push(response.body().then((body) => {
      wasm.push({ url: response.url(), status: response.status(), contentType: response.headers()["content-type"] ?? "", sha256: createHash("sha256").update(body).digest("hex"), magic: Array.from(body.subarray(0, 4)) });
    }).catch((error: unknown) => { assetErrors.push(error instanceof Error ? error.message : String(error)); }));
  });

  await page.goto("/studio/3d/dcc/model", { waitUntil: "domcontentloaded" });
  const panel = page.locator('[data-studio-hybrid-dcc-panel="true"]');
  await expect(panel).toBeVisible({ timeout: 120_000 });
  const canvas = panel.locator('[data-studio-hybrid-dcc-viewport="true"] canvas[role="application"][aria-label="편집 메시 3D 렌더"]').first();
  await expect(canvas).toBeVisible();
  const hardware = await recordHardware(page, canvas, info);
  await panel.locator('[data-studio-hybrid-dcc-start="cube"]').click();
  await expect(panel.locator('[data-studio-hybrid-dcc-stats="true"]')).toHaveAttribute("data-assets", "1");
  await canvas.screenshot({ path: info.outputPath("cube-before-uv.png") });
  const before = await saveWorkfile(page, panel, info, "before");
  expect(before.mesh.uvLayer).toBeUndefined();

  await panel.locator('[data-studio-hybrid-dcc-mode="material"]').click();
  await expect(page).toHaveURL(/\/studio\/3d\/dcc\/material(?:\?|$)/u);
  const tools = panel.locator('[data-studio-hybrid-dcc-uv-atlas="true"]');
  await expect(tools).toBeVisible();
  await expect(tools.getByRole("textbox", { name: "목표 해상도 (px)", exact: true })).toHaveValue("4096");
  await expect(tools.getByRole("textbox", { name: "아일랜드 여백 (px)", exact: true })).toHaveValue("4");
  await expect(tools.getByRole("checkbox", { name: "90도 회전 허용", exact: true })).toBeChecked();
  expect(workerUrls).toEqual([]);
  expect(wasmRequests).toEqual([]);
  await tools.getByRole("button", { name: "자동 UV 펼치기", exact: true }).click();
  await expect(tools.getByRole("status")).toContainText("자동 UV를 적용했습니다.", { timeout: 90_000 });
  const applied = await saveWorkfile(page, panel, info, "applied");
  expect(applied.workspace.activeAssetId).toBe(before.workspace.activeAssetId);
  expect(applied.mesh.geometry).toEqual(before.mesh.geometry);
  expect(applied.mesh.uvLayer?.corners.length).toBeGreaterThan(0);
  expect(applied.workspace.session.state.commandCount).toBe(before.workspace.session.state.commandCount + 1);
  expect(applied.workspace.session.undoStack).toHaveLength(before.workspace.session.undoStack.length + 1);
  expect(geometryCommits(applied.workspace)).toBe(geometryCommits(before.workspace) + 1);

  await panel.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click();
  await expect(panel.locator('[data-studio-hybrid-dcc-stats="true"]')).toHaveAttribute("data-uv", "");
  const undone = await saveWorkfile(page, panel, info, "undone");
  expect(undone.mesh.snapshot).toEqual(before.mesh.snapshot);
  await panel.getByRole("button", { name: "되돌린 3D 편집 다시 실행", exact: true }).click();
  await expect(panel.locator('[data-studio-hybrid-dcc-stats="true"]')).toHaveAttribute("data-uv", "corner-uv");
  const redone = await saveWorkfile(page, panel, info, "redone");
  expect(redone.mesh.snapshot).toEqual(applied.mesh.snapshot);

  await panel.getByRole("button", { name: "마지막 3D 편집 되돌리기", exact: true }).click();
  await expect(panel.locator('[data-studio-hybrid-dcc-stats="true"]')).toHaveAttribute("data-uv", "");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    panel.getByRole("button", { name: "작업파일 열기", exact: true }).click(),
  ]);
  await chooser.setFiles(applied.path);
  const replacement = page.getByRole("dialog", { name: "3D 작업파일을 열까요?", exact: true });
  await expect(replacement).toBeVisible();
  await replacement.getByRole("button", { name: "현재 작업을 교체하고 열기", exact: true }).click();
  await expect(replacement).not.toBeVisible();
  await expect(panel.locator('[data-studio-hybrid-dcc-stats="true"]')).toHaveAttribute("data-uv", "corner-uv");
  const reopened = await saveWorkfile(page, panel, info, "reopened");
  expect(reopened.mesh.snapshot).toEqual(applied.mesh.snapshot);
  expect(reopened.workspace.session.undoStack).toHaveLength(applied.workspace.session.undoStack.length);
  expect(geometryCommits(reopened.workspace)).toBe(geometryCommits(applied.workspace));

  await Promise.all(assetReads);
  expect(assetErrors).toEqual([]);
  expect(workerUrls).toHaveLength(1);
  expect(wasm.length).toBeGreaterThan(0);
  for (const asset of wasm) {
    expect(asset.status).toBe(200);
    expect(asset.contentType.split(";")[0]?.trim().toLowerCase()).toBe("application/wasm");
    expect(asset.magic).toEqual([0, 97, 115, 109]);
  }
  await expect.poll(() => page.workers().filter((worker) => worker.url().includes(PROVIDER_WORKER)).length).toBe(0);
  expect(fatal).toEqual([]);
  await page.screenshot({ path: info.outputPath("automatic-uv-reopened.png"), fullPage: true });
  await info.attach("native-uv-workflow.json", { body: JSON.stringify({ sourceHead, specSha256, hardware, workerUrls, wasmRequests, wasm, fatal, sourceGeometryPreserved: true, singleGeometryCommit: true, undoRedoAndFileRoundTrip: true }, null, 2), contentType: "application/json" });
});
