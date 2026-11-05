import { expect } from "vitest";

import type { Actor, CanvasHarness } from "./studio-six-page-test-support";
import type { StudioReviewPreviewSubject } from "../../../apps/api/src/modules/studio-project-graph/studio-review-preview";
import type { StudioPublishPackageManifest } from "../../../apps/web/src/domains/creator/studio-publish-package";
import type { Browser, Page } from "playwright";

export interface LiveProof { synced: boolean; updateAcks: number; rejected: number }
export interface SixPageRendererReceipt { status: string; backend: string | null; rgbaSha256: string | null; reason: string | null }

/** UI 내보내기를 마친 뒤 선호 렌더러와 같은 픽셀인지 확인해 조용한 호환 경로 우회를 탐지한다. */
export async function captureSixPageRendererReceipt(page: Page, source: unknown): Promise<SixPageRendererReceipt> {
  return page.evaluate<SixPageRendererReceipt>(`(async () => {
    const {captureStudioSkiaDocumentForExport: capture} = await import('/src/domains/creator/render/studio-skia-document-export.ts');
    const result = await capture({page:${JSON.stringify(source)},masterElements:[],exportScale:2,transparent:false});
    if (result.status !== 'captured') return {status:result.status,backend:null,rgbaSha256:null,reason:result.reason};
    const context = result.canvas.getContext('2d');
    if (!context) throw new Error('렌더러의 실제 픽셀을 읽지 못했습니다.');
    const pixels = context.getImageData(0,0,result.canvas.width,result.canvas.height).data;
    const hash = await crypto.subtle.digest('SHA-256',pixels.buffer);
    return {status:result.status,backend:result.canvas.dataset.studioRasterExportBackend ?? null,
      rgbaSha256:Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join(''),reason:null};
  })()`);
}

