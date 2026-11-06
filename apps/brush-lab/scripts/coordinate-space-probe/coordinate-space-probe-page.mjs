// 브라우저 좌표계 회귀 프로브 페이지 모듈. scripts/coordinate-space-probe/coordinate-space-probe.mjs가 Vite dev 서버로 이 모듈을 열고
// CDP Emulation.setDeviceMetricsOverride + Input.dispatchMouseEvent(실제 DOM 포인터 이벤트)와 window.__brushLabCoordinateProbe를 결합해
// 5단계 좌표계 계약(client → rect → normalized → document → backing store), DPR 1/2/3, 뷰포트 320/390/768/1280,
// 스크롤·오프셋·CSS scale(0.75/1.25)·fitDocumentSize, 획 도중 리사이즈+취소, 퇴화 경계(0×0/숨김/비유한/극단 좌표), 음성 대조군을 검증한다.
import { LiveStrokeSession } from "../../src/app/state/live-session.ts";
import liveSessionRaw from "../../src/app/state/live-session.ts?raw";
import { pixelHash } from "../../src/bench/metrics/render-metrics.ts";
import { presetById } from "../../src/engine/presets/catalog.ts";
import { embeddedKernelBytes, SUMI_KERNEL_SHA256 } from "../../src/engine/wasm/embedded.ts";
import { laneById } from "../../src/lanes/registry.ts";
import { clearCanvas, displayScale, fitDocumentSize, presentLabImage, presentPreview } from "../../src/platform/canvas-present.ts";
import canvasPresentRaw from "../../src/platform/canvas-present.ts?raw";
import pointerCaptureRaw from "../../src/platform/pointer-capture.ts?raw";

const DEFAULT_DOC_SIZE = 256;
const BASE_SEED = 7070;

const scrollHostEl = document.getElementById("coord-scroll-host");
const spacerEl = document.getElementById("coord-spacer");
const transformHostEl = document.getElementById("coord-transform-host");
const stageEl = document.getElementById("coord-stage");
const presentEl = document.getElementById("coord-present");
const previewEl = document.getElementById("coord-preview");

if (
  !(scrollHostEl instanceof HTMLDivElement) ||
  !(spacerEl instanceof HTMLDivElement) ||
  !(transformHostEl instanceof HTMLDivElement) ||
  !(stageEl instanceof HTMLDivElement) ||
  !(presentEl instanceof HTMLCanvasElement) ||
  !(previewEl instanceof HTMLCanvasElement)
) {
  throw new Error("coordinate-space-probe 필수 DOM 요소를 찾지 못했다");
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

const origRaf = window.requestAnimationFrame.bind(window);
const origCaf = window.cancelAnimationFrame.bind(window);
let nextRafId = 1;
const pendingRafCallbacks = new Map();

window.requestAnimationFrame = (cb) => {
  const id = nextRafId++;
  pendingRafCallbacks.set(id, cb);
  return id;
};
window.cancelAnimationFrame = (id) => {
  if (pendingRafCallbacks.delete(id)) return;
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

function createCoordinatePreservingTransform() {
  let sampleStep = 0;
  return (rawInput) =>
    rawInput
      .filter((s) => s.source === "raw")
      .map((s) => {
        sampleStep = s.phase === "down" ? 0 : sampleStep + 1;
        return { ...s, pressure: 0.7, tMs: 1000 + sampleStep * 8 };
      });
}

function inkWeightOfPixel(d, idx) {
  const a = d[idx + 3] ?? 0;
  const darkness = Math.abs(255 - (d[idx] ?? 255)) + Math.abs(255 - (d[idx + 1] ?? 255)) + Math.abs(255 - (d[idx + 2] ?? 255));
  return a < 255 ? a : darkness > 24 ? Math.min(255, darkness) : 0;
}

function analyzeImageInk(image, baseImage = null) {
  const { width, height, data } = image;
  const baseData = baseImage?.data ?? null;
  let inkPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const curW = inkWeightOfPixel(data, idx);
      const prevW = baseData ? inkWeightOfPixel(baseData, idx) : 0;
      const w = baseData ? Math.max(0, curW - prevW) : curW;
      if (w >= 8) {
        inkPixels += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        sumW += w;
        sumWX += (x + 0.5) * w;
        sumWY += (y + 0.5) * w;
      }
    }
  }
  return {
    inkPixels,
    boundsDocPx: inkPixels > 0 ? [minX, minY, maxX, maxY] : null,
    centroidDocPx: sumW > 0 ? { x: sumWX / sumW, y: sumWY / sumW } : { x: Number.NaN, y: Number.NaN },
  };
}

