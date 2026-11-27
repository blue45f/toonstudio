/**
 * Wave 37: 창작 과정 비포/애프터 분할 카드 합성기 및 비트 동기화 타임랩스 키프레임 선별기.
 *
 * - `composeBeforeAfterSplitCard`: 스케치(`sketch`)·선화(`lineart`)와 완성 채색(`final-color`) RGBA 버퍼를
 *   수직(`vertical`) 또는 사선(`diagonal`) 분할 와이프로 합성하고, 경계선 및 단계 배지를 선명하게 스탬핑한다.
 * - `selectMilestoneTimelapseFrames`: 작업 휴지기나 스트로크 밀도 편차가 심한 기록에서도
 *   러프(`rough`)·선화(`lineart`)·밑색(`flat`)·완성(`final`) 4단계가 15초 메이킹 릴 안에서
 *   균형 잡힌 화면 재생 시간을 갖도록 음악 비트 격자에 맞춰 대표 키프레임을 배분한다.
 */

/** 메이킹 릴 기본 길이(`15초`). */
export const DEFAULT_MAKING_REEL_DURATION_SEC = 15 as const;
/** 메이킹 릴 비트 동기화 기본 템포(`120 BPM` = 비트당 `500ms`). */
export const DEFAULT_MAKING_REEL_BPM = 120 as const;
/** 사선 분할 와이프 기본 기울기 각도(`14°`). */
export const DEFAULT_DIAGONAL_WIPE_TILT_DEG = 14 as const;
/** 비포/애프터 경계선 기본 두께(`3px`). */
export const DEFAULT_SPLIT_DIVIDER_THICKNESS_PX = 3 as const;

export type ProcessStageKind = "rough" | "sketch" | "lineart" | "flat" | "shading" | "final-color";
export type CanonicalReelStage = "rough" | "lineart" | "flat" | "final";
export type SplitWipeMode = "vertical" | "diagonal";

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 스튜디오 밝은/어두운 원고 모두에서 선명히 구분되는 기본 경계선 색상(Alabaster). */
export const DEFAULT_DIVIDER_RGBA: RgbaColor = Object.freeze({ r: 250, g: 248, b: 243, a: 255 });

/** 15초 메이킹 릴 4단계 기본 화면 비중(합계 `1.0`). */
export const DEFAULT_REEL_STAGE_WEIGHTS: Readonly<Record<CanonicalReelStage, number>> = Object.freeze({
  rough: 0.2,
  lineart: 0.3,
  flat: 0.2,
  final: 0.3,
});

export interface BeforeAfterSplitCardInput {
  readonly width: number;
  readonly height: number;
  readonly beforeRgba: Uint8Array | Uint8ClampedArray;
  readonly afterRgba: Uint8Array | Uint8ClampedArray;
  readonly beforeStage: ProcessStageKind;
  readonly afterStage: ProcessStageKind;
  readonly splitMode: SplitWipeMode;
  /** 중앙 높이(`height * 0.5`) 기준 비포 영역 가로 비율(`0.1..0.9`, 기본 `0.5`). */
  readonly splitRatio?: number;
  /** `diagonal` 모드일 때 수직선 대비 기울기 각도(`-45..45°`, 기본 `14°`). */
  readonly diagonalTiltDeg?: number;
  readonly dividerThicknessPx?: number;
  readonly dividerColor?: RgbaColor;
  readonly renderStageBadges?: boolean;
}

export interface BeforeAfterSplitCardResult {
  readonly outputRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly splitMode: SplitWipeMode;
  readonly splitRatio: number;
  readonly splitXAtTop: number;
  readonly splitXAtMidY: number;
  readonly splitXAtBottom: number;
  readonly beforePixelCount: number;
  readonly afterPixelCount: number;
  readonly dividerPixelCount: number;
  readonly beforeBadgeRect: PixelRect | null;
  readonly afterBadgeRect: PixelRect | null;
}

export interface ProcessStrokeSnapshot {
  readonly frameId: string;
  readonly timestampMs: number;
  readonly stage: ProcessStageKind | CanonicalReelStage;
  readonly strokeCount: number;
}

