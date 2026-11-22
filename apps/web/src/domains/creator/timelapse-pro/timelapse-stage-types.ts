/**
 * 공정별(콘티→선화→밑색→명암→식자) ₩0 로컬 타임랩스 및 SNS 9:16·1:1 숏폼 프리뷰 플래너 타입 계약.
 *
 * DOM·네트워크 의존성 없이 순수 데이터 계약만 정의한다.
 */

export type WebtoonProcessStage =
  | "conti"
  | "lineart"
  | "flat-color"
  | "shading"
  | "lettering";

export interface WebtoonProcessStageSpec {
  readonly id: WebtoonProcessStage;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortBadgeKo: string;
  /** 기본 타임라인 구간 가중치(상대 비율). */
  readonly defaultWeight: number;
  /** 기본 자막 큐 안내 문구. */
  readonly defaultCaptionKo: string;
}

export const WEBTOON_PROCESS_STAGES: readonly WebtoonProcessStageSpec[] = Object.freeze([
  Object.freeze({
    id: "conti",
    order: 0,
    labelKo: "콘티",
    labelEn: "Storyboard",
    shortBadgeKo: "01 콘티",
    defaultWeight: 0.9,
    defaultCaptionKo: "01 콘티 · 컷 분할과 러프 구도 잡기",
  }),
  Object.freeze({
    id: "lineart",
    order: 1,
    labelKo: "선화",
    labelEn: "Lineart",
    shortBadgeKo: "02 선화",
    defaultWeight: 1.25,
    defaultCaptionKo: "02 선화 · 펜터치와 외곽선 정리",
  }),
  Object.freeze({
    id: "flat-color",
    order: 2,
    labelKo: "밑색",
    labelEn: "Flat color",
    shortBadgeKo: "03 밑색",
    defaultWeight: 1.0,
    defaultCaptionKo: "03 밑색 · 영역별 기본 색감 채우기",
  }),
  Object.freeze({
    id: "shading",
    order: 3,
    labelKo: "명암",
    labelEn: "Shading",
    shortBadgeKo: "04 명암",
    defaultWeight: 1.2,
    defaultCaptionKo: "04 명암 · 빛 방향과 그림자 입체감",
  }),
  Object.freeze({
    id: "lettering",
    order: 4,
    labelKo: "식자",
    labelEn: "Lettering",
    shortBadgeKo: "05 식자",
    defaultWeight: 1.15,
    defaultCaptionKo: "05 식자 · 말풍선·대사·효과음 완성",
  }),
]);

export const WEBTOON_PROCESS_STAGE_BY_ID: Readonly<
  Record<WebtoonProcessStage, WebtoonProcessStageSpec>
> = Object.freeze({
  conti: WEBTOON_PROCESS_STAGES[0],
  lineart: WEBTOON_PROCESS_STAGES[1],
  "flat-color": WEBTOON_PROCESS_STAGES[2],
  shading: WEBTOON_PROCESS_STAGES[3],
  lettering: WEBTOON_PROCESS_STAGES[4],
});

export type ShortformAspectPreset = "9:16" | "1:1";
export type ShortformFps = 30 | 60;
export type ShortformCodecId = "vp9" | "av1" | "h264";
export type ShortformCameraIntensity = "static" | "subtle" | "balanced" | "cinematic";
export type ShortformMotionMode =
  | "auto"
  | "ken-burns-zoom-in"
  | "vertical-pan"
  | "diagonal-drift"
  | "hero-reveal";

export type ShortformPlatformId =
  | "youtube-shorts"
  | "instagram-reels"
  | "x-short"
  | "instagram-square";

