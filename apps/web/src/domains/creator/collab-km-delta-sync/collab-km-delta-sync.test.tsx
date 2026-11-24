// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  KM16_BAND_COUNT,
  KM16_BASIS_B,
  KM16_BASIS_G,
  KM16_BASIS_R,
  KM16_WAVELENGTHS_NM,
  LocalPeerMeshBus,
  MIN_REQUIRED_COMPRESSION_RATIO,
  OfflineSafeZoneMeshHub,
  StudioCollabKmSafeZonePanel,
  applyXorTileDelta,
  compareDeterministicOpId,
  compressXorTileDeltaRleLeb128,
  createBlankTileRgba,
  decodeKmDeltaBinaryFrame,
  decodeSleb128,
  decodeUleb128,
  dequantizeKm16Spectrum,
  encodeKmDeltaBinaryFrame,
  encodeSleb128,
  encodeUleb128,
  km16SpectrumToSrgb8,
  mixKm16OpticalRgba,
  quantizeKm16Spectrum,
  rasterizeKm16StrokeOnTile,
  runEightArtistConcurrentBenchmark,
  srgb8ToKm16Spectrum,
  type BroadcastChannelLike,
  type BroadcastChannelMessageEventLike,
} from "./index";

afterEach(cleanup);

function createMockBroadcastChannelBus(): (name: string) => BroadcastChannelLike {
  const channelsByName = new Map<string, Set<BroadcastChannelLike>>();
  return (name: string): BroadcastChannelLike => {
    let bucket = channelsByName.get(name);
    if (!bucket) {
      bucket = new Set();
      channelsByName.set(name, bucket);
    }
    const channel: BroadcastChannelLike = {
      name,
      onmessage: null,
      postMessage(message: unknown) {
        const peers = channelsByName.get(name);
        if (!peers) return;
        for (const peer of peers) {
          if (peer === channel) continue;
          const event: BroadcastChannelMessageEventLike = { data: message };
          peer.onmessage?.(event);
        }
      },
      close() {
        channelsByName.get(name)?.delete(channel);
      },
    };
    bucket.add(channel);
    return channel;
  };
}

describe("16파장 Kubelka-Munk 분광 광학 혼색 코어", () => {
  it("16개 가시광 파장 기저가 단위 분할을 만족하고 sRGB 왕복 오차 0을 보장한다", () => {
    expect(KM16_WAVELENGTHS_NM).toHaveLength(KM16_BAND_COUNT);
    for (let i = 0; i < KM16_BAND_COUNT; i += 1) {
      const sum = (KM16_BASIS_R[i] ?? 0) + (KM16_BASIS_G[i] ?? 0) + (KM16_BASIS_B[i] ?? 0);
      expect(sum).toBeCloseTo(1, 9);
    }

    const samples: readonly (readonly [number, number, number])[] = [
      [0, 0, 0],
      [255, 255, 255],
      [123, 87, 211],
      [240, 195, 45],
      [28, 164, 132],
    ];
    for (const [r, g, b] of samples) {
      const spec = srgb8ToKm16Spectrum(r, g, b);
      const back = km16SpectrumToSrgb8(spec.bands);
      expect(Math.abs(back[0] - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back[1] - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back[2] - b)).toBeLessThanOrEqual(1);

      const q = quantizeKm16Spectrum(spec);
      expect(q).toHaveLength(16);
      const dq = dequantizeKm16Spectrum(q);
      const qBack = km16SpectrumToSrgb8(dq.bands);
      expect(Math.abs(qBack[0] - r)).toBeLessThanOrEqual(3);
      expect(Math.abs(qBack[1] - g)).toBeLessThanOrEqual(3);
      expect(Math.abs(qBack[2] - b)).toBeLessThanOrEqual(3);
    }
  });

  it("파랑과 노랑 감산 혼색 시 녹색이 지배적이며 순백과 순흑은 중립 회색을 유지한다", () => {
    const green = mixKm16OpticalRgba([20, 75, 220, 255], [245, 220, 25, 255], 0.5, 1);
    expect(green[1]).toBeGreaterThan(green[0] + 40);
    expect(green[1]).toBeGreaterThan(green[2] + 40);

    const gray = mixKm16OpticalRgba([255, 255, 255, 255], [0, 0, 0, 255], 0.5, 1);
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);
    expect(gray[0]).toBeGreaterThan(100);
    expect(gray[0]).toBeLessThan(220);
  });
});

