/**
 * 웹툰나우(Webtoon Now) · 웹툰 전용 파이프라인 관리(PMS) 도메인 모델
 *
 * 일반 텍스트 중심 협업툴(노션·잔디 등)과 차별화되는 웹툰 스튜디오 전용 4대 핵심 역량:
 * 1. 콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공 4단계 핵심 공정 대시보드 (및 8세부 공정 매핑)
 * 2. 레이어 분리 파일(PSD/CLIP) 구조 검수 엔진 (선화·밑색·명암·배경·후가공·식자 레이어 분리 검증)
 * 3. 대용량 이미지(50MB~500MB PSD/CLIP 및 세로 스크롤 원고) 타일·컷 단위 델타 수정(Delta Revision) 계산기
 * 4. 원고 이미지 위 마우스 빨간 펜 치기(Red-Pen Freehand/Arrow/Box Markup) 및 칸별(컷별) 피드백 상태 머신
 */

export type WebtoonNowCoreStage = "storyboard" | "lineart" | "coloring" | "postprocess";

export type WebtoonNowSubStage =
  | "script-conti"
  | "draw-conti"
  | "lineart"
  | "flat-color"
  | "shading"
  | "background-3d"
  | "vfx-compositing"
  | "typesetting";

export interface WebtoonStageMetadata {
  readonly coreStage: WebtoonNowCoreStage;
  readonly labelKo: string;
  readonly order: number;
  readonly subStages: readonly WebtoonNowSubStage[];
}

export const WEBTOON_NOW_CORE_STAGES: readonly WebtoonStageMetadata[] = [
  {
    coreStage: "storyboard",
    labelKo: "콘티",
    order: 1,
    subStages: ["script-conti", "draw-conti"],
  },
  {
    coreStage: "lineart",
    labelKo: "선화",
    order: 2,
    subStages: ["lineart", "background-3d"],
  },
  {
    coreStage: "coloring",
    labelKo: "채색",
    order: 3,
    subStages: ["flat-color", "shading"],
  },
  {
    coreStage: "postprocess",
    labelKo: "후가공",
    order: 4,
    subStages: ["vfx-compositing", "typesetting"],
  },
] as const;

export const WEBTOON_SUB_STAGE_LABELS_KO: Readonly<Record<WebtoonNowSubStage, string>> = {
  "script-conti": "글콘티",
  "draw-conti": "그림콘티",
  lineart: "선화·펜선",
  "flat-color": "밑색",
  shading: "명암·음영",
  "background-3d": "배경·스케치업 3D",
  "vfx-compositing": "후보정·이펙트",
  typesetting: "식자·말풍선",
};

/**
 * 8단계 세부 공정을 웹툰나우 표준 4단계 핵심 파이프라인(콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공)으로 귀속시킨다.
 */
export function mapSubStageToCoreStage(subStage: WebtoonNowSubStage): WebtoonNowCoreStage {
  switch (subStage) {
    case "script-conti":
    case "draw-conti":
      return "storyboard";
    case "lineart":
    case "background-3d":
      return "lineart";
    case "flat-color":
    case "shading":
      return "coloring";
    case "vfx-compositing":
    case "typesetting":
      return "postprocess";
  }
}

export type WebtoonCutStatus = "waiting" | "in-progress" | "redline-requested" | "approved";

export interface WebtoonCutPipelineItem {
  readonly id: string;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly coreStage: WebtoonNowCoreStage;
  readonly subStage: WebtoonNowSubStage;
  readonly assigneeName: string;
  readonly status: WebtoonCutStatus;
  readonly openRedPenCount: number;
  readonly layerSeparatedValid: boolean;
  readonly estimatedHours: number;
  readonly elapsedHours: number;
}

export interface CoreStageDashboardSummary {
  readonly coreStage: WebtoonNowCoreStage;
  readonly labelKo: string;
  readonly totalCuts: number;
  readonly approvedCuts: number;
  readonly inProgressCuts: number;
  readonly redlineRequestedCuts: number;
  readonly waitingCuts: number;
  readonly completionPercent: number;
  readonly handoffGateBlocked: boolean;
  readonly blockReasonKo: string | null;
}

/**
 * 콘티 ➡️ 선화 ➡️ 채색 ➡️ 후가공 4단계 공정별 컷 진행률 및 다음 공정 인계(Handoff) 게이트 상태를 계산한다.
 */
