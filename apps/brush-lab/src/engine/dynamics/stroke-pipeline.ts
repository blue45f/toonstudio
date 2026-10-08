import { DabBatch } from "../core/dab-layout";
import { StrokeBudgetExceededError } from "../core/errors";
import { InputPipeline, resolveInputConfig } from "../input/input-pipeline";
import { PHYSICS_DT_MS, PhysicsModel } from "../physics/physics-model";

import { DabEmitter, MIN_SPACING_PX } from "./dab-emitter";

import type { DabEmitterOptions } from "./dab-emitter";
import type { ContactFootprint, ModeledSample, PreviewSample, RawSample } from "../core/types";
import type { InputPipelineConfig, LatencyRecord } from "../input/input-pipeline";
import type { BrushProgram } from "../presets/program-schema";
import type { PaperField } from "../texture/paper-grain";

/**
 * 모든 레인이 공유하는 프론트엔드(platform-baseline 제외):
 * RawSample → InputPipeline → PhysicsModel(고정 dt) → DabEmitter → DabBatch.
 */
/**
 * 한 프레임(push/finish 1회) 배치가 가질 수 있는 dab 용량 상한(64 B × 262144 = 16 MiB).
 * 보수적 추정(간격 하한 0.125 px)으로 약 32,000 px를 한 프레임에 건너뛰는 입력이 한계이며, 그 이상은 입력 오류로 보고
 * dab를 만들기 전에 거부한다(상한이 없으면 5,000,000 px 도약 하나가 방출 루프를 수 초(Node 실측 6.4 s) 돌리고, 더 큰 도약은 할당에 실패하거나 사실상 멈춘다).
 * `StrokePipeline`은 획마다 새로 만들어지므로(레인의 `beginStroke`) `lastPos`·`lastT`는 획 사이에 새지 않고, 획 도중 `abortStroke`는 파이프라인을 버린다.
 */
export const MAX_FRAME_DAB_CAPACITY = 262144;

export interface StrokePipelineStats {
  samplesIn: number;
  samplesCommitted: number;
  dabsEmitted: number;
  latency: readonly LatencyRecord[];
}

export class StrokePipeline {
  private readonly program: BrushProgram;
  private readonly input: InputPipeline;
  private readonly physics: PhysicsModel;
  private readonly emitter: DabEmitter;
  private readonly dual: boolean;
  private lastT: number | null = null;
  /** 직전 프레임의 마지막 표본 위치. 프레임 경계 구간(직전 위치 → 이번 프레임 첫 표본)의 길이를 용량 추정에 포함하려고 유지한다. */
  private lastPos: { x: number; y: number } | null = null;
  private samplesIn = 0;
  private samplesCommitted = 0;
  private dabsEmitted = 0;

  constructor(
    program: BrushProgram,
    seed: number,
    inputConfig?: Partial<InputPipelineConfig>,
    paper: PaperField | null = null,
    opts: DabEmitterOptions = {},
  ) {
    this.program = program;
    const cfg = resolveInputConfig({ ...program.input, ...inputConfig });
    this.input = new InputPipeline(cfg);
    this.physics = new PhysicsModel(program.physics, paper, seed, {
      tipRadiusPx: program.tip.sizePx / 2,
      paperSpec: program.paper.enabled ? program.paper : null,
    });
    this.emitter = new DabEmitter(program, seed, opts);
    this.dual = program.deposition.dual !== null;
  }

  /** 이 호출(프레임)에서 방출된 dab. */
  push(raw: readonly RawSample[]): DabBatch {
    this.samplesIn += raw.length;
    const { committed } = this.input.push(raw);
    return this.emitSamples(committed, false);
  }

  preview(): PreviewSample[] {
    return this.input.preview();
  }

  finish(): DabBatch {
    const tail = this.input.finish();
    return this.emitSamples(tail, true);
  }

  stats(): StrokePipelineStats {
    return {
      samplesIn: this.samplesIn,
      samplesCommitted: this.samplesCommitted,
      dabsEmitted: this.dabsEmitted,
      latency: this.input.latency(),
    };
  }

  private emitSamples(samples: ModeledSample[], final: boolean): DabBatch {
    this.samplesCommitted += samples.length;
    const footprints: ContactFootprint[] = [];
    let pathLen = 0;
    let spanMs = 0;
    // 이전 프레임의 마지막 위치에서 시작한다: 프레임당 표본이 1개인 빠른 획도 표본 사이 간격이 경로 길이에 잡힌다.
    let prevX: number | null = this.lastPos?.x ?? null;
    let prevY = this.lastPos?.y ?? 0;
    for (const s of samples) {
      const dt = this.lastT === null ? PHYSICS_DT_MS : Math.max(0, s.tMs - this.lastT);
      this.lastT = s.tMs;
      spanMs += dt;
      footprints.push(this.physics.step(s, dt));
      if (prevX !== null) pathLen += Math.hypot(s.x - prevX, s.y - prevY);
      prevX = s.x;
      prevY = s.y;
      this.lastPos = { x: s.x, y: s.y };
    }
    // 보류 중인 끝 테이퍼 dab·시간 기반 dab까지 담을 수 있게 넉넉히 잡는다.
    // 적응 간격(반경이 10 % 넘게 변하면 간격 0.5배)이 실제 간격을 절반까지 줄이므로 하한도 0.5배로 잡는다.
    const spacingFloor = Math.max(MIN_SPACING_PX, this.program.deposition.spacing * 0.05) * 0.5;
    const timeDabs = Math.ceil((spanMs * this.program.deposition.timeDabsPerSecond) / 1000) + samples.length;
    const estimate = Math.ceil(pathLen / spacingFloor) + samples.length + timeDabs + 64;
    const extra = final ? Math.ceil(this.program.edge.taperEndPx / spacingFloor) + 16 : 0;
    const capacity = (estimate + extra) * (this.dual ? 2 : 1);
    if (!Number.isFinite(capacity) || capacity > MAX_FRAME_DAB_CAPACITY) {
      throw new StrokeBudgetExceededError(Number.isFinite(capacity) ? capacity : Number.MAX_SAFE_INTEGER, MAX_FRAME_DAB_CAPACITY, {
        stage: "stroke-pipeline",
        pathLenPx: pathLen,
        reasonKo: `한 프레임에 ${Math.round(pathLen)}px를 건너뛰는 비정상 입력이라 dab 배치 상한(${MAX_FRAME_DAB_CAPACITY}개)을 넘어 거부했다`,
      });
    }
    const batch = new DabBatch(capacity);
    let n = this.emitter.emit(samples, footprints, batch);
    if (final) n += this.emitter.end(batch);
    if (batch.count >= batch.capacity && n > 0) {
      throw new StrokeBudgetExceededError(batch.count + 1, batch.capacity, { stage: "stroke-pipeline" });
    }
    this.dabsEmitted += n;
    return batch;
  }
}
