import { describe, expect, it } from "vitest";

import {
  BYTES_PER_PIXEL_RGBA,
  ContentAddressedTileCanvasStore,
  DEFAULT_CANVAS_HEIGHT_PX,
  DEFAULT_CANVAS_WIDTH_PX,
  DEFAULT_TILE_SIZE_PX,
  NETWORK_PROFILE_SPECS,
  OfflineMultiDeviceTileSyncNode,
  cloneDeltaBlob,
  compressTileDelta,
  computeBandwidthSavingsMetrics,
  computeTileManifestMerkleRoot,
  decompressTileDelta,
  diffTileCanvasManifests,
  estimateTransferMatrix,
  estimateTransferTimeByProfile,
  formatByteSizeKo,
  formatOfflineSyncStatusSummaryKo,
  makeTileKey,
  parseTileKey,
  planBandwidthConstrainedSyncBatch,
  sha256TileHex,
  type CompressedTileDeltaBlob,
  type NetworkProfileId,
  type SyncDeviceRole,
  type TileCoord,
  type TileIntegrityErrorCode,
} from "./index";

function patternTile(tileSize: number, seed: number, density = 1): Uint8Array {
  const bytes = new Uint8Array(tileSize * tileSize * BYTES_PER_PIXEL_RGBA);
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if ((x + y) % density !== 0) continue;
      const off = (y * tileSize + x) * BYTES_PER_PIXEL_RGBA;
      bytes[off] = (x * 13 + y * 7 + seed * 29) & 0xff;
      bytes[off + 1] = (x * 5 + y * 19 + seed * 43) & 0xff;
      bytes[off + 2] = (x * 11 + y * 3 + seed * 61) & 0xff;
      bytes[off + 3] = 255;
    }
  }
  return bytes;
}

function solidTile(tileSize: number, rgba: readonly [number, number, number, number], margin = 2): Uint8Array {
  const bytes = new Uint8Array(tileSize * tileSize * BYTES_PER_PIXEL_RGBA);
  for (let y = margin; y < tileSize - margin; y += 1) {
    for (let x = margin; x < tileSize - margin; x += 1) {
      const off = (y * tileSize + x) * BYTES_PER_PIXEL_RGBA;
      bytes[off] = rgba[0]; bytes[off + 1] = rgba[1]; bytes[off + 2] = rgba[2]; bytes[off + 3] = rgba[3];
    }
  }
  return bytes;
}

function makeNode(
  deviceId: string,
  role: SyncDeviceRole,
  opts: { width?: number; height?: number; tileSize?: number; layerIds?: readonly string[]; profile?: NetworkProfileId } = {},
): OfflineMultiDeviceTileSyncNode {
  return new OfflineMultiDeviceTileSyncNode({
    canvasId: "ep-84-ch01", deviceId, role,
    width: opts.width ?? 64, height: opts.height ?? 64, tileSize: opts.tileSize ?? 16,
    layerIds: opts.layerIds ?? ["bg", "ink"], networkProfile: opts.profile ?? "cafe-wifi-20mbps",
  });
}

function expectErr(res: { readonly ok: boolean; readonly code?: TileIntegrityErrorCode }, code: TileIntegrityErrorCode): void {
  expect(res.ok).toBe(false);
  expect(res.code).toBe(code);
}

