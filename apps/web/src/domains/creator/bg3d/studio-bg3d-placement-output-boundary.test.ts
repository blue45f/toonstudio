import { describe, expect, it, vi } from "vitest";

import { attachStudioBg3dEditorCaptureHost } from "./studio-bg3d-editor-capture-host";
import { attachStudioBg3dEditorInsertHost } from "./studio-bg3d-editor-insert-host";

describe("3D 미확정 배치의 출력 경계", () => {
  it("렌더 스냅샷이 아직 idle인 경우에도 최신 배치 세션으로 저장·삽입을 중단한다", async () => {
    const placementSessionRef: { current: { phase: "preview" | "idle" } } = { current: { phase: "preview" } };
    const host = {
      placementActive: false,
      placementSessionRef,
      sceneBaseDocument: { output: {} },
      captureInFlightRef: { current: false },
      destructiveMutationGuardRef: { current: { blocksClose: false } },
      physicsPhaseRef: { current: "idle" },
      insertBackgroundIntent: { ok: false, reason: "테스트 출력 권한 확인" },
      setError: vi.fn(),
      handleInsert: undefined as (() => Promise<void>) | undefined,
      handleSaveToLibrary: undefined as (() => Promise<void>) | undefined,
    };
    attachStudioBg3dEditorInsertHost(host);
    attachStudioBg3dEditorCaptureHost(host);
    if (!host.handleInsert || !host.handleSaveToLibrary) throw new Error("3D 출력 핸들러 누락");

    await host.handleInsert();
    await host.handleSaveToLibrary();
    expect(host.setError).not.toHaveBeenCalled();

    placementSessionRef.current = { phase: "idle" };
    await host.handleInsert();
    await host.handleSaveToLibrary();
    expect(host.setError.mock.calls).toEqual([["테스트 출력 권한 확인"], ["테스트 출력 권한 확인"]]);
  });
});
