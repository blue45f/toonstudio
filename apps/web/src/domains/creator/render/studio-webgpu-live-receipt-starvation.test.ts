import { readFileSync } from "node:fs";
import { Script } from "node:vm";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isStudioBrushAliasId } from "../brush/studio-brush-alias-profile";
import { STUDIO_GPU_LIVE_SOURCE_JOURNAL_STYLE_KEY } from "../studio-page-editor-types";
import {
  STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS,
  STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS,
} from "../studio-page-shell-runtime";

import { createStudioLiveStrokeGpuAppend } from "./studio-live-stroke-gpu-append";
import { createStudioLiveStrokeGpuAudit } from "./studio-live-stroke-gpu-audit";
import { StudioWebGpuEngine } from "./studio-webgpu-engine";
import { advanceStudioGpuLiveSourceJournal, createStudioGpuLiveSourceJournal } from "./studio-webgpu-live-source-journal";
import { planStudioGpuLiveStroke } from "./studio-webgpu-live-stroke-plan";
import { StudioGpuPinReceiptWatchdog } from "./studio-webgpu-pin-receipt-watchdog";

import type { StudioLiveStrokeGpuFailureReason, StudioLiveStrokeUnavailableReason } from "../live/studio-live-stroke-render-backend";
import type { DrawEl } from "../studio-element-model";
import type { StudioLiveStrokeBackendAuditSession } from "../studio-page-editor-types";
import type { StudioWebGpuCanvasHandle } from "../StudioWebGpuCanvas";
import type { StudioGpuFrameReceipt } from "./studio-webgpu-frame-contract";
import type { StudioGpuLiveSourceJournalIdentity, StudioGpuLiveSourceJournalState } from "./studio-webgpu-live-source-journal";
import type { StudioGpuPendingDrawAuthority } from "./studio-webgpu-pending-authority";
import type { StudioGpuPinReceiptTimeoutReason } from "./studio-webgpu-pin-receipt-watchdog";
import type { StudioGpuStroke } from "./studio-webgpu-stroke";

const INPUT_INTERVAL_MS = 16;
const FENCE_DELAY_MS = 40;

interface HostRuntime {
  append: (el: DrawEl, sealEndpoint?: boolean) => "advanced" | "retained" | "rejected";
  ready: (receipt: StudioGpuFrameReceipt) => void;
  flush: (strokeId: string, requestId: string) => void;
  identity: (el: DrawEl, epoch: number, variations: StudioGpuLiveSourceJournalIdentity["variations"]) => StudioGpuLiveSourceJournalIdentity;
  settle: (source: DrawEl, finished: DrawEl) => boolean;
  exactFinal: (strokeId: string) => boolean;
  persist: (strokeId: string, requestId: string) => void;
}

