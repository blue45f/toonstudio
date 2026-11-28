import { describe, expect, it } from "vitest";
import {
  FederatedPrivacyError,
  PrivacyBudgetLedger,
  STYLE_ADAPTER_AXES,
  STYLE_ADAPTER_DIMENSION,
  addStyleVectors,
  aggregateFederatedStyleRound,
  canonicalSerializeFederated,
  clipStyleDeltaByL2Norm,
  computeAssistantStyleAlignment,
  computeGaussianDpSigma,
  computeL2Norm,
  createDefaultStyleAdapterVector,
  extractLocalStyleDelta,
  renderFederatedStyleConvergenceSvg,
  scaleStyleVector,
  sha256FederatedHex,
  summarizeFederatedStyleRoundKo,
  tupleToVector,
  validateZeroRawArtworkPayload,
  verifyFederatedAuditChain,
  type FederatedStyleDeltaEnvelope,
  type PrivacyBudgetSnapshot,
  type StudioParticipantRole,
  type StyleAdapterVector,
} from "./index";

function makeDelta(overrides: Partial<StyleAdapterVector>): StyleAdapterVector {
  return tupleToVector(STYLE_ADAPTER_AXES.map((axis) => overrides[axis] ?? 0));
}

function makeCleanEnvelope(
  participantId: string,
  role: StudioParticipantRole,
  deltaVector: StyleAdapterVector,
  roundIndex = 1,
): FederatedStyleDeltaEnvelope {
  return {
    schemaVersion: "wave93-federated-style-delta/v1",
    studioId: "studio-seoul-alpha",
    participantId,
    role,
    roundIndex,
    baseAdapterVersion: "v1",
    sampleCount: 4,
    deltaVector,
    dpReceipt: {
      epsilon: 1.0, delta: 1e-5, maxL2Norm: 1.0,
      sigma: computeGaussianDpSigma(1.0, 1.0, 1e-5),
      clippedL2Norm: computeL2Norm(deltaVector), wasClipped: false,
    },
    rawArtworkUploaded: false,
  };
}

