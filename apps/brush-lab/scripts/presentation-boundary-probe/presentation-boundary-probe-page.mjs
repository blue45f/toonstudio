// 브라우저 표시 경계(Presentation Boundary) 회귀 프로브 페이지 모듈.
// scripts/presentation-boundary-probe/presentation-boundary-probe.mjs가 Vite dev 서버로 이 모듈을 열고
// window.__brushLabPresentationProbe를 호출해 presentLabImage 비파괴 순서, 주입된 2D 컨텍스트 결함 복구,
// flattenOnWhite straight-RGBA 흰 종이 합성 및 PNG 인코딩, 음성 대조군 2종을 실제 Chromium DOM에서 검증한다.
import liveSessionRaw from "../../src/app/state/live-session.ts?raw";
import { pixelHash } from "../../src/bench/metrics/render-metrics.ts";
import { encodePng } from "../../src/bench/physics/png-encode.ts";
import { presetById } from "../../src/engine/presets/catalog.ts";
import { embeddedKernelBytes, SUMI_KERNEL_SHA256 } from "../../src/engine/wasm/embedded.ts";
import { createCpuReferenceLane } from "../../src/lanes/cpu-reference-lane.ts";
import { createWasmCpuLane } from "../../src/lanes/wasm-cpu-lane.ts";
import {
  clearCanvas,
  flattenOnWhite,
  MAX_LAB_IMAGE_BYTES,
  MAX_LAB_IMAGE_PIXELS,
  MAX_LAB_IMAGE_SIDE_PX,
  presentLabImage,
  validateLabImage,
} from "../../src/platform/canvas-present.ts";
import canvasPresentRaw from "../../src/platform/canvas-present.ts?raw";

const presentCanvas = document.getElementById("present-probe-canvas");
const scratchCanvas = document.getElementById("present-probe-scratch-canvas");

if (!(presentCanvas instanceof HTMLCanvasElement) || !(scratchCanvas instanceof HTMLCanvasElement)) {
  throw new Error("presentation-boundary-probe 필수 canvas 요소를 찾지 못했다");
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

async function renderRealStrokeImage(laneId, presetId, width, height, seed = 9101) {
  const lane = laneId === "wasm-cpu" ? createWasmCpuLane() : createCpuReferenceLane();
  await lane.init(makeEnv(), { width, height, dpr: 1, tileSize: 16 });
  try {
    lane.beginStroke(presetById(presetId), seed);
    lane.addSamples(buildDiagonalStrokeSamples(width, height));
    const receipt = await lane.endStroke();
    const image = await lane.readback();
    return { laneId, presetId, width, height, dabCount: receipt.dabCount, image, hash: pixelHash(image), inkPixels: countInkPixels(image.data) };
  } finally {
    lane.dispose();
  }
}

function countInkPixels(data) {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    const darkness = Math.abs(255 - (data[i] ?? 255)) + Math.abs(255 - (data[i + 1] ?? 255)) + Math.abs(255 - (data[i + 2] ?? 255));
    const weight = a < 255 ? a : darkness > 24 ? Math.min(255, darkness) : 0;
    if (weight >= 8) count += 1;
  }
  return count;
}

function countNonWhiteOpaquePixels(data) {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] ?? 255) < 255 || (data[i + 1] ?? 255) < 255 || (data[i + 2] ?? 255) < 255) count += 1;
  }
  return count;
}

