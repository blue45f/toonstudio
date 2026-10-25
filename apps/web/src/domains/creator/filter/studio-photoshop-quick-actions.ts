/**
 * Adobe Photoshop Web (v2026.21.0.0) 퀵 액션(Quick Actions) & 조정 프리셋 V2(Adjustment Presets V2) 엔진
 *
 * REA 정적·라이브 번들 역공학(`ev_0fb6b10eccb962217a3bc3ff81417f7676422fa68a1e356b4b72b34f4007a9fa`,
 * `ev_effe0ee2754b2ce89afba22c9e65666598e2f08453a64f66a716f9c75cd969c4`,
 * `QuickActionsStore.chunk.Dg6paYOA.js`, `QuickActionsManager.chunk.OMsFMydh.js`,
 * `HomeQuickEditsSection.chunk.CWfHV_zX.js`, `adjustmentPresetsV2.chunk.Oj-cp__5.js`,
 * `Learn.chunk.I5kiN6gO.js`)에서 추출한:
 * 1. 4개 퀵 액션 카테고리(`background`, `auto`, `lighting`, `stylize`) 및 13개 비파괴 원클릭 액션
 * 2. `QuickActionsManager.updateQuickActionsEnablement` 레이어 자격 상태 머신
 *    (`multiselection`, `viewonly`, `layerkind`, `layervisibility`, `layercontent`)
 * 3. `prepareLayer`(`duplicate`, `applyMask`), 이전 레이어 숨김/이름 변경(`Background`),
 *    가역적 히스토리 복원(`historyBeforeQuickAction`, `revertLastQuickAction`) 파이프라인
 * 4. 30개 조정 프리셋 V2(`cinematic`, `black_and_white`, `environment`, `portrait`, `creative`) 및
 *    다중 조정 레이어 체인(Curves, Levels, ColorBalance, HueSaturation 6-Ramp, Vibrance, Brightness,
 *    Exposure, BlackAndWhite, SolidColor SoftLight) 결정론적 RGBA 평가기를 클린룸 구현한다.
 */

export type PhotoshopQuickActionCategoryId =
  | "background"
  | "auto"
  | "lighting"
  | "stylize";

export type PhotoshopQuickActionId =
  | "remove_background"
  | "blur_background"
  | "auto_color"
  | "auto_contrast"
  | "lighten"
  | "darken"
  | "boost_shadows"
  | "vignette"
  | "film_grain"
  | "warm_filter"
  | "cool_filter"
  | "sepia"
  | "vintage";

export type PhotoshopQuickActionDisabledReason =
  | "multiselection"
  | "viewonly"
  | "layerkind"
  | "layervisibility"
  | "layercontent";

export interface PhotoshopQuickActionPrepareLayer {
  readonly duplicate: boolean;
  readonly applyMask: boolean;
}

export interface PhotoshopQuickActionDefinition {
  readonly id: PhotoshopQuickActionId;
  readonly categoryId: PhotoshopQuickActionCategoryId;
  readonly title: string;
  readonly description: string;
  readonly jsonFile: string;
  readonly prepareLayer?: PhotoshopQuickActionPrepareLayer;
  readonly defaultOpacity?: number;
  readonly renamePreviousLayer?: string;
  readonly hidePreviousLayer?: boolean;
  readonly onlyForImageLayer?: boolean;
  readonly needsToken?: boolean;
}

export interface PhotoshopQuickActionCategory {
  readonly id: PhotoshopQuickActionCategoryId;
  readonly title: string;
  readonly actions: readonly PhotoshopQuickActionDefinition[];
}

