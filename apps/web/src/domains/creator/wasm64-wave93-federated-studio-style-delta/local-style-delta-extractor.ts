/**
 * Wave 93 — 로컬 화풍 델타 추출기, 차분 프라이버시(DP) 예산 회계사,
 * 원본 원고 유출 차단 가드 (`local-style-delta-extractor.ts`).
 *
 * - 16차원 정규 화풍 어댑터 벡터(`StyleAdapterVector`) 기반 로컬 학습 델타 산출
 * - L2 민감도 클리핑(`||clipped||_2 <= maxL2Norm`) + 결정론적 Mulberry32/Box-Muller
 *   가우시안 DP 노이즈(`sigma = maxL2Norm * sqrt(2 * ln(1.25 / delta)) / epsilon`)
 * - 누적 프라이버시 예산 원장(`PrivacyBudgetLedger`): 한도 초과 시 fail-closed 차단
 * - 제로 원본 원고 송출 가드(`validateZeroRawArtworkPayload`): 픽셀 버퍼·TypedArray·
 *   원시 스트로크 좌표·미공개 대사 텍스트 송출을 재귀 검사로 거부
 */

// ---------------------------------------------------------------------------
// 1. 정규 16차원 화풍 어댑터 축 정의
// ---------------------------------------------------------------------------

export const STYLE_ADAPTER_AXES = [
  "lineWeightGamma", "entryTaperRatio", "exitFlickSharpness", "shadowHueShiftDeg",
  "shadowChromaGain", "rimLightIntensity", "celRampHardness", "highlightBloomThreshold",
  "screentoneDensity", "paperGrainContrast", "skinSubsurfaceWarmth", "eyeSpecularBrightness",
  "atmosphereHazeDepth", "ambientOcclusionBias", "inkBlackFloor", "colorTempKelvinNorm",
] as const;

export type StyleAdapterAxisKey = (typeof STYLE_ADAPTER_AXES)[number];
export const STYLE_ADAPTER_DIMENSION = 16;

export interface StyleAdapterVector {
  readonly lineWeightGamma: number; readonly entryTaperRatio: number;
  readonly exitFlickSharpness: number; readonly shadowHueShiftDeg: number;
  readonly shadowChromaGain: number; readonly rimLightIntensity: number;
  readonly celRampHardness: number; readonly highlightBloomThreshold: number;
  readonly screentoneDensity: number; readonly paperGrainContrast: number;
  readonly skinSubsurfaceWarmth: number; readonly eyeSpecularBrightness: number;
  readonly atmosphereHazeDepth: number; readonly ambientOcclusionBias: number;
  readonly inkBlackFloor: number; readonly colorTempKelvinNorm: number;
}

export type StyleAdapterCategory = "inking" | "shading" | "color" | "texture";

export interface StyleAdapterAxisSpec {
  readonly axis: StyleAdapterAxisKey; readonly category: StyleAdapterCategory;
  readonly min: number; readonly max: number; readonly scaleSpan: number;
  readonly defaultValue: number; readonly unitLabel: string; readonly labelKo: string;
  readonly increaseActionKo: string; readonly decreaseActionKo: string;
}

function defineAxisSpec(
  axis: StyleAdapterAxisKey, category: StyleAdapterCategory, min: number, max: number,
  defaultValue: number, unitLabel: string, labelKo: string,
  increaseActionKo: string, decreaseActionKo: string,
): StyleAdapterAxisSpec {
  return {
    axis, category, min, max, scaleSpan: max - min, defaultValue,
    unitLabel, labelKo, increaseActionKo, decreaseActionKo,
  };
}

export const STYLE_ADAPTER_AXIS_SPECS: Readonly<
  Record<StyleAdapterAxisKey, StyleAdapterAxisSpec>
