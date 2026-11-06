// 브라우저 수명주기 회귀 프로브 페이지 모듈. scripts/browser-lifecycle-probe.mjs가 Vite dev 서버로 이 모듈을 열고
// CDP Input.dispatchMouseEvent(실제 DOM 포인터 이벤트)와 window.__brushLabLifecycleProbe를 결합해
// Scenario Group A(clear 경합), B(캡처 상실·비소유 포인터 간섭), C(3회 반복 attach/detach/dispose/recreate)를 검증한다.
import { buildInputStage } from "../src/app/state/input-chain.ts";
import { LiveStrokeSession } from "../src/app/state/live-session.ts";
import liveSessionRaw from "../src/app/state/live-session.ts?raw";
import { createFaultInjectionLane } from "../src/app/testing/fault-injection-lane.ts";
import faultInjectionLaneRaw from "../src/app/testing/fault-injection-lane.ts?raw";
import { pixelHash } from "../src/bench/metrics/render-metrics.ts";
import { presetById } from "../src/engine/presets/catalog.ts";
import { embeddedKernelBytes, SUMI_KERNEL_SHA256 } from "../src/engine/wasm/embedded.ts";
import { laneById } from "../src/lanes/registry.ts";
import pointerCaptureRaw from "../src/platform/pointer-capture.ts?raw";
import { createSpeedPressureSimulator } from "../src/platform/pressure-sim.ts";

const CANVAS_SIZE = 256;
const BASE_SEED = 4242;
const MAX_RECREATE_ITERATIONS = 3;

const stageEl = document.getElementById("lifecycle-stage");
const presentEl = document.getElementById("lifecycle-present");
if (!(stageEl instanceof HTMLCanvasElement) || !(presentEl instanceof HTMLCanvasElement)) {
  throw new Error("lifecycle-stage 또는 lifecycle-present 캔버스를 찾지 못했다");
}

const domInputAudit = { trustedPointerEvents: 0, syntheticPointerEvents: 0, lostCaptureEvents: 0 };
for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
  stageEl.addEventListener(type, (ev) => {
    if (ev.isTrusted) domInputAudit.trustedPointerEvents += 1;
    else domInputAudit.syntheticPointerEvents += 1;
  });
}
stageEl.addEventListener("lostpointercapture", () => {
  domInputAudit.lostCaptureEvents += 1;
});

function captureFlagOf(options) {
  if (typeof options === "boolean") return options;
  if (options && typeof options === "object") return Boolean(options.capture);
  return false;
}

function instrumentEventTarget(target) {
  const origAdd = target.addEventListener.bind(target);
  const origRemove = target.removeEventListener.bind(target);
  const active = new Map();
  let tracking = false;
  target.addEventListener = (type, listener, options) => {
    if (tracking && listener) {
      const cap = captureFlagOf(options);
      const list = active.get(type) ?? [];
      if (!active.has(type)) active.set(type, list);
      if (!list.some((item) => item.listener === listener && item.cap === cap)) list.push({ listener, cap });
    }
    return origAdd(type, listener, options);
  };
  target.removeEventListener = (type, listener, options) => {
    if (listener) {
      const cap = captureFlagOf(options);
      const list = active.get(type);
      if (list) {
        const idx = list.findIndex((item) => item.listener === listener && item.cap === cap);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) active.delete(type);
      }
    }
    return origRemove(type, listener, options);
  };
  return {
    setTracking(enabled) {
      tracking = enabled;
      if (!enabled) active.clear();
    },
    reset: () => active.clear(),
    activeCount() {
      let sum = 0;
      for (const list of active.values()) sum += list.length;
      return sum;
    },
  };
}

const stageListeners = instrumentEventTarget(stageEl);
const windowListeners = instrumentEventTarget(window);

const origRaf = window.requestAnimationFrame.bind(window);
const origCaf = window.cancelAnimationFrame.bind(window);
let nextRafId = 1;
const pendingRafCallbacks = new Map();
let totalRafRequested = 0;
let totalRafCanceled = 0;