export function computeCorePipelineDashboardSummary(
  cuts: readonly WebtoonCutPipelineItem[],
): readonly CoreStageDashboardSummary[] {
  return WEBTOON_NOW_CORE_STAGES.map((stageMeta) => {
    const stageCuts = cuts.filter((item) => item.coreStage === stageMeta.coreStage);
    const totalCuts = stageCuts.length;
    const approvedCuts = stageCuts.filter((item) => item.status === "approved").length;
    const inProgressCuts = stageCuts.filter((item) => item.status === "in-progress").length;
    const redlineRequestedCuts = stageCuts.filter(
      (item) => item.status === "redline-requested" || item.openRedPenCount > 0,
    ).length;
    const waitingCuts = stageCuts.filter((item) => item.status === "waiting").length;
    const unseparatedCount = stageCuts.filter((item) => !item.layerSeparatedValid).length;

    const completionPercent = totalCuts > 0 ? Math.round((approvedCuts / totalCuts) * 100) : 0;

    let handoffGateBlocked = false;
    let blockReasonKo: string | null = null;
    if (redlineRequestedCuts > 0) {
      handoffGateBlocked = true;
      blockReasonKo = `미해결 빨간펜 피드백 ${redlineRequestedCuts}컷 존재`;
    } else if (unseparatedCount > 0) {
      handoffGateBlocked = true;
      blockReasonKo = `PSD/CLIP 레이어 분리 미통과 ${unseparatedCount}컷`;
    }

    return {
      coreStage: stageMeta.coreStage,
      labelKo: stageMeta.labelKo,
      totalCuts,
      approvedCuts,
      inProgressCuts,
      redlineRequestedCuts,
      waitingCuts,
      completionPercent,
      handoffGateBlocked,
      blockReasonKo,
    };
  });
}

// ============================================================================
// 2. 레이어 분리 파일(PSD / CLIP) 구조 검수 엔진
// ============================================================================

export type ManuscriptFileFormat = "PSD" | "CLIP";

export type StandardWebtoonLayerRole =
  | "draft-conti"
  | "lineart"
  | "base-color"
  | "shading"
  | "background-3d"
  | "vfx-lighting"
  | "balloon-sfx";

export const STANDARD_LAYER_ROLE_LABELS_KO: Readonly<Record<StandardWebtoonLayerRole, string>> = {
  "draft-conti": "콘티·러프 레이어",
  lineart: "선화(펜선) 레이어",
  "base-color": "밑색 분리 레이어",
  shading: "명암(곱하기) 레이어",
  "background-3d": "배경·3D 레이어",
  "vfx-lighting": "후가공·발광 레이어",
  "balloon-sfx": "말풍선·식자·효과음 레이어",
};

export interface PsdClipLayerNode {
  readonly id: string;
  readonly name: string;
  readonly role: StandardWebtoonLayerRole | "unclassified";
  readonly blendMode: "normal" | "multiply" | "screen" | "overlay" | "add-glow";
  readonly isMergedOrFlattened: boolean;
  readonly isAlphaLocked: boolean;
  readonly isVisible: boolean;
  readonly byteSizeMb: number;
}

export interface PsdClipFileManifest {
  readonly fileName: string;
  readonly format: ManuscriptFileFormat;
  readonly totalSizeMb: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly dpi: number;
  readonly colorProfile: "sRGB" | "AdobeRGB" | "CMYK";
  readonly layers: readonly PsdClipLayerNode[];
}

export type PsdClipIssueCode =
  | "merged-layer-error"
  | "missing-required-layer"
  | "cmyk-profile-warning"
  | "low-dpi-warning"
  | "unlocked-shading-alpha"
  | "visible-draft-conti-in-final";

export interface PsdClipInspectionIssue {
  readonly code: PsdClipIssueCode;
  readonly severity: "error" | "warning";
  readonly messageKo: string;
  readonly layerId: string | null;
}

export interface PsdClipInspectionResult {
  readonly valid: boolean;
  readonly score: number;
  readonly separatedRoles: readonly StandardWebtoonLayerRole[];
  readonly issues: readonly PsdClipInspectionIssue[];
}

