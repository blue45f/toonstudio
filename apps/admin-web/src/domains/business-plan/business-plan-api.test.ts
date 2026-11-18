import { createEmptyBusinessPlanState } from "@toonstudio/contracts/business-plan";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { exportBusinessPlan, loadBusinessPlan, parseBusinessPlanRecord, saveBusinessPlan } from "./business-plan-api";

const ownerAccess = { canRead: true, canWrite: true, canExport: true, canManageAccess: true, canClaimOwnership: false };

afterEach(() => { vi.unstubAllGlobals(); });

describe("사업계획서 API 어댑터", () => {
  it("빈 서버 기록과 저장 버전을 검증하고 잘못된 응답을 새 보드로 대체하지 않는다", () => {
    expect(parseBusinessPlanRecord({ board: null, revision: 0, updatedAt: null, access: ownerAccess })).toEqual({ board: null, revision: 0, updatedAt: null, access: ownerAccess });
    expect(() => parseBusinessPlanRecord({ board: null, revision: 3, updatedAt: null, access: ownerAccess })).toThrow(/버전/u);
    expect(() => parseBusinessPlanRecord({ board: {}, revision: 1, updatedAt: new Date().toISOString(), access: ownerAccess })).toThrow(/검증/u);
    expect(() => parseBusinessPlanRecord({ board: createEmptyBusinessPlanState(), revision: -1, updatedAt: null, access: ownerAccess })).toThrow(/버전/u);
  });

  it("인증된 same-origin GET과 CSRF 보호 POST만 사용한다", async () => {
    const board = createEmptyBusinessPlanState(); const updatedAt = new Date().toISOString();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ board: null, revision: 0, updatedAt: null, access: ownerAccess }))).mockResolvedValueOnce(new Response(JSON.stringify({ board, revision: 1, updatedAt, access: ownerAccess })));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController(); await loadBusinessPlan(controller.signal);
    const request = { board, expectedRevision: 0, mutationId: crypto.randomUUID() };
    await saveBusinessPlan(request, controller.signal);
    expect(fetcher.mock.calls[0]).toEqual(["/api/admin/business-plan", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal })]);
    expect(fetcher.mock.calls[1][0]).toBe("/api/admin/business-plan/save");
    const options = fetcher.mock.calls[1][1] as RequestInit;
    expect(options.method).toBe("POST"); expect(options.credentials).toBe("same-origin");
    expect(JSON.parse(String(options.body))).toEqual(request);
    expect(Object.keys(options.headers ?? {}).some((key) => /csrf/iu.test(key))).toBe(true);
  });

  it("권한·충돌 오류를 보존하고 저장 응답 버전 불일치를 성공으로 처리하지 않는다", async () => {
    const board = createEmptyBusinessPlanState(); const request = { board, expectedRevision: 2, mutationId: crypto.randomUUID() };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "권한 없음" }), { status: 403 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: "수정 충돌" }), { status: 409 })).mockResolvedValueOnce(new Response(JSON.stringify({ board, revision: 5, updatedAt: new Date().toISOString(), access: ownerAccess })));
    vi.stubGlobal("fetch", fetcher);
    await expect(loadBusinessPlan()).rejects.toMatchObject({ status: 403 });
    await expect(saveBusinessPlan(request)).rejects.toMatchObject({ status: 409 });
    await expect(saveBusinessPlan(request)).rejects.toBeInstanceOf(AdminApiError);
  });

  it("이전 전역 공개 응답과 모순된 권한을 거절하고 내보내기를 별도 서버 경로에서 재검증한다", async () => {
    const board = createEmptyBusinessPlanState(); const updatedAt = new Date().toISOString();
    expect(() => parseBusinessPlanRecord({ board, revision: 1, updatedAt })).toThrow();
    expect(() => parseBusinessPlanRecord({ board, revision: 1, updatedAt, access: { ...ownerAccess, canRead: false } })).toThrow();
    expect(() => parseBusinessPlanRecord({ board, revision: 1, updatedAt, access: { ...ownerAccess, canClaimOwnership: true } })).toThrow();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ board, revision: 1, updatedAt, access: { ...ownerAccess, canExport: false, canManageAccess: false } }))).mockResolvedValueOnce(new Response(JSON.stringify({ board, revision: 1, updatedAt, access: ownerAccess })));
    vi.stubGlobal("fetch", fetcher);
    await expect(exportBusinessPlan()).rejects.toMatchObject({ status: 403 });
    expect((await exportBusinessPlan()).board).toEqual(board);
    expect(fetcher.mock.calls.every(([path]) => path === "/api/admin/business-plan/export")).toBe(true);
  });
});
