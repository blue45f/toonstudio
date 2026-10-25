/**
 * studio-3d-dynamic-components.ts
 *
 * 기성 웹툰 3D 스케치업(.skp) 소재 시장(텀블벅, 에이콘3D, 픽셀) 아키타입 팩 및
 * SketchUp Dynamic Components(`dynamic_attributes` / `OnClick` `ANIMATE`·`SET`) 기반
 * 실시간 배경 인터랙션(문 개폐, 서랍 슬라이드, 들창 들어열개, 병풍 폴딩, 조명 점등) 엔진.
 */

import {
  DONTDRAW_360_PANORAMA_DOME_PRESETS,
  DONTDRAW_ASSET_FORMAT_BADGES,
  DONTDRAW_STORE_TAXONOMY,
  matchDontDrawStoreCategoryByScript,
  validateDontDrawAssetFormatBundle,
  type DontDrawAssetBundleValidationResult,
  type DontDrawAssetFormatBadgeId,
  type DontDrawAssetFormatSpec,
  type DontDrawPanorama360DomePreset,
  type DontDrawSubCategorySpec,
  type DontDrawTaxonomyMatchResult,
  type DontDrawTopCategoryId,
  type DontDrawTopCategorySpec,
} from "./studio-3d-dontdraw-store-taxonomy";
import {
  WEBTOON_ARCHETYPE_SCENE_PACKS,
  WEBTOON_SKP_MARKETPLACE_PLATFORMS,
  type WebtoonArchetypeComponentTemplate,
} from "./studio-3d-webtoon-archetype-packs";

export {
  DONTDRAW_360_PANORAMA_DOME_PRESETS,
  DONTDRAW_ASSET_FORMAT_BADGES,
  DONTDRAW_STORE_TAXONOMY,
  WEBTOON_ARCHETYPE_SCENE_PACKS,
  WEBTOON_SKP_MARKETPLACE_PLATFORMS,
  matchDontDrawStoreCategoryByScript,
  validateDontDrawAssetFormatBundle,
  type DontDrawAssetBundleValidationResult,
  type DontDrawAssetFormatBadgeId,
  type DontDrawAssetFormatSpec,
  type DontDrawPanorama360DomePreset,
  type DontDrawSubCategorySpec,
  type DontDrawTaxonomyMatchResult,
  type DontDrawTopCategoryId,
  type DontDrawTopCategorySpec,
  type WebtoonArchetypeComponentTemplate,
};

export type DynamicComponentKind =
  | "door-single-swing"
  | "door-double-swing"
  | "window-sliding"
  | "furniture-drawer"
  | "treasure-chest"
  | "light-switchable"
  | "vehicle-wheel-turn"
  | "book-open-close"
  | "door-sliding"
  | "window-lift-up"
  | "folding-screen"
  | "locker-cabinet-door"
  | "secret-passage"
  | "hearth-lantern";

export type WebtoonSkpMarketplacePlatformId =
  | "tumblbug"
  | "acon3d"
  | "dontdraw"
  | "pixel"
  | "internal-bundle";

export type WebtoonArchetypeScenePackId =
  | "fantasy-imperial-palace"
  | "modern-high-school-classroom"
  | "protagonist-studio-apartment"
  | "joseon-dynasty-tavern";

export type SketchUpOnClickCommandType =
  | "ANIMATE"
  | "ANIMATESLOW"
  | "ANIMATEFAST"
  | "ANIMATECUSTOM"
  | "SET";

export interface SketchUpOnClickAction {
  readonly rawFormula: string;
  readonly command: SketchUpOnClickCommandType;
  readonly targetAttribute: string;
  readonly stateValues: readonly number[];
  readonly durationSeconds: number;
  readonly inferredInteractionType: "revolve" | "slide" | "toggle";
  readonly inferredAxis: "x" | "y" | "z";
}