const REQUIRED_ROLES_BY_STAGE: Readonly<
  Record<WebtoonNowCoreStage, readonly StandardWebtoonLayerRole[]>
> = {
  storyboard: ["draft-conti"],
  lineart: ["lineart", "background-3d"],
  coloring: ["lineart", "base-color", "shading"],
  postprocess: ["lineart", "base-color", "shading", "vfx-lighting", "balloon-sfx"],
};

/**
 * PSD/CLIP 원고 파일의 레이어 트리 분리 상태, 블렌드 모드, 알파 잠금, 색상 프로파일(sRGB), 해상도(DPI)를 검수한다.
 */
export function inspectPsdClipLayerSeparation(
  manifest: PsdClipFileManifest,
  stage: WebtoonNowCoreStage,
): PsdClipInspectionResult {
  const issues: PsdClipInspectionIssue[] = [];
  const requiredRoles = REQUIRED_ROLES_BY_STAGE[stage];

  const separatedRoleSet = new Set<StandardWebtoonLayerRole>();
  for (const layer of manifest.layers) {
    if (layer.role !== "unclassified" && !layer.isMergedOrFlattened) {
      separatedRoleSet.add(layer.role);
    }
    if (layer.isMergedOrFlattened) {
      issues.push({
        code: "merged-layer-error",
        severity: "error",
        messageKo: `'${layer.name}' 레이어가 다른 공정 레이어와 병합(Flatten)되어 있어 후속 수정이 불가능합니다.`,
        layerId: layer.id,
      });
    }
    if (layer.role === "shading" && (!layer.isAlphaLocked || layer.blendMode !== "multiply")) {
      issues.push({
        code: "unlocked-shading-alpha",
        severity: "warning",
        messageKo: `'${layer.name}' 명암 레이어는 곱하기(Multiply) 블렌드 및 클리핑/알파 잠금이 권장됩니다.`,
        layerId: layer.id,
      });
    }
    if (stage === "postprocess" && layer.role === "draft-conti" && layer.isVisible) {
      issues.push({
        code: "visible-draft-conti-in-final",
        severity: "error",
        messageKo: `후가공 마감 본에 콘티 레이어('${layer.name}') 가시성이 켜져 있습니다.`,
        layerId: layer.id,
      });
    }
  }

  for (const requiredRole of requiredRoles) {
    if (!separatedRoleSet.has(requiredRole)) {
      issues.push({
        code: "missing-required-layer",
        severity: "error",
        messageKo: `${STANDARD_LAYER_ROLE_LABELS_KO[requiredRole]}가 독립 레이어로 분리되어 있지 않습니다.`,
        layerId: null,
      });
    }
  }

  if (manifest.colorProfile === "CMYK") {
    issues.push({
      code: "cmyk-profile-warning",
      severity: "warning",
      messageKo: "웹툰 연재 표준(sRGB)이 아닌 CMYK 프로파일입니다. 모바일 뷰어에서 채도 저하가 발생할 수 있습니다.",
      layerId: null,
    });
  }

  if (manifest.dpi < 300) {
    issues.push({
      code: "low-dpi-warning",
      severity: "warning",
      messageKo: `원고 해상도(${manifest.dpi} DPI)가 스튜디오 권장 기준(300 DPI 이상)보다 낮습니다.`,
      layerId: null,
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 30 - warningCount * 10);

  return {
    valid: errorCount === 0,
    score,
    separatedRoles: [...separatedRoleSet],
    issues,
  };
}

// ============================================================================
// 3. 대용량 이미지 수정 · 타일/컷 단위 델타 리비전(Delta Revision) 엔진
// ============================================================================

export interface LargeImageStripTile {
  readonly tileIndex: number;
  readonly cutNumbers: readonly number[];
  readonly startYPx: number;
  readonly endYPx: number;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly tileByteSizeMb: number;
}

export interface LargeManuscriptDeltaRevisionSummary {
  readonly fileName: string;
  readonly format: ManuscriptFileFormat;
  readonly totalTiles: number;
  readonly changedTileIndices: readonly number[];
  readonly affectedCutNumbers: readonly number[];
  readonly fullFileSizeMb: number;
  readonly deltaTransferMb: number;
  readonly bandwidthSavedPercent: number;
}

/**
 * 수백 MB에 달하는 웹툰 세로 스크롤 PSD/CLIP 대용량 원고 수정 시,
 * 변경된 타일 해시만 추출하여 실제 재전송·재검수가 필요한 컷 번호와 델타 용량을 계산한다.
 */
export function computeLargeManuscriptDeltaRevision(params: {
  readonly fileName: string;
  readonly format: ManuscriptFileFormat;
  readonly fullFileSizeMb: number;
  readonly tiles: readonly LargeImageStripTile[];
}): LargeManuscriptDeltaRevisionSummary {
  const changedTiles = params.tiles.filter((tile) => tile.previousHash !== tile.nextHash);
  const changedTileIndices = changedTiles.map((tile) => tile.tileIndex);
  const affectedCutsSet = new Set<number>();
  for (const tile of changedTiles) {
    for (const cutNum of tile.cutNumbers) {
      affectedCutsSet.add(cutNum);
    }
  }

  const rawDeltaMb = changedTiles.reduce((sum, tile) => sum + tile.tileByteSizeMb, 0);
  const deltaTransferMb = Math.round(rawDeltaMb * 10) / 10;
  const fullSize = Math.max(0.1, params.fullFileSizeMb);
  const savedRatio = Math.max(0, Math.min(1, (fullSize - deltaTransferMb) / fullSize));
  const bandwidthSavedPercent = Math.round(savedRatio * 100);

  return {
    fileName: params.fileName,
    format: params.format,
    totalTiles: params.tiles.length,
    changedTileIndices,
    affectedCutNumbers: [...affectedCutsSet].sort((a, b) => a - b),
    fullFileSizeMb: params.fullFileSizeMb,
    deltaTransferMb,
    bandwidthSavedPercent,
  };
}

// ============================================================================
// 4. 이미지 위 마우스 빨간 펜 치기(Red-Pen Markup) & 칸별 피드백 엔진
// ============================================================================

export type RedPenToolKind = "freehand-pen" | "arrow" | "rect-box" | "highlight";

export type RedPenInkColor = "#ef4444" | "#3b82f6" | "#eab308";

export interface RedPenPoint {
  readonly x: number;
  readonly y: number;
}

export interface RedPenStroke {
  readonly id: string;
  readonly tool: RedPenToolKind;
  readonly color: RedPenInkColor;
  readonly strokeWidthPx: number;
  readonly points: readonly RedPenPoint[];
}

export type CutRedPenStatus = "open" | "revised-uploaded" | "resolved";

export interface CutRedPenFeedbackItem {
  readonly id: string;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly targetCoreStage: WebtoonNowCoreStage;
  readonly targetLayerRole: StandardWebtoonLayerRole;
  readonly authorName: string;
  readonly instruction: string;
  readonly priority: "critical" | "normal";
  readonly status: CutRedPenStatus;
  readonly strokes: readonly RedPenStroke[];
  readonly createdAtIso: string;
  readonly resolvedAtIso: string | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

/**
 * 정규화된 [0, 1] 좌표 배열을 SVG path 문자열(`M x y L x y ...`)로 변환한다.
 */
export function buildSvgPathFromRedPenPoints(
  points: readonly RedPenPoint[],
  canvasWidth: number,
  canvasHeight: number,
): string {
  if (points.length === 0) return "";
  return points
    .map((pt, idx) => {
      const px = Math.round(clamp01(pt.x) * canvasWidth * 10) / 10;
      const py = Math.round(clamp01(pt.y) * canvasHeight * 10) / 10;
      return `${idx === 0 ? "M" : "L"} ${px} ${py}`;
    })
    .join(" ");
}

/**
 * 특정 칸(컷)과 타깃 PSD/CLIP 레이어에 바인딩된 빨간 펜 피드백을 등록한다.
 */
export function addCutRedPenFeedback(
  existing: readonly CutRedPenFeedbackItem[],
  draft: Omit<CutRedPenFeedbackItem, "status" | "resolvedAtIso">,
): {
  readonly added: boolean;
  readonly errorKo: string | null;
  readonly items: readonly CutRedPenFeedbackItem[];
} {
  const trimmed = draft.instruction.trim();
  if (!trimmed) {
    return {
      added: false,
      errorKo: "칸별 수정 요청 코멘트를 입력해 주세요.",
      items: existing,
    };
  }
  if (draft.cutNumber < 1) {
    return {
      added: false,
      errorKo: "유효한 칸(컷) 번호를 선택해 주세요.",
      items: existing,
    };
  }

  const normalizedStrokes: RedPenStroke[] = draft.strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((pt) => ({ x: clamp01(pt.x), y: clamp01(pt.y) })),
  }));

  const created: CutRedPenFeedbackItem = {
    ...draft,
    instruction: trimmed,
    status: "open",
    strokes: normalizedStrokes,
    resolvedAtIso: null,
  };

  return {
    added: true,
    errorKo: null,
    items: [created, ...existing],
  };
}

