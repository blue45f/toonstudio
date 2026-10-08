import { describe, expect, it, vi } from "vitest";

import { buildFixture, FIXTURE_IDS } from "../bench/fixtures/stroke-fixtures";
import { pixelHash } from "../bench/metrics/render-metrics";
import { runFixture } from "../bench/runner/run-fixture";
import { alphaSum, fakeEnv } from "../bench/testing/synthetic-images";
import { encodeLabImage } from "../engine/core/color";
import { InvalidStateError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { CpuReferenceLane, createCpuReferenceLane } from "./cpu-reference-lane";
import { drawLine, expectStrokeColorContract, meanInkColor } from "./testing/stroke-color-contract";

import type { RawSample } from "../engine/core/types";

const SIZE = 128;
/** 스냅샷 대표 프리셋 4종(건식·잉크·마커·에어브러시). 습식은 느려서 runner·report 테스트에서만 다룬다. */
const SNAPSHOT_PRESETS = ["pencil-hb", "ink-g-pen", "marker-alcohol", "airbrush"] as const;

describe("cpu-reference 레인", () => {
  it("probe는 항상 supported이고 레지스트리 메타가 맞다", async () => {
    const lane = createCpuReferenceLane();
    const report = await lane.probe({ clock: { now: () => 0 } });
    expect(report).toMatchObject({ laneId: "cpu-reference", status: "supported", reasons: [] });
    expect(lane.kind).toBe("baseline");
    expect(lane.status).toBe("implemented");
    expect(lane.engineVersion.length).toBeGreaterThan(0);
  });

  it("9 fixture × 대표 프리셋 4종 픽셀 해시 스냅샷(결정성 기준선)", async () => {
    const hashes: Record<string, string> = {};
    for (const presetId of SNAPSHOT_PRESETS) {
      const program = presetById(presetId);
      for (const id of FIXTURE_IDS) {
        const fixture = buildFixture(id, { width: SIZE, height: SIZE });
        const run = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
        expect(run.receipt.overflowDabs).toBe(0);
        expect(alphaSum(run.image)).toBeGreaterThan(0);
        hashes[`${presetId}/${id}`] = pixelHash(run.image);
      }
    }
    expect(new Set(Object.values(hashes)).size).toBe(Object.keys(hashes).length);
    expect(hashes).toMatchSnapshot();
  }, 120000);

  it("같은 입력을 두 번 실행하면 픽셀·선형 버퍼가 같고 산포 프리셋은 시드가 다르면 다르다", async () => {
    const program = presetById("pencil-hb");
    const fixture = buildFixture("curve", { width: SIZE, height: SIZE });
    const a = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 7 });
    const b = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 7 });
    expect(pixelHash(a.image)).toBe(pixelHash(b.image));
    expect(a.linear).toEqual(b.linear);
    const spray = presetById("spray-splatter");
    const s7 = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program: spray, seed: 7 });
    const s8 = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program: spray, seed: 8 });
    expect(pixelHash(s7.image)).not.toBe(pixelHash(s8.image));
    expect(a.linear).not.toBeNull();
    expect(encodeLabImage(a.linear ?? new Float32Array(), SIZE, SIZE)).toEqual(a.image);
  });

  it("addSamples 분할 호출(프레임)과 일괄 호출의 결과가 같다(건식 프리셋)", async () => {
    const program = presetById("pencil-hb");
    const fixture = buildFixture("zigzag", { width: SIZE, height: SIZE });
    const split = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    const lane = new CpuReferenceLane();
    await lane.init(fakeEnv(), { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(program, 1);
    const receipt = lane.addSamples(fixture.samples);
    expect(receipt.frameIndex).toBe(0);
    expect(receipt.submitCount).toBe(1);
    expect(receipt.inputToSubmitMs).not.toBeNull();
    const end = await lane.endStroke();
    const bulk = await lane.readback();
    expect(pixelHash(bulk)).toBe(pixelHash(split.image));
    expect(end.dabCount).toBe(split.receipt.dabCount);
    expect(end.submitCount).toBe(2);
    expect(split.receipt.submitCount).toBe(split.frames.length + 1);
    expect(lane.strokeLatency().length).toBeGreaterThan(0);
    const stats = lane.stats();
    expect(stats.strokes).toBe(1);
    expect(stats.dabs).toBe(end.dabCount);
    expect(stats.lastReceipt).toEqual(end);
    lane.dispose();
  });

  it("두 번째 획은 같은 문서 위에 누적되고 dispose 후·init 전 호출은 InvalidStateError", async () => {
    const program = presetById("ink-g-pen");
    const line = buildFixture("line", { width: SIZE, height: SIZE });
    const curve = buildFixture("curve", { width: SIZE, height: SIZE });
    const lane = new CpuReferenceLane();
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    await lane.init(fakeEnv(), { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 });
    expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
    lane.beginStroke(program, 1);
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    lane.addSamples(line.samples);
    await lane.endStroke();
    const first = alphaSum(await lane.readback());
    lane.beginStroke(program, 2);
    lane.addSamples(curve.samples);
    await lane.endStroke();
    const second = alphaSum(await lane.readback());
    expect(second).toBeGreaterThan(first);
    expect(lane.stats().strokes).toBe(2);
    expect(lane.currentSurface()).not.toBeNull();
    lane.dispose();
    expect(lane.currentSurface()).toBeNull();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(lane.init(fakeEnv(), { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(InvalidStateError);
    expect(() => lane.addSamples(line.samples)).toThrow(InvalidStateError);
  });

  it("endStroke가 던져도 획 상태를 초기화한다: 부분 획은 버려지고 다음 beginStroke가 막히지 않는다", async () => {
    const program = presetById("pencil-hb");
    const fixture = buildFixture("line", { width: 64, height: 64 });
    const lane = new CpuReferenceLane();
    await lane.init(fakeEnv(), { width: 64, height: 64, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(program, 1);
    lane.addSamples(fixture.samples);
    const surface = lane.currentSurface();
    if (!surface) throw new Error("init 뒤에는 표면이 있어야 한다");
    const spy = vi.spyOn(surface, "endStroke").mockImplementationOnce(() => {
      throw new Error("합성 실패(시험용)");
    });
    await expect(lane.endStroke()).rejects.toThrow("합성 실패(시험용)");
    spy.mockRestore();
    // pipeline이 남아 있으면 여기서 '이전 획이 endStroke되지 않았다'로 영구히 실패한다.
    expect(() => lane.beginStroke(program, 2)).not.toThrow();
    // 부분 누적된 획 타일은 비워진다(다음 획에 섞여 합성되지 않는다).
    expect(surface.stroke.pool.used()).toBe(0);
    lane.addSamples(fixture.samples);
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(0);
    // 실패한 획은 문서에 흔적이 없고, 결과는 처음부터 두 번째 획만 그린 것과 같다.
    const clean = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 2 });
    expect(pixelHash(await lane.readback())).toBe(pixelHash(clean.image));
  });

  it("습식 프리셋도 레인 계약대로 끝나며 영수증 타일 수가 양수다", async () => {
    const program = presetById("watercolor-wet");
    const fixture = buildFixture("fast-flick", { width: 64, height: 64 });
    const run = await runFixture({ lane: new CpuReferenceLane(), env: fakeEnv(), fixture, program, seed: 1 });
    expect(run.receipt.poolTilesUsed).toBeGreaterThan(0);
    expect(run.receipt.timingSource).toBe("unavailable");
    expect(run.receipt.gpuTimeMs).toBeNull();
    expect(alphaSum(run.image)).toBeGreaterThan(0);
  }, 60000);
});

describe("cpu-reference 레인: 획 색 계약(beginStroke options.color)", () => {
  const make = (): CpuReferenceLane => new CpuReferenceLane();

  it.each(["ink-g-pen", "pencil-hb", "marker-alcohol", "airbrush"] as const)(
    "%s: 색을 지정하면 평균 색이 지정색 근처이고 색 없는 결과와 해시가 다르다",
    async (presetId) => {
      await expectStrokeColorContract({ make, presetId });
      await expectStrokeColorContract({ make, presetId, color: [0.1, 0.25, 0.9, 1] });
    },
  );

  it("색 인자가 없거나 검정 [0,0,0,1]이면 기존 결과와 같다(색 없는 호출이 기본 검정과 비트 동일)", async () => {
    const plain = await drawLine({ make, presetId: "pencil-hb" });
    const black = await drawLine({ make, presetId: "pencil-hb", options: { color: [0, 0, 0, 1] } });
    const empty = await drawLine({ make, presetId: "pencil-hb", options: {} });
    expect(pixelHash(black)).toBe(pixelHash(plain));
    expect(pixelHash(empty)).toBe(pixelHash(plain));
  });

  it("색 알파는 dab 색의 알파로 들어간다(알파 0.4는 같은 색 알파 1보다 알파 총량이 작다)", async () => {
    const solid = await drawLine({ make, options: { color: [0.8, 0.2, 0.2, 1] } });
    const faint = await drawLine({ make, options: { color: [0.8, 0.2, 0.2, 0.4] } });
    expect(alphaSum(faint)).toBeLessThan(alphaSum(solid));
    expect(meanInkColor(faint)?.r ?? 0).toBeGreaterThan(0.6);
  });

  it("습식(수채·유화) 획도 지정한 색을 침착한다 — 혼색 로직은 프로그램 그대로", async () => {
    for (const presetId of ["watercolor-wet", "oil-impasto"] as const) {
      const mean = meanInkColor(await drawLine({ make, presetId, size: 64, options: { color: [0.1, 0.35, 0.85, 1] } }));
      expect(mean, presetId).not.toBeNull();
      if (!mean) continue;
      // 습식은 종이·건조·조명으로 색이 옅어지므로 허용 오차를 두되, 파란 채널이 적색 채널을 앞서야 한다.
      expect(mean.b, presetId).toBeGreaterThan(mean.r + 0.15);
    }
  }, 120000);

  it("잘못된 색(범위 밖·NaN·길이 불일치)은 InvalidStateError로 거부하고 레인은 다음 획을 받을 수 있다", async () => {
    const lane = createCpuReferenceLane();
    await lane.init(fakeEnv(), { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    const program = presetById("ink-g-pen");
    const bad: unknown[] = [[2, 0, 0, 1], [Number.NaN, 0, 0, 1], [0, 0, 0], [0, 0, 0, 1, 1], [-0.1, 0, 0, 1]];
    for (const color of bad) {
      expect(() => lane.beginStroke(program, 1, { color: color as [number, number, number, number] })).toThrow(InvalidStateError);
    }
    lane.beginStroke(program, 1, { color: [1, 0, 0, 1] });
    await lane.endStroke();
    lane.dispose();
  });

  it("abortStroke 뒤 다음 획의 색은 새로 정해진다(이전 획 색이 새지 않는다)", async () => {
    const lane = createCpuReferenceLane();
    await lane.init(fakeEnv(), { width: 96, height: 96, dpr: 1, tileSize: 16, seed: 1 });
    const program = presetById("ink-g-pen");
    const fixture = buildFixture("line", { width: 96, height: 96 });
    lane.beginStroke(program, 1, { color: [1, 0, 0, 1] });
    lane.addSamples(fixture.samples);
    lane.abortStroke();
    lane.beginStroke(program, 1, { color: [0, 0, 1, 1] });
    lane.addSamples(fixture.samples);
    await lane.endStroke();
    const mean = meanInkColor(await lane.readback());
    lane.dispose();
    expect(mean?.b ?? 0).toBeGreaterThan(0.8);
    expect(mean?.r ?? 1).toBeLessThan(0.1);
  });
});

describe("cpu-reference 레인: 빠른 획(프레임당 표본 1개, 큰 도약)이 버려지지 않는다", () => {
  const CASES: ReadonlyArray<readonly [string, number, number]> = [
    ["pencil-hb", 16, 8],
    ["ink-g-pen", 16, 16],
    ["charcoal", 30, 16],
    ["airbrush", 60, 16],
  ];

  it.each(CASES)("%s: 프레임 간 %i px 도약(%i ms)도 stroke-budget-exceeded 없이 끝난다", async (presetId, stepPx, stepMs) => {
    const lane = createCpuReferenceLane();
    await lane.init(fakeEnv(), { width: 512, height: 128, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(presetById(presetId), 1);
    for (let i = 0; i < 24; i += 1) {
      lane.addSamples([
        {
          x: 20 + i * stepPx,
          y: 64,
          tMs: i * stepMs,
          pressure: 0.6,
          tiltXDeg: 0,
          tiltYDeg: 0,
          twistDeg: 0,
          pointerType: "pen",
          phase: i === 0 ? "down" : i === 23 ? "up" : "move",
          source: "raw",
        },
      ]);
    }
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(0);
    expect(meanInkColor(await lane.readback())).not.toBeNull();
    lane.dispose();
  }, 60000);

  it("터무니없는 도약(수백만 px)은 한글 사유와 함께 stroke-budget-exceeded로 거부하고 레인은 abortStroke 뒤 다시 쓸 수 있다", async () => {
    const lane = createCpuReferenceLane();
    await lane.init(fakeEnv(), { width: 128, height: 128, dpr: 1, tileSize: 16, seed: 1 });
    lane.beginStroke(presetById("airbrush"), 1);
    const sample = (x: number, tMs: number): RawSample => ({ x, y: 64, tMs, pressure: 0.5, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, pointerType: "pen", phase: "move", source: "raw" });
    lane.addSamples([sample(10, 0)]);
    let caught: unknown = null;
    try {
      lane.addSamples([sample(5_000_000, 16)]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "stroke-budget-exceeded" });
    expect(String((caught as { details?: { reasonKo?: string } }).details?.reasonKo)).toMatch(/비정상 입력/);
    expect(lane.abortStroke().documentPreserved).toBe(true);
    lane.beginStroke(presetById("ink-g-pen"), 1);
    await lane.endStroke();
    lane.dispose();
  });
});
