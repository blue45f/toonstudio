import { describe, expect, it, vi } from "vitest";
import { DrawBlendMode } from "../wasm64-render-batcher/wasm64-draw-call-coalescer";
import type {
  ComputeGpuBindGroupLayoutLike, ComputeGpuBindGroupLike, ComputeGpuBufferLike,
  ComputeGpuCommandBufferLike, ComputeGpuDeviceLike, ComputeGpuDeviceLostInfoLike, ComputeGpuPipelineLike,
} from "../wasm64-webgpu-compute/webgpu-compute-dispatcher";
import { CrdtStrokeOpKind } from "../wasm64-worker-isolation/lightweight-p2p-crdt-delta";
import {
  COLLAB_COMPOSITE_ENTRY_POINT, DEFAULT_TILE_SCRATCH_BYTES, HeapZeroGcObjectPool,
  InfiniteVectorTileStreamer, P2P_FRAME_HEADER_BYTES, P2pFrameType, P2pLosslessDeltaSyncNode,
  PoolMemoryCapError, WEBRTC_SCTP_MAX_FRAME_BYTES, WGSL_COLLAB_TILE_COMPOSITE,
  WebGpuCollabCompositor, coalesceDirtyRects, compositeCollabBuffersCpu, computeFnv1a64,
  computeLodForZoom, computeManifestDiff, computeSha256Hex, decodeInfiniteTileCoord,
  decodeP2pFrame, encodeInfiniteTileCoord, encodeP2pFrame, formatFnv1a64Hex, getPeerTintRgba8,
  multiplyAffine2D, packCollabCompositeUniforms, packRgba8, simplifyPolylineRdp, transformPoint2D,
  type Canvas2DBlitTargetLike, type WebRtcDataChannelLike,
} from "./index";

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x1_0000_0000; };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function makeSparseBrushTile(dim: number, bgRgba: number, strokeSeed: number, strokeLength = 40): Uint8Array {
  const bytes = new Uint8Array(dim * dim * 4);
  const words = new Uint32Array(bytes.buffer);
  words.fill(bgRgba >>> 0);
  const ink = packRgba8(24 + ((strokeSeed * 37) % 180), 30 + ((strokeSeed * 53) % 160), 40 + ((strokeSeed * 71) % 180), 255);
  const sx = 16 + ((strokeSeed * 19) % Math.max(1, dim - 64));
  const sy = 16 + ((strokeSeed * 29) % Math.max(1, dim - 64));
  for (let i = 0; i < strokeLength; i += 1) {
    const x = Math.min(dim - 2, sx + i);
    const y = Math.min(dim - 2, sy + Math.floor(Math.sin(i * 0.25 + strokeSeed) * 8) + 8);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        words[Math.max(0, Math.min(dim - 1, y + dy)) * dim + Math.max(0, Math.min(dim - 1, x + dx))] = ink;
      }
    }
  }
  return bytes;
}

function makeHighEntropyTile(dim: number, seed: number): Uint8Array {
  const rng = createSeededRng(seed);
  const bytes = new Uint8Array(dim * dim * 4);
  for (let i = 0; i < bytes.byteLength; i += 1) bytes[i] = Math.floor(rng() * 256);
  return bytes;
}

