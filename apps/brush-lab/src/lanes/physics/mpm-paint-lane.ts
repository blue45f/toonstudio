import { encodeLabImage, srgbToLinear } from "../../engine/core/color";
import { evalCurve } from "../../engine/core/curve";
import { InvalidStateError, LaneUnavailableError, SumiError } from "../../engine/core/errors";
import { SUMI_ENGINE_VERSION } from "../../engine/core/version";
import { PaintEmitter, pressureWidth } from "../../engine/physics/mpm2d/emitter";
import { MPM_DEFAULTS, resolveMpmParams, substepsForCfl } from "../../engine/physics/mpm2d/params";
import { Mpm2D } from "../../engine/physics/mpm2d/solver";
import { commitWetTile, ParticleSplat, resolveWetTile } from "../../engine/physics/mpm2d/splat";
import { createBandMixer, KM_TABLE_8 } from "../../engine/pigment/km-mix";
import { buildConcentrationRamp, fillParticleColors } from "../../engine/pigment/km-transport";
import { Surface } from "../../engine/raster/reference-renderer";
import { TILE_SIZE } from "../../engine/raster/tile-binning";
import { abortReceipt, emptyLaneStats, noStrokeAbortReceipt, resolveStrokeColor, supportedReport } from "../lane";

import type { Clock, LabImage, RawSample } from "../../engine/core/types";
import type { EmitterConfig } from "../../engine/physics/mpm2d/emitter";
import type { MpmParams } from "../../engine/physics/mpm2d/params";
import type { BandMixer, Rgb3 } from "../../engine/pigment/km-mix";
import type { ConcentrationRamp } from "../../engine/pigment/km-transport";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStats,
  LaneStatus,
  StrokeAbortReceipt,
  StrokeOptions,
  StrokeReceipt,
} from "../lane";

/**
 * MLS-MPM 점탄성 물감 레인(실험, `maturity: "experimental"`).
 *
 * 획 동안 펜 위치에서 물감 입자를 주입하고(압력 → 폭·양, 펜 속도 → 초기 속도) 표본 시각에 맞춰 고정 dt 서브스텝으로 MPM을 진행한다.
 * 입자는 되직한 물감처럼 퍼지고 가라앉는다(Maxwell 이완 + 항복). `endStroke`는 운동이 가라앉을 때까지(또는 최대 스텝) 진행한 뒤
 * 입자 스플랫을 래스터 표면(엔진 `Surface`의 선형 premultiplied 문서)에 굽고 입자를 비운다. `readback`은 언제나
 * "표면 + 현재 젖은 입자 스플랫"이라 그리는 중인 물감도 화면에 보인다.
 *
 * 혼색: 굽는 순간 이미 있는 표면 색과 새 물감 색을 KM(밴드 8)으로 섞는다(노랑 위 파랑 → 초록). 이 레인의 입자는 한 획 안에서 단색이라
 * 농도 t가 0으로 고정이다 — 입자 수송 혼색(`Mpm2D.conc` + `km-transport`)은 엔진 모듈과 그 테스트에서 검증한다.
 *
 * fail-visible(ADR-0018): 입자 한도(기본 20k)에 닿으면 주입을 멈추고 `overflowDabs`로 세며 한글 사유를 영수증 `notesKo`에 남긴다.
 * 임파스토·smudge·지우개는 이 모델로 표현할 수 없어 `LaneUnavailableError("not-implemented")`로 거부한다(근사하지 않는다).
 * 옮기는 프로그램 필드는 팁 지름·압력 크기 매핑·불투명도뿐이며 나머지는 영수증 `unmappedKo`로 드러낸다.
 *
 * 성능: Node 22 단일 스레드 CPU 값이다(브라우저는 스모크만). 비용은 입자 수 × 서브스텝 수가 지배한다(입자·스텝당 약 0.37 µs).
 * 되먹임 가드(MP-2): 시계가 표본 시각에 묶여 있어 입자가 많으면 "늦을수록 따라잡을 스텝이 늘어 더 늦어지는" 발산이 생기므로(1024×640 구아슈 곡선에서 브라우저가 20분 넘게 멈췄다)
 * 호출당 작업 예산(입자-스텝)을 두고, 걸리면 서브스텝을 건너뛰어 슬로모션으로 흘리며 영수증·`notesKo`로 드러낸다. 예산은 개수 기반이라 벽시계를 읽지 않고 결정적이다.
 */
export const MPM_PAINT_LANE_ID: LaneId = "mpm-paint";