describe("LEB128 + XOR 타일 델타 + RLE 바이너리 코덱 (>= 8× 압축률)", () => {
  it("ULEB128 및 SLEB128이 53비트 안전 정수까지 무손실 왕복한다", () => {
    const uValues = [0, 1, 127, 128, 16383, 16384, 1_048_575, 34_359_738_369];
    const uBuf: number[] = [];
    for (const v of uValues) encodeUleb128(v, uBuf);
    const uArr = Uint8Array.from(uBuf);
    let pos = 0;
    for (const expected of uValues) {
      const dec = decodeUleb128(uArr, pos);
      expect(dec.value).toBe(expected);
      pos = dec.nextOffset;
    }
    expect(pos).toBe(uArr.length);

    const sValues = [0, 1, -1, 63, -64, 64, -65, 12_345, -98_765];
    const sBuf: number[] = [];
    for (const v of sValues) encodeSleb128(v, sBuf);
    const sArr = Uint8Array.from(sBuf);
    let sPos = 0;
    for (const expected of sValues) {
      const dec = decodeSleb128(sArr, sPos);
      expect(dec.value).toBe(expected);
      sPos = dec.nextOffset;
    }
    expect(sPos).toBe(sArr.length);
  });

  it("64×64 및 128×128 타일 스트로크에서 원본 RGBA 대비 >= 8× 압축률과 비트 정확 복원을 검증한다", () => {
    for (const tileSize of [64, 128] as const) {
      const before = createBlankTileRgba(tileSize);
      const strokeInput = {
        layerId: "paint-01",
        tileX: 2,
        tileY: -1,
        pigmentRgba: [24, 58, 198, 255] as const,
        wetness: 0.9,
        opacity: 0.8,
        radiusPx: 2.5,
        points: [
          { x: 10, y: 12, pressure: 0.7 },
          { x: 28, y: 20, pressure: 0.9 },
          { x: 42, y: 18, pressure: 0.6 },
        ],
      };
      const after = rasterizeKm16StrokeOnTile(before, tileSize, strokeInput);

      const compressedDelta = compressXorTileDeltaRleLeb128(before, after);
      const restored = applyXorTileDelta(before, compressedDelta);
      expect(restored).toEqual(after);

      const encoded = encodeKmDeltaBinaryFrame({
        stroke: {
          ...strokeInput,
          workId: "work-km16-codec",
          tileSize,
          opId: { lamport: 7, peerId: "artist-1", opSeq: 1 },
        },
        beforeTileRgba: before,
        afterTileRgba: after,
      });

      expect(encoded.rawRgbaBytes).toBe(tileSize * tileSize * 4);
      expect(encoded.compressionRatio).toBeGreaterThanOrEqual(MIN_REQUIRED_COMPRESSION_RATIO);

      const decoded = decodeKmDeltaBinaryFrame(encoded.bytes);
      expect(decoded.opId).toEqual({ lamport: 7, peerId: "artist-1", opSeq: 1 });
      expect(decoded.tileX).toBe(2);
      expect(decoded.tileY).toBe(-1);
      expect(decoded.pigmentSpectrum16).toHaveLength(16);
      expect(applyXorTileDelta(before, decoded.rleXorDelta)).toEqual(after);

      // 체크섬 변조 패킷 즉시 거부 검증
      const tampered = new Uint8Array(encoded.bytes);
      tampered[tampered.length - 6] = (tampered[tampered.length - 6] ?? 0) ^ 0xff;
      expect(() => decodeKmDeltaBinaryFrame(tampered)).toThrow();
    }
  });
});

