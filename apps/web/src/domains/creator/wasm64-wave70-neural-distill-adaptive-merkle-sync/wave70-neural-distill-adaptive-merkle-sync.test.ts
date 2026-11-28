import { describe, expect, it } from "vitest";

import {
  MAX_CORE_VISIBLE_CONTROLS,
  MIN_CANVAS_VIEWPORT_RATIO,
  MIN_CORE_VISIBLE_CONTROLS,
  MIN_TOUCH_TARGET_PX,
  MerkleCrdtAssetLedger,
  TOP_CONTEXT_BAR_HEIGHT_PX,
  computeCosineSimilarity,
  computeTemperatureScaledKlDivergence,
  createScopedVaultInferenceRunner,
  dequantizeStudentWeightMatrix,
  distillTeacherToStudentWeights,
  evaluateAdaptiveStudioFocusState,
  evaluateDistilledStudentLayer,
  hmacSha256Hex,
  issueVaultLeaseGrant,
  packInt4Values,
  sealCreatorStyleVaultBundle,
  sha256Hex,
  unpackInt4Values,
  verifyVaultLeaseGrant,
  type CreatorInteractionTelemetry,
  type CreatorStyleVaultPolicy,
  type MerkleCrdtNode,
  type StudioViewportContext,
  type TeacherLinearLayer,
} from "./index";

function createStructuredTeacherLayer(
  layerId: string,
  outputDim: number,
  inputDim: number,
  intrinsicRank: number,
  noiseScale = 0.015,
): TeacherLinearLayer {
  const weights = new Float32Array(outputDim * inputDim);
  const bias = new Float32Array(outputDim);
  for (let i = 0; i < outputDim; i += 1) {
    bias[i] = 0.15 * Math.sin((i + 1) * 0.43);
    for (let j = 0; j < inputDim; j += 1) {
      let val = 0;
      for (let k = 1; k <= intrinsicRank; k += 1) {
        val += (1.6 / Math.pow(k, 0.85)) * Math.sin(((i + 1) * k * Math.PI) / (outputDim + 1)) * Math.cos(((j + 0.5) * k * Math.PI) / inputDim);
      }
      weights[i * inputDim + j] = val / Math.sqrt(intrinsicRank) + noiseScale * Math.sin((i * 31 + j * 17 + 7) * 0.73);
    }
  }
  return { layerId, domain: "style-transfer", inputDim, outputDim, weights, bias };
}

function forwardTeacherReference(teacher: TeacherLinearLayer, input: Float32Array): Float32Array {
  const out = new Float32Array(teacher.outputDim);
  for (let r = 0; r < teacher.outputDim; r += 1) {
    let acc = teacher.bias[r] ?? 0;
    const off = r * teacher.inputDim;
    for (let c = 0; c < teacher.inputDim; c += 1) acc += (teacher.weights[off + c] ?? 0) * (input[c] ?? 0);
    out[r] = acc;
  }
  return out;
}

function makeTelemetry(overrides: Partial<CreatorInteractionTelemetry> = {}): CreatorInteractionTelemetry {
  return {
    telemetryScope: "creator-interaction-only",
    isMedicalOrBiometric: false,
    windowSeconds: 30,
    strokeRatePerMin: 18,
    meanStrokeDurationMs: 420,
    undoBurstCount: 1,
    toolSwitchRatePerMin: 3,
    pointerJitterPx: 0.9,
    viewportZoom: 1.25,
    idleDurationMs: 400,
    activeToolFamily: "pencil-sketch",
    ...overrides,
  };
}

const DESKTOP_VP: StudioViewportContext = { viewportWidthPx: 1440, viewportHeightPx: 900 };