/** 입자 한도 기본값. */
export const MPM_LANE_MAX_PARTICLES = 20000;
/** 격자 셀 한 변(px). */
export const MPM_LANE_CELL_PX = 2;
/** 프레임(1/60초)당 서브스텝 수의 기준(CFL 목표에서 계산한 값과 비교해 큰 쪽을 쓴다). */
export const MPM_LANE_SUBSTEPS_PER_FRAME = 8;
/**
 * 정착 기본값: 제곱평균제곱근 속력 3 px/초 이하 또는 최대 600 스텝(약 0.6초 시뮬레이션 시간).
 * 종이 항력 8/초에서 3 px/초가 남았을 때 더 움직일 거리는 v/항력 ≈ 0.4 px라 눈에 보이지 않는다(정착 스텝·`endStroke` 비용을 줄이는 근거).
 */
export const MPM_LANE_SETTLE_RMS = 3;
export const MPM_LANE_SETTLE_MAX_STEPS = 600;
/**
 * 호출당 작업 예산(입자-스텝: 서브스텝 1회 = 그때의 입자 수). `addSamples` 한 번(그리고 `endStroke`의 마무리 진행)이 쓸 수 있는 시뮬레이션 일의 상한이다.
 * 시계가 표본 시각(실시간)에 묶여 있어, 상한이 없으면 입자가 늘어 한 스텝이 dt(약 2.1 ms)보다 오래 걸리는 순간부터 "프레임이 늦을수록 다음 프레임이 따라잡을 스텝이 늘어 더 늦어지는"
 * 되먹임이 생겨 호출 하나가 수십 초~수 분이 된다(MP-2: 1024×640 구아슈 곡선, 입자 약 5000개부터 발산). 48,000이면 입자 6,000개까지는 프레임당 8서브스텝(실시간)을 그대로 돌고,
 * 그 위에서는 실시간보다 느리게(슬로모션) 흐르며 건너뛴 스텝을 `droppedSubsteps`/`budgetDroppedSubsteps`와 한글 사유로 드러낸다. 비용 상수는 입자·스텝당 약 0.37 µs(Node 22)이다.
 */
export const MPM_LANE_WORK_BUDGET_PER_CALL = 48_000;
/**
 * 정착 작업 예산(입자-스텝). 정착 최대 스텝(600)과 별개로 `예산 ÷ 입자 수`가 스텝 상한이 된다: 입자 8,000개 → 200스텝, 20,000개 → 80스텝(Node 22에서 약 0.6 s 이하).
 * 실측 정착은 입자 8,000개에서 88~104스텝, 17,000개에서 141스텝이라 보통의 획은 상한에 닿지 않는다. 닿으면 `settled: false`와 한글 사유로 드러낸다.
 */
export const MPM_LANE_SETTLE_WORK_BUDGET = 1_600_000;

const SPACING_PX = 1.2;
const SPLAT_SIGMA_PX = 1.6;
const SPLAT_LOW = 0.04;
const SPLAT_HIGH = 0.1;
/** 펜 속도가 입자에 전해지는 비율. 1이면 펜과 같은 속도 — 음속을 넘으면 붕괴하므로 작게 둔다(SP-B 측정). */
const VELOCITY_GAIN = 0.1;
/** 초기 체적비(1 미만 = 젖은 하중이 번지는 구동원). */
const INITIAL_J = 0.95;
const JITTER = 0.5;
const MIN_WIDTH_RATIO = 0.45;
const MIN_WIDTH_FLOOR_PX = 1.2;
const MAX_WIDTH_PX = 96;
const MIN_CANVAS_PX = 4 * MPM_LANE_CELL_PX;

export interface MpmPaintLaneOptions {
  maxParticles?: number;
  settleMaxSteps?: number;
  settleRmsSpeedPxS?: number;
  /** 호출당 작업 예산(입자-스텝, 기본 `MPM_LANE_WORK_BUDGET_PER_CALL`). Infinity면 무제한(시험·측정용 — 실시간 입력에서는 쓰지 않는다). */
  workBudgetPerCall?: number;
  /** 정착 작업 예산(입자-스텝, 기본 `MPM_LANE_SETTLE_WORK_BUDGET`). */
  settleWorkBudget?: number;
  /** 솔버 파라미터 덮어쓰기(실험·시험용). dt는 CFL에서 정하므로 `dtS`를 주면 그 값을 쓴다. */
  solver?: Partial<Omit<MpmParams, "widthPx" | "heightPx" | "maxParticles">>;
}

