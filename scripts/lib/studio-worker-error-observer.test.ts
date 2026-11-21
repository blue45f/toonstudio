import { EventEmitter } from "node:events";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

import { collectStudioInAppRuntimeErrors } from "./studio-inapp-sweep-harness.mjs";
import { installStudioWorkerErrorObserver, STUDIO_WORKER_ERROR_OBSERVER_SCRIPT } from "./studio-worker-error-observer";

import type { Page } from "playwright";

class NativeWorker extends EventTarget {
  static readonly marker = Object.freeze({ native: true });
  static readonly constructionFailure = new Error("native construction failed");
  readonly sent: unknown[][] = [];
  terminated = false;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: Event) => void) | null = null;
  constructor(readonly script: unknown, readonly options?: unknown) {
    super();
    if (script === "reject-construction") throw NativeWorker.constructionFailure;
  }
  postMessage(...args: unknown[]): void { this.sent.push(args); }
  terminate(): void { this.terminated = true; }
  override dispatchEvent(event: Event): boolean {
    const result = super.dispatchEvent(event);
    if (event.type === "error") this.onerror?.(event);
    if (event.type === "message") this.onmessage?.(event);
    return result;
  }
}

function browserFixture(worker: typeof NativeWorker | null = NativeWorker, readOnly = false) {
  const reports: Array<{ text: string; stack: string | null }> = [];
  const context = createContext({ __studioSweepWorkerFailure: (text: string, stack: string | null) => {
    reports.push({ text, stack });
  } });
  Object.defineProperty(context, "Worker", { value: worker ?? undefined, writable: !readOnly, configurable: true });
  runInContext(STUDIO_WORKER_ERROR_OBSERVER_SCRIPT, context);
  return { context, reports, observed: runInContext("Worker", context) as typeof NativeWorker };
}

class BrowserWorker extends EventEmitter {
  url(): string { return "https://studio.test/worker.js"; }
}

class ObserverPage extends EventEmitter {
  readonly bindings = new Map<string, unknown>();
  readonly scripts: unknown[] = [];
  readonly currentWorkers: BrowserWorker[] = [];
  async exposeFunction(name: string, callback: unknown): Promise<void> { this.bindings.set(name, callback); }
  async addInitScript(script: unknown): Promise<void> { this.scripts.push(script); }
  workers(): BrowserWorker[] { return this.currentWorkers; }
}