function interpolateNormalizedSegment(u0, v0, u1, v1, steps = 10) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    pts.push({ u: u0 + (u1 - u0) * t, v: v0 + (v1 - v0) * t });
  }
  pts.push({ u: u1, v: v1 }, { u: u1, v: v1 });
  return pts;
}

const CANONICAL_NORMALIZED_STROKES = {
  horizontalCrosshair: interpolateNormalizedSegment(0.15, 0.5, 0.85, 0.5, 10),
  verticalCrosshair: interpolateNormalizedSegment(0.5, 0.15, 0.5, 0.85, 10),
  topLeftEdge: interpolateNormalizedSegment(0.06, 0.06, 0.18, 0.06, 6),
  bottomRightEdge: interpolateNormalizedSegment(0.82, 0.94, 0.94, 0.94, 6),
};
const CANONICAL_STROKE_KEYS = ["horizontalCrosshair", "verticalCrosshair", "topLeftEdge", "bottomRightEdge"];

async function setBrowserMetrics(viewportW, viewportH, dpr) {
  if (typeof window.__brushLabCdpSetMetrics === "function") {
    await window.__brushLabCdpSetMetrics({ width: viewportW, height: viewportH, dpr });
  }
  await flushAnimationFrames(1);
  await settleMicrotasks(2);
}

function configureStageLayout(mode, viewportW, viewportH, dpr) {
  scrollHostEl.style.width = `${viewportW}px`;
  scrollHostEl.style.height = `${viewportH}px`;
  scrollHostEl.scrollLeft = 0;
  scrollHostEl.scrollTop = 0;
  window.scrollTo(0, 0);
  spacerEl.style.paddingLeft = "16px";
  spacerEl.style.paddingTop = "16px";
  transformHostEl.style.transform = "none";
  transformHostEl.style.transformOrigin = "top left";
  stageEl.style.display = "block";
  stageEl.style.visibility = "visible";

  let docW = DEFAULT_DOC_SIZE;
  let docH = DEFAULT_DOC_SIZE;
  let cssW;
  let cssH;
  let fitMeta = null;

  if (mode === "baseline") {
    const maxCss = Math.max(192, Math.min(256, viewportW - 32));
    const scale = displayScale({ width: docW, height: docH }, maxCss);
    cssW = Math.round(docW * scale);
    cssH = Math.round(docH * scale);
    spacerEl.style.paddingLeft = `${Math.max(12, Math.floor((viewportW - cssW) / 2))}px`;
    spacerEl.style.paddingTop = "24px";
  } else if (mode === "offset-scroll") {
    cssW = viewportW <= 340 ? 200 : 256;
    cssH = cssW;
    spacerEl.style.paddingLeft = "124px";
    spacerEl.style.paddingTop = "156px";
  } else if (mode === "css-scale-0.75") {
    cssW = 256;
    cssH = 256;
    transformHostEl.style.transform = "scale(0.75)";
    spacerEl.style.paddingLeft = "20px";
    spacerEl.style.paddingTop = "24px";
  } else if (mode === "css-scale-1.25") {
    cssW = viewportW <= 360 ? 192 : 256;
    cssH = cssW;
    transformHostEl.style.transform = "scale(1.25)";
    spacerEl.style.paddingLeft = "16px";
    spacerEl.style.paddingTop = "20px";
  } else if (mode === "fit-dpr") {
    const availW = Math.min(256, Math.max(160, viewportW - 48));
    fitMeta = fitDocumentSize(availW, availW, dpr);
    docW = fitMeta.document.width;
    docH = fitMeta.document.height;
    cssW = fitMeta.css.width;
    cssH = fitMeta.css.height;
    spacerEl.style.paddingLeft = "20px";
    spacerEl.style.paddingTop = "24px";
  } else {
    throw new Error(`알 수 없는 좌표계 프로브 모드: ${mode}`);
  }

  stageEl.style.width = `${cssW}px`;
  stageEl.style.height = `${cssH}px`;
  presentEl.width = docW;
  presentEl.height = docH;
  previewEl.width = docW;
  previewEl.height = docH;
  if (mode === "offset-scroll") {
    scrollHostEl.scrollLeft = 96;
    scrollHostEl.scrollTop = 124;
  }

  const rect = stageEl.getBoundingClientRect();
  return {
    docW,
    docH,
    cssW,
    cssH,
    fitMeta,
    scrollOffset: { scrollLeft: scrollHostEl.scrollLeft, scrollTop: scrollHostEl.scrollTop },
    rectCss: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
  };
}

