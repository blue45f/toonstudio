/**
 * 오디오툰 타임라인 시퀀서 · Wave-3 Rust 오디오 DSP 스테레오 PCM 패킷화기 · MP4/WebM 먹싱 청크 수집기.
 *
 * - 9:16 릴스/쇼츠(`1080×1920 @ 60fps`) · 16:9 와이드(`1920×1080 @ 60fps`) 프리셋
 * - 컷→프레임 Ken Burns 팬/줌 이징 · 말풍선 타이밍 리빌 · 컷/페이드/크로스페이드 전환
 * - Wave-3 Rust `audio_dsp_mixer_kernel.rs` 평면 스테레오(`left`/`right Float32Array`) PCM 패킷화
 * - MP4(Annex-B/`ftypisom`) · WebM(EBML `0x1A45DFA3`) 먹싱 준비 청크 수집 및 A/V 싱크 리포트
 */

export type AudioToonPresetId =
  | "reels-9x16-1080p60"
  | "landscape-16x9-1080p60"
  | "reels-9x16-720p30"
  | "landscape-16x9-720p30";

export type AudioToonVideoCodecFamily = "h264" | "vp9" | "av1";
export type AudioToonAudioCodecFamily = "aac" | "opus";
export type AudioToonContainerFormat = "mp4" | "webm";
export type KenBurnsEasingKind = "linear" | "ease-in-out-cubic" | "ease-out-quart" | "ease-in-out-sine";
export type CutTransitionKind = "cut" | "fade" | "crossfade";
export type BalloonRevealStyle = "pop" | "fade" | "typewriter";

export interface AudioToonExportPreset {
  readonly id: AudioToonPresetId; readonly labelKo: string; readonly aspectRatio: "9:16" | "16:9";
  readonly width: number; readonly height: number; readonly fps: number;
  readonly videoBitrateBps: number; readonly audioSampleRate: number;
  readonly audioChannels: 2; readonly audioBitrateBps: number;
}

export const AUDIOTOON_EXPORT_PRESETS: Readonly<Record<AudioToonPresetId, AudioToonExportPreset>> = {
  "reels-9x16-1080p60": {
    id: "reels-9x16-1080p60", labelKo: "9:16 릴스·쇼츠 풀HD 60fps", aspectRatio: "9:16",
    width: 1080, height: 1920, fps: 60, videoBitrateBps: 12_000_000,
    audioSampleRate: 48_000, audioChannels: 2, audioBitrateBps: 192_000,
  },
  "landscape-16x9-1080p60": {
    id: "landscape-16x9-1080p60", labelKo: "16:9 와이드 풀HD 60fps", aspectRatio: "16:9",
    width: 1920, height: 1080, fps: 60, videoBitrateBps: 12_000_000,
    audioSampleRate: 48_000, audioChannels: 2, audioBitrateBps: 192_000,
  },
  "reels-9x16-720p30": {
    id: "reels-9x16-720p30", labelKo: "9:16 초안 HD 30fps", aspectRatio: "9:16",
    width: 720, height: 1280, fps: 30, videoBitrateBps: 5_000_000,
    audioSampleRate: 48_000, audioChannels: 2, audioBitrateBps: 128_000,
  },
  "landscape-16x9-720p30": {
    id: "landscape-16x9-720p30", labelKo: "16:9 초안 HD 30fps", aspectRatio: "16:9",
    width: 1280, height: 720, fps: 30, videoBitrateBps: 5_000_000,
    audioSampleRate: 48_000, audioChannels: 2, audioBitrateBps: 128_000,
  },
};

export interface EncodedMediaChunkLike {
  readonly type: "key" | "delta"; readonly timestamp: number;
  readonly duration?: number | null; readonly byteLength: number;
  copyTo(destination: Uint8Array): void;
}

export interface KenBurnsMotionSpec {
  readonly startScale: number; readonly endScale: number;
  readonly startPanX: number; readonly startPanY: number;
  readonly endPanX: number; readonly endPanY: number;
  readonly easing?: KenBurnsEasingKind;
}

export interface SpeechBalloonRevealSpec {
  readonly id: string; readonly text: string; readonly appearAtMs: number;
  readonly revealDurationMs: number; readonly disappearAtMs?: number;
  readonly style?: BalloonRevealStyle; readonly anchorX?: number; readonly anchorY?: number;
}

export interface CutTransitionSpec {
  readonly kind: CutTransitionKind;
  readonly durationMs: number;
}

