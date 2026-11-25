// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  accessCachedChunk,
  aggregateFederatedLoraDeltas,
  buildPrefetchPriorityQueue,
  bumpAssetSemanticVersion,
  bumpSemanticVersion,
  compareSemanticVersions,
  computeEffectiveDeltaW,
  computeFloat32L2Norm,
  computeSha256Hex,
  computeSha256HexFromText,
  computeStreamCacheTelemetry,
  createDefaultEpisodeStreamCatalog,
  createDefaultOnDeviceStyleSamples,
  createFederatedLoraSession,
  createLoraAdapterWeights,
  createOpfsLruCacheState,
  createPeerDeviceLoraPackets,
  DEFAULT_VIEWPORT_SCROLL_STATE,
  exportFederatedLoraDelta,
  extractOnDeviceStyleSample,
  fetchAndCacheChunk,
  formatSemanticVersion,
  forwardLoraAdapter,
  LORA_VALID_RANKS,
  parseSemanticVersion,
  resizeOpfsLruBudget,
  runOnDeviceLoraStep,
  selectLodTierForZoom,
  stepPrefetchStream,
  StudioFederatedLoraStreamPanel,
  synthesizeDeterministicChunkPayload,
  verifyZeroRawEgress,
  type FederatedLoraDeltaPacket,
  type LoraRank,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/federated-style-lora",
);

