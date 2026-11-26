import { describe, expect, it } from "vitest";

import {
  P2pBftStateValidator,
  ZeroFeeTimestampAuditLog,
  generateCreatorAuditIdentity,
  sha256Hex,
  verifyAuditReceiptOffline,
} from "./p2p-bft-timestamp-audit";
import { decodeBinaryXorRleDelta, encodeBinaryXorRleDelta } from "./webrtc-delta-and-zk-ownership";

describe("피어 정족수와 감사 기록", () => {
  it("허용하는 모든 로스터에서 두 정족수가 결함 한도보다 많은 피어를 공유한다", () => {
    for (let count = 4; count <= 20; count += 1) {
      const peerIds = Array.from({ length: count }, (_, i) => String(i));
      for (let f = 1; f <= Math.floor((count - 1) / 3); f += 1) {
        const { requiredQuorum } = new P2pBftStateValidator({ peerIds, maxFaultyPeers: f });
        expect(2 * requiredQuorum - count).toBeGreaterThan(f);
        expect(requiredQuorum).toBeLessThanOrEqual(count - f);
      }
    }
  });

  it("동시 호출 순서로 원장을 추가하고 대기 중인 변경까지 봉인한다", async () => {
    const identity = await generateCreatorAuditIdentity("검수자|보조");
    const log = new ZeroFeeTimestampAuditLog();
    const contentBytes = Uint8Array.of(3, 5, 8);
    const contentHash = await sha256Hex(contentBytes);
    const before = Date.now();
    const pending = ["원고", "채색|검수", "출고"].map((metadataSummary) =>
      log.appendRevision({ identity, manuscriptId: "ep1", contentBytes, metadataSummary }));
    const pendingSeal = log.sealMerkleEpoch({ identity, epochId: "초안|1" });
    contentBytes.fill(0);
    const entries = await Promise.all(pending);
    const epoch = await pendingSeal;
    const after = Date.now();
    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(entries.map((entry) => entry.contentSha256Hex)).toEqual(Array(3).fill(contentHash));
    expect(entries[1].prevEntryHashHex).toBe(entries[0].entryHashHex);
    expect(entries[2].prevEntryHashHex).toBe(entries[1].entryHashHex);
    expect(epoch.entryCount).toBe(3);
    for (const timestamp of [...entries.map((entry) => entry.timestampIso), epoch.sealedAtIso]) {
      expect(Date.parse(timestamp)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(timestamp)).toBeLessThanOrEqual(after);
    }
    const entry = entries[1];
    const framed = JSON.stringify(["toonstudio-audit-v2", String(entry.index), entry.manuscriptId,
      entry.timestampIso, entry.prevEntryHashHex, entry.contentSha256Hex, entry.metadataSummary,
      entry.creatorId, entry.publicKeyThumbprintHex]);
    expect(await sha256Hex(framed)).toBe(entry.entryHashHex);
    expect(await log.verifyHashChainIntegrity()).toBe(true);
    const receipt = await log.exportOfflineReceipt(1, epoch, identity.publicKeyJwk);
    expect((await verifyAuditReceiptOffline(receipt)).valid).toBe(true);
  });

  it("정상 델타의 토큰이나 출력 길이가 잘리면 복원을 거절한다", () => {
    const base = Uint8Array.of(1, 2, 3, 4);
    for (const next of [base, Uint8Array.of(9, 8, 7), new Uint8Array()]) {
      const packet = encodeBinaryXorRleDelta(base, next);
      expect(decodeBinaryXorRleDelta(base, packet)).toEqual(next);
      for (let len = 0; len < packet.length; len += 1) {
        expect(() => decodeBinaryXorRleDelta(base, packet.subarray(0, len))).toThrow();
      }
      const trailing = new Uint8Array(packet.length + 1);
      trailing.set(packet);
      expect(() => decodeBinaryXorRleDelta(base, trailing)).toThrow();
    }
  });
});
