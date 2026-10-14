/**
 * 간편 제작 위저드 (Simple Production Wizard) — 초보 전용 제작 동선의 순수 모델.
 *
 * 문제: 전문 에디터는 도구·패널이 한 번에 전부 노출되고, 기존 빠른 조립
 * (StudioQuickComicWizard)은 "컷 레이아웃 → 장면 → 대사 → 미리보기" 순서라
 * 처음 만드는 사람이 머릿속에 그리는 제작 순서(배경을 깔고 → 캐릭터를 세우고
 * → 대사를 넣고 → 효과를 얹는다)와 어긋난다. 캐릭터·효과 단계 자체도 없다.
 *
 * 이 모델이 고정하는 계약:
 * - 단계 순서는 배경 → 캐릭터 → 대사 → 효과로 고정이다. 배열이 정본이며
 *   UI는 재정렬·건너뛰기를 제공하지 않는다(뒤로 가서 고치는 것만 허용).
 * - 모든 단계에 기본값이 있다. createSimpleProductionDraft()는 실제 카탈로그
 *   id로 전부 채워진 드래프트를 돌려주고, 사용자가 값을 비우거나 깨진 값이
 *   들어와도 normalize가 기본값으로 복원한다 — "다음"이 기본값 때문에
 *   막히는 일이 없다. 어떤 필드가 자동 적용됐는지는 autoApplied로 보고한다.
 * - 완료는 조립 입력(ComipoAssemblyInput) + 배경 적용 페이로드 + 씬 레시피를
 *   한 번에 만들고, 출구는 전문 에디터(creationMode "story" · 밀도 "full")로
 *   이어진다. 위저드 안에서 끝나 버리는 섬이 되지 않는다.
 *
 * 카탈로그 id는 전부 현재 main의 실물 모듈에서 검증한다: 장면 템플릿
 * (studio-scene-templates), 배경 프리셋(studio-background-presets),
 * 포즈·표정 프리셋(studio-pose-presets), 컷 레이아웃(studio-panel-layouts).
 * 존재하지 않는 id가 기본값·선택지에 섞이면 옵션 해석 단계에서 걸러지고
 * 기본값으로 폴백한다.
 */
import { assembleComipoPage, type ComipoAssemblyInput } from "../studio-comipo-assembly";
import { CANVAS_W } from "../studio-assets";
import {
  findStudioBackgroundPreset,
  planStudioBackgroundApply,
  type StudioBackgroundApply,
  type StudioBackgroundPreset,
} from "../studio-background-presets";
import { parseDialogueScript } from "../studio-dialogue";
import { PANEL_LAYOUTS, type PanelLayoutPreset } from "../studio-panel-layouts";
import {
  EXPRESSION_PRESETS,
  EXTRA_POSE_PRESETS,
  NATURAL_IDLE_POSES,
  type StudioExpressionPreset,
  type StudioPosePreset,
} from "../studio-pose-presets";
import {
  STUDIO_SCENE_RECIPE_VERSION,
  type StudioSceneRecipe,
} from "../studio-scene-recipe";
import { SCENE_TEMPLATES, type SceneTemplate } from "../studio-scene-templates";

import type { StudioCreationMode } from "../studio-creation-mode";
import type { StudioUiDensityMode } from "../studio-ui-density";

// ---------------------------------------------------------------------------
// 단계 — 순서는 고정이며 이 배열이 정본이다.
// ---------------------------------------------------------------------------

