// 브라우저 교차 크기 스테이징·스냅샷-롤백 원자성(Presentation Atomicity) 회귀 프로브 페이지 모듈.
// scripts/presentation-atomicity-probe/presentation-atomicity-probe.mjs가 Vite dev 서버로 이 모듈을 열고
// window.__brushLabPresentationAtomicityProbe를 호출해 스테이징 비용 상한, 교차 크기 1회성 putImageData 결함 시
// 스냅샷 기반 원자적 롤백, 영구 결함·오염 캔버스 경계 정직 기록, 음성 대조군 2종을 실제 Chromium DOM에서 검증한다.
import liveSessionRaw from "../../src/app/state/live-session.ts?raw";
import { pixelHash } from "../../src/bench/metrics/render-metrics.ts";
import { presetById } from "../../src/engine/presets/catalog.ts";
import { embeddedKernelBytes, SUMI_KERNEL_SHA256 } from "../../src/engine/wasm/embedded.ts";
import { createCpuReferenceLane } from "../../src/lanes/cpu-reference-lane.ts";
import { createWasmCpuLane } from "../../src/lanes/wasm-cpu-lane.ts";
import {
  clearCanvas,
  getPresentRollbackDiagnostics,
  MAX_LAB_IMAGE_BYTES,
  MAX_LAB_IMAGE_PIXELS,
  MAX_LAB_IMAGE_SIDE_PX,
  presentLabImage,
  presentLabImageWithReceipt,
  validateLabImage,
} from "../../src/platform/canvas-present.ts";
import canvasPresentRaw from "../../src/platform/canvas-present.ts?raw";

const presentCanvas = document.getElementById("atomicity-probe-canvas");
const scratchCanvas = document.getElementById("atomicity-probe-scratch-canvas");

if (!(presentCanvas instanceof HTMLCanvasElement) || !(scratchCanvas instanceof HTMLCanvasElement)) {
  throw new Error("presentation-atomicity-probe 필수 canvas 요소를 찾지 못했다");
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

function buildDiagonalStrokeSamples(width, height, steps = 12) {
  const samples = [];
  const [x0, y0, x1, y1] = [width * 0.16, height * 0.2, width * 0.84, height * 0.8];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    samples.push({
      x: x0 + (x1 - x0) * t,
      y: y0 + (y1 - y0) * t,
      pressure: 0.75,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      tMs: 1000 + i * 8,
      phase: i === 0 ? "down" : i === steps ? "up" : "move",
      source: "raw",
    });
  }
  return samples;
}

function countInkPixels(data) {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    const darkness =
      Math.abs(255 - (data[i] ?? 255)) +
      Math.abs(255 - (data[i + 1] ?? 255)) +
      Math.abs(255 - (data[i + 2] ?? 255));
    const weight = a < 255 ? a : darkness > 24 ? Math.min(255, darkness) : 0;
    if (weight >= 8) count += 1;
  }
  return count;
}

async function renderRealStrokeImage(laneId, presetId, width, height, seed = 9501) {
  const lane = laneId === "wasm-cpu" ? createWasmCpuLane() : createCpuReferenceLane();
  await lane.init(makeEnv(), { width, height, dpr: 1, tileSize: 16 });
  try {
    lane.beginStroke(presetById(presetId), seed);
    lane.addSamples(buildDiagonalStrokeSamples(width, height));
    const receipt = await lane.endStroke();
    const image = await lane.readback();
    return {
      laneId,
      presetId,
      width,
      height,
      dabCount: receipt.dabCount,
      image,
      hash: pixelHash(image),
      inkPixels: countInkPixels(image.data),
    };
  } finally {
    lane.dispose();
  }
}

function readDomCanvasSnapshot(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("readDomCanvasSnapshot: 2D 컨텍스트를 얻지 못했다");
  const { width, height } = canvas;
  if (width <= 0 || height <= 0) {
    return { width, height, hash: "empty-0x0", inkPixels: 0, byteLength: 0 };
  }
  const imgData = ctx.getImageData(0, 0, width, height);
  return {
    width,
    height,
    hash: pixelHash({ width, height, data: imgData.data }),
    inkPixels: countInkPixels(imgData.data),
    byteLength: imgData.data.byteLength,
  };
}