/** MPM 레인 전용 획 영수증(StrokeReceipt의 상위 호환). */
export interface MpmStrokeReceipt extends StrokeReceipt {
  particlesInjected: number;
  particlesPeak: number;
  /** 영역(캔버스) 밖이라 만들지 않은 입자 요청 수. */
  culledOutside: number;
  /** 수치 안전 클램프 발동 총 횟수(0이어야 건강하다). */
  clampEvents: number;
  /** 진행한 서브스텝 수(획 도중 + 정착). */
  substeps: number;
  settleSteps: number;
  settled: boolean;
  /** 건너뛴 서브스텝 총수(시간 점프 상한 + 작업 예산). */
  droppedSubsteps: number;
  /** 그중 호출당 작업 예산이 바닥나 진행하지 못한 서브스텝 수(입자가 많아 실시간보다 느리게 흐른 양). */
  budgetDroppedSubsteps: number;
  /** 작업 예산에 걸린 `addSamples`·`endStroke` 호출 수. */
  budgetLimitedCalls: number;
  /** 호출당 작업 예산(입자-스텝). */
  workBudgetPerCall: number;
  /** 정착에 허용한 최대 스텝(정착 최대 스텝과 `정착 작업 예산 ÷ 입자 수` 중 작은 값). */
  settleStepCap: number;
  /** 캔버스에서 멀리 벗어나 계산하지 않은 방출 행 수(그 행의 입자는 어차피 모두 캔버스 밖이다). */
  rowsCulled: number;
  /** 타일 풀 부족으로 스플랫하지 못한 입자 수. */
  splatSkipped: number;
  /** 이 획에서 드러내야 하는 사유(한글). 비어 있으면 아무 일도 없었다. */
  notesKo: string[];
  /** 옮긴 프로그램 필드. */
  mappedKo: string[];
  /** 옮기지 않은 프로그램 필드. */
  unmappedKo: string[];
}

interface ProgramMapping {
  emitter: EmitterConfig;
  opacity: number;
  mappedKo: string[];
  unmappedKo: string[];
}

/** 이 모델로 근사 없이 표현할 수 없는 프로그램이면 한글 사유, 아니면 null. */
export function unsupportedMpmReason(program: BrushProgram): string | null {
  const model = program.deposition.model;
  if (model === "impasto") return `임파스토(${program.id})는 MPM 물감 레인에 높이장·조명 모델이 없어 근사하지 않고 거부한다`;
  if (model === "smudge") return `smudge(${program.id})는 입자가 문서의 기존 색을 집어 올리지 못해 거부한다`;
  if (model === "eraser" || program.deposition.blend === "erase") return `지우개(${program.id})는 물감 입자로 문서를 지울 수 없어 거부한다`;
  return null;
}

/**
 * 프로그램 → 방출 설정. 옮기는 것은 팁 지름·압력 크기 매핑·불투명도다.
 * 폭(압력) = 팁 지름 × (프로그램의 `strokeDynamics.size` 중 입력이 pressure·constant인 매핑의 곱). 압력 매핑이 하나도 없으면
 * 압력에 반응하지 않는 브러시도 "압력 → 양"을 보이도록 기본 곡선(압력 0 = 지름 45%, 압력 1 = 지름, 사이는 √압력)을 쓴다.
 */
export function mapProgramToMpm(program: BrushProgram, colorAlpha: number): ProgramMapping {
  const sizePx = program.tip.sizePx;
  const pressureMaps = program.strokeDynamics.size.filter((m) => m.input === "pressure");
  const constantFactor = program.strokeDynamics.size
    .filter((m) => m.input === "constant")
    .reduce((acc, m) => acc * (m.min + (m.max - m.min) * evalCurve(m.curve, 1)), 1);
  const skippedInputs = [...new Set(program.strokeDynamics.size.filter((m) => m.input !== "pressure" && m.input !== "constant").map((m) => m.input))];
  const clampWidth = (w: number): number => Math.min(MAX_WIDTH_PX, Math.max(MIN_WIDTH_FLOOR_PX, w));
  let widthAtPressure: (pressure: number) => number;
  let widthNote: string;
  if (pressureMaps.length > 0) {
    widthAtPressure = (p) =>
      clampWidth(sizePx * constantFactor * pressureMaps.reduce((acc, m) => acc * (m.min + (m.max - m.min) * evalCurve(m.curve, p)), 1));
    widthNote = `팁 지름 ${sizePx}px × 압력 크기 매핑 → 폭 ${widthAtPressure(0).toFixed(1)}px(압력 0) .. ${widthAtPressure(1).toFixed(1)}px(압력 1)`;
  } else {
    const max = clampWidth(sizePx * constantFactor);
    const min = Math.max(MIN_WIDTH_FLOOR_PX, max * MIN_WIDTH_RATIO);
    widthAtPressure = pressureWidth(min, max);
    widthNote = `팁 지름 ${sizePx}px → 폭 ${min.toFixed(1)}px(압력 0) .. ${max.toFixed(1)}px(압력 1), 압력 매핑이 없어 기본 √압력 곡선`;
  }
  const opacity = Math.min(1, Math.max(0, program.deposition.opacity * colorAlpha));
  const unmappedKo = [
    "팁 종류·경도·종횡비·각도(입자 원은 항상 둥근 물감 하중)",
    "흐름·간격·시간 기반 dab(펜이 멈추면 더 쌓이지 않는다)",
    "종이 그레인·질감(종이 단계가 담당한다 — 결합 전)",
    "습식 매체 파라미터(wet)와 접촉 물리(MPM 점탄성이 번짐을 대신한다)",
    "흐름 동역학·색 동역학(지터)·산포·테이퍼",
  ];
  if (skippedInputs.length > 0) unmappedKo.push(`압력·상수 외 크기 입력(${skippedInputs.join(", ")})`);
  return {
    emitter: {
      rowSpacingPx: SPACING_PX,
      acrossSpacingPx: SPACING_PX,
      widthAtPressure,
      velocityGain: VELOCITY_GAIN,
      initialJ: INITIAL_J,
      jitter: JITTER,
      conc: 0,
    },
    opacity,
    mappedKo: [
      widthNote,
      `불투명도 ${program.deposition.opacity} × 획 색 알파 ${colorAlpha} → 굽기 알파 배율 ${opacity.toFixed(3)}`,
      "획 색 옵션(sRGB) → 선형 변환 뒤 KM 혼색으로 표면 색과 섞는다",
    ],
    unmappedKo,
  };
}