async function dispatchNormalizedDomStroke(normPoints, docW, docH) {
  if (typeof window.__brushLabCdpDispatchMouse !== "function") {
    throw new Error("__brushLabCdpDispatchMouse 바인딩이 등록되지 않았다");
  }
  const rect = stageEl.getBoundingClientRect();
  const expectedSamples = [];
  const events = [];

  for (let i = 0; i < normPoints.length; i += 1) {
    const pt = normPoints[i];
    const clientX = Math.round(rect.left + pt.u * rect.width);
    const clientY = Math.round(rect.top + pt.v * rect.height);
    const uActual = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const vActual = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
    const expectedDoc = { x: uActual * docW, y: vActual * docH };
    const isDown = i === 0;
    events.push({ type: isDown ? "mousePressed" : "mouseMoved", x: clientX, y: clientY, button: "left", buttons: 1, clickCount: isDown ? 1 : 0 });
    expectedSamples.push({ phase: isDown ? "down" : "move", clientX, clientY, expected: expectedDoc });
    if (i === normPoints.length - 1) {
      events.push({ type: "mouseReleased", x: clientX, y: clientY, button: "left", buttons: 0, clickCount: 1 });
      expectedSamples.push({ phase: "up", clientX, clientY, expected: expectedDoc });
    }
  }

  const releaseEv = events.pop();
  await window.__brushLabCdpDispatchMouse(events);
  const hadCaptureMidStroke = stageEl.hasPointerCapture(1);
  await flushAnimationFrames(1);
  await window.__brushLabCdpDispatchMouse([releaseEv]);
  await flushAnimationFrames(1);
  await settleMicrotasks(4);
  return { expectedSamples, hadCaptureMidStroke };
}

async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSourceProvenance() {
  const enc = new TextEncoder();
  const [pointerCaptureTs, canvasPresentTs, liveSessionTs, sumiKernelWasm] = await Promise.all([
    sha256HexOfBytes(enc.encode(pointerCaptureRaw)),
    sha256HexOfBytes(enc.encode(canvasPresentRaw)),
    sha256HexOfBytes(enc.encode(liveSessionRaw)),
    sha256HexOfBytes(embeddedKernelBytes()),
  ]);
  return {
    buildMode: "vite-dev-live-source",
    sumiKernelDeclaredSha256: SUMI_KERNEL_SHA256,
    sourceHashes: { pointerCaptureTs, canvasPresentTs, liveSessionTs, sumiKernelWasm },
  };
}

function makeCoordSessionOptions(laneId, presetId, docW, docH, callbacks = {}) {
  return {
    createLane: () => laneById(laneId).create(),
    env: makeEnv(),
    program: presetById(presetId),
    seed: BASE_SEED,
    width: docW,
    height: docH,
    presentCanvas: presentEl,
    skipLinear: true,
    transformSamples: createCoordinatePreservingTransform(),
    inputStage: null,
    ...callbacks,
  };
}

