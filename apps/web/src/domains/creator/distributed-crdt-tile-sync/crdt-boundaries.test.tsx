// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalStrokeOp, calculateBandwidthBudget, createCrdtPeerState, deserializeDeltaPacket,
  fnv1a64Hex, mergeRemoteOps, serializeDeltaPacket, StudioDistributedCrdtSyncPanel,
  receiveHlcRemote, reconcileClusterOutOfOrder, tickHlcLocal, verifyCrdtConvergenceLaws,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const sample = () => applyLocalStrokeOp(createCrdtPeerState("lead-artist"), { tileX: 1, tileY: 1 });
function rehash(packet: ReturnType<typeof serializeDeltaPacket>) {
  return { ...packet, packetHash: fnv1a64Hex(`${packet.transportChannel}|${packet.opCount}|${packet.encodedPayload}`) };
}

describe("CRDT 모형 경계와 실패 보호", () => {
  it("같은 ID의 다른 내용은 도착 순서로 채택하지 않고 거절한다", () => {
    const { op } = sample();
    const conflicting = { ...op, strokeHash: "different" };
    expect(() => mergeRemoteOps(createCrdtPeerState("color-assist"), [op, conflicting])).toThrow();
    const peer = mergeRemoteOps(createCrdtPeerState("color-assist"), [op]).peer;
    expect(() => mergeRemoteOps(peer, [conflicting])).toThrow();
  });
  it("수신 객체의 나중 변경이 저장된 시계와 다음 병합에 영향을 주지 않는다", () => {
    const external = { ...sample().op, hlc: { ...sample().op.hlc } };
    const merged = mergeRemoteOps(createCrdtPeerState("color-assist"), [external]).peer;
    const logical = merged.opLog[0]?.hlc.logical;
    external.hlc.logical = 12345;
    expect(merged.opLog[0]?.hlc.logical).toBe(logical);
  });
  it("일부 ACK는 일치한 오프라인 항목만 제거한다", () => {
    const a = applyLocalStrokeOp(createCrdtPeerState("lead-artist", { isOffline: true }), { tileX: 0, tileY: 0 });
    const b = applyLocalStrokeOp(a.peer, { tileX: 1, tileY: 1 });
    const result = mergeRemoteOps(b.peer, [a.op], { clearMatchingOutbox: true });
    expect(result.peer.offlineOutbox.map((op) => op.opId)).toEqual([b.op.opId]);
  });
  it("안전 정수 상한의 시계는 잘못된 동일 타임스탬프를 생성하지 않는다", () => {
    expect(() => tickHlcLocal({ physicalMs: Number.MAX_SAFE_INTEGER, logical: Number.MAX_SAFE_INTEGER, nodeId: "lead-artist" }, Number.MAX_SAFE_INTEGER)).toThrow();
  });
  it("체크섬이 맞아도 NaN 수치를 타일 0으로 변환하지 않는다", () => {
    const packet = serializeDeltaPacket([sample().op], "webrtc-datachannel");
    const parts = packet.encodedPayload.split("|"); parts[3] = "NaN";
    expect(deserializeDeltaPacket(rehash({ ...packet, encodedPayload: parts.join("|") })).ok).toBe(false);
  });
  it("패킷 개수 불일치와 무상한 본문은 분할하기 전에 거절한다", () => {
    const packet = serializeDeltaPacket([sample().op], "webrtc-datachannel");
    expect(deserializeDeltaPacket(rehash({ ...packet, opCount: 2 })).ok).toBe(false);
    expect(deserializeDeltaPacket({ ...packet, encodedPayload: "x".repeat(1024 * 1024 + 1) }).ok).toBe(false);
  });
  it("구분자를 포함한 로컬 브러시 이름은 조용히 손상된 패킷을 만들지 않는다", () => {
    expect(() => applyLocalStrokeOp(createCrdtPeerState("lead-artist"), { tileX: 1, tileY: 1, brushCode: "pen|bad" })).toThrow();
  });
  it("로그 상한 도달 시 기존 기록을 버리거나 무제한 늘리지 않는다", () => {
    const { peer, op } = sample();
    const full = { ...peer, opLog: Array.from({ length: 4096 }, (_, i) => ({ ...op, opId: `bounded-${i}` })) };
    expect(() => applyLocalStrokeOp(full, { tileX: 1, tileY: 1 })).toThrow();
  });
  it("60Hz 대역폭은 초당 60프레임의 추정량이다", () => {
    const budget = calculateBandwidthBudget([sample().op], "webrtc-datachannel");
    expect(budget.estimatedKbpsAt60Hz).toBe(Math.round(budget.compressedDeltaBytes * 8 * 60 / 1000 * 100) / 100);
  });
  it("입력 하나의 검증을 기본 예제 8개의 증명으로 바꾸지 않는다", () => {
    expect(verifyCrdtConvergenceLaws([sample().op]).verifiedOpCount).toBe(1);
  });
  it("편집 후 이전 검증 배지를 지우고 실제 연결 없는 모형임을 명시한다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    fireEvent.click(screen.getByTestId("verify-convergence-btn"));
    fireEvent.click(screen.getByTestId("draw-local-stroke-btn"));
    expect(screen.getByTestId("kpi-proof-badge").textContent).not.toContain("4/4");
    expect(screen.getByTestId("crdt-runtime-boundary").textContent).toContain("실제 전송·OPFS 저장·GPU 실행 없음");
  });
  it("복사 실패와 수신자 거절은 미리보기를 남기고 재시도를 안내한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const receiver = vi.fn().mockRejectedValue(new Error("receiver failed"));
    render(<StudioDistributedCrdtSyncPanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("export-crdt-json-btn"));
    await waitFor(() => expect(screen.getByTestId("crdt-panel-status").textContent).toContain("복사 실패"));
    expect(screen.getByTestId("crdt-panel-status").textContent).toContain("전달 실패");
    expect(screen.getByTestId("crdt-json-preview").textContent).toContain('"networkConnected": false');
  });
  it("원격 시계도 안전 정수 초과를 거절하고 큰 유효 logical은 무손실 왕복한다", () => {
    const atMax = { physicalMs: Number.MAX_SAFE_INTEGER, logical: Number.MAX_SAFE_INTEGER, nodeId: "lead-artist" as const };
    expect(() => receiveHlcRemote(atMax, atMax, Number.MAX_SAFE_INTEGER)).toThrow();
    const op = { ...sample().op, hlc: { ...sample().op.hlc, logical: 1000000 } };
    const decoded = deserializeDeltaPacket(serializeDeltaPacket([op], "webrtc-datachannel"));
    expect(decoded.ok && decoded.ops[0]?.hlc.logical).toBe(1000000);
  });
  it("패킷의 좌표 상한·저자 불일치와 추정 바이트 위변조를 거절한다", () => {
    const packet = serializeDeltaPacket([sample().op], "webrtc-datachannel");
    for (const [index, value] of [[3, "4"], [6, "-1"], [7, "color-assist"], [11, "513"], [12, "256"]] as const) {
      const parts = packet.encodedPayload.split("|"); parts[index] = value;
      expect(deserializeDeltaPacket(rehash({ ...packet, encodedPayload: parts.join("|") })).ok).toBe(false);
    }
    expect(deserializeDeltaPacket({ ...packet, compressedDeltaBytes: 1 }).ok).toBe(false);
    expect(packet.compressionApplied).toBe(false);
    expect(packet.encodedPayloadBytes).toBe(new TextEncoder().encode(packet.encodedPayload).byteLength);
  });
  it("클러스터 합성도 충돌 ID를 Map으로 덮어쓰지 않는다", () => {
    const first = sample().peer;
    const op = first.opLog[0];
    if (!op) throw new Error("missing fixture");
    const second = { ...createCrdtPeerState("color-assist"), opLog: [{ ...op, strokeHash: "changed" }] };
    expect(() => reconcileClusterOutOfOrder([first, second])).toThrow();
  });
  it("복사 성공은 실제 Promise 완료 뒤 표시하고 대기 중 재실행을 막는다", async () => {
    let ack: () => void = () => { throw new Error("missing receipt"); };
    const writeText = vi.fn(() => new Promise<void>((resolve) => { ack = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioDistributedCrdtSyncPanel />);
    fireEvent.click(screen.getByTestId("export-crdt-json-btn"));
    expect(screen.getByTestId("export-crdt-json-btn").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByTestId("crdt-panel-status")?.textContent ?? "").not.toContain("복사 완료");
    ack();
    await waitFor(() => expect(screen.getByTestId("crdt-panel-status").textContent).toContain("복사 완료"));
    expect(screen.getByTestId("export-crdt-json-btn").hasAttribute("disabled")).toBe(false);
  });

});