export interface AudioToonCutSpec {
  readonly cutId: string; readonly durationMs: number;
  readonly kenBurns?: KenBurnsMotionSpec;
  readonly transitionIn?: CutTransitionSpec;
  readonly balloons?: readonly SpeechBalloonRevealSpec[];
}

export interface SampledBalloonState {
  readonly id: string; readonly visible: boolean; readonly revealProgress: number;
  readonly popScale: number; readonly revealedCharCount: number; readonly totalCharCount: number;
  readonly anchorX: number; readonly anchorY: number;
}

export interface TimelineFrameSample {
  readonly frameIndex: number; readonly timestampUs: number; readonly durationUs: number;
  readonly timelineMs: number; readonly cutIndex: number; readonly cutId: string;
  readonly cutLocalMs: number; readonly cutProgress: number; readonly isKeyFrame: boolean;
  readonly scale: number; readonly panX: number; readonly panY: number;
  readonly opacity: number; readonly crossfadeFromCutId: string | null; readonly crossfadeMix: number;
  readonly balloons: readonly SampledBalloonState[];
}

export interface AudioToonTimelinePlan {
  readonly preset: AudioToonExportPreset; readonly totalDurationMs: number; readonly totalDurationUs: number;
  readonly totalFrames: number; readonly keyFrameIntervalFrames: number;
  readonly frames: readonly TimelineFrameSample[];
}

/** Wave-3 Rust 오디오 DSP(`audio_dsp_mixer_kernel.rs`) 스테레오 출력 버스 계약. */
export interface Wave3StereoPcmBus {
  readonly left: Float32Array; readonly right: Float32Array; readonly sampleRate: number;
  readonly integratedLufs?: number; readonly truePeakDbfs?: number;
}

export interface PcmStereoAudioPacket {
  readonly packetIndex: number; readonly timestampUs: number; readonly durationUs: number;
  readonly numberOfFrames: number; readonly validFrames: number; readonly sampleRate: number;
  readonly numberOfChannels: 2; readonly planarSamples: Float32Array;
  readonly peakLinear: number; readonly rmsLinear: number;
}

export interface PcmPacketizationSummary {
  readonly sampleRate: number; readonly framesPerPacket: number; readonly totalInputFrames: number;
  readonly totalDurationUs: number; readonly packetCount: number; readonly overallPeakLinear: number;
  readonly packets: readonly PcmStereoAudioPacket[];
}

export interface MuxCollectedChunk {
  readonly track: "video" | "audio"; readonly sequence: number; readonly isKeyFrame: boolean;
  readonly timestampUs: number; readonly durationUs: number;
  readonly byteOffsetInPayload: number; readonly byteLength: number; readonly data: Uint8Array;
}

export interface AudioVideoSyncReport {
  readonly videoEndTimestampUs: number; readonly audioEndTimestampUs: number;
  readonly driftUs: number; readonly maxAllowedDriftUs: number; readonly inSync: boolean;
}