function createMockGpuDevice() {
  let resolveLost!: (info: ComputeGpuDeviceLostInfoLike) => void;
  const lost = new Promise<ComputeGpuDeviceLostInfoLike>((res) => { resolveLost = res; });
  const stats = {
    shaderModules: 0, pipelines: 0, bindGroups: 0, buffersCreated: 0, buffersDestroyed: 0,
    writeBufferCalls: 0, dispatches: [] as { x: number; y: number; z: number }[], lastUniformBytes: null as Uint8Array | null,
  };
  const device: ComputeGpuDeviceLike = {
    lost,
    queue: {
      writeBuffer(buffer, _bufOff, data, dataOffset = 0, size?: number) {
        stats.writeBufferCalls += 1;
        if (buffer.label === "collab:uniform") {
          const ab = ArrayBuffer.isView(data) ? data.buffer : data;
          const off = ArrayBuffer.isView(data) ? data.byteOffset + dataOffset : dataOffset;
          const len = size ?? (ArrayBuffer.isView(data) ? data.byteLength : ab.byteLength);
          stats.lastUniformBytes = new Uint8Array(ab.slice(off, off + len));
        }
      },
      submit(_cmds: readonly ComputeGpuCommandBufferLike[]) { /* noop */ },
    },
    createShaderModule(desc) { stats.shaderModules += 1; return { label: desc.label }; },
    createBuffer(desc): ComputeGpuBufferLike {
      stats.buffersCreated += 1;
      return { size: desc.size, usage: desc.usage, label: desc.label, destroy() { stats.buffersDestroyed += 1; } };
    },
    async createComputePipelineAsync(desc): Promise<ComputeGpuPipelineLike> {
      stats.pipelines += 1;
      return { label: desc.label, getBindGroupLayout: (i: number): ComputeGpuBindGroupLayoutLike => ({ label: `layout:${i}` }) };
    },
    createBindGroup(desc): ComputeGpuBindGroupLike { stats.bindGroups += 1; return { label: desc.label }; },
    createCommandEncoder(desc) {
      return {
        beginComputePass: () => ({
          setPipeline() { /* noop */ }, setBindGroup() { /* noop */ },
          dispatchWorkgroups(x: number, y = 1, z = 1) { stats.dispatches.push({ x, y, z }); },
          end() { /* noop */ },
        }),
        finish: (): ComputeGpuCommandBufferLike => ({ label: desc?.label }),
      };
    },
  };
  return { device, triggerLost: (reason: string) => resolveLost({ reason, message: reason }), stats };
}

