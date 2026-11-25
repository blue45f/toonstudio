/**
 * WebCodecs 프로파일 지원 진단 · 64×64 합성 샘플 인코더 프로브 · 타임라인 스케줄러.
 *
 * - 지정 해상도의 설정 지원 여부와 합성 샘플 인코딩을 별도로 점검한다.
 *   실제 원고 프레임 입력·영상 파일 보존·내보내기는 연결되지 않았다.
 * - 키프레임 패닝·줌·깊이(`depthZ`) 2.5D 패럴랙스·결정적 감쇠 카메라 셰이크를 보간한다.
 * - WebCodecs 미지원 시 포즈 보간만 수행하며 출력 프레임·바이트는 0으로 보고한다.
 */

export type ReelsCodecFamily = "av1" | "h264" | "vp9";
export type ReelsResolutionPresetId = "4k-vertical-60" | "1080p-reels-60" | "4k-cinema-60" | "720p-draft-30";
export type MovingToonEasingKind = "linear" | "ease-in-out-cubic" | "ease-out-expo" | "spring-overshoot";
export type ReelsEncodeExecutionMode = "webcodecs-hardware" | "webcodecs-software" | "fallback-frame-sequence";

export interface ReelsResolutionPreset {
  readonly id: ReelsResolutionPresetId;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly targetBitrateBps: number;
  readonly aspectLabel: string;
  readonly recommendedPlatformKo: string;
}

export interface ReelsCodecCandidate {
  readonly id: string;
  readonly family: ReelsCodecFamily;
  readonly codecString: string;
  readonly labelKo: string;
  readonly bitrateFactor: number;
  readonly preferHardware: boolean;
}

export interface WebCodecsEncoderConfigLike {
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
  readonly framerate: number;
  readonly hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
  readonly latencyMode?: "quality" | "realtime";
}

export interface WebCodecsSupportResultLike {
  readonly supported?: boolean;
  readonly config?: WebCodecsEncoderConfigLike;
}

export interface EncodedChunkLike {
  readonly byteLength: number;
  readonly type: "key" | "delta";
  readonly timestamp: number;
  readonly duration?: number | null;
  readonly copyTo?: (destination: Uint8Array) => void;
}

export interface VideoFrameLike {
  readonly timestamp: number;
  readonly codedWidth?: number;
  readonly codedHeight?: number;
  close(): void;
}

export interface VideoEncoderInstanceLike {
  readonly encodeQueueSize: number;
  readonly state: string;
  configure(config: WebCodecsEncoderConfigLike): void;
  encode(frame: VideoFrameLike, options?: { readonly keyFrame?: boolean }): void;
  flush(): Promise<void>;
  close(): void;
}

export interface WebCodecsRuntimeAdapter {
  readonly isConfigSupported: (config: WebCodecsEncoderConfigLike) => Promise<WebCodecsSupportResultLike>;
  readonly createEncoder?: (init: {
    readonly output: (chunk: EncodedChunkLike) => void;
    readonly error: (error: unknown) => void;
  }) => VideoEncoderInstanceLike;
  readonly createVideoFrame?: (input: {
    readonly width: number;
    readonly height: number;
    readonly timestampUs: number;
    readonly durationUs: number;
    readonly rgbaBytes: Uint8Array;
  }) => VideoFrameLike;
}

export interface CodecProbeEntry {
  readonly candidate: ReelsCodecCandidate;
  readonly hardwareSupported: boolean;
  readonly softwareSupported: boolean;
  readonly effectiveBitrateBps: number;
  readonly statusKo: string;
}

export interface ReelsCodecProbeReport {
  readonly preset: ReelsResolutionPreset;
  readonly webCodecsAvailable: boolean;
  readonly recommendedMode: ReelsEncodeExecutionMode;
  readonly recommendedCodec: ReelsCodecCandidate | null;
  readonly entries: readonly CodecProbeEntry[];
  readonly serverCostKrwPerMinute: 0;
  readonly cloudGpuSavingsKrwPer10Min: null;
  readonly estimatedMegabytesFor15s: number;
  readonly summaryKo: string;
}

export interface CameraShakeSpec {
  readonly amplitudePx: number;
  readonly frequencyHz: number;
  readonly decayRate: number;
  readonly seed: number;
  readonly startMs: number;
  readonly durationMs: number;
}

export interface MovingToonLayerSpec {
  readonly id: string;
  readonly nameKo: string;
  /** 0.0(원경) ~ 1.0(전경) 깊이 계수. 값이 클수록 패럴랙스 변위가 커진다. */
  readonly depthZ: number;
  readonly baseX: number;
  readonly baseY: number;
  readonly baseScale: number;
  readonly opacity: number;
  readonly widthRatio: number;
  readonly heightRatio: number;
}

