// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioAutosaveUnsupportedVersionError, studioAutosaveKey, type StudioAutosavePayload } from "../studio-autosave";
import { StudioOfflineOwnerPreviewVisibility } from "./studio-offline-owner-preview-visibility";
import { StudioOfflineOwnerPreview } from "./StudioOfflineOwnerPreview";

const io = vi.hoisted(() => ({
  grant: vi.fn(), open: vi.fn(), read: vi.fn(), sqliteRead: vi.fn(), write: vi.fn(), clear: vi.fn(), dispose: vi.fn(),
}));

vi.mock("./use-studio-offline-owner-preview-grant", () => ({ useStudioOfflineOwnerPreviewGrant: io.grant }));
vi.mock("../studio-autosave-opfs-session", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-autosave-opfs-session")>(), createStudioAutosaveOpfsSession: io.open,
}));
vi.mock("../studio-autosave-sqlite-store", () => ({
  acquireStudioAutosaveSqliteStore: () => Promise.resolve({ read: io.sqliteRead, write: io.write, clear: io.clear }),
}));

const workId = "offline-work";
const owner = { userId: "verified-owner", workId, revision: 4 };
const savedAt = "2026-11-23T00:00:00.000Z";
const strokes = Array.from({ length: 10 }, (_, index) => ({
  id: `stroke-${index + 1}`, type: "draw", kind: "freehand", points: [index, 1, index + 2, 3],
}));
const payload: StudioAutosavePayload = {
  version: 2, savedAt, sourceWorkId: workId, sourceRevision: 4, currentPageId: "p",
  pagesList: [{ id: "p", canvasH: 800, elements: strokes }],
};
const saved = { state: "snapshot", savedAt, sequence: 3, revision: 3, payload };

beforeAll(async () => {
  await Promise.all([
    import("../StudioPageThumbnails"),
    import("../studio-autosave-opfs-session"),
    import("../studio-autosave-sqlite-store"),
  ]);
});

beforeEach(() => {
  vi.resetAllMocks();
  io.grant.mockReturnValue(owner);
  io.open.mockResolvedValue({ readLatest: io.read, write: io.write, clear: io.clear, dispose: io.dispose });
  io.read.mockResolvedValue(saved);
  io.sqliteRead.mockResolvedValue(null);
});

afterEach(cleanup);

describe("오프라인 본인 원고 미리보기", () => {
  it("검증된 사본이 화면에 나타날 때만 잠금 안내를 교체하고 권한이 사라지면 되돌린다", async () => {
    const visible = vi.fn();
    let finishRead!: (record: typeof saved) => void;
    io.read.mockReturnValue(new Promise<typeof saved>(resolve => { finishRead = resolve; }));
    const content = () => (
      <StudioOfflineOwnerPreviewVisibility.Provider value={visible}>
        <StudioOfflineOwnerPreview workId={workId} noticeId="source-status">
          <p role="alert" id="source-status">원고를 열지 못했어요</p>
        </StudioOfflineOwnerPreview>
      </StudioOfflineOwnerPreviewVisibility.Provider>
    );
    const view = render(content());
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(visible).not.toHaveBeenCalled();
    await act(async () => { finishRead(saved); });
    const figure = await screen.findByRole("figure");
    expect(figure.id).toBe("source-status");
    expect(figure.querySelectorAll("polyline")).toHaveLength(10);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(visible).toHaveBeenLastCalledWith(workId);

    io.grant.mockReturnValue(null);
    view.rerender(content());
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("figure")).toBeNull();
    expect(visible).toHaveBeenLastCalledWith(null);
  });

  it.each(["opfs", "sqlite"])("%s 영속본에서 같은 원고의 실제 10획을 읽기 전용으로 그린다", async (source) => {
    if (source === "sqlite") {
      io.read.mockResolvedValue(null);
      io.sqliteRead.mockResolvedValue(saved);
    }
    render(<StudioOfflineOwnerPreview workId={workId} />);
    const figure = await screen.findByRole("figure");
    expect(figure.getAttribute("data-work-id")).toBe(workId);
    const lines = Array.from(figure.querySelectorAll("svg polyline"));
    expect(lines.map((line) => line.getAttribute("data-element-id"))).toEqual(strokes.map((stroke) => stroke.id));
    expect(lines[9]?.getAttribute("points")).toBe("9,1 11,3");
    expect(io.open).toHaveBeenCalledWith(studioAutosaveKey(owner), undefined, { readOnly: true });
    expect(io.sqliteRead).toHaveBeenCalledWith(studioAutosaveKey(owner));
    expect(io.write).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
  });

  it.each([
    { local: { ...saved, payload: { ...payload, sourceWorkId: "other-work" } }, sqlite: null },
    { local: { ...saved, payload: { ...payload, sourceRevision: 3 } }, sqlite: null },
    { local: saved, sqlite: { state: "cleared", savedAt } },
  ])("원고·버전이 다르거나 삭제 표시가 최신이면 그림을 내보내지 않는다", async ({ local, sqlite }) => {
    io.read.mockResolvedValue(local);
    io.sqliteRead.mockResolvedValue(sqlite);
    render(<StudioOfflineOwnerPreview workId={workId} />);
    await waitFor(() => expect(io.dispose).toHaveBeenCalled());
    expect(screen.queryByRole("figure")).toBeNull();
    expect(io.write).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
  });

  it.each(["opfs", "sqlite"])("%s 읽기가 실패해도 다른 영속본의 마지막 획을 표시한다", async (failed) => {
    io.sqliteRead.mockResolvedValue(saved);
    const unreadable = failed === "opfs" ? io.read : io.sqliteRead;
    unreadable.mockRejectedValue(new Error("영속본 읽기 실패"));
    render(<StudioOfflineOwnerPreview workId={workId} />);
    const figure = await screen.findByRole("figure");
    expect(figure.querySelector('[data-element-id="stroke-10"]')).toBeTruthy();
    expect(io.write).not.toHaveBeenCalled();
    expect(io.clear).not.toHaveBeenCalled();
  });

  it("한 저장소에서 더 새로운 문서 형식을 발견하면 다른 저장소의 예전 획을 표시하지 않는다", async () => {
    io.sqliteRead.mockRejectedValue(new StudioAutosaveUnsupportedVersionError(8));
    render(<StudioOfflineOwnerPreview workId={workId} />);
    await waitFor(() => expect(io.dispose).toHaveBeenCalled());
    expect(screen.queryByRole("figure")).toBeNull();
  });

  it("소유권 증거가 없거나 다른 원고용이면 저장소를 열지 않는다", () => {
    io.grant.mockReturnValue(null);
    const view = render(<StudioOfflineOwnerPreview workId={workId} />);
    io.grant.mockReturnValue({ ...owner, workId: "other-work" });
    view.rerender(<StudioOfflineOwnerPreview workId={workId} />);
    expect(screen.queryByRole("figure")).toBeNull();
    expect(io.open).not.toHaveBeenCalled();
  });

  it("소유권 증거가 사라지면 즉시 가리고 연결 복구 시 원본 조회를 다시 요청한다", async () => {
    const retry = vi.fn();
    const view = render(<StudioOfflineOwnerPreview workId={workId} onReconnect={retry} />);
    await screen.findByRole("figure");
    io.grant.mockReturnValue(null);
    view.rerender(<StudioOfflineOwnerPreview workId={workId} onReconnect={retry} />);
    expect(screen.queryByRole("figure")).toBeNull();
    act(() => {
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