function bytesEqual(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function sha256HexOfBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSourceProvenance() {
  const enc = new TextEncoder();
  const [canvasPresentTs, liveSessionTs, sumiKernelWasm] = await Promise.all([
    sha256HexOfBytes(enc.encode(canvasPresentRaw)),
    sha256HexOfBytes(enc.encode(liveSessionRaw)),
    sha256HexOfBytes(embeddedKernelBytes()),
  ]);
  return {
    buildMode: "vite-dev-live-source",
    sumiKernelDeclaredSha256: SUMI_KERNEL_SHA256,
    constants: { MAX_LAB_IMAGE_SIDE_PX, MAX_LAB_IMAGE_PIXELS, MAX_LAB_IMAGE_BYTES },
    sourceHashes: { canvasPresentTs, liveSessionTs, sumiKernelWasm },
  };
}

async function runStagingCostAndBudgetCase() {
  presentCanvas.width = 64;
  presentCanvas.height = 48;
  clearCanvas(presentCanvas);

  const cpu64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9501);
  const wasm64x48 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 64, 48, 9502);
  const wasm96x64 = await renderRealStrokeImage("wasm-cpu", "ink-g-pen", 96, 64, 9503);

  const initialReceipt = presentLabImageWithReceipt(presentCanvas, cpu64x48.image);
  const initialSnap = readDomCanvasSnapshot(presentCanvas);

  const sameSizeReceipt = presentLabImageWithReceipt(presentCanvas, wasm64x48.image);
  const sameSizeSnap = readDomCanvasSnapshot(presentCanvas);

  const crossSizeReceipt = presentLabImageWithReceipt(presentCanvas, wasm96x64.image);
  const crossSizeSnap = readDomCanvasSnapshot(presentCanvas);

  const overBudgetImg = {
    width: 2049,
    height: 2048,
    data: new Uint8ClampedArray([11, 22, 33, 44]),
  };
  let overBudgetThrew = false;
  let overBudgetCode = null;
  let overBudgetReason = null;
  let overBudgetRollback = null;
  try {
    presentLabImageWithReceipt(presentCanvas, overBudgetImg);
  } catch (error) {
    overBudgetThrew = true;
    overBudgetCode = error?.code ?? null;
    overBudgetReason = error?.details?.reason ?? null;
    overBudgetRollback = getPresentRollbackDiagnostics(error);
  }
  const afterOverBudgetSnap = readDomCanvasSnapshot(presentCanvas);
  clearCanvas(presentCanvas);

  return {
    executionKind: "real-browser-dom",
    initialMount64x48: {
      receipt: initialReceipt,
      expectedHash: cpu64x48.hash,
      domHash: initialSnap.hash,
      inkPixels: initialSnap.inkPixels,
      hashMatched: initialSnap.hash === cpu64x48.hash,
    },
    sameSizeCommit64x48: {
      receipt: sameSizeReceipt,
      expectedHash: wasm64x48.hash,
      domHash: sameSizeSnap.hash,
      inkPixels: sameSizeSnap.inkPixels,
      hashMatched: sameSizeSnap.hash === wasm64x48.hash,
    },
    crossSizeCommit64x48To96x64: {
      receipt: crossSizeReceipt,
      expectedHash: wasm96x64.hash,
      domHash: crossSizeSnap.hash,
      inkPixels: crossSizeSnap.inkPixels,
      hashMatched: crossSizeSnap.hash === wasm96x64.hash,
    },
    overBudgetPrecheck: {
      threw: overBudgetThrew,
      code: overBudgetCode,
      reason: overBudgetReason,
      rollbackAttached: overBudgetRollback !== null,
      canvasWidthAfter: afterOverBudgetSnap.width,
      canvasHeightAfter: afterOverBudgetSnap.height,
      domHashAfter: afterOverBudgetSnap.hash,
      canvasPreserved:
        afterOverBudgetSnap.width === 96 &&
        afterOverBudgetSnap.height === 64 &&
        afterOverBudgetSnap.hash === wasm96x64.hash &&
        afterOverBudgetSnap.inkPixels === crossSizeSnap.inkPixels,
    },
  };
}