export interface MuxReadyMediaPackage {
  readonly container: AudioToonContainerFormat; readonly videoCodec: string; readonly audioCodec: string | null;
  readonly width: number; readonly height: number; readonly fps: number;
  readonly containerHeaderBytes: Uint8Array; readonly chunks: readonly MuxCollectedChunk[];
  readonly videoKeyFrameByteOffsets: readonly number[];
  readonly totalVideoChunks: number; readonly totalAudioChunks: number;
  readonly totalVideoBytes: number; readonly totalAudioBytes: number;
  readonly totalMuxPayloadBytes: number; readonly avSync: AudioVideoSyncReport;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function evaluateKenBurnsEasing(tRaw: number, kind: KenBurnsEasingKind = "ease-in-out-cubic"): number {
  const t = clamp01(tRaw);
  switch (kind) {
    case "linear": return t;
    case "ease-in-out-cubic": return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "ease-out-quart": return 1 - Math.pow(1 - t, 4);
    case "ease-in-out-sine": return -(Math.cos(Math.PI * t) - 1) / 2;
  }
}

/** 컷 목록으로부터 결정적 프레임 타임라인(Ken Burns · 말풍선 리빌 · 전환)을 생성한다. */
export function buildAudioToonTimeline(
  cuts: readonly AudioToonCutSpec[],
  presetId: AudioToonPresetId,
  keyFrameIntervalFrames?: number,
): AudioToonTimelinePlan {
  const preset = AUDIOTOON_EXPORT_PRESETS[presetId];
  const safeKeyInterval = Math.max(1, Math.floor(keyFrameIntervalFrames ?? preset.fps * 2));
  const frameDurationUs = Math.round(1_000_000 / preset.fps);

  const cutRanges: {
    readonly cut: AudioToonCutSpec; readonly startMs: number; readonly endMs: number; readonly charCounts: readonly number[];
  }[] = [];

  let cursorMs = 0;
  for (const cut of cuts) {
    const dur = Math.max(1, Math.round(cut.durationMs));
    cutRanges.push({
      cut, startMs: cursorMs, endMs: cursorMs + dur,
      charCounts: (cut.balloons ?? []).map((b) => Array.from(b.text).length),
    });
    cursorMs += dur;
  }

  const totalDurationMs = cursorMs;
  const totalFrames = totalDurationMs === 0 ? 0 : Math.max(1, Math.round((totalDurationMs * preset.fps) / 1000));
  const frames: TimelineFrameSample[] = [];
  let activeCutIdx = 0;

  for (let i = 0; i < totalFrames; i += 1) {
    const timestampUs = Math.round((i * 1_000_000) / preset.fps);
    const timelineMs = timestampUs / 1000;
    while (activeCutIdx + 1 < cutRanges.length && timelineMs >= cutRanges[activeCutIdx].endMs) {
      activeCutIdx += 1;
    }

    const entry = cutRanges[activeCutIdx];
    const cutDurMs = Math.max(1, entry.endMs - entry.startMs);
    const cutLocalMs = Math.max(0, Math.min(cutDurMs, timelineMs - entry.startMs));
    const cutProgress = clamp01(cutLocalMs / cutDurMs);

    const kb = entry.cut.kenBurns;
    const eased = evaluateKenBurnsEasing(cutProgress, kb?.easing ?? "ease-in-out-cubic");
    const scale = kb ? kb.startScale + (kb.endScale - kb.startScale) * eased : 1;
    const panX = kb ? kb.startPanX + (kb.endPanX - kb.startPanX) * eased : 0;
    const panY = kb ? kb.startPanY + (kb.endPanY - kb.startPanY) * eased : 0;

    let opacity = 1;
    let crossfadeFromCutId: string | null = null;
    let crossfadeMix = 1;
    const tr = entry.cut.transitionIn;
    if (tr && tr.durationMs > 0 && cutLocalMs < tr.durationMs) {
      const trRatio = clamp01(cutLocalMs / tr.durationMs);
      if (tr.kind === "fade") opacity = trRatio;
      else if (tr.kind === "crossfade" && activeCutIdx > 0) {
        crossfadeFromCutId = cutRanges[activeCutIdx - 1].cut.cutId;
        crossfadeMix = trRatio;
      }
    }

    const sampledBalloons: SampledBalloonState[] = (entry.cut.balloons ?? []).map((b, bIdx) => {
      const totalChars = entry.charCounts[bIdx];
      const disappeared = typeof b.disappearAtMs === "number" && cutLocalMs >= b.disappearAtMs;
      if (cutLocalMs < b.appearAtMs || disappeared) {
        return {
          id: b.id, visible: false, revealProgress: 0, popScale: 0,
          revealedCharCount: 0, totalCharCount: totalChars,
          anchorX: b.anchorX ?? 0.5, anchorY: b.anchorY ?? 0.25,
        };
      }
      const rawProg = clamp01((cutLocalMs - b.appearAtMs) / Math.max(1, b.revealDurationMs));
      const style = b.style ?? "pop";
      const popScale = style === "pop" ? 0.72 + 0.28 * evaluateKenBurnsEasing(rawProg, "ease-out-quart") : 1;
      const revealedCharCount = style === "typewriter" ? Math.min(totalChars, Math.ceil(rawProg * totalChars)) : totalChars;
      return {
        id: b.id, visible: true, revealProgress: rawProg, popScale,
        revealedCharCount, totalCharCount: totalChars,
        anchorX: b.anchorX ?? 0.5, anchorY: b.anchorY ?? 0.25,
      };
    });

    const isCutFirstFrame = i === 0 || frames[i - 1].cutIndex !== activeCutIdx;
    frames.push({
      frameIndex: i, timestampUs, durationUs: frameDurationUs, timelineMs,
      cutIndex: activeCutIdx, cutId: entry.cut.cutId, cutLocalMs, cutProgress,
      isKeyFrame: i % safeKeyInterval === 0 || isCutFirstFrame,
      scale, panX, panY, opacity, crossfadeFromCutId, crossfadeMix, balloons: sampledBalloons,
    });
  }

  return {
    preset, totalDurationMs, totalDurationUs: totalFrames * frameDurationUs,
    totalFrames, keyFrameIntervalFrames: safeKeyInterval, frames,
  };
}

/** 인터리브 스테레오 PCM을 Wave-3 Rust 오디오 DSP 평면(`left`/`right`) 형식으로 분리한다. */
export function deinterleaveStereoPcm(interleaved: Float32Array, sampleRate: number = 48_000): Wave3StereoPcmBus {
  const frames = Math.floor(interleaved.length / 2);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    left[i] = interleaved[i * 2];
    right[i] = interleaved[i * 2 + 1];
  }
  return { left, right, sampleRate };
}