export interface CameraKeyframe {
  readonly timeMs: number;
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
  readonly easing: MovingToonEasingKind;
  readonly shake?: CameraShakeSpec;
}

export interface MovingToonTimeline {
  readonly id: string;
  readonly titleKo: string;
  readonly descriptionKo: string;
  readonly durationMs: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly MovingToonLayerSpec[];
  readonly keyframes: readonly CameraKeyframe[];
}

export interface EvaluatedLayerTransform {
  readonly layerId: string;
  readonly nameKo: string;
  readonly depthZ: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly parallaxGain: number;
}

export interface EvaluatedFramePose {
  readonly frameIndex: number;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly timeMs: number;
  readonly isKeyFrame: boolean;
  readonly cameraPanX: number;
  readonly cameraPanY: number;
  readonly cameraZoom: number;
  readonly cameraRotationDeg: number;
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
  readonly shakeRollDeg: number;
  readonly layerTransforms: readonly EvaluatedLayerTransform[];
}

export interface ReelsFrameSchedulePlan {
  readonly totalFrames: number;
  readonly fps: number;
  readonly durationMs: number;
  readonly frameDurationUs: number;
  readonly frameBudgetMs: number;
  readonly keyFrameInterval: number;
  readonly gopCount: number;
  readonly estimatedBytes: number;
}

export interface ReelsEncodeProgress {
  readonly encodedFrames: number;
  readonly totalFrames: number;
  readonly progressRatio: number;
  readonly currentTimeMs: number;
  readonly queueDepth: number;
  readonly mode: ReelsEncodeExecutionMode;
}

export interface ReelsEncodeOptions {
  readonly presetId?: ReelsResolutionPresetId;
  readonly gopSeconds?: number;
  readonly maxEncodeQueueSize?: number;
  readonly maxFramesToEncode?: number;
  readonly preferredFamily?: ReelsCodecFamily;
  readonly adapter?: WebCodecsRuntimeAdapter | null;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ReelsEncodeProgress) => void;
}

export interface ReelsEncodeResult {
  readonly purpose: "synthetic-encoder-probe";
  readonly outputProduced: false;
  readonly status: "completed" | "unsupported" | "failed" | "cancelled";
  readonly sampleFrameWidth: 64;
  readonly sampleFrameHeight: 64;
  readonly mode: ReelsEncodeExecutionMode;
  readonly codecString: string;
  readonly preset: ReelsResolutionPreset;
  readonly schedule: ReelsFrameSchedulePlan;
  readonly encodedFrames: number;
  readonly keyFrameCount: number;
  readonly droppedFrames: number;
  readonly backpressureYields: number;
  readonly totalEncodedBytes: number;
  readonly averageBitrateMbps: number;
  readonly elapsedMs: number;
  readonly serverCostKrw: 0;
  readonly fallbackReasonKo: string | null;
  readonly samplePoses: readonly EvaluatedFramePose[];
  readonly chunkSummaryBytes: readonly number[];
}

export const REELS_RESOLUTION_PRESETS: readonly ReelsResolutionPreset[] = [
  { id: "4k-vertical-60", labelKo: "4K 세로 릴스 · 60fps", width: 2160, height: 3840, fps: 60, targetBitrateBps: 24_000_000, aspectLabel: "9:16", recommendedPlatformKo: "유튜브 쇼츠 · 인스타 릴스 · 틱톡 마스터" },
  { id: "1080p-reels-60", labelKo: "FHD 세로 쇼츠 · 60fps", width: 1080, height: 1920, fps: 60, targetBitrateBps: 12_000_000, aspectLabel: "9:16", recommendedPlatformKo: "모바일 즉시 업로드 표준" },
  { id: "4k-cinema-60", labelKo: "4K 가로 시네마 · 60fps", width: 3840, height: 2160, fps: 60, targetBitrateBps: 28_000_000, aspectLabel: "16:9", recommendedPlatformKo: "트레일러 · PV · 대형 모니터" },
  { id: "720p-draft-30", labelKo: "HD 빠른 프리뷰 · 30fps", width: 720, height: 1280, fps: 30, targetBitrateBps: 4_500_000, aspectLabel: "9:16", recommendedPlatformKo: "저사양 기기 콘티 검수" },
];