async function runCrossSizeAtomicityFaultCase() {
  presentCanvas.width = 64;
  presentCanvas.height = 48;
  clearCanvas(presentCanvas);

  const base64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9601);
  const alt64x48 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 64, 48, 9602);
  const valid96x64 = await renderRealStrokeImage("wasm-cpu", "ink-g-pen", 96, 64, 9603);

  const baseCopy = new Uint8ClampedArray(base64x48.image.data);
  const altCopy = new Uint8ClampedArray(alt64x48.image.data);
  const valid96Copy = new Uint8ClampedArray(valid96x64.image.data);

  presentLabImageWithReceipt(presentCanvas, base64x48.image);
  const baselineSnap = readDomCanvasSnapshot(presentCanvas);

  const ctx = presentCanvas.getContext("2d");
  if (!ctx) throw new Error("2D 컨텍스트 확보 실패");
  const origCreateImageData = ctx.createImageData.bind(ctx);
  const origGetImageData = ctx.getImageData.bind(ctx);
  const origPutImageData = ctx.putImageData.bind(ctx);

  // Subcase A: preResizeStagingFault (ctx.createImageData throws once on 64×48 -> 96×64)
  let subcaseAThrew = false;
  let subcaseAErrorName = null;
  let subcaseARollback = null;
  ctx.createImageData = () => {
    throw new DOMException("Simulated createImageData failure", "NotSupportedError");
  };
  try {
    presentLabImageWithReceipt(presentCanvas, valid96x64.image);
  } catch (error) {
    subcaseAThrew = true;
    subcaseAErrorName = error?.name ?? String(error);
    subcaseARollback = getPresentRollbackDiagnostics(error);
  } finally {
    ctx.createImageData = origCreateImageData;
  }
  const afterSubcaseA = readDomCanvasSnapshot(presentCanvas);

  // Subcase B: sameSizePutFault (ctx.putImageData throws once on 64×48 -> 64×48)
  let subcaseBThrew = false;
  let subcaseBErrorName = null;
  let subcaseBRollback = null;
  ctx.putImageData = () => {
    throw new DOMException("Simulated same-size putImageData failure", "InvalidStateError");
  };
  try {
    presentLabImageWithReceipt(presentCanvas, alt64x48.image);
  } catch (error) {
    subcaseBThrew = true;
    subcaseBErrorName = error?.name ?? String(error);
    subcaseBRollback = getPresentRollbackDiagnostics(error);
  } finally {
    ctx.putImageData = origPutImageData;
  }
  const afterSubcaseB = readDomCanvasSnapshot(presentCanvas);

  // Subcase C: crossSizeTransientPutFault (1-shot putImageData failure on 96×64 commit, rollback putImageData succeeds)
  let subcaseCThrew = false;
  let subcaseCErrorName = null;
  let subcaseCRollback = null;
  let subcaseCPutCalls = 0;
  ctx.putImageData = (...args) => {
    subcaseCPutCalls += 1;
    if (subcaseCPutCalls === 1) {
      throw new DOMException("Simulated transient cross-size putImageData failure", "InvalidStateError");
    }
    return origPutImageData(...args);
  };
  try {
    presentLabImageWithReceipt(presentCanvas, valid96x64.image);
  } catch (error) {
    subcaseCThrew = true;
    subcaseCErrorName = error?.name ?? String(error);
    subcaseCRollback = getPresentRollbackDiagnostics(error);
  } finally {
    ctx.putImageData = origPutImageData;
  }
  const afterSubcaseC = readDomCanvasSnapshot(presentCanvas);
  const subcaseCSourcesUnmutated =
    bytesEqual(baseCopy, base64x48.image.data) &&
    bytesEqual(altCopy, alt64x48.image.data) &&
    bytesEqual(valid96Copy, valid96x64.image.data);

  const subcaseCRecoveredReceipt = presentLabImageWithReceipt(presentCanvas, valid96x64.image);
  const subcaseCRecoveredSnap = readDomCanvasSnapshot(presentCanvas);
  // Restore 64×48 baseline before Subcase D
  presentLabImage(presentCanvas, base64x48.image);

  // Subcase D: crossSizePersistentPutFault (both commit putImageData and rollback putImageData throw)
  let subcaseDThrew = false;
  let subcaseDErrorName = null;
  let subcaseDRollback = null;
  let subcaseDPutCalls = 0;
  ctx.putImageData = () => {
    subcaseDPutCalls += 1;
    throw new DOMException("Simulated persistent putImageData device failure", "InvalidStateError");
  };
  try {
    presentLabImageWithReceipt(presentCanvas, valid96x64.image);
  } catch (error) {
    subcaseDThrew = true;
    subcaseDErrorName = error?.name ?? String(error);
    subcaseDRollback = getPresentRollbackDiagnostics(error);
  } finally {
    ctx.putImageData = origPutImageData;
  }
  const afterSubcaseD = readDomCanvasSnapshot(presentCanvas);
  presentLabImage(presentCanvas, base64x48.image);
  const subcaseDRecoveredSnap = readDomCanvasSnapshot(presentCanvas);

  // Subcase E: crossSizeSnapshotUnavailableFault (getImageData throws SecurityError + 1-shot putImageData failure)
  let subcaseEThrew = false;
  let subcaseEErrorName = null;
  let subcaseERollback = null;
  ctx.getImageData = () => {
    throw new DOMException("Simulated tainted canvas", "SecurityError");
  };
  let subcaseEPutCalls = 0;
  ctx.putImageData = (...args) => {
    subcaseEPutCalls += 1;
    if (subcaseEPutCalls === 1) {
      throw new DOMException("Simulated putImageData failure without snapshot", "InvalidStateError");
    }
    return origPutImageData(...args);
  };
  try {
    presentLabImageWithReceipt(presentCanvas, valid96x64.image);
  } catch (error) {
    subcaseEThrew = true;
    subcaseEErrorName = error?.name ?? String(error);
    subcaseERollback = getPresentRollbackDiagnostics(error);
  } finally {
    ctx.getImageData = origGetImageData;
    ctx.putImageData = origPutImageData;
  }
  const afterSubcaseE = readDomCanvasSnapshot(presentCanvas);
  presentLabImage(presentCanvas, valid96x64.image);
  const subcaseERecoveredSnap = readDomCanvasSnapshot(presentCanvas);
  clearCanvas(presentCanvas);

  return {
    executionKind: "browser-dom-with-injected-context-faults",
    baselineWidth: 64,
    baselineHeight: 48,
    baselineHash: baselineSnap.hash,
    baselineInkPixels: baselineSnap.inkPixels,
    preResizeStagingFault: {
      threw: subcaseAThrew,
      errorName: subcaseAErrorName,
      rollback: subcaseARollback,
      canvasWidthAfter: afterSubcaseA.width,
      canvasHeightAfter: afterSubcaseA.height,
      domHashAfter: afterSubcaseA.hash,
      inkPixelsAfter: afterSubcaseA.inkPixels,
      preserved:
        afterSubcaseA.width === 64 &&
        afterSubcaseA.height === 48 &&
        afterSubcaseA.hash === baselineSnap.hash &&
        afterSubcaseA.inkPixels === baselineSnap.inkPixels,
    },
    sameSizePutFault: {
      threw: subcaseBThrew,
      errorName: subcaseBErrorName,
      rollback: subcaseBRollback,
      canvasWidthAfter: afterSubcaseB.width,
      canvasHeightAfter: afterSubcaseB.height,
      domHashAfter: afterSubcaseB.hash,
      inkPixelsAfter: afterSubcaseB.inkPixels,
      preserved:
        afterSubcaseB.width === 64 &&
        afterSubcaseB.height === 48 &&
        afterSubcaseB.hash === baselineSnap.hash &&
        afterSubcaseB.inkPixels === baselineSnap.inkPixels,
    },
    crossSizeTransientPutFault: {
      threw: subcaseCThrew,
      errorName: subcaseCErrorName,
      putCallCount: subcaseCPutCalls,
      rollback: subcaseCRollback,
      canvasWidthAfter: afterSubcaseC.width,
      canvasHeightAfter: afterSubcaseC.height,
      domHashAfter: afterSubcaseC.hash,
      inkPixelsAfter: afterSubcaseC.inkPixels,
      sourcesUnmutated: subcaseCSourcesUnmutated,
      atomicallyRestored:
        afterSubcaseC.width === 64 &&
        afterSubcaseC.height === 48 &&
        afterSubcaseC.hash === baselineSnap.hash &&
        afterSubcaseC.inkPixels === baselineSnap.inkPixels,
      recoveredWidth: subcaseCRecoveredSnap.width,
      recoveredHeight: subcaseCRecoveredSnap.height,
      recoveredHash: subcaseCRecoveredSnap.hash,
      expectedTargetHash: valid96x64.hash,
      recoveredReceipt: subcaseCRecoveredReceipt,
      recoveredImmediately:
        subcaseCRecoveredSnap.width === 96 &&
        subcaseCRecoveredSnap.height === 64 &&
        subcaseCRecoveredSnap.hash === valid96x64.hash &&
        subcaseCRecoveredSnap.inkPixels > 0,
    },
    crossSizePersistentPutFault: {
      threw: subcaseDThrew,
      errorName: subcaseDErrorName,
      putCallCount: subcaseDPutCalls,
      rollback: subcaseDRollback,
      canvasWidthAfter: afterSubcaseD.width,
      canvasHeightAfter: afterSubcaseD.height,
      domHashAfter: afterSubcaseD.hash,
      inkPixelsAfter: afterSubcaseD.inkPixels,
      nonAtomicPixelsClearedRecorded:
        afterSubcaseD.width === 64 &&
        afterSubcaseD.height === 48 &&
        afterSubcaseD.inkPixels === 0 &&
        subcaseDRollback?.dimensionsRestored === true &&
        subcaseDRollback?.pixelsRestored === false &&
        subcaseDRollback?.atomicityStatus === "dimensions-only-rollback-put-failed",
      recoveredToBaseline:
        subcaseDRecoveredSnap.width === 64 &&
        subcaseDRecoveredSnap.height === 48 &&
        subcaseDRecoveredSnap.hash === baselineSnap.hash &&
        subcaseDRecoveredSnap.inkPixels === baselineSnap.inkPixels,
    },
    crossSizeSnapshotUnavailableFault: {
      threw: subcaseEThrew,
      errorName: subcaseEErrorName,
      putCallCount: subcaseEPutCalls,
      rollback: subcaseERollback,
      canvasWidthAfter: afterSubcaseE.width,
      canvasHeightAfter: afterSubcaseE.height,
      domHashAfter: afterSubcaseE.hash,
      inkPixelsAfter: afterSubcaseE.inkPixels,
      nonAtomicPixelsClearedRecorded:
        afterSubcaseE.width === 64 &&
        afterSubcaseE.height === 48 &&
        afterSubcaseE.inkPixels === 0 &&
        subcaseERollback?.snapshotCaptured === false &&
        subcaseERollback?.dimensionsRestored === true &&
        subcaseERollback?.pixelsRestored === false &&
        subcaseERollback?.atomicityStatus === "dimensions-only-snapshot-unavailable",
      recoveredWidth: subcaseERecoveredSnap.width,
      recoveredHeight: subcaseERecoveredSnap.height,
      recoveredHash: subcaseERecoveredSnap.hash,
      expectedTargetHash: valid96x64.hash,
      recoveredImmediately:
        subcaseERecoveredSnap.width === 96 &&
        subcaseERecoveredSnap.height === 64 &&
        subcaseERecoveredSnap.hash === valid96x64.hash &&
        subcaseERecoveredSnap.inkPixels > 0,
    },
  };
}