describe("Wave 70 — 실시간 온디바이스 신경망 가중치 증류기", () => {
  it("INT4 니블 패킹/언패킹이 [-7..7] 전체 부호 범위에서 무손실 왕복된다", () => {
    const sample = new Int8Array([-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]);
    const packed = packInt4Values(sample);
    expect(packed.byteLength).toBe(Math.ceil(sample.length / 2));
    expect(Array.from(unpackInt4Values(packed, sample.length))).toEqual(Array.from(sample));
  });

  it("FP32→INT4 저랭크 증류 시 8배 이상 압축과 출력 코사인 유사도 >= 0.94를 동시에 달성한다", () => {
    const teacher = createStructuredTeacherLayer("style-ink-proj", 64, 64, 8, 0.01);
    const student = distillTeacherToStudentWeights(teacher, { quantizationBits: 4, targetRank: 10, temperature: 2.0, calibrationSteps: 14 });
    expect(student.decompositionMode).toBe("low-rank-svd");
    expect(student.metrics.compressionRatio).toBeGreaterThanOrEqual(8);
    expect(student.metrics.totalCompressionRatio).toBeGreaterThanOrEqual(8);
    expect(student.metrics.meanOutputCosineSimilarity).toBeGreaterThanOrEqual(0.94);
    expect(student.metrics.minOutputCosineSimilarity).toBeGreaterThanOrEqual(0.92);
    expect(student.metrics.outputMse).toBeLessThan(0.25);
    expect(student.metrics.klDivergenceAfterCalibration).toBeLessThanOrEqual(student.metrics.klDivergenceBeforeCalibration + 1e-6);
  });

  it("FP32→INT8 저랭크 증류 시 4배 이상 압축과 출력 코사인 유사도 >= 0.99를 달성한다", () => {
    const teacher = createStructuredTeacherLayer("cel-shading-mlp", 64, 64, 8, 0.01);
    const student = distillTeacherToStudentWeights(teacher, { quantizationBits: 8, targetRank: 10, temperature: 2.5 });
    expect(student.metrics.compressionRatio).toBeGreaterThanOrEqual(4);
    expect(student.metrics.meanOutputCosineSimilarity).toBeGreaterThanOrEqual(0.99);
    expect(student.metrics.relativeFrobeniusError).toBeLessThan(0.08);
    expect(student.metrics.explainedEnergyRatio).toBeGreaterThanOrEqual(0.98);
  });

  it("대형 96x96 레이어의 INT4 저랭크 증류에서 12배+ 초경량 압축과 연산량 가속을 검증한다", () => {
    const teacher = createStructuredTeacherLayer("brush-texture-96", 96, 96, 8, 0.008);
    const student = distillTeacherToStudentWeights(teacher, { quantizationBits: 4, targetRank: 10 });
    expect(student.metrics.compressionRatio).toBeGreaterThanOrEqual(12);
    expect(student.metrics.meanOutputCosineSimilarity).toBeGreaterThanOrEqual(0.94);

    const probe = new Float32Array(96);
    for (let i = 0; i < 96; i += 1) probe[i] = Math.cos(i * 0.27);
    const infer = evaluateDistilledStudentLayer(student, probe);
    expect(computeCosineSimilarity(forwardTeacherReference(teacher, probe), infer.output)).toBeGreaterThanOrEqual(0.94);
    expect(infer.flopSpeedupRatio).toBeGreaterThanOrEqual(4);
  });

  it("직접 채널별 INT4 양자화 모드도 4배 이상 압축 및 높은 코사인 유사도를 유지한다", () => {
    const teacher = createStructuredTeacherLayer("line-cleanup-direct", 32, 32, 16, 0.05);
    const student = distillTeacherToStudentWeights(teacher, { quantizationBits: 4, decompositionPreference: "direct-per-channel" });
    expect(student.decompositionMode).toBe("direct-per-channel");
    expect(student.directWeights).not.toBeNull();
    expect(student.metrics.compressionRatio).toBeGreaterThanOrEqual(4);
    expect(student.metrics.meanOutputCosineSimilarity).toBeGreaterThanOrEqual(0.96);
  });

  it("복원 가중치 행렬과 양자화 직접 추론 결과가 수치적으로 일치한다", () => {
    const teacher = createStructuredTeacherLayer("consistency-check", 24, 32, 6, 0.01);
    const student = distillTeacherToStudentWeights(teacher, { quantizationBits: 8, targetRank: 6 });
    const probe = new Float32Array(32);
    for (let i = 0; i < 32; i += 1) probe[i] = (i % 5) * 0.25 - 0.5;

    const directInfer = evaluateDistilledStudentLayer(student, probe);
    const wMat = dequantizeStudentWeightMatrix(student);
    const manual = new Float32Array(24);
    for (let r = 0; r < 24; r += 1) {
      let acc = student.bias[r] ?? 0;
      for (let c = 0; c < 32; c += 1) acc += (wMat[r * 32 + c] ?? 0) * (probe[c] ?? 0);
      manual[r] = acc;
    }
    expect(computeCosineSimilarity(directInfer.output, manual)).toBeGreaterThan(0.99999);
  });

  it("영행렬 교사 레이어와 비정상 입력(NaN·차원 불일치)을 안전하게 처리·차단한다", () => {
    const zeroTeacher: TeacherLinearLayer = {
      layerId: "zero-safe", domain: "brush-dynamics", inputDim: 8, outputDim: 8,
      weights: new Float32Array(64), bias: new Float32Array(8),
    };
    const zeroStudent = distillTeacherToStudentWeights(zeroTeacher, { quantizationBits: 4 });
    expect(zeroStudent.metrics.meanOutputCosineSimilarity).toBe(1);
    expect(zeroStudent.metrics.outputMse).toBe(0);
    expect(computeTemperatureScaledKlDivergence([1, 2, 3], [1, 2, 3], 2.0)).toBe(0);

    const broken = new Float32Array(64);
    broken[3] = Number.NaN;
    expect(() => distillTeacherToStudentWeights({ ...zeroTeacher, weights: broken })).toThrow(/유한하지 않은/);
    expect(() => evaluateDistilledStudentLayer(zeroStudent, new Float32Array(4))).toThrow(/차원/);
  });
});

