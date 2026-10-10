import { describe, expect, it } from "vitest";

import { fakeEnv } from "../../bench/testing/synthetic-images";
import { unpackDab } from "../../engine/core/dab-layout";
import { InvalidStateError } from "../../engine/core/errors";
import { fermatLayout } from "../../engine/physics/world2d/bristle-brush";
import { PbdWorld2D } from "../../engine/physics/world2d/pbd-world";
import { PressureCurveTable } from "../../engine/physics/world2d/pressure-curve";
import { PRESET_IDS, presetById } from "../../engine/presets/catalog";
import { Surface } from "../../engine/raster/reference-renderer";
import { lineStroke } from "../../engine/testing/synthetic-strokes";

import {
  BRISTLE_BATCH_CAPACITY,
  BRISTLE_DENSITY_FLOOR,
  BRISTLE_FLOW_PRESSURE_FLOOR,
  BRISTLE_MAX_ABS_COORD_PX,
  BRISTLE_MIN_DAB_RADIUS_PX,
  BRISTLE_MIN_LOAD,
  BRISTLE_MIN_PRESSURE,
  BristleDabSynthesizer,
  BristleLaneBase,
  bristleFillRatio,
  mapProgramToBristle,
  unsupportedBristleReason,
} from "./bristle-dab-synthesis";
import { BRUSH, CONTRACT_INIT } from "./bristle-lane-contract";

import type { DabBatch } from "../../engine/core/dab-layout";
import type { DabInstance, RawSample } from "../../engine/core/types";
import type { BristleTick } from "../../engine/physics/world2d/bristle-brush";
import type { CircleBodySpec, PhysicsWorld2D } from "../../engine/physics/world2d/types";
import type { LaneCapabilityReport, LaneEnvironment, LaneId, LaneMaturity } from "../lane";
import type { BristleDabResponse } from "./bristle-dab-synthesis";

/** 제출된 dab를 모으는 표면 스텁(`addDabs`만 쓴다). */
function stubSurface(): { surface: Surface; dabs: DabInstance[]; submits: number[] } {
  const dabs: DabInstance[] = [];
  const submits: number[] = [];
  const surface = {
    addDabs: (batch: DabBatch) => {
      submits.push(batch.count);
      for (let i = 0; i < batch.count; i += 1) dabs.push(unpackDab(batch.data, i));
      return { dabCount: batch.count, overflowDabs: 0, dirtyTiles: 3 };
    },
  } as unknown as Surface;
  return { surface, dabs, submits };
}

/** 털 n올이 각자 y = 10·i에서 (x0 → x1)로 한 틱에 움직인 틱. */
function moveTick(n: number, x0: number, x1: number, opts: { pressure?: number; load?: number; spread?: number } = {}): BristleTick {
  const prevX = new Float32Array(n).fill(x0);
  const curX = new Float32Array(n).fill(x1);
  const ys = Float32Array.from({ length: n }, (_, i) => 10 * i);
  return {
    count: n,
    prevX,
    prevY: ys,
    curX,
    curY: Float32Array.from(ys),
    load: new Float32Array(n).fill(opts.load ?? 1),
    moved: new Float32Array(n).fill(Math.abs(x1 - x0)),
    pressure: opts.pressure ?? 0.8,
    tMs: 0,
    handleX: x1,
    handleY: 0,
    spreadRadiusPx: opts.spread ?? 10,
  };
}

/** 이미 선형 premultiplied로 변환된 색(변환은 레인이 하고 색 계약 시험이 확인한다). */
const COLOR = [0.2, 0.1, 0.05, 1] as const;

function synth(surface: Surface, n = 2, radius = 2, baseFlow = 0.1): BristleDabSynthesizer {
  return new BristleDabSynthesizer(surface, n, radius, baseFlow, COLOR, 7, 10);
}