/**
 * 칸별 빨간 펜 피드백의 상태를 전환한다 (미해결 -> 수정본 업로드됨 -> 검수 완료).
 */
export function transitionCutRedPenStatus(
  items: readonly CutRedPenFeedbackItem[],
  feedbackId: string,
  nextStatus: CutRedPenStatus,
  timestampIso: string,
): readonly CutRedPenFeedbackItem[] {
  return items.map((item) => {
    if (item.id !== feedbackId) return item;
    return {
      ...item,
      status: nextStatus,
      resolvedAtIso: nextStatus === "resolved" ? timestampIso : null,
    };
  });
}

export interface CutRedPenSummary {
  readonly totalCount: number;
  readonly openCount: number;
  readonly revisedUploadedCount: number;
  readonly resolvedCount: number;
  readonly strokeAttachedCount: number;
  readonly countsByStage: Readonly<Record<WebtoonNowCoreStage, number>>;
}

/**
 * 공정별·상태별 칸별 빨간 펜 피드백 현황을 집계한다.
 */
export function summarizeCutRedPenByCutAndStage(
  items: readonly CutRedPenFeedbackItem[],
): CutRedPenSummary {
  const countsByStage: Record<WebtoonNowCoreStage, number> = {
    storyboard: 0,
    lineart: 0,
    coloring: 0,
    postprocess: 0,
  };

  let openCount = 0;
  let revisedUploadedCount = 0;
  let resolvedCount = 0;
  let strokeAttachedCount = 0;

  for (const item of items) {
    countsByStage[item.targetCoreStage] += 1;
    if (item.status === "open") openCount += 1;
    else if (item.status === "revised-uploaded") revisedUploadedCount += 1;
    else if (item.status === "resolved") resolvedCount += 1;

    if (item.strokes.length > 0) strokeAttachedCount += 1;
  }

  return {
    totalCount: items.length,
    openCount,
    revisedUploadedCount,
    resolvedCount,
    strokeAttachedCount,
    countsByStage,
  };
}