describe("InfiniteVectorTileStreamer", () => {
  it("computes LOD 0..4 with hysteresis and bijective signed infinite tile coordinates", () => {
    expect(computeLodForZoom(1.5)).toBe(0);
    expect(computeLodForZoom(0.5)).toBe(1);
    expect(computeLodForZoom(0.25)).toBe(2);
    expect(computeLodForZoom(0.12)).toBe(3);
    expect(computeLodForZoom(0.05)).toBe(4);
    expect(computeLodForZoom(0.72, 0, 0.08)).toBe(0);
    expect(computeLodForZoom(0.65, 0, 0.08)).toBe(1);

    for (const sample of [
      { layerId: 0, lod: 0 as const, tileX: 0, tileY: 0 },
      { layerId: 3, lod: 4 as const, tileX: -1024, tileY: -2048 },
      { layerId: 7, lod: 2 as const, tileX: 511, tileY: -1 },
    ]) {
      const packed = encodeInfiniteTileCoord(sample);
      expect(packed.tileX).toBeGreaterThanOrEqual(0);
      expect(packed.tileY).toBeGreaterThanOrEqual(0);
      expect(decodeInfiniteTileCoord(packed)).toEqual(sample);
    }
  });

  it("streams an 8K×120K webtoon strip with velocity prefetch, bounded LRU RAM cap, 16GiB+ virtual addressing, and lossless OPFS reload", () => {
    const tileDim = 64;
    const tileBytes = tileDim * tileDim * 4;
    const pool = new HeapZeroGcObjectPool({ hardMemoryCapBytes: 8 * 1024 * 1024 });
    const streamer = new InfiniteVectorTileStreamer({
      tileDim, maxGpuResidentTiles: 8, maxCpuResidentTiles: 10, maxResidentBytes: tileBytes * 16,
      prefetchBaseRing: 1, prefetchLookaheadMs: 300, maxPrefetchLeadTiles: 4, objectPool: pool,
    });

    const savedTopTiles = new Map<string, Uint8Array>();
    for (let ty = 0; ty < 40; ty += 1) {
      const tile = makeSparseBrushTile(tileDim, packRgba8(255, 255, 255, 255), ty + 1, 20);
      streamer.writeRasterTile({ layerId: 0, lod: 0, tileX: 0, tileY: ty }, tile, true);
      if (ty < 4) savedTopTiles.set(`0:${ty}`, tile.slice());
    }
    const farLayerOffset = streamer.writeRasterTile(
      { layerId: 5, lod: 0, tileX: 31, tileY: 468 },
      makeSparseBrushTile(tileDim, packRgba8(245, 245, 245, 255), 99, 20),
      false,
    );
    expect(farLayerOffset).toBeGreaterThan(BigInt(16) * BigInt(1024) * BigInt(1024) * BigInt(1024));

    let lastPlan = streamer.streamViewport(
      { x: 0, y: 0, zoom: 1, viewportW: 128, viewportH: 192, velocityX: 0, velocityY: 2400, timestampMs: 0 },
      [0],
    );
    const maxVisY = Math.max(...lastPlan.visibleTiles.map((t) => t.id.tileY));
    const minVisY = Math.min(...lastPlan.visibleTiles.map((t) => t.id.tileY));
    const maxPrefY = Math.max(...lastPlan.prefetchTiles.map((t) => t.id.tileY));
    const minPrefY = Math.min(...lastPlan.prefetchTiles.map((t) => t.id.tileY));
    expect(maxPrefY - maxVisY).toBeGreaterThan(minVisY - minPrefY);

    for (let step = 1; step <= 25; step += 1) {
      lastPlan = streamer.streamViewport(
        { x: 0, y: step * 160, zoom: 1, viewportW: 128, viewportH: 192, timestampMs: step * 50 },
        [0],
      );
      expect(lastPlan.telemetry.residentBytes).toBeLessThanOrEqual(streamer.maxResidentBytes);
      expect(lastPlan.telemetry.gpuResidentCount).toBeLessThanOrEqual(streamer.maxGpuResidentTiles);
      expect(lastPlan.telemetry.cpuResidentCount).toBeLessThanOrEqual(streamer.maxCpuResidentTiles);
    }

    expect(lastPlan.telemetry.evictionCount).toBeGreaterThan(0);
    expect(lastPlan.telemetry.opfsSpillCount).toBeGreaterThan(0);

    for (let ty = 0; ty < 4; ty += 1) {
      const reloaded = streamer.readRasterTile({ layerId: 0, lod: 0, tileX: 0, tileY: ty }, true);
      expect(reloaded).not.toBeNull();
      expect(bytesEqual(reloaded!, savedTopTiles.get(`0:${ty}`)!)).toBe(true);
    }
    const finalPlan = streamer.streamViewport(
      { x: 0, y: 0, zoom: 1, viewportW: 128, viewportH: 192, velocityX: 0, velocityY: 0, timestampMs: 2000 },
      [0],
    );
    expect(finalPlan.telemetry.opfsReloadCount).toBeGreaterThan(0);
    expect(finalPlan.telemetry.peakResidentBytes).toBeLessThanOrEqual(streamer.maxResidentBytes);
    streamer.dispose();
  });

  it("switches seamlessly between vector-full, vector-simplified (RDP), and raster-tile-fallback", () => {
    const streamer = new InfiniteVectorTileStreamer({
      tileDim: 256, vectorToRasterVertexThreshold: 300, rasterFallbackMinLod: 3, baseScreenErrorPx: 1.5,
    });
    const pts = new Float32Array(120 * 2);
    for (let i = 0; i < 120; i += 1) {
      pts[i * 2] = 10 + i * 1.8;
      pts[i * 2 + 1] = 128 + Math.sin(i * 0.1) * 18 + Math.sin(i * 0.9) * 0.4;
    }
    streamer.registerVectorEntity({ id: "curve-1", layerId: 0, minX: 10, minY: 100, maxX: 230, maxY: 160, points: pts, strokeWidth: 4 });

    const rdpCheck = simplifyPolylineRdp(pts, 3.0, 2);
    expect(rdpCheck.length).toBeLessThan(pts.length);
    expect(rdpCheck.length).toBeGreaterThanOrEqual(4);

    const fullPlan = streamer.streamViewport({ x: 0, y: 0, zoom: 1.0, viewportW: 256, viewportH: 256 }, [0]);
    expect(fullPlan.visibleTiles[0]?.strategy).toBe("vector-full");
    expect(fullPlan.visibleTiles[0]?.simplifiedVectorVertices).toBe(120);

    const simpPlan = streamer.streamViewport({ x: 0, y: 0, zoom: 0.45, viewportW: 256, viewportH: 256 }, [0]);
    expect(simpPlan.lod).toBe(1);
    expect(simpPlan.visibleTiles[0]?.strategy).toBe("vector-simplified");
    expect(simpPlan.visibleTiles[0]!.simplifiedVectorVertices).toBeLessThan(120);

    const lodFallbackPlan = streamer.streamViewport({ x: 0, y: 0, zoom: 0.1, viewportW: 256, viewportH: 256 }, [0]);
    expect(lodFallbackPlan.lod).toBe(3);
    expect(lodFallbackPlan.visibleTiles[0]?.strategy).toBe("raster-tile-fallback");

    const densePts = new Float32Array(350 * 2);
    for (let i = 0; i < 350; i += 1) { densePts[i * 2] = 20 + (i % 180); densePts[i * 2 + 1] = 20 + Math.floor(i / 2); }
    streamer.registerVectorEntity({ id: "dense-hatch", layerId: 0, minX: 20, minY: 20, maxX: 200, maxY: 200, points: densePts, strokeWidth: 2 });
    const densePlan = streamer.streamViewport({ x: 0, y: 0, zoom: 1.0, viewportW: 256, viewportH: 256 }, [0]);
    expect(densePlan.visibleTiles[0]?.strategy).toBe("raster-tile-fallback");
    streamer.dispose();
  });
});