describe("프로그램 → 붓털 매핑", () => {
  it("팁 지름 → 벌어짐 반경(1.5..64 clamp), 털 수 → 기준 흐름(÷√N)", () => {
    const pen = presetById("ink-g-pen");
    const a = mapProgramToBristle({ ...pen, tip: { ...pen.tip, sizePx: 40 } }, { bristles: 8 });
    expect(a.config.radiusPx).toBe(20);
    expect(a.config.count).toBe(8);
    const tiny = mapProgramToBristle({ ...pen, tip: { ...pen.tip, sizePx: 1 } });
    expect(tiny.config.radiusPx).toBe(1.5);
    const huge = mapProgramToBristle({ ...pen, tip: { ...pen.tip, sizePx: 500 } });
    expect(huge.config.radiusPx).toBe(64);
    const light = { ...pen, deposition: { ...pen.deposition, flow: 0.2 } };
    const f8 = mapProgramToBristle(light, { bristles: 8 }).baseFlow;
    const f128 = mapProgramToBristle(light, { bristles: 128 }).baseFlow;
    expect(f8 / f128).toBeCloseTo(Math.sqrt(128 / 8), 1);
    // 흐름이 큰 프로그램은 dab당 상한 0.6으로 제한한다.
    expect(mapProgramToBristle(pen, { bristles: 8 }).baseFlow).toBe(0.6);
  });

  it("압력 곡선 선택: 기본은 단조 power-fit, buckling-3d는 비단조 표다", () => {
    const pen = presetById("ink-g-pen");
    expect(mapProgramToBristle(pen).config.spreadCurve.isMonotonic()).toBe(true);
    expect(mapProgramToBristle(pen, { spreadCurve: "buckling-3d" }).config.spreadCurve.isMonotonic()).toBe(false);
    expect(mapProgramToBristle(pen, { spreadCurve: "buckling-3d" }).mappedKo.some((t) => t.includes("buckling-3d"))).toBe(true);
  });

  it("덮어쓴 붓털 설정은 검증된다(잘못된 값은 RangeError)", () => {
    const pen = presetById("ink-g-pen");
    expect(mapProgramToBristle(pen, { brush: { fnHz: 20 } }).config.fnHz).toBe(20);
    expect(() => mapProgramToBristle(pen, { brush: { fnHz: 99 } })).toThrow(RangeError);
    expect(() => mapProgramToBristle(pen, { bristles: 0 })).toThrow(RangeError);
  });

  it("옮긴 필드와 옮기지 않은 필드를 한글로 모두 드러낸다", () => {
    const m = mapProgramToBristle(presetById("ink-g-pen"));
    expect(m.mappedKo.length).toBeGreaterThanOrEqual(4);
    expect(m.unmappedKo.some((t) => t.includes("종이 그레인"))).toBe(true);
    expect(m.unmappedKo.some((t) => t.includes("건조 끊김"))).toBe(true);
  });

  it("거부 판정: 습식·임파스토·smudge·지우개는 사유가 있고 나머지 건식 프리셋은 null이다", () => {
    const rejected: string[] = [];
    for (const id of PRESET_IDS) {
      const reason = unsupportedBristleReason(presetById(id));
      if (reason !== null) {
        rejected.push(id);
        expect(reason).toContain(id);
      }
    }
    for (const id of ["watercolor-wet", "sumi-ink-wet", "oil-impasto", "smudge-blend", "eraser-soft", "eraser-hard"]) {
      expect(rejected, id).toContain(id);
    }
    for (const id of ["ink-g-pen", "ink-brush-pen", "pencil-hb", "marker-alcohol", "crayon", "charcoal", "airbrush"]) {
      expect(rejected, id).not.toContain(id);
    }
  });

  it("R-B-2 무음 대체 금지: 산포·점·해치 팁·하프톤·스프레이·fx 계열은 둥근 dab로 근사하지 않고 한글 사유로 거부한다", () => {
    for (const id of ["spray-splatter", "screentone-halftone", "hatch-pen", "fx-glitter", "fx-fur-grass", "fx-cloud-smoke"]) {
      const reason = unsupportedBristleReason(presetById(id));
      expect(reason, id).not.toBeNull();
      expect(reason, id).toContain(id);
      expect(reason, id).toMatch(/[가-힣]/);
    }
    expect(unsupportedBristleReason(presetById("screentone-halftone"))).toContain("하프톤");
    expect(unsupportedBristleReason(presetById("spray-splatter"))).toContain("스프레이");
  });

  it("R-B-2 근사로 허용하는 프로그램은 모델 이름을 구체적으로 적는다: 에어브러시는 경고, 털 모델은 대신 표현함을 밝힌다", () => {
    const airbrush = mapProgramToBristle(presetById("airbrush"));
    expect(airbrush.notesKo.some((t) => t.includes("airbrush") && t.includes("에어브러시"))).toBe(true);
    expect(airbrush.unmappedKo.some((t) => t.includes("airbrush"))).toBe(true);
    const brushPen = mapProgramToBristle(presetById("ink-brush-pen"));
    expect(brushPen.unmappedKo.some((t) => t.includes("bristle") && t.includes("가닥"))).toBe(true);
    expect(brushPen.notesKo).toEqual([]);
    // 둥근 팁 건식 프리셋은 경고 없이 팁 종류만 밝힌다.
    const pen = mapProgramToBristle(presetById("ink-g-pen"));
    expect(pen.notesKo).toEqual([]);
    expect(pen.unmappedKo[0]).toContain("round");
    // 질감 팁은 팁 이름과 함께 경고한다.
    expect(mapProgramToBristle(presetById("crayon")).notesKo.some((t) => t.includes("texture-stamp"))).toBe(true);
  });

  it("R-B-7 spreadCurve 옵션은 pressureCurveById로 적용되고 mappedKo에 곡선 이름이 그대로 적힌다('linear'가 조용히 power-fit이 되지 않는다)", () => {
    const pen = presetById("ink-g-pen");
    const linear = mapProgramToBristle(pen, { spreadCurve: "linear" });
    const power = mapProgramToBristle(pen);
    expect(linear.config.spreadCurve.eval(0)).toBeCloseTo(0.45, 5);
    expect(linear.config.spreadCurve.eval(1)).toBeCloseTo(1, 5);
    expect(linear.config.spreadCurve.eval(0)).not.toBeCloseTo(power.config.spreadCurve.eval(0), 3);
    expect(linear.mappedKo.some((t) => t.includes("linear"))).toBe(true);
    expect(power.mappedKo.some((t) => t.includes("power-fit"))).toBe(true);
    expect(mapProgramToBristle(pen, { spreadCurve: "buckling-3d" }).mappedKo.some((t) => t.includes("buckling-3d"))).toBe(true);
  });
});