describe("Wave 41A: 온디바이스 차등 프라이버시 연합학습 LoRA · 시맨틱 LOD 동적 리소스 스트리밍", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Float32Array 저랭크 어댑터는 rank 4/8/16에 대해 정확한 차원과 초기 ΔW=0 결정론 재현성을 보장한다", () => {
    for (const rank of LORA_VALID_RANKS) {
      const a1 = createLoraAdapterWeights({ rank, seed: 4101 });
      const a2 = createLoraAdapterWeights({ rank, seed: 4101 });
      expect(a1.matrixA).toBeInstanceOf(Float32Array);
      expect(a1.matrixB).toBeInstanceOf(Float32Array);
      expect(a1.matrixA.length).toBe(a1.outDim * rank);
      expect(a1.matrixB.length).toBe(rank * a1.inDim);
      expect(a1.parameterCount).toBe((a1.outDim + a1.inDim) * rank);
      expect(Array.from(a1.matrixA)).toEqual(Array.from(a2.matrixA));
      expect(computeFloat32L2Norm(a1.matrixB)).toBe(0);
      expect(computeEffectiveDeltaW(a1).frobeniusNorm).toBe(0);
    }
  });

  it("2. 온디바이스 화풍 특징 추출은 로컬 RGBA 픽셀에서만 특징 벡터를 계산하고 외부 전송은 0바이트를 유지한다", () => {
    const pixels = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const dark = (i / 4) % 5 === 0;
      pixels[i] = dark ? 24 : 230;
      pixels[i + 1] = dark ? 24 : 228;
      pixels[i + 2] = dark ? 28 : 225;
      pixels[i + 3] = 255;
    }

    const sample = extractOnDeviceStyleSample(pixels, 16, 16, {
      sampleId: "local-cut-patch-1",
      presetId: "ink-sharp-action",
      labelKo: "테스트 먹선 패치",
      labelEn: "Test Ink Patch",
    });

    expect(sample.sourcePixelBytes).toBe(1024);
    expect(sample.features.length).toBe(16);
    expect(sample.targetModulation.length).toBe(16);
    expect(sample.features[0]).toBeGreaterThan(0.15);

    const session = createFederatedLoraSession({ rank: 8 });
    const after = runOnDeviceLoraStep(session, sample);
    expect(after.record.rawPixelBytesTransmitted).toBe(0);
    expect(after.session.rawPixelBytesTransmitted).toBe(0);
    expect(after.session.rawPixelBytesProcessedLocally).toBe(1024);
  });

  it("3. DP-SGD L2 그래디언트 클리핑은 큰 그래디언트 노름을 clipNormC 이하로 엄격히 제한한다", () => {
    const samples = createDefaultOnDeviceStyleSamples();
    const baseSample = samples[0];
    if (!baseSample) throw new Error("기본 화풍 샘플 누락");

    const amplifiedTarget = new Float32Array(baseSample.targetModulation.length);
    for (let i = 0; i < amplifiedTarget.length; i += 1) {
      amplifiedTarget[i] = (baseSample.targetModulation[i] ?? 0) * 40;
    }
    const largeGradSample = { ...baseSample, targetModulation: amplifiedTarget };

    const session = createFederatedLoraSession({
      rank: 8,
      privacyConfig: { clipNormC: 0.5, noiseMultiplier: 0.8 },
    });
    const { record } = runOnDeviceLoraStep(session, largeGradSample);

    expect(record.preClipGradNorm).toBeGreaterThan(0.5);
    expect(record.wasClipped).toBe(true);
    expect(record.postClipGradNorm).toBeLessThanOrEqual(0.5001);
  });

  it("4. 결정론적 가우시안 노이즈 주입은 동일 시드에서 완전 재현되며 노이즈 배율 증가 시 섭동이 커진다", () => {
    const sample = createDefaultOnDeviceStyleSamples()[0];
    if (!sample) throw new Error("기본 샘플 누락");

    const s1 = createFederatedLoraSession({ rank: 8, seed: 777, privacyConfig: { noiseMultiplier: 1.2 } });
    const s2 = createFederatedLoraSession({ rank: 8, seed: 777, privacyConfig: { noiseMultiplier: 1.2 } });
    const s3 = createFederatedLoraSession({ rank: 8, seed: 777, privacyConfig: { noiseMultiplier: 2.8 } });

    const r1 = runOnDeviceLoraStep(s1, sample);
    const r2 = runOnDeviceLoraStep(s2, sample);
    const r3 = runOnDeviceLoraStep(s3, sample);

    expect(Array.from(r1.session.currentAdapter.matrixA)).toEqual(
      Array.from(r2.session.currentAdapter.matrixA),
    );
    expect(Array.from(r1.session.currentAdapter.matrixB)).toEqual(
      Array.from(r2.session.currentAdapter.matrixB),
    );
    expect(r1.record.noiseL2Norm).toBe(r2.record.noiseL2Norm);
    expect(r3.record.noiseL2Norm).toBeGreaterThan(r1.record.noiseL2Norm * 1.8);
  });

  it("5. RDP 누적 프라이버시 예산(epsilon, delta)은 스텝·노이즈·델타 단조성을 만족하고 한도 소진 시 학습을 차단한다", () => {
    const sample = createDefaultOnDeviceStyleSamples()[0];
    if (!sample) throw new Error("기본 샘플 누락");

    const lowNoise = createFederatedLoraSession({
      rank: 4,
      privacyConfig: { noiseMultiplier: 0.8, delta: 1e-5, budgetLimitEpsilon: 12 },
    });
    const highNoise = createFederatedLoraSession({
      rank: 4,
      privacyConfig: { noiseMultiplier: 1.8, delta: 1e-5, budgetLimitEpsilon: 12 },
    });

    const low1 = runOnDeviceLoraStep(lowNoise, sample).session;
    const low2 = runOnDeviceLoraStep(low1, sample).session;
    const high1 = runOnDeviceLoraStep(highNoise, sample).session;

    expect(lowNoise.epsilonSpent).toBe(0);
    expect(low1.epsilonSpent).toBeGreaterThan(0);
    expect(low2.epsilonSpent).toBeGreaterThan(low1.epsilonSpent);
    expect(high1.epsilonSpent).toBeLessThan(low1.epsilonSpent);

    // 빡빡한 예산 한도(epsilon=0.5) 소진 시 자동 정지 확인
    let capped = createFederatedLoraSession({
      rank: 4,
      privacyConfig: { noiseMultiplier: 0.6, budgetLimitEpsilon: 0.5, enforceBudgetCap: true },
    });
    let hitBlock = false;
    for (let i = 0; i < 6; i += 1) {
      const step = runOnDeviceLoraStep(capped, sample);
      capped = step.session;
      if (step.record.blockedByBudget) {
        hitBlock = true;
        break;
      }
    }
    expect(capped.budgetExhausted).toBe(true);
    expect(hitBlock).toBe(true);
  });

  it("6. exportFederatedLoraDelta와 verifyZeroRawEgress는 0-byte raw egress 및 체크섬 무결성을 엄격히 검증한다", () => {
    const sample = createDefaultOnDeviceStyleSamples()[1];
    if (!sample) throw new Error("샘플 누락");

    let session = createFederatedLoraSession({ rank: 8 });
    session = runOnDeviceLoraStep(session, sample).session;
    session = runOnDeviceLoraStep(session, sample).session;

    const packet = exportFederatedLoraDelta(session, "작업실 PC");
    expect(packet.egressAudit.rawPixelBytesTransmitted).toBe(0);
    expect(packet.egressAudit.containsRawPixels).toBe(false);
    expect(packet.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyZeroRawEgress(packet).valid).toBe(true);

    // 델타 값 변조 시 체크섬 불일치 탐지
    const tamperedDeltaA = new Float32Array(packet.deltaA);
    tamperedDeltaA[0] = (tamperedDeltaA[0] ?? 0) + 1.25;
    const tamperedCheck = verifyZeroRawEgress({ ...packet, deltaA: tamperedDeltaA });
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.reasons).toContain("checksum-sha256-mismatch");

    // 금지된 원본 픽셀 필드 혼입 시 즉시 탐지
    const leakyPacket = {
      ...packet,
      pixelRgba: new Uint8ClampedArray([1, 2, 3, 255]),
    } as unknown as FederatedLoraDeltaPacket;
    const leakyCheck = verifyZeroRawEgress(leakyPacket);
    expect(leakyCheck.valid).toBe(false);
    expect(leakyCheck.reasons).toContain("forbidden-key:pixelRgba");
  });

  it("7. FedAvg 다중 기기 안전 병합은 샘플 수 가중 평균을 정확히 계산하고 손상·랭크불일치·이상치 패킷을 격리한다", () => {
    const samples = createDefaultOnDeviceStyleSamples();
    const s0 = samples[0];
    if (!s0) throw new Error("샘플 누락");

    let local = createFederatedLoraSession({ rank: 8, deviceId: "dev-a", seed: 500 });
    local = runOnDeviceLoraStep(local, s0).session;
    local = runOnDeviceLoraStep(local, s0).session; // 16 samples
    const pktA = exportFederatedLoraDelta(local, "기기 A");

    const peers = createPeerDeviceLoraPackets(local, samples);
    const pktB = peers[0];
    if (!pktB) throw new Error("보조 기기 패킷 누락");

    // 비정상 패킷 2건 구성(랭크 불일치 + 비잔틴 노름 폭주)
    let wrongRankSess = createFederatedLoraSession({ rank: 4 as LoraRank, deviceId: "dev-wrong" });
    wrongRankSess = runOnDeviceLoraStep(wrongRankSess, s0).session;
    const wrongRankPkt = exportFederatedLoraDelta(wrongRankSess, "잘못된 랭크");

    const poisonedA = new Float32Array(pktB.deltaA.length).fill(50);
    const poisonedPkt: FederatedLoraDeltaPacket = {
      ...pktB,
      packetId: "pkt-poisoned",
      deviceId: "dev-poison",
      deltaA: poisonedA,
    };

    const result = aggregateFederatedLoraDeltas(local.baseAdapter, [
      pktA,
      pktB,
      wrongRankPkt,
      poisonedPkt,
    ]);

    expect(result.ok).toBe(true);
    expect(result.acceptedCount).toBe(2);
    expect(result.rejectedPackets).toHaveLength(2);
    expect(result.rawPixelBytesTransmitted).toBe(0);
    expect(result.totalSamplesMerged).toBe(pktA.sampleCount + pktB.sampleCount);

    // 첫 원소 가중 평균 수학적 검증
    const wA = pktA.sampleCount / result.totalSamplesMerged;
    const wB = pktB.sampleCount / result.totalSamplesMerged;
    const expectedB0 =
      (local.baseAdapter.matrixB[0] ?? 0) + wA * (pktA.deltaB[0] ?? 0) + wB * (pktB.deltaB[0] ?? 0);
    expect(result.mergedAdapter.matrixB[0]).toBeCloseTo(expectedB0, 5);
    expect(forwardLoraAdapter(result.mergedAdapter, s0.features).length).toBe(16);
  });

  it("8. 순수 32비트 SHA-256 구현은 BigInt 없이 NIST FIPS 180-4 표준 테스트 벡터와 정확히 일치한다", () => {
    expect(computeSha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeSha256HexFromText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      computeSha256HexFromText("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("9. 시맨틱 버전 파싱·포맷·비교·증가(major/minor/patch)는 SemVer 규약을 정확히 따른다", () => {
    const parsed = parseSemanticVersion("v2.4.9");
    expect(parsed).toEqual({ major: 2, minor: 4, patch: 9 });
    expect(parseSemanticVersion("bad-ver")).toBeNull();
    if (!parsed) throw new Error("파싱 실패");

    expect(formatSemanticVersion(bumpSemanticVersion(parsed, "patch"))).toBe("v2.4.10");
    expect(formatSemanticVersion(bumpSemanticVersion(parsed, "minor"))).toBe("v2.5.0");
    expect(formatSemanticVersion(bumpSemanticVersion(parsed, "major"))).toBe("v3.0.0");
    expect(compareSemanticVersions({ major: 1, minor: 9, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(-1);
    expect(compareSemanticVersions(parsed, { major: 2, minor: 4, patch: 9 })).toBe(0);
  });

  it("10. 줌 배율 기반 LOD 티어 선택은 thumb/working/print-4k 경계와 명시 오버라이드를 준수한다", () => {
    expect(selectLodTierForZoom(0.35)).toBe("thumb");
    expect(selectLodTierForZoom(1.0)).toBe("working");
    expect(selectLodTierForZoom(2.1)).toBe("print-4k");
    expect(selectLodTierForZoom(0.35, "print-4k")).toBe("print-4k");
  });

  it("11. 뷰포트 거리·스크롤 방향 우선순위 큐는 화면 표시 컷 최우선 + 진행 방향 전방 컷에 우선 가산점을 준다", () => {
    const assets = createDefaultEpisodeStreamCatalog();
    const cache = createOpfsLruCacheState(1024 * 1024);

    // 중간 지점(컷 4 부근)에서 아래로 스크롤 vs 위로 스크롤 비교
    const midY = assets[3]?.yOffsetPx ?? 3000;
    const downQueue = buildPrefetchPriorityQueue(
      assets,
      { ...DEFAULT_VIEWPORT_SCROLL_STATE, scrollY: midY, viewportHeight: 900, direction: "down" },
      cache,
      { includeFallbackThumb: false },
    );
    const upQueue = buildPrefetchPriorityQueue(
      assets,
      { ...DEFAULT_VIEWPORT_SCROLL_STATE, scrollY: midY, viewportHeight: 900, direction: "up" },
      cache,
      { includeFallbackThumb: false },
    );

    expect(downQueue[0]?.isVisible).toBe(true);
    const cut6Down = downQueue.find((e) => e.cutIndex === 6);
    const cut2Down = downQueue.find((e) => e.cutIndex === 2);
    expect(cut6Down && cut2Down && cut6Down.priorityScore > cut2Down.priorityScore).toBe(true);

    const cut6Up = upQueue.find((e) => e.cutIndex === 6);
    const cut2Up = upQueue.find((e) => e.cutIndex === 2);
    expect(cut2Up && cut6Up && cut2Up.priorityScore > cut6Up.priorityScore).toBe(true);
  });

  it("12. OPFS LRU 캐시는 적중 시 최근 사용 시각을 승격해 실제로 가장 오래 미사용된 청크부터 축출한다", () => {
    const assets = createDefaultEpisodeStreamCatalog();
    const a0 = assets[0];
    const a1 = assets[1];
    const a2 = assets[2];
    if (!a0 || !a1 || !a2) throw new Error("에셋 누락");

    // 2개 working 청크(~180KB)는 들어가고 3개는 초과하는 210KB 예산
    let cache = createOpfsLruCacheState(210 * 1024);
    const p0 = synthesizeDeterministicChunkPayload(a0.resourceId, "working", a0.version, a0.lodByteSizes.working);
    const p1 = synthesizeDeterministicChunkPayload(a1.resourceId, "working", a1.version, a1.lodByteSizes.working);
    const p2 = synthesizeDeterministicChunkPayload(a2.resourceId, "working", a2.version, a2.lodByteSizes.working);

    cache = fetchAndCacheChunk(cache, a0, "working", p0).cache;
    cache = fetchAndCacheChunk(cache, a1, "working", p1).cache;

    // a0를 재접근해 최근 사용으로 승격 → a1이 LRU 희생자가 되어야 함
    const access = accessCachedChunk(cache, a0.resourceId, "working", a0.version);
    expect(access.hit).toBe(true);
    expect(access.stale).toBe(false);
    cache = access.cache;

    const write2 = fetchAndCacheChunk(cache, a2, "working", p2);
    expect(write2.ok).toBe(true);
    expect(write2.evictedEvents.some((ev) => ev.resourceId === a1.resourceId)).toBe(true);
    expect(write2.cache.entries.some((e) => e.resourceId === a0.resourceId)).toBe(true);
    expect(write2.cache.usedBytes).toBeLessThanOrEqual(write2.cache.budgetBytes);
  });

  it("13. OPFS LRU 메모리 예산 축소 시 초과 청크를 자동 축출해 예산 불변식을 항시 유지한다", () => {
    const assets = createDefaultEpisodeStreamCatalog();
    let cache = createOpfsLruCacheState(512 * 1024);
    cache = stepPrefetchStream(cache, assets, DEFAULT_VIEWPORT_SCROLL_STATE, { maxChunksPerStep: 5 }).cache;
    expect(cache.usedBytes).toBeGreaterThan(200 * 1024);

    const shrunk = resizeOpfsLruBudget(cache, 160 * 1024);
    expect(shrunk.usedBytes).toBeLessThanOrEqual(160 * 1024);
    expect(shrunk.evictionLog.length).toBeGreaterThanOrEqual(1);
  });

  it("14. SHA-256 청크 무결성 검증은 정상 청크를 적재하고 1비트라도 손상된 청크는 즉시 차단한다", () => {
    const asset = createDefaultEpisodeStreamCatalog()[0];
    if (!asset) throw new Error("에셋 누락");

    const cache = createOpfsLruCacheState(512 * 1024);
    const payload = synthesizeDeterministicChunkPayload(
      asset.resourceId,
      "working",
      asset.version,
      asset.lodByteSizes.working,
    );

    const validRes = fetchAndCacheChunk(cache, asset, "working", payload);
    expect(validRes.ok).toBe(true);
    expect(validRes.cache.verifiedWrites).toBe(1);

    const corrupted = new Uint8Array(payload);
    corrupted[17] = ((corrupted[17] ?? 0) ^ 0x01) & 0xff;
    const badRes = fetchAndCacheChunk(validRes.cache, asset, "working", corrupted);
    expect(badRes.ok).toBe(false);
    expect(badRes.rejectReason).toBe("sha256-mismatch");
    expect(badRes.cache.corruptionsBlocked).toBe(1);
    expect(badRes.cache.verifiedWrites).toBe(1);
  });

  it("15. 시맨틱 버전 차등 무효화는 major 전체 축출 · minor 고해상도 축출 · patch 스테일 표시를 구분한다", () => {
    const assets = createDefaultEpisodeStreamCatalog();
    const target = assets[0];
    if (!target) throw new Error("에셋 누락");

    let cache = createOpfsLruCacheState(1024 * 1024);
    for (const tier of ["thumb", "working", "print-4k"] as const) {
      const bytes = synthesizeDeterministicChunkPayload(
        target.resourceId,
        tier,
        target.version,
        target.lodByteSizes[tier],
      );
      cache = fetchAndCacheChunk(cache, target, tier, bytes).cache;
    }

    // patch bump -> 축출 0, 3개 모두 stale-patch
    const afterPatch = bumpAssetSemanticVersion(assets, cache, target.resourceId, "patch");
    expect(afterPatch.evictedKeys).toHaveLength(0);
    expect(afterPatch.markedStaleKeys).toHaveLength(3);

    // minor bump -> working, print-4k 축출, thumb는 stale-minor 보존
    const afterMinor = bumpAssetSemanticVersion(
      afterPatch.assets,
      afterPatch.cache,
      target.resourceId,
      "minor",
    );
    expect(afterMinor.evictedKeys).toHaveLength(2);
    expect(afterMinor.markedStaleKeys).toHaveLength(1);
    expect(afterMinor.cache.entries.some((e) => e.tier === "thumb" && e.status === "stale-minor")).toBe(true);

    // major bump -> 남은 thumb 포함 전량 축출
    const afterMajor = bumpAssetSemanticVersion(
      afterMinor.assets,
      afterMinor.cache,
      target.resourceId,
      "major",
    );
    expect(afterMajor.evictedKeys).toHaveLength(1);
    expect(afterMajor.cache.entries.filter((e) => e.resourceId === target.resourceId)).toHaveLength(0);
  });

  it("16. 연속 스트리밍 스텝 실행은 결정론적 캐싱과 텔레메트리 일관성을 유지한다", () => {
    const assets = createDefaultEpisodeStreamCatalog();
    let cache = createOpfsLruCacheState(256 * 1024);
    for (let step = 0; step < 4; step += 1) {
      const vp = { ...DEFAULT_VIEWPORT_SCROLL_STATE, scrollY: step * 950, direction: "down" as const };
      const report = stepPrefetchStream(cache, assets, vp, { maxChunksPerStep: 3 });
      cache = report.cache;
      expect(cache.usedBytes).toBeLessThanOrEqual(cache.budgetBytes);
    }
    const telemetry = computeStreamCacheTelemetry(cache);
    expect(telemetry.verifiedWrites).toBeGreaterThanOrEqual(6);
    expect(telemetry.totalEvictions).toBeGreaterThanOrEqual(1);
    expect(telemetry.utilizationPct).toBeLessThanOrEqual(100);
  });

  it("17. StudioFederatedLoraStreamPanel은 Props 없이 단독 렌더링되며 탭 1 학습·랭크전환·FedAvg 병합이 동작한다", () => {
    const onLora = vi.fn();
    render(<StudioFederatedLoraStreamPanel onLoraSessionChange={onLora} />);

    expect(screen.getByTestId("federated-lora-stream-panel")).toBeTruthy();
    expect(screen.getByTestId("lora-raw-egress").textContent).toBe("0 B");
    expect(screen.getByRole("tab", { name: /온디바이스 화풍 LoRA/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("btn-lora-step-1"));
    expect(screen.getByTestId("lora-step-count").textContent).toContain("1");
    expect(screen.getByTestId("latest-dp-step-card")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-lora-fedavg"));
    expect(screen.getByTestId("fedavg-report").textContent).toContain("수락 3");

    fireEvent.click(screen.getByTestId("btn-rank-16"));
    expect(screen.getByTestId("lora-rank-summary").textContent).toContain("r=16");
    expect(onLora).toHaveBeenCalled();
  });

  it("18. 탭 2에서 프리페치·스크롤·줌 LOD 전환·OPFS 예산 축소·SemVer 무효화·SHA-256 변조 차단이 동작한다", () => {
    const onStream = vi.fn();
    render(<StudioFederatedLoraStreamPanel initialTab="semantic-stream" onStreamCacheChange={onStream} />);

    expect(screen.getByTestId("panel-semantic-stream")).toBeTruthy();
    fireEvent.click(screen.getByTestId("btn-stream-prefetch"));
    expect(screen.getByTestId("stream-integrity-summary").textContent).toContain("검증 3");

    fireEvent.click(screen.getByTestId("btn-stream-tamper-test"));
    expect(screen.getByTestId("stream-integrity-summary").textContent).toContain("차단 1");

    fireEvent.click(screen.getByTestId("btn-zoom-print"));
    expect(screen.getByTestId("stream-viewport-summary").textContent).toContain("2.0x");

    fireEvent.click(screen.getByTestId("btn-scroll-down"));
    expect(screen.getByTestId("stream-viewport-summary").textContent).toContain("Y=960px");

    fireEvent.click(screen.getByTestId("btn-budget-256"));
    expect(screen.getByTestId("stream-memory-usage").textContent).toContain("256 KB");

    fireEvent.click(screen.getByTestId("btn-bump-ep12-cut-01-major"));
    expect(screen.getByTestId("stream-notice-banner").textContent).toContain("v2.0.0");
    expect(onStream).toHaveBeenCalled();
  });

  it("19. 영문 로케일 및 완전 무인자 단독 렌더링(<StudioFederatedLoraStreamPanel />)이 오류 없이 동작한다", () => {
    const { unmount } = render(<StudioFederatedLoraStreamPanel />);
    expect(screen.getByTestId("zero-egress-pill").textContent).toContain("0 B");
    unmount();

    render(<StudioFederatedLoraStreamPanel locale="en" />);
    expect(screen.getByTestId("btn-lora-step-1").textContent).toContain("Run 1 On-Device Step");
    fireEvent.click(screen.getByTestId("tab-semantic-stream"));
    expect(screen.getByTestId("btn-stream-prefetch").textContent).toContain("Run Priority Prefetch");
  });

  it("20. 모듈 전체 엄격 정적 위생 규칙(800줄·무색상·무스토리지·BigInt금지·비공개맵금지·props규칙)을 통과한다", () => {
    const files = [
      "federated-lora-engine.ts",
      "semantic-resource-streamer.ts",
      "StudioFederatedLoraStreamPanel.tsx",
      "index.ts",
      "federated-style-lora.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} private Map store 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioFederatedLoraStreamPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI 패널에 원시 색상(hex/rgb/hsl) 금지").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioFederatedLoraStreamPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
