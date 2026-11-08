import assert from "node:assert/strict";
import { test } from "vitest";
import { runInNewContext } from "node:vm";

import { observeStudioQa } from "./studio-qa-browser-observer.mjs";
import { closeStudioGroupQaContext, collectStudioQaDiagnostics, createStudioGroupQaContext,
  installStudioQaDiagnostics } from "./studio-qa-diagnostics.mjs";

function fixture(kind) {
  const listeners = new Map();
  const timers = new Map();
  const observers = [];
  let nextTimer = 1;
  class Element { closest() { return this.status ? this : null; } }
  class Canvas extends Element {
    width = 320; height = 200;
    getBoundingClientRect() { return { width: 160, height: 100, top: 30 }; }
  }
  class Input extends Element { type = "file"; files = []; }
  const canvas = new Canvas();
  const setTimer = (callback) => { const id = nextTimer++; timers.set(id, callback); return id; };
  const scope = {
    Element, HTMLCanvasElement: Canvas, HTMLInputElement: Input,
    performance: { now: () => 42 },
    setInterval: setTimer, setTimeout: setTimer,
    clearInterval: (id) => timers.delete(id), clearTimeout: (id) => timers.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    document: {
      querySelector: (selector) => selector.includes("canvas") ? canvas : null,
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name) => listeners.delete(name),
    },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe() { this.active = true; }
      disconnect() { this.active = false; }
    },
  };
  scope.window = scope;
  scope.top = scope;
  runInNewContext(`(${observeStudioQa.toString()})(${JSON.stringify(kind)})`, scope);
  return { scope, canvas, Input, Element, listeners, timers, observers,
    finish: () => JSON.parse(JSON.stringify(scope.__studioQaDiagnostics.finish())) };
}

test("레이아웃은 중복을 제거하고 정확히 200개에서 observer와 timer를 정리한다", () => {
  const f = fixture("layout");
  const tick = [...f.timers.values()][0];
  tick(); tick();
  for (let i = 1; i < 300; i++) { f.canvas.width = i; tick(); }
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.observers[0].active, false);
  const report = f.finish();
  assert.equal(report.samples.length, 200);
  assert.equal(report.capped, true);
  assert.equal(report.samples[0].cssWidth, 160);
  assert.equal(f.scope.__studioQaDiagnostics, undefined);
});

test("상태는 문자열 대신 변경 횟수만 기록하고 종료 시 모두 정리한다", () => {
  const f = fixture("layout");
  const element = new f.Element(); element.status = true; element.textContent = "private-status";
  f.observers[0].callback([{ target: element }]);
  const report = f.finish();
  assert.equal(report.samples.at(-1).statusChanges, 1);
  assert.ok(!JSON.stringify(report).includes("private-status"));
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});

test("파일 입력은 64개·파일16개 상한과 고정 MIME 분류만 남긴다", () => {
  const f = fixture("inputs");
  const input = new f.Input();
  input.accept = "private-accept";
  input.files = Array.from({ length: 30 }, () => ({ name: "private-name", type: "private-type", size: 5 }));
  const change = f.listeners.get("change");
  change({ target: input }); change({ target: input });
  for (let i = 0; i < 100; i++) { input.files[0].size = i; change({ target: input }); }
  const report = f.finish();
  assert.equal(report.samples.length, 64);
  assert.equal(report.samples[0].count, 30);
  assert.equal(report.samples[0].files.length, 16);
  assert.equal(report.samples[0].files[0].type, "other");
  assert.ok(!JSON.stringify(report).includes("private-"));
  assert.equal(f.listeners.size, 0);
  assert.equal(f.timers.size, 0);
});

test("pagehide와 최대 수집 시간이 리소스를 정리한다", () => {
  for (const kind of ["layout", "inputs"]) {
    const hidden = fixture(kind); hidden.listeners.get("pagehide")();
    assert.equal(hidden.timers.size, 0);
    assert.equal(hidden.listeners.size, 0);
    const expired = fixture(kind); [...expired.timers.values()].at(-1)();
    assert.equal(expired.timers.size, 0);
    assert.equal(expired.listeners.size, 0);
  }
});

test("기본값은 init/evaluate/파일 저장 없이 기존 context 설정을 유지한다", async () => {
  delete process.env.TOONSTUDIO_QA_DIAGNOSTICS;
  let options;
  let closed = false;
  const context = { addInitScript() { throw new Error("호출 금지"); },
    pages() { throw new Error("호출 금지"); }, async close() { closed = true; } };
  const browser = { async newContext(value) { options = value; return context; } };
  assert.equal(await createStudioGroupQaContext(browser, "ko-KR"), context);
  assert.deepEqual(options, { viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2, locale: "ko-KR" });
  await closeStudioGroupQaContext(context, "/존재하지않는경로/진단.json");
  assert.equal(closed, true);
});

test("주입/수집/저장 실패는 비밀 오류를 기록하지 않고 원래 실패를 보존한다", async () => {
  process.env.TOONSTUDIO_QA_DIAGNOSTICS = "1";
  const brokenInit = { async addInitScript() { throw new Error("private-init"); } };
  await installStudioQaDiagnostics(brokenInit, "inputs");
  assert.deepEqual(await collectStudioQaDiagnostics(brokenInit), { status: "unavailable" });
  let closed = false;
  const context = { async addInitScript() {}, pages: () => [{ async evaluate() { throw new Error("private-page"); } }],
    async close() { closed = true; } };
  const original = new Error("원래 검증 실패");
  await installStudioQaDiagnostics(context, "inputs");
  await assert.rejects(async () => {
    try { throw original; }
    finally { await closeStudioGroupQaContext(context, "/존재하지않는경로/진단.json"); }
  }, (error) => error === original);
  assert.equal(closed, true);
});

test("닫힌 페이지와 멈춘 renderer의 수집을 제한한다", async () => {
  process.env.TOONSTUDIO_QA_DIAGNOSTICS = "1";
  let calls = 0;
  const context = { async addInitScript() {}, pages: () => Array.from({ length: 8 }, () => ({
    evaluate() { calls++; return new Promise(() => {}); },
  })) };
  await installStudioQaDiagnostics(context, "inputs");
  const report = await collectStudioQaDiagnostics(context);
  assert.equal(calls, 4);
  assert.deepEqual(report, Array.from({ length: 4 }, () => ({ status: "timeout" })));
  assert.equal(await collectStudioQaDiagnostics(context), undefined);
});