/** 월드 생성·해제 횟수를 세고 n번째 몸체 추가에서 던질 수 있는 PBD 래퍼. */
class CountingWorld extends PbdWorld2D {
  static created = 0;
  static freed = 0;
  static failAtBody = -1;
  private added = 0;

  constructor() {
    super();
    CountingWorld.created += 1;
  }

  override addCircle(spec: CircleBodySpec): number {
    this.added += 1;
    if (CountingWorld.failAtBody > 0 && this.added === CountingWorld.failAtBody) throw new Error("몸체 추가 실패 시뮬레이션");
    return super.addCircle(spec);
  }

  override dispose(): void {
    CountingWorld.freed += 1;
    super.dispose();
  }
}

class CountingLane extends BristleLaneBase {
  readonly id: LaneId = "bristle-pbd";
  readonly label = "카운팅 레인(시험)";
  readonly maturity: LaneMaturity = "experimental";

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    return { laneId: this.id, status: "supported", reasons: [], notes: [] } as unknown as LaneCapabilityReport;
  }

  protected async prepareWorldFactory(_env: LaneEnvironment): Promise<() => PhysicsWorld2D> {
    return () => new CountingWorld();
  }

  protected backendId(): string {
    return "counting";
  }
}

const SAMPLES = lineStroke(24, 40, 104, 46, 0.7, { durationMs: 200 });