export const REELS_CODEC_CANDIDATES: readonly ReelsCodecCandidate[] = [
  { id: "h264-high-51", family: "h264", codecString: "avc1.640033", labelKo: "H.264 High L5.1 (범용 하드웨어 가속)", bitrateFactor: 1.0, preferHardware: true },
  { id: "av1-main-50", family: "av1", codecString: "av01.0.12M.08", labelKo: "AV1 Main 8-bit L5.0 (초고압축 4K)", bitrateFactor: 0.72, preferHardware: true },
  { id: "vp9-profile0-50", family: "vp9", codecString: "vp09.00.50.08", labelKo: "VP9 Profile 0 L5.0 (웹 표준 폴백)", bitrateFactor: 0.84, preferHardware: true },
];

export const MOVING_TOON_PRESETS: readonly MovingToonTimeline[] = [
  {
    id: "rooftop-sakura-duel",
    titleKo: "옥상 결투 2.5D 무빙툰 (타격 셰이크)",
    descriptionKo: "원경 야경·중경 캐릭터·전경 꽃잎 3개 레이어를 2.5D 패럴랙스로 분리하고 임팩트 감쇠 셰이크를 합성합니다.",
    durationMs: 4000,
    fps: 60,
    width: 2160,
    height: 3840,
    layers: [
      { id: "bg-skyline", nameKo: "원경 도시 야경", depthZ: 0.12, baseX: 0, baseY: -40, baseScale: 1.08, opacity: 0.92, widthRatio: 1.15, heightRatio: 0.9 },
      { id: "mid-character", nameKo: "중경 주인공 컷", depthZ: 0.58, baseX: -20, baseY: 30, baseScale: 1.0, opacity: 1.0, widthRatio: 0.72, heightRatio: 0.74 },
      { id: "fg-petals", nameKo: "전경 꽃잎·속도선", depthZ: 0.96, baseX: 40, baseY: 10, baseScale: 1.14, opacity: 0.88, widthRatio: 0.92, heightRatio: 0.86 },
    ],
    keyframes: [
      { timeMs: 0, panX: -120, panY: 80, zoom: 1.0, rotationDeg: -1.5, easing: "ease-in-out-cubic" },
      {
        timeMs: 1600,
        panX: 30,
        panY: -20,
        zoom: 1.16,
        rotationDeg: 0.6,
        easing: "ease-out-expo",
        shake: { amplitudePx: 28, frequencyHz: 18, decayRate: 4.5, seed: 731, startMs: 1600, durationMs: 750 },
      },
      { timeMs: 2800, panX: 110, panY: -90, zoom: 1.32, rotationDeg: 2.2, easing: "spring-overshoot" },
      { timeMs: 4000, panX: 85, panY: -65, zoom: 1.24, rotationDeg: 0.0, easing: "ease-in-out-cubic" },
    ],
  },
  {
    id: "subway-reveal-shorts",
    titleKo: "지하철 창밖 진입 패닝 쇼츠",
    descriptionKo: "터널 배경의 고속 수평 패닝과 차창 전경, 주인공 클로즈업 줌인을 60fps로 보간합니다.",
    durationMs: 3000,
    fps: 60,
    width: 1080,
    height: 1920,
    layers: [
      { id: "bg-tunnel", nameKo: "원경 터널 조명열", depthZ: 0.1, baseX: 0, baseY: 0, baseScale: 1.12, opacity: 0.95, widthRatio: 1.2, heightRatio: 0.95 },
      { id: "mid-seat", nameKo: "중경 객실·인물", depthZ: 0.55, baseX: 0, baseY: 20, baseScale: 1.0, opacity: 1.0, widthRatio: 0.78, heightRatio: 0.76 },
      { id: "fg-handrail", nameKo: "전경 손잡이 실루엣", depthZ: 0.92, baseX: 25, baseY: -35, baseScale: 1.1, opacity: 0.85, widthRatio: 0.85, heightRatio: 0.8 },
    ],
    keyframes: [
      { timeMs: 0, panX: -140, panY: 10, zoom: 1.02, rotationDeg: 0, easing: "ease-in-out-cubic" },
      {
        timeMs: 1500,
        panX: 20,
        panY: -10,
        zoom: 1.14,
        rotationDeg: -0.8,
        easing: "ease-out-expo",
        shake: { amplitudePx: 10, frequencyHz: 14, decayRate: 3.2, seed: 419, startMs: 1200, durationMs: 900 },
      },
      { timeMs: 3000, panX: 140, panY: -25, zoom: 1.28, rotationDeg: 0.4, easing: "ease-in-out-cubic" },
    ],
  },
];

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function seededPhase(seed: number, salt: number): number {
  const mixed = Math.imul((seed ^ salt) >>> 0, 2654435761) >>> 0;
  return ((mixed % 3600) / 3600) * Math.PI * 2;
}

