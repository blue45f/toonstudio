import { afterEach, describe, expect, it, vi } from "vitest";

import { invokeOnDevicePrompt, invokeOnDeviceTranslator } from "./browser-ondevice-ai-probe";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise; reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function invocationHarness(kind: "prompt" | "translator") {
  const session = {
    prompt: vi.fn(async () => "로컬 응답"),
    translate: vi.fn(async () => "번역 응답"),
    destroy: vi.fn(),
  };
  const creation = deferred<typeof session>();
  const create = vi.fn(() => creation.promise);
  const globalObject = { LanguageModel: { create }, Translator: { create } };
  const invoke = () => kind === "prompt"
    ? invokeOnDevicePrompt({ globalObject, prompt: "원고", invokeTimeoutMs: 10 })
    : invokeOnDeviceTranslator({ globalObject, text: "원고", sourceLanguage: "ko", targetLanguage: "en", invokeTimeoutMs: 10 });
  return { session, creation, invoke };
}

afterEach(() => { vi.useRealTimers(); });

describe.each(["prompt", "translator"] as const)("온디바이스 %s 세션의 제한 시간 정리", (kind) => {
  it("타임아웃 뒤 도착한 세션은 추론 없이 즉시 해제한다", async () => {
    vi.useFakeTimers();
    const { session, creation, invoke } = invocationHarness(kind);
    const pending = invoke();
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toEqual({ ok: false, reason: `ondevice_${kind}_timeout` });
    creation.resolve(session);
    await Promise.resolve();
    expect(session.prompt).not.toHaveBeenCalled();
    expect(session.translate).not.toHaveBeenCalled();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it("제한 시간 안에 완료된 정상 세션도 한 번만 해제한다", async () => {
    vi.useFakeTimers();
    const { session, creation, invoke } = invocationHarness(kind);
    const pending = invoke();
    creation.resolve(session);
    expect(await pending).toMatchObject({ ok: true, content: kind === "prompt" ? "로컬 응답" : "번역 응답" });
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("진행 중 추론이 타임아웃된 뒤 완료돼도 세션을 중복 해제하지 않는다", async () => {
    vi.useFakeTimers();
    const { session, creation, invoke } = invocationHarness(kind);
    const inference = deferred<string>();
    session.prompt.mockImplementation(() => inference.promise);
    session.translate.mockImplementation(() => inference.promise);
    const pending = invoke();
    creation.resolve(session);
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toEqual({ ok: false, reason: `ondevice_${kind}_timeout` });
    expect(session.destroy).toHaveBeenCalledTimes(1);
    inference.resolve("늦은 응답");
    await Promise.resolve();
    expect(session.destroy).toHaveBeenCalledTimes(1);
  });

  it("타임아웃 뒤 세션 생성이 실패해도 반환한 타임아웃 결과를 유지한다", async () => {
    vi.useFakeTimers();
    const { session, creation, invoke } = invocationHarness(kind);
    const pending = invoke();
    await vi.advanceTimersByTimeAsync(10);
    expect(await pending).toEqual({ ok: false, reason: `ondevice_${kind}_timeout` });
    creation.reject(new Error("늦은 생성 실패"));
    await Promise.resolve();
    expect(session.destroy).not.toHaveBeenCalled();
  });
});
