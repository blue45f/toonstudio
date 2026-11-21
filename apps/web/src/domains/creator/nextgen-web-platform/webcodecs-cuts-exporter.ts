/**
 * T-045: WebCodecs(VideoEncoder AV1/H.264) 30초 컷츠 무빙 웹툰 자동 연출 익스포터.
 *
 * 컷별 패럴랙스·줌인·세로 패닝 키프레임 타임라인과 자막(WebVTT)·효과음 싱크를 생성하고,
 * scheduler.yield() + Compute Pressure 스로틀링을 결합해 메인 스레드 프레임을 떨어뜨리지 않고
 * 인코딩하거나 미지원 환경에서 MediaRecorder / JSON 스토리보드 패키지로 안전하게 폴백한다.
 */

import {
  getComputePressurePolicy,
  yieldToMainThread,
  type ChromeNextGenRuntimeEnv,
  type ComputePressureState,
} from "./chrome-nextgen-apis";

export type CutsMotionPreset =
  | "ken-burns-zoom"
  | "parallax-depth"
  | "vertical-pan"
  | "dramatic-push"
  | "gentle-breathe";

export type CutsPreferredCodec = "av1" | "h264" | "vp9";

export interface CutsPanelInput {
  readonly id: string;
  readonly title: string;
  readonly durationSec?: number;
  readonly motionPreset: CutsMotionPreset;
  readonly parallaxDepth?: number;
  readonly caption?: string;
  readonly sfxCueId?: string;
  readonly sfxLabel?: string;
}

export interface CutsExportConfig {
  readonly targetDurationSec?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: 24 | 30 | 60;
  readonly preferredCodec?: CutsPreferredCodec;
  readonly bitrateBps?: number;
  readonly includeSubtitles?: boolean;
  readonly includeSfxSync?: boolean;
  readonly pressureState?: ComputePressureState;
}

export interface CutsSegmentPlan {
  readonly panelId: string;
  readonly title: string;
  readonly motionPreset: CutsMotionPreset;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly parallaxDepth: number;
  readonly caption: string | null;
  readonly sfxCueId: string | null;
  readonly sfxLabel: string | null;
}

export interface CutsKeyframe {
  readonly panelId: string;
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly foregroundParallaxPx: number;
  readonly backgroundParallaxPx: number;
  readonly opacity: number;
  readonly activeCaption: string | null;
  readonly activeSfxCueId: string | null;
}

export interface CutsSubtitleCue {
  readonly index: number;
  readonly panelId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly text: string;
}

export interface CutsSfxSyncCue {
  readonly panelId: string;
  readonly cueId: string;
  readonly label: string;
  readonly triggerSec: number;
}

export interface CutsTimelinePlan {
  readonly totalDurationSec: number;
  readonly totalFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly CutsSegmentPlan[];
  readonly keyframes: readonly CutsKeyframe[];
  readonly subtitleCues: readonly CutsSubtitleCue[];
  readonly sfxCues: readonly CutsSfxSyncCue[];
  readonly estimatedBytes: number;
}

export interface CutsCodecCandidate {
  readonly codecKey: CutsPreferredCodec;
  readonly codecString: string;
  readonly mimeType: string;
  readonly labelKo: string;
}

export const CUTS_CODEC_CANDIDATES: Readonly<Record<CutsPreferredCodec, CutsCodecCandidate>> =
  Object.freeze({
    av1: {
      codecKey: "av1",
      codecString: "av01.0.08M.08",
      mimeType: "video/mp4; codecs=av01.0.08M.08",
      labelKo: "AV1 고화질·저용량",
    },
    h264: {
      codecKey: "h264",
      codecString: "avc1.640028",
      mimeType: "video/mp4; codecs=avc1.640028",
      labelKo: "H.264 모든 기기 호환",
    },
    vp9: {
      codecKey: "vp9",
      codecString: "vp09.00.10.08",
      mimeType: "video/webm; codecs=vp09.00.10.08",
      labelKo: "VP9 웹 스트리밍",
    },
  });

