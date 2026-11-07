import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildEvidenceBoundaryManifest,
  collectSourceProvenance,
  DEFAULT_LIFECYCLE_LANES,
  DEFAULT_LIFECYCLE_PRESETS,
  main,
  MAX_RECREATE_ITERATIONS,
  parseLifecycleArgs,
} from "./browser-lifecycle-probe.mjs";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("browser-lifecycle-probe 순수 계약 및 프로비넌스", () => {
  it("기본 레인(cpu-reference, wasm-cpu)·프리셋 3종·최대 재생성 반복 상수(3)를 고정한다", () => {
    expect(DEFAULT_LIFECYCLE_LANES).toEqual(["cpu-reference", "wasm-cpu"]);
    expect(DEFAULT_LIFECYCLE_PRESETS).toEqual(["pencil-hb", "ink-g-pen", "watercolor-wet"]);
    expect(MAX_RECREATE_ITERATIONS).toBe(3);
  });

  it("parseLifecycleArgs가 기본값과 사용자 옵션을 파싱하고 잘못된 인자를 거부한다", () => {
    const defaults = parseLifecycleArgs([]);
    expect(defaults.lanes).toEqual(["cpu-reference", "wasm-cpu"]);
    expect(defaults.presets).toEqual(["pencil-hb", "ink-g-pen", "watercolor-wet"]);
    expect(defaults.skipUi).toBe(false);
    expect(defaults.verbose).toBe(false);
    expect(defaults.serve).toBe(false);

    const custom = parseLifecycleArgs([
      "--lanes",
      "wasm-cpu",
      "--presets",
      "pencil-hb,watercolor-wet",
      "--out",
      "/tmp/custom-lifecycle-out",
      "--skip-ui",
      "--verbose",
      "--serve-child",
    ]);
    expect(custom).toEqual({
      lanes: ["wasm-cpu"],
      presets: ["pencil-hb", "watercolor-wet"],
      out: "/tmp/custom-lifecycle-out",
      skipUi: true,
      verbose: true,
      serve: true,
    });

    expect(() => parseLifecycleArgs(["--unknown-flag"])).toThrow(/알 수 없는 인자/u);
    expect(() => parseLifecycleArgs(["--lanes"])).toThrow(/값이 필요하다/u);
  });

  it("collectSourceProvenance가 라이브 TS 소스 3종과 sumi_kernel.wasm의 SHA-256 해시를 수집한다", () => {
    const prov = collectSourceProvenance(labRoot);
    expect(prov.buildMode).toBe("vite-dev-live-source");
    expect(typeof prov.branch).toBe("string");
    expect(prov.branch.length).toBeGreaterThan(0);
    expect(prov.commitSha).toMatch(/^[0-9a-f]{40}$/u);
    expect(prov.commitShort).toBe(prov.commitSha.slice(0, 12));
    expect(Array.isArray(prov.dirtyFiles)).toBe(true);

    expect(prov.sourceHashes.pointerCaptureTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.liveSessionTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.faultInjectionLaneTs).toMatch(/^[0-9a-f]{64}$/u);
    expect(prov.sourceHashes.sumiKernelWasm).toBe(
      "63a5d3d3c2124b86f212ff6d3abe77f379a654768624b13c520390b3274209dc",
    );
  });

  it("buildEvidenceBoundaryManifest가 검증된 경계와 미검증 하드웨어/브라우저 경계를 명시적으로 분류한다", () => {
    const manifest = buildEvidenceBoundaryManifest();
    expect(manifest.verified.realDomInput.status).toBe("verified-in-chromium");
    expect(manifest.verified.syntheticPointerEvent.status).toBe("verified-in-chromium");
    expect(manifest.verified.testOnlyDelayInjection.status).toBe("verified-in-chromium");
    expect(manifest.verified.cpuWasmRealPixels.status).toBe("verified-in-chromium");
    expect(manifest.verified.cpuWasmRealPixels.lanes).toEqual(["cpu-reference", "wasm-cpu"]);
    expect(manifest.verified.cpuWasmRealPixels.presets).toEqual([
      "pencil-hb",
      "ink-g-pen",
      "watercolor-wet",
    ]);

    expect(manifest.unverified).toEqual({
      physicalGpu: "unverified-no-hardware-gpu-in-vm",
      realHardwareStylusPen: "unverified-no-physical-stylus-device",
      unsupportedBrowsersWebkitFirefox: "unverified-chromium-only",
      rustCleanReproducibleRebuild:
        "unverified-rustc-wasm32-target-not-installed-in-vm-verified-by-sha256-seal-only",
    });
  });

  it("BRUSH_LAB_BROWSER_PROBE=1이 아니면 브라우저를 띄우지 않고 종료 코드 0을 돌려준다", async () => {
    const code = await main([], { ...process.env, BRUSH_LAB_BROWSER_PROBE: "0" });
    expect(code).toBe(0);
  });
});
