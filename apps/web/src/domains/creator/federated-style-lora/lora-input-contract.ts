import type { DpPrivacyConfig, FederatedLoraSession, LoraAdapterWeights, OnDeviceStyleSample } from "./federated-lora-engine";

export function requireFinite(value: number, label: string, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label}: 유한한 ${min}~${max} 값이 필요합니다.`);
}

export function requireInteger(value: number, label: string, min: number, max: number): void {
  requireFinite(value, label, min, max);
  if (!Number.isInteger(value)) throw new RangeError(`${label}: 정수가 필요합니다.`);
}

export function requireId(id: string): void {
  if (!id.trim()) throw new RangeError("비어 있지 않은 ID가 필요합니다.");
}

export function assertAdapter(adapter: LoraAdapterWeights): void {
  requireId(adapter.adapterId);
  if (![4, 8, 16].includes(adapter.rank)) throw new RangeError("지원 랭크는 4, 8, 16입니다.");
  requireInteger(adapter.inDim, "입력 차원", 1, 256);
  requireInteger(adapter.outDim, "출력 차원", 1, 256);
  requireFinite(adapter.alpha, "alpha", Number.MIN_VALUE, 256);
  if (adapter.matrixA.length !== adapter.outDim * adapter.rank || adapter.matrixB.length !== adapter.rank * adapter.inDim ||
      adapter.parameterCount !== adapter.matrixA.length + adapter.matrixB.length ||
      adapter.matrixA.some((value) => !Number.isFinite(value)) || adapter.matrixB.some((value) => !Number.isFinite(value))) {
    throw new RangeError("어댑터 버퍼의 길이·수치가 올바르지 않습니다.");
  }
}

export function assertPrivacyConfig(config: DpPrivacyConfig): void {
  requireFinite(config.clipNormC, "클리핑 가정값", 0.05, 100);
  requireFinite(config.noiseMultiplier, "노이즈 가정값", 0.05, 100);
  requireFinite(config.delta, "delta 가정값", 1e-12, 0.1);
  requireFinite(config.samplingRate, "샘플링 가정값", 1e-4, 1);
  requireFinite(config.budgetLimitEpsilon, "모델 예산", 0.1, 1e6);
  if (typeof config.enforceBudgetCap !== "boolean") throw new RangeError("예산 제한 여부는 boolean이어야 합니다.");
  requireFinite(config.learningRate, "학습률", Number.MIN_VALUE, 1);
}

export function assertTrainingInput(session: FederatedLoraSession, sample: OnDeviceStyleSample): void {
  assertAdapter(session.baseAdapter);
  assertAdapter(session.currentAdapter);
  assertPrivacyConfig(session.privacyConfig);
  requireId(session.sessionId); requireId(session.deviceId); requireId(sample.sampleId);
  requireInteger(session.seed, "시드", 0, 0xffffffff);
  requireInteger(session.stepCount, "스텝", 0, 1000000);
  requireInteger(session.totalSamplesProcessed, "처리 샘플 수", 0, Number.MAX_SAFE_INTEGER);
  requireFinite(session.epsilonSpent, "사용 예산", 0);
  if (session.rdpAccountantTotals.length !== 14 || session.rdpAccountantTotals.some((value) => !Number.isFinite(value) || value < 0)) throw new RangeError("가정 예산 벡터가 올바르지 않습니다.");
  requireInteger(sample.strokeBatchCount, "배치 수", 1, 1000000);
  if (sample.features.length !== session.currentAdapter.inDim || sample.targetModulation.length !== session.currentAdapter.outDim ||
      sample.features.some((value) => !Number.isFinite(value)) || sample.targetModulation.some((value) => !Number.isFinite(value))) {
    throw new RangeError("특징·목표 버퍼의 길이·수치가 올바르지 않습니다.");
  }
}