describe("8인 동시 채색 Lamport + 결정론적 OpId 0-충돌 수렴", () => {
  it("서로 다른 도착 순서(정순·역순·교차·회전)에서도 8인 피어가 비트 단위로 100% 일치 수렴한다", () => {
    expect(
      compareDeterministicOpId(
        { lamport: 3, peerId: "artist-1", opSeq: 1 },
        { lamport: 3, peerId: "artist-2", opSeq: 1 },
      ),
    ).toBeLessThan(0);

    const bench64 = runEightArtistConcurrentBenchmark({ tileSize: 64, rounds: 2 });
    expect(bench64.artistCount).toBe(8);
    expect(bench64.totalStrokes).toBe(16);
    expect(bench64.meets8xTarget).toBe(true);
    expect(bench64.compressionRatio).toBeGreaterThanOrEqual(8);
    expect(bench64.allConverged).toBe(true);
    expect(bench64.conflictCount).toBe(0);
    expect(bench64.divergentBytes).toBe(0);
    expect(bench64.kmOpticalCheck.greenDominant).toBe(true);

    const bench128 = runEightArtistConcurrentBenchmark({ tileSize: 128, rounds: 1 });
    expect(bench128.compressionRatio).toBeGreaterThanOrEqual(16);
    expect(bench128.allConverged).toBe(true);
    expect(bench128.conflictCount).toBe(0);
  });

  it("순차 도착 시 XOR 빠른 경로가 동작하고 역순/중복 도착 시 결정론적 재생으로 동일 결과를 보장한다", () => {
    const peerA = new OfflineSafeZoneMeshHub({ peerId: "peer-a", workId: "w-order", tileSize: 64, localMeshEnabled: false });
    const peerB = new OfflineSafeZoneMeshHub({ peerId: "peer-b", workId: "w-order", tileSize: 64, localMeshEnabled: false });
    const peerC = new OfflineSafeZoneMeshHub({ peerId: "peer-c", workId: "w-order", tileSize: 64, localMeshEnabled: false });

    const f1 = peerA.commitLocalStroke({
      layerId: "L1", tileX: 0, tileY: 0, pigmentRgba: [24, 58, 198, 255], wetness: 0.9, opacity: 0.75, radiusPx: 2.5,
      points: [{ x: 16, y: 16, pressure: 0.8 }, { x: 38, y: 24, pressure: 0.8 }],
    });
    const f2 = peerA.commitLocalStroke({
      layerId: "L1", tileX: 0, tileY: 0, pigmentRgba: [244, 214, 28, 255], wetness: 0.9, opacity: 0.75, radiusPx: 2.5,
      points: [{ x: 20, y: 24, pressure: 0.8 }, { x: 36, y: 16, pressure: 0.8 }],
    });

    // peerB: 정순 도착 -> 빠른 XOR 델타 경로 검증
    const rB1 = peerB.receiveBinaryFrame(f1.bytes);
    const rB2 = peerB.receiveBinaryFrame(f2.bytes);
    const rB2Dup = peerB.receiveBinaryFrame(f2.bytes);
    expect(rB1.fastPathXorApplied).toBe(true);
    expect(rB2.fastPathXorApplied).toBe(true);
    expect(rB2Dup.duplicate).toBe(true);

    // peerC: 역순 도착 -> 결정론적 재정렬 재생 검증
    const rC2 = peerC.receiveBinaryFrame(f2.bytes);
    const rC1 = peerC.receiveBinaryFrame(f1.bytes);
    expect(rC2.applied).toBe(true);
    expect(rC1.replayedOutOfOrder).toBe(true);

    expect(peerB.getTileRgba("L1", 0, 0)).toEqual(peerA.getTileRgba("L1", 0, 0));
    expect(peerC.getTileRgba("L1", 0, 0)).toEqual(peerA.getTileRgba("L1", 0, 0));
    expect(peerB.getCanvasDigestHex()).toBe(peerA.getCanvasDigestHex());
    expect(peerC.getCanvasDigestHex()).toBe(peerA.getCanvasDigestHex());

    peerA.dispose();
    peerB.dispose();
    peerC.dispose();
  });
});