export const INITIAL_CUT_PIPELINE: readonly WebtoonCutPipelineItem[] = [
  { id: "cut-12-story", episodeNumber: 12, cutNumber: 4, coreStage: "storyboard", subStage: "draw-conti", assigneeName: "박서준 콘티작가", status: "approved", openRedPenCount: 0, layerSeparatedValid: true, estimatedHours: 3, elapsedHours: 2.5 },
  { id: "cut-12-line", episodeNumber: 12, cutNumber: 12, coreStage: "lineart", subStage: "lineart", assigneeName: "이수현 선화작가", status: "redline-requested", openRedPenCount: 1, layerSeparatedValid: true, estimatedHours: 5, elapsedHours: 5.5 },
  { id: "cut-12-color", episodeNumber: 12, cutNumber: 18, coreStage: "coloring", subStage: "shading", assigneeName: "최지우 채색어시", status: "in-progress", openRedPenCount: 1, layerSeparatedValid: false, estimatedHours: 6, elapsedHours: 6.5 },
  { id: "cut-12-post", episodeNumber: 12, cutNumber: 24, coreStage: "postprocess", subStage: "vfx-compositing", assigneeName: "정하늘 후보정어시", status: "waiting", openRedPenCount: 0, layerSeparatedValid: true, estimatedHours: 4, elapsedHours: 1 },
];