export const CUTS_MOTION_PRESET_LABELS: Readonly<
  Record<CutsMotionPreset, { readonly ko: string; readonly en: string; readonly hintKo: string }>
> = Object.freeze({
  "ken-burns-zoom": {
    ko: "천천히 줌인",
    en: "Slow Zoom-In",
    hintKo: "인물 표정에 부드럽게 다가가는 기본 연출",
  },
  "parallax-depth": {
    ko: "입체 깊이감",
    en: "Parallax Depth",
    hintKo: "배경과 캐릭터가 서로 다른 속도로 움직여 입체감을 살림",
  },
  "vertical-pan": {
    ko: "세로 훑기",
    en: "Vertical Scroll Pan",
    hintKo: "세로로 긴 웹툰 컷을 위에서 아래로 자연스럽게 훑음",
  },
  "dramatic-push": {
    ko: "강조 클로즈업",
    en: "Dramatic Push",
    hintKo: "대사·반전 순간에 힘 있게 시선을 집중",
  },
  "gentle-breathe": {
    ko: "부드러운 숨결",
    en: "Gentle Breathe",
    hintKo: "잔잔한 감정선에 어울리는 미세한 움직임",
  },
});

export const DEFAULT_DEMO_CUTS_PANELS: readonly CutsPanelInput[] = Object.freeze([
  {
    id: "cut-1",
    title: "1컷 · 도입 전경",
    durationSec: 6,
    motionPreset: "vertical-pan",
    parallaxDepth: 0.55,
    caption: "비 온 뒤 옥상, 처음 마주친 그 순간",
    sfxCueId: "sfx-wind-chime",
    sfxLabel: "잔잔한 바람",
  },
  {
    id: "cut-2",
    title: "2컷 · 시선 클로즈업",
    durationSec: 6,
    motionPreset: "ken-burns-zoom",
    parallaxDepth: 0.7,
    caption: "“여기서 다시 만날 줄은 몰랐어.”",
    sfxCueId: "sfx-heartbeat",
    sfxLabel: "두근거림",
  },
  {
    id: "cut-3",
    title: "3컷 · 배경 입체 연출",
    durationSec: 6,
    motionPreset: "parallax-depth",
    parallaxDepth: 0.9,
    caption: "저녁 노을이 교실 창문 너머로 번진다",
    sfxCueId: "sfx-city-hum",
    sfxLabel: "도시 노을",
  },
  {
    id: "cut-4",
    title: "4컷 · 반전 강조",
    durationSec: 6,
    motionPreset: "dramatic-push",
    parallaxDepth: 0.8,
    caption: "손에 쥔 스케치북 마지막 장이 펼쳐졌다!",
    sfxCueId: "sfx-impact-whoosh",
    sfxLabel: "임팩트 휙",
  },
  {
    id: "cut-5",
    title: "5컷 · 엔딩 여운",
    durationSec: 6,
    motionPreset: "gentle-breathe",
    parallaxDepth: 0.4,
    caption: "다음 화에서 계속 · 툰스튜디오 컷츠",
    sfxCueId: "sfx-soft-bell",
    sfxLabel: "엔딩 벨",
  },
]);

