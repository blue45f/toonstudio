import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as hokusaiModule from "../../../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js";
import { buildFixture } from "../bench/fixtures/stroke-fixtures";
import { coverageIoU } from "../bench/metrics/render-metrics";
import { fakeEnv } from "../bench/testing/synthetic-images";
import { presetById } from "../engine/presets/catalog";

import { HOKUSAI_LANE, createHokusaiLane, hokusaiBrushJson } from "./hokusai-lane";
import { createLibMypaintLane } from "./libmypaint-lane";
import { mapProgramToMypaint } from "./mypaint-settings-map";
import { describeExternalLaneContract, hashOf } from "./testing/external-lane-contract";

import type { HokusaiRuntime } from "./hokusai-lane";
import type { BrushProgram } from "../engine/presets/program-schema";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PKG_DIR = path.join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");

/** Node에는 URL fetch가 없어 wasm 바이트를 직접 넣어 초기화한다(레인의 주입 경로 = 이 테스트가 검증하는 범위). */
let nodeRuntime: Promise<HokusaiRuntime> | undefined;
function loadNodeRuntime(): Promise<HokusaiRuntime> {
  nodeRuntime ??= (async () => {
    await hokusaiModule.default({ module_or_path: readFileSync(path.join(PKG_DIR, "studio_hokusai_wasm_bg.wasm")) });
    return { HokusaiBrush: hokusaiModule.HokusaiBrush, HokusaiCanvas: hokusaiModule.HokusaiCanvas };
  })();
  return nodeRuntime;
}

/** raster-compile.ts의 `HOKUSAI_EVALUATED_SETTINGS`/`HOKUSAI_INPUT_NAMES` 이름 목록(소스 텍스트에서 읽어 드리프트를 고정한다). */
function evaluatedNames(constName: string): Set<string> {
  const source = readFileSync(path.join(REPO_ROOT, "packages", "studio-brush-platform", "src", "raster-compile.ts"), "utf8");
  const start = source.indexOf(`export const ${constName}`);
  const open = source.indexOf("[", start);
  const close = source.indexOf("]", open);
  return new Set([...source.slice(open, close).matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1] ?? ""));
}

describeExternalLaneContract("Hokusai 레인", () => createHokusaiLane({ loadRuntime: loadNodeRuntime }));

describe("Hokusai 레인: 디스크립터·probe·로드", () => {
  it("주입한 런타임으로 probe가 supported를 돌려준다", async () => {
    const lane = createHokusaiLane({ loadRuntime: loadNodeRuntime });
    const report = await lane.probe(fakeEnv());
    expect(report.status).toBe("supported");
    expect(report.laneId).toBe("hokusai");
    expect(report.features).toEqual(["hokusai-0.3.0"]);
    expect(lane.kind).toBe("comparison");
    expect(lane.status).toBe("browser-verification-required");
    expect(lane.engineVersion).toContain("hokusai-0.3.0");
    expect(HOKUSAI_LANE.create().id).toBe("hokusai");
  });

  it("Node의 기본 로드 경로(번들러 wasm URL fetch)는 불가라 probe가 throw 없이 wasm-artifact-missing이다", async () => {
    // 앞선 시험이 pkg 모듈(전역 wasm 상태)을 초기화했으므로 모듈 레지스트리를 비워 초기화되지 않은 새 인스턴스로 시험한다.
    vi.resetModules();
    const fresh = await import("./hokusai-lane");
    const lane = fresh.createHokusaiLane();
    const report = await lane.probe(fakeEnv());
    expect(report.status).toBe("unavailable");
    expect(report.reasons).toEqual(["wasm-artifact-missing"]);
    await expect(lane.init(fakeEnv(), { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ name: "LaneUnavailableError", code: "wasm-artifact-missing" });
  });

  it("런타임 로더가 실패하면 init이 LaneUnavailableError(wasm-artifact-missing)이고 원인 메시지를 보존한다", async () => {
    const lane = createHokusaiLane({ loadRuntime: () => Promise.reject(new Error("pkg 없음")) });
    const init = lane.init(fakeEnv(), { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 });
    await expect(init).rejects.toMatchObject({ code: "wasm-artifact-missing" });
    await expect(init).rejects.toThrow("pkg 없음");
  });

  it("WebAssembly 전역이 없으면 probe가 wasm-artifact-missing을 돌려준다", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
    Object.defineProperty(globalThis, "WebAssembly", { value: undefined, configurable: true, writable: true });
    try {
      const report = await createHokusaiLane({ loadRuntime: loadNodeRuntime }).probe(fakeEnv());
      expect(report.reasons).toEqual(["wasm-artifact-missing"]);
    } finally {
      if (original) Object.defineProperty(globalThis, "WebAssembly", original);
    }
  });
});

