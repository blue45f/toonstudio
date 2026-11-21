import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { studioAutosaveDocumentBusy, StudioAutosaveDocumentBusyError } from "../studio-autosave-opfs-error";
import {
  createStudioAutosaveMonotonicGate,
  createStudioAutosaveSupersededError,
  isStudioAutosaveSupersededFailure,
} from "../studio-cuttoon-editor/runtime/studio-autosave-monotonic-gate";

type FailurePath = "normal" | "lifecycle";
const hostSource = readFileSync(new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
const host = ts.createSourceFile("StudioCuttoonEditorHost.tsx", hostSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = new Map<FailurePath, string>();
const markers: Readonly<Record<FailurePath, string>> = {
  normal: 'console.error("Auto-save failed:", cause)',
  lifecycle: 'console.error("Pending stroke emergency autosave failed:", cause)',
};

// 실제 Host의 catch 본문을 분리 실행하고 저장·수명 의존성을 주입해 부작용을 관측한다.
function collectCallbacks(node: ts.Node): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "catch") {
    const callback = node.arguments[0];
    if (callback && ts.isArrowFunction(callback)) {
      const source = callback.getText(host);
      for (const path of ["normal", "lifecycle"] as const) {
        if (!source.includes(markers[path])) continue;
        if (callbacks.has(path)) throw new Error(`중복된 자동저장 실패 콜백: ${path}`);
        callbacks.set(path, ts.transpileModule(`(${source})`, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText);
      }
    }
  }
  ts.forEachChild(node, collectCallbacks);
}
collectCallbacks(host);

function fixture(path: FailurePath) {
  const gate = createStudioAutosaveMonotonicGate();
  const key = "document";
  const seq = gate.issueSnapshotSeq(key);
  const context = {
    canPublishSnapshot: vi.fn(() => true),
    initialWriteAllowed: vi.fn(() => true),
    autosaveMonotonicGateRef: { current: gate },
    autosaveKey: key,
    snapshotSeq: seq,
    isStudioAutosaveSupersededFailure,
    studioAutosaveDocumentBusy,
    busyRetry: { schedule: vi.fn() },
    autosaveDocumentLeaseRef: { current: { role: "leader" } },
    editorMountedRef: { current: true },
    setAutosaveRetryNonce: vi.fn(),
    reportStudioSaveAuthorityDegraded: vi.fn(),
    reportStudioAutosaveFailure: vi.fn(async () => undefined),
    saveSyncStore: { noteFailure: vi.fn(), noteDurableReceipt: vi.fn() },
    console: { error: vi.fn() },
  };
  const code = callbacks.get(path);
  if (!code) throw new Error(`자동저장 실패 콜백을 찾지 못했습니다: ${path}`);
  const callback: unknown = runInNewContext(code, context);
  if (typeof callback !== "function") throw new Error("자동저장 실패 콜백이 함수가 아닙니다.");
  return { gate, key, seq, context, run: (cause: unknown) => { callback(cause); } };
}

async function failedAuthorities(...causes: unknown[]): Promise<unknown> {
  return Promise.any(causes.map((cause) => Promise.reject(cause))).then(
    () => { throw new Error("실패한 저장 권위가 성공으로 처리됐습니다."); },
    (cause: unknown) => cause,
  );
}

describe("자동저장 대체와 실제 Host 실패 처리", () => {
  it.each(["normal", "lifecycle"] as const)("%s: 이전 스냅샷의 혼합 실패는 최신 편집의 저장 상태를 낮추지 않는다", async (path) => {
    const { gate, key, context, run } = fixture(path);
    const mixed = await failedAuthorities(
      createStudioAutosaveSupersededError(), new Error("SQLite unavailable"),
    );
    expect(isStudioAutosaveSupersededFailure(mixed)).toBe(false);
    gate.issueSnapshotSeq(key);
    run(mixed);
    expect(context.reportStudioAutosaveFailure).not.toHaveBeenCalled();
    expect(context.reportStudioSaveAuthorityDegraded).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteFailure).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteDurableReceipt).not.toHaveBeenCalled();
  });

  it.each(["normal", "lifecycle"] as const)("%s: 최신 스냅샷의 OPFS·SQLite 실제 실패는 그대로 알린다", async (path) => {
    const { context, run } = fixture(path);
    const cause = await failedAuthorities(new Error("OPFS full"), new Error("SQLite full"));
    run(cause);
    expect(context.reportStudioAutosaveFailure).toHaveBeenCalledWith(cause);
    expect(context.saveSyncStore.noteFailure).toHaveBeenCalledTimes(1);
    expect(context.saveSyncStore.noteDurableReceipt).not.toHaveBeenCalled();
    expect(context.console.error).toHaveBeenCalledTimes(1);
    expect(context.reportStudioSaveAuthorityDegraded).toHaveBeenCalledTimes(path === "lifecycle" ? 1 : 0);
  });

  it.each(["normal", "lifecycle"] as const)("%s: 최신 스냅샷의 혼합 실패를 모두 대체 오류로 숨기지 않는다", async (path) => {
    const { context, run } = fixture(path);
    const mixed = await failedAuthorities(
      createStudioAutosaveSupersededError(), new Error("SQLite unavailable"),
    );
    run(mixed);
    expect(context.reportStudioAutosaveFailure).toHaveBeenCalledWith(mixed);
    expect(context.saveSyncStore.noteFailure).toHaveBeenCalledTimes(1);
    expect(context.saveSyncStore.noteDurableReceipt).not.toHaveBeenCalled();
  });

  it("normal: 동일한 편집 세대여도 기록하지 않은 대체 스냅샷은 실패나 성공으로 보고하지 않는다", () => {
    const { context, run } = fixture("normal");
    run(createStudioAutosaveSupersededError());
    expect(context.reportStudioAutosaveFailure).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteFailure).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteDurableReceipt).not.toHaveBeenCalled();
  });

  it.each(["normal", "lifecycle"] as const)("%s: 현재 원고의 writer 경합은 기존 재시도 경로를 유지한다", (path) => {
    const { context, run } = fixture(path);
    run(new StudioAutosaveDocumentBusyError());
    expect(context.busyRetry.schedule).toHaveBeenCalledTimes(path === "normal" ? 1 : 0);
    expect(context.setAutosaveRetryNonce).toHaveBeenCalledTimes(path === "lifecycle" ? 1 : 0);
    expect(context.reportStudioAutosaveFailure).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteFailure).not.toHaveBeenCalled();
  });

  it("lifecycle: 종료된 원고의 늦은 실패를 새 원고 상태에 적용하지 않는다", async () => {
    const { context, run } = fixture("lifecycle");
    context.initialWriteAllowed.mockReturnValue(false);
    run(await failedAuthorities(new Error("OPFS closed"), new Error("SQLite closed")));
    expect(context.reportStudioSaveAuthorityDegraded).not.toHaveBeenCalled();
    expect(context.reportStudioAutosaveFailure).not.toHaveBeenCalled();
    expect(context.saveSyncStore.noteFailure).not.toHaveBeenCalled();
  });
});
