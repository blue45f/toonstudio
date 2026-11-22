/**
 * 공정별(콘티→선화→밑색→명암→식자) ₩0 로컬 타임랩스 & SNS 9:16·1:1 숏폼 프리뷰 플래너 엔진.
 *
 * 외부 서버 렌더링 없이 브라우저 로컬 WebCodecs/MediaRecorder(₩0)에서 바로 재생·내보내기할 수 있는
 * 카메라 팬·줌·공정 크로스디졸브 키프레임 타임라인과 안전 여백 자막 큐를 결정적으로 산출한다.
 */

import {
  estimateShortformEncoding,
  exportShortformSubtitlesSrt,
  exportShortformSubtitlesWebVtt,
  renderShortformFrameWithEvaluation,
  type ShortformCanvasStageSource,
} from "./timelapse-shortform-renderer";
import {
  SHORTFORM_ASPECT_SPECS,
  SHORTFORM_PLATFORM_PROFILES,
  WEBTOON_PROCESS_STAGES,
  WEBTOON_PROCESS_STAGE_BY_ID,
  type CameraViewportKey,
  type ManuscriptStageSnapshot,
  type ShortformAspectPreset,
  type ShortformCameraIntensity,
  type ShortformCameraKeyframe,
  type ShortformCodecId,
  type ShortformCropRectPx,
  type ShortformCutInput,
  type ShortformEvaluatedFrame,
  type ShortformFps,
  type ShortformMotionMode,
  type ShortformPlannerInput,
  type ShortformPlatformId,
  type ShortformSubtitleCue,
  type ShortformTimelinePlan,
  type ShortformTimelineSegment,
  type WebtoonProcessStage,
} from "./timelapse-stage-types";

export {
  exportShortformSubtitlesSrt,
  exportShortformSubtitlesWebVtt,
  type ShortformCanvasStageSource,
};

const STAGE_ORDER_INDEX: Readonly<Record<WebtoonProcessStage, number>> = {
  conti: 0,
  lineart: 1,
  "flat-color": 2,
  shading: 3,
  lettering: 4,
};

const CAMERA_INTENSITY_FACTOR: Readonly<
  Record<ShortformCameraIntensity, { readonly zoomBoost: number; readonly panSpan: number }>