export function findReelsPresetById(presetId?: ReelsResolutionPresetId): ReelsResolutionPreset {
  const matched = REELS_RESOLUTION_PRESETS.find((item) => item.id === presetId);
  if (matched) return matched;
  const fallback = REELS_RESOLUTION_PRESETS[0];
  if (!fallback) throw new Error("REELS_RESOLUTION_PRESETS must not be empty");
  return fallback;
}

export function findMovingToonPresetById(timelineId?: string): MovingToonTimeline {
  const matched = MOVING_TOON_PRESETS.find((item) => item.id === timelineId);
  if (matched) return matched;
  const fallback = MOVING_TOON_PRESETS[0];
  if (!fallback) throw new Error("MOVING_TOON_PRESETS must not be empty");
  return fallback;
}

/** 보간 곡선 평가 (`t`는 `[0, 1]` 범위로 클램핑). */
export function evaluateMovingToonEasing(kind: MovingToonEasingKind, rawT: number): number {
  const t = clampNum(rawT, 0, 1);
  if (kind === "linear") return t;
  if (kind === "ease-in-out-cubic") {
    return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
  }
  if (kind === "ease-out-expo") {
    return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
  }
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-6.2 * t) * Math.cos(10.5 * t);
}

/** 결정적 감쇠 카메라 셰이크 오프셋을 계산한다(`Math.random` 비사용). */
export function evaluateCameraShake(
  shake: CameraShakeSpec | undefined,
  timeMs: number,
): { readonly offsetX: number; readonly offsetY: number; readonly rollDeg: number } {
  if (!shake || shake.amplitudePx <= 0 || shake.durationMs <= 0) {
    return { offsetX: 0, offsetY: 0, rollDeg: 0 };
  }
  const elapsedMs = timeMs - shake.startMs;
  if (elapsedMs < 0 || elapsedMs > shake.durationMs) {
    return { offsetX: 0, offsetY: 0, rollDeg: 0 };
  }
  const dtSec = elapsedMs / 1000;
  const envelope = Math.exp(-Math.max(0.1, shake.decayRate) * dtSec);
  const tailFade = clampNum(1 - elapsedMs / shake.durationMs, 0, 1);
  const amp = shake.amplitudePx * envelope * Math.sqrt(tailFade);
  const omega = 2 * Math.PI * Math.max(1, shake.frequencyHz);

  const offsetX = roundTo(
    amp * (0.72 * Math.sin(omega * dtSec + seededPhase(shake.seed, 0x1357)) + 0.28 * Math.cos(omega * 1.73 * dtSec)),
    3,
  );
  const offsetY = roundTo(
    amp * (0.68 * Math.cos(omega * 1.17 * dtSec + seededPhase(shake.seed, 0x2468)) + 0.32 * Math.sin(omega * 2.11 * dtSec)),
    3,
  );
  const rollDeg = roundTo((amp / 14) * Math.sin(omega * 0.85 * dtSec + seededPhase(shake.seed, 0x9abc)), 3);
  return { offsetX, offsetY, rollDeg };
}

/** GOP 및 4K/60fps 프레임 타이밍 스케줄을 계산한다. */
export function planReelsFrameSchedule(
  timeline: MovingToonTimeline,
  preset: ReelsResolutionPreset,
  gopSeconds = 2,
): ReelsFrameSchedulePlan {
  const safeFps = Math.max(1, Math.round(preset.fps || timeline.fps));
  const safeDurationMs = Math.max(100, timeline.durationMs);
  const totalFrames = Math.max(1, Math.round((safeDurationMs / 1000) * safeFps));
  const frameDurationUs = Math.round(1_000_000 / safeFps);
  const keyFrameInterval = Math.max(1, Math.round(safeFps * Math.max(0.5, gopSeconds)));
  return {
    totalFrames,
    fps: safeFps,
    durationMs: safeDurationMs,
    frameDurationUs,
    frameBudgetMs: roundTo(1000 / safeFps, 2),
    keyFrameInterval,
    gopCount: Math.max(1, Math.ceil(totalFrames / keyFrameInterval)),
    estimatedBytes: Math.round((preset.targetBitrateBps / 8) * (safeDurationMs / 1000)),
  };
}

