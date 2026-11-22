/**
 * WebGPU 7밴드 분광 브러시 질감 극대화 7대 파이프라인 통합 진입점.
 *
 * 1. 3-주파수 멀티스케일 절차적 종이 높이장 + 틸트·필압 비선형 접촉 + MIP 샘플러
 * 2. 실시간 임파스토 높이장 범프/노멀 셰이딩 & 30° 측면 자연광 WGSL + CPU 동등 엔진
 * 3. 건·습 하이브리드(습윤층 위 건식 긁힘 Sgraffito · 마른 밑칠 높이장 위 덧칠 Relief 계승)
 * 4. 속도·필압 이방성 갈필(Dry-Brush Split) + 저속 강필압 종이 결 방향 입자 산란
 * 5. 7밴드 Kubelka-Munk 입자 비중 차 이원 과립화(Dual-Pigment Granulation)
 * 6. 8~16채널 가상 붓모 픽업(Dirty Bristle Pickup) 교차 스트로크 모델
 * 7. 필압·속도·매체 연동 ₩0 WebAudio 절차적 마찰음 합성기
 */

import {
  DUAL_GRANULATION_PIGMENT_PRESETS,
  evaluateAnisotropicDryBrushStamp,
  evaluateDualPigmentGranulationKm7,
  stepBristleBankCrossStroke,
  type AnisotropicDryBrushResult,
  type BristleBankStepResult,
  type DualPigmentGranulationResult,
  type GranulatingPigmentSpec,
  type MultiChannelBristleBank,
} from "./anisotropic-bristle-pickup";
import {
  computeBrushFrictionSynthParams,
  type BrushFrictionAcousticParams,
  type BrushFrictionMediumId,
} from "./brush-friction-audio-synth";
import {
  computeOverpaintReliefInheritance,
  type OverpaintReliefResult,
} from "./impasto-raking-light-wgsl";
import {
  evaluatePaperContactTransfer,
  sampleMultiscalePaperMip,
  type MultiscalePaperMipSample,
  type MultiscalePaperTile,
  type PaperContactTransferResult,
} from "./multiscale-paper-tooth";
import type { Km7Rgb01 } from "../../render/studio-webgpu-km7-spectral-core";

export * from "./multiscale-paper-tooth";
export * from "./impasto-raking-light-wgsl";
export * from "./anisotropic-bristle-pickup";
export * from "./brush-friction-audio-synth";

export interface BrushTextureMaxStepInput {
  readonly paperTile: MultiscalePaperTile;
  readonly u: number;
  readonly v: number;
  readonly zoomScale: number;
  readonly tiltRad: number;
  readonly pressure: number;
  readonly strokeSpeed: number;
  readonly strokeAngleRad: number;
  readonly paintReserve: number;
  readonly wetness: number;
  readonly dryUnderHeight: number;
  readonly paintViscosity: number;
  readonly radialEdge01: number;
  readonly stampCoordU: number;
  readonly stampCoordV: number;
  readonly medium: BrushFrictionMediumId;
  readonly bristleBank: MultiChannelBristleBank;
  readonly canvasSrgbPerStrand: readonly Km7Rgb01[];
  readonly canvasWetnessPerStrand: readonly number[];
  readonly heavyPigment?: GranulatingPigmentSpec;
  readonly lightPigment?: GranulatingPigmentSpec;
  readonly masterAudioVolume?: number;
}

export interface BrushTextureMaxStepResult {
  readonly paperSample: MultiscalePaperMipSample;
  readonly contactTransfer: PaperContactTransferResult;
  readonly dryBrushStamp: AnisotropicDryBrushResult;
  readonly dualGranulation: DualPigmentGranulationResult;
  readonly bristleStep: BristleBankStepResult;
  readonly overpaintRelief: OverpaintReliefResult;
  readonly frictionAudio: BrushFrictionAcousticParams;
}

/**
 * 7대 브러시 질감 파이프라인을 단일 스트로크 스텝에서 통합 평가한다.
 */
export function evaluateBrushTextureMaxStep(
  input: BrushTextureMaxStepInput,
): BrushTextureMaxStepResult {
  const paperSample = sampleMultiscalePaperMip(input.paperTile, input.u, input.v, input.zoomScale);
  const contactTransfer = evaluatePaperContactTransfer({
    paperHeight: paperSample.height,
    tiltRad: input.tiltRad,
    pressure: input.pressure,
    pigmentLoad: input.paintReserve,
  });

  const dryBrushStamp = evaluateAnisotropicDryBrushStamp({
    strokeSpeed: input.strokeSpeed,
    pressure: input.pressure,
    paintReserve: input.paintReserve,
    strokeAngleRad: input.strokeAngleRad,
    bristleCount: input.bristleBank.strandCount,
    paperHeight: paperSample.height,
    paperGrainDirX: paperSample.grainDirX,
    paperGrainDirY: paperSample.grainDirY,
    stampCoordU: input.stampCoordU,
    stampCoordV: input.stampCoordV,
  });

  const fallbackPair = DUAL_GRANULATION_PIGMENT_PRESETS["mineral-dusk"];
  const heavyPigment = input.heavyPigment ?? fallbackPair.heavyPigment;
  const lightPigment = input.lightPigment ?? fallbackPair.lightPigment;
  const dualGranulation = evaluateDualPigmentGranulationKm7({
    heavyPigment,
    lightPigment,
    paperHeight: paperSample.height,
    radialEdge01: input.radialEdge01,
    wetness: input.wetness,
  });

  const paperHeights: number[] = [];
  for (let i = 0; i < input.bristleBank.strandCount; i += 1) {
    paperHeights.push(paperSample.height);
  }
  const bristleStep = stepBristleBankCrossStroke(input.bristleBank, {
    canvasSrgbPerStrand: input.canvasSrgbPerStrand,
    canvasWetnessPerStrand: input.canvasWetnessPerStrand,
    paperHeightPerStrand: paperHeights,
    pressure: input.pressure,
    speed: input.strokeSpeed,
  });

  const overpaintRelief = computeOverpaintReliefInheritance({
    dryUnderHeight: input.dryUnderHeight,
    newPaintThickness: contactTransfer.pigmentTransfer * dryBrushStamp.strandMask,
    paintViscosity: input.paintViscosity,
    brushStrokeRelief: dryBrushStamp.strandMask - 0.5,
  });

  const frictionAudio = computeBrushFrictionSynthParams({
    medium: input.medium,
    pressure: input.pressure,
    speed: input.strokeSpeed,
    paperRoughness: input.paperTile.spec.nominalRoughness,
    tiltRad: input.tiltRad,
    wetness: input.wetness,
    masterVolume: input.masterAudioVolume,
  });

  return {
    paperSample,
    contactTransfer,
    dryBrushStamp,
    dualGranulation,
    bristleStep,
    overpaintRelief,
    frictionAudio,
  };
}