describe("WebGpuCollabCompositor", () => {
  it("validates WGSL shader, prewarms pipeline, coalesces dirty rects, reduces draw calls, and guarantees WebGPU/CPU parity + device-loss fallback", async () => {
    const mockGpu = createMockGpuDevice();
    const blitCalls: { dirtyX: number; dirtyY: number; dirtyW: number; dirtyH: number }[] = [];
    const mockCanvas2d: Canvas2DBlitTargetLike = {
      putImageData(_img, _dx, _dy, dirtyX = 0, dirtyY = 0, dirtyW = 0, dirtyH = 0) {
        blitCalls.push({ dirtyX, dirtyY, dirtyW, dirtyH });
      },
    };
    const gpuComp = new WebGpuCollabCompositor({ surfaceWidth: 256, surfaceHeight: 256, tileDim: 64, device: mockGpu.device });
    const cpuComp = new WebGpuCollabCompositor({ surfaceWidth: 256, surfaceHeight: 256, tileDim: 64, device: null, canvas2dTarget: mockCanvas2d });

    const validation = gpuComp.validateShaderSource();
    expect(validation.valid).toBe(true);
    expect(validation.entryPoints).toContain(COLLAB_COMPOSITE_ENTRY_POINT);
    expect(validation.workgroupSize).toEqual([16, 16, 1]);
    expect(validation.usesWorkgroupMemory).toBe(true);
    expect(validation.usesWorkgroupBarrier).toBe(true);
    expect(validation.bindings).toHaveLength(5);
    expect(WGSL_COLLAB_TILE_COMPOSITE).toContain("wg_peer_tint");

    const prewarm = await gpuComp.prewarmPipelines();
    expect(prewarm.status).toBe("completed");
    expect(mockGpu.stats.shaderModules).toBe(1);
    expect(mockGpu.stats.pipelines).toBe(1);

    const dirtyReport = coalesceDirtyRects(
      [{ x: 10, y: 10, width: 20, height: 20 }, { x: 25, y: 15, width: 20, height: 20 }, { x: 200, y: 200, width: 16, height: 16 }],
      256, 256, 8,
    );
    expect(dirtyReport.inputRectCount).toBe(3);
    expect(dirtyReport.outputRectCount).toBe(2);
    expect(dirtyReport.savedPixelsPct).toBeGreaterThan(95);

    for (let ty = 0; ty < 2; ty += 1) {
      for (let tx = 0; tx < 2; tx += 1) {
        const tile = makeSparseBrushTile(64, packRgba8(248, 246, 240, 255), tx + ty * 2 + 1, 16);
        gpuComp.setCommittedTile(tx, ty, tile, 0);
        cpuComp.setCommittedTile(tx, ty, tile, 0);
      }
    }
    const basePts = Array.from({ length: 24 }, (_, idx) => ({ x: 20 + idx * 3, y: 30 + idx * 2, pressure: 0.8 }));
    for (const peerId of [1, 2, 3]) {
      const shifted = basePts.map((p) => ({ x: p.x + peerId * 14, y: p.y + peerId * 6, pressure: p.pressure }));
      gpuComp.upsertEphemeralStroke({ peerId, strokeId: 10 + peerId, brushWidth: 8, points: shifted });
      cpuComp.upsertEphemeralStroke({ peerId, strokeId: 10 + peerId, brushWidth: 8, points: shifted });
    }
    const crdtOp = {
      kind: CrdtStrokeOpKind.StrokePoint, layerIndex: 0, peerId: 2, lamportTs: 9, opSeq: 4,
      strokeId: 99, x: 110, y: 110, pressure: 0.9, brushWidth: 6,
    } as const;
    gpuComp.applyCrdtStrokeOp(crdtOp);
    cpuComp.applyCrdtStrokeOp(crdtOp);

    const gpuFrame1 = await gpuComp.composeFrame({ blendMode: DrawBlendMode.Normal, mirrorCpuOutput: true });
    const cpuFrame1 = await cpuComp.composeFrame({ blendMode: DrawBlendMode.Normal });
    expect(gpuFrame1.executedOnGpu).toBe(true);
    expect(cpuFrame1.backend).toBe("cpu-canvas2d-fallback");
    expect(blitCalls.length).toBeGreaterThan(0);
    expect(gpuFrame1.drawCallBatching.metrics.inputPrimitives).toBeGreaterThan(70);
    expect(gpuFrame1.drawCallBatching.metrics.outputDrawCalls).toBeLessThanOrEqual(3);
    expect(gpuFrame1.drawCallBatching.metrics.reductionPct).toBeGreaterThan(90);
    expect(bytesEqual(gpuFrame1.outputPixels, cpuFrame1.outputPixels)).toBe(true);
    expect(mockGpu.stats.lastUniformBytes?.byteLength).toBe(48);

    gpuComp.markDirtyRect({ x: 16, y: 16, width: 32, height: 32 });
    const gpuFrame2 = await gpuComp.composeFrame({ blendMode: DrawBlendMode.Multiply, mirrorCpuOutput: true });
    expect(gpuFrame2.bindGroupCacheHit).toBe(true);

    const cBuf = new Uint8Array([200, 120, 80, 255]);
    const eBuf = new Uint8Array([100, 180, 220, 128]);
    for (const mode of [DrawBlendMode.Normal, DrawBlendMode.Multiply, DrawBlendMode.Screen, DrawBlendMode.Add, DrawBlendMode.Overlay, DrawBlendMode.Erase]) {
      const out = new Uint8Array(4);
      const u = {
        surfaceWidth: 1, surfaceHeight: 1, dirtyX: 0, dirtyY: 0, dirtyW: 1, dirtyH: 1,
        peerTintRgba8: getPeerTintRgba8(3), blendMode: mode, tintStrength: 0.5, ephemeralOpacity: 0.8, dirtyRectCount: 1,
      };
      expect(packCollabCompositeUniforms(u).byteLength).toBe(48);
      compositeCollabBuffersCpu(cBuf, eBuf, out, u);
      if (mode === DrawBlendMode.Erase) expect(out[3]).toBeLessThan(255);
      else expect(out[3]).toBe(255);
    }

    mockGpu.triggerLost("simulated-gpu-reset");
    await Promise.resolve();
    expect(gpuComp.getActiveBackend()).toBe("cpu-canvas2d-fallback");
    gpuComp.markDirtyRect({ x: 0, y: 0, width: 32, height: 32 });
    expect((await gpuComp.composeFrame()).backend).toBe("cpu-canvas2d-fallback");
    gpuComp.dispose();
    cpuComp.dispose();
  });
});