> = {
  lineWeightGamma: defineAxisSpec("lineWeightGamma", "inking", 0.4, 2.4, 1.0, "γ", "선 굵기 감마", "필압 대비 선 굵기 감마를 높여 주선 강약을 살려 주세요.", "선 굵기 감마를 낮춰 균일한 펜선 톤을 맞춰 주세요."),
  entryTaperRatio: defineAxisSpec("entryTaperRatio", "inking", 0.0, 1.0, 0.35, "", "선 시작 테이퍼 비율", "펜선 시작부를 더 가늘게 빼서 팀 기준선과 맞춰 주세요.", "펜선 시작부 테이퍼를 줄여 또렷하게 시작해 주세요."),
  exitFlickSharpness: defineAxisSpec("exitFlickSharpness", "inking", 0.0, 1.0, 0.55, "", "선 끝 빼기 예리도", "획 끝 빼기를 더 날카롭게 마무리해 주세요.", "획 끝 빼기 강도를 낮춰 부드럽게 마감해 주세요."),
  shadowHueShiftDeg: defineAxisSpec("shadowHueShiftDeg", "shading", -45.0, 45.0, 12.0, "°", "그림자 색조 이동", "그림자 색조를 한색 방향으로 조금 더 이동해 주세요.", "그림자 색조 이동 각도를 줄여 원색 톤에 가깝게 맞춰 주세요."),
  shadowChromaGain: defineAxisSpec("shadowChromaGain", "shading", 0.0, 1.0, 0.42, "", "그림자 채도 증폭", "그림자 영역 채도를 높여 탁한 회색기를 줄여 주세요.", "그림자 채도를 낮춰 차분한 음영 톤을 유지해 주세요."),
  rimLightIntensity: defineAxisSpec("rimLightIntensity", "shading", 0.0, 1.0, 0.38, "", "림라이트 강도", "인물 외곽 림라이트 밝기를 높여 배경과 분리해 주세요.", "림라이트 강도를 줄여 과한 역광 느낌을 눌러 주세요."),
  celRampHardness: defineAxisSpec("celRampHardness", "shading", 0.0, 1.0, 0.68, "", "셀 음영 경계 경도", "음영 경계를 더 선명한 셀 톤으로 잡아 주세요.", "음영 경계를 조금 풀어 부드러운 반실사 톤으로 맞춰 주세요."),
  highlightBloomThreshold: defineAxisSpec("highlightBloomThreshold", "shading", 0.0, 1.0, 0.78, "", "하이라이트 블룸 문턱", "하이라이트 번짐 문턱을 높여 번짐을 절제해 주세요.", "하이라이트 번짐 문턱을 낮춰 빛 번짐을 살려 주세요."),
  screentoneDensity: defineAxisSpec("screentoneDensity", "texture", 0.0, 1.0, 0.25, "", "스크린톤 밀도", "스크린톤 밀도를 높여 어두운 면의 질감을 채워 주세요.", "스크린톤 밀도를 낮춰 화면을 깔끔하게 비워 주세요."),
  paperGrainContrast: defineAxisSpec("paperGrainContrast", "texture", 0.0, 1.0, 0.18, "", "종이 질감 대비", "종이 질감 대비를 올려 아날로그 원고 결을 살려 주세요.", "종이 질감 대비를 낮춰 매끈한 디지털 마감으로 맞춰 주세요."),
  skinSubsurfaceWarmth: defineAxisSpec("skinSubsurfaceWarmth", "color", 0.0, 1.0, 0.54, "", "피부 피하 온기", "피부 음영 경계에 따뜻한 혈색 톤을 더해 주세요.", "피부 경계 붉은 기를 줄여 차분한 피부 톤으로 맞춰 주세요."),
  eyeSpecularBrightness: defineAxisSpec("eyeSpecularBrightness", "color", 0.0, 1.0, 0.82, "", "눈동자 하이라이트 밝기", "눈동자 하이라이트 명도를 올려 시선 집중도를 맞춰 주세요.", "눈동자 하이라이트 밝기를 낮춰 차분한 표정을 유지해 주세요."),
  atmosphereHazeDepth: defineAxisSpec("atmosphereHazeDepth", "color", 0.0, 1.0, 0.3, "", "대기 원근 헤이즈", "원경 공기 원근감을 높여 공간 깊이를 더해 주세요.", "대기 헤이즈를 줄여 원경 대비를 또렷하게 유지해 주세요."),
  ambientOcclusionBias: defineAxisSpec("ambientOcclusionBias", "shading", 0.0, 1.0, 0.4, "", "주변광 차폐 바이어스", "접합부·옷주름 틈새 음영을 조금 더 깊게 눌러 주세요.", "틈새 차폐 음영을 완화해 화면이 무거워지지 않게 해 주세요."),
  inkBlackFloor: defineAxisSpec("inkBlackFloor", "inking", 0.0, 0.35, 0.06, "", "잉크 블랙 바닥값", "먹선 바닥 명도를 살짝 올려 부드러운 차콜 선색으로 맞춰 주세요.", "먹선 바닥 명도를 내려 깊은 흑색 선을 유지해 주세요."),
  colorTempKelvinNorm: defineAxisSpec("colorTempKelvinNorm", "color", 0.0, 1.0, 0.5, "", "색온도 정규화", "장면 전체 색온도를 조금 더 따뜻한 톤으로 옮겨 주세요.", "장면 전체 색온도를 시원한 톤으로 낮춰 주세요."),
};

