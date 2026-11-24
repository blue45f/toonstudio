// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { createEmptyFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { useFinalSubmission } from "./use-final-submission";

import type { FinalSubmissionRecord } from "@toonstudio/contracts/final-submission";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), export: vi.fn() }));
vi.mock("./final-submission-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./final-submission-api")>(),
  loadFinalSubmission: mocks.load, saveFinalSubmission: mocks.save, exportFinalSubmission: mocks.export,
}));
const at = "2026-11-24T03:00:00.000Z";
function record(revision = 1): FinalSubmissionRecord {
  const board = createEmptyFinalSubmissionBoard(); board.revision = revision; board.updatedAt = at;
  return { ownerUserId: "admin-a", board, revision, updatedAt: at, history: [] };
}
const empty: FinalSubmissionRecord = { ownerUserId: "admin-a", board: null, revision: 0, updatedAt: null, history: [] };

beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(record()); mocks.save.mockReset(); mocks.export.mockReset().mockResolvedValue(record());
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("최종 제출 점검의 개인 저장과 재확인", () => {
  it("서버 오류에 새 기본값을 만들거나 자동 저장하지 않는다", async () => {
    mocks.load.mockRejectedValue(new AdminApiError(503, "DB 준비 필요"));
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.board).toBeNull(); expect(result.current.accessVerified).toBe(false); expect(mocks.save).not.toHaveBeenCalled();
  });

  it("최초 빈 서버를 확인한 뒤에만 일반 점검표를 만들고 가져온 확인 근거를 보존한다", async () => {
    mocks.load.mockResolvedValue(empty);
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    const imported = createEmptyFinalSubmissionBoard(); const doc = imported.documents[0];
    Object.assign(doc, { fileName: "report-r1.docx", version: "r1", sourceUrl: "https://evidence.example/report", availability: "내용 확인", candidateState: "최종본 확정", candidateEvidence: "https://evidence.example/final", finalizedAt: at });
    let failure: string | null = "미실행";
    act(() => { failure = result.current.importBoard(imported, "Sites 점검 기록 가져오기"); });
    expect(failure).toBeNull(); expect(result.current.board?.documents[0].candidateState).toBe("최종본 확정");
    expect(result.current.dirty).toBe(true); expect(mocks.save).not.toHaveBeenCalled();
  });

  it("불확실한 저장 실패는 같은 mutation으로 재시도하고 편집을 잠근다", async () => {
    mocks.load.mockResolvedValue(empty); mocks.save.mockRejectedValueOnce(new Error("연결 중단")).mockResolvedValueOnce(record(2));
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    await act(async () => { await result.current.persist(); });
    const first = mocks.save.mock.calls[0][1];
    expect(result.current.hasPendingSave).toBe(true);
    expect(result.current.commit(createEmptyFinalSubmissionBoard(), "편집")).toMatch(/앞선 저장 결과/);
    await act(async () => { await result.current.persist(); });
    expect(mocks.save.mock.calls[1][1]).toEqual(first);
    expect(result.current.revision).toBe(2); expect(result.current.hasPendingSave).toBe(false); expect(result.current.dirty).toBe(false);
  });

  it.each([400, 413, 422])("확정적인 입력 거절 %s 뒤에는 초안을 보완할 수 있다", async (status) => {
    mocks.load.mockResolvedValue(empty); mocks.save.mockRejectedValue(new AdminApiError(status, "입력을 확인하세요"));
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    await act(async () => { await result.current.persist(); });
    expect(result.current.hasPendingSave).toBe(false); expect(result.current.dirty).toBe(true);
    act(() => { expect(result.current.commit(createEmptyFinalSubmissionBoard(), "거절된 입력 보완")).toBeNull(); });
  });

  it("버전 충돌은 초안을 유지하고 추가 덮어쓰기를 차단한다", async () => {
    mocks.save.mockRejectedValue(new AdminApiError(409, "다른 창 변경"));
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    const edited = createEmptyFinalSubmissionBoard(); edited.tasks[0].nextAction = "근거 확보";
    act(() => { expect(result.current.commit(edited, "다음 조치 기록")).toBeNull(); });
    await act(async () => { await result.current.persist(); });
    expect(result.current.conflict).toBe(true); expect(result.current.board?.tasks[0].nextAction).toBe("근거 확보");
    await act(async () => { await result.current.persist(); });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("내보내기 도중 계정이 바뀌면 늦은 이전 계정 응답을 반환하지 않는다", async () => {
    const exported = Promise.withResolvers<FinalSubmissionRecord>(); mocks.export.mockReturnValue(exported.promise);
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    const pendingExport = result.current.exportBoard();
    mocks.load.mockReturnValue(new Promise(() => undefined));
    act(() => { fireEvent(window, new Event("toonstudio:auth-session-changed")); });
    expect(result.current.accessVerified).toBe(false);
    exported.resolve(record());
    expect(await pendingExport).toBeNull();
  });

  it("저장 중 재인증은 늦은 저장 응답을 무효화하고 권한을 다시 확인한다", async () => {
    mocks.load.mockResolvedValueOnce(empty).mockResolvedValue(record(1));
    const saved = Promise.withResolvers<FinalSubmissionRecord>(); mocks.save.mockReturnValue(saved.promise);
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    let saving: Promise<void> = Promise.resolve();
    act(() => { saving = result.current.persist(); });
    expect(await result.current.exportBoard()).toBeNull(); expect(mocks.export).not.toHaveBeenCalled();
    act(() => { fireEvent(window, new Event("toonstudio:auth-session-changed")); });
    expect(result.current.accessVerified).toBe(false);
    await act(async () => { saved.resolve(record(1)); await saving; });
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
    expect(result.current.revision).toBe(0); expect(result.current.hasPendingSave).toBe(true);
    await act(async () => { await result.current.persist(); });
    expect(result.current.revision).toBe(1); expect(result.current.hasPendingSave).toBe(false);
  });

  it("권한 철회 응답은 원문·이력·초안을 제거하며 브라우저 저장소에 남기지 않는다", async () => {
    const store = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(() => useFinalSubmission("admin-a"));
    await waitFor(() => expect(result.current.accessVerified).toBe(true));
    mocks.export.mockRejectedValue(new AdminApiError(403, "권한 철회"));
    await act(async () => { expect(await result.current.exportBoard()).toBeNull(); });
    expect(result.current.board).toBeNull(); expect(result.current.history).toEqual([]); expect(result.current.denied).toBe(true);
    expect(store).not.toHaveBeenCalled();
  });
});