describe("Wave 70 — 창작 부하 적응형 미니멀 UI 및 브러시 응답 최적화기", () => {
  it("정밀 선화(deep-inking) 국면에서 보조 패널을 접고 캔버스 90% 이상과 높은 안정화를 제공한다", () => {
    const d = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "ink-pen", viewportZoom: 2.6, meanStrokeDurationMs: 680, strokeRatePerMin: 14, toolSwitchRatePerMin: 2, undoBurstCount: 0, pointerJitterPx: 1.4 }),
      DESKTOP_VP,
    );
    expect(d.isMedicalOrBiometric).toBe(false);
    expect(d.telemetryScope).toBe("creator-interaction-only");
    expect(d.regime).toBe("deep-inking");
    expect(d.canvasViewportRatio).toBeGreaterThanOrEqual(0.9);
    expect(d.topContextBarHeightPx).toBe(TOP_CONTEXT_BAR_HEIGHT_PX);
    expect(d.brushResponse.stabilizationStrength).toBeGreaterThanOrEqual(0.55);
  });

  it("러프 스케치(exploratory-sketch) 국면에서는 낮은 지연·높은 예측 리드타임으로 빠른 반응성을 우선한다", () => {
    const d = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "pencil-sketch", viewportZoom: 1.0, strokeRatePerMin: 38, meanStrokeDurationMs: 220, undoBurstCount: 1, pointerJitterPx: 0.7 }),
      DESKTOP_VP,
    );
    expect(d.regime).toBe("exploratory-sketch");
    expect(d.canvasViewportRatio).toBeGreaterThanOrEqual(MIN_CANVAS_VIEWPORT_RATIO);
    expect(d.brushResponse.stabilizationStrength).toBeLessThan(0.35);
    expect(d.brushResponse.predictionLeadTimeMs).toBeGreaterThanOrEqual(10);
  });

  it("채색 블록(color-blocking) 국면에서는 팔레트를 유지하면서도 캔버스 >= 82% 불변식을 지킨다", () => {
    const d = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "fill-bucket", viewportZoom: 1.2, strokeRatePerMin: 16, toolSwitchRatePerMin: 8, undoBurstCount: 1, pointerJitterPx: 0.6 }),
      DESKTOP_VP,
    );
    expect(d.regime).toBe("color-blocking");
    expect(d.auxiliaryPanels.find((p) => p.panelId === "color-palette")?.mode).toBe("expanded");
    expect(d.canvasViewportRatio).toBeGreaterThanOrEqual(MIN_CANVAS_VIEWPORT_RATIO);
  });

  it("반복 수정(high-friction-correction) 국면에서는 손떨림 보정을 최대로 높이고 오버슈트 방지를 위해 예측 리드를 축소한다", () => {
    const d = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "eraser", undoBurstCount: 8, strokeRatePerMin: 14, toolSwitchRatePerMin: 16, pointerJitterPx: 3.4, viewportZoom: 2.2 }),
      DESKTOP_VP,
    );
    expect(d.regime).toBe("high-friction-correction");
    expect(d.brushResponse.stabilizationStrength).toBeGreaterThanOrEqual(0.75);
    expect(d.brushResponse.predictionLeadTimeMs).toBeLessThanOrEqual(3.5);
    expect(d.canvasViewportRatio).toBeGreaterThanOrEqual(0.88);
    expect(d.visibleCoreControls.length).toBe(MIN_CORE_VISIBLE_CONTROLS);
  });

  it("유휴 검토(idle-review) 국면과 reducedMotion 선호 시 예측 리드타임 0ms를 준수한다", () => {
    const idle = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "pan-review", idleDurationMs: 14000, strokeRatePerMin: 0 }),
      DESKTOP_VP,
    );
    expect(idle.regime).toBe("idle-review");
    expect(idle.brushResponse.predictionLeadTimeMs).toBe(0);
    expect(idle.canvasViewportRatio).toBeGreaterThanOrEqual(MIN_CANVAS_VIEWPORT_RATIO);

    const reduced = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "pencil-sketch", strokeRatePerMin: 40 }),
      { ...DESKTOP_VP, reducedMotionPreferred: true },
    );
    expect(reduced.brushResponse.predictionLeadTimeMs).toBe(0);
  });

  it("좁은 모바일 뷰포트(360x640)와 다수 고정 패널 요청에서도 >= 82% 캔버스·5~9 컨트롤·44px 터치 타깃을 지킨다", () => {
    const viewports: StudioViewportContext[] = [
      { viewportWidthPx: 360, viewportHeightPx: 640, manualPinnedPanels: ["layer-dock", "color-palette", "brush-inspector", "history-strip"] },
      { viewportWidthPx: 768, viewportHeightPx: 1024, manualPinnedPanels: ["layer-dock", "color-palette", "reference-board"] },
      { viewportWidthPx: 1280, viewportHeightPx: 720, manualPinnedPanels: ["layer-dock", "color-palette", "navigator-preview", "history-strip"] },
    ];
    for (const vp of viewports) {
      const d = evaluateAdaptiveStudioFocusState(makeTelemetry({ activeToolFamily: "fill-bucket" }), vp);
      expect(d.canvasViewportRatio).toBeGreaterThanOrEqual(MIN_CANVAS_VIEWPORT_RATIO);
      expect(d.visibleCoreControls.length).toBeGreaterThanOrEqual(MIN_CORE_VISIBLE_CONTROLS);
      expect(d.visibleCoreControls.length).toBeLessThanOrEqual(MAX_CORE_VISIBLE_CONTROLS);
      for (const ctrl of d.visibleCoreControls) {
        expect(ctrl.hitWidthPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
        expect(ctrl.hitHeightPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      }
    }
  });

  it("직전 국면과의 점수 차가 미미할 때 히스테리시스로 불필요한 패널 깜빡임을 억제한다", () => {
    const initial = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "ink-pen", viewportZoom: 2.0, strokeRatePerMin: 16, meanStrokeDurationMs: 450 }),
      DESKTOP_VP,
    );
    expect(initial.regime).toBe("deep-inking");

    const borderline = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "pencil-sketch", viewportZoom: 1.7, strokeRatePerMin: 8, meanStrokeDurationMs: 360, toolSwitchRatePerMin: 4 }),
      DESKTOP_VP,
      { previousDecision: initial },
    );
    expect(borderline.hysteresisHeld).toBe(true);
    expect(borderline.regime).toBe("deep-inking");

    const clearShift = evaluateAdaptiveStudioFocusState(
      makeTelemetry({ activeToolFamily: "pencil-sketch", viewportZoom: 1.0, strokeRatePerMin: 38, meanStrokeDurationMs: 220 }),
      DESKTOP_VP,
      { previousDecision: initial },
    );
    expect(clearShift.hysteresisHeld).toBe(false);
    expect(clearShift.regime).toBe("exploratory-sketch");
  });

  it("의료·생체 주장 주입 또는 비정상 뷰포트 크기는 fail-closed 예외로 거부한다", () => {
    const invalid = { ...makeTelemetry(), isMedicalOrBiometric: true as unknown as false };
    expect(() => evaluateAdaptiveStudioFocusState(invalid, DESKTOP_VP)).toThrow(/비의료/);
    expect(() => evaluateAdaptiveStudioFocusState(makeTelemetry(), { viewportWidthPx: 200, viewportHeightPx: 600 })).toThrow(/320px/);
  });
});

