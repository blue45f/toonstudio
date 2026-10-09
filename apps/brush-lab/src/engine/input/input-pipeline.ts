import { calibratePressure, DEVICE_PROFILES, tiltToSpherical } from "./calibration";
import {
  adaptiveCutoff,
  CORNER_HOLD_CUTOFF_SCALE,
  CORNER_HOLD_SAMPLES,
  CornerDetector,
  CornerGuard,
  shouldSuppressPrediction,
  VERTEX_BACKFILL_MIN_PX,
  VERTEX_MIN_WINDOW_MS,
  VERTEX_VELOCITY_CAP_RATIO,
  vertexEmitTimeMs,
} from "./corner-preserve";
import { OneEuroFilter } from "./one-euro";
import { predictSamples } from "./predictor";

import type { DeviceProfile } from "./calibration";
import type { OneEuroParams } from "./one-euro";
import type { ModeledSample, PreviewSample, RawSample } from "../core/types";

/**
 * 입력 파이프라인 설정. 프리셋은 `Partial<InputPipelineConfig>`로 일부만 덮어쓴다.
 */
export interface InputPipelineConfig {
  profile: DeviceProfile;
  oneEuro: { position: OneEuroParams; pressure: OneEuroParams; tilt: OneEuroParams };
  cornerPreserve: {
    enabled: boolean;
    curvatureGain: number;
    slowSpeedPxPerMs: number;
    slowCutoffScale: number;
    /** 이 곡률(1/px)을 넘는 표본은 정점으로 보고 raw 좌표에 고정한다. */
    cornerCurvature: number;
  };
  prediction: { enabled: boolean; horizonMs: number };
  /** 속도 EMA 계수 0..1(0 = 평활 없음). */
  velocitySmoothing: number;
  /** pen-up 시 잔여 필터 지연을 N샘플로 해소. 마지막 샘플은 raw pen-up 좌표. */
  endpointTailSamples: number;
}

export const DEFAULT_INPUT_CONFIG: InputPipelineConfig = {
  profile: DEVICE_PROFILES.generic,
  oneEuro: {
    position: { minCutoff: 1.0, beta: 0.015, dCutoff: 1.0 },
    pressure: { minCutoff: 5.0, beta: 0.02, dCutoff: 1.0 },
    tilt: { minCutoff: 2.0, beta: 0.01, dCutoff: 1.0 },
  },
  cornerPreserve: {
    enabled: true,
    curvatureGain: 12,
    slowSpeedPxPerMs: 0.05,
    slowCutoffScale: 0.5,
    cornerCurvature: 0.35,
  },
  prediction: { enabled: true, horizonMs: 8 },
  velocitySmoothing: 0.5,
  endpointTailSamples: 3,
};

/** 프리셋의 부분 설정을 기본값 위에 얹는다(얕은 병합 + 중첩 객체 병합). */
export function resolveInputConfig(partial: Partial<InputPipelineConfig> | undefined): InputPipelineConfig {
  if (!partial) return DEFAULT_INPUT_CONFIG;
  return {
    profile: partial.profile ?? DEFAULT_INPUT_CONFIG.profile,
    oneEuro: { ...DEFAULT_INPUT_CONFIG.oneEuro, ...partial.oneEuro },
    cornerPreserve: { ...DEFAULT_INPUT_CONFIG.cornerPreserve, ...partial.cornerPreserve },
    prediction: { ...DEFAULT_INPUT_CONFIG.prediction, ...partial.prediction },
    velocitySmoothing: partial.velocitySmoothing ?? DEFAULT_INPUT_CONFIG.velocitySmoothing,
    endpointTailSamples: partial.endpointTailSamples ?? DEFAULT_INPUT_CONFIG.endpointTailSamples,
  };
}

export interface LatencyRecord {
  inputTMs: number;
  modeledTMs: number;
}

interface RawPoint {
  x: number;
  y: number;
  tMs: number;
}

