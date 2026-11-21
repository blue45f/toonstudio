import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { isExpectedLocalPreviewRuntimeNoise } from "./lib/studio-five-hour-soak-runtime-noise.mjs";

const source = readFileSync(new URL("./verify-studio-five-hour-soak.mts", import.meta.url), "utf8");
const ast = ts.createSourceFile("soak.mts", source, ts.ScriptTarget.ESNext, true);
function harnessFunction(name: string, globals: Record<string, unknown>) {
  const node = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error("실제 하네스 함수 없음: " + name);
  const compiled = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(compiled + "\n" + name, globals) as (...args: unknown[]) => unknown;
}

function harnessCheckpoint(globals: Record<string, unknown>) {
  let statements = "";
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node)) {
      const index = node.statements.findIndex((statement) => ts.isVariableStatement(statement)
        && statement.declarationList.declarations.some((declaration) => declaration.name.getText(ast) === "checkpointAtMs"));
      if (index >= 0) statements = node.statements.slice(index, index + 2).map((statement) => statement.getText(ast)).join("\n");
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!statements) throw new Error("실제 checkpoint 경계 없음");
  const compiled = ts.transpileModule(`async function checkpoint() { ${statements} }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(compiled + "\ncheckpoint", globals) as () => Promise<void>;
}

describe("종료 직전의 실제 runtime drain과 PNG 저장 경계", () => {
  it("마지막 rest·history 동작에서 도착한 오류도 실제 최종 callback으로 보존한다", () => {
    const late = [{ channel: "pageerror", step: "final-history", text: "late exception" }];
    const report = { cycles: 10, environmentNoise: [], runtimeErrors: [], failures: [] };
    const collectionFailed = vi.fn();
    const drain = harnessFunction("recordRuntimeErrors", {
      runtimeCollector: { drain: () => late.splice(0) }, preview: { origin: "http://127.0.0.1:4173", child: {} },
      report, collectionFailed, nowMs: () => 300_001, startedAt: 0, isExpectedLocalPreviewRuntimeNoise,
    });
    drain(); drain();
    expect(report.runtimeErrors).toEqual([{ channel: "pageerror", step: "final-history", text: "late exception" }]);
    expect(report.failures).toEqual([{ atMs: 300_001, cycle: 10, kind: "runtime-pageerror", detail: "final-history: late exception" }]);
    expect(collectionFailed).not.toHaveBeenCalled();
    const finalCapture = source.lastIndexOf('await recordScreenshot("final", MINUTES * 60_000)');
    const finalDrain = source.lastIndexOf("recordRuntimeErrors();");
    expect(finalDrain).toBeGreaterThan(finalCapture);
    expect(finalDrain).toBeLessThan(source.indexOf("finalized = true;", finalCapture));
  });

  it("오류 수집기 소실과 drain 실패는 빈 성공으로 바꾸지 않는다", () => {
    const collectionFailed = vi.fn();
    const globals = { preview: { origin: "http://127.0.0.1:4173", child: {} }, collectionFailed };
    harnessFunction("recordRuntimeErrors", { ...globals, runtimeCollector: null })();
    harnessFunction("recordRuntimeErrors", { ...globals, runtimeCollector: { drain: () => { throw new Error("lost"); } } })();
    expect(collectionFailed.mock.calls.map(([kind]) => kind)).toEqual(["runtime-errors", "runtime-errors"]);
  });

  it("저장된 PNG 바이트의 SHA와 실제 시간·정해진 파일명을 기록한다", async () => {
    const bytes = Buffer.from("captured PNG bytes");
    const report = { screenshotEvidence: [] };
    const page = { screenshot: vi.fn(async () => bytes) };
    const collectionFailed = vi.fn();
    const capture = harnessFunction("recordScreenshot", {
      page, report, sessionStartedAt: 1_000, nowMs: () => 600_010, OUT: "/soak", join, createHash, collectionFailed,
    });
    await capture("periodic", 600_000);
    expect(page.screenshot).toHaveBeenCalledExactlyOnceWith({ path: "/soak/checkpoint-10m.png" });
    expect(report.screenshotEvidence).toEqual([{ phase: "periodic", scheduledAtMs: 600_000,
      sessionAtMs: 600_010, file: "checkpoint-10m.png", sha256: createHash("sha256").update(bytes).digest("hex") }]);
    expect(collectionFailed).not.toHaveBeenCalled();
  });

  it.each(["periodic", "final"] as const)("%s PNG 실패는 증거를 만들지 않고 수집 실패에 기록한다", async (phase) => {
    const report = { screenshotEvidence: [] }, collectionFailed = vi.fn();
    const capture = harnessFunction("recordScreenshot", {
      page: { screenshot: async () => { throw new Error("capture unavailable"); } }, report,
      sessionStartedAt: 1_000, OUT: "/soak", join, collectionFailed,
    });
    await capture(phase, 600_000);
    expect(report.screenshotEvidence).toEqual([]);
    expect(collectionFailed.mock.calls[0]?.[0]).toBe("screenshot-" + phase);
  });

  it.each([18_000_000 - 1, 18_000_000])("deadline 경계 %s의 실제 checkpoint는 한 시각만 기준으로 슬롯을 정한다", async (atMs) => {
    const recordScreenshot = vi.fn(async () => undefined);
    const nowMs = vi.fn().mockReturnValueOnce(atMs).mockReturnValue(18_000_000);
    await harnessCheckpoint({ nowMs, sessionStartedAt: 1_000, nextCheckpoint: 17_400_000,
      MINUTES: 300, CHECKPOINT_MS: 600_000, recordHeapCheckpoint: async () => null, recordScreenshot,
      writeReport: () => undefined, log: () => undefined, startedAt: 0, cycle: 10, report: { failures: [] },
    })();
    expect(recordScreenshot.mock.calls).toEqual(atMs < 18_000_000 ? [["periodic", 17_400_000]] : []);
  });

  it("deadline 뒤 정상 획은 final 슬롯만 남기며 periodic 종료 슬롯을 중복하지 않는다", () => {
    expect(source).toContain("checkpointAtMs >= nextCheckpoint && checkpointAtMs < MINUTES * 60_000");
    expect(source).toContain("if (cycleStarted >= deadline) terminalLatencyCycleAttempted = true");
    expect(source).toContain("shouldRunStudioSoakCycle(Date.now(), deadline, MEASURE_POINTER_LATENCY, terminalLatencyCycleAttempted)");
  });
});

describe("기존 획에만 지연 관측을 붙이는 실제 draw callback", () => {
  it.each([false, true])("옵션 %s에서도 같은 드라이버를 1회 호출하고 같은 29점을 전달한다", async (enabled) => {
    const points = Array.from({ length: 29 }, (_, index) => ({ x: index, y: index }));
    const pointer = { mode: "pen", points: 29 };
    const dispatchStudioPointerStroke = vi.fn(async () => pointer);
    const armStudioSoakPointerLatency = vi.fn(async () => undefined);
    const pointerLatency = { events: [] };
    const drainStudioSoakPointerLatency = vi.fn(async () => pointerLatency);
    const markStudioSoakStroke = vi.fn(async () => undefined);
    const page = { waitForTimeout: vi.fn(async () => undefined), screenshot: async () => Buffer.from("pixels"),
      locator: () => ({ count: async () => 0 }) };
    const diagnostics = { totalAppends: 1, rejectedStrokeCount: 0, evictedSteps: 0, retainedBytes: 10, lastEntryBytes: 10 };
    const draw = harnessFunction("drawEvidenceStroke", {
      closeBrushSurfaces: async () => true, readStudioAvailableLayerCount: async () => 1,
      readStudioHistoryDepth: async () => ({ entryCount: 1, undoDepth: 1 }), readStudioHistoryDiagnostics: async () => diagnostics,
      prepareStudioSoakPointerRoute: async () => ({ box: { x: 0, y: 0, width: 120, height: 120 }, points }),
      assertStudioSoakPointerRoute: async () => undefined,
      dispatchStudioPointerStroke, armStudioSoakPointerLatency, drainStudioSoakPointerLatency,
      studioSoakPointerLatencyIssues: () => [], markStudioSoakStroke, MEASURE_POINTER_LATENCY: enabled,
      CPU_DIAGNOSTIC: false, cpuDiagnostic: null,
      report: { sessionId: "same-session" }, collectionFailed: vi.fn(),
      waitForStudioDocumentAdvance: async () => ({ accepted: true, layerCountAfter: 2, historyEntryCount: 2, historyUndoDepth: 2 }),
      readStudioVisibleCommitError: async () => null, SAMPLE_HEAP_PER_STROKE: false, changedPixels: () => 120,
    });
    const result = await draw(page, null, 7, "pen");
    expect(dispatchStudioPointerStroke).toHaveBeenCalledExactlyOnceWith({ page, cdp: null, mode: "pen", points, stepDelayMs: 2 });
    expect(page.waitForTimeout.mock.calls).toEqual([[80], [500]]);
    expect(markStudioSoakStroke.mock.calls).toEqual([[page, true], [page, false]]);
    expect(result).toMatchObject({ pointer, acceptedByDocument: true, pointerLatency: enabled ? pointerLatency : null });
    expect(armStudioSoakPointerLatency).toHaveBeenCalledTimes(enabled ? 1 : 0);
    expect(drainStudioSoakPointerLatency).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) expect(armStudioSoakPointerLatency).toHaveBeenCalledWith(page, {
      sessionId: "same-session", cycle: 7, inputMode: "pen", expectedMoves: 28,
    });
  });

  it.each(["dispatch", "latency-drain", "trace-complete"])("%s 실패에도 첫 입력 trace 종료 순서와 원래 오류를 보존한다", async (failure) => {
    const calls: string[] = [], collectionFailed = vi.fn();
    const dispatchError = new Error("dispatch failed"), cleanupError = new Error("trace cleanup failed");
    const completeStroke = vi.fn(async () => { calls.push("trace-complete"); if (failure === "trace-complete") throw cleanupError; });
    const page = { waitForTimeout: async (ms: number) => { calls.push(`wait:${ms}`); }, screenshot: async () => Buffer.from("pixels"),
      locator: () => ({ count: async () => 0 }) };
    const draw = harnessFunction("drawEvidenceStroke", {
      closeBrushSurfaces: async () => true, readStudioAvailableLayerCount: async () => 1,
      readStudioHistoryDepth: async () => ({ entryCount: 1, undoDepth: 1 }), readStudioHistoryDiagnostics: async () => ({}),
      prepareStudioSoakPointerRoute: async () => ({ box: {}, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }),
      assertStudioSoakPointerRoute: async () => undefined, MEASURE_POINTER_LATENCY: true, CPU_DIAGNOSTIC: true,
      armStudioSoakPointerLatency: async () => { calls.push("latency-arm"); },
      cpuDiagnostic: { armStroke: async () => { calls.push("trace-arm"); }, completeStroke },
      markStudioSoakStroke: async (_page: unknown, active: boolean) => { calls.push(`stroke:${active}`); },
      dispatchStudioPointerStroke: async () => { calls.push("dispatch"); if (failure === "dispatch") throw dispatchError; return {}; },
      drainStudioSoakPointerLatency: async () => { calls.push("latency-drain"); if (failure === "latency-drain") throw new Error("drain failed"); return {}; },
      studioSoakPointerLatencyIssues: () => [], report: { sessionId: "same-session" }, collectionFailed,
      waitForStudioDocumentAdvance: async () => ({}), readStudioVisibleCommitError: async () => null,
      SAMPLE_HEAP_PER_STROKE: false, changedPixels: () => 1,
    });
    if (failure === "dispatch") await expect(draw(page, null, 1, "pen")).rejects.toBe(dispatchError);
    else await draw(page, null, 1, "pen");
    expect(calls).toEqual(["wait:80", "latency-arm", "trace-arm", "stroke:true", "dispatch",
      ...(failure === "dispatch" ? [] : ["wait:500"]), "stroke:false", "latency-drain", "trace-complete"]);
    expect(completeStroke).toHaveBeenCalledExactlyOnceWith(1);
    if (failure === "trace-complete") expect(collectionFailed).toHaveBeenCalledWith("diagnostic-cpu", cleanupError, 1);
    else if (failure === "latency-drain") expect(collectionFailed.mock.calls[0]?.[0]).toBe("pointer-latency");
    else expect(collectionFailed).not.toHaveBeenCalled();
  });
});