function readDomCanvasSnapshot(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("readDomCanvasSnapshot: 2D 컨텍스트를 얻지 못했다");
  const { width, height } = canvas;
  if (width <= 0 || height <= 0) return { width, height, hash: "empty-0x0", inkPixels: 0, byteLength: 0 };
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

async function runCanvasPresentBoundaryCase() {
  const cpu64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9101);
  const wasm64x48 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 64, 48, 9102);
  const wasm96x64 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 96, 64, 9103);

  presentLabImage(presentCanvas, wasm64x48.image);
  const wasmSnap = readDomCanvasSnapshot(presentCanvas);

  presentLabImage(presentCanvas, cpu64x48.image);
  const baselineSnap = readDomCanvasSnapshot(presentCanvas);
  const baselineSourceCopy = new Uint8ClampedArray(cpu64x48.image.data);

  const invalidSpecs = [
    { caseId: "zero-dim", expectedReason: "non-positive-dimensions", img: { width: 0, height: 48, data: new Uint8ClampedArray(0) } },
    { caseId: "negative-sign-cancel", expectedReason: "non-positive-dimensions", img: { width: -4, height: -4, data: new Uint8ClampedArray(64) } },
    { caseId: "fractional-dim", expectedReason: "non-integer-dimensions", img: { width: 16.5, height: 12, data: new Uint8ClampedArray(792) } },
    { caseId: "nan-dim", expectedReason: "non-integer-dimensions", img: { width: Number.NaN, height: 12, data: new Uint8ClampedArray(48) } },
    { caseId: "inf-dim", expectedReason: "non-integer-dimensions", img: { width: Number.POSITIVE_INFINITY, height: 12, data: new Uint8ClampedArray(48) } },
    { caseId: "over-budget-precheck", expectedReason: "dimensions-exceed-budget", img: { width: 2049, height: 2048, data: new Uint8ClampedArray([9, 8, 7, 6]) } },
    { caseId: "wrong-buffer-type", expectedReason: "invalid-buffer-type", img: { width: 64, height: 48, data: new Uint8Array(64 * 48 * 4) } },
    { caseId: "short-buffer", expectedReason: "buffer-length-mismatch", img: { width: 64, height: 48, data: new Uint8ClampedArray(32).fill(77) } },
    { caseId: "oversized-buffer", expectedReason: "buffer-length-mismatch", img: { width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4 + 16).fill(88) } },
  ];

  const rejectedCalls = [];
  for (const spec of invalidSpecs) {
    const inputSnapshot = spec.img.data && typeof spec.img.data.byteLength === "number" ? new Uint8Array(spec.img.data.buffer.slice(0)) : null;
    let threw = false;
    let code = null;
    let reason = null;
    let message = null;
    try {
      presentLabImage(presentCanvas, spec.img);
    } catch (error) {
      threw = true;
      code = error?.code ?? null;
      reason = error?.details?.reason ?? null;
      message = String(error?.message ?? error);
    }
    const afterSnap = readDomCanvasSnapshot(presentCanvas);
    const inputUnmutated = inputSnapshot === null || bytesEqual(inputSnapshot, new Uint8Array(spec.img.data.buffer));
    const baselineSourceUnmutated = bytesEqual(baselineSourceCopy, cpu64x48.image.data);

    rejectedCalls.push({
      caseId: spec.caseId,
      expectedReason: spec.expectedReason,
      threw,
      code,
      reason,
      message,
      canvasWidthAfter: afterSnap.width,
      canvasHeightAfter: afterSnap.height,
      domHashAfter: afterSnap.hash,
      inkPixelsAfter: afterSnap.inkPixels,
      canvasDimensionsPreserved: afterSnap.width === 64 && afterSnap.height === 48,
      canvasPixelsPreserved: afterSnap.hash === baselineSnap.hash && afterSnap.inkPixels === baselineSnap.inkPixels,
      sourceUnmutated: inputUnmutated && baselineSourceUnmutated,
    });
  }

  // 유효한 96×64 이미지로 정식 리사이즈 + 오류 직후 즉시 복구 확인
  presentLabImage(presentCanvas, wasm96x64.image);
  const resizedSnap = readDomCanvasSnapshot(presentCanvas);
  clearCanvas(presentCanvas);

  return {
    executionKind: "real-browser-dom",
    laneBaselines: {
      cpuReference: {
        laneId: cpu64x48.laneId,
        presetId: cpu64x48.presetId,
        width: 64,
        height: 48,
        dabCount: cpu64x48.dabCount,
        inkPixels: baselineSnap.inkPixels,
        expectedHash: cpu64x48.hash,
        domHash: baselineSnap.hash,
        hashMatched: baselineSnap.hash === cpu64x48.hash,
      },
      wasmCpu: {
        laneId: wasm64x48.laneId,
        presetId: wasm64x48.presetId,
        width: 64,
        height: 48,
        dabCount: wasm64x48.dabCount,
        inkPixels: wasmSnap.inkPixels,
        expectedHash: wasm64x48.hash,
        domHash: wasmSnap.hash,
        hashMatched: wasmSnap.hash === wasm64x48.hash,
      },
    },
    baselineWidth: 64,
    baselineHeight: 48,
    baselineHash: baselineSnap.hash,
    baselineInkPixels: baselineSnap.inkPixels,
    rejectedCalls,
    resizeRecovery: {
      targetWidth: 96,
      targetHeight: 64,
      canvasWidthAfter: resizedSnap.width,
      canvasHeightAfter: resizedSnap.height,
      expectedHash: wasm96x64.hash,
      domHashAfter: resizedSnap.hash,
      inkPixelsAfter: resizedSnap.inkPixels,
      recovered: resizedSnap.width === 96 && resizedSnap.height === 64 && resizedSnap.hash === wasm96x64.hash && resizedSnap.inkPixels > 0,
    },
  };
}

