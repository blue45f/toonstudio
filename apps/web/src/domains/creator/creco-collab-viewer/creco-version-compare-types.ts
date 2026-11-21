/**
 * CRECO++ 5계층 불변 버전 트리 · 4열 동기 비교 · 핀/레드라인 공용 타입 및 카탈로그.
 */

export type CrecoStageId =
  | "script-conti"
  | "storyboard-conti"
  | "lineart"
  | "bg3d"
  | "coloring"
  | "lettering"
  | "loc-ja"
  | "loc-en";

export type CrecoStageKind = "text" | "image";
export type CrecoCutChangeBadge = "new" | "updated" | "unchanged" | "duplicate-skipped";
export type CrecoVersionVisibility = "public" | "restricted" | "private";
export type CrecoVersionLifecycle = "in-progress" | "work-done" | "stage-closed";

export type CompareLayoutMode = "vertical-sync" | "horizontal-overview" | "wipe-compare";
export type CompareSyncMode = "all-lock" | "offset-keep" | "height-ratio";

export type FeedbackImportance = "required" | "recommended" | "suggestion";
export type FeedbackStatus = "open" | "in-progress" | "resolved";
export type FeedbackVisibility = "public" | "restricted" | "private";
export type RedlineTone = "crimson" | "amber" | "cobalt";

export interface CrecoStageMeta {
  readonly stageId: CrecoStageId;
  readonly label: string;
  readonly shortLabel: string;
  readonly kind: CrecoStageKind;
  readonly defaultLayerId: string;
  readonly defaultLayerName: string;
  readonly accentOklch: string;
  readonly heightScale: number;
}

export const CRECO_STAGE_CATALOG: readonly CrecoStageMeta[] = [
  {
    stageId: "script-conti",
    label: "글콘티",
    shortLabel: "글콘티",
    kind: "text",
    defaultLayerId: "layer-script-notes",
    defaultLayerName: "00_대사_연출메모",
    accentOklch: "oklch(0.55 0.08 245)",
    heightScale: 0.85,
  },
  {
    stageId: "storyboard-conti",
    label: "그림콘티",
    shortLabel: "콘티",
    kind: "image",
    defaultLayerId: "layer-rough-conti",
    defaultLayerName: "01_그림콘티_러프",
    accentOklch: "oklch(0.54 0.12 72)",
    heightScale: 1.0,
  },
  {
    stageId: "lineart",
    label: "선화",
    shortLabel: "선화",
    kind: "image",
    defaultLayerId: "layer-ink-vector",
    defaultLayerName: "02_캐릭터_주선화",
    accentOklch: "oklch(0.46 0.14 255)",
    heightScale: 1.05,
  },
  {
    stageId: "bg3d",
    label: "배경3D",
    shortLabel: "배경3D",
    kind: "image",
    defaultLayerId: "layer-bg3d-npr",
    defaultLayerName: "03_옥상_배경3D_NPR",
    accentOklch: "oklch(0.51 0.12 185)",
    heightScale: 1.05,
  },
  {
    stageId: "coloring",
    label: "채색",
    shortLabel: "채색",
    kind: "image",
    defaultLayerId: "layer-color-shade",
    defaultLayerName: "04_밑색_AI음영",
    accentOklch: "oklch(0.55 0.15 28)",
    heightScale: 1.08,
  },
  {
    stageId: "lettering",
    label: "식자",
    shortLabel: "식자",
    kind: "image",
    defaultLayerId: "layer-ko-balloon",
    defaultLayerName: "05_한국어_말풍선_효과음",
    accentOklch: "oklch(0.48 0.13 150)",
    heightScale: 1.12,
  },
  {
    stageId: "loc-ja",
    label: "일본어",
    shortLabel: "일본어",
    kind: "image",
    defaultLayerId: "layer-ja-vertical",
    defaultLayerName: "06_일본어_세로식자",
    accentOklch: "oklch(0.52 0.14 335)",
    heightScale: 1.14,
  },
  {
    stageId: "loc-en",
    label: "영어",
    shortLabel: "영어",
    kind: "image",
    defaultLayerId: "layer-en-bubble",
    defaultLayerName: "07_영어_글로벌식자",
    accentOklch: "oklch(0.50 0.11 215)",
    heightScale: 1.1,
  },
];

export interface CrecoCutArtifact {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly title: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly layerId: string;
  readonly layerName: string;
  readonly fileSizeKb: number;
  readonly digest: string;
  readonly changeBadge: CrecoCutChangeBadge;
  readonly dialogueSummary: string;
  readonly moodSurfaceOklch: string;
  readonly keyFocalOklch: string;
}

export interface CrecoContributorShare {
  readonly name: string;
  readonly sharePct: number;
}

export interface CrecoImmutableVersion {
  readonly versionId: string;
  readonly versionNumber: number;
  readonly label: string;
  readonly stageId: CrecoStageId;
  readonly parentVersionId: string | null;
  readonly createdAtIso: string;
  readonly authorName: string;
  readonly summary: string;
  readonly workMinutes: number;
  readonly visibility: CrecoVersionVisibility;
  readonly lifecycle: CrecoVersionLifecycle;
  readonly approved: boolean;
  readonly digest: string;
  readonly artifacts: readonly CrecoCutArtifact[];
  readonly contributors: readonly CrecoContributorShare[];
}

