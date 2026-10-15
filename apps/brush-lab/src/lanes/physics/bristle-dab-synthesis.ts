import { premultiply, srgbToLinear } from "../../engine/core/color";
import { DabBatch } from "../../engine/core/dab-layout";
import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { hashU32 } from "../../engine/core/rng";
import { SUMI_ENGINE_VERSION } from "../../engine/core/version";
import { BristleBrush2D, bristleSpreadRadiusPx } from "../../engine/physics/world2d/bristle-brush";
import { Surface } from "../../engine/raster/reference-renderer";
import { abortReceipt, emptyLaneStats, noStrokeAbortReceipt, resolveStrokeColor } from "../lane";

import { BRISTLE_DAB_RADIUS_SCALE, BRISTLE_MAX_TARGET_ALPHA, mapProgramToBristle, unsupportedBristleReason } from "./bristle-program-mapping";

import type { BristleDabResponse, BristleLaneOptions, BristleProgramMapping } from "./bristle-program-mapping";
import type { Clock, DabInstance, LabImage, RawSample } from "../../engine/core/types";
import type { BristleTick, BristleTickSink } from "../../engine/physics/world2d/bristle-brush";
import type { PhysicsWorld2D } from "../../engine/physics/world2d/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneMaturity,
  LaneStats,
  LaneStatus,
  StrokeAbortReceipt,
  StrokeOptions,
  StrokeReceipt,
} from "../lane";

/**
 * 붓털 dab 합성(두 물리 붓 레인 공통부)과 공통 레인 뼈대.
 *
 * 시뮬레이션 틱마다 털끝의 이동 경로를 따라 작은 둥근 dab를 찍는다: 반경 r_b(털 접촉 반경), 흐름 ∝ 적재량 × 압력,
 * 색은 `options.color`(선형 premultiplied로 변환). 찍는 곳은 `cpu-reference` 레인과 같은 엔진 래스터 표면(`Surface`)이라 합성·
 * 해시·readback이 기존 경로와 같다. 레인 둘(자체 PBD / Rapier)은 월드 팩토리만 다르다.
 *
 * 프로그램에서 옮기는 필드(BL-4a): 팁 지름, 접촉 물리(`physics.contact`)와 압력에 묶인 크기 동역학이 만드는 **압력 → 선 반폭**(벌어짐 곡선 표에 결합),
 * 압력에 묶인 흐름 동역학, 종이·흑연 그레인 응답, 팁 경도·초타원 지수, `deposition.flow`. dab 반경은 현재 벌어짐 반경을 따라가
 * 압력이 낮으면 좁은 선, 높으면 넓은 선이 된다. 불투명도·블렌드는 표면의 획 합성이 그대로 적용한다.
 * 옮기지 않은 필드는 영수증 `unmappedKo`로 드러낸다(근사하지 않는다). 습식·임파스토·smudge·지우개는 거부한다.
 */

