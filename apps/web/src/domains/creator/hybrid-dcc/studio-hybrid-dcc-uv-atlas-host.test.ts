import { describe, expect, it, vi } from "vitest";

import { createStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { createStudioHybridDccUvAtlasHost } from "./studio-hybrid-dcc-uv-atlas-host";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

type ParentRun = Parameters<typeof createStudioHybridDccUvAtlasHost>[0]["run"];

function deferred() {
  let finish: () => void = () => { throw new Error("호스트 완료 Promise가 초기화되지 않았습니다."); };
  const promise = new Promise<void>((resolve) => { finish = resolve; });
  return { promise, finish: () => finish() };
}

function source() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-atlas-host"), "cube");
  const selection = { ...createStudioHybridDccComponentSelection(), objectIds: ["cube"], activeObjectId: "cube" };
  return { workspace, selection };
}

describe("자동 UV 전용 호스트의 문서 발행 경계", () => {
  it("렌더에서 캡처한 정확한 workspace·selection을 넘기고 부모 Promise를 그대로 돌려준다", async () => {
    const { workspace, selection } = source();
    const gate = deferred();
    const canCommit = vi.fn(() => true);
    const onCommitted = vi.fn();
    const next = workspaceAddUnitCube(workspace, "second");
    const result = { workspace: next, selection };
    const edit = vi.fn<StudioHybridDccWorkspaceEdit>(() => result);
    const run = vi.fn<ParentRun>((label, apply, guard, acknowledge) => {
      expect(label).toBe("자동 UV 펼치기");
      expect(guard).toBe(canCommit);
      expect(acknowledge).toBe(onCommitted);
      expect(apply()).toBe(result);
      return gate.promise;
    });
    const host = createStudioHybridDccUvAtlasHost({ workspace, selection, busy: false, generation: 7, getGeneration: () => 7, run });
    const pending = host("자동 UV 펼치기", edit, canCommit, onCommitted);
    expect(pending).toBe(gate.promise);
    expect(edit).toHaveBeenCalledExactlyOnceWith(workspace, selection);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(workspace.activeAssetId).toBe("cube");
    gate.finish();
    await pending;
  });

  it.each(["busy", "generation", "guard"] as const)("%s 경계가 맞지 않으면 편집·부모 실행·ack을 시작하지 않는다", async (reason) => {
    const { workspace, selection } = source();
    const run = vi.fn<ParentRun>(async () => {});
    const edit = vi.fn<StudioHybridDccWorkspaceEdit>(() => ({ workspace, selection }));
    const onCommitted = vi.fn();
    const host = createStudioHybridDccUvAtlasHost({
      workspace, selection, busy: reason === "busy", generation: 7,
      getGeneration: () => reason === "generation" ? 8 : 7, run,
    });
    await host("자동 UV 펼치기", edit, () => reason !== "guard", onCommitted);
    expect(run).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it("다른 부모 명령이 busy 재렌더 전에 시작해도 기존 세대의 UV dispatch를 막는다", async () => {
    const { workspace, selection } = source();
    let generation = 11;
    const run = vi.fn<ParentRun>(async () => {});
    const edit = vi.fn<StudioHybridDccWorkspaceEdit>(() => ({ workspace, selection }));
    const host = createStudioHybridDccUvAtlasHost({ workspace, selection, busy: false, generation, getGeneration: () => generation, run });
    generation += 1;
    await host("자동 UV 펼치기", edit, () => true, vi.fn());
    expect(run).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    const fresh = createStudioHybridDccUvAtlasHost({ workspace, selection, busy: false, generation, getGeneration: () => generation, run });
    await fresh("자동 UV 펼치기", edit, () => true, vi.fn());
    expect(run).toHaveBeenCalledOnce();
  });

  it("계산 완료로 ack하지 않고 부모가 실제 발행할 때까지 최신 guard·ack을 전달한다", async () => {
    const { workspace, selection } = source();
    const gate = deferred();
    let allowed = true;
    const publication: { current: { guard: () => boolean; acknowledge: () => void } | null } = { current: null };
    const run = vi.fn<ParentRun>((_label, _edit, guard, acknowledge) => {
      publication.current = { guard, acknowledge };
      return gate.promise;
    });
    const onCommitted = vi.fn();
    const host = createStudioHybridDccUvAtlasHost({ workspace, selection, busy: false, generation: 1, getGeneration: () => 1, run });
    const pending = host("자동 UV 펼치기", () => ({ workspace, selection }), () => allowed, onCommitted);
    const forwarded = publication.current;
    if (!forwarded) throw new Error("부모가 발행 guard를 받지 못했습니다.");
    expect(forwarded.guard()).toBe(true);
    expect(onCommitted).not.toHaveBeenCalled();
    allowed = false;
    expect(forwarded.guard()).toBe(false);
    allowed = true;
    forwarded.acknowledge();
    expect(onCommitted).toHaveBeenCalledOnce();
    gate.finish();
    await pending;
  });

  it("부모의 비동기 실패를 호출자에게 전달하고 성공 ack으로 바꾸지 않는다", async () => {
    const { workspace, selection } = source();
    const error = new Error("정본 발행에 실패했습니다.");
    const run = vi.fn<ParentRun>(() => Promise.reject(error));
    const onCommitted = vi.fn();
    const host = createStudioHybridDccUvAtlasHost({ workspace, selection, busy: false, generation: 1, getGeneration: () => 1, run });
    await expect(host("자동 UV 펼치기", () => ({ workspace, selection }), () => true, onCommitted)).rejects.toBe(error);
    expect(onCommitted).not.toHaveBeenCalled();
  });
});