async function runFaultInjectionCase() {
  const base64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9201);
  const alt64x48 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 64, 48, 9202);
  const valid96x64 = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 96, 64, 9203);

  presentLabImage(presentCanvas, base64x48.image);
  const baselineSnap = readDomCanvasSnapshot(presentCanvas);

  // 1) canvas.getContext("2d")가 null을 1회 반환할 때 리사이즈 전 실패 → 64×48 픽셀 보존
  const origGetContext = presentCanvas.getContext.bind(presentCanvas);
  let getContextFaultCode = null;
  presentCanvas.getContext = () => null;
  try {
    presentLabImage(presentCanvas, valid96x64.image);
  } catch (error) {
    getContextFaultCode = error?.code ?? String(error?.message ?? error);
  } finally {
    presentCanvas.getContext = origGetContext;
  }
  const afterGetContextNull = readDomCanvasSnapshot(presentCanvas);

  // 2) ctx.createImageData가 DOMException을 1회 던질 때 리사이즈 전 실패 → 64×48 픽셀 보존
  const ctx = presentCanvas.getContext("2d");
  if (!ctx) throw new Error("2D 컨텍스트 확보 실패");
  const origCreateImageData = ctx.createImageData.bind(ctx);
  let createImageDataErrorName = null;
  ctx.createImageData = () => {
    throw new DOMException("Simulated createImageData failure", "NotSupportedError");
  };
  try {
    presentLabImage(presentCanvas, valid96x64.image);
  } catch (error) {
    createImageDataErrorName = error?.name ?? String(error);
  } finally {
    ctx.createImageData = origCreateImageData;
  }
  const afterCreateImageDataThrow = readDomCanvasSnapshot(presentCanvas);

  // 3) 동일 크기(64×48)에서 ctx.putImageData가 1회 던질 때 → 64×48 기존 픽셀 보존
  const origPutImageData = ctx.putImageData.bind(ctx);
  let sameSizePutErrorName = null;
  ctx.putImageData = () => {
    throw new DOMException("Simulated same-size putImageData failure", "InvalidStateError");
  };
  try {
    presentLabImage(presentCanvas, alt64x48.image);
  } catch (error) {
    sameSizePutErrorName = error?.name ?? String(error);
  } finally {
    ctx.putImageData = origPutImageData;
  }
  const afterSameSizePutThrow = readDomCanvasSnapshot(presentCanvas);

  // 4) 교차 크기(64×48 -> 96×64)에서 ctx.putImageData가 1회 던질 때 →
  // HTML5 Canvas 사양상 canvas.width=96 대입 시점에 이미 백킹 스토어가 비워지므로 원자적 롤백으로 과장하지 않고 기록,
  // 직후 정상 presentLabImage 호출에서 즉시 복구됨을 검증.
  let crossSizePutErrorName = null;
  ctx.putImageData = () => {
    throw new DOMException("Simulated cross-size putImageData failure", "InvalidStateError");
  };
  try {
    presentLabImage(presentCanvas, valid96x64.image);
  } catch (error) {
    crossSizePutErrorName = error?.name ?? String(error);
  } finally {
    ctx.putImageData = origPutImageData;
  }
  const duringCrossSizeThrowSnap = readDomCanvasSnapshot(presentCanvas);

  presentLabImage(presentCanvas, valid96x64.image);
  const recoveredSnap = readDomCanvasSnapshot(presentCanvas);
  clearCanvas(presentCanvas);

  return {
    executionKind: "browser-dom-with-injected-context-faults",
    baselineWidth: 64,
    baselineHeight: 48,
    baselineHash: baselineSnap.hash,
    baselineInkPixels: baselineSnap.inkPixels,
    getContextNull: {
      threwCode: getContextFaultCode,
      canvasWidthAfter: afterGetContextNull.width,
      canvasHeightAfter: afterGetContextNull.height,
      domHashAfter: afterGetContextNull.hash,
      canvasPreserved:
        getContextFaultCode === "canvas-2d-unavailable" &&
        afterGetContextNull.width === 64 &&
        afterGetContextNull.height === 48 &&
        afterGetContextNull.hash === baselineSnap.hash,
    },
    createImageDataThrows: {
      threwErrorName: createImageDataErrorName,
      canvasWidthAfter: afterCreateImageDataThrow.width,
      canvasHeightAfter: afterCreateImageDataThrow.height,
      domHashAfter: afterCreateImageDataThrow.hash,
      canvasPreserved:
        createImageDataErrorName === "NotSupportedError" &&
        afterCreateImageDataThrow.width === 64 &&
        afterCreateImageDataThrow.height === 48 &&
        afterCreateImageDataThrow.hash === baselineSnap.hash,
    },
    putImageDataThrowsSameSize: {
      threwErrorName: sameSizePutErrorName,
      canvasWidthAfter: afterSameSizePutThrow.width,
      canvasHeightAfter: afterSameSizePutThrow.height,
      domHashAfter: afterSameSizePutThrow.hash,
      canvasPreserved:
        sameSizePutErrorName === "InvalidStateError" &&
        afterSameSizePutThrow.width === 64 &&
        afterSameSizePutThrow.height === 48 &&
        afterSameSizePutThrow.hash === baselineSnap.hash,
    },
    putImageDataThrowsCrossSizeAndRecovers: {
      threwErrorName: crossSizePutErrorName,
      canvasWidthAfterThrow: duringCrossSizeThrowSnap.width,
      canvasHeightAfterThrow: duringCrossSizeThrowSnap.height,
      inkPixelsDuringThrow: duringCrossSizeThrowSnap.inkPixels,
      crossSizePutImageDataClearsBackingStore:
        duringCrossSizeThrowSnap.width === 96 &&
        duringCrossSizeThrowSnap.height === 64 &&
        duringCrossSizeThrowSnap.inkPixels === 0,
      recoveredWidth: recoveredSnap.width,
      recoveredHeight: recoveredSnap.height,
      recoveredInkPixels: recoveredSnap.inkPixels,
      recoveredHash: recoveredSnap.hash,
      expectedTargetHash: valid96x64.hash,
      recoveredImmediately:
        recoveredSnap.width === 96 &&
        recoveredSnap.height === 64 &&
        recoveredSnap.hash === valid96x64.hash &&
        recoveredSnap.inkPixels > 0,
    },
  };
}