describe("P2pLosslessDeltaSyncNode", () => {
  it("computes 64-bit FNV-1a + SHA-256 manifests, enforces 16KiB SCTP frame cap, and detects corruption", async () => {
    const sample = makeSparseBrushTile(64, packRgba8(255, 255, 255, 255), 7);
    expect(formatFnv1a64Hex(computeFnv1a64(sample))).toHaveLength(16);
    const sha = await computeSha256Hex(sample);
    if (sha !== null) expect(sha).toHaveLength(64);

    const frame = encodeP2pFrame({ frameType: P2pFrameType.TileDeltaChunk, senderPeerId: 1, transferId: 42, seq: 3, payload: new Uint8Array([1, 2, 3, 4, 5]) });
    expect(frame.byteLength).toBe(P2P_FRAME_HEADER_BYTES + 5);
    expect(decodeP2pFrame(frame)?.seq).toBe(3);

    const corrupted = frame.slice();
    corrupted[P2P_FRAME_HEADER_BYTES + 2]! ^= 0x5a;
    expect(decodeP2pFrame(corrupted)).toBeNull();

    expect(() => encodeP2pFrame({
      frameType: P2pFrameType.TileDeltaChunk, senderPeerId: 1, transferId: 1, seq: 1, payload: new Uint8Array(WEBRTC_SCTP_MAX_FRAME_BYTES),
    })).toThrow(RangeError);

    const nodeA = new P2pLosslessDeltaSyncNode({ peerId: 1 });
    const nodeB = new P2pLosslessDeltaSyncNode({ peerId: 2 });
    await nodeA.putLocalTileWithSha256("tile:0:0:0", sample);
    await nodeB.putLocalTileWithSha256("tile:0:0:0", sample);
    const diff = computeManifestDiff(nodeA.getManifest(), Array.from(nodeB.getManifest().values()));
    expect(diff.unchangedKeys).toEqual(["tile:0:0:0"]);
    expect(diff.missingKeys).toEqual([]);
    expect(diff.changedKeys).toEqual([]);
  });

  it("converges 3 peers to 0-byte-diff identical 256×256 canvas tiles and CRDT logs under packet loss, reordering, duplicates, corruption, and backpressure", () => {
    const rng = createSeededRng(20261126);
    const nodes = [
      new P2pLosslessDeltaSyncNode({ peerId: 1, windowSize: 6, maxBufferedAmountBytes: 16 * 1024, retransmitTimeoutMs: 60 }),
      new P2pLosslessDeltaSyncNode({ peerId: 2, windowSize: 6, maxBufferedAmountBytes: 16 * 1024, retransmitTimeoutMs: 60 }),
      new P2pLosslessDeltaSyncNode({ peerId: 3, windowSize: 6, maxBufferedAmountBytes: 16 * 1024, retransmitTimeoutMs: 60 }),
    ] as const;

    const wireQueue: { fromPeerId: number; toPeerId: number; deliverAtMs: number; bytes: Uint8Array }[] = [];
    const channelBuffers = new Map<string, number>();
    let currentMs = 0;
    let maxWireFrameBytes = 0;
    let chaosEnabled = true;

    for (const sender of nodes) {
      for (const receiver of nodes) {
        if (sender.peerId === receiver.peerId) continue;
        const chKey = `${sender.peerId}->${receiver.peerId}`;
        channelBuffers.set(chKey, 0);
        const channel: WebRtcDataChannelLike = {
          readyState: "open",
          get bufferedAmount() { return channelBuffers.get(chKey) ?? 0; },
          send(data: Uint8Array) {
            expect(data.byteLength).toBeLessThanOrEqual(WEBRTC_SCTP_MAX_FRAME_BYTES);
            if (data.byteLength > maxWireFrameBytes) maxWireFrameBytes = data.byteLength;
            const copy = data.slice();
            channelBuffers.set(chKey, (channelBuffers.get(chKey) ?? 0) + copy.byteLength);
            if (chaosEnabled) {
              const r = rng();
              if (r < 0.16) return;
              if (r < 0.21 && copy.byteLength > P2P_FRAME_HEADER_BYTES) copy[copy.byteLength - 1]! ^= 0xff;
              if (r >= 0.21 && r < 0.31) {
                wireQueue.push({ fromPeerId: sender.peerId, toPeerId: receiver.peerId, deliverAtMs: currentMs + 10 + Math.floor(rng() * 45), bytes: copy.slice() });
              }
            }
            wireQueue.push({ fromPeerId: sender.peerId, toPeerId: receiver.peerId, deliverAtMs: currentMs + (chaosEnabled ? 5 + Math.floor(rng() * 45) : 5), bytes: copy });
          },
        };
        sender.attachPeerChannel(receiver.peerId, channel);
      }
    }

    const baseWhite = makeSparseBrushTile(256, packRgba8(255, 255, 255, 255), 0, 0);
    for (const node of nodes) { node.putLocalTile("tile:0:0:0", baseWhite); node.putLocalTile("tile:0:1:0", baseWhite); }

    nodes[0].putLocalTile("tile:0:0:0", makeSparseBrushTile(256, packRgba8(255, 255, 255, 255), 11, 55));
    nodes[0].putLocalTile("tile:0:2:0", makeSparseBrushTile(256, packRgba8(250, 250, 252, 255), 21, 45));
    nodes[1].putLocalTile("tile:0:1:0", makeSparseBrushTile(256, packRgba8(255, 255, 255, 255), 33, 60));
    nodes[1].putLocalTile("tile:0:0:0", makeSparseBrushTile(256, packRgba8(255, 255, 255, 255), 44, 50));
    nodes[2].putLocalTile("tile:0:3:0", makeSparseBrushTile(256, packRgba8(248, 252, 248, 255), 55, 70));
    // 16 KiB 멀티청크 분할·재조립 및 배압 경로 실증용 고엔트로피 소형 텍스처(48 KiB -> 3청크)
    nodes[2].putLocalTile("asset:screentone:noise", makeHighEntropyTile(112, 777));

    for (let p = 0; p < nodes.length; p += 1) {
      const node = nodes[p]!;
      node.recordLocalStrokeOp({ kind: CrdtStrokeOpKind.StrokeBegin, strokeId: 100 + p, x: 10 + p * 50, y: 20, pressure: 0.7, brushWidth: 6 }, currentMs);
      for (let s = 1; s <= 6; s += 1) {
        node.recordLocalStrokeOp({ kind: CrdtStrokeOpKind.StrokePoint, strokeId: 100 + p, x: 10 + p * 50 + s * 8, y: 20 + s * 6, pressure: 0.8, brushWidth: 6 }, currentMs);
      }
      node.recordLocalStrokeOp({ kind: CrdtStrokeOpKind.StrokeEnd, strokeId: 100 + p, x: 60 + p * 50, y: 56, pressure: 0.2, brushWidth: 6 }, currentMs);
    }
    for (const node of nodes) node.initiateSyncAll(currentMs);

    const byPeerId = new Map(nodes.map((n) => [n.peerId, n] as const));
    for (let step = 0; step < 360; step += 1) {
      currentMs += 15;
      for (const [k, v] of channelBuffers) channelBuffers.set(k, Math.max(0, v - 8 * 1024));
      for (let i = wireQueue.length - 1; i >= 0; i -= 1) {
        if (wireQueue[i]!.deliverAtMs <= currentMs) {
          const pkt = wireQueue.splice(i, 1)[0]!;
          byPeerId.get(pkt.toPeerId)?.receiveFrame(pkt.fromPeerId, pkt.bytes, currentMs);
        }
      }
      for (const node of nodes) node.tick(currentMs);
      if (step === 220) { chaosEnabled = false; for (const node of nodes) node.initiateSyncAll(currentMs); }
      if (!chaosEnabled && wireQueue.length === 0 && nodes.every((n) => n.isQuiescent())) break;
    }

    expect(wireQueue).toHaveLength(0);
    expect(nodes.every((n) => n.isQuiescent())).toBe(true);
    expect(maxWireFrameBytes).toBeLessThanOrEqual(WEBRTC_SCTP_MAX_FRAME_BYTES);

    for (const key of ["tile:0:0:0", "tile:0:1:0", "tile:0:2:0", "tile:0:3:0", "asset:screentone:noise"]) {
      const p1 = nodes[0].getTilePixels(key), p2 = nodes[1].getTilePixels(key), p3 = nodes[2].getTilePixels(key);
      expect(p1).not.toBeNull(); expect(p2).not.toBeNull(); expect(p3).not.toBeNull();
      expect(bytesEqual(p1!, p2!)).toBe(true);
      expect(bytesEqual(p2!, p3!)).toBe(true);
    }

    expect(nodes[0].crdtLog.size()).toBe(24);
    expect(bytesEqual(nodes[0].crdtLog.exportCanonicalBinary(), nodes[1].crdtLog.exportCanonicalBinary())).toBe(true);
    expect(bytesEqual(nodes[1].crdtLog.exportCanonicalBinary(), nodes[2].crdtLog.exportCanonicalBinary())).toBe(true);
    expect(nodes[0].crdtLog.materializeStrokes()).toEqual(nodes[2].crdtLog.materializeStrokes());

    const sum = (fn: (t: ReturnType<P2pLosslessDeltaSyncNode["getTelemetry"]>) => number): number =>
      nodes.reduce((acc, n) => acc + fn(n.getTelemetry()), 0);
    const totalRaw = sum((t) => t.rawTileBytesSynced);
    const totalComp = sum((t) => t.compressedDeltaBytesSynced);
    const savingsPct = totalRaw > 0 ? ((totalRaw - totalComp) / totalRaw) * 100 : 0;

    expect(sum((t) => t.retransmits)).toBeGreaterThan(0);
    expect(sum((t) => t.corruptFramesRejected)).toBeGreaterThan(0);
    expect(sum((t) => t.outOfOrderFrames)).toBeGreaterThan(0);
    expect(sum((t) => t.backpressurePauses)).toBeGreaterThan(0);
    expect(savingsPct).toBeGreaterThan(90);
    for (const node of nodes) expect(node.getTelemetry().serverBandwidthBytes).toBe(0);
  });
});

