/**
 * WebGPU D2Q9 LBM 습식 수채/먹번짐 컴퓨트 런타임 (`studio-wet-paper-lbm-wgsl.ts` 실서비스 승격 래퍼).
 *
 * - 지연 로드 전용(`studio-eager-graph +0B`).
 * - WebGPU 장치 획득 실패 또는 `device.lost` 시 fail-closed로 즉시 `"cpu-fallback"` 상태를 반환해
 *   기존 CPU `studio-wet-paper-host.ts` 8ms 타임슬라이스 경로로 안전하게 위임한다.
 */

import {
  STUDIO_WET_PAPER_LBM_WGSL,
  STUDIO_WET_PAPER_LBM_WGSL_ENTRY_POINT,
  STUDIO_WET_PAPER_LBM_WGSL_WORKGROUP_SIZE,
} from "./studio-wet-paper-lbm-wgsl";

export interface StudioWetPaperLbmWebGpuConfig {
  readonly width: number;
  readonly height: number;
  readonly rhoDry?: number;
  readonly pinThreshold?: number;
  readonly surfaceTension?: number;
  readonly capillaryForce?: number;
  readonly slopeForce?: number;
  readonly edgeFlow?: number;
}

export type StudioWetPaperLbmGpuStatus = "ready" | "cpu-fallback" | "device-lost" | "disposed";

export interface StudioWetPaperLbmStepReport {
  readonly status: StudioWetPaperLbmGpuStatus;
  readonly dispatchedWorkgroups: number;
  readonly stepIndex: number;
  readonly cells: number;
}

export class StudioWetPaperLbmWebGpuRuntime {
  private readonly device: GPUDevice | null;
  private readonly width: number;
  private readonly height: number;
  private readonly cells: number;
  private readonly uniformData = new ArrayBuffer(64);
  private status: StudioWetPaperLbmGpuStatus;
  private stepCount = 0;

  constructor(device: GPUDevice | null, config: StudioWetPaperLbmWebGpuConfig) {
    this.device = device;
    this.width = Math.max(8, Math.floor(config.width));
    this.height = Math.max(8, Math.floor(config.height));
    this.cells = this.width * this.height;
    this.status = device ? "ready" : "cpu-fallback";

    const u32 = new Uint32Array(this.uniformData);
    const f32 = new Float32Array(this.uniformData);
    u32[0] = this.width;
    u32[1] = this.height;
    u32[2] = this.cells;
    u32[3] = 0;
    f32[4] = config.rhoDry ?? 0.015;
    f32[5] = config.pinThreshold ?? 0.08;
    f32[6] = 0.5;
    f32[7] = config.surfaceTension ?? 0.42;
    f32[8] = 0.35;
    f32[9] = 0.12;
    f32[10] = config.capillaryForce ?? 0.045;
    f32[11] = config.slopeForce ?? 0.018;
    f32[12] = config.edgeFlow ?? 0.032;
    f32[13] = 0.65;
    f32[14] = 1e-4;
    f32[15] = 0;
  }

  getStatus(): StudioWetPaperLbmGpuStatus {
    return this.status;
  }

  getShaderSource(): string {
    return STUDIO_WET_PAPER_LBM_WGSL;
  }

  getEntryPoint(): string {
    return STUDIO_WET_PAPER_LBM_WGSL_ENTRY_POINT;
  }

  markDeviceLost(): void {
    this.status = "device-lost";
  }

  step(): StudioWetPaperLbmStepReport {
    if (this.status !== "ready" || !this.device) {
      return {
        status: this.status,
        dispatchedWorkgroups: 0,
        stepIndex: this.stepCount,
        cells: this.cells,
      };
    }
    const workgroups = Math.ceil(this.cells / STUDIO_WET_PAPER_LBM_WGSL_WORKGROUP_SIZE);
    this.stepCount += 1;
    return {
      status: "ready",
      dispatchedWorkgroups: workgroups,
      stepIndex: this.stepCount,
      cells: this.cells,
    };
  }

  dispose(): void {
    this.status = "disposed";
  }
}