// ---------------------------------------------------------------------------
// 2. 오류 코드 및 타입 계약
// ---------------------------------------------------------------------------

export type StudioParticipantRole = "lead-artist" | "color-assistant" | "line-assistant";
export type FederatedPrivacyErrorCode =
  | "PRIVACY_BUDGET_EXCEEDED" | "INVALID_DP_CONFIG" | "EMPTY_LOCAL_SAMPLES"
  | "INVALID_STYLE_VECTOR" | "RAW_ARTWORK_EGRESS_BLOCKED";

export class FederatedPrivacyError extends Error {
  public readonly code: FederatedPrivacyErrorCode;
  public constructor(code: FederatedPrivacyErrorCode, message: string) {
    super(message);
    this.name = "FederatedPrivacyError";
    this.code = code;
  }
}

export interface LocalStyleSessionSample {
  readonly sessionId: string; readonly observedStyle: StyleAdapterVector;
  readonly sampleWeight?: number; readonly strokeCountSummary?: number;
}
export interface DifferentialPrivacyConfig {
  readonly epsilon: number; readonly delta: number;
  readonly maxL2Norm: number; readonly seed: number;
}
export interface PrivacyBudgetCharge {
  readonly roundIndex: number; readonly epsilon: number; readonly delta: number;
  readonly maxL2Norm: number; readonly sigma: number;
}
export interface PrivacyBudgetSnapshot {
  readonly studioId: string; readonly participantId: string;
  readonly maxEpsilonBudget: number; readonly maxDeltaBudget: number;
  readonly epsilonSpent: number; readonly deltaSpent: number;
  readonly remainingEpsilon: number; readonly remainingDelta: number;
  readonly utilizationRatio: number; readonly roundsParticipated: number;
  readonly history: readonly PrivacyBudgetCharge[];
}
export interface PrivacyBudgetLedgerOptions {
  readonly studioId: string; readonly participantId: string;
  readonly maxEpsilonBudget: number; readonly maxDeltaBudget?: number;
}
export interface ExtractLocalStyleDeltaOptions {
  readonly participantId?: string; readonly role?: StudioParticipantRole;
  readonly roundIndex?: number; readonly baseAdapterVersion?: string;
}
export interface ClipStyleDeltaResult {
  readonly clipped: StyleAdapterVector; readonly rawL2Norm: number;
  readonly clippedL2Norm: number; readonly wasClipped: boolean; readonly clipScale: number;
}
export interface FederatedStyleDeltaEnvelope {
  readonly schemaVersion: "wave93-federated-style-delta/v1";
  readonly studioId: string; readonly participantId: string;
  readonly role: StudioParticipantRole; readonly roundIndex: number;
  readonly baseAdapterVersion: string; readonly sampleCount: number;
  readonly deltaVector: StyleAdapterVector;
  readonly dpReceipt: {
    readonly epsilon: number; readonly delta: number; readonly maxL2Norm: number;
    readonly sigma: number; readonly clippedL2Norm: number; readonly wasClipped: boolean;
  };
  readonly rawArtworkUploaded: false;
}
export interface LocalStyleDeltaExtractionResult {
  readonly envelope: FederatedStyleDeltaEnvelope;
  readonly localDiagnostics: {
    readonly localMeanVector: StyleAdapterVector; readonly rawDelta: StyleAdapterVector;
    readonly clippedDelta: StyleAdapterVector; readonly noiseVector: StyleAdapterVector;
    readonly rawL2Norm: number; readonly clippedL2Norm: number; readonly noisedL2Norm: number;
    readonly wasClipped: boolean; readonly sigma: number;
    readonly budgetAfterRound: PrivacyBudgetSnapshot;
  };
}
export interface RawArtworkViolation {
  readonly path: string;
  readonly code:
    | "TYPED_ARRAY_OR_BUFFER" | "FORBIDDEN_KEY_NAME" | "RAW_STROKE_COORDINATES"
    | "RAW_IMAGE_OR_PSD_DATA" | "UNREDACTED_SCRIPT_TEXT" | "OVERSIZED_NUMERIC_ARRAY"
    | "RAW_ARTWORK_FLAG_VIOLATION" | "MAX_DEPTH_EXCEEDED";
  readonly detail: string;
}
export interface ZeroRawArtworkGuardResult {
  readonly safe: boolean; readonly rawArtworkUploaded: false;
  readonly inspectedNodeCount: number; readonly violations: readonly RawArtworkViolation[];
}

