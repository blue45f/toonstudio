import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireStudioBg3dCaptureEnvironmentReceipt, assertStudioBg3dCaptureEnvironmentCurrent,
  attachStudioBg3dCaptureEnvironmentReceipt, inheritStudioBg3dCaptureEnvironmentReceipt,
  publishStudioBg3dCaptureEnvironment, StudioBg3dCaptureEnvironmentError } from "./studio-bg3d-capture-environment-receipt";

function deferred<T>() {
  let accept: ((value: T) => void) | undefined, decline: ((cause: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { accept = resolve; decline = reject; });
  return { promise, resolve(value: T) { if (!accept) throw Error("대기 fixture 없음"); accept(value); },
    reject(cause: unknown) { if (!decline) throw Error("대기 fixture 없음"); decline(cause); } };
}
async function flush(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }
function publish(scene: object, renderer: object, fingerprint = "none", isApplied: () => boolean = () => true) {
  return publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint, ready: Promise.resolve(true), isApplied });
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("캡처 환경 세대와 출력 영수증", () => {
  it("미등록 환경은 실패하며 none/off도 명시 준비 완료 뒤에만 허용한다", async () => {
    const scene = {}, renderer = {};
    await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "missing", name: "StudioBg3dCaptureEnvironmentError" });
    const owner = publish(scene, renderer, "none/off"), receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    expect(Object.isFrozen(receipt)).toBe(true); expect(receipt.fingerprint).toBe("none/off");
    expect(() => receipt.assertCurrent("none/off")).not.toThrow();
    expect(() => receipt.assertCurrent("hdri:requested")).toThrow(expect.objectContaining({ code: "fingerprint-mismatch" }));
    owner.dispose(); expect(() => receipt.assertCurrent()).toThrow(expect.objectContaining({ code: "disposed" }));
    await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "disposed" });
  });

  it("실제 ready=true와 적용 완료 전에는 render를 한 번도 시작하지 않는다", async () => {
    const scene = {}, renderer = {}, ready = deferred<boolean>(), render = vi.fn(); let applied = false;
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "hdri:A", ready: ready.promise, isApplied: () => applied });
    const capture = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer).then((receipt) => { receipt.assertCurrent(); render(); return receipt; });
    await flush(); expect(render).not.toHaveBeenCalled();
    applied = true; ready.resolve(true); const receipt = await capture;
    expect(render).toHaveBeenCalledOnce(); expect(() => receipt.assertCurrent()).not.toThrow(); owner.dispose();
  });

  it("ready=true여도 실제 scene 적용이 없으면 render 없이 거부한다", async () => {
    const scene = {}, renderer = {}, render = vi.fn(), owner = publish(scene, renderer, "not-installed", () => false);
    const capture = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer).then(render);
    await expect(capture).rejects.toMatchObject({ code: "not-applied" }); expect(render).not.toHaveBeenCalled(); owner.dispose();
  });

  it.each(["false", "rejection"])("준비 %s는 성공 영수증을 만들지 않는다", async (result) => {
    const scene = {}, renderer = {}, ready = deferred<boolean>();
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "failed", ready: ready.promise, isApplied: () => true });
    const rejected = expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "failed" });
    if (result === "false") ready.resolve(false); else ready.reject(Error("실제 준비 실패"));
    await rejected; expect(vi.getTimerCount()).toBe(0); owner.dispose();
  });

  it("같은 fingerprint의 새 publish도 이전 pending 대기를 즉시 깨워 거부한다", async () => {
    const scene = {}, renderer = {}, ready = deferred<boolean>();
    const a = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "same", ready: ready.promise, isApplied: () => true });
    const pending = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    const rejected = expect(pending).rejects.toMatchObject({ code: "superseded" });
    const b = publish(scene, renderer, "same"); await rejected;
    expect(vi.getTimerCount()).toBe(0); a.dispose();
    const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    expect(() => receipt.assertCurrent()).not.toThrow(); ready.resolve(true); await flush();
    expect(() => receipt.assertCurrent()).not.toThrow(); b.dispose();
  });

  it("pending dispose는 ready 미완료 상태에서 즉시 거부하고 이전 세대를 복원하지 않는다", async () => {
    const scene = {}, renderer = {}, ready = deferred<boolean>(), old = publish(scene, renderer, "old");
    await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "pending", ready: ready.promise, isApplied: () => true });
    const rejected = expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "disposed" });
    owner.dispose(); owner.dispose(); await rejected;
    await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "disposed" });
    ready.resolve(true); await flush();
    await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "disposed" }); old.dispose();
  });

  it("context 복구의 새 entry는 준비 전에는 이전 영수증을 거부하고 준비 뒤 새 영수증만 허용한다", async () => {
    const scene = {}, renderer = {}, first = publish(scene, renderer, "generation:1");
    const previous = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer), ready = deferred<boolean>(), render = vi.fn();
    const recovery = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "generation:2", ready: ready.promise, isApplied: () => true });
    expect(() => previous.assertCurrent()).toThrow(expect.objectContaining({ code: "superseded" }));
    const pending = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer).then((receipt) => { render(); return receipt; });
    await flush(); expect(render).not.toHaveBeenCalled(); ready.resolve(true);
    const current = await pending; expect(render).toHaveBeenCalledOnce(); expect(() => current.assertCurrent()).not.toThrow();
    first.dispose(); expect(() => current.assertCurrent()).not.toThrow(); recovery.dispose();
  });

  it("최종 출력은 같은 fingerprint의 ABA 교체도 인계 전에 거부한다", async () => {
    const scene = {}, renderer = {}, first = publish(scene, renderer, "A"), output = Object.freeze({ bytes: "완성된 이미지" });
    const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    attachStudioBg3dCaptureEnvironmentReceipt(output, receipt); expect(() => assertStudioBg3dCaptureEnvironmentCurrent(output)).not.toThrow();
    const second = publish(scene, renderer, "B"), third = publish(scene, renderer, "A");
    await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    expect(() => assertStudioBg3dCaptureEnvironmentCurrent(output)).toThrow(expect.objectContaining({ code: "superseded" }));
    first.dispose(); second.dispose(); third.dispose();
  });

  it("두 source guard를 누적 상속하고 같은 영수증은 중복 확인하지 않는다", async () => {
    const scene = {}, rendererA = {}, rendererB = {}, appliedA = vi.fn(() => true), appliedB = vi.fn(() => true);
    const a = publish(scene, rendererA, "A", appliedA), b = publish(scene, rendererB, "B", appliedB);
    const sourceA = {}, sourceB = {}, output = {};
    attachStudioBg3dCaptureEnvironmentReceipt(sourceA, await acquireStudioBg3dCaptureEnvironmentReceipt(scene, rendererA));
    attachStudioBg3dCaptureEnvironmentReceipt(sourceB, await acquireStudioBg3dCaptureEnvironmentReceipt(scene, rendererB));
    inheritStudioBg3dCaptureEnvironmentReceipt(output, sourceA); inheritStudioBg3dCaptureEnvironmentReceipt(output, sourceB);
    inheritStudioBg3dCaptureEnvironmentReceipt(output, sourceA); inheritStudioBg3dCaptureEnvironmentReceipt(output, {});
    appliedA.mockClear(); appliedB.mockClear(); assertStudioBg3dCaptureEnvironmentCurrent(output);
    expect(appliedA).toHaveBeenCalledOnce(); expect(appliedB).toHaveBeenCalledOnce();
    expect(() => assertStudioBg3dCaptureEnvironmentCurrent(output, "A"))
      .toThrow(expect.objectContaining({ code: "fingerprint-mismatch" }));
    a.dispose(); expect(() => assertStudioBg3dCaptureEnvironmentCurrent(output)).toThrow(expect.objectContaining({ code: "disposed" })); b.dispose();
  });

  it("legacy 출력은 no-op이며 임의 생성한 receipt를 제품 영수증으로 붙일 수 없다", () => {
    const legacy = {}, output = {}, forged = vi.fn<() => void>();
    inheritStudioBg3dCaptureEnvironmentReceipt(output, legacy); expect(() => assertStudioBg3dCaptureEnvironmentCurrent(output)).not.toThrow();
    expect(() => attachStudioBg3dCaptureEnvironmentReceipt(output, Object.freeze({ fingerprint: "none", assertCurrent: forged })))
      .toThrow(expect.objectContaining({ code: "invalid-receipt" }));
    expect(forged).not.toHaveBeenCalled();
  });

  it("취소는 대기자·timer·abort listener를 정리하고 늦은 ready가 render를 시작하지 않는다", async () => {
    const scene = {}, renderer = {}, ready = deferred<boolean>(), controller = new AbortController(), render = vi.fn();
    const add = vi.spyOn(controller.signal, "addEventListener"), remove = vi.spyOn(controller.signal, "removeEventListener");
    const owner = publishStudioBg3dCaptureEnvironment(scene, renderer, { fingerprint: "cancel", ready: ready.promise, isApplied: () => true });
    const pending = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, { signal: controller.signal }).then(render);
    const reason = Error("사용자가 캡처 취소"), rejected = expect(pending).rejects.toMatchObject({ code: "aborted", name: "AbortError", cause: reason });
    controller.abort(reason); await rejected; await expect(pending).rejects.toBeInstanceOf(StudioBg3dCaptureEnvironmentError);
    expect(add).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    ready.resolve(true); await flush(); expect(render).not.toHaveBeenCalled(); owner.dispose();
  });

  it("timeout도 listener를 정리하며 준비 작업 자체를 취소하거나 다음 요청을 막지 않는다", async () => {
    const scene = {}, renderer = {}, ready = deferred<boolean>(), controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener"), owner = publishStudioBg3dCaptureEnvironment(scene, renderer,
      { fingerprint: "slow", ready: ready.promise, isApplied: () => true });
    const pending = acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, { signal: controller.signal, timeoutMs: 25 });
    const rejected = expect(pending).rejects.toMatchObject({ code: "timeout", name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(25); await rejected; expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    await expect(pending).rejects.toBeInstanceOf(StudioBg3dCaptureEnvironmentError);
    ready.resolve(true); const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer);
    expect(() => receipt.assertCurrent()).not.toThrow(); owner.dispose();
  });

  it("완료한 acquire는 timer와 abort listener를 남기지 않는다", async () => {
    const scene = {}, renderer = {}, controller = new AbortController(), remove = vi.spyOn(controller.signal, "removeEventListener");
    const owner = publish(scene, renderer), receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, { signal: controller.signal });
    expect(remove).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    controller.abort(); expect(() => receipt.assertCurrent()).not.toThrow(); owner.dispose();
  });

  it("이미 취소된 요청과 유효하지 않은 시간 설정은 대기를 만들지 않는다", async () => {
    const scene = {}, renderer = {}, controller = new AbortController(), applied = vi.fn(() => true), owner = publish(scene, renderer, "A", applied);
    controller.abort(); await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "aborted", name: "AbortError" });
    for (const timeoutMs of [-1, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
      await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer, { timeoutMs })).rejects.toMatchObject({ code: "invalid-options" });
    }
    expect(applied).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0); owner.dispose();
  });

  it("scene와 renderer identity는 각각 독립이며 다른 owner의 dispose에 영향받지 않는다", async () => {
    const sceneA = {}, sceneB = {}, rendererA = {}, rendererB = {};
    const a = publish(sceneA, rendererA, "same"), b = publish(sceneA, rendererB, "same"), c = publish(sceneB, rendererA, "same");
    const receiptA = await acquireStudioBg3dCaptureEnvironmentReceipt(sceneA, rendererA);
    const receiptB = await acquireStudioBg3dCaptureEnvironmentReceipt(sceneA, rendererB);
    const receiptC = await acquireStudioBg3dCaptureEnvironmentReceipt(sceneB, rendererA);
    a.dispose(); expect(() => receiptA.assertCurrent()).toThrow(expect.objectContaining({ code: "disposed" }));
    expect(() => receiptB.assertCurrent()).not.toThrow(); expect(() => receiptC.assertCurrent()).not.toThrow(); b.dispose(); c.dispose();
  });

  it("실제 적용 확인 중 발생한 publish 재진입과 적용 함수 실패를 성공으로 숨기지 않는다", async () => {
    const scene = {}, renderer = {}; let replace = false; let replacement: { dispose(): void } | undefined;
    const first = publish(scene, renderer, "first", () => { if (replace) replacement = publish(scene, renderer, "next"); return true; });
    const receipt = await acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer); replace = true;
    expect(() => receipt.assertCurrent()).toThrow(expect.objectContaining({ code: "superseded" })); first.dispose(); replacement?.dispose();
    const failed = publish(scene, renderer, "throw", () => { throw Error("actual 적용 확인 실패"); });
    await expect(acquireStudioBg3dCaptureEnvironmentReceipt(scene, renderer)).rejects.toMatchObject({ code: "failed" }); failed.dispose();
  });
});
