import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import type { VoiceCommentaryTrack } from "../apps/web/src/domains/creator/production-hub/review-voice-commentary-model";
import type { VoiceCompareCapture } from "../apps/web/src/domains/creator/production-hub/voice-compare-view";

// 실제 Chromium 녹음·재생과 제품 UI 연결을 검사하며 API 응답과 마이크 입력은 합성이다.
test.use({ channel: "chromium", permissions: ["microphone"], launchOptions: {
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
} });
interface Receipt { byteSize: number; mimeType: string | null; track: VoiceCommentaryTrack }
interface ApiState {
  metadata: Omit<VoiceCommentaryTrack, "audio"> | null;
  bytes: Buffer;
  uploads: number;
  reads: number;
  expiredRequests: number;
  freshRequests: number;
  readDenied: boolean;
  unexpected: string[];
}
const base = "/production/projects/voice-fixture-project/episodes/voice-fixture-episode/voice-commentaries";
const fixture = "/tools/browser-harnesses/voice-review.html";

async function observeVoiceMedia(page: Page) {
  const handle = await page.evaluateHandle(() => {
    const events: Array<{ event: string; trusted: boolean; at: number; src: string | null; currentSrc: string; currentTime: number;
      paused: boolean; ended: boolean; seeking: boolean; readyState: number; networkState: number;
      error: { code: number; message: string } | null }> = [];
    const sources: Array<{ at: number; before: string | null; after: string | null }> = [];
    const owns = (element: EventTarget | null): element is HTMLAudioElement =>
      element instanceof HTMLAudioElement && Boolean(element.closest('[data-testid="voice-panel"]'));
    const collect = (event: Event) => {
      const audio = event.target;
      if (!owns(audio) || events.length >= 120) return;
      events.push({ event: event.type, trusted: event.isTrusted, at: performance.now(), src: audio.getAttribute("src"), currentSrc: audio.currentSrc,
        currentTime: audio.currentTime, paused: audio.paused, ended: audio.ended, seeking: audio.seeking,
        readyState: audio.readyState, networkState: audio.networkState,
        error: audio.error ? { code: audio.error.code, message: audio.error.message } : null });
    };
    // 실제 미디어 메서드·프로토타입을 바꾸지 않고 제품 오디오의 이벤트와 src 변경만 읽는다.
    for (const name of ["loadstart", "loadedmetadata", "canplay", "play", "playing", "pause", "error", "abort", "emptied", "seeking", "seeked", "ended"]) {
      document.addEventListener(name, collect, true);
    }
    new MutationObserver((records) => {
      for (const record of records) {
        if (!owns(record.target) || sources.length >= 120) continue;
        sources.push({ at: performance.now(), before: record.oldValue, after: record.target.getAttribute("src") });
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["src"], attributeOldValue: true });
    return { events, sources };
  });
  const transport: Array<{ event: string; url: string; status?: number; error?: string | null }> = [];
  const collectTransport = (entry: (typeof transport)[number]) => {
    if (entry.url.startsWith("https://voice-fixture.invalid/") && transport.length < 120) transport.push(entry);
  };
  page.on("request", (request) => collectTransport({ event: "request", url: request.url() }));
  page.on("response", (response) => collectTransport({ event: "response", url: response.url(), status: response.status() }));
  page.on("requestfailed", (request) => collectTransport({ event: "failed", url: request.url(), error: request.failure()?.errorText ?? null }));
  return { handle, transport };
}
const mediaObservations = new WeakMap<Page, Awaited<ReturnType<typeof observeVoiceMedia>>>();

test.afterEach(async ({ page }, testInfo) => {
  const observation = mediaObservations.get(page);
  if (!observation) return;
  try {
    await testInfo.attach("제품 오디오 이벤트와 주소 변경", {
      body: JSON.stringify({ media: await observation.handle.jsonValue(), transport: observation.transport }), contentType: "application/json",
    });
  } finally {
    mediaObservations.delete(page);
    await observation.handle.dispose();
  }
});

async function mockApi(page: Page, storage: "local" | "server"): Promise<ApiState> {
  const state: ApiState = { metadata: null, bytes: Buffer.alloc(0), uploads: 0, reads: 0,
    expiredRequests: 0, freshRequests: 0, readDenied: true, unexpected: [] };
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith(`${base}/query`)) return route.fulfill({ json: { items: [] } });
    if (path.endsWith(base)) {
      state.uploads += 1;
      expect(request.method()).toBe("POST");
      const raw = request.postDataBuffer()?.toString("utf8").match(/name="metadata"\r\n\r\n([^\r\n]*)\r\n/u)?.[1];
      if (!raw) throw new Error("실제 FormData의 metadata 필드가 없습니다.");
      const metadata = JSON.parse(raw) as { track: Omit<VoiceCommentaryTrack, "audio"> };
      state.metadata = metadata.track;
      if (storage === "local") return route.fulfill({ status: 503, json: { statusCode: 503, message: "합성 저장 실패" } });
      return route.fulfill({ json: { replayed: false, view: { canDelete: true, track: { ...metadata.track,
        audio: { kind: "server", url: "https://voice-fixture.invalid/expired.webm", mimeType: "audio/webm", byteSize: null } } } } });
    }
    if (path.includes(`${base}/`) && path.endsWith("/read")) {
      state.reads += 1;
      if (state.readDenied) return route.fulfill({ status: 403, json: { statusCode: 403, message: "합성 읽기 거절" } });
      if (!state.metadata || state.bytes.length === 0) throw new Error("재생할 실제 녹음 바이트가 없습니다.");
      return route.fulfill({ json: { canDelete: true, track: { ...state.metadata,
        audio: { kind: "server", url: "https://voice-fixture.invalid/expired.webm", mimeType: "audio/webm", byteSize: state.bytes.length } },
        signedRead: { url: "https://voice-fixture.invalid/fresh.webm", expiresAtEpochMs: Date.now() + 300_000 } } });
    }
    state.unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 503, json: { statusCode: 503, message: "이 검증에서 허용하지 않은 API" } });
  });
  await page.route("https://voice-fixture.invalid/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/expired.webm") {
      state.expiredRequests += 1;
      return route.fulfill({ status: 410, body: "합성 만료 주소" });
    }
    state.freshRequests += 1;
    if (state.bytes.length === 0) throw new Error("갱신 주소에 제공할 실제 WebM이 없습니다.");
    return route.fulfill({ contentType: "audio/webm", body: state.bytes,
      headers: { "Access-Control-Allow-Origin": "*", "Cross-Origin-Resource-Policy": "cross-origin", "Cache-Control": "no-store" } });
  });
  return state;
}

