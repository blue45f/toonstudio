import { premultiply, srgbToLinear } from "../../engine/core/color";
import { DabBatch } from "../../engine/core/dab-layout";
import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { hashU32 } from "../../engine/core/rng";
import { SUMI_ENGINE_VERSION } from "../../engine/core/version";
import { BristleBrush2D, bristleContactRadiusPx, resolveBristleBrushConfig } from "../../engine/physics/world2d/bristle-brush";
import { pressureCurveById } from "../../engine/physics/world2d/pressure-curve";
import { Surface } from "../../engine/raster/reference-renderer";
import { abortReceipt, emptyLaneStats, noStrokeAbortReceipt, resolveStrokeColor } from "../lane";

import type { Clock, DabInstance, LabImage, RawSample } from "../../engine/core/types";
import type { BristleBrushConfig, BristleTick, BristleTickSink } from "../../engine/physics/world2d/bristle-brush";
import type { PressureCurveId } from "../../engine/physics/world2d/pressure-curve";
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
 * 프로그램에서 옮기는 필드는 팁 지름(벌어짐 반경)·`deposition.flow`뿐이고 불투명도·블렌드는 표면의 획 합성이 그대로 적용한다.
 * 옮기지 않은 필드는 영수증 `unmappedKo`로 드러낸다(근사하지 않는다). 습식·임파스토·smudge·지우개는 거부한다.
 */

/** 래스터 배치 용량(dab). 가득 차면 표면에 제출하고 비운다. */
export const BRISTLE_BATCH_CAPACITY = 4096;
/** dab 간격(지름 대비). SP-A 렌더 규약과 같다. */
export const BRISTLE_DAB_SPACING = 0.3;
/** dab 반경 / 털 접촉 반경. */
export const BRISTLE_DAB_RADIUS_SCALE = 0.95;
/** dab 간격의 하한(px). */
export const BRISTLE_MIN_STEP_PX = 0.35;
/** 압력이 이 값 이하면 물감을 내지 않는다. */
export const BRISTLE_MIN_PRESSURE = 0.002;
/** 적재량이 이 값 이하면 그 털은 마른 것으로 보고 찍지 않는다. */
export const BRISTLE_MIN_LOAD = 0.02;
/** 압력 0에서의 흐름 비율(나머지는 압력에 비례): 흐름 = 기본 × 적재량 × (FLOOR + (1 − FLOOR)·압력). */
export const BRISTLE_FLOW_PRESSURE_FLOOR = 0.2;
/** 털 수 √N으로 나누는 기본 흐름 계수(털이 많을수록 겹침이 늘어 dab당 흐름을 줄인다). */
export const BRISTLE_FLOW_GAIN = 1.8;
/** 좁은 벌어짐에서 흐름을 줄이는 하한 비율. */
export const BRISTLE_DENSITY_FLOOR = 0.35;
/** 정착 최대 시간(ms). */
export const BRISTLE_SETTLE_MAX_MS = 300;
/**
 * 표본 좌표 한계(px). f32 범위(약 3.4e38)를 넘는 값은 `Number.isFinite`는 통과하지만 f32 미러에서 Infinity가 되어 틱 도중 던지고,
 * 그 근처의 큰 값도 제곱 연산에서 넘친다. 문서 좌표로 의미가 있는 범위보다 훨씬 넉넉한 안전 상한으로 막는다.
 */
export const BRISTLE_MAX_ABS_COORD_PX = 1e7;
/** 벌어짐 반경 한계(px). */
const MIN_RADIUS_PX = 1.5;
const MAX_RADIUS_PX = 64;

