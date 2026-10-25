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
    ).rejects.toThrow("권한이 없습니다.");
  });
});
