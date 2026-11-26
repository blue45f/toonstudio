/**
 * 100% 로컬 무서버 비용(₩0) WebCodecs(`VideoEncoder` / `AudioEncoder`) 숏폼·오디오툰 내보내기 엔진.
 *
 * - 하드웨어 가속(`prefer-hardware`, H.264/VP9/AV1 + AAC/Opus) 안전 프로빙 및 폴백 리포트
 * - 타임라인 시퀀서 + Wave-3 Rust 오디오 DSP 스테레오 PCM 패킷화 + MP4/WebM 먹싱 청크 수집 연동
 * - 실시간 진행률(`onProgress`), `AbortSignal` 즉시 취소 및 핸들 누수 방지(0 leak), `encodeQueueSize` 백프레셔 제어
 */

import {
  AUDIOTOON_EXPORT_PRESETS,
  MuxReadyChunkCollector,
  buildAudioToonTimeline,
  packetizeWave3StereoPcm,
  type AudioToonAudioCodecFamily,
  type AudioToonContainerFormat,
  type AudioToonCutSpec,
  type AudioToonExportPreset,
  type AudioToonPresetId,
  type AudioToonVideoCodecFamily,
  type EncodedMediaChunkLike,
  type MuxReadyMediaPackage,
  type TimelineFrameSample,
  type Wave3StereoPcmBus,
} from "./webcodecs-audiotoon-timeline-mux";

export {
  AUDIOTOON_EXPORT_PRESETS,
  MuxReadyChunkCollector,
  buildAudioToonTimeline,
  buildContainerPreambleHeader,
  computeAvSyncReport,
  deinterleaveStereoPcm,
  ensureAnnexBStartCode,
  evaluateKenBurnsEasing,
  packetizeWave3StereoPcm,
  type AudioToonAudioCodecFamily,
  type AudioToonContainerFormat,
  type AudioToonCutSpec,
  type AudioToonExportPreset,
  type AudioToonPresetId,
  type AudioToonTimelinePlan,
  type AudioToonVideoCodecFamily,
  type AudioVideoSyncReport,
  type BalloonRevealStyle,
  type CutTransitionKind,
  type CutTransitionSpec,
  type EncodedMediaChunkLike,
  type KenBurnsEasingKind,
  type KenBurnsMotionSpec,
  type MuxCollectedChunk,
  type MuxReadyMediaPackage,
  type PcmPacketizationSummary,
  type PcmStereoAudioPacket,
  type SampledBalloonState,
  type SpeechBalloonRevealSpec,
  type TimelineFrameSample,
  type Wave3StereoPcmBus,
} from "./webcodecs-audiotoon-timeline-mux";

export interface VideoCodecCandidate {
  readonly family: AudioToonVideoCodecFamily; readonly codec: string;
  readonly container: AudioToonContainerFormat; readonly labelKo: string;
}

export interface AudioCodecCandidate {
  readonly family: AudioToonAudioCodecFamily; readonly codec: string;
  readonly container: AudioToonContainerFormat; readonly framesPerPacket: number; readonly labelKo: string;
}

export const AUDIOTOON_VIDEO_CODEC_CANDIDATES: readonly VideoCodecCandidate[] = [
  { family: "h264", codec: "avc1.640032", container: "mp4", labelKo: "H.264 High L5.0 (MP4)" },
  { family: "vp9", codec: "vp09.00.41.08", container: "webm", labelKo: "VP9 Profile 0 (WebM)" },
  { family: "av1", codec: "av01.0.08M.08", container: "webm", labelKo: "AV1 Main (WebM)" },
];

export const AUDIOTOON_AUDIO_CODEC_CANDIDATES: readonly AudioCodecCandidate[] = [
  { family: "aac", codec: "mp4a.40.2", container: "mp4", framesPerPacket: 1024, labelKo: "AAC-LC 48kHz 스테레오" },
  { family: "opus", codec: "opus", container: "webm", framesPerPacket: 960, labelKo: "Opus 48kHz 스테레오" },
];

