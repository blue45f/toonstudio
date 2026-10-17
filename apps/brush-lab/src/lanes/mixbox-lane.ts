/**
 * Mixbox math-only(수식만) 레인(미등록, Phase 2).
 * mixbox-compat(KM mixer 기반 mixboxLerp)만 사용하며, mixbox 패키지는
 * import·번들 금지(license-policy.md 4.5절). 원본 mixbox 코드는 포팅하지 않는다.
 * registry.ts에는 등록하지 않는다(별도 PR로 등록). Node 환경에서 Lane 계약과
 * 수식 혼색만 검증한다.
 */

import { SumiError } from "../engine/core/errors";
import { mixboxLerp, type RGBA } from "../engine/pigment/mixbox-compat";

import {
  abortReceipt,
  emptyLaneStats,
  noStrokeAbortReceipt,
  resolveStrokeColor,
  supportedReport,
  type BrushEngineLane,
  type DabBatchReceipt,
  type LaneCapabilityReport,
  type LaneEnvironment,
  type LaneInit,
  type LaneId,
  type LaneKind,
  type LaneStatus,
  type LaneStats,
  type StrokeAbortReceipt,
  type StrokeOptions,
  type StrokeReceipt,
} from "./lane";

import type { LabImage, RawSample } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

export const MIXBOX_LANE_ID = "mixbox" as LaneId;

export class MixboxLane implements BrushEngineLane {
  readonly id = MIXBOX_LANE_ID;
  readonly label = "Mixbox math-only(수식만)";
  readonly kind: LaneKind = "comparison";
  readonly status: LaneStatus = "implemented";
  readonly engineVersion = "mixbox-compat-1";

  private env: LaneEnvironment | null = null;
  private width = 0;
  private height = 0;
  private seed = 0;
  private prevTMs = -1;
  private canvas: Float32Array | null = null;
  private strokeCanvas: Float32Array | null = null;
  private currentColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  private active = false;
  private dabCount = 0;
  private submitCount = 0;
  private laneStats: LaneStats = emptyLaneStats();

  async probe(_env: LaneEnvironment): Promise<LaneCapabilityReport> {
    // 개념 전용 레인은 GPU·DOM 없이도 항상 구조화 결과를 돌려준다(throw 없음).
    return supportedReport(MIXBOX_LANE_ID);
  }

  async init(_env: LaneEnvironment, init: LaneInit): Promise<void> {
    this.width = init.width;
    this.height = init.height;
    this.seed = init.seed;
    this.prevTMs = -1;
    this.canvas = new Float32Array(init.width * init.height * 4);
    this.currentColor = [0, 0, 0, 1];
    this.active = false;
    this.dabCount = 0;
    this.submitCount = 0;
    this.laneStats = emptyLaneStats();
  }

  beginStroke(_program: BrushProgram, _seed: number, options?: StrokeOptions): void {
    if (this.canvas === null) {
      throw new SumiError("md-invalid-state", "init 먼저 호출해야 한다", { laneId: this.id });
    }
    this.active = true;
    this.prevTMs = -1;
    this.strokeCanvas = this.canvas.slice();
    this.currentColor = resolveStrokeColor({ color: options?.color }) ?? [0, 0, 0, 1];
  }

  addSamples(samples: readonly RawSample[]): DabBatchReceipt {
    if (!this.active || this.canvas === null) {
      throw new SumiError("md-invalid-state", "beginStroke 먼저 호출해야 한다", { laneId: this.id });
    }
    let frameDabs = 0;
    for (const sample of samples) {
      const x = Math.round(sample.x);
      const y = Math.round(sample.y);
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
      const base = (y * this.width + x) * 4;
      const canvasColor: RGBA = [
        this.canvas[base],
        this.canvas[base + 1],
        this.canvas[base + 2],
        this.canvas[base + 3],
      ];
      const blended = mixboxLerp(canvasColor, this.currentColor, sample.pressure);
      this.canvas[base] = blended[0];
      this.canvas[base + 1] = blended[1];
      this.canvas[base + 2] = blended[2];
      this.canvas[base + 3] = blended[3];
      frameDabs += 1;
    }
    this.dabCount += frameDabs;
    this.submitCount += 1;
    return {
      frameIndex: this.laneStats.strokes,
      dabCount: frameDabs,
      submitCount: this.submitCount,
      dispatchCount: 1,
      inputToSubmitMs: null,
    };
  }

  async endStroke(): Promise<StrokeReceipt> {
    if (!this.active) {
      throw new SumiError("md-invalid-state", "진행 중인 획이 없다", { laneId: this.id });
    }
    this.active = false;
    const receipt: StrokeReceipt = {
      dabCount: this.dabCount,
      submitCount: this.submitCount,
      gpuTimeMs: null,
      timingSource: "unavailable",
      frameTimesMs: [],
      overflowDabs: 0,
      poolTilesUsed: 0,
    };
    this.strokeCanvas = null;
    return receipt;
  }

  abortStroke(): StrokeAbortReceipt {
    if (!this.active) return noStrokeAbortReceipt();
    const discarded = this.dabCount;
    // 진행 중인 획은 문서에 합성되지 않았다: beginStroke 시점 스냅샷을 복원한다.
    this.canvas = this.strokeCanvas ?? this.canvas;
    this.strokeCanvas = null;
    this.active = false;
    this.dabCount = 0;
    this.submitCount = 0;
    return abortReceipt(discarded, true, "사용자 취소(진행 중인 획 버림)");
  }

  async readbackLinear(): Promise<Float32Array | null> {
    // 개념 레인은 선형 프레임 버퍼를 별도로 두지 않는다.
    return null;
  }

  async readback(): Promise<LabImage> {
    if (this.canvas === null) {
      throw new SumiError("md-invalid-state", "init 먼저 호출해야 한다", { laneId: this.id });
    }
    const data = new Uint8ClampedArray(this.canvas.length);
    for (let i = 0; i < this.canvas.length; i += 1) {
      let v = this.canvas[i] * 255;
      if (v < 0) v = 0;
      else if (v > 255) v = 255;
      data[i] = Math.round(v);
    }
    return { width: this.width, height: this.height, data };
  }

  stats(): LaneStats {
    return {
      ...this.laneStats,
      strokes: this.active ? 1 : 0,
      dabs: this.dabCount,
      submits: this.submitCount,
      lastReceipt: null,
    };
  }

  dispose(): void {
    this.env = null;
    this.canvas = null;
    this.strokeCanvas = null;
    this.active = false;
    this.dabCount = 0;
    this.submitCount = 0;
    this.laneStats = emptyLaneStats();
  }
}
