import { encodeLabImage } from "../engine/core/color";
import { InvalidStateError } from "../engine/core/errors";

import { abortReceipt, emptyLaneStats, noStrokeAbortReceipt, resolveStrokeColor } from "./lane";
import { assertProgramSupported, mapProgramToMypaint } from "./mypaint-settings-map";
import { compositeStraightFrame } from "./straight-frame-composite";

import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStats,
  LaneStatus,
  StrokeAbortReceipt,
  StrokeOptions,
  StrokeReceipt,
} from "./lane";
import type { MypaintMapping, MypaintMappingReceipt } from "./mypaint-settings-map";
import type { Clock, LabImage, RawSample, Rgba } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * 외부 래스터 엔진(libmypaint·Hokusai) 비교 레인의 공통 뼈대.
 *
 * 구조: 엔진은 **획마다 격리된 표면**에 그리고(획 시작 = 새 표면·새 브러시), 획이 끝나면 sRGB straight RGBA8 프레임을
 * 레인이 가진 선형 premultiplied f32 문서에 Sumi의 합성 규약(`compositeTile`)으로 합성한다. 그래서
 * - `abortStroke`는 격리 표면을 버리면 끝이고 문서는 `endStroke` 전에는 바뀌지 않아 **항상 정확히 보존**된다.
 * - 다획 문서·겹침은 레인이 합성한다. 대신 엔진 표면이 이전 획을 모르므로 smudge류(문서 색을 집는 매체)는 거부한다.
 * - 엔진은 입력 파이프라인 없이 원시 표본을 받는다(Sumi의 입력 파이프라인·물리·테이퍼는 적용되지 않는다).
 *
 * 하위 클래스는 엔진 호출(로드·표면 열기·표본 공급·마감·정리)만 구현한다.
 */