describe("R-B-5 월드 누수 방지(해제 보장)", () => {
  it("begin()이 월드 생성 도중 던져도 만든 월드를 해제하고, 다음 addSamples가 실패마다 월드를 쌓지 않는다", async () => {
    CountingWorld.created = 0;
    CountingWorld.freed = 0;
    CountingWorld.failAtBody = 3;
    const lane = new CountingLane();
    await lane.init(fakeEnv(), CONTRACT_INIT);
    lane.beginStroke(BRUSH, 1);
    expect(() => lane.addSamples(SAMPLES)).toThrow("몸체 추가 실패 시뮬레이션");
    expect(CountingWorld.created).toBe(1);
    expect(CountingWorld.freed).toBe(1);
    // 다시 시도해도 실패마다 만든 월드가 모두 해제된다.
    expect(() => lane.addSamples(SAMPLES)).toThrow("몸체 추가 실패 시뮬레이션");
    expect(CountingWorld.created).toBe(2);
    expect(CountingWorld.freed).toBe(2);
    lane.abortStroke();
    lane.dispose();
    expect(CountingWorld.freed).toBe(CountingWorld.created);
    CountingWorld.failAtBody = -1;
  });

  it("획 도중 init()을 다시 불러도 진행 중이던 세션의 월드를 해제한다", async () => {
    CountingWorld.created = 0;
    CountingWorld.freed = 0;
    CountingWorld.failAtBody = -1;
    const lane = new CountingLane();
    await lane.init(fakeEnv(), CONTRACT_INIT);
    for (let i = 0; i < 3; i += 1) {
      lane.beginStroke(BRUSH, 1);
      lane.addSamples(SAMPLES.slice(0, 10));
      await lane.init(fakeEnv(), CONTRACT_INIT);
    }
    expect(CountingWorld.created).toBe(3);
    expect(CountingWorld.freed).toBe(3);
    lane.dispose();
  });
});

describe("R-B-6 addSamples 선검사(f32 범위·기울기 유한성)", () => {
  async function ready(headingSource: "velocity" | "tilt"): Promise<CountingLane> {
    const lane = new CountingLane({ headingSource });
    await lane.init(fakeEnv(), CONTRACT_INIT);
    return lane;
  }

  it("f32 범위를 넘는 유한 좌표는 틱 도중 RangeError가 아니라 배치 선검사에서 InvalidStateError로 거부하고 아무것도 진행하지 않는다", async () => {
    const lane = await ready("velocity");
    lane.beginStroke(BRUSH, 1);
    const bad: RawSample[] = [...SAMPLES.slice(0, 12), { ...(SAMPLES[12] as RawSample), x: 1e39 }];
    expect(() => lane.addSamples(bad)).toThrow(InvalidStateError);
    expect(() => lane.addSamples([{ ...(SAMPLES[0] as RawSample), y: -1e39 }])).toThrow(InvalidStateError);
    expect(() => lane.addSamples([{ ...(SAMPLES[0] as RawSample), x: BRISTLE_MAX_ABS_COORD_PX * 2 }])).toThrow(InvalidStateError);
    // 거부된 배치는 아무것도 진행하지 않았으므로 이어서 정상 입력을 그릴 수 있다.
    lane.addSamples(SAMPLES);
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(50);
    lane.dispose();
  });

  it("tilt 방향 출처에서 유한하지 않은 기울기는 거부하고, 이어지는 정상 배치는 막히지 않는다(방향이 NaN으로 굳지 않는다)", async () => {
    const lane = await ready("tilt");
    lane.beginStroke(BRUSH, 1);
    const withTilt = (s: RawSample, tiltXDeg: number): RawSample => ({ ...s, tiltXDeg, tiltYDeg: 20 });
    expect(() => lane.addSamples([withTilt(SAMPLES[0] as RawSample, Number.POSITIVE_INFINITY)])).toThrow(InvalidStateError);
    expect(() => lane.addSamples([withTilt(SAMPLES[0] as RawSample, Number.NaN)])).toThrow(InvalidStateError);
    lane.addSamples(SAMPLES.map((s) => withTilt(s, 10)));
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(50);
    lane.dispose();
  });

  it("속도 방향 출처에서는 기울기를 쓰지 않으므로 기울기 값 때문에 거부하지 않는다", async () => {
    const lane = await ready("velocity");
    lane.beginStroke(BRUSH, 1);
    expect(() => lane.addSamples([{ ...(SAMPLES[0] as RawSample), tiltXDeg: Number.NaN }])).not.toThrow();
    lane.abortStroke();
    lane.dispose();
  });
});