/** 래스터 배치 용량(dab). 가득 차면 표면에 제출하고 비운다. */
export const BRISTLE_BATCH_CAPACITY = 4096;
/** dab 간격(지름 대비). SP-A 렌더 규약과 같다. */
export const BRISTLE_DAB_SPACING = 0.3;
/** 한 번의 제출에 담는 dab 상한. 프레임을 넘는 큰 배치는 다음 프레임으로 넘겨 addSamples의 꼬리를 자른다. */
export const BRISTLE_FRAME_SUBMIT_BUDGET = 512;
/** 한 addSamples 호출에서 새로 찍는 dab 상한. 넘으면 경로를 따라가되 dab는 건너뛰고 영수증에 남긴다. */
export const BRISTLE_FRAME_DAB_BUDGET = 2048;
/** dab 간격의 하한(px). */
export const BRISTLE_MIN_STEP_PX = 0.35;
/** 압력이 이 값 이하면 물감을 내지 않는다. */
export const BRISTLE_MIN_PRESSURE = 0.002;
/** 적재량이 이 값 이하면 그 털은 마른 것으로 보고 찍지 않는다. */
export const BRISTLE_MIN_LOAD = 0.02;
/** 압력 0에서의 흐름 비율(나머지는 압력에 비례): 흐름 = 기본 × 적재량 × (FLOOR + (1 − FLOOR)·압력). */
export const BRISTLE_FLOW_PRESSURE_FLOOR = 0.2;
/** 좁은 벌어짐에서 흐름을 줄이는 하한 비율. */
export const BRISTLE_DENSITY_FLOOR = 0.35;
/** 속도 결합의 기준 속도(px/s). 이 속도의 제곱 비율로 농도·간격이 옅어지고 성글어진다. */
export const BRISTLE_SPEED_REF_PX_PER_SEC = 4000;
/** 빠른 획 간격 확장의 상한 비율. */
export const BRISTLE_SPEED_STEP_MAX_GAIN = 0.6;
/** 빠른 획 농도 하한(아무리 빨라도 이 비율보다는 옅어지지 않는다). */
export const BRISTLE_SPEED_FLOW_FLOOR = 0.35;
/** 방향 추종 타원이 켜지는 최소 손잡이 속도(px/s). 정지·저속에서는 둥근 dab를 유지한다. */
export const BRISTLE_HEADING_MIN_SPEED_PX_PER_SEC = 50;
/** 방향 추종 타원의 장축·단축 배율(면적 ≈ 1 유지). */
export const BRISTLE_HEADING_MAJOR_SCALE = 1.12;
export const BRISTLE_HEADING_MINOR_SCALE = 0.9;
/** 정착 최대 시간(ms). */
export const BRISTLE_SETTLE_MAX_MS = 300;
/**
 * 표본 좌표 한계(px). f32 범위(약 3.4e38)를 넘는 값은 `Number.isFinite`는 통과하지만 f32 미러에서 Infinity가 되어 틱 도중 던지고,
 * 그 근처의 큰 값도 제곱 연산에서 넘친다. 문서 좌표로 의미가 있는 범위보다 훨씬 넉넉한 안전 상한으로 막는다.
 */
export const BRISTLE_MAX_ABS_COORD_PX = 1e7;

/** 합성기 통계(영수증용). */
export interface BristleSynthStats {
  dabs: number;
  submits: number;
  maxDirtyTiles: number;
  overflowDabs: number;
  skippedDry: number;
  skippedLift: number;
  /** 프레임 예산을 넘어 건너뛴 dab 수. */
  budgetSkipped: number;
}

/**
 * 틱을 dab로 바꾸는 싱크. 털마다 마지막 dab 이후의 이동 거리(carry)를 들고 있어 틱 경계에 상관없이 간격이 일정하다.
 * 제출은 `submit`(보통 `Surface.addDabs`)으로 하고, 배치가 가득 차거나 `flush()`를 부르면 나간다.
 */
export class BristleDabSynthesizer implements BristleTickSink {
  readonly stats: BristleSynthStats = { dabs: 0, submits: 0, maxDirtyTiles: 0, overflowDabs: 0, skippedDry: 0, skippedLift: 0, budgetSkipped: 0 };

  private readonly batches = [new DabBatch(BRISTLE_BATCH_CAPACITY), new DabBatch(BRISTLE_BATCH_CAPACITY)];
  private activeIndex = 0;
  private frameDabs = 0;
  private readonly carry: Float32Array;
  private readonly dab: DabInstance;
  private index = 0;

  constructor(
    private readonly surface: Surface,
    private readonly count: number,
    private readonly contactRadiusPx: number,
    private readonly baseFlow: number,
    private readonly colorLinear: readonly [number, number, number, number],
    private readonly seed: number,
    private readonly referenceSpreadPx: number,
    private readonly response: BristleDabResponse | null = null,
  ) {
    this.carry = new Float32Array(count);
    this.dab = {
      x: 0,
      y: 0,
      rx: 1,
      ry: 1,
      angle: 0,
      hardness: response ? response.hardness : 0.85,
      flow: 0,
      shapeExp: response ? response.shapeExp : 2,
      r: colorLinear[0],
      g: colorLinear[1],
      b: colorLinear[2],
      a: colorLinear[3],
      tipKind: "round",
      seed: 0,
      grain: 0,
      wet: 0,
      pigmentMass: 0,
      erase: false,
      smudge: false,
      dualTip: false,
      lockAlpha: false,
      impasto: false,
      deposition: "dry-stamp",
    };
  }

