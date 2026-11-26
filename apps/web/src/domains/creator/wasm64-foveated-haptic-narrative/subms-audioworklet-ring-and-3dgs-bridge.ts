/**
 * 제로카피 서브밀리초 Lock-Free AudioWorklet 링 버퍼 및
 * WebGPU 3D Gaussian Splatting(3DGS) 16/32비트 기수(Radix) 깊이 정렬 · NPR 선화/톤 변환 브리지.
 *
 * - 외부 서버 호출 0회(₩0), 오프라인 완결 결정론 실시간 A/V · 3DGS 코어.
 * - `SubMsAudioWorkletRingBuffer`: 128샘플 Web Audio 퀀텀(48kHz 기준 2.67ms, 서브-ms 쓰기 지연)
 *   Lock-Free SPSC `SharedArrayBuffer`(`Atomics`) 인터리브/플래너 스테레오 링 버퍼,
 *   드리프트 보정 A/V 동기화 텔레메트리 및 non-SAB `ArrayBuffer` 폴백을 제공한다.
 * - `WebGpu3dgsSplatSorter` / `sort3dgsSplatsByCameraDepth`: 16비트(2패스)·32비트(4패스 IEEE-754)
 *   결정론 LSB Radix 깊이 정렬, 프러스텀 컬링, 3D→2D 공분산 스크린 투영 바운드,
 *   그리고 웹툰 배경용 셀/잉크/스크린톤 NPR 합성 WGSL(`WGSL_3DGS_NPR_COMPOSITE`)을 제공한다.
 */

export const AUDIO_WORKLET_QUANTUM_FRAMES = 128;
export const DEFAULT_AUDIO_SAMPLE_RATE_HZ = 48000;
export const RING_CONTROL_HEADER_INT32_COUNT = 16;
export const RING_CONTROL_HEADER_BYTES = RING_CONTROL_HEADER_INT32_COUNT * 4;

const CTRL_WRITE_CURSOR = 0; const CTRL_READ_CURSOR = 1; const CTRL_CAPACITY_FRAMES = 2;
const CTRL_CHANNEL_COUNT = 3; const CTRL_LAYOUT_CODE = 4; const CTRL_SAMPLE_RATE = 5;
const CTRL_UNDERRUN_COUNT = 6; const CTRL_OVERRUN_COUNT = 7; const CTRL_TOTAL_WRITTEN = 8;
const CTRL_TOTAL_READ = 9; const CTRL_AV_VIDEO_MS_X100 = 10; const CTRL_AV_AUDIO_FRAME = 11;
const CTRL_DRIFT_PPM_X10 = 12;

export type AudioBufferChannelLayout = "interleaved" | "planar";
export type Vec3 = readonly [number, number, number];
export type Vec4 = readonly [number, number, number, number];
export type RadixKeyBitWidth = 16 | 32;

export interface AudioWorkletRingBufferOptions {
  readonly capacityFrames?: number; readonly channelCount?: 1 | 2;
  readonly sampleRateHz?: number; readonly layout?: AudioBufferChannelLayout;
  /** 테스트 또는 `crossOriginIsolated === false` 환경을 위한 non-SAB `ArrayBuffer` 강제 폴백. */
  readonly forceFallbackArrayBuffer?: boolean;
}

export interface RingWriteResult {
  readonly framesWritten: number; readonly framesDropped: number; readonly overrun: boolean;
  readonly writeLatencyMs: number; readonly availableReadFrames: number;
}

export interface RingReadResult {
  readonly framesRead: number; readonly framesZeroFilled: number;
  readonly underrun: boolean; readonly availableReadFrames: number;
}

export interface AvSyncTelemetry {
  readonly usesSharedArrayBuffer: boolean; readonly layout: AudioBufferChannelLayout;
  readonly sampleRateHz: number; readonly channelCount: 1 | 2; readonly capacityFrames: number;
  readonly quantumFrames: typeof AUDIO_WORKLET_QUANTUM_FRAMES; readonly quantumDurationMs: number;
  readonly availableReadFrames: number; readonly availableWriteFrames: number; readonly fillRatio01: number;
  readonly totalFramesWritten: number; readonly totalFramesRead: number;
  readonly underrunCount: number; readonly overrunCount: number;
  readonly audioClockMs: number; readonly lastVideoTimelineMs: number; readonly avOffsetMs: number;
  readonly estimatedDriftPpm: number; readonly recommendedPlaybackRate: number;
  readonly lastWriteLatencyMs: number; readonly maxWriteLatencyMs: number; readonly serverCostKrw: 0;
}

export interface GaussianSplat3d {
  readonly splatId: number; readonly position: Vec3; readonly scale: Vec3;
  readonly rotationQuat: Vec4; readonly opacity: number; readonly baseColorRgb: Vec3;
}

export interface SplatCameraParams {
  readonly position: Vec3; readonly forward: Vec3; readonly up?: Vec3;
  readonly verticalFovDeg: number; readonly nearPlane: number; readonly farPlane: number;
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
}

export interface SplatSortOptions {
  readonly keyBitWidth?: RadixKeyBitWidth;
  readonly minOpacityThreshold?: number; readonly maxScreenRadiusPx?: number;
}

export interface ProjectedGaussianSplat {
  readonly splatId: number; readonly sourceIndex: number; readonly viewDepth: number; readonly sortKey: number;
  readonly screenX: number; readonly screenY: number;
  readonly cov2d: readonly [number, number, number]; readonly screenRadiusPx: number;
  readonly boundsPx: readonly [number, number, number, number]; readonly opacity: number;
}