> = {
  static: { zoomBoost: 0, panSpan: 0 },
  subtle: { zoomBoost: 0.08, panSpan: 0.05 },
  balanced: { zoomBoost: 0.16, panSpan: 0.11 },
  cinematic: { zoomBoost: 0.26, panSpan: 0.18 },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolvePlatform(
  platform: ShortformPlatformId | undefined,
  aspectPreset: ShortformAspectPreset,
): ShortformPlatformId {
  if (platform) return platform;
  return aspectPreset === "1:1" ? "instagram-square" : "youtube-shorts";
}

function resolveAspectPreset(
  aspectPreset: ShortformAspectPreset | undefined,
  platform: ShortformPlatformId | undefined,
): ShortformAspectPreset {
  if (aspectPreset) return aspectPreset;
  if (platform) return SHORTFORM_PLATFORM_PROFILES[platform].defaultAspect;
  return "9:16";
}

/**
 * 공정 스냅샷을 표준 웹툰 제작 순서(콘티→선화→밑색→명암→식자)로 정규화하고 중복 공정을 정리한다.
 */
export function normalizeProcessStageSnapshots(
  snapshots: readonly ManuscriptStageSnapshot[],
  manuscriptWidth: number,
  manuscriptHeight: number,
): readonly ManuscriptStageSnapshot[] {
  const safeW = Math.max(64, Math.round(Number.isFinite(manuscriptWidth) ? manuscriptWidth : 1080));
  const safeH = Math.max(64, Math.round(Number.isFinite(manuscriptHeight) ? manuscriptHeight : 1920));
  const chosen = new Map<WebtoonProcessStage, ManuscriptStageSnapshot>();

  for (let i = 0; i < snapshots.length; i += 1) {
    const snap = snapshots[i];
    if (!snap || snap.available === false) continue;
    const normalized: ManuscriptStageSnapshot = {
      ...snap,
      id: snap.id.trim() || `stage-${snap.stage}-${i}`,
      width: Math.max(64, Math.round(Number.isFinite(snap.width) && snap.width > 0 ? snap.width : safeW)),
      height: Math.max(64, Math.round(Number.isFinite(snap.height) && snap.height > 0 ? snap.height : safeH)),
    };
    const prev = chosen.get(normalized.stage);
    if (!prev || (normalized.capturedAtMs ?? -1) >= (prev.capturedAtMs ?? -1)) {
      chosen.set(normalized.stage, normalized);
    }
  }

  return Object.freeze(
    [...chosen.values()].sort(
      (a, b) => STAGE_ORDER_INDEX[a.stage] - STAGE_ORDER_INDEX[b.stage],
    ),
  );
}

/**
 * 컷 배열을 원고 경계 내부로 클램프하고, 컷이 비어 있으면 세로 원고 비율에 맞춰 자동 하이라이트 컷을 생성한다.
 */
export function normalizeShortformCuts(
  cuts: readonly ShortformCutInput[] | undefined,
  manuscriptWidth: number,
  manuscriptHeight: number,
): readonly ShortformCutInput[] {
  const safeW = Math.max(64, Math.round(Number.isFinite(manuscriptWidth) ? manuscriptWidth : 1080));
  const safeH = Math.max(64, Math.round(Number.isFinite(manuscriptHeight) ? manuscriptHeight : 1920));

  if (cuts && cuts.length > 0) {
    const normalized: ShortformCutInput[] = [];
    for (let i = 0; i < cuts.length; i += 1) {
      const cut = cuts[i];
      if (!cut) continue;
      const x = clamp(cut.bounds.x, 0, safeW - 1);
      const y = clamp(cut.bounds.y, 0, safeH - 1);
      const width = clamp(cut.bounds.width, 16, safeW - x);
      const height = clamp(cut.bounds.height, 16, safeH - y);
      const focalX = cut.focalPoint ? clamp(cut.focalPoint.x, x, x + width) : x + width / 2;
      const focalY = cut.focalPoint ? clamp(cut.focalPoint.y, y, y + height) : y + height / 2;
      normalized.push({
        cutId: cut.cutId.trim() || `cut-${i + 1}`,
        index: cut.index ?? i,
        bounds: { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) },
        focalPoint: { x: Math.round(focalX), y: Math.round(focalY) },
        captionText: cut.captionText?.trim() || undefined,
        dramaticWeight: clamp(cut.dramaticWeight ?? 1, 0.5, 2.0),
        preferredMotion: cut.preferredMotion ?? "auto",
      });
    }
    if (normalized.length > 0) {
      return Object.freeze(normalized.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)));
    }
  }

  const sliceCount = safeH >= safeW * 2.2 ? 3 : safeH >= safeW * 1.45 ? 2 : 1;
  const sliceHeight = safeH / sliceCount;
  const synthetic: ShortformCutInput[] = [];
  for (let i = 0; i < sliceCount; i += 1) {
    const y = Math.round(i * sliceHeight);
    const height = Math.max(16, Math.round(i === sliceCount - 1 ? safeH - y : sliceHeight));
    synthetic.push({
      cutId: `auto-cut-${i + 1}`,
      index: i,
      bounds: { x: 0, y, width: safeW, height },
      focalPoint: { x: Math.round(safeW / 2), y: Math.round(y + height / 2) },
      dramaticWeight: i === sliceCount - 1 ? 1.15 : 1.0,
      preferredMotion: sliceCount > 1 ? "vertical-pan" : "ken-burns-zoom-in",
    });
  }
  return Object.freeze(synthetic);
}

/**
 * 카메라 중심·배율로부터 출력 종횡비에 일치하며 원고 바깥으로 벗어나지 않는 픽셀 크롭 사각형을 계산한다.
 */