  /** 제출 전에 쌓여 있는 dab 수. */
  pending(): number {
    return this.batches[this.activeIndex]?.count ?? 0;
  }

  /** 새 프레임 시작: 프레임 dab 개수를 초기화한다. 레인이 addSamples 호출마다 한 번 부른다. */
  beginFrame(): void {
    this.frameDabs = 0;
  }

  /** 털마다 현재 위치에 dab 하나씩(탭 한 번에 점이 찍히게). 정지 상태라 속도는 0·방향은 유지된다. */
  stamp(tick: BristleTick): void {
    if (tick.pressure <= BRISTLE_MIN_PRESSURE) return;
    const rad = this.dabRadius(tick.spreadRadiusPx);
    const flowBase = this.flowBase(tick.pressure, tick.spreadRadiusPx, rad, 0);
    for (let i = 0; i < this.count; i += 1) this.place(i, tick.curX[i] ?? 0, tick.curY[i] ?? 0, tick.load[i] ?? 0, tick.pressure, flowBase, rad, tick.headingX, tick.headingY, 0);
  }

  /** 손잡이 속도(px/s) → 농도 배율 0..1. 보통 필기 속도에서는 거의 1이고 빠른 획에서 옅어진다. */
  static speedFlowGain(speedPxPerSec: number): number {
    const s = Number.isFinite(speedPxPerSec) ? Math.max(0, speedPxPerSec) : 0;
    const q = s / BRISTLE_SPEED_REF_PX_PER_SEC;
    return Math.max(BRISTLE_SPEED_FLOW_FLOOR, 1 / (1 + q * q));
  }

  /** 손잡이 속도(px/s) → 간격 배율 1..1.6. 보통 필기 속도에서는 거의 1이고 빠른 획에서 성글어진다. */
  static speedStepGain(speedPxPerSec: number): number {
    const s = Number.isFinite(speedPxPerSec) ? Math.max(0, speedPxPerSec) : 0;
    const q = s / 10000;
    return 1 + Math.min(BRISTLE_SPEED_STEP_MAX_GAIN, q * q);
  }

  /**
   * 이 틱에서 적재량 1인 털 dab 하나의 흐름.
   * 응답이 없으면 예전 규약(기준 흐름 × 압력 이득 × 밀도 정규화)이다.
   * 응답이 있으면 털 N올의 dab가 선 폭 안에서 평균적으로 겹치는 깊이 D(털 수 × 폭 방향 겹침 비율 × 이동 방향 겹침)를 어림해,
   * 선 전체의 평균 겹친 합 1 − (1 − a)^D가 목표 농도(프로그램 흐름 × 흐름 동역학)가 되도록 a를 정한다. 그래서 좁은 선도 넓은 선도 같은 농도로 칠해지고
   * 흐름이 낮은 프리셋(연필)은 묽게, 높은 프리셋(G펜)은 짙게 나온다. 적재량이 낮은 털은 이 값에 적재량을 곱해 연해진다.
   */
  private flowBase(pressure: number, spreadRadiusPx: number, rad: number, speedPxPerSec: number): number {
    const gain = BristleDabSynthesizer.speedFlowGain(speedPxPerSec);
    const r = this.response;
    if (!r) {
      const pressureGain = BRISTLE_FLOW_PRESSURE_FLOOR + (1 - BRISTLE_FLOW_PRESSURE_FLOOR) * pressure;
      return this.baseFlow * pressureGain * this.densityScale(spreadRadiusPx) * gain;
    }
    const target = Math.min(BRISTLE_MAX_TARGET_ALPHA, r.programFlow * (r.flowScale ? r.flowScale.eval(pressure) : 1));
    if (target <= 0) return 0;
    const step = Math.max(BRISTLE_MIN_STEP_PX, 2 * rad * BRISTLE_DAB_SPACING);
    const along = (2 * rad) / step;
    const lateral = (this.count * rad) / (Math.max(spreadRadiusPx, 0) + rad);
    const depth = Math.max(1, along * lateral);
    return (1 - (1 - target) ** (1 / depth)) * gain;
  }