export const SIMPLE_PRODUCTION_STEPS = [
  {
    id: "background",
    labelKo: "배경",
    labelEn: "Background",
    descriptionKo: "장면과 배경색을 깔아요. 고르지 않으면 일상 대화 장면이 기본으로 들어갑니다.",
    descriptionEn: "Set the scene and backdrop. A daily-talk scene is applied by default.",
    i18nKey: "studio.simpleWizard.step.background",
  },
  {
    id: "character",
    labelKo: "캐릭터",
    labelEn: "Character",
    descriptionKo: "주인공 한 명을 세워요. 포즈·표정은 나중에 전문 에디터에서 더 바꿀 수 있습니다.",
    descriptionEn: "Place one lead character. Pose and expression can change later in the pro editor.",
    i18nKey: "studio.simpleWizard.step.character",
  },
  {
    id: "dialogue",
    labelKo: "대사",
    labelEn: "Dialogue",
    descriptionKo: "말풍선에 들어갈 대사를 써요. 비워 두면 시작 대사가 기본으로 들어갑니다.",
    descriptionEn: "Write the balloon lines. A starter line is applied when left empty.",
    i18nKey: "studio.simpleWizard.step.dialogue",
  },
  {
    id: "effects",
    labelKo: "효과",
    labelEn: "Effects",
    descriptionKo: "마지막으로 분위기 효과를 얹어요. 기본은 부드러운 빛입니다.",
    descriptionEn: "Add a finishing mood effect. Soft warm light is the default.",
    i18nKey: "studio.simpleWizard.step.effects",
  },
] as const;

export type SimpleProductionStepId = (typeof SIMPLE_PRODUCTION_STEPS)[number]["id"];

export function clampSimpleProductionStep(step: number): number {
  return Math.min(
    Math.max(Math.trunc(Number.isFinite(step) ? step : 0), 0),
    SIMPLE_PRODUCTION_STEPS.length - 1,
  );
}

export function simpleProductionStepAt(index: number) {
  return SIMPLE_PRODUCTION_STEPS[clampSimpleProductionStep(index)]!;
}

// ---------------------------------------------------------------------------
// 단계별 선택지 — 초보용 부분집합. id는 실물 카탈로그에서 해석하며,
// 카탈로그에 없으면 해석 단계에서 빠진다(지어낸 선택지를 보여 주지 않는다).
// ---------------------------------------------------------------------------

/** 배경 단계: 장면 템플릿 후보 (앞 항목이 기본값). */
export const SIMPLE_PRODUCTION_BACKGROUND_SCENE_IDS: readonly string[] = [
  "daily-talk",
  "school-classroom",
  "romance-cafe",
  "confession",
];

/** 배경 단계: 배경 채우기 프리셋 후보 (앞 항목이 기본값). */
export const SIMPLE_PRODUCTION_BACKGROUND_FILL_IDS: readonly string[] = [
  "g-warm-paper",
  "s-paper",
  "g-dawn",
  "a-soft-warm",
];

/** 캐릭터 단계: 포즈 후보 (앞 항목이 기본값). */
export const SIMPLE_PRODUCTION_POSE_IDS: readonly string[] = [
  "ni_calm_front",
  "xp_wave_greeting",
  "xp_hands_on_hips",
  "xp_chin_rest",
];

/** 캐릭터 단계: 표정 후보 (앞 항목이 기본값). */
export const SIMPLE_PRODUCTION_EXPRESSION_IDS: readonly string[] = [
  "xf_joy",
  "xf_neutral",
  "xf_surprised",
  "xf_determined",
];

/** 효과 단계: 위저드 소유 효과 프리셋. effectRef는 씬 레시피 효과 슬롯으로 전달된다. */
export const SIMPLE_PRODUCTION_EFFECTS = [
  {
    id: "soft-warm",
    labelKo: "부드러운 빛",
    labelEn: "Soft warm light",
    descriptionKo: "따뜻한 빛을 살짝 얹어 장면을 부드럽게 마무리합니다.",
    effectRef: "simple-wizard-soft-warm",
    defaultIntensity: 0.6,
  },
  {
    id: "focus-lines",
    labelKo: "집중선",
    labelEn: "Focus lines",
    descriptionKo: "캐릭터 쪽으로 시선을 모으는 집중선을 넣습니다.",
    effectRef: "simple-wizard-focus-lines",
    defaultIntensity: 0.7,
  },
  {
    id: "speed-lines",
    labelKo: "속도선",
    labelEn: "Speed lines",
    descriptionKo: "움직임과 긴장감을 주는 속도선을 넣습니다.",
    effectRef: "simple-wizard-speed-lines",
    defaultIntensity: 0.7,
  },
  {
    id: "halftone",
    labelKo: "망점 톤",
    labelEn: "Halftone",
    descriptionKo: "만화다운 망점 질감을 배경에 깝니다.",
    effectRef: "simple-wizard-halftone",
    defaultIntensity: 0.5,
  },
  {
    id: "none",
    labelKo: "효과 없음",
    labelEn: "No effect",
    descriptionKo: "효과 없이 깔끔하게 완성합니다.",
    effectRef: null,
    defaultIntensity: 0,
  },
] as const;