// ---------------------------------------------------------------------------
// 3. 벡터 연산 및 클리핑 유틸리티
// ---------------------------------------------------------------------------

export function vectorToTuple(vector: StyleAdapterVector): readonly number[] {
  return STYLE_ADAPTER_AXES.map((axis) => vector[axis]);
}

export function tupleToVector(values: readonly number[]): StyleAdapterVector {
  if (values.length !== STYLE_ADAPTER_DIMENSION) {
    throw new FederatedPrivacyError(
      "INVALID_STYLE_VECTOR",
      `화풍 벡터는 정확히 ${STYLE_ADAPTER_DIMENSION}차원이어야 합니다 (입력: ${values.length}).`,
    );
  }
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) {
      throw new FederatedPrivacyError(
        "INVALID_STYLE_VECTOR",
        `화풍 벡터 축(${STYLE_ADAPTER_AXES[i]})에 유한하지 않은 값이 포함되었습니다.`,
      );
    }
  }
  return {
    lineWeightGamma: values[0], entryTaperRatio: values[1], exitFlickSharpness: values[2],
    shadowHueShiftDeg: values[3], shadowChromaGain: values[4], rimLightIntensity: values[5],
    celRampHardness: values[6], highlightBloomThreshold: values[7], screentoneDensity: values[8],
    paperGrainContrast: values[9], skinSubsurfaceWarmth: values[10], eyeSpecularBrightness: values[11],
    atmosphereHazeDepth: values[12], ambientOcclusionBias: values[13], inkBlackFloor: values[14],
    colorTempKelvinNorm: values[15],
  };
}

export function createDefaultStyleAdapterVector(
  overrides?: Partial<StyleAdapterVector>,
): StyleAdapterVector {
  return tupleToVector(
    STYLE_ADAPTER_AXES.map((axis) => overrides?.[axis] ?? STYLE_ADAPTER_AXIS_SPECS[axis].defaultValue),
  );
}

export function createZeroStyleDeltaVector(): StyleAdapterVector {
  return tupleToVector(STYLE_ADAPTER_AXES.map(() => 0));
}

export function assertFiniteStyleVector(vector: StyleAdapterVector, label: string): void {
  for (const axis of STYLE_ADAPTER_AXES) {
    const value = vector[axis];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new FederatedPrivacyError(
        "INVALID_STYLE_VECTOR",
        `${label}의 축(${axis}) 값이 유효한 유한 실수가 아닙니다.`,
      );
    }
  }
}

export function computeL2Norm(vector: StyleAdapterVector): number {
  let sumSq = 0;
  for (const axis of STYLE_ADAPTER_AXES) {
    sumSq += vector[axis] * vector[axis];
  }
  return Math.sqrt(sumSq);
}

export function subtractStyleVectors(a: StyleAdapterVector, b: StyleAdapterVector): StyleAdapterVector {
  return tupleToVector(STYLE_ADAPTER_AXES.map((axis) => a[axis] - b[axis]));
}

export function addStyleVectors(a: StyleAdapterVector, b: StyleAdapterVector): StyleAdapterVector {
  return tupleToVector(STYLE_ADAPTER_AXES.map((axis) => a[axis] + b[axis]));
}

export function scaleStyleVector(vector: StyleAdapterVector, scalar: number): StyleAdapterVector {
  if (!Number.isFinite(scalar)) {
    throw new FederatedPrivacyError("INVALID_STYLE_VECTOR", "벡터 스케일 계수는 유한 실수여야 합니다.");
  }
  return tupleToVector(STYLE_ADAPTER_AXES.map((axis) => vector[axis] * scalar));
}

export function clampStyleVectorToBounds(vector: StyleAdapterVector): StyleAdapterVector {
  return tupleToVector(
    STYLE_ADAPTER_AXES.map((axis) => {
      const spec = STYLE_ADAPTER_AXIS_SPECS[axis];
      return Math.min(spec.max, Math.max(spec.min, vector[axis]));
    }),
  );
}

