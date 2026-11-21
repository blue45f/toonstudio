/**
 * InvokeAI Unified Canvas · ComfyUI Regional Conditioning 클린룸 지역 프롬프트·ControlNet 스택·비파괴 스테이징 엔진.
 *
 * - 문서 공간 불변 RegionalGuidanceLayer(마스크·긍정/부정 프롬프트·캐릭터 앵커·반전·페더·가중치)
 * - 5종 ControlNet 채널(lineart / bg3d-depth / vrm-openpose / scribble / tile) 강도(0~2) 및 스텝 불변식(start <= end)
 * - 64px 배수 경계 상자(BBox) 스냅·클램프 정규화 및 다중 캐릭터 프롬프트 번짐(Prompt Bleeding) 교차 검사
 * - Rights BOM 라이선스·BYOK 동의 가드 + 최대 4후보 어니언스킨(기본 0.65) 비파괴 Staging Area 상태 머신
 */

export const AI_BBOX_GRID_STEP_PX = 64;
export const AI_CONTROL_STRENGTH_MIN = 0;
export const AI_CONTROL_STRENGTH_MAX = 2;
export const AI_STAGING_MAX_CANDIDATES = 4;
export const AI_STAGING_DEFAULT_ONION_SKIN_ALPHA = 0.65;

export interface CanvasBoundingBoxPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedBBoxResult {
  readonly box: CanvasBoundingBoxPx;
  readonly wasSnapped: boolean;
  readonly wasClamped: boolean;
}

export interface RegionalGuidanceLayer {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly maskLayerId: string;
  readonly regionBoundsPx: CanvasBoundingBoxPx;
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly characterAnchorId?: string;
  readonly invert: boolean;
  readonly featherPx: number;
  readonly weight01: number;
}

export type ControlNetChannelKind =
  | "lineart"
  | "bg3d-depth"
  | "vrm-openpose"
  | "scribble"
  | "tile";

export interface ControlNetStackItem {
  readonly id: string;
  readonly label: string;
  readonly channel: ControlNetChannelKind;
  readonly sourceLayerId: string;
  readonly enabled: boolean;
  readonly strength: number;
  readonly startStep01: number;
  readonly endStep01: number;
}

export type SourceAssetLicenseStatus =
  | "creator-original"
  | "commercial-cleared"
  | "reference-only"
  | "unverified";

export interface RightsConsentGuardInput {
  readonly byokProviderConsentConfirmed: boolean;
  readonly commercialExportIntended: boolean;
  readonly sourceAssetLicenses: readonly SourceAssetLicenseStatus[];
}

export interface CompiledRegionalRegion {
  readonly layerId: string;
  readonly maskLayerId: string;
  readonly characterAnchorId?: string;
  readonly normalizedBoundsPx: CanvasBoundingBoxPx;
  readonly positivePrompt: string;
  readonly negativePrompt: string;
  readonly invert: boolean;
  readonly featherPx: number;
  readonly weight01: number;
}

export type CompiledRegionalConditioningResult =
  | {
      readonly ok: true;
      readonly generationBoundsPx: CanvasBoundingBoxPx;
      readonly regions: readonly CompiledRegionalRegion[];
      readonly controlStack: readonly ControlNetStackItem[];
      readonly warnings: readonly string[];
      readonly isolatedAnchorCount: number;
    }
  | {
      readonly ok: false;
      readonly code:
        | "BYOK_CONSENT_REQUIRED"
        | "RIGHTS_BOM_BLOCKED"
        | "NO_ACTIVE_GUIDANCE"
        | "CANVAS_TOO_SMALL";
      readonly message: string;
      readonly blockingReasons: readonly string[];
    };

export interface StagingCandidateItem {
  readonly id: string;
  readonly seed: number;
  readonly previewRef: string;
  readonly generatedAtIso: string;
  readonly invertedMaskRetry: boolean;
}

export interface StagingAreaState {
  readonly status: "idle" | "staging" | "committed" | "discarded";
  readonly targetBoundsPx: CanvasBoundingBoxPx;
  readonly maskLayerId: string;
  readonly invertedMask: boolean;
  readonly onionSkinAlpha01: number;
  readonly candidates: readonly StagingCandidateItem[];
  readonly selectedCandidateId: string | null;
  readonly committedLayerId: string | null;
}