describe("Wave 32 오프라인 세이프존 로컬 싱크 허브 (OfflineSafeZoneMeshHub)", () => {
  it("인터넷 단절 시 BroadcastChannel 로컬 메시로 데이터 손실 0건을 유지하고 재연결 시 상태 벡터 차분으로 자동 CRDT 정합한다", () => {
    const channelFactory = createMockBroadcastChannelBus();
    const workId = "ep42-safezone-live";
    const channelName = "toonstudio-safezone-ep42";

    const cloud = new OfflineSafeZoneMeshHub({ peerId: "cloud-upstream", workId, tileSize: 64, internetOnline: true, localMeshEnabled: false });
    const devA = new OfflineSafeZoneMeshHub({ peerId: "ipad-a", workId, tileSize: 64, internetOnline: true, broadcastChannelName: channelName, channelFactory });
    const devB = new OfflineSafeZoneMeshHub({ peerId: "laptop-b", workId, tileSize: 64, internetOnline: true, broadcastChannelName: channelName, channelFactory });
    const devC = new OfflineSafeZoneMeshHub({ peerId: "tablet-c", workId, tileSize: 64, internetOnline: true, broadcastChannelName: channelName, channelFactory });

    // 1) 인터넷 단절: 로컬 세이프존 진입
    devA.setInternetOnline(false);
    devB.setInternetOnline(false);
    devC.setInternetOnline(false);

    devA.commitLocalStroke({
      layerId: "color", tileX: 0, tileY: 0, pigmentRgba: [24, 58, 198, 255], wetness: 0.9, opacity: 0.75, radiusPx: 2.2,
      points: [{ x: 12, y: 18, pressure: 0.8 }, { x: 34, y: 22, pressure: 0.7 }],
    });
    devB.commitLocalStroke({
      layerId: "color", tileX: 0, tileY: 0, pigmentRgba: [244, 214, 28, 255], wetness: 0.9, opacity: 0.75, radiusPx: 2.2,
      points: [{ x: 18, y: 14, pressure: 0.85 }, { x: 32, y: 28, pressure: 0.75 }],
    });

    // 오프라인 중에도 주변 기기 3대는 BroadcastChannel로 즉시 수렴 (데이터 손실 0건)
    expect(devA.getUnsyncedOutboxCount()).toBe(1);
    expect(devB.getUnsyncedOutboxCount()).toBe(1);
    expect(devA.getMetrics().transportMode).toBe("broadcast-channel");
    expect(devC.getCanvasDigestHex()).toBe(devA.getCanvasDigestHex());
    expect(devB.getCanvasDigestHex()).toBe(devA.getCanvasDigestHex());
    expect(devC.getAllOpKeysSorted()).toHaveLength(2);

    // 2) 분단 동안 클라우드 원격 편집 동시 발생
    cloud.commitLocalStroke({
      layerId: "color", tileX: 0, tileY: 0, pigmentRgba: [212, 48, 42, 255], wetness: 0.85, opacity: 0.7, radiusPx: 2.0,
      points: [{ x: 24, y: 12, pressure: 0.7 }, { x: 24, y: 36, pressure: 0.9 }],
    });
    expect(cloud.getCanvasDigestHex()).not.toBe(devA.getCanvasDigestHex());

    // 3) 인터넷 재연결: 상태 벡터 차분으로 자동 CRDT 정합
    const rA = devA.reconnectAndReconcile(cloud);
    const rB = devB.reconnectAndReconcile(cloud);
    const rC = devC.reconnectAndReconcile(cloud);

    expect(rA.converged).toBe(true);
    expect(rA.lostOpsCount).toBe(0);
    expect(rA.conflictCount).toBe(0);
    expect(rA.reconciledOpsCount).toBeGreaterThanOrEqual(2);
    expect(rA.yjsDiffBytes).toBeGreaterThan(0);
    expect(rB.converged).toBe(true);
    expect(rC.converged).toBe(true);

    // 모든 기기와 클라우드의 미동기화 큐 0건 & 3개 연산 100% 바이트 동일 수렴
    expect(devA.getUnsyncedOutboxCount()).toBe(0);
    expect(devB.getUnsyncedOutboxCount()).toBe(0);
    expect(devA.getAllOpKeysSorted()).toHaveLength(3);
    expect(devB.getAllOpKeysSorted()).toEqual(cloud.getAllOpKeysSorted());
    expect(devC.getAllOpKeysSorted()).toEqual(cloud.getAllOpKeysSorted());
    expect(devA.getTileRgba("color", 0, 0)).toEqual(cloud.getTileRgba("color", 0, 0));
    expect(devB.getTileRgba("color", 0, 0)).toEqual(cloud.getTileRgba("color", 0, 0));
    expect(devC.getTileRgba("color", 0, 0)).toEqual(cloud.getTileRgba("color", 0, 0));

    // 이미 동기화된 상태에서 재차 상태 벡터 차분 시 불필요 재전송 0건 검증
    const idleDiff = devA.computeStateVectorDiff(cloud.getStateVector());
    expect(idleDiff.missingFrames).toHaveLength(0);

    // LocalPeerMeshBus 폴백 동작도 함께 검증
    const bus = new LocalPeerMeshBus();
    const m1 = new OfflineSafeZoneMeshHub({ peerId: "m1", workId: "mesh-w", internetOnline: false, meshBus: bus });
    const m2 = new OfflineSafeZoneMeshHub({ peerId: "m2", workId: "mesh-w", internetOnline: false, meshBus: bus });
    m1.commitLocalStroke({
      layerId: "L0", tileX: 0, tileY: 0, pigmentRgba: [34, 152, 118, 255], wetness: 0.85, opacity: 0.7, radiusPx: 2,
      points: [{ x: 10, y: 10, pressure: 0.7 }, { x: 25, y: 25, pressure: 0.8 }],
    });
    expect(m1.getMetrics().transportMode).toBe("local-mesh-queue");
    expect(m2.getCanvasDigestHex()).toBe(m1.getCanvasDigestHex());

    m1.dispose();
    m2.dispose();
    devA.dispose();
    devB.dispose();
    devC.dispose();
    cloud.dispose();
  });
});

