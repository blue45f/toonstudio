/**
 * 웹툰 컷 리듬 분석 -> 2.5D 무빙툰 & 15초/30초 9:16 프로모 자동 연출기 타입 계약.
 *
 * - 순수 데이터 구조만 정의하며 브라우저 전역 저장소나 UI 프레임워크에 의존하지 않는다.
 * - 색상 토큰은 시맨틱 태그(`CutToneToken`)로만 표현해 원시 hex/rgb/hsl 혼입을 원천 차단한다.
 */

export type PromoDurationSec = 15 | 30;
export type PromoFps = 30 | 60;
export type PromoAspectPreset = "9:16" | "16:9";

export type NarrativeBeat =
  | "hook"
  | "setup"
  | "tension-rise"
  | "climax-drop"
  | "cliffhanger";

export type BgmSectionKind = "intro" | "build" | "drop" | "sting";

export type SfxMarkerKind =
  | "whoosh"
  | "impact-hit"
  | "heartbeat"
  | "spark-chime"
  | "page-turn";

export type CutToneToken = "neutral" | "accent" | "cool" | "warn" | "bad" | "good";

export type BgMotifKind =
  | "city-skyline"
  | "moonlit-ruins"
  | "cherry-blossom-street"
  | "rainy-alley"
  | "classroom-window"
  | "void-speedlines";

export type MgSubjectKind =
  | "hero-silhouette"
  | "awakening-aura"
  | "couple-gaze"
  | "suspect-shadow"
  | "blade-clash"
  | "phone-glow";

export type FgAccentKind =
  | "debris-sparks"
  | "petals-drift"
  | "rain-streaks"
  | "shattered-glass"
  | "speed-slash"
  | "vignette-frame";

export type CubicBezierTuple = readonly [number, number, number, number];

export type EasingPresetName =
  | "expo-out"
  | "smooth-dolly"
  | "tension-climb"
  | "snap-impact"
  | "silk-reveal";

export type CameraKeyframePhase = "start" | "mid" | "end";

export interface CutFocusPoint {
  /** 정규화 수평 초점 (-1 좌측 ~ 1 우측). */
  readonly x: number;
  /** 정규화 수직 초점 (-1 상단 ~ 1 하단). */
  readonly y: number;
}

export interface CutDepthPlaneDescriptor {
  readonly bgMotif: BgMotifKind;
  readonly mgSubject: MgSubjectKind;
  readonly fgAccent: FgAccentKind;
  readonly focusPoint: CutFocusPoint;
  readonly toneTag: CutToneToken;
}

export interface WebtoonCutInput {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly sceneSummary: string;
  readonly balloonTexts: readonly string[];
  readonly balloonCharCountOverride?: number;
  readonly balloonWordCountOverride?: number;
  /** 세로 스크롤 컷 사이 여백 비율 (0..1). 높을수록 호흡·정적 연출이 길어진다. */
  readonly gutterWhitespaceRatio: number;
  /** 컷의 액션·감정 충격 강도 (0..1). */
  readonly actionIntensity: number;
  /** 컷 종횡비 (width / height). 0.6 이하는 종스크롤 롱컷, 1.3 이상은 와이드 컷. */
  readonly aspectRatio: number;
  readonly depthLayers: CutDepthPlaneDescriptor;
}

export interface RhythmAnalysisOptions {
  readonly targetDurationSec?: PromoDurationSec;
  readonly fps?: PromoFps;
  readonly bpmOverride?: number;
}

export interface AnalyzedWebtoonCut {
  readonly id: string;
  readonly index: number;
  readonly order: number;
  readonly title: string;
  readonly sceneSummary: string;
  readonly balloonTexts: readonly string[];
  readonly balloonCharCount: number;
  readonly balloonWordCount: number;
  readonly speechDensity: number;
  readonly gutterWhitespaceRatio: number;
  readonly actionIntensity: number;
  readonly aspectRatio: number;
  readonly depthLayers: CutDepthPlaneDescriptor;
  readonly readingWeight: number;
  readonly beat: NarrativeBeat;
  readonly emotionalArcScore: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly durationFrames: number;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly beatSpanCount: number;
}

export interface CutRhythmAnalysisReport {
  readonly targetDurationSec: PromoDurationSec;
  readonly fps: PromoFps;
  readonly totalFrames: number;
  readonly allocatedFrames: number;
  readonly frameDrift: number;
  readonly recommendedBpm: number;
  readonly framesPerBeat: number;
  readonly averageActionIntensity: number;
  readonly averageGutterRatio: number;
  readonly climaxCutId: string;
  readonly climaxFrame: number;
  readonly cuts: readonly AnalyzedWebtoonCut[];
}

export interface ParallaxLayerSpeeds {
  readonly bgParallax: number;
  readonly mgParallax: number;
  readonly fgParallax: number;
}

export interface ParallaxDirectorOptions {
  /** 카메라 움직임 배율 (0.5..1.5, 기본 1.0). */
  readonly motionScale?: number;
  readonly aspectPreset?: PromoAspectPreset;
}

export interface ParallaxCameraKeyframe {
  readonly phase: CameraKeyframePhase;
  readonly localProgress: number;
  readonly frame: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly tiltDeg: number;
  readonly microShakeAmp: number;
  readonly microShakeFreqHz: number;
  readonly easing: CubicBezierTuple;
  readonly easingName: EasingPresetName;
}