export type SimpleProductionEffectId = (typeof SIMPLE_PRODUCTION_EFFECTS)[number]["id"];

export function findSimpleProductionEffect(
  id: unknown,
): (typeof SIMPLE_PRODUCTION_EFFECTS)[number] {
  return (
    SIMPLE_PRODUCTION_EFFECTS.find((effect) => effect.id === id)
    ?? SIMPLE_PRODUCTION_EFFECTS[0]!
  );
}

/** 씬 레시피 진단용 효과 카탈로그 — 위저드가 만들 수 있는 effectRef 전부. */
export function simpleProductionEffectCatalog(): ReadonlySet<string> {
  return new Set(
    SIMPLE_PRODUCTION_EFFECTS.flatMap((effect) =>
      effect.effectRef ? [effect.effectRef] : [],
    ),
  );
}

// ---------------------------------------------------------------------------
// 드래프트와 기본값
// ---------------------------------------------------------------------------

export interface SimpleProductionDraft {
  layoutId: string;
  backgroundSceneTemplateId: string;
  backgroundPresetId: string;
  characterName: string;
  characterPoseRef: string;
  characterExpressionRef: string;
  dialogueScript: string;
  effectId: SimpleProductionEffectId;
  effectIntensity: number;
}

export type SimpleProductionField = keyof SimpleProductionDraft;

/** 기본값의 선호 id — 카탈로그에 없으면 각 카탈로그 첫 항목으로 폴백한다. */
export const SIMPLE_PRODUCTION_DEFAULT_IDS = {
  layoutId: "layout_two_rows",
  backgroundSceneTemplateId: "daily-talk",
  backgroundPresetId: "g-warm-paper",
  characterPoseRef: "ni_calm_front",
  characterExpressionRef: "xf_joy",
} as const;

export const SIMPLE_PRODUCTION_DEFAULT_CHARACTER_NAME = "주인공";
export const SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT =
  "주인공: 안녕! 오늘부터 내 이야기를 시작해 볼게.\n주인공: 잘 부탁해!";
export const SIMPLE_PRODUCTION_DEFAULT_EFFECT_ID: SimpleProductionEffectId = "soft-warm";

function firstIdOr(ids: readonly string[], preferred: string, fallback: string): string {
  if (ids.includes(preferred)) return preferred;
  return ids[0] ?? fallback;
}

function allPosePresets(): readonly StudioPosePreset[] {
  return [...NATURAL_IDLE_POSES, ...EXTRA_POSE_PRESETS];
}

export function simpleProductionBackgroundSceneOptions(): SceneTemplate[] {
  return SIMPLE_PRODUCTION_BACKGROUND_SCENE_IDS.flatMap((id) => {
    const template = SCENE_TEMPLATES.find((candidate) => candidate.id === id);
    return template ? [template] : [];
  });
}

export function simpleProductionBackgroundFillOptions(): StudioBackgroundPreset[] {
  return SIMPLE_PRODUCTION_BACKGROUND_FILL_IDS.flatMap((id) => {
    const preset = findStudioBackgroundPreset(id);
    return preset ? [preset] : [];
  });
}

export function simpleProductionPoseOptions(): StudioPosePreset[] {
  const poses = allPosePresets();
  return SIMPLE_PRODUCTION_POSE_IDS.flatMap((id) => {
    const preset = poses.find((candidate) => candidate.id === id);
    return preset ? [preset] : [];
  });
}

export function simpleProductionExpressionOptions(): StudioExpressionPreset[] {
  return SIMPLE_PRODUCTION_EXPRESSION_IDS.flatMap((id) => {
    const preset = EXPRESSION_PRESETS.find((candidate) => candidate.id === id);
    return preset ? [preset] : [];
  });
}