  /** 지금 벌어짐 반경에서의 dab 반경(px). 프리셋 응답이 없으면 예전 규약(털 접촉 반경 × 0.95 고정). */
  private dabRadius(spreadRadiusPx: number): number {
    const r = this.response;
    if (!r) return this.contactRadiusPx * BRISTLE_DAB_RADIUS_SCALE;
    return Math.max(r.minRadiusPx, r.fillRatio * spreadRadiusPx);
  }

  onTick(tick: BristleTick): void {
    const rad = this.dabRadius(tick.spreadRadiusPx);
    const speed = Math.hypot(tick.handleVX ?? 0, tick.handleVY ?? 0);
    const stepBase = Math.max(BRISTLE_MIN_STEP_PX, 2 * rad * BRISTLE_DAB_SPACING);
    const step = stepBase * BristleDabSynthesizer.speedStepGain(speed);
    const lifted = tick.pressure <= BRISTLE_MIN_PRESSURE;
    const flowBase = lifted ? 0 : this.flowBase(tick.pressure, tick.spreadRadiusPx, rad, speed);
    const hx = tick.headingX ?? 1;
    const hy = tick.headingY ?? 0;
    for (let i = 0; i < this.count; i += 1) {
      const x0 = tick.prevX[i] ?? 0;
      const y0 = tick.prevY[i] ?? 0;
      const dx = (tick.curX[i] ?? 0) - x0;
      const dy = (tick.curY[i] ?? 0) - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len <= 0) continue;
      let carried = this.carry[i] ?? 0;
      if (carried + len < step) {
        this.carry[i] = carried + len;
        continue;
      }
      // 이 구간에서 간격마다 dab를 둔다. 프레임 예산을 넘으면 경로는 따라가되 dab는 건너뛴다.
      let pos = step - carried;
      while (pos <= len) {
        const t = pos / len;
        if (lifted) this.stats.skippedLift += 1;
        else if (this.frameDabs >= BRISTLE_FRAME_DAB_BUDGET) this.stats.budgetSkipped += 1;
        else {
          this.place(i, x0 + dx * t, y0 + dy * t, tick.load[i] ?? 0, tick.pressure, flowBase, rad, hx, hy, speed);
          this.frameDabs += 1;
        }
        pos += step;
      }
      carried = len - (pos - step);
      this.carry[i] = carried;
    }
  }

  /**
   * 털이 모여 있을수록(낮은 압력의 좁은 벌어짐) 같은 면적에 dab가 몰려 물감이 뭉친다. 벌어짐 반경이 기준 반경보다 작으면 흐름을 비례해 줄인다
   * (하한 BRISTLE_DENSITY_FLOOR: 좁은 획도 보이게).
   */
  private densityScale(spreadRadiusPx: number): number {
    const r = spreadRadiusPx / this.referenceSpreadPx;
    return r < BRISTLE_DENSITY_FLOOR ? BRISTLE_DENSITY_FLOOR : r > 1 ? 1 : r;
  }

  /** 쌓인 dab를 표면에 제출한다. place()가 예산에서 자동 제출하므로 나머지는 예산 미만이다. */
  flush(): void {
    this.submitActive();
  }

  private active(): DabBatch {
    const b = this.batches[this.activeIndex];
    if (!b) throw new Error("BristleDabSynthesizer: 활성 배치가 없다");
    return b;
  }

  /** 활성 배치를 통째로 제출하고 비어 있는 다른 배치로 바꾼다. 제출 순서를 유지하므로 최종 픽셀은 같다. */
  private submitActive(): void {
    const batch = this.active();
    if (batch.count === 0) return;
    const receipt = this.surface.addDabs(batch);
    this.stats.submits += 1;
    this.stats.overflowDabs += receipt.overflowDabs;
    if (receipt.dirtyTiles > this.stats.maxDirtyTiles) this.stats.maxDirtyTiles = receipt.dirtyTiles;
    batch.reset();
    this.activeIndex = 1 - this.activeIndex;
  }

  private place(i: number, x: number, y: number, load: number, pressure: number, flowBase: number, rad: number, headingX: number, headingY: number, speedPxPerSec: number): void {
    if (load <= BRISTLE_MIN_LOAD) {
      this.stats.skippedDry += 1;
      return;
    }
    const response = this.response;
    const breakup = response ? response.dryBreakup * Math.min(1, Math.max(0, 1 - load)) : 0;
    if (breakup > 0) {
      const u = (hashU32(i, this.index, this.seed) & 0x00ff_ffff) / 16777216;
      if (u < breakup) {
        this.stats.skippedDry += 1;
        return;
      }
    }
    const dab = this.dab;
    const follow = speedPxPerSec >= BRISTLE_HEADING_MIN_SPEED_PX_PER_SEC && Math.hypot(headingX, headingY) > 1e-6;
    const flow = Math.min(1, flowBase * load);
    dab.x = x;
    dab.y = y;
    if (follow) {
      dab.rx = rad * BRISTLE_HEADING_MAJOR_SCALE;
      dab.ry = rad * BRISTLE_HEADING_MINOR_SCALE;
      dab.angle = Math.atan2(headingY, headingX);
    } else {
      dab.rx = rad;
      dab.ry = rad;
      dab.angle = 0;
    }
    dab.flow = flow;
    dab.grain = response?.grain ? response.grain.eval(pressure) : 0;
    dab.seed = hashU32(i, this.index, this.seed) & 0x00ff_ffff;
    this.index += 1;
    const active = this.active();
    if (!active.push(dab)) {
      this.submitActive();
      this.active().push(dab);
    }
    if (this.active().count >= BRISTLE_FRAME_SUBMIT_BUDGET) this.submitActive();
    this.stats.dabs += 1;
  }
}