async function runMatrixCase(config) {
  const { laneId, presetId, dpr = 1, viewportW = 1280, viewportH = 900, mode = "baseline" } = config;
  await setBrowserMetrics(viewportW, viewportH, dpr);
  const layout = configureStageLayout(mode, viewportW, viewportH, dpr);
  const { docW, docH } = layout;
  const program = presetById(presetId);
  const strokeEnds = [];
  const errors = [];
  const samplePairs = [];

  const session = await LiveStrokeSession.create(
    makeCoordSessionOptions(laneId, presetId, docW, docH, {
      onPreview: (pts) => presentPreview(previewEl, pts, program.tip.sizePx / 2),
      onStrokeEnd: (res) => {
        presentLabImage(presentEl, res.image);
        strokeEnds.push(res);
      },
      onError: (err) => errors.push(String(err?.message ?? err)),
    }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });

  try {
    let crosshairIntersectionDocPx = { x: Number.NaN, y: Number.NaN };
    let allCaptured = true;
    for (let sIdx = 0; sIdx < CANONICAL_STROKE_KEYS.length; sIdx += 1) {
      const key = CANONICAL_STROKE_KEYS[sIdx];
      const prevEnds = strokeEnds.length;
      const dispatched = await dispatchNormalizedDomStroke(CANONICAL_NORMALIZED_STROKES[key], docW, docH);
      allCaptured = allCaptured && dispatched.hadCaptureMidStroke;
      const latestEnd = strokeEnds[strokeEnds.length - 1];
      if (strokeEnds.length === prevEnds + 1 && latestEnd) {
        const count = Math.min(dispatched.expectedSamples.length, latestEnd.samples.length);
        for (let i = 0; i < count; i += 1) {
          samplePairs.push({ expected: dispatched.expectedSamples[i].expected, actual: { x: latestEnd.samples[i].x, y: latestEnd.samples[i].y } });
        }
      }
      if (sIdx === 1 && latestEnd && strokeEnds[0]) {
        const horizY = analyzeImageInk(strokeEnds[0].image).centroidDocPx.y;
        const vertX = analyzeImageInk(latestEnd.image, strokeEnds[0].image).centroidDocPx.x;
        crosshairIntersectionDocPx = { x: vertX, y: horizY };
      }
    }

    const finalEnd = strokeEnds[strokeEnds.length - 1] ?? null;
    const finalInk = finalEnd ? analyzeImageInk(finalEnd.image) : { inkPixels: 0, boundsDocPx: null };
    const totalDabs = strokeEnds.reduce((acc, r) => acc + (r.receipt?.dabCount ?? 0), 0);
    let maxSampleCoordErrorDocPx = 0;
    for (const pair of samplePairs) {
      maxSampleCoordErrorDocPx = Math.max(maxSampleCoordErrorDocPx, Math.hypot(pair.actual.x - pair.expected.x, pair.actual.y - pair.expected.y));
    }

    return {
      caseId: `matrix-${laneId}-${presetId}-dpr${dpr}-vw${viewportW}-${mode}`,
      laneId,
      presetId,
      mode,
      viewport: { width: viewportW, height: viewportH },
      requestedDpr: dpr,
      windowDpr: window.devicePixelRatio,
      rectCss: layout.rectCss,
      scrollOffset: layout.scrollOffset,
      documentDimensions: { width: docW, height: docH },
      backingDimensions: { width: presentEl.width, height: presentEl.height },
      fitReduced: layout.fitMeta?.reduced ?? false,
      strokeCount: session.strokes,
      dabCount: totalDabs,
      inkPixels: finalInk.inkPixels,
      hash: finalEnd ? pixelHash(finalEnd.image) : "",
      hadPointerCapture: allCaptured,
      errorsCount: errors.length,
      samplePairsCount: samplePairs.length,
      maxSampleCoordErrorDocPx,
      crosshairIntersectionDocPx,
      intersectionErrorDocPx: Math.hypot(crosshairIntersectionDocPx.x - docW * 0.5, crosshairIntersectionDocPx.y - docH * 0.5),
      inkBoundsDocPx: finalInk.boundsDocPx,
      brushRadiusPadDocPx: Math.max(2, program.tip.sizePx * 0.35),
    };
  } finally {
    detach();
    session.dispose();
    clearCanvas(presentEl);
    clearCanvas(previewEl);
    pendingRafCallbacks.clear();
  }
}