export interface NonDestructiveLayerCommitRecord {
  readonly newLayerId: string;
  readonly layerName: string;
  readonly kind: "ai-regional-raster";
  readonly boundsPx: CanvasBoundingBoxPx;
  readonly sourceCandidateId: string;
  readonly sourceSeed: number;
  readonly preservesUnderlyingLayers: true;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * 경계 상자(BBox)를 64px 배수로 정렬하고 캔버스 영역([0..W] x [0..H]) 내부로 안전하게 클램프한다.
 */
export function snapBoundingBoxTo64(
  box: CanvasBoundingBoxPx,
  canvasWidthPx: number,
  canvasHeightPx: number,
): NormalizedBBoxResult {
  const maxGridW = Math.max(
    AI_BBOX_GRID_STEP_PX,
    Math.floor(canvasWidthPx / AI_BBOX_GRID_STEP_PX) * AI_BBOX_GRID_STEP_PX,
  );
  const maxGridH = Math.max(
    AI_BBOX_GRID_STEP_PX,
    Math.floor(canvasHeightPx / AI_BBOX_GRID_STEP_PX) * AI_BBOX_GRID_STEP_PX,
  );

  const snappedW = Math.max(
    AI_BBOX_GRID_STEP_PX,
    snapToGrid(Math.max(1, box.width), AI_BBOX_GRID_STEP_PX),
  );
  const snappedH = Math.max(
    AI_BBOX_GRID_STEP_PX,
    snapToGrid(Math.max(1, box.height), AI_BBOX_GRID_STEP_PX),
  );

  const clampedW = Math.min(snappedW, maxGridW);
  const clampedH = Math.min(snappedH, maxGridH);

  const rawX = snapToGrid(box.x, AI_BBOX_GRID_STEP_PX);
  const rawY = snapToGrid(box.y, AI_BBOX_GRID_STEP_PX);

  const maxStartX = Math.max(0, maxGridW - clampedW);
  const maxStartY = Math.max(0, maxGridH - clampedH);

  const finalX = clamp(rawX, 0, maxStartX);
  const finalY = clamp(rawY, 0, maxStartY);

  const normalized: CanvasBoundingBoxPx = {
    x: finalX,
    y: finalY,
    width: clampedW,
    height: clampedH,
  };

  const wasSnapped =
    normalized.x !== box.x ||
    normalized.y !== box.y ||
    normalized.width !== box.width ||
    normalized.height !== box.height;
  const wasClamped =
    rawX !== finalX || rawY !== finalY || snappedW !== clampedW || snappedH !== clampedH;

  return {
    box: normalized,
    wasSnapped,
    wasClamped,
  };
}

/**
 * ControlNet 스택 항목의 강도(0..2)와 시작/종료 스텝 불변식(0 <= start <= end <= 1)을 강제한다.
 */
export function normalizeControlNetStackItem(
  item: ControlNetStackItem,
): ControlNetStackItem {
  const s0 = clamp(item.startStep01, 0, 1);
  const s1 = clamp(item.endStep01, 0, 1);
  return {
    ...item,
    strength: clamp(item.strength, AI_CONTROL_STRENGTH_MIN, AI_CONTROL_STRENGTH_MAX),
    startStep01: Math.min(s0, s1),
    endStep01: Math.max(s0, s1),
  };
}

/**
 * 불변 문서 공간 RegionalGuidanceLayer를 검증·생성한다.
 */
export function createRegionalGuidanceLayer(
  input: RegionalGuidanceLayer,
): RegionalGuidanceLayer {
  return {
    ...input,
    id: input.id.trim(),
    label: input.label.trim() || "지역 가이던스 레이어",
    positivePrompt: input.positivePrompt.trim(),
    negativePrompt: input.negativePrompt.trim(),
    characterAnchorId: input.characterAnchorId?.trim() || undefined,
    featherPx: Math.round(clamp(input.featherPx, 0, 128)),
    weight01: clamp(input.weight01, 0, 1),
  };
}

function computeIntersectionOverUnion(
  a: CanvasBoundingBoxPx,
  b: CanvasBoundingBoxPx,
): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return 0;
  const inter = (x1 - x0) * (y1 - y0);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * 다중 캐릭터 프롬프트 번짐(Prompt Bleeding) 격리·Rights BOM/BYOK 가드·64px 정규화를 거쳐
 * 지역 컨디셔닝 페이로드를 컴파일한다.
 */
export function compileRegionalConditioningPayload(input: {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly generationBoundsPx: CanvasBoundingBoxPx;
  readonly regions: readonly RegionalGuidanceLayer[];
  readonly controlStack: readonly ControlNetStackItem[];
  readonly rightsGuard: RightsConsentGuardInput;
}): CompiledRegionalConditioningResult {
  if (
    input.canvasWidthPx < AI_BBOX_GRID_STEP_PX ||
    input.canvasHeightPx < AI_BBOX_GRID_STEP_PX
  ) {
    return {
      ok: false,
      code: "CANVAS_TOO_SMALL",
      message: "캔버스 크기가 최소 생성 단위(64x64px)보다 작습니다.",
      blockingReasons: ["캔버스 가로·세로 모두 최소 64px 이상이어야 합니다."],
    };
  }

  if (!input.rightsGuard.byokProviderConsentConfirmed) {
    return {
      ok: false,
      code: "BYOK_CONSENT_REQUIRED",
      message: "외부 BYOK AI 제공자 전송 동의가 확인되지 않아 생성을 중단합니다.",
      blockingReasons: ["BYOK 모델 키 및 전송 범위 동의가 필요합니다."],
    };
  }

  if (input.rightsGuard.commercialExportIntended) {
    const blockedAssets = input.rightsGuard.sourceAssetLicenses.filter(
      (tag) => tag === "reference-only" || tag === "unverified",
    );
    if (blockedAssets.length > 0) {
      return {
        ok: false,
        code: "RIGHTS_BOM_BLOCKED",
        message: "상업용 내보내기 대상에 참고 전용 또는 미검증 라이선스 소스가 포함되어 있습니다.",
        blockingReasons: [
          `라이선스 미충족 에셋 ${blockedAssets.length}건(reference-only/unverified)을 제거하거나 대체해야 합니다.`,
        ],
      };
    }
  }

  const activeRegions = input.regions
    .filter((r) => r.enabled)
    .map(createRegionalGuidanceLayer);
  if (activeRegions.length === 0) {
    return {
      ok: false,
      code: "NO_ACTIVE_GUIDANCE",
      message: "활성화된 지역 가이던스 레이어가 없습니다.",
      blockingReasons: ["최소 1개 이상의 지역 프롬프트 마스크 레이어를 활성화하세요."],
    };
  }

  const genBox = snapBoundingBoxTo64(
    input.generationBoundsPx,
    input.canvasWidthPx,
    input.canvasHeightPx,
  );
  const warnings: string[] = [];
  if (genBox.wasSnapped) {
    warnings.push("생성 경계 상자(BBox)가 64px 격자에 맞춰 자동 정규화되었습니다.");
  }

  const compiledRegions: CompiledRegionalRegion[] = activeRegions.map((region) => {
    const snapped = snapBoundingBoxTo64(
      region.regionBoundsPx,
      input.canvasWidthPx,
      input.canvasHeightPx,
    );
    return {
      layerId: region.id,
      maskLayerId: region.maskLayerId,
      characterAnchorId: region.characterAnchorId,
      normalizedBoundsPx: snapped.box,
      positivePrompt: region.positivePrompt,
      negativePrompt: region.negativePrompt,
      invert: region.invert,
      featherPx: region.featherPx,
      weight01: region.weight01,
    };
  });

  // 다중 캐릭터 영역 중첩 및 미할당 중첩(프롬프트 번짐 위험) 검사
  const distinctAnchors = new Set<string>();
  for (const r of compiledRegions) {
    if (r.characterAnchorId) distinctAnchors.add(r.characterAnchorId);
  }

  for (let i = 0; i < compiledRegions.length; i += 1) {
    for (let j = i + 1; j < compiledRegions.length; j += 1) {
      const a = compiledRegions[i];
      const b = compiledRegions[j];
      const iou = computeIntersectionOverUnion(
        a.normalizedBoundsPx,
        b.normalizedBoundsPx,
      );
      if (iou <= 0.2) continue;

      if (a.characterAnchorId && b.characterAnchorId && a.characterAnchorId !== b.characterAnchorId) {
        warnings.push(
          `캐릭터 앵커(${a.characterAnchorId}, ${b.characterAnchorId}) 마스크가 ${(iou * 100).toFixed(0)}% 겹쳐 프롬프트 번짐 위험이 있습니다.`,
        );
      } else if (!a.characterAnchorId || !b.characterAnchorId) {
        warnings.push(
          `레이어(${a.layerId}, ${b.layerId}) 중 캐릭터 앵커가 비어 있는 중첩 영역이 감지되었습니다.`,
        );
      }
    }
  }

  const normalizedControls = input.controlStack
    .filter((item) => item.enabled)
    .map(normalizeControlNetStackItem);

  return {
    ok: true,
    generationBoundsPx: genBox.box,
    regions: compiledRegions,
    controlStack: normalizedControls,
    warnings,
    isolatedAnchorCount: distinctAnchors.size,
  };
}

/**
 * 비파괴 Staging Area 초기 상태를 생성한다.
 */
export function createIdleStagingArea(
  targetBoundsPx: CanvasBoundingBoxPx,
  maskLayerId: string,
): StagingAreaState {
  return {
    status: "idle",
    targetBoundsPx,
    maskLayerId,
    invertedMask: false,
    onionSkinAlpha01: AI_STAGING_DEFAULT_ONION_SKIN_ALPHA,
    candidates: [],
    selectedCandidateId: null,
    committedLayerId: null,
  };
}

/**
 * 최대 4개의 생성 후보를 Staging Area에 적재하고 첫 번째 후보를 선택한다.
 */
export function stageCandidates(
  state: StagingAreaState,
  candidates: readonly StagingCandidateItem[],
): StagingAreaState {
  const capped = candidates.slice(0, AI_STAGING_MAX_CANDIDATES);
  return {
    ...state,
    status: capped.length > 0 ? "staging" : "idle",
    candidates: capped,
    selectedCandidateId: capped[0]?.id ?? null,
    committedLayerId: null,
  };
}

/**
 * Staging Area에서 비교 중인 후보 ID를 전환한다.
 */
export function selectStagingCandidate(
  state: StagingAreaState,
  candidateId: string,
): StagingAreaState {
  if (!state.candidates.some((c) => c.id === candidateId)) {
    return state;
  }
  return {
    ...state,
    selectedCandidateId: candidateId,
  };
}

/**
 * 원본 캔버스와 후보 이미지 비교용 어니언스킨 투명도를 조절한다. (기본 0.65)
 */
export function setStagingOnionSkinAlpha(
  state: StagingAreaState,
  alpha01: number,
): StagingAreaState {
  return {
    ...state,
    onionSkinAlpha01: clamp(alpha01, 0, 1),
  };
}

/**
 * 선택된 후보를 기존 레이어를 덮어쓰지 않고 신규 비파괴 래스터 레이어로 확정한다.
 */
export function acceptCandidateToNewLayer(
  state: StagingAreaState,
  newLayerId: string,
  layerName: string,
): {
  readonly nextState: StagingAreaState;
  readonly commitRecord: NonDestructiveLayerCommitRecord;
} | null {
  if (state.status !== "staging" || !state.selectedCandidateId) {
    return null;
  }
  const chosen = state.candidates.find((c) => c.id === state.selectedCandidateId);
  if (!chosen) return null;

  const trimmedLayerId = newLayerId.trim() || `ai-layer-${chosen.id}`;
  return {
    nextState: {
      ...state,
      status: "committed",
      committedLayerId: trimmedLayerId,
    },
    commitRecord: {
      newLayerId: trimmedLayerId,
      layerName: layerName.trim() || "AI 지역 생성 레이어",
      kind: "ai-regional-raster",
      boundsPx: state.targetBoundsPx,
      sourceCandidateId: chosen.id,
      sourceSeed: chosen.seed,
      preservesUnderlyingLayers: true,
    },
  };
}

/**
 * Staging Area 후보를 모두 폐기한다. (원본 캔버스 무손상)
 */
export function discardStagingArea(state: StagingAreaState): StagingAreaState {
  return {
    ...state,
    status: "discarded",
    candidates: [],
    selectedCandidateId: null,
  };
}

/**
 * 마스크를 반전(Invert)해 동일 영역에서 재시도할 수 있도록 Staging Area를 준비한다.
 */
export function retryStagingWithInvertedMask(state: StagingAreaState): StagingAreaState {
  return {
    ...state,
    status: "idle",
    invertedMask: !state.invertedMask,
    candidates: [],
    selectedCandidateId: null,
    committedLayerId: null,
  };
}