/** 붓털 레인 전용 획 영수증(StrokeReceipt의 상위 호환). */
export interface BristleStrokeReceipt extends StrokeReceipt {
  backendId: string;
  bristleCount: number;
  contactRadiusPx: number;
  /** 진행한 고정 틱 수(1/240 s). */
  ticks: number;
  /** 표본 시각이 길게 건너뛰어 따라잡지 않고 넘긴 틱 수(0이어야 건강하다). */
  droppedTicks: number;
  stiffnessUpdates: number;
  /** 물감이 말라서(적재량 소진) 찍지 않은 dab 수. */
  skippedDry: number;
  /** 프레임 예산을 넘어 건너뛴 dab 수. */
  budgetSkipped: number;
  /** 월드 구현의 진단 카운터. */
  worldDiagnostics: Readonly<Record<string, number>>;
  /** 이 획에서 드러내야 하는 사유(한글). 비어 있으면 아무 일도 없었다. */
  notesKo: string[];
  mappedKo: string[];
  unmappedKo: string[];
}

interface Session {
  readonly program: BrushProgram;
  readonly seed: number;
  readonly mapping: BristleProgramMapping;
  readonly colorLinear: readonly [number, number, number, number];
  brush: BristleBrush2D | null;
  synth: BristleDabSynthesizer | null;
  frameIndex: number;
  frameTimes: number[];
}

/**
 * 붓털 물리 레인 공통 뼈대. 서브클래스는 `prepareWorldFactory`(init에서 호출 — 외부 모듈 로드는 여기서)와 식별 필드만 채운다.
 * 표면은 `Surface`(cpu-reference와 같은 래스터)라 abortStroke는 표면의 되돌림 저널이 문서를 beginStroke 직전 상태로 복원한다.
 */
export abstract class BristleLaneBase implements BrushEngineLane {
  abstract readonly id: LaneId;
  abstract readonly label: string;
  readonly kind: LaneKind = "candidate";
  readonly status: LaneStatus = "implemented";
  abstract readonly maturity: LaneMaturity;
  readonly engineVersion = SUMI_ENGINE_VERSION;

  protected readonly laneOptions: BristleLaneOptions;
  private surface: Surface | null = null;
  private clock: Clock | null = null;
  private makeWorld: (() => PhysicsWorld2D) | null = null;
  private session: Session | null = null;
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  constructor(options: BristleLaneOptions = {}) {
    this.laneOptions = options;
  }

  abstract probe(env: LaneEnvironment): Promise<LaneCapabilityReport>;