/** Wave-3 Rust 오디오 DSP 스테레오 버스를 WebCodecs `AudioData("f32-planar")` 호환 패킷으로 분할한다. */
export function packetizeWave3StereoPcm(bus: Wave3StereoPcmBus, framesPerPacket: number = 1024): PcmPacketizationSummary {
  if (bus.left.length !== bus.right.length) {
    throw new RangeError(`스테레오 채널 길이 불일치: left=${bus.left.length}, right=${bus.right.length}`);
  }
  if (!Number.isFinite(bus.sampleRate) || bus.sampleRate < 8_000 || bus.sampleRate > 384_000) {
    throw new RangeError(`지원하지 않는 샘플레이트: ${bus.sampleRate}`);
  }
  const fpp = Math.max(64, Math.floor(framesPerPacket));
  const totalInputFrames = bus.left.length;
  const packets: PcmStereoAudioPacket[] = [];
  let overallPeak = 0;

  for (let start = 0, pIdx = 0; start < totalInputFrames; start += fpp, pIdx += 1) {
    const validFrames = Math.min(fpp, totalInputFrames - start);
    const planar = new Float32Array(fpp * 2);
    let peak = 0;
    let sumSq = 0;

    for (let i = 0; i < validFrames; i += 1) {
      const sl = Number.isFinite(bus.left[start + i]) ? Math.max(-1, Math.min(1, bus.left[start + i])) : 0;
      const sr = Number.isFinite(bus.right[start + i]) ? Math.max(-1, Math.min(1, bus.right[start + i])) : 0;
      planar[i] = sl;
      planar[fpp + i] = sr;
      const absMax = Math.max(Math.abs(sl), Math.abs(sr));
      if (absMax > peak) peak = absMax;
      sumSq += sl * sl + sr * sr;
    }

    if (peak > overallPeak) overallPeak = peak;
    packets.push({
      packetIndex: pIdx,
      timestampUs: Math.round((start * 1_000_000) / bus.sampleRate),
      durationUs: Math.round((validFrames * 1_000_000) / bus.sampleRate),
      numberOfFrames: fpp, validFrames, sampleRate: bus.sampleRate,
      numberOfChannels: 2, planarSamples: planar,
      peakLinear: peak, rmsLinear: Math.sqrt(sumSq / Math.max(1, validFrames * 2)),
    });
  }

  return {
    sampleRate: bus.sampleRate, framesPerPacket: fpp, totalInputFrames,
    totalDurationUs: Math.round((totalInputFrames * 1_000_000) / bus.sampleRate),
    packetCount: packets.length, overallPeakLinear: overallPeak, packets,
  };
}

/** H.264 페이로드에 4바이트 Annex-B 시작 코드(`00 00 00 01`)를 보장한다. */
export function ensureAnnexBStartCode(chunkBytes: Uint8Array): Uint8Array {
  if (chunkBytes.length >= 4 && chunkBytes[0] === 0 && chunkBytes[1] === 0 && chunkBytes[2] === 0 && chunkBytes[3] === 1) {
    return chunkBytes;
  }
  if (chunkBytes.length >= 3 && chunkBytes[0] === 0 && chunkBytes[1] === 0 && chunkBytes[2] === 1) {
    return chunkBytes;
  }
  const out = new Uint8Array(chunkBytes.length + 4);
  out[3] = 1;
  out.set(chunkBytes, 4);
  return out;
}

/** MP4(`ftypisom`) 또는 WebM(EBML `0x1A45DFA3`) 컨테이너 프리앰블 헤더 바이트를 생성한다. */
export function buildContainerPreambleHeader(container: AudioToonContainerFormat): Uint8Array {
  if (container === "mp4") {
    return new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x61, 0x76, 0x63, 0x31,
    ]);
  }
  return new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
    0x42, 0x87, 0x81, 0x02, 0x42, 0x85, 0x81, 0x02,
  ]);
}

