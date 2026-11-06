import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectAtomicitySourceProvenance,
  evaluateCrossSizeAtomicityReport,
  evaluateStagingCostReport,
  EXPECTED_ATOMICITY_STATUS_VALUES,
  main,
  MAX_CROSS_SIZE_PEAK_STAGING_BYTES,
  MAX_STAGE_IMAGE_BYTES,
  parseAtomicityProbeArgs,
} from "./presentation-atomicity-probe.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function makeValidStagingCostReport() {
  return {
    executionKind: "real-browser-dom",
    initialMount64x48: {
      receipt: {
        committed: true,
        crossSize: false,
        prevWidth: 64,
        prevHeight: 48,
        width: 64,
        height: 48,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 12_288,
        peakStagingBytes: 12_288,
        atomicityStatus: "committed-same-size",
      },
      expectedHash: "fnv1a-cpu-64x48",
      domHash: "fnv1a-cpu-64x48",
      inkPixels: 410,
      hashMatched: true,
    },
    sameSizeCommit64x48: {
      receipt: {
        committed: true,
        crossSize: false,
        prevWidth: 64,
        prevHeight: 48,
        width: 64,
        height: 48,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 12_288,
        peakStagingBytes: 12_288,
        atomicityStatus: "committed-same-size",
      },
      expectedHash: "fnv1a-wasm-64x48",
      domHash: "fnv1a-wasm-64x48",
      inkPixels: 680,
      hashMatched: true,
    },
    crossSizeCommit64x48To96x64: {
      receipt: {
        committed: true,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        width: 96,
        height: 64,
        snapshotCaptured: true,
        snapshotBytes: 12_288,
        stagedBytes: 24_576,
        peakStagingBytes: 36_864,
        atomicityStatus: "committed-cross-size",
      },
      expectedHash: "fnv1a-wasm-96x64",
      domHash: "fnv1a-wasm-96x64",
      inkPixels: 920,
      hashMatched: true,
    },
    overBudgetPrecheck: {
      threw: true,
      code: "lab-image-invalid",
      reason: "dimensions-exceed-budget",
      rollbackAttached: false,
      canvasWidthAfter: 96,
      canvasHeightAfter: 64,
      domHashAfter: "fnv1a-wasm-96x64",
      canvasPreserved: true,
    },
  };
}