export interface DynamicComponentState {
  readonly id: string;
  readonly kind: DynamicComponentKind;
  readonly label: string;
  readonly isOpen: boolean;
  readonly value: number; // 0.0 (완전 닫힘/소등) ~ 1.0 (완전 개방/점등)
  readonly maxRange: number; // 예: 90(도) 또는 0.8(미터)
  readonly transformAxis: "x" | "y" | "z";
  readonly pivotOffset: readonly [number, number, number];
  readonly skpOnClickFormula?: string;
  readonly stepValues?: readonly number[]; // 정규화 비율 단계 (예: [0, 0.5, 1])
  readonly currentStepIndex?: number;
  readonly durationSeconds?: number;
  readonly sourcePlatform?: WebtoonSkpMarketplacePlatformId;
  readonly archetypeId?: WebtoonArchetypeScenePackId;
}

export interface DynamicComponentTransformResult {
  readonly id: string;
  readonly rotation: readonly [number, number, number]; // 단위: 도(deg)
  readonly position: readonly [number, number, number]; // 단위: 미터(m)
  readonly rotationDelta: readonly [number, number, number]; // 단위: 도(deg)
  readonly translationDelta: readonly [number, number, number]; // 단위: 미터(m)
  readonly emissiveIntensity: number; // 0.0 ~ 1.0 (조명/아궁이/호롱불)
  readonly isOpen: boolean;
  readonly stateLabel: string;
}

export interface DynamicComponentPresetSpec {
  readonly kind: DynamicComponentKind;
  readonly label: string;
  readonly interactionType: "revolve" | "slide" | "toggle";
  readonly defaultMaxRange: number;
  readonly defaultAxis: "x" | "y" | "z";
  readonly pivotOffset: readonly [number, number, number];
  readonly defaultSkpFormula: string;
}

export interface WebtoonSkpMarketplacePlatformMetadata {
  readonly id: WebtoonSkpMarketplacePlatformId;
  readonly label: string;
  readonly summary: string;
  readonly primaryFormat: "skp" | "glb";
  readonly supportsDynamicComponents: boolean;
}

export interface WebtoonArchetypeCutDirectionPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly recommendedTimeOfDay: "morning" | "day" | "sunset" | "night";
  readonly componentValues: Readonly<Record<string, number>>;
}

export interface WebtoonArchetypeScenePack {
  readonly id: WebtoonArchetypeScenePackId;
  readonly title: string;
  readonly subtitle: string;
  readonly genre: string;
  readonly platforms: readonly WebtoonSkpMarketplacePlatformId[];
  readonly typicalSkpTags: readonly string[];
  readonly typicalSkpScenes: readonly string[];
  readonly recommendedCameraFovDeg: number;
  readonly components: readonly WebtoonArchetypeComponentTemplate[];
  readonly cutDirectionPresets: readonly WebtoonArchetypeCutDirectionPreset[];
}

