import { emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLOUD_WORKBOARD_PATH, loadCloudWorkboard, saveCloudWorkboard } from "./cloud-workboard-api";

afterEach(() => { vi.restoreAllMocks(); });

describe("클라우드 작업 관리자 API 어댑터", () => {
  it("GET은 캐시하지 않고 POST는 CSRF·revision·mutationId를 전달한다", async () => {
    const value = { board: emptyBoard(), revision: 0, storedAt: null };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(value)));
    const signal = new AbortController().signal;
    expect(await loadCloudWorkboard(signal)).toEqual(value);
    expect(fetch.mock.calls[0]).toEqual([CLOUD_WORKBOARD_PATH, expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal })]);
    const mutationId = "67a2d3ea-8a7f-4b37-9b73-c05bf1cb44a7";
    await saveCloudWorkboard(value.board, 4, mutationId, signal);
    const options = fetch.mock.calls[1]?.[1];
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", signal });
    expect(new Headers(options?.headers).get(TOONSPECTRUM_CSRF_HEADER)).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    expect(JSON.parse(String(options?.body))).toEqual({ board: value.board, expectedRevision: 4, mutationId });
  });
  it("형식이 깨진 200 응답을 성공 기록으로 사용하지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ board: emptyBoard(), revision: -1, storedAt: null })));
    await expect(loadCloudWorkboard()).rejects.toThrow(/형식/u);
  });
});