async function runFlattenOnWhiteCase() {
  const alphas = [0, 1, 127, 254, 255];
  const fivePxData = new Uint8ClampedArray(5 * 4);
  for (let i = 0; i < alphas.length; i += 1) {
    fivePxData.set([40, 120, 200, alphas[i]], i * 4);
  }
  const fivePxSnapshot = new Uint8ClampedArray(fivePxData);
  const fivePxOut = flattenOnWhite({ width: 5, height: 1, data: fivePxData });
  const fivePxActualPixels = [0, 1, 2, 3, 4].map((i) => Array.from(fivePxOut.data.subarray(i * 4, i * 4 + 4)));
  const fivePxSourceUnmutated = bytesEqual(fivePxSnapshot, fivePxData) && fivePxOut.data !== fivePxData;

  const grid3x2Input = new Uint8ClampedArray([
    10, 20, 30, 0, 250, 0, 0, 255, 0, 200, 0, 127,
    0, 0, 180, 255, 100, 150, 200, 64, 20, 40, 60, 254,
  ]);
  const grid3x2Snapshot = new Uint8ClampedArray(grid3x2Input);
  const grid3x2Out = flattenOnWhite({ width: 3, height: 2, data: grid3x2Input });
  const grid3x2Expected = [
    [255, 255, 255, 255],
    [250, 0, 0, 255],
    [128, 228, 128, 255],
    [0, 0, 180, 255],
    [216, 229, 241, 255],
    [21, 41, 61, 255],
  ];
  const grid3x2Actual = [0, 1, 2, 3, 4, 5].map((i) => Array.from(grid3x2Out.data.subarray(i * 4, i * 4 + 4)));
  const grid3x2SourceUnmutated = bytesEqual(grid3x2Snapshot, grid3x2Input);

  const cpuWet = await renderRealStrokeImage("cpu-reference", "watercolor-wet", 64, 48, 9301);
  const wasmWet = await renderRealStrokeImage("wasm-cpu", "watercolor-wet", 64, 48, 9302);
  const realLanePngChecks = {};
  for (const [key, rendered] of [["cpuReference", cpuWet], ["wasmCpu", wasmWet]]) {
    const srcCopy = new Uint8ClampedArray(rendered.image.data);
    const flat = flattenOnWhite(rendered.image);
    const pngBytes = encodePng(flat.width, flat.height, flat.data);
    let allAlpha255 = true;
    for (let i = 3; i < flat.data.length; i += 4) {
      if (flat.data[i] !== 255) {
        allAlpha255 = false;
        break;
      }
    }
    const m = pngBytes.subarray(0, 8);
    const pngMagicValid =
      m.length === 8 && m[0] === 0x89 && m[1] === 0x50 && m[2] === 0x4e && m[3] === 0x47 &&
      m[4] === 0x0d && m[5] === 0x0a && m[6] === 0x1a && m[7] === 0x0a;
    realLanePngChecks[key] = {
      width: flat.width,
      height: flat.height,
      allAlpha255,
      nonWhitePixels: countNonWhiteOpaquePixels(flat.data),
      sourceUnmutated: bytesEqual(srcCopy, rendered.image.data),
      pngBytesLength: pngBytes.byteLength,
      pngMagicValid,
    };
  }

  const flattenRejectSpecs = [
    { caseId: "short-buffer", expectedReason: "buffer-length-mismatch", img: { width: 64, height: 48, data: new Uint8ClampedArray(20) } },
    { caseId: "negative-dims", expectedReason: "non-positive-dimensions", img: { width: -2, height: -2, data: new Uint8ClampedArray(16) } },
    { caseId: "over-budget-dims", expectedReason: "dimensions-exceed-budget", img: { width: 2049, height: 2048, data: new Uint8ClampedArray(4) } },
  ];
  const flattenRejectedCalls = flattenRejectSpecs.map((spec) => {
    try {
      flattenOnWhite(spec.img);
      return { caseId: spec.caseId, expectedReason: spec.expectedReason, threw: false, code: null, reason: null };
    } catch (error) {
      return { caseId: spec.caseId, expectedReason: spec.expectedReason, threw: true, code: error?.code ?? null, reason: error?.details?.reason ?? null };
    }
  });

  return {
    executionKind: "real-browser-dom",
    fivePixelFixture: { width: fivePxOut.width, height: fivePxOut.height, actualPixels: fivePxActualPixels, sourceUnmutated: fivePxSourceUnmutated },
    grid3x2Fixture: { width: grid3x2Out.width, height: grid3x2Out.height, expectedPixels: grid3x2Expected, actualPixels: grid3x2Actual, sourceUnmutated: grid3x2SourceUnmutated },
    realLanePngChecks,
    flattenRejectedCalls,
  };
}

