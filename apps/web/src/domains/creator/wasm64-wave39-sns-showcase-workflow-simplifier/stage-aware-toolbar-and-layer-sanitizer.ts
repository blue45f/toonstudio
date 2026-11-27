export const SACRED_MIN_CANVAS_VIEWPORT_RATIO = 0.82;
export const SINGLE_CONTEXT_BAR_HEIGHT_PX = 44;
export const CANONICAL_TOP_MENU_BUDGET = 7;
export const MIN_PRIMARY_CONTROL_COUNT = 5;
export const MAX_PRIMARY_CONTROL_COUNT = 9;
export const MIN_CONTROL_HIT_SIZE_PX = 44;

export const CANONICAL_SEVEN_MENUS = [
  "파일", "편집", "캔버스/레이어", "웹툰/식자", "3D/모션", "협업/AI", "보기/도움말",
] as const;

export type CanonicalMenuLabel = (typeof CANONICAL_SEVEN_MENUS)[number];
export type StudioCreationStage = "rough" | "ink" | "flat" | "shade" | "lettering" | "export";
export type LayerBlendMode = "normal" | "multiply" | "screen" | "overlay" | "add" | "destination-out";
export type StandardLayerRole = "rough" | "ink" | "flat" | "shade" | "lettering" | "effect";