describe("Wave 70 — 순수 동기 FIPS 180-4 SHA-256 및 암호화 머클-DAG CRDT 협업 원장", () => {
  it("FIPS 180-4 SHA-256 및 RFC 2104 HMAC-SHA256 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("오프라인 분기된 두 피어가 반대 순서로 병합해도 동일한 머클 루트와 상태에 수렴한다(교환법칙·무손실)", () => {
    const peerA = new MerkleCrdtAssetLedger("artist-a", "ws-secret-key-2026");
    const peerB = new MerkleCrdtAssetLedger("artist-b", "ws-secret-key-2026");

    const genesis = peerA.commitLocalOperation({ kind: "asset-checkpoint", targetId: "cut-01", field: "title", value: "1화 도입부" });
    expect(peerB.mergeNodes([genesis]).accepted).toBe(true);

    peerA.commitLocalOperation({ kind: "stroke-append", targetId: "layer-ink", field: "stroke", value: "M10,10 L80,40" });
    peerA.commitLocalOperation({ kind: "layer-property-set", targetId: "layer-ink", field: "opacity", value: 0.9 });
    peerB.commitLocalOperation({ kind: "stroke-append", targetId: "layer-ink", field: "stroke", value: "M120,20 L180,90" });
    peerB.commitLocalOperation({ kind: "layer-property-set", targetId: "layer-ink", field: "opacity", value: 0.85 });

    const expA = peerA.exportNodes();
    const expB = peerB.exportNodes();
    expect(peerA.mergeNodes(expB).accepted).toBe(true);
    expect(peerB.mergeNodes(expA).accepted).toBe(true);

    expect(peerA.getMerkleRoot()).toBe(peerB.getMerkleRoot());
    expect(peerA.getHeads()).toEqual(peerB.getHeads());
    expect(peerA.materializeState()).toEqual(peerB.materializeState());
    expect(peerA.materializeState().strokesByTarget["layer-ink"]?.length).toBe(2);
  });

  it("3개 피어 병합 시 결합법칙((A∪B)∪C === A∪(B∪C))과 중복 전달 멱등성을 100% 보장한다", () => {
    const p1 = new MerkleCrdtAssetLedger("peer-1");
    const p2 = new MerkleCrdtAssetLedger("peer-2");
    const p3 = new MerkleCrdtAssetLedger("peer-3");
    p1.commitLocalOperation({ kind: "stroke-append", targetId: "bg", field: "s", value: "p1-s1" });
    p2.commitLocalOperation({ kind: "palette-swatch-put", targetId: "pal", field: "sky", value: "dawn-blue" });
    p3.commitLocalOperation({ kind: "layer-order-move", targetId: "fx", field: "zIndex", value: 12 });

    const leftAssoc = new MerkleCrdtAssetLedger("observer-left");
    leftAssoc.mergeNodes(p1.exportNodes());
    leftAssoc.mergeNodes(p2.exportNodes());
    leftAssoc.mergeNodes(p3.exportNodes());

    const rightAssoc = new MerkleCrdtAssetLedger("observer-right");
    rightAssoc.mergeNodes(p3.exportNodes());
    rightAssoc.mergeNodes(p2.exportNodes());
    rightAssoc.mergeNodes(p1.exportNodes());

    expect(leftAssoc.getMerkleRoot()).toBe(rightAssoc.getMerkleRoot());
    expect(leftAssoc.materializeState()).toEqual(rightAssoc.materializeState());

    const rootBeforeDup = leftAssoc.getMerkleRoot();
    const dupMerge = leftAssoc.mergeNodes(p1.exportNodes());
    expect(dupMerge.accepted).toBe(true);
    expect(dupMerge.addedNodeIds.length).toBe(0);
    expect(dupMerge.duplicateNodeIds.length).toBe(1);
    expect(leftAssoc.getMerkleRoot()).toBe(rootBeforeDup);
  });

  it("델타 동기화(exportDeltaForKnownIds)가 미보유 노드만 정확히 전송해 동일 루트에 수렴한다", () => {
    const primary = new MerkleCrdtAssetLedger("primary");
    const replica = new MerkleCrdtAssetLedger("replica");
    const n1 = primary.commitLocalOperation({ kind: "layer-property-set", targetId: "l1", field: "visible", value: true });
    replica.mergeNodes([n1]);
    primary.commitLocalOperation({ kind: "stroke-append", targetId: "l1", field: "stroke", value: "delta-stroke-2" });

    const delta = primary.exportDeltaForKnownIds(new Set(replica.exportNodes().map((n) => n.nodeId)));
    expect(delta.length).toBe(1);
    expect(replica.mergeNodes(delta).accepted).toBe(true);
    expect(replica.getMerkleRoot()).toBe(primary.getMerkleRoot());
  });

  it("노드 본문·페이로드·HMAC 중 1바이트라도 변조되면 fail-closed로 즉시 거부하고 원장을 오염시키지 않는다", () => {
    const sender = new MerkleCrdtAssetLedger("sender", "hmac-key-strict-01");
    const receiver = new MerkleCrdtAssetLedger("receiver", "hmac-key-strict-01");
    const rootBefore = receiver.getMerkleRoot();
    const validNode = sender.commitLocalOperation({ kind: "layer-property-set", targetId: "layer-main", field: "blendMode", value: "multiply" });

    const tamperedValue: MerkleCrdtNode = { ...validNode, operation: { ...validNode.operation, value: "multiplz" } };
    const r1 = receiver.mergeNodes([tamperedValue]);
    expect(r1.accepted).toBe(false);
    expect(r1.reason).toMatch(/변조/);
    expect(receiver.getNodeCount()).toBe(0);
    expect(receiver.getMerkleRoot()).toBe(rootBefore);

    const flippedSig = `${validNode.macSignature?.slice(0, -1) ?? ""}${validNode.macSignature?.endsWith("a") ? "b" : "a"}`;
    const r2 = receiver.mergeNodes([{ ...validNode, macSignature: flippedSig }]);
    expect(r2.accepted).toBe(false);
    expect(r2.reason).toMatch(/HMAC/);
    expect(receiver.getNodeCount()).toBe(0);

    expect(receiver.mergeNodes([validNode]).accepted).toBe(true);
    expect(receiver.verifyChainIntegrity().valid).toBe(true);
  });

  it("누락된 부모 노드를 참조하거나 인과가 깨진 배치를 fail-closed 거부한다", () => {
    const src = new MerkleCrdtAssetLedger("src");
    src.commitLocalOperation({ kind: "stroke-append", targetId: "c1", field: "s", value: "first" });
    const child = src.commitLocalOperation({ kind: "stroke-append", targetId: "c1", field: "s", value: "second" });
    const dst = new MerkleCrdtAssetLedger("dst");
    const orphanRes = dst.mergeNodes([child]);
    expect(orphanRes.accepted).toBe(false);
    expect(orphanRes.reason).toMatch(/누락된 부모/);
    expect(dst.getNodeCount()).toBe(0);
  });
});