/** 전부 기본값으로 채워진 신규 드래프트 — 시작하자마자 완성 가능한 상태다. */
export function createSimpleProductionDraft(): SimpleProductionDraft {
  const effect = findSimpleProductionEffect(SIMPLE_PRODUCTION_DEFAULT_EFFECT_ID);
  return {
    layoutId: firstIdOr(
      PANEL_LAYOUTS.map((layout) => layout.id),
      SIMPLE_PRODUCTION_DEFAULT_IDS.layoutId,
      "",
    ),
    backgroundSceneTemplateId: firstIdOr(
      SCENE_TEMPLATES.map((template) => template.id),
      SIMPLE_PRODUCTION_DEFAULT_IDS.backgroundSceneTemplateId,
      "",
    ),
    backgroundPresetId: firstIdOr(
      SIMPLE_PRODUCTION_BACKGROUND_FILL_IDS,
      SIMPLE_PRODUCTION_DEFAULT_IDS.backgroundPresetId,
      SIMPLE_PRODUCTION_BACKGROUND_FILL_IDS[0] ?? "",
    ),
    characterName: SIMPLE_PRODUCTION_DEFAULT_CHARACTER_NAME,
    characterPoseRef: firstIdOr(
      allPosePresets().map((preset) => preset.id),
      SIMPLE_PRODUCTION_DEFAULT_IDS.characterPoseRef,
      "",
    ),
    characterExpressionRef: firstIdOr(
      EXPRESSION_PRESETS.map((preset) => preset.id),
      SIMPLE_PRODUCTION_DEFAULT_IDS.characterExpressionRef,
      "",
    ),
    dialogueScript: SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT,
    effectId: effect.id,
    effectIntensity: effect.defaultIntensity,
  };
}

function trimmedOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampIntensity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

/**
 * 부분 입력·손상값을 완전한 드래프트로 정규화하고, 기본값이 채운 필드를 보고한다.
 * 배경 장면/채우기·포즈·표정은 "선택지 안에 있는 id"만 유효로 인정한다 —
 * 위저드 밖의 값을 끌어오지 않는 것이 초보 동선의 예측 가능성을 지킨다.
 * 대사는 빈 문자열일 때만 기본 대사로 채운다(사용자 문장은 절대 덮지 않는다).
 */
export function applySimpleProductionDefaults(input?: unknown): {
  draft: SimpleProductionDraft;
  autoApplied: SimpleProductionField[];
} {
  const defaults = createSimpleProductionDraft();
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const autoApplied: SimpleProductionField[] = [];
  const pick = <K extends SimpleProductionField>(
    field: K,
    isValid: (value: unknown) => boolean,
    read: (value: unknown) => SimpleProductionDraft[K],
  ): SimpleProductionDraft[K] => {
    const raw = record[field];
    if (isValid(raw)) return read(raw);
    autoApplied.push(field);
    return defaults[field];
  };

  const layoutIds = new Set(PANEL_LAYOUTS.map((layout) => layout.id));
  const sceneIds = new Set(simpleProductionBackgroundSceneOptions().map((t) => t.id));
  const fillIds = new Set(simpleProductionBackgroundFillOptions().map((p) => p.id));
  const poseIds = new Set(simpleProductionPoseOptions().map((p) => p.id));
  const expressionIds = new Set(simpleProductionExpressionOptions().map((p) => p.id));

  const draft: SimpleProductionDraft = {
    layoutId: pick(
      "layoutId",
      (v) => typeof v === "string" && layoutIds.has(v),
      (v) => v as string,
    ),
    backgroundSceneTemplateId: pick(
      "backgroundSceneTemplateId",
      (v) => typeof v === "string" && sceneIds.has(v),
      (v) => v as string,
    ),
    backgroundPresetId: pick(
      "backgroundPresetId",
      (v) => typeof v === "string" && fillIds.has(v),
      (v) => v as string,
    ),
    characterName: pick(
      "characterName",
      (v) => trimmedOrEmpty(v).length > 0,
      (v) => trimmedOrEmpty(v).slice(0, 40),
    ),
    characterPoseRef: pick(
      "characterPoseRef",
      (v) => typeof v === "string" && poseIds.has(v),
      (v) => v as string,
    ),
    characterExpressionRef: pick(
      "characterExpressionRef",
      (v) => typeof v === "string" && expressionIds.has(v),
      (v) => v as string,
    ),
    dialogueScript: pick(
      "dialogueScript",
      (v) => trimmedOrEmpty(v).length > 0,
      (v) => (v as string).trim(),
    ),
    effectId: pick(
      "effectId",
      (v) => SIMPLE_PRODUCTION_EFFECTS.some((effect) => effect.id === v),
      (v) => v as SimpleProductionEffectId,
    ),
    effectIntensity: pick(
      "effectIntensity",
      (v) => typeof v === "number" && Number.isFinite(v),
      (v) => clampIntensity(v, defaults.effectIntensity),
    ),
  };
  return { draft, autoApplied };
}