export interface SplatSortResult {
  readonly keyBitWidth: RadixKeyBitWidth; readonly totalInputSplats: number;
  readonly visibleCount: number; readonly culledCount: number;
  readonly sortedSourceIndices: Uint32Array; readonly sortedDepths: Float32Array; readonly sortedKeys: Uint32Array;
  readonly projectedSplats: readonly ProjectedGaussianSplat[];
  readonly sortLatencyMs: number; readonly radixPassCount: 2 | 4; readonly serverCostKrw: 0;
}

export interface Npr3dgsCompositeOptions {
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly celBandCount?: number; readonly inkEdgeThreshold?: number; readonly inkThicknessPx?: number;
  readonly screentoneFrequency?: number; readonly screentoneShadowCutoff?: number; readonly inkLuminance?: number;
}

export interface Npr3dgsPassDescriptor {
  readonly passName: "toonstudio-3dgs-npr-composite";
  readonly entryPoint: "cs_splat_npr_composite";
  readonly workgroupSize: readonly [8, 8, 1];
  readonly dispatchWorkgroups: readonly [number, number, 1];
  readonly uniformBytes: 48; readonly uniformBufferData: Float32Array; readonly wgslSource: string;
  readonly bindGroupEntries: ReadonlyArray<{
    readonly binding: number;
    readonly resourceKind: "uniform" | "storage-read" | "storage-texture-write";
    readonly label: string;
  }>;
  readonly serverCostKrw: 0;
}

/** 3DGS 깊이·색상·가중 법선 버퍼를 셀 셰이딩 + Sobel 잉크선 + 절차적 스크린톤으로 변환하는 WGSL 셰이더. */
export const WGSL_3DGS_NPR_COMPOSITE = /* wgsl */ `
struct NprCompositeUniforms {
  viewport_size      : vec2<f32>,
  cel_band_count     : f32,
  ink_edge_threshold : f32,
  ink_thickness_px   : f32,
  screentone_freq    : f32,
  screentone_cutoff  : f32,
  ink_luminance      : f32,
  depth_edge_weight  : f32,
  normal_edge_weight : f32,
  _pad0              : f32,
  _pad1              : f32,
};

struct SplatPixelSample {
  color_alpha  : vec4<f32>,
  normal_depth : vec4<f32>,
};

@group(0) @binding(0) var<uniform> params : NprCompositeUniforms;
@group(0) @binding(1) var<storage, read> splat_accum : array<SplatPixelSample>;
@group(0) @binding(2) var dst_npr_tex : texture_storage_2d<rgba8unorm, write>;

fn load_sample(ix : i32, iy : i32, w : i32, h : i32) -> SplatPixelSample {
  let cx = clamp(ix, 0, w - 1);
  let cy = clamp(iy, 0, h - 1);
  return splat_accum[u32(cy * w + cx)];
}

@compute @workgroup_size(8, 8, 1)
fn cs_splat_npr_composite(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(params.viewport_size.x);
  let h = i32(params.viewport_size.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) { return; }

  let center = load_sample(x, y, w, h);
  let step = max(1, i32(round(params.ink_thickness_px)));
  let s_l = load_sample(x - step, y, w, h);
  let s_r = load_sample(x + step, y, w, h);
  let s_u = load_sample(x, y - step, w, h);
  let s_d = load_sample(x, y + step, w, h);

  let depth_grad = abs(s_r.normal_depth.w - s_l.normal_depth.w) + abs(s_d.normal_depth.w - s_u.normal_depth.w);
  let norm_grad = length(s_r.normal_depth.xyz - s_l.normal_depth.xyz) + length(s_d.normal_depth.xyz - s_u.normal_depth.xyz);
  let edge_energy = depth_grad * params.depth_edge_weight + norm_grad * params.normal_edge_weight;
  let ink_mask = smoothstep(params.ink_edge_threshold * 0.7, params.ink_edge_threshold, edge_energy);

  let base_rgb = center.color_alpha.rgb;
  let luma = dot(base_rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let bands = max(2.0, params.cel_band_count);
  let cel_luma = floor(clamp(luma, 0.0, 0.999) * bands) / (bands - 1.0);
  var stylized = clamp(base_rgb * mix(1.0, cel_luma / max(luma, 0.001), 0.85), vec3<f32>(0.0), vec3<f32>(1.0));

  let angle = 0.78539816;
  let fx = f32(x) * cos(angle) - f32(y) * sin(angle);
  let fy = f32(x) * sin(angle) + f32(y) * cos(angle);
  if (cel_luma < params.screentone_cutoff && sin(fx * params.screentone_freq) * sin(fy * params.screentone_freq) > 0.35) {
    stylized = stylized * 0.76;
  }
  let final_rgb = mix(stylized, vec3<f32>(params.ink_luminance), ink_mask);
  textureStore(dst_npr_tex, vec2<i32>(x, y), vec4<f32>(final_rgb, clamp(center.color_alpha.a, 0.0, 1.0)));
}
`;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}
function clamp(v: number, min: number, max: number): number { return v < min ? min : v > max ? max : v; }
function nextPowerOfTwoFrames(requested: number): number {
  let cap = AUDIO_WORKLET_QUANTUM_FRAMES * 4;
  const target = Math.max(cap, Math.floor(requested));
  while (cap < target && cap < 1 << 20) { cap <<= 1; }
  return cap;
}
function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer === "function" && typeof Atomics === "object";
}
function isSharedBufferInstance(buffer: ArrayBufferLike): boolean {
  return typeof SharedArrayBuffer === "function" && buffer instanceof SharedArrayBuffer;
}