export interface ShortformAspectSpec {
  readonly preset: ShortformAspectPreset;
  readonly width: number;
  readonly height: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const SHORTFORM_ASPECT_SPECS: Readonly<
  Record<ShortformAspectPreset, ShortformAspectSpec>
> = Object.freeze({
  "9:16": Object.freeze({
    preset: "9:16",
    width: 1080,
    height: 1920,
    labelKo: "9:16 세로 숏폼 (1080×1920)",
    labelEn: "9:16 Vertical Shorts (1080×1920)",
  }),
  "1:1": Object.freeze({
    preset: "1:1",
    width: 1080,
    height: 1080,
    labelKo: "1:1 정사각 피드 (1080×1080)",
    labelEn: "1:1 Square Feed (1080×1080)",
  }),
});

export interface ShortformSafeAreaPx {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface ShortformPlatformProfile {
  readonly id: ShortformPlatformId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultAspect: ShortformAspectPreset;
  readonly maxDurationSec: number;
  readonly maxFileSizeBytes: number;
  readonly recommendedFps: ShortformFps;
  /** 플랫폼 버튼·캡션 UI에 가리지 않는 안전 여백(px, 출력 해상도 기준). */
  readonly safeAreaPx: ShortformSafeAreaPx;
}

export const SHORTFORM_PLATFORM_PROFILES: Readonly<
  Record<ShortformPlatformId, ShortformPlatformProfile>
> = Object.freeze({
  "youtube-shorts": Object.freeze({
    id: "youtube-shorts",
    labelKo: "유튜브 쇼츠",
    labelEn: "YouTube Shorts",
    defaultAspect: "9:16",
    maxDurationSec: 60,
    maxFileSizeBytes: 256 * 1024 * 1024,
    recommendedFps: 60,
    safeAreaPx: Object.freeze({ top: 180, bottom: 380, left: 64, right: 140 }),
  }),
  "instagram-reels": Object.freeze({
    id: "instagram-reels",
    labelKo: "인스타 릴스",
    labelEn: "Instagram Reels",
    defaultAspect: "9:16",
    maxDurationSec: 90,
    maxFileSizeBytes: 250 * 1024 * 1024,
    recommendedFps: 30,
    safeAreaPx: Object.freeze({ top: 210, bottom: 420, left: 64, right: 144 }),
  }),
  "x-short": Object.freeze({
    id: "x-short",
    labelKo: "X(트위터) 숏폼",
    labelEn: "X Short Video",
    defaultAspect: "9:16",
    maxDurationSec: 140,
    maxFileSizeBytes: 512 * 1024 * 1024,
    recommendedFps: 30,
    safeAreaPx: Object.freeze({ top: 120, bottom: 260, left: 56, right: 88 }),
  }),
  "instagram-square": Object.freeze({
    id: "instagram-square",
    labelKo: "인스타·X 1:1 피드",
    labelEn: "Instagram / X 1:1 Feed",
    defaultAspect: "1:1",
    maxDurationSec: 60,
    maxFileSizeBytes: 150 * 1024 * 1024,
    recommendedFps: 30,
    safeAreaPx: Object.freeze({ top: 72, bottom: 136, left: 64, right: 64 }),
  }),
});

export interface ManuscriptStageSnapshot {
  readonly id: string;
  readonly stage: WebtoonProcessStage;
  readonly width: number;
  readonly height: number;
  readonly capturedAtMs?: number;
  readonly historyIndex?: number;
  readonly label?: string;
  readonly strokeCount?: number;
  readonly available?: boolean;
}

export interface ShortformCutBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShortformCutInput {
  readonly cutId: string;
  readonly index?: number;
  readonly bounds: ShortformCutBounds;
  /** 원고 좌표계 기준 시선 중심점(px). 생략 시 컷 중앙을 사용한다. */
  readonly focalPoint?: { readonly x: number; readonly y: number };
  /** 컷별 홍보 자막/후크 문구(선택). */
  readonly captionText?: string;
  /** 연출 비중(0.5..2.0, 기본 1.0). 클수록 해당 컷의 배정 시간이 늘어난다. */
  readonly dramaticWeight?: number;
  readonly preferredMotion?: ShortformMotionMode;
}

export interface ShortformPlannerInput {
  readonly title: string;
  readonly manuscriptWidth: number;
  readonly manuscriptHeight: number;
  readonly stageSnapshots: readonly ManuscriptStageSnapshot[];
  readonly cuts?: readonly ShortformCutInput[];
  readonly aspectPreset?: ShortformAspectPreset;
  readonly platform?: ShortformPlatformId;
  readonly fps?: ShortformFps;
  readonly targetDurationSec?: number;
  readonly dissolveDurationMs?: number;
  readonly cameraIntensity?: ShortformCameraIntensity;
  readonly codec?: ShortformCodecId;
  /** true이면 카메라 팬·줌을 고정하고 부드러운 공정 디졸브만 수행한다. */
  readonly reducedMotion?: boolean;
  /** 마지막 완성 컷 정지 여운(ms, 기본 1800ms). */
  readonly finalHeroHoldMs?: number;
}

export interface CameraViewportKey {
  /** 원고 내 카메라 중심 X (0..1 정규화). */
  readonly centerX01: number;
  /** 원고 내 카메라 중심 Y (0..1 정규화). */
  readonly centerY01: number;
  /** 1.0 = 출력 프레임에 컷이 정확히 맞춰진 기준 배율, > 1.0 = 줌인. */
  readonly zoom: number;
}

export interface ShortformCropRectPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShortformTimelineSegment {
  readonly segmentId: string;
  readonly order: number;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly fromStage: WebtoonProcessStage;
  readonly toStage: WebtoonProcessStage;
  readonly isFinalShowcase: boolean;
  readonly startMs: number;
  readonly endMs: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly dissolveStartMs: number;
  readonly dissolveEndMs: number;
  readonly cameraMotionMode: Exclude<ShortformMotionMode, "auto">;
  readonly cameraStart: CameraViewportKey;
  readonly cameraEnd: CameraViewportKey;
}

export interface ShortformCameraKeyframe {
  readonly frameIndex: number;
  readonly timeMs: number;
  readonly segmentId: string;
  readonly cutId: string;
  readonly fromStage: WebtoonProcessStage;
  readonly toStage: WebtoonProcessStage;
  /** 0 = fromStage 100%, 1 = toStage 100%. */
  readonly dissolveAlpha: number;
  readonly camera: CameraViewportKey;
  readonly cropRectPx: ShortformCropRectPx;
}

export interface ShortformSubtitleCue {
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly stage: WebtoonProcessStage;
  readonly cutId: string;
  readonly text: string;
  readonly position: "lower-safe" | "upper-safe";
  readonly safeBottomInsetPx: number;
  readonly safeZoneVerified: boolean;
}

export interface ShortformEncodingEstimate {
  readonly codec: ShortformCodecId;
  readonly mimeType: string;
  readonly videoBitsPerSecond: number;
  readonly estimatedVideoBytes: number;
  readonly estimatedSizeLabel: string;
  readonly estimatedMemoryPeakBytes: number;
  readonly estimatedLocalRenderSec: number;
  /** 로컬 브라우저 인코딩 기준 외부 서버/API 비용은 항상 0원. */
  readonly localCostKrw: 0;
  readonly withinDurationLimit: boolean;
  readonly withinFileSizeLimit: boolean;
  readonly warnings: readonly string[];
}

export interface ShortformTimelinePlan {
  readonly title: string;
  readonly manuscriptWidth: number;
  readonly manuscriptHeight: number;
  readonly aspectPreset: ShortformAspectPreset;
  readonly width: number;
  readonly height: number;
  readonly fps: ShortformFps;
  readonly platform: ShortformPlatformProfile;
  readonly cameraIntensity: ShortformCameraIntensity;
  readonly reducedMotion: boolean;
  readonly totalDurationMs: number;
  readonly totalFrames: number;
  readonly activeStages: readonly WebtoonProcessStage[];
  readonly stageSnapshots: readonly ManuscriptStageSnapshot[];
  readonly cuts: readonly ShortformCutInput[];
  readonly segments: readonly ShortformTimelineSegment[];
  readonly keyframes: readonly ShortformCameraKeyframe[];
  readonly subtitleCues: readonly ShortformSubtitleCue[];
  readonly encodingEstimate: ShortformEncodingEstimate;
}

export interface ShortformEvaluatedFrame {
  readonly timeMs: number;
  readonly frameIndex: number;
  readonly progress01: number;
  readonly segmentId: string | null;
  readonly cutId: string | null;
  readonly fromStage: WebtoonProcessStage | null;
  readonly toStage: WebtoonProcessStage | null;
  readonly dissolveAlpha: number;
  readonly camera: CameraViewportKey;
  readonly cropRectPx: ShortformCropRectPx;
  readonly activeSubtitle: ShortformSubtitleCue | null;
}
