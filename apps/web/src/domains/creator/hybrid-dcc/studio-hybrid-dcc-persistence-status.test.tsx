// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useStudioHybridDccPersistence } from "./studio-hybrid-dcc-persistence";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";

const journal = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../studio-opfs-filesystem", () => ({ selectStudioOpfsFileSystem: async () => ({ kind: "opfs", fs: {} }) }));
vi.mock("./studio-hybrid-dcc-workspace-persistence", () => ({ createStudioHybridDccWorkspacePersistenceFromFileSystem: () => journal }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("복구한 체크포인트를 표시하고 다음 편집을 저장 대기하는 동안 이전 저장 완료 표시는 지운다", async () => {
  vi.stubGlobal("navigator", { locks: { request: vi.fn() } });
  const workspace = createStudioHybridDccWorkspace("model");
  journal.load.mockResolvedValue({ status: "restored", lastSequence: 4, sourceHash: "sha256:first", documentStateHash: "first-state", workspace });
  const { result } = renderHook(() => useStudioHybridDccPersistence({
    autosaveKey: "model", hybridDccOpen: true, liveRoomQueryParam: null, studioAuthReady: true, studioAuthUserId: "artist", workId: "model",
  }));
  await waitFor(() => expect(result.current.hybridDccPersistenceStatus).toBe("saved"));
  expect(result.current.hybridDccPersistenceReceipt).toMatchObject({ sequence: 4, documentStateHash: "first-state" });
  const next = workspaceAddUnitCube(workspace);
  act(() => result.current.scheduleHybridDccWorkspacePersistence(next));
  expect(result.current.hybridDccPersistenceStatus).toBe("saving");
  expect(result.current.hybridDccPersistenceReceipt).toBeNull();
  expect(journal.save).not.toHaveBeenCalled();
  journal.save.mockResolvedValue({ sequence: 5, sourceHash: "sha256:next", documentStateHash: "next-state" });
  act(() => result.current.flushHybridDccWorkspacePersistence());
  await waitFor(() => expect(result.current.hybridDccPersistenceReceipt).toMatchObject({ sequence: 5, documentStateHash: "next-state" }));
  expect(journal.save).toHaveBeenCalledWith(next);
});
