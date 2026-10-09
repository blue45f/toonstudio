import { afterEach, describe, expect, it } from "vitest";

import { pixelHash } from "../../bench/metrics/render-metrics";
import { fakeEnv } from "../../bench/testing/synthetic-images";
import { LaneUnavailableError } from "../../engine/core/errors";
import { BODY_STATE_STRIDE } from "../../engine/physics/world2d/types";
import { laneById } from "../registry";

import { BRUSH, CONTRACT_INIT, describeBristleLaneContract, STROKE_A } from "./bristle-lane-contract";
import { createBristlePbdLane } from "./bristle-pbd-lane";
import { BRISTLE_RAPIER_LANE_ID, createRapierBristleLane, RapierBristleLane } from "./rapier-bristle-lane";
import { loadRapier, resetRapierLoaderCache } from "./rapier-loader";
import { RapierWorld2D } from "./rapier-world";

import type { BristleStrokeReceipt } from "./bristle-dab-synthesis";
import type { RapierImporter } from "./rapier-loader";

afterEach(() => {
  resetRapierLoaderCache();
});

describe("bristle-rapier 레인: 메타·등록·로드 실패", () => {
  it("probe는 모듈을 불러오지 않고 supported이며 실험 후보 레인으로 등록돼 있다", async () => {
    const lane = new RapierBristleLane();
    expect(await lane.probe({ clock: { now: () => 0 } })).toMatchObject({ laneId: "bristle-rapier", status: "supported", reasons: [] });
    expect(lane.isLoaded()).toBe(false);
    expect(lane.id).toBe(BRISTLE_RAPIER_LANE_ID);
    expect(lane.kind).toBe("candidate");
    expect(lane.status).toBe("implemented");
    expect(lane.maturity).toBe("experimental");
    expect(laneById("bristle-rapier").maturity).toBe("experimental");
    expect(laneById("bristle-rapier").create().id).toBe("bristle-rapier");
  });

  it("init에서 동적 import한다: init 전에는 로드되지 않고 init 뒤에는 로드된다", async () => {
    let imports = 0;
    const real = await import("@dimforge/rapier2d-compat");
    const importer: RapierImporter = async () => {
      imports += 1;
      return real;
    };
    const lane = new RapierBristleLane({ importer });
    expect(imports).toBe(0);
    await lane.init(fakeEnv(), CONTRACT_INIT);
    expect(imports).toBe(1);
    expect(lane.isLoaded()).toBe(true);
    lane.dispose();
  });

  it("임포터가 실패하면 init이 LaneUnavailableError(wasm-artifact-missing)로 실패하고 레인은 쓸 수 없다 — 자체 PBD로 몰래 바꾸지 않는다", async () => {
    const lane = new RapierBristleLane({
      importer: async () => {
        throw new Error("청크 404 시험");
      },
    });
    let error: unknown;
    try {
      await lane.init(fakeEnv(), CONTRACT_INIT);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(LaneUnavailableError);
    expect((error as LaneUnavailableError).code).toBe("wasm-artifact-missing");
    expect((error as LaneUnavailableError).message).toContain("청크 404 시험");
    expect(lane.isLoaded()).toBe(false);
    // init이 실패한 레인은 그리지 않는다(표면이 없다). 대체 레인으로 전환하지 않는다.
    expect(() => lane.beginStroke(BRUSH, 1)).toThrow(/init 전/);
    expect(lane.id).toBe("bristle-rapier");
  });

  it("RAPIER.init() 실패도 LaneUnavailableError이고, 모양 불일치는 wasm-integrity-mismatch다", async () => {
    const initFail = new RapierBristleLane({
      importer: async () => ({
        default: {
          init: async () => {
            throw new Error("init 실패 시험");
          },
          World: class {},
          RigidBodyDesc: class {},
          ColliderDesc: class {},
          JointData: class {},
        },
      }),
    });
    await expect(initFail.init(fakeEnv(), CONTRACT_INIT)).rejects.toMatchObject({ code: "wasm-artifact-missing", details: { stage: "init" } });
    const shape = new RapierBristleLane({ importer: async () => ({ default: {} }) });
    await expect(shape.init(fakeEnv(), CONTRACT_INIT)).rejects.toMatchObject({ code: "wasm-integrity-mismatch" });
  });

  it("WebAssembly가 없으면 probe가 feature-missing으로 unavailable이다(throw 없음)", async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
    Object.defineProperty(globalThis, "WebAssembly", { value: undefined, configurable: true, writable: true });
    try {
      const report = await new RapierBristleLane().probe({ clock: { now: () => 0 } });
      expect(report.status).toBe("unavailable");
      expect(report.reasons).toEqual(["feature-missing"]);
    } finally {
      if (desc) Object.defineProperty(globalThis, "WebAssembly", desc);
    }
  });

  it("털 수가 범위를 벗어나면 모듈을 불러오기 전에 limit-exceeded로 거부한다", async () => {
    let imports = 0;
    const lane = new RapierBristleLane({
      bristles: 0,
      importer: async () => {
        imports += 1;
        throw new Error("호출되면 안 된다");
      },
    });
    await expect(lane.init(fakeEnv(), CONTRACT_INIT)).rejects.toMatchObject({ code: "limit-exceeded" });
    expect(imports).toBe(0);
  });
});