/** 레인 생성 옵션. */
export interface BristleLaneOptions {
  /** 털 수. 기본 32(자체 PBD는 N ≤ 32를 권한다). */
  bristles?: number;
  /** 압력 → 벌어짐 곡선. 기본 `power-fit`(단조), `buckling-3d`는 3D 좌굴의 비단조를 흉내 낸다. */
  spreadCurve?: PressureCurveId;
  /** 붓털 설정 덮어쓰기(실험·시험용). */
  brush?: Partial<BristleBrushConfig>;
  /** 방향 출처. 기본 `velocity`(손잡이 속도 방향), `tilt`는 표본 기울기가 0이 아닐 때 그 방위각. */
  headingSource?: "velocity" | "tilt";
}

const CURVE_LABEL_KO: Readonly<Record<PressureCurveId, string>> = {
  "power-fit": "power-fit(단조 거듭제곱)",
  "buckling-3d": "buckling-3d(좌굴 비단조 표)",
  linear: "linear(선형 0.45→1)",
};

/** 프로그램 → 붓털 설정/흐름 매핑. */
export interface BristleProgramMapping {
  config: BristleBrushConfig;
  /** dab당 기준 흐름(적재량·압력을 곱하기 전). */
  baseFlow: number;
  mappedKo: string[];
  unmappedKo: string[];
  /** 근사로 허용했지만 결과가 원래 프로그램과 눈에 띄게 다를 수 있다는 경고(모델 이름 포함). 비어 있으면 경고할 근사가 없다. */
  notesKo: string[];
}

/**
 * 이 모델로 근사 없이 표현할 수 없는 프로그램이면 한글 사유, 아니면 null.
 *
 * 붓털 레인은 항상 **둥근 dab**를 찍으므로 (a) 의미가 둥근 dab 누적과 크게 다른 프로그램은 근사하지 않고 거부한다(ADR-0018):
 * 습식·임파스토·smudge·지우개(문서/수분 모델 필요), 스프레이·하프톤(산포·망점 패턴), 산포·점·해치 팁, 특수 효과(fx) 계열.
 * (b) 둥근 dab로 어느 정도 흉내 낼 수 있는 모델(에어브러시, 질감 팁의 건식 도장, 털 모델)은 허용하되 `mapProgramToBristle`이
 * 모델 이름을 적은 `notesKo`·`unmappedKo`로 근사 사실을 영수증에 남긴다.
 */
export function unsupportedBristleReason(program: BrushProgram): string | null {
  const model = program.deposition.model;
  if (model === "wet-flow") return `습식 흐름(${program.id})은 붓털 레인에 수분·안료 확산 모델이 없어 근사하지 않고 거부한다`;
  if (model === "impasto") return `임파스토(${program.id})는 붓털 레인에 높이장·조명 모델이 없어 근사하지 않고 거부한다`;
  if (model === "smudge") return `smudge(${program.id})는 붓털 dab가 문서의 기존 색을 집어 올리지 못해 거부한다`;
  if (model === "eraser" || program.deposition.blend === "erase") return `지우개(${program.id})는 붓털 dab로 문서를 지울 수 없어 거부한다`;
  if (model === "spray") return `스프레이(${program.id}, spray)는 입자 산포 모델이 붓털 레인에 없고 둥근 dab로 그리면 전혀 다른 그림이 되어 근사하지 않고 거부한다`;
  if (model === "hatch-halftone") return `하프톤·망점(${program.id}, hatch-halftone)은 규칙적 망점 패턴 모델이 붓털 레인에 없고 둥근 dab로 그리면 전혀 다른 그림이 되어 근사하지 않고 거부한다`;
  const tip = program.tip.kind;
  if (tip === "particle" || tip === "stipple" || tip === "hatch") {
    return `${tip} 팁(${program.id})은 산포·점·해치 패턴을 찍는 팁이라 붓털 레인의 둥근 dab로 근사하지 않고 거부한다`;
  }
  if (program.family === "special") return `특수 효과(fx) 계열(${program.id})은 산포·색상 지터·질감 팁이 정체성이라 붓털 레인의 둥근 dab로 근사하지 않고 거부한다`;
  return null;
}