describe("Hokusai 레인: libmypaint 레인과 같은 설정 문서", () => {
  it("직렬화는 키 정렬로 결정적이고 v3 문서이며, 레인이 내보내는 모든 설정·입력이 Hokusai가 평가하는 이름이다", () => {
    const evaluatedSettings = evaluatedNames("HOKUSAI_EVALUATED_SETTINGS");
    const evaluatedInputs = evaluatedNames("HOKUSAI_INPUT_NAMES");
    expect(evaluatedSettings.has("radius_logarithmic")).toBe(true);
    expect(evaluatedInputs.has("pressure")).toBe(true);
    for (const id of ["ink-g-pen", "pencil-hb", "airbrush", "marker-alcohol", "charcoal", "eraser-hard", "fx-fur-grass"]) {
      const mapping = mapProgramToMypaint(presetById(id));
      const json = hokusaiBrushJson(mapping);
      expect(json).toBe(hokusaiBrushJson(mapProgramToMypaint(presetById(id))));
      const parsed = JSON.parse(json) as { version: number; settings: Record<string, { inputs: Record<string, unknown> }> };
      expect(parsed.version).toBe(3);
      expect(Object.keys(parsed.settings)).toEqual([...Object.keys(parsed.settings)].sort());
      for (const [name, setting] of Object.entries(parsed.settings)) {
        expect(evaluatedSettings.has(name), `${id}: ${name}은 Hokusai가 평가하지 않는 설정`).toBe(true);
        for (const input of Object.keys(setting.inputs)) expect(evaluatedInputs.has(input), `${id}: ${name}.${input}`).toBe(true);
      }
    }
  });

  it("같은 프로그램·fixture에서 두 엔진은 같은 수학의 두 구현이라 알파 커버리지가 거의 같다(IoU ≥ 0.98) — Sumi와는 같은 브러시가 아니다", async () => {
    const fixture = buildFixture("curve", { width: 128, height: 128 });
    const render = async (lane: ReturnType<typeof createHokusaiLane> | ReturnType<typeof createLibMypaintLane>, program: BrushProgram) => {
      await lane.init(fakeEnv(), { width: 128, height: 128, dpr: 1, tileSize: 16, seed: 1 });
      lane.beginStroke(program, 9);
      lane.addSamples(fixture.samples);
      await lane.endStroke();
      const image = await lane.readback();
      lane.dispose();
      return image;
    };
    const pressureMarker = structuredClone(presetById("marker-alcohol"));
    pressureMarker.strokeDynamics.size = [{ input: "pressure", curve: [0.4, 1], min: 0, max: 1 }];
    for (const program of [pressureMarker, presetById("pencil-hb"), presetById("airbrush"), presetById("charcoal")]) {
      const hokusai = await render(createHokusaiLane({ loadRuntime: loadNodeRuntime }), program);
      const libmypaint = await render(createLibMypaintLane(), program);
      expect(coverageIoU(hokusai, libmypaint), program.id).toBeGreaterThanOrEqual(0.98);
    }
  });

  it("별도 인스턴스가 아니어도 두 Hokusai 레인이 동시에 획을 열 수 있고 결과가 같다(획마다 독립 캔버스)", async () => {
    const make = () => createHokusaiLane({ loadRuntime: loadNodeRuntime });
    const a = make();
    const b = make();
    const init = { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 } as const;
    await a.init(fakeEnv(), init);
    await b.init(fakeEnv(), init);
    const line = buildFixture("line", { width: 64, height: 64 });
    a.beginStroke(presetById("ink-g-pen"), 1);
    b.beginStroke(presetById("ink-g-pen"), 1);
    a.addSamples(line.samples);
    b.addSamples(line.samples);
    await a.endStroke();
    await b.endStroke();
    expect(hashOf(await a.readback())).toBe(hashOf(await b.readback()));
    a.dispose();
    b.dispose();
  });
});