export interface WebCodecsVideoConfigLike {
  readonly codec: string; readonly width: number; readonly height: number;
  readonly bitrate: number; readonly framerate: number;
  readonly hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
  readonly latencyMode?: "quality" | "realtime";
  readonly avc?: { readonly format: "annexb" | "avc" };
}

export interface WebCodecsAudioConfigLike {
  readonly codec: string; readonly sampleRate: number; readonly numberOfChannels: number; readonly bitrate: number;
}

export interface EncodedChunkMetadataLike {
  readonly decoderConfig?: { readonly codec?: string; readonly description?: ArrayBuffer | ArrayBufferView };
}

export interface VideoFrameHandleLike { readonly timestamp: number; readonly duration?: number | null; close(): void; }
export interface AudioDataHandleLike {
  readonly timestamp: number; readonly numberOfFrames: number;
  readonly numberOfChannels: number; readonly sampleRate: number; close(): void;
}

export interface VideoEncoderHandleLike {
  readonly encodeQueueSize: number; readonly state: string; ondequeue?: (() => void) | null;
  configure(config: WebCodecsVideoConfigLike): void;
  encode(frame: VideoFrameHandleLike, options?: { readonly keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

export interface AudioEncoderHandleLike {
  readonly encodeQueueSize: number; readonly state: string; ondequeue?: (() => void) | null;
  configure(config: WebCodecsAudioConfigLike): void;
  encode(data: AudioDataHandleLike): void;
  flush(): Promise<void>;
  close(): void;
}

export interface AudioToonWebCodecsAdapter {
  readonly isVideoConfigSupported: (config: WebCodecsVideoConfigLike) => Promise<{ readonly supported?: boolean }>;
  readonly isAudioConfigSupported?: (config: WebCodecsAudioConfigLike) => Promise<{ readonly supported?: boolean }>;
  readonly createVideoEncoder: (init: {
    readonly output: (chunk: EncodedMediaChunkLike, metadata?: EncodedChunkMetadataLike) => void;
    readonly error: (error: unknown) => void;
  }) => VideoEncoderHandleLike;
  readonly createAudioEncoder?: (init: {
    readonly output: (chunk: EncodedMediaChunkLike, metadata?: EncodedChunkMetadataLike) => void;
    readonly error: (error: unknown) => void;
  }) => AudioEncoderHandleLike;
  readonly createVideoFrame: (input: {
    readonly rgba: Uint8ClampedArray; readonly width: number; readonly height: number;
    readonly timestampUs: number; readonly durationUs: number;
  }) => VideoFrameHandleLike;
  readonly createAudioData?: (input: {
    readonly planarSamples: Float32Array; readonly sampleRate: number;
    readonly numberOfFrames: number; readonly numberOfChannels: 2; readonly timestampUs: number;
  }) => AudioDataHandleLike;
}

export interface VideoCodecProbeEntry {
  readonly candidate: VideoCodecCandidate; readonly hardwareSupported: boolean; readonly softwareSupported: boolean;
}
export interface AudioCodecProbeEntry { readonly candidate: AudioCodecCandidate; readonly supported: boolean; }

export interface AudioToonCapabilityReport {
  readonly preset: AudioToonExportPreset;
  readonly webCodecsVideoAvailable: boolean; readonly webCodecsAudioAvailable: boolean;
  readonly videoEntries: readonly VideoCodecProbeEntry[]; readonly audioEntries: readonly AudioCodecProbeEntry[];
  readonly selectedVideoCodec: VideoCodecCandidate | null; readonly selectedAudioCodec: AudioCodecCandidate | null;
  readonly selectedContainer: AudioToonContainerFormat | "fallback-manifest";
  readonly videoAcceleration: "prefer-hardware" | "prefer-software" | "unavailable";
  readonly serverCostKrw: 0; readonly fallbackReasonKo: string | null; readonly summaryKo: string;
}

export interface AudioToonExportProgress {
  readonly phase: "probing" | "encoding-video" | "encoding-audio" | "flushing" | "done" | "aborted";
  readonly completedFrames: number; readonly totalFrames: number;
  readonly completedAudioPackets: number; readonly totalAudioPackets: number;
  readonly progressRatio: number; readonly videoQueueSize: number; readonly audioQueueSize: number;
}

export interface ExportLocalAudioToonOptions {
  readonly presetId: AudioToonPresetId; readonly cuts: readonly AudioToonCutSpec[];
  readonly audioBus?: Wave3StereoPcmBus | null; readonly adapter?: AudioToonWebCodecsAdapter | null;
  readonly renderFrame?: (sample: TimelineFrameSample, width: number, height: number) => Uint8ClampedArray;
  readonly keyFrameIntervalFrames?: number; readonly maxVideoEncodeQueueSize?: number;
  readonly maxAudioEncodeQueueSize?: number; readonly queueDrainPollMs?: number;
  readonly signal?: AbortSignal; readonly onProgress?: (progress: AudioToonExportProgress) => void;
}

export interface AudioToonBackpressureMetrics {
  readonly maxVideoQueueLimit: number; readonly maxAudioQueueLimit: number;
  readonly videoBackpressurePauses: number; readonly audioBackpressurePauses: number;
  readonly peakVideoQueueSize: number; readonly peakAudioQueueSize: number;
}

export interface AudioToonExportReport {
  readonly status: "completed" | "aborted" | "fallback-unsupported";
  readonly serverCostKrw: 0;
  readonly capability: AudioToonCapabilityReport;
  readonly timeline: { readonly totalFrames: number; readonly totalDurationMs: number; readonly totalDurationUs: number };
  readonly encodedVideoFrames: number; readonly encodedAudioPackets: number;
  readonly closedVideoFrames: number; readonly closedAudioDataHandles: number;
  readonly backpressure: AudioToonBackpressureMetrics;
  readonly muxPackage: MuxReadyMediaPackage | null;
  readonly fallbackReasonKo: string | null;
}

/** 브라우저 전역 WebCodecs API를 구조적 어댑터로 안전 래핑한다(미지원 시 `null`). */
export function createBrowserAudioToonWebCodecsAdapter(): AudioToonWebCodecsAdapter | null {
  const host = globalThis as unknown as {
    readonly VideoEncoder?: {
      new (init: {
        readonly output: (chunk: EncodedMediaChunkLike, metadata?: EncodedChunkMetadataLike) => void;
        readonly error: (error: unknown) => void;
      }): VideoEncoderHandleLike;
      isConfigSupported?: (config: WebCodecsVideoConfigLike) => Promise<{ readonly supported?: boolean }>;
    };
    readonly AudioEncoder?: {
      new (init: {
        readonly output: (chunk: EncodedMediaChunkLike, metadata?: EncodedChunkMetadataLike) => void;
        readonly error: (error: unknown) => void;
      }): AudioEncoderHandleLike;
      isConfigSupported?: (config: WebCodecsAudioConfigLike) => Promise<{ readonly supported?: boolean }>;
    };
    readonly VideoFrame?: {
      new (
        data: ArrayBufferView,
        init: { readonly format: "RGBA"; readonly codedWidth: number; readonly codedHeight: number; readonly timestamp: number; readonly duration: number },
      ): VideoFrameHandleLike;
    };
    readonly AudioData?: {
      new (init: {
        readonly format: "f32-planar"; readonly sampleRate: number; readonly numberOfFrames: number;
        readonly numberOfChannels: number; readonly timestamp: number; readonly data: Float32Array;
      }): AudioDataHandleLike;
    };
  };

  const VideoEncoderCtor = host.VideoEncoder;
  const rawVideoSupported = VideoEncoderCtor?.isConfigSupported;
  const VideoFrameCtor = host.VideoFrame;
  if (
    typeof VideoEncoderCtor !== "function" ||
    typeof rawVideoSupported !== "function" ||
    typeof VideoFrameCtor !== "function"
  ) {
    return null;
  }

  const isVideoSupportedFn = rawVideoSupported.bind(VideoEncoderCtor);
  const AudioEncoderCtor = host.AudioEncoder;
  const rawAudioSupported = AudioEncoderCtor?.isConfigSupported;
  const isAudioSupportedFn =
    typeof AudioEncoderCtor === "function" && typeof rawAudioSupported === "function"
      ? rawAudioSupported.bind(AudioEncoderCtor)
      : undefined;
  const AudioDataCtor = host.AudioData;

  return {
    isVideoConfigSupported: (config) => isVideoSupportedFn(config),
    isAudioConfigSupported: isAudioSupportedFn ? (config) => isAudioSupportedFn(config) : undefined,
    createVideoEncoder: (init) => new VideoEncoderCtor(init),
    createAudioEncoder: typeof AudioEncoderCtor === "function" ? (init) => new AudioEncoderCtor(init) : undefined,
    createVideoFrame: (input) =>
      new VideoFrameCtor(input.rgba, {
        format: "RGBA", codedWidth: input.width, codedHeight: input.height,
        timestamp: input.timestampUs, duration: input.durationUs,
      }),
    createAudioData:
      typeof AudioDataCtor === "function"
        ? (input) =>
            new AudioDataCtor({
              format: "f32-planar", sampleRate: input.sampleRate, numberOfFrames: input.numberOfFrames,
              numberOfChannels: input.numberOfChannels, timestamp: input.timestampUs, data: input.planarSamples,
            })
        : undefined,
  };
}

/** 하드웨어 가속(`prefer-hardware`) H.264/VP9/AV1 및 AAC/Opus 지원 여부를 안전 프로빙한다. */
export async function probeAudioToonExportCapabilities(
  presetId: AudioToonPresetId,
  adapter?: AudioToonWebCodecsAdapter | null,
): Promise<AudioToonCapabilityReport> {
  const preset = AUDIOTOON_EXPORT_PRESETS[presetId];
  const resolvedAdapter = adapter === undefined ? createBrowserAudioToonWebCodecsAdapter() : adapter;

  if (!resolvedAdapter) {
    return {
      preset, webCodecsVideoAvailable: false, webCodecsAudioAvailable: false,
      videoEntries: AUDIOTOON_VIDEO_CODEC_CANDIDATES.map((candidate) => ({ candidate, hardwareSupported: false, softwareSupported: false })),
      audioEntries: AUDIOTOON_AUDIO_CODEC_CANDIDATES.map((candidate) => ({ candidate, supported: false })),
      selectedVideoCodec: null, selectedAudioCodec: null, selectedContainer: "fallback-manifest",
      videoAcceleration: "unavailable", serverCostKrw: 0,
      fallbackReasonKo: "현재 브라우저 환경에 WebCodecs VideoEncoder가 없어 타임라인·오디오 메타데이터 폴백으로 전환합니다.",
      summaryKo: `${preset.labelKo}: WebCodecs 미지원(로컬 폴백, 서버 비용 ₩0).`,
    };
  }

  const videoEntries: VideoCodecProbeEntry[] = [];
  for (const candidate of AUDIOTOON_VIDEO_CODEC_CANDIDATES) {
    const baseCfg: WebCodecsVideoConfigLike = {
      codec: candidate.codec, width: preset.width, height: preset.height,
      bitrate: preset.videoBitrateBps, framerate: preset.fps, latencyMode: "quality",
    };
    let hardwareSupported: boolean;
    let softwareSupported: boolean;
    try { hardwareSupported = Boolean((await resolvedAdapter.isVideoConfigSupported({ ...baseCfg, hardwareAcceleration: "prefer-hardware" }))?.supported); } catch { hardwareSupported = false; }
    try { softwareSupported = Boolean((await resolvedAdapter.isVideoConfigSupported({ ...baseCfg, hardwareAcceleration: "prefer-software" }))?.supported); } catch { softwareSupported = false; }
    videoEntries.push({ candidate, hardwareSupported, softwareSupported });
  }

  const audioEntries: AudioCodecProbeEntry[] = [];
  for (const candidate of AUDIOTOON_AUDIO_CODEC_CANDIDATES) {
    let supported = false;
    if (resolvedAdapter.isAudioConfigSupported) {
      try {
        const res = await resolvedAdapter.isAudioConfigSupported({
          codec: candidate.codec, sampleRate: preset.audioSampleRate,
          numberOfChannels: preset.audioChannels, bitrate: preset.audioBitrateBps,
        });
        supported = Boolean(res?.supported);
      } catch {
        supported = false;
      }
    }
    audioEntries.push({ candidate, supported });
  }

  const hwPick = videoEntries.find((e) => e.hardwareSupported) ?? null;
  const swPick = hwPick ?? videoEntries.find((e) => e.softwareSupported) ?? null;
  const selectedVideoCodec = swPick ? swPick.candidate : null;
  const videoAcceleration = hwPick ? "prefer-hardware" : swPick ? "prefer-software" : "unavailable";
  const selectedContainer: AudioToonContainerFormat | "fallback-manifest" = selectedVideoCodec ? selectedVideoCodec.container : "fallback-manifest";
  const matchedAudio =
    (selectedContainer !== "fallback-manifest"
      ? audioEntries.find((e) => e.supported && e.candidate.container === selectedContainer)
      : null) ?? audioEntries.find((e) => e.supported) ?? null;
  const selectedAudioCodec = matchedAudio ? matchedAudio.candidate : null;
  const fallbackReasonKo = selectedVideoCodec ? null : "지원 가능한 H.264/VP9/AV1 비디오 인코더 프로파일이 없어 폴백 상태로 보고합니다.";

  return {
    preset, webCodecsVideoAvailable: selectedVideoCodec !== null, webCodecsAudioAvailable: selectedAudioCodec !== null,
    videoEntries, audioEntries, selectedVideoCodec, selectedAudioCodec, selectedContainer, videoAcceleration,
    serverCostKrw: 0, fallbackReasonKo,
    summaryKo: selectedVideoCodec
      ? `${preset.labelKo}: ${selectedVideoCodec.labelKo}(${videoAcceleration}) + ${selectedAudioCodec?.labelKo ?? "무음"} 로컬 인코딩 준비 완료(서버 비용 ₩0).`
      : `${preset.labelKo}: 비디오 코덱 미지원(폴백, 서버 비용 ₩0).`,
  };
}

async function waitForQueueDrain(
  getQueueSize: () => number,
  maxQueueSize: number,
  pollMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  let waited = false;
  while (getQueueSize() >= maxQueueSize) {
    if (signal?.aborted) return waited;
    waited = true;
    await new Promise<void>((resolve) => {
      if (pollMs <= 0) queueMicrotask(resolve);
      else setTimeout(resolve, pollMs);
    });
  }
  return waited;
}

/** 로컬 WebCodecs 비디오·오디오 인코더로 숏폼/오디오툰 먹싱 준비 패키지를 생성한다. */
export async function exportLocalAudioToon(options: ExportLocalAudioToonOptions): Promise<AudioToonExportReport> {
  const preset = AUDIOTOON_EXPORT_PRESETS[options.presetId];
  const timeline = buildAudioToonTimeline(options.cuts, options.presetId, options.keyFrameIntervalFrames);
  const timelineMeta = { totalFrames: timeline.totalFrames, totalDurationMs: timeline.totalDurationMs, totalDurationUs: timeline.totalDurationUs };
  const maxVideoQueueLimit = Math.max(1, Math.floor(options.maxVideoEncodeQueueSize ?? 4));
  const maxAudioQueueLimit = Math.max(1, Math.floor(options.maxAudioEncodeQueueSize ?? 8));
  const pollMs = Math.max(0, options.queueDrainPollMs ?? 0);

  options.onProgress?.({
    phase: "probing", completedFrames: 0, totalFrames: timeline.totalFrames,
    completedAudioPackets: 0, totalAudioPackets: 0, progressRatio: 0, videoQueueSize: 0, audioQueueSize: 0,
  });

  const resolvedAdapter = options.adapter === undefined ? createBrowserAudioToonWebCodecsAdapter() : options.adapter;
  const capability = await probeAudioToonExportCapabilities(options.presetId, resolvedAdapter);

  let encodedVideoFrames = 0;
  let encodedAudioPackets = 0;
  let closedVideoFrames = 0;
  let closedAudioDataHandles = 0;
  let videoBackpressurePauses = 0;
  let audioBackpressurePauses = 0;
  let peakVideoQueueSize = 0;
  let peakAudioQueueSize = 0;

  const buildReport = (
    status: AudioToonExportReport["status"],
    muxPackage: MuxReadyMediaPackage | null,
    fallbackReasonKo: string | null,
  ): AudioToonExportReport => ({
    status, serverCostKrw: 0, capability, timeline: timelineMeta,
    encodedVideoFrames, encodedAudioPackets, closedVideoFrames, closedAudioDataHandles,
    backpressure: {
      maxVideoQueueLimit, maxAudioQueueLimit, videoBackpressurePauses, audioBackpressurePauses,
      peakVideoQueueSize, peakAudioQueueSize,
    },
    muxPackage, fallbackReasonKo,
  });

  if (options.signal?.aborted) {
    return buildReport("aborted", null, "사용자 요청으로 내보내기가 시작 전 취소되었습니다.");
  }
  if (!resolvedAdapter || !capability.selectedVideoCodec || capability.selectedContainer === "fallback-manifest") {
    return buildReport("fallback-unsupported", null, capability.fallbackReasonKo);
  }

  const audioCodec =
    options.audioBus && capability.selectedAudioCodec && resolvedAdapter.createAudioEncoder && resolvedAdapter.createAudioData
      ? capability.selectedAudioCodec
      : null;
  const audioPlan = options.audioBus && audioCodec ? packetizeWave3StereoPcm(options.audioBus, audioCodec.framesPerPacket) : null;
  const totalAudioPackets = audioPlan?.packetCount ?? 0;
  const totalWorkUnits = Math.max(1, timeline.totalFrames + totalAudioPackets);

  const collector = new MuxReadyChunkCollector(
    capability.selectedContainer, capability.selectedVideoCodec.codec, audioCodec ? audioCodec.codec : null,
    preset.width, preset.height, preset.fps,
  );

  let encoderError: unknown = null;
  const videoEncoder = resolvedAdapter.createVideoEncoder({
    output: (chunk) => collector.addVideoChunk(chunk),
    error: (err) => { encoderError = err; },
  });
  videoEncoder.configure({
    codec: capability.selectedVideoCodec.codec, width: preset.width, height: preset.height,
    bitrate: preset.videoBitrateBps, framerate: preset.fps,
    hardwareAcceleration: capability.videoAcceleration === "prefer-hardware" ? "prefer-hardware" : "prefer-software",
    latencyMode: "quality",
    ...(capability.selectedVideoCodec.family === "h264" ? { avc: { format: "annexb" as const } } : {}),
  });

  const audioEncoder =
    audioCodec && resolvedAdapter.createAudioEncoder
      ? resolvedAdapter.createAudioEncoder({
          output: (chunk) => collector.addAudioChunk(chunk),
          error: (err) => { encoderError = err; },
        })
      : null;
  if (audioEncoder && audioCodec && options.audioBus) {
    audioEncoder.configure({
      codec: audioCodec.codec, sampleRate: options.audioBus.sampleRate,
      numberOfChannels: 2, bitrate: preset.audioBitrateBps,
    });
  }

  const defaultFrameBytes = new Uint8ClampedArray(16);
  const closeEncodersSafe = (): void => {
    try { if (videoEncoder.state !== "closed") videoEncoder.close(); } catch { /* 이미 닫힘 */ }
    try { if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close(); } catch { /* 이미 닫힘 */ }
  };

  try {
    for (const sample of timeline.frames) {
      if (options.signal?.aborted) {
        closeEncodersSafe();
        options.onProgress?.({
          phase: "aborted", completedFrames: encodedVideoFrames, totalFrames: timeline.totalFrames,
          completedAudioPackets: encodedAudioPackets, totalAudioPackets,
          progressRatio: encodedVideoFrames / totalWorkUnits,
          videoQueueSize: videoEncoder.encodeQueueSize, audioQueueSize: audioEncoder?.encodeQueueSize ?? 0,
        });
        return buildReport("aborted", null, "비디오 인코딩 도중 취소 신호(AbortSignal)로 중단하고 핸들을 정리했습니다.");
      }
      if (encoderError !== null) throw encoderError;

      peakVideoQueueSize = Math.max(peakVideoQueueSize, videoEncoder.encodeQueueSize);
      if (videoEncoder.encodeQueueSize >= maxVideoQueueLimit) {
        const paused = await waitForQueueDrain(() => videoEncoder.encodeQueueSize, maxVideoQueueLimit, pollMs, options.signal);
        if (paused) videoBackpressurePauses += 1;
        if (options.signal?.aborted) continue;
      }

      const rgba = options.renderFrame ? options.renderFrame(sample, preset.width, preset.height) : defaultFrameBytes;
      const frameHandle = resolvedAdapter.createVideoFrame({
        rgba, width: options.renderFrame ? preset.width : 2, height: options.renderFrame ? preset.height : 2,
        timestampUs: sample.timestampUs, durationUs: sample.durationUs,
      });
      try {
        videoEncoder.encode(frameHandle, { keyFrame: sample.isKeyFrame });
        peakVideoQueueSize = Math.max(peakVideoQueueSize, videoEncoder.encodeQueueSize);
        encodedVideoFrames += 1;
      } finally {
        frameHandle.close();
        closedVideoFrames += 1;
      }

      options.onProgress?.({
        phase: "encoding-video", completedFrames: encodedVideoFrames, totalFrames: timeline.totalFrames,
        completedAudioPackets: encodedAudioPackets, totalAudioPackets,
        progressRatio: encodedVideoFrames / totalWorkUnits,
        videoQueueSize: videoEncoder.encodeQueueSize, audioQueueSize: audioEncoder?.encodeQueueSize ?? 0,
      });
    }

    if (audioEncoder && audioPlan && resolvedAdapter.createAudioData) {
      for (const packet of audioPlan.packets) {
        if (options.signal?.aborted) {
          closeEncodersSafe();
          return buildReport("aborted", null, "오디오 인코딩 도중 취소 신호(AbortSignal)로 중단하고 핸들을 정리했습니다.");
        }
        peakAudioQueueSize = Math.max(peakAudioQueueSize, audioEncoder.encodeQueueSize);
        if (audioEncoder.encodeQueueSize >= maxAudioQueueLimit) {
          const paused = await waitForQueueDrain(() => audioEncoder.encodeQueueSize, maxAudioQueueLimit, pollMs, options.signal);
          if (paused) audioBackpressurePauses += 1;
          if (options.signal?.aborted) continue;
        }
        const audioHandle = resolvedAdapter.createAudioData({
          planarSamples: packet.planarSamples, sampleRate: packet.sampleRate,
          numberOfFrames: packet.numberOfFrames, numberOfChannels: 2, timestampUs: packet.timestampUs,
        });
        try {
          audioEncoder.encode(audioHandle);
          peakAudioQueueSize = Math.max(peakAudioQueueSize, audioEncoder.encodeQueueSize);
          encodedAudioPackets += 1;
        } finally {
          audioHandle.close();
          closedAudioDataHandles += 1;
        }
        options.onProgress?.({
          phase: "encoding-audio", completedFrames: encodedVideoFrames, totalFrames: timeline.totalFrames,
          completedAudioPackets: encodedAudioPackets, totalAudioPackets,
          progressRatio: (encodedVideoFrames + encodedAudioPackets) / totalWorkUnits,
          videoQueueSize: videoEncoder.encodeQueueSize, audioQueueSize: audioEncoder.encodeQueueSize,
        });
      }
    }

    options.onProgress?.({
      phase: "flushing", completedFrames: encodedVideoFrames, totalFrames: timeline.totalFrames,
      completedAudioPackets: encodedAudioPackets, totalAudioPackets, progressRatio: 0.98,
      videoQueueSize: videoEncoder.encodeQueueSize, audioQueueSize: audioEncoder?.encodeQueueSize ?? 0,
    });

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    if (encoderError !== null) throw encoderError;

    const muxPackage = collector.finalize();
    options.onProgress?.({
      phase: "done", completedFrames: encodedVideoFrames, totalFrames: timeline.totalFrames,
      completedAudioPackets: encodedAudioPackets, totalAudioPackets, progressRatio: 1,
      videoQueueSize: 0, audioQueueSize: 0,
    });
    return buildReport("completed", muxPackage, null);
  } finally {
    closeEncodersSafe();
  }
}