describe("Wave 84 — 256×256 콘텐츠 주소 지정 타일 저장소 및 SHA-256/PackBits+XOR", () => {
  it("FIPS 180-4 SHA-256 표준 벡터와 정확히 일치한다", () => {
    expect(sha256TileHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256TileHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256TileHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("PackBits+XOR 압축이 빈 타일·고엔트로피 타일·수정 델타 모두 무손실 왕복된다", () => {
    const blank = new Uint8Array(64 * 64 * BYTES_PER_PIXEL_RGBA);
    const blankBlob = compressTileDelta(blank, null);
    expect(blankBlob.compressedBytes.byteLength).toBeLessThan(32);
    const decBlank = decompressTileDelta(blankBlob, null);
    expect(decBlank.ok && decBlank.tileBytes).toEqual(blank);

    const base = patternTile(32, 11, 1);
    const edited = new Uint8Array(base);
    for (let i = 0; i < 64; i += 4) { edited[i] = 240; edited[i + 1] = 32; edited[i + 2] = 16; edited[i + 3] = 255; }
    const xorBlob = compressTileDelta(edited, base);
    expect(xorBlob.compressedBytes.byteLength).toBeLessThan(compressTileDelta(edited, null).compressedBytes.byteLength * 0.2);
    const decXor = decompressTileDelta(xorBlob, base);
    expect(decXor.ok && decXor.tileBytes).toEqual(edited);
  });

  it("8K 캔버스(8192×8192, 32×32=1024 타일)의 빈 타일이 단일 해시 블롭으로 중복 제거된다", () => {
    const store = new ContentAddressedTileCanvasStore({ width: DEFAULT_CANVAS_WIDTH_PX, height: DEFAULT_CANVAS_HEIGHT_PX, tileSize: DEFAULT_TILE_SIZE_PX, layerIds: ["bg", "ink"] });
    const m = store.getManifest();
    expect([m.tilesX, m.tilesY, m.totalTileSlots, m.nonBlankTileCount, m.uniqueBlobCount]).toEqual([32, 32, 2048, 0, 1]);
    expect(store.getTotalStoredBlobBytes()).toBeLessThan(64);
  });

  it("8K 캔버스에서 2개 타일만 건드리는 브러시 획 1회가 95% 초과 대역폭을 절감한다", () => {
    const store = new ContentAddressedTileCanvasStore({ width: 8192, height: 8192, tileSize: 256, layerIds: ["ink"] });
    const before = store.getManifest();
    const stroke = store.applyBrushStrokeToLayer({ layerId: "ink", x0: 240, y0: 64, x1: 272, y1: 64, radiusPx: 4, rgba: [24, 32, 40, 255] });
    const after = store.getManifest();
    expect(stroke.touchedTiles.length).toBe(2);
    expect(after.nonBlankTileCount).toBe(2);
    expect(after.merkleRoot).not.toBe(before.merkleRoot);

    const diff = diffTileCanvasManifests(after, before);
    const savings = computeBandwidthSavingsMetrics({ fullCanvasRawBytes: diff.fullCanvasRawBytes, changedTilesRawBytes: diff.changedTilesRawBytes, deltaWireBytes: stroke.totalDeltaWireBytes });
    expect(savings.bandwidthSavingsRatio).toBeGreaterThan(0.95);
    expect(savings.bandwidthSavingsPercent).toBeGreaterThan(99.9);
  });

  it("동일 패턴 타일은 단일 해시로 중복 제거되고, 지우면 빈 타일과 최초 머클 루트로 복귀한다", () => {
    const store = new ContentAddressedTileCanvasStore({ width: 128, height: 128, tileSize: 16, layerIds: ["tone"] });
    const pristineRoot = store.getManifest().merkleRoot;
    const tone = solidTile(16, [190, 190, 190, 255], 1);
    for (let tx = 0; tx < 6; tx += 1) store.putTilePixels({ layerId: "tone", tileX: tx, tileY: 0 }, tone);
    expect(store.getManifest().nonBlankTileCount).toBe(6);
    expect(store.getUniqueBlobCount()).toBe(2);

    const blank = new Uint8Array(16 * 16 * BYTES_PER_PIXEL_RGBA);
    for (let tx = 0; tx < 6; tx += 1) store.putTilePixels({ layerId: "tone", tileX: tx, tileY: 0 }, blank);
    expect(store.getManifest().nonBlankTileCount).toBe(0);
    expect(store.getManifest().merkleRoot).toBe(pristineRoot);
  });

  it("타일 기록 순서와 무관하게 머클 루트가 동일하며 타일 키 파싱이 정확하다", () => {
    const a = new ContentAddressedTileCanvasStore({ width: 64, height: 64, tileSize: 16, layerIds: ["ink"] });
    const b = new ContentAddressedTileCanvasStore({ width: 64, height: 64, tileSize: 16, layerIds: ["ink"] });
    const p1 = patternTile(16, 1, 2); const p2 = patternTile(16, 2, 2);
    a.putTilePixels({ layerId: "ink", tileX: 0, tileY: 0 }, p1);
    a.putTilePixels({ layerId: "ink", tileX: 3, tileY: 2 }, p2);
    b.putTilePixels({ layerId: "ink", tileX: 3, tileY: 2 }, p2);
    b.putTilePixels({ layerId: "ink", tileX: 0, tileY: 0 }, p1);
    expect(a.getManifest().merkleRoot).toBe(b.getManifest().merkleRoot);
    expect(parseTileKey(makeTileKey("char:main", 7, 15))).toEqual({ layerId: "char:main", tileX: 7, tileY: 15 });
    expect(parseTileKey("invalid")).toBeNull();
  });

  it("computeTileManifestMerkleRoot가 빈 타일 엔트리와 레이어 순서를 정규화한다", () => {
    const blankHash = sha256TileHex(new Uint8Array(16 * 16 * 4));
    const tileHash = sha256TileHex(patternTile(16, 42, 2));
    const r1 = computeTileManifestMerkleRoot({ canvasId: "c", width: 64, height: 64, tileSize: 16, blankTileHash: blankHash, layerIds: ["ink", "bg"], nonBlankTiles: { "ink:1:1": tileHash } });
    const r2 = computeTileManifestMerkleRoot({ canvasId: "c", width: 64, height: 64, tileSize: 16, blankTileHash: blankHash, layerIds: ["bg", "ink"], nonBlankTiles: { "ink:0:0": blankHash, "ink:1:1": tileHash } });
    expect(r1).toBe(r2);
  });
});

describe("Wave 84 — SHA-256 무결성 검증(1바이트 변조 Fail-Closed 차단)", () => {
  it("압축 타일 델타 페이로드에서 1바이트만 변조되어도 복원을 즉시 거부한다", () => {
    const blob = cloneDeltaBlob(compressTileDelta(solidTile(32, [31, 68, 53, 255]), null));
    const last = blob.compressedBytes.length - 1;
    blob.compressedBytes[last] = (blob.compressedBytes[last] ?? 0) ^ 0x01;
    expectErr(decompressTileDelta(blob, null), "PAYLOAD_HASH_MISMATCH");
  });

  it("저장소 내부 블롭이 1바이트 변조되면 타일 읽기와 전수 감사 모두 실패를 반환한다", () => {
    const backingBlobs = new Map<string, CompressedTileDeltaBlob>();
    const store = new ContentAddressedTileCanvasStore({ width: 64, height: 64, tileSize: 16, layerIds: ["ink"], backingBlobs });
    const coord: TileCoord = { layerId: "ink", tileX: 1, tileY: 1 };
    const receipt = store.putTilePixels(coord, patternTile(16, 9, 2));
    const stored = backingBlobs.get(receipt.nextHash);
    if (stored) stored.compressedBytes[0] = (stored.compressedBytes[0] ?? 0) ^ 0xff;
    expectErr(store.readTilePixelsVerified(coord), "PAYLOAD_HASH_MISMATCH");
    const audit = store.verifyStoreIntegrity();
    expect(audit.ok).toBe(false);
    expect(audit.corruptedHashes).toContain(receipt.nextHash);
  });

  it("네트워크 델타 패킷의 1바이트 변조를 fail-closed로 차단하고 수신자 캔버스를 보호한다", () => {
    const sender = makeNode("desktop-1", "desktop");
    const receiver = makeNode("ipad-1", "ipad-tablet");
    sender.editTile({ layerId: "ink", tileX: 0, tileY: 0 }, solidTile(16, [20, 40, 80, 255]));
    const packet = sender.buildDeltaPacketForPeer(receiver.exportSyncDigest());
    const initialRoot = receiver.getManifest().merkleRoot;
    const first = packet.items[0];
    if (first) {
      const idx = Math.floor(first.deltaBlob.compressedBytes.length / 2);
      first.deltaBlob.compressedBytes[idx] = (first.deltaBlob.compressedBytes[idx] ?? 0) ^ 0x04;
    }
    const res = receiver.applyDeltaPacket(packet);
    expect(res.ok).toBe(false);
    expect(res.acceptedTileCount).toBe(0);
    expect(res.rejectedCorruptTiles[0]?.code).toBe("PAYLOAD_HASH_MISMATCH");
    expect(receiver.getManifest().merkleRoot).toBe(initialRoot);
  });

  it("XOR 델타의 기준 타일 누락 및 해시 불일치를 fail-closed로 차단한다", () => {
    const base = patternTile(16, 1, 2);
    const delta = compressTileDelta(patternTile(16, 3, 2), base);
    expectErr(decompressTileDelta(delta, null), "BASE_TILE_MISSING");
    expectErr(decompressTileDelta(delta, patternTile(16, 2, 2)), "BASE_HASH_MISMATCH");
  });

  it("위조된 payloadHash로 잘린 PackBits 스트림을 보내도 구조 검증에서 거부한다", () => {
    const base = patternTile(16, 1, 2);
    const delta = compressTileDelta(patternTile(16, 3, 2), base);
    const cut = delta.compressedBytes.slice(0, 14);
    expectErr(decompressTileDelta({ ...delta, compressedBytes: cut, payloadHash: sha256TileHex(cut) }, base), "CORRUPT_PACKBITS_STREAM");
  });

  it("범위 밖 타일 좌표 읽기와 규격 불일치 블롭 임포트를 오류 코드로 거부한다", () => {
    const store = new ContentAddressedTileCanvasStore({ width: 32, height: 32, tileSize: 16, layerIds: ["ink"] });
    expectErr(store.readTilePixelsVerified({ layerId: "ink", tileX: 9, tileY: 0 }), "TILE_OUT_OF_BOUNDS");
    expectErr(store.importVerifiedDeltaBlob(compressTileDelta(new Uint8Array(32 * 32 * 4), null)), "INVALID_TILE_LENGTH");
  });
});

describe("Wave 84 — 오프라인 멀티-디바이스 무충돌 CRDT 수렴(교환·결합·멱등성)", () => {
  it("좌상단(Peer A)과 우하단(Peer B) 오프라인 병렬 편집 시 변경 타일만 전송해 비트 동일 수렴한다", () => {
    const peerA = makeNode("desktop-a", "desktop", { profile: "airplane-queued" });
    const peerB = makeNode("ipad-b", "ipad-tablet", { profile: "airplane-queued" });
    peerA.editTile({ layerId: "bg", tileX: 0, tileY: 0 }, solidTile(16, [100, 150, 210, 255]));
    peerA.editTile({ layerId: "bg", tileX: 1, tileY: 1 }, solidTile(16, [120, 170, 220, 255]));
    peerB.editTile({ layerId: "ink", tileX: 2, tileY: 2 }, solidTile(16, [25, 25, 30, 255]));
    peerB.editTile({ layerId: "ink", tileX: 3, tileY: 3 }, solidTile(16, [45, 35, 50, 255]));

    peerA.setNetworkProfile("cafe-wifi-20mbps");
    peerB.setNetworkProfile("cafe-wifi-20mbps");
    const synced = peerA.syncDeltaWithPeer(peerB);
    expect([synced.status, synced.merkleRootsMatch, synced.outbound.transferredTileCount, synced.inbound.transferredTileCount]).toEqual(["converged", true, 2, 2]);
    expect(peerA.getConflictArchive().length).toBe(0);
    expect(peerA.store.assembleLayerPixelsVerified("bg")).toEqual(peerB.store.assembleLayerPixelsVerified("bg"));
    expect(peerA.store.assembleLayerPixelsVerified("ink")).toEqual(peerB.store.assembleLayerPixelsVerified("ink"));
  });

  it("3대 기기(Desktop·iPad·Laptop)의 비행기 모드 분기가 6가지 모든 병합 순열에서 비트 동일 수렴한다", () => {
    const perms: readonly (readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2])[] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const roots: string[] = [];
    let refBg: Uint8Array | null = null;
    let refInk: Uint8Array | null = null;

    for (let p = 0; p < perms.length; p += 1) {
      const ord = perms[p];
      if (!ord) continue;
      const d = makeNode("dev-desktop-a", "desktop", { profile: "airplane-queued" });
      const i = makeNode("dev-ipad-b", "ipad-tablet", { profile: "airplane-queued" });
      const l = makeNode("dev-laptop-c", "laptop", { profile: "airplane-queued" });
      d.editTile({ layerId: "bg", tileX: 0, tileY: 0 }, patternTile(16, 10, 2));
      d.editTile({ layerId: "bg", tileX: 1, tileY: 0 }, patternTile(16, 11, 2));
      i.editTile({ layerId: "ink", tileX: 2, tileY: 2 }, patternTile(16, 20, 2));
      i.editTile({ layerId: "ink", tileX: 3, tileY: 2 }, patternTile(16, 21, 2));
      l.editTile({ layerId: "ink", tileX: 0, tileY: 3 }, patternTile(16, 30, 2));
      l.editTile({ layerId: "bg", tileX: 3, tileY: 3 }, patternTile(16, 31, 2));

      const nodes = [d, i, l] as const;
      nodes.forEach((n) => n.setNetworkProfile("cafe-wifi-20mbps"));
      nodes[ord[0]].syncDeltaWithPeer(nodes[ord[1]]);
      nodes[ord[1]].syncDeltaWithPeer(nodes[ord[2]]);
      nodes[ord[0]].syncDeltaWithPeer(nodes[ord[2]]);

      const root = d.getManifest().merkleRoot;
      expect(i.getManifest().merkleRoot).toBe(root);
      expect(l.getManifest().merkleRoot).toBe(root);
      roots.push(root);
      const bg = d.store.assembleLayerPixelsVerified("bg");
      const ink = d.store.assembleLayerPixelsVerified("ink");
      if (refBg === null || refInk === null) { refBg = bg; refInk = ink; }
      else { expect(bg).toEqual(refBg); expect(ink).toEqual(refInk); }
    }
    roots.forEach((r) => expect(r).toBe(roots[0]));
  });

  it("수렴 후 동기화를 반복해도 추가 전송이 0건·0바이트인 멱등성을 보장한다", () => {
    const a = makeNode("desktop-idem", "desktop");
    const b = makeNode("ipad-idem", "ipad-tablet");
    a.editTile({ layerId: "ink", tileX: 0, tileY: 1 }, solidTile(16, [50, 90, 120, 255]));
    a.syncDeltaWithPeer(b);
    const second = a.syncDeltaWithPeer(b);
    expect([second.status, second.totalTransferredTiles, second.totalWireBytes]).toEqual(["converged", 0, 0]);
  });

  it("선행 버전을 수신한 뒤 후속 편집한 인과 갱신은 충돌 보관함 없이 갱신된다", () => {
    const desktop = makeNode("desktop-c", "desktop");
    const ipad = makeNode("ipad-c", "ipad-tablet");
    const coord: TileCoord = { layerId: "ink", tileX: 1, tileY: 1 };
    const v2 = solidTile(16, [180, 40, 60, 255]);
    desktop.editTile(coord, solidTile(16, [10, 10, 10, 255]));
    desktop.syncDeltaWithPeer(ipad);
    ipad.editTile(coord, v2);
    expect(ipad.syncDeltaWithPeer(desktop).merkleRootsMatch).toBe(true);
    expect(desktop.getConflictArchive().length).toBe(0);
    const readRes = desktop.store.readTilePixelsVerified(coord);
    expect(readRes.ok && readRes.pixels).toEqual(v2);
  });

  it("한 기기에서 타일을 빈 픽셀로 지우면 동기화 시 상대 기기에서도 빈 타일로 수렴한다", () => {
    const a = makeNode("desktop-erase", "desktop");
    const b = makeNode("ipad-erase", "ipad-tablet");
    const coord: TileCoord = { layerId: "ink", tileX: 0, tileY: 0 };
    const pristineRoot = a.getManifest().merkleRoot;
    a.editTile(coord, solidTile(16, [99, 88, 77, 255]));
    a.syncDeltaWithPeer(b);
    a.editTile(coord, new Uint8Array(16 * 16 * 4));
    a.syncDeltaWithPeer(b);
    expect(a.getManifest().merkleRoot).toBe(pristineRoot);
    expect(b.getManifest().merkleRoot).toBe(pristineRoot);
  });
});

describe("Wave 84 — 동일 타일 동시 편집 비파괴 충돌 보관(Zero Stroke Loss)", () => {
  it("두 기기가 정확히 같은 타일을 오프라인 동시 편집하면 결정론적 승자를 택하고 패자를 conflictArchive에 무손실 보존한다", () => {
    const run = (reverse: boolean) => {
      const desktop = makeNode("dev-a-desktop", "desktop");
      const ipad = makeNode("dev-b-ipad", "ipad-tablet");
      const coord: TileCoord = { layerId: "ink", tileX: 1, tileY: 2 };
      const pxDesktop = solidTile(16, [25, 90, 160, 255]);
      const pxIpad = solidTile(16, [210, 60, 45, 255]);
      desktop.editTile(coord, pxDesktop);
      ipad.editTile(coord, pxIpad);
      const res = reverse ? ipad.syncDeltaWithPeer(desktop) : desktop.syncDeltaWithPeer(ipad);
      return { desktop, ipad, res, coord, pxDesktop, pxIpad };
    };
    const fwd = run(false);
    const bwd = run(true);
    expect(fwd.res.merkleRootsMatch && bwd.res.merkleRootsMatch).toBe(true);
    expect(fwd.desktop.getManifest().merkleRoot).toBe(bwd.desktop.getManifest().merkleRoot);
    const winRead = fwd.desktop.store.readTilePixelsVerified(fwd.coord);
    expect(winRead.ok && winRead.pixels).toEqual(fwd.pxIpad);
    expect(fwd.desktop.getConflictArchive().length).toBe(1);
    const recovered = fwd.ipad.readConflictTilePixels(fwd.desktop.getConflictArchive()[0]?.conflictId ?? "");
    expect(recovered.ok && recovered.pixels).toEqual(fwd.pxDesktop);
  });

  it("3대 기기가 동일 타일을 동시 편집해도 모든 병합 순서에서 동일 승자와 2개 패자 보관함으로 수렴한다", () => {
    const run3 = (ord: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]) => {
      const d = makeNode("dev-desktop-a", "desktop");
      const i = makeNode("dev-ipad-b", "ipad-tablet");
      const l = makeNode("dev-laptop-c", "laptop");
      const coord: TileCoord = { layerId: "ink", tileX: 0, tileY: 0 };
      d.editTile(coord, solidTile(16, [11, 22, 33, 255]));
      i.editTile(coord, solidTile(16, [44, 55, 66, 255]));
      l.editTile(coord, solidTile(16, [77, 88, 99, 255]));
      const nodes = [d, i, l] as const;
      nodes[ord[0]].syncDeltaWithPeer(nodes[ord[1]]);
      nodes[ord[1]].syncDeltaWithPeer(nodes[ord[2]]);
      nodes[ord[0]].syncDeltaWithPeer(nodes[ord[2]]);
      return { d, i, l };
    };
    const r1 = run3([0, 1, 2]);
    const r2 = run3([2, 0, 1]);
    expect(r1.d.getManifest().merkleRoot).toBe(r2.l.getManifest().merkleRoot);
    expect(r1.d.getConflictArchive().length).toBe(2);
    expect(r1.d.getConflictArchive()).toEqual(r2.l.getConflictArchive());
  });

  it("충돌 해결(restore-archived / keep-winner)이 새 인과 버전으로 피어에 전파된다", () => {
    const desktop = makeNode("dev-a-desktop", "desktop");
    const ipad = makeNode("dev-b-ipad", "ipad-tablet");
    const c1: TileCoord = { layerId: "ink", tileX: 0, tileY: 0 };
    const c2: TileCoord = { layerId: "ink", tileX: 1, tileY: 0 };
    const draft1 = solidTile(16, [15, 110, 90, 255]);
    desktop.editTile(c1, draft1); ipad.editTile(c1, solidTile(16, [220, 80, 30, 255]));
    desktop.editTile(c2, solidTile(16, [30, 30, 30, 255])); ipad.editTile(c2, solidTile(16, [90, 90, 90, 255]));
    desktop.syncDeltaWithPeer(ipad);

    const conflicts = desktop.getConflictArchive();
    expect(conflicts.length).toBe(2);
    expect(desktop.resolveConflict(conflicts.find((e) => e.tileKey === "ink:0:0")?.conflictId ?? "", "restore-archived")).toBe(true);
    expect(desktop.resolveConflict(conflicts.find((e) => e.tileKey === "ink:1:0")?.conflictId ?? "", "keep-winner")).toBe(true);
    desktop.syncDeltaWithPeer(ipad);
    expect(ipad.getConflictArchive().length).toBe(0);
    const restored = ipad.store.readTilePixelsVerified(c1);
    expect(restored.ok && restored.pixels).toEqual(draft1);
  });
});

describe("Wave 84 — 저속망 LTE 이어받기 전송 및 뷰포트 우선 청크 스케줄러", () => {
  it("비행기 모드에서는 전송을 보류(queued-offline, 0바이트)하고 온라인 전환 시 즉시 동기화한다", () => {
    const a = makeNode("desktop-air", "desktop", { profile: "airplane-queued" });
    const b = makeNode("ipad-air", "ipad-tablet", { profile: "cafe-wifi-20mbps" });
    a.editTile({ layerId: "ink", tileX: 0, tileY: 0 }, solidTile(16, [40, 80, 120, 255]));
    const queued = a.syncDeltaWithPeer(b);
    expect([queued.status, queued.totalTransferredTiles, queued.totalWireBytes]).toEqual(["queued-offline", 0, 0]);
    a.setNetworkProfile("subway-lte-1mbps");
    const done = a.syncDeltaWithPeer(b);
    expect(done.status).toBe("converged");
    expect(done.merkleRootsMatch).toBe(true);
  });

  it("활성 뷰포트 및 활성 레이어 내부 타일을 화면 밖 타일보다 최우선 배치한다", () => {
    const node = makeNode("desktop-vp", "desktop", { width: 256, height: 256, tileSize: 32, profile: "subway-lte-1mbps" });
    const peer = makeNode("ipad-vp", "ipad-tablet", { width: 256, height: 256, tileSize: 32, profile: "subway-lte-1mbps" });
    node.editTile({ layerId: "ink", tileX: 0, tileY: 0 }, patternTile(32, 1, 1));
    node.editTile({ layerId: "ink", tileX: 7, tileY: 7 }, patternTile(32, 2, 1));
    node.editTile({ layerId: "bg", tileX: 4, tileY: 4 }, patternTile(32, 3, 1));
    node.editTile({ layerId: "ink", tileX: 4, tileY: 4 }, patternTile(32, 4, 1));
    node.editTile({ layerId: "ink", tileX: 5, tileY: 4 }, patternTile(32, 5, 1));

    const plan = planBandwidthConstrainedSyncBatch({
      pendingDeltas: node.buildDeltaPacketForPeer(peer.exportSyncDigest()).items,
      networkProfile: "subway-lte-1mbps", tileSize: 32,
      activeViewport: { x: 128, y: 128, width: 64, height: 64, activeLayerId: "ink" },
    });
    const keys = plan.orderedItems.map((it) => it.metadata.tileKey);
    expect(keys.slice(0, 2).sort()).toEqual(["ink:4:4", "ink:5:4"]);
    expect(keys[2]).toBe("bg:4:4");
    expect(keys.slice(3).sort()).toEqual(["ink:0:0", "ink:7:7"]);
    expect(plan.chunks[0]?.containsViewportTile).toBe(true);
  });

  it("지하철 LTE 전송을 50%에서 중단 후 이어받기하면 중복 전송 0건으로 비트 동일 완료된다", () => {
    const source = makeNode("desktop-lte", "desktop", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"], profile: "subway-lte-1mbps" });
    const target = makeNode("ipad-lte", "ipad-tablet", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"], profile: "subway-lte-1mbps" });
    for (let i = 0; i < 12; i += 1) source.editTile({ layerId: "ink", tileX: i % 4, tileY: Math.floor(i / 4) }, patternTile(64, i + 1, 1));

    const fullPlan = planBandwidthConstrainedSyncBatch({ pendingDeltas: source.buildDeltaPacketForPeer(target.exportSyncDigest()).items, networkProfile: "subway-lte-1mbps", tileSize: 64 });
    expect(fullPlan.chunks.length).toBeGreaterThanOrEqual(4);
    const half = Math.floor(fullPlan.chunks.length / 2);

    const part1 = source.syncDeltaToPeerResumable(target, { networkProfile: "subway-lte-1mbps", maxChunksThisAttempt: half });
    expect([part1.status, part1.chunksDelivered, part1.checkpoint.isComplete]).toEqual(["partial", half, false]);

    const part2 = source.syncDeltaToPeerResumable(target, { networkProfile: "subway-lte-1mbps", resumeFrom: part1.checkpoint });
    expect([part2.status, part2.checkpoint.isComplete, part2.duplicateTransferCount]).toEqual(["completed", true, 0]);
    expect(part1.transferredTileCount + part2.transferredTileCount).toBe(12);
    expect(target.getManifest().merkleRoot).toBe(source.getManifest().merkleRoot);
    expect(target.store.assembleLayerPixelsVerified("ink")).toEqual(source.store.assembleLayerPixelsVerified("ink"));
  });

  it("3회 연속 터널 끊김 이어받기와 ackedTileHashes 건너뛰기 모두 중복 전송 0건을 유지한다", () => {
    const source = makeNode("laptop-3seg", "laptop", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"], profile: "subway-lte-1mbps" });
    const target = makeNode("desktop-3seg", "desktop", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"], profile: "subway-lte-1mbps" });
    const hashes: string[] = [];
    for (let i = 0; i < 6; i += 1) hashes.push(source.editTile({ layerId: "ink", tileX: i % 4, tileY: Math.floor(i / 4) }, patternTile(64, i + 20, 1)).metadata.tileHash);

    const skipPlan = planBandwidthConstrainedSyncBatch({
      pendingDeltas: source.buildDeltaPacketForPeer(target.exportSyncDigest()).items,
      networkProfile: "subway-lte-1mbps", tileSize: 64, ackedTileHashes: new Set<string>(hashes.slice(0, 2)),
    });
    expect([skipPlan.skippedAckedTileCount, skipPlan.orderedItems.length]).toEqual([2, 4]);

    const s1 = source.syncDeltaToPeerResumable(target, { maxChunksThisAttempt: 1 });
    const s2 = source.syncDeltaToPeerResumable(target, { resumeFrom: s1.checkpoint, maxChunksThisAttempt: 1 });
    const s3 = source.syncDeltaToPeerResumable(target, { resumeFrom: s2.checkpoint });
    expect(s3.status).toBe("completed");
    expect(s1.duplicateTransferCount + s2.duplicateTransferCount + s3.duplicateTransferCount).toBe(0);
    expect(s1.transferredTileCount + s2.transferredTileCount + s3.transferredTileCount).toBe(6);
    expect(target.getManifest().merkleRoot).toBe(source.getManifest().merkleRoot);
  });

  it("네트워크 프로파일별 청크 예산과 paintBrushStroke 인과 커밋이 규격대로 동작한다", () => {
    const node = makeNode("desktop-b", "desktop", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"] });
    const peer = makeNode("ipad-b", "ipad-tablet", { width: 256, height: 256, tileSize: 64, layerIds: ["ink"] });
    for (let i = 0; i < 6; i += 1) node.editTile({ layerId: "ink", tileX: i % 4, tileY: Math.floor(i / 4) }, patternTile(64, i + 1, 1));
    const items = node.buildDeltaPacketForPeer(peer.exportSyncDigest()).items;
    const lte = planBandwidthConstrainedSyncBatch({ pendingDeltas: items, networkProfile: "subway-lte-1mbps", tileSize: 64 });
    const wifi = planBandwidthConstrainedSyncBatch({ pendingDeltas: items, networkProfile: "cafe-wifi-20mbps", tileSize: 64 });
    const lan = planBandwidthConstrainedSyncBatch({ pendingDeltas: items, networkProfile: "lan-gigabit", tileSize: 64 });
    expect(lte.chunks.length).toBeGreaterThan(wifi.chunks.length);
    expect(lan.chunks.length).toBe(1);
    expect(NETWORK_PROFILE_SPECS["subway-lte-1mbps"].maxChunkBytes).toBe(32 * 1024);

    const brushNode = makeNode("ipad-pen", "ipad-tablet", { width: 128, height: 128, tileSize: 32, layerIds: ["ink"] });
    const commits = brushNode.paintBrushStroke({ layerId: "ink", x0: 28, y0: 16, x1: 36, y1: 16, radiusPx: 2, rgba: [15, 20, 30, 255] });
    expect(commits.length).toBe(2);
    expect(brushNode.getLamportClock()).toBe(2);
    expect(brushNode.getNodeVectorClock()).toEqual({ "ipad-pen": 2 });
  });
});

describe("Wave 84 — 매니페스트 차분·전송 시간 매트릭스·Calm Atelier 한국어 상태 요약", () => {
  it("diffTileCanvasManifests와 estimateTransferMatrix가 차분과 전송 시간을 정확히 계산한다", () => {
    const local = new ContentAddressedTileCanvasStore({ width: 64, height: 64, tileSize: 16, layerIds: ["ink"] });
    const remote = new ContentAddressedTileCanvasStore({ width: 64, height: 64, tileSize: 16, layerIds: ["ink"] });
    const same = solidTile(16, [10, 20, 30, 255]);
    local.putTilePixels({ layerId: "ink", tileX: 0, tileY: 0 }, same);
    remote.putTilePixels({ layerId: "ink", tileX: 0, tileY: 0 }, same);
    local.putTilePixels({ layerId: "ink", tileX: 1, tileY: 0 }, solidTile(16, [40, 50, 60, 255]));
    remote.putTilePixels({ layerId: "ink", tileX: 1, tileY: 0 }, solidTile(16, [70, 80, 90, 255]));
    local.putTilePixels({ layerId: "ink", tileX: 2, tileY: 0 }, solidTile(16, [110, 120, 130, 255]));
    remote.putTilePixels({ layerId: "ink", tileX: 3, tileY: 0 }, solidTile(16, [140, 150, 160, 255]));

    const diff = diffTileCanvasManifests(local.getManifest(), remote.getManifest());
    expect([diff.isIdentical, diff.changedTileCount, diff.unchangedTileCount]).toEqual([false, 3, 13]);
    expect([diff.addedTileKeys, diff.modifiedTileKeys, diff.clearedTileKeys]).toEqual([["ink:2:0"], ["ink:1:0"], ["ink:3:0"]]);

    const matrix = estimateTransferMatrix(128 * 1024, 4);
    expect(matrix["airplane-queued"].estimatedMs).toBeNull();
    expect(matrix["subway-lte-1mbps"].estimatedMs).toBeGreaterThan(matrix["cafe-wifi-20mbps"].estimatedMs ?? 0);
    expect(matrix["cafe-wifi-20mbps"].estimatedMs).toBeGreaterThan(matrix["lan-gigabit"].estimatedMs ?? 0);
    expect(estimateTransferTimeByProfile(0, 0, "lan-gigabit").formattedDurationKo).toBe("즉시");
  });

  it("Calm Atelier 한국어 동기화 상태 요약이 비행기 대기·진행중·충돌·무결성 차단 문구를 정확히 포맷한다", () => {
    expect(formatByteSizeKo(Math.round(18.4 * 1024))).toBe("18.4 KiB");
    expect(formatOfflineSyncStatusSummaryKo({ phase: "queued-offline", networkProfile: "airplane-queued", pendingTileCount: 3, pendingWireBytes: Math.round(18.4 * 1024) }))
      .toBe("비행기 모드 대기 · 변경 타일 3개(18.4 KiB)");
    expect(formatOfflineSyncStatusSummaryKo({ phase: "syncing", networkProfile: "subway-lte-1mbps", pendingTileCount: 6, pendingWireBytes: 42 * 1024, completedChunks: 4, totalChunks: 8 }))
      .toBe("지하철 LTE 동기화 중 · 4/8 청크 · 남은 타일 6개(42.0 KiB)");
    expect(formatOfflineSyncStatusSummaryKo({ phase: "idle-synced", networkProfile: "cafe-wifi-20mbps", pendingTileCount: 0, pendingWireBytes: 0, archivedConflictCount: 2 }))
      .toBe("동기화 완료 · 충돌 보관 타일 2개 확인 필요");
    expect(formatOfflineSyncStatusSummaryKo({ phase: "integrity-blocked", networkProfile: "subway-lte-1mbps", pendingTileCount: 1, pendingWireBytes: 4096, blockedCorruptTileCount: 1 }))
      .toBe("무결성 검증 실패 · 손상 타일 1개 차단됨");
  });
});