export function normalizeSimpleProductionDraft(input?: unknown): SimpleProductionDraft {
  return applySimpleProductionDefaults(input).draft;
}

// ---------------------------------------------------------------------------
// 단계 준비 상태 — 기본값 덕분에 막히는 단계는 없지만, 무엇이 자동 적용
// 됐는지는 사용자가 알 수 있어야 한다.
// ---------------------------------------------------------------------------

export interface SimpleProductionStepReadiness {
  stepId: SimpleProductionStepId;
  ready: boolean;
  usedDefault: boolean;
  dialogueLineCount: number;
}

export function simpleProductionStepReadiness(
  draft: SimpleProductionDraft,
): SimpleProductionStepReadiness[] {
  const { autoApplied } = applySimpleProductionDefaults(draft);
  const applied = new Set(autoApplied);
  const fieldsByStep: Record<SimpleProductionStepId, SimpleProductionField[]> = {
    background: ["layoutId", "backgroundSceneTemplateId", "backgroundPresetId"],
    character: ["characterName", "characterPoseRef", "characterExpressionRef"],
    dialogue: ["dialogueScript"],
    effects: ["effectId", "effectIntensity"],
  };
  const dialogueLineCount = parseDialogueScript(draft.dialogueScript).length;
  return SIMPLE_PRODUCTION_STEPS.map((step) => ({
    stepId: step.id,
    // 정규화된 드래프트는 전 단계 준비 완료가 불변식이다. 대사 줄 수가 0이면
    // 정규화가 기본 대사를 채웠다는 뜻이라 역시 준비 완료로 본다.
    ready: true,
    usedDefault: fieldsByStep[step.id].some((field) => applied.has(field)),
    dialogueLineCount,
  }));
}

// ---------------------------------------------------------------------------
// 완료 핸드오프 + 전문 에디터 출구
// ---------------------------------------------------------------------------

export interface SimpleProductionEditorExit {
  target: "pro-editor";
  /** 전문 에디터에 진입할 때 여는 제작 모드 — 위저드 산출은 컷·대사 조립이라 story. */
  creationMode: StudioCreationMode;
  /** 위저드(simple 밀도)를 벗어나 전체 도구를 연 상태로 이어진다. */
  uiDensityMode: StudioUiDensityMode;
  labelKo: string;
  labelEn: string;
  /** 출구로 나가기 전에 조립 결과를 먼저 적용한다 — 만든 것이 사라지지 않는다. */
  applyBeforeExit: true;
}

export function simpleProductionEditorExit(): SimpleProductionEditorExit {
  return {
    target: "pro-editor",
    creationMode: "story",
    uiDensityMode: "full",
    labelKo: "전문 에디터에서 이어서 편집",
    labelEn: "Continue in the pro editor",
    applyBeforeExit: true,
  };
}

export interface SimpleProductionHandoff {
  draft: SimpleProductionDraft;
  autoApplied: SimpleProductionField[];
  layout: PanelLayoutPreset;
  comipoInput: ComipoAssemblyInput;
  backgroundApply: StudioBackgroundApply | null;
  sceneRecipe: StudioSceneRecipe;
  dialogueLineCount: number;
  bubbleCount: number;
  editorExit: SimpleProductionEditorExit;
}