describe("BristleDabSynthesizer: 틱 → dab", () => {
  it("한 틱에서 100 px 움직이면 간격(지름 × 0.3)마다 dab를 찍고 위치가 털 경로 위에 있다", () => {
    const { surface, dabs } = stubSurface();
    const s = synth(surface, 2, 2);
    s.onTick(moveTick(2, 0, 100));
    s.flush();
    const step = Math.max(0.35, 2 * 2 * 0.95 * 0.3); // 1.14
    const perBristle = Math.floor(100 / step);
    expect(dabs.length).toBe(2 * perBristle);
    const first = dabs.filter((d) => Math.abs(d.y) < 1e-6);
    expect(first.length).toBe(perBristle);
    for (let i = 1; i < first.length; i += 1) expect((first[i]?.x ?? 0) - (first[i - 1]?.x ?? 0)).toBeCloseTo(step, 3);
    expect(first[0]?.x ?? 0).toBeCloseTo(step, 3);
  });

  it("틱 경계에 상관없이 간격이 일정하다: 1틱에 100 px와 100틱에 1 px씩이 같은 dab 수(±1)·같은 위치", () => {
    const a = stubSurface();
    const sa = synth(a.surface, 1, 2);
    sa.onTick(moveTick(1, 0, 100));
    sa.flush();
    const b = stubSurface();
    const sb = synth(b.surface, 1, 2);
    for (let i = 0; i < 100; i += 1) sb.onTick(moveTick(1, i, i + 1));
    sb.flush();
    expect(Math.abs(a.dabs.length - b.dabs.length)).toBeLessThanOrEqual(1);
    for (let i = 0; i < Math.min(a.dabs.length, b.dabs.length); i += 1) expect(a.dabs[i]?.x ?? 0).toBeCloseTo(b.dabs[i]?.x ?? 0, 2);
  });

  it("dab는 둥근 건식 도장이고 반경은 접촉 반경 × 0.95이며 색은 받은 선형 premultiplied 값을 그대로 싣는다", () => {
    const { surface, dabs } = stubSurface();
    const s = synth(surface, 1, 2);
    s.onTick(moveTick(1, 0, 10));
    s.flush();
    const d = dabs[0];
    expect(d?.tipKind).toBe("round");
    expect(d?.deposition).toBe("dry-stamp");
    expect(d?.rx).toBeCloseTo(1.9, 5);
    expect(d?.ry).toBeCloseTo(1.9, 5);
    expect(d?.grain).toBe(0);
    expect(d?.wet).toBe(0);
    expect(d?.erase).toBe(false);
    expect(d?.smudge).toBe(false);
    expect(d?.r).toBeCloseTo(COLOR[0], 6);
    expect(d?.g).toBeCloseTo(COLOR[1], 6);
    expect(d?.b).toBeCloseTo(COLOR[2], 6);
    expect(d?.a).toBe(1);
  });

  it("흐름 ∝ 적재량 × (바닥 + (1 − 바닥)·압력) × 밀도 정규화", () => {
    const flowAt = (load: number, pressure: number, spread = 10): number => {
      const { surface, dabs } = stubSurface();
      const s = synth(surface, 1, 2, 0.1);
      s.onTick(moveTick(1, 0, 5, { load, pressure, spread }));
      s.flush();
      return dabs[0]?.flow ?? 0;
    };
    const base = flowAt(1, 1);
    expect(base).toBeCloseTo(0.1, 5);
    expect(flowAt(0.5, 1)).toBeCloseTo(base * 0.5, 5);
    expect(flowAt(1, 0)).toBe(0); // 압력 0 = 들린 붓(아래 별도 시험)
    expect(flowAt(1, 0.5)).toBeCloseTo(0.1 * (BRISTLE_FLOW_PRESSURE_FLOOR + (1 - BRISTLE_FLOW_PRESSURE_FLOOR) * 0.5), 5);
    // 벌어짐이 기준(10 px)의 절반이면 밀도 정규화로 흐름이 절반, 하한은 BRISTLE_DENSITY_FLOOR.
    expect(flowAt(1, 1, 5)).toBeCloseTo(base * 0.5, 5);
    expect(flowAt(1, 1, 0.5)).toBeCloseTo(base * BRISTLE_DENSITY_FLOOR, 5);
    expect(flowAt(1, 1, 30)).toBeCloseTo(base, 5);
  });

  it("적재량이 바닥 이하인 털은 찍지 않고 skippedDry로 센다; 압력이 바닥 이하(들린 붓)면 찍지 않고 skippedLift로 센다", () => {
    const dry = stubSurface();
    const sd = synth(dry.surface, 2, 2);
    const tick = moveTick(2, 0, 10);
    tick.load[1] = BRISTLE_MIN_LOAD / 2;
    sd.onTick(tick);
    sd.flush();
    expect(sd.stats.skippedDry).toBeGreaterThan(0);
    expect(dry.dabs.every((d) => Math.abs(d.y) < 1e-6)).toBe(true);

    const lift = stubSurface();
    const sl = synth(lift.surface, 2, 2);
    sl.onTick(moveTick(2, 0, 10, { pressure: BRISTLE_MIN_PRESSURE }));
    sl.flush();
    expect(lift.dabs.length).toBe(0);
    expect(sl.stats.skippedLift).toBeGreaterThan(0);
    expect(lift.submits.length).toBe(0);
  });

  it("움직이지 않은 털은 아무것도 찍지 않고, stamp는 털마다 한 번씩 찍는다", () => {
    const { surface, dabs } = stubSurface();
    const s = synth(surface, 3, 2);
    s.onTick(moveTick(3, 5, 5));
    s.flush();
    expect(dabs.length).toBe(0);
    s.stamp(moveTick(3, 5, 5));
    s.flush();
    expect(dabs.length).toBe(3);
    s.stamp(moveTick(3, 5, 5, { pressure: 0 }));
    s.flush();
    expect(dabs.length).toBe(3);
  });

  it("배치가 가득 차면 자동으로 제출하고 flush는 남은 것을 제출한다(제출 수·dirtyTiles 집계)", () => {
    const { surface, dabs, submits } = stubSurface();
    const s = synth(surface, 1, 2);
    // 1 px 간격 근처로 길게 움직여 용량보다 많이 만든다.
    const total = BRISTLE_BATCH_CAPACITY + 500;
    const step = Math.max(0.35, 2 * 2 * 0.95 * 0.3);
    s.onTick(moveTick(1, 0, total * step + 1));
    expect(submits.length).toBe(1);
    expect(submits[0]).toBe(BRISTLE_BATCH_CAPACITY);
    expect(s.pending()).toBeGreaterThan(0);
    s.flush();
    expect(submits.length).toBe(2);
    expect(s.pending()).toBe(0);
    expect(dabs.length).toBe(s.stats.dabs);
    expect(s.stats.submits).toBe(2);
    expect(s.stats.maxDirtyTiles).toBe(3);
    s.flush();
    expect(submits.length).toBe(2);
  });

  it("실제 Surface에 찍으면 획 레이어에 누적되고 결정적이다(같은 입력 같은 문서)", () => {
    const draw = (): Float32Array => {
      const surface = new Surface(64, 64);
      surface.beginStroke(presetById("ink-g-pen"), 1);
      const s = synth(surface, 4, 2, 0.2);
      for (let i = 0; i < 40; i += 1) s.onTick(moveTick(4, 8 + i, 9 + i));
      s.flush();
      surface.endStroke();
      return surface.toLinear();
    };
    const a = draw();
    const b = draw();
    expect(a).toEqual(b);
    let sum = 0;
    for (let i = 3; i < a.length; i += 4) sum += a[i] ?? 0;
    expect(sum).toBeGreaterThan(20);
  });
});