/**
 * 원시 입력 → 정본 `ModeledSample` 스트림.
 * - `source === "predicted"` 입력은 폐기한다.
 * - down 표본과 모서리 직후 표본(정점 통과점)은 raw 좌표에 고정한다. 모서리는 회전각 ≥ 60°와
 *   직전 방향 일관성으로 판정해 손떨림을 모서리로 오인하지 않는다(`CornerDetector`).
 * - up 표본은 보류했다가 `finish()`에서 endpoint tail로 해소한다(마지막 좌표 = raw up).
 */
export class InputPipeline {
  private readonly config: InputPipelineConfig;
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fp: OneEuroFilter;
  private readonly fAlt: OneEuroFilter;
  private readonly fAz: OneEuroFilter;
  private readonly corner = new CornerDetector();
  /** 정점 재방출을 인정할지 정하는 최근 창 속도·변 길이 가드(한 걸음 순간 속도는 잡음에 오탐한다). */
  private readonly guard = new CornerGuard<RawSample>();
  private lastRaw: RawPoint | null = null;
  private cornerHold = 0;
  private committed: ModeledSample[] = [];
  private latencyRecords: LatencyRecord[] = [];
  private pendingUp: RawSample | null = null;
  private velocity = 0;
  private dirX = 1;
  private dirY = 0;
  private finished = false;
  /** 이번 표본에서 model()이 만든 정점 재방출 표본(없으면 null). push()가 소비한다. */
  private vertexOut: ModeledSample | null = null;

  constructor(config: InputPipelineConfig = DEFAULT_INPUT_CONFIG) {
    this.config = config;
    this.fx = new OneEuroFilter(config.oneEuro.position);
    this.fy = new OneEuroFilter(config.oneEuro.position);
    this.fp = new OneEuroFilter(config.oneEuro.pressure);
    this.fAlt = new OneEuroFilter(config.oneEuro.tilt);
    this.fAz = new OneEuroFilter(config.oneEuro.tilt);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fp.reset();
    this.fAlt.reset();
    this.fAz.reset();
    this.corner.reset();
    this.guard.reset();
    this.lastRaw = null;
    this.cornerHold = 0;
    this.committed = [];
    this.latencyRecords = [];
    this.pendingUp = null;
    this.velocity = 0;
    this.dirX = 1;
    this.dirY = 0;
    this.finished = false;
    this.vertexOut = null;
  }

  push(raw: readonly RawSample[]): { committed: ModeledSample[]; preview: PreviewSample[] } {
    if (this.finished) this.reset();
    const out: ModeledSample[] = [];
    let batchEndT = Number.NEGATIVE_INFINITY;
    for (const s of raw) {
      if (s.source === "predicted") continue;
      if (s.tMs > batchEndT) batchEndT = s.tMs;
    }
    for (let i = 0; i < raw.length; i += 1) {
      const s = raw[i];
      if (!s || s.source === "predicted") continue;
      if (s.phase === "up") {
        this.pendingUp = s;
        continue;
      }
      if (s.phase === "down") {
        this.reset();
      }
      const sample = this.model(s, i);
      const vertex = this.vertexOut;
      if (vertex) {
        // model()이 이미 committed에 넣었다. 출력 순서는 정점 → 모서리 직후 표본.
        out.push(vertex);
        this.latencyRecords.push({ inputTMs: vertex.inputTMs, modeledTMs: batchEndT });
        this.vertexOut = null;
      }
      this.committed.push(sample);
      out.push(sample);
      this.latencyRecords.push({ inputTMs: s.tMs, modeledTMs: batchEndT });
    }
    const preview = this.preview();
    return { committed: out, preview };
  }

  /** 예측 표본(표시 전용). 모서리·저속에서는 빈 배열. */
  preview(): PreviewSample[] {
    if (!this.config.prediction.enabled || this.committed.length === 0 || this.pendingUp) return [];
    const last = this.committed[this.committed.length - 1];
    if (!last) return [];
    if (
      shouldSuppressPrediction(
        last.curvature,
        last.velocity,
        this.config.cornerPreserve.cornerCurvature,
        this.config.cornerPreserve.slowSpeedPxPerMs,
      )
    ) {
      return [];
    }
    return predictSamples(this.committed, this.config.prediction.horizonMs, 2);
  }