/**
 * 128샘플 Web Audio 퀀텀(48kHz · 2.67ms) 기준 Lock-Free SPSC `SharedArrayBuffer`(`Atomics`)
 * 스테레오/모노(인터리브·플래너) 링 버퍼. non-SAB 환경에서는 `ArrayBuffer`로 자동 폴백한다.
 */
export class SubMsAudioWorkletRingBuffer {
  public readonly buffer: ArrayBufferLike;
  public readonly usesSharedArrayBuffer: boolean;
  public readonly capacityFrames: number;
  public readonly channelCount: 1 | 2;
  public readonly sampleRateHz: number;
  public readonly layout: AudioBufferChannelLayout;

  private readonly ctrl: Int32Array;
  private readonly pcm: Float32Array;
  private readonly capacityMask: number;
  private lastWriteLatencyMs = 0; private maxWriteLatencyMs = 0;
  private lastVideoTimelineMs = 0; private lastAvOffsetMs = 0; private smoothedDriftPpm = 0;
  private hasSyncAnchor = false; private anchorVideoMs = 0; private anchorAudioMs = 0;

  private constructor(
    buffer: ArrayBufferLike, usesShared: boolean, capacityFrames: number,
    channelCount: 1 | 2, sampleRateHz: number, layout: AudioBufferChannelLayout,
  ) {
    this.buffer = buffer; this.usesSharedArrayBuffer = usesShared;
    this.capacityFrames = capacityFrames; this.capacityMask = capacityFrames - 1;
    this.channelCount = channelCount; this.sampleRateHz = sampleRateHz; this.layout = layout;
    this.ctrl = new Int32Array(buffer, 0, RING_CONTROL_HEADER_INT32_COUNT);
    this.pcm = new Float32Array(buffer, RING_CONTROL_HEADER_BYTES, capacityFrames * channelCount);
  }

  public static create(options: AudioWorkletRingBufferOptions = {}): SubMsAudioWorkletRingBuffer {
    const capacityFrames = nextPowerOfTwoFrames(options.capacityFrames ?? AUDIO_WORKLET_QUANTUM_FRAMES * 16);
    const channelCount: 1 | 2 = options.channelCount === 1 ? 1 : 2;
    const sampleRateHz = Math.max(8000, Math.round(options.sampleRateHz ?? DEFAULT_AUDIO_SAMPLE_RATE_HZ));
    const layout: AudioBufferChannelLayout = options.layout ?? "interleaved";
    const useSab = !options.forceFallbackArrayBuffer && isSharedArrayBufferSupported();
    const totalBytes = RING_CONTROL_HEADER_BYTES + capacityFrames * channelCount * 4;
    const buffer: ArrayBufferLike = useSab ? new SharedArrayBuffer(totalBytes) : new ArrayBuffer(totalBytes);
    const ctrl = new Int32Array(buffer, 0, RING_CONTROL_HEADER_INT32_COUNT);
    ctrl.fill(0);
    ctrl[CTRL_CAPACITY_FRAMES] = capacityFrames; ctrl[CTRL_CHANNEL_COUNT] = channelCount;
    ctrl[CTRL_LAYOUT_CODE] = layout === "planar" ? 1 : 0; ctrl[CTRL_SAMPLE_RATE] = sampleRateHz;
    return new SubMsAudioWorkletRingBuffer(buffer, useSab, capacityFrames, channelCount, sampleRateHz, layout);
  }

  /** AudioWorkletProcessor 스레드 측에서 기존 `SharedArrayBuffer`에 제로카피 연결한다. */
  public static attach(buffer: ArrayBufferLike): SubMsAudioWorkletRingBuffer {
    if (buffer.byteLength < RING_CONTROL_HEADER_BYTES + AUDIO_WORKLET_QUANTUM_FRAMES * 4) {
      throw new RangeError("AudioWorklet 링 버퍼 헤더 크기가 유효하지 않습니다.");
    }
    const ctrl = new Int32Array(buffer, 0, RING_CONTROL_HEADER_INT32_COUNT);
    const usesSab = isSharedBufferInstance(buffer);
    const readMeta = (idx: number): number => (usesSab ? Atomics.load(ctrl, idx) : ctrl[idx]);
    const capacityFrames = readMeta(CTRL_CAPACITY_FRAMES);
    if (capacityFrames < AUDIO_WORKLET_QUANTUM_FRAMES || (capacityFrames & (capacityFrames - 1)) !== 0) {
      throw new RangeError(`링 버퍼 용량은 2의 거듭제곱 프레임이어야 합니다: ${capacityFrames}`);
    }
    return new SubMsAudioWorkletRingBuffer(
      buffer, usesSab, capacityFrames, readMeta(CTRL_CHANNEL_COUNT) === 1 ? 1 : 2,
      readMeta(CTRL_SAMPLE_RATE), readMeta(CTRL_LAYOUT_CODE) === 1 ? "planar" : "interleaved",
    );
  }

  private loadCtrl(idx: number): number { return this.usesSharedArrayBuffer ? Atomics.load(this.ctrl, idx) : this.ctrl[idx]; }
  private storeCtrl(idx: number, val: number): void {
    if (this.usesSharedArrayBuffer) { Atomics.store(this.ctrl, idx, val | 0); } else { this.ctrl[idx] = val | 0; }
  }
  private addCtrl(idx: number, delta: number): void {
    if (this.usesSharedArrayBuffer) { Atomics.add(this.ctrl, idx, delta | 0); } else { this.ctrl[idx] = (this.ctrl[idx] + delta) | 0; }
  }