export const DYNAMIC_COMPONENT_PRESETS: readonly DynamicComponentPresetSpec[] = [
  {
    kind: "door-single-swing",
    label: "단일 여닫이문 (Door Swing)",
    interactionType: "revolve",
    defaultMaxRange: 90,
    defaultAxis: "y",
    pivotOffset: [-0.45, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 90)',
  },
  {
    kind: "door-double-swing",
    label: "양개형 여닫이문 (Double Door)",
    interactionType: "revolve",
    defaultMaxRange: 90,
    defaultAxis: "y",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 90)',
  },
  {
    kind: "window-sliding",
    label: "미닫이 창문 (Sliding Window)",
    interactionType: "slide",
    defaultMaxRange: 0.8,
    defaultAxis: "x",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATE("x", 0, 0.8)',
  },
  {
    kind: "furniture-drawer",
    label: "서랍장 서랍 (Furniture Drawer)",
    interactionType: "slide",
    defaultMaxRange: 0.45,
    defaultAxis: "z",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATEFAST("z", 0, 0.45)',
  },
  {
    kind: "treasure-chest",
    label: "보물상자 / 뚜껑 (Chest Lid)",
    interactionType: "revolve",
    defaultMaxRange: 105,
    defaultAxis: "x",
    pivotOffset: [0, 0.2, -0.3],
    defaultSkpFormula: 'ANIMATE("rotx", 0, -105)',
  },
  {
    kind: "light-switchable",
    label: "전등 / 가로등 (Switchable Light)",
    interactionType: "toggle",
    defaultMaxRange: 1.0,
    defaultAxis: "y",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'SET("light", 0, 1)',
  },
  {
    kind: "vehicle-wheel-turn",
    label: "차량 조향 바퀴 (Wheel Steer)",
    interactionType: "revolve",
    defaultMaxRange: 35,
    defaultAxis: "y",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 35)',
  },
  {
    kind: "book-open-close",
    label: "마법서 / 책 펼침 (Book Cover)",
    interactionType: "revolve",
    defaultMaxRange: 170,
    defaultAxis: "y",
    pivotOffset: [-0.15, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 170)',
  },
  {
    kind: "door-sliding",
    label: "미닫이문 / 교실·한옥 방문 (Sliding Door)",
    interactionType: "slide",
    defaultMaxRange: 0.9,
    defaultAxis: "x",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATE("x", 0, 0.9)',
  },
  {
    kind: "window-lift-up",
    label: "조선시대 들창 / 들어열개창 (Lift-Up Window)",
    interactionType: "revolve",
    defaultMaxRange: 85,
    defaultAxis: "x",
    pivotOffset: [0, 0.6, 0],
    defaultSkpFormula: 'ANIMATESLOW("rotx", 0, -85)',
  },
  {
    kind: "folding-screen",
    label: "병풍 / 폴딩도어 (Folding Screen)",
    interactionType: "revolve",
    defaultMaxRange: 120,
    defaultAxis: "y",
    pivotOffset: [-0.3, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 60, 120)',
  },
  {
    kind: "locker-cabinet-door",
    label: "사물함 / 찬장·옷장 문 (Locker & Cabinet)",
    interactionType: "revolve",
    defaultMaxRange: 95,
    defaultAxis: "y",
    pivotOffset: [-0.25, 0, 0],
    defaultSkpFormula: 'ANIMATE("roty", 0, 95)',
  },
  {
    kind: "secret-passage",
    label: "황실 비밀 통로 / 회전 책장 (Secret Passage)",
    interactionType: "revolve",
    defaultMaxRange: 90,
    defaultAxis: "y",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'ANIMATESLOW("roty", 0, 45, 90)',
  },
  {
    kind: "hearth-lantern",
    label: "호롱불 / 아궁이 / 샹들리에 (Lantern & Hearth)",
    interactionType: "toggle",
    defaultMaxRange: 1.0,
    defaultAxis: "y",
    pivotOffset: [0, 0, 0],
    defaultSkpFormula: 'SET("light", 0, 1)',
  },
];

const ONCLICK_STATEMENT_REGEX =
  /^\s*(ANIMATECUSTOM|ANIMATESLOW|ANIMATEFAST|ANIMATE|SET)\s*\(\s*["']?([^"',)\s]+)["']?\s*(?:,(.*))?\)\s*$/iu;

function inferAxisFromAttribute(attr: string): "x" | "y" | "z" {
  const lower = attr.toLowerCase();
  if (lower.endsWith("x")) return "x";
  if (lower.endsWith("z")) return "z";
  return "y";
}

function inferInteractionFromAttribute(attr: string): "revolve" | "slide" | "toggle" {
  const lower = attr.toLowerCase();
  if (lower.startsWith("rot") || lower.includes("angle") || lower.includes("hinge")) {
    return "revolve";
  }
  if (lower === "x" || lower === "y" || lower === "z" || lower.startsWith("pos") || lower.includes("slide")) {
    return "slide";
  }
  return "toggle";
}