describeBristleLaneContract("bristle-rapier", () => createRapierBristleLane(), "rapier2d", (options) => createRapierBristleLane(options));

describe("bristle-rapier 레인: 같은 머신 결정성(Node 22, 교차 머신·브라우저는 미검증)", () => {
  it("같은 입력을 새 월드로 세 번 그려도 해시가 같고, 선형 버퍼가 비트 단위로 같다", async () => {
    const run = async (): Promise<{ hash: string; linear: Float32Array | null }> => {
      const lane = createRapierBristleLane({ bristles: 32 });
      await lane.init(fakeEnv(), CONTRACT_INIT);
      lane.beginStroke(BRUSH, 9, { color: [0.2, 0.2, 0.6, 1] });
      for (const s of STROKE_A) lane.addSamples([s]);
      await lane.endStroke();
      const out = { hash: pixelHash(await lane.readback()), linear: await lane.readbackLinear() };
      lane.dispose();
      return out;
    };
    const a = await run();
    const b = await run();
    const c = await run();
    expect(a.hash).toBe(b.hash);
    expect(b.hash).toBe(c.hash);
    expect(a.linear).toEqual(c.linear);
  });

  it("자체 PBD 레인과 같은 입력에서 비슷하지만 같은 그림은 아니다(같은 붓털·dab 합성, 월드만 다르다)", async () => {
    const draw = async (make: () => ReturnType<typeof createRapierBristleLane>): Promise<{ hash: string; inked: number }> => {
      const lane = make();
      await lane.init(fakeEnv(), CONTRACT_INIT);
      lane.beginStroke(BRUSH, 9);
      for (const s of STROKE_A) lane.addSamples([s]);
      await lane.endStroke();
      const img = await lane.readback();
      let inked = 0;
      for (let i = 3; i < img.data.length; i += 4) if ((img.data[i] ?? 0) > 12) inked += 1;
      const hash = pixelHash(img);
      lane.dispose();
      return { hash, inked };
    };
    const rapier = await draw(() => createRapierBristleLane({ bristles: 32 }));
    const pbd = await draw(() => createBristlePbdLane({ bristles: 32 }));
    expect(rapier.hash).not.toBe(pbd.hash);
    expect(Math.abs(rapier.inked - pbd.inked) / pbd.inked).toBeLessThan(0.25);
  });

  it("영수증에 월드 진단(스텝 수·스프링 재생성 수)이 남는다: 강성 단계가 바뀌면 재생성이 센다", async () => {
    const lane = createRapierBristleLane({ bristles: 8 });
    await lane.init(fakeEnv(), CONTRACT_INIT);
    lane.beginStroke(BRUSH, 1);
    // 압력 램프: 강성 단계가 여러 번 바뀐다.
    lane.addSamples(STROKE_A.map((s, i) => ({ ...s, pressure: Math.min(1, 0.05 + i / STROKE_A.length) })));
    const receipt = (await lane.endStroke()) as BristleStrokeReceipt;
    expect(receipt.stiffnessUpdates).toBeGreaterThan(0);
    expect(receipt.worldDiagnostics.springRebuilds).toBe(receipt.stiffnessUpdates * 8);
    expect(receipt.worldDiagnostics.steps).toBe(receipt.ticks);
    // 건강한 획에서는 비유한 상태 카운터가 0이다(진단 항목 자체가 있어야 비유한 상태가 침묵하지 않는다).
    expect(receipt.worldDiagnostics.nonFiniteStates).toBe(0);
    lane.dispose();
  });
});