export interface CrecoStageNode {
  readonly stageId: CrecoStageId;
  readonly label: string;
  readonly shortLabel: string;
  readonly kind: CrecoStageKind;
  readonly versions: readonly CrecoImmutableVersion[];
  readonly latestApprovedVersionId: string | null;
  readonly activeVersionId: string;
}

export interface CrecoCanonicalShareLink {
  readonly shareId: string;
  readonly url: string;
  readonly mode: "latest-approved" | "pinned";
  readonly stageId: CrecoStageId;
  readonly pinnedVersionId: string | null;
}

export interface CrecoEpisodeNode {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly treatment: string;
  readonly stages: readonly CrecoStageNode[];
}

export interface CrecoProjectTree {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly abbreviation: string;
  readonly episode: CrecoEpisodeNode;
  readonly canonicalShareLink: CrecoCanonicalShareLink;
}

export interface CompareSlotRef {
  readonly slotId: string;
  readonly stageId: CrecoStageId;
  readonly versionId: string;
  readonly heightScale: number;
}

export interface SyncMultiStageCompareState {
  readonly layoutMode: CompareLayoutMode;
  readonly syncMode: CompareSyncMode;
  readonly slots: readonly CompareSlotRef[];
  readonly activeCutIndex: number;
  readonly masterScrollRatio: number;
  readonly slotScrollRatios: Readonly<Record<string, number>>;
  readonly wipePercent: number;
  readonly wipeBeforeSlotIndex: number;
  readonly wipeAfterSlotIndex: number;
}

export interface VersionDiffSummary {
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly cutCountDelta: number;
  readonly newCuts: number;
  readonly updatedCuts: number;
  readonly unchangedCuts: number;
  readonly totalSizeDeltaKb: number;
  readonly summaryLines: readonly string[];
}

export interface RedlinePoint {
  readonly xPct: number;
  readonly yPct: number;
}

export interface RedlineStroke {
  readonly id: string;
  readonly points: readonly RedlinePoint[];
  readonly widthPx: number;
  readonly tone: RedlineTone;
}

export interface CrecoPinFeedback {
  readonly id: string;
  readonly stageId: CrecoStageId;
  readonly versionId: string;
  readonly cutIndex: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly layerId: string;
  readonly layerName: string;
  readonly authorName: string;
  readonly assigneeName: string;
  readonly body: string;
  readonly importance: FeedbackImportance;
  readonly visibility: FeedbackVisibility;
  readonly status: FeedbackStatus;
  readonly strokes: readonly RedlineStroke[];
  readonly createdAtIso: string;
  readonly resolvedBy: string | null;
  readonly resolvedAtIso: string | null;
}

export interface ToonStudioCanvasJumpPayload {
  readonly schema: "toonstudio.canvas-jump.v1";
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageId: CrecoStageId;
  readonly versionId: string;
  readonly cutIndex: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly layerId: string;
  readonly layerName: string;
  readonly zoomPercent: number;
  readonly highlightFeedbackId: string;
  readonly estimatedLatencyMs: number;
  readonly requiresExternalUpload: false;
  readonly deepLinkUri: string;
}

export interface CrecoCollabWorkspaceState {
  readonly tree: CrecoProjectTree;
  readonly compare: SyncMultiStageCompareState;
  readonly feedbacks: readonly CrecoPinFeedback[];
}

export interface CommitImmutableVersionInput {
  readonly stageId: CrecoStageId;
  readonly authorName: string;
  readonly summary: string;
  readonly workMinutes: number;
  readonly visibility?: CrecoVersionVisibility;
  readonly markApproved?: boolean;
  readonly updatedCutIndices?: readonly number[];
  readonly addedCutTitle?: string;
  readonly createdAtIso?: string;
}

export interface ApproveAndCloseStageInput {
  readonly stageId: CrecoStageId;
  readonly versionId: string;
  readonly approverName: string;
  readonly resolveOpenPublicFeedbacks: boolean;
  readonly contributors?: readonly CrecoContributorShare[];
  readonly closedAtIso?: string;
}

export interface AddPinRedlineFeedbackInput {
  readonly stageId: CrecoStageId;
  readonly versionId: string;
  readonly cutIndex: number;
  readonly xPct: number;
  readonly yPct: number;
  readonly authorName: string;
  readonly assigneeName: string;
  readonly body: string;
  readonly importance: FeedbackImportance;
  readonly visibility?: FeedbackVisibility;
  readonly strokes?: readonly RedlineStroke[];
  readonly createdAtIso?: string;
}

export interface ResolvedCanonicalShare {
  readonly shareId: string;
  readonly url: string;
  readonly mode: "latest-approved" | "pinned";
  readonly resolvedStageId: CrecoStageId;
  readonly resolvedVersion: CrecoImmutableVersion | null;
  readonly filenameConfusionRiskPct: 0;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function computeDeterministicDigest(seed: string): string {
  let hash = 2166136261;
  for (let idx = 0; idx < seed.length; idx += 1) {
    hash ^= seed.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return `vhash_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function getStageMeta(stageId: CrecoStageId): CrecoStageMeta {
  const found = CRECO_STAGE_CATALOG.find((item) => item.stageId === stageId);
  if (found) return found;
  return {
    stageId,
    label: "그림콘티",
    shortLabel: "콘티",
    kind: "image",
    defaultLayerId: "layer-rough-conti",
    defaultLayerName: "01_그림콘티_러프",
    accentOklch: "oklch(0.54 0.12 72)",
    heightScale: 1.0,
  };
}