/** 지정 프레임의 카메라 보간 포즈와 레이어별 2.5D 패럴랙스 변환을 계산한다. */
export function interpolateMovingToonFrame(
  timeline: MovingToonTimeline,
  frameIndex: number,
  options?: { readonly fps?: number; readonly keyFrameInterval?: number },
): EvaluatedFramePose {
  const fps = Math.max(1, Math.round(options?.fps ?? timeline.fps));
  const keyFrameInterval = Math.max(1, Math.round(options?.keyFrameInterval ?? fps * 2));
  const clampedIndex = Math.max(0, Math.floor(frameIndex));
  const frameDurationUs = Math.round(1_000_000 / fps);
  const timeMs = clampNum((clampedIndex / fps) * 1000, 0, Math.max(0, timeline.durationMs));

  const sorted = [...timeline.keyframes].sort((a, b) => a.timeMs - b.timeMs);
  const fallbackKf: CameraKeyframe = { timeMs: 0, panX: 0, panY: 0, zoom: 1, rotationDeg: 0, easing: "linear" };
  let prevKf = sorted[0] ?? fallbackKf;
  let nextKf = prevKf;

  for (let i = 0; i < sorted.length; i += 1) {
    const candidate = sorted[i];
    if (!candidate) continue;
    if (candidate.timeMs <= timeMs) {
      prevKf = candidate;
      nextKf = sorted[i + 1] ?? candidate;
    } else {
      nextKf = candidate;
      break;
    }
  }

  const spanMs = nextKf.timeMs - prevKf.timeMs;
  const easedT = evaluateMovingToonEasing(prevKf.easing, spanMs > 0 ? (timeMs - prevKf.timeMs) / spanMs : 0);
  const cameraPanX = prevKf.panX + (nextKf.panX - prevKf.panX) * easedT;
  const cameraPanY = prevKf.panY + (nextKf.panY - prevKf.panY) * easedT;
  const cameraZoom = prevKf.zoom + (nextKf.zoom - prevKf.zoom) * easedT;
  const cameraRotationDeg = prevKf.rotationDeg + (nextKf.rotationDeg - prevKf.rotationDeg) * easedT;

  let shakeOffsetX = 0;
  let shakeOffsetY = 0;
  let shakeRollDeg = 0;
  for (const kf of sorted) {
    if (!kf.shake) continue;
    const contrib = evaluateCameraShake(kf.shake, timeMs);
    shakeOffsetX += contrib.offsetX;
    shakeOffsetY += contrib.offsetY;
    shakeRollDeg += contrib.rollDeg;
  }

  const layerTransforms: EvaluatedLayerTransform[] = timeline.layers.map((layer) => {
    const depth = clampNum(layer.depthZ, 0, 1);
    const parallaxGain = roundTo(0.25 + depth * 1.15, 3);
    const depthZoomGain = 1 + (cameraZoom - 1) * (0.45 + depth * 0.75);
    return {
      layerId: layer.id,
      nameKo: layer.nameKo,
      depthZ: depth,
      translateX: roundTo(layer.baseX + (cameraPanX + shakeOffsetX) * parallaxGain, 2),
      translateY: roundTo(layer.baseY + (cameraPanY + shakeOffsetY) * parallaxGain, 2),
      scale: roundTo(layer.baseScale * depthZoomGain, 4),
      rotationDeg: roundTo((cameraRotationDeg + shakeRollDeg) * (0.5 + depth * 0.5), 3),
      opacity: clampNum(layer.opacity, 0, 1),
      parallaxGain,
    };
  });

  return {
    frameIndex: clampedIndex,
    timestampUs: clampedIndex * frameDurationUs,
    durationUs: frameDurationUs,
    timeMs: roundTo(timeMs, 2),
    isKeyFrame: clampedIndex % keyFrameInterval === 0,
    cameraPanX: roundTo(cameraPanX, 2),
    cameraPanY: roundTo(cameraPanY, 2),
    cameraZoom: roundTo(cameraZoom, 4),
    cameraRotationDeg: roundTo(cameraRotationDeg, 3),
    shakeOffsetX: roundTo(shakeOffsetX, 2),
    shakeOffsetY: roundTo(shakeOffsetY, 2),
    shakeRollDeg: roundTo(shakeRollDeg, 3),
    layerTransforms,
  };
}

interface GlobalWebCodecsHost {
  readonly VideoEncoder?: {
    new (init: { readonly output: (chunk: EncodedChunkLike) => void; readonly error: (error: unknown) => void }): VideoEncoderInstanceLike;
    readonly isConfigSupported: (config: WebCodecsEncoderConfigLike) => Promise<WebCodecsSupportResultLike>;
  };
  readonly VideoFrame?: new (
    data: Uint8Array,
    init: { readonly format: "RGBA"; readonly codedWidth: number; readonly codedHeight: number; readonly timestamp: number; readonly duration?: number },
  ) => VideoFrameLike;
}