// 결정을 복제하지 않고 Host의 생성·입장·영수증·최종 저장 게이트 본문을 실행한다.
const hostPath = new URL("../StudioCuttoonEditorHost.tsx", import.meta.url);
const hostSource = ts.createSourceFile(hostPath.pathname, readFileSync(hostPath, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hostNames = new Set([
  "appendGpuLiveSourceJournalSuffix", "onWebGpuFrameReady", "gpuLiveSourceJournalIdentityFor",
  "hasExactSelectedGpuFinalReceipt", "persistAcceptedSelectedGpuFinalReceipt",
  "gpuLiveSourceJournalAppend", "settleGpuLiveStroke",
]);
const hostParts: string[] = [];
const collectHostPart = (node: ts.Node): void => {
  if (ts.isFunctionDeclaration(node) && node.name && hostNames.has(node.name.text)) {
    hostParts.push(node.getText(hostSource));
  } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && hostNames.has(node.name.text)) {
    hostParts.push(`const ${node.getText(hostSource)};`);
  } else ts.forEachChild(node, collectHostPart);
};
collectHostPart(hostSource);
if (hostParts.length !== hostNames.size) throw new Error("실제 Host GPU 경계 일부를 찾지 못했습니다.");
const hostScript = new Script(ts.transpileModule(`${hostParts.join("\n")}\n({
  append: appendGpuLiveSourceJournalSuffix, ready: onWebGpuFrameReady,
  flush: gpuLiveSourceJournalAppend.flushGpuLiveSourceJournalAfterReceipt,
  identity: gpuLiveSourceJournalIdentityFor, settle: settleGpuLiveStroke,
  exactFinal: hasExactSelectedGpuFinalReceipt, persist: persistAcceptedSelectedGpuFinalReceipt,
});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);

interface FenceObservation {
  readonly submittedAt: number;
  completedAt: number | null;
}

function fakeGpu() {
  const fences: FenceObservation[] = [];
  let outstanding = 0;
  let maximumOutstanding = 0;
  let fenceDelayMs = FENCE_DELAY_MS;
  let resolveLoss: (info: GPUDeviceLostInfo) => void = () => { throw new Error("장치 초기화 전 loss"); };
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => { resolveLoss = resolve; });
  const pass = {
    setPipeline: vi.fn(), setVertexBuffer: vi.fn(), setBindGroup: vi.fn(),
    draw: vi.fn(), end: vi.fn(),
  };
  const texture = { createView: vi.fn(() => ({})), destroy: vi.fn() };
  const encoder = {
    beginRenderPass: vi.fn(() => pass), copyTextureToTexture: vi.fn(),
    copyTextureToBuffer: vi.fn(), finish: vi.fn(() => ({})),
  };
  // 브라우저 GPU API만 대체한다. 실제 engine/coordinator/watchdog는 아래에서 그대로 실행한다.
  const device = {
    lost,
    limits: { maxTextureDimension2D: 4_096 },
    queue: {
      writeBuffer: vi.fn(), submit: vi.fn(),
      onSubmittedWorkDone: vi.fn(() => {
        const fence: FenceObservation = { submittedAt: Date.now(), completedAt: null };
        fences.push(fence);
        outstanding += 1;
        maximumOutstanding = Math.max(maximumOutstanding, outstanding);
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            fence.completedAt = Date.now();
            outstanding -= 1;
            resolve();
          }, fenceDelayMs);
        });
      }),
    },
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    createSampler: vi.fn(() => ({})), createBindGroup: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createTexture: vi.fn(() => texture), createCommandEncoder: vi.fn(() => encoder),
    destroy: vi.fn(),
  } as unknown as GPUDevice;
  const context = {
    configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: vi.fn(() => texture),
  } as unknown as GPUCanvasContext;
  const adapter = { requestDevice: vi.fn(async () => device) } as unknown as GPUAdapter;
  const gpu = {
    requestAdapter: vi.fn(async () => adapter),
    getPreferredCanvasFormat: vi.fn(() => "bgra8unorm"),
  } as unknown as GPU;
  const canvas = {
    width: 100, height: 80, style: {},
    getContext: vi.fn((kind: string) => kind === "webgpu" ? context : null),
  } as unknown as HTMLCanvasElement;
  const canvas2d = {
    width: 100, height: 80, style: {}, getContext: vi.fn(() => null),
  } as unknown as HTMLCanvasElement;
  return {
    gpu, canvas, canvas2d, fences, maximumOutstanding: () => maximumOutstanding,
    delayNextFences: (delayMs: number) => { fenceDelayMs = delayMs; },
    lose: () => resolveLoss({ reason: "unknown", message: "fixture device loss" }),
  };
}

interface AcceptedReceipt {
  readonly requestId: string;
  readonly strokeId: string;
  readonly at: number;
}

interface TimedFailure {
  readonly reason: StudioLiveStrokeUnavailableReason;
  readonly strokeId: string;
  readonly at: number;
}

interface WatchdogTimeout {
  readonly reason: StudioGpuPinReceiptTimeoutReason;
  readonly requestId: string;
  readonly at: number;
}

const cleanup: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) dispose();
  await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function liveFixture(receiptTiming: "fenced" | "synchronous" = "fenced") {
  const fake = fakeGpu();
  const sessions = new Map<string, StudioLiveStrokeBackendAuditSession>();
  const activeStroke: { current: string | null } = { current: null };
  const surfaceRequest: { current: string | null } = { current: null };
  const watchdogRef: { current: StudioGpuPinReceiptWatchdog | null } = { current: null };
  const journal: { current: StudioGpuLiveSourceJournalState | null } = { current: null };
  const latest: { current: DrawEl | null } = { current: null };
  const pinned = { current: false };
  const finalStroke: { current: DrawEl | null } = { current: null };
  const finalRequestIds = new Map<string, string>();
  const pendingStrokes: { current: StudioGpuStroke[] } = { current: [] };
  const pendingAuthorities: { current: StudioGpuPendingDrawAuthority[] } = { current: [] };
  const pendingCommits: { current: { pageId: string; strokes: DrawEl[] } | null } = { current: null };
  const failures: TimedFailure[] = [];
  const timeouts: WatchdogTimeout[] = [];
  const accepted: AcceptedReceipt[] = [];
  const rawReceipts: Array<{ receipt: StudioGpuFrameReceipt; at: number }> = [];
  const inputs: Array<{ at: number; pointCount: number }> = [];
  const uploads: Array<{ requestId: string; points: number[]; pressures: number[]; at: number }> = [];
  const engineRef: { current: StudioWebGpuEngine | null } = { current: null };
  const hostRef: { current: HostRuntime | null } = { current: null };
  const durableWrites = vi.fn();
  const autosave = vi.fn();
  const idleTasks: Array<() => void> = [];
  const flushPending = vi.fn(() => { pendingCommits.current = null; return true; });
  const idleState = {
    drawingRef: { current: null as DrawEl | null },
    editorMountedRef: { current: true }, documentSaveInFlightRef: { current: false },
    collaborationAccessRef: { current: { documentGeneration: 1, locked: false } },
    currentPageIdRef: { current: "page:fixture" },
    deferredStrokePostprocessControllersRef: { current: new Map<string, AbortController>() },
  };
  let sequence = 0;
  let uploadedPoints: number[] = [];
  let uploadedPressures: number[] = [];
  const nextRequest = () => `frame:${++sequence}`;
  const audit = createStudioLiveStrokeGpuAudit({
    gpuCanvasShadowVisibleRef: { current: false }, gpuLiveAcceptedRequestIdRef: surfaceRequest,
    gpuLiveInkPinnedRef: pinned, gpuPinReceiptWatchdogRef: watchdogRef,
    liveDraftLayerRef: { current: null }, liveStrokeBackendAuditActiveIdRef: activeStroke,
    liveStrokeBackendAuditEarlyGpuReceiptsRef: { current: new Map() },
    liveStrokeBackendAuditGpuOwnersRef: { current: new Map() },
    liveStrokeBackendAuditSessionsRef: { current: sessions },
    pendingGpuDrawAuthoritiesRef: pendingAuthorities, pendingGpuStrokesRef: pendingStrokes,
    onSelectedEngineUnavailable: (reason, strokeId) => {
      failures.push({ reason, strokeId, at: Date.now() });
      engineRef.current?.suspend(nextRequest());
    },
    setWebGpuAuthority: vi.fn(), webGpuCanvasHandleRef: { current: null },
  });
  const watchdog = new StudioGpuPinReceiptWatchdog({
    timeoutMs: STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS,
    onTimeout: (reason, requestId) => {
      timeouts.push({ reason, requestId, at: Date.now() });
      audit.reportLiveStrokeGpuAuditFailure("timeout", requestId);
    },
  });
  watchdogRef.current = watchdog;
  function deliver(receipt: StudioGpuFrameReceipt) {
    rawReceipts.push({ receipt, at: Date.now() });
    if (!hostRef.current) throw new Error("Host 준비 전 receipt");
    hostRef.current.ready(receipt);
  }
  const engine = new StudioWebGpuEngine({
    canvas: fake.canvas, canvas2dCanvas: fake.canvas2d, gpu: fake.gpu,
    retainReadbackSnapshot: false, autoRecover: false,
    onFrameInvalid: audit.onWebGpuFrameInvalid, onFrameReady: deliver,
    onDeviceLost: () => audit.reportAllLiveStrokeGpuAuditFailures("device-lost"),
  });
  engineRef.current = engine;
  function recordUpload(requestId: string) {
    uploads.push({ requestId, points: [...uploadedPoints], pressures: [...uploadedPressures], at: Date.now() });
    if (receiptTiming === "synchronous") {
      // 동기 어댑터 비교군만 영수증 전달 시점을 대체한다. 일반 비교군은 실제 engine fence를 탄다.
      deliver({ requestId, fingerprint: requestId, backend: "webgpu", complete: true,
        strokeCount: 1, dabCount: uploadedPoints.length / 2, physicalWidth: 100, physicalHeight: 80 });
    }
  }
  const handle: Pick<StudioWebGpuCanvasHandle, "replacePinnedJournalBaseline" | "appendPinnedJournalSuffixBatch"> = {
    replacePinnedJournalBaseline: (strokes) => {
      const requestId = nextRequest();
      const stroke = strokes.at(-1);
      if (!stroke) throw new Error("빈 baseline");
      const status = receiptTiming === "synchronous"
        ? "replaced" : engine.replaceStrokeFeedJournalBaseline(strokes, requestId);
      if (status === "rejected") return { status: "rejected", requestId };
      uploadedPoints = [...stroke.points];
      uploadedPressures = [...(stroke.pressures ?? [])];
      recordUpload(requestId);
      return { status: "accepted", requestId };
    },
    appendPinnedJournalSuffixBatch: (patch) => {
      const requestId = nextRequest();
      const status = receiptTiming === "synchronous"
        ? "appended" : engine.appendStrokeFeedJournalSuffixBatch(patch, requestId);
      if (status === "rejected") return { status: "rejected", requestId };
      expect(patch.patches).toHaveLength(1);
      const suffix = patch.patches[0];
      if (!suffix) throw new Error("빈 suffix");
      expect(suffix.previousPointCount).toBe(uploadedPoints.length / 2);
      uploadedPoints.push(...suffix.suffixPoints);
      uploadedPressures.push(...suffix.suffixPressures);
      recordUpload(requestId);
      return { status: "accepted", requestId };
    },
  };
  const arm = vi.fn(audit.armGpuPinnedRequestWatchdog);
  const host: HostRuntime = hostScript.runInNewContext({
    ...audit, ...idleState, createStudioLiveStrokeGpuAppend, isStudioBrushAliasId,
    scheduleIdle: (run: () => void) => idleTasks.push(run),
    flushPendingStrokeCommitsRef: { current: flushPending },
    STUDIO_GPU_LIVE_SOURCE_JOURNAL_STYLE_KEY, STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS,
    gpuLiveOperationOrderKeyRef: { current: "fixture:order" },
    gpuLiveSourceJournalRef: journal, gpuLiveSourceJournalFirstStrokeIndexRef: { current: 0 },
    liveDraftVisualRef: latest, gpuLiveInkPinnedRef: pinned,
    gpuLiveAcceptedRequestIdRef: surfaceRequest, webGpuCanvasHandleRef: { current: handle },
    liveStrokeBackendAuditActiveIdRef: activeStroke,
    liveStrokeBackendAuditSessionsRef: { current: sessions },
    pendingGpuStrokesRef: pendingStrokes, pendingGpuDrawAuthoritiesRef: pendingAuthorities,
    gpuFinalReceiptStrokeRef: finalStroke, gpuFinalReceiptRequestIdRef: { current: null },
    gpuFinalReceiptRequestIdsRef: { current: finalRequestIds },
    gpuFinalCrdtPublishedRequestIdsRef: { current: new Map<string, string>() },
    pendingStrokeCommitsRef: pendingCommits,
    studioCrdtDocumentRef: { current: { replaceStroke: durableWrites } },
    studioDrawElementToCrdtStroke: (pageId: string, el: DrawEl) => ({
      pageId, id: el.id, points: [...el.points], pressures: [...(el.pressures ?? [])],
    }),
    persistPendingStrokeEmergencyAutosaveRef: { current: autosave },
    cancelRejectedSelectedGpuPendingStroke: vi.fn(), setError: vi.fn(),
    t: (_key: string, fallback: string) => fallback, queueMicrotask,
    setWebGpuAuthority: vi.fn(), webGpuViewportSurface: null,
    failSelectedGpuLiveInk: (reason: StudioLiveStrokeGpuFailureReason, strokeId: string) => {
      audit.reportLiveStrokeGpuAuditFailure(reason, undefined, strokeId);
    },
    armGpuPinnedRequestWatchdog: arm,
    receiveLiveStrokeGpuAuditReceipt: (receipt: StudioGpuFrameReceipt) => {
      const outcome = audit.receiveLiveStrokeGpuAuditReceipt(receipt);
      if (outcome.status === "accepted") {
        accepted.push({ requestId: receipt.requestId, strokeId: outcome.strokeId, at: Date.now() });
      }
      return outcome;
    },
    buildGpuLiveStrokePlan: (source: DrawEl, options: { correctedEl?: DrawEl | null }) => {
      const result = options.correctedEl ?? source;
      return planStudioGpuLiveStroke({ id: result.id, points: result.points,
        pressures: result.pressures, color: result.stroke, size: result.strokeWidth,
        opacity: result.opacity, orderKey: "fixture:order", destination: "transparent-overlay" });
    },
  });
  hostRef.current = host;
  cleanup.push(() => {
    audit.cancelAllLiveStrokeBackendAudits();
    audit.cancelGpuPinnedRequestWatchdog();
    engine.dispose();
  });
  engine.resize({ logicalWidth: 100, logicalHeight: 80 });
  await engine.initialize();
  await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
  expect(rawReceipts.map(({ receipt }) => receipt.requestId)).toEqual(["initial"]);
  expect(fake.fences).toEqual([{ submittedAt: 0, completedAt: FENCE_DELAY_MS }]);

  function begin(strokeId = "stroke-a") {
    const source: DrawEl = { id: strokeId, type: "draw", mode: "pen", points: [5, 10],
      pressures: [0.5], stroke: "#ff3366", strokeWidth: 8, opacity: 0.75, sampleSpacing: 0 };
    latest.current = source;
    pinned.current = true;
    expect(audit.beginLiveStrokeBackendAudit(strokeId, "webgpu")).toBe(true);
    const empty = createStudioGpuLiveSourceJournal(host.identity(source, ++sequence, [{
      id: strokeId, transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    }]));
    if (!empty) throw new Error("초기 journal 생성 거절");
    const initial = advanceStudioGpuLiveSourceJournal(empty, {
      identity: empty.identity, points: source.points, pressures: source.pressures,
    });
    if (initial.status !== "advanced") throw new Error("초기 source 입장 거절");
    journal.current = initial.state;
    const suffix = initial.suffixes[0];
    if (!suffix) throw new Error("초기 GPU suffix 없음");
    expect(audit.prepareLiveStrokeGpuSubmission(strokeId)).toBe(true);
    const { requestId, status } = handle.replacePinnedJournalBaseline([{
      id: strokeId, points: suffix.points, pressures: suffix.pressures,
      color: source.stroke, size: source.strokeWidth, opacity: source.opacity, orderKey: "fixture:order",
    }]);
    expect(status).toBe("accepted");
    expect(audit.registerLiveStrokeGpuRequest(strokeId, requestId)).toBe(true);
    surfaceRequest.current = requestId;
    audit.beginGpuPinnedReceiptEpoch(requestId);
    audit.applyLiveStrokeBackendPresentationEffects();
    return { requestId, at: Date.now() };
  }
  function append() {
    const previous = latest.current;
    if (!previous) throw new Error("입력할 원본 획이 없습니다.");
    const pointCount = previous.points.length / 2;
    const source = { ...previous, points: [...previous.points, 5 + pointCount * 2, 10],
      pressures: [...(previous.pressures ?? []), 0.5 + (pointCount % 3) / 10] };
    latest.current = source;
    inputs.push({ at: Date.now(), pointCount: pointCount + 1 });
    return host.append(source);
  }
  async function stream(durationMs: number) {
    const end = Date.now() + durationMs;
    while (Date.now() + INPUT_INTERVAL_MS <= end) {
      await vi.advanceTimersByTimeAsync(INPUT_INTERVAL_MS);
      if (failures.length > 0) break;
      expect(append()).not.toBe("rejected");
    }
    if (Date.now() < end) await vi.advanceTimersByTimeAsync(end - Date.now());
  }
  function cancel(strokeId: string) {
    audit.cancelLiveStrokeBackendAudit(strokeId);
    audit.cancelGpuPinnedRequestWatchdog();
    surfaceRequest.current = null;
    journal.current = null;
    pinned.current = false;
    finalRequestIds.delete(strokeId);
    engine.suspend(nextRequest());
  }
  function resize() {
    const requestId = nextRequest();
    expect(engine.resize({ logicalWidth: 120, logicalHeight: 80 }, {
      requestId, onBeforeSurfaceMutation: (id) => audit.onWebGpuFrameRequest({ requestId: id, reason: "surface-resize" }),
    })).toMatchObject({ status: "resized", requestId, rerendered: true });
    return requestId;
  }
  function seal(corrected?: DrawEl, sourceOverride?: DrawEl) {
    const source = sourceOverride ?? latest.current;
    if (!source) throw new Error("종료할 원본 획이 없습니다.");
    const finished = corrected ?? source;
    pendingCommits.current = { pageId: "page:fixture", strokes: [finished] };
    expect(host.settle(source, finished)).toBe(true);
    pinned.current = false;
    expect(audit.sealLiveStrokeBackendAudit(source.id)).toBe(true);
    return { requestId: finalRequestIds.get(source.id), source: finished };
  }
  function evidence() {
    return JSON.stringify({ inputIntervalMs: INPUT_INTERVAL_MS, fenceDelayMs: FENCE_DELAY_MS,
      fences: fake.fences, rawReceipts, accepted, timeouts, failures, inputs,
      uploads, maxPresentationsInFlight: fake.maximumOutstanding() }, null, 2);
  }
  function expectHealthyFences() {
    const completed = fake.fences.filter((fence) => fence.completedAt !== null);
    expect(completed.length).toBeGreaterThan(2);
    for (const fence of completed) expect(Number(fence.completedAt) - fence.submittedAt).toBe(FENCE_DELAY_MS);
    expect(fake.maximumOutstanding()).toBeLessThanOrEqual(2);
  }
  return { audit, host, begin, append, stream, cancel, resize, seal, accepted, rawReceipts,
    failures, timeouts, sessions, latest, journal, pinned, inputs, uploads, arm,
    durableWrites, autosave, fake, evidence, expectHealthyFences,
    idleTasks, flushPending, idleState, pendingCommits, finalRequestIds };
}

describe("정상 40ms GPU fence와 16ms 입력의 Host 영수증 진행", () => {
  it("device와 빈 프레임 준비 뒤 단일 입력은 정확한 첫 영수증을 받는다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    expect(fixture.accepted).toEqual([{ ...first, strokeId: "stroke-a", at: first.at + FENCE_DELAY_MS }]);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS);
    expect(fixture.failures).toEqual([]);
    expect(fixture.timeouts).toEqual([]);
  });

  it("16ms 입력을 멈추지 않아도 첫 표시와 후속 exact receipt를 300ms 안에 승인한다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(320);
    fixture.expectHealthyFences();
    expect(fixture.inputs).toHaveLength(20);
    expect(fixture.inputs.map(({ at }) => at - first.at)).toEqual(Array.from({ length: 20 }, (_, i) => (i + 1) * INPUT_INTERVAL_MS));
    expect(fixture.failures, fixture.evidence()).toEqual([]);
    expect(fixture.accepted.length).toBeGreaterThan(1);
    expect(fixture.accepted[0]?.at).toBe(first.at + FENCE_DELAY_MS);
    for (const [index, receipt] of fixture.accepted.entries()) {
      if (index > 0) expect(receipt.at - Number(fixture.accepted[index - 1]?.at)).toBeLessThanOrEqual(FENCE_DELAY_MS);
    }
    expect(fixture.arm.mock.calls.every(([, timeoutMs]) => timeoutMs === undefined)).toBe(true);
  });

  it("192ms 입력 뒤 멈추면 누적 원본의 모든 점과 필압을 최신 요청까지 보낸다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(192);
    await vi.advanceTimersByTimeAsync(80);
    fixture.expectHealthyFences();
    expect(fixture.accepted.length).toBeGreaterThan(1);
    expect(fixture.accepted.at(-1)?.requestId).not.toBe(first.requestId);
    expect(fixture.uploads.at(-1)?.points).toEqual(fixture.latest.current?.points);
    expect(fixture.uploads.at(-1)?.pressures).toEqual(fixture.latest.current?.pressures);
    expect(fixture.journal.current?.sourcePointCount).toBe(13);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS);
    expect(fixture.timeouts).toEqual([]);
    expect(fixture.failures).toEqual([]);
  });

  it("첫 정확한 영수증 뒤 16ms 연속 입력도 기본 live 예산 안에 진행한다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    expect(fixture.accepted).toHaveLength(1);
    await fixture.stream(336);
    fixture.expectHealthyFences();
    expect(fixture.inputs).toHaveLength(21);
    expect(fixture.failures, fixture.evidence()).toEqual([]);
    expect(fixture.accepted.length).toBeGreaterThan(1);
    expect(fixture.arm.mock.calls.every(([, timeoutMs]) => timeoutMs === undefined)).toBe(true);
  });

  it("실제로 300ms를 넘긴 진행 fence는 계속 실패하며 입력이 deadline을 미루지 못한다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    fixture.fake.delayNextFences(500);
    const requestedAt = Date.now();
    expect(fixture.append()).toBe("advanced");
    await fixture.stream(336);
    expect(fixture.accepted).toHaveLength(1);
    expect(fixture.timeouts).toEqual([{ reason: "progress", requestId: fixture.uploads.at(-1)?.requestId,
      at: requestedAt + STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS }]);
    expect(fixture.failures).toEqual([{ reason: "timeout", strokeId: "stroke-a", at: requestedAt + STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS }]);
  });

  it("취소 뒤 기존 fence와 queued source가 표면이나 저장을 되살리지 않는다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(INPUT_INTERVAL_MS);
    fixture.cancel("stroke-a");
    fixture.host.flush("stroke-a", first.requestId);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS + FENCE_DELAY_MS);
    expect(fixture.accepted).toEqual([]);
    expect(fixture.rawReceipts.map(({ receipt }) => receipt.requestId)).toEqual(["initial"]);
    expect(fixture.uploads).toHaveLength(1);
    expect(fixture.timeouts).toEqual([]);
    expect(fixture.failures).toEqual([]);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
  });

  it("resize 전 fence는 승인하지 않고 새 표면 receipt 이후에만 queued suffix를 보낸다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await fixture.stream(INPUT_INTERVAL_MS);
    const resized = fixture.resize();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS - INPUT_INTERVAL_MS);
    expect(fixture.accepted).toEqual([]);
    expect(fixture.uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(INPUT_INTERVAL_MS);
    expect(fixture.accepted.map(({ requestId }) => requestId)).toEqual([resized]);
    expect(fixture.uploads.at(-1)?.points).toEqual(fixture.latest.current?.points);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS);
    expect(fixture.timeouts).toEqual([]);
    expect(fixture.failures).toEqual([]);
  });

  it("새 획이 취소된 이전 획의 fence·실패·재flush를 상속하지 않는다", async () => {
    const fixture = await liveFixture();
    const old = fixture.begin("stroke-a");
    await fixture.stream(INPUT_INTERVAL_MS);
    fixture.cancel("stroke-a");
    const next = fixture.begin("stroke-b");
    expect(fixture.audit.reportLiveStrokeGpuAuditFailure("timeout", old.requestId, "stroke-a")).toBe(false);
    fixture.host.flush("stroke-a", old.requestId);
    expect(fixture.uploads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS - INPUT_INTERVAL_MS);
    expect(fixture.accepted).toEqual([]);
    await vi.advanceTimersByTimeAsync(INPUT_INTERVAL_MS);
    expect(fixture.accepted).toEqual([{ ...next, strokeId: "stroke-b", at: next.at + FENCE_DELAY_MS }]);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS);
    expect(fixture.sessions.has("stroke-a")).toBe(false);
    expect(fixture.timeouts).toEqual([]);
    expect(fixture.failures).toEqual([]);
  });

  it("terminal은 pending live를 우회하고 모든 입력의 exact receipt 전에는 저장하지 않는다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(32);
    expect(fixture.uploads).toHaveLength(1);
    const final = fixture.seal();
    expect(final.requestId).not.toBe(first.requestId);
    expect(fixture.arm).toHaveBeenLastCalledWith(final.requestId, STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS);
    expect(fixture.host.exactFinal("stroke-a")).toBe(false);
    expect(fixture.uploads.at(-1)?.points).toEqual(final.source.points);
    expect(fixture.uploads.at(-1)?.pressures).toEqual(final.source.pressures);
    fixture.host.persist("stroke-a", first.requestId);
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS - 1);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
    expect(fixture.autosave).not.toHaveBeenCalled();
    expect(fixture.idleTasks).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.host.exactFinal("stroke-a")).toBe(true);
    expect(fixture.durableWrites).toHaveBeenCalledExactlyOnceWith({ pageId: "page:fixture", id: "stroke-a",
      points: final.source.points, pressures: final.source.pressures });
    expect(fixture.autosave).toHaveBeenCalledWith("pointerup");
    if (!final.requestId) throw new Error("terminal request 없음");
    fixture.host.persist("stroke-a", final.requestId);
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.durableWrites).toHaveBeenCalledTimes(1);
    expect(fixture.idleTasks).toHaveLength(1);
    expect(fixture.flushPending).not.toHaveBeenCalled();
    fixture.idleTasks.forEach(run => run());
    expect(fixture.flushPending).toHaveBeenCalledOnce();
    expect(fixture.pendingCommits.current).toBeNull();
  });

  it.each(["펜 접촉", "저장 중", "편집 잠금", "다른 문서", "다른 페이지", "종료", "후처리", "다른 영수증", "다른 배치", "추가 획"] as const)(
    "유휴 콜백에 %s 상태가 되면 선행 확정을 건너뛰고 기존 배치를 유지한다",
    async reason => {
      const fixture = await liveFixture("synchronous");
      fixture.begin();
      const { source } = fixture.seal();
      await vi.advanceTimersByTimeAsync(0);
      expect(fixture.idleTasks).toHaveLength(1);
      const batch = fixture.pendingCommits.current;
      if (!batch) throw new Error("완료한 획이 대기 배치에 없습니다.");
      const state = fixture.idleState;
      switch (reason) {
        case "펜 접촉": state.drawingRef.current = { ...source, id: "stroke-b" }; break;
        case "저장 중": state.documentSaveInFlightRef.current = true; break;
        case "편집 잠금": state.collaborationAccessRef.current.locked = true; break;
        case "다른 문서": state.collaborationAccessRef.current.documentGeneration++; break;
        case "다른 페이지": state.currentPageIdRef.current = "another-page"; break;
        case "종료": state.editorMountedRef.current = false; break;
        case "후처리": state.deferredStrokePostprocessControllersRef.current.set(source.id, new AbortController()); break;
        case "다른 영수증": fixture.finalRequestIds.set(source.id, "superseded"); break;
        case "다른 배치": fixture.pendingCommits.current = { ...batch }; break;
        case "추가 획": batch.strokes.push({ ...source, id: "stroke-b" }); break;
      }
      const expectedBatch = fixture.pendingCommits.current;
      fixture.idleTasks.forEach(run => run());
      expect(fixture.flushPending).not.toHaveBeenCalled();
      expect(fixture.pendingCommits.current).toBe(expectedBatch);
      expect(fixture.durableWrites).toHaveBeenCalledOnce();
    },
  );

  it("아직 다음 RAF에 오지 않은 pointer-up 원본 점도 terminal에 포함한다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await fixture.stream(INPUT_INTERVAL_MS);
    const previous = fixture.latest.current;
    if (!previous) throw new Error("원본 없음");
    const unflushed = { ...previous, points: [...previous.points, 30, 20, 40, 25],
      pressures: [...(previous.pressures ?? []), 0.8, 0.9] };
    const final = fixture.seal(undefined, unflushed);
    expect(fixture.uploads.at(-1)?.points).toEqual(unflushed.points);
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    expect(fixture.durableWrites).toHaveBeenCalledExactlyOnceWith({ pageId: "page:fixture", id: "stroke-a",
      points: final.source.points, pressures: final.source.pressures });
  });

  it("이미 제출한 마지막 접미사를 seal할 때도 같은 exact 요청에 terminal 예산을 적용한다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    fixture.fake.delayNextFences(500);
    expect(fixture.append()).toBe("advanced");
    const pending = fixture.uploads.at(-1)?.requestId;
    const final = fixture.seal();
    expect(final.requestId).toBe(pending);
    expect(fixture.arm).toHaveBeenLastCalledWith(final.requestId, STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(499);
    expect(fixture.failures).toEqual([]);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.host.exactFinal("stroke-a")).toBe(true);
    expect(fixture.durableWrites).toHaveBeenCalledTimes(1);
  });

  it("terminal fence가 실제 2000ms를 넘으면 완료 원고를 저장하지 않는다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    fixture.fake.delayNextFences(2_200);
    fixture.append();
    const final = fixture.seal();
    const sealedAt = Date.now();
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS - 1);
    expect(fixture.failures).toEqual([]);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fixture.timeouts).toEqual([{ reason: "progress", requestId: final.requestId,
      at: sealedAt + STUDIO_GPU_TERMINAL_RECEIPT_TIMEOUT_MS }]);
    await vi.advanceTimersByTimeAsync(200);
    expect(fixture.host.exactFinal("stroke-a")).toBe(false);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
  });

  it("같은 획의 오래된 receipt 재flush도 현재 pending 요청을 갈아치우지 않는다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(32);
    await vi.advanceTimersByTimeAsync(8);
    expect(fixture.accepted[0]?.requestId).toBe(first.requestId);
    fixture.append();
    const count = fixture.uploads.length;
    const cursor = fixture.journal.current?.sourcePointCount;
    fixture.host.flush("stroke-a", first.requestId);
    fixture.host.flush("stroke-a", "unregistered-request");
    expect(fixture.uploads).toHaveLength(count);
    expect(fixture.journal.current?.sourcePointCount).toBe(cursor);
    await vi.advanceTimersByTimeAsync(80);
    expect(fixture.uploads.at(-1)?.points).toEqual(fixture.latest.current?.points);
    expect(fixture.failures).toEqual([]);
  });

  it("pending 중 스타일을 바꾼 입력은 coalescing으로 정상값처럼 숨기지 않는다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    const source = fixture.latest.current;
    if (!source) throw new Error("원본 없음");
    expect(fixture.host.append({ ...source, stroke: "#112233" })).toBe("rejected");
    expect(fixture.failures.map(({ reason }) => reason)).toEqual(["request-failed"]);
    expect(fixture.uploads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS);
    expect(fixture.accepted).toEqual([]);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
  });

  it("후보정 terminal baseline은 이전 live/미보정 receipt로 저장하지 않는다", async () => {
    const fixture = await liveFixture();
    fixture.begin();
    await fixture.stream(INPUT_INTERVAL_MS);
    const source = fixture.latest.current;
    if (!source) throw new Error("원본 없음");
    const corrected = { ...source, points: source.points.map((value) => value + 3) };
    const final = fixture.seal(corrected);
    expect(fixture.uploads.at(-1)?.points).toEqual(corrected.points);
    await vi.advanceTimersByTimeAsync(FENCE_DELAY_MS - INPUT_INTERVAL_MS);
    expect(fixture.host.exactFinal("stroke-a")).toBe(false);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    expect(fixture.accepted.at(-1)?.requestId).toBe(final.requestId);
    expect(fixture.durableWrites).toHaveBeenCalledExactlyOnceWith({ pageId: "page:fixture", id: "stroke-a",
      points: corrected.points, pressures: corrected.pressures });
  });

  it("장치 loss는 queued source를 재제출하거나 다른 renderer로 저장하지 않는다", async () => {
    const fixture = await liveFixture();
    const first = fixture.begin();
    await fixture.stream(INPUT_INTERVAL_MS);
    fixture.fake.lose();
    await vi.advanceTimersByTimeAsync(0);
    fixture.host.flush("stroke-a", first.requestId);
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS + FENCE_DELAY_MS);
    expect(fixture.failures.map(({ reason }) => reason)).toEqual(["device-lost"]);
    expect(fixture.accepted).toEqual([]);
    expect(fixture.uploads).toHaveLength(1);
    expect(fixture.durableWrites).not.toHaveBeenCalled();
  });

  it("동기 pre-registration receipt도 다음 입력과 최종 저장을 막지 않는다", async () => {
    const fixture = await liveFixture("synchronous");
    fixture.begin();
    await fixture.stream(64);
    expect(fixture.uploads).toHaveLength(5);
    expect(fixture.uploads.at(-1)?.points).toEqual(fixture.latest.current?.points);
    const final = fixture.seal();
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.host.exactFinal("stroke-a")).toBe(true);
    expect(fixture.durableWrites).toHaveBeenCalledExactlyOnceWith({ pageId: "page:fixture", id: "stroke-a",
      points: final.source.points, pressures: final.source.pressures });
    await vi.advanceTimersByTimeAsync(STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS);
    expect(fixture.timeouts).toEqual([]);
    expect(fixture.failures).toEqual([]);
  });
});