/** 프로그램과 레인 옵션으로 붓털 설정을 만든다. 팁 지름 → 벌어짐 반경, 흐름 → dab 기준 흐름. */
export function mapProgramToBristle(program: BrushProgram, options: BristleLaneOptions = {}): BristleProgramMapping {
  const count = options.bristles ?? 32;
  const radiusPx = Math.min(MAX_RADIUS_PX, Math.max(MIN_RADIUS_PX, program.tip.sizePx / 2));
  // 요청한 곡선을 이름 그대로 적용한다(모르는 이름은 pressureCurveById가 RangeError — 조용히 기본 곡선으로 바꾸지 않는다).
  const curveId: PressureCurveId = options.spreadCurve ?? "power-fit";
  const curve = pressureCurveById(curveId);
  const config = resolveBristleBrushConfig({ count, radiusPx, spreadCurve: curve, ...options.brush });
  const baseFlow = Math.min(0.6, Math.max(0.002, (program.deposition.flow * BRISTLE_FLOW_GAIN) / Math.sqrt(count)));
  const curveName = CURVE_LABEL_KO[curveId];
  const model = program.deposition.model;
  const tipKind = program.tip.kind;
  const unmappedKo = [
    `팁 종류 ${tipKind}·경도 ${program.tip.hardness}·종횡비 ${program.tip.aspect}·각도(dab는 항상 둥글고 경도 0.85)`,
    "간격·크기/흐름 동역학·산포·테이퍼·색 동역학(지터)",
    "종이 그레인·질감(dab의 그레인 응답은 0)",
    "건조 끊김(dryBreakup)·습식 매체 파라미터",
  ];
  const notesKo: string[] = [];
  if (model === "airbrush") {
    unmappedKo.push(`에어브러시 모델(airbrush, ${program.id}): 가장자리가 부드러운 누적 도포·초당 dab 발사(timeDabsPerSecond)가 없다`);
    notesKo.push(`에어브러시(${program.id}, airbrush)를 둥근 털 dab로 근사했다 — 가장자리가 더 단단하고 농도가 cpu-reference와 다를 수 있다`);
  } else if (model === "bristle") {
    unmappedKo.push(`bristle 모델(${program.id}): 팁의 털 가닥 무늬(${tipKind})를 쓰지 않고 물리 붓털 다발(${count}올)이 대신 표현한다 — 가닥 수·간격은 일치하지 않는다`);
  }
  if (tipKind === "texture-stamp" || tipKind === "noise" || tipKind === "flat") {
    notesKo.push(`${tipKind} 팁(${program.id})의 모양·질감은 쓰지 않고 둥근 털 dab로 그렸다 — 도장 질감·납작한 폭이 사라진다`);
  }
  return {
    config,
    baseFlow,
    mappedKo: [
      `팁 지름 ${program.tip.sizePx}px → 압력 1 벌어짐 반경 ${radiusPx.toFixed(1)}px, 털 ${count}올, 털 접촉 반경 ${bristleContactRadiusPx(config).toFixed(2)}px`,
      `압력 → 벌어짐 곡선 ${curveName}, 압력 → 강성 배율 ${config.stiffnessLevels}단계`,
      `흐름 ${program.deposition.flow} → dab당 기준 흐름 ${baseFlow.toFixed(3)}(÷√털 수), 실제 흐름 = 기준 × 적재량 × (${BRISTLE_FLOW_PRESSURE_FLOOR} + ${1 - BRISTLE_FLOW_PRESSURE_FLOOR}·압력)`,
      "불투명도·블렌드는 엔진 표면의 획 합성(cpu-reference와 같은 경로)이 그대로 적용한다",
      "획 색 옵션(sRGB) → 선형 premultiplied dab 색",
    ],
    unmappedKo,
    notesKo,
  };
}

/** 합성기 통계(영수증용). */
export interface BristleSynthStats {
  dabs: number;
  submits: number;
  maxDirtyTiles: number;
  overflowDabs: number;
  skippedDry: number;
  skippedLift: number;
}