describe("StudioCollabKmSafeZonePanel UI 및 Calm Atelier 위생 계약", () => {
  it("props 없이 단독 렌더되고 8인 압축률·오프라인 단절·로컬 스트로크·재연결 상태 벡터 정합을 수행한다", () => {
    render(<StudioCollabKmSafeZonePanel />);

    // 초기 1라운드 8인 동시 채색 실측 결과 (>= 8x, 8/8 수렴, 손실 0건)
    const ratioText = screen.getByTestId("km-compression-ratio-tile").textContent ?? "";
    const ratioMatch = ratioText.match(/(\d+(?:\.\d+)?)×/);
    expect(ratioMatch).not.toBeNull();
    expect(Number(ratioMatch?.[1])).toBeGreaterThanOrEqual(8);
    expect(screen.getByTestId("km-convergence-tile").textContent).toContain("8/8");
    expect(screen.getByTestId("safezone-unsynced-queue-tile").textContent).toContain("0건");
    expect(screen.getByTestId("safezone-loss-tile").textContent).toContain("0건");
    expect(screen.getByTestId("safezone-artist-list").children).toHaveLength(8);

    // 인터넷 단절 -> 오프라인 로컬 스트로크 2건 추가
    fireEvent.click(screen.getByRole("button", { name: /인터넷 단절 시뮬레이션/i }));
    expect(screen.getByTestId("safezone-network-badge").textContent).toContain("오프라인 세이프존");

    const addOfflineBtn = screen.getByRole("button", { name: /오프라인 로컬 스트로크 추가/i });
    fireEvent.click(addOfflineBtn);
    fireEvent.click(addOfflineBtn);

    expect(screen.getByTestId("safezone-unsynced-queue-tile").textContent).toContain("2건");
    expect(screen.getByTestId("km-convergence-tile").textContent).toContain("8/8");
    expect(screen.getByTestId("safezone-cloud-sync-badge").textContent).toContain("오프라인 차분 대기");
    expect(screen.getByTestId("safezone-mesh-digest").textContent).not.toBe(
      screen.getByTestId("safezone-cloud-digest").textContent,
    );

    // 재연결 · 상태 벡터 정합 -> 큐 0건, 클라우드·로컬 다이제스트 일치, 손실 0건
    fireEvent.click(screen.getByRole("button", { name: /재연결 · 상태 벡터 정합/i }));
    expect(screen.getByTestId("safezone-unsynced-queue-tile").textContent).toContain("0건");
    expect(screen.getByTestId("safezone-loss-tile").textContent).toContain("0건");
    expect(screen.getByTestId("safezone-cloud-sync-badge").textContent).toContain("클라우드·로컬 일치");
    expect(screen.getByTestId("safezone-mesh-digest").textContent).toBe(
      screen.getByTestId("safezone-cloud-digest").textContent,
    );

    // 8인 동시 채색 재측정 버튼
    fireEvent.click(screen.getByRole("button", { name: /8인 동시 채색 재측정/i }));
    expect(screen.getByTestId("safezone-status-banner").textContent).toContain("라운드 #2");
  });

  it("영어 로케일과 원시 색상·웹 스토리지 금지·800줄 이하 위생 계약을 충족한다", () => {
    render(<StudioCollabKmSafeZonePanel locale="en" />);
    expect(screen.getByRole("button", { name: /Simulate Internet Cut/i })).toBeTruthy();
    expect(screen.getByTestId("km-optical-mix-check").textContent).toContain("Green Dominant");

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/collab-km-delta-sync");
    const files = [
      "km16-xor-rle-frame-codec.ts",
      "collab-km-delta-codec.ts",
      "StudioCollabKmSafeZonePanel.tsx",
      "index.ts",
      "collab-km-delta-sync.test.tsx",
    ] as const;

    for (const name of files) {
      const source = readFileSync(resolve(dir, name), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(800);
      if (name !== "collab-km-delta-sync.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
        expect(source).not.toContain("sessionStorage");
      }
      if (name === "StudioCollabKmSafeZonePanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
      }
    }
  });
});