  public getAvailableReadFrames(): number { return (this.loadCtrl(CTRL_WRITE_CURSOR) - this.loadCtrl(CTRL_READ_CURSOR)) & this.capacityMask; }
  public getAvailableWriteFrames(): number { return this.capacityFrames - 1 - this.getAvailableReadFrames(); }

  private finalizeWrite(t0: number, writeCursor: number, used: number, toWrite: number, dropped: number): RingWriteResult {
    if (toWrite > 0) {
      this.storeCtrl(CTRL_WRITE_CURSOR, (writeCursor + toWrite) & this.capacityMask);
      this.addCtrl(CTRL_TOTAL_WRITTEN, toWrite);
    }
    if (dropped > 0) { this.addCtrl(CTRL_OVERRUN_COUNT, 1); }
    const writeLatencyMs = Number(Math.max(0, nowMs() - t0).toFixed(4));
    this.lastWriteLatencyMs = writeLatencyMs;
    this.maxWriteLatencyMs = Math.max(this.maxWriteLatencyMs, writeLatencyMs);
    return { framesWritten: toWrite, framesDropped: dropped, overrun: dropped > 0, writeLatencyMs, availableReadFrames: used + toWrite };
  }

  /** 인터리브 PCM(`[L0, R0, L1, R1, ...]`)을 Lock-Free로 기록한다. */
  public writeInterleaved(samples: Float32Array, frameOffset = 0, frameCount?: number): RingWriteResult {
    const t0 = nowMs();
    const ch = this.channelCount;
    const totalInput = Math.floor(samples.length / ch);
    const requested = Math.max(0, Math.min(totalInput - frameOffset, frameCount ?? totalInput - frameOffset));
    const wCur = this.loadCtrl(CTRL_WRITE_CURSOR);
    const used = (wCur - this.loadCtrl(CTRL_READ_CURSOR)) & this.capacityMask;
    const toWrite = Math.min(requested, this.capacityFrames - 1 - used);

    if (toWrite > 0) {
      const firstPart = Math.min(toWrite, this.capacityFrames - wCur);
      const secondPart = toWrite - firstPart;
      if (this.layout === "interleaved") {
        const srcStart = frameOffset * ch;
        this.pcm.set(samples.subarray(srcStart, srcStart + firstPart * ch), wCur * ch);
        if (secondPart > 0) { this.pcm.set(samples.subarray(srcStart + firstPart * ch, srcStart + toWrite * ch), 0); }
      } else {
        for (let i = 0; i < toWrite; i += 1) {
          const dstFrame = (wCur + i) & this.capacityMask;
          const srcBase = (frameOffset + i) * ch;
          for (let c = 0; c < ch; c += 1) { this.pcm[c * this.capacityFrames + dstFrame] = samples[srcBase + c]; }
        }
      }
    }
    return this.finalizeWrite(t0, wCur, used, toWrite, requested - toWrite);
  }

  /** 채널별 플래너 배열(`[leftCh, rightCh]`)을 Lock-Free로 기록한다. */
  public writePlanar(channelBuffers: readonly Float32Array[], frameOffset = 0, frameCount?: number): RingWriteResult {
    const t0 = nowMs();
    const ch = this.channelCount;
    if (channelBuffers.length < ch) { throw new RangeError(`채널 버퍼 수(${channelBuffers.length})가 부족합니다.`); }
    const minLen = ch === 2 ? Math.min(channelBuffers[0].length, channelBuffers[1].length) : channelBuffers[0].length;
    const requested = Math.max(0, Math.min(minLen - frameOffset, frameCount ?? minLen - frameOffset));
    const wCur = this.loadCtrl(CTRL_WRITE_CURSOR);
    const used = (wCur - this.loadCtrl(CTRL_READ_CURSOR)) & this.capacityMask;
    const toWrite = Math.min(requested, this.capacityFrames - 1 - used);

    if (toWrite > 0) {
      const firstPart = Math.min(toWrite, this.capacityFrames - wCur);
      const secondPart = toWrite - firstPart;
      if (this.layout === "planar") {
        for (let c = 0; c < ch; c += 1) {
          const base = c * this.capacityFrames;
          this.pcm.set(channelBuffers[c].subarray(frameOffset, frameOffset + firstPart), base + wCur);
          if (secondPart > 0) { this.pcm.set(channelBuffers[c].subarray(frameOffset + firstPart, frameOffset + toWrite), base); }
        }
      } else {
        for (let i = 0; i < toWrite; i += 1) {
          const dstBase = ((wCur + i) & this.capacityMask) * ch;
          for (let c = 0; c < ch; c += 1) { this.pcm[dstBase + c] = channelBuffers[c][frameOffset + i]; }
        }
      }
    }
    return this.finalizeWrite(t0, wCur, used, toWrite, requested - toWrite);
  }