describe("실제 Worker 생성과 메시지를 유지하는 오류 관측", () => {
  it("동일한 URL·옵션·prototype·정적 속성을 보존하며 메시지와 transfer 인자를 그대로 전달한다", () => {
    const { observed, reports } = browserFixture();
    const script = { toString: vi.fn(() => "worker.js") };
    const options = Object.freeze({ type: "module", name: "brush" });
    const worker = new observed(script, options);
    expect(worker).toBeInstanceOf(NativeWorker);
    expect(Object.getPrototypeOf(worker)).toBe(NativeWorker.prototype);
    expect(observed.prototype).toBe(NativeWorker.prototype);
    expect(observed.marker).toBe(NativeWorker.marker);
    expect(worker.script).toBe(script);
    expect(worker.options).toBe(options);
    expect(script.toString).not.toHaveBeenCalled();
    const message = { operation: "paint" }, transfers = [new ArrayBuffer(8)];
    expect(worker.postMessage).toBe(NativeWorker.prototype.postMessage);
    worker.postMessage(message, transfers);
    expect(worker.sent[0]![0]).toBe(message);
    expect(worker.sent[0]![1]).toBe(transfers);
    const received = vi.fn();
    worker.onmessage = received;
    const event = new Event("message");
    worker.dispatchEvent(event);
    expect(received).toHaveBeenCalledWith(event);
    worker.terminate();
    expect(worker.terminated).toBe(true);
    expect(reports).toEqual([]);
  });

  it("하위 클래스 newTarget과 생성자 예외 및 new 없는 호출의 원래 동작을 보존한다", () => {
    const { context, observed, reports } = browserFixture();
    const Child = runInContext("class Child extends Worker { child = true; }; Child", context) as typeof NativeWorker;
    const worker = new Child("worker.js");
    expect(worker).toBeInstanceOf(Child);
    expect(worker).toBeInstanceOf(NativeWorker);
    expect(Object.getPrototypeOf(worker)).toBe(Child.prototype);
    expect(() => new observed("reject-construction")).toThrow(NativeWorker.constructionFailure);
    expect(() => Reflect.apply(observed, undefined, [])).toThrow(TypeError);
    expect(reports).toEqual([]);
  });

  it("error를 기록하면서 제품 onerror·추가 listener·기본 동작을 보존한다", () => {
    const { observed, reports } = browserFixture();
    const worker = new observed("worker.js");
    const onerror = vi.fn(), listener = vi.fn();
    worker.onerror = onerror;
    worker.addEventListener("error", listener);
    const error = new Error("renderer stopped");
    const event = Object.assign(new Event("error", { cancelable: true }), {
      message: error.message, error, filename: "/worker.js", lineno: 7, colno: 3,
    });
    expect(worker.dispatchEvent(event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(worker.onerror).toBe(onerror);
    expect(onerror).toHaveBeenCalledWith(event);
    expect(listener).toHaveBeenCalledWith(event);
    expect(reports).toEqual([{ text: "Worker error: renderer stopped @ /worker.js:7:3", stack: error.stack }]);
  });

  it("messageerror는 payload를 읽거나 이벤트를 취소하지 않고 오류로 기록한다", () => {
    const { observed, reports } = browserFixture();
    const worker = new observed("worker.js");
    const event = new Event("messageerror", { cancelable: true });
    Object.defineProperty(event, "data", { get: () => { throw new Error("payload must stay private"); } });
    const listener = vi.fn();
    worker.addEventListener("messageerror", listener);
    expect(worker.dispatchEvent(event)).toBe(true);
    expect(listener).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(false);
    expect(reports[0]).toMatchObject({ text: expect.stringContaining("Worker messageerror:"), stack: null });
  });

  it("관측 listener 등록 실패를 기록하고 원래 생성된 Worker를 반환한다", () => {
    class RegistrationFails extends NativeWorker {
      override addEventListener(): void { throw new Error("listener registration denied"); }
    }
    const { observed, reports } = browserFixture(RegistrationFails);
    const worker = new observed("worker.js");
    expect(worker).toBeInstanceOf(RegistrationFails);
    worker.postMessage("still working");
    expect(worker.sent).toEqual([["still working"]]);
    expect(reports[0]?.text).toContain("Worker 오류 관측 등록 실패: listener registration denied");
  });

  it.each(["missing", "read-only"] as const)("%s Worker의 초기 등록 실패를 숨기지 않는다", (mode) => {
    const { observed, reports } = browserFixture(mode === "missing" ? null : NativeWorker, mode === "read-only");
    expect(observed).toBe(mode === "missing" ? undefined : NativeWorker);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.text).toContain("Worker 오류 관측 등록 실패:");
  });
});

describe("Playwright Worker 콘솔과 실제 공통 collector 배선", () => {
  it("기존·새 Worker 오류를 workererror 단계로 연결하며 warn·log·종료는 실패로 세지 않는다", async () => {
    const page = new ObserverPage();
    const existing = new BrowserWorker();
    page.currentWorkers.push(existing);
    const collector = await collectStudioInAppRuntimeErrors(page as unknown as Page);
    collector.setStep("cycle-7");
    page.emit("worker", existing);
    const next = new BrowserWorker();
    page.emit("worker", next);
    const message = (type: string, text: string) => ({
      type: () => type, text: () => text, location: () => ({ url: "", lineNumber: 12 }),
    });
    existing.emit("console", message("warn", "not an error"));
    existing.emit("console", message("log", "ready"));
    existing.emit("close");
    expect(collector.drain()).toEqual([]);
    existing.emit("console", message("error", "/api/auth/session worker failure"));
    next.emit("console", message("error", "next worker failure"));
    expect(collector.drain()).toEqual([
      expect.objectContaining({ channel: "workererror", step: "cycle-7", text: expect.stringContaining("/api/auth/session worker failure") }),
      expect.objectContaining({ channel: "workererror", step: "cycle-7", text: expect.stringContaining("next worker failure") }),
    ]);
    expect(existing.listenerCount("console")).toBe(1);
    expect(page.scripts).toContain(STUDIO_WORKER_ERROR_OBSERVER_SCRIPT);
    const context = createContext({ Worker: NativeWorker,
      __studioSweepWorkerFailure: page.bindings.get("__studioSweepWorkerFailure") });
    runInContext(STUDIO_WORKER_ERROR_OBSERVER_SCRIPT, context);
    const worker = runInContext("new Worker('native-worker.js')", context) as NativeWorker;
    worker.dispatchEvent(new Event("messageerror"));
    expect(collector.drain()).toEqual([
      expect.objectContaining({ channel: "workererror", step: "cycle-7", text: expect.stringContaining("Worker messageerror:") }),
    ]);
  });

  it.each(["exposeFunction", "addInitScript"] as const)("%s 등록 실패를 호출자에게 전파한다", async (method) => {
    const page = new ObserverPage();
    vi.spyOn(page, method).mockRejectedValue(new Error("observer setup failed"));
    await expect(installStudioWorkerErrorObserver(page as unknown as Page, vi.fn()))
      .rejects.toThrow("observer setup failed");
  });

  it("Playwright console listener 등록 실패도 collector에 기록한다", async () => {
    const page = new ObserverPage();
    const report = vi.fn();
    const worker = new BrowserWorker();
    vi.spyOn(worker, "on").mockImplementation(() => { throw new Error("console observer denied"); });
    page.currentWorkers.push(worker);
    await installStudioWorkerErrorObserver(page as unknown as Page, report);
    expect(report).toHaveBeenCalledWith("Worker 콘솔 관측 등록 실패: console observer denied", expect.any(String));
  });
});
