import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAdminIdentity, parseAdminIdentity } from "./admin-identity";

afterEach(() => vi.unstubAllGlobals());

describe("CI·QA 관리자 식별", () => {
  it.each(["admin", "operator"])("서버의 %s 역할을 허용한다", (role) => {
    expect(parseAdminIdentity({ id: "actor-1", role, email: "사용하지 않는 필드" })).toEqual({ id: "actor-1", role });
  });
  it.each([null, {}, { id: "", role: "admin" }, { id: " ", role: "admin" }, { id: "a", role: "user" }, { id: "a", role: "creator" }, { id: 1, role: "admin" }])("불완전한 응답과 비관리자는 거부한다: %j", (value) => {
    expect(() => parseAdminIdentity(value)).toThrow("관리자 권한");
  });
  it("same-origin 세션과 no-store, 취소 신호로 서버를 확인한다", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "actor-2", role: "operator" }) });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await loadAdminIdentity(signal)).toEqual({ id: "actor-2", role: "operator" });
    expect(fetch).toHaveBeenCalledWith("/api/admin/me", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal }));
  });
  it("권한 거부 응답을 성공으로 해석하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "관리자 전용입니다." }) }));
    await expect(loadAdminIdentity()).rejects.toThrow("관리자 전용");
  });
});
