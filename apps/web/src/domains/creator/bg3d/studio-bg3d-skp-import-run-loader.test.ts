import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dStaleModalOperationError } from "./studio-bg3d-modal-operation-coordinator";
import { beginCurrentStudioBg3dSkpImportRun } from "./studio-bg3d-skp-import-run-loader";

import type { StudioBg3dSkpImportRun } from "./studio-bg3d-skp-import-run";

type RunModule = Pick<typeof import("./studio-bg3d-skp-import-run"), "beginStudioBg3dSkpImportRun">;
const defaultRuntime = vi.hoisted(() => ({ begin: vi.fn<RunModule["beginStudioBg3dSkpImportRun"]>() }));
vi.mock("./studio-bg3d-skp-import-run", () => ({ beginStudioBg3dSkpImportRun: defaultRuntime.begin }));

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("모듈 대기가 준비되지 않았습니다."); };
  let reject: (error: Error) => void = () => { throw new Error("모듈 대기가 준비되지 않았습니다."); };
  const promise = new Promise<Value>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}
function runtime() {
  const complete = vi.fn<StudioBg3dSkpImportRun["complete"]>().mockResolvedValue("skipped");
  const run: StudioBg3dSkpImportRun = { options: {}, complete };
  const begin = vi.fn<RunModule["beginStudioBg3dSkpImportRun"]>(() => run);
  const module: RunModule = { beginStudioBg3dSkpImportRun: begin };
  return { module, begin, run, complete };
}
beforeEach(() => { defaultRuntime.begin.mockReset(); });

describe("SketchUp lazy runtime 시작 전후의 현재 요청 guard", () => {
  it("이미 낡은 요청은 모듈 load와 singleton begin을 모두 호출하지 않는다", async () => {
    const value = runtime(), load = vi.fn<() => Promise<RunModule>>().mockResolvedValue(value.module);
    await expect(beginCurrentStudioBg3dSkpImportRun(() => false, load)).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(load).not.toHaveBeenCalled(); expect(value.begin).not.toHaveBeenCalled();
  });

  it("load resolve 전에 scope가 바뀌면 오래된 singleton을 시작하지 않는다", async () => {
    const value = runtime(), gate = deferred<RunModule>(); let current = true;
    const load = vi.fn<() => Promise<RunModule>>(() => gate.promise);
    const pending = beginCurrentStudioBg3dSkpImportRun(() => current, load);
    expect(load).toHaveBeenCalledOnce(); current = false; gate.resolve(value.module);
    await expect(pending).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(value.begin).not.toHaveBeenCalled(); expect(value.complete).not.toHaveBeenCalled();
  });

  it("A load를 기다리는 동안 B의 load가 먼저 완료돼도 A의 늦은 resolve는 B의 run을 건드리지 않는다", async () => {
    const a = runtime(), b = runtime(), aLoad = deferred<RunModule>(), bLoad = deferred<RunModule>();
    let generation = 1;
    const pendingA = beginCurrentStudioBg3dSkpImportRun(() => generation === 1, () => aLoad.promise);
    generation = 2;
    const pendingB = beginCurrentStudioBg3dSkpImportRun(() => generation === 2, () => bLoad.promise);
    bLoad.resolve(b.module); await expect(pendingB).resolves.toBe(b.run);
    aLoad.resolve(a.module); await expect(pendingA).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(a.begin).not.toHaveBeenCalled(); expect(b.begin).toHaveBeenCalledTimes(1);
    expect(a.complete).not.toHaveBeenCalled(); expect(b.complete).not.toHaveBeenCalled();
  });

  it("사용자 취소 신호가 load 대기 중 바뀌어도 singleton begin은 0회다", async () => {
    const value = runtime(), gate = deferred<RunModule>(), controller = new AbortController();
    const pending = beginCurrentStudioBg3dSkpImportRun(() => !controller.signal.aborted, () => gate.promise);
    controller.abort(); gate.resolve(value.module);
    await expect(pending).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(value.begin).not.toHaveBeenCalled();
  });

  it.each([true, false])("load reject는 현재 요청 여부 %s와 관계없이 원본 Error identity를 유지한다", async (stillCurrent) => {
    const value = runtime(), gate = deferred<RunModule>(), failure = new Error("SketchUp runtime chunk load failed");
    let current = true;
    const pending = beginCurrentStudioBg3dSkpImportRun(() => current, () => gate.promise);
    current = stillCurrent; gate.reject(failure);
    await expect(pending).rejects.toBe(failure);
    expect(failure.message).toBe("SketchUp runtime chunk load failed"); expect(value.begin).not.toHaveBeenCalled();
  });

  it("유효한 own flow는 await 앞뒤 guard 뒤 무인자 begin 한 번으로 같은 run을 돌려준다", async () => {
    const value = runtime(), gate = deferred<RunModule>(), isCurrent = vi.fn(() => true);
    const load = vi.fn<() => Promise<RunModule>>(() => gate.promise);
    const pending = beginCurrentStudioBg3dSkpImportRun(isCurrent, load);
    expect(isCurrent).toHaveBeenCalledTimes(1); expect(value.begin).not.toHaveBeenCalled();
    gate.resolve(value.module); await expect(pending).resolves.toBe(value.run);
    expect(isCurrent).toHaveBeenCalledTimes(2); expect(load).toHaveBeenCalledOnce();
    expect(value.begin.mock.calls).toEqual([[]]); expect(value.complete).not.toHaveBeenCalled();
  });

  it("주입이 없는 기본 경로도 실제 동적 import export를 await 뒤 한 번 시작한다", async () => {
    const value = runtime(); defaultRuntime.begin.mockReturnValue(value.run);
    await expect(beginCurrentStudioBg3dSkpImportRun(() => true)).resolves.toBe(value.run);
    expect(defaultRuntime.begin.mock.calls).toEqual([[]]); expect(value.complete).not.toHaveBeenCalled();
  });

  it("시작 guard 자체의 오류도 원본을 유지하며 load를 시도하지 않는다", async () => {
    const failure = new Error("scope guard failed"), value = runtime();
    const load = vi.fn<() => Promise<RunModule>>().mockResolvedValue(value.module);
    await expect(beginCurrentStudioBg3dSkpImportRun(() => { throw failure; }, load)).rejects.toBe(failure);
    expect(load).not.toHaveBeenCalled(); expect(value.begin).not.toHaveBeenCalled();
  });
});