export function computeSafeCropRectPx(
  manuscriptWidth: number,
  manuscriptHeight: number,
  outputWidth: number,
  outputHeight: number,
  camera: CameraViewportKey,
): ShortformCropRectPx {
  const mw = Math.max(1, manuscriptWidth);
  const mh = Math.max(1, manuscriptHeight);
  const targetRatio = Math.max(0.1, outputWidth / Math.max(1, outputHeight));
  const zoom = clamp(camera.zoom, 1, 3.5);

  let baseCropW = mw;
  let baseCropH = baseCropW / targetRatio;
  if (baseCropH > mh) {
    baseCropH = mh;
    baseCropW = baseCropH * targetRatio;
  }

  const cropW = clamp(baseCropW / zoom, 1, mw);
  const cropH = clamp(baseCropH / zoom, 1, mh);
  const centerX = clamp(camera.centerX01, 0, 1) * mw;
  const centerY = clamp(camera.centerY01, 0, 1) * mh;
  const x = clamp(centerX - cropW / 2, 0, Math.max(0, mw - cropW));
  const y = clamp(centerY - cropH / 2, 0, Math.max(0, mh - cropH));

  return { x: roundTo(x, 2), y: roundTo(y, 2), width: roundTo(cropW, 2), height: roundTo(cropH, 2) };
}

function resolveMotionMode(
  cut: ShortformCutInput,
  segmentOrder: number,
  isFinalShowcase: boolean,
): Exclude<ShortformMotionMode, "auto"> {
  if (isFinalShowcase) return "hero-reveal";
  if (cut.preferredMotion && cut.preferredMotion !== "auto") return cut.preferredMotion;
  return cut.bounds.height / Math.max(1, cut.bounds.width) >= 1.35
    ? "vertical-pan"
    : segmentOrder % 2 === 0
      ? "ken-burns-zoom-in"
      : "diagonal-drift";
}

function buildCameraTrajectory(params: {
  readonly cut: ShortformCutInput;
  readonly manuscriptWidth: number;
  readonly manuscriptHeight: number;
  readonly motionMode: Exclude<ShortformMotionMode, "auto">;
  readonly intensity: ShortformCameraIntensity;
  readonly reducedMotion: boolean;
  readonly isFinalShowcase: boolean;
}): { readonly start: CameraViewportKey; readonly end: CameraViewportKey } {
  const { cut, manuscriptWidth, manuscriptHeight, motionMode, intensity, reducedMotion, isFinalShowcase } = params;
  const focalX01 = clamp((cut.focalPoint?.x ?? cut.bounds.x + cut.bounds.width / 2) / manuscriptWidth, 0.05, 0.95);
  const focalY01 = clamp((cut.focalPoint?.y ?? cut.bounds.y + cut.bounds.height / 2) / manuscriptHeight, 0.05, 0.95);
  const cutWidthCoverage = clamp(manuscriptWidth / Math.max(1, cut.bounds.width), 1, 2.2);
  const baseZoom = isFinalShowcase ? 1.02 : roundTo(clamp(1 + (cutWidthCoverage - 1) * 0.45, 1.0, 1.8), 4);

  if (reducedMotion || intensity === "static") {
    const fixed: CameraViewportKey = { centerX01: roundTo(focalX01, 4), centerY01: roundTo(focalY01, 4), zoom: baseZoom };
    return { start: fixed, end: fixed };
  }

  const profile = CAMERA_INTENSITY_FACTOR[intensity];
  const panX = Math.min(profile.panSpan, clamp((cut.bounds.width / manuscriptWidth) * 0.5, 0.04, 0.45) * 0.55);
  const panY = Math.min(profile.panSpan, clamp((cut.bounds.height / manuscriptHeight) * 0.5, 0.04, 0.45) * 0.65);

  if (motionMode === "hero-reveal") {
    return {
      start: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(focalY01, 4), zoom: roundTo(baseZoom + profile.zoomBoost * 0.75, 4) },
      end: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(focalY01, 4), zoom: roundTo(Math.max(1, baseZoom), 4) },
    };
  }
  if (motionMode === "vertical-pan") {
    return {
      start: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(clamp(focalY01 - panY, 0.05, 0.95), 4), zoom: roundTo(baseZoom + profile.zoomBoost * 0.35, 4) },
      end: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(clamp(focalY01 + panY, 0.05, 0.95), 4), zoom: roundTo(baseZoom + profile.zoomBoost * 0.85, 4) },
    };
  }
  if (motionMode === "diagonal-drift") {
    return {
      start: { centerX01: roundTo(clamp(focalX01 - panX, 0.05, 0.95), 4), centerY01: roundTo(clamp(focalY01 - panY * 0.7, 0.05, 0.95), 4), zoom: roundTo(baseZoom + profile.zoomBoost * 0.25, 4) },
      end: { centerX01: roundTo(clamp(focalX01 + panX, 0.05, 0.95), 4), centerY01: roundTo(clamp(focalY01 + panY * 0.7, 0.05, 0.95), 4), zoom: roundTo(baseZoom + profile.zoomBoost, 4) },
    };
  }
  return {
    start: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(focalY01, 4), zoom: roundTo(baseZoom, 4) },
    end: { centerX01: roundTo(focalX01, 4), centerY01: roundTo(focalY01, 4), zoom: roundTo(baseZoom + profile.zoomBoost, 4) },
  };
}