  /** init에서 불리며 월드 팩토리를 돌려준다. 외부 모듈 로드·초기화가 있으면 여기서 하고 실패는 `LaneUnavailableError`로 던진다. */
  protected abstract prepareWorldFactory(env: LaneEnvironment): Promise<() => PhysicsWorld2D>;

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    const count = this.laneOptions.bristles ?? 32;
    if (!Number.isInteger(count) || count < 1 || count > 256) {
      throw new LaneUnavailableError("limit-exceeded", `붓털 레인의 털 수는 1..256 정수여야 한다(받은 값 ${count})`, { laneId: this.id, bristles: count });
    }
    const opts: { strokeCapacityTiles?: number; wetCapacityTiles?: number } = {};
    if (config.strokeCapacityTiles !== undefined) opts.strokeCapacityTiles = config.strokeCapacityTiles;
    if (config.wetCapacityTiles !== undefined) opts.wetCapacityTiles = config.wetCapacityTiles;
    // 획 도중 다시 init하면 진행 중이던 세션의 월드를 먼저 해제한다(그냥 버리면 Rapier wasm 월드가 누수된다).
    this.closeSession();
    // 외부 모듈 로드가 실패하면 표면을 만들기 전에 던진다(반쯤 초기화된 레인을 남기지 않는다).
    const factory = await this.prepareWorldFactory(env);
    this.surface = new Surface(config.width, config.height, opts);
    this.makeWorld = factory;
    this.clock = env.clock;
  }

  beginStroke(program: BrushProgram, seed: number, options?: StrokeOptions): void {
    // 색 검증(획을 열기 전에 거부한다) → 지원 여부 → 상태 검사 순.
    const color = resolveStrokeColor(options) ?? [0, 0, 0, 1];
    const surface = this.requireSurface("beginStroke");
    if (this.session) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    const reason = unsupportedBristleReason(program);
    if (reason) throw new LaneUnavailableError("not-implemented", reason, { laneId: this.id, presetId: program.id });
    const mapping = mapProgramToBristle(program, this.laneOptions);
    surface.beginStroke(program, seed);
    this.session = {
      program,
      seed,
      mapping,
      colorLinear: premultiply([srgbToLinear(color[0]), srgbToLinear(color[1]), srgbToLinear(color[2]), color[3]]),
      brush: null,
      synth: null,
      frameIndex: 0,
      frameTimes: [],
    };
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    const surface = this.requireSurface("addSamples");
    const session = this.session;
    if (!session) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    // 배치 전체를 먼저 검사한다(일부만 적용된 채 던지지 않는다). 유한성뿐 아니라 f32 미러에서 넘치지 않는 범위인지도 본다:
    // 1e39 같은 좌표는 isFinite를 통과하지만 f32로는 Infinity라 틱 도중 RangeError가 나고 앞선 틱은 이미 진행돼 있다.
    const tiltHeading = this.laneOptions.headingSource === "tilt";
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (!s) continue;
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.tMs) || !Number.isFinite(s.pressure)) {
        throw new InvalidStateError(`addSamples: 표본 ${i}에 유한하지 않은 값이 있다(x ${s.x}, y ${s.y}, tMs ${s.tMs}, pressure ${s.pressure})`);
      }
      if (Math.abs(s.x) > BRISTLE_MAX_ABS_COORD_PX || Math.abs(s.y) > BRISTLE_MAX_ABS_COORD_PX) {
        throw new InvalidStateError(`addSamples: 표본 ${i}의 좌표가 허용 범위(±${BRISTLE_MAX_ABS_COORD_PX} px)를 넘는다(x ${s.x}, y ${s.y})`);
      }
      if (tiltHeading && (!Number.isFinite(s.tiltXDeg) || !Number.isFinite(s.tiltYDeg))) {
        throw new InvalidStateError(`addSamples: 표본 ${i}의 기울기가 유한하지 않다(tiltXDeg ${s.tiltXDeg}, tiltYDeg ${s.tiltYDeg}) — tilt 방향 출처에서는 기울기가 필요하다`);
      }
    }
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const before = session.synth ? { dabs: session.synth.stats.dabs, submits: session.synth.stats.submits } : { dabs: 0, submits: 0 };
    session.synth?.beginFrame();
    for (const s of samples) {
      // 예측 표본은 표시 전용이라 물리에 넣지 않는다.
      if (s.source === "predicted") continue;
      const pressure = s.pressure < 0 ? 0 : s.pressure > 1 ? 1 : s.pressure;
      if (!session.brush || !session.synth) this.startBrush(session, surface, s.x, s.y, s.tMs, pressure);
      const brush = session.brush;
      const synth = session.synth;
      if (!brush || !synth) continue;
      let azX = 0;
      let azY = 0;
      if (tiltHeading) {
        azX = s.tiltXDeg;
        azY = s.tiltYDeg;
      }
      brush.advance(s.x, s.y, s.tMs, pressure, synth, azX, azY);
    }
    session.synth?.flush();
    const dt = clock ? clock.now() - t0 : 0;
    session.frameTimes.push(dt);
    const synth = session.synth;
    const receipt: DabBatchReceipt = {
      frameIndex: session.frameIndex,
      dabCount: synth ? synth.stats.dabs - before.dabs : 0,
      submitCount: synth ? synth.stats.submits - before.submits : 0,
      dispatchCount: synth ? synth.stats.maxDirtyTiles : 0,
      inputToSubmitMs: clock ? dt : null,
    };
    session.frameIndex += 1;
    return receipt;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const surface = this.requireSurface("endStroke");
    const session = this.session;
    if (!session) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    try {
      const brush = session.brush;
      const synth = session.synth;
      if (brush && synth) {
        synth.beginFrame();
        brush.settle(synth, BRISTLE_SETTLE_MAX_MS);
        // 탭(움직임 없이 끝난 획)에는 털마다 현재 위치에 dab 하나씩 찍어 점이 남게 한다.
        // 움직인 획의 시작에는 찍지 않는다(털이 모여 있는 시작점에 물감이 뭉치는 것을 막는다).
        if (synth.stats.dabs === 0) synth.stamp(brush.snapshot(brush.lastState().pressure));
        synth.flush();
      }
      const cpu = surface.endStroke();
      const dt = clock ? clock.now() - t0 : 0;
      session.frameTimes.push(dt);
      const stats = synth?.stats;
      const diag = brush?.diagnostics;
      const notesKo: string[] = [...session.mapping.notesKo];
      if (diag && diag.droppedTicks > 0) notesKo.push(`표본 시각이 크게 건너뛰어 고정 틱 ${diag.droppedTicks}개를 따라잡지 않고 넘겼다`);
      if (cpu.overflowDabs > 0) notesKo.push(`래스터 한도로 dab ${cpu.overflowDabs}개를 건너뛰었다(overflowDabs)`);
      if (stats && stats.skippedDry > 0) notesKo.push(`적재량이 소진된 털의 dab ${stats.skippedDry}개는 찍지 않았다(마른 붓)`);
      if (stats && stats.budgetSkipped > 0) notesKo.push(`프레임당 dab 예산(${BRISTLE_FRAME_DAB_BUDGET})을 넘어 dab ${stats.budgetSkipped}개를 건너뛰었다 — 경로를 따라가서 끊기지 않고 다음 프레임에 이어진다`);
      const worldDiagnostics = brush ? brush.worldDiagnostics() : {};
      if ((worldDiagnostics.nonFiniteResets ?? 0) > 0) notesKo.push(`물리 월드가 비유한 값 ${worldDiagnostics.nonFiniteResets}건을 직전 위치로 되돌렸다 — 시뮬레이션이 건강하지 않다`);
      if ((worldDiagnostics.nonFiniteStates ?? 0) > 0) notesKo.push(`물리 월드가 비유한 상태 ${worldDiagnostics.nonFiniteStates}건을 읽었다 — 시뮬레이션이 건강하지 않다`);
      if ((worldDiagnostics.oversizeSteps ?? 0) > 0) notesKo.push(`서브스텝 상한을 넘는 dt가 ${worldDiagnostics.oversizeSteps}번 있어 안정성이 보장되지 않는다`);
      const receipt: BristleStrokeReceipt = {
        dabCount: cpu.dabCount,
        submitCount: session.frameTimes.length,
        gpuTimeMs: null,
        timingSource: "unavailable",
        frameTimesMs: [...session.frameTimes],
        overflowDabs: cpu.overflowDabs,
        poolTilesUsed: cpu.poolTilesUsed,
        backendId: this.backendId(),
        bristleCount: session.mapping.config.count,
        contactRadiusPx: brush?.bristleRadiusPx ?? 0,
        ticks: diag?.ticks ?? 0,
        droppedTicks: diag?.droppedTicks ?? 0,
        stiffnessUpdates: diag?.stiffnessUpdates ?? 0,
        skippedDry: stats?.skippedDry ?? 0,
        /** 프레임 예산을 넘어 건너뛴 dab 수. */
        budgetSkipped: stats?.budgetSkipped ?? 0,
        worldDiagnostics,
        notesKo,
        mappedKo: [...session.mapping.mappedKo],
        unmappedKo: [...session.mapping.unmappedKo],
      };
      this.lifetime.strokes += 1;
      this.lifetime.dabs += cpu.dabCount;
      this.lifetime.submits += receipt.submitCount;
      this.lifetime.lastReceipt = receipt;
      return receipt;
    } catch (error) {
      // 획 마감이 실패하면 그 획은 버린다: 부분 누적된 획 타일을 비워 다음 획에 섞여 합성되지 않게 한다.
      surface.stroke.clear();
      throw error;
    } finally {
      // 성공이든 실패든 세션은 닫는다(남기면 다음 beginStroke가 '이전 획이 endStroke되지 않았다'로 영구히 실패한다).
      this.closeSession();
    }
  }

  /**
   * 진행 중인 획을 버린다. 문서는 `endStroke`의 합성에서만 바뀌므로 표면의 되돌림 저널이 beginStroke 직전 상태를 복원한다.
   * `discardedDabs`는 버려진 dab(표면 획 레이어 + 아직 제출하지 않은 합성 배치) 수다. 획 밖이면 no-op(멱등).
   */
  abortStroke(): StrokeAbortReceipt {
    this.assertAlive("abortStroke");
    const surface = this.surface;
    if (!surface) return noStrokeAbortReceipt();
    // 세션이 없어도 표면에 묻는다: endStroke가 문서 합성 도중 실패하면 세션은 이미 닫혔지만 표면에는 되돌림 기준점이 남아 있고,
    // 그 문서는 일부 바뀌었다. 세션 유무로 조기 반환하면 `documentPreserved: true`를 거짓으로 말하게 된다(cpu-reference와 같은 방식).
    const unsubmitted = this.session?.synth?.pending() ?? 0;
    const result = surface.abortStroke();
    this.closeSession();
    if (!result.aborted) return noStrokeAbortReceipt();
    return abortReceipt(result.discardedDabs + unsubmitted, result.restored, result.reasonKo);
  }

  async readback(): Promise<LabImage> {
    return this.requireSurface("readback").toLabImage();
  }

  async readbackLinear(): Promise<Float32Array | null> {
    return this.requireSurface("readbackLinear").toLinear();
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  /** 현재 표면(테스트·증거용). init 전·dispose 후는 null. */
  currentSurface(): Surface | null {
    return this.surface;
  }

  dispose(): void {
    this.closeSession();
    this.surface = null;
    this.makeWorld = null;
    this.clock = null;
    this.disposed = true;
  }

  /** 월드 구현 식별자(영수증용). */
  protected abstract backendId(): string;

  private startBrush(session: Session, surface: Surface, x: number, y: number, tMs: number, pressure: number): void {
    const make = this.makeWorld;
    if (!make) throw new InvalidStateError("addSamples: init 전에 호출됐다");
    const world = make();
    let brush: BristleBrush2D;
    let synth: BristleDabSynthesizer;
    try {
      brush = new BristleBrush2D(world, session.mapping.config, session.seed);
      brush.begin(x, y, tMs, pressure);
      synth = new BristleDabSynthesizer(surface, session.mapping.config.count, brush.bristleRadiusPx, session.mapping.baseFlow, session.colorLinear, session.seed, bristleSpreadRadiusPx(session.mapping.config, 0.5), session.mapping.dabResponse);
    } catch (error) {
      // 세션에 대입하기 전에 던지면 closeSession/dispose/abortStroke 어디서도 월드를 해제하지 못한다 — 여기서 보장한다.
      world.dispose();
      throw error;
    }
    session.brush = brush;
    session.synth = synth;
  }

  private closeSession(): void {
    const session = this.session;
    this.session = null;
    session?.brush?.dispose();
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireSurface(op: string): Surface {
    this.assertAlive(op);
    if (!this.surface) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return this.surface;
  }
}