/** 브라우저 전역 WebCodecs API를 탐지해 안전 어댑터를 반환한다. */
export function detectBrowserWebCodecsAdapter(): WebCodecsRuntimeAdapter | null {
  const host = globalThis as unknown as GlobalWebCodecsHost;
  if (typeof host.VideoEncoder !== "function" || typeof host.VideoEncoder.isConfigSupported !== "function") {
    return null;
  }
  const EncoderCtor = host.VideoEncoder;
  const FrameCtor = host.VideoFrame;
  return {
    isConfigSupported: (config) => EncoderCtor.isConfigSupported(config),
    createEncoder: (init) => new EncoderCtor(init),
    createVideoFrame:
      typeof FrameCtor === "function"
        ? (input) =>
            new FrameCtor(input.rgbaBytes, {
              format: "RGBA",
              codedWidth: input.width,
              codedHeight: input.height,
              timestamp: input.timestampUs,
              duration: input.durationUs,
            })
        : undefined,
  };
}

/** 브라우저의 H.264 / AV1 / VP9 WebCodecs 하드웨어·소프트웨어 지원 상태를 진단한다. */
export async function probeWebCodecsSupport(
  presetId: ReelsResolutionPresetId = "4k-vertical-60",
  injectedAdapter?: WebCodecsRuntimeAdapter | null,
  preferredFamily?: ReelsCodecFamily,
): Promise<ReelsCodecProbeReport> {
  const preset = findReelsPresetById(presetId);
  const adapter = injectedAdapter === undefined ? detectBrowserWebCodecsAdapter() : injectedAdapter;
  const cloudGpuSavingsKrwPer10Min = null;
  const makeMb15s = (bps: number): number => roundTo(((bps / 8) * 15) / (1024 * 1024), 1);

  if (!adapter) {
    return {
      preset,
      webCodecsAvailable: false,
      recommendedMode: "fallback-frame-sequence",
      recommendedCodec: null,
      entries: REELS_CODEC_CANDIDATES.map((candidate) => ({
        candidate,
        hardwareSupported: false,
        softwareSupported: false,
        effectiveBitrateBps: Math.round(preset.targetBitrateBps * candidate.bitrateFactor),
        statusKo: "WebCodecs 미지원 · 포즈 보간만 가능",
      })),
      serverCostKrwPerMinute: 0,
      cloudGpuSavingsKrwPer10Min,
      estimatedMegabytesFor15s: makeMb15s(preset.targetBitrateBps),
      summaryKo: "VideoEncoder API가 없어 포즈 보간만 수행합니다. 영상·프레임 파일은 생성하지 않습니다.",
    };
  }

  const ordered = [...REELS_CODEC_CANDIDATES].sort((a, b) => {
    if (!preferredFamily) return 0;
    if (a.family === preferredFamily && b.family !== preferredFamily) return -1;
    return b.family === preferredFamily && a.family !== preferredFamily ? 1 : 0;
  });

  const entries: CodecProbeEntry[] = [];
  for (const candidate of ordered) {
    const effectiveBitrateBps = Math.round(preset.targetBitrateBps * candidate.bitrateFactor);
    const probeOne = async (hardwareAcceleration: "prefer-hardware" | "prefer-software"): Promise<boolean> => {
      try {
        const res = await adapter.isConfigSupported({
          codec: candidate.codecString,
          width: preset.width,
          height: preset.height,
          bitrate: effectiveBitrateBps,
          framerate: preset.fps,
          hardwareAcceleration,
          latencyMode: "quality",
        });
        return Boolean(res.supported);
      } catch {
        return false;
      }
    };
    const hardwareSupported = await probeOne("prefer-hardware");
    const softwareSupported = await probeOne("prefer-software");
    entries.push({
      candidate,
      hardwareSupported,
      softwareSupported,
      effectiveBitrateBps,
      statusKo: hardwareSupported ? "하드웨어 선호 설정 지원" : softwareSupported ? "소프트웨어 선호 설정 지원" : "현재 해상도 설정 미지원",
    });
  }

  const bestHw = entries.find((e) => e.hardwareSupported);
  const picked = bestHw ?? entries.find((e) => e.softwareSupported) ?? null;
  const recommendedMode: ReelsEncodeExecutionMode = bestHw
    ? "webcodecs-hardware"
    : picked
      ? "webcodecs-software"
      : "fallback-frame-sequence";

  return {
    preset,
    webCodecsAvailable: true,
    recommendedMode,
    recommendedCodec: picked ? picked.candidate : null,
    entries,
    serverCostKrwPerMinute: 0,
    cloudGpuSavingsKrwPer10Min,
    estimatedMegabytesFor15s: makeMb15s(picked ? picked.effectiveBitrateBps : preset.targetBitrateBps),
    summaryKo: picked
      ? `${picked.candidate.labelKo} 프로파일 설정이 지원됩니다. 실제 하드웨어 사용·4K 처리 성능·영상 출력은 확인하지 않았습니다.`
      : "선택한 프로파일 설정을 지원하는 코덱이 없습니다. 영상·프레임 파일은 생성하지 않습니다.",
  };
}

