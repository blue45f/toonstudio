// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { invalidateOfflinePreviewScope } from "@/domains/auth/public/session/offline-preview-scope";
import { forgetOfflineOwnerReceipt, offlineWorkCacheKey, readOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

const script = readFileSync(resolve("apps/web/public/bootstrap-compat.js"), "utf8");
const id = "owned-work";
const route = `/studio/work/${id}/canvas`;
const fetcher = vi.fn<typeof fetch>();
const signal = () => new AbortController().signal;
const grant = () => ({ workId: id, userId: "owner", revision: 4, expiresAt: Date.now() + 60_000 });
function response(data = grant(), vary = "Cookie") {
  return new Response(JSON.stringify(data), { headers: { Vary: vary } });
}
function boot() {
  runInNewContext(script, { window, document, navigator, fetch: fetcher, AbortController, WebAssembly, URL, Date });
}
async function prepare() {
  fetcher.mockResolvedValueOnce(response());
  await readOfflineOwnerReceipt(id, signal(), true);
  fetcher.mockClear();
}

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, "", route);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  fetcher.mockReset().mockRejectedValue(new TypeError("ERR_CACHE_MISS"));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("초기 쿠키 캐시만 적중하고 앱 마운트 시 캐시가 비어도 정확한 URL과 헤더의 응답을 한 번 인계한다", async () => {
  const data = grant();
  fetcher.mockResolvedValueOnce(response(data));
  await readOfflineOwnerReceipt(id, signal(), true);
  const warm = fetcher.mock.calls[0]!;
  const pending = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(pending.promise);
  boot();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const [earlyUrl, earlyOptions] = fetcher.mock.calls[1]!;
  expect(String(earlyUrl)).toBe(String(warm[0]));
  expect(earlyOptions).toMatchObject({
    mode: "same-origin", credentials: "same-origin", redirect: "error", cache: "only-if-cached", headers: warm[1]?.headers,
  });
  const abandoned = new AbortController();
  const first = readOfflineOwnerReceipt(id, abandoned.signal);
  abandoned.abort();
  const second = readOfflineOwnerReceipt(id, signal());
  pending.resolve(response(data));
  expect(await first).toBeNull();
  expect(await second).toEqual(data);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(window.__toonstudioTakeOfflineOwnerResponse).toBeUndefined();
  expect(await readOfflineOwnerReceipt(id, signal())).toBeNull();
});

it("공개 reader 설정이나 현재 원고의 selector가 없거나 일반 경로·온라인이면 조회를 시작하지 않는다", async () => {
  boot();
  expect(fetcher).not.toHaveBeenCalled();
  await prepare();
  for (const url of ["/", "/studio/work/other/canvas", `${route}/edit`]) {
    history.replaceState(null, "", url);
    boot();
  }
  history.replaceState(null, "", route);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  boot();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["actor", "denied", "expiry", "hidden", "pagehide", "online", "storage"])(
  "초기 캐시 조회 중 %s 발생 시 뒤늦은 응답을 인계하지 않는다", async (event) => {
    await prepare();
    const now = Date.now();
    const pending = Promise.withResolvers<Response>();
    fetcher.mockReturnValueOnce(pending.promise);
    boot();
    const read = readOfflineOwnerReceipt(id, signal());
    if (event === "actor") invalidateOfflinePreviewScope();
    if (event === "denied") forgetOfflineOwnerReceipt(id);
    if (event === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    }
    if (event === "storage") window.dispatchEvent(new StorageEvent("storage", { key: offlineWorkCacheKey(id) }));
    if (event === "pagehide" || event === "online") window.dispatchEvent(new Event(event));
    if (event === "expiry") vi.spyOn(Date, "now").mockReturnValue(now + 120_000);
    pending.resolve(response({ ...grant(), expiresAt: now + 1000 }));
    expect(await read).toBeNull();
  },
);

it.each(["cookie", "work", "revision"])("초기 응답의 %s 검증이 실패하면 미리보기를 열지 않는다", async (field) => {
  await prepare();
  const data = grant();
  if (field === "work") data.workId = "other";
  if (field === "revision") data.revision = 0;
  fetcher.mockResolvedValueOnce(response(data, field === "cookie" ? "Accept-Language" : "Cookie"));
  boot();
  expect(await readOfflineOwnerReceipt(id, signal())).toBeNull();
});