interface StrokeState {
  readonly seed: number;
  readonly emitter: PaintEmitter;
  readonly mapping: ProgramMapping;
  readonly colorLinear: Rgb3;
  readonly mappedKo: string[];
  frameIndex: number;
  frameTimes: number[];
  injected: number;
  peak: number;
  lastRevision: number;
  /** 작업 예산에 걸린 호출 수(addSamples + endStroke 마무리). */
  budgetLimitedCalls: number;
}

export class MpmPaintLane implements BrushEngineLane {
  readonly id: LaneId = MPM_PAINT_LANE_ID;
  readonly label = "MLS-MPM 점탄성 물감(실험)";
  readonly kind: LaneKind = "candidate";
  readonly status: LaneStatus = "implemented";
  readonly engineVersion = SUMI_ENGINE_VERSION;

  private readonly options: MpmPaintLaneOptions;
  private surface: Surface | null = null;
  private sim: Mpm2D | null = null;
  private splat: ParticleSplat | null = null;
  private mixer: BandMixer | null = null;
  private clock: Clock | null = null;
  private stroke: StrokeState | null = null;
  private rgb = new Float32Array(0);
  private splatRevision = -1;
  private splatColor: Rgb3 | null = null;
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  constructor(options: MpmPaintLaneOptions = {}) {
    this.options = options;
  }

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    // CPU 전용(외부 의존 0)이라 항상 지원된다.
    return supportedReport(this.id);
  }

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    if (config.width < MIN_CANVAS_PX || config.height < MIN_CANVAS_PX) {
      throw new LaneUnavailableError("limit-exceeded", `MPM 물감 레인은 캔버스가 ${MIN_CANVAS_PX}px 이상이어야 한다(받은 값 ${config.width}×${config.height})`, {
        laneId: this.id,
        width: config.width,
        height: config.height,
      });
    }
    const maxParticles = this.options.maxParticles ?? MPM_LANE_MAX_PARTICLES;
    let params: MpmParams;
    try {
      const merged = { ...MPM_DEFAULTS, cellPx: MPM_LANE_CELL_PX, spacingPx: SPACING_PX, ...this.options.solver };
      // dt는 CFL 목표에서 정한다(고정). 기준 8서브스텝보다 강성이 커서 더 잘게 나눠야 하면 그쪽을 따른다.
      const frame = 1 / 60;
      const sub = Math.max(MPM_LANE_SUBSTEPS_PER_FRAME, substepsForCfl(merged, frame));
      params = resolveMpmParams(config.width, config.height, { ...merged, maxParticles, dtS: this.options.solver?.dtS ?? frame / sub });
    } catch (error) {
      if (error instanceof SumiError && error.code === "mpm-params-invalid") {
        throw new LaneUnavailableError("limit-exceeded", `MPM 물감 레인을 시작할 수 없다: ${error.message}`, { laneId: this.id, ...error.details });
      }
      throw error;
    }
    // 엔진 래스터 표면의 문서(선형 premultiplied f32)와 인코더를 재사용한다. 자체 획 레이어는 쓰지 않으므로 용량 1로 둔다.
    this.surface = new Surface(config.width, config.height, { strokeCapacityTiles: 1, wetCapacityTiles: 1 });
    this.sim = new Mpm2D(params);
    const tiles = Math.ceil(config.width / TILE_SIZE) * Math.ceil(config.height / TILE_SIZE);
    this.splat = new ParticleSplat({
      widthPx: config.width,
      heightPx: config.height,
      sigmaPx: SPLAT_SIGMA_PX,
      spacingPx: SPACING_PX,
      lowFraction: SPLAT_LOW,
      highFraction: SPLAT_HIGH,
      capacityTiles: config.strokeCapacityTiles ?? tiles,
    });
    this.mixer = createBandMixer(KM_TABLE_8);
    this.rgb = new Float32Array(maxParticles * 3);
    this.clock = env.clock;
    this.stroke = null;
    this.splatRevision = -1;
  }

  beginStroke(program: BrushProgram, seed: number, options?: StrokeOptions): void {
    // 색 검증(획을 열기 전에 거부한다) → 지원 여부 → 상태 검사 순.
    const color = resolveStrokeColor(options) ?? [0, 0, 0, 1];
    this.requireSurface("beginStroke");
    const sim = this.requireSim();
    if (this.stroke) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    const reason = unsupportedMpmReason(program);
    if (reason) throw new LaneUnavailableError("not-implemented", reason, { laneId: this.id, presetId: program.id });
    const mapping = mapProgramToMpm(program, color[3]);
    const emitter = new PaintEmitter(mapping.emitter);
    emitter.begin(seed);
    sim.clear();
    sim.resetCounters();
    this.requireSplat().clear();
    this.splatRevision = -1;
    this.splatColor = null;
    this.stroke = {
      seed,
      emitter,
      mapping,
      colorLinear: [srgbToLinear(color[0]), srgbToLinear(color[1]), srgbToLinear(color[2])],
      mappedKo: mapping.mappedKo,
      frameIndex: 0,
      frameTimes: [],
      injected: 0,
      peak: 0,
      lastRevision: sim.revision,
      budgetLimitedCalls: 0,
    };
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    this.requireSurface("addSamples");
    const sim = this.requireSim();
    const stroke = this.stroke;
    if (!stroke) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    // 배치 전체를 먼저 검사한다(일부만 적용된 채 던지지 않는다).
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i];
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.tMs) || !Number.isFinite(s.pressure)) {
        throw new InvalidStateError(`addSamples: 표본 ${i}에 유한하지 않은 값이 있다(x ${s.x}, y ${s.y}, tMs ${s.tMs}, pressure ${s.pressure})`);
      }
    }
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const injectedBefore = sim.counters.injected;
    const stepsBefore = sim.counters.steps;
    const budgetDroppedBefore = sim.counters.budgetDroppedSubsteps;
    // 호출당 작업 예산: 표본 시각을 따라잡는 서브스텝이 이 한도를 넘으면 나머지는 건너뛴다(되먹임 차단, 결정적).
    sim.setWorkBudget(this.options.workBudgetPerCall ?? MPM_LANE_WORK_BUDGET_PER_CALL);
    for (const s of samples) {
      // 예측 표본은 표시 전용이라 물리에 넣지 않는다.
      if (s.source === "predicted") continue;
      stroke.emitter.push(sim, { x: s.x, y: s.y, tMs: s.tMs, pressure: s.pressure < 0 ? 0 : s.pressure > 1 ? 1 : s.pressure });
    }
    if (sim.counters.budgetDroppedSubsteps > budgetDroppedBefore) stroke.budgetLimitedCalls += 1;
    const injected = sim.counters.injected - injectedBefore;
    stroke.injected += injected;
    stroke.peak = Math.max(stroke.peak, sim.count);
    const dt = clock ? clock.now() - t0 : 0;
    stroke.frameTimes.push(dt);
    const receipt: DabBatchReceipt = {
      frameIndex: stroke.frameIndex,
      dabCount: injected,
      submitCount: 1,
      dispatchCount: sim.counters.steps - stepsBefore,
      inputToSubmitMs: clock ? dt : null,
    };
    stroke.frameIndex += 1;
    return receipt;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const surface = this.requireSurface("endStroke");
    const sim = this.requireSim();
    const splat = this.requireSplat();
    const stroke = this.stroke;
    if (!stroke) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    try {
      const budgetDroppedBefore = sim.counters.budgetDroppedSubsteps;
      sim.setWorkBudget(this.options.workBudgetPerCall ?? MPM_LANE_WORK_BUDGET_PER_CALL);
      stroke.emitter.finish(sim);
      if (sim.counters.budgetDroppedSubsteps > budgetDroppedBefore) stroke.budgetLimitedCalls += 1;
      stroke.peak = Math.max(stroke.peak, sim.count);
      const settleStepsBefore = sim.counters.steps;
      // 정착 스텝 상한 = min(정착 최대 스텝, 정착 작업 예산 ÷ 입자 수). 예산으로 줄어든 상한에 닿으면 settled=false 와 사유로 드러난다.
      const settleMax = this.options.settleMaxSteps ?? MPM_LANE_SETTLE_MAX_STEPS;
      const settleStepCap = Math.min(settleMax, Math.floor((this.options.settleWorkBudget ?? MPM_LANE_SETTLE_WORK_BUDGET) / Math.max(1, sim.count)));
      const settle = sim.settle(settleStepCap, this.options.settleRmsSpeedPxS ?? MPM_LANE_SETTLE_RMS);
      const settleSteps = sim.counters.steps - settleStepsBefore;
      this.ensureSplat();
      const poolTilesUsed = splat.pool.used();
      // 굽기 1단계: 모든 타일의 결과를 스테이징에 계산한다(실패해도 문서는 그대로다).
      const staged = this.resolveAll(surface.document);
      // 2단계: 복사(던지지 않는다).
      for (const t of staged) commitWetTile(surface.document, surface.width, surface.height, t.tileX, t.tileY, t.data);
      const dt = clock ? clock.now() - t0 : 0;
      stroke.frameTimes.push(dt);
      const c = sim.counters;
      const splatSkipped = splat.skippedParticles;
      const rowsCulled = stroke.emitter.stats().rowsCulled;
      const notesKo = this.buildNotes({
        rejectedCapacity: c.rejectedCapacity,
        culledOutside: c.rejectedOutside,
        droppedSubsteps: c.droppedSubsteps,
        budgetDroppedSubsteps: c.budgetDroppedSubsteps,
        budgetLimitedCalls: stroke.budgetLimitedCalls,
        particlesPeak: stroke.peak,
        clampEvents: sim.clampEvents,
        settled: settle.settled,
        settleSteps: settle.steps,
        settleStepCap,
        settleMax,
        splatSkipped,
        cflViolation: sim.cflViolation,
        rowsCulled,
      });
      const receipt: MpmStrokeReceipt = {
        dabCount: stroke.injected,
        submitCount: stroke.frameTimes.length,
        gpuTimeMs: null,
        timingSource: "unavailable",
        frameTimesMs: [...stroke.frameTimes],
        overflowDabs: c.rejectedCapacity + splatSkipped,
        poolTilesUsed,
        particlesInjected: stroke.injected,
        particlesPeak: stroke.peak,
        culledOutside: c.rejectedOutside,
        clampEvents: sim.clampEvents,
        substeps: c.steps,
        settleSteps,
        settled: settle.settled,
        droppedSubsteps: c.droppedSubsteps,
        budgetDroppedSubsteps: c.budgetDroppedSubsteps,
        budgetLimitedCalls: stroke.budgetLimitedCalls,
        workBudgetPerCall: this.options.workBudgetPerCall ?? MPM_LANE_WORK_BUDGET_PER_CALL,
        settleStepCap,
        rowsCulled,
        splatSkipped,
        notesKo,
        mappedKo: [...stroke.mappedKo],
        unmappedKo: [...stroke.mapping.unmappedKo],
      };
      this.lifetime.strokes += 1;
      this.lifetime.dabs += stroke.injected;
      this.lifetime.submits += receipt.submitCount;
      this.lifetime.lastReceipt = receipt;
      return receipt;
    } finally {
      // 성공이든 실패든 입자는 비운다(남기면 다음 획이 '이전 획이 endStroke되지 않았다'로 영구히 실패한다).
      this.stroke = null;
      sim.clear();
      splat.clear();
      this.splatRevision = -1;
    }
  }

  /**
   * 진행 중인 획을 버린다. 문서는 `endStroke`의 굽기에서만 바뀌므로(그것도 스테이징 뒤 복사) 입자와 스플랫만 비우면 문서는 그대로 보존된다.
   * `discardedDabs`는 버린 입자 수(이 획에서 주입된 수)다. 획 밖이면 no-op(멱등).
   */
  abortStroke(): StrokeAbortReceipt {
    this.assertAlive("abortStroke");
    const stroke = this.stroke;
    const sim = this.sim;
    if (!stroke || !sim) return noStrokeAbortReceipt();
    const c = sim.counters;
    const alive = sim.count;
    const reasons = [`젖은 입자 ${alive}개(이 획에서 ${stroke.injected}개 주입)를 굽지 않고 버렸다. 문서는 굽기 전이라 그대로 보존됐다`];
    if (c.rejectedCapacity > 0) reasons.push(`입자 한도로 주입하지 못한 요청 ${c.rejectedCapacity}건이 있었다`);
    this.stroke = null;
    sim.clear();
    this.splat?.clear();
    this.splatRevision = -1;
    return abortReceipt(stroke.injected, true, reasons.join(". "));
  }

  async readback(): Promise<LabImage> {
    const surface = this.requireSurface("readback");
    if (!this.hasWet()) return surface.toLabImage();
    return encodeLabImage(this.composeWet(), surface.width, surface.height);
  }

  async readbackLinear(): Promise<Float32Array | null> {
    const surface = this.requireSurface("readbackLinear");
    if (!this.hasWet()) return surface.toLinear();
    return this.composeWet();
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  /** 지금 젖어 있는(굽지 않은) 입자 수. 획 밖이면 0. */
  wetParticleCount(): number {
    return this.sim?.count ?? 0;
  }

  /** 시험·증거용: 솔버(읽기 전용으로만 쓴다). init 전·dispose 후는 null. */
  currentSolver(): Mpm2D | null {
    return this.sim;
  }

  dispose(): void {
    this.surface = null;
    this.sim = null;
    this.splat = null;
    this.mixer = null;
    this.clock = null;
    this.stroke = null;
    this.rgb = new Float32Array(0);
    this.disposed = true;
  }

  private hasWet(): boolean {
    return this.stroke !== null && (this.sim?.count ?? 0) > 0;
  }

  /** 입자 → 스플랫 누적(상태가 같으면 다시 하지 않는다). */
  private ensureSplat(): void {
    const sim = this.requireSim();
    const splat = this.requireSplat();
    const stroke = this.stroke;
    if (!stroke) return;
    if (this.splatRevision === sim.revision && this.splatColor === stroke.colorLinear) return;
    splat.clear();
    const ramp: ConcentrationRamp = buildConcentrationRamp(this.requireMixer(), stroke.colorLinear, stroke.colorLinear, 2);
    fillParticleColors(ramp, sim.conc, sim.count, this.rgb);
    splat.accumulate(sim.x, sim.y, this.rgb, sim.count);
    this.splatRevision = sim.revision;
    this.splatColor = stroke.colorLinear;
  }

  private resolveParams(): { thresholds: { low: number; high: number }; opacity: number; mixer: BandMixer } {
    const stroke = this.stroke;
    if (!stroke) throw new InvalidStateError("resolveParams: 획이 없다");
    return { thresholds: this.requireSplat().wetThresholds, opacity: stroke.mapping.opacity, mixer: this.requireMixer() };
  }

  /** 모든 스플랫 타일을 문서 위에 올린 결과를 스테이징 목록으로 만든다(문서는 읽기만 한다). */
  private resolveAll(doc: Float32Array): { tileX: number; tileY: number; data: Float32Array }[] {
    const surface = this.requireSurface("resolveAll");
    const splat = this.requireSplat();
    const params = this.resolveParams();
    const out: { tileX: number; tileY: number; data: Float32Array }[] = [];
    for (const [tile, accum] of splat.tiles()) {
      const tileX = tile % splat.tilesX;
      const tileY = Math.floor(tile / splat.tilesX);
      const data = new Float32Array(accum.length);
      const touched = resolveWetTile(doc, surface.width, surface.height, tileX, tileY, accum, params, data);
      if (touched > 0) out.push({ tileX, tileY, data });
    }
    return out;
  }

  /** 문서 복사본 위에 현재 젖은 입자 스플랫을 올린 선형 premultiplied 버퍼. */
  private composeWet(): Float32Array {
    const surface = this.requireSurface("composeWet");
    this.ensureSplat();
    const out = surface.toLinear();
    for (const t of this.resolveAll(surface.document)) commitWetTile(out, surface.width, surface.height, t.tileX, t.tileY, t.data);
    return out;
  }

  private buildNotes(n: {
    rejectedCapacity: number;
    culledOutside: number;
    droppedSubsteps: number;
    budgetDroppedSubsteps: number;
    budgetLimitedCalls: number;
    particlesPeak: number;
    clampEvents: number;
    settled: boolean;
    settleSteps: number;
    settleStepCap: number;
    settleMax: number;
    splatSkipped: number;
    cflViolation: boolean;
    rowsCulled: number;
  }): string[] {
    const notes: string[] = [];
    const max = this.sim?.params.maxParticles ?? MPM_LANE_MAX_PARTICLES;
    if (n.rejectedCapacity > 0) {
      notes.push(`입자 한도(${max}개)에 닿아 ${n.rejectedCapacity}개의 주입을 건너뛰었다(overflowDabs에 포함). 획이 중간부터 비어 보일 수 있다`);
    }
    if (n.culledOutside > 0) notes.push(`캔버스 밖에 놓이는 입자 요청 ${n.culledOutside}개는 만들지 않았다`);
    if (n.rowsCulled > 0) notes.push(`캔버스에서 멀리 벗어난 구간의 방출 행 ${n.rowsCulled}개는 계산하지 않았다(그 입자는 모두 캔버스 밖이다)`);
    const gapDropped = n.droppedSubsteps - n.budgetDroppedSubsteps;
    if (gapDropped > 0) notes.push(`표본 시각이 크게 건너뛰어 서브스텝 ${gapDropped}개를 진행하지 않고 넘겼다`);
    if (n.budgetDroppedSubsteps > 0) {
      const budget = this.options.workBudgetPerCall ?? MPM_LANE_WORK_BUDGET_PER_CALL;
      notes.push(
        `입자가 많아(최대 ${n.particlesPeak}개) 호출당 작업 예산(${budget} 입자-스텝)에 ${n.budgetLimitedCalls}회 걸렸다 — 서브스텝 ${n.budgetDroppedSubsteps}개를 진행하지 않고 건너뛰어 물감이 실시간보다 느리게 흘렀다. ` +
          "브라우저가 멈추지 않게 하는 가드이며 모양은 정착 단계가 이어서 퍼뜨린다",
      );
    }
    if (n.clampEvents > 0) notes.push(`수치 안전 클램프가 ${n.clampEvents}회 발동했다 — 시뮬레이션이 건강하지 않다(CFL·펜 속도 점검)`);
    if (n.cflViolation) notes.push("CFL이 상한을 넘은 설정으로 실행됐다 — 결과를 신뢰할 수 없다");
    if (!n.settled) {
      const byBudget = n.settleStepCap < n.settleMax;
      notes.push(
        byBudget
          ? `정착이 작업 예산(입자 ${n.particlesPeak}개 기준 최대 ${n.settleStepCap}스텝, 정착 최대 스텝 ${n.settleMax} 대신)에 닿았으나 아직 움직이는 중에 굽었다`
          : `정착 최대 스텝(${n.settleSteps})에 닿았으나 아직 움직이는 중에 굽었다`,
      );
    }
    if (n.splatSkipped > 0) notes.push(`스플랫 타일 풀이 모자라 입자 ${n.splatSkipped}개를 그리지 못했다(overflowDabs에 포함)`);
    return notes;
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireSurface(op: string): Surface {
    this.assertAlive(op);
    if (!this.surface) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return this.surface;
  }

  private requireSim(): Mpm2D {
    if (!this.sim) throw new InvalidStateError("init 전에 호출됐다");
    return this.sim;
  }

  private requireSplat(): ParticleSplat {
    if (!this.splat) throw new InvalidStateError("init 전에 호출됐다");
    return this.splat;
  }

  private requireMixer(): BandMixer {
    if (!this.mixer) throw new InvalidStateError("init 전에 호출됐다");
    return this.mixer;
  }
}

export function createMpmPaintLane(options?: MpmPaintLaneOptions): BrushEngineLane {
  return new MpmPaintLane(options);
}

/** 레지스트리 디스크립터(실험 레인: 인증 판정·기본 경로에서 제외하고 UI는 `maturity`로 배지를 보인다). */
export const MPM_PAINT_LANE: LaneDescriptor = {
  id: MPM_PAINT_LANE_ID,
  label: "MLS-MPM 점탄성 물감(실험)",
  kind: "candidate",
  status: "implemented",
  maturity: "experimental",
  nodeVerification:
    "엔진 MPM 솔버(결정성 해시·질량 보존·퍼징 NaN 0·CFL 위반 클램프·입자 한도·작업 예산·활성 타일 = 경계 상자 순회와 비트 동일)·KM 농도 수송 + 레인 계약(획 흐름·abortStroke 문서 보존·획 색·한도 영수증·readback 젖은 입자 합성·거부 프로그램·병적 입력(시간 점프·6초치 한 호출·고밀도 폭주·먼 점)에서 호출당 작업 예산 이하를 개수로 단언·예산 걸림 영수증)",
  browserVerification: "스모크만(헤드리스 Chromium 141 SwiftShader·Vite dev, Z-1·MP-2): 512²·1024×640 구아슈 마우스 곡선·펜 지그재그가 끝나고 합성 pointercancel 뒤 문서 보존. 성능·교차 머신 결정성·워커·실펜 손맛 미검증(CPU 전용 순수 TS, 성능 수치는 Node 22 단일 스레드 기준). MP-2 이전에는 1024×640이 20분 넘게 끝나지 않았다",
  create: () => createMpmPaintLane(),
};