function synthesizeFrameSignatureBuffer(pose: EvaluatedFramePose): Uint8Array {
  const bytes = new Uint8Array(64 * 64 * 4);
  const panByte = Math.abs(Math.round(pose.cameraPanX * 3)) & 0xff;
  const zoomByte = Math.abs(Math.round(pose.cameraZoom * 100)) & 0xff;
  const shakeByte = Math.abs(Math.round((pose.shakeOffsetX + pose.shakeOffsetY) * 4)) & 0xff;
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = (panByte + (i >> 4)) & 0xff;
    bytes[i + 1] = zoomByte;
    bytes[i + 2] = (shakeByte + pose.frameIndex) & 0xff;
    bytes[i + 3] = 255;
  }
  return bytes;
}

function yieldMicrotaskTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function buildEncodeResult(
  mode: ReelsEncodeExecutionMode,
  codecString: string,
  preset: ReelsResolutionPreset,
  schedule: ReelsFrameSchedulePlan,
  stats: {
    readonly status: ReelsEncodeResult["status"];
    readonly keyFrameCount: number;
    readonly droppedFrames: number;
    readonly backpressureYields: number;
    readonly totalEncodedBytes: number;
    readonly startMs: number;
    readonly fallbackReasonKo: string | null;
    readonly samplePoses: readonly EvaluatedFramePose[];
    readonly chunkSummaryBytes: readonly number[];
  },
): ReelsEncodeResult {
  const renderedSec = Math.max(1 / schedule.fps, Math.max(1, stats.chunkSummaryBytes.length) / schedule.fps);
  return {
    purpose: "synthetic-encoder-probe",
    outputProduced: false,
    status: stats.status,
    sampleFrameWidth: 64,
    sampleFrameHeight: 64,
    mode,
    codecString,
    preset,
    schedule,
    encodedFrames: stats.chunkSummaryBytes.length,
    keyFrameCount: stats.keyFrameCount,
    droppedFrames: stats.droppedFrames,
    backpressureYields: stats.backpressureYields,
    totalEncodedBytes: stats.totalEncodedBytes,
    averageBitrateMbps: roundTo((stats.totalEncodedBytes * 8) / renderedSec / 1_000_000, 2),
    elapsedMs: Math.max(1, Date.now() - stats.startMs),
    serverCostKrw: 0,
    fallbackReasonKo: stats.fallbackReasonKo,
    samplePoses: stats.samplePoses,
    chunkSummaryBytes: stats.chunkSummaryBytes,
  };
}