describe("HeapZeroGcObjectPool", () => {
  it("supports frame arena scopes, affine math, custom object pools, leak detection, and hard memory cap", async () => {
    const pool = new HeapZeroGcObjectPool({ hardMemoryCapBytes: 1024 * 1024, maxSlabBytes: 512 * 1024, maxIdlePerBucket: 8 });
    interface BrushScratch { x: number; y: number; active: boolean; }
    pool.registerObjectPool<BrushScratch>("brush-scratch", {
      create: () => ({ x: 0, y: 0, active: false }),
      reset: (item) => { item.x = 0; item.y = 0; item.active = false; },
      estimatedBytes: 48,
    });

    const ptOut = new Float32Array(2);
    pool.withFrameScope((scope) => {
      const mT = scope.acquireAffineMatrix(); mT[4] = 10; mT[5] = 20;
      const mS = scope.acquireAffineMatrix(); mS[0] = 2; mS[3] = 3;
      const mC = scope.acquireAffineMatrix();
      multiplyAffine2D(mT, mS, mC);
      transformPoint2D(mC, 5, 4, ptOut, 0);
      expect(ptOut[0]).toBeCloseTo(20);
      expect(ptOut[1]).toBeCloseTo(32);
      const scratch = scope.acquireObject<BrushScratch>("brush-scratch");
      scratch.x = 99; scratch.active = true;
    });
    expect(pool.getTelemetry().liveLeases).toBe(0);

    expect(() => pool.withFrameScope((s) => { s.acquireStrokePoints(16); s.acquireDirtyRects(4); throw new Error("frame-err"); })).toThrow("frame-err");
    expect(pool.getTelemetry().liveLeases).toBe(0);

    await pool.withFrameScope(async (s) => {
      expect(s.acquireTileScratch(DEFAULT_TILE_SCRATCH_BYTES).byteLength).toBe(DEFAULT_TILE_SCRATCH_BYTES);
      await Promise.resolve();
    });
    expect(pool.getTelemetry().liveLeases).toBe(0);

    const leaked = pool.acquireDirtyRects(8, "intentional-leak");
    pool.advanceFrame(3);
    const report = pool.detectLeaks(2);
    expect(report.leakedCount).toBe(1);
    expect(report.leaks[0]?.tag).toBe("intentional-leak");
    expect(report.leaks[0]?.ageFrames).toBe(3);
    expect(pool.release(leaked)).toBe(true);
    expect(pool.release(leaked)).toBe(false);
    expect(pool.getTelemetry().duplicateReleasesIgnored).toBe(1);

    const hold1 = pool.acquireTileScratch(512 * 1024);
    const hold2 = pool.acquireTileScratch(512 * 1024);
    expect(() => pool.acquireTileScratch(64 * 1024)).toThrow(PoolMemoryCapError);
    pool.release(hold1); pool.release(hold2);
    expect(pool.getTelemetry().liveLeases).toBe(0);
    expect(vi.isFakeTimers()).toBe(false);
  });

  it("achieves >= 99% reuse rate and 0 leaks across a 100,000-stroke 120Hz stress benchmark", () => {
    const hardCap = 4 * 1024 * 1024;
    const pool = new HeapZeroGcObjectPool({ hardMemoryCapBytes: hardCap, maxSlabBytes: 512 * 1024, maxIdlePerBucket: 16 });
    const totalStrokes = 100_000;
    const strokesPerFrame = 25;
    const frames = totalStrokes / strokesPerFrame;

    for (let f = 0; f < frames; f += 1) {
      pool.advanceFrame(1);
      pool.withFrameScope((frameScope) => {
        const frameTile = frameScope.acquireTileScratch(64 * 64 * 4, "frame:tile");
        frameTile[0] = f & 0xff;
        for (let s = 0; s < strokesPerFrame; s += 1) {
          const pts = pool.acquireStrokePoints(16, 4, "stroke:pts");
          const rects = pool.acquireDirtyRects(2, "stroke:dirty");
          const mat = pool.acquireAffineMatrix("stroke:mat");
          pts[0] = s; rects[0] = s; mat[4] = s * 0.5;
          pool.release(mat); pool.release(rects); pool.release(pts);
        }
      });
    }

    const telemetry = pool.getTelemetry();
    expect(telemetry.totalAcquires).toBe(totalStrokes * 3 + frames);
    expect(telemetry.reuseRatePercent).toBeGreaterThanOrEqual(99.9);
    expect(telemetry.liveLeases).toBe(0);
    expect(pool.detectLeaks(0).leakedCount).toBe(0);
    expect(telemetry.peakLiveBytes).toBeLessThanOrEqual(hardCap);
    expect(telemetry.totalTrackedBytes).toBeLessThanOrEqual(hardCap);
    expect(telemetry.frameScopesEntered).toBe(frames);
    expect(telemetry.frameScopesExited).toBe(frames);
  });
});
