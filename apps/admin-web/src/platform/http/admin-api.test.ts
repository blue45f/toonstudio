import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminApiError,
  buildAdminHeaders,
  centsToWon,
  formatDate,
  formatNum,
  formatWon,
  requestAdminJson,
  wonToCents,
} from "./admin-api";

describe("admin-api platform transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves explicit content-type and avoids overriding FormData boundaries", () => {
    expect(
      buildAdminHeaders({
        method: "POST",
        body: "plain",
        headers: { "content-type": "text/plain" },
      }).get("content-type"),
    ).toBe("text/plain");
    expect(
      buildAdminHeaders({
        method: "POST",
        body: '{"ok":true}',
      }).get("content-type"),
    ).toBe("application/json");
    expect(
      buildAdminHeaders({
        method: "POST",
        body: new FormData(),
      }).has("content-type"),
    ).toBe(false);
  });

  it("converts cents and won accurately and formats display strings", () => {
    expect(centsToWon(150_000)).toBe(1500);
    expect(wonToCents(1500)).toBe(150_000);
    expect(formatWon(150_000, "ko-KR")).toBe("₩1,500");
    expect(formatNum(12345, "ko-KR")).toBe("12,345");
    expect(formatDate(null)).toBe("—");
    const err = new AdminApiError(400, "Bad request");
    expect(err.status).toBe(400);
    expect(err.name).toBe("AdminApiError");
  });

  it("sends CSRF header on POST and surfaces server error messages", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "권한이 없습니다." }), {
          status: 403,
        }),
      );

    await expect(
      requestAdminJson<{ ok: boolean }>("/api/admin/paid", {
        body: { enabled: true },
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await expect(
      requestAdminJson("/api/admin/paid", { body: { enabled: false } }),
    ).rejects.toMatchObject({ name: "AdminApiError", status: 403, message: "권한이 없습니다." });
  });

  it("fails closed with AdminApiError when a 200 response returns HTML fallback or null JSON", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("<!doctype html><html><body>SPA</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    await expect(requestAdminJson("/api/admin/operation-policy")).rejects.toMatchObject({
      name: "AdminApiError",
      status: 502,
    });
    await expect(requestAdminJson("/api/admin/operation-policy")).rejects.toMatchObject({
      name: "AdminApiError",
      status: 502,
    });
  });

  it("strips .env keys and masks internal hosts/credentials in API responses and errors", async () => {
    const synthDsn = ["postgres", "://", "ops", ":", "Pass9988", "@toonstudio-db.db.onpod.local:5432/toonstudio"].join("");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            note: `원격 상태 확인 (${synthDsn} / http://localhost:4174)`,
            DATABASE_URL: synthDsn,
            AUTH_SESSION_SECRET: "hidden",
            internalHost: "toonstudio-db.db.onpod.local:5432",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "연결 실패: 127.0.0.1:5432 / ONPOD_DEPLOY_TOKEN 누락",
          }),
          { status: 503 },
        ),
      );

    const response = await requestAdminJson<Record<string, unknown>>("/api/admin/diagnostics");
    expect(response.ok).toBe(true);
    expect(response.DATABASE_URL).toBeUndefined();
    expect(response.AUTH_SESSION_SECRET).toBeUndefined();
    expect(response.internalHost).toBeUndefined();
    expect(String(response.note)).not.toContain("onpod.local");
    expect(String(response.note)).not.toContain("localhost");
    expect(String(response.note)).not.toContain("postgres://");

    await expect(requestAdminJson("/api/admin/diagnostics")).rejects.toMatchObject({
      name: "AdminApiError",
      status: 503,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "오류: 127.0.0.1:5432 ONPOD_DEPLOY_TOKEN" }),
        { status: 500 },
      ),
    );
    try {
      await requestAdminJson("/api/admin/diagnostics");
    } catch (error) {
      expect(error).toBeInstanceOf(AdminApiError);
      expect((error as AdminApiError).message).not.toContain("127.0.0.1");
      expect((error as AdminApiError).message).not.toContain("ONPOD_DEPLOY_TOKEN");
    }
  });
});