export function computeAvSyncReport(videoEndTimestampUs: number, audioEndTimestampUs: number, fps: number): AudioVideoSyncReport {
  const maxAllowedDriftUs = Math.round(1_000_000 / Math.max(1, fps));
  const driftUs = audioEndTimestampUs === 0 ? 0 : Math.abs(videoEndTimestampUs - audioEndTimestampUs);
  return { videoEndTimestampUs, audioEndTimestampUs, driftUs, maxAllowedDriftUs, inSync: driftUs <= maxAllowedDriftUs };
}

/** 인코딩된 비디오·오디오 청크를 타임스탬프 순으로 인터리브해 먹싱 준비 패키지를 구성한다. */
export class MuxReadyChunkCollector {
  private readonly rawChunks: {
    readonly track: "video" | "audio"; readonly sequence: number; readonly isKeyFrame: boolean;
    readonly timestampUs: number; readonly durationUs: number; readonly data: Uint8Array;
  }[] = [];
  private videoSeq = 0;
  private audioSeq = 0;

  constructor(
    private readonly container: AudioToonContainerFormat,
    private readonly videoCodec: string,
    private readonly audioCodec: string | null,
    private readonly width: number,
    private readonly height: number,
    private readonly fps: number,
  ) {}

  addVideoChunk(chunk: EncodedMediaChunkLike): void {
    const raw = new Uint8Array(chunk.byteLength);
    chunk.copyTo(raw);
    const data = this.container === "mp4" && this.videoCodec.startsWith("avc1") ? ensureAnnexBStartCode(raw) : raw;
    this.videoSeq += 1;
    this.rawChunks.push({
      track: "video", sequence: this.videoSeq, isKeyFrame: chunk.type === "key",
      timestampUs: Math.max(0, Math.round(chunk.timestamp)),
      durationUs: Math.max(0, Math.round(chunk.duration ?? Math.round(1_000_000 / this.fps))),
      data,
    });
  }

  addAudioChunk(chunk: EncodedMediaChunkLike): void {
    const raw = new Uint8Array(chunk.byteLength);
    chunk.copyTo(raw);
    this.audioSeq += 1;
    this.rawChunks.push({
      track: "audio", sequence: this.audioSeq, isKeyFrame: chunk.type === "key",
      timestampUs: Math.max(0, Math.round(chunk.timestamp)),
      durationUs: Math.max(0, Math.round(chunk.duration ?? 20_000)),
      data: raw,
    });
  }

  finalize(): MuxReadyMediaPackage {
    const sorted = [...this.rawChunks].sort((a, b) =>
      a.timestampUs !== b.timestampUs
        ? a.timestampUs - b.timestampUs
        : a.track !== b.track
          ? (a.track === "video" ? -1 : 1)
          : a.sequence - b.sequence,
    );

    const header = buildContainerPreambleHeader(this.container);
    const chunks: MuxCollectedChunk[] = [];
    const keyOffsets: number[] = [];
    let byteOffset = header.byteLength;
    let totalVideoBytes = 0;
    let totalAudioBytes = 0;
    let videoEndUs = 0;
    let audioEndUs = 0;

    for (const item of sorted) {
      if (item.track === "video") {
        totalVideoBytes += item.data.byteLength;
        if (item.isKeyFrame) keyOffsets.push(byteOffset);
        videoEndUs = Math.max(videoEndUs, item.timestampUs + item.durationUs);
      } else {
        totalAudioBytes += item.data.byteLength;
        audioEndUs = Math.max(audioEndUs, item.timestampUs + item.durationUs);
      }
      chunks.push({
        track: item.track, sequence: item.sequence, isKeyFrame: item.isKeyFrame,
        timestampUs: item.timestampUs, durationUs: item.durationUs,
        byteOffsetInPayload: byteOffset, byteLength: item.data.byteLength, data: item.data,
      });
      byteOffset += item.data.byteLength;
    }

    return {
      container: this.container, videoCodec: this.videoCodec, audioCodec: this.audioCodec,
      width: this.width, height: this.height, fps: this.fps,
      containerHeaderBytes: header, chunks, videoKeyFrameByteOffsets: keyOffsets,
      totalVideoChunks: this.videoSeq, totalAudioChunks: this.audioSeq,
      totalVideoBytes, totalAudioBytes, totalMuxPayloadBytes: byteOffset,
      avSync: computeAvSyncReport(videoEndUs, audioEndUs, this.fps),
    };
  }
}