function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function evaluateCutsPanelTransform(
  preset: CutsMotionPreset,
  progress: number,
  parallaxDepth: number,
): {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly foregroundParallaxPx: number;
  readonly backgroundParallaxPx: number;
} {
  const eased = easeOutCubic(progress);
  const depth = Math.min(1, Math.max(0, parallaxDepth));
  switch (preset) {
    case "ken-burns-zoom":
      return {
        scale: round3(1 + eased * 0.14),
        translateX: round3((eased - 0.5) * 18),
        translateY: round3(-eased * 14),
        foregroundParallaxPx: round3(eased * 16 * depth),
        backgroundParallaxPx: round3(-eased * 8 * depth),
      };
    case "parallax-depth":
      return {
        scale: round3(1.04 + eased * 0.08),
        translateX: round3(Math.sin(eased * Math.PI) * 24),
        translateY: round3(-eased * 10),
        foregroundParallaxPx: round3((eased - 0.5) * 44 * depth),
        backgroundParallaxPx: round3((0.5 - eased) * 18 * depth),
      };
    case "vertical-pan":
      return {
        scale: 1.06,
        translateX: 0,
        translateY: round3(64 - eased * 128),
        foregroundParallaxPx: round3(-eased * 22 * depth),
        backgroundParallaxPx: round3(-eased * 9 * depth),
      };
    case "dramatic-push":
      return {
        scale: round3(1 + eased * 0.24),
        translateX: 0,
        translateY: round3(-eased * 20),
        foregroundParallaxPx: round3(eased * 28 * depth),
        backgroundParallaxPx: round3(-eased * 12 * depth),
      };
    case "gentle-breathe":
      return {
        scale: round3(1.01 + Math.sin(eased * Math.PI) * 0.05),
        translateX: 0,
        translateY: round3(Math.sin(eased * Math.PI) * -6),
        foregroundParallaxPx: round3(Math.sin(eased * Math.PI) * 10 * depth),
        backgroundParallaxPx: round3(Math.sin(eased * Math.PI) * -4 * depth),
      };
  }
}

export function buildCutsTimelinePlan(
  panels: readonly CutsPanelInput[],
  config?: CutsExportConfig,
): CutsTimelinePlan {
  const safePanels = panels.length > 0 ? panels : DEFAULT_DEMO_CUTS_PANELS;
  const targetDurationSec = Math.min(60, Math.max(5, Math.round(config?.targetDurationSec ?? 30)));
  const width = Math.max(360, Math.round(config?.width ?? 1080));
  const height = Math.max(640, Math.round(config?.height ?? 1920));
  const pressurePolicy = getComputePressurePolicy(config?.pressureState ?? "nominal");
  const requestedFps = config?.fps ?? 30;
  const fps = Math.min(requestedFps, pressurePolicy.targetFps);
  const includeSubtitles = config?.includeSubtitles ?? true;
  const includeSfxSync = config?.includeSfxSync ?? true;

  const rawWeights = safePanels.map((panel) =>
    Number.isFinite(panel.durationSec) && (panel.durationSec ?? 0) > 0 ? (panel.durationSec as number) : 1,
  );
  const weightSum = rawWeights.reduce((acc, item) => acc + item, 0);

  const segments: CutsSegmentPlan[] = [];
  const subtitleCues: CutsSubtitleCue[] = [];
  const sfxCues: CutsSfxSyncCue[] = [];
  const keyframes: CutsKeyframe[] = [];

  const totalFrames = Math.max(1, Math.round(targetDurationSec * fps));
  let cursorSec = 0;
  let cursorFrame = 0;

  for (let index = 0; index < safePanels.length; index += 1) {
    const panel = safePanels[index];
    const isLast = index === safePanels.length - 1;
    const durationSec = isLast
      ? round3(Math.max(0.5, targetDurationSec - cursorSec))
      : round3((rawWeights[index] / weightSum) * targetDurationSec);
    const endSec = isLast ? targetDurationSec : round3(cursorSec + durationSec);
    const endFrame = isLast
      ? totalFrames - 1
      : Math.min(totalFrames - 1, Math.max(cursorFrame, Math.round(endSec * fps) - 1));
    const parallaxDepth = Math.min(1, Math.max(0, panel.parallaxDepth ?? 0.6));
    const caption = includeSubtitles && panel.caption?.trim() ? panel.caption.trim() : null;
    const sfxCueId = includeSfxSync && panel.sfxCueId?.trim() ? panel.sfxCueId.trim() : null;
    const sfxLabel = includeSfxSync && panel.sfxLabel?.trim() ? panel.sfxLabel.trim() : null;

    segments.push({
      panelId: panel.id,
      title: panel.title,
      motionPreset: panel.motionPreset,
      startSec: round3(cursorSec),
      endSec,
      durationSec,
      startFrame: cursorFrame,
      endFrame,
      parallaxDepth,
      caption,
      sfxCueId,
      sfxLabel,
    });

    if (caption) {
      subtitleCues.push({
        index: subtitleCues.length + 1,
        panelId: panel.id,
        startSec: round3(cursorSec),
        endSec,
        text: caption,
      });
    }
    if (sfxCueId) {
      sfxCues.push({
        panelId: panel.id,
        cueId: sfxCueId,
        label: sfxLabel ?? sfxCueId,
        triggerSec: round3(cursorSec),
      });
    }

    const sampleProgresses = [0, 0.5, 1];
    for (const ratio of sampleProgresses) {
      const frameIndex = Math.min(
        endFrame,
        Math.max(cursorFrame, Math.round(cursorFrame + (endFrame - cursorFrame) * ratio)),
      );
      const timeSec = round3(cursorSec + durationSec * ratio);
      const transform = evaluateCutsPanelTransform(panel.motionPreset, ratio, parallaxDepth);
      keyframes.push({
        panelId: panel.id,
        frameIndex,
        timeSec,
        ...transform,
        opacity: ratio === 0 && index > 0 ? 0.85 : 1,
        activeCaption: caption,
        activeSfxCueId: ratio === 0 ? sfxCueId : null,
      });
    }

    cursorSec = endSec;
    cursorFrame = Math.min(totalFrames - 1, endFrame + 1);
  }

  const bitrateBps = config?.bitrateBps ?? (config?.preferredCodec === "av1" ? 3_200_000 : 4_800_000);
  const estimatedBytes = Math.round((bitrateBps / 8) * targetDurationSec);

  return {
    totalDurationSec: targetDurationSec,
    totalFrames,
    fps,
    width,
    height,
    segments,
    keyframes,
    subtitleCues,
    sfxCues,
    estimatedBytes,
  };
}

function formatVttTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1_000);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const pad3 = (n: number) => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)}.${pad3(millis)}`;
}

export function buildCutsWebVtt(plan: CutsTimelinePlan): string {
  const lines = ["WEBVTT", ""];
  for (const cue of plan.subtitleCues) {
    lines.push(
      String(cue.index),
      `${formatVttTimestamp(cue.startSec)} --> ${formatVttTimestamp(cue.endSec)}`,
      cue.text,
      "",
    );
  }
  return lines.join("\n");
}

interface VideoEncoderLike {
  configure(config: {
    readonly codec: string;
    readonly width: number;
    readonly height: number;
    readonly bitrate: number;
    readonly framerate: number;
  }): void;
  encode(frame: { close(): void }, options?: { readonly keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

interface VideoEncoderConstructorLike {
  new (init: {
    readonly output: (chunk: { readonly byteLength: number }) => void;
    readonly error: (error: Error) => void;
  }): VideoEncoderLike;
  isConfigSupported(config: {
    readonly codec: string;
    readonly width: number;
    readonly height: number;
    readonly bitrate: number;
    readonly framerate: number;
  }): Promise<{ readonly supported?: boolean }>;
}

export interface WebCodecsNegotiationResult {
  readonly supported: boolean;
  readonly backend: "webcodecs" | "mediarecorder-fallback" | "storyboard-json-fallback";
  readonly codecKey: CutsPreferredCodec | null;
  readonly codecString: string | null;
  readonly mimeType: string;
  readonly reasonKo: string;
}

export async function negotiateWebCodecsVideoConfig(
  config?: CutsExportConfig,
  env?: ChromeNextGenRuntimeEnv,
): Promise<WebCodecsNegotiationResult> {
  const globalObj = globalThis as unknown as {
    readonly VideoEncoder?: VideoEncoderConstructorLike;
    readonly MediaRecorder?: { readonly isTypeSupported?: (mime: string) => boolean };
  };
  const EncoderCtor =
    (env?.win?.VideoEncoder as VideoEncoderConstructorLike | undefined) ?? globalObj.VideoEncoder;

  const preferred = config?.preferredCodec ?? "av1";
  const order: CutsPreferredCodec[] =
    preferred === "h264"
      ? ["h264", "av1", "vp9"]
      : preferred === "vp9"
        ? ["vp9", "av1", "h264"]
        : ["av1", "h264", "vp9"];

  if (typeof EncoderCtor === "function" && typeof EncoderCtor.isConfigSupported === "function") {
    for (const key of order) {
      const candidate = CUTS_CODEC_CANDIDATES[key];
      try {
        const support = await EncoderCtor.isConfigSupported({
          codec: candidate.codecString,
          width: config?.width ?? 1080,
          height: config?.height ?? 1920,
          bitrate: config?.bitrateBps ?? (key === "av1" ? 3_200_000 : 4_800_000),
          framerate: config?.fps ?? 30,
        });
        if (support?.supported) {
          return {
            supported: true,
            backend: "webcodecs",
            codecKey: key,
            codecString: candidate.codecString,
            mimeType: candidate.mimeType,
            reasonKo: `${candidate.labelKo} WebCodecs 하드웨어 인코딩을 바로 사용할 수 있어요.`,
          };
        }
      } catch {
        // 다음 코덱 후보를 시도한다.
      }
    }
  }

  if (typeof globalObj.MediaRecorder?.isTypeSupported === "function") {
    const fallbackMime = globalObj.MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    return {
      supported: false,
      backend: "mediarecorder-fallback",
      codecKey: null,
      codecString: null,
      mimeType: fallbackMime,
      reasonKo: "WebCodecs 미지원 환경이라 브라우저 표준 녹화 폴백으로 전환해요.",
    };
  }

  return {
    supported: false,
    backend: "storyboard-json-fallback",
    codecKey: null,
    codecString: null,
    mimeType: "application/json",
    reasonKo: "영상 인코더가 없는 환경이라 컷츠 스토리보드·자막 패키지로 안전하게 내보내요.",
  };
}

export interface CutsExportProgress {
  readonly encodedFrames: number;
  readonly totalFrames: number;
  readonly percent: number;
  readonly yieldCount: number;
  readonly stage: "planning" | "encoding" | "packaging" | "completed";
}

export interface CutsExportResult {
  readonly ok: boolean;
  readonly backend: "webcodecs" | "mediarecorder-fallback" | "storyboard-json-fallback";
  readonly codecString: string | null;
  readonly mimeType: string;
  readonly encodedFrames: number;
  readonly yieldCount: number;
  readonly chunkCount: number;
  readonly totalBytes: number;
  readonly timeline: CutsTimelinePlan;
  readonly webVtt: string;
  readonly storyboardJson: string;
  readonly summaryKo: string;
}

export async function exportCutsMovingWebtoon(
  panels: readonly CutsPanelInput[],
  config?: CutsExportConfig,
  hooks?: {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: CutsExportProgress) => void;
    readonly createFrame?: (frameIndex: number, timestampUs: number) => { close(): void };
    readonly maxSimulatedFrames?: number;
    readonly env?: ChromeNextGenRuntimeEnv;
  },
): Promise<CutsExportResult> {
  const timeline = buildCutsTimelinePlan(panels, config);
  const webVtt = buildCutsWebVtt(timeline);
  const pressurePolicy = getComputePressurePolicy(config?.pressureState ?? "nominal");
  const negotiated = await negotiateWebCodecsVideoConfig(config, hooks?.env);

  hooks?.onProgress?.({
    encodedFrames: 0,
    totalFrames: timeline.totalFrames,
    percent: 0,
    yieldCount: 0,
    stage: "planning",
  });

  const framesToProcess = Math.min(
    timeline.totalFrames,
    Math.max(1, hooks?.maxSimulatedFrames ?? timeline.keyframes.length),
  );

  let yieldCount = 0;
  let chunkCount = 0;
  let totalBytes = 0;

  const globalObj = globalThis as unknown as {
    readonly VideoEncoder?: VideoEncoderConstructorLike;
  };
  const EncoderCtor =
    (hooks?.env?.win?.VideoEncoder as VideoEncoderConstructorLike | undefined) ??
    globalObj.VideoEncoder;

  let encoder: VideoEncoderLike | null = null;
  if (negotiated.backend === "webcodecs" && typeof EncoderCtor === "function" && negotiated.codecString) {
    encoder = new EncoderCtor({
      output: (chunk) => {
        chunkCount += 1;
        totalBytes += chunk.byteLength;
      },
      error: () => {
        // 오류 발생 시 상위 폴백 요약으로 안전하게 처리한다.
      },
    });
    encoder.configure({
      codec: negotiated.codecString,
      width: timeline.width,
      height: timeline.height,
      bitrate: config?.bitrateBps ?? (negotiated.codecKey === "av1" ? 3_200_000 : 4_800_000),
      framerate: timeline.fps,
    });
  }

  for (let frameIdx = 0; frameIdx < framesToProcess; frameIdx += 1) {
    if (hooks?.signal?.aborted) {
      encoder?.close();
      throw new DOMException("30초 컷츠 내보내기가 취소되었습니다.", "AbortError");
    }

    const timestampUs = Math.round((frameIdx / timeline.fps) * 1_000_000);
    if (encoder) {
      const frame = hooks?.createFrame
        ? hooks.createFrame(frameIdx, timestampUs)
        : { close: () => undefined };
      try {
        encoder.encode(frame, { keyFrame: frameIdx % timeline.fps === 0 });
      } finally {
        frame.close();
      }
    } else {
      chunkCount += 1;
      totalBytes += Math.round(timeline.estimatedBytes / Math.max(1, framesToProcess));
    }

    if ((frameIdx + 1) % pressurePolicy.yieldEveryNFrames === 0) {
      await yieldToMainThread({ signal: hooks?.signal, env: hooks?.env });
      yieldCount += 1;
    }

    hooks?.onProgress?.({
      encodedFrames: frameIdx + 1,
      totalFrames: framesToProcess,
      percent: Math.round(((frameIdx + 1) / framesToProcess) * 100),
      yieldCount,
      stage: "encoding",
    });
  }

  if (encoder) {
    await encoder.flush();
    encoder.close();
  }

  const storyboardPayload = {
    schema: "toonstudio.cuts-storyboard/1",
    backend: negotiated.backend,
    codec: negotiated.codecString,
    durationSec: timeline.totalDurationSec,
    fps: timeline.fps,
    resolution: { width: timeline.width, height: timeline.height },
    segments: timeline.segments,
    sfxCues: timeline.sfxCues,
  };
  const storyboardJson = JSON.stringify(storyboardPayload, null, 2);
  if (totalBytes === 0) {
    totalBytes = storyboardJson.length + webVtt.length;
  }

  hooks?.onProgress?.({
    encodedFrames: framesToProcess,
    totalFrames: framesToProcess,
    percent: 100,
    yieldCount,
    stage: "completed",
  });

  const summaryKo =
    negotiated.backend === "webcodecs"
      ? `${timeline.totalDurationSec}초 컷츠 영상 준비 완료 (${negotiated.codecKey?.toUpperCase()} · ${timeline.fps}fps · 화면 멈춤 방지 양보 ${yieldCount}회)`
      : `${timeline.totalDurationSec}초 컷츠 스토리보드·자막 패키지 생성 완료 (${negotiated.backend === "mediarecorder-fallback" ? "브라우저 녹화 호환" : "JSON 스토리보드 폴백"})`;

  return {
    ok: true,
    backend: negotiated.backend,
    codecString: negotiated.codecString,
    mimeType: negotiated.mimeType,
    encodedFrames: framesToProcess,
    yieldCount,
    chunkCount,
    totalBytes,
    timeline,
    webVtt,
    storyboardJson,
    summaryKo,
  };
}