/**
 * 정규화된 드래프트 → 완성 핸드오프. 레이아웃이 유효하지 않거나 조립이
 * 불가능하면 null — 호출부는 위저드를 닫지 말고 머무른다.
 * 캐릭터는 씬 레시피 캐스트 슬롯 1명으로, 효과는 전 컷 공통 효과로 실린다.
 * 배경 채우기는 planStudioBackgroundApply 페이로드로 따로 전달한다
 * (ComipoAssemblyInput에는 배경 채우기 자리가 없다 — 지어내지 않는다).
 */
export function buildSimpleProductionHandoff(
  input?: unknown,
): SimpleProductionHandoff | null {
  const { draft, autoApplied } = applySimpleProductionDefaults(input);
  const layout = PANEL_LAYOUTS.find((candidate) => candidate.id === draft.layoutId);
  if (!layout) return null;

  const comipoInput: ComipoAssemblyInput = {
    layoutId: layout.id,
    sceneTemplateId: draft.backgroundSceneTemplateId,
    sceneFrameIndex: 0,
    dialogueScript: draft.dialogueScript,
  };
  const assembly = assembleComipoPage(comipoInput);
  if (!assembly) return null;

  const backgroundPreset = findStudioBackgroundPreset(draft.backgroundPresetId);
  const backgroundApply = backgroundPreset
    ? planStudioBackgroundApply(backgroundPreset, CANVAS_W, layout.canvasH)
    : null;

  const effect = findSimpleProductionEffect(draft.effectId);
  const characterName = draft.characterName;
  const sceneRecipe: StudioSceneRecipe = {
    version: STUDIO_SCENE_RECIPE_VERSION,
    id: `simple-wizard-${layout.id}`,
    name: `${characterName}의 첫 장면`,
    setRef: draft.backgroundSceneTemplateId,
    cast: [
      {
        id: "lead",
        label: characterName,
        poseRef: draft.characterPoseRef,
        expressionRef: draft.characterExpressionRef,
      },
    ],
    defaultCamera: { angle: "front", zoom: 1 },
    defaultLighting: "day",
    shots: layout.frames.map((_, index) => ({
      id: `${layout.id}-frame-${index + 1}`,
      label: `컷 ${index + 1}`,
      ...(effect.effectRef
        ? {
            effects: [
              {
                id: `simple-wizard-effect-${index + 1}`,
                effectRef: effect.effectRef,
                intensity: draft.effectIntensity,
              },
            ],
          }
        : { effects: [] }),
      beatRefs: [],
    })),
  };

  return {
    draft,
    autoApplied,
    layout,
    comipoInput,
    backgroundApply,
    sceneRecipe,
    dialogueLineCount: parseDialogueScript(draft.dialogueScript).length,
    bubbleCount: assembly.bubbleCount,
    editorExit: simpleProductionEditorExit(),
  };
}

// ---------------------------------------------------------------------------
// 저장 — 밀도 모델과 같은 계약(손상값은 기본 드래프트로 복원).
// ---------------------------------------------------------------------------

export const SIMPLE_PRODUCTION_STORAGE_KEY = "toonstudio-simple-production-wizard:v1";

export interface SimpleProductionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSimpleProductionDraft(
  storage: SimpleProductionStorage | null | undefined,
): SimpleProductionDraft {
  if (!storage) return createSimpleProductionDraft();
  try {
    const raw = storage.getItem(SIMPLE_PRODUCTION_STORAGE_KEY);
    if (!raw) return createSimpleProductionDraft();
    return normalizeSimpleProductionDraft(JSON.parse(raw));
  } catch {
    return createSimpleProductionDraft();
  }
}

export function saveSimpleProductionDraft(
  storage: SimpleProductionStorage | null | undefined,
  draft: SimpleProductionDraft,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      SIMPLE_PRODUCTION_STORAGE_KEY,
      JSON.stringify(normalizeSimpleProductionDraft(draft)),
    );
    return true;
  } catch {
    return false;
  }
}