function buildSubtitleCues(
  segments: readonly ShortformTimelineSegment[],
  cutsById: ReadonlyMap<string, ShortformCutInput>,
  safeBottomInsetPx: number,
  outputHeight: number,
  title: string,
): readonly ShortformSubtitleCue[] {
  const cues: ShortformSubtitleCue[] = [];
  const safeZoneVerified = safeBottomInsetPx > 0 && safeBottomInsetPx < outputHeight * 0.45;
  const cleanTitle = title.trim();

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (!seg) continue;
    const cut = cutsById.get(seg.cutId);
    const stageSpec = WEBTOON_PROCESS_STAGE_BY_ID[seg.toStage];
    const fromSpec = WEBTOON_PROCESS_STAGE_BY_ID[seg.fromStage];
    let text: string;
    if (seg.isFinalShowcase) {
      text = cleanTitle ? `${cleanTitle} · 완성본 공개` : `${stageSpec.labelKo} 최종 완성본`;
    } else if (cut?.captionText) {
      text = `${stageSpec.shortBadgeKo} · ${cut.captionText}`;
    } else if (seg.fromStage !== seg.toStage) {
      text = `${fromSpec.labelKo} → ${stageSpec.labelKo} · ${stageSpec.defaultCaptionKo.split("·")[1]?.trim() ?? stageSpec.labelKo}`;
    } else {
      text = stageSpec.defaultCaptionKo;
    }

    const startMs = seg.startMs;
    const endMs = Math.min(seg.endMs, Math.max(startMs + 250, seg.endMs - 80));
    cues.push({
      index: i + 1,
      startMs,
      endMs,
      stage: seg.toStage,
      cutId: seg.cutId,
      text,
      position: "lower-safe",
      safeBottomInsetPx,
      safeZoneVerified,
    });
  }

  return Object.freeze(cues);
}

/**
 * 공정 스냅샷(콘티→선화→밑색→명암→식자)과 컷 배열을 입력받아
 * 9:16(1080×1920) 또는 1:1(1080×1080), 30/60fps 숏폼 타임랩스 프리뷰 타임라인 플랜을 생성한다.
 */
