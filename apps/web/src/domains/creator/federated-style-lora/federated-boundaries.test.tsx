// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  aggregateFederatedLoraDeltas, buildPrefetchPriorityQueue, computeSha256Hex, convertRdpToEpsilon,
  createDefaultEpisodeStreamCatalog, createDefaultOnDeviceStyleSamples, createFederatedLoraSession,
  createLoraAdapterWeights, createOpfsLruCacheState, DEFAULT_VIEWPORT_SCROLL_STATE,
  exportFederatedLoraDelta, extractOnDeviceStyleSample, fetchAndCacheChunk,
  resizeOpfsLruBudget, runOnDeviceLoraStep, stepPrefetchStream, StudioFederatedLoraStreamPanel,
  synthesizeDeterministicChunkPayload, verifyZeroRawEgress,
  type FederatedLoraTelemetry, type StreamCacheTelemetry,
} from "./index";

const sample = createDefaultOnDeviceStyleSamples()[0];
const asset = createDefaultEpisodeStreamCatalog()[0];
if (!sample || !asset) throw new Error("기본 예제 입력 누락");

const packetFrom = (deviceId: string, seed = 41) => {
  const initial = createFederatedLoraSession({ deviceId, seed });
  const trained = runOnDeviceLoraStep(initial, sample).session;
  return { base: initial.baseAdapter, packet: exportFederatedLoraDelta(trained) };
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("합성 MSE·FedAvg·캐시 메타데이터 경계", () => {
  it("비유한 설정·차원·잘린 픽셀 버퍼를 보정 성공으로 만들지 않는다", () => {
    expect(() => createFederatedLoraSession({ privacyConfig: { noiseMultiplier: NaN } })).toThrow(/유한/);
    expect(() => createFederatedLoraSession({ privacyConfig: { learningRate: Infinity } })).toThrow(/유한/);
    expect(() => createLoraAdapterWeights({ inDim: NaN })).toThrow();
    expect(() => createLoraAdapterWeights({ outDim: 1.5 })).toThrow();
    const pixels = new Uint8ClampedArray([20, 30, 40, 255]);
    const before = pixels.slice();
    const meta = { sampleId: "source", presetId: "ink-sharp-action", labelKo: "원본", labelEn: "Source" } as const;
    expect(() => extractOnDeviceStyleSample(pixels, 2, 2, meta)).toThrow(/RGBA 길이/);
    expect(() => extractOnDeviceStyleSample(pixels, NaN, 1, meta)).toThrow();
    expect(pixels).toEqual(before);
    expect(() => convertRdpToEpsilon([NaN], 1e-5, 1)).toThrow(/벡터/);
  });

  it("다음 스텝이 가정 예산을 넘으면 가중치·스텝·소비량을 바꾸기 전에 차단한다", () => {
    const initial = createFederatedLoraSession({ privacyConfig: { budgetLimitEpsilon: 0.5, noiseMultiplier: 0.6 } });
    const beforeA = initial.currentAdapter.matrixA.slice();
    const beforeB = initial.currentAdapter.matrixB.slice();
    const result = runOnDeviceLoraStep(initial, sample);
    expect(result.record.blockedByBudget).toBe(true);
    expect(result.session.stepCount).toBe(0);
    expect(result.session.epsilonSpent).toBe(0);
    expect(result.session.currentAdapter).toBe(initial.currentAdapter);
    expect(initial.currentAdapter.matrixA).toEqual(beforeA);
    expect(initial.currentAdapter.matrixB).toEqual(beforeB);
    const check = verifyZeroRawEgress(exportFederatedLoraDelta(result.session));
    expect(check.valid).toBe(false);
    expect(check.reasons).toContain("invalid-sample-count");
  });

  it("결정론 예제 패킷의 검사 결과를 실제 DP·외부 송신 검증으로 표시하지 않는다", () => {
    const { packet } = packetFrom("local");
    expect(packet.egressAudit.privacyGuarantee).toBe("unverified-deterministic-example");
    expect(packet.egressAudit.privacyVerified).toBe(false);
    expect(verifyZeroRawEgress(packet)).toMatchObject({ valid: true, privacyVerified: false, verificationKind: "packet-shape-and-checksum-only" });
  });

  it("같은 이름·형상이라도 다른 기준 가중치와 중복 기기·패킷을 병합하지 않는다", () => {
    const first = packetFrom("local", 41);
    const foreign = packetFrom("foreign", 42);
    expect(first.base.adapterId).toBe(foreign.base.adapterId);
    const rejected = aggregateFederatedLoraDeltas(first.base, [foreign.packet]);
    expect(rejected.ok).toBe(false);
    expect(rejected.rejectedPackets[0]?.reasons).toContain("base-adapter-mismatch");
    const peer = packetFrom("peer", 41);
    const normal = aggregateFederatedLoraDeltas(first.base, [first.packet, peer.packet]);
    const duplicate = aggregateFederatedLoraDeltas(first.base, [first.packet, first.packet, peer.packet]);
    expect(duplicate.acceptedCount).toBe(2);
    expect(duplicate.totalSamplesMerged).toBe(normal.totalSamplesMerged);
    expect(duplicate.mergedAdapter.matrixA).toEqual(normal.mergedAdapter.matrixA);
    expect(duplicate.mergedAdapter.matrixB).toEqual(normal.mergedAdapter.matrixB);
    expect(duplicate.rejectedPackets[0]?.reasons).toContain("duplicate-packet");
    expect(() => aggregateFederatedLoraDeltas(first.base, [first.packet], { maxAllowedDeltaNorm: NaN })).toThrow();
    expect(verifyZeroRawEgress({ ...first.packet, alpha: first.packet.alpha + 1 }).valid).toBe(false);
    expect(verifyZeroRawEgress({ ...first.packet, epsilonSpent: NaN }).valid).toBe(false);
  });

  it("메모리 모델 한도·뷰포트·청크 수·중복 리소스 ID의 NaN·불일치를 거부한다", () => {
    const cache = createOpfsLruCacheState();
    expect(cache).toMatchObject({ storageKind: "in-memory-metadata", persistent: false });
    expect(() => createOpfsLruCacheState(NaN)).toThrow();
    expect(() => resizeOpfsLruBudget(cache, Infinity)).toThrow();
    expect(() => stepPrefetchStream(cache, [asset], DEFAULT_VIEWPORT_SCROLL_STATE, { maxChunksPerStep: NaN })).toThrow();
    expect(() => buildPrefetchPriorityQueue([asset, asset], DEFAULT_VIEWPORT_SCROLL_STATE, cache)).toThrow(/중복/);
    expect(() => buildPrefetchPriorityQueue([asset], { ...DEFAULT_VIEWPORT_SCROLL_STATE, scrollY: NaN }, cache)).toThrow();
  });

  it("고정 메타데이터보다 작은 예산으로의 축소는 원본 상태를 보존하고 실패한다", () => {
    const bytes = synthesizeDeterministicChunkPayload(asset.resourceId, "print-4k", asset.version, asset.lodByteSizes["print-4k"]);
    const written = fetchAndCacheChunk(createOpfsLruCacheState(), asset, "print-4k", bytes, { pinned: true }).cache;
    const before = JSON.stringify(written);
    expect(() => resizeOpfsLruBudget(written, 64 * 1024)).toThrow(/기존 상태/);
    expect(JSON.stringify(written)).toBe(before);
    const short = new Uint8Array(1);
    const mismatch = fetchAndCacheChunk(written, asset, "thumb", short, { expectedHash: computeSha256Hex(short) });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.rejectReason).toBe("payload-size-mismatch");
    expect(mismatch.cache).toBe(written);
  });

  it("같은 청크 재기록은 생략한 pin을 보존하며 명시적 false로만 해제한다", () => {
    const bytes = synthesizeDeterministicChunkPayload(asset.resourceId, "print-4k", asset.version, asset.lodByteSizes["print-4k"]);
    const pinned = fetchAndCacheChunk(createOpfsLruCacheState(), asset, "print-4k", bytes, { pinned: true }).cache;
    const rewritten = fetchAndCacheChunk(pinned, asset, "print-4k", bytes).cache;
    expect(rewritten.entries[0]?.pinned).toBe(true);
    const before = JSON.stringify(rewritten);
    expect(() => resizeOpfsLruBudget(rewritten, 64 * 1024)).toThrow(/기존 상태/);
    expect(JSON.stringify(rewritten)).toBe(before);
    const released = fetchAndCacheChunk(rewritten, asset, "print-4k", bytes, { pinned: false }).cache;
    expect(released.entries[0]?.pinned).toBe(false);
    const resized = resizeOpfsLruBudget(released, 64 * 1024);
    expect(resized.entries).toHaveLength(0);
    expect(resized.usedBytes).toBe(0);
    expect(pinned.entries[0]?.pinned).toBe(true);
  });

  it("기록 가능한 청크가 없어도 남은 큐와 차단 사유를 보존한다", () => {
    const viewport = { ...DEFAULT_VIEWPORT_SCROLL_STATE, preferredLodOverride: "print-4k" } as const;
    const first = stepPrefetchStream(createOpfsLruCacheState(64 * 1024), [asset], viewport);
    const blocked = stepPrefetchStream(first.cache, [asset], viewport);
    expect(blocked.fetchedKeys).toHaveLength(0);
    expect(blocked.blockedKeys).toHaveLength(1);
    expect(blocked.remainingQueueLength).toBe(1);
    expect(blocked.cache).toBe(first.cache);
  });

  it("패널은 CPU 예제·DP 보증 없음·OPFS 미연동을 표시한다", () => {
    render(<StudioFederatedLoraStreamPanel locale="ko" />);
    const panel = screen.getByTestId("federated-lora-stream-panel");
    expect(panel.textContent).toContain("차등 프라이버시 보증·네트워크 관찰/송신");
    expect(panel.textContent).toContain("OPFS 영구 저장·현재 원고 적용에 연결되지 않습니다");
    fireEvent.click(screen.getByTestId("btn-lora-fedavg"));
    expect(screen.getByTestId("lora-notice-banner").textContent).toContain("합성 기기 패킷");
    expect(screen.queryByTestId("example-notification-status")).toBeNull();
  });

  it("MSE 알림 대기·거절·재시도는 동일 결과를 쓰고 업데이트를 반복하지 않는다", async () => {
    let rejectPending: (error: Error) => void = () => { throw new Error("대기 Promise 누락"); };
    const pending = new Promise<void>((_resolve, reject) => { rejectPending = reject; });
    const onSession = vi.fn<(result: FederatedLoraTelemetry) => void | Promise<void>>().mockImplementationOnce(() => pending).mockResolvedValueOnce(undefined);
    render(<StudioFederatedLoraStreamPanel locale="ko" onLoraSessionChange={onSession} />);
    fireEvent.click(screen.getByTestId("btn-lora-step-1"));
    fireEvent.click(screen.getByTestId("btn-lora-step-1"));
    expect(onSession).toHaveBeenCalledTimes(1);
    const steps = screen.getByTestId("lora-step-count").textContent;
    await act(async () => { rejectPending(new Error("결과 수신 실패")); });
    expect(screen.getByRole("alert").textContent).toContain("결과 수신 실패");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" })); });
    expect(onSession.mock.calls[1]?.[0]).toBe(onSession.mock.calls[0]?.[0]);
    expect(screen.getByTestId("lora-step-count").textContent).toBe(steps);
  });

  it("캐시 알림의 동기 실패 재시도는 메타데이터를 중복 기록하지 않는다", () => {
    const onCache = vi.fn<(result: StreamCacheTelemetry) => void | Promise<void>>().mockImplementationOnce(() => { throw new Error("알림 거부"); }).mockImplementationOnce(() => undefined);
    render(<StudioFederatedLoraStreamPanel locale="ko" initialTab="semantic-stream" onStreamCacheChange={onCache} />);
    fireEvent.click(screen.getByTestId("btn-stream-prefetch"));
    const entries = screen.getByTestId("stream-queue-summary").textContent;
    expect(screen.getByRole("alert").textContent).toContain("알림 거부");
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(onCache.mock.calls[1]?.[0]).toBe(onCache.mock.calls[0]?.[0]);
    expect(screen.getByTestId("stream-queue-summary").textContent).toBe(entries);
  });

  it.each([
    { channel: "lora", tab: "federated-lora", trigger: "btn-lora-step-1", state: "lora-step-count" },
    { channel: "cache", tab: "semantic-stream", trigger: "btn-stream-prefetch", state: "stream-queue-summary" },
  ] as const)("$channel 수신자가 바뀌거나 제거되면 재시도도 최신 수신자를 따른다", ({ channel, tab, trigger, state }) => {
    const original = vi.fn<(result: FederatedLoraTelemetry | StreamCacheTelemetry) => void>(() => { throw new Error("첫 수신자 거부"); });
    const replacement = vi.fn<(result: FederatedLoraTelemetry | StreamCacheTelemetry) => void>(() => { throw new Error("새 수신자 거부"); });
    const initialProps = channel === "lora" ? { onLoraSessionChange: original } : { onStreamCacheChange: original };
    const latestProps = channel === "lora" ? { onLoraSessionChange: replacement } : { onStreamCacheChange: replacement };
    const view = render(<StudioFederatedLoraStreamPanel locale="ko" initialTab={tab} {...initialProps} />);
    fireEvent.click(screen.getByTestId(trigger));
    const payload = original.mock.calls[0]?.[0];
    const stateBeforeRetry = screen.getByTestId(state).textContent;
    expect(original).toHaveBeenCalledTimes(1);

    view.rerender(<StudioFederatedLoraStreamPanel locale="ko" initialTab={tab} {...latestProps} />);
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.calls[0]?.[0]).toBe(payload);
    expect(screen.getByTestId(state).textContent).toBe(stateBeforeRetry);

    view.rerender(<StudioFederatedLoraStreamPanel locale="ko" initialTab={tab} />);
    fireEvent.click(screen.getByRole("button", { name: "결과 알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("example-notification-status")).toBeNull();
    expect(screen.getByTestId(state).textContent).toBe(stateBeforeRetry);
  });
});
