import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadLibMypaint } from "../../../../packages/studio-brush-platform/src/libmypaint/index";
import { buildFixture } from "../bench/fixtures/stroke-fixtures";
import { fakeEnv } from "../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { LIBMYPAINT_LANE, createLibMypaintLane } from "./libmypaint-lane";
import { describeExternalLaneContract, hashOf } from "./testing/external-lane-contract";

import type { LibMypaintRaw } from "../../../../packages/studio-brush-platform/src/libmypaint/index";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const WASM_PATH = path.join(REPO_ROOT, "packages", "studio-brush-platform", "src", "libmypaint", "mypaint-wasm.wasm");

/** 레인마다 별도 wasm 인스턴스(공유 모듈의 '동시에 획 하나' 임대와 무관하게 격리). */
function isolatedLoader(): () => Promise<LibMypaintRaw> {
  const bytes = new Uint8Array(readFileSync(WASM_PATH));
  return () => loadLibMypaint({ wasmBinary: bytes });
}

describeExternalLaneContract("libmypaint 레인", () => createLibMypaintLane());

describe("libmypaint 레인: 레지스트리 디스크립터·probe", () => {
  it("probe는 핀된 wasm을 로드해 supported를 돌려준다(버전 1.6.1 기록)", async () => {
    const lane = createLibMypaintLane();
    const report = await lane.probe(fakeEnv());
    expect(report.status).toBe("supported");
    expect(report.reasons).toEqual([]);
    expect(report.laneId).toBe("libmypaint");
    expect(report.features[0]).toContain("1.6.1");
    expect(report.limits["maxSurfacePixels"]).toBe(4_194_304);
    expect(lane.kind).toBe("comparison");
    expect(lane.status).toBe("implemented");
    expect(lane.engineVersion).toContain("libmypaint-1.6.1");
    expect(LIBMYPAINT_LANE.create().id).toBe("libmypaint");
    lane.dispose();
  });

  it("로드가 실패하면 probe는 throw 없이 wasm-artifact-missing이고 init은 LaneUnavailableError다", async () => {
    const lane = createLibMypaintLane({
      loadRaw: () => Promise.reject(new Error("wasm 없음")),
    });
    const report = await lane.probe(fakeEnv());
    expect(report.status).toBe("unavailable");
    expect(report.reasons).toEqual(["wasm-artifact-missing"]);
    const init = lane.init(fakeEnv(), { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 });
    await expect(init).rejects.toBeInstanceOf(LaneUnavailableError);
    await expect(init).rejects.toMatchObject({ code: "wasm-artifact-missing" });
    await expect(init).rejects.toThrow("wasm 없음");
  });

  it("WebAssembly 전역이 없으면 probe가 wasm-artifact-missing을 돌려준다", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
    Object.defineProperty(globalThis, "WebAssembly", { value: undefined, configurable: true, writable: true });
    try {
      const report = await createLibMypaintLane().probe(fakeEnv());
      expect(report.reasons).toEqual(["wasm-artifact-missing"]);
    } finally {
      if (original) Object.defineProperty(globalThis, "WebAssembly", original);
    }
  });

  it("표면 한도(한 변 4096, 면적 4,194,304 px)를 넘으면 limit-exceeded로 init을 거부한다", async () => {
    const lane = createLibMypaintLane();
    await expect(lane.init(fakeEnv(), { width: 4097, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "limit-exceeded" });
    await expect(lane.init(fakeEnv(), { width: 3000, height: 3000, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({ code: "limit-exceeded" });
  });
});

describe("libmypaint 레인: wasm 인스턴스 임대", () => {
  it("같은 인스턴스를 공유한 두 레인이 획을 섞으면 두 번째 beginStroke가 InvalidStateError로 드러난다(첫 획은 영향 없음)", async () => {
    const a = createLibMypaintLane();
    const b = createLibMypaintLane();
    const init = { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 } as const;
    await a.init(fakeEnv(), init);
    await b.init(fakeEnv(), init);
    const line = buildFixture("line", { width: 64, height: 64 });
    a.beginStroke(presetById("ink-g-pen"), 1);
    expect(() => b.beginStroke(presetById("ink-g-pen"), 1)).toThrow(InvalidStateError);
    a.addSamples(line.samples);
    await a.endStroke();
    // 첫 획이 끝난 뒤에는 두 번째 레인도 쓸 수 있다.
    b.beginStroke(presetById("ink-g-pen"), 1);
    b.addSamples(line.samples);
    await b.endStroke();
    expect(hashOf(await a.readback())).toBe(hashOf(await b.readback()));
    a.dispose();
    b.dispose();
  });

  it("별도 wasm 인스턴스를 주입하면 두 레인이 동시에 획을 열 수 있고 결과가 같다", async () => {
    const a = createLibMypaintLane({ loadRaw: isolatedLoader() });
    const b = createLibMypaintLane({ loadRaw: isolatedLoader() });
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

describe("libmypaint 레인: 영수증·색", () => {
  it("영수증: submitCount = 프레임 수 + 마감 1회, 통계 누적, 영수증 값이 유한하다", async () => {
    const lane = createLibMypaintLane();
    await lane.init(fakeEnv(), { width: 96, height: 96, dpr: 1, tileSize: 16, seed: 1 });
    const fixture = buildFixture("curve", { width: 96, height: 96 });
    lane.beginStroke(presetById("ink-g-pen"), 1);
    let frames = 0;
    for (const sample of fixture.samples) {
      const batch = lane.addSamples([sample]);
      expect(batch.frameIndex).toBe(frames);
      expect(batch.submitCount).toBe(1);
      frames += 1;
    }
    const receipt = await lane.endStroke();
    expect(receipt.submitCount).toBe(frames + 1);
    expect(receipt.timingSource).toBe("unavailable");
    expect(receipt.gpuTimeMs).toBeNull();
    expect(receipt.overflowDabs).toBe(0);
    expect(receipt.frameTimesMs).toHaveLength(frames + 1);
    expect(lane.stats().strokes).toBe(1);
    expect(lane.stats().lastReceipt).toEqual(receipt);
    lane.dispose();
  });

  it("색 옵션: 빨강 획은 적색 채널이 우세하다", async () => {
    const lane = createLibMypaintLane({ color: [1, 0, 0, 1] });
    await lane.init(fakeEnv(), { width: 96, height: 96, dpr: 1, tileSize: 16, seed: 1 });
    const fixture = buildFixture("line", { width: 96, height: 96 });
    lane.beginStroke(presetById("marker-alcohol"), 1);
    lane.addSamples(fixture.samples);
    await lane.endStroke();
    const image = await lane.readback();
    let best = 0;
    let bestIndex = -1;
    for (let i = 0; i < image.width * image.height; i += 1) {
      const a = image.data[i * 4 + 3] ?? 0;
      if (a > best) {
        best = a;
        bestIndex = i;
      }
    }
    expect(bestIndex).toBeGreaterThanOrEqual(0);
    expect(image.data[bestIndex * 4] ?? 0).toBeGreaterThan(200);
    expect(image.data[bestIndex * 4 + 1] ?? 255).toBeLessThan(40);
    expect(image.data[bestIndex * 4 + 2] ?? 255).toBeLessThan(40);
    lane.dispose();
  });

  it("압력 크기 동역학이 반영된다: 같은 선에서 높은 압력이 더 굵다", async () => {
    const program = structuredClone(presetById("ink-g-pen"));
    program.strokeDynamics.size = [{ input: "pressure", curve: [0.2, 1], min: 0, max: 1 }];
    const line = Array.from({ length: 30 }, (_, i) => ({
      x: 10 + i * 3.5,
      y: 32,
      tMs: i * 8,
      pressure: 0,
      tiltXDeg: 0,
      tiltYDeg: 0,
      twistDeg: 0,
      pointerType: "pen" as const,
      phase: i === 0 ? ("down" as const) : ("move" as const),
      source: "raw" as const,
    }));
    const columnHeight = async (pressure: number): Promise<number> => {
      const lane = createLibMypaintLane();
      await lane.init(fakeEnv(), { width: 128, height: 64, dpr: 1, tileSize: 16, seed: 1 });
      lane.beginStroke(program, 1);
      lane.addSamples(line.map((s) => ({ ...s, pressure })));
      await lane.endStroke();
      const image = await lane.readback();
      lane.dispose();
      let count = 0;
      for (let y = 0; y < image.height; y += 1) if ((image.data[(y * image.width + 64) * 4 + 3] ?? 0) > 128) count += 1;
      return count;
    };
    expect(await columnHeight(1)).toBeGreaterThan(await columnHeight(0.1));
  });
});