describe("RapierWorld2D 어댑터(실제 wasm)", () => {
  async function world(): Promise<RapierWorld2D> {
    return new RapierWorld2D(await loadRapier());
  }

  it("검증 오류와 dispose 이후 동작", async () => {
    const w = await world();
    expect(w.traits).toMatchObject({ backendId: "rapier2d", needsDispose: true });
    expect(() => w.addCircle({ x: Number.NaN, y: 0, radius: 1, mass: 1 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: 0, mass: 1 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: 1, mass: 0 })).toThrow(RangeError);
    expect(() => w.addCircle({ x: 0, y: 0, radius: 1, mass: 1, collideGroup: 17 })).toThrow(RangeError);
    const slot = w.addCircle({ x: 0, y: 0, radius: 0.5, mass: 1, kinematic: true });
    const body = w.addCircle({ x: 0, y: 0, radius: 1, mass: 1 });
    expect(() => w.setKinematicTarget(body, 1, 1)).toThrow(RangeError);
    expect(() => w.setKinematicTarget(slot, Number.NaN, 1)).toThrow(RangeError);
    expect(() => w.addSpring(slot, 9, { restLength: 0, stiffness: 1, damping: 0 })).toThrow(RangeError);
    expect(() => w.setSpring(3, { restLength: 0, stiffness: 1, damping: 0 })).toThrow(RangeError);
    expect(() => w.step(0)).toThrow(RangeError);
    expect(() => w.readState(new Float32Array(2))).toThrow(RangeError);
    w.dispose();
    w.dispose();
    expect(() => w.step(1 / 240)).toThrow(/dispose/);
  });

  it("스프링·항력·외력·충돌 질의가 계약대로 동작한다", async () => {
    const w = await world();
    const slot = w.addCircle({ x: 0, y: 0, radius: 0.5, mass: 1, kinematic: true });
    const body = w.addCircle({ x: 0, y: 0, radius: 2, mass: 1, linearDamping: 40, collideGroup: 1 });
    const spring = w.addSpring(slot, body, { restLength: 0, stiffness: 7000, damping: 2 * 0.7 * Math.sqrt(7000) });
    w.setKinematicTarget(slot, 25, -10);
    for (let i = 0; i < 480; i += 1) w.step(1 / 240);
    const out = new Float32Array(2 * BODY_STATE_STRIDE);
    w.readState(out);
    expect(out[body * 4]).toBeCloseTo(25, 0);
    expect(out[body * 4 + 1]).toBeCloseTo(-10, 0);
    // setSpring은 조인트를 다시 만든다(진단 카운터).
    w.setSpring(spring, { restLength: 0, stiffness: 3000, damping: 50 });
    expect(w.diagnostics()).toMatchObject({ springRebuilds: 1 });
    // 충돌 질의: 동적 몸체만, 번호순.
    const hits: number[] = [];
    expect(w.queryCircle(25, -10, 3, hits)).toBe(1);
    expect(hits).toEqual([body]);
    expect(w.queryCircle(500, 500, 3, hits)).toBe(0);
    // 외력은 한 틱에만 적용된다.
    const free = w.addCircle({ x: 200, y: 200, radius: 1, mass: 2 });
    w.applyForce(free, 8, 0);
    w.step(1 / 240);
    const o2 = new Float32Array(3 * BODY_STATE_STRIDE);
    w.readState(o2);
    const v1 = o2[free * 4 + 2] ?? 0;
    expect(v1).toBeGreaterThan(0);
    w.step(1 / 240);
    w.readState(o2);
    expect(o2[free * 4 + 2] ?? 0).toBeCloseTo(v1, 2);
    w.dispose();
  });

  it("같은 충돌 그룹은 서로 밀어내고 그룹 0은 통과한다", async () => {
    const w = await world();
    const spec = { radius: 3, mass: 1, linearDamping: 60 } as const;
    const a = w.addCircle({ x: -4, y: 0, ...spec, collideGroup: 1 });
    const b = w.addCircle({ x: 4, y: 0, ...spec, collideGroup: 1 });
    const c = w.addCircle({ x: -4, y: 40, ...spec, collideGroup: 0 });
    const d = w.addCircle({ x: 4, y: 40, ...spec, collideGroup: 0 });
    const ka = w.addCircle({ x: 0, y: 0, radius: 0.5, mass: 1, kinematic: true });
    const kc = w.addCircle({ x: 0, y: 40, radius: 0.5, mass: 1, kinematic: true });
    for (const [bodyId, slotId] of [[a, ka], [b, ka], [c, kc], [d, kc]] as const) {
      w.addSpring(slotId, bodyId, { restLength: 0, stiffness: 7000, damping: 2 * Math.sqrt(7000) });
    }
    for (let i = 0; i < 480; i += 1) w.step(1 / 240);
    const out = new Float32Array(6 * BODY_STATE_STRIDE);
    w.readState(out);
    const dist = (i: number, j: number): number => Math.hypot((out[i * 4] ?? 0) - (out[j * 4] ?? 0), (out[i * 4 + 1] ?? 0) - (out[j * 4 + 1] ?? 0));
    expect(dist(a, b)).toBeGreaterThan(4.5);
    expect(dist(c, d)).toBeLessThan(1);
    w.dispose();
  });
});
