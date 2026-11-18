import { createAdminWorkspace, parseAdminWorkspaceSave } from "@toonstudio/contracts/admin-workspace";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAdminWorkspace, saveAdminWorkspace } from "./workspace-api";

afterEach(() => vi.restoreAllMocks());

describe("인증된 작업실 전송 계약", () => {
  it("공유 기록을 캐시 없이 읽고 잘못된 응답은 초기화하지 않고 거부한다", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ boardId: "toonstudio", revision: 0, state: null, updatedAt: null, canEdit: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: null })));
    await expect(loadAdminWorkspace()).resolves.toMatchObject({ revision: 0, state: null });
    expect(fetch).toHaveBeenCalledWith("/api/admin/workspaces/toonstudio", expect.objectContaining({ method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error" }));
    await expect(loadAdminWorkspace()).rejects.toMatchObject({ status: 502 });
  });

  it("정상 UUID와 revision을 그대로 보내고 CSRF·저장 확인 응답을 검증한다", async () => {
    const input = { expectedRevision: 4, mutationId: "123e4567-e89b-42d3-a456-426614174000", state: createAdminWorkspace() };
    const ack = { boardId: "toonstudio", revision: 5, updatedAt: "2026-11-18T00:00:00Z", replayed: false };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_path, init) => {
      expect(parseAdminWorkspaceSave(JSON.parse(String(init?.body))).ok).toBe(true);
      expect(JSON.parse(String(init?.body))).toEqual(input);
      expect(new Headers(init?.headers).get(TOONSPECTRUM_CSRF_HEADER)).toBe(TOONSPECTRUM_CSRF_HEADER_VALUE);
      return new Response(JSON.stringify(ack));
    });
    await expect(saveAdminWorkspace(input)).resolves.toEqual(ack);
    expect(fetch.mock.calls[0][0]).toBe("/api/admin/workspaces/toonstudio/save");
  });

  it("충돌과 불명확한 저장 확인은 성공으로 처리하지 않는다", async () => {
    const input = { expectedRevision: 0, mutationId: "123e4567-e89b-42d3-a456-426614174000", state: createAdminWorkspace() };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "다른 편집이 먼저 저장되었습니다.", currentRevision: 1 }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    await expect(saveAdminWorkspace(input)).rejects.toMatchObject({ status: 409 });
    await expect(saveAdminWorkspace(input)).rejects.toMatchObject({ status: 502 });
  });
});