export interface SelectedTimelapseKeyframe {
  readonly beatIndex: number;
  readonly reelStartMs: number;
  readonly reelEndMs: number;
  readonly screenDurationMs: number;
  readonly canonicalStage: CanonicalReelStage;
  readonly sourceFrameId: string;
  readonly sourceTimestampMs: number;
  readonly sourceStrokeCount: number;
  readonly isBeatAligned: boolean;
  readonly isStageTerminalMilestone: boolean;
}

export interface ReelStageScreenAllocation {
  readonly stage: CanonicalReelStage;
  readonly targetShare: number;
  readonly actualShare: number;
  readonly allocatedDurationMs: number;
  readonly allocatedBeatSlots: number;
  readonly sourceSnapshotCount: number;
}

export interface MilestoneTimelapsePlanInput {
  readonly snapshots: readonly ProcessStrokeSnapshot[];
  readonly reelDurationSec?: number;
  readonly bpm?: number;
  /** 비트 슬롯당 유지할 비트 배수(기본 `1`, 예: `2`면 2비트마다 컷 전환). */
  readonly beatsPerCut?: number;
  readonly stageWeights?: Partial<Record<CanonicalReelStage, number>>;
}

export interface MilestoneTimelapsePlanResult {
  readonly selectedFrames: readonly SelectedTimelapseKeyframe[];
  readonly stageAllocations: readonly ReelStageScreenAllocation[];
  readonly totalReelDurationMs: number;
  readonly bpm: number;
  readonly beatIntervalMs: number;
  readonly maxStageShareDeviation: number;
  readonly allTransitionsBeatSynced: boolean;
}

const CANONICAL_STAGE_ORDER: readonly CanonicalReelStage[] = ["rough", "lineart", "flat", "final"];

const GLYPH_5X7: Readonly<Record<string, readonly number[]>> = Object.freeze({
  A: [14, 17, 17, 31, 17, 17, 17],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  " ": [0, 0, 0, 0, 0, 0, 0],
});