export const PHOTOSHOP_QUICK_ACTION_CATEGORIES: readonly PhotoshopQuickActionCategory[] =
  Object.freeze([
    {
      id: "background",
      title: "배경 (Background)",
      actions: [
        {
          id: "remove_background",
          categoryId: "background",
          title: "배경 제거 (Remove background)",
          description: "피사체를 분리하고 비파괴 레이어 마스크로 배경을 제거합니다.",
          jsonFile: "quick_actions/remove_background.json",
          prepareLayer: { duplicate: false, applyMask: false },
          onlyForImageLayer: true,
          needsToken: true,
        },
        {
          id: "blur_background",
          categoryId: "background",
          title: "배경 흐림 (Blur background)",
          description: "복제 레이어와 마스크를 준비한 뒤 배경 영역에 깊이감 블러를 적용합니다.",
          jsonFile: "quick_actions/blur_background.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 50,
          renamePreviousLayer: "Background",
          hidePreviousLayer: true,
          onlyForImageLayer: true,
          needsToken: true,
        },
      ],
    },
    {
      id: "auto",
      title: "자동 보정 (Auto)",
      actions: [
        {
          id: "auto_color",
          categoryId: "auto",
          title: "자동 색상 (Auto color)",
          description: "화이트 밸런스와 중립 톤 캐스트를 자동으로 맞춥니다.",
          jsonFile: "quick_actions/auto_color.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 100,
        },
        {
          id: "auto_contrast",
          categoryId: "auto",
          title: "자동 대비 (Auto contrast)",
          description: "하이라이트와 섀도 다이나믹 레인지를 자동으로 확장합니다.",
          jsonFile: "quick_actions/auto_contrast.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 100,
        },
      ],
    },
    {
      id: "lighting",
      title: "조명 (Lighting)",
      actions: [
        {
          id: "lighten",
          categoryId: "lighting",
          title: "밝게 (Lighten)",
          description: "중간톤과 전체 노출을 자연스럽게 밝힙니다.",
          jsonFile: "quick_actions/lighten.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 50,
        },
        {
          id: "darken",
          categoryId: "lighting",
          title: "어둡게 (Darken)",
          description: "노출과 하이라이트를 차분하게 낮춥니다.",
          jsonFile: "quick_actions/darken.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 50,
        },
        {
          id: "boost_shadows",
          categoryId: "lighting",
          title: "어두운 영역 부스트 (Boost shadows)",
          description: "하이라이트를 보존하면서 암부 디테일을 끌어올립니다.",
          jsonFile: "quick_actions/boost_shadows.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 50,
        },
        {
          id: "vignette",
          categoryId: "lighting",
          title: "비네트 (Vignette)",
          description: "가장자리를 부드럽게 어둡게 해 시선을 중앙으로 모읍니다.",
          jsonFile: "quick_actions/vignette.json",
          prepareLayer: { duplicate: false, applyMask: false },
          defaultOpacity: 60,
        },
      ],
    },
    {
      id: "stylize",
      title: "스타일화 (Stylize)",
      actions: [
        {
          id: "film_grain",
          categoryId: "stylize",
          title: "필름 그레인 (Film grain)",
          description: "아날로그 은염 입자 질감을 비파괴 레이어로 추가합니다.",
          jsonFile: "quick_actions/film_grain.json",
          prepareLayer: { duplicate: true, applyMask: true },
          defaultOpacity: 50,
        },
        {
          id: "warm_filter",
          categoryId: "stylize",
          title: "따뜻한 필터 (Warm filter)",
          description: "골든 앰버 포토 필터 톤을 입힙니다.",
          jsonFile: "quick_actions/warm_filter.json",
          prepareLayer: { duplicate: false, applyMask: false },
          defaultOpacity: 50,
        },
        {
          id: "cool_filter",
          categoryId: "stylize",
          title: "차가운 필터 (Cool filter)",
          description: "시안-블루 쿨 포토 필터 톤을 입힙니다.",
          jsonFile: "quick_actions/cool_filter.json",
          prepareLayer: { duplicate: false, applyMask: false },
          defaultOpacity: 50,
        },
        {
          id: "sepia",
          categoryId: "stylize",
          title: "세피아 (Sepia)",
          description: "클래식 브라운 세피아 모노크롬 톤으로 변환합니다.",
          jsonFile: "quick_actions/sepia.json",
          prepareLayer: { duplicate: false, applyMask: false },
          defaultOpacity: 50,
        },
        {
          id: "vintage",
          categoryId: "stylize",
          title: "빈티지 (Vintage)",
          description: "바랜 암부와 따뜻한 하이라이트의 레트로 필름 룩을 적용합니다.",
          jsonFile: "quick_actions/vintage.json",
          prepareLayer: { duplicate: false, applyMask: false },
          defaultOpacity: 50,
        },
      ],
    },
  ]);