export function clipStyleDeltaByL2Norm(
  delta: StyleAdapterVector,
  maxL2Norm: number,
): ClipStyleDeltaResult {
  assertFiniteStyleVector(delta, "delta");
  if (!Number.isFinite(maxL2Norm) || maxL2Norm <= 0) {
    throw new FederatedPrivacyError("INVALID_DP_CONFIG", `maxL2Norm은 0보다 커야 합니다 (입력: ${maxL2Norm}).`);
  }
  const rawL2Norm = computeL2Norm(delta);
  if (rawL2Norm <= maxL2Norm) {
    return {
      clipped: tupleToVector(vectorToTuple(delta)),
      rawL2Norm, clippedL2Norm: rawL2Norm, wasClipped: false, clipScale: 1,
    };
  }
  let clipScale = maxL2Norm / rawL2Norm;
  let clipped = scaleStyleVector(delta, clipScale);
  let clippedL2Norm = computeL2Norm(clipped);
  if (clippedL2Norm > maxL2Norm) {
    clipScale *= 1 - 1e-12;
    clipped = scaleStyleVector(delta, clipScale);
    clippedL2Norm = computeL2Norm(clipped);
  }
  return { clipped, rawL2Norm, clippedL2Norm, wasClipped: true, clipScale };
}

// ---------------------------------------------------------------------------
// 4. 결정론적 PRNG(Mulberry32) 및 가우시안 DP 메커니즘
// ---------------------------------------------------------------------------

export function createMulberry32(seed: number): () => number {
  if (!Number.isFinite(seed)) {
    throw new FederatedPrivacyError("INVALID_DP_CONFIG", "결정론적 PRNG 시드는 유한 숫자여야 합니다.");
  }
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleBoxMullerPair(rng: () => number): readonly [number, number] {
  const u1 = Math.min(1 - 1e-12, Math.max(1e-12, rng()));
  const radius = Math.sqrt(-2.0 * Math.log(u1));
  const theta = 2.0 * Math.PI * rng();
  return [radius * Math.cos(theta), radius * Math.sin(theta)];
}

export function computeGaussianDpSigma(maxL2Norm: number, epsilon: number, delta: number): number {
  if (!Number.isFinite(maxL2Norm) || maxL2Norm <= 0) {
    throw new FederatedPrivacyError("INVALID_DP_CONFIG", `maxL2Norm은 0보다 커야 합니다 (입력: ${maxL2Norm}).`);
  }
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new FederatedPrivacyError("INVALID_DP_CONFIG", `epsilon은 0보다 커야 합니다 (입력: ${epsilon}).`);
  }
  if (!Number.isFinite(delta) || delta <= 0 || delta >= 1) {
    throw new FederatedPrivacyError("INVALID_DP_CONFIG", `delta는 (0, 1) 구간이어야 합니다 (입력: ${delta}).`);
  }
  return (maxL2Norm * Math.sqrt(2.0 * Math.log(1.25 / delta))) / epsilon;
}

function sampleDeterministicGaussianVector(sigma: number, seed: number): StyleAdapterVector {
  const rng = createMulberry32(seed);
  const values: number[] = [];
  for (let i = 0; i < STYLE_ADAPTER_DIMENSION; i += 2) {
    const [z0, z1] = sampleBoxMullerPair(rng);
    values.push(z0 * sigma, z1 * sigma);
  }
  return tupleToVector(values);
}

// ---------------------------------------------------------------------------
// 5. 프라이버시 예산 원장 (`PrivacyBudgetLedger`) — Fail-Closed
// ---------------------------------------------------------------------------

export class PrivacyBudgetLedger {
  public readonly studioId: string;
  public readonly participantId: string;
  public readonly maxEpsilonBudget: number;
  public readonly maxDeltaBudget: number;

  private epsilonSpentValue = 0;
  private deltaSpentValue = 0;
  private readonly charges: PrivacyBudgetCharge[] = [];

  public constructor(options: PrivacyBudgetLedgerOptions) {
    if (!options.studioId.trim() || !options.participantId.trim()) {
      throw new FederatedPrivacyError("INVALID_DP_CONFIG", "studioId와 participantId는 비어 있을 수 없습니다.");
    }
    if (!Number.isFinite(options.maxEpsilonBudget) || options.maxEpsilonBudget <= 0) {
      throw new FederatedPrivacyError("INVALID_DP_CONFIG", `maxEpsilonBudget은 0보다 커야 합니다 (입력: ${options.maxEpsilonBudget}).`);
    }
    const maxDelta = options.maxDeltaBudget ?? 1e-3;
    if (!Number.isFinite(maxDelta) || maxDelta <= 0 || maxDelta >= 1) {
      throw new FederatedPrivacyError("INVALID_DP_CONFIG", `maxDeltaBudget은 (0, 1) 구간이어야 합니다 (입력: ${maxDelta}).`);
    }
    this.studioId = options.studioId.trim();
    this.participantId = options.participantId.trim();
    this.maxEpsilonBudget = options.maxEpsilonBudget;
    this.maxDeltaBudget = maxDelta;
  }