async function runMidStrokeAndResizeLifecycleCase(config) {
  const { laneId = "cpu-reference", presetId = "ink-g-pen" } = config ?? {};
  const docW = DEFAULT_DOC_SIZE;
  const docH = DEFAULT_DOC_SIZE;
  await setBrowserMetrics(1280, 900, 1);
  configureStageLayout("baseline", 1280, 900, 1);

  const strokeEnds = [];
  const aborts = [];
  const errors = [];
  const session = await LiveStrokeSession.create(
    makeCoordSessionOptions(laneId, presetId, docW, docH, {
      onStrokeEnd: (res) => {
        presentLabImage(presentEl, res.image);
        strokeEnds.push(res);
      },
      onStrokeAbort: (abort) => aborts.push(abort),
      onError: (err) => errors.push(String(err?.message ?? err)),
    }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });

  try {
    await dispatchNormalizedDomStroke(interpolateNormalizedSegment(0.2, 0.25, 0.8, 0.25, 8), docW, docH);
    const afterStroke1 = strokeEnds[0];
    const stroke1Ink = analyzeImageInk(afterStroke1.image);
    const stroke1Hash = pixelHash(afterStroke1.image);

    const rectBeforeMid = stageEl.getBoundingClientRect();
    const midPoints = interpolateNormalizedSegment(0.2, 0.55, 0.6, 0.55, 5);
    await window.__brushLabCdpDispatchMouse(
      midPoints.map((pt, idx) => ({
        type: idx === 0 ? "mousePressed" : "mouseMoved",
        x: Math.round(rectBeforeMid.left + pt.u * rectBeforeMid.width),
        y: Math.round(rectBeforeMid.top + pt.v * rectBeforeMid.height),
        button: "left",
        buttons: 1,
        clickCount: idx === 0 ? 1 : 0,
      })),
    );
    await flushAnimationFrames(1);

    await setBrowserMetrics(390, 844, 2);
    configureStageLayout("offset-scroll", 390, 844, 2);
    if (stageEl.hasPointerCapture(1)) stageEl.releasePointerCapture(1);
    stageEl.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: false, cancelable: false, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    stageEl.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: 120, clientY: 120 }));
    await flushAnimationFrames(1);
    await settleMicrotasks(4);
    await window.__brushLabCdpDispatchMouse([{ type: "mouseReleased", x: 120, y: 120, button: "left", buttons: 0, clickCount: 1 }]);
    await flushAnimationFrames(1);
    await settleMicrotasks(4);

    const imageAfterCancel = await session.currentLane.readback();
    const inkAfterCancel = analyzeImageInk(imageAfterCancel);
    const hashAfterCancel = pixelHash(imageAfterCancel);

    const stroke2Dispatched = await dispatchNormalizedDomStroke(interpolateNormalizedSegment(0.2, 0.75, 0.8, 0.75, 8), docW, docH);
    const afterStroke2 = strokeEnds[strokeEnds.length - 1];
    const combinedInk = analyzeImageInk(afterStroke2.image);

    let postResizeMaxSampleErr = 0;
    const count = Math.min(stroke2Dispatched.expectedSamples.length, afterStroke2.samples.length);
    for (let i = 0; i < count; i += 1) {
      const exp = stroke2Dispatched.expectedSamples[i].expected;
      const act = afterStroke2.samples[i];
      postResizeMaxSampleErr = Math.max(postResizeMaxSampleErr, Math.hypot(act.x - exp.x, act.y - exp.y));
    }

    const stroke1Preserved =
      session.strokes === 2 &&
      aborts.length === 1 &&
      aborts[0]?.receipt?.documentPreserved === true &&
      aborts[0]?.laneReplaced === false &&
      hashAfterCancel === stroke1Hash &&
      inkAfterCancel.inkPixels === stroke1Ink.inkPixels &&
      JSON.stringify(inkAfterCancel.boundsDocPx) === JSON.stringify(stroke1Ink.boundsDocPx);
    const postResizeAccurate =
      postResizeMaxSampleErr <= 0.5 &&
      combinedInk.inkPixels > stroke1Ink.inkPixels + 40 &&
      combinedInk.boundsDocPx !== null &&
      Math.abs(combinedInk.boundsDocPx[1] - stroke1Ink.boundsDocPx[1]) <= 1 &&
      Math.abs(combinedInk.boundsDocPx[3] - docH * 0.75) <= 12;

    return {
      caseId: `mid-stroke-resize-${laneId}-${presetId}`,
      laneId,
      presetId,
      ok: stroke1Preserved && postResizeAccurate && errors.length === 0,
      stroke1InkPixels: stroke1Ink.inkPixels,
      stroke1BoundsDocPx: stroke1Ink.boundsDocPx,
      inkPixelsAfterCancel: inkAfterCancel.inkPixels,
      boundsAfterCancelDocPx: inkAfterCancel.boundsDocPx,
      abortCount: aborts.length,
      documentPreserved: aborts[0]?.receipt?.documentPreserved ?? false,
      combinedInkPixels: combinedInk.inkPixels,
      combinedBoundsDocPx: combinedInk.boundsDocPx,
      postResizeMaxSampleErr,
      finalStrokeCount: session.strokes,
      errorsCount: errors.length,
    };
  } finally {
    detach();
    session.dispose();
    clearCanvas(presentEl);
    pendingRafCallbacks.clear();
  }
}

