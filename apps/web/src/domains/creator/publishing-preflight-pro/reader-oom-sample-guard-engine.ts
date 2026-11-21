/**
 * 독자 시선·이탈 예측 히트맵 · OOM/WebGPU 크래시 가드 · 10분 외주 3컷 샘플 검증 엔진.
 *
 * - 독자 시뮬레이터: 390×844 모바일 뷰포트 기준 텍스트 벽·연속 빈 여백·좌/우 엄지 가림 침범률 계산
 * - 크래시 가드: 힙 사용률(>78% 경고, >88% 비상) 및 WebGL/WebGPU 컨텍스트 손실 시 자동 보호 플랜 산출
 * - 외주 검증기: 본편 격리 3컷 샘플 발급 + 선폭(px)·OKLCH 색차(ΔE)·납기 속도(분) 자동 채점
 */

import type { EpisodeCutInput } from "./platform-preflight-reflow-engine";

export type ReaderHandedness = "right" | "left" | "both";

export interface ReaderViewportSpec {
  readonly widthPx: 390;
  readonly heightPx: 844;
  readonly rightThumbZone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly leftThumbZone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface ReaderHeatmapSegment {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly charCount: number;
  readonly textDensityScore: number;
  readonly isTextWall: boolean;
  readonly blankGapPx: number;
  readonly isBoredomGap: boolean;
  readonly rightThumbOcclusionPct: number;
  readonly leftThumbOcclusionPct: number;
  readonly activeThumbOcclusionPct: number;
  readonly dropOffRisk: number;
  readonly predictedRetentionPct: number;
  readonly riskLevel: "low" | "medium" | "high";
}

export interface ReaderImprovementPoint {
  readonly cutId: string;
  readonly cutOrder: number;
  readonly category: "text-wall" | "blank-gap" | "thumb-occlusion";
  readonly severity: "high" | "medium";
  readonly actionKo: string;
}

export interface ReaderRetentionAnalysis {
  readonly viewport: ReaderViewportSpec;
  readonly handedness: ReaderHandedness;
  readonly completionScore: number;
  readonly endingRetentionPct: number;
  readonly textWallCount: number;
  readonly boredomGapCount: number;
  readonly avgThumbOcclusionPct: number;
  readonly peakThumbOcclusionPct: number;
  readonly thumbOccludedCutCount: number;
  readonly scrollTempo: "fast" | "balanced" | "dragging";
  readonly heatmapSegments: readonly ReaderHeatmapSegment[];
  readonly recommendations: readonly ReaderImprovementPoint[];
}

export type CrashGuardDeviceClass = "low-spec-laptop" | "ipad" | "desktop";
export type TextureResolutionPx = 4096 | 2048 | 1024;
export type CrashGuardLevel = "HEALTHY" | "WARNING" | "EMERGENCY";

export interface CrashGuardTelemetry {
  readonly episodeId: string;
  readonly deviceClass: CrashGuardDeviceClass;
  readonly usedHeapMb: number;
  readonly heapLimitMb: number;
  readonly textureResolutionPx: TextureResolutionPx;
  readonly activeCacheMb: number;
  readonly idleLayerCacheMb: number;
  readonly undoStackFrames: number;
  readonly activeCutCount: number;
  readonly webglContextLost: boolean;
  readonly webgpuDeviceLost: boolean;
  readonly timestampIso?: string;
}

export interface EmergencyCheckpointSnapshot {
  readonly checkpointId: string;
  readonly episodeId: string;
  readonly storageTarget: "opfs-sqlite-wal";
  readonly reasonKo: string;
  readonly preservedCutCount: number;
  readonly recoveryPriority: "immediate" | "scheduled";
  readonly createdAtIso: string;
}

export interface TextureDownscaleAction {
  readonly applied: boolean;
  readonly fromPx: TextureResolutionPx;
  readonly toPx: TextureResolutionPx;
  readonly labelKo: string;
  readonly estimatedVramSavedMb: number;
}

export interface CacheReleaseStep {
  readonly stepId: string;
  readonly labelKo: string;
  readonly freedMb: number;
  readonly priority: "critical" | "normal";
}

export interface CrashGuardEvaluation {
  readonly level: CrashGuardLevel;
  readonly levelLabelKo: string;
  readonly memoryUsagePercent: number;
  readonly gpuContextLost: boolean;
  readonly triggerReasonsKo: readonly string[];
  readonly emergencyCheckpoint: EmergencyCheckpointSnapshot | null;
  readonly textureDownscale: TextureDownscaleAction;
  readonly cacheReleasePlan: readonly CacheReleaseStep[];
  readonly estimatedFreedMb: number;
  readonly projectedUsagePercent: number;
}

export interface OklchColor {
  readonly l: number; // 0..1
  readonly c: number; // 0..0.4
  readonly h: number; // 0..360 deg
}

export interface OutsourceSampleCutSpec {
  readonly sampleCutId: string;
  readonly titleKo: string;
  readonly focusKo: string;
  readonly targetLineWidthPx: number;
  readonly targetColor: OklchColor;
  readonly maxMinutes: number;
}

export interface OutsourceSamplePacket {
  readonly packetId: string;
  readonly applicantName: string;
  readonly region: "KR" | "SEA" | "GLOBAL";
  readonly mainEpisodeLeakProtected: true;
  readonly isolationPolicyKo: string;
  readonly watermarkToken: string;
  readonly expiresInMinutes: 10;
  readonly issuedAtIso: string;
  readonly cuts: readonly [OutsourceSampleCutSpec, OutsourceSampleCutSpec, OutsourceSampleCutSpec];
}

export interface OutsourceSampleCutSubmission {
  readonly sampleCutId: string;
  readonly submittedLineWidthPx: number;
  readonly submittedColor: OklchColor;
  readonly turnaroundMinutes: number;
}

export interface OutsourceSampleSubmission {
  readonly packetId: string;
  readonly applicantName: string;
  readonly cuts: readonly [
    OutsourceSampleCutSubmission,
    OutsourceSampleCutSubmission,
    OutsourceSampleCutSubmission,
  ];
}

export type OutsourceVerdict = "PASS" | "REVISE" | "HOLD";

export interface OutsourceCutScoreDetail {
  readonly sampleCutId: string;
  readonly titleKo: string;
  readonly lineWidthDeltaPx: number;
  readonly colorDeltaE: number;
  readonly turnaroundMinutes: number;
  readonly cutScore: number;
  readonly status: OutsourceVerdict;
}

export interface OutsourceSampleEvaluation {
  readonly packetId: string;
  readonly applicantName: string;
  readonly verdict: OutsourceVerdict;
  readonly verdictLabelKo: string;
  readonly totalScore: number;
  readonly avgLineWidthDeltaPx: number;
  readonly avgColorDeltaE: number;
  readonly totalTurnaroundMinutes: number;
  readonly lineWidthScore: number;
  readonly colorScore: number;
  readonly speedScore: number;
  readonly cutDetails: readonly OutsourceCutScoreDetail[];
  readonly feedbackKo: readonly string[];
}

export const MOBILE_READER_VIEWPORT: ReaderViewportSpec = {
  widthPx: 390,
  heightPx: 844,
  rightThumbZone: { x: 215, y: 560, width: 175, height: 284 },
  leftThumbZone: { x: 0, y: 560, width: 175, height: 284 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rectIntersectionArea(
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function computeBalloonThumbOcclusion(
  cut: EpisodeCutInput,
  zone: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): number {
  if (cut.balloons.length === 0 || cut.widthPx <= 0 || cut.heightPx <= 0) return 0;
  const scaleX = MOBILE_READER_VIEWPORT.widthPx / cut.widthPx;
  const scaleY = MOBILE_READER_VIEWPORT.heightPx / cut.heightPx;
  let totalBalloonArea = 0;
  let occludedArea = 0;

  for (const balloon of cut.balloons) {
    const bx = balloon.x * scaleX;
    // 컷 내부 상대 세로 위치를 390×844 모바일 뷰포트 세로축에 투영해 하단 엄지 침범 비율을 계산한다.
    const by = balloon.y * scaleY;
    const bw = Math.max(1, balloon.width * scaleX);
    const bh = Math.max(1, balloon.height * scaleY);
    const area = bw * bh;
    totalBalloonArea += area;
    occludedArea += rectIntersectionArea({ x: bx, y: by, width: bw, height: bh }, zone);
  }

  if (totalBalloonArea <= 0) return 0;
  return roundTo(clamp((occludedArea / totalBalloonArea) * 100, 0, 100), 1);
}

export function analyzeReaderRetentionHeatmap(
  cuts: readonly EpisodeCutInput[],
  handedness: ReaderHandedness = "right",
): ReaderRetentionAnalysis {
  const sortedCuts = [...cuts].sort((a, b) => a.order - b.order);
  const segments: ReaderHeatmapSegment[] = [];
  const recommendations: ReaderImprovementPoint[] = [];

  let retention = 100;
  let consecutiveSparsePx = 0;
  let textWallCount = 0;
  let boredomGapCount = 0;
  let thumbOccludedCutCount = 0;
  let sumThumbOcclusion = 0;
  let peakThumbOcclusionPct = 0;

  for (const cut of sortedCuts) {
    const charCount = cut.balloons.reduce((acc, b) => acc + b.text.replace(/\s+/gu, "").length, 0);
    const maxSingleBalloonChars = cut.balloons.reduce(
      (maxChars, b) => Math.max(maxChars, b.text.replace(/\s+/gu, "").length),
      0,
    );
    const areaUnits = Math.max(1, (cut.widthPx * cut.heightPx) / 100_000);
    const textDensityScore = roundTo(clamp((charCount / areaUnits) * 8, 0, 100), 1);
    const isTextWall = charCount >= 88 || maxSingleBalloonChars >= 55;

    const blankGapPx = Math.max(0, cut.blankGapBelowPx ?? 120);
    if (charCount === 0 && cut.actionIntensity < 55) {
      consecutiveSparsePx += blankGapPx + Math.round(cut.heightPx * 0.25);
    } else {
      consecutiveSparsePx = blankGapPx;
    }
    const isBoredomGap = blankGapPx >= 640 || consecutiveSparsePx >= 1200;

    const rightThumbOcclusionPct = computeBalloonThumbOcclusion(cut, MOBILE_READER_VIEWPORT.rightThumbZone);
    const leftThumbOcclusionPct = computeBalloonThumbOcclusion(cut, MOBILE_READER_VIEWPORT.leftThumbZone);
    const activeThumbOcclusionPct =
      handedness === "right"
        ? rightThumbOcclusionPct
        : handedness === "left"
          ? leftThumbOcclusionPct
          : Math.max(rightThumbOcclusionPct, leftThumbOcclusionPct);

    sumThumbOcclusion += activeThumbOcclusionPct;
    if (activeThumbOcclusionPct > peakThumbOcclusionPct) {
      peakThumbOcclusionPct = activeThumbOcclusionPct;
    }

    let dropOffRisk = 6;
    if (isTextWall) {
      textWallCount += 1;
      dropOffRisk += 38;
      recommendations.push({
        cutId: cut.cutId,
        cutOrder: cut.order,
        category: "text-wall",
        severity: "high",
        actionKo: `${cut.order}컷 대사가 ${charCount}자로 밀집된 텍스트 벽입니다. 2컷으로 나누거나 대사를 35% 이상 덜어내세요.`,
      });
    }
    if (isBoredomGap) {
      boredomGapCount += 1;
      dropOffRisk += 28;
      recommendations.push({
        cutId: cut.cutId,
        cutOrder: cut.order,
        category: "blank-gap",
        severity: "medium",
        actionKo: `${cut.order}컷 하단 여백(${blankGapPx}px)이 길어 스크롤 호흡이 처집니다. 여백을 320px 이하로 당기거나 효과음을 넣으세요.`,
      });
    }
    if (activeThumbOcclusionPct >= 20) {
      thumbOccludedCutCount += 1;
      dropOffRisk += Math.round(activeThumbOcclusionPct * 0.45);
      recommendations.push({
        cutId: cut.cutId,
        cutOrder: cut.order,
        category: "thumb-occlusion",
        severity: activeThumbOcclusionPct >= 45 ? "high" : "medium",
        actionKo: `${cut.order}컷 말풍선이 390×844 모바일 엄지 영역에 ${activeThumbOcclusionPct}% 가립니다. 말풍선을 상단 60% 안으로 올리세요.`,
      });
    }

    // 핵심 감정·액션 비트는 이탈 위험을 낮춘다.
    if (cut.isKeyBeat || cut.emotionIntensity >= 85) {
      dropOffRisk = Math.max(4, dropOffRisk - 10);
    }

    dropOffRisk = clamp(dropOffRisk, 0, 100);
    const cutDecay = 0.14 + (dropOffRisk > 25 ? (dropOffRisk - 25) * 0.085 : 0);
    retention = clamp(roundTo(retention - cutDecay, 1), 12, 100);

    const riskLevel: "low" | "medium" | "high" =
      dropOffRisk >= 45 ? "high" : dropOffRisk >= 22 ? "medium" : "low";

    segments.push({
      cutId: cut.cutId,
      cutOrder: cut.order,
      charCount,
      textDensityScore,
      isTextWall,
      blankGapPx,
      isBoredomGap,
      rightThumbOcclusionPct,
      leftThumbOcclusionPct,
      activeThumbOcclusionPct,
      dropOffRisk,
      predictedRetentionPct: retention,
      riskLevel,
    });
  }

  const avgThumbOcclusionPct =
    sortedCuts.length > 0 ? roundTo(sumThumbOcclusion / sortedCuts.length, 1) : 0;

  const avgBlankGap =
    sortedCuts.length > 0
      ? sortedCuts.reduce((acc, cut) => acc + Math.max(0, cut.blankGapBelowPx ?? 120), 0) / sortedCuts.length
      : 120;

  const scrollTempo: "fast" | "balanced" | "dragging" =
    boredomGapCount >= 2 || avgBlankGap >= 380 ? "dragging" : avgBlankGap <= 110 && textWallCount === 0 ? "fast" : "balanced";

  const penalty =
    textWallCount * 11 +
    boredomGapCount * 8 +
    thumbOccludedCutCount * 7 +
    Math.round(avgThumbOcclusionPct * 0.4);
  const completionScore = clamp(Math.round(100 - penalty), 0, 100);

  return {
    viewport: MOBILE_READER_VIEWPORT,
    handedness,
    completionScore,
    endingRetentionPct: retention,
    textWallCount,
    boredomGapCount,
    avgThumbOcclusionPct,
    peakThumbOcclusionPct: roundTo(peakThumbOcclusionPct, 1),
    thumbOccludedCutCount,
    scrollTempo,
    heatmapSegments: segments,
    recommendations,
  };
}

function estimateVramForTexture(resolutionPx: TextureResolutionPx): number {
  if (resolutionPx === 4096) return 640;
  if (resolutionPx === 2048) return 180;
  return 55;
}

export function evaluateCrashGuardState(telemetry: CrashGuardTelemetry): CrashGuardEvaluation {
  const safeLimitMb = Math.max(256, telemetry.heapLimitMb);
  const memoryUsagePercent = roundTo(clamp((telemetry.usedHeapMb / safeLimitMb) * 100, 0, 100), 1);
  const gpuContextLost = telemetry.webglContextLost || telemetry.webgpuDeviceLost;

  const triggerReasonsKo: string[] = [];
  if (memoryUsagePercent > 88) {
    triggerReasonsKo.push(`메모리 사용률 ${memoryUsagePercent}%로 비상 임계치(88%) 초과`);
  } else if (memoryUsagePercent > 78) {
    triggerReasonsKo.push(`메모리 사용률 ${memoryUsagePercent}%로 경고 임계치(78%) 초과`);
  }
  if (telemetry.webglContextLost) {
    triggerReasonsKo.push("WebGL 렌더링 컨텍스트 손실(webglcontextlost) 감지");
  }
  if (telemetry.webgpuDeviceLost) {
    triggerReasonsKo.push("WebGPU GPU 장치 손실(device.lost) 감지");
  }

  const level: CrashGuardLevel =
    memoryUsagePercent > 88 || gpuContextLost
      ? "EMERGENCY"
      : memoryUsagePercent > 78
        ? "WARNING"
        : "HEALTHY";

  const levelLabelKo =
    level === "EMERGENCY"
      ? "비상 보호 가동"
      : level === "WARNING"
        ? "메모리 경고 · 선제 절감"
        : "안정 운용 중";

  const timestampIso = telemetry.timestampIso ?? "2026-11-22T00:00:00.000Z";
  const compactTs = timestampIso.replace(/[^0-9]/gu, "").slice(0, 14);

  const emergencyCheckpoint: EmergencyCheckpointSnapshot | null =
    level === "HEALTHY"
      ? null
      : {
          checkpointId: `ckpt-${telemetry.episodeId}-${compactTs}`,
          episodeId: telemetry.episodeId,
          storageTarget: "opfs-sqlite-wal",
          reasonKo: triggerReasonsKo.join(" · "),
          preservedCutCount: telemetry.activeCutCount,
          recoveryPriority: level === "EMERGENCY" ? "immediate" : "scheduled",
          createdAtIso: timestampIso,
        };

  let targetTexture: TextureResolutionPx = telemetry.textureResolutionPx;
  if (level === "WARNING" && telemetry.textureResolutionPx === 4096) {
    targetTexture = 2048;
  } else if (level === "EMERGENCY") {
    targetTexture = 1024;
  }

  const downscaleApplied = targetTexture < telemetry.textureResolutionPx;
  const vramSavedMb = downscaleApplied
    ? estimateVramForTexture(telemetry.textureResolutionPx) - estimateVramForTexture(targetTexture)
    : 0;

  const textureDownscale: TextureDownscaleAction = {
    applied: downscaleApplied,
    fromPx: telemetry.textureResolutionPx,
    toPx: targetTexture,
    labelKo: downscaleApplied
      ? `3D 텍스처 자동 다운스케일 (${telemetry.textureResolutionPx / 1024}K → ${targetTexture / 1024}K)`
      : `현재 텍스처 해상도 유지 (${telemetry.textureResolutionPx / 1024}K)`,
    estimatedVramSavedMb: vramSavedMb,
  };

  const cacheReleasePlan: CacheReleaseStep[] = [];
  if (level !== "HEALTHY") {
    if (telemetry.idleLayerCacheMb > 0) {
      const releaseRatio = level === "EMERGENCY" ? 1 : 0.7;
      cacheReleasePlan.push({
        stepId: "purge-idle-layers",
        labelKo: "비활성 레이어·오프스크린 타일 캐시 즉시 해제",
        freedMb: Math.round(telemetry.idleLayerCacheMb * releaseRatio),
        priority: "critical",
      });
    }

    const undoTarget = level === "EMERGENCY" ? 8 : 20;
    if (telemetry.undoStackFrames > undoTarget) {
      const trimmedFrames = telemetry.undoStackFrames - undoTarget;
      cacheReleasePlan.push({
        stepId: "trim-undo-history",
        labelKo: `실행 취소(Undo) 버퍼 ${telemetry.undoStackFrames}단계 → ${undoTarget}단계로 압축`,
        freedMb: Math.round(trimmedFrames * 6.5),
        priority: level === "EMERGENCY" ? "critical" : "normal",
      });
    }

    if (vramSavedMb > 0) {
      cacheReleasePlan.push({
        stepId: "downscale-3d-textures",
        labelKo: textureDownscale.labelKo,
        freedMb: Math.round(vramSavedMb * 0.45),
        priority: "critical",
      });
    }

    if (telemetry.activeCacheMb > 120 && level === "EMERGENCY") {
      cacheReleasePlan.push({
        stepId: "flush-mipmap-atlas",
        labelKo: "미사용 밉맵·브러시 프리뷰 아틀라스 강제 비우기",
        freedMb: Math.round(telemetry.activeCacheMb * 0.35),
        priority: "normal",
      });
    }

    if (gpuContextLost) {
      cacheReleasePlan.push({
        stepId: "recreate-gpu-pipeline",
        labelKo: telemetry.webgpuDeviceLost
          ? "WebGPU 장치 재생성 및 안전 2D 폴백 캔버스 전환 준비"
          : "WebGL 컨텍스트 복구 리스너 및 셰이더 캐시 재초기화",
        freedMb: 64,
        priority: "critical",
      });
    }
  }

  const estimatedFreedMb = cacheReleasePlan.reduce((sum, step) => sum + step.freedMb, 0);
  const projectedHeapMb = Math.max(0, telemetry.usedHeapMb - estimatedFreedMb);
  const projectedUsagePercent = roundTo(clamp((projectedHeapMb / safeLimitMb) * 100, 0, 100), 1);

  return {
    level,
    levelLabelKo,
    memoryUsagePercent,
    gpuContextLost,
    triggerReasonsKo,
    emergencyCheckpoint,
    textureDownscale,
    cacheReleasePlan,
    estimatedFreedMb,
    projectedUsagePercent,
  };
}

/**
 * OKLCH 색차(ΔE) 계산: OKLCH 원통 좌표를 OKLab 직교 좌표(L, a, b)로 변환한 뒤
 * 유클리드 거리에 100을 곱해 지각 색차 지표로 환산한다 (<= 3.5 우수, <= 7.0 수정 권고).
 */
export function computeOklchDeltaE(target: OklchColor, actual: OklchColor): number {
  const radA = (target.h * Math.PI) / 180;
  const radB = (actual.h * Math.PI) / 180;
  const a1 = target.c * Math.cos(radA);
  const b1 = target.c * Math.sin(radA);
  const a2 = actual.c * Math.cos(radB);
  const b2 = actual.c * Math.sin(radB);

  const dL = target.l - actual.l;
  const da = a1 - a2;
  const db = b1 - b2;
  return roundTo(Math.sqrt(dL * dL + da * da + db * db) * 100, 2);
}

function buildWatermarkToken(applicantName: string, issuedAtIso: string): string {
  const seed = `${applicantName.trim()}|${issuedAtIso}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return `WM-SAMPLE-${hash.toString(36).toUpperCase().padStart(7, "0")}`;
}

export function issueOutsourceSampleTest(input: {
  readonly applicantName: string;
  readonly region: "KR" | "SEA" | "GLOBAL";
  readonly issuedAtIso?: string;
}): OutsourceSamplePacket {
  const issuedAtIso = input.issuedAtIso ?? "2026-11-22T00:00:00.000Z";
  const watermarkToken = buildWatermarkToken(input.applicantName, issuedAtIso);
  const packetId = `smp-${watermarkToken.slice(-7).toLowerCase()}`;

  return {
    packetId,
    applicantName: input.applicantName.trim() || "신규 지원자",
    region: input.region,
    mainEpisodeLeakProtected: true,
    isolationPolicyKo: "본편 원고·콘티·캐릭터 시트 미포함 · 전용 중립 더미 3컷 + 추적 워터마크 적용",
    watermarkToken,
    expiresInMinutes: 10,
    issuedAtIso,
    cuts: [
      {
        sampleCutId: "sample-cut-1",
        titleKo: "샘플 1컷 · 클로즈업 선화",
        focusKo: "외곽선 필압·선폭 일관성 검증 (목표 2.4px)",
        targetLineWidthPx: 2.4,
        targetColor: { l: 0.78, c: 0.06, h: 52 },
        maxMinutes: 3.5,
      },
      {
        sampleCutId: "sample-cut-2",
        titleKo: "샘플 2컷 · 주광/역광 채색",
        focusKo: "OKLCH 피부·그림자 팔레트 색차 검증 (ΔE ≤ 3.5)",
        targetLineWidthPx: 2.2,
        targetColor: { l: 0.64, c: 0.12, h: 255 },
        maxMinutes: 3.5,
      },
      {
        sampleCutId: "sample-cut-3",
        titleKo: "샘플 3컷 · 동세 배경 마감",
        focusKo: "속도·선 정리·명암 톤 종합 검증 (3분 이내)",
        targetLineWidthPx: 2.0,
        targetColor: { l: 0.48, c: 0.09, h: 190 },
        maxMinutes: 3.0,
      },
    ],
  };
}

export function evaluateOutsourceSampleSubmission(
  packet: OutsourceSamplePacket,
  submission: OutsourceSampleSubmission,
): OutsourceSampleEvaluation {
  const feedbackKo: string[] = [];
  const cutDetails: OutsourceCutScoreDetail[] = [];

  let sumLineDelta = 0;
  let sumDeltaE = 0;
  let totalMinutes = 0;
  let hasCriticalFail = false;

  for (let i = 0; i < packet.cuts.length; i += 1) {
    const spec = packet.cuts[i]!;
    const sub = submission.cuts[i]!;
    const lineWidthDeltaPx = roundTo(Math.abs(sub.submittedLineWidthPx - spec.targetLineWidthPx), 2);
    const colorDeltaE = computeOklchDeltaE(spec.targetColor, sub.submittedColor);
    const turnaroundMinutes = roundTo(Math.max(0.5, sub.turnaroundMinutes), 1);

    sumLineDelta += lineWidthDeltaPx;
    sumDeltaE += colorDeltaE;
    totalMinutes += turnaroundMinutes;

    const lineScore = clamp(100 - (lineWidthDeltaPx / 0.8) * 65, 0, 100);
    const deltaEScore = clamp(100 - (colorDeltaE / 9) * 70, 0, 100);
    const timePenalty = turnaroundMinutes <= spec.maxMinutes ? 0 : (turnaroundMinutes - spec.maxMinutes) * 14;
    const speedCutScore = clamp(100 - timePenalty, 0, 100);
    const cutScore = Math.round(lineScore * 0.35 + deltaEScore * 0.4 + speedCutScore * 0.25);

    let status: OutsourceVerdict = "PASS";
    if (lineWidthDeltaPx > 0.75 || colorDeltaE > 7.5 || turnaroundMinutes > spec.maxMinutes * 2) {
      status = "HOLD";
      hasCriticalFail = true;
    } else if (lineWidthDeltaPx > 0.35 || colorDeltaE > 3.5 || turnaroundMinutes > spec.maxMinutes + 1) {
      status = "REVISE";
    }

    cutDetails.push({
      sampleCutId: spec.sampleCutId,
      titleKo: spec.titleKo,
      lineWidthDeltaPx,
      colorDeltaE,
      turnaroundMinutes,
      cutScore,
      status,
    });
  }

  const avgLineWidthDeltaPx = roundTo(sumLineDelta / 3, 2);
  const avgColorDeltaE = roundTo(sumDeltaE / 3, 2);
  const totalTurnaroundMinutes = roundTo(totalMinutes, 1);

  const lineWidthScore = Math.round(clamp(100 - (avgLineWidthDeltaPx / 0.8) * 65, 0, 100));
  const colorScore = Math.round(clamp(100 - (avgColorDeltaE / 9) * 70, 0, 100));
  const speedScore = Math.round(
    totalTurnaroundMinutes <= 10
      ? 100
      : clamp(100 - (totalTurnaroundMinutes - 10) * 9, 0, 100),
  );
  const totalScore = Math.round(lineWidthScore * 0.35 + colorScore * 0.4 + speedScore * 0.25);

  if (avgLineWidthDeltaPx > 0.35) {
    feedbackKo.push(`평균 선폭 오차 ${avgLineWidthDeltaPx}px — 기준(±0.35px)에 맞춰 필압 브러시를 조정하세요.`);
  }
  if (avgColorDeltaE > 3.5) {
    feedbackKo.push(`평균 OKLCH 색차 ΔE ${avgColorDeltaE} — 지정 팔레트 스포이드 재적용이 필요합니다.`);
  }
  if (totalTurnaroundMinutes > 10) {
    feedbackKo.push(`총 작업 시간 ${totalTurnaroundMinutes}분 — 목표 10분 기준을 초과했습니다.`);
  }
  if (feedbackKo.length === 0) {
    feedbackKo.push("선폭·OKLCH 색차·10분 납기 기준을 모두 통과했습니다. 본편 공정에 바로 투입할 수 있습니다.");
  }

  let verdict: OutsourceVerdict;
  if (!hasCriticalFail && totalScore >= 82 && avgLineWidthDeltaPx <= 0.4 && avgColorDeltaE <= 4.0 && totalTurnaroundMinutes <= 11) {
    verdict = "PASS";
  } else if (hasCriticalFail || totalScore < 60 || avgColorDeltaE > 7.5 || totalTurnaroundMinutes > 18) {
    verdict = "HOLD";
  } else {
    verdict = "REVISE";
  }

  const verdictLabelKo =
    verdict === "PASS"
      ? "PASS · 즉시 본편 투입"
      : verdict === "REVISE"
        ? "REVISE · 부분 보완 후 재검증"
        : "HOLD · 보류 (가이드 재교육 필요)";

  return {
    packetId: packet.packetId,
    applicantName: submission.applicantName,
    verdict,
    verdictLabelKo,
    totalScore,
    avgLineWidthDeltaPx,
    avgColorDeltaE,
    totalTurnaroundMinutes,
    lineWidthScore,
    colorScore,
    speedScore,
    cutDetails,
    feedbackKo,
  };
}

export function createDefaultOutsourceSubmission(
  packet: OutsourceSamplePacket,
  preset: "pass" | "revise" | "hold" = "pass",
): OutsourceSampleSubmission {
  if (preset === "revise") {
    return {
      packetId: packet.packetId,
      applicantName: packet.applicantName,
      cuts: [
        { sampleCutId: packet.cuts[0].sampleCutId, submittedLineWidthPx: 2.85, submittedColor: { l: 0.75, c: 0.08, h: 58 }, turnaroundMinutes: 4.2 },
        { sampleCutId: packet.cuts[1].sampleCutId, submittedLineWidthPx: 2.65, submittedColor: { l: 0.60, c: 0.14, h: 266 }, turnaroundMinutes: 4.5 },
        { sampleCutId: packet.cuts[2].sampleCutId, submittedLineWidthPx: 2.4, submittedColor: { l: 0.45, c: 0.11, h: 202 }, turnaroundMinutes: 4.0 },
      ],
    };
  }
  if (preset === "hold") {
    return {
      packetId: packet.packetId,
      applicantName: packet.applicantName,
      cuts: [
        { sampleCutId: packet.cuts[0].sampleCutId, submittedLineWidthPx: 3.6, submittedColor: { l: 0.65, c: 0.14, h: 78 }, turnaroundMinutes: 7.5 },
        { sampleCutId: packet.cuts[1].sampleCutId, submittedLineWidthPx: 3.3, submittedColor: { l: 0.50, c: 0.21, h: 292 }, turnaroundMinutes: 6.8 },
        { sampleCutId: packet.cuts[2].sampleCutId, submittedLineWidthPx: 3.1, submittedColor: { l: 0.34, c: 0.18, h: 226 }, turnaroundMinutes: 6.2 },
      ],
    };
  }
  return {
    packetId: packet.packetId,
    applicantName: packet.applicantName,
    cuts: [
      { sampleCutId: packet.cuts[0].sampleCutId, submittedLineWidthPx: 2.45, submittedColor: { l: 0.785, c: 0.062, h: 53 }, turnaroundMinutes: 3.1 },
      { sampleCutId: packet.cuts[1].sampleCutId, submittedLineWidthPx: 2.25, submittedColor: { l: 0.645, c: 0.122, h: 256 }, turnaroundMinutes: 3.2 },
      { sampleCutId: packet.cuts[2].sampleCutId, submittedLineWidthPx: 2.05, submittedColor: { l: 0.485, c: 0.092, h: 191 }, turnaroundMinutes: 2.8 },
    ],
  };
}