export function getPhotoshopQuickActionById(
  actionId: PhotoshopQuickActionId,
): PhotoshopQuickActionDefinition {
  for (const category of PHOTOSHOP_QUICK_ACTION_CATEGORIES) {
    const found = category.actions.find((a) => a.id === actionId);
    if (found) return found;
  }
  throw new TypeError(`Unknown Photoshop Quick Action: ${actionId}`);
}

export interface PhotoshopQuickActionLayerContext {
  readonly hasMultipleLayersSelected: boolean;
  readonly viewOnly: boolean;
  readonly noLayerSelected: boolean;
  readonly isImageLayerSelected: boolean;
  readonly isSmartObjectLayerSelected: boolean;
  readonly isAdjustmentLayerSelected: boolean;
  readonly isGroupLayerSelected: boolean;
  readonly isLayerClipped: boolean;
  readonly isLayerVisible: boolean;
  readonly layerHasContent: boolean;
}

export interface PhotoshopQuickActionEnablement {
  readonly actionId: PhotoshopQuickActionId;
  readonly disabled: boolean;
  readonly disabledReason?: PhotoshopQuickActionDisabledReason;
}

/**
 * `QuickActionsManager.chunk.OMsFMydh.js`의 `updateQuickActionsEnablement` 결정 트리를 그대로 재현한다.
 */
export function evaluatePhotoshopQuickActionEnablement(
  context: PhotoshopQuickActionLayerContext,
  action: PhotoshopQuickActionDefinition,
): PhotoshopQuickActionEnablement {
  let disabledReason: PhotoshopQuickActionDisabledReason | undefined;
  if (context.hasMultipleLayersSelected) {
    disabledReason = "multiselection";
  } else if (context.viewOnly) {
    disabledReason = "viewonly";
  } else if (
    (action.onlyForImageLayer === true &&
      !context.isImageLayerSelected &&
      !context.isSmartObjectLayerSelected) ||
    context.isAdjustmentLayerSelected ||
    context.isGroupLayerSelected ||
    context.isLayerClipped
  ) {
    disabledReason = "layerkind";
  } else if (!context.isLayerVisible) {
    disabledReason = "layervisibility";
  } else if (!context.layerHasContent) {
    disabledReason = "layercontent";
  }

  return {
    actionId: action.id,
    disabled: context.noLayerSelected || disabledReason !== undefined,
    ...(disabledReason ? { disabledReason } : {}),
  };
}

export interface PhotoshopDocumentLayerRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: "pixel" | "smart_object" | "adjustment" | "layer_group" | "text" | "vector";
  readonly visible: boolean;
  readonly opacity: number;
  readonly hasUserMask: boolean;
  readonly maskApplied: boolean;
}

export interface PhotoshopQuickActionSessionState {
  readonly historyEntryId: string;
  readonly selectedLayerId: string | null;
  readonly layers: readonly PhotoshopDocumentLayerRecord[];
  readonly reversibleSnapshot?: {
    readonly historyBeforeQuickAction: string;
    readonly layerSelectedBeforeQuickAction: string | null;
    readonly layersBeforeQuickAction: readonly PhotoshopDocumentLayerRecord[];
  };
}

export interface PhotoshopQuickActionExecutionResult {
  readonly state: PhotoshopQuickActionSessionState;
  readonly executedBatchPlayCommands: readonly string[];
  readonly appliedOpacity: number;
}

/**
 * `QuickActionsManager.runQuickActionByFilename` 비파괴 실행 파이프라인:
 * 1. `initReversible` 스냅샷 저장
 * 2. `prepareLayer.duplicate` 시 `duplicate_and_rasterize.atn` 실행 및 `applyMask` 시 `apply_layer_mask.atn` 실행
 * 3. 액션 JSON 실행 후 대상 레이어 이름을 `action.title`로 변경
 * 4. `hidePreviousLayer` 시 이전 레이어 숨김, `renamePreviousLayer` 시 이전 레이어 이름 변경(예: `"Background"`)
 */