export function planLocalTimelapseShortform(
  input: ShortformPlannerInput,
): ShortformTimelinePlan {
  const aspectPreset = resolveAspectPreset(input.aspectPreset, input.platform);
  const aspectSpec = SHORTFORM_ASPECT_SPECS[aspectPreset];
  const platform = SHORTFORM_PLATFORM_PROFILES[resolvePlatform(input.platform, aspectPreset)];
  const fps: ShortformFps = input.fps === 60 ? 60 : 30;
  const codec: ShortformCodecId = input.codec ?? "vp9";
  const reducedMotion = Boolean(input.reducedMotion);
  const cameraIntensity: ShortformCameraIntensity = reducedMotion
    ? "static"
    : (input.cameraIntensity ?? "balanced");

  const manuscriptWidth = Math.max(64, Math.round(Number.isFinite(input.manuscriptWidth) ? input.manuscriptWidth : aspectSpec.width));
  const manuscriptHeight = Math.max(64, Math.round(Number.isFinite(input.manuscriptHeight) ? input.manuscriptHeight : aspectSpec.height));
  const stageSnapshots = normalizeProcessStageSnapshots(input.stageSnapshots, manuscriptWidth, manuscriptHeight);
  const cuts = normalizeShortformCuts(input.cuts, manuscriptWidth, manuscriptHeight);
  const cutsById = new Map<string, ShortformCutInput>(cuts.map((c) => [c.cutId, c]));

  const targetTotalMs = Math.round(clamp(input.targetDurationSec ?? 30, 5, 90) * 1000);
  const requestedDissolveMs = Math.round(clamp(input.dissolveDurationMs ?? 450, 120, 1200));
  const activeStages: WebtoonProcessStage[] =
    stageSnapshots.length > 0 ? stageSnapshots.map((s) => s.stage) : WEBTOON_PROCESS_STAGES.map((s) => s.id);
  const finalStage = activeStages[activeStages.length - 1] ?? "lettering";
  const finalHeroHoldMs = Math.round(
    clamp(input.finalHeroHoldMs ?? Math.min(2200, targetTotalMs * 0.14), 600, targetTotalMs * 0.35),
  );
  const processBudgetMs = Math.max(1000, targetTotalMs - finalHeroHoldMs);

  const blueprints = activeStages.map((toStage, i) => {
    const fromStage = i === 0 ? toStage : (activeStages[i - 1] ?? toStage);
    const cutIndex = i % cuts.length;
    const cut = cuts[cutIndex] ?? cuts[0];
    const weight = WEBTOON_PROCESS_STAGE_BY_ID[toStage].defaultWeight * (0.65 + 0.35 * (cut?.dramaticWeight ?? 1));
    return { cut, cutIndex, fromStage, toStage, weight };
  });

  const totalWeight = blueprints.reduce((sum, item) => sum + item.weight, 0) || 1;
  const segments: ShortformTimelineSegment[] = [];
  let cursorMs = 0;

  for (let i = 0; i < blueprints.length; i += 1) {
    const bp = blueprints[i];
    if (!bp?.cut) continue;
    const rawDur =
      i === blueprints.length - 1
        ? Math.max(400, processBudgetMs - cursorMs)
        : Math.max(400, Math.round((bp.weight / totalWeight) * processBudgetMs));
    const startMs = cursorMs;
    const endMs = startMs + rawDur;
    const actualDissolveMs = bp.fromStage !== bp.toStage ? Math.min(requestedDissolveMs, Math.round(rawDur * 0.4)) : 0;
    const motionMode = resolveMotionMode(bp.cut, i, false);
    const trajectory = buildCameraTrajectory({
      cut: bp.cut,
      manuscriptWidth,
      manuscriptHeight,
      motionMode,
      intensity: cameraIntensity,
      reducedMotion,
      isFinalShowcase: false,
    });
    segments.push({
      segmentId: `seg-${i + 1}-${bp.toStage}`,
      order: i,
      cutId: bp.cut.cutId,
      cutIndex: bp.cutIndex,
      fromStage: bp.fromStage,
      toStage: bp.toStage,
      isFinalShowcase: false,
      startMs,
      endMs,
      startFrame: Math.round((startMs / 1000) * fps),
      endFrame: Math.round((endMs / 1000) * fps),
      dissolveStartMs: startMs,
      dissolveEndMs: startMs + actualDissolveMs,
      cameraMotionMode: motionMode,
      cameraStart: trajectory.start,
      cameraEnd: trajectory.end,
    });
    cursorMs = endMs;
  }

  const heroCutIndex = Math.max(0, cuts.length - 1);
  const heroCut = cuts[heroCutIndex] ?? cuts[0];
  if (heroCut) {
    const startMs = cursorMs;
    const endMs = startMs + finalHeroHoldMs;
    const trajectory = buildCameraTrajectory({
      cut: heroCut,
      manuscriptWidth,
      manuscriptHeight,
      motionMode: "hero-reveal",
      intensity: cameraIntensity,
      reducedMotion,
      isFinalShowcase: true,
    });
    segments.push({
      segmentId: `seg-${segments.length + 1}-hero-showcase`,
      order: segments.length,
      cutId: heroCut.cutId,
      cutIndex: heroCutIndex,
      fromStage: finalStage,
      toStage: finalStage,
      isFinalShowcase: true,
      startMs,
      endMs,
      startFrame: Math.round((startMs / 1000) * fps),
      endFrame: Math.round((endMs / 1000) * fps),
      dissolveStartMs: startMs,
      dissolveEndMs: startMs,
      cameraMotionMode: "hero-reveal",
      cameraStart: trajectory.start,
      cameraEnd: trajectory.end,
    });
    cursorMs = endMs;
  }

  const totalDurationMs = cursorMs;
  const totalFrames = Math.max(1, Math.round((totalDurationMs / 1000) * fps));

  const keyframes: ShortformCameraKeyframe[] = [];
  for (const seg of segments) {
    const sampleTimes = new Set<number>([seg.startMs, seg.endMs]);
    if (seg.dissolveEndMs > seg.dissolveStartMs) {
      sampleTimes.add(Math.round((seg.dissolveStartMs + seg.dissolveEndMs) / 2));
      sampleTimes.add(seg.dissolveEndMs);
    }
    const segSpan = Math.max(1, seg.endMs - seg.startMs);
    for (const timeMs of [...sampleTimes].sort((a, b) => a - b)) {
      const easedT = easeInOutCubic((timeMs - seg.startMs) / segSpan);
      const camera: CameraViewportKey = {
        centerX01: roundTo(lerp(seg.cameraStart.centerX01, seg.cameraEnd.centerX01, easedT), 4),
        centerY01: roundTo(lerp(seg.cameraStart.centerY01, seg.cameraEnd.centerY01, easedT), 4),
        zoom: roundTo(lerp(seg.cameraStart.zoom, seg.cameraEnd.zoom, easedT), 4),
      };
      const dissolveAlpha =
        seg.dissolveEndMs > seg.dissolveStartMs
          ? roundTo(easeInOutCubic((timeMs - seg.dissolveStartMs) / (seg.dissolveEndMs - seg.dissolveStartMs)), 4)
          : 1;
      const prev = keyframes[keyframes.length - 1];
      if (prev && prev.timeMs === timeMs && prev.segmentId === seg.segmentId) continue;
      keyframes.push({
        frameIndex: Math.min(totalFrames, Math.round((timeMs / 1000) * fps)),
        timeMs,
        segmentId: seg.segmentId,
        cutId: seg.cutId,
        fromStage: seg.fromStage,
        toStage: seg.toStage,
        dissolveAlpha,
        camera,
        cropRectPx: computeSafeCropRectPx(manuscriptWidth, manuscriptHeight, aspectSpec.width, aspectSpec.height, camera),
      });
    }
  }

  return Object.freeze({
    title: input.title.trim() || "툰스튜디오 숏폼 타임랩스",
    manuscriptWidth,
    manuscriptHeight,
    aspectPreset,
    width: aspectSpec.width,
    height: aspectSpec.height,
    fps,
    platform,
    cameraIntensity,
    reducedMotion,
    totalDurationMs,
    totalFrames,
    activeStages: Object.freeze(activeStages),
    stageSnapshots,
    cuts,
    segments: Object.freeze(segments),
    keyframes: Object.freeze(keyframes),
    subtitleCues: buildSubtitleCues(segments, cutsById, platform.safeAreaPx.bottom, aspectSpec.height, input.title),
    encodingEstimate: estimateShortformEncoding({
      width: aspectSpec.width,
      height: aspectSpec.height,
      fps,
      totalDurationMs,
      codec,
      intensity: cameraIntensity,
      reducedMotion,
      stageCount: activeStages.length,
      platformMaxDurationSec: platform.maxDurationSec,
      platformMaxFileSizeBytes: platform.maxFileSizeBytes,
      platformLabelKo: platform.labelKo,
    }),
  });
}