const STAGE_BADGE_TEXT: Readonly<Record<ProcessStageKind, string>> = Object.freeze({
  rough: "ROUGH",
  sketch: "SKETCH",
  lineart: "LINEART",
  flat: "FLAT",
  shading: "SHADING",
  "final-color": "FINAL",
});

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function blendPixelOver(buf: Uint8ClampedArray, offset: number, fg: RgbaColor): void {
  const alpha = clamp(fg.a, 0, 255) / 255;
  if (alpha <= 0) return;
  if (alpha >= 1) {
    buf[offset] = fg.r;
    buf[offset + 1] = fg.g;
    buf[offset + 2] = fg.b;
    buf[offset + 3] = 255;
    return;
  }
  const dstA = (buf[offset + 3] ?? 255) / 255;
  const outA = alpha + dstA * (1 - alpha);
  const inv = 1 - alpha;
  buf[offset] = Math.round((fg.r * alpha + (buf[offset] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 1] = Math.round((fg.g * alpha + (buf[offset + 1] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 2] = Math.round((fg.b * alpha + (buf[offset + 2] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 3] = Math.round(outA * 255);
}

function drawStageBadge(
  buf: Uint8ClampedArray,
  canvasW: number,
  canvasH: number,
  label: string,
  anchor: "top-left" | "bottom-right",
  bgColor: RgbaColor,
  fgColor: RgbaColor,
): PixelRect | null {
  const padX = 5;
  const padY = 3;
  const glyphW = 5;
  const glyphH = 7;
  const gap = 1;
  const textW = label.length * glyphW + Math.max(0, label.length - 1) * gap;
  const boxW = textW + padX * 2;
  const boxH = glyphH + padY * 2;
  const margin = Math.max(4, Math.min(14, Math.floor(Math.min(canvasW, canvasH) * 0.04)));

  if (boxW + margin * 2 > canvasW || boxH + margin * 2 > canvasH) {
    return null;
  }

  const boxX = anchor === "top-left" ? margin : canvasW - margin - boxW;
  const boxY = anchor === "top-left" ? margin : canvasH - margin - boxH;

  for (let py = boxY; py < boxY + boxH; py += 1) {
    for (let px = boxX; px < boxX + boxW; px += 1) {
      const isCorner =
        (px === boxX || px === boxX + boxW - 1) && (py === boxY || py === boxY + boxH - 1);
      if (!isCorner) {
        blendPixelOver(buf, (py * canvasW + px) * 4, bgColor);
      }
    }
  }

  for (let idx = 0; idx < label.length; idx += 1) {
    const ch = label[idx] ?? " ";
    const rows = GLYPH_5X7[ch] ?? GLYPH_5X7[" "] ?? [];
    const gx = boxX + padX + idx * (glyphW + gap);
    const gy = boxY + padY;
    for (let ry = 0; ry < glyphH; ry += 1) {
      const mask = rows[ry] ?? 0;
      for (let rx = 0; rx < glyphW; rx += 1) {
        if ((mask & (1 << (glyphW - 1 - rx))) !== 0) {
          blendPixelOver(buf, ((gy + ry) * canvasW + (gx + rx)) * 4, fgColor);
        }
      }
    }
  }

  return { x: boxX, y: boxY, width: boxW, height: boxH };
}

/**
 * 비포(`sketch`/`lineart`)와 애프터(`final-color`) RGBA 버퍼를 수직 또는 사선 분할 와이프 카드로 합성한다.
 */
export function composeBeforeAfterSplitCard(input: BeforeAfterSplitCardInput): BeforeAfterSplitCardResult {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 2 || input.height < 2) {
    throw new RangeError("비포/애프터 카드 해상도(width, height)는 2px 이상의 정수여야 합니다.");
  }
  const expectedLength = input.width * input.height * 4;
  if (input.beforeRgba.length < expectedLength || input.afterRgba.length < expectedLength) {
    throw new RangeError(`RGBA 버퍼 길이가 부족합니다(필요: ${expectedLength}바이트).`);
  }

  const { width, height, beforeRgba, afterRgba, splitMode } = input;
  const splitRatio = clamp(input.splitRatio ?? 0.5, 0.1, 0.9);
  const tiltDeg = splitMode === "diagonal" ? clamp(input.diagonalTiltDeg ?? DEFAULT_DIAGONAL_WIPE_TILT_DEG, -45, 45) : 0;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const tanTilt = Math.tan(tiltRad);
  const cosTilt = Math.cos(tiltRad);
  const halfDivider = Math.max(0, (input.dividerThicknessPx ?? DEFAULT_SPLIT_DIVIDER_THICKNESS_PX) * 0.5);
  const dividerColor = input.dividerColor ?? DEFAULT_DIVIDER_RGBA;

  const midY = height * 0.5;
  const splitXAtMidY = splitRatio * width;
  const splitXAtTop = splitXAtMidY + midY * tanTilt;
  const splitXAtBottom = splitXAtMidY - midY * tanTilt;

  const outputRgba = new Uint8ClampedArray(expectedLength);
  let beforePixelCount = 0;
  let afterPixelCount = 0;
  let dividerPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const lineX = splitXAtMidY + (midY - (y + 0.5)) * tanTilt;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const signedPerpDist = ((x + 0.5) - lineX) * cosTilt;

      if (halfDivider > 0 && Math.abs(signedPerpDist) <= halfDivider) {
        dividerPixelCount += 1;
        const baseSrc = signedPerpDist < 0 ? beforeRgba : afterRgba;
        outputRgba[offset] = baseSrc[offset] ?? 0;
        outputRgba[offset + 1] = baseSrc[offset + 1] ?? 0;
        outputRgba[offset + 2] = baseSrc[offset + 2] ?? 0;
        outputRgba[offset + 3] = baseSrc[offset + 3] ?? 255;
        blendPixelOver(outputRgba, offset, dividerColor);
      } else if (signedPerpDist < 0) {
        beforePixelCount += 1;
        outputRgba[offset] = beforeRgba[offset] ?? 0;
        outputRgba[offset + 1] = beforeRgba[offset + 1] ?? 0;
        outputRgba[offset + 2] = beforeRgba[offset + 2] ?? 0;
        outputRgba[offset + 3] = beforeRgba[offset + 3] ?? 255;
      } else {
        afterPixelCount += 1;
        outputRgba[offset] = afterRgba[offset] ?? 0;
        outputRgba[offset + 1] = afterRgba[offset + 1] ?? 0;
        outputRgba[offset + 2] = afterRgba[offset + 2] ?? 0;
        outputRgba[offset + 3] = afterRgba[offset + 3] ?? 255;
      }
    }
  }

  let beforeBadgeRect: PixelRect | null = null;
  let afterBadgeRect: PixelRect | null = null;
  if (input.renderStageBadges ?? true) {
    const badgeBg: RgbaColor = { r: 22, g: 28, b: 34, a: 214 };
    const badgeFg: RgbaColor = { r: 250, g: 248, b: 243, a: 255 };
    beforeBadgeRect = drawStageBadge(outputRgba, width, height, STAGE_BADGE_TEXT[input.beforeStage], "top-left", badgeBg, badgeFg);
    afterBadgeRect = drawStageBadge(outputRgba, width, height, STAGE_BADGE_TEXT[input.afterStage], "bottom-right", badgeBg, badgeFg);
  }

  return {
    outputRgba,
    width,
    height,
    splitMode,
    splitRatio,
    splitXAtTop,
    splitXAtMidY,
    splitXAtBottom,
    beforePixelCount,
    afterPixelCount,
    dividerPixelCount,
    beforeBadgeRect,
    afterBadgeRect,
  };
}

function toCanonicalStage(stage: ProcessStageKind | CanonicalReelStage): CanonicalReelStage {
  if (stage === "rough" || stage === "sketch") return "rough";
  if (stage === "lineart") return "lineart";
  if (stage === "flat") return "flat";
  return "final";
}

/**
 * 불균일한 작화 타임스탬프에서 비트에 동기화된 단계별 대표 키프레임을 선별해 15초 메이킹 릴 재생 시간을 균형 배분한다.
 */
export function selectMilestoneTimelapseFrames(input: MilestoneTimelapsePlanInput): MilestoneTimelapsePlanResult {
  if (input.snapshots.length === 0) {
    throw new RangeError("타임랩스 선별을 위해 최소 1개 이상의 작업 스냅샷이 필요합니다.");
  }

  const reelDurationSec = clamp(input.reelDurationSec ?? DEFAULT_MAKING_REEL_DURATION_SEC, 3, 90);
  const bpm = clamp(input.bpm ?? DEFAULT_MAKING_REEL_BPM, 40, 240);
  const beatsPerCut = Math.max(1, Math.round(input.beatsPerCut ?? 1));
  const totalReelDurationMs = Math.round(reelDurationSec * 1_000);
  const rawBeatMs = 60_000 / bpm;
  const slotIntervalMs = rawBeatMs * beatsPerCut;

  const sorted = [...input.snapshots].sort(
    (a, b) => a.timestampMs - b.timestampMs || a.strokeCount - b.strokeCount,
  );
  const grouped = new Map<CanonicalReelStage, ProcessStrokeSnapshot[]>();
  for (const snap of sorted) {
    const canonical = toCanonicalStage(snap.stage);
    const bucket = grouped.get(canonical);
    if (bucket !== undefined) bucket.push(snap);
    else grouped.set(canonical, [snap]);
  }

  const presentStages = CANONICAL_STAGE_ORDER.filter((stage) => (grouped.get(stage)?.length ?? 0) > 0);
  const totalSlots = Math.max(presentStages.length, Math.round(totalReelDurationMs / slotIntervalMs));
  const rawWeightSum = presentStages.reduce(
    (acc, stage) => acc + Math.max(0.05, input.stageWeights?.[stage] ?? DEFAULT_REEL_STAGE_WEIGHTS[stage]),
    0,
  );

  const normalizedShares = new Map<CanonicalReelStage, number>();
  const slotCounts = new Map<CanonicalReelStage, number>();
  const remainders: { stage: CanonicalReelStage; rem: number }[] = [];
  let assignedSlots = 0;

  for (const stage of presentStages) {
    const share = Math.max(0.05, input.stageWeights?.[stage] ?? DEFAULT_REEL_STAGE_WEIGHTS[stage]) / rawWeightSum;
    normalizedShares.set(stage, share);
    const exact = share * totalSlots;
    const baseSlots = Math.max(1, Math.floor(exact));
    slotCounts.set(stage, baseSlots);
    assignedSlots += baseSlots;
    remainders.push({ stage, rem: exact - baseSlots });
  }

  while (assignedSlots > totalSlots) {
    const reducible = [...presentStages]
      .filter((s) => (slotCounts.get(s) ?? 1) > 1)
      .sort((a, b) => (slotCounts.get(b) ?? 1) - (slotCounts.get(a) ?? 1))[0];
    if (reducible === undefined) break;
    slotCounts.set(reducible, (slotCounts.get(reducible) ?? 2) - 1);
    assignedSlots -= 1;
  }

  remainders.sort((a, b) => b.rem - a.rem);
  let remIdx = 0;
  while (assignedSlots < totalSlots && remainders.length > 0) {
    const pick = remainders[remIdx % remainders.length];
    if (pick !== undefined) {
      slotCounts.set(pick.stage, (slotCounts.get(pick.stage) ?? 1) + 1);
      assignedSlots += 1;
    }
    remIdx += 1;
  }

  const selectedFrames: SelectedTimelapseKeyframe[] = [];
  const stageAllocations: ReelStageScreenAllocation[] = [];
  let slotCursor = 0;
  let maxStageShareDeviation = 0;

  for (const stage of presentStages) {
    const stageSnaps = grouped.get(stage) ?? [];
    const slots = slotCounts.get(stage) ?? 1;
    let stageDurationMs = 0;

    for (let i = 0; i < slots; i += 1) {
      const snapIdx =
        slots === 1
          ? stageSnaps.length - 1
          : Math.min(stageSnaps.length - 1, Math.round((i / (slots - 1)) * (stageSnaps.length - 1)));
      const snap = stageSnaps[snapIdx] ?? stageSnaps[stageSnaps.length - 1];
      const globalSlot = slotCursor + i;
      const reelStartMs = Math.round((globalSlot * totalReelDurationMs) / totalSlots);
      const reelEndMs =
        globalSlot + 1 === totalSlots
          ? totalReelDurationMs
          : Math.round(((globalSlot + 1) * totalReelDurationMs) / totalSlots);
      const durationMs = Math.max(1, reelEndMs - reelStartMs);
      stageDurationMs += durationMs;

      if (snap !== undefined) {
        selectedFrames.push({
          beatIndex: globalSlot * beatsPerCut,
          reelStartMs,
          reelEndMs,
          screenDurationMs: durationMs,
          canonicalStage: stage,
          sourceFrameId: snap.frameId,
          sourceTimestampMs: snap.timestampMs,
          sourceStrokeCount: snap.strokeCount,
          isBeatAligned: true,
          isStageTerminalMilestone: i === slots - 1,
        });
      }
    }

    slotCursor += slots;
    const targetShare = normalizedShares.get(stage) ?? 0;
    const actualShare = stageDurationMs / totalReelDurationMs;
    maxStageShareDeviation = Math.max(maxStageShareDeviation, Math.abs(actualShare - targetShare));
    stageAllocations.push({
      stage,
      targetShare,
      actualShare,
      allocatedDurationMs: stageDurationMs,
      allocatedBeatSlots: slots,
      sourceSnapshotCount: stageSnaps.length,
    });
  }

  return {
    selectedFrames,
    stageAllocations,
    totalReelDurationMs,
    bpm,
    beatIntervalMs: Math.round(rawBeatMs * 100) / 100,
    maxStageShareDeviation: Math.round(maxStageShareDeviation * 10_000) / 10_000,
    allTransitionsBeatSynced: selectedFrames.every((f) => f.isBeatAligned),
  };
}