describe("Wave 70 — 제로유출 크리에이터 화풍 모델 금고 (Model Vault)", () => {
  const MASTER_SECRET = "creator-vault-master-key-2026-11-28-zero-leak";
  const BASE_NOW = Date.UTC(2026, 10, 28, 12, 0, 0);
  const BASE_POLICY: CreatorStyleVaultPolicy = {
    vaultId: "vault-artist-han-style-01",
    creatorId: "creator-han",
    allowedEpisodeIds: ["ep-041", "ep-042"],
    allowedDeviceFingerprints: ["dev-macbook-studio-a", "dev-ipad-pro-b"],
    notBeforeEpochMs: BASE_NOW - 60_000,
    expiresAtEpochMs: BASE_NOW + 3_600_000,
    maxInferenceSessions: 5,
    allowRawWeightExport: false,
  };

  function buildSealedVault() {
    const student = distillTeacherToStudentWeights(createStructuredTeacherLayer("han-signature-ink", 32, 32, 6, 0.01), { quantizationBits: 4, targetRank: 6 });
    const sealed = sealCreatorStyleVaultBundle({
      studentLayer: student,
      policy: BASE_POLICY,
      vaultMasterSecret: MASTER_SECRET,
      initialLeaseGrantee: {
        leaseId: "lease-ep041-001", granteeId: "assistant-min", episodeId: "ep-041",
        deviceFingerprint: "dev-macbook-studio-a", issuedAtEpochMs: BASE_NOW, expiresAtEpochMs: BASE_NOW + 1_800_000,
      },
    });
    return { student, sealed };
  }

  it("봉인된 금고 암호문에 평문 가중치 JSON이 노출되지 않으며 유효 리스로 추론이 일치한다", () => {
    const { student, sealed } = buildSealedVault();
    const lease = sealed.leaseGrant;
    if (!lease) throw new Error("초기 리스가 생성되어야 합니다.");
    expect(sealed.bundle.ciphertextHex.includes("han-signature-ink")).toBe(false);
    expect(sealed.bundle.ciphertextHex.includes("channelScales")).toBe(false);

    const runnerRes = createScopedVaultInferenceRunner({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 10_000,
    });
    expect(runnerRes.ok).toBe(true);
    if (!runnerRes.ok) return;
    expect(runnerRes.runner.rawWeightsAccessible).toBe(false);

    const probe = new Float32Array(32);
    for (let i = 0; i < 32; i += 1) probe[i] = Math.sin(i * 0.31);
    expect(computeCosineSimilarity(evaluateDistilledStudentLayer(student, probe).output, runnerRes.runner.runInference(probe).output)).toBeGreaterThan(0.999999);
  });

  it("만료된 리스 토큰과 시작 시각 이전 리스를 fail-closed 차단한다", () => {
    const { sealed } = buildSealedVault();
    const lease = sealed.leaseGrant;
    if (!lease) throw new Error("초기 리스가 필요합니다.");

    const expired = verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1_800_000,
    });
    expect(expired.allowed).toBe(false);
    expect(expired.denialCode).toBe("LEASE_EXPIRED");

    const notYet = verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW - 1,
    });
    expect(notYet.allowed).toBe(false);
    expect(notYet.denialCode).toBe("LEASE_NOT_YET_VALID");
  });

  it("허가되지 않은 타 회차(ep-042)·타 디바이스·세션 한도 초과 접근을 fail-closed 차단한다", () => {
    const { sealed } = buildSealedVault();
    const lease = sealed.leaseGrant;
    if (!lease) throw new Error("초기 리스가 필요합니다.");

    expect(verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-042", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000,
    }).denialCode).toBe("EPISODE_SCOPE_DENIED");

    expect(verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-unauthorized-pc", nowEpochMs: BASE_NOW + 1000,
    }).denialCode).toBe("DEVICE_SCOPE_DENIED");

    expect(verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000, usedInferenceSessions: 5,
    }).denialCode).toBe("SESSION_QUOTA_EXCEEDED");
  });

  it("원시 가중치 추출·체크포인트 덤프·재학습 스크래핑 시도를 무조건 차단한다", () => {
    const { sealed } = buildSealedVault();
    const lease = sealed.leaseGrant;
    if (!lease) throw new Error("초기 리스가 필요합니다.");

    for (const action of ["export-raw-weights", "extract-checkpoint", "retrain-scrape"] as const) {
      const res = createScopedVaultInferenceRunner({
        bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: action,
        requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000,
      });
      expect(res.ok).toBe(false);
      expect(res.verification.denialCode).toBe("RAW_EXTRACTION_FORBIDDEN");
    }
  });

  it("금고 암호문 1바이트 변조·위조 리스 서명·폐기된 리스를 즉시 차단한다", () => {
    const { sealed } = buildSealedVault();
    const lease = sealed.leaseGrant;
    if (!lease) throw new Error("초기 리스가 필요합니다.");

    const tamperedCipher = `${sealed.bundle.ciphertextHex.startsWith("0") ? "1" : "0"}${sealed.bundle.ciphertextHex.slice(1)}`;
    expect(createScopedVaultInferenceRunner({
      bundle: { ...sealed.bundle, ciphertextHex: tamperedCipher }, lease, vaultMasterSecret: MASTER_SECRET,
      requestedAction: "on-device-inference", requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000,
    }).verification.denialCode).toBe("BUNDLE_TAMPERED");

    expect(verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease: { ...lease, episodeId: "ep-042" }, vaultMasterSecret: MASTER_SECRET,
      requestedAction: "on-device-inference", requestedEpisodeId: "ep-042", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000,
    }).denialCode).toBe("INVALID_SIGNATURE");

    expect(verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-041", requestedDeviceFingerprint: "dev-macbook-studio-a", nowEpochMs: BASE_NOW + 1000, revokedLeaseIds: [lease.leaseId],
    }).denialCode).toBe("LEASE_REVOKED");
  });

  it("정책 외 회차 리스 발급을 사전 거부하고, 정책 내 추가 회차 리스 발급은 정상 작동한다", () => {
    const { sealed } = buildSealedVault();
    expect(() => issueVaultLeaseGrant({
      bundle: sealed.bundle, vaultMasterSecret: MASTER_SECRET, leaseId: "lease-illegal", granteeId: "external-guest",
      episodeId: "ep-999", deviceFingerprint: "dev-macbook-studio-a", issuedAtEpochMs: BASE_NOW, expiresAtEpochMs: BASE_NOW + 600_000,
    })).toThrow(/허용되지 않은 회차/);

    const ep42Lease = issueVaultLeaseGrant({
      bundle: sealed.bundle, vaultMasterSecret: MASTER_SECRET, leaseId: "lease-ep042-001", granteeId: "colorist-seo",
      episodeId: "ep-042", deviceFingerprint: "dev-ipad-pro-b", issuedAtEpochMs: BASE_NOW, expiresAtEpochMs: BASE_NOW + 900_000,
    });
    const verified = verifyVaultLeaseGrant({
      bundle: sealed.bundle, lease: ep42Lease, vaultMasterSecret: MASTER_SECRET, requestedAction: "on-device-inference",
      requestedEpisodeId: "ep-042", requestedDeviceFingerprint: "dev-ipad-pro-b", nowEpochMs: BASE_NOW + 5000,
    });
    expect(verified.allowed).toBe(true);
    expect(verified.remainingValidMs).toBe(895_000);
  });
});
