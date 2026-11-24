import { createEmptyFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { TOONSPECTRUM_CSRF_HEADER, TOONSPECTRUM_CSRF_HEADER_VALUE } from "@toonstudio/contracts/security/csrf";
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportFinalSubmission, loadFinalSubmission, parseFinalSubmissionRecord, saveFinalSubmission } from "./final-submission-api";

import type { FinalSubmissionRecord } from "@toonstudio/contracts/final-submission";

const at = "2026-11-24T03:00:00.000Z";
function saved(revision = 1): FinalSubmissionRecord {
  const board = createEmptyFinalSubmissionBoard(); board.revision = revision; board.updatedAt = at;
  return { ownerUserId: "admin-a", board, revision, updatedAt: at, history: [] };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("최종 제출 점검 개인 기록 API", () => {
  it("현재 확인된 계정과 응답 소유자가 다르면 원문을 반환하지 않는다", () => {
    expect(() => parseFinalSubmissionRecord(saved(), "admin-b")).toThrow(/소유자가 다릅니다/);
    expect(() => parseFinalSubmissionRecord({ ...saved(), ownerUserId: undefined }, "admin-a")).toThrow();
  });

  it("비어 있는 서버는 정확한 revision0 응답만 허용한다", () => {
    expect(parseFinalSubmissionRecord({ ownerUserId: "admin-a", board: null, revision: 0, updatedAt: null, history: [] }, "admin-a").board).toBeNull();
    expect(() => parseFinalSubmissionRecord({ ...saved(), board: null }, "admin-a")).toThrow();
  });

  it("보드·서버 저장 버전과 시점이 다르거나 이력 버전이 앞서면 거절한다", () => {
    expect(() => parseFinalSubmissionRecord({ ...saved(), revision: 2 }, "admin-a")).toThrow();
    expect(() => parseFinalSubmissionRecord({ ...saved(), updatedAt: "2026-11-25T03:00:00.000Z" }, "admin-a")).toThrow();
    expect(() => parseFinalSubmissionRecord({ ...saved(), history: [{ id: "history", revision: 2, changedAt: at, summary: "저장" }] }, "admin-a")).toThrow();
  });

  it("개인 문서명·메모·근거 URL은 진단 마스킹으로 변형하지 않는다", async () => {
    const response = saved();
    if (!response.board) throw new Error("검증 자료 없음");
    response.board.documents[0].notes = "제출 양식의 API_KEY 항목 제외를 확인";
    response.board.documents[0].fileName = "ACCESS_TOKEN_항목제외.docx";
    response.board.documents[0].sourceUrl = "https://evidence.example/ACCESS_TOKEN/guide";
    const fetcher = vi.fn().mockResolvedValue(Response.json(response)); vi.stubGlobal("fetch", fetcher);
    expect((await loadFinalSubmission("admin-a")).board).toEqual(response.board);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/final-submission", expect.objectContaining({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" }));
  });

  it("저장 요청에는 CSRF와 서버 기준 버전만 보내며 늦은 멱등 응답을 허용한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(saved(3))); vi.stubGlobal("fetch", fetcher);
    const board = createEmptyFinalSubmissionBoard();
    const request = { board, expectedRevision: 0, mutationId: "00000000-0000-4000-8000-000000000001", summary: "점검 기록 저장" };
    expect((await saveFinalSubmission("admin-a", request)).revision).toBe(3);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/final-submission/save", expect.objectContaining({ method: "POST", body: JSON.stringify(request), headers: { "Content-Type": "application/json", [TOONSPECTRUM_CSRF_HEADER]: TOONSPECTRUM_CSRF_HEADER_VALUE } }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("ownerUserId");
  });

  it("내보내기는 별도 권한 확인 요청을 하며 권한 거절을 전달한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "권한 없음" }, { status: 403 })); vi.stubGlobal("fetch", fetcher);
    await expect(exportFinalSubmission("admin-a")).rejects.toMatchObject({ status: 403 });
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/final-submission/export");
  });

  it("서버 미준비 응답을 비어 있는 정상 기록으로 취급하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(loadFinalSubmission("admin-a")).rejects.toMatchObject({ status: 503, message: expect.stringContaining("서버 준비 상태") });
  });
});