describe("BL-4a 프리셋 응답 합성: dab 반경·경도·그레인·흐름", () => {
  const RESPONSE: BristleDabResponse = {
    fillRatio: 0.2,
    minRadiusPx: BRISTLE_MIN_DAB_RADIUS_PX,
    hardness: 0.4,
    shapeExp: 2.5,
    programFlow: 0.8,
    grain: PressureCurveTable.fromKnots([
      [0, 0.9],
      [1, 0.1],
    ]),
    flowScale: PressureCurveTable.fromKnots([
      [0, 0.5],
      [1, 1],
    ]),
  };

  function withResponse(surface: Surface, response: BristleDabResponse | null): BristleDabSynthesizer {
    return new BristleDabSynthesizer(surface, 1, 2, 0.1, COLOR, 7, 10, response);
  }

  it("dab 반경은 현재 벌어짐 반경을 따라간다: max(최소 반경, 비율 × 벌어짐), 압력이 낮아 좁으면 작은 dab다", () => {
    const radiusAt = (spread: number): number => {
      const { surface, dabs } = stubSurface();
      const s = withResponse(surface, RESPONSE);
      s.onTick(moveTick(1, 0, 10, { spread }));
      s.flush();
      return dabs[0]?.rx ?? 0;
    };
    expect(radiusAt(20)).toBeCloseTo(4, 5);
    expect(radiusAt(10)).toBeCloseTo(2, 5);
    expect(radiusAt(1)).toBeCloseTo(BRISTLE_MIN_DAB_RADIUS_PX, 5);
  });

  it("dab 간격도 현재 반경을 따른다: 넓은 다발은 드문 dab, 좁은 다발은 촘촘한 dab(바닥 0.35 px)", () => {
    const countAt = (spread: number): number => {
      const { surface, dabs } = stubSurface();
      const s = withResponse(surface, RESPONSE);
      s.onTick(moveTick(1, 0, 100, { spread }));
      s.flush();
      return dabs.length;
    };
    expect(countAt(20)).toBe(Math.floor(100 / Math.max(0.35, 2 * 4 * 0.3)));
    expect(countAt(1)).toBe(Math.floor(100 / Math.max(0.35, 2 * BRISTLE_MIN_DAB_RADIUS_PX * 0.3)));
  });

  it("경도·초타원 지수를 싣고 그레인은 압력 표에서 읽는다(응답이 없으면 예전 규약: 경도 0.85·그레인 0)", () => {
    const { surface, dabs } = stubSurface();
    const s = withResponse(surface, RESPONSE);
    s.onTick(moveTick(1, 0, 5, { pressure: 0.5 }));
    s.flush();
    expect(dabs[0]?.hardness).toBeCloseTo(0.4, 6);
    expect(dabs[0]?.shapeExp).toBeCloseTo(2.5, 6);
    expect(dabs[0]?.grain).toBeCloseTo(0.5, 5);
    const legacy = stubSurface();
    const sl = withResponse(legacy.surface, null);
    sl.onTick(moveTick(1, 0, 5, { pressure: 0.5 }));
    sl.flush();
    expect(legacy.dabs[0]?.hardness).toBeCloseTo(0.85, 6);
    expect(legacy.dabs[0]?.grain).toBe(0);
  });

  it("dab 흐름은 겹침 깊이로 정규화된다: 털이 많을수록·좁을수록 dab 하나는 옅고, 압력 이득은 흐름 동역학 표(없으면 1)가 정한다", () => {
    const flowOf = (response: BristleDabResponse | null, opts: { n?: number; pressure?: number; spread?: number }): number => {
      const { surface, dabs } = stubSurface();
      const n = opts.n ?? 1;
      const s = new BristleDabSynthesizer(surface, n, 2, 0.1, COLOR, 7, 10, response);
      s.onTick(moveTick(n, 0, 5, { pressure: opts.pressure ?? 0.5, spread: opts.spread ?? 10 }));
      s.flush();
      return dabs[0]?.flow ?? 0;
    };
    // 털 수가 늘면 같은 목표 농도를 더 많은 dab가 나눠 맡는다.
    expect(flowOf(RESPONSE, { n: 32 })).toBeLessThan(flowOf(RESPONSE, { n: 4 }));
    expect(flowOf(RESPONSE, { n: 4 })).toBeLessThan(flowOf(RESPONSE, { n: 1 }));
    // 목표 농도(프로그램 흐름 × 흐름 동역학)가 높을수록 dab가 짙다: 압력 1은 표 값 1, 압력 0은 표 값 0.5(들린 붓 밑에서는 찍지 않으므로 0.05로 비교).
    expect(flowOf(RESPONSE, { pressure: 1 })).toBeGreaterThan(flowOf(RESPONSE, { pressure: 0.05 }));
    // 흐름 동역학이 없으면 압력과 무관하다(cpu-reference처럼 압력으로 농도를 바꾸지 않는다).
    const flat: BristleDabResponse = { ...RESPONSE, flowScale: null };
    expect(flowOf(flat, { pressure: 1 })).toBeCloseTo(flowOf(flat, { pressure: 0.05 }), 10);
    // 프로그램 흐름이 낮은 프리셋은 묽다.
    expect(flowOf({ ...flat, programFlow: 0.3 }, {})).toBeLessThan(flowOf({ ...flat, programFlow: 0.9 }, {}));
    // 응답이 없으면 예전 규약: 기준 흐름 × (바닥 + (1 − 바닥)·압력) × 밀도.
    expect(flowOf(null, { pressure: 0.5 })).toBeCloseTo(0.1 * (BRISTLE_FLOW_PRESSURE_FLOOR + (1 - BRISTLE_FLOW_PRESSURE_FLOOR) * 0.5), 5);
  });

  it("겹침 정규화 통합: 실제 표면에 털 16올 다발로 찍으면 선 폭 안의 평균 알파가 목표 농도(프로그램 흐름)에 가깝다", () => {
    const n = 16;
    const radiusPx = 6;
    const layout = fermatLayout(n);
    const targets = [0.3, 0.6, 0.9];
    for (const target of targets) {
      const surface = new Surface(128, 64);
      surface.beginStroke(presetById("ink-g-pen"), 1);
      const response: BristleDabResponse = { fillRatio: bristleFillRatio(n), minRadiusPx: BRISTLE_MIN_DAB_RADIUS_PX, hardness: 1, shapeExp: 2, programFlow: target, grain: null, flowScale: null };
      const synthesizer = new BristleDabSynthesizer(surface, n, 1, 0.1, [0, 0, 0, 1], 7, radiusPx, response);
      const prevX = new Float32Array(n);
      const curX = new Float32Array(n);
      const ys = Float32Array.from({ length: n }, (_, i) => 32 + radiusPx * (layout.uy[i] ?? 0));
      for (let x = 10; x < 118; x += 1) {
        prevX.fill(x);
        curX.fill(x + 1);
        synthesizer.onTick({ count: n, prevX, prevY: ys, curX, curY: ys, load: new Float32Array(n).fill(1), moved: new Float32Array(n).fill(1), pressure: 1, tMs: 0, handleX: x, handleY: 32, spreadRadiusPx: radiusPx });
      }
      synthesizer.flush();
      surface.endStroke();
      const linear = surface.toLinear();
      let sum = 0;
      let rows = 0;
      for (let y = Math.ceil(32 - radiusPx); y <= Math.floor(32 + radiusPx); y += 1) {
        sum += linear[(y * 128 + 64) * 4 + 3] ?? 0;
        rows += 1;
      }
      const mean = sum / rows;
      expect(mean, `목표 ${target}`).toBeGreaterThan(target * 0.7);
      expect(mean, `목표 ${target}`).toBeLessThan(Math.min(1, target * 1.3));
    }
  });

  it("매핑: 물리 곡선은 선택한 이름 그대로 두고 프리셋 반폭은 spreadScaleCurve로 얹으며 한글 영수증에 반폭을 적는다", () => {
    const charcoal = mapProgramToBristle(presetById("charcoal"));
    expect(charcoal.config.spreadScaleCurve).not.toBeNull();
    expect(charcoal.config.spreadCurve.isMonotonic()).toBe(true);
    expect(charcoal.mappedKo.some((t) => t.includes("선 반폭") && t.includes("cpu-reference"))).toBe(true);
    expect(charcoal.mappedKo.some((t) => t.includes("그레인"))).toBe(true);
    expect(charcoal.dabResponse.fillRatio).toBeCloseTo(bristleFillRatio(32), 8);
    // 같은 팁 지름의 붓펜과 목탄은 압력 1의 벌어짐 반경이 다르다(예전에는 같았다).
    const brush = mapProgramToBristle(presetById("ink-brush-pen"));
    expect(brush.config.radiusPx).toBe(charcoal.config.radiusPx);
    const rBrush = brush.config.radiusPx * brush.config.spreadCurve.eval(1) * (brush.config.spreadScaleCurve?.eval(1) ?? 1);
    const rCharcoal = charcoal.config.radiusPx * charcoal.config.spreadCurve.eval(1) * (charcoal.config.spreadScaleCurve?.eval(1) ?? 1);
    expect(rBrush / rCharcoal).toBeGreaterThan(2);
  });

  it("털 몸체 반경은 낮은 필압 다발 기준이라 압력 0.4 기준보다 작고, 덮어쓴 설정이 우선한다", () => {
    const pen = presetById("ink-brush-pen");
    const m = mapProgramToBristle(pen);
    expect(m.config.bristleRadiusScale).toBeLessThan(1);
    expect(mapProgramToBristle(pen, { brush: { bristleRadiusScale: 2 } }).config.bristleRadiusScale).toBe(2);
  });
});
