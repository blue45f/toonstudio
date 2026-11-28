import { describe, expect, it, vi } from "vitest";

import { createStudioVrmGripSettlement } from "../vrm/studio-vrm-grip-settlement";
import { acquireCharacterExportSession, characterExportSize } from "./character-shaper-export";

import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";

function host(): StudioVrmPoserHost {
  const operation = { current: null as string | null };
  return {
    vrm: {}, activeModelId: "model", captureRef: { current: { gl: {}, scene: {}, camera: {} } },
    captureOperationRef: operation,
    captureVisualAuthorityRef: { current: { identity: "original" } },
    setIsCapturing: vi.fn(),
    texturePaintMutationBlockedRef: { current: false }, wardrobeMutationBlockedRef: { current: false },
    acquireVrmCaptureOperation: vi.fn((kind: string) => {
      if (operation.current !== null) return false;
      operation.current = kind;
      return true;
    }),
    releaseVrmCaptureOperation: vi.fn(() => { operation.current = null; }),
  };
}

describe("character file export", () => {
  it.each([[360, 520, 1418, 2048], [1920, 1080, 2048, 1152], [800, 800, 2048, 2048]])(
    "preserves aspect for %i×%i", (width, height, expectedWidth, expectedHeight) => {
      expect(characterExportSize(width, height, 2048)).toEqual({ width: expectedWidth, height: expectedHeight });
    },
  );
  it.each([0, -1, NaN, Infinity])("rejects invalid source dimensions %s", (value) => {
    expect(() => characterExportSize(value, 10, 2048)).toThrow(RangeError);
  });
  it("refuses overlap with a canvas insert without modifying its locks", () => {
    const h = host(); h.captureOperationRef.current = "insert";
    expect(() => acquireCharacterExportSession(h, () => h)).toThrow("다른 캡처");
    expect(h.setIsCapturing).not.toHaveBeenCalled();
  });
  it("PNG·PSD·설정화의 파지 보정이 모두 끝날 때까지 렌더 프레임을 정지하지 않는다", async () => {
    const h = host();
    const left = createStudioVrmGripSettlement(h.vrm, vi.fn());
    const right = createStudioVrmGripSettlement(h.vrm, vi.fn());
    const session = acquireCharacterExportSession(h, () => h);
    const settled = session.freezeSettledPose();
    expect(h.captureOperationRef.current).toBe("export");
    left.ready(true);
    await Promise.resolve();
    expect(h.setIsCapturing).not.toHaveBeenCalled();
    right.ready(true);
    await settled;
    expect(h.setIsCapturing).toHaveBeenCalledWith(true);
    session.release();
    left.dispose(); right.dispose();
    expect(h.captureOperationRef.current).toBeNull();
  });

  it("준비 중 취소하거나 소품을 교체하면 다음 출력이 사용할 프레임을 정지하지 않는다", async () => {
    const h = host();
    for (const cause of ["cancel", "replace"]) {
      const grip = createStudioVrmGripSettlement(h.vrm, vi.fn());
      const session = acquireCharacterExportSession(h, () => h);
      const pending = session.freezeSettledPose();
      if (cause === "cancel") session.cancel();
      else grip.dispose();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(h.setIsCapturing).not.toHaveBeenCalledWith(true);
      session.release();
      grip.dispose();
      expect(h.captureOperationRef.current).toBeNull();
    }
  });

  it("준비 중 다른 모델이 선택되면 이전 출력 요청을 폐기한다", async () => {
    const h = host();
    const grip = createStudioVrmGripSettlement(h.vrm, vi.fn());
    const session = acquireCharacterExportSession(h, () => h);
    const pending = session.freezeSettledPose();
    h.vrm = {};
    grip.ready(true);
    await expect(pending).rejects.toThrow("캐릭터가 바뀌었습니다");
    expect(h.setIsCapturing).not.toHaveBeenCalledWith(true);
    session.release();
    grip.dispose();
  });

  it("rejects an edited character between PSD passes", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    session.assertCurrent();
    h.captureVisualAuthorityRef.current = { identity: "edited" };
    expect(session.assertCurrent).toThrow("캐릭터가 바뀌었습니다");
    session.release();
  });
  it("rejects replacement of the model, renderer, or painted texture revision", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    h.captureRef.current.gl = {};
    expect(session.assertCurrent).toThrow("캐릭터가 바뀌었습니다");
    session.release();
  });
  it("does not release a later export after the runtime resets the operation ref", () => {
    const h = host();
    const old = acquireCharacterExportSession(h, () => h);
    h.captureOperationRef.current = null;
    const next = acquireCharacterExportSession(h, () => h);
    old.cancel();
    old.release();
    expect(h.captureOperationRef.current).toBe("export");
    expect(h.setIsCapturing).not.toHaveBeenCalledWith(false);
    expect(next.assertCurrent).not.toThrow();
    next.release();
    expect(h.captureOperationRef.current).toBeNull();
  });

  it("refuses to export while an unfinished IK command can still move the character", () => {
    const h = host(); h.pendingPersistentIkCommandRef = { current: {} };
    expect(() => acquireCharacterExportSession(h, () => h)).toThrow("관절 조절");
    expect(h.acquireVrmCaptureOperation).not.toHaveBeenCalled();
  });

  it("releases idempotently on cancellation without clearing a newer capture", () => {
    const h = host(); const session = acquireCharacterExportSession(h, () => h);
    session.cancel(); session.release();
    expect(session.signal.aborted).toBe(true);
    expect(session.assertCurrent).toThrow("취소했습니다");
    expect(h.releaseVrmCaptureOperation).toHaveBeenCalledTimes(1);
    const newer = acquireCharacterExportSession(h, () => h);
    h.captureOperationRef.current = "insert";
    newer.release();
    expect(h.captureOperationRef.current).toBe("insert");
  });
});