async function runDegenerateAndEdgeGuardCase(laneId = "cpu-reference", presetId = "ink-g-pen") {
  const docW = DEFAULT_DOC_SIZE;
  const docH = DEFAULT_DOC_SIZE;
  await setBrowserMetrics(1280, 900, 1);
  configureStageLayout("baseline", 1280, 900, 1);

  const strokeEnds = [];
  const errors = [];
  const capturedSamples = [];
  const session = await LiveStrokeSession.create(
    makeCoordSessionOptions(laneId, presetId, docW, docH, {
      onCanonical: (samples) => {
        for (const s of samples) capturedSamples.push({ x: s.x, y: s.y, phase: s.phase });
      },
      onStrokeEnd: (res) => strokeEnds.push(res),
      onError: (err) => errors.push(String(err?.message ?? err)),
    }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });

  const dispatchSyntheticSequence = (cx, cy) => {
    for (const type of ["pointerdown", "pointermove", "pointerup"]) {
      stageEl.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: cx, clientY: cy }),
      );
    }
  };

  try {
    stageEl.style.width = "0px";
    stageEl.style.height = "0px";
    dispatchSyntheticSequence(80, 80);
    await flushAnimationFrames(1);
    await settleMicrotasks(4);
    const strokesDuringZeroSize = session.strokes;

    stageEl.style.width = "256px";
    stageEl.style.height = "256px";
    stageEl.style.display = "none";
    dispatchSyntheticSequence(100, 100);
    await flushAnimationFrames(1);
    await settleMicrotasks(4);
    const strokesDuringHidden = session.strokes;

    stageEl.style.display = "block";
    const rect = stageEl.getBoundingClientRect();
    await window.__brushLabCdpDispatchMouse([
      { type: "mousePressed", x: Math.round(rect.left + 64), y: Math.round(rect.top + 128), button: "left", buttons: 1, clickCount: 1 },
      { type: "mouseMoved", x: Math.round(rect.left + 96), y: Math.round(rect.top + 128), button: "left", buttons: 1, clickCount: 0 },
      { type: "mouseMoved", x: Math.round(rect.left + 128), y: Math.round(rect.top + 128), button: "left", buttons: 1, clickCount: 0 },
    ]);
    await flushAnimationFrames(1);

    stageEl.style.display = "none";
    await window.__brushLabCdpDispatchMouse([
      { type: "mouseMoved", x: Math.round(rect.left + 160), y: Math.round(rect.top + 128), button: "left", buttons: 1, clickCount: 0 },
      { type: "mouseReleased", x: Math.round(rect.left + 160), y: Math.round(rect.top + 128), button: "left", buttons: 0, clickCount: 1 },
    ]);
    await flushAnimationFrames(1);
    await settleMicrotasks(4);

    const midHideStroke = strokeEnds[strokeEnds.length - 1];
    const midHideUpSample = midHideStroke?.samples[midHideStroke.samples.length - 1] ?? null;
    const midHideNoJump =
      midHideUpSample !== null &&
      Number.isFinite(midHideUpSample.x) &&
      Number.isFinite(midHideUpSample.y) &&
      Math.abs(midHideUpSample.x - 128) <= 1.5 &&
      Math.abs(midHideUpSample.y - 128) <= 1.5;

    stageEl.style.display = "block";
    const origGetRect = stageEl.getBoundingClientRect.bind(stageEl);
    stageEl.getBoundingClientRect = () => ({ left: Number.NaN, top: Number.POSITIVE_INFINITY, width: Number.NaN, height: 256, right: Number.NaN, bottom: Number.POSITIVE_INFINITY, x: Number.NaN, y: Number.POSITIVE_INFINITY, toJSON: () => ({}) });
    stageEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1, clientX: 50, clientY: 50 }));
    stageEl.getBoundingClientRect = origGetRect;

    const recoveryStroke = await dispatchNormalizedDomStroke(CANONICAL_NORMALIZED_STROKES.horizontalCrosshair, docW, docH);
    const allFiniteAndClamped = capturedSamples.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Math.abs(s.x) <= 16384 && Math.abs(s.y) <= 16384);

    return {
      caseId: `degenerate-edge-guards-${laneId}-${presetId}`,
      ok: strokesDuringZeroSize === 0 && strokesDuringHidden === 0 && midHideNoJump && session.strokes === 2 && allFiniteAndClamped && errors.length === 0,
      strokesDuringZeroSize,
      strokesDuringHidden,
      midHideNoJump,
      midHideUpSample,
      finalStrokeCount: session.strokes,
      recoveryCaptured: recoveryStroke.hadCaptureMidStroke,
      allFiniteAndClamped,
      errorsCount: errors.length,
    };
  } finally {
    detach();
    session.dispose();
    clearCanvas(presentEl);
    pendingRafCallbacks.clear();
  }
}

