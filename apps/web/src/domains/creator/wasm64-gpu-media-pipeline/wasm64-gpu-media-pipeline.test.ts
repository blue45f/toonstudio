import { describe, expect, it } from "vitest";
import {
  AUDIOTOON_EXPORT_PRESETS,
  CEL_LIGHT_UNIFORM_BYTES,
  SAB_WASM32_LIMIT_BYTES,
  SabMessageKind,
  SabZeroCopyWorkerChannel,
  WGSL_CEL_LIGHT_AUTOSHADER,
  buildAudioToonTimeline,
  buildContainerPreambleHeader,
  computeCelLightWorkgroups,
  computeSabChannelLayout,
  decodeTransferableFramePacket,
  deinterleaveStereoPcm,
  dispatchCelLightAutoshader,
  encodeTransferableFramePacket,
  ensureAnnexBStartCode,
  exportLocalAudioToon,
  packCelLightUniforms,
  packRgb565,
  packetizeWave3StereoPcm,
  probeAudioToonExportCapabilities,
  runCelLightAutoshaderCpu,
  unpackRgb565,
  validateCelLightWgslShader,
  type AudioToonWebCodecsAdapter,
  type CelLightGpuBufferLike,
  type CelLightGpuDeviceLike,
  type EncodedMediaChunkLike,
} from "./index";

/** 검은 잉크 외곽선으로 둘러싸인 플랫 컬러 원형 패널 RGBA8 테스트 이미지를 생성한다. */
function makeWebtoonCirclePanel(width: number, height: number): {
  readonly base: Uint8ClampedArray;
  readonly line: Uint8ClampedArray;
} {
  const base = new Uint8ClampedArray(width * height * 4);
  const line = new Uint8ClampedArray(width * height * 4);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const radius = Math.min(width, height) * 0.36;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius) {
        // 밝은 피부/의상 플랫 컬러
        base[off] = 242;
        base[off + 1] = 205;
        base[off + 2] = 178;
        base[off + 3] = 255;
      }
      if (Math.abs(dist - radius) <= 1.25) {
        // 외곽선 잉크 스트로크
        line[off] = 16;
        line[off + 1] = 18;
        line[off + 2] = 24;
        line[off + 3] = 255;
      }
    }
  }
  return { base, line };
}