/** 임의 재생 시각(ms)에서의 카메라 크롭, 공정 크로스디졸브 알파(0..1), 활성 자막 큐를 계산한다. */
export function evaluateShortformFrameAt(
  plan: ShortformTimelinePlan,
  timeMs: number,
): ShortformEvaluatedFrame {
  const clampedMs = Math.round(clamp(timeMs, 0, plan.totalDurationMs));
  const frameIndex = Math.min(plan.totalFrames, Math.round((clampedMs / 1000) * plan.fps));
  const progress01 = plan.totalDurationMs > 0 ? roundTo(clampedMs / plan.totalDurationMs, 4) : 0;
  const active =
    plan.segments.find((seg) => clampedMs < seg.endMs) ??
    plan.segments[plan.segments.length - 1];

  if (!active) {
    const fallbackCam: CameraViewportKey = { centerX01: 0.5, centerY01: 0.5, zoom: 1 };
    return {
      timeMs: clampedMs,
      frameIndex,
      progress01,
      segmentId: null,
      cutId: null,
      fromStage: null,
      toStage: null,
      dissolveAlpha: 1,
      camera: fallbackCam,
      cropRectPx: computeSafeCropRectPx(plan.manuscriptWidth, plan.manuscriptHeight, plan.width, plan.height, fallbackCam),
      activeSubtitle: null,
    };
  }

  const easedT = easeInOutCubic((clampedMs - active.startMs) / Math.max(1, active.endMs - active.startMs));
  const camera: CameraViewportKey = {
    centerX01: roundTo(lerp(active.cameraStart.centerX01, active.cameraEnd.centerX01, easedT), 4),
    centerY01: roundTo(lerp(active.cameraStart.centerY01, active.cameraEnd.centerY01, easedT), 4),
    zoom: roundTo(lerp(active.cameraStart.zoom, active.cameraEnd.zoom, easedT), 4),
  };
  const dissolveSpan = active.dissolveEndMs - active.dissolveStartMs;
  const dissolveAlpha =
    dissolveSpan > 0 ? roundTo(easeInOutCubic((clampedMs - active.dissolveStartMs) / dissolveSpan), 4) : 1;

  return {
    timeMs: clampedMs,
    frameIndex,
    progress01,
    segmentId: active.segmentId,
    cutId: active.cutId,
    fromStage: active.fromStage,
    toStage: active.toStage,
    dissolveAlpha,
    camera,
    cropRectPx: computeSafeCropRectPx(plan.manuscriptWidth, plan.manuscriptHeight, plan.width, plan.height, camera),
    activeSubtitle: plan.subtitleCues.find((cue) => clampedMs >= cue.startMs && clampedMs <= cue.endMs) ?? null,
  };
}

/** 로컬 Canvas2D 컨텍스트에 지정 시각의 숏폼 프레임을 합성한다. */
export function renderShortformPreviewFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  plan: ShortformTimelinePlan,
  timeMs: number,
  stageSources: Partial<Record<WebtoonProcessStage, ShortformCanvasStageSource>>,
  options: { readonly background?: string; readonly drawSubtitle?: boolean } = {},
): ShortformEvaluatedFrame {
  const frame = evaluateShortformFrameAt(plan, timeMs);
  return renderShortformFrameWithEvaluation(ctx, plan, frame, stageSources, options);
}