async function runNegativeControlCase() {
  const baseline64x48 = await renderRealStrokeImage("cpu-reference", "ink-g-pen", 64, 48, 9401);
  presentLabImage(scratchCanvas, baseline64x48.image);
  const beforeSnap = readDomCanvasSnapshot(scratchCanvas);

  const legacyPresentUnguarded = (canvas, img) => {
    if (canvas.width !== img.width) canvas.width = img.width;
    if (canvas.height !== img.height) canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(img.width, img.height);
    imageData.data.set(img.data.subarray(0, img.width * img.height * 4));
    ctx.putImageData(imageData, 0, 0);
  };

  let shortBufferThrew = false;
  try {
    legacyPresentUnguarded(scratchCanvas, { width: 64, height: 48, data: new Uint8ClampedArray(32) });
  } catch {
    shortBufferThrew = true;
  }
  const afterShortSnap = readDomCanvasSnapshot(scratchCanvas);

  let zeroWidthThrew = false;
  try {
    legacyPresentUnguarded(scratchCanvas, { width: 0, height: 48, data: new Uint8ClampedArray(0) });
  } catch {
    zeroWidthThrew = true;
  }
  const afterZeroWidthSnap = readDomCanvasSnapshot(scratchCanvas);
  clearCanvas(scratchCanvas);

  const canvasWipedOrCorrupted =
    afterShortSnap.hash !== beforeSnap.hash || afterShortSnap.inkPixels === 0 || afterZeroWidthSnap.width === 0;

  const legacyFlattenUnguarded = (img) => {
    const data = new Uint8ClampedArray(img.width * img.height * 4);
    const src = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = (src[i + 3] ?? 0) / 255;
      data[i] = Math.round((src[i] ?? 0) * a + 255 * (1 - a));
      data[i + 1] = Math.round((src[i + 1] ?? 0) * a + 255 * (1 - a));
      data[i + 2] = Math.round((src[i + 2] ?? 0) * a + 255 * (1 - a));
      data[i + 3] = 255;
    }
    return { width: img.width, height: img.height, data };
  };

  const shortFlattenOut = legacyFlattenUnguarded({ width: 4, height: 4, data: new Uint8ClampedArray([40, 120, 200, 128]) });
  let whitePaddedPixels = 0;
  for (let p = 1; p < 16; p += 1) {
    const o = p * 4;
    if (shortFlattenOut.data[o] === 255 && shortFlattenOut.data[o + 1] === 255 && shortFlattenOut.data[o + 2] === 255 && shortFlattenOut.data[o + 3] === 255) {
      whitePaddedPixels += 1;
    }
  }
  const disguisedAsWhitePaper = whitePaddedPixels === 15;

  return {
    legacyPresentMutatesBeforeValidate: {
      baselineHash: beforeSnap.hash,
      baselineInkPixels: beforeSnap.inkPixels,
      shortBufferThrew,
      afterShortHash: afterShortSnap.hash,
      afterShortInkPixels: afterShortSnap.inkPixels,
      zeroWidthThrew,
      canvasWidthAfterZero: afterZeroWidthSnap.width,
      canvasWipedOrCorrupted,
      simulatedBoundaryReport: {
        executionKind: "real-browser-dom",
        baselineWidth: 64,
        baselineHeight: 48,
        baselineHash: beforeSnap.hash,
        baselineInkPixels: beforeSnap.inkPixels,
        rejectedCalls: [
          {
            caseId: "short-buffer",
            expectedReason: "buffer-length-mismatch",
            threw: shortBufferThrew,
            code: null,
            reason: null,
            canvasWidthAfter: afterShortSnap.width,
            canvasHeightAfter: afterShortSnap.height,
            domHashAfter: afterShortSnap.hash,
            inkPixelsAfter: afterShortSnap.inkPixels,
            canvasDimensionsPreserved: afterShortSnap.width === 64 && afterShortSnap.height === 48,
            canvasPixelsPreserved: afterShortSnap.hash === beforeSnap.hash,
            sourceUnmutated: true,
          },
          {
            caseId: "zero-dim",
            expectedReason: "non-positive-dimensions",
            threw: zeroWidthThrew,
            code: null,
            reason: null,
            canvasWidthAfter: afterZeroWidthSnap.width,
            canvasHeightAfter: afterZeroWidthSnap.height,
            domHashAfter: afterZeroWidthSnap.hash,
            inkPixelsAfter: afterZeroWidthSnap.inkPixels,
            canvasDimensionsPreserved: afterZeroWidthSnap.width === 64 && afterZeroWidthSnap.height === 48,
            canvasPixelsPreserved: afterZeroWidthSnap.hash === beforeSnap.hash,
            sourceUnmutated: true,
          },
        ],
        resizeRecovery: { recovered: false },
      },
    },
    legacyFlattenDisguisesShortBufferAsWhite: {
      threw: false,
      whitePaddedPixels,
      disguisedAsWhitePaper,
      simulatedFlattenReport: {
        fivePixelFixture: {
          width: 5,
          height: 1,
          actualPixels: [[255, 255, 255, 255], [254, 254, 255, 255], [148, 188, 228, 255], [41, 121, 200, 255], [40, 120, 200, 255]],
          sourceUnmutated: true,
        },
        grid3x2Fixture: { width: 3, height: 2, expectedPixels: [[255, 255, 255, 255]], actualPixels: [[255, 255, 255, 255]], sourceUnmutated: true },
        realLanePngChecks: {
          cpuReference: { allAlpha255: true, nonWhitePixels: 100, sourceUnmutated: true, pngMagicValid: true, pngBytesLength: 500 },
          wasmCpu: { allAlpha255: true, nonWhitePixels: 100, sourceUnmutated: true, pngMagicValid: true, pngBytesLength: 500 },
        },
        flattenRejectedCalls: [{ caseId: "short-buffer", expectedReason: "buffer-length-mismatch", threw: false, code: null, reason: null }],
        disguisedShortBufferCheck: { whitePaddedPixels, disguisedAsWhitePaper },
      },
    },
  };
}

window.__brushLabPresentationProbe = {
  getSourceProvenance,
  validateLabImageInBrowser: (img) => validateLabImage(img),
  runCanvasPresentBoundaryCase,
  runFaultInjectionCase,
  runFlattenOnWhiteCase,
  runNegativeControlCase,
};
window.__brushLabPresentationProbeReady = true;
