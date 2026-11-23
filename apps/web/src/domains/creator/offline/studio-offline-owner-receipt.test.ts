// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invalidateOfflinePreviewScope, OFFLINE_PREVIEW_SCOPE_KEY } from "@/domains/auth/public/session/offline-preview-scope";
import { STUDIO_READER_CAPABILITY_HEADERS } from "@/platform/studio-reader-capabilities";
import { forgetOfflineOwnerReceipt, offlineWorkCacheKey, readOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

const clock = 1_795_403_200_000;
const signal = () => new AbortController().signal;
const workId = "owned-manuscript";
const receipt = { workId, userId: "owner", revision: 3, expiresAt: clock + 300_000 };
const fetcher = vi.fn<typeof fetch>();
const response = (data: unknown = receipt, vary = "Cookie") =>
  new Response(JSON.stringify(data), { headers: { Vary: vary, "Cache-Control": "private, max-age=300, must-revalidate" } });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(clock);
  fetcher.mockReset().mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("로컬 저장에는 UUID selector 두 개와 공개 reader 헤더만 남기고 해당 작품 selector만 폐기한다", async () => {
  const scope = "00000000-0000-4000-8000-000000000001";
  const version = "00000000-0000-4000-8000-000000000002";
  const readerKey = "toonstudio:offline-preview:reader:v1";
  const workKey = `toonstudio:offline-preview:work:v1:${encodeURIComponent(workId)}`;
  const publicReader = STUDIO_READER_CAPABILITY_HEADERS["x-studio-reader-capabilities"];
  localStorage.setItem("studio-project-document", "unchanged-document");
  localStorage.setItem(offlineWorkCacheKey("other"), "other-selector");
  const write = vi.spyOn(Storage.prototype, "setItem");
  const remove = vi.spyOn(Storage.prototype, "removeItem");
  const random = vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(scope).mockReturnValueOnce(version);

  expect(await readOfflineOwnerReceipt(workId, signal(), true)).toEqual(receipt);
  expect(write.mock.calls).toEqual([
    [OFFLINE_PREVIEW_SCOPE_KEY, scope], [workKey, version], [readerKey, publicReader],
  ]);
  expect(random).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(workKey)).toBe(version);
  expect(await readOfflineOwnerReceipt(workId, signal())).toEqual(receipt);
  expect(await readOfflineOwnerReceipt(workId, signal(), true)).toEqual(receipt);
  expect(write).toHaveBeenCalledTimes(3);
  expect(random).toHaveBeenCalledTimes(2);

  forgetOfflineOwnerReceipt(workId);
  expect(remove.mock.calls).toEqual([[workKey]]);
  expect(localStorage.getItem(workKey)).toBeNull();
  expect(localStorage.getItem(OFFLINE_PREVIEW_SCOPE_KEY)).toBe(scope);
  expect(localStorage.getItem(readerKey)).toBe(publicReader);
  expect(localStorage.getItem(offlineWorkCacheKey("other"))).toBe("other-selector");
  expect(localStorage.getItem("studio-project-document")).toBe("unchanged-document");
});

it("로컬 키의 위조된 소유권 영수증은 쿠키별 HTTP 캐시 증거를 대신하지 못한다", async () => {
  const forged = JSON.stringify({ ...receipt, userId: "forged-owner", role: "owner" });
  localStorage.setItem(OFFLINE_PREVIEW_SCOPE_KEY, "forged-scope");
  localStorage.setItem(offlineWorkCacheKey(workId), forged);
  localStorage.setItem("toonstudio:offline-preview:reader:v1", forged);
  const write = vi.spyOn(Storage.prototype, "setItem");
  fetcher.mockRejectedValueOnce(new TypeError("cache miss"));

  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    cache: "only-if-cached", credentials: "same-origin", mode: "same-origin",
    headers: STUDIO_READER_CAPABILITY_HEADERS,
  });
  expect(write).not.toHaveBeenCalled();
});

it("확인된 원고의 오프라인 열람은 같은 origin·쿠키·URL의 브라우저 캐시로만 조회한다", async () => {
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  await readOfflineOwnerReceipt(workId, signal(), true);
  expect(await readOfflineOwnerReceipt(workId, signal())).toEqual(receipt);
  const [warm, cold] = fetcher.mock.calls;
  expect(String(warm![0])).toBe(String(cold![0]));
  expect(warm![1]?.cache).toBe("reload");
  expect(cold![1]).toMatchObject({ cache: "only-if-cached", credentials: "same-origin", mode: "same-origin", redirect: "error" });
  expect(await readOfflineOwnerReceipt("other", signal())).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("시점·원고·쿠키 분리가 맞지 않거나 캐시가 없으면 잠금을 유지한다", async () => {
  await readOfflineOwnerReceipt(workId, signal(), true);
  for (const invalid of [{ ...receipt, expiresAt: clock }, { ...receipt, expiresAt: clock + 300_001 },
    { ...receipt, workId: "other" }, { ...receipt, userId: "" }, { ...receipt, revision: 0 }]) {
    fetcher.mockResolvedValueOnce(response(invalid));
    expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  }
  fetcher.mockResolvedValueOnce(response(receipt, "Accept"));
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  fetcher.mockRejectedValueOnce(new TypeError("cache miss"));
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
});

it("권한 거부나 세션 전환이 조회 중이면 기존 영수증을 다시 표시하지 않는다", async () => {
  await readOfflineOwnerReceipt(workId, signal(), true);
  fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
  expect(await readOfflineOwnerReceipt(workId, signal(), true)).toBeNull();
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  await readOfflineOwnerReceipt(workId, signal(), true);
  fetcher.mockImplementationOnce(async () => { invalidateOfflinePreviewScope(); return response(); });
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  await readOfflineOwnerReceipt(workId, signal(), true);
  forgetOfflineOwnerReceipt(workId);
  const count = fetcher.mock.calls.length;
  expect(await readOfflineOwnerReceipt(workId, signal())).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(count);
});