/**
 * SketchUp Dynamic Components 의 `OnClick` 수식(`ANIMATE("roty", 0, 90); SET("hidden", 0, 1)`)을
 * 코드 실행(eval) 없이 안전하게 파싱해 구조화된 액션 목록으로 반환한다.
 */
export function parseSketchUpOnClickFormula(formula: string): readonly SketchUpOnClickAction[] {
  if (!formula || typeof formula !== "string") return [];
  const statements = formula
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const actions: SketchUpOnClickAction[] = [];

  for (const stmt of statements) {
    const match = ONCLICK_STATEMENT_REGEX.exec(stmt);
    if (!match) continue;
    const rawCommand = (match[1] ?? "ANIMATE").toUpperCase() as SketchUpOnClickCommandType;
    const rawTarget = (match[2] ?? "roty").trim().toLowerCase();
    const restArgs = (match[3] ?? "")
      .split(",")
      .map((token) => Number(token.trim().replace(/^["']|["']$/gu, "")))
      .filter((num) => Number.isFinite(num));

    let durationSeconds = 0.5;
    let stateValues = restArgs;
    if (rawCommand === "ANIMATESLOW") {
      durationSeconds = 1.0;
    } else if (rawCommand === "ANIMATEFAST") {
      durationSeconds = 0.25;
    } else if (rawCommand === "SET") {
      durationSeconds = 0;
    } else if (rawCommand === "ANIMATECUSTOM") {
      if (restArgs.length >= 5) {
        durationSeconds = Math.max(0.05, restArgs[0] ?? 0.5);
        stateValues = restArgs.slice(3);
      }
    }

    if (stateValues.length === 0) {
      stateValues = [0, 1];
    } else if (stateValues.length === 1) {
      stateValues = [0, stateValues[0]!];
    }

    actions.push(
      Object.freeze({
        rawFormula: stmt,
        command: rawCommand,
        targetAttribute: rawTarget,
        stateValues: Object.freeze([...stateValues]),
        durationSeconds,
        inferredInteractionType: inferInteractionFromAttribute(rawTarget),
        inferredAxis: inferAxisFromAttribute(rawTarget),
      }),
    );
  }

  return Object.freeze(actions);
}

/**
 * 초기 다이나믹 컴포넌트 상태를 생성한다.
 */
export function createDynamicComponent(
  id: string,
  kind: DynamicComponentKind,
  initialOpen = false,
  customMaxRange?: number,
): DynamicComponentState {
  const preset = DYNAMIC_COMPONENT_PRESETS.find((p) => p.kind === kind) ?? DYNAMIC_COMPONENT_PRESETS[0]!;
  const maxRange = customMaxRange ?? preset.defaultMaxRange;

  return {
    id,
    kind,
    label: preset.label,
    isOpen: initialOpen,
    value: initialOpen ? 1.0 : 0.0,
    maxRange,
    transformAxis: preset.defaultAxis,
    pivotOffset: preset.pivotOffset,
    skpOnClickFormula: preset.defaultSkpFormula,
    stepValues: [0, 1],
    currentStepIndex: initialOpen ? 1 : 0,
    durationSeconds: preset.interactionType === "toggle" ? 0 : 0.5,
  };
}

/**
 * 다이나믹 컴포넌트의 보간 비율(0.0 ~ 1.0)을 설정한다.
 */
export function setDynamicComponentValue(
  state: DynamicComponentState,
  newValue: number,
): DynamicComponentState {
  const clampedValue = Math.max(0, Math.min(1, newValue));
  const steps = state.stepValues && state.stepValues.length >= 2 ? state.stepValues : [0, 1];
  let closestIdx = 0;
  let minDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < steps.length; i += 1) {
    const diff = Math.abs((steps[i] ?? 0) - clampedValue);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return {
    ...state,
    value: clampedValue,
    isOpen: clampedValue > 0.01,
    currentStepIndex: closestIdx,
  };
}

/**
 * SketchUp 의 상호작용 도구(Interact Tool) 클릭처럼 다음 단계(stepValues)로 상태를 순환시킨다.
 */
export function stepDynamicComponentOnClick(state: DynamicComponentState): DynamicComponentState {
  const steps = state.stepValues && state.stepValues.length >= 2 ? state.stepValues : [0, 1];
  const currentIdx = state.currentStepIndex ?? (state.isOpen ? steps.length - 1 : 0);
  const nextIdx = (currentIdx + 1) % steps.length;
  const nextVal = Math.max(0, Math.min(1, steps[nextIdx] ?? (state.isOpen ? 0 : 1)));
  return {
    ...state,
    value: nextVal,
    isOpen: nextVal > 0.01,
    currentStepIndex: nextIdx,
  };
}

export interface SketchUpNodeDynamicCandidate {
  readonly id: string;
  readonly name: string;
  readonly definitionName?: string;
  readonly layer?: string;
  readonly properties?: Readonly<Record<string, string>>;
}

function inferKindFromNameAndAction(
  combinedText: string,
  action: SketchUpOnClickAction | undefined,
): DynamicComponentKind | null {
  const lower = combinedText.normalize("NFKC").toLowerCase();

  if (lower.includes("들창") || lower.includes("들어열개") || lower.includes("lift_window") || lower.includes("lift-window")) {
    return "window-lift-up";
  }
  if (lower.includes("병풍") || lower.includes("폴딩") || lower.includes("folding")) {
    return "folding-screen";
  }
  if (lower.includes("비밀통로") || lower.includes("비밀_통로") || lower.includes("secret_passage") || lower.includes("secret-passage") || lower.includes("회전책장")) {
    return "secret-passage";
  }
  if (lower.includes("서랍") || lower.includes("drawer")) {
    return "furniture-drawer";
  }
  if (lower.includes("사물함") || lower.includes("찬장") || lower.includes("옷장") || lower.includes("locker") || lower.includes("cabinet") || lower.includes("wardrobe")) {
    return "locker-cabinet-door";
  }
  if (lower.includes("호롱불") || lower.includes("초롱불") || lower.includes("아궁이") || lower.includes("샹들리에") || lower.includes("횃불") || lower.includes("lantern") || lower.includes("chandelier") || lower.includes("hearth")) {
    return "hearth-lantern";
  }
  if (lower.includes("형광등") || lower.includes("전등") || lower.includes("가로등") || lower.includes("스탠드") || lower.includes("조명") || lower.includes("light") || lower.includes("lamp")) {
    return "light-switchable";
  }
  if (lower.includes("보물") || lower.includes("상자") || lower.includes("뚜껑") || lower.includes("chest")) {
    return "treasure-chest";
  }
  if (lower.includes("마법서") || lower.includes("책") || lower.includes("book")) {
    return "book-open-close";
  }
  if (lower.includes("바퀴") || lower.includes("wheel")) {
    return "vehicle-wheel-turn";
  }
  if (lower.includes("미닫이창") || lower.includes("창문") || lower.includes("베란다창") || lower.includes("window")) {
    return "window-sliding";
  }
  if (lower.includes("미닫이") || lower.includes("교실문") || lower.includes("앞문") || lower.includes("뒷문") || lower.includes("한옥문") || lower.includes("격자문") || lower.includes("sliding_door") || lower.includes("sliding-door")) {
    return "door-sliding";
  }
  if (lower.includes("양개문") || lower.includes("대문") || lower.includes("싸리문") || lower.includes("double_door") || lower.includes("double-door") || lower.includes("gate")) {
    return "door-double-swing";
  }
  if (lower.includes("여닫이") || lower.includes("현관문") || lower.includes("방문") || lower.includes("문") || lower.includes("door")) {
    return action?.inferredInteractionType === "slide" ? "door-sliding" : "door-single-swing";
  }

  if (action) {
    if (action.inferredInteractionType === "revolve") return "door-single-swing";
    if (action.inferredInteractionType === "slide") return "furniture-drawer";
    return "light-switchable";
  }
  return null;
}

/**
 * OpenSKP 가 파싱한 SketchUp 인스턴스 노드(`properties.onclick` 등 `dynamic_attributes` 또는
 * 한국어·영어 컴포넌트/레이어 이름 규칙)에서 조작 가능한 `DynamicComponentState` 를 추론·추출한다.
 */
export function inferDynamicComponentFromSkpNode(
  node: SketchUpNodeDynamicCandidate,
): DynamicComponentState | null {
  const props = node.properties ?? {};
  const rawOnClick =
    props.onclick ??
    props.onClick ??
    props.OnClick ??
    props.ONCLICK ??
    props._onclick_formula ??
    "";
  const parsedActions = parseSketchUpOnClickFormula(rawOnClick);
  const primaryAction = parsedActions[0];
  const combinedText = [
    node.name,
    node.definitionName ?? "",
    node.layer ?? "",
    props._name ?? "",
    props.summary ?? "",
    props.description ?? "",
  ].join(" ");

  const kind = inferKindFromNameAndAction(combinedText, primaryAction);
  if (!kind) return null;

  const preset = DYNAMIC_COMPONENT_PRESETS.find((p) => p.kind === kind) ?? DYNAMIC_COMPONENT_PRESETS[0]!;
  let maxRange = preset.defaultMaxRange;
  let stepValues: readonly number[] = [0, 1];

  if (primaryAction && primaryAction.stateValues.length >= 2) {
    const absMax = Math.max(...primaryAction.stateValues.map((v) => Math.abs(v)));
    if (absMax > 0) {
      maxRange =
        preset.interactionType === "slide" && absMax > 5
          ? Number((absMax / 100).toFixed(3))
          : absMax;
      stepValues = primaryAction.stateValues.map((v) =>
        Math.max(0, Math.min(1, Number((Math.abs(v) / absMax).toFixed(3)))),
      );
    }
  }

  const cleanLabel = node.name.trim() || node.definitionName?.trim() || preset.label;

  return {
    id: node.id,
    kind,
    label: cleanLabel,
    isOpen: false,
    value: 0,
    maxRange,
    transformAxis: primaryAction?.inferredAxis ?? preset.defaultAxis,
    pivotOffset: preset.pivotOffset,
    skpOnClickFormula: rawOnClick.trim() || preset.defaultSkpFormula,
    stepValues,
    currentStepIndex: 0,
    durationSeconds: primaryAction?.durationSeconds ?? (preset.interactionType === "toggle" ? 0 : 0.5),
  };
}

/**
 * 아키타입 장면 팩을 조회한다.
 */
export function getWebtoonArchetypeScenePack(
  packId: WebtoonArchetypeScenePackId,
): WebtoonArchetypeScenePack {
  return (
    WEBTOON_ARCHETYPE_SCENE_PACKS.find((pack) => pack.id === packId) ??
    WEBTOON_ARCHETYPE_SCENE_PACKS[0]!
  );
}

/**
 * 아키타입 장면 팩에 정의된 동적 구성 요소 목록을 초기 상태로 인스턴스화한다.
 */
export function instantiateArchetypeDynamicComponents(
  packId: WebtoonArchetypeScenePackId,
): readonly DynamicComponentState[] {
  const pack = getWebtoonArchetypeScenePack(packId);
  return pack.components.map((tmpl) => {
    const clamped = Math.max(0, Math.min(1, tmpl.initialValue));
    return {
      id: tmpl.id,
      kind: tmpl.kind,
      label: tmpl.label,
      isOpen: clamped > 0.01,
      value: clamped,
      maxRange: tmpl.maxRange,
      transformAxis: tmpl.transformAxis,
      pivotOffset: tmpl.pivotOffset,
      skpOnClickFormula: tmpl.skpOnClickFormula,
      stepValues: tmpl.stepValues,
      currentStepIndex: clamped > 0.01 ? tmpl.stepValues.length - 1 : 0,
      durationSeconds: 0.5,
      sourcePlatform: pack.platforms[0],
      archetypeId: pack.id,
    };
  });
}

/**
 * 아키타입의 컷 연출 프리셋을 장면 내 모든 동적 구성 요소에 일괄 적용한다.
 */
export function applyArchetypeCutDirectionPreset(
  states: readonly DynamicComponentState[],
  packId: WebtoonArchetypeScenePackId,
  presetId: string,
): readonly DynamicComponentState[] {
  const pack = getWebtoonArchetypeScenePack(packId);
  const preset = pack.cutDirectionPresets.find((p) => p.id === presetId);
  if (!preset) return states;

  return states.map((state) => {
    const targetVal = preset.componentValues[state.id];
    if (typeof targetVal !== "number") return state;
    return setDynamicComponentValue(state, targetVal);
  });
}

/**
 * 장면 내 다이나믹 컴포넌트 목록 전체를 일괄 개방(1.0)하거나 초기화(0.0)한다.
 */
export function batchSetDynamicComponentsValue(
  states: readonly DynamicComponentState[],
  targetValue: number,
): readonly DynamicComponentState[] {
  return states.map((state) => setDynamicComponentValue(state, targetValue));
}

/**
 * 다이나믹 컴포넌트 상태에 따라 3D 장면 노드에 적용할 회전·이동·발광 변환값을 계산한다.
 */
export function evaluateDynamicComponentTransform(
  state: DynamicComponentState,
): DynamicComponentTransformResult {
  let rotX = 0;
  let rotY = 0;
  let rotZ = 0;
  let posX = 0;
  let posY = 0;
  let posZ = 0;
  let emissiveIntensity = 0;

  const currentAmount = state.value * state.maxRange;

  switch (state.kind) {
    case "door-single-swing":
    case "door-double-swing":
    case "vehicle-wheel-turn":
    case "book-open-close":
    case "folding-screen":
    case "locker-cabinet-door":
    case "secret-passage": {
      if (state.transformAxis === "y") {
        rotY = currentAmount;
      } else if (state.transformAxis === "x") {
        rotX = currentAmount;
      } else {
        rotZ = currentAmount;
      }
      break;
    }

    case "treasure-chest":
    case "window-lift-up": {
      rotX = -currentAmount;
      break;
    }

    case "window-sliding":
    case "door-sliding": {
      if (state.transformAxis === "x") {
        posX = currentAmount;
      } else if (state.transformAxis === "y") {
        posY = currentAmount;
      } else {
        posZ = currentAmount;
      }
      break;
    }

    case "furniture-drawer": {
      posZ = currentAmount;
      break;
    }

    case "light-switchable":
    case "hearth-lantern": {
      emissiveIntensity = state.value;
      break;
    }
  }

  const isLightKind = state.kind === "light-switchable" || state.kind === "hearth-lantern";
  const percentLabel = Math.round(state.value * 100);
  const stateLabel = isLightKind
    ? state.value > 0.5
      ? "ON (점등)"
      : "OFF (소등)"
    : state.value <= 0.01
      ? "닫힘 (Closed)"
      : state.value >= 0.99
        ? "완전 개방 (Open)"
        : `${percentLabel}% 개방`;

  const rotation = [rotX, rotY, rotZ] as const;
  const position = [posX, posY, posZ] as const;

  return {
    id: state.id,
    rotation,
    position,
    rotationDelta: rotation,
    translationDelta: position,
    emissiveIntensity,
    isOpen: state.isOpen,
    stateLabel,
  };
}