async function runAtomicityNegativeControlCase() {
  scratchCanvas.width = 64;
  scratchCanvas.height = 48;
  clearCanvas(scratchCanvas);

  const base64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9701);
  const valid96x64 = await renderRealStrokeImage("wasm-cpu", "ink-g-pen", 96, 64, 9702);

  presentLabImage(scratchCanvas, base64x48.image);
  const beforeSnap = readDomCanvasSnapshot(scratchCanvas);

  // Negative Control 1: pre-rollback 692ce068 behavior on transient 1-shot cross-size putImageData fault
  const ctx = scratchCanvas.getContext("2d");
  if (!ctx) throw new Error("scratchCanvas 2D 컨텍스트 확보 실패");
  const origPut = ctx.putImageData.bind(ctx);
  let legacyCalls = 0;
  ctx.putImageData = (...args) => {
    legacyCalls += 1;
    if (legacyCalls === 1) {
      throw new DOMException("Simulated transient cross-size putImageData fault", "InvalidStateError");
    }
    return origPut(...args);
  };

  const legacyPresentWithoutRollback = (canvas, img) => {
    const spec = validateLabImage(img);
    const c = canvas.getContext("2d");
    const staged = c.createImageData(spec.width, spec.height);
    staged.data.set(spec.data);
    if (canvas.width !== spec.width) canvas.width = spec.width;
    if (canvas.height !== spec.height) canvas.height = spec.height;
    c.putImageData(staged, 0, 0);
  };

  let legacyThrew = false;
  try {
    legacyPresentWithoutRollback(scratchCanvas, valid96x64.image);
  } catch {
    legacyThrew = true;
  } finally {
    ctx.putImageData = origPut;
  }
  const afterLegacySnap = readDomCanvasSnapshot(scratchCanvas);
  clearCanvas(scratchCanvas);

  const screenWipedOnTransientCrossSizeFault =
    afterLegacySnap.width === 96 && afterLegacySnap.height === 64 && afterLegacySnap.inkPixels === 0;

  const validTemplate = {
    executionKind: "browser-dom-with-injected-context-faults",
    baselineWidth: 64,
    baselineHeight: 48,
    baselineHash: beforeSnap.hash,
    baselineInkPixels: beforeSnap.inkPixels,
    preResizeStagingFault: {
      threw: true,
      rollback: { atomicityStatus: "preserved-pre-resize", dimensionsRestored: true, pixelsRestored: true },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: beforeSnap.hash,
      inkPixelsAfter: beforeSnap.inkPixels,
      preserved: true,
    },
    sameSizePutFault: {
      threw: true,
      rollback: { atomicityStatus: "preserved-same-size", dimensionsRestored: true, pixelsRestored: true },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: beforeSnap.hash,
      inkPixelsAfter: beforeSnap.inkPixels,
      preserved: true,
    },
    crossSizeTransientPutFault: {
      threw: true,
      putCallCount: 2,
      rollback: {
        committed: false,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 96,
        targetHeight: 64,
        snapshotCaptured: true,
        snapshotBytes: 12288,
        stagedBytes: 24576,
        peakStagingBytes: 36864,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "restored-from-snapshot",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: beforeSnap.hash,
      inkPixelsAfter: beforeSnap.inkPixels,
      sourcesUnmutated: true,
      atomicallyRestored: true,
      recoveredImmediately: true,
    },
    crossSizePersistentPutFault: {
      threw: true,
      putCallCount: 2,
      rollback: {
        committed: false,
        crossSize: true,
        snapshotCaptured: true,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-rollback-put-failed",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      inkPixelsAfter: 0,
      nonAtomicPixelsClearedRecorded: true,
      recoveredToBaseline: true,
    },
    crossSizeSnapshotUnavailableFault: {
      threw: true,
      putCallCount: 1,
      rollback: {
        committed: false,
        crossSize: true,
        snapshotCaptured: false,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-snapshot-unavailable",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      inkPixelsAfter: 0,
      nonAtomicPixelsClearedRecorded: true,
      recoveredImmediately: true,
    },
  };

  return {
    legacyCrossSizeWipesScreenOnTransientFault: {
      threw: legacyThrew,
      canvasWidthAfter: afterLegacySnap.width,
      canvasHeightAfter: afterLegacySnap.height,
      domHashAfter: afterLegacySnap.hash,
      inkPixelsAfter: afterLegacySnap.inkPixels,
      screenWipedOnTransientCrossSizeFault,
      simulatedAtomicityReport: {
        ...validTemplate,
        crossSizeTransientPutFault: {
          threw: legacyThrew,
          putCallCount: 1,
          rollback: null,
          canvasWidthAfter: afterLegacySnap.width,
          canvasHeightAfter: afterLegacySnap.height,
          domHashAfter: afterLegacySnap.hash,
          inkPixelsAfter: afterLegacySnap.inkPixels,
          sourcesUnmutated: true,
          atomicallyRestored: false,
          recoveredImmediately: true,
        },
      },
    },
    dishonestPersistentFaultAtomicityClaim: {
      simulatedAtomicityReport: {
        ...validTemplate,
        crossSizePersistentPutFault: {
          threw: true,
          putCallCount: 2,
          rollback: {
            committed: false,
            crossSize: true,
            snapshotCaptured: true,
            dimensionsRestored: true,
            pixelsRestored: true,
            atomicityStatus: "restored-from-snapshot",
          },
          canvasWidthAfter: 64,
          canvasHeightAfter: 48,
          inkPixelsAfter: 0,
          nonAtomicPixelsClearedRecorded: false,
          recoveredToBaseline: true,
        },
      },
    },
  };
}

window.__brushLabPresentationAtomicityProbe = {
  getSourceProvenance,
  runStagingCostAndBudgetCase,
  runCrossSizeAtomicityFaultCase,
  runAtomicityNegativeControlCase,
};
window.__brushLabPresentationAtomicityProbeReady = true;