async function runBuggyTransformSubcase(laneId, presetId, docW, docH, mutateSample) {
  const samplePairs = [];
  const ends = [];
  const baseTransform = createCoordinatePreservingTransform();
  const session = await LiveStrokeSession.create(
    makeCoordSessionOptions(laneId, presetId, docW, docH, {
      transformSamples: (raw) => baseTransform(raw).map(mutateSample),
      onStrokeEnd: (res) => ends.push(res),
    }),
  );
  const detach = session.attach(stageEl, { primaryButtonOnly: true, blockContextMenu: true });
  let actualIntersectionDocPx = { x: Number.NaN, y: Number.NaN };
  try {
    for (const key of CANONICAL_STROKE_KEYS) {
      const dispatched = await dispatchNormalizedDomStroke(CANONICAL_NORMALIZED_STROKES[key], docW, docH);
      const latest = ends[ends.length - 1];
      if (latest) {
        const count = Math.min(dispatched.expectedSamples.length, latest.samples.length);
        for (let i = 0; i < count; i += 1) {
          samplePairs.push({ expected: dispatched.expectedSamples[i].expected, actual: { x: latest.samples[i].x, y: latest.samples[i].y } });
        }
      }
      if (key === "verticalCrosshair" && latest && ends[0]) {
        const horizY = analyzeImageInk(ends[0].image).centroidDocPx.y;
        const vertX = analyzeImageInk(latest.image, ends[0].image).centroidDocPx.x;
        actualIntersectionDocPx = { x: vertX, y: horizY };
      }
    }
    const finalEnd = ends[ends.length - 1];
    return {
      documentDimensions: { width: docW, height: docH },
      backingDimensions: { width: docW, height: docH },
      samplePairs,
      actualIntersectionDocPx,
      actualBoundsDocPx: finalEnd ? analyzeImageInk(finalEnd.image).boundsDocPx : null,
    };
  } finally {
    detach();
    session.dispose();
    clearCanvas(presentEl);
    pendingRafCallbacks.clear();
  }
}

async function runNegativeControlCase(laneId = "cpu-reference", presetId = "ink-g-pen") {
  const docW = DEFAULT_DOC_SIZE;
  const docH = DEFAULT_DOC_SIZE;
  await setBrowserMetrics(1280, 900, 2);
  configureStageLayout("offset-scroll", 1280, 900, 2);

  const doubleDprBug = await runBuggyTransformSubcase(laneId, presetId, docW, docH, (s) => ({
    ...s,
    x: s.x * window.devicePixelRatio,
    y: s.y * window.devicePixelRatio,
  }));
  const uncompensatedScrollBug = await runBuggyTransformSubcase(laneId, presetId, docW, docH, (s) => ({
    ...s,
    x: s.x - scrollHostEl.scrollLeft,
    y: s.y - scrollHostEl.scrollTop,
  }));
  return { doubleDprBug, uncompensatedScrollBug };
}

window.__brushLabCoordinateProbe = {
  getSourceProvenance,
  runMatrixCase,
  runMidStrokeAndResizeLifecycleCase,
  runDegenerateAndEdgeGuardCase,
  runNegativeControlCase,
  getDomInputAudit: () => ({ ...domInputAudit }),
};
window.__brushLabCoordinateProbeReady = true;