  /** 128샘플 퀀텀(기본)을 인터리브 출력 버퍼로 제로할당 읽기한다. 부족 구간은 무음(0)으로 채운다. */
  public readQuantumInterleaved(outInterleaved: Float32Array, frameCount = AUDIO_WORKLET_QUANTUM_FRAMES): RingReadResult {
    const ch = this.channelCount;
    const requested = Math.min(frameCount, Math.floor(outInterleaved.length / ch));
    const rCur = this.loadCtrl(CTRL_READ_CURSOR);
    const avail = (this.loadCtrl(CTRL_WRITE_CURSOR) - rCur) & this.capacityMask;
    const toRead = Math.min(requested, avail);
    const zeroFilled = requested - toRead;

    if (toRead > 0) {
      const firstPart = Math.min(toRead, this.capacityFrames - rCur);
      const secondPart = toRead - firstPart;
      if (this.layout === "interleaved") {
        outInterleaved.set(this.pcm.subarray(rCur * ch, (rCur + firstPart) * ch), 0);
        if (secondPart > 0) { outInterleaved.set(this.pcm.subarray(0, secondPart * ch), firstPart * ch); }
      } else {
        for (let i = 0; i < toRead; i += 1) {
          const srcFrame = (rCur + i) & this.capacityMask;
          const outBase = i * ch;
          for (let c = 0; c < ch; c += 1) { outInterleaved[outBase + c] = this.pcm[c * this.capacityFrames + srcFrame]; }
        }
      }
      this.storeCtrl(CTRL_READ_CURSOR, (rCur + toRead) & this.capacityMask);
      this.addCtrl(CTRL_TOTAL_READ, toRead);
    }
    if (zeroFilled > 0) {
      outInterleaved.fill(0, toRead * ch, requested * ch);
      this.addCtrl(CTRL_UNDERRUN_COUNT, 1);
    }
    return { framesRead: toRead, framesZeroFilled: zeroFilled, underrun: zeroFilled > 0, availableReadFrames: avail - toRead };
  }

  /** 128샘플 퀀텀(기본)을 `AudioWorkletProcessor` 플래너 출력 채널로 제로할당 복사한다. */
  public readQuantumPlanar(outChannels: readonly Float32Array[], frameCount = AUDIO_WORKLET_QUANTUM_FRAMES): RingReadResult {
    const ch = this.channelCount;
    if (outChannels.length < ch) { throw new RangeError(`출력 채널 배열 수(${outChannels.length})가 부족합니다.`); }
    const maxCap = ch === 2 ? Math.min(outChannels[0].length, outChannels[1].length) : outChannels[0].length;
    const requested = Math.min(frameCount, maxCap);
    const rCur = this.loadCtrl(CTRL_READ_CURSOR);
    const avail = (this.loadCtrl(CTRL_WRITE_CURSOR) - rCur) & this.capacityMask;
    const toRead = Math.min(requested, avail);
    const zeroFilled = requested - toRead;

    if (toRead > 0) {
      const firstPart = Math.min(toRead, this.capacityFrames - rCur);
      const secondPart = toRead - firstPart;
      if (this.layout === "planar") {
        for (let c = 0; c < ch; c += 1) {
          const base = c * this.capacityFrames;
          outChannels[c].set(this.pcm.subarray(base + rCur, base + rCur + firstPart), 0);
          if (secondPart > 0) { outChannels[c].set(this.pcm.subarray(base, base + secondPart), firstPart); }
        }
      } else {
        for (let i = 0; i < toRead; i += 1) {
          const srcBase = ((rCur + i) & this.capacityMask) * ch;
          for (let c = 0; c < ch; c += 1) { outChannels[c][i] = this.pcm[srcBase + c]; }
        }
      }
      this.storeCtrl(CTRL_READ_CURSOR, (rCur + toRead) & this.capacityMask);
      this.addCtrl(CTRL_TOTAL_READ, toRead);
    }
    if (zeroFilled > 0) {
      for (let c = 0; c < ch; c += 1) { outChannels[c].fill(0, toRead, requested); }
      this.addCtrl(CTRL_UNDERRUN_COUNT, 1);
    }
    return { framesRead: toRead, framesZeroFilled: zeroFilled, underrun: zeroFilled > 0, availableReadFrames: avail - toRead };
  }

  /** 영상/스크롤 타임라인 기준 시각을 기록하고 A/V 클럭 드리프트(PPM)와 보정 재생률을 갱신한다. */
  public recordAvSyncObservation(videoTimelineMs: number): AvSyncTelemetry {
    const totalRead = this.loadCtrl(CTRL_TOTAL_READ);
    const audioClockMs = (totalRead / this.sampleRateHz) * 1000;
    if (!this.hasSyncAnchor) {
      this.hasSyncAnchor = true; this.anchorVideoMs = videoTimelineMs; this.anchorAudioMs = audioClockMs;
    } else {
      const elapsedVideo = videoTimelineMs - this.anchorVideoMs;
      if (elapsedVideo >= 20) {
        const instantPpm = clamp(((audioClockMs - this.anchorAudioMs - elapsedVideo) / elapsedVideo) * 1_000_000, -5000, 5000);
        this.smoothedDriftPpm = this.smoothedDriftPpm === 0 ? instantPpm : this.smoothedDriftPpm * 0.75 + instantPpm * 0.25;
      }
    }
    this.lastVideoTimelineMs = videoTimelineMs;
    this.lastAvOffsetMs = audioClockMs - videoTimelineMs;
    this.storeCtrl(CTRL_AV_VIDEO_MS_X100, Math.round(videoTimelineMs * 100));
    this.storeCtrl(CTRL_AV_AUDIO_FRAME, totalRead);
    this.storeCtrl(CTRL_DRIFT_PPM_X10, Math.round(this.smoothedDriftPpm * 10));
    return this.getAvSyncTelemetry();
  }