export async function openSixPageCanvas(browser: Browser, h: CanvasHarness, actor: Actor, workId: string, origin: string) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: "ko-KR", serviceWorkers: "block" });
  await context.route("https://preview.invalid/**", async route => {
    const hash = new URL(route.request().url()).pathname.slice(1);
    const bytes = /^[a-f0-9]{64}$/u.test(hash) ? h.readPrivateObjectBytes(`sha256:${hash}`) : undefined;
    await route.fulfill(bytes ? { status: 200, contentType: "image/png", body: bytes } : { status: 404, body: "없는 시험 객체" });
  });
  const page = await context.newPage(), proof: LiveProof = { synced: false, updateAcks: 0, rejected: 0 };
  const network: { path: string; status: number }[] = [];
  const acknowledgements: { event: string; ok: boolean | null; code?: string }[] = [];
  const sockets: { path: string; closed: boolean; errors: number; sentFrames: number; receivedFrames: number; connectErrorCodes: string[] }[] = [];
  page.on("response", response => {
    const url = new URL(response.url());
    if (url.origin === origin && url.pathname.startsWith("/api/")) {
      network.push({ path: url.pathname, status: response.status() });
      if (network.length > 100) network.shift();
    }
  });
  await page.bringToFront();
  page.on("websocket", socket => {
    const state = { path: new URL(socket.url()).pathname, closed: false, errors: 0, sentFrames: 0, receivedFrames: 0, connectErrorCodes: [] as string[] };
    sockets.push(state);
    socket.on("close", () => { state.closed = true; });
    socket.on("socketerror", () => { state.errors++; });
    const events = new Map<string, string>();
    socket.on("framesent", ({ payload }) => {
      state.sentFrames++;
      if (typeof payload !== "string") return;
      const index = payload.indexOf("["), id = /,(\d+)$/u.exec(payload.slice(0, index))?.[1];
      if (index < 0 || !id) return;
      try { const wire: unknown = JSON.parse(payload.slice(index)); if (Array.isArray(wire) && typeof wire[0] === "string") events.set(id, wire[0]); } catch { /* 다른 Engine.IO frame은 이 영수증 대상이 아니다. */ }
    });
    socket.on("framereceived", ({ payload }) => {
      state.receivedFrames++;
      if (typeof payload !== "string") return;
      if (payload.startsWith("44")) {
        const start = payload.indexOf("{");
        try {
          const value: unknown = start < 0 ? null : JSON.parse(payload.slice(start));
          const data: unknown = value && typeof value === "object" ? Reflect.get(value, "data") : null;
          const codes = [value, data].flatMap(item => item && typeof item === "object"
            ? [Reflect.get(item, "code"), Reflect.get(item, "reason"), Reflect.get(item, "message")] : [])
            .filter((code): code is string => typeof code === "string" && /^(?:auth|unauth|forbidden|studio|expired|invalid|origin|rate|session|permission|acl|work|reader|token|ticket)[a-z0-9_:.-]{0,60}$/iu.test(code));
          state.connectErrorCodes.push(...(codes.length ? codes : ["unclassified-connect-error"]));
        } catch { state.connectErrorCodes.push("unparseable-connect-error"); }
      }
      const index = payload.indexOf("["), id = /,(\d+)$/u.exec(payload.slice(0, index))?.[1];
      if (index < 0 || !id) return;
      try {
        const wire: unknown = JSON.parse(payload.slice(index)), event = events.get(id);
        const ack: unknown = Array.isArray(wire) ? wire[0] : null;
        if (!ack || typeof ack !== "object") return;
        if (event?.startsWith("studio:")) {
          const ok = Reflect.get(ack, "ok"), code = Reflect.get(ack, "code");
          acknowledgements.push({ event, ok: typeof ok === "boolean" ? ok : null,
            ...(typeof code === "string" && /^[a-z0-9_:.-]{1,80}$/iu.test(code) ? { code } : {}) });
          if (acknowledgements.length > 100) acknowledgements.shift();
        }
        if (Reflect.get(ack, "ok") === true && event === "studio:crdt:sync:binary:v1") proof.synced = true;
        if (Reflect.get(ack, "ok") === true && event === "studio:crdt:update:binary:v1") proof.updateAcks++;
        if (Reflect.get(ack, "ok") === false) proof.rejected++;
      } catch { /* 다른 Engine.IO frame은 이 영수증 대상이 아니다. */ }
    });
  });
  const login = await context.request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin, "x-toonstudio-csrf": "1" }, data: { email: actor.email, password: actor.password }, timeout: 30_000,
  });
  expect(login.status()).toBe(201);
  actor.cookie = (await context.cookies(origin)).map(c => `${c.name}=${c.value}`).join("; ");
  await page.goto(`${origin}/studio/work/${workId}/canvas`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  try {
    await expect.poll(() => proof.synced, { timeout: 120_000 }).toBe(true);
  } catch (error) {
    // 준비 도중 실패하면 호출자에게 페이지가 아직 반환되지 않아 기존 실패 훅으로 관측할 수 없다.
    // 토큰·쿠키·요청 본문·원시 Socket frame은 기록하지 않는다.
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const output = process.env.TOONSTUDIO_SIX_PAGE_EVIDENCE_DIR ?? ".qa/short-comic-six-page-integration";
    try {
      await mkdir(output, { recursive: true });
      const prefix = join(output, `canvas-startup-${crypto.randomUUID()}`);
      await writeFile(`${prefix}.json`, JSON.stringify({ proof, network, acknowledgements, sockets,
        pathname: new URL(page.url()).pathname, body: await page.locator("body").innerText({ timeout: 5_000 }) }, null, 2), { mode: 0o600 });
      await page.screenshot({ path: `${prefix}.png`, timeout: 15_000 });
    } catch {
      console.error("6컷 캔버스 시작 실패의 진단 기록을 완료하지 못했습니다.");
    }
    throw error;
  }
  await page.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
  await page.locator("[data-studio-post-processing-scope] .konvajs-content:visible").first().waitFor({ timeout: 120_000 });
  const quickStart = page.getByRole("button", { name: "빠른 시작 닫기 (Esc)", exact: true });
  if (await quickStart.isVisible()) await quickStart.click();
  await page.evaluate(() => document.fonts.ready);
  return { page, proof, context };
}

export async function exportSixPageSnapshot(page: Page, destination: string): Promise<Record<string, unknown>> {
  await page.bringToFront();
  await page.getByRole("menuitem", { name: "파일", exact: true }).click();
  const pending = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("menuitem", { name: "백업 (.json)", exact: true }).click();
  const download = await pending; await download.saveAs(destination);
  await page.keyboard.press("Escape");
  const { readFile } = await import("node:fs/promises");
  const envelope: unknown = JSON.parse(await readFile(destination, "utf8"));
  if (!envelope || typeof envelope !== "object") throw new Error("백업 envelope가 없습니다.");
  const payload: unknown = Reflect.get(envelope, "payload");
  if (!payload || typeof payload !== "object") throw new Error("백업 payload가 없습니다.");
  const data: unknown = Reflect.get(payload, "data");
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("백업 프로젝트가 없습니다.");
  return data as Record<string, unknown>;
}

