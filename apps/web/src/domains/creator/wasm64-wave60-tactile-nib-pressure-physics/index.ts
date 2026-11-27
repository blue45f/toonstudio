/**
 * Wasm64 Wave 60 공개 진입점 (`wasm64-wave60-tactile-nib-pressure-physics`).
 *
 * 초감각 필압·필기감 물리 엔진:
 * - `nib-wear-and-split-physics`: G펜·마루펜·연필(2B/HB)·붓펜·마커 펜촉 탄성, 좌우 슬릿 벌어짐(`tineSplitMm`),
 *   누적 거리·필압·기울기 기반 비대칭 편마모 프로파일(`NibWearState`) 및 자동 보정·'길들여진 펜촉' 프리셋 잠금
 * - `paper-fiber-friction-capillary-kernel`: 켄트지·만화 원고지·수채화 중목/황목·전통 한지 3D 섬유 높이장,
 *   Coulomb-Stribeck 정지/운동 마찰력, Washburn 모세관 잉크 번짐 및 건필 튐(Dry-Brush Tooth Skip) 커널
 * - `haptic-acoustic-tactile-synthesizer`: 마찰 에너지·섬유 요철 주파수 기반 Web Haptics 진동 펄스 및
 *   사각사각 필기음 공명 합성기와 단조성 보장 개인 손힘 S-커브 필압 캘리브레이터
 */

export {
  compensateAdaptiveNibWear,
  createInitialNibWearState,
  DEFAULT_OVER_WEAR_ASYMMETRY_THRESHOLD,
  DEFAULT_OVER_WEAR_SEVERITY_THRESHOLD,
  getNibMechanicalSpec,
  listNibPresetIds,
  lockBrokenInNibPreset,
  MAX_STYLUS_NORMAL_FORCE_N,
  MM_PER_METER,
  stepNibMechanics,
  SWEET_SPOT_BREAK_IN_PROGRESS,
  type AdaptiveNibCompensationOptions,
  type AdaptiveNibCompensationResult,
  type BrokenInNibPreset,
  type NibMechanicalSpec,
  type NibMechanicsInput,
  type NibMechanicsStepResult,
  type NibPresetId,
  type NibWearCompensationMode,
  type NibWearState,
} from "./nib-wear-and-split-physics";

export {
  computeCapillaryInkTransfer,
  evaluatePaperMicroContact,
  getPaperSubstrateSpec,
  listPaperSubstrateIds,
  samplePaperFiberHeightField,
  type CapillaryInkTransferInput,
  type CapillaryInkTransferResult,
  type FrictionRegime,
  type InkMediumKind,
  type PaperFiberReliefSample,
  type PaperMicroContactInput,
  type PaperMicroContactResult,
  type PaperSubstrateId,
  type PaperSubstrateSpec,
} from "./paper-fiber-friction-capillary-kernel";

export {
  calibratePersonalPressureCurve,
  DEFAULT_PRESSURE_LUT_SIZE,
  evaluateCalibratedPressure,
  MAX_FRICTION_BANDPASS_HZ,
  MAX_HAPTIC_CARRIER_HZ,
  MAX_TACTILE_AUDIO_GAIN_LINEAR,
  MIN_FRICTION_BANDPASS_HZ,
  MIN_HAPTIC_CARRIER_HZ,
  synthesizeTactileStrokeFeedback,
  type AcousticStrokeFeedbackParams,
  type HandStrengthClass,
  type HapticPulsePattern,
  type PersonalPressureCalibrationInput,
  type PersonalPressureCalibrationProfile,
  type PressureCalibrationSample,
  type TactileStrokeFeedbackResult,
  type TactileStrokeSynthesisInput,
  type TactileTextureEnvelope,
} from "./haptic-acoustic-tactile-synthesizer";