/**
 * 틱을 dab로 바꾸는 싱크. 털마다 마지막 dab 이후의 이동 거리(carry)를 들고 있어 틱 경계에 상관없이 간격이 일정하다.
 * 제출은 `submit`(보통 `Surface.addDabs`)으로 하고, 배치가 가득 차거나 `flush()`를 부르면 나간다.
 */
export class BristleDabSynthesizer implements BristleTickSink {
  readonly stats: BristleSynthStats = { dabs: 0, submits: 0, maxDirtyTiles: 0, overflowDabs: 0, skippedDry: 0, skippedLift: 0 };

  private readonly batch = new DabBatch(BRISTLE_BATCH_CAPACITY);
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
  ) {
    this.carry = new Float32Array(count);
    this.dab = {
      x: 0,
      y: 0,
      rx: 1,
      ry: 1,
      angle: 0,
      hardness: 0.85,
      flow: 0,
      shapeExp: 2,
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
    return this.batch.count;
  }

  /** 털마다 현재 위치에 dab 하나씩(탭 한 번에 점이 찍히게). */
  stamp(tick: BristleTick): void {
    if (tick.pressure <= BRISTLE_MIN_PRESSURE) return;
    const density = this.densityScale(tick.spreadRadiusPx);
    for (let i = 0; i < this.count; i += 1) this.place(i, tick.curX[i] ?? 0, tick.curY[i] ?? 0, tick.load[i] ?? 0, tick.pressure, density);
  }

  onTick(tick: BristleTick): void {
    const rad = this.contactRadiusPx * BRISTLE_DAB_RADIUS_SCALE;
    const step = Math.max(BRISTLE_MIN_STEP_PX, 2 * rad * BRISTLE_DAB_SPACING);
    const lifted = tick.pressure <= BRISTLE_MIN_PRESSURE;
    const density = this.densityScale(tick.spreadRadiusPx);
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
      // 이 구간에서 간격마다 dab를 둔다.
      let pos = step - carried;
      while (pos <= len) {
        const t = pos / len;
        if (lifted) this.stats.skippedLift += 1;
        else this.place(i, x0 + dx * t, y0 + dy * t, tick.load[i] ?? 0, tick.pressure, density);
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

  /** 쌓인 dab를 표면에 제출한다. */
  flush(): void {
    if (this.batch.count === 0) return;
    const receipt = this.surface.addDabs(this.batch);
    this.stats.submits += 1;
    this.stats.overflowDabs += receipt.overflowDabs;
    if (receipt.dirtyTiles > this.stats.maxDirtyTiles) this.stats.maxDirtyTiles = receipt.dirtyTiles;
    this.batch.reset();
  }

  private place(i: number, x: number, y: number, load: number, pressure: number, density: number): void {
    if (load <= BRISTLE_MIN_LOAD) {
      this.stats.skippedDry += 1;
      return;
    }
    const gain = BRISTLE_FLOW_PRESSURE_FLOOR + (1 - BRISTLE_FLOW_PRESSURE_FLOOR) * pressure;
    const flow = Math.min(1, this.baseFlow * load * gain * density);
    const dab = this.dab;
    dab.x = x;
    dab.y = y;
    const rad = this.contactRadiusPx * BRISTLE_DAB_RADIUS_SCALE;
    dab.rx = rad;
    dab.ry = rad;
    dab.flow = flow;
    dab.seed = hashU32(i, this.index, this.seed) & 0x00ff_ffff;
    this.index += 1;
    if (!this.batch.push(dab)) {
      this.flush();
      this.batch.push(dab);
    }
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
      synth = new BristleDabSynthesizer(surface, session.mapping.config.count, brush.bristleRadiusPx, session.mapping.baseFlow, session.colorLinear, session.seed, session.mapping.config.radiusPx * session.mapping.config.spreadCurve.eval(0.5));
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