async function openFixture(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(fixture, { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "검증 언어" }).selectOption("ko");
  await expect(page.locator('output[aria-label="목록 상태"]')).toHaveText("ready");
  await expect(page.getByTestId("crv-root")).toBeVisible();
  mediaObservations.set(page, await observeVoiceMedia(page));
}
async function readReceipt(page: Page): Promise<Receipt> {
  const output = page.locator('output[aria-label="녹음 결과"]');
  await expect(output).toContainText('"byteSize":');
  return JSON.parse(await output.textContent() ?? "null") as Receipt;
}
async function downloadRecording(page: Page, path: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "녹음 파일 다운로드" }).click();
  await (await pending).saveAs(path);
  const bytes = await readFile(path);
  expect(bytes.length).toBeGreaterThan(0);
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}
async function observedCompare(page: Page): Promise<VoiceCompareCapture | null> {
  await page.getByRole("button", { name: "현재 비교 상태 읽기" }).click();
  return JSON.parse(await page.locator('output[aria-label="현재 비교 상태"]').textContent() ?? "null") as VoiceCompareCapture | null;
}

test("실제 WebM 녹음의 마지막 비교 화면을 탭 재생성 뒤 복원하고 자연 재생 종료에도 보존한다", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const api = await mockApi(page, "local");
  await openFixture(page, 1440);
  const panel = page.getByTestId("voice-panel");
  await panel.getByRole("button", { name: "해설 녹화 시작", exact: true }).click();
  const stop = panel.getByRole("button", { name: /녹화 종료/u });
  await expect(stop).toBeVisible();
  // 500ms timeslice가 지난 녹음과 종료 시점 최종 capture를 함께 검사한다.
  await page.waitForTimeout(650);
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.getByRole("button", { name: "확대", exact: true }).click();
  const stage = page.getByTestId("crv-stage-1");
  const box = await stage.boundingBox();
  if (!box) throw new Error("비교 페인의 실제 영역이 없습니다.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("combobox", { name: "이 페인에 표시할 소스" }).first().selectOption("external:voice-color");
  await page.getByRole("button", { name: "오버레이", exact: true }).click();
  const stylesBefore = await page.getByTestId("crv-stage-overlay").locator('[style*="transform"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("style")));
  expect(stylesBefore).toHaveLength(2);
  expect(stylesBefore.every((style) => style?.includes("scale("))).toBe(true);
  await stop.click();
  const receipt = await readReceipt(page), last = receipt.track.keyframes.at(-1);
  expect(receipt.mimeType).toMatch(/^audio\/webm/u);
  expect(receipt.byteSize).toBeGreaterThan(0);
  expect(last?.view).toMatchObject({ surface: "compare", poolItemId: "external:voice-color", mode: "overlay" });
  expect(last?.view.compare?.shared.scale).toBeGreaterThan(1);
  expect(last?.view.compare?.shared.tx).not.toBe(0);
  await expect(panel.getByRole("alert")).toContainText("이 탭에서 계속 들을 수 있지만");
  const path = testInfo.outputPath("desktop-real-recording.webm");
  const bytes = await downloadRecording(page, path);
  expect(bytes.length).toBe(receipt.byteSize);
  await testInfo.attach("실제 Chromium WebM", { path, contentType: "audio/webm" });

  await page.getByRole("button", { name: "원고 탭", exact: true }).click();
  await expect(page.getByTestId("crv-root")).toHaveCount(0);
  await panel.locator("ol > li > button").last().click();
  await expect(page.getByRole("button", { name: "오버레이", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("crv-stage-overlay").getByRole("img", { name: "채색 고정본", exact: true })).toBeVisible();
  const stylesAfter = await page.getByTestId("crv-stage-overlay").locator('[style*="transform"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("style")));
  expect(stylesAfter).toEqual(stylesBefore);
  expect((await observedCompare(page))?.view.compare).toEqual(last?.view.compare);
  const seek = panel.getByRole("slider", { name: "해설 재생 위치" });
  await seek.focus(); await seek.press("Home");
  // 수동 마지막 큐의 잔상이 아니라 실제 재생이 마지막 화면을 복원해야 한다.
  await expect(page.getByRole("button", { name: "나란히", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await observedCompare(page))?.view.compare).not.toEqual(last?.view.compare);
  await panel.getByRole("button", { name: "해설 듣기", exact: true }).click();
  await expect.poll(() => panel.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.05);
  expect(await panel.locator("audio").evaluate((audio: HTMLAudioElement) => audio.error)).toBeNull();
  // 미디어 메서드·시각·이벤트를 바꾸지 않고 브라우저의 자연 ended를 끝까지 기다린다.
  await expect.poll(() => panel.locator("audio").evaluate((audio: HTMLAudioElement) => audio.ended)).toBe(true);
  const observation = mediaObservations.get(page);
  if (!observation) throw new Error("자연 종료를 증명할 제품 오디오 관측이 없습니다.");
  const nativeEnd = await observation.handle.evaluate(({ events }) => events.filter((event) => event.event === "ended").at(-1) ?? null);
  expect(nativeEnd).toMatchObject({ event: "ended", trusted: true, ended: true, paused: true, seeking: false, error: null });
  if (!nativeEnd || !last) throw new Error("실제 오디오 종료 또는 마지막 녹음 큐가 없습니다.");
  // 이 경계가 관측되지 않으면 최종 wallclock 큐에 닿기 전 자연 종료한 경우는 미검증이다.
  expect(nativeEnd.currentTime * 1000).toBeLessThan(last.atMs);
  await expect(seek).toHaveAttribute("max", String(receipt.track.durationMs));
  await expect.poll(() => seek.inputValue()).toBe(String(receipt.track.durationMs));
  await expect(panel.getByRole("button", { name: "해설 듣기", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "오버레이", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("crv-stage-overlay").getByRole("img", { name: "채색 고정본", exact: true })).toBeVisible();
  const stylesAtEnd = await page.getByTestId("crv-stage-overlay").locator('[style*="transform"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("style")));
  expect(stylesAtEnd).toEqual(stylesBefore);
  const compareAtEnd = await observedCompare(page);
  expect(compareAtEnd?.view.compare).toEqual(last.view.compare);
  await noOverflow(page);
  expect(api.uploads).toBe(1); expect(api.reads).toBe(0); expect(api.unexpected).toEqual([]); expect(pageErrors).toEqual([]);
  await testInfo.attach("desktop 관측", { body: JSON.stringify({ receipt, stylesBefore, stylesAfter, nativeEnd,
    logicalPositionMs: Number(await seek.inputValue()), stylesAtEnd, compareAtEnd,
    api: { uploads: api.uploads, reads: api.reads } }), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("desktop-replay.png"), fullPage: true });
});

test("모바일 키보드의 짧은 녹음 최종 데이터를 보존하고 읽기 거절 뒤 명시 재시도로 갱신 주소를 재생한다", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const api = await mockApi(page, "server");
  await openFixture(page, 390);
  const panel = page.getByTestId("voice-panel");
  await noOverflow(page);
  const start = panel.getByRole("button", { name: "해설 녹화 시작", exact: true });
  await start.focus(); await start.press("Enter");
  const stop = panel.getByRole("button", { name: /녹화 종료/u });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(150);
  await stop.focus(); await stop.press("Enter");
  const receipt = await readReceipt(page);
  expect(receipt.track.durationMs).toBeGreaterThan(0);
  // 이 조건을 충족하지 못하면 최종 chunk 전용 경로는 미검증이다. 성공으로 완화하지 않는다.
  expect(receipt.track.durationMs).toBeLessThan(500);
  expect(receipt.byteSize).toBeGreaterThan(0);
  const path = testInfo.outputPath("mobile-short-real-recording.webm");
  api.bytes = await downloadRecording(page, path);
  expect(api.bytes.length).toBe(receipt.byteSize);
  await expect.poll(() => panel.locator("audio").getAttribute("src")).toBe("https://voice-fixture.invalid/expired.webm");
  await panel.getByRole("button", { name: "해설 듣기", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("해설을 재생하지 못했어요");
  await expect(panel.getByRole("button", { name: "해설 듣기", exact: true })).toBeEnabled();
  expect(api.reads).toBe(1); expect(api.expiredRequests).toBe(0);
  api.readDenied = false;
  const retry = panel.getByRole("button", { name: "해설 듣기", exact: true });
  await retry.focus(); await retry.press("Enter");
  await expect.poll(() => panel.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.01);
  await expect(panel.locator("audio")).toHaveAttribute("src", "https://voice-fixture.invalid/fresh.webm");
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(api.reads).toBe(2); expect(api.freshRequests).toBeGreaterThan(0); expect(api.expiredRequests).toBe(0);
  expect(api.uploads).toBe(1); expect(api.unexpected).toEqual([]); expect(pageErrors).toEqual([]);
  await noOverflow(page);
  await testInfo.attach("실제 Chromium 짧은 WebM", { path, contentType: "audio/webm" });
  await testInfo.attach("mobile 관측", { body: JSON.stringify({ receipt, reads: api.reads, uploads: api.uploads, freshRequests: api.freshRequests, expiredRequests: api.expiredRequests }), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("mobile-refreshed-replay.png"), fullPage: true });
});