describe("Wave 93: 프라이버시 보존 팀 화풍 연합 가중치 델타 엔진", () => {
  it("1. 16차원 정규 화풍 어댑터 축 스키마가 정확히 정의된다", () => {
    expect(STYLE_ADAPTER_DIMENSION).toBe(16);
    expect(STYLE_ADAPTER_AXES).toEqual([
      "lineWeightGamma", "entryTaperRatio", "exitFlickSharpness", "shadowHueShiftDeg",
      "shadowChromaGain", "rimLightIntensity", "celRampHardness", "highlightBloomThreshold",
      "screentoneDensity", "paperGrainContrast", "skinSubsurfaceWarmth", "eyeSpecularBrightness",
      "atmosphereHazeDepth", "ambientOcclusionBias", "inkBlackFloor", "colorTempKelvinNorm",
    ]);
    expect(computeL2Norm(createDefaultStyleAdapterVector())).toBeGreaterThan(0);
  });

  it("2. L2 노름 클리핑 불변식: 초과 델타는 maxL2Norm 이하로 절단되고 방향을 유지한다", () => {
    const rawDelta = makeDelta({ lineWeightGamma: 1.5, shadowHueShiftDeg: 18, celRampHardness: 0.9, rimLightIntensity: -0.6 });
    const res = clipStyleDeltaByL2Norm(rawDelta, 0.75);
    expect(res.wasClipped).toBe(true);
    expect(res.rawL2Norm).toBeGreaterThan(0.75);
    expect(res.clippedL2Norm).toBeLessThanOrEqual(0.75);
    expect(computeL2Norm(res.clipped)).toBeLessThanOrEqual(0.75);
    expect(res.clipped.shadowHueShiftDeg / res.clipped.lineWeightGamma).toBeCloseTo(
      rawDelta.shadowHueShiftDeg / rawDelta.lineWeightGamma, 10,
    );
  });

  it("3. L2 노름 클리핑 통과: 상한 이내 델타는 원형 그대로 보존된다", () => {
    const smallDelta = makeDelta({ entryTaperRatio: 0.08, celRampHardness: -0.06 });
    const res = clipStyleDeltaByL2Norm(smallDelta, 0.5);
    expect(res.wasClipped).toBe(false);
    expect(res.clipScale).toBe(1);
    expect(res.clipped).toEqual(smallDelta);
  });

  it("4. 가우시안 DP sigma 공식이 maxL2Norm * sqrt(2 * ln(1.25 / delta)) / epsilon과 일치한다", () => {
    const expected = (0.4 * Math.sqrt(2 * Math.log(1.25 / 1e-5))) / 1.25;
    expect(computeGaussianDpSigma(0.4, 1.25, 1e-5)).toBeCloseTo(expected, 12);
  });

  it("5. DP 가우시안 노이즈 단조성: epsilon이 작을수록 sigma와 실측 표준편차가 커진다", () => {
    const base = createDefaultStyleAdapterVector();
    const target = createDefaultStyleAdapterVector({ celRampHardness: 0.8 });

    const measure = (epsilon: number): { sigma: number; std: number } => {
      const values: number[] = [];
      let sigma = 0;
      for (let seed = 1; seed <= 96; seed += 1) {
        const ledger = new PrivacyBudgetLedger({ studioId: "s-mono", participantId: "a1", maxEpsilonBudget: 100 });
        const out = extractLocalStyleDelta(base, [{ sessionId: `s-${seed}`, observedStyle: target }], { epsilon, delta: 1e-5, maxL2Norm: 0.5, seed }, ledger);
        sigma = out.localDiagnostics.sigma;
        for (const axis of STYLE_ADAPTER_AXES) values.push(out.localDiagnostics.noiseVector[axis]);
      }
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
      return { sigma, std: Math.sqrt(variance) };
    };

    const strict = measure(0.5);
    const moderate = measure(2.0);
    const relaxed = measure(8.0);
    expect(strict.sigma).toBeGreaterThan(moderate.sigma);
    expect(moderate.sigma).toBeGreaterThan(relaxed.sigma);
    expect(strict.std).toBeGreaterThan(moderate.std);
    expect(moderate.std).toBeGreaterThan(relaxed.std);
  });

  it("6. 결정론적 재현성: 동일한 시드와 입력은 비트 단위 동일한 노이즈 델타를 생성한다", () => {
    const base = createDefaultStyleAdapterVector();
    const samples = [
      { sessionId: "ep12-c1", observedStyle: createDefaultStyleAdapterVector({ lineWeightGamma: 1.15, shadowHueShiftDeg: 18 }), sampleWeight: 2 },
      { sessionId: "ep12-c2", observedStyle: createDefaultStyleAdapterVector({ lineWeightGamma: 1.25, shadowHueShiftDeg: 14 }), sampleWeight: 1 },
    ];
    const dp = { epsilon: 1.0, delta: 1e-5, maxL2Norm: 0.5, seed: 20261128 };
    const outA = extractLocalStyleDelta(base, samples, dp, new PrivacyBudgetLedger({ studioId: "s-rep", participantId: "c-kim", maxEpsilonBudget: 5 }));
    const outB = extractLocalStyleDelta(base, samples, dp, new PrivacyBudgetLedger({ studioId: "s-rep", participantId: "c-kim", maxEpsilonBudget: 5 }));
    expect(outA.envelope).toEqual(outB.envelope);
    expect(outA.localDiagnostics.noiseVector).toEqual(outB.localDiagnostics.noiseVector);
    expect(outA.localDiagnostics.clippedL2Norm).toBeLessThanOrEqual(dp.maxL2Norm);
  });

  it("7. 시드가 다르면 클리핑 델타는 동일하되 DP 노이즈 벡터는 달라진다", () => {
    const base = createDefaultStyleAdapterVector();
    const samples = [{ sessionId: "s1", observedStyle: createDefaultStyleAdapterVector({ rimLightIntensity: 0.6 }) }];
    const outA = extractLocalStyleDelta(base, samples, { epsilon: 1, delta: 1e-5, maxL2Norm: 0.5, seed: 101 }, new PrivacyBudgetLedger({ studioId: "s", participantId: "a", maxEpsilonBudget: 5 }));
    const outB = extractLocalStyleDelta(base, samples, { epsilon: 1, delta: 1e-5, maxL2Norm: 0.5, seed: 202 }, new PrivacyBudgetLedger({ studioId: "s", participantId: "a", maxEpsilonBudget: 5 }));
    expect(outA.localDiagnostics.clippedDelta).toEqual(outB.localDiagnostics.clippedDelta);
    expect(outA.envelope.deltaVector).not.toEqual(outB.envelope.deltaVector);
  });

  it("8. 프라이버시 예산 원장이 라운드 누적 ε·δ 및 참여 횟수를 정확히 추적한다", () => {
    const base = createDefaultStyleAdapterVector();
    const samples = [{ sessionId: "s1", observedStyle: createDefaultStyleAdapterVector({ celRampHardness: 0.72 }) }];
    const ledger = new PrivacyBudgetLedger({ studioId: "s-b", participantId: "c1", maxEpsilonBudget: 3.0, maxDeltaBudget: 1e-4 });
    extractLocalStyleDelta(base, samples, { epsilon: 0.8, delta: 2e-5, maxL2Norm: 0.4, seed: 11 }, ledger);
    extractLocalStyleDelta(base, samples, { epsilon: 1.2, delta: 3e-5, maxL2Norm: 0.4, seed: 12 }, ledger);
    const snap = ledger.getSnapshot();
    expect(snap.roundsParticipated).toBe(2);
    expect(snap.epsilonSpent).toBeCloseTo(2.0, 10);
    expect(snap.remainingEpsilon).toBeCloseTo(1.0, 10);
    expect(snap.deltaSpent).toBeCloseTo(5e-5, 12);
    expect(snap.utilizationRatio).toBeCloseTo(2 / 3, 6);
  });

  it("9. 프라이버시 ε 예산 초과 시 Fail-Closed 예외를 던지고 원장 상태를 오염시키지 않는다", () => {
    const base = createDefaultStyleAdapterVector();
    const samples = [{ sessionId: "s1", observedStyle: createDefaultStyleAdapterVector({ paperGrainContrast: 0.3 }) }];
    const ledger = new PrivacyBudgetLedger({ studioId: "s-cap", participantId: "l1", maxEpsilonBudget: 1.5 });
    extractLocalStyleDelta(base, samples, { epsilon: 1.0, delta: 1e-5, maxL2Norm: 0.4, seed: 31 }, ledger);

    let caughtCode: string | null = null;
    try {
      extractLocalStyleDelta(base, samples, { epsilon: 0.6, delta: 1e-5, maxL2Norm: 0.4, seed: 32 }, ledger);
    } catch (err) {
      expect(err).toBeInstanceOf(FederatedPrivacyError);
      caughtCode = (err as FederatedPrivacyError).code;
    }
    expect(caughtCode).toBe("PRIVACY_BUDGET_EXCEEDED");
    expect(ledger.roundsParticipated).toBe(1);
    expect(ledger.epsilonSpent).toBeCloseTo(1.0, 10);
  });

  it("10. 프라이버시 δ 예산 초과 시도 역시 Fail-Closed로 차단한다", () => {
    const base = createDefaultStyleAdapterVector();
    const samples = [{ sessionId: "s1", observedStyle: createDefaultStyleAdapterVector({ inkBlackFloor: 0.08 }) }];
    const ledger = new PrivacyBudgetLedger({ studioId: "s-d", participantId: "l2", maxEpsilonBudget: 10, maxDeltaBudget: 2e-5 });
    extractLocalStyleDelta(base, samples, { epsilon: 1, delta: 1.5e-5, maxL2Norm: 0.3, seed: 41 }, ledger);
    expect(() => extractLocalStyleDelta(base, samples, { epsilon: 1, delta: 1e-5, maxL2Norm: 0.3, seed: 42 }, ledger)).toThrow(FederatedPrivacyError);
    expect(ledger.roundsParticipated).toBe(1);
  });

  it("11. 빈 로컬 표본 목록은 EMPTY_LOCAL_SAMPLES 오류를 반환한다", () => {
    const ledger = new PrivacyBudgetLedger({ studioId: "s-e", participantId: "a", maxEpsilonBudget: 3 });
    expect(() => extractLocalStyleDelta(createDefaultStyleAdapterVector(), [], { epsilon: 1, delta: 1e-5, maxL2Norm: 0.5, seed: 1 }, ledger)).toThrow(FederatedPrivacyError);
  });

  it("12. 제로 원본 원고 가드: 정상 클리핑+DP 화풍 델타 봉투는 통과한다", () => {
    const verdict = validateZeroRawArtworkPayload(makeCleanEnvelope("a1", "color-assistant", makeDelta({ celRampHardness: 0.05 })));
    expect(verdict.safe).toBe(true);
    expect(verdict.rawArtworkUploaded).toBe(false);
    expect(verdict.violations).toHaveLength(0);
  });

  it("13. 제로 원본 원고 가드: 은닉된 Uint8Array·Float32Array 래스터 버퍼를 차단한다", () => {
    const res1 = validateZeroRawArtworkPayload({ ...makeCleanEnvelope("e1", "color-assistant", makeDelta({})), sideChannel: new Uint8Array([255, 128, 64, 255]) });
    const res2 = validateZeroRawArtworkPayload({ ...makeCleanEnvelope("e2", "color-assistant", makeDelta({})), nested: { tileDump: new Float32Array([0.1, 0.2, 0.3]) } });
    expect(res1.safe).toBe(false);
    expect(res1.violations.some((v) => v.code === "TYPED_ARRAY_OR_BUFFER")).toBe(true);
    expect(res2.safe).toBe(false);
    expect(res2.violations.some((v) => v.code === "TYPED_ARRAY_OR_BUFFER")).toBe(true);
  });

  it("14. 제로 원본 원고 가드: 은닉된 원시 스트로크 좌표 배열({x,y} 및 [x,y])을 차단한다", () => {
    const objRes = validateZeroRawArtworkPayload({
      ...makeCleanEnvelope("e1", "line-assistant", makeDelta({})),
      extraMetadata: [{ x: 120.5, y: 240.2, pressure: 0.8 }, { x: 124.1, y: 245.9, pressure: 0.9 }],
    });
    const tupleRes = validateZeroRawArtworkPayload({
      ...makeCleanEnvelope("e2", "line-assistant", makeDelta({})),
      extraMetadata: [[10, 20], [15, 25], [20, 35]],
    });
    expect(objRes.safe).toBe(false);
    expect(objRes.violations.some((v) => v.code === "RAW_STROKE_COORDINATES")).toBe(true);
    expect(tupleRes.safe).toBe(false);
  });

  it("15. 제로 원본 원고 가드: 미공개 대사·스크립트 텍스트, PNG 데이터 URL, 플래그 위조를 차단한다", () => {
    const baseEnv = makeCleanEnvelope("e", "color-assistant", makeDelta({}));
    expect(validateZeroRawArtworkPayload({ ...baseEnv, dialogue: "52화 최종 흑막은 주인공의 형이다" }).safe).toBe(false);
    expect(validateZeroRawArtworkPayload({ ...baseEnv, memo: "「여기서 반전이 터진다」" }).safe).toBe(false);
    expect(validateZeroRawArtworkPayload({ ...baseEnv, preview: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" }).safe).toBe(false);
    expect(validateZeroRawArtworkPayload({ ...baseEnv, rawArtworkUploaded: true }).safe).toBe(false);
  });

  it("16. 순수 ES2017 FIPS 180-4 SHA-256 구현이 NIST 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256FederatedHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256FederatedHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256FederatedHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("17. 정규 직렬화는 키 순서와 -0 정규화에 관계없이 동일한 SHA-256 해시를 산출한다", () => {
    const objA = { b: 2, a: 1, nested: { z: -0, y: "한글" } };
    const objB = { nested: { y: "한글", z: 0 }, a: 1, b: 2 };
    expect(canonicalSerializeFederated(objA)).toBe(canonicalSerializeFederated(objB));
    expect(sha256FederatedHex(canonicalSerializeFederated(objA))).toBe(sha256FederatedHex(canonicalSerializeFederated(objB)));
  });

  it("18. weighted-fedavg는 메인 작가(lead-artist)의 역할 권한 가중치를 어시스턴트보다 높게 반영한다", () => {
    const base = createDefaultStyleAdapterVector();
    const res = aggregateFederatedStyleRound(
      base,
      [
        makeCleanEnvelope("lead", "lead-artist", makeDelta({ celRampHardness: 0.12 })),
        makeCleanEnvelope("c1", "color-assistant", makeDelta({ celRampHardness: 0.0 })),
      ],
      {
        studioId: "s-role", roundIndex: 1, aggregator: "weighted-fedavg",
        roleWeights: { "lead-artist": 3.0, "color-assistant": 1.0, "line-assistant": 1.0 },
        maxAcceptedL2Norm: 2.0, outlierZScoreThreshold: 10.0, leadArtistAnchor: base,
        driftGuard: { maxCosineDistance: 0.5, maxAxisDrift: 0.5, maxOklchShadowDrift: 0.5 },
      },
    );
    expect(res.decision).toBe("APPLIED");
    expect(res.aggregatedDelta.celRampHardness).toBeCloseTo(0.09, 10);
  });

  it("19. MAD 강건 Z-score 이상치 탐지가 50배 오염된 어시스턴트 업데이트를 자동 거부한다", () => {
    const base = createDefaultStyleAdapterVector();
    const poisoned = scaleStyleVector(makeDelta({ celRampHardness: 0.06, rimLightIntensity: 0.04 }), 50);
    const res = aggregateFederatedStyleRound(
      base,
      [
        makeCleanEnvelope("lead", "lead-artist", makeDelta({ celRampHardness: 0.062, rimLightIntensity: 0.038 })),
        makeCleanEnvelope("a1", "color-assistant", makeDelta({ celRampHardness: 0.058, rimLightIntensity: 0.042 })),
        makeCleanEnvelope("a2", "color-assistant", makeDelta({ celRampHardness: 0.061, rimLightIntensity: 0.039 })),
        makeCleanEnvelope("a3", "line-assistant", makeDelta({ celRampHardness: 0.059, rimLightIntensity: 0.041 })),
        makeCleanEnvelope("poisoned-a4", "color-assistant", poisoned),
      ],
      {
        studioId: "s-rej", roundIndex: 1, aggregator: "weighted-fedavg",
        maxAcceptedL2Norm: 10.0, outlierZScoreThreshold: 3.0, outlierHandling: "reject",
        leadArtistAnchor: base, driftGuard: { maxCosineDistance: 0.25, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.25 },
      },
    );
    expect(res.decision).toBe("APPLIED");
    expect(res.rejectedOutlierCount).toBe(1);
    expect(res.participantAudits.find((a) => a.participantId === "poisoned-a4")?.rejectionReason).toBe("STATISTICAL_OUTLIER");
    expect(res.aggregatedDelta.celRampHardness).toBeCloseTo(0.06, 2);
  });

  it("20. outlierHandling='downweight' 모드는 이상치 가중치를 자동 감쇠해 영향을 최소화한다", () => {
    const base = createDefaultStyleAdapterVector();
    const res = aggregateFederatedStyleRound(
      base,
      [
        makeCleanEnvelope("lead", "lead-artist", makeDelta({ rimLightIntensity: 0.05 })),
        makeCleanEnvelope("a1", "color-assistant", makeDelta({ rimLightIntensity: 0.052 })),
        makeCleanEnvelope("a2", "color-assistant", makeDelta({ rimLightIntensity: 0.048 })),
        makeCleanEnvelope("a3", "line-assistant", makeDelta({ rimLightIntensity: 0.051 })),
        makeCleanEnvelope("noisy-a4", "color-assistant", makeDelta({ rimLightIntensity: 2.5 })),
      ],
      {
        studioId: "s-dw", roundIndex: 1, aggregator: "weighted-fedavg",
        maxAcceptedL2Norm: 10.0, outlierZScoreThreshold: 3.0, outlierHandling: "downweight",
        leadArtistAnchor: base, driftGuard: { maxCosineDistance: 0.25, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.25 },
      },
    );
    expect(res.downweightedCount).toBe(1);
    expect(res.rejectedOutlierCount).toBe(0);
    expect(res.aggregatedDelta.rimLightIntensity).toBeCloseTo(0.05, 2);
  });

  it("21. 비잔틴 내성 coordinate-trimmed-mean이 사전 거부 없이도 50배 오염 업데이트를 무력화하고 수렴한다", () => {
    const base = createDefaultStyleAdapterVector();
    const poisoned50x = scaleStyleVector(makeDelta({ lineWeightGamma: 0.08, shadowChromaGain: 0.05, skinSubsurfaceWarmth: 0.04 }), 50);
    const res = aggregateFederatedStyleRound(
      base,
      [
        makeCleanEnvelope("lead", "lead-artist", makeDelta({ lineWeightGamma: 0.081, shadowChromaGain: 0.051, skinSubsurfaceWarmth: 0.041 })),
        makeCleanEnvelope("a1", "color-assistant", makeDelta({ lineWeightGamma: 0.079, shadowChromaGain: 0.049, skinSubsurfaceWarmth: 0.039 })),
        makeCleanEnvelope("a2", "color-assistant", makeDelta({ lineWeightGamma: 0.082, shadowChromaGain: 0.052, skinSubsurfaceWarmth: 0.042 })),
        makeCleanEnvelope("a3", "line-assistant", makeDelta({ lineWeightGamma: 0.078, shadowChromaGain: 0.048, skinSubsurfaceWarmth: 0.038 })),
        makeCleanEnvelope("byzantine-50x", "color-assistant", poisoned50x),
      ],
      {
        studioId: "s-trim", roundIndex: 1, aggregator: "coordinate-trimmed-mean", trimFraction: 0.2,
        maxAcceptedL2Norm: 50.0, outlierZScoreThreshold: 1e9, leadArtistAnchor: base,
        driftGuard: { maxCosineDistance: 0.25, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.25 },
      },
    );
    expect(res.decision).toBe("APPLIED");
    expect(res.aggregatedDelta.lineWeightGamma).toBeCloseTo(0.08, 2);
    expect(res.aggregatedDelta.shadowChromaGain).toBeCloseTo(0.05, 2);
    expect(res.aggregatedDelta.skinSubsurfaceWarmth).toBeCloseTo(0.04, 2);
  });

  it("22. 비잔틴 내성 coordinate-median이 사전 거부 없이도 50배 오염 업데이트를 완벽히 차단하고 수렴한다", () => {
    const base = createDefaultStyleAdapterVector();
    const poisoned50x = scaleStyleVector(makeDelta({ celRampHardness: 0.06, eyeSpecularBrightness: -0.05, colorTempKelvinNorm: 0.04 }), 50);
    const res = aggregateFederatedStyleRound(
      base,
      [
        makeCleanEnvelope("lead", "lead-artist", makeDelta({ celRampHardness: 0.06, eyeSpecularBrightness: -0.05, colorTempKelvinNorm: 0.04 })),
        makeCleanEnvelope("a1", "color-assistant", makeDelta({ celRampHardness: 0.062, eyeSpecularBrightness: -0.048, colorTempKelvinNorm: 0.042 })),
        makeCleanEnvelope("a2", "color-assistant", makeDelta({ celRampHardness: 0.058, eyeSpecularBrightness: -0.052, colorTempKelvinNorm: 0.038 })),
        makeCleanEnvelope("a3", "line-assistant", makeDelta({ celRampHardness: 0.061, eyeSpecularBrightness: -0.049, colorTempKelvinNorm: 0.041 })),
        makeCleanEnvelope("byzantine-50x", "color-assistant", poisoned50x),
      ],
      {
        studioId: "s-med", roundIndex: 1, aggregator: "coordinate-median",
        maxAcceptedL2Norm: 50.0, outlierZScoreThreshold: 1e9, leadArtistAnchor: base,
        driftGuard: { maxCosineDistance: 0.25, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.25 },
      },
    );
    expect(res.decision).toBe("APPLIED");
    expect(res.aggregatedDelta.celRampHardness).toBeCloseTo(0.06, 2);
    expect(res.aggregatedDelta.eyeSpecularBrightness).toBeCloseTo(-0.05, 2);
    expect(res.aggregatedDelta.colorTempKelvinNorm).toBeCloseTo(0.04, 2);
  });

  it("23. 집계기가 제출 봉투 내부에 은닉된 원본 픽셀·대사를 사전 차단하고 해당 참여자를 거부한다", () => {
    const base = createDefaultStyleAdapterVector();
    const smuggled = {
      ...makeCleanEnvelope("smuggler", "color-assistant", makeDelta({ celRampHardness: 0.2 })),
      rawImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    } as unknown as FederatedStyleDeltaEnvelope;
    const res = aggregateFederatedStyleRound(
      base,
      [makeCleanEnvelope("honest-1", "lead-artist", makeDelta({ celRampHardness: 0.04 })), smuggled],
      {
        studioId: "s-egress", roundIndex: 1, aggregator: "weighted-fedavg",
        maxAcceptedL2Norm: 2.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: base,
        driftGuard: { maxCosineDistance: 0.25, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.25 },
      },
    );
    expect(res.rejectedOutlierCount).toBe(1);
    expect(res.participantAudits.find((a) => a.participantId === "smuggler")?.rejectionReason).toBe("RAW_ARTWORK_VIOLATION");
    expect(res.aggregatedDelta.celRampHardness).toBeCloseTo(0.04, 10);
  });

  it("24. 메인 작가 앵커 드리프트 가드가 극단적 이탈 시 ROLLED_BACK_DRIFT_GUARD로 자동 롤백한다", () => {
    const anchor = createDefaultStyleAdapterVector();
    const extreme = makeDelta({ shadowHueShiftDeg: 30, shadowChromaGain: 0.55, celRampHardness: -0.55, inkBlackFloor: 0.25 });
    const res = aggregateFederatedStyleRound(
      anchor,
      [
        makeCleanEnvelope("a1", "color-assistant", extreme),
        makeCleanEnvelope("a2", "color-assistant", extreme),
        makeCleanEnvelope("a3", "line-assistant", extreme),
      ],
      {
        studioId: "s-drift", roundIndex: 1, aggregator: "coordinate-median",
        maxAcceptedL2Norm: 40.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: anchor,
        driftGuard: { maxCosineDistance: 0.05, maxAxisDrift: 0.25, maxOklchShadowDrift: 0.08 },
      },
    );
    expect(res.decision).toBe("ROLLED_BACK_DRIFT_GUARD");
    expect(res.rolledBack).toBe(true);
    expect(res.driftMetrics.exceededChecks.length).toBeGreaterThan(0);
    expect(res.nextAdapter).toEqual(anchor);
  });

  it("25. 모든 제출이 노름 초과로 거부되면 ROLLED_BACK_NO_VALID_DELTAS로 직전 어댑터를 보존한다", () => {
    const base = createDefaultStyleAdapterVector();
    const res = aggregateFederatedStyleRound(
      base,
      [makeCleanEnvelope("huge-1", "color-assistant", makeDelta({ shadowHueShiftDeg: 25 }))],
      {
        studioId: "s-norm", roundIndex: 1, aggregator: "weighted-fedavg",
        maxAcceptedL2Norm: 1.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: base,
        driftGuard: { maxCosineDistance: 0.2, maxAxisDrift: 0.2, maxOklchShadowDrift: 0.2 },
      },
    );
    expect(res.decision).toBe("ROLLED_BACK_NO_VALID_DELTAS");
    expect(res.rolledBack).toBe(true);
    expect(res.nextAdapter).toEqual(base);
    expect(res.participantAudits[0].rejectionReason).toBe("NORM_VIOLATION");
  });

  it("26. 다중 라운드 SHA-256 해시 체인 감사 원장이 무결성을 검증하고 1글자 변조를 탐지한다", () => {
    const anchor = createDefaultStyleAdapterVector();
    let current = anchor;
    let prevHash: string | undefined;
    const entries = [];
    for (let round = 1; round <= 3; round += 1) {
      const delta = makeDelta({ celRampHardness: 0.02, rimLightIntensity: 0.015 });
      const res = aggregateFederatedStyleRound(
        current,
        [makeCleanEnvelope("lead", "lead-artist", delta, round), makeCleanEnvelope("a1", "color-assistant", delta, round)],
        {
          studioId: "s-chain", roundIndex: round, aggregator: "weighted-fedavg",
          maxAcceptedL2Norm: 1.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: anchor,
          driftGuard: { maxCosineDistance: 0.3, maxAxisDrift: 0.3, maxOklchShadowDrift: 0.3 },
          previousChainHashHex: prevHash, recordedAtIso: `2026-11-28T0${round}:00:00.000Z`,
        },
      );
      entries.push(res.auditEntry);
      current = res.nextAdapter;
      prevHash = res.auditEntry.entryHashHex;
    }

    expect(verifyFederatedAuditChain(entries, "s-chain").valid).toBe(true);
    const orig = entries[1].entryHashHex;
    const flipped = `${orig[0] === "a" ? "b" : "a"}${orig.slice(1)}`;
    const hashTamper = verifyFederatedAuditChain([entries[0], { ...entries[1], entryHashHex: flipped }, entries[2]], "s-chain");
    expect(hashTamper.valid).toBe(false);
    expect(hashTamper.failedRoundIndex).toBe(2);

    const decisionTamper = verifyFederatedAuditChain([entries[0], { ...entries[1], decision: "ROLLED_BACK_DRIFT_GUARD" as const }, entries[2]], "s-chain");
    expect(decisionTamper.valid).toBe(false);
    expect(decisionTamper.failedRoundIndex).toBe(2);
  });

  it("27. computeAssistantStyleAlignment가 0..100 정합도와 상위 3개 이탈 축 한국어 조율 힌트를 산출한다", () => {
    const team = createDefaultStyleAdapterVector();
    expect(computeAssistantStyleAlignment(team, team).alignmentScore).toBe(100);

    const drifted = createDefaultStyleAdapterVector({
      celRampHardness: 0.18, rimLightIntensity: 0.78, shadowHueShiftDeg: -15.0, paperGrainContrast: 0.22,
    });
    const report = computeAssistantStyleAlignment(drifted, team);
    expect(report.alignmentScore).toBeLessThan(100);
    expect(report.alignmentScore).toBeGreaterThan(0);
    expect(report.topDivergingAxes.map((a) => a.axis)).toEqual([
      "celRampHardness", "rimLightIntensity", "shadowHueShiftDeg",
    ]);
    for (const hint of report.topDivergingAxes) {
      expect(hint.tuningHintKo).toContain(hint.labelKo);
      expect(hint.tuningHintKo).not.toMatch(/하는 것을 가능하게|직관적인 경험을 제공/);
    }
  });

  it("28. renderFederatedStyleConvergenceSvg가 NaN/Infinity 없이 XML 이스케이프된 인쇄 안전 SVG를 생성한다", () => {
    const anchor = createDefaultStyleAdapterVector();
    const targetStyle = addStyleVectors(anchor, makeDelta({ celRampHardness: 0.04 }));
    const ledger = new PrivacyBudgetLedger({ studioId: "studio-svg-audit", participantId: "lead-1", maxEpsilonBudget: 4.0 });
    const leadExtracted = extractLocalStyleDelta(
      anchor,
      [{ sessionId: "s-lead", observedStyle: targetStyle }],
      { epsilon: 2.0, delta: 1e-5, maxL2Norm: 0.06, seed: 701 },
      ledger,
      { role: "lead-artist" },
    );
    const makeDpPeer = (id: string, seed: number): FederatedStyleDeltaEnvelope =>
      extractLocalStyleDelta(
        anchor,
        [{ sessionId: `s-${id}`, observedStyle: targetStyle }],
        { epsilon: 2.0, delta: 1e-5, maxL2Norm: 0.06, seed },
        new PrivacyBudgetLedger({ studioId: "studio-svg-audit", participantId: id, maxEpsilonBudget: 4.0 }),
      ).envelope;
    const round1 = aggregateFederatedStyleRound(
      anchor,
      [
        leadExtracted.envelope,
        makeDpPeer("a1", 702),
        makeDpPeer("a2", 703),
        makeDpPeer("a3", 704),
        makeCleanEnvelope("poison", "color-assistant", makeDelta({ celRampHardness: 8.5 })),
      ],
      {
        studioId: "studio-svg-audit", roundIndex: 1, aggregator: "coordinate-trimmed-mean",
        maxAcceptedL2Norm: 10.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: anchor,
        driftGuard: { maxCosineDistance: 0.4, maxAxisDrift: 0.5, maxOklchShadowDrift: 0.4 },
      },
    );
    const unsafeSnapshot: PrivacyBudgetSnapshot = {
      ...ledger.getSnapshot(),
      studioId: 'studio-<xss>&"quote"',
      participantId: "lead<1>&'",
    };
    const svg = renderFederatedStyleConvergenceSvg([round1], unsafeSnapshot, {
      titleKo: '화풍 감사 <script>alert("x")</script>',
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;xss&gt;&amp;&quot;quote&quot;");
    expect(svg).toContain("이상치 -1");
    expect(svg).toContain("ZERO RAW ARTWORK");

    const emptySvg = renderFederatedStyleConvergenceSvg([], ledger);
    expect(emptySvg).not.toContain("NaN");
    expect(emptySvg).toContain("기록된 연합 라운드가 아직 없습니다.");
  });

  it("29. summarizeFederatedStyleRoundKo가 번역투 없는 한국어 요약과 예산·롤백 상태를 출력한다", () => {
    const anchor = createDefaultStyleAdapterVector();
    const ledger = new PrivacyBudgetLedger({ studioId: "studio-hanriver", participantId: "lead-park", maxEpsilonBudget: 5.0 });
    extractLocalStyleDelta(anchor, [{ sessionId: "ep1", observedStyle: anchor }], { epsilon: 1.25, delta: 1e-5, maxL2Norm: 0.3, seed: 901 }, ledger);

    const rolledBackRound = aggregateFederatedStyleRound(
      anchor,
      [makeCleanEnvelope("a1", "color-assistant", makeDelta({ shadowHueShiftDeg: 35, celRampHardness: -0.6 }))],
      {
        studioId: "studio-hanriver", roundIndex: 2, aggregator: "coordinate-median",
        maxAcceptedL2Norm: 50.0, outlierZScoreThreshold: 3.0, leadArtistAnchor: anchor,
        driftGuard: { maxCosineDistance: 0.05, maxAxisDrift: 0.2, maxOklchShadowDrift: 0.08 },
      },
    );
    const summary = summarizeFederatedStyleRoundKo(rolledBackRound, ledger);
    expect(summary.statusBadgeKo).toBe("드리프트 롤백");
    expect(summary.zeroRawArtworkVerified).toBe(true);
    expect(summary.remainingEpsilon).toBeCloseTo(3.75, 6);
    expect(summary.budgetUtilizationPercent).toBeCloseTo(25.0, 1);
    expect(summary.markdownReportKo).toContain("원본 원고");
    expect(summary.markdownReportKo).toContain("드리프트 롤백");
    expect(summary.markdownReportKo).not.toMatch(/하는 것을 가능하게|직관적인 경험을 제공|원활한 워크플로우/);
  });

  it("30. tupleToVector가 비정상 차원 또는 NaN 입력을 즉시 차단한다", () => {
    expect(() => tupleToVector([0, 1, 2])).toThrow(FederatedPrivacyError);
    const bad16 = new Array<number>(16).fill(0);
    bad16[5] = Number.NaN;
    expect(() => tupleToVector(bad16)).toThrow(FederatedPrivacyError);
  });
});