  public get epsilonSpent(): number { return this.epsilonSpentValue; }
  public get deltaSpent(): number { return this.deltaSpentValue; }
  public get roundsParticipated(): number { return this.charges.length; }
  public get remainingEpsilon(): number { return Math.max(0, this.maxEpsilonBudget - this.epsilonSpentValue); }
  public get remainingDelta(): number { return Math.max(0, this.maxDeltaBudget - this.deltaSpentValue); }

  public canAfford(epsilon: number, delta: number): boolean {
    if (!Number.isFinite(epsilon) || epsilon <= 0 || !Number.isFinite(delta) || delta <= 0 || delta >= 1) {
      return false;
    }
    return (
      this.epsilonSpentValue + epsilon <= this.maxEpsilonBudget + 1e-12 &&
      this.deltaSpentValue + delta <= this.maxDeltaBudget + 1e-15
    );
  }

  public chargeRound(charge: PrivacyBudgetCharge): PrivacyBudgetSnapshot {
    if (!Number.isFinite(charge.epsilon) || charge.epsilon <= 0 || !Number.isFinite(charge.delta) || charge.delta <= 0 || charge.delta >= 1) {
      throw new FederatedPrivacyError("INVALID_DP_CONFIG", "라운드 DP 예산 차감값이 유효하지 않습니다.");
    }
    const projectedEpsilon = this.epsilonSpentValue + charge.epsilon;
    if (projectedEpsilon > this.maxEpsilonBudget + 1e-12) {
      throw new FederatedPrivacyError(
        "PRIVACY_BUDGET_EXCEEDED",
        `프라이버시 ε 예산 초과로 송출을 차단했습니다 (누적 ${projectedEpsilon.toFixed(4)} > 상한 ${this.maxEpsilonBudget.toFixed(4)}).`,
      );
    }
    const projectedDelta = this.deltaSpentValue + charge.delta;
    if (projectedDelta > this.maxDeltaBudget + 1e-15) {
      throw new FederatedPrivacyError(
        "PRIVACY_BUDGET_EXCEEDED",
        `프라이버시 δ 예산 초과로 송출을 차단했습니다 (누적 ${projectedDelta.toExponential(2)} > 상한 ${this.maxDeltaBudget.toExponential(2)}).`,
      );
    }
    this.epsilonSpentValue = Math.min(this.maxEpsilonBudget, projectedEpsilon);
    this.deltaSpentValue = Math.min(this.maxDeltaBudget, projectedDelta);
    this.charges.push({ ...charge });
    return this.getSnapshot();
  }

  public getSnapshot(): PrivacyBudgetSnapshot {
    const ratio = this.maxEpsilonBudget > 0 ? this.epsilonSpentValue / this.maxEpsilonBudget : 1;
    return {
      studioId: this.studioId,
      participantId: this.participantId,
      maxEpsilonBudget: this.maxEpsilonBudget,
      maxDeltaBudget: this.maxDeltaBudget,
      epsilonSpent: this.epsilonSpentValue,
      deltaSpent: this.deltaSpentValue,
      remainingEpsilon: this.remainingEpsilon,
      remainingDelta: this.remainingDelta,
      utilizationRatio: Math.min(1, Math.max(0, ratio)),
      roundsParticipated: this.charges.length,
      history: this.charges.map((item) => ({ ...item })),
    };
  }
}

// ---------------------------------------------------------------------------
// 6. 제로 원본 원고 송출 가드 (`validateZeroRawArtworkPayload`)
// ---------------------------------------------------------------------------

const FORBIDDEN_KEY_PATTERN =
  /^(?:pixels?|pixelbuffer|rgba|rgb|bitmap|raster|imagedata|canvasdata|psd|psdbytes|rawimage|rawartwork|png|webp|jpeg|jpg|base64image|dataurl|layerpixels|tilebuffer|strokes?|strokepoints|strokecoordinates|points|polyline|bezierpoints|pensamples|pressurepoints|pathcoords|rawstrokes|dialogues?|script|scripttext|bubbletext|speechbubble|balloontext|transcript|manuscript|storyboardtext|unredactedtext|narration)$/i;