export function executePhotoshopQuickAction(
  session: PhotoshopQuickActionSessionState,
  actionId: PhotoshopQuickActionId,
  options: { readonly initReversible?: boolean } = {},
): PhotoshopQuickActionExecutionResult {
  const action = getPhotoshopQuickActionById(actionId);
  const initReversible = options.initReversible ?? true;
  const selectedIdx = session.layers.findIndex((l) => l.id === session.selectedLayerId);
  if (selectedIdx < 0) {
    throw new Error("Cannot execute Quick Action without a selected layer");
  }
  const selectedLayer = session.layers[selectedIdx]!;
  const commands: string[] = [];
  const nextLayers = [...session.layers];

  let activeIdx = selectedIdx;
  if (action.prepareLayer?.duplicate) {
    commands.push("atn:quick_actions/duplicate_and_rasterize.atn");
    const duplicated: PhotoshopDocumentLayerRecord = {
      ...selectedLayer,
      id: `${selectedLayer.id}-qa-${action.id}`,
      kind: "pixel",
      maskApplied:
        action.prepareLayer.applyMask && selectedLayer.hasUserMask
          ? true
          : selectedLayer.maskApplied,
    };
    if (action.prepareLayer.applyMask && selectedLayer.hasUserMask) {
      commands.push("atn:quick_actions/apply_layer_mask.atn");
    }
    nextLayers.splice(selectedIdx + 1, 0, duplicated);
    activeIdx = selectedIdx + 1;
  }

  commands.push(`json:${action.jsonFile}`);
  commands.push(
    JSON.stringify([
      {
        _obj: "set",
        _target: [{ _enum: "ordinal", _ref: "layer", _value: "targetEnum" }],
        to: { _obj: "layer", name: action.title },
      },
    ]),
  );

  const appliedOpacity = action.defaultOpacity ?? 100;
  nextLayers[activeIdx] = {
    ...nextLayers[activeIdx]!,
    name: action.title,
    opacity: appliedOpacity,
  };

  const prevIdx = activeIdx - 1;
  if (action.hidePreviousLayer && prevIdx >= 0) {
    commands.push(
      '[{"_obj":"hide","_target":[{"_enum":"ordinal","_ref":"layer","_value":"previous"}]}]',
    );
    nextLayers[prevIdx] = {
      ...nextLayers[prevIdx]!,
      visible: false,
    };
  }
  if (action.renamePreviousLayer && prevIdx >= 0) {
    commands.push(
      JSON.stringify([
        {
          _obj: "set",
          _target: [{ _enum: "ordinal", _ref: "layer", _value: "previous" }],
          to: { _obj: "layer", name: action.renamePreviousLayer },
        },
      ]),
    );
    nextLayers[prevIdx] = {
      ...nextLayers[prevIdx]!,
      name: action.renamePreviousLayer,
    };
  }

  const nextState: PhotoshopQuickActionSessionState = {
    historyEntryId: `${session.historyEntryId}->${action.id}`,
    selectedLayerId: nextLayers[activeIdx]!.id,
    layers: nextLayers,
    ...(initReversible
      ? {
          reversibleSnapshot: {
            historyBeforeQuickAction: session.historyEntryId,
            layerSelectedBeforeQuickAction: session.selectedLayerId,
            layersBeforeQuickAction: session.layers,
          },
        }
      : session.reversibleSnapshot
        ? { reversibleSnapshot: session.reversibleSnapshot }
        : {}),
  };

  return {
    state: nextState,
    executedBatchPlayCommands: commands,
    appliedOpacity,
  };
}

/**
 * `QuickActionsManager.revertLastAction()` 동작을 재현한다.
 */
export function revertPhotoshopQuickAction(
  session: PhotoshopQuickActionSessionState,
): PhotoshopQuickActionSessionState {
  if (!session.reversibleSnapshot) return session;
  return {
    historyEntryId: session.reversibleSnapshot.historyBeforeQuickAction,
    selectedLayerId: session.reversibleSnapshot.layerSelectedBeforeQuickAction,
    layers: session.reversibleSnapshot.layersBeforeQuickAction,
  };
}

export * from "./studio-photoshop-adjustment-presets-v2";

