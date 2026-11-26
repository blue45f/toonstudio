import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryP2pPeerNetwork,
  importRawVaultKey,
  P2pEncryptedBackupVault,
  type P2pPeerNetworkAdapter,
} from "./p2p-encrypted-backup-merkle-verifier";

async function createBackup() {
  const peers = createInMemoryP2pPeerNetwork(["data-a", "data-b", "parity"]);
  const unavailablePeers = new Set<string>();
  const getShard = vi.fn(async (peerId: string, shardKey: string) => {
    if (unavailablePeers.has(peerId)) throw new Error(`피어 연결 실패: ${peerId}`);
    return peers.getShard(peerId, shardKey);
  });
  const network: P2pPeerNetworkAdapter = { ...peers, getShard };
  const vault = new P2pEncryptedBackupVault(network);
  const key = await importRawVaultKey(Uint8Array.from({ length: 32 }, (_, index) => index));
  const snapshot = Uint8Array.from({ length: 256 }, (_, index) => (index * 17) % 256);
  const manifest = await vault.backupSnapshot(snapshot, key, {
    snapshotId: "rejected-peer-backup",
    chunkSizeBytes: 64,
    dataShardCount: 2,
  });
  return { vault, key, snapshot, manifest, unavailablePeers, getShard };
}

describe("P2P 백업 피어 요청 실패 복구", () => {
  it.each(["data-a", "data-b"])("%s 요청이 거절되어도 패리티로 원본을 복구한다", async (peerId) => {
    const { vault, key, snapshot, manifest, unavailablePeers, getShard } = await createBackup();
    unavailablePeers.add(peerId);

    const result = await vault.recoverSnapshot(manifest, key);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.data).toEqual(snapshot);
    expect(result.report).toMatchObject({
      recoveredFromParity: true,
      reconstructedShardIndex: peerId === "data-a" ? 0 : 1,
      healthyShardCount: 2,
      lostOrCorruptedPeerIds: [peerId],
      verifiedChunkCount: manifest.chunkCount,
      totalPlaintextBytes: snapshot.length,
    });
    expect(getShard.mock.calls.map(([readPeer]) => readPeer)).toEqual(["data-a", "data-b", "parity"]);
  });

  it("패리티 피어만 거절되면 정상 데이터 샤드로 복구하고 유실 피어를 보고한다", async () => {
    const { vault, key, snapshot, manifest, unavailablePeers, getShard } = await createBackup();
    unavailablePeers.add("parity");

    const result = await vault.recoverSnapshot(manifest, key);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.detail);
    expect(result.data).toEqual(snapshot);
    expect(result.report).toMatchObject({
      recoveredFromParity: false,
      reconstructedShardIndex: null,
      healthyShardCount: 2,
      lostOrCorruptedPeerIds: ["parity"],
      verifiedChunkCount: manifest.chunkCount,
    });
    expect(getShard).toHaveBeenCalledTimes(3);
  });

  it("두 피어의 요청이 거절되면 나머지 피어까지 확인하고 복구 불가 결과를 반환한다", async () => {
    const { vault, key, manifest, unavailablePeers, getShard } = await createBackup();
    unavailablePeers.add("data-a");
    unavailablePeers.add("parity");

    await expect(vault.recoverSnapshot(manifest, key)).resolves.toMatchObject({
      ok: false,
      error: "insufficient-shards-for-recovery",
      lostOrCorruptedPeerIds: ["data-a", "parity"],
    });
    expect(getShard.mock.calls.map(([readPeer]) => readPeer)).toEqual(["data-a", "data-b", "parity"]);
  });
});
