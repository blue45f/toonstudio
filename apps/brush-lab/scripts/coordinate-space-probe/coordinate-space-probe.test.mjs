import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildCoordinateMatrixSchedule,
  collectCoordSourceProvenance,
  compareCrossResolutionNormalized,
  DEFAULT_COORD_DPRS,
  DEFAULT_COORD_LANES,
  DEFAULT_COORD_MODES,
  DEFAULT_COORD_PRESETS,
  DEFAULT_COORD_VIEWPORTS,
  evaluateStrokeCoordinateAccuracy,
  main,
  parseCoordProbeArgs,
} from "./coordinate-space-probe.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("coordinate-space-probe 순수 계약, 프로비넌스 및 음성 대조군 검증", () => {
  it("기본 레인·프리셋·DPR(1/2/3)·뷰포트(320/390/768/1280)·변환 모드 상수를 고정한다", () => {
    expect(DEFAULT_COORD_LANES).toEqual(["cpu-reference", "wasm-cpu"]);
    expect(DEFAULT_COORD_PRESETS).toEqual(["ink-g-pen", "pencil-hb", "watercolor-wet"]);
    expect(DEFAULT_COORD_DPRS).toEqual([1, 2, 3]);
    expect(DEFAULT_COORD_VIEWPORTS).toEqual([320, 390, 768, 1280]);
    expect(DEFAULT_COORD_MODES).toEqual([
      "baseline",
      "offset-scroll",
      "css-scale-0.75",
      "css-scale-1.25",
      "fit-dpr",
    ]);
  });

  it("parseCoordProbeArgs가 기본값과 사용자 옵션을 파싱하고 잘못된 인자를 거부한다", () => {
    const defaults = parseCoordProbeArgs([]);
    expect(defaults.lanes).toEqual(["cpu-reference", "wasm-cpu"]);
    expect(defaults.presets).toEqual(["ink-g-pen", "pencil-hb", "watercolor-wet"]);
    expect(defaults.skipUi).toBe(false);
    expect(defaults.verbose).toBe(false);
    expect(defaults.serve).toBe(false);

    const custom = parseCoordProbeArgs([
      "--lanes",
      "wasm-cpu",
      "--presets",
      "ink-g-pen,watercolor-wet",
      "--out",
      "/tmp/custom-coord-probe-out",
      "--skip-ui",
      "--verbose",
      "--serve-child",
    ]);
    expect(custom).toEqual({
      lanes: ["wasm-cpu"],
      presets: ["ink-g-pen", "watercolor-wet"],
      out: "/tmp/custom-coord-probe-out",
      skipUi: true,
      verbose: true,
      serve: true,
    });

    expect(() => parseCoordProbeArgs(["--unknown-flag"])).toThrow(/알 수 없는 인자/u);
    expect(() => parseCoordProbeArgs(["--lanes"])).toThrow(/값이 필요하다/u);
    expect(() => parseCoordProbeArgs(["--presets", " , "])).toThrow(/최소 1개 이상/u);
  });

  it("collectCoordSourceProvenance가 라이브 TS 소스 3종과 sumi_kernel.wasm의 SHA-256 해시를 수집한다", () => {
    const prov = collectCoordSourceProvenance(labRoot);
    expect(prov.buildMode).toBe("vite-dev-live-source");
    expect(typeof prov.branch).toBe("string");
    expect(prov.branch.length).toBeGreaterThan(0);
    expect(prov.commitSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(prov.commitShort).toBe(prov.commitSha.slice(0, 12));
    expect(Array.isArray(prov.dirtyFiles)).toBe(true);

    expect(prov.sourceHashes.pointerCaptureTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.canvasPresentTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.liveSessionTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.sumiKernelWasm).toBe(
      "63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc",
    );
  });

  it("buildCoordinateMatrixSchedule이 DPR 1/2/3, 뷰포트 320/390/768/1280, 5개 모드, 모든 레인·프리셋을 포함한다", () => {
    const schedule = buildCoordinateMatrixSchedule();
    for (const dpr of DEFAULT_COORD_DPRS) {
      expect(schedule.some((c) => c.dpr === dpr)).toBe(true);
    }
    for (const vw of DEFAULT_COORD_VIEWPORTS) {
      expect(schedule.some((c) => c.viewportW === vw)).toBe(true);
    }
    for (const mode of DEFAULT_COORD_MODES) {
      expect(schedule.some((c) => c.mode === mode)).toBe(true);
    }
    for (const laneId of DEFAULT_COORD_LANES) {
      for (const presetId of DEFAULT_COORD_PRESETS) {
        expect(schedule.some((c) => c.laneId === laneId && c.presetId === presetId)).toBe(true);
      }
    }
  });

  it("evaluateStrokeCoordinateAccuracy가 정확한 표본·교차점·경계를 통과시키고 해상도 간 정규화 비교를 수행한다", () => {
    const accurate256 = {
      requestedDpr: 1,
      windowDpr: 1,
      documentDimensions: { width: 256, height: 256 },
      backingDimensions: { width: 256, height: 256 },
      inkPixels: 1840,
      samplePairs: [
        { expected: { x: 38.4, y: 128 }, actual: { x: 38.4, y: 128 } },
        { expected: { x: 128, y: 128 }, actual: { x: 128.1, y: 127.9 } },
        { expected: { x: 217.6, y: 128 }, actual: { x: 217.6, y: 128 } },
      ],
      actualIntersectionDocPx: { x: 128.2, y: 127.85 },
      actualBoundsDocPx: [12, 12, 244, 244],
      brushRadiusPadDocPx: 4,
    };
    const res256 = evaluateStrokeCoordinateAccuracy(accurate256);
    expect(res256.ok).toBe(true);
    expect(res256.reasons).toEqual([]);
    expect(res256.maxSampleCoordErrorDocPx).toBeLessThanOrEqual(0.5);
    expect(res256.intersectionErrorDocPx).toBeLessThanOrEqual(2.5);
    expect(res256.boundsErrorNorm).toBeLessThanOrEqual(0.04);

    // fit-dpr 모드 DPR 2 (512×512 백킹 스토어)와의 정규화 문서 공간 비교
    const accurate512 = {
      requestedDpr: 2,
      windowDpr: 2,
      documentDimensions: { width: 512, height: 512 },
      backingDimensions: { width: 512, height: 512 },
      inkPixels: 6920,
      samplePairs: [
        { expected: { x: 76.8, y: 256 }, actual: { x: 76.8, y: 256 } },
        { expected: { x: 256, y: 256 }, actual: { x: 256.15, y: 255.9 } },
        { expected: { x: 435.2, y: 256 }, actual: { x: 435.2, y: 256 } },
      ],
      actualIntersectionDocPx: { x: 256.4, y: 255.7 },
      actualBoundsDocPx: [27, 27, 485, 485],
      brushRadiusPadDocPx: 4,
    };
    const res512 = evaluateStrokeCoordinateAccuracy(accurate512);
    expect(res512.ok).toBe(true);

    const crossCmp = compareCrossResolutionNormalized(accurate256, accurate512);
    expect(crossCmp.ok).toBe(true);
    expect(crossCmp.centerDeltaNorm).toBeLessThanOrEqual(0.015);
    expect(crossCmp.boundsDeltaNorm).toBeLessThanOrEqual(0.04);
  });

  it("evaluateStrokeCoordinateAccuracy가 음성 대조군(Double-DPR 버그, 스크롤 오프셋 미보정, 잉크 누락, 백킹 불일치)을 결정론적으로 거부한다", () => {
    // 1. Double-DPR 버그 (DPR 2에서 좌표가 2배로 증폭돼 중앙 128이 256으로 밀림)
    const doubleDprEval = evaluateStrokeCoordinateAccuracy({
      requestedDpr: 2,
      windowDpr: 2,
      documentDimensions: { width: 256, height: 256 },
      backingDimensions: { width: 256, height: 256 },
      inkPixels: 950,
      samplePairs: [
        { expected: { x: 38.4, y: 128 }, actual: { x: 76.8, y: 256 } },
        { expected: { x: 128, y: 128 }, actual: { x: 256, y: 256 } },
      ],
      actualIntersectionDocPx: { x: 242, y: 242 },
      actualBoundsDocPx: [24, 24, 255, 255],
    });
    expect(doubleDprEval.ok).toBe(false);
    expect(doubleDprEval.maxSampleCoordErrorDocPx).toBeGreaterThan(50);
    expect(doubleDprEval.intersectionErrorDocPx).toBeGreaterThan(50);
    expect(doubleDprEval.reasons).toContain("sample-coord-error-exceeded");
    expect(doubleDprEval.reasons).toContain("crosshair-intersection-error-exceeded");

    // 2. 스크롤 오프셋 미보정 버그 (scrollLeft=96, scrollTop=124 누락)
    const scrollBugEval = evaluateStrokeCoordinateAccuracy({
      requestedDpr: 1,
      windowDpr: 1,
      documentDimensions: { width: 256, height: 256 },
      backingDimensions: { width: 256, height: 256 },
      inkPixels: 820,
      samplePairs: [
        { expected: { x: 128, y: 128 }, actual: { x: 32, y: 4 } },
      ],
      actualIntersectionDocPx: { x: 32, y: 4 },
      actualBoundsDocPx: [0, 0, 148, 120],
    });
    expect(scrollBugEval.ok).toBe(false);
    expect(scrollBugEval.maxSampleCoordErrorDocPx).toBeGreaterThan(50);
    expect(scrollBugEval.reasons).toContain("sample-coord-error-exceeded");
    expect(scrollBugEval.reasons).toContain("crosshair-intersection-error-exceeded");
    expect(scrollBugEval.reasons).toContain("ink-bounds-error-exceeded");

    // 3. 백킹 스토어 크기 불일치 및 빈 잉크 / NaN 좌표 거부
    const invalidBackingEval = evaluateStrokeCoordinateAccuracy({
      documentDimensions: { width: 256, height: 256 },
      backingDimensions: { width: 512, height: 512 },
      inkPixels: 0,
      samplePairs: [{ expected: { x: 128, y: 128 }, actual: { x: Number.NaN, y: 128 } }],
      actualIntersectionDocPx: { x: Number.NaN, y: Number.NaN },
      actualBoundsDocPx: null,
    });
    expect(invalidBackingEval.ok).toBe(false);
    expect(invalidBackingEval.reasons).toContain("backing-dimensions-mismatch");
    expect(invalidBackingEval.reasons).toContain("no-ink-pixels");
    expect(invalidBackingEval.reasons).toContain("non-finite-sample-coordinate");
    expect(invalidBackingEval.reasons).toContain("invalid-or-empty-ink-bounds");
  });

  it("BRUSH_LAB_BROWSER_PROBE=1이 아니면 브라우저를 띄우지 않고 종료 코드 0을 돌려준다", async () => {
    const code = await main([], { ...process.env, BRUSH_LAB_BROWSER_PROBE: "0" });
    expect(code).toBe(0);
  });
});