  /**
   * endpoint tail. 마지막 정본 위치에서 raw up 좌표로 N샘플에 걸쳐 수렴하며
   * 마지막 샘플은 정확히 raw up 좌표(phase "up")다.
   */
  finish(): ModeledSample[] {
    if (this.finished) return [];
    this.finished = true;
    const last = this.committed[this.committed.length - 1];
    const up = this.pendingUp;
    if (!last && !up) return [];
    const target: RawSample | null = up ?? null;
    const endX = target ? target.x : (last?.x ?? 0);
    const endY = target ? target.y : (last?.y ?? 0);
    const endT = target ? target.tMs : (last?.tMs ?? 0);
    const endPressure = last ? last.pressure : 0;
    const startX = last ? last.x : endX;
    const startY = last ? last.y : endY;
    const startT = last ? last.tMs : endT;
    const n = Math.max(1, Math.floor(this.config.endpointTailSamples));
    const tail: ModeledSample[] = [];
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const isLast = i === n;
      const x = isLast ? endX : startX + (endX - startX) * t;
      const y = isLast ? endY : startY + (endY - startY) * t;
      const tMs = startT + (endT - startT) * t;
      const pressure = endPressure * (1 - t);
      tail.push({
        x,
        y,
        tMs,
        inputTMs: target ? target.tMs : tMs,
        pressure,
        velocity: last ? last.velocity : 0,
        altitudeDeg: last ? last.altitudeDeg : 90,
        azimuthDeg: last ? last.azimuthDeg : 0,
        twistDeg: last?.twistDeg,
        dirX: this.dirX,
        dirY: this.dirY,
        curvature: 0,
        phase: isLast ? "up" : "move",
        source: target ? (target.source === "coalesced" ? "coalesced" : "raw") : "raw",
        sourceIndex: 0,
      });
      this.latencyRecords.push({ inputTMs: target ? target.tMs : tMs, modeledTMs: endT });
    }
    this.committed.push(...tail);
    return tail;
  }

  latency(): readonly LatencyRecord[] {
    return this.latencyRecords;
  }

  /**
   * 정점 재방출: 모서리는 정점 다음 표본에서야 판정되므로 직전 raw 점(= 정점)은 이미 1€로 필터링돼 지연된 위치로 나갔다.
   * 그 점을 raw 좌표 그대로 한 번 더 내보내 출력 경로가 정점을 지나게 한다(지연된 출력은 진입 변 위에 있으므로 진입 변과 겹친다).
   * 시각은 밀린 거리를 raw 속도로 따라잡는 시간(`vertexEmitTimeMs`)으로 둔다.
   */
  private backfillVertex(s: RawSample, prevRaw: RawPoint | null, rawSpeed: number, sourceIndex: number): void {
    const last = this.committed[this.committed.length - 1];
    if (!prevRaw || !last || !this.guard.approve(prevRaw, null)) return;
    const backlog = Math.hypot(prevRaw.x - last.x, prevRaw.y - last.y);
    if (backlog < VERTEX_BACKFILL_MIN_PX) return;
    // 정점을 끼울 (직전 출력, 이 표본) 시각 구간이 없으면(같은 tMs·역행) 건너뛴다. 끼우면 정점 시각이 직전 출력보다 앞서고 속도가 튄다.
    const tMs = vertexEmitTimeMs(last.tMs, s.tMs, backlog, rawSpeed);
    if (tMs === null) return;
    const dt = tMs - last.tMs;
    const inst = Math.min(backlog / dt, VERTEX_VELOCITY_CAP_RATIO * rawSpeed);
    const k = this.config.velocitySmoothing;
    const velocity = k > 0 ? this.velocity + (1 - k) * (inst - this.velocity) : inst;
    this.dirX = (prevRaw.x - last.x) / backlog;
    this.dirY = (prevRaw.y - last.y) / backlog;
    this.velocity = velocity;
    const vertex: ModeledSample = {
      ...last,
      x: prevRaw.x,
      y: prevRaw.y,
      tMs,
      inputTMs: prevRaw.tMs,
      velocity,
      dirX: this.dirX,
      dirY: this.dirY,
      curvature: 0,
      phase: "move",
      source: s.source === "coalesced" ? "coalesced" : "raw",
      sourceIndex,
    };
    this.committed.push(vertex);
    this.vertexOut = vertex;
  }

  private model(s: RawSample, sourceIndex: number): ModeledSample {
    const cfg = this.config;
    const isDown = s.phase === "down";
    // 속도(raw 기준)와 잡음 게이트를 거친 곡률·모서리 판정으로 적응 차단 주파수 결정
    const prevRaw = this.lastRaw;
    let rawSpeed = 0;
    if (prevRaw) {
      const dt = s.tMs - prevRaw.tMs;
      rawSpeed = dt > 0 ? Math.hypot(s.x - prevRaw.x, s.y - prevRaw.y) / dt : this.velocity;
    }
    const verdict = this.corner.push(s);
    const curvature = verdict.curvature;
    let posParams: OneEuroParams = cfg.oneEuro.position;
    let snapToRaw = isDown;
    if (cfg.cornerPreserve.enabled) {
      posParams = adaptiveCutoff(cfg.oneEuro.position, curvature, rawSpeed, cfg.cornerPreserve);
      if (verdict.isCorner) {
        snapToRaw = true;
        this.cornerHold = CORNER_HOLD_SAMPLES;
        this.backfillVertex(s, prevRaw, rawSpeed, sourceIndex);
      } else if (this.cornerHold > 0) {
        this.cornerHold -= 1;
        posParams = { ...posParams, minCutoff: posParams.minCutoff * CORNER_HOLD_CUTOFF_SCALE };
      }
    }
    this.fx.setParams(posParams);
    this.fy.setParams(posParams);
    let x = this.fx.filter(s.x, s.tMs);
    let y = this.fy.filter(s.y, s.tMs);
    if (snapToRaw) {
      x = s.x;
      y = s.y;
      // 정점 고정 후 필터 내부 상태도 raw로 맞춰 다음 표본이 정점에서 출발하게 한다.
      this.fx.reset();
      this.fy.reset();
      this.fx.filter(s.x, s.tMs);
      this.fy.filter(s.y, s.tMs);
    }
    this.lastRaw = { x: s.x, y: s.y, tMs: s.tMs };
    this.guard.record(s);

    const pressureCal = calibratePressure(s.pressure, cfg.profile);
    const pressure = this.fp.filter(pressureCal, s.tMs);
    const sph = tiltToSpherical(
      s.tiltXDeg + cfg.profile.tiltXOffsetDeg,
      s.tiltYDeg + cfg.profile.tiltYOffsetDeg,
    );
    const altitudeDeg = this.fAlt.filter(sph.altitudeDeg, s.tMs);
    const azimuthDeg = this.fAz.filter(sph.azimuthDeg, s.tMs);

    const last = this.committed[this.committed.length - 1];
    let velocity = 0;
    if (last) {
      const dt = s.tMs - last.tMs;
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      let inst = dt > 0 ? dist / dt : this.velocity;
      if (verdict.isCorner) {
        // 모서리 표본: 직전 출력과의 시각 간격이 없거나(재방출을 건너뛴 같은 tMs) 극히 짧으면 구간 속도가 시각 잡음이다.
        inst = dt >= VERTEX_MIN_WINDOW_MS ? Math.min(inst, VERTEX_VELOCITY_CAP_RATIO * Math.max(rawSpeed, this.velocity)) : this.velocity;
      }
      const k = cfg.velocitySmoothing;
      velocity = k > 0 ? this.velocity + (1 - k) * (inst - this.velocity) : inst;
      if (dist > 1e-6) {
        this.dirX = dx / dist;
        this.dirY = dy / dist;
      }
    }
    this.velocity = velocity;
    return {
      x,
      y,
      tMs: s.tMs,
      inputTMs: s.tMs,
      pressure: pressure < 0 ? 0 : pressure > 1 ? 1 : pressure,
      velocity,
      altitudeDeg,
      azimuthDeg,
      twistDeg: s.twistDeg,
      dirX: this.dirX,
      dirY: this.dirY,
      curvature,
      phase: s.phase,
      source: s.source === "coalesced" ? "coalesced" : "raw",
      sourceIndex,
    };
  }
}