/** 엔진에 공급하는 표본(압력 0..1, 기울기 -1..1). 시간은 절대 ms다. */
export interface EngineSample {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  tMs: number;
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampSigned(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Sumi 원시 표본 → 엔진 표본. 기울기(deg)는 ±90°를 ±1로 정규화한다. 예측 표본은 정본이 아니라 호출 전에 걸러진다. */
export function toEngineSample(s: RawSample): EngineSample {
  return {
    x: s.x,
    y: s.y,
    pressure: clampUnit(s.pressure),
    tiltX: clampSigned(s.tiltXDeg / 90),
    tiltY: clampSigned(s.tiltYDeg / 90),
    tMs: s.tMs,
  };
}

export abstract class IsolatedStrokeLane implements BrushEngineLane {
  abstract readonly id: LaneId;
  abstract readonly label: string;
  abstract readonly kind: LaneKind;
  abstract readonly status: LaneStatus;
  abstract readonly engineVersion: string;

  protected width = 0;
  protected height = 0;
  private document: Float32Array | null = null;
  private clock: Clock | null = null;
  private active = false;
  private mapping: MypaintMapping | null = null;
  private lastReceipt: MypaintMappingReceipt | null = null;
  private acceptedSamples = 0;
  private frameIndex = 0;
  private frameTimes: number[] = [];
  private disposed = false;
  private readonly lifetime: LaneStats = emptyLaneStats();

  protected constructor(private readonly color: Rgba) {}

  /** 엔진이 색 설정을 읽는 색 공간(`mapProgramToMypaint`의 colorSpace). 기본 sRGB, 선형 합성 엔진(Hokusai)은 "linear"로 덮는다. */
  protected get colorSpace(): "srgb" | "linear" {
    return "srgb";
  }

  abstract probe(env: LaneEnvironment): Promise<LaneCapabilityReport>;

  /** 엔진 로드와 캔버스 한도 검사. 실패는 `LaneUnavailableError`로 던진다. */
  protected abstract prepareEngine(env: LaneEnvironment, config: LaneInit): Promise<void>;
  /** 격리 표면·브러시를 열고 시드를 준다. 실패하면 아무것도 열려 있지 않아야 한다. */
  protected abstract openStroke(mapping: MypaintMapping, seed: number): void;
  /** 표본을 엔진에 공급한다(엔진은 dab 수를 노출하지 않는다). */
  protected abstract pushSamples(samples: readonly EngineSample[]): void;
  /** 엔진의 끝맺음(꼬리 처리)을 하고 sRGB straight RGBA8 프레임(width×height×4)을 돌려준다. */
  protected abstract finishStroke(): Uint8Array;
  /** 열려 있는 표면·브러시를 해제한다(획 밖에서 불려도 안전해야 한다). */
  protected abstract closeStroke(): void;
  /** 레인 전체 자원 해제(dispose). */
  protected abstract releaseEngine(): void;

  async init(env: LaneEnvironment, config: LaneInit): Promise<void> {
    this.assertAlive("init");
    if (!Number.isInteger(config.width) || !Number.isInteger(config.height) || config.width <= 0 || config.height <= 0) {
      throw new RangeError(`${this.id}: invalid canvas ${config.width}×${config.height}`);
    }
    if (this.active) this.discardStroke();
    this.width = config.width;
    this.height = config.height;
    await this.prepareEngine(env, config);
    this.document = new Float32Array(config.width * config.height * 4);
    this.clock = env.clock;
  }

  /** 획 색은 `options.color`가 우선하고, 없으면 레인 생성 시 기본색(기본 검정)을 쓴다. */
  beginStroke(program: BrushProgram, seed: number, options?: StrokeOptions): void {
    const strokeColor = resolveStrokeColor(options) ?? this.color;
    this.requireDocument("beginStroke");
    if (this.active) throw new InvalidStateError("beginStroke: 이전 획이 endStroke되지 않았다");
    assertProgramSupported(this.id, program);
    const mapping = mapProgramToMypaint(program, { color: strokeColor, colorSpace: this.colorSpace });
    this.openStroke(mapping, seed >>> 0);
    this.mapping = mapping;
    this.lastReceipt = mapping.receipt;
    this.active = true;
    this.acceptedSamples = 0;
    this.frameIndex = 0;
    this.frameTimes = [];
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    this.requireDocument("addSamples");
    if (!this.active) throw new InvalidStateError("addSamples: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    const accepted: EngineSample[] = [];
    for (const s of samples) {
      if (s.source === "predicted") continue;
      accepted.push(toEngineSample(s));
    }
    if (accepted.length > 0) this.pushSamples(accepted);
    this.acceptedSamples += accepted.length;
    const dt = clock ? clock.now() - t0 : 0;
    this.frameTimes.push(dt);
    const receipt: DabBatchReceipt = {
      frameIndex: this.frameIndex,
      // 엔진이 dab 수를 노출하지 않아 엔진에 공급한 정본 표본 수를 dabCount로 쓴다(예측 표본 제외).
      dabCount: accepted.length,
      submitCount: 1,
      dispatchCount: 0,
      inputToSubmitMs: clock ? dt : null,
    };
    this.frameIndex += 1;
    return receipt;
  }

  async endStroke(): Promise<StrokeReceipt> {
    const doc = this.requireDocument("endStroke");
    const mapping = this.mapping;
    if (!this.active || !mapping) throw new InvalidStateError("endStroke: beginStroke 전에 호출됐다");
    const clock = this.clock;
    const t0 = clock ? clock.now() : 0;
    try {
      const frame = this.finishStroke();
      const tiles = compositeStraightFrame(doc, frame, this.width, this.height, mapping.compose.opacity, mapping.compose.blend);
      const dt = clock ? clock.now() - t0 : 0;
      this.frameTimes.push(dt);
      const receipt: StrokeReceipt = {
        dabCount: this.acceptedSamples,
        submitCount: this.frameIndex + 1,
        gpuTimeMs: null,
        timingSource: "unavailable",
        frameTimesMs: [...this.frameTimes],
        overflowDabs: 0,
        poolTilesUsed: tiles,
      };
      this.lifetime.strokes += 1;
      this.lifetime.dabs += this.acceptedSamples;
      this.lifetime.submits += receipt.submitCount;
      this.lifetime.lastReceipt = receipt;
      return receipt;
    } finally {
      // 마감이 어디서 실패해도 획 상태를 비운다: active가 남으면 다음 beginStroke가 영구히 막힌다. 문서는 합성 전까지 바뀌지 않았다.
      this.discardStroke();
    }
  }

  /**
   * 진행 중인 획을 버린다. 엔진은 격리 표면에 그리고 문서는 endStroke에서만 바뀌므로 표면만 해제하면 문서는 항상 보존된다.
   * 획 밖이면 no-op(멱등). `discardedDabs`는 버려진 표본 수다.
   */
  abortStroke(): StrokeAbortReceipt {
    this.assertAlive("abortStroke");
    if (!this.active) return noStrokeAbortReceipt();
    const discarded = this.acceptedSamples;
    this.discardStroke();
    return abortReceipt(discarded, true);
  }

  async readback(): Promise<LabImage> {
    return encodeLabImage(this.requireDocument("readback"), this.width, this.height);
  }

  /** 8비트 프레임에서 유도한 선형 premultiplied 문서(정밀도 8비트). */
  async readbackLinear(): Promise<Float32Array | null> {
    return new Float32Array(this.requireDocument("readbackLinear"));
  }

  /** 마지막 획의 프로그램 → 엔진 설정 매핑 영수증(반영하지 못한 기능·근사 목록). 획 전이면 null. */
  mappingReceipt(): MypaintMappingReceipt | null {
    return this.lastReceipt;
  }

  stats(): LaneStats {
    return { ...this.lifetime };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.document = null;
    this.clock = null;
    this.mapping = null;
    try {
      if (this.active) this.closeStroke();
    } finally {
      this.active = false;
      this.releaseEngine();
    }
  }

  private discardStroke(): void {
    this.active = false;
    this.mapping = null;
    this.acceptedSamples = 0;
    this.closeStroke();
  }

  private assertAlive(op: string): void {
    if (this.disposed) throw new InvalidStateError(`${op}: dispose된 레인이다`);
  }

  private requireDocument(op: string): Float32Array {
    this.assertAlive(op);
    if (!this.document) throw new InvalidStateError(`${op}: init 전에 호출됐다`);
    return this.document;
  }
}