window.requestAnimationFrame = (cb) => {
  totalRafRequested += 1;
  const id = nextRafId++;
  pendingRafCallbacks.set(id, cb);
  return id;
};
window.cancelAnimationFrame = (id) => {
  if (pendingRafCallbacks.delete(id)) {
    totalRafCanceled += 1;
    return;
  }
  origCaf(id);
};

async function flushAnimationFrames(cycles = 1) {
  for (let c = 0; c < cycles; c += 1) {
    await new Promise((resolve) => {
      origRaf((ts) => {
        const entries = [...pendingRafCallbacks.entries()];
        pendingRafCallbacks.clear();
        for (const [, cb] of entries) cb(ts);
        resolve();
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function settleMicrotasks(ticks = 4) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const clock = { now: () => performance.now() };
function makeEnv() {
  return {
    gpu: navigator.gpu ?? null,
    createCanvas: (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }),
    clock,
    userAgent: navigator.userAgent,
  };
}

function countInkPixels(image) {
  let ink = 0;
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(255 - d[i]) + Math.abs(255 - d[i + 1]) + Math.abs(255 - d[i + 2]) > 24) ink += 1;
  }
  return ink;
}

function createDeterministicSampleTransform() {
  const speedSim = createSpeedPressureSimulator();
  let sampleStep = 0;
  return (rawInput) =>
    speedSim.apply(
      rawInput
        .filter((s) => s.source === "raw")
        .map((s) => {
          if (s.phase === "down") {
            sampleStep = 0;
            speedSim.reset();
          } else {
            sampleStep += 1;
          }
          return { ...s, x: Math.round(s.x), y: Math.round(s.y), tMs: 1000 + sampleStep * 8 };
        }),
    );
}

function toPairs(coords) {
  const out = [];
  for (let i = 0; i < coords.length; i += 2) out.push([coords[i], coords[i + 1]]);
  return out;
}

const STROKE_PATHS = {
  warmup: toPairs([28, 42, 52, 46, 76, 52, 100, 48, 124, 44, 148, 50]),
  race: toPairs([32, 196, 64, 204, 96, 210, 128, 202, 160, 194, 192, 200]),
  strokeB: toPairs([36, 92, 68, 108, 100, 124, 132, 116, 164, 100, 196, 112, 220, 128]),
  stroke1: toPairs([30, 70, 62, 82, 94, 90, 126, 84, 158, 74, 190, 82, 218, 92]),
  canceledMid: toPairs([40, 140, 80, 152, 120, 160, 160, 154]),
  stroke2: toPairs([34, 178, 66, 190, 98, 198, 130, 192, 162, 182, 194, 188, 222, 196]),
};

async function cdpDispatchDomMouse(events) {
  if (typeof window.__brushLabCdpDispatchMouse !== "function") {
    throw new Error("__brushLabCdpDispatchMouse 바인딩이 등록되지 않았다");
  }
  const rect = stageEl.getBoundingClientRect();
  return window.__brushLabCdpDispatchMouse(events.map((ev) => ({ ...ev, x: rect.left + ev.lx, y: rect.top + ev.ly })));
}

function mouseEv(type, pt, buttons = type === "mouseReleased" ? 0 : 1) {
  return { type, lx: pt[0], ly: pt[1], button: "left", buttons, pointerType: "mouse" };
}

async function startRealDomStrokeFirstBatch(points) {
  const mid = Math.max(2, Math.floor(points.length / 2));
  const firstHalf = points.slice(0, mid);
  await cdpDispatchDomMouse([mouseEv("mousePressed", firstHalf[0]), ...firstHalf.slice(1).map((p) => mouseEv("mouseMoved", p))]);
  const hadCapture = stageEl.hasPointerCapture(1);
  await flushAnimationFrames(1);
  return { hadCapture, midIndex: mid, lastFirstPt: firstHalf[firstHalf.length - 1] };
}

async function finishRealDomStrokeSecondBatch(points, midIndex) {
  const secondHalf = points.slice(midIndex);
  const lastPt = points[points.length - 1];
  await cdpDispatchDomMouse([...secondHalf.map((p) => mouseEv("mouseMoved", p)), mouseEv("mouseReleased", lastPt, 0)]);
  await flushAnimationFrames(1);
}

async function drawRealDomStrokeTwoBatches(points) {
  const started = await startRealDomStrokeFirstBatch(points);
  await finishRealDomStrokeSecondBatch(points, started.midIndex);
  return { hadCaptureMidStroke: started.hadCapture };
}

async function releaseRealDomMouseAt(pt) {
  await cdpDispatchDomMouse([mouseEv("mouseReleased", pt, 0)]);
  await flushAnimationFrames(1);
}

async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSourceProvenance() {
  const enc = new TextEncoder();
  const [pointerCaptureTs, liveSessionTs, faultInjectionLaneTs, sumiKernelWasm] = await Promise.all([
    sha256HexOfBytes(enc.encode(pointerCaptureRaw)),
    sha256HexOfBytes(enc.encode(liveSessionRaw)),
    sha256HexOfBytes(enc.encode(faultInjectionLaneRaw)),
    sha256HexOfBytes(embeddedKernelBytes()),
  ]);
  return {
    buildMode: "vite-dev-live-source",
    sumiKernelDeclaredSha256: SUMI_KERNEL_SHA256,
    sourceHashes: { pointerCaptureTs, liveSessionTs, faultInjectionLaneTs, sumiKernelWasm },
  };
}

function makeSessionConfig(createLane, program, env, callbacks = {}) {
  return {
    createLane,
    env,
    program,
    seed: BASE_SEED,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    presentCanvas: presentEl,
    transformSamples: createDeterministicSampleTransform(),
    inputStage: buildInputStage({ stabilizerMode: "one-euro", stabilizerPct: null, cornerGate: false }),
    ...callbacks,
  };
}

function evidenceMeta(syntheticPointerEvent, testOnlyDelayInjection) {
  return { realDomInput: true, syntheticPointerEvent, testOnlyDelayInjection, pixelVerification: "cpu-wasm-real-pixels" };
}

function matchEndToBaseline(base, endRes, actualStrokes) {
  const actualHash = endRes ? pixelHash(endRes.image) : "";
  const actualInk = endRes ? countInkPixels(endRes.image) : -1;
  const actualDabs = endRes?.receipt.dabCount ?? -1;
  const actualSeed = endRes?.seed ?? -1;
  const matched =
    actualHash === base.hash &&
    actualInk === base.inkPixels &&
    actualStrokes === base.strokeCount &&
    actualDabs === base.dabCount &&
    actualSeed === base.seed;
  return {
    matched,
    baselineHash: base.hash,
    finalHash: actualHash,
    actualHash,
    hashEqual: actualHash === base.hash,
    baselineInkPixels: base.inkPixels,
    finalInkPixels: actualInk,
    actualInkPixels: actualInk,
    baselineStrokeCount: base.strokeCount,
    finalStrokeCount: actualStrokes,
    baselineDabCount: base.dabCount,
    finalDabCount: actualDabs,
    actualDabCount: actualDabs,
    baselineSeed: base.seed,
    finalSeed: actualSeed,
  };
}

async function measureCleanStrokeBaseline(laneId, presetId, strokeKeys) {
  const program = presetById(presetId);
  const env = makeEnv();
  const strokeEnds = [];
  const session = await LiveStrokeSession.create(
    makeSessionConfig(() => laneById(laneId).create(), program, env, { onStrokeEnd: (res) => strokeEnds.push(res) }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
  try {
    const snapshots = [];
    for (const key of strokeKeys) {
      await drawRealDomStrokeTwoBatches(STROKE_PATHS[key]);
      await settleMicrotasks();
      const latest = strokeEnds[strokeEnds.length - 1];
      snapshots.push({
        key,
        hash: pixelHash(latest.image),
        inkPixels: countInkPixels(latest.image),
        strokeCount: session.strokes,
        dabCount: latest.receipt.dabCount,
        seed: latest.seed,
      });
    }
    return { snapshots };
  } finally {
    detach();
    session.dispose();
    pendingRafCallbacks.clear();
  }
}

async function runScenarioGroupA(laneId, presetId) {
  const baseline = (await measureCleanStrokeBaseline(laneId, presetId, ["strokeB"])).snapshots[0];
  const cases = [];

  for (const delayedOp of ["beginStroke", "addSamples", "endStroke"]) {
    for (const outcome of ["resolve", "reject"]) {
      const program = presetById(presetId);
      const env = makeEnv();
      const createdLanes = [];
      const strokeEnds = [];
      const errors = [];
      const aborts = [];
      const trustedBefore = domInputAudit.trustedPointerEvents;

      const session = await LiveStrokeSession.create(
        makeSessionConfig(
          () => {
            const wrapped = createFaultInjectionLane({ inner: laneById(laneId).create() });
            createdLanes.push(wrapped);
            return wrapped;
          },
          program,
          env,
          {
            onStrokeEnd: (res) => strokeEnds.push({ epochLaneIndex: createdLanes.length - 1, res }),
            onError: (err) => errors.push(String(err?.message ?? err)),
            onStrokeAbort: (abort) => aborts.push(abort),
          },
        ),
      );
      const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });

      try {
        const lane0 = createdLanes[0];
        await drawRealDomStrokeTwoBatches(STROKE_PATHS.warmup);
        await settleMicrotasks();
        const strokesBeforeRace = session.strokes;
        const warmupEndsCount = strokeEnds.length;

        const gate = lane0.holdNext(delayedOp);
        const raceStarted = await startRealDomStrokeFirstBatch(STROKE_PATHS.race);
        if (delayedOp === "endStroke") await finishRealDomStrokeSecondBatch(STROKE_PATHS.race, raceStarted.midIndex);
        await gate.entered;
        const gateWaitingAtClear = gate.isWaiting;

        const clearPromise = session.clear();
        if (delayedOp !== "endStroke") await releaseRealDomMouseAt(raceStarted.lastFirstPt);

        const recoveryCapture = await drawRealDomStrokeTwoBatches(STROKE_PATHS.strokeB);
        if (outcome === "reject") gate.reject(new Error(`injected stale ${delayedOp} failure`));
        else gate.resolve();

        await clearPromise;
        await flushAnimationFrames(2);
        await settleMicrotasks(6);

        const postClearEnds = strokeEnds.slice(warmupEndsCount);
        const staleCallbackCount = postClearEnds.filter((e) => e.epochLaneIndex === 0).length;
        const finalEnd = postClearEnds[postClearEnds.length - 1]?.res ?? null;
        const cmp = matchEndToBaseline(baseline, finalEnd, session.strokes);
        const trustedDelta = domInputAudit.trustedPointerEvents - trustedBefore;

        const ok =
          strokesBeforeRace === 1 &&
          gateWaitingAtClear &&
          postClearEnds.length === 1 &&
          staleCallbackCount === 0 &&
          errors.length === 0 &&
          aborts.length === 0 &&
          lane0.disposedCount === 1 &&
          lane0.postDisposeCalls.length === 0 &&
          cmp.matched &&
          recoveryCapture.hadCaptureMidStroke &&
          trustedDelta > 0;

        cases.push({
          scenarioId: `A-${laneId}-${presetId}-${delayedOp}-${outcome}`,
          laneId,
          presetId,
          delayedOp,
          outcome,
          ok,
          evidenceClassification: evidenceMeta(false, true),
          strokesBeforeRace,
          gateWaitingAtClear,
          staleCallbackCount,
          errorsCount: errors.length,
          abortsCount: aborts.length,
          lane0DisposedCount: lane0.disposedCount,
          lane0PostDisposeCalls: lane0.postDisposeCalls.length,
          trustedDomEvents: trustedDelta,
          ...cmp,
        });
      } finally {
        detach();
        session.dispose();
        pendingRafCallbacks.clear();
      }
    }
  }
  return { laneId, presetId, baseline, cases, ok: cases.every((c) => c.ok) };
}

async function runScenarioGroupB(laneId, presetId) {
  const [base1, base2] = (await measureCleanStrokeBaseline(laneId, presetId, ["stroke1", "stroke2"])).snapshots;
  const program = presetById(presetId);
  const env = makeEnv();
  const strokeEnds = [];
  const frames = [];
  const errors = [];
  const aborts = [];
  const trustedBefore = domInputAudit.trustedPointerEvents;
  const syntheticBefore = domInputAudit.syntheticPointerEvents;

  const session = await LiveStrokeSession.create(
    makeSessionConfig(() => laneById(laneId).create(), program, env, {
      onFrame: (r) => frames.push(r),
      onStrokeEnd: (res) => strokeEnds.push(res),
      onError: (err) => errors.push(String(err?.message ?? err)),
      onStrokeAbort: (abort) => aborts.push(abort),
    }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });

  try {
    const started1 = await startRealDomStrokeFirstBatch(STROKE_PATHS.stroke1);
    const rect = stageEl.getBoundingClientRect();
    const nonOwner = { bubbles: true, cancelable: true, pointerId: 99, pointerType: "touch", isPrimary: false };
    for (const ev of [
      new PointerEvent("pointerdown", { ...nonOwner, clientX: rect.left + 180, clientY: rect.top + 180, buttons: 1 }),
      new PointerEvent("pointermove", { ...nonOwner, clientX: rect.left + 200, clientY: rect.top + 200, buttons: 1 }),
      new PointerEvent("pointercancel", nonOwner),
      new PointerEvent("lostpointercapture", { bubbles: false, cancelable: false, pointerId: 99, pointerType: "touch", isPrimary: false }),
      new PointerEvent("pointerup", nonOwner),
      new PointerEvent("pointerdown", { ...nonOwner, pointerType: "mouse", button: 2, buttons: 2, clientX: rect.left + 150, clientY: rect.top + 150 }),
    ]) {
      stageEl.dispatchEvent(ev);
    }

    await finishRealDomStrokeSecondBatch(STROKE_PATHS.stroke1, started1.midIndex);
    await settleMicrotasks();

    const cmp1 = matchEndToBaseline(base1, strokeEnds[0], session.strokes);
    const subcaseB1 = {
      scenarioId: `B1-non-owner-interference-${laneId}-${presetId}`,
      ok: started1.hadCapture && aborts.length === 0 && errors.length === 0 && cmp1.matched,
      hadNativeCapture: started1.hadCapture,
      abortsCount: aborts.length,
      errorsCount: errors.length,
      strokeCount: session.strokes,
      ...cmp1,
    };

    const framesBeforeCancel = frames.length;
    const lostBeforeCancel = domInputAudit.lostCaptureEvents;
    const startedCancel = await startRealDomStrokeFirstBatch(STROKE_PATHS.canceledMid);
    const framesDuringCanceledStroke = frames.length - framesBeforeCancel;

    if (stageEl.hasPointerCapture(1)) stageEl.releasePointerCapture(1);
    await cdpDispatchDomMouse([mouseEv("mouseMoved", [startedCancel.lastFirstPt[0] + 1, startedCancel.lastFirstPt[1] + 1])]);
    if (domInputAudit.lostCaptureEvents === lostBeforeCancel) {
      stageEl.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: false, cancelable: false, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }
    stageEl.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        clientX: rect.left + startedCancel.lastFirstPt[0],
        clientY: rect.top + startedCancel.lastFirstPt[1],
      }),
    );
    await flushAnimationFrames(1);
    await settleMicrotasks();
    await releaseRealDomMouseAt(startedCancel.lastFirstPt);
    await settleMicrotasks();

    const imageAfterAbort = await session.currentLane.readback();
    const hashAfterAbort = pixelHash(imageAfterAbort);
    const inkAfterAbort = countInkPixels(imageAfterAbort);
    const abortEntry = aborts[0] ?? null;

    await drawRealDomStrokeTwoBatches(STROKE_PATHS.stroke2);
    await settleMicrotasks();

    const cmp2 = matchEndToBaseline(base2, strokeEnds[strokeEnds.length - 1], session.strokes);
    const subcaseB2 = {
      scenarioId: `B2-capture-loss-recovery-${laneId}-${presetId}`,
      ok:
        framesDuringCanceledStroke >= 1 &&
        aborts.length === 1 &&
        abortEntry?.cause === "pointercancel" &&
        abortEntry?.cancelSource === "lostpointercapture" &&
        abortEntry?.receipt?.documentPreserved === true &&
        abortEntry?.laneReplaced === false &&
        hashAfterAbort === base1.hash &&
        inkAfterAbort === base1.inkPixels &&
        errors.length === 0 &&
        cmp2.matched,
      framesDuringCanceledStroke,
      abortCount: aborts.length,
      abortCause: abortEntry?.cause ?? null,
      abortCancelSource: abortEntry?.cancelSource ?? null,
      documentPreserved: abortEntry?.receipt?.documentPreserved ?? false,
      laneReplaced: abortEntry?.laneReplaced ?? true,
      hashAfterAbortEqualStroke1: hashAfterAbort === base1.hash,
      inkAfterAbortEqualStroke1: inkAfterAbort === base1.inkPixels,
      strokeCountAfterRecovery: session.strokes,
      hash2Equal: cmp2.hashEqual,
      ...cmp2,
      trustedDomEvents: domInputAudit.trustedPointerEvents - trustedBefore,
      syntheticEvents: domInputAudit.syntheticPointerEvents - syntheticBefore,
    };

    return { laneId, presetId, evidenceClassification: evidenceMeta(true, false), subcaseB1, subcaseB2, ok: subcaseB1.ok && subcaseB2.ok };
  } finally {
    detach();
    session.dispose();
    pendingRafCallbacks.clear();
  }
}

