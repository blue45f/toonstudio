import { createRecord, emptyData } from "@toonstudio/contracts/admin-production-change";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProductionChanges, saveProductionChange, uploadProductionCapture } from "./production-change-api";

const actor = { userId: "synthetic-admin", displayName: "합성 관리자" };
afterEach(() => vi.unstubAllGlobals());

describe("제작 변경 API 경계", () => {
  it("잘못된 성공 응답을 빈 보드로 바꾸지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ requests: [{ title: "불완전 응답" }] })));
    await expect(loadProductionChanges()).rejects.toMatchObject({ status: 502 });
  });
  it("명시적 서버 버전과 mutation ID, CSRF를 저장하며 서버가 만든 이력은 입력하지 않는다", async () => {
    const data = { ...emptyData(), title: "합성 제작 요청" };
    const record = createRecord(data, actor, "2026-11-20T00:00:00.000Z");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ request: record }));
    vi.stubGlobal("fetch", fetcher);
    const mutationId = "00000000-0000-4000-8000-000000000010";
    await saveProductionChange(record.id, { data, expectedVersion: record.version, mutationId });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/admin/production-changes/${record.id}/save`);
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" });
    expect(new Headers(init.headers).get(TOONSPECTRUM_CSRF_HEADER)).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    expect(JSON.parse(String(init.body))).toEqual({ data, expectedVersion: record.version, mutationId });
  });
  it("401과409를 다른 오류 코드로 보존한다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ message: "인증 만료" }, { status: 401 })).mockResolvedValueOnce(Response.json({ message: "버전 충돌" }, { status: 409 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadProductionChanges()).rejects.toMatchObject({ status: 401, message: "인증 만료" });
    await expect(loadProductionChanges()).rejects.toMatchObject({ status: 409, message: "버전 충돌" });
  });
  it("캡처는 MIME 제한과 multipart·CSRF를 적용하고 같은 API의 보호된 주소만 수락한다", async () => {
    const captureUrl = "/api/admin/production-changes/captures/00000000-0000-4000-8000-000000000001";
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ url: captureUrl })).mockResolvedValueOnce(Response.json({ url: "https://unrelated.example/capture.png" }));
    vi.stubGlobal("fetch", fetcher);
    const file = new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" });
    expect(await uploadProductionCapture(file)).toBe(captureUrl);
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
    expect(new Headers(init.headers).get(TOONSPECTRUM_CSRF_HEADER)).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
    await expect(uploadProductionCapture(file)).rejects.toMatchObject({ status: 502 });
    await expect(uploadProductionCapture(new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" }))).rejects.toThrow("PNG, JPEG, WebP");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
