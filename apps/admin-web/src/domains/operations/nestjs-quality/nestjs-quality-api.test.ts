import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nestBoardFixture } from "../../../../tests/nestjs-quality-fixtures";
import { AdminApiError } from "../../../platform/http/admin-api";

import { loadNestBoard, parseNestBoardView, saveNestBoard } from "./nestjs-quality-api";

afterEach(() => vi.unstubAllGlobals());

describe("NestJS 관리자 보드 HTTP 경계", () => {
  it("같은 출처 세션·캐시 금지·리다이렉트 금지와 CSRF를 사용한다", async () => {
    const view = nestBoardFixture();
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(view), { status: 200 })));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    await loadNestBoard(controller.signal);
    expect(fetcher).toHaveBeenLastCalledWith("/api/admin/quality/nestjs", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal }));
    const mutation = { expectedRevision: 0, mutationId: "fixture-mutation-001", document: view.document, reason: "합성 검증 기록" };
    await saveNestBoard(mutation, controller.signal);
    expect(fetcher).toHaveBeenLastCalledWith("/api/admin/quality/nestjs", expect.objectContaining({ method: "POST", body: JSON.stringify(mutation), headers: expect.objectContaining({ [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE }) }));
  });
  it("권한·충돌·저장 장애의 HTTP 상태를 보존한다", async () => {
    for (const status of [401, 403, 409, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: `HTTP ${status}` }), { status })));
      await expect(loadNestBoard(new AbortController().signal)).rejects.toMatchObject({ status, message: `HTTP ${status}` });
    }
  });
  it("잘못된 문서·서버 버전·이력 응답을 저장 성공으로 취급하지 않는다", () => {
    const view = nestBoardFixture();
    expect(() => parseNestBoardView({ ...view, canEdit: "true" })).toThrow(AdminApiError);
    expect(() => parseNestBoardView({ ...view, revision: -1 })).toThrow(AdminApiError);
    expect(() => parseNestBoardView({ ...view, document: { tasks: [] } })).toThrow();
    expect(() => parseNestBoardView({ ...view, history: [{ revision: 1 }] })).toThrow();
    expect(parseNestBoardView(view).document.tasks).toHaveLength(28);
  });
});