  public getAvSyncTelemetry(): AvSyncTelemetry {
    const availableReadFrames = this.getAvailableReadFrames();
    const totalFramesRead = this.loadCtrl(CTRL_TOTAL_READ);
    const audioClockMs = (totalFramesRead / this.sampleRateHz) * 1000;
    const driftPpm = this.hasSyncAnchor ? this.smoothedDriftPpm : this.loadCtrl(CTRL_DRIFT_PPM_X10) / 10;
    const offsetMs = this.hasSyncAnchor ? this.lastAvOffsetMs : audioClockMs - this.loadCtrl(CTRL_AV_VIDEO_MS_X100) / 100;
    const recommendedPlaybackRate = Number(
      clamp(1 - driftPpm / 1_000_000 - clamp(offsetMs, -20, 20) * 0.00015, 0.995, 1.005).toFixed(6),
    );
    return {
      usesSharedArrayBuffer: this.usesSharedArrayBuffer, layout: this.layout,
      sampleRateHz: this.sampleRateHz, channelCount: this.channelCount, capacityFrames: this.capacityFrames,
      quantumFrames: AUDIO_WORKLET_QUANTUM_FRAMES,
      quantumDurationMs: Number(((AUDIO_WORKLET_QUANTUM_FRAMES / this.sampleRateHz) * 1000).toFixed(4)),
      availableReadFrames, availableWriteFrames: this.capacityFrames - 1 - availableReadFrames,
      fillRatio01: Number((availableReadFrames / (this.capacityFrames - 1)).toFixed(4)),
      totalFramesWritten: this.loadCtrl(CTRL_TOTAL_WRITTEN), totalFramesRead,
      underrunCount: this.loadCtrl(CTRL_UNDERRUN_COUNT), overrunCount: this.loadCtrl(CTRL_OVERRUN_COUNT),
      audioClockMs: Number(audioClockMs.toFixed(3)), lastVideoTimelineMs: Number(this.lastVideoTimelineMs.toFixed(3)),
      avOffsetMs: Number(offsetMs.toFixed(3)), estimatedDriftPpm: Number(driftPpm.toFixed(2)),
      recommendedPlaybackRate, lastWriteLatencyMs: this.lastWriteLatencyMs, maxWriteLatencyMs: this.maxWriteLatencyMs,
      serverCostKrw: 0,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* WebGPU 3D Gaussian Splatting(3DGS) Radix 깊이 정렬 & NPR 선화/톤 변환 브리지 */
/* -------------------------------------------------------------------------- */

const FLOAT_SCRATCH = new Float32Array(1);
const UINT_SCRATCH = new Uint32Array(FLOAT_SCRATCH.buffer);

/** IEEE-754 float32를 뒤→앞(내림차순 깊이) 정렬용 단조 uint32 키로 변환한다. */
function encodeDescendingDepthKey32(depth: number): number {
  FLOAT_SCRATCH[0] = depth;
  const bits = UINT_SCRATCH[0];
  const ascending = (bits ^ ((bits & 0x80000000) !== 0 ? 0xffffffff : 0x80000000)) >>> 0;
  return (~ascending) >>> 0;
}

/** `[nearPlane, farPlane]` 깊이를 뒤→앞(내림차순) 16비트 키(`0..65535`)로 양자화한다. */
function encodeDescendingDepthKey16(depth: number, nearPlane: number, farPlane: number): number {
  const t = clamp((depth - nearPlane) / Math.max(1e-5, farPlane - nearPlane), 0, 1);
  return (65535 - Math.round(t * 65535)) & 0xffff;
}

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len <= 1e-8 ? [0, 0, -1] : [v[0] / len, v[1] / len, v[2] / len];
}
function cross3(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** 3D 가우시안 공분산(`R·S·S^T·R^T`)을 원근 야코비안으로 투영해 2D EWA 공분산과 3σ 픽셀 반지름을 계산한다. */
function projectCovariance2d(
  scale: Vec3, quat: Vec4, right: Vec3, up: Vec3, forward: Vec3,
  vx: number, vy: number, vz: number, focalX: number, focalY: number, maxRadiusPx: number,
): { readonly cov2d: readonly [number, number, number]; readonly radiusPx: number } {
  const invQ = 1 / Math.max(1e-8, Math.hypot(quat[0], quat[1], quat[2], quat[3]));
  const qx = quat[0] * invQ; const qy = quat[1] * invQ; const qz = quat[2] * invQ; const qw = quat[3] * invQ;
  const sx = Math.max(1e-4, Math.abs(scale[0])); const sy = Math.max(1e-4, Math.abs(scale[1])); const sz = Math.max(1e-4, Math.abs(scale[2]));

  const m00 = (1 - 2 * (qy * qy + qz * qz)) * sx; const m01 = 2 * (qx * qy - qz * qw) * sy; const m02 = 2 * (qx * qz + qy * qw) * sz;
  const m10 = 2 * (qx * qy + qz * qw) * sx; const m11 = (1 - 2 * (qx * qx + qz * qz)) * sy; const m12 = 2 * (qy * qz - qx * qw) * sz;
  const m20 = 2 * (qx * qz - qy * qw) * sx; const m21 = 2 * (qy * qz + qx * qw) * sy; const m22 = (1 - 2 * (qx * qx + qy * qy)) * sz;

  const vm00 = right[0] * m00 + right[1] * m10 + right[2] * m20; const vm01 = right[0] * m01 + right[1] * m11 + right[2] * m21; const vm02 = right[0] * m02 + right[1] * m12 + right[2] * m22;
  const vm10 = up[0] * m00 + up[1] * m10 + up[2] * m20; const vm11 = up[0] * m01 + up[1] * m11 + up[2] * m21; const vm12 = up[0] * m02 + up[1] * m12 + up[2] * m22;
  const vm20 = forward[0] * m00 + forward[1] * m10 + forward[2] * m20; const vm21 = forward[0] * m01 + forward[1] * m11 + forward[2] * m21; const vm22 = forward[0] * m02 + forward[1] * m12 + forward[2] * m22;

  const invZ = 1 / Math.max(0.05, vz);
  const invZ2 = invZ * invZ;
  const j00 = focalX * invZ; const j02 = -focalX * clamp(vx * invZ, -1.5, 1.5) * vz * invZ2;
  const j11 = -focalY * invZ; const j12 = focalY * clamp(vy * invZ, -1.5, 1.5) * vz * invZ2;

  const t00 = j00 * vm00 + j02 * vm20; const t01 = j00 * vm01 + j02 * vm21; const t02 = j00 * vm02 + j02 * vm22;
  const t10 = j11 * vm10 + j12 * vm20; const t11 = j11 * vm11 + j12 * vm21; const t12 = j11 * vm12 + j12 * vm22;

  const covXX = t00 * t00 + t01 * t01 + t02 * t02 + 0.3;
  const covXY = t00 * t10 + t01 * t11 + t02 * t12;
  const covYY = t10 * t10 + t11 * t11 + t12 * t12 + 0.3;
  const mid = 0.5 * (covXX + covYY);
  const disc = Math.sqrt(Math.max(0, mid * mid - Math.max(0.01, covXX * covYY - covXY * covXY)));
  return {
    cov2d: [Number(covXX.toFixed(4)), Number(covXY.toFixed(4)), Number(covYY.toFixed(4))],
    radiusPx: clamp(Math.ceil(3 * Math.sqrt(Math.max(0.3, mid + disc))), 1, maxRadiusPx),
  };
}

/** 256-버킷 LSB Radix 안정 정렬(16비트 2패스 / 32비트 4패스, O(n) 선형 시간). */
function radixSortKeyValuePairs(
  keysIn: Uint32Array, valsIn: Uint32Array, count: number, passCount: 2 | 4,
): { readonly keys: Uint32Array; readonly values: Uint32Array } {
  let srcKeys: Uint32Array = keysIn; let srcVals: Uint32Array = valsIn;
  let dstKeys: Uint32Array = new Uint32Array(count); let dstVals: Uint32Array = new Uint32Array(count);
  const hist = new Uint32Array(256);

  for (let pass = 0; pass < passCount; pass += 1) {
    const shift = pass * 8;
    hist.fill(0);
    for (let i = 0; i < count; i += 1) { hist[(srcKeys[i] >>> shift) & 0xff] += 1; }
    let sum = 0;
    for (let b = 0; b < 256; b += 1) { const c = hist[b]; hist[b] = sum; sum += c; }
    for (let i = 0; i < count; i += 1) {
      const k = srcKeys[i];
      const bucket = (k >>> shift) & 0xff;
      const pos = hist[bucket];
      hist[bucket] = pos + 1;
      dstKeys[pos] = k;
      dstVals[pos] = srcVals[i];
    }
    const tmpK = srcKeys; srcKeys = dstKeys; dstKeys = tmpK;
    const tmpV = srcVals; srcVals = dstVals; dstVals = tmpV;
  }
  return { keys: srcKeys, values: srcVals };
}

/**
 * 3D Gaussian Splats에 뷰 프러스텀 컬링, 2D 공분산 스크린 투영,
 * 16/32비트 결정론 LSB Radix 뒤→앞(Back-to-Front) 깊이 정렬을 수행한다.
 */
export function sort3dgsSplatsByCameraDepth(
  splats: readonly GaussianSplat3d[],
  camera: SplatCameraParams,
  options: SplatSortOptions = {},
): SplatSortResult {
  const t0 = nowMs();
  const keyBitWidth: RadixKeyBitWidth = options.keyBitWidth ?? 32;
  const radixPassCount: 2 | 4 = keyBitWidth === 16 ? 2 : 4;
  const minOpacity = clamp(options.minOpacityThreshold ?? 0.01, 0, 1);
  const maxRadiusPx = Math.max(8, Math.round(options.maxScreenRadiusPx ?? 512));

  const forward = norm3(camera.forward);
  const rawRight = cross3(forward, norm3(camera.up ?? [0, 1, 0]));
  const right = Math.hypot(rawRight[0], rawRight[1], rawRight[2]) > 1e-6 ? norm3(rawRight) : norm3(cross3(forward, [1, 0, 0]));
  const up = norm3(cross3(right, forward));

  const vw = Math.max(1, camera.viewportWidthPx);
  const vh = Math.max(1, camera.viewportHeightPx);
  const nearPlane = Math.max(0.01, camera.nearPlane);
  const farPlane = Math.max(nearPlane + 0.5, camera.farPlane);
  const focal = vh / (2 * Math.tan(((clamp(camera.verticalFovDeg, 10, 160) * Math.PI) / 180) * 0.5));

  const visibleDrafts: ProjectedGaussianSplat[] = [];
  for (let i = 0; i < splats.length; i += 1) {
    const s = splats[i];
    if (s.opacity < minOpacity) { continue; }
    const rel: Vec3 = [s.position[0] - camera.position[0], s.position[1] - camera.position[1], s.position[2] - camera.position[2]];
    const vz = dot3(rel, forward);
    if (vz < nearPlane || vz > farPlane) { continue; }
    const vx = dot3(rel, right);
    const vy = dot3(rel, up);
    const screenX = (vx * focal) / vz + vw * 0.5;
    const screenY = vh * 0.5 - (vy * focal) / vz;
    const { cov2d, radiusPx } = projectCovariance2d(s.scale, s.rotationQuat, right, up, forward, vx, vy, vz, focal, focal, maxRadiusPx);
    const minX = Math.floor(screenX - radiusPx); const maxX = Math.ceil(screenX + radiusPx);
    const minY = Math.floor(screenY - radiusPx); const maxY = Math.ceil(screenY + radiusPx);
    if (maxX < 0 || minX >= vw || maxY < 0 || minY >= vh) { continue; }

    visibleDrafts.push({
      splatId: s.splatId, sourceIndex: i, viewDepth: Number(vz.toFixed(6)),
      sortKey: keyBitWidth === 16 ? encodeDescendingDepthKey16(vz, nearPlane, farPlane) : encodeDescendingDepthKey32(vz),
      screenX: Number(screenX.toFixed(2)), screenY: Number(screenY.toFixed(2)),
      cov2d, screenRadiusPx: radiusPx,
      boundsPx: [clamp(minX, 0, vw), clamp(minY, 0, vh), clamp(maxX, 0, vw), clamp(maxY, 0, vh)],
      opacity: clamp(s.opacity, 0, 1),
    });
  }

  const visibleCount = visibleDrafts.length;
  const rawKeys = new Uint32Array(visibleCount);
  const rawIdx = new Uint32Array(visibleCount);
  for (let i = 0; i < visibleCount; i += 1) { rawKeys[i] = visibleDrafts[i].sortKey; rawIdx[i] = i; }

  const sorted = visibleCount > 1
    ? radixSortKeyValuePairs(rawKeys, rawIdx, visibleCount, radixPassCount)
    : { keys: rawKeys, values: rawIdx };

  const sortedSourceIndices = new Uint32Array(visibleCount);
  const sortedDepths = new Float32Array(visibleCount);
  const projectedSplats: ProjectedGaussianSplat[] = new Array<ProjectedGaussianSplat>(visibleCount);
  for (let i = 0; i < visibleCount; i += 1) {
    const draft = visibleDrafts[sorted.values[i]];
    sortedSourceIndices[i] = draft.sourceIndex;
    sortedDepths[i] = draft.viewDepth;
    projectedSplats[i] = draft;
  }

  return {
    keyBitWidth, totalInputSplats: splats.length, visibleCount, culledCount: splats.length - visibleCount,
    sortedSourceIndices, sortedDepths, sortedKeys: sorted.keys, projectedSplats,
    sortLatencyMs: Number(Math.max(0, nowMs() - t0).toFixed(4)), radixPassCount, serverCostKrw: 0,
  };
}

/** 3DGS 배경을 웹툰 셀/잉크/스크린톤 NPR 패스로 합성하기 위한 WebGPU 디스크립터를 생성한다. */
export function create3dgsNprPassDescriptor(options: Npr3dgsCompositeOptions): Npr3dgsPassDescriptor {
  const vw = Math.max(1, Math.round(options.viewportWidthPx));
  const vh = Math.max(1, Math.round(options.viewportHeightPx));
  const uniformBufferData = new Float32Array([
    vw, vh, clamp(options.celBandCount ?? 4, 2, 8), clamp(options.inkEdgeThreshold ?? 0.22, 0.02, 2.0),
    clamp(options.inkThicknessPx ?? 1.5, 1, 4), clamp(options.screentoneFrequency ?? 0.65, 0.1, 4.0),
    clamp(options.screentoneShadowCutoff ?? 0.42, 0.05, 0.9), clamp(options.inkLuminance ?? 0.06, 0, 0.35),
    1.15, 0.85, 0, 0,
  ]);
  return {
    passName: "toonstudio-3dgs-npr-composite", entryPoint: "cs_splat_npr_composite",
    workgroupSize: [8, 8, 1], dispatchWorkgroups: [Math.ceil(vw / 8), Math.ceil(vh / 8), 1],
    uniformBytes: 48, uniformBufferData, wgslSource: WGSL_3DGS_NPR_COMPOSITE,
    bindGroupEntries: [
      { binding: 0, resourceKind: "uniform", label: "npr-composite-uniforms" },
      { binding: 1, resourceKind: "storage-read", label: "splat-accum-buffer" },
      { binding: 2, resourceKind: "storage-texture-write", label: "npr-output-rgba8" },
    ],
    serverCostKrw: 0,
  };
}

/** WebGPU 3DGS 뷰포트 스플랫 정렬 및 웹툰 NPR 선화/톤 변환기 클래스 래퍼. */
export class WebGpu3dgsSplatSorter {
  private readonly defaultOptions: SplatSortOptions;
  public constructor(defaultOptions: SplatSortOptions = {}) { this.defaultOptions = defaultOptions; }
  public sortForCamera(splats: readonly GaussianSplat3d[], camera: SplatCameraParams, overrideOptions?: SplatSortOptions): SplatSortResult {
    return sort3dgsSplatsByCameraDepth(splats, camera, { ...this.defaultOptions, ...overrideOptions });
  }
  public buildNprCompositePass(options: Npr3dgsCompositeOptions): Npr3dgsPassDescriptor {
    return create3dgsNprPassDescriptor(options);
  }
}