function makeValidCrossSizeAtomicityReport() {
  return {
    executionKind: "browser-dom-with-injected-context-faults",
    baselineWidth: 64,
    baselineHeight: 48,
    baselineHash: "fnv1a-baseline-64x48",
    baselineInkPixels: 420,
    preResizeStagingFault: {
      threw: true,
      errorName: "NotSupportedError",
      rollback: {
        committed: false,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 96,
        targetHeight: 64,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 0,
        peakStagingBytes: 0,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "preserved-pre-resize",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: "fnv1a-baseline-64x48",
      inkPixelsAfter: 420,
      preserved: true,
    },
    sameSizePutFault: {
      threw: true,
      errorName: "InvalidStateError",
      rollback: {
        committed: false,
        crossSize: false,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 64,
        targetHeight: 48,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 12_288,
        peakStagingBytes: 12_288,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "preserved-same-size",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: "fnv1a-baseline-64x48",
      inkPixelsAfter: 420,
      preserved: true,
    },
    crossSizeTransientPutFault: {
      threw: true,
      errorName: "InvalidStateError",
      putCallCount: 2,
      rollback: {
        committed: false,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 96,
        targetHeight: 64,
        snapshotCaptured: true,
        snapshotBytes: 12_288,
        stagedBytes: 24_576,
        peakStagingBytes: 36_864,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "restored-from-snapshot",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: "fnv1a-baseline-64x48",
      inkPixelsAfter: 420,
      sourcesUnmutated: true,
      atomicallyRestored: true,
      recoveredWidth: 96,
      recoveredHeight: 64,
      recoveredHash: "fnv1a-target-96x64",
      expectedTargetHash: "fnv1a-target-96x64",
      recoveredImmediately: true,
    },
    crossSizePersistentPutFault: {
      threw: true,
      errorName: "InvalidStateError",
      putCallCount: 2,
      rollback: {
        committed: false,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 96,
        targetHeight: 64,
        snapshotCaptured: true,
        snapshotBytes: 12_288,
        stagedBytes: 24_576,
        peakStagingBytes: 36_864,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-rollback-put-failed",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: "fnv1a-cleared",
      inkPixelsAfter: 0,
      nonAtomicPixelsClearedRecorded: true,
      recoveredToBaseline: true,
    },
    crossSizeSnapshotUnavailableFault: {
      threw: true,
      errorName: "InvalidStateError",
      putCallCount: 1,
      rollback: {
        committed: false,
        crossSize: true,
        prevWidth: 64,
        prevHeight: 48,
        targetWidth: 96,
        targetHeight: 64,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 24_576,
        peakStagingBytes: 24_576,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-snapshot-unavailable",
      },
      canvasWidthAfter: 64,
      canvasHeightAfter: 48,
      domHashAfter: "fnv1a-cleared",
      inkPixelsAfter: 0,
      nonAtomicPixelsClearedRecorded: true,
      recoveredWidth: 96,
      recoveredHeight: 64,
      recoveredHash: "fnv1a-target-96x64",
      expectedTargetHash: "fnv1a-target-96x64",
      recoveredImmediately: true,
    },
  };
}

describe("presentation-atomicity-probe 순수 평가기, 프로비넌스 및 음성 대조군 검증", () => {
  it("스테이징 예산 상수와 7종 원자성 상태 코드를 고정한다", () => {
    expect(MAX_STAGE_IMAGE_BYTES).toBe(16_777_216);
    expect(MAX_CROSS_SIZE_PEAK_STAGING_BYTES).toBe(33_554_432);
    expect(EXPECTED_ATOMICITY_STATUS_VALUES).toEqual([
      "committed-same-size",
      "committed-cross-size",
      "preserved-pre-resize",
      "preserved-same-size",
      "restored-from-snapshot",
      "dimensions-only-snapshot-unavailable",
      "dimensions-only-rollback-put-failed",
    ]);
  });

  it("parseAtomicityProbeArgs가 기본값과 사용자 옵션을 파싱하고 잘못된 인자를 거부한다", () => {
    const defaults = parseAtomicityProbeArgs([]);
    expect(typeof defaults.out).toBe("string");
    expect(defaults.verbose).toBe(false);
    expect(defaults.serve).toBe(false);

    const custom = parseAtomicityProbeArgs([
      "--out",
      "/tmp/custom-atomicity-probe-out",
      "--verbose",
      "--serve-child",
    ]);
    expect(custom).toEqual({
      out: "/tmp/custom-atomicity-probe-out",
      verbose: true,
      serve: true,
    });

    expect(() => parseAtomicityProbeArgs(["--unknown-flag"])).toThrow(/알 수 없는 인자/u);
    expect(() => parseAtomicityProbeArgs(["--out"])).toThrow(/값이 필요하다/u);
  });

  it("collectAtomicitySourceProvenance가 라이브 TS 소스 2종과 sumi_kernel.wasm의 SHA-256 해시를 수집한다", () => {
    const prov = collectAtomicitySourceProvenance(labRoot);
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

  it("evaluateStagingCostReport가 동일 크기 0-스냅샷 오버헤드, 교차 크기 피크 예산, 예산 초과 선차단을 통과시킨다", () => {
    const valid = makeValidStagingCostReport();
    const res = evaluateStagingCostReport(valid);
    expect(res.ok).toBe(true);
    expect(res.detectedFailure).toBe(false);
    expect(res.sameSizeZeroSnapshotOverhead).toBe(true);
    expect(res.crossSizeWithinPeakBudget).toBe(true);
    expect(res.overBudgetRejectedPreStaging).toBe(true);
    expect(res.reasons).toEqual([]);

    const bloatedSameSize = {
      ...valid,
      sameSizeCommit64x48: {
        ...valid.sameSizeCommit64x48,
        receipt: {
          ...valid.sameSizeCommit64x48.receipt,
          snapshotCaptured: true,
          snapshotBytes: 12_288,
          peakStagingBytes: 24_576,
        },
      },
    };
    const bad = evaluateStagingCostReport(bloatedSameSize);
    expect(bad.ok).toBe(false);
    expect(bad.detectedFailure).toBe(true);
    expect(bad.sameSizeZeroSnapshotOverhead).toBe(false);
    expect(bad.reasons).toContain("same-size-commit-receipt-or-overhead-mismatch");
  });

  it("evaluateCrossSizeAtomicityReport가 5종 결함 서브케이스(A~E)를 모두 통과시킨다", () => {
    const valid = makeValidCrossSizeAtomicityReport();
    const res = evaluateCrossSizeAtomicityReport(valid);
    expect(res.ok).toBe(true);
    expect(res.detectedFailure).toBe(false);
    expect(res.screenWipedOnTransientCrossSizeFault).toBe(false);
    expect(res.dishonestPixelRestorationClaim).toBe(false);
    expect(res.reasons).toEqual([]);
  });

  it("evaluateCrossSizeAtomicityReport가 음성 대조군 1(구형 692ce068 교차 크기 일시 결함 시 화면 소실)을 결정론적으로 거부한다", () => {
    const valid = makeValidCrossSizeAtomicityReport();
    const legacyWipedReport = {
      ...valid,
      crossSizeTransientPutFault: {
        threw: true,
        putCallCount: 1,
        rollback: null,
        canvasWidthAfter: 96,
        canvasHeightAfter: 64,
        domHashAfter: "fnv1a-cleared-96x64",
        inkPixelsAfter: 0,
        sourcesUnmutated: true,
        atomicallyRestored: false,
        recoveredImmediately: true,
      },
    };
    const res = evaluateCrossSizeAtomicityReport(legacyWipedReport);
    expect(res.ok).toBe(false);
    expect(res.detectedFailure).toBe(true);
    expect(res.screenWipedOnTransientCrossSizeFault).toBe(true);
    expect(res.reasons).toContain("transient-cross-size-fault-wiped-or-corrupted-screen");
    expect(res.reasons).toContain("transient-cross-size-rollback-diagnostics-invalid");
  });

  it("evaluateCrossSizeAtomicityReport가 음성 대조군 2(영구 결함 시 백킹 스토어가 비었음에도 pixelsRestored: true를 주장)를 결정론적으로 거부한다", () => {
    const valid = makeValidCrossSizeAtomicityReport();
    const dishonestPersistentReport = {
      ...valid,
      crossSizePersistentPutFault: {
        ...valid.crossSizePersistentPutFault,
        rollback: {
          ...valid.crossSizePersistentPutFault.rollback,
          pixelsRestored: true,
          atomicityStatus: "restored-from-snapshot",
        },
        inkPixelsAfter: 0,
        nonAtomicPixelsClearedRecorded: false,
      },
    };
    const res = evaluateCrossSizeAtomicityReport(dishonestPersistentReport);
    expect(res.ok).toBe(false);
    expect(res.detectedFailure).toBe(true);
    expect(res.dishonestPixelRestorationClaim).toBe(true);
    expect(res.reasons).toContain("dishonest-pixel-restoration-claim");
    expect(res.reasons).toContain("persistent-put-fault-boundary-not-recorded-honestly");
  });

  it("BRUSH_LAB_BROWSER_PROBE=1이 아니면 브라우저를 띄우지 않고 종료 코드 0을 돌려준다", async () => {
    const code = await main([], { ...process.env, BRUSH_LAB_BROWSER_PROBE: "0" });
    expect(code).toBe(0);
  });
});
