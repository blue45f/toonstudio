import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectPresentationSourceProvenance,
  evaluateFaultInjectionReport,
  evaluateFlattenWhiteAccuracy,
  evaluatePresentBoundaryReport,
  EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE,
  EXPECTED_REJECTED_CASE_IDS,
  main,
  parsePresentationProbeArgs,
} from "./presentation-boundary-probe.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("presentation-boundary-probe 순수 평가기, 프로비넌스 및 음성 대조군 검증", () => {
  it("5픽셀 흰 종이 합성 기대값과 9종 무효 케이스 ID 상수를 고정한다", () => {
    expect(EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE).toEqual([
      [255, 255, 255, 255],
      [254, 254, 255, 255],
      [148, 188, 228, 255],
      [41, 121, 200, 255],
      [40, 120, 200, 255],
    ]);
    expect(EXPECTED_REJECTED_CASE_IDS).toEqual([
      "zero-dim",
      "negative-sign-cancel",
      "fractional-dim",
      "nan-dim",
      "inf-dim",
      "over-budget-precheck",
      "wrong-buffer-type",
      "short-buffer",
      "oversized-buffer",
    ]);
  });

  it("parsePresentationProbeArgs가 기본값과 사용자 옵션을 파싱하고 잘못된 인자를 거부한다", () => {
    const defaults = parsePresentationProbeArgs([]);
    expect(typeof defaults.out).toBe("string");
    expect(defaults.verbose).toBe(false);
    expect(defaults.serve).toBe(false);

    const custom = parsePresentationProbeArgs([
      "--out",
      "/tmp/custom-present-probe-out",
      "--verbose",
      "--serve-child",
    ]);
    expect(custom).toEqual({
      out: "/tmp/custom-present-probe-out",
      verbose: true,
      serve: true,
    });

    expect(() => parsePresentationProbeArgs(["--unknown-flag"])).toThrow(/알 수 없는 인자/u);
    expect(() => parsePresentationProbeArgs(["--out"])).toThrow(/값이 필요하다/u);
  });

  it("collectPresentationSourceProvenance가 라이브 TS 소스 2종과 sumi_kernel.wasm의 SHA-256 해시를 수집한다", () => {
    const prov = collectPresentationSourceProvenance(labRoot);
    expect(prov.buildMode).toBe("vite-dev-live-source");
    expect(typeof prov.branch).toBe("string");
    expect(prov.branch.length).toBeGreaterThan(0);
    expect(prov.commitSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(prov.commitShort).toBe(prov.commitSha.slice(0, 12));
    expect(Array.isArray(prov.dirtyFiles)).toBe(true);

    expect(prov.sourceHashes.canvasPresentTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.liveSessionTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.sumiKernelWasm).toBe(
      "63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc",
    );
  });

  it("evaluatePresentBoundaryReport가 9종 무효 호출 비파괴 보존 및 96×64 리사이즈 복구를 통과시킨다", () => {
    const validReport = {
      executionKind: "real-browser-dom",
      laneBaselines: {
        cpuReference: { hashMatched: true, inkPixels: 420 },
        wasmCpu: { hashMatched: true, inkPixels: 680 },
      },
      baselineWidth: 64,
      baselineHeight: 48,
      baselineHash: "fnv1a-baseline-64x48",
      baselineInkPixels: 420,
      rejectedCalls: EXPECTED_REJECTED_CASE_IDS.map((caseId) => ({
        caseId,
        expectedReason: "non-positive-dimensions",
        threw: true,
        code: "lab-image-invalid",
        reason: "non-positive-dimensions",
        canvasWidthAfter: 64,
        canvasHeightAfter: 48,
        domHashAfter: "fnv1a-baseline-64x48",
        inkPixelsAfter: 420,
        canvasDimensionsPreserved: true,
        canvasPixelsPreserved: true,
        sourceUnmutated: true,
      })),
      resizeRecovery: {
        targetWidth: 96,
        targetHeight: 64,
        canvasWidthAfter: 96,
        canvasHeightAfter: 64,
        recovered: true,
      },
    };
    const res = evaluatePresentBoundaryReport(validReport);
    expect(res.ok).toBe(true);
    expect(res.detectedFailure).toBe(false);
    expect(res.canvasWipedOrCorrupted).toBe(false);
    expect(res.rejectedCallCount).toBe(9);
    expect(res.preservedCount).toBe(9);
    expect(res.reasons).toEqual([]);
  });

  it("evaluatePresentBoundaryReport가 음성 대조군 1(검증 전 canvas.width 대입 및 짧은 버퍼 부분 복사)을 결정론적으로 거부한다", () => {
    const legacyBrokenReport = {
      executionKind: "real-browser-dom",
      baselineWidth: 64,
      baselineHeight: 48,
      baselineHash: "fnv1a-baseline-64x48",
      baselineInkPixels: 420,
      rejectedCalls: [
        {
          caseId: "short-buffer",
          expectedReason: "buffer-length-mismatch",
          threw: false,
          code: null,
          reason: null,
          canvasWidthAfter: 64,
          canvasHeightAfter: 48,
          domHashAfter: "fnv1a-corrupted-zeros",
          inkPixelsAfter: 0,
          canvasDimensionsPreserved: true,
          canvasPixelsPreserved: false,
          sourceUnmutated: true,
        },
        {
          caseId: "zero-dim",
          expectedReason: "non-positive-dimensions",
          threw: true,
          code: null,
          reason: null,
          canvasWidthAfter: 0,
          canvasHeightAfter: 48,
          domHashAfter: "empty-0x0",
          inkPixelsAfter: 0,
          canvasDimensionsPreserved: false,
          canvasPixelsPreserved: false,
          sourceUnmutated: true,
        },
      ],
      resizeRecovery: { recovered: false },
    };

    const res = evaluatePresentBoundaryReport(legacyBrokenReport);
    expect(res.ok).toBe(false);
    expect(res.detectedFailure).toBe(true);
    expect(res.canvasWipedOrCorrupted).toBe(true);
    expect(res.reasons).toContain("rejected-call-did-not-throw:short-buffer");
    expect(res.reasons).toContain("canvas-pixels-corrupted:short-buffer");
    expect(res.reasons).toContain("canvas-dimensions-mutated:zero-dim");
    expect(res.reasons).toContain("resize-recovery-failed");
  });

  it("evaluateFaultInjectionReport가 주입된 컨텍스트 결함 태그와 교차 크기 putImageData 비원자성 기록·복구를 검증한다", () => {
    const validFaults = {
      executionKind: "browser-dom-with-injected-context-faults",
      getContextNull: { canvasPreserved: true },
      createImageDataThrows: { canvasPreserved: true },
      putImageDataThrowsSameSize: { canvasPreserved: true },
      putImageDataThrowsCrossSizeAndRecovers: {
        crossSizePutImageDataClearsBackingStore: true,
        recoveredImmediately: true,
      },
    };
    const res = evaluateFaultInjectionReport(validFaults);
    expect(res.ok).toBe(true);
    expect(res.detectedFailure).toBe(false);
    expect(res.reasons).toEqual([]);

    const dishonestReport = {
      executionKind: "real-browser-dom",
      getContextNull: { canvasPreserved: false },
      createImageDataThrows: { canvasPreserved: true },
      putImageDataThrowsSameSize: { canvasPreserved: true },
      putImageDataThrowsCrossSizeAndRecovers: {
        crossSizePutImageDataClearsBackingStore: false,
        recoveredImmediately: false,
      },
    };
    const bad = evaluateFaultInjectionReport(dishonestReport);
    expect(bad.ok).toBe(false);
    expect(bad.detectedFailure).toBe(true);
    expect(bad.reasons).toContain("missing-fault-injection-execution-kind");
    expect(bad.reasons).toContain("getContext-null-did-not-preserve-canvas");
    expect(bad.reasons).toContain("cross-size-putImageData-backing-store-clear-not-recorded");
    expect(bad.reasons).toContain("cross-size-putImageData-did-not-recover-immediately");
  });

  it("evaluateFlattenWhiteAccuracy가 5픽셀·3×2 격자·실제 레인 PNG·무효 입력 거부를 통과시키고 음성 대조군 2(백지 위장)를 거부한다", () => {
    const validFlatten = {
      fivePixelFixture: {
        width: 5,
        height: 1,
        actualPixels: EXPECTED_FIVE_PIXEL_WHITE_COMPOSITE,
        sourceUnmutated: true,
      },
      grid3x2Fixture: {
        width: 3,
        height: 2,
        expectedPixels: [
          [255, 255, 255, 255],
          [250, 0, 0, 255],
          [128, 228, 128, 255],
          [0, 0, 180, 255],
          [216, 229, 241, 255],
          [21, 41, 61, 255],
        ],
        actualPixels: [
          [255, 255, 255, 255],
          [250, 0, 0, 255],
          [128, 228, 128, 255],
          [0, 0, 180, 255],
          [216, 229, 241, 255],
          [21, 41, 61, 255],
        ],
        sourceUnmutated: true,
      },
      realLanePngChecks: {
        cpuReference: {
          allAlpha255: true,
          nonWhitePixels: 310,
          sourceUnmutated: true,
          pngMagicValid: true,
          pngBytesLength: 12400,
        },
        wasmCpu: {
          allAlpha255: true,
          nonWhitePixels: 310,
          sourceUnmutated: true,
          pngMagicValid: true,
          pngBytesLength: 12400,
        },
      },
      flattenRejectedCalls: [
        { caseId: "short-buffer", expectedReason: "buffer-length-mismatch", threw: true, code: "lab-image-invalid", reason: "buffer-length-mismatch" },
        { caseId: "negative-dims", expectedReason: "non-positive-dimensions", threw: true, code: "lab-image-invalid", reason: "non-positive-dimensions" },
        { caseId: "over-budget-dims", expectedReason: "dimensions-exceed-budget", threw: true, code: "lab-image-invalid", reason: "dimensions-exceed-budget" },
      ],
    };
    const okRes = evaluateFlattenWhiteAccuracy(validFlatten);
    expect(okRes.ok).toBe(true);
    expect(okRes.detectedFailure).toBe(false);
    expect(okRes.disguisedAsWhitePaper).toBe(false);
    expect(okRes.maxChannelError).toBe(0);

    // 음성 대조군 2: 짧은 버퍼를 ?? 0 폴백으로 불투명 흰 종이(255,255,255,255)로 둔갑시키는 구형 구현
    const disguisedReport = {
      ...validFlatten,
      flattenRejectedCalls: [
        { caseId: "short-buffer", expectedReason: "buffer-length-mismatch", threw: false, code: null, reason: null },
      ],
      disguisedShortBufferCheck: {
        whitePaddedPixels: 15,
        disguisedAsWhitePaper: true,
      },
    };
    const badRes = evaluateFlattenWhiteAccuracy(disguisedReport);
    expect(badRes.ok).toBe(false);
    expect(badRes.detectedFailure).toBe(true);
    expect(badRes.disguisedAsWhitePaper).toBe(true);
    expect(badRes.reasons).toContain("flatten-did-not-throw:short-buffer");
    expect(badRes.reasons).toContain("short-buffer-disguised-as-white-paper");
  });

  it("BRUSH_LAB_BROWSER_PROBE=1이 아니면 브라우저를 띄우지 않고 종료 코드 0을 돌려준다", async () => {
    const code = await main([], { ...process.env, BRUSH_LAB_BROWSER_PROBE: "0" });
    expect(code).toBe(0);
  });
});
