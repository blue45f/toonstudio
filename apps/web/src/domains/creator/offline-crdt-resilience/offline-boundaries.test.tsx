// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioOfflineResiliencePanel, type OfflineResilienceTabId } from "./StudioOfflineResiliencePanel";
import { compactCrdtOpLog, computeCrc32Hex, computeSha256Hex, createDefaultCrdtOpLog, createDefaultManuscriptParityStripe, createInitialTabWriterLeaseState, stepTabWriterLease, verifyAndRepairManuscriptChunks } from "./offline-resilience-engine";

afterEach(cleanup);

describe("오프라인 메모리 예제 경계", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 65_537])("청크 크기 %s는 유한한 예제 자원 상한 안에서 처리한다", (size) => {
    const stripe = createDefaultManuscriptParityStripe(size);
    expect(Number.isFinite(stripe.chunkByteSize)).toBe(true);
    expect(stripe.chunkByteSize).toBeGreaterThanOrEqual(16);
    expect(stripe.chunkByteSize).toBeLessThanOrEqual(65_536);
    expect(stripe.chunks[0]?.data.length).toBe(stripe.chunkByteSize);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e12])("TTL과 tick %s는 시계를 NaN/Infinity로 오염시키지 않는다", (value) => {
    const state = createInitialTabWriterLeaseState(value);
    expect(Number.isFinite(state.leaseTtlMs)).toBe(true);
    expect(state.leaseTtlMs).toBeLessThanOrEqual(60_000);
    const next = stepTabWriterLease(state, { type: "tick", deltaMs: value });
    expect(Number.isFinite(next.nowMs)).toBe(true);
    expect(next.nowMs - state.nowMs).toBeLessThanOrEqual(60_000);
  });

  it("비유한 페이로드와 과도한 큐는 원문을 바꾸지 않고 명시적으로 거부한다", () => {
    const base = createDefaultCrdtOpLog()[0];
    if (!base) throw new Error("기본 예제 누락");
    const invalid = { ...base, payloadBytes: Number.NaN };
    expect(() => compactCrdtOpLog([invalid])).toThrow(RangeError);
    expect(Number.isNaN(invalid.payloadBytes)).toBe(true);
    expect(() => compactCrdtOpLog(Array.from({ length: 513 }, () => base))).toThrow(RangeError);
  });

  it("외부에서 전달한 스트라이프도 자원 상한과 버퍼 길이를 검증하며 원본을 보존한다", () => {
    const stripe = createDefaultManuscriptParityStripe();
    const original = stripe.chunks.map((chunk) => [...chunk.data]);
    expect(() => verifyAndRepairManuscriptChunks({ ...stripe, chunkByteSize: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => verifyAndRepairManuscriptChunks({ ...stripe, parityData: new Uint8Array(0) })).toThrow(RangeError);
    expect(stripe.chunks.map((chunk) => [...chunk.data])).toEqual(original);
  });

  it("중복 ID 때문에 정상 청크까지 덮어쓴 뒤 무손실 복구로 보고하지 않는다", () => {
    const fixture = createDefaultManuscriptParityStripe(16);
    const first = fixture.chunks[0];
    const second = fixture.chunks[1];
    if (!first || !second) throw new Error("기본 청크 누락");
    const originalA = new Uint8Array(16); originalA[0] = 1;
    const damagedA = new Uint8Array(originalA); damagedA[0] = 2;
    const originalB = new Uint8Array(16);
    const stripe = {
      ...fixture, parityData: originalA,
      expectedParityCrc32: computeCrc32Hex(originalA), expectedParitySha256: computeSha256Hex(originalA),
      chunks: [
        { ...first, chunkId: "dup", index: 0, data: damagedA, expectedCrc32: computeCrc32Hex(originalA), expectedSha256: computeSha256Hex(originalA) },
        { ...second, chunkId: "dup", index: 1, data: originalB, expectedCrc32: computeCrc32Hex(originalB), expectedSha256: computeSha256Hex(originalB) },
      ],
    };
    const before = stripe.chunks.map((chunk) => [...chunk.data]);
    expect(() => verifyAndRepairManuscriptChunks(stripe)).toThrow(RangeError);
    expect(stripe.chunks.map((chunk) => [...chunk.data])).toEqual(before);
    expect([...stripe.parityData]).toEqual([...originalA]);
  });

  it.each([{ chunkId: "" }, { chunkId: " " }, { index: Number.NaN }, { index: Number.POSITIVE_INFINITY }, { index: -1 }, { index: 0.5 }, { index: 0 }, { index: 4 }])("빈 ID·잘못된 슬롯 %j는 원본을 바꾸지 않고 거부한다", (patch) => {
    const stripe = createDefaultManuscriptParityStripe(16);
    const invalid = { ...stripe, chunks: stripe.chunks.map((chunk, index) => index === 1 ? { ...chunk, ...patch } : chunk) };
    const before = invalid.chunks.map((chunk) => [...chunk.data]);
    expect(() => verifyAndRepairManuscriptChunks(invalid)).toThrow(RangeError);
    expect(invalid.chunks.map((chunk) => [...chunk.data])).toEqual(before);
  });

  it("고유한 0..N-1 슬롯은 배열 순서가 바뀌어도 정상 버퍼를 보존한다", () => {
    const stripe = createDefaultManuscriptParityStripe(16);
    const reordered = { ...stripe, chunks: [...stripe.chunks].reverse() };
    const before = reordered.chunks.map((chunk) => [...chunk.data]);
    const report = verifyAndRepairManuscriptChunks(reordered);
    expect(report.overallStatus).toBe("healthy");
    expect(report.losslessVerified).toBe(true);
    expect(report.repairedStripe.chunks.map((chunk) => [...chunk.data])).toEqual(before);
  });

  it("압축 후보를 계산해도 충돌한 두 대사와 원문 큐를 그대로 보존한다", () => {
    render(<StudioOfflineResiliencePanel />);
    fireEvent.click(screen.getByTestId("btn-inject-conflict"));
    const before = screen.getByTestId("crdt-op-list").textContent;
    fireEvent.click(screen.getByTestId("btn-compact-crdt"));
    expect(screen.getByTestId("crdt-op-list").textContent).toBe(before);
    expect(screen.getByTestId("offline-example-scope").textContent).toContain("저장하지");
  });

  const actions: readonly { readonly tab: OfflineResilienceTabId; readonly button: string; readonly callback: "onCompactionChange" | "onRecoveryReportChange" | "onLeaseStateChange"; readonly retry: string }[] = [
    { tab: "crdt-vclock", button: "btn-compact-crdt", callback: "onCompactionChange", retry: "compaction" },
    { tab: "opfs-parity", button: "btn-verify-repair-opfs", callback: "onRecoveryReportChange", retry: "recovery" },
    { tab: "tab-lease", button: "btn-acquire-tab-ref", callback: "onLeaseStateChange", retry: "lease" },
  ];
  for (const item of actions) {
    it(`${item.retry} 알림 실패 후 같은 결과를 최신 수신자에게만 재알림한다`, async () => {
      let rejectAttempt: (error: Error) => void = () => { throw new Error("알림 미실행"); };
      const first = vi.fn((_value: unknown) => new Promise<void>((_resolve, reject) => { rejectAttempt = reject; }));
      const latest = vi.fn();
      const { rerender } = render(<StudioOfflineResiliencePanel initialTab={item.tab} {...{ [item.callback]: first }} />);
      fireEvent.click(screen.getByTestId(item.button));
      expect(screen.getByTestId(item.button).closest("fieldset")?.disabled).toBe(true);
      fireEvent.click(screen.getByTestId(item.button));
      expect(first).toHaveBeenCalledTimes(1);
      await act(async () => { rejectAttempt(new Error("예제 알림 실패")); });
      expect(screen.getByRole("alert").textContent).toContain("알림");
      rerender(<StudioOfflineResiliencePanel initialTab={item.tab} {...{ [item.callback]: latest }} />);
      fireEvent.click(screen.getByTestId(`retry-${item.retry}-notification`));
      expect(latest).toHaveBeenCalledWith(first.mock.calls[0]?.[0]);
      expect(first).toHaveBeenCalledTimes(1);
    });
  }
});