/** 합성 64×64 샘플의 코덱 동작을 점검한다. 청크 크기만 집계하며 영상 파일은 생성하지 않는다. */
export class MovingToonReelsEncoder {
  async encodeTimeline(timeline: MovingToonTimeline, options: ReelsEncodeOptions = {}): Promise<ReelsEncodeResult> {
    const startMs = Date.now();
    const preset = findReelsPresetById(options.presetId);
    const schedule = planReelsFrameSchedule(timeline, preset, options.gopSeconds ?? 2);
    const targetFrameCount =
      options.maxFramesToEncode !== undefined
        ? clampNum(Math.floor(options.maxFramesToEncode), 1, schedule.totalFrames)
        : schedule.totalFrames;

    const adapter = options.adapter === undefined ? detectBrowserWebCodecsAdapter() : options.adapter;
    const probe = await probeWebCodecsSupport(preset.id, adapter, options.preferredFamily);
    const maxQueue = Math.max(1, options.maxEncodeQueueSize ?? 8);
    const samplePoses: EvaluatedFramePose[] = [];
    const chunkSummaryBytes: number[] = [];
    const sampleStride = Math.max(1, Math.floor(targetFrameCount / 6));

    const createEncoderFn = adapter?.createEncoder;
    const createVideoFrameFn = adapter?.createVideoFrame;
    const canEncode =
      adapter !== null &&
      probe.recommendedCodec !== null &&
      probe.recommendedMode !== "fallback-frame-sequence" &&
      typeof createEncoderFn === "function" &&
      typeof createVideoFrameFn === "function";

    if (!canEncode || !probe.recommendedCodec || !createEncoderFn || !createVideoFrameFn) {
      for (let i = 0; i < targetFrameCount; i += 1) {
        if (options.signal?.aborted) break;
        const pose = interpolateMovingToonFrame(timeline, i, { fps: schedule.fps, keyFrameInterval: schedule.keyFrameInterval });
        if (i % sampleStride === 0 || i === targetFrameCount - 1) samplePoses.push(pose);
        options.onProgress?.({ encodedFrames: 0, totalFrames: targetFrameCount, progressRatio: (i + 1) / targetFrameCount, currentTimeMs: pose.timeMs, queueDepth: 0, mode: "fallback-frame-sequence" });
      }
      return buildEncodeResult("fallback-frame-sequence", "fallback/frame-sequence-rgba", preset, schedule, {
        status: options.signal?.aborted ? "cancelled" : "unsupported",
        keyFrameCount: 0,
        droppedFrames: 0,
        backpressureYields: 0,
        totalEncodedBytes: 0,
        startMs,
        fallbackReasonKo: probe.summaryKo,
        samplePoses,
        chunkSummaryBytes,
      });
    }

    const activeCodec = probe.recommendedCodec;
    let totalEncodedBytes = 0;
    let keyFrameCount = 0;
    let droppedFrames = 0;
    let backpressureYields = 0;
    let encoderFailure: unknown = null;

    const encoder = createEncoderFn({
      output: (chunk) => {
        totalEncodedBytes += chunk.byteLength;
        chunkSummaryBytes.push(chunk.byteLength);
        if (chunk.type === "key") keyFrameCount += 1;
      },
      error: (err) => {
        encoderFailure = err;
      },
    });

    try {
      encoder.configure({
        codec: activeCodec.codecString,
        width: 64,
        height: 64,
        bitrate: 256_000,
        framerate: schedule.fps,
        hardwareAcceleration: probe.recommendedMode === "webcodecs-hardware" ? "prefer-hardware" : "prefer-software",
        latencyMode: "quality",
      });

      let submitted = 0;
      for (let i = 0; i < targetFrameCount; i += 1) {
        if (options.signal?.aborted || encoderFailure !== null) break;
        let spinGuard = 0;
        while (encoder.encodeQueueSize >= maxQueue && spinGuard < 4) {
          backpressureYields += 1;
          spinGuard += 1;
          await yieldMicrotaskTurn();
        }
        if (encoder.encodeQueueSize >= maxQueue) {
          droppedFrames += 1;
          continue;
        }
        const pose = interpolateMovingToonFrame(timeline, i, { fps: schedule.fps, keyFrameInterval: schedule.keyFrameInterval });
        if (i % sampleStride === 0 || i === targetFrameCount - 1) samplePoses.push(pose);

        const videoFrame = createVideoFrameFn({ width: 64, height: 64, timestampUs: pose.timestampUs, durationUs: pose.durationUs, rgbaBytes: synthesizeFrameSignatureBuffer(pose) });
        try {
          encoder.encode(videoFrame, { keyFrame: pose.isKeyFrame });
          submitted += 1;
        } finally {
          videoFrame.close();
        }
        options.onProgress?.({ encodedFrames: submitted, totalFrames: targetFrameCount, progressRatio: submitted / targetFrameCount, currentTimeMs: pose.timeMs, queueDepth: encoder.encodeQueueSize, mode: probe.recommendedMode });
      }
      if (encoderFailure === null) await encoder.flush();
    } catch (error: unknown) {
      encoderFailure = error;
    } finally {
      encoder.close();
    }

    return buildEncodeResult(probe.recommendedMode, activeCodec.codecString, preset, schedule, {
      status: encoderFailure !== null ? "failed" : options.signal?.aborted ? "cancelled" : chunkSummaryBytes.length > 0 ? "completed" : "failed",
      keyFrameCount,
      droppedFrames,
      backpressureYields,
      totalEncodedBytes,
      startMs,
      fallbackReasonKo: encoderFailure !== null ? `인코더 런타임 오류 감지: ${String(encoderFailure)}` : chunkSummaryBytes.length === 0 ? "인코딩된 합성 샘플이 없습니다." : null,
      samplePoses,
      chunkSummaryBytes,
    });
  }
}