export async function captureSixPageReview(page: Page): Promise<StudioReviewPreviewSubject> {
  await page.bringToFront();
  await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
  const completed = page.waitForResponse(response => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/studio-project-graph/review-captures/complete", { timeout: 120_000 });
  await page.getByRole("button", { name: "저장된 원고로 검수본 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "저장된 원고로 검수본 만들기", exact: true });
  await dialog.waitFor({ timeout: 30_000 });
  // 저장 확인이 필요하면 제품이 제공하는 동일 저장 절차만 사용한다.
  const save = dialog.getByRole("button", { name: "저장 후 다시 확인", exact: true });
  if (await save.isVisible()) await save.click();
  const response = await completed;
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  const { studioReviewPreviewSubjectSchema } = await import("../../../apps/api/src/modules/studio-project-graph/studio-review-preview");
  if (!value || typeof value !== "object" || Reflect.get(value, "status") !== "completed") throw new Error("검수 캡처가 완료되지 않았습니다.");
  const subject = studioReviewPreviewSubjectSchema.parse(Reflect.get(value, "subject"));
  await dialog.getByText("고정 검수본이 준비됐어요.", { exact: true }).waitFor({ timeout: 30_000 });
  await dialog.getByRole("button", { name: /닫기|완료/u }).last().click();
  return subject;
}

/** 원래 6컷을 교체하지 않고 새 획 한 개의 Undo/Redo 뒤 다시 Undo해 원본으로 복구한다. */
export async function temporaryPointer(page: Page): Promise<void> {
  await page.bringToFront(); await page.keyboard.press("Escape");
  await page.getByText("맞춤", { exact: true }).click(); await page.keyboard.press("b");
  const findPath = async () => {
    const box = await page.evaluate<{ x: number; y: number; width: number; height: number }>(`(async () => {
    const {studioKonvaRuntime: runtime} = await import('/src/domains/creator/render/studio-konva-runtime.ts');
    const stage = runtime.stages.find(node => node.container().closest('[data-studio-post-processing-scope]'));
    const paper = stage?.findOne('.bg'); if (!paper) throw new Error('원고 종이가 없습니다.');
    const rect = paper.getClientRect(), container = stage.container().getBoundingClientRect();
    return {x:container.x+rect.x,y:container.y+rect.y,width:rect.width,height:rect.height};
  })()`);
    return page.evaluate(box => {
      for (const y of [0.12, 0.22, 0.35, 0.5, 0.65, 0.8, 0.9, 0.04]) for (const x of [0.16, 0.32, 0.5, 0.68, 0.8, 0.05, 0.9]) {
        const start = { x: box.x + box.width * x, y: box.y + box.height * y };
        const end = { x: start.x + box.width * 0.06, y: start.y + box.height * 0.025 };
        const clear = Array.from({ length: 9 }, (_, i) => {
          const ratio = i / 8, element = document.elementFromPoint(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio);
          return element?.tagName === "CANVAS" && Boolean(element.closest("[data-studio-post-processing-scope]"));
        }).every(Boolean);
        if (clear) return { start, end };
      }
      return null;
    }, box);
  };
  await expect.poll(async () => Boolean(await findPath()), { timeout: 8_000 }).toBe(true);
  const path = await findPath();
  if (!path) throw new Error("HUD에 가리지 않은 시험 pointer 경로가 없습니다.");
  await page.mouse.move(path.start.x, path.start.y); await page.mouse.down();
  await page.mouse.move(path.end.x, path.end.y, { steps: 8 }); await page.mouse.up();
}

/** 저장·인계 뒤에도 현재 캔버스가 같은 6컷 픽셀을 내보내는지 공개 UI로 확인한다. */
export async function downloadSixPagePngs(page: Page, directory: string, phase: "candidate-current-baseline" | "relogged" = "relogged"): Promise<Uint8Array[]> {
  await page.bringToFront();
  const { readFile } = await import("node:fs/promises");
  const items = page.locator('button[data-studio-page-sequence-item="true"]');
  expect(await items.count()).toBe(6);
  const outputs: Uint8Array[] = [];
  for (let i = 0; i < 6; i++) {
    await items.nth(i).click();
    await expect.poll(() => items.nth(i).getAttribute("aria-current")).toBe("page");
    const button = page.locator('button[aria-label$="· 현재 페이지"]:visible').first();
    await button.waitFor(); expect(await button.isEnabled()).toBe(true);
    const pending = page.waitForEvent("download", { timeout: 30_000 });
    await button.click();
    const download = await pending, path = `${directory}/${phase}-cut-${i + 1}.png`;
    expect(await download.failure()).toBeNull(); await download.saveAs(path); outputs.push(await readFile(path));
  }
  return outputs;
}

export async function technicalPackage(page: Page, previews: readonly { pageId: string; url: string }[], settings: unknown) {
  // 이 경로는 사람 확인을 우회한 정식 게시가 아니다. 실제 PNG의 renderer·ZIP 기술 경로만 검증한다.
  // JS 문자열은 Vitest의 SSR import 변환을 브라우저 realm으로 전달하지 않게 한다.
  return page.evaluate<{
    manifest: StudioPublishPackageManifest; bytes: number[];
    files: { fileName: string; mimeType: string; byteSize: number; sha256: string }[];
    episodeFiles: { fileName: string; sourcePageId?: string }[]; originalSettings: unknown; uiReleaseAuthorized: false;
  }>(`(async () => {
    const { previews, settings } = ${JSON.stringify({ previews: [...previews], settings })};
    const prefix = "/src/domains/creator/";
    const { renderStudioPublishPackageImages } = await import(prefix + "studio-publish-package-renderer.ts");
    const { planStudioPublishPackage } = await import(prefix + "studio-publish-package.ts");
    const { finalizeStudioPublishPackageManifest } = await import(prefix + "studio-publish-package-manifest-runtime.ts");
    const { buildStudioPackageArchiveBlob } = await import(prefix + "studio-package-archive.ts");
    const sources = [];
    for (const preview of previews) {
      const response = await fetch(preview.url), bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("원고 픽셀을 읽을 수 없습니다.");
      context.drawImage(bitmap, 0, 0); bitmap.close(); sources.push({ id: preview.pageId, canvas });
    }
    const rendered = await renderStudioPublishPackageImages({ settings, seriesTitle: "우산을 돌려주는 날", sources });
    const plan = planStudioPublishPackage({ settings, seriesTitle: "우산을 돌려주는 날", episodeTitle: "동일 6컷 기술 검토",
      canvases: sources.map(s => ({ id: s.id, width: s.canvas.width, height: s.canvas.height })),
      episodeImages: rendered.episodeImages.map(f => f.metadata), thumbnails: rendered.thumbnails.map(f => f.metadata) });
    const files = [...rendered.episodeImages, ...rendered.thumbnails];
    const validation = new Blob([JSON.stringify({ status: "technical-review-only", releaseAuthorized: false,
      humanRightsAndRatingChecksPending: true, filePlanValidation: plan.canExport, errors: plan.errors, warnings: plan.warnings })], { type: "application/json" });
    const entries = [...files.map(f => ({ path: f.fileName, data: f.blob })), { path: "validation-report.json", data: validation }];
    const hashes = [];
    for (const e of entries) {
      const hash = await crypto.subtle.digest("SHA-256", await e.data.arrayBuffer());
      hashes.push({ fileName: e.path, mimeType: e.data.type, byteSize: e.data.size,
        sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("") });
    }
    const manifest = finalizeStudioPublishPackageManifest(plan.manifest, hashes);
    entries.push({ path: "manifest.json", data: new Blob([JSON.stringify(manifest)], { type: "application/json" }) });
    const archive = await buildStudioPackageArchiveBlob(entries, { crc32ExecutionMode: "worker" });
    return { manifest, bytes: Array.from(new Uint8Array(await archive.arrayBuffer())),
      files: hashes, episodeFiles: rendered.episodeImages.map(f => ({ fileName: f.fileName, sourcePageId: f.metadata.sourceCanvasId })),
      originalSettings: settings, uiReleaseAuthorized: false };
  })()`);
}
