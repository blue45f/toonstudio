import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS, STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS } from "../studio-page-shell-runtime";

import { StudioGpuPinReceiptWatchdog } from "./studio-webgpu-pin-receipt-watchdog";

import type { DrawEl } from "../studio-element-model";

const host = ts.createSourceFile("Host.tsx", readFileSync(
  new URL("../StudioCuttoonEditorHost.tsx", import.meta.url), "utf8",
), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const appendDeclarations: ts.FunctionDeclaration[] = [];
function findHostAppend(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "appendGpuLiveSourceJournalSuffix") appendDeclarations.push(node);
  else ts.forEachChild(node, findHostAppend);
}
findHostAppend(host);
if (appendDeclarations.length !== 1) throw new Error("실제 Host GPU append 함수가 하나여야 합니다.");
const hostAppendExecutable = ts.transpileModule(appendDeclarations[0]!.getText(host), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

function hostJournalAppend(watchdog: StudioGpuPinReceiptWatchdog) {
  let requestSequence = 1;
  const journal = { identity: { epoch: 1, variations: [] } };
  const failSelectedGpuLiveInk = vi.fn();
  const armGpuPinnedRequestWatchdog = vi.fn((requestId: string, timeoutMs?: number) => watchdog.request(requestId, timeoutMs));
  // 기하 계산과 GPU 제출은 대역으로 두되, 예산을 연결하는 Host 함수와 시한 관리는 실제 코드를 실행한다.
  const append = runInNewContext(`${hostAppendExecutable}\nappendGpuLiveSourceJournalSuffix`, {
    gpuLiveSourceJournalRef: { current: journal },
    webGpuCanvasHandleRef: { current: {
      appendPinnedJournalSuffixBatch: () => ({ status: "accepted", requestId: `frame:${++requestSequence}` }),
    } },
    gpuLiveSourceJournalFirstStrokeIndexRef: { current: 0 },
    gpuLiveSourceJournalIdentityFor: () => journal.identity,
    advanceStudioGpuLiveSourceJournal: () => ({
      status: "advanced", state: journal,
      suffixes: [{ previousRenderedPointCount: 2, points: [2, 2], pressures: [0.5] }],
    }),
    prepareLiveStrokeGpuSubmission: () => true,
    registerLiveStrokeGpuRequest: () => true,
    gpuLiveAcceptedRequestIdRef: { current: null },
    armGpuPinnedRequestWatchdog,
    STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS,
    applyLiveStrokeBackendPresentationEffects: vi.fn(),
    failSelectedGpuLiveInk,
  }) as (element: DrawEl, sealEndpoint?: boolean) => "advanced" | "retained" | "rejected";
  return { append, armGpuPinnedRequestWatchdog, failSelectedGpuLiveInk };
}

const liveStroke: DrawEl = { id: "stroke:1", type: "draw", points: [0, 0, 2, 2], stroke: "#000000", strokeWidth: 4 };

afterEach(() => {
  vi.useRealTimers();
});

describe("StudioGpuPinReceiptWatchdog", () => {
  it("keeps an absolute first-visible deadline during a 60 Hz append burst", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    for (let frame = 2; frame <= 19; frame += 1) {
      vi.advanceTimersByTime(16);
      watchdog.request(`frame:${frame}`);
    }
    vi.advanceTimersByTime(12);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("first-visible", "frame:19");
  });

  it("does not let later requests extend the first post-visible progress deadline", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);
    watchdog.request("frame:2");
    vi.advanceTimersByTime(200);
    watchdog.request("frame:3");
    vi.advanceTimersByTime(100);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("progress", "frame:3");
  });

  it("clears a deadline only for the exact current receipt", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    watchdog.request("frame:2");
    expect(watchdog.hasExactReceipt("frame:2")).toBe(false);
    expect(watchdog.receipt("frame:1")).toBe(false);
    vi.advanceTimersByTime(299);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(watchdog.receipt("frame:2")).toBe(true);
    expect(watchdog.hasExactReceipt("frame:2")).toBe(true);
    vi.advanceTimersByTime(1);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("accepts a synchronous receipt recorded just before the request is armed", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    expect(watchdog.receipt("frame:1")).toBe(false);
    watchdog.begin("frame:1");
    vi.advanceTimersByTime(300);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("lets one request carry its own budget without moving the live deadline", () => {
    // 완성된 획의 최종 영수증은 라이브 지연 예산으로 재면 안 된다 — 지연 커밋 렌더가 한 프레임
    // 예산을 넘기는 순간 제품이 그 획을 지웠다("현재 획을 취소했습니다").
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);
    watchdog.request("terminal:1", 2_000);
    vi.advanceTimersByTime(1_500);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);

    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("progress", "terminal:1");
  });

  it("applies a terminal budget that arrives while a pointer-frame deadline is outstanding", () => {
    // 실제 순서는 항상 이렇다: 포인터 프레임이 300 ms 시한을 걸어둔 채로 포인터업의 최종
    // 요청이 도착한다. 그 시한을 그대로 물려받으면 2000 ms 예산은 한 번도 적용되지 않고
    // 완성된 획이 취소된다.
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);
    watchdog.request("frame:2");
    vi.advanceTimersByTime(120);
    watchdog.request("terminal:1", 2_000);
    vi.advanceTimersByTime(500);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_600);
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(onTimeout).toHaveBeenCalledWith("progress", "terminal:1");
  });

  it("keeps the live budget for a pointer frame that passes no override", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: 300, onTimeout });

    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);
    watchdog.request("frame:2");
    vi.advanceTimersByTime(301);

    expect(onTimeout).toHaveBeenCalledWith("progress", "frame:2");
  });

  it("실제 Host의 연속 일반 append는 첫 receipt 이후 300 ms progress 시한을 미루지 않는다", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS, onTimeout });
    const { append, armGpuPinnedRequestWatchdog, failSelectedGpuLiveInk } = hostJournalAppend(watchdog);
    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);

    expect(append(liveStroke)).toBe("advanced");
    vi.advanceTimersByTime(100);
    expect(append(liveStroke)).toBe("advanced");
    vi.advanceTimersByTime(100);
    expect(append(liveStroke)).toBe("advanced");
    vi.advanceTimersByTime(99);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onTimeout).toHaveBeenCalledExactlyOnceWith("progress", "frame:4");
    expect(armGpuPinnedRequestWatchdog.mock.calls).toEqual([
      ["frame:2", undefined], ["frame:3", undefined], ["frame:4", undefined],
    ]);
    expect(failSelectedGpuLiveInk).not.toHaveBeenCalled();
  });

  it("실제 Host의 seal append만 대기 중인 live 시한을 2000 ms terminal 예산으로 바꾼다", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new StudioGpuPinReceiptWatchdog({ timeoutMs: STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS, onTimeout });
    const { append, armGpuPinnedRequestWatchdog, failSelectedGpuLiveInk } = hostJournalAppend(watchdog);
    watchdog.begin("frame:1");
    expect(watchdog.receipt("frame:1")).toBe(true);

    expect(append(liveStroke)).toBe("advanced");
    vi.advanceTimersByTime(120);
    expect(append(liveStroke, true)).toBe("advanced");
    vi.advanceTimersByTime(1_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onTimeout).toHaveBeenCalledExactlyOnceWith("progress", "frame:3");
    expect(armGpuPinnedRequestWatchdog.mock.calls).toEqual([
      ["frame:2", undefined], ["frame:3", STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS],
    ]);
    expect(failSelectedGpuLiveInk).not.toHaveBeenCalled();
  });
});