export const INITIAL_PSD_MANIFEST: PsdClipFileManifest = {
  fileName: "EP12_CUT18_24_MASTER.clip",
  format: "CLIP",
  totalSizeMb: 348.5,
  canvasWidthPx: 1440,
  canvasHeightPx: 36000,
  dpi: 350,
  colorProfile: "sRGB",
  layers: [
    { id: "lyr-conti", name: "00_콘티_러프", role: "draft-conti", blendMode: "normal", isMergedOrFlattened: false, isAlphaLocked: false, isVisible: false, byteSizeMb: 22.4 },
    { id: "lyr-line", name: "01_선화_펜선_분리", role: "lineart", blendMode: "normal", isMergedOrFlattened: false, isAlphaLocked: true, isVisible: true, byteSizeMb: 84.1 },
    { id: "lyr-base", name: "02_밑색_인물_의상", role: "base-color", blendMode: "normal", isMergedOrFlattened: true, isAlphaLocked: true, isVisible: true, byteSizeMb: 96.0 },
    { id: "lyr-shade", name: "03_명암_역광_곱하기", role: "shading", blendMode: "multiply", isMergedOrFlattened: false, isAlphaLocked: true, isVisible: true, byteSizeMb: 78.0 },
    { id: "lyr-vfx", name: "04_후가공_안개_발광", role: "vfx-lighting", blendMode: "add-glow", isMergedOrFlattened: false, isAlphaLocked: false, isVisible: true, byteSizeMb: 42.0 },
    { id: "lyr-balloon", name: "05_식자_말풍선_벡터", role: "balloon-sfx", blendMode: "normal", isMergedOrFlattened: false, isAlphaLocked: false, isVisible: true, byteSizeMb: 26.0 },
  ],
};

export const INITIAL_LARGE_IMAGE_TILES: readonly LargeImageStripTile[] = [
  { tileIndex: 1, cutNumbers: [1, 2, 3, 4, 5, 6], startYPx: 0, endYPx: 9000, previousHash: "sha256:tile1_a89f", nextHash: "sha256:tile1_a89f", tileByteSizeMb: 82.5 },
  { tileIndex: 2, cutNumbers: [7, 8, 9, 10, 11, 12], startYPx: 9000, endYPx: 18000, previousHash: "sha256:tile2_b11c", nextHash: "sha256:tile2_b99e_rev2", tileByteSizeMb: 41.2 },
  { tileIndex: 3, cutNumbers: [13, 14, 15, 16, 17, 18], startYPx: 18000, endYPx: 27000, previousHash: "sha256:tile3_c44d", nextHash: "sha256:tile3_c88f_rev2", tileByteSizeMb: 38.4 },
  { tileIndex: 4, cutNumbers: [19, 20, 21, 22, 23, 24], startYPx: 27000, endYPx: 36000, previousHash: "sha256:tile4_d02a", nextHash: "sha256:tile4_d02a", tileByteSizeMb: 86.4 },
];

export const INITIAL_REDPEN_FEEDBACKS: readonly CutRedPenFeedbackItem[] = [
  {
    id: "rp-1",
    episodeNumber: 12,
    cutNumber: 12,
    targetCoreStage: "lineart",
    targetLayerRole: "lineart",
    authorName: "총괄 연출 PD",
    instruction: "12컷 캐릭터 오른손 검 손잡이 파지 각도와 손가락 관절 외곽선을 빨간 펜 가이드대로 교정해 주세요.",
    priority: "critical",
    status: "open",
    strokes: [{ id: "st-1", tool: "freehand-pen", color: "#ef4444", strokeWidthPx: 3, points: [{ x: 0.22, y: 0.35 }, { x: 0.34, y: 0.42 }, { x: 0.48, y: 0.38 }] }],
    createdAtIso: "2026-10-26T11:20:00.000Z",
    resolvedAtIso: null,
  },
  {
    id: "rp-2",
    episodeNumber: 12,
    cutNumber: 18,
    targetCoreStage: "coloring",
    targetLayerRole: "shading",
    authorName: "메인 작화 작가",
    instruction: "18컷 성벽 창문 역광 하이라이트가 인물 얼굴 정면에 겹칩니다. 명암 곱하기 레이어 경계를 우측으로 이동해 주세요.",
    priority: "normal",
    status: "revised-uploaded",
    strokes: [{ id: "st-2", tool: "arrow", color: "#3b82f6", strokeWidthPx: 3, points: [{ x: 0.55, y: 0.25 }, { x: 0.75, y: 0.52 }] }],
    createdAtIso: "2026-10-26T12:05:00.000Z",
    resolvedAtIso: null,
  },
];

