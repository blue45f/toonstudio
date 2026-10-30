import { describe, expect, it } from "vitest";
import { createStudioBg3dInitialRestoreState } from "./studio-bg3d-initial-restore-state";

describe("초기 장면 복원 완료와 renderer 재마운트 구분", () => {
  it("pending/failure는 같은 source라도 초기 복원을 다시 시작한다", () => {
    const state = createStudioBg3dInitialRestoreState(), source = { session: {}, initialScene: {}, initialDataUrl: undefined };
    const old = state.begin(source); expect(old.kind).toBe("initial-restore"); state.cancel(old);
    const next = state.begin(source); expect(next.kind).toBe("initial-restore");
    expect(state.complete(old)).toBe(false); expect(state.isCurrent(next)).toBe(true);
    state.cancel(old); expect(state.isCurrent(next)).toBe(true);
    expect(state.begin(source).kind).toBe("initial-restore");
  });
  it("현재 초기 시도의 정상 완료 뒤에만 편집 문서를 유지하는 remount로 전환한다", () => {
    const state = createStudioBg3dInitialRestoreState(), source = { session: {}, initialScene: {}, initialDataUrl: undefined };
    const first = state.begin(source); expect(state.complete(first)).toBe(true); state.cancel(first);
    const next = state.begin(source); expect(next.kind).toBe("renderer-remount"); expect(state.complete(next)).toBe(false);
    state.cancel(next); expect(state.begin(source).kind).toBe("renderer-remount");
  });
  it.each(["session", "initialScene", "initialDataUrl"])("완료 뒤 %s가 바뀌면 새로운 초기 복원이다", (key) => {
    const state = createStudioBg3dInitialRestoreState(), source = { session: {}, initialScene: {}, initialDataUrl: "A" };
    const old = state.begin(source); state.complete(old);
    const next = state.begin({ ...source, [key]: key === "initialDataUrl" ? "B" : {} });
    expect(next.kind).toBe("initial-restore"); expect(state.complete(old)).toBe(false);
  });
});