const RAW_BINARY_STRING_PATTERN = /^(?:data:image\/|data:application\/octet-stream|8BPS|iVBORw0KGgo|\/9j\/|UklGR)/;
const BASE64_BLOB_PATTERN = /^[A-Za-z0-9+/=]{128,}$/;
const SCRIPT_DIALOGUE_MARKER_PATTERN = /[「」『』"\n\r]/;
const MAX_GUARD_DEPTH = 24;
const MAX_SAFE_NUMERIC_ARRAY_LEN = 32;
const MAX_SAFE_STRING_LEN = 160;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinateTuple(item: unknown): boolean {
  if (Array.isArray(item)) {
    return item.length >= 2 && item.length <= 5 && item.every((el) => typeof el === "number" && Number.isFinite(el));
  }
  return isRecordObject(item) && typeof item.x === "number" && typeof item.y === "number";
}

export function validateZeroRawArtworkPayload(payload: unknown): ZeroRawArtworkGuardResult {
  const violations: RawArtworkViolation[] = [];
  const visited = new WeakSet<object>();
  let inspectedNodeCount = 0;

  if (isRecordObject(payload) && "rawArtworkUploaded" in payload && payload.rawArtworkUploaded !== false) {
    violations.push({
      path: "$.rawArtworkUploaded",
      code: "RAW_ARTWORK_FLAG_VIOLATION",
      detail: "rawArtworkUploaded 계약은 반드시 false여야 합니다.",
    });
  }

  function walk(node: unknown, path: string, depth: number): void {
    inspectedNodeCount += 1;
    if (depth > MAX_GUARD_DEPTH) {
      violations.push({ path, code: "MAX_DEPTH_EXCEEDED", detail: `중첩 깊이 상한(${MAX_GUARD_DEPTH}) 초과.` });
      return;
    }
    if (node === null || node === undefined) return;

    if (typeof node === "string") {
      if (RAW_BINARY_STRING_PATTERN.test(node) || BASE64_BLOB_PATTERN.test(node)) {
        violations.push({ path, code: "RAW_IMAGE_OR_PSD_DATA", detail: "이미지·PSD 헤더 또는 대용량 Base64 래스터 문자열 감지." });
      } else if (node.length > MAX_SAFE_STRING_LEN || SCRIPT_DIALOGUE_MARKER_PATTERN.test(node)) {
        violations.push({ path, code: "UNREDACTED_SCRIPT_TEXT", detail: "장문 또는 대사·줄바꿈 포함 텍스트 송출 차단." });
      }
      return;
    }
    if (typeof node !== "object") return;

    if (
      node instanceof ArrayBuffer ||
      ArrayBuffer.isView(node) ||
      (typeof SharedArrayBuffer !== "undefined" && node instanceof SharedArrayBuffer)
    ) {
      violations.push({ path, code: "TYPED_ARRAY_OR_BUFFER", detail: "바이너리 버퍼·TypedArray 송출 차단." });
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      if (node.length > MAX_SAFE_NUMERIC_ARRAY_LEN && node.every((item) => typeof item === "number")) {
        violations.push({ path, code: "OVERSIZED_NUMERIC_ARRAY", detail: `숫자 배열 길이(${node.length}) 상한 초과.` });
        return;
      }
      if (node.length >= 2 && node.every(isCoordinateTuple)) {
        violations.push({ path, code: "RAW_STROKE_COORDINATES", detail: "원시 스트로크 좌표 배열 송출 차단." });
        return;
      }
      for (let i = 0; i < node.length; i += 1) walk(node[i], `${path}[${i}]`, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record.width === "number" && typeof record.height === "number" && "data" in record) {
      violations.push({ path, code: "RAW_IMAGE_OR_PSD_DATA", detail: "ImageData 형태 래스터 객체 송출 차단." });
    }
    for (const key of Object.keys(record)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN_KEY_PATTERN.test(key.replace(/[_-]/g, ""))) {
        violations.push({ path: childPath, code: "FORBIDDEN_KEY_NAME", detail: `금지된 원본 원고·스트로크·대사 키(${key}) 감지.` });
        continue;
      }
      walk(record[key], childPath, depth + 1);
    }
  }

  walk(payload, "$", 0);
  return { safe: violations.length === 0, rawArtworkUploaded: false, inspectedNodeCount, violations };
}

export function assertZeroRawArtworkPayload(payload: unknown): void {
  const verdict = validateZeroRawArtworkPayload(payload);
  if (!verdict.safe) {
    const first = verdict.violations[0];
    throw new FederatedPrivacyError(
      "RAW_ARTWORK_EGRESS_BLOCKED",
      `원본 원고 유출 차단 가드 위반(${verdict.violations.length}건): [${first.code}] ${first.path} — ${first.detail}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 7. 로컬 화풍 델타 추출 메인 파이프라인
// ---------------------------------------------------------------------------

export function extractLocalStyleDelta(
  baseAdapter: StyleAdapterVector,
  localSessionSamples: readonly LocalStyleSessionSample[],
  dpConfig: DifferentialPrivacyConfig,
  budgetAccountant: PrivacyBudgetLedger,
  options?: ExtractLocalStyleDeltaOptions,
): LocalStyleDeltaExtractionResult {
  assertFiniteStyleVector(baseAdapter, "baseAdapter");
  if (localSessionSamples.length === 0) {
    throw new FederatedPrivacyError("EMPTY_LOCAL_SAMPLES", "최소 1개 이상의 로컬 작업 세션 표본이 필요합니다.");
  }

  const weightedSum = new Array<number>(STYLE_ADAPTER_DIMENSION).fill(0);
  let totalWeight = 0;
  for (let i = 0; i < localSessionSamples.length; i += 1) {
    const sample = localSessionSamples[i];
    assertFiniteStyleVector(sample.observedStyle, `localSessionSamples[${i}]`);
    const weight = sample.sampleWeight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new FederatedPrivacyError("INVALID_STYLE_VECTOR", `표본 가중치(sampleWeight)는 0보다 커야 합니다 (인덱스 ${i}).`);
    }
    totalWeight += weight;
    for (let axisIdx = 0; axisIdx < STYLE_ADAPTER_DIMENSION; axisIdx += 1) {
      weightedSum[axisIdx] += sample.observedStyle[STYLE_ADAPTER_AXES[axisIdx]] * weight;
    }
  }

  const localMeanVector = tupleToVector(weightedSum.map((sum) => sum / totalWeight));
  const rawDelta = subtractStyleVectors(localMeanVector, baseAdapter);
  const sigma = computeGaussianDpSigma(dpConfig.maxL2Norm, dpConfig.epsilon, dpConfig.delta);
  const clipResult = clipStyleDeltaByL2Norm(rawDelta, dpConfig.maxL2Norm);

  const roundIndex = options?.roundIndex ?? budgetAccountant.roundsParticipated + 1;
  const budgetAfterRound = budgetAccountant.chargeRound({
    roundIndex, epsilon: dpConfig.epsilon, delta: dpConfig.delta, maxL2Norm: dpConfig.maxL2Norm, sigma,
  });

  const noiseVector = sampleDeterministicGaussianVector(sigma, dpConfig.seed);
  const noisedDelta = addStyleVectors(clipResult.clipped, noiseVector);
  const noisedL2Norm = computeL2Norm(noisedDelta);

  const envelope: FederatedStyleDeltaEnvelope = {
    schemaVersion: "wave93-federated-style-delta/v1",
    studioId: budgetAccountant.studioId,
    participantId: options?.participantId ?? budgetAccountant.participantId,
    role: options?.role ?? "color-assistant",
    roundIndex,
    baseAdapterVersion: options?.baseAdapterVersion ?? "v1",
    sampleCount: localSessionSamples.length,
    deltaVector: noisedDelta,
    dpReceipt: {
      epsilon: dpConfig.epsilon, delta: dpConfig.delta, maxL2Norm: dpConfig.maxL2Norm,
      sigma, clippedL2Norm: clipResult.clippedL2Norm, wasClipped: clipResult.wasClipped,
    },
    rawArtworkUploaded: false,
  };

  assertZeroRawArtworkPayload(envelope);
  return {
    envelope,
    localDiagnostics: {
      localMeanVector, rawDelta, clippedDelta: clipResult.clipped, noiseVector,
      rawL2Norm: clipResult.rawL2Norm, clippedL2Norm: clipResult.clippedL2Norm,
      noisedL2Norm, wasClipped: clipResult.wasClipped, sigma, budgetAfterRound,
    },
  };
}