function createMockWebCodecsAdapter(options: {
  readonly h264Hw?: boolean;
  readonly vp9Hw?: boolean;
  readonly aacSupported?: boolean;
  readonly opusSupported?: boolean;
  readonly simulateBackpressureLimit?: number;
  readonly drainViaMacrotask?: boolean;
}): {
  readonly adapter: AudioToonWebCodecsAdapter;
  readonly stats: {
    videoFramesCreated: number;
    videoFramesClosed: number;
    audioDataCreated: number;
    audioDataClosed: number;
    videoEncoderClosed: boolean;
    audioEncoderClosed: boolean;
    configuredVideoCodecs: string[];
    configuredAudioCodecs: string[];
  };
} {
  const stats = {
    videoFramesCreated: 0,
    videoFramesClosed: 0,
    audioDataCreated: 0,
    audioDataClosed: 0,
    videoEncoderClosed: false,
    audioEncoderClosed: false,
    configuredVideoCodecs: [] as string[],
    configuredAudioCodecs: [] as string[],
  };

  const makeChunk = (
    payload: Uint8Array,
    type: "key" | "delta",
    timestamp: number,
    duration: number,
  ): EncodedMediaChunkLike => ({
    type,
    timestamp,
    duration,
    byteLength: payload.byteLength,
    copyTo: (dest) => dest.set(payload),
  });

  const adapter: AudioToonWebCodecsAdapter = {
    isVideoConfigSupported: async (cfg) => {
      if (cfg.codec.startsWith("avc1")) {
        const ok = cfg.hardwareAcceleration === "prefer-hardware" ? (options.h264Hw ?? true) : (options.h264Hw ?? true);
        return { supported: ok };
      }
      if (cfg.codec.startsWith("vp09")) {
        const ok = cfg.hardwareAcceleration === "prefer-hardware" ? (options.vp9Hw ?? false) : true;
        return { supported: ok };
      }
      return { supported: false };
    },
    isAudioConfigSupported: async (cfg) => {
      if (cfg.codec.startsWith("mp4a")) return { supported: options.aacSupported ?? true };
      if (cfg.codec === "opus") return { supported: options.opusSupported ?? true };
      return { supported: false };
    },
    createVideoEncoder: (init) => {
      let queueSize = 0;
      let state = "unconfigured";
      let seq = 0;
      const bpTrigger = options.simulateBackpressureLimit ?? 0;

      const drainOne = (): void => {
        if (queueSize > 0) queueSize -= 1;
      };

      return {
        get encodeQueueSize() {
          return queueSize;
        },
        get state() {
          return state;
        },
        configure: (cfg) => {
          state = "configured";
          stats.configuredVideoCodecs.push(cfg.codec);
        },
        encode: (frame, encOpts) => {
          seq += 1;
          queueSize += 1;
          const isKey = Boolean(encOpts?.keyFrame);
          const body = new Uint8Array([isKey ? 0x65 : 0x41, seq & 0xff, (seq >> 8) & 0xff, 0x99]);
          const ts = frame.timestamp;
          const dur = frame.duration ?? 16_667;
          if (bpTrigger > 0) {
            const scheduleDrain = options.drainViaMacrotask
              ? (fn: () => void) => { setTimeout(fn, 0); }
              : queueMicrotask;
            scheduleDrain(() => {
              init.output(makeChunk(body, isKey ? "key" : "delta", ts, dur));
              drainOne();
            });
          } else {
            init.output(makeChunk(body, isKey ? "key" : "delta", ts, dur));
            drainOne();
          }
        },
        flush: async () => {
          while (queueSize > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        },
        close: () => {
          state = "closed";
          stats.videoEncoderClosed = true;
        },
      };
    },
    createAudioEncoder: (init) => {
      let queueSize = 0;
      let state = "unconfigured";
      let seq = 0;
      return {
        get encodeQueueSize() {
          return queueSize;
        },
        get state() {
          return state;
        },
        configure: (cfg) => {
          state = "configured";
          stats.configuredAudioCodecs.push(cfg.codec);
        },
        encode: (data) => {
          seq += 1;
          queueSize += 1;
          const durUs = Math.round((data.numberOfFrames * 1_000_000) / data.sampleRate);
          const payload = new Uint8Array([0xaa, 0x55, seq & 0xff, data.numberOfChannels]);
          init.output(makeChunk(payload, "key", data.timestamp, durUs));
          queueSize -= 1;
        },
        flush: async () => undefined,
        close: () => {
          state = "closed";
          stats.audioEncoderClosed = true;
        },
      };
    },
    createVideoFrame: (input) => {
      stats.videoFramesCreated += 1;
      return {
        timestamp: input.timestampUs,
        duration: input.durationUs,
        close: () => {
          stats.videoFramesClosed += 1;
        },
      };
    },
    createAudioData: (input) => {
      stats.audioDataCreated += 1;
      return {
        timestamp: input.timestampUs,
        numberOfFrames: input.numberOfFrames,
        numberOfChannels: input.numberOfChannels,
        sampleRate: input.sampleRate,
        close: () => {
          stats.audioDataClosed += 1;
        },
      };
    },
  };

  return { adapter, stats };
}

describe("1. WebGPU Cel-Light Autoshader (WGSL + 64B Uniform + CPU Fallback)", () => {
  it("WGSL 컴퓨트 셰이더의 @workgroup_size(16,16), 바인딩 4개, 배리어 및 괄호 불변식을 검증한다", () => {
    const valid = validateCelLightWgslShader(WGSL_CEL_LIGHT_AUTOSHADER);
    expect(valid.valid).toBe(true);
    expect(valid.entryPoint).toBe("main");
    expect(valid.workgroupSize).toEqual([16, 16, 1]);
    expect(valid.uniformStructName).toBe("CelLightUniforms");
    expect(valid.bindings).toEqual([
      { group: 0, binding: 0 },
      { group: 0, binding: 1 },
      { group: 0, binding: 2 },
      { group: 0, binding: 3 },
    ]);
    expect(valid.usesWorkgroupMemory).toBe(true);
    expect(valid.usesWorkgroupBarrier).toBe(true);
    expect(valid.errors).toEqual([]);

    const broken = validateCelLightWgslShader("var<workgroup> x: array<f32, 4>; fn main() {");
    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("packCelLightUniforms가 정확히 64바이트 정렬·정규화 라이트·RGB565 틴트를 패킹한다", () => {
    const packed = packCelLightUniforms({
      width: 640,
      height: 360,
      celBands: 9, // 4로 클램프되어야 함
      lightDirection: [3, -4, 0],
      normalStrength: 3.2,
      rimIntensity: 0.7,
      rimPower: 3.0,
      shadowTintStrength: 0.9,
      halftonePitchPx: 8.0,
      halftoneAngleRad: Math.PI / 6,
      halftoneStrength: 0.6,
      lineThreshold: 0.25,
      shadowTintRgb: [0.35, 0.45, 0.75],
      rimTintRgb: [1.0, 0.9, 0.7],
    });

    expect(packed.byteLength).toBe(CEL_LIGHT_UNIFORM_BYTES);
    expect(packed.buffer.byteLength).toBe(64);
    expect(packed.buffer.byteLength % 64).toBe(0);

    const dv = new DataView(packed.buffer);
    expect(dv.getUint32(0, true)).toBe(640);
    expect(dv.getUint32(4, true)).toBe(360);
    expect(dv.getUint32(8, true)).toBe(4);

    const lx = dv.getFloat32(16, true);
    const ly = dv.getFloat32(20, true);
    const lz = dv.getFloat32(24, true);
    expect(Math.hypot(lx, ly, lz)).toBeCloseTo(1.0, 5);
    expect(lx).toBeCloseTo(0.6, 5);
    expect(ly).toBeCloseTo(-0.8, 5);

    const sampleRgb565 = packRgb565([0.35, 0.45, 0.75]);
    const unpacked = unpackRgb565(sampleRgb565);
    expect(unpacked[0]).toBeCloseTo(0.35, 1);
    expect(unpacked[1]).toBeCloseTo(0.45, 1);
    expect(unpacked[2]).toBeCloseTo(0.75, 1);
  });

  it("결정적 CPU 폴백이 2~4밴드 셀 음영·방향성 키 라이트·림 라이트·하프톤·잉크 보존을 정확히 계산한다", () => {
    const w = 32;
    const h = 32;
    const { base, line } = makeWebtoonCirclePanel(w, h);

    const leftLight = runCelLightAutoshaderCpu(
      base,
      { width: w, height: h, celBands: 3, lightDirection: [-0.85, -0.2, 0.45], normalStrength: 6.0, rimIntensity: 0.85, halftoneStrength: 0.7, halftonePitchPx: 4 },
      line,
    );
    const leftLightRepeat = runCelLightAutoshaderCpu(
      base,
      { width: w, height: h, celBands: 3, lightDirection: [-0.85, -0.2, 0.45], normalStrength: 6.0, rimIntensity: 0.85, halftoneStrength: 0.7, halftonePitchPx: 4 },
      line,
    );
    expect(leftLight.rgba).toEqual(leftLightRepeat.rgba);
    expect(leftLight.celBandCounts.length).toBe(3);
    expect(leftLight.celBandCounts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(2);
    expect(leftLight.rimLitPixelCount).toBeGreaterThan(0);
    expect(leftLight.halftoneShadowPixelCount).toBeGreaterThan(0);
    expect(leftLight.inkPreservedPixelCount).toBeGreaterThan(0);
    // 투명 배경 모서리는 완전 투명 유지
    expect(leftLight.rgba[3]).toBe(0);

    // 광원 X 반전 시 좌측/우측 밝기 대비가 반전되어야 함
    const rightLight = runCelLightAutoshaderCpu(
      base,
      { width: w, height: h, celBands: 3, lightDirection: [0.85, -0.2, 0.45], normalStrength: 6.0, rimIntensity: 0.85, halftoneStrength: 0.7, halftonePitchPx: 4 },
      line,
    );
    const lumaSum = (rgba: Uint8ClampedArray, xStart: number, xEnd: number): number => {
      let total = 0;
      for (let y = 10; y < 22; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const o = (y * w + x) * 4;
          total += rgba[o] + rgba[o + 1] + rgba[o + 2];
        }
      }
      return total;
    };
    const leftSideWhenLightLeft = lumaSum(leftLight.rgba, 6, 13);
    const rightSideWhenLightLeft = lumaSum(leftLight.rgba, 19, 26);
    const leftSideWhenLightRight = lumaSum(rightLight.rgba, 6, 13);
    const rightSideWhenLightRight = lumaSum(rightLight.rgba, 19, 26);
    expect(leftSideWhenLightLeft).toBeGreaterThan(rightSideWhenLightLeft);
    expect(rightSideWhenLightRight).toBeGreaterThan(leftSideWhenLightRight);

    // 림·하프톤 비활성화 시 카운트 0
    const flatCel = runCelLightAutoshaderCpu(
      base,
      { width: w, height: h, celBands: 2, enableRim: false, enableHalftone: false },
      line,
    );
    expect(flatCel.celBandCounts.length).toBe(2);
    expect(flatCel.rimLitPixelCount).toBe(0);
    expect(flatCel.halftoneShadowPixelCount).toBe(0);
  });

  it("dispatchCelLightAutoshader가 모의 GPUDevice 디스패치와 무디바이스 CPU 폴백을 모두 처리한다", async () => {
    const { base, line } = makeWebtoonCirclePanel(20, 18);
    const grid = computeCelLightWorkgroups(20, 18);
    expect(grid.x).toBe(2);
    expect(grid.y).toBe(2);
    expect(grid.totalWorkgroups).toBe(4);

    let dispatched: readonly number[] | null = null;
    let destroyedCount = 0;
    const mockDevice: CelLightGpuDeviceLike = {
      queue: {
        writeBuffer: () => undefined,
        submit: () => undefined,
      },
      createShaderModule: (d) => ({ label: d.label }),
      createBuffer: (d): CelLightGpuBufferLike => ({
        size: d.size,
        usage: d.usage,
        destroy: () => {
          destroyedCount += 1;
        },
      }),
      createComputePipelineAsync: async (d) => ({
        label: d.label,
        getBindGroupLayout: () => ({ label: "layout-0" }),
      }),
      createBindGroup: (d) => ({ label: d.label }),
      createCommandEncoder: () => ({
        beginComputePass: () => ({
          setPipeline: () => undefined,
          setBindGroup: () => undefined,
          dispatchWorkgroups: (x, y, z) => {
            dispatched = [x, y ?? 1, z ?? 1];
          },
          end: () => undefined,
        }),
        finish: () => ({ label: "cmd" }),
      }),
    };

    const gpuRes = await dispatchCelLightAutoshader({
      device: mockDevice,
      basePixels: base,
      linePixels: line,
      config: { width: 20, height: 18, celBands: 4 },
    });
    expect(gpuRes.backend).toBe("webgpu-compute");
    expect(dispatched).toEqual([2, 2, 1]);
    expect(destroyedCount).toBe(3); // uniform + base + line 스테이징 버퍼 해제
    expect(gpuRes.gpuOutputBuffer).not.toBeNull();

    const fallbackRes = await dispatchCelLightAutoshader({
      device: null,
      basePixels: base,
      linePixels: line,
      config: { width: 20, height: 18, celBands: 4 },
    });
    expect(fallbackRes.backend).toBe("cpu-fallback");
    expect(fallbackRes.cpuResult?.rgba.length).toBe(20 * 18 * 4);
    expect(fallbackRes.fallbackReasonKo).toContain("WebGPU");
  });
});

describe("2. SAB Zero-Copy Worker Channel (64-bit BigInt + Atomics + Transferable Fallback)", () => {
  it("64비트 BigInt(>4 GiB) 주소로 SAB 제로-카피 왕복 전송 및 워커 attach를 검증한다", () => {
    const layout = computeSabChannelLayout(8, 1024);
    expect(layout.soaByteOffset % 64).toBe(0);
    expect(layout.slabByteOffset % 64).toBe(0);

    const producer = SabZeroCopyWorkerChannel.create({
      frameCapacity: 8,
      slabByteLength: 1024,
      crossOriginIsolatedOverride: true,
    });
    const worker = SabZeroCopyWorkerChannel.attach(producer.buffer, true);

    expect(producer.isShared).toBe(true);
    expect(producer.transportMode).toBe("shared-array-buffer-zero-copy");
    expect(worker.isShared).toBe(true);

    const highDocAddr = SAB_WASM32_LIMIT_BYTES + BigInt("0x123456780"); // > 8 GiB
    const highTileAddr = SAB_WASM32_LIMIT_BYTES * BigInt(3) + BigInt(65536); // > 12 GiB
    const payload = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90]);

    const sendRes = producer.send({
      kind: SabMessageKind.TilePatch,
      docOffsetI64: highDocAddr,
      tileOffsetI64: highTileAddr,
      payload,
    });
    expect(sendRes.ok).toBe(true);
    expect(sendRes.sequence).toBe(1);

    let borrowedIsZeroCopy = false;
    let borrowedSharesSab = false;
    let receivedDoc = BigInt(0);
    let receivedTile = BigInt(0);
    let copiedBytes: number[] = [];

    const rxRes = worker.consumeZeroCopy((frame) => {
      borrowedIsZeroCopy = frame.zeroCopyView;
      borrowedSharesSab = frame.payload.buffer === producer.buffer;
      receivedDoc = frame.docOffsetI64;
      receivedTile = frame.tileOffsetI64;
      copiedBytes = Array.from(frame.payload);
    });

    expect(rxRes.ok).toBe(true);
    expect(borrowedIsZeroCopy).toBe(true);
    expect(borrowedSharesSab).toBe(true);
    expect(receivedDoc).toBe(highDocAddr);
    expect(receivedTile).toBe(highTileAddr);
    expect(copiedBytes).toEqual(Array.from(payload));

    const metrics = producer.getMetrics();
    expect(metrics.structuredCloneBytes).toBe(0);
    expect(metrics.zeroCopyBytes).toBe(payload.byteLength);
    expect(metrics.maxDocOffsetI64).toBe(highDocAddr);
    expect(metrics.maxTileOffsetI64).toBe(highTileAddr);
    expect(worker.getMetrics().slabUsedBytes).toBe(0);
  });

  it("Atomics 링 슬롯·페이로드 슬랩 다중 랩어라운드, 멀티 배치 프레이밍, 백프레셔 및 체크섬 변조 탐지를 검증한다", () => {
    const ch = SabZeroCopyWorkerChannel.create({
      frameCapacity: 4,
      slabByteLength: 256,
      highWaterRatio: 0.75,
      crossOriginIsolatedOverride: true,
    });
    const consumer = SabZeroCopyWorkerChannel.attach(ch.buffer, true);

    // 4슬롯 256B 슬랩에서 30회 연속 랩어라운드 왕복 검증
    for (let i = 0; i < 30; i += 1) {
      const len = 37 + (i % 5) * 19; // 비정렬 길이로 8B 정렬 + 슬랩 테일 랩어라운드 유도
      const buf = new Uint8Array(len);
      for (let b = 0; b < len; b += 1) buf[b] = (i * 13 + b) & 0xff;
      const addr = SAB_WASM32_LIMIT_BYTES + BigInt(i * 4096);
      const sent = ch.send({ kind: SabMessageKind.StrokeDelta, docOffsetI64: addr, tileOffsetI64: addr + BigInt(256), payload: buf });
      expect(sent.ok).toBe(true);
      const got = consumer.receive();
      expect(got.ok).toBe(true);
      expect(got.frame?.docOffsetI64).toBe(addr);
      expect(got.frame?.payload).toEqual(buf);
    }
    expect(consumer.getMetrics().slabUsedBytes).toBe(0);

    // 멀티 메시지 배치 프레이밍 + 고수위 백프레셔 + 링 풀 거부 검증
    const batchRes = ch.sendBatch([
      { kind: SabMessageKind.AudioPcmBlock, docOffsetI64: BigInt(100), tileOffsetI64: BigInt(200), payload: new Uint8Array([1, 2, 3, 4]) },
      { kind: SabMessageKind.AudioPcmBlock, docOffsetI64: BigInt(104), tileOffsetI64: BigInt(204), payload: new Uint8Array([5, 6, 7, 8]) },
      { kind: SabMessageKind.CompositeCommit, docOffsetI64: BigInt(108), tileOffsetI64: BigInt(208), payload: new Uint8Array([9, 10]) },
    ]);
    expect(batchRes.ok).toBe(true);
    expect(batchRes.framesSent).toBe(3);
    expect(batchRes.backpressured).toBe(true); // 3 >= highWaterFrames(3)

    // 4번째는 들어가고 5번째는 ring-full 거부
    expect(ch.send({ kind: SabMessageKind.ControlFence, docOffsetI64: BigInt(0), tileOffsetI64: BigInt(0), payload: new Uint8Array(0) }).ok).toBe(true);
    const overflow = ch.send({ kind: SabMessageKind.ControlFence, docOffsetI64: BigInt(0), tileOffsetI64: BigInt(0), payload: new Uint8Array([1]) });
    expect(overflow.ok).toBe(false);
    expect(overflow.reason).toBe("ring-full");
    expect(ch.getMetrics().backpressureEvents).toBeGreaterThan(0);

    const drained = consumer.receiveBatch(4);
    expect(drained.length).toBe(4);
    expect(drained[0].batchId).toBe(batchRes.batchId);
    expect(drained[0].batchPartIndex).toBe(0);
    expect(drained[0].batchPartCount).toBe(3);
    expect(drained[2].batchPartIndex).toBe(2);

    // 체크섬 변조 탐지: 슬랩 바이트 1비트 반전 시 checksum-mismatch 반환
    const probePayload = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
    expect(ch.send({ kind: SabMessageKind.ShaderUniformSync, docOffsetI64: BigInt(42), tileOffsetI64: BigInt(84), payload: probePayload }).ok).toBe(true);
    const rawSlab = new Uint8Array(ch.buffer, ch.layout.slabByteOffset, ch.layout.slabByteLength);
    for (let i = 0; i < rawSlab.length; i += 1) {
      if (rawSlab[i] === 0x11 && rawSlab[i + 1] === 0x22 && rawSlab[i + 2] === 0x33) {
        rawSlab[i] ^= 0x01;
        break;
      }
    }
    const tampered = consumer.receive();
    expect(tampered.ok).toBe(false);
    expect(tampered.reason).toBe("checksum-mismatch");
    expect(consumer.getMetrics().checksumErrors).toBe(1);
  });

  it("crossOriginIsolated === false 환경에서 Transferable ArrayBuffer 폴백 패킷 동치성을 검증한다", () => {
    const fallbackCh = SabZeroCopyWorkerChannel.create({
      frameCapacity: 8,
      slabByteLength: 512,
      crossOriginIsolatedOverride: false,
    });
    expect(fallbackCh.isShared).toBe(false);
    expect(fallbackCh.transportMode).toBe("array-buffer-transferable-fallback");

    const hugeOffset = SAB_WASM32_LIMIT_BYTES + BigInt("9000000000");
    const inputs = [
      { kind: SabMessageKind.TilePatch, docOffsetI64: hugeOffset, tileOffsetI64: hugeOffset + BigInt(512), payload: new Uint8Array([7, 8, 9, 10, 11]) },
      { kind: SabMessageKind.CompositeCommit, docOffsetI64: hugeOffset + BigInt(1024), tileOffsetI64: BigInt(0), payload: new Uint8Array([255, 128, 64]) },
    ] as const;

    const env = fallbackCh.encodeTransferableBatch(inputs);
    expect(env.transportMode).toBe("array-buffer-transferable-fallback");
    expect(env.transferList).toEqual([env.packet]);
    expect(env.structuredCloneBytes).toBe(0);
    expect(env.frameCount).toBe(2);

    const decoded = decodeTransferableFramePacket(env.packet);
    expect(decoded.ok).toBe(true);
    expect(decoded.checksumErrors).toBe(0);
    expect(decoded.frames.length).toBe(2);
    expect(decoded.frames[0].docOffsetI64).toBe(hugeOffset);
    expect(decoded.frames[0].payload).toEqual(inputs[0].payload);
    expect(decoded.frames[1].payload).toEqual(inputs[1].payload);

    // 직접 호출 인코더의 체크섬 변조도 검출
    const directEnv = encodeTransferableFramePacket(inputs);
    const bytes = new Uint8Array(directEnv.packet);
    bytes[bytes.length - 64] ^= 0xff;
    // 앞 슬랩 바이트 변조
    const slabOff = new Uint32Array(directEnv.packet, 0, 8)[4];
    bytes[slabOff] ^= 0x80;
    const badDecoded = decodeTransferableFramePacket(directEnv.packet);
    expect(badDecoded.ok).toBe(false);
    expect(badDecoded.checksumErrors).toBe(1);
  });
});

describe("3. WebCodecs Local AudioToon Exporter (₩0 Local Short-Form + Wave-3 PCM + Backpressure)", () => {
  it("9:16 1080×1920@60fps 및 16:9 1920×1080@60fps 프리셋과 타임라인 Ken Burns·말풍선·전환을 검증한다", () => {
    expect(AUDIOTOON_EXPORT_PRESETS["reels-9x16-1080p60"]).toMatchObject({ width: 1080, height: 1920, fps: 60 });
    expect(AUDIOTOON_EXPORT_PRESETS["landscape-16x9-1080p60"]).toMatchObject({ width: 1920, height: 1080, fps: 60 });

    const plan = buildAudioToonTimeline(
      [
        {
          cutId: "cut-1",
          durationMs: 500,
          transitionIn: { kind: "fade", durationMs: 100 },
          kenBurns: { startScale: 1.0, endScale: 1.2, startPanX: 0, startPanY: 0, endPanX: 40, endPanY: -20, easing: "ease-in-out-cubic" },
          balloons: [
            { id: "b1", text: "안녕하세요!", appearAtMs: 100, revealDurationMs: 200, style: "typewriter" },
          ],
        },
        {
          cutId: "cut-2",
          durationMs: 500,
          transitionIn: { kind: "crossfade", durationMs: 150 },
          kenBurns: { startScale: 1.15, endScale: 1.0, startPanX: -10, startPanY: 0, endPanX: 10, endPanY: 0, easing: "linear" },
          balloons: [
            { id: "b2", text: "좋아!", appearAtMs: 50, revealDurationMs: 100, style: "pop" },
          ],
        },
      ],
      "reels-9x16-1080p60",
    );

    expect(plan.totalDurationMs).toBe(1000);
    expect(plan.totalFrames).toBe(60);
    expect(plan.frames[0].isKeyFrame).toBe(true);
    expect(plan.frames[0].opacity).toBe(0);
    expect(plan.frames[0].balloons[0].visible).toBe(false);

    // 200ms 시점(frame 12): 말풍선 타자기 진행 중
    const midCut1 = plan.frames[12];
    expect(midCut1.cutId).toBe("cut-1");
    expect(midCut1.balloons[0].visible).toBe(true);
    expect(midCut1.balloons[0].revealedCharCount).toBeGreaterThan(0);
    expect(midCut1.balloons[0].revealedCharCount).toBeLessThan(midCut1.balloons[0].totalCharCount);
    expect(midCut1.scale).toBeGreaterThan(1.0);
    expect(midCut1.scale).toBeLessThan(1.2);

    // 컷 2 시작(frame 30): 키프레임 강제 + 크로스페이드 활성화
    const cut2Start = plan.frames[30];
    expect(cut2Start.cutId).toBe("cut-2");
    expect(cut2Start.isKeyFrame).toBe(true);
    expect(cut2Start.crossfadeFromCutId).toBe("cut-1");
    expect(cut2Start.crossfadeMix).toBeLessThan(1);
  });

  it("Wave-3 Rust 오디오 DSP 스테레오 PCM 패킷화와 Annex-B/EBML 프리앰블 생성을 검증한다", () => {
    const sampleRate = 48_000;
    const frames = 2500; // 1024*2 + 452 꼬리 패딩
    const interleaved = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i += 1) {
      interleaved[i * 2] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
      interleaved[i * 2 + 1] = Math.cos((2 * Math.PI * 880 * i) / sampleRate) * 0.25;
    }
    interleaved[10] = Number.NaN; // 비유한 샘플 안전 치환 검증

    const bus = deinterleaveStereoPcm(interleaved, sampleRate);
    const summary = packetizeWave3StereoPcm(bus, 1024);
    expect(summary.packetCount).toBe(3);
    expect(summary.packets[0].timestampUs).toBe(0);
    expect(summary.packets[1].timestampUs).toBe(Math.round((1024 * 1_000_000) / sampleRate));
    expect(summary.packets[2].validFrames).toBe(452);
    expect(summary.packets[2].planarSamples[452]).toBe(0); // 제로 패딩 확인
    expect(summary.packets[0].planarSamples[5]).toBe(0); // NaN -> 0 치환 확인
    expect(summary.overallPeakLinear).toBeGreaterThan(0.45);
    expect(summary.overallPeakLinear).toBeLessThanOrEqual(0.51);

    const annexB = ensureAnnexBStartCode(new Uint8Array([0x65, 0x88, 0x84]));
    expect(Array.from(annexB.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(ensureAnnexBStartCode(annexB)).toBe(annexB);

    const mp4Hdr = buildContainerPreambleHeader("mp4");
    expect(String.fromCharCode(...mp4Hdr.slice(4, 12))).toBe("ftypisom");
    const webmHdr = buildContainerPreambleHeader("webm");
    expect(Array.from(webmHdr.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });

  it("하드웨어 인코더 백프레셔·A/V 타임스탬프 싱크·핸들 누수 0·진행률 및 WebM 폴백을 검증한다", async () => {
    const { adapter, stats } = createMockWebCodecsAdapter({
      h264Hw: true,
      aacSupported: true,
      simulateBackpressureLimit: 2,
    });
    const sampleRate = 48_000;
    const totalSamples = 24_000; // 정확히 0.5초 (30프레임 @ 60fps = 0.5초와 동기화)
    const left = new Float32Array(totalSamples).fill(0.2);
    const right = new Float32Array(totalSamples).fill(-0.2);

    const progressPhases: string[] = [];
    const report = await exportLocalAudioToon({
      presetId: "reels-9x16-1080p60",
      cuts: [{ cutId: "hero-cut", durationMs: 500 }],
      audioBus: { left, right, sampleRate, integratedLufs: -14.0, truePeakDbfs: -1.0 },
      adapter,
      maxVideoEncodeQueueSize: 2,
      queueDrainPollMs: 0,
      onProgress: (p) => {
        if (progressPhases[progressPhases.length - 1] !== p.phase) {
          progressPhases.push(p.phase);
        }
      },
    });

    expect(report.status).toBe("completed");
    expect(report.serverCostKrw).toBe(0);
    expect(report.capability.videoAcceleration).toBe("prefer-hardware");
    expect(report.capability.selectedContainer).toBe("mp4");
    expect(report.encodedVideoFrames).toBe(30);
    expect(report.closedVideoFrames).toBe(30);
    expect(stats.videoFramesCreated).toBe(stats.videoFramesClosed);
    expect(stats.audioDataCreated).toBe(stats.audioDataClosed);
    expect(stats.videoEncoderClosed).toBe(true);
    expect(stats.audioEncoderClosed).toBe(true);
    expect(report.backpressure.videoBackpressurePauses).toBeGreaterThan(0);
    expect(progressPhases).toEqual(["probing", "encoding-video", "encoding-audio", "flushing", "done"]);

    expect(report.muxPackage).not.toBeNull();
    expect(report.muxPackage?.container).toBe("mp4");
    expect(report.muxPackage?.totalVideoChunks).toBe(30);
    expect(report.muxPackage?.totalAudioChunks).toBeGreaterThan(0);
    expect(report.muxPackage?.avSync.inSync).toBe(true);
    // 인터리브 청크가 타임스탬프 단조 증가 순서인지 검증
    const chunks = report.muxPackage?.chunks ?? [];
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].timestampUs).toBeGreaterThanOrEqual(chunks[i - 1].timestampUs);
    }

    // VP9 + Opus WebM 선택 검증
    const vp9Mock = createMockWebCodecsAdapter({ h264Hw: false, vp9Hw: true, aacSupported: false, opusSupported: true });
    const vp9Cap = await probeAudioToonExportCapabilities("landscape-16x9-1080p60", vp9Mock.adapter);
    expect(vp9Cap.selectedContainer).toBe("webm");
    expect(vp9Cap.selectedVideoCodec?.family).toBe("vp9");
    expect(vp9Cap.selectedAudioCodec?.family).toBe("opus");
    expect(vp9Cap.videoAcceleration).toBe("prefer-hardware");
  });

  it("AbortSignal 도중 취소와 WebCodecs 미지원 폴백 리포트를 안전하게 처리한다", async () => {
    const { adapter, stats } = createMockWebCodecsAdapter({ h264Hw: true, aacSupported: true });
    const ac = new AbortController();

    const abortReport = await exportLocalAudioToon({
      presetId: "landscape-16x9-1080p60",
      cuts: [{ cutId: "long-cut", durationMs: 1000 }],
      adapter,
      signal: ac.signal,
      onProgress: (p) => {
        if (p.phase === "encoding-video" && p.completedFrames >= 5) {
          ac.abort();
        }
      },
    });

    expect(abortReport.status).toBe("aborted");
    expect(abortReport.encodedVideoFrames).toBe(5);
    expect(abortReport.closedVideoFrames).toBe(5);
    expect(stats.videoFramesCreated).toBe(stats.videoFramesClosed);
    expect(stats.videoEncoderClosed).toBe(true);
    expect(abortReport.muxPackage).toBeNull();

    // WebCodecs 미지원 환경 폴백
    const unsupportedCap = await probeAudioToonExportCapabilities("reels-9x16-1080p60", null);
    expect(unsupportedCap.webCodecsVideoAvailable).toBe(false);
    expect(unsupportedCap.selectedContainer).toBe("fallback-manifest");
    expect(unsupportedCap.serverCostKrw).toBe(0);
    expect(unsupportedCap.fallbackReasonKo).toContain("VideoEncoder");

    const fallbackExport = await exportLocalAudioToon({
      presetId: "reels-9x16-1080p60",
      cuts: [{ cutId: "cut-a", durationMs: 250 }],
      adapter: null,
    });
    expect(fallbackExport.status).toBe("fallback-unsupported");
    expect(fallbackExport.serverCostKrw).toBe(0);
    expect(fallbackExport.muxPackage).toBeNull();
    expect(fallbackExport.fallbackReasonKo).toContain("VideoEncoder");
  });

  it("기본 queueDrainPollMs=0에서도 매크로태스크(setTimeout) 기반 인코더 큐 배출을 굶기지 않고 완료한다", async () => {
    const { adapter } = createMockWebCodecsAdapter({
      h264Hw: true,
      aacSupported: true,
      simulateBackpressureLimit: 1,
      drainViaMacrotask: true,
    });
    const report = await exportLocalAudioToon({
      presetId: "reels-9x16-1080p60",
      cuts: [{ cutId: "macrotask-cut", durationMs: 100 }],
      adapter,
      maxVideoEncodeQueueSize: 1,
    });
    expect(report.status).toBe("completed");
    expect(report.encodedVideoFrames).toBe(6);
    expect(report.backpressure.videoBackpressurePauses).toBeGreaterThan(0);
  });
});
