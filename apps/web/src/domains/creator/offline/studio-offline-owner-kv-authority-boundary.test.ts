// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { STUDIO_READER_CAPABILITY_HEADERS } from "@/platform/studio-reader-capabilities";
import { forgetOfflineOwnerReceipt, readOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("소유자 영수증은 HTTP 캐시로 읽고 localStorage에는 두 UUID와 공개 reader 헤더만 쓴다", async () => {
  const workId = "작품/1";
  const scopeId = "10000000-0000-4000-8000-000000000001";
  const versionId = "20000000-0000-4000-8000-000000000002";
  const scopeKey = "toonstudio:offline-preview:scope:v1";
  const workKey = `toonstudio:offline-preview:work:v1:${encodeURIComponent(workId)}`;
  const otherWorkKey = "toonstudio:offline-preview:work:v1:other-work";
  const readerKey = "toonstudio:offline-preview:reader:v1";
  const reader = STUDIO_READER_CAPABILITY_HEADERS["x-studio-reader-capabilities"];
  const receipt = { userId: "fixture-owner", workId, revision: 8, expiresAt: Date.now() + 60_000 };
  const signal = new AbortController().signal;
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(scopeId).mockReturnValueOnce(versionId);
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(receipt), { headers: { Vary: "Cookie" } }));
  localStorage.setItem(otherWorkKey, "other-version");
  const writes = vi.spyOn(Storage.prototype, "setItem");
  const removals = vi.spyOn(Storage.prototype, "removeItem");

  expect(await readOfflineOwnerReceipt(workId, signal, true)).toEqual(receipt);
  expect(await readOfflineOwnerReceipt(workId, signal)).toEqual(receipt);
  forgetOfflineOwnerReceipt(workId);

  expect(writes.mock.calls).toEqual([[scopeKey, scopeId], [workKey, versionId], [readerKey, reader]]);
  expect(removals.mock.calls).toEqual([[workKey]]);
  expect(localStorage.getItem(workKey)).toBeNull();
  expect(localStorage.getItem(otherWorkKey)).toBe("other-version");
  expect(localStorage.getItem(scopeKey)).toBe(scopeId);
});