export interface RgbaColorSample {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface StudioLayerDescriptor {
  readonly id: string;
  readonly name: string;
  readonly blendMode: LayerBlendMode;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly isClippingMask: boolean;
  readonly hasLayerMask?: boolean;
  readonly nonZeroPixelCount: number;
  readonly roleHint?: StandardLayerRole;
  readonly sampleColor?: RgbaColorSample;
}

export interface StageInferenceSignals {
  readonly activeToolKind?:
    | "pencil-rough" | "ink-pen" | "fill-bucket" | "shading-brush"
    | "speech-balloon" | "text-typeset" | "crop-export" | "eraser" | "select";
  readonly layers: readonly StudioLayerDescriptor[];
  readonly preflightRequested?: boolean;
  readonly recentBalloonEditRatio?: number;
}

export interface StageInferenceResult {
  readonly stage: StudioCreationStage;
  readonly confidence: number;
  readonly rationaleKo: string;
  readonly stageScores: Readonly<Record<StudioCreationStage, number>>;
}

export interface PrimaryActionControlSpec {
  readonly actionId: string;
  readonly labelKo: string;
  readonly hitWidthPx: number;
  readonly hitHeightPx: number;
}

export interface OverflowDisclosureSummary {
  readonly labelKo: string;
  readonly hiddenControlCount: number;
  readonly activeOverrideCount: number;
}

export interface StageAwareChromeInput {
  readonly stage: StudioCreationStage;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly requestedTopBarHeightPx?: number;
  readonly requestedLeftRailWidthPx?: number;
  readonly requestedRightPanelWidthPx?: number;
  readonly requestedBottomShelfHeightPx?: number;
  readonly requestedMenuLabels?: readonly string[];
  readonly requestedControlHitSizePx?: number;
  readonly extraControlCount?: number;
  readonly activeOverrideCount?: number;
}

export interface StageAwareChromePlan {
  readonly stage: StudioCreationStage;
  readonly contextBarHeightPx: typeof SINGLE_CONTEXT_BAR_HEIGHT_PX;
  readonly topMenus: readonly CanonicalMenuLabel[];
  readonly leftRailWidthPx: number;
  readonly rightPanelWidthPx: number;
  readonly bottomShelfHeightPx: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly canvasViewportRatio: number;
  readonly primaryControls: readonly PrimaryActionControlSpec[];
  readonly overflowDisclosure: OverflowDisclosureSummary;
  readonly invariantsSatisfied: boolean;
}

export interface NormalizedStudioLayer extends StudioLayerDescriptor {
  readonly originalZIndex: number;
  readonly normalizedZIndex: number;
  readonly normalizedNameKo: string;
  readonly cutNumber: number | null;
  readonly inferredRole: StandardLayerRole;
  readonly folderId: string;
}

export interface NormalizedLayerFolder {
  readonly folderId: string;
  readonly folderPathKo: string;
  readonly cutNumber: number | null;
  readonly role: StandardLayerRole;
  readonly blendMode: "pass-through";
  readonly layerIds: readonly string[];
}

export interface CompositeEquivalenceReport {
  readonly equivalent: boolean;
  readonly maxChannelDelta: number;
  readonly zOrderMonotonic: boolean;
  readonly violationReasonKo: string | null;
}

export interface LayerSanitizationReport {
  readonly keptLayers: readonly NormalizedStudioLayer[];
  readonly removedLayerIds: readonly string[];
  readonly preservedEmptyBaseLayerIds: readonly string[];
  readonly folders: readonly NormalizedLayerFolder[];
  readonly compositeEquivalence: CompositeEquivalenceReport;
}

export type KoreanOneKnobMacroId = "sumi-ink-bleed" | "sunset-rim-backlight" | "print-bw-screentone";

export interface CompiledMacroFilterGraph {
  readonly macroId: KoreanOneKnobMacroId;
  readonly labelKo: "동양화 먹 번짐" | "오후 노을 역광" | "출판 흑백 스크린톤";
  readonly dialValue: number;
  readonly isIdentityBypass: boolean;
  readonly parameters: Readonly<Record<string, number>>;
}

const STAGE_PRIMARY_ACTIONS: Readonly<Record<StudioCreationStage, readonly { readonly actionId: string; readonly labelKo: string }[]>> = {
  rough: [
    { actionId: "rough-pencil-density", labelKo: "연필 농도 조절" },
    { actionId: "rough-guide-grid", labelKo: "구도 안내선 켜기" },
    { actionId: "rough-panel-slice", labelKo: "컷 테두리 나누기" },
    { actionId: "rough-mirror-flip", labelKo: "좌우 대칭 보기" },
    { actionId: "rough-soft-eraser", labelKo: "지우개 크기 맞춤" },
    { actionId: "rough-blue-underlay", labelKo: "밑그림 흐리게 전환" },
  ],
  ink: [
    { actionId: "ink-stabilize", labelKo: "선 떨림 보정" },
    { actionId: "ink-corner-round", labelKo: "모서리 다듬기" },
    { actionId: "ink-gap-close", labelKo: "선화 틈새 메우기" },
    { actionId: "ink-width-balance", labelKo: "선 굵기 균일화" },
    { actionId: "ink-cross-trim", labelKo: "교차선 깔끔 절단" },
    { actionId: "ink-reference-pin", labelKo: "기준 레이어 지정" },
  ],
  flat: [
    { actionId: "flat-enclosed-fill", labelKo: "선 안쪽 한 번에 채우기" },
    { actionId: "flat-gap-seal", labelKo: "선화 틈새 메우기" },
    { actionId: "flat-bleed-lock", labelKo: "인접 색 번짐 막기" },
    { actionId: "flat-palette-pin", labelKo: "밑색 팔레트 고정" },
    { actionId: "flat-speck-fill", labelKo: "칠 안 된 빈틈 찾기" },
    { actionId: "flat-outside-erase", labelKo: "영역 밖 칠 지우기" },
  ],
  shade: [
    { actionId: "shade-key-shadow", labelKo: "주광원 그림자 넣기" },
    { actionId: "shade-rim-glow", labelKo: "오후 역광 더하기" },
    { actionId: "shade-soft-edge", labelKo: "경계선 부드럽게 풀기" },
    { actionId: "shade-skin-guard", labelKo: "피부 색감 보호" },
    { actionId: "shade-specular-dot", labelKo: "재질 반사광 찍기" },
    { actionId: "shade-value-check", labelKo: "명암 단계 미리보기" },
  ],
  lettering: [
    { actionId: "letter-balloon-fit", labelKo: "말풍선 자동 맞춤" },
    { actionId: "letter-line-balance", labelKo: "대사 줄바꿈 정돈" },
    { actionId: "letter-tail-snap", labelKo: "말꼬리 방향 잇기" },
    { actionId: "letter-sfx-arc", labelKo: "효과음 글자 휘기" },
    { actionId: "letter-mobile-legibility", labelKo: "모바일 글자 크기 점검" },
    { actionId: "letter-margin-even", labelKo: "말풍선 여백 균형" },
  ],
  export: [
    { actionId: "export-mobile-check", labelKo: "모바일 가독성 점검" },
    { actionId: "export-rights-check", labelKo: "저작권 출처 확인" },
    { actionId: "export-sns-carousel", labelKo: "인스타 캐러셀 분할" },
    { actionId: "export-watermark-place", labelKo: "서명 워터마크 배치" },
    { actionId: "export-layer-clean", labelKo: "빈 레이어 자동 정리" },
    { actionId: "export-episode-pack", labelKo: "연재 규격 바로 출고" },
  ],
};

const ROLE_KO_LABEL: Readonly<Record<StandardLayerRole, string>> = {
  rough: "스케치", ink: "선화", flat: "밑색", shade: "명암", lettering: "식자", effect: "효과",
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function inferLayerRole(layer: StudioLayerDescriptor): StandardLayerRole {
  if (layer.roleHint) return layer.roleHint;
  const lower = layer.name.toLowerCase();
  if (/대사|말풍선|식자|글자|text|balloon|sfx/u.test(lower)) return "lettering";
  if (/러프|콘티|스케치|밑그림|rough|sketch|draft/u.test(lower)) return "rough";
  if (/선화|펜선|잉크|line|ink/u.test(lower)) return "ink";
  if (/명암|그림자|음영|빛|역광|shade|shadow|light/u.test(lower)) return "shade";
  if (/밑색|채색|배색|컬러|flat|color|base/u.test(lower)) return "flat";
  if (layer.blendMode === "multiply") return "shade";
  if (layer.blendMode === "screen" || layer.blendMode === "add") return "effect";
  return "flat";
}

function parseCutNumber(name: string): number | null {
  const match = /(?:컷|cut|panel|c)\s*0*(\d{1,3})/iu.exec(name);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function inferStudioCreationStage(signals: StageInferenceSignals): StageInferenceResult {
  const scores: Record<StudioCreationStage, number> = { rough: 1, ink: 1, flat: 1, shade: 1, lettering: 1, export: 1 };
  for (const layer of signals.layers) {
    if (!layer.visible || layer.nonZeroPixelCount <= 0) continue;
    const role = inferLayerRole(layer);
    if (role !== "effect") scores[role] += role === "lettering" ? 3 : 2.5;
  }
  const toolBoost: Partial<Record<NonNullable<StageInferenceSignals["activeToolKind"]>, StudioCreationStage>> = {
    "pencil-rough": "rough",
    "ink-pen": "ink",
    "fill-bucket": "flat",
    "shading-brush": "shade",
    "speech-balloon": "lettering",
    "text-typeset": "lettering",
    "crop-export": "export",
  };
  const boosted = signals.activeToolKind ? toolBoost[signals.activeToolKind] : undefined;
  if (boosted) scores[boosted] += boosted === "export" ? 10 : 8.5;
  if (signals.preflightRequested) scores.export += 12;
  if ((signals.recentBalloonEditRatio ?? 0) > 0.35) scores.lettering += (signals.recentBalloonEditRatio ?? 0) * 6;

  const ordered: readonly StudioCreationStage[] = ["export", "lettering", "shade", "flat", "ink", "rough"];
  let bestStage: StudioCreationStage = "rough";
  let bestScore = -1;
  let totalScore = 0;
  for (const st of ordered) {
    totalScore += scores[st];
    if (scores[st] > bestScore) {
      bestScore = scores[st];
      bestStage = st;
    }
  }
  const rationaleMap: Readonly<Record<StudioCreationStage, string>> = {
    rough: "콘티·밑그림 단계로 판별해 구도와 컷 분할 도구를 우선 배치했습니다.",
    ink: "펜선·선화 단계로 판별해 손떨림 보정과 틈새 메우기 도구를 전면 배치했습니다.",
    flat: "밑색 채우기 단계로 판별해 영역 채우기와 색 번짐 방지 도구를 전면 배치했습니다.",
    shade: "명암·조명 단계로 판별해 주광원 그림자와 역광 연출 도구를 전면 배치했습니다.",
    lettering: "식자·말풍선 단계로 판별해 대사 정돈과 모바일 가독성 도구를 전면 배치했습니다.",
    export: "검수·출고 단계로 판별해 저작권 확인과 플랫폼 분할 출고 도구를 전면 배치했습니다.",
  };
  return {
    stage: bestStage,
    confidence: clamp(bestScore / Math.max(1, totalScore), 0, 1),
    rationaleKo: rationaleMap[bestStage],
    stageScores: scores,
  };
}

export function buildStageAwareWorkspaceChrome(input: StageAwareChromeInput): StageAwareChromePlan {
  const vw = Math.max(320, Math.round(input.viewportWidthPx));
  const vh = Math.max(320, Math.round(input.viewportHeightPx));
  const contextBarHeightPx = SINGLE_CONTEXT_BAR_HEIGHT_PX;
  let leftRail = clamp(Math.round(input.requestedLeftRailWidthPx ?? 48), 0, 72);
  let rightPanel = Math.max(0, Math.round(input.requestedRightPanelWidthPx ?? 240));
  let bottomShelf = Math.max(0, Math.round(input.requestedBottomShelfHeightPx ?? 0));

  const ratioOf = (l: number, r: number, b: number) =>
    (Math.max(0, vw - l - r) * Math.max(0, vh - contextBarHeightPx - b)) / (vw * vh);

  if (ratioOf(leftRail, rightPanel, bottomShelf) < SACRED_MIN_CANVAS_VIEWPORT_RATIO) bottomShelf = 0;
  if (ratioOf(leftRail, rightPanel, bottomShelf) < SACRED_MIN_CANVAS_VIEWPORT_RATIO) {
    const minCanvasW = Math.ceil((SACRED_MIN_CANVAS_VIEWPORT_RATIO * vw * vh) / Math.max(1, vh - contextBarHeightPx));
    const maxHoriz = Math.max(0, vw - minCanvasW);
    if (leftRail > maxHoriz) {
      leftRail = maxHoriz;
      rightPanel = 0;
    } else {
      rightPanel = Math.min(rightPanel, maxHoriz - leftRail);
    }
  }

  const canvasWidthPx = Math.max(0, vw - leftRail - rightPanel);
  const canvasHeightPx = Math.max(0, vh - contextBarHeightPx - bottomShelf);
  const canvasViewportRatio = (canvasWidthPx * canvasHeightPx) / (vw * vh);
  const hitSize = Math.max(MIN_CONTROL_HIT_SIZE_PX, Math.round(input.requestedControlHitSizePx ?? 44));
  const primaryControls: PrimaryActionControlSpec[] = STAGE_PRIMARY_ACTIONS[input.stage]
    .slice(0, MAX_PRIMARY_CONTROL_COUNT)
    .map((a) => ({ actionId: a.actionId, labelKo: a.labelKo, hitWidthPx: hitSize, hitHeightPx: hitSize }));

  const extraMenus = Math.max(0, (input.requestedMenuLabels?.length ?? 7) - CANONICAL_TOP_MENU_BUDGET);
  const collapsedPanel = (input.requestedRightPanelWidthPx ?? 0) > rightPanel ? 4 : 0;
  const invariantsSatisfied =
    canvasViewportRatio >= SACRED_MIN_CANVAS_VIEWPORT_RATIO
    && primaryControls.length >= MIN_PRIMARY_CONTROL_COUNT
    && primaryControls.length <= MAX_PRIMARY_CONTROL_COUNT
    && primaryControls.every((c) => c.hitWidthPx >= MIN_CONTROL_HIT_SIZE_PX && c.hitHeightPx >= MIN_CONTROL_HIT_SIZE_PX)
    && CANONICAL_SEVEN_MENUS.length <= CANONICAL_TOP_MENU_BUDGET;

  return {
    stage: input.stage,
    contextBarHeightPx,
    topMenus: CANONICAL_SEVEN_MENUS,
    leftRailWidthPx: leftRail,
    rightPanelWidthPx: rightPanel,
    bottomShelfHeightPx: bottomShelf,
    canvasWidthPx,
    canvasHeightPx,
    canvasViewportRatio,
    primaryControls,
    overflowDisclosure: {
      labelKo: "고급 도구 더보기",
      hiddenControlCount: Math.max(0, input.extraControlCount ?? 0) + extraMenus + collapsedPanel,
      activeOverrideCount: Math.max(0, input.activeOverrideCount ?? 0),
    },
    invariantsSatisfied,
  };
}

function deterministicLayerSwatch(layer: StudioLayerDescriptor): RgbaColorSample {
  if (layer.sampleColor) return layer.sampleColor;
  if (layer.nonZeroPixelCount <= 0 || !layer.visible || layer.opacity <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  let hash = 2166136261;
  for (let i = 0; i < layer.id.length; i += 1) hash = Math.imul(hash ^ layer.id.charCodeAt(i), 16777619) >>> 0;
  return {
    r: ((hash & 0xff) / 255) * 0.75 + 0.15,
    g: (((hash >>> 8) & 0xff) / 255) * 0.75 + 0.15,
    b: (((hash >>> 16) & 0xff) / 255) * 0.75 + 0.15,
    a: clamp(layer.opacity, 0, 1) * 0.82,
  };
}

function blendChannel(dst: number, src: number, mode: LayerBlendMode): number {
  if (mode === "multiply") return dst * src;
  if (mode === "screen") return 1 - (1 - dst) * (1 - src);
  if (mode === "overlay") return dst < 0.5 ? 2 * dst * src : 1 - 2 * (1 - dst) * (1 - src);
  if (mode === "add") return Math.min(1, dst + src);
  return src;
}

function evaluateStackComposite(layers: readonly StudioLayerDescriptor[]): RgbaColorSample {
  let backdrop: RgbaColorSample = { r: 0.96, g: 0.95, b: 0.92, a: 1 };
  let clipBaseAlpha = 0;
  for (const layer of layers) {
    if (!layer.visible) {
      if (!layer.isClippingMask) clipBaseAlpha = 0;
      continue;
    }
    const sw = deterministicLayerSwatch(layer);
    const rawA = layer.nonZeroPixelCount > 0 ? clamp(sw.a * clamp(layer.opacity, 0, 1), 0, 1) : 0;
    if (!layer.isClippingMask) clipBaseAlpha = rawA;
    const effA = layer.isClippingMask ? rawA * clipBaseAlpha : rawA;
    if (layer.blendMode === "destination-out") {
      const keep = 1 - effA;
      backdrop = { r: backdrop.r * keep, g: backdrop.g * keep, b: backdrop.b * keep, a: backdrop.a * keep };
      continue;
    }
    if (effA <= 0) continue;
    backdrop = {
      r: backdrop.r * (1 - effA) + blendChannel(backdrop.r, sw.r, layer.blendMode) * effA,
      g: backdrop.g * (1 - effA) + blendChannel(backdrop.g, sw.g, layer.blendMode) * effA,
      b: backdrop.b * (1 - effA) + blendChannel(backdrop.b, sw.b, layer.blendMode) * effA,
      a: backdrop.a + effA * (1 - backdrop.a),
    };
  }
  return backdrop;
}

export function verifyCompositeOrderEquivalence(
  beforeLayers: readonly StudioLayerDescriptor[],
  afterLayers: readonly StudioLayerDescriptor[],
): CompositeEquivalenceReport {
  const origIdxMap = new Map(beforeLayers.map((l, idx) => [l.id, idx]));
  let prevIdx = -1;
  let zOrderMonotonic = true;
  for (const l of afterLayers) {
    const idx = origIdxMap.get(l.id);
    if (idx === undefined || idx <= prevIdx) {
      zOrderMonotonic = false;
      break;
    }
    prevIdx = idx;
  }
  const c0 = evaluateStackComposite(beforeLayers);
  const c1 = evaluateStackComposite(afterLayers);
  const maxChannelDelta = Math.max(Math.abs(c0.r - c1.r), Math.abs(c0.g - c1.g), Math.abs(c0.b - c1.b), Math.abs(c0.a - c1.a));
  const equivalent = zOrderMonotonic && maxChannelDelta <= 1e-6;
  return {
    equivalent,
    maxChannelDelta,
    zOrderMonotonic,
    violationReasonKo: !zOrderMonotonic
      ? "레이어 상하 합성 순서가 뒤바뀌어 비가환 블렌드 결과가 달라집니다."
      : maxChannelDelta > 1e-6
        ? "레이어 정리 전후 픽셀 합성 결과에 오차가 발생했습니다."
        : null,
  };
}

export function sanitizeAndNormalizeStudioLayers(layers: readonly StudioLayerDescriptor[]): LayerSanitizationReport {
  const clippedBaseIds = new Set<string>();
  let currentBaseId: string | null = null;
  for (const layer of layers) {
    if (!layer.isClippingMask) currentBaseId = layer.id;
    else if (currentBaseId !== null) clippedBaseIds.add(currentBaseId);
  }

  const removedLayerIds: string[] = [];
  const preservedEmptyBaseLayerIds: string[] = [];
  const surviving: { readonly layer: StudioLayerDescriptor; readonly originalZIndex: number }[] = [];

  for (let idx = 0; idx < layers.length; idx += 1) {
    const layer = layers[idx];
    const isEmpty = layer.nonZeroPixelCount === 0;
    if (isEmpty && clippedBaseIds.has(layer.id)) {
      preservedEmptyBaseLayerIds.push(layer.id);
      surviving.push({ layer, originalZIndex: idx });
    } else if (isEmpty && !layer.locked && !layer.isClippingMask && !layer.hasLayerMask && layer.blendMode !== "destination-out") {
      removedLayerIds.push(layer.id);
    } else {
      surviving.push({ layer, originalZIndex: idx });
    }
  }

  const counters = new Map<string, number>();
  const folders: NormalizedLayerFolder[] = [];
  const keptLayers: NormalizedStudioLayer[] = [];

  for (let normIdx = 0; normIdx < surviving.length; normIdx += 1) {
    const { layer, originalZIndex } = surviving[normIdx];
    const role = inferLayerRole(layer);
    const cutNumber = parseCutNumber(layer.name);
    const cutPrefix = cutNumber !== null ? `컷${String(cutNumber).padStart(2, "0")}` : "공통";
    const roleLabel = ROLE_KO_LABEL[role];
    const key = `${cutPrefix}_${role}`;
    const seq = (counters.get(key) ?? 0) + 1;
    counters.set(key, seq);

    const prev = folders[folders.length - 1];
    let folderId: string;
    if (prev && (layer.isClippingMask || (prev.cutNumber === cutNumber && prev.role === role))) {
      folderId = prev.folderId;
      folders[folders.length - 1] = { ...prev, layerIds: [...prev.layerIds, layer.id] };
    } else {
      folderId = `folder_${String(folders.length + 1).padStart(2, "0")}_${key}`;
      folders.push({ folderId, folderPathKo: `${cutPrefix}/${roleLabel}`, cutNumber, role, blendMode: "pass-through", layerIds: [layer.id] });
    }
    keptLayers.push({
      ...layer,
      originalZIndex,
      normalizedZIndex: normIdx,
      normalizedNameKo: `${cutPrefix}_${roleLabel}_${String(seq).padStart(2, "0")}`,
      cutNumber,
      inferredRole: role,
      folderId,
    });
  }
  return {
    keptLayers,
    removedLayerIds,
    preservedEmptyBaseLayerIds,
    folders,
    compositeEquivalence: verifyCompositeOrderEquivalence(layers, keptLayers),
  };
}

export function compileOneKnobKoreanLookMacro(macroId: KoreanOneKnobMacroId, dialValue0To100: number): CompiledMacroFilterGraph {
  const dialValue = clamp(dialValue0To100, 0, 100);
  const t = dialValue / 100;
  const s = t * t * (3 - 2 * t);
  const isIdentityBypass = dialValue === 0;
  switch (macroId) {
    case "sumi-ink-bleed":
      return {
        macroId, labelKo: "동양화 먹 번짐", dialValue, isIdentityBypass,
        parameters: {
          wetDiffusionRadiusPx: Number((s * 9.5).toFixed(4)),
          hanjiFiberGrain: Number((t * 0.68).toFixed(4)),
          inkDensityGamma: Number((1 + s * 0.42).toFixed(4)),
          dryBristleBreakup: Number((t * 0.55).toFixed(4)),
          warmPaperTintStrength: Number((t * 0.24).toFixed(4)),
        },
      };
    case "sunset-rim-backlight":
      return {
        macroId, labelKo: "오후 노을 역광", dialValue, isIdentityBypass,
        parameters: {
          keyLightKelvin: Math.round(6500 - s * 3300),
          rimLightWidthPx: Number((t * 6.5).toFixed(4)),
          rimLightIntensity: Number((s * 0.85).toFixed(4)),
          shadowIndigoTint: Number((t * 0.36).toFixed(4)),
          halationSoftness: Number((s * 0.48).toFixed(4)),
        },
      };
    case "print-bw-screentone":
      return {
        macroId, labelKo: "출판 흑백 스크린톤", dialValue, isIdentityBypass,
        parameters: {
          monochromeMix: Number(clamp(t * 1.25, 0, 1).toFixed(4)),
          screentoneFrequencyLpi: Number((85 - s * 25).toFixed(2)),
          dotGainCompensation: Number((t * 0.18).toFixed(4)),
          sCurveContrast: Number((s * 0.64).toFixed(4)),
          pureInkThreshold: Number((0.08 + t * 0.14).toFixed(4)),
        },
      };
  }
}