function resourceClean() {
  return stageListeners.activeCount() === 0 && windowListeners.activeCount() === 0 && pendingRafCallbacks.size === 0;
}

async function runScenarioGroupC(laneId, presetId) {
  const baseline = (await measureCleanStrokeBaseline(laneId, presetId, ["strokeB"])).snapshots[0];
  const program = presetById(presetId);
  const env = makeEnv();

  stageListeners.setTracking(true);
  windowListeners.setTracking(true);
  const c1Errors = [];
  const c1Ends = [];
  const c1Iterations = [];

  const sessionC1 = await LiveStrokeSession.create(
    makeSessionConfig(() => laneById(laneId).create(), program, env, {
      onStrokeEnd: (res) => c1Ends.push(res),
      onError: (err) => c1Errors.push(String(err?.message ?? err)),
    }),
  );

  try {
    for (let iter = 1; iter <= MAX_RECREATE_ITERATIONS; iter += 1) {
      const detach = sessionC1.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
      const attachedStageCount = stageListeners.activeCount();
      const attachedWindowCount = windowListeners.activeCount();
      const started = await startRealDomStrokeFirstBatch(STROKE_PATHS.canceledMid);
      detach();
      detach();
      const detachedStageCount = stageListeners.activeCount();
      const detachedWindowCount = windowListeners.activeCount();
      await releaseRealDomMouseAt(started.lastFirstPt);
      await flushAnimationFrames(1);
      await settleMicrotasks();
      c1Iterations.push({
        iteration: iter,
        attachedStageCount,
        attachedWindowCount,
        detachedStageCount,
        detachedWindowCount,
        strokesAfterMidDetach: sessionC1.strokes,
        ok: attachedStageCount > 0 && attachedWindowCount > 0 && detachedStageCount === 0 && detachedWindowCount === 0 && sessionC1.strokes === 0,
      });
    }

    const finalDetach = sessionC1.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
    await drawRealDomStrokeTwoBatches(STROKE_PATHS.strokeB);
    await settleMicrotasks();
    const cmpC1 = matchEndToBaseline(baseline, c1Ends[c1Ends.length - 1], sessionC1.strokes);
    finalDetach();
    sessionC1.dispose();

    const subcaseC1 = {
      scenarioId: `C1-attach-detach-3x-${laneId}-${presetId}`,
      iterations: c1Iterations,
      afterDisposeStageListeners: stageListeners.activeCount(),
      afterDisposeWindowListeners: windowListeners.activeCount(),
      pendingRafCount: pendingRafCallbacks.size,
      strokeCount: sessionC1.strokes,
      errorsCount: c1Errors.length,
      ...cmpC1,
      ok: c1Iterations.length === MAX_RECREATE_ITERATIONS && c1Iterations.every((it) => it.ok) && resourceClean() && c1Errors.length === 0 && cmpC1.matched,
    };
    const c2Iterations = [];
    const opsByIter = ["beginStroke", "addSamples", "endStroke"];
    for (let iter = 1; iter <= MAX_RECREATE_ITERATIONS; iter += 1) {
      stageListeners.reset();
      windowListeners.reset();
      const heldOp = opsByIter[(iter - 1) % opsByIter.length];
      const faultLane = createFaultInjectionLane({ inner: laneById(laneId).create() });
      let lateCallbacks = 0;
      let disposedFlag = false;
      const bumpLate = () => {
        if (disposedFlag) lateCallbacks += 1;
      };
      const iterSession = await LiveStrokeSession.create(
        makeSessionConfig(() => faultLane, program, env, { onStrokeEnd: bumpLate, onError: bumpLate, onStrokeAbort: bumpLate }),
      );
      iterSession.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
      const gate = faultLane.holdNext(heldOp);
      const started = await startRealDomStrokeFirstBatch(STROKE_PATHS.race);
      if (heldOp === "endStroke") await finishRealDomStrokeSecondBatch(STROKE_PATHS.race, started.midIndex);
      await gate.entered;
      disposedFlag = true;
      iterSession.dispose();
      iterSession.dispose();
      if (heldOp !== "endStroke") await releaseRealDomMouseAt(started.lastFirstPt);
      if (iter % 2 === 0) gate.reject(new Error("late rejection after dispose"));
      else gate.resolve();
      await flushAnimationFrames(1);
      await settleMicrotasks(4);
      c2Iterations.push({
        iteration: iter,
        heldOp,
        laneDisposedCount: faultLane.disposedCount,
        postDisposeCalls: faultLane.postDisposeCalls.length,
        lateCallbacks,
        activeStageListeners: stageListeners.activeCount(),
        activeWindowListeners: windowListeners.activeCount(),
        pendingRafCount: pendingRafCallbacks.size,
        ok: faultLane.disposedCount === 1 && faultLane.postDisposeCalls.length === 0 && lateCallbacks === 0 && resourceClean(),
      });
    }
    const recreatedEnds = [];
    const recreatedErrors = [];
    const recreatedSession = await LiveStrokeSession.create(
      makeSessionConfig(() => laneById(laneId).create(), program, env, {
        onStrokeEnd: (res) => recreatedEnds.push(res),
        onError: (err) => recreatedErrors.push(String(err?.message ?? err)),
      }),
    );
    recreatedSession.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
    await drawRealDomStrokeTwoBatches(STROKE_PATHS.strokeB);
    await settleMicrotasks();
    const cmpC2 = matchEndToBaseline(baseline, recreatedEnds[recreatedEnds.length - 1], recreatedSession.strokes);
    recreatedSession.dispose();
    const subcaseC2 = {
      scenarioId: `C2-dispose-recreate-3x-${laneId}-${presetId}`,
      iterations: c2Iterations,
      recreatedStrokeCount: recreatedSession.strokes,
      afterFinalDisposeStageListeners: stageListeners.activeCount(),
      afterFinalDisposeWindowListeners: windowListeners.activeCount(),
      pendingRafCount: pendingRafCallbacks.size,
      errorsCount: recreatedErrors.length,
      ...cmpC2,
      ok: c2Iterations.length === MAX_RECREATE_ITERATIONS && c2Iterations.every((it) => it.ok) && recreatedErrors.length === 0 && cmpC2.matched && resourceClean(),
    };
    return {
      laneId,
      presetId,
      maxRecreateIterations: MAX_RECREATE_ITERATIONS,
      evidenceClassification: evidenceMeta(false, true),
      totalRafRequested,
      totalRafCanceled,
      subcaseC1,
      subcaseC2,
      ok: subcaseC1.ok && subcaseC2.ok,
    };
  } finally {
    stageListeners.setTracking(false);
    windowListeners.setTracking(false);
    pendingRafCallbacks.clear();
  }
}

window.__brushLabLifecycleProbe = { getSourceProvenance, runScenarioGroupA, runScenarioGroupB, runScenarioGroupC, getDomInputAudit: () => ({ ...domInputAudit }) };
window.__brushLabLifecycleProbeReady = true;