export interface CutParallaxTrack {
  readonly cutId: string;
  readonly beat: NarrativeBeat;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly durationFrames: number;
  readonly layerSpeeds: ParallaxLayerSpeeds;
  readonly cameraStyleKo: string;
  readonly keyframes: readonly [
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
  ];
}

export interface PlaneTransformOffset {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface EvaluatedParallaxPose {
  readonly cutId: string;
  readonly beat: NarrativeBeat;
  readonly frame: number;
  readonly localProgress: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly tiltDeg: number;
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
  readonly layerSpeeds: ParallaxLayerSpeeds;
  readonly bgOffset: PlaneTransformOffset;
  readonly mgOffset: PlaneTransformOffset;
  readonly fgOffset: PlaneTransformOffset;
}

export interface BgmTransitionCue {
  readonly id: string;
  readonly section: BgmSectionKind;
  readonly frame: number;
  readonly timeSec: number;
  readonly beatIndex: number;
  readonly energyLevel: number;
  readonly cutId: string;
  readonly labelKo: string;
  readonly noteKo: string;
}

export interface SfxCueMarker {
  readonly id: string;
  readonly kind: SfxMarkerKind;
  readonly frame: number;
  readonly timeSec: number;
  readonly beatIndex: number;
  readonly cutId: string;
  readonly gainDb: number;
  readonly labelKo: string;
  readonly reasonKo: string;
}

export interface AudioCueSheet {
  readonly bpm: number;
  readonly fps: PromoFps;
  readonly totalFrames: number;
  readonly beatGridFrames: readonly number[];
  readonly bgmTransitions: readonly BgmTransitionCue[];
  readonly sfxMarkers: readonly SfxCueMarker[];
}

export interface AudioCueLookupIndex {
  readonly cueIndex: ReadonlyMap<string, readonly SfxCueMarker[]>;
  readonly bgmBySection: ReadonlyMap<BgmSectionKind, BgmTransitionCue>;
}

export interface RemotionManifestOptions {
  readonly aspectPreset?: PromoAspectPreset;
  readonly compositionId?: string;
  readonly seriesTitle?: string;
  readonly episodeTitle?: string;
  readonly presetId?: string;
}

export interface RemotionSequenceSpec {
  readonly sequenceId: string;
  readonly cutId: string;
  readonly title: string;
  readonly beat: NarrativeBeat;
  readonly from: number;
  readonly durationInFrames: number;
  readonly endFrame: number;
  readonly depthPlanes: {
    readonly bgParallax: number;
    readonly mgParallax: number;
    readonly fgParallax: number;
    readonly bgMotif: BgMotifKind;
    readonly mgSubject: MgSubjectKind;
    readonly fgAccent: FgAccentKind;
    readonly focusPoint: CutFocusPoint;
    readonly toneTag: CutToneToken;
  };
  readonly cameraKeyframes: readonly [
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
  ];
  readonly caption: {
    readonly lines: readonly string[];
    readonly charCount: number;
    readonly wordCount: number;
    readonly safeZoneBottomPx: number;
  };
}

export interface RemotionPromoManifest {
  readonly schemaVersion: "toonstudio.remotion-promo.v1";
  readonly compositionId: string;
  readonly aspectRatio: PromoAspectPreset;
  readonly width: number;
  readonly height: number;
  readonly fps: PromoFps;
  readonly durationInFrames: number;
  readonly durationSec: PromoDurationSec;
  readonly recommendedBpm: number;
  readonly frameDrift: number;
  readonly metadata: {
    readonly seriesTitle: string;
    readonly episodeTitle: string;
    readonly presetId: string;
    readonly profile: "2.5d-moving-toon-auto-director";
  };
  readonly sequences: readonly RemotionSequenceSpec[];
  readonly audioTrack: {
    readonly bpm: number;
    readonly bgmTransitions: readonly BgmTransitionCue[];
    readonly sfxMarkers: readonly SfxCueMarker[];
  };
  readonly renderSettings: {
    readonly codec: "h264";
    readonly pixelFormat: "yuv420p";
    readonly crf: number;
    readonly audioBitrate: "192k";
  };
}

export interface EpisodeStoryboardPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly genreKo: string;
  readonly seriesTitle: string;
  readonly episodeTitle: string;
  readonly summaryKo: string;
  readonly defaultDurationSec: PromoDurationSec;
  readonly defaultFps: PromoFps;
  readonly defaultAspect: PromoAspectPreset;
  readonly cuts: readonly WebtoonCutInput[];
}

export interface DirectPromoPipelineOptions {
  readonly targetDurationSec?: PromoDurationSec;
  readonly fps?: PromoFps;
  readonly aspectPreset?: PromoAspectPreset;
  readonly bpmOverride?: number;
  readonly motionScale?: number;
  readonly compositionId?: string;
  readonly seriesTitle?: string;
  readonly episodeTitle?: string;
  readonly presetId?: string;
}

export interface DirectedWebtoonPromoPlan {
  readonly rhythm: CutRhythmAnalysisReport;
  readonly parallaxTracks: readonly CutParallaxTrack[];
  readonly audioCueSheet: AudioCueSheet;
  readonly manifest: RemotionPromoManifest;
}
