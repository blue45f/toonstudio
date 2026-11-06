import { afterEach, describe, expect, it, vi } from "vitest";

import { flushStudioDocumentInkForExport } from "../studio-capture-readiness";
import { serializeCanonicalStudioDocumentEnvelope } from "../studio-document-envelope";
import { createStudioProjectArchiveOrchestration } from "../studio-project-archive-orchestration-runtime";
import { createStudioProjectDocumentEnvelope } from "../studio-project-document";
import { captureStudioProjectDocumentSession } from "../studio-project-document-session";

import type { StudioProjectArchiveOrchestrationInput } from "../studio-project-archive-orchestration-runtime";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function exportSession(pending = true, blocked = false) {
  const stroke = {
    id: "accepted-stroke", type: "draw", mode: "pen", kind: "freehand", brush: "pencil",
    points: [10, 10, 20, 30], stroke: "#ab12cd", strokeWidth: 8,
  };
  let project = {
    version: 2, title: "session", savedAt: "2026-09-08T00:00:00.000Z",
    pagesList: [{ id: "A", elements: [] as typeof stroke[], canvasH: 1080, bg: "#ffffff", bgGrad: null }],
  };
  const original = createStudioProjectDocumentEnvelope(project, {
    documentId: "draft:A", revision: 7,
    createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z",
  });
  const revisionProjectGenerationRef = { current: 0 };
  const projectDocumentSessionRef = { current: captureStudioProjectDocumentSession(original, "scope", 0) };
  const currentStudioProjectSnapshot = vi.fn(() => project as unknown as StudioProjectSnapshot);
  const pendingStrokeCommitsRef = { current: pending ? { strokes: [stroke] } : null };
  const prepareDocumentForExport = vi.fn(async () => flushStudioDocumentInkForExport({
    drawingRef: { current: null }, drawingPointerTransportRef: { current: null }, pendingStrokeCommitsRef,
    flushPendingStrokes: () => {
      if (blocked) return false;
      project = { ...project, pagesList: [{ ...project.pagesList[0]!, elements: [stroke] }] };
      revisionProjectGenerationRef.current += 1;
      pendingStrokeCommitsRef.current = null;
      return true;
    },
  }));
  const setError = vi.fn();
  const ensureProjectBackupAvailable = vi.fn(() => true);
  const files: Blob[] = [];
  const click = vi.fn();
  vi.spyOn(URL, "createObjectURL").mockImplementation((value) => { files.push(value as Blob); return "blob:json"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal("document", {
    createElement: () => ({ click }), body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
  const input = {
    workId: null, remixId: null, currentPageId: "A", title: "session", isMobile: false,
    projectArchiveBusy: false, sharedDocumentRevision: null, projectDocumentSessionScopeKey: "scope",
    revisionProjectGenerationRef, projectDocumentSessionRef,
    ensureSharedDocumentAvailableForExport: () => true, ensureProjectBackupAvailable,
    currentStudioProjectSnapshot, prepareDocumentForExport, setError,
  } as unknown as StudioProjectArchiveOrchestrationInput;
  const orchestration = createStudioProjectArchiveOrchestration(input);
  return { orchestration, original, files, click, ensureProjectBackupAvailable, revisionProjectGenerationRef, prepareDocumentForExport, currentStudioProjectSnapshot, setError, stroke, projectDocumentSessionRef };
}

describe("current project JSON does not reuse a pre-stroke envelope", () => {
  it("flushes before generation/cache selection and exports the accepted stroke with an advanced revision", async () => {
    const state = exportSession();
    await state.orchestration.handleExportProject();

    expect(state.setError).toHaveBeenLastCalledWith(null);
    expect(state.files).toHaveLength(1);
    const document = JSON.parse(await state.files[0]!.text());
    expect(document.payload.data.pagesList[0].elements).toEqual([state.stroke]);
    expect(document.document.revision).toBe(8);
    expect(state.prepareDocumentForExport).toHaveBeenCalledOnce();
    expect(state.currentStudioProjectSnapshot).toHaveBeenCalledOnce();
    expect((state.original.payload.data as { pagesList: { elements: unknown[] }[] }).pagesList[0]!.elements).toEqual([]);
  });

  it("preserves the imported envelope and creates no file if the pending receipt cannot commit", async () => {
    const state = exportSession(true, true);
    const session = state.projectDocumentSessionRef.current;
    await state.orchestration.handleExportProject();

    expect(state.setError).toHaveBeenCalledWith(expect.stringContaining("마지막 획을 원고에 확정하지 못해"));
    expect(state.files).toHaveLength(0);
    expect(state.click).not.toHaveBeenCalled();
    expect(state.projectDocumentSessionRef.current).toBe(session);
    expect(state.currentStudioProjectSnapshot).not.toHaveBeenCalled();
  });

  it("preserves byte-exact no-edit envelope export when there is no pending ink", async () => {
    const state = exportSession(false);
    await state.orchestration.handleExportProject();

    expect(state.files).toHaveLength(1);
    expect(await state.files[0]!.text()).toBe(serializeCanonicalStudioDocumentEnvelope(state.original));
    expect(state.currentStudioProjectSnapshot).not.toHaveBeenCalled();
  });
});


describe("사용자 JSON 백업은 복구 중 bootstrap을 내보내지 않는다", () => {
  it("복구 확인 전에는 snapshot과 원본 session을 건드리지 않는다", async () => {
    const state = exportSession(false);
    const originalSession = state.projectDocumentSessionRef.current;
    state.ensureProjectBackupAvailable.mockReturnValue(false);
    await state.orchestration.handleExportProject();
    expect(state.prepareDocumentForExport).not.toHaveBeenCalled();
    expect(state.currentStudioProjectSnapshot).not.toHaveBeenCalled();
    expect(state.files).toHaveLength(0);
    expect(state.projectDocumentSessionRef.current).toBe(originalSession);
  });

  it("archive 핸들러도 메뉴를 우회한 복구 미결 요청을 거부한다", async () => {
    const state = exportSession(false);
    state.ensureProjectBackupAvailable.mockReturnValue(false);
    await state.orchestration.handleExportProjectArchive();
    expect(state.currentStudioProjectSnapshot).not.toHaveBeenCalled();
    expect(state.files).toHaveLength(0);
  });

  it("준비 도중 복구가 다시 미결 상태가 되면 snapshot 전에 중단한다", async () => {
    const state = exportSession();
    state.ensureProjectBackupAvailable.mockReturnValueOnce(true).mockReturnValue(false);
    await state.orchestration.handleExportProject();
    expect(state.prepareDocumentForExport).toHaveBeenCalledOnce();
    expect(state.currentStudioProjectSnapshot).not.toHaveBeenCalled();
    expect(state.files).toHaveLength(0);
  });

  it("비동기 검사 뒤 최종 가드가 거부하면 정상 JSON 다운로드와 session 갱신이 없다", async () => {
    const state = exportSession();
    const originalSession = state.projectDocumentSessionRef.current;
    state.ensureProjectBackupAvailable.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    await state.orchestration.handleExportProject();
    expect(state.currentStudioProjectSnapshot).toHaveBeenCalledOnce();
    expect(state.files).toHaveLength(0);
    expect(state.click).not.toHaveBeenCalled();
    expect(state.projectDocumentSessionRef.current).toBe(originalSession);
  });

  it("비동기 검사 뒤 문서 세대가 바뀌어도 이전 snapshot을 내보내지 않는다", async () => {
    const state = exportSession();
    state.ensureProjectBackupAvailable.mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementation(() => {
      state.revisionProjectGenerationRef.current += 1;
      return true;
    });
    await state.orchestration.handleExportProject();
    expect(state.files).toHaveLength(0);
    expect(state.setError).toHaveBeenCalledWith(expect.stringContaining("그림이 바뀌어"));
  });

  it("복구 미결로 거부된 뒤 정본 확인을 마치면 같은 경로로 다시 백업한다", async () => {
    const state = exportSession();
    state.ensureProjectBackupAvailable.mockReturnValue(false);
    await state.orchestration.handleExportProject();
    expect(state.files).toHaveLength(0);
    state.ensureProjectBackupAvailable.mockReturnValue(true);
    await state.orchestration.handleExportProject();
    expect(state.files).toHaveLength(1);
    const data = JSON.parse(await state.files[0]!.text());
    expect(data.payload.data.pagesList[0].elements).toEqual([state.stroke]);
  });
});
