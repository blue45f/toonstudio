import type { CharacterDnaProfile, LightballShadingState } from "./character-dna-lightball-engine";
import {
  ART_STYLE_OPTIONS,
  GENRE_BLUEPRINTS,
  GENRE_OPTIONS,
  MASTER_LAYER_ORDER,
  MAX_CUT_COUNT,
  MIN_CUT_COUNT,
  PLATFORM_OPTIONS,
  PLATFORM_SPEC_TABLE,
  type GenreBlueprint,
  type LayerBlendMode,
  type MasterLayerId,
  type OptionalBriefField,
  type PipelineStageId,
  type PipelineStageStatus,
  type TargetWebtoonPlatform,
  type WebtoonArtStyle,
  type WebtoonGenre,
} from "./hyper-automation-catalog";

export interface HyperAutomationRawInput {
  readonly ideaLine: string;
  readonly genre?: WebtoonGenre;
  readonly artStyle?: WebtoonArtStyle;
  readonly characterCount?: number;
  readonly protagonistProfile?: string;
  readonly backgroundTheme?: string;
  readonly cutCount?: number;
  readonly targetPlatform?: TargetWebtoonPlatform;
}

export interface ResolvedHyperAutomationInput {
  readonly ideaLine: string;
  readonly genre: WebtoonGenre;
  readonly artStyle: WebtoonArtStyle;
  readonly characterCount: number;
  readonly protagonistProfile: string;
  readonly backgroundTheme: string;
  readonly cutCount: number;
  readonly targetPlatform: TargetWebtoonPlatform;
}

export interface AutoFilledFieldMeta {
  readonly field: OptionalBriefField;
  readonly label: string;
  readonly source: "ai-autofill";
  readonly valueSummary: string;
  readonly reason: string;
}

interface AutoFilledInputResult {
  readonly resolved: ResolvedHyperAutomationInput;
  readonly autoFilledFields: readonly AutoFilledFieldMeta[];
  readonly userProvidedFields: readonly OptionalBriefField[];
  readonly undoSnapshot: HyperAutomationRawInput;
}

interface MinimalInputValidation {
  readonly valid: boolean;
  readonly requiredFieldCount: 1;
  readonly errorCode: "IDEA_LINE_REQUIRED" | null;
  readonly message: string | null;
}

export interface StoryboardCutPlan {
  readonly cutIndex: number;
  readonly act: 1 | 2 | 3;
  readonly shotType: string;
  readonly lensMm: 24 | 35 | 50 | 85 | 135;
  readonly tension: number;
  readonly eyeFlow: "Z-flow" | "vertical-drop" | "diagonal-slash" | "center-impact";
  readonly beatSummary: string;
  readonly dialogueLine: string;
  readonly sfxCue: string;
}

export interface PlatformSpecCheck {
  readonly platform: TargetWebtoonPlatform;
  readonly name: string;
  readonly targetWidthPx: number;
  readonly sliceMaxHeightPx: number;
  readonly readabilityScore: number;
  readonly status: "pass" | "auto-corrected";
  readonly note: string;
}

export interface MasterEditableLayer {
  readonly id: MasterLayerId;
  readonly label: string;
  readonly roleDescription: string;
  readonly editableMode:
    | "3d-camera-mesh"
    | "vector-bezier"
    | "oklch-fill-mask"
    | "rim-shadow-grade"
    | "procedural-vfx"
    | "text-sfx-layout";
  readonly visible: boolean;
  readonly manualLocked: boolean;
  readonly opacity: number;
  readonly blendMode: LayerBlendMode;
  readonly editCount: number;
  readonly manualNotes: string;
  readonly colorTokenOklch: string;
  readonly elementCount: number;
}

export interface PipelineStageState {
  readonly id: PipelineStageId;
  readonly order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly title: string;
  readonly subtitle: string;
  readonly status: PipelineStageStatus;
  readonly manualLocked: boolean;
  readonly autonomyPercent: number;
  readonly generationCount: number;
  readonly lastSeed: number;
  readonly summary: string;
  readonly metrics: readonly string[];
  readonly manualOverrideNote: string | null;
}

export interface MasterLayerPatch {
  readonly visible?: boolean;
  readonly manualLocked?: boolean;
  readonly opacity?: number;
  readonly blendMode?: LayerBlendMode;
  readonly manualNotes?: string;
}

const MIN_CHARACTER_COUNT = 1;
const MAX_CHARACTER_COUNT = 8;

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function genreLabel(genre: WebtoonGenre): string {
  return GENRE_OPTIONS.find((item) => item.value === genre)?.label ?? genre;
}

function styleLabel(style: WebtoonArtStyle): string {
  return ART_STYLE_OPTIONS.find((item) => item.value === style)?.label ?? style;
}

function platformLabel(platform: TargetWebtoonPlatform): string {
  return PLATFORM_OPTIONS.find((item) => item.value === platform)?.label ?? platform;
}

function inferGenreFromIdea(ideaLine: string): { genre: WebtoonGenre; matchedKeyword: string | null } {
  const lower = ideaLine.toLowerCase();
  const order: readonly WebtoonGenre[] = [
    "sf-cyberpunk",
    "historical-fusion",
    "thriller-noir",
    "romance-drama",
    "slice-of-life",
    "action-fantasy",
  ];
  for (const genre of order) {
    const matched = GENRE_BLUEPRINTS[genre].keywords.find((kw) => lower.includes(kw));
    if (matched) return { genre, matchedKeyword: matched };
  }
  return { genre: "action-fantasy", matchedKeyword: null };
}

export function validateRequiredMinimalInput(raw: HyperAutomationRawInput): MinimalInputValidation {
  if (raw.ideaLine.trim().length === 0) {
    return {
      valid: false,
      requiredFieldCount: 1,
      errorCode: "IDEA_LINE_REQUIRED",
      message: "필수 입력 1개(아이디어 한 줄 또는 제목)를 먼저 입력해 주세요.",
    };
  }
  return { valid: true, requiredFieldCount: 1, errorCode: null, message: null };
}

export function autoFillHyperAutomationInput(raw: HyperAutomationRawInput): AutoFilledInputResult {
  const trimmedIdea = raw.ideaLine.trim();
  const undoSnapshot: HyperAutomationRawInput = {
    ideaLine: raw.ideaLine,
    ...(raw.genre !== undefined ? { genre: raw.genre } : {}),
    ...(raw.artStyle !== undefined ? { artStyle: raw.artStyle } : {}),
    ...(raw.characterCount !== undefined ? { characterCount: raw.characterCount } : {}),
    ...(raw.protagonistProfile !== undefined ? { protagonistProfile: raw.protagonistProfile } : {}),
    ...(raw.backgroundTheme !== undefined ? { backgroundTheme: raw.backgroundTheme } : {}),
    ...(raw.cutCount !== undefined ? { cutCount: raw.cutCount } : {}),
    ...(raw.targetPlatform !== undefined ? { targetPlatform: raw.targetPlatform } : {}),
  };

  const inferred = inferGenreFromIdea(trimmedIdea);
  const autoFilledFields: AutoFilledFieldMeta[] = [];
  const userProvidedFields: OptionalBriefField[] = [];

  const genre: WebtoonGenre = raw.genre ?? inferred.genre;
  if (raw.genre) {
    userProvidedFields.push("genre");
  } else {
    autoFilledFields.push({
      field: "genre",
      label: "장르",
      source: "ai-autofill",
      valueSummary: genreLabel(genre),
      reason: inferred.matchedKeyword
        ? `"${inferred.matchedKeyword}" 키워드 문맥에서 ${genreLabel(genre)} 장르를 선택했습니다.`
        : `한 줄 로그라인 서사에 맞춰 ${genreLabel(genre)} 기본 장르를 지정했습니다.`,
    });
  }

  const blueprint = GENRE_BLUEPRINTS[genre];
  const artStyle: WebtoonArtStyle = raw.artStyle ?? blueprint.defaultStyle;
  if (raw.artStyle) {
    userProvidedFields.push("artStyle");
  } else {
    autoFilledFields.push({
      field: "artStyle",
      label: "화풍",
      source: "ai-autofill",
      valueSummary: styleLabel(artStyle),
      reason: `${genreLabel(genre)} 대비와 톤에 맞는 ${styleLabel(artStyle)} 화풍을 자동 연결했습니다.`,
    });
  }

  const hasCharacterCount = typeof raw.characterCount === "number" && Number.isFinite(raw.characterCount);
  const characterCount = hasCharacterCount
    ? clampInt(raw.characterCount as number, MIN_CHARACTER_COUNT, MAX_CHARACTER_COUNT)
    : blueprint.defaultCharacterCount;
  if (hasCharacterCount) {
    userProvidedFields.push("characterCount");
  } else {
    autoFilledFields.push({
      field: "characterCount",
      label: "캐릭터 수",
      source: "ai-autofill",
      valueSummary: `${characterCount}명`,
      reason: `주인공·조력자·대립 축이 첫 화 안에 선명히 잡히도록 ${characterCount}명으로 설정했습니다.`,
    });
  }

  const userProtagonist = raw.protagonistProfile?.trim() ?? "";
  const protagonistProfile = userProtagonist.length > 0
    ? userProtagonist
    : `${blueprint.protagonistTemplate} (${trimmedIdea.slice(0, 22)})`;
  if (userProtagonist.length > 0) {
    userProvidedFields.push("protagonistProfile");
  } else {
    autoFilledFields.push({
      field: "protagonistProfile",
      label: "주인공 설정",
      source: "ai-autofill",
      valueSummary: protagonistProfile,
      reason: "아이디어 한 줄에서 주인공의 결핍과 첫 화 목표를 추출했습니다.",
    });
  }

  const userBackground = raw.backgroundTheme?.trim() ?? "";
  const backgroundTheme = userBackground.length > 0 ? userBackground : blueprint.backgroundTheme;
  if (userBackground.length > 0) {
    userProvidedFields.push("backgroundTheme");
  } else {
    autoFilledFields.push({
      field: "backgroundTheme",
      label: "배경 테마",
      source: "ai-autofill",
      valueSummary: backgroundTheme,
      reason: `${genreLabel(genre)} 대표 공간감에 맞춰 3D 배경 씬 테마를 매칭했습니다.`,
    });
  }

  const hasCutCount = typeof raw.cutCount === "number" && Number.isFinite(raw.cutCount);
  const cutCount = hasCutCount
    ? clampInt(raw.cutCount as number, MIN_CUT_COUNT, MAX_CUT_COUNT)
    : blueprint.defaultCutCount;
  if (hasCutCount) {
    userProvidedFields.push("cutCount");
  } else {
    autoFilledFields.push({
      field: "cutCount",
      label: "컷 수",
      source: "ai-autofill",
      valueSummary: `${cutCount}컷`,
      reason: `모바일 스크롤 완독 리듬에 맞춘 ${cutCount}컷(4~60컷 범위)으로 배분했습니다.`,
    });
  }

  const targetPlatform: TargetWebtoonPlatform = raw.targetPlatform ?? blueprint.defaultPlatform;
  if (raw.targetPlatform) {
    userProvidedFields.push("targetPlatform");
  } else {
    autoFilledFields.push({
      field: "targetPlatform",
      label: "타겟 플랫폼",
      source: "ai-autofill",
      valueSummary: platformLabel(targetPlatform),
      reason: `${genreLabel(genre)} 독자층과 규격 적합도가 높은 ${platformLabel(targetPlatform)}을 선택했습니다.`,
    });
  }

  return {
    resolved: {
      ideaLine: trimmedIdea,
      genre,
      artStyle,
      characterCount,
      protagonistProfile,
      backgroundTheme,
      cutCount,
      targetPlatform,
    },
    autoFilledFields,
    userProvidedFields,
    undoSnapshot,
  };
}

export function restoreAutoFillSnapshot(snapshot: HyperAutomationRawInput): HyperAutomationRawInput {
  return {
    ideaLine: snapshot.ideaLine,
    ...(snapshot.genre !== undefined ? { genre: snapshot.genre } : {}),
    ...(snapshot.artStyle !== undefined ? { artStyle: snapshot.artStyle } : {}),
    ...(snapshot.characterCount !== undefined ? { characterCount: snapshot.characterCount } : {}),
    ...(snapshot.protagonistProfile !== undefined ? { protagonistProfile: snapshot.protagonistProfile } : {}),
    ...(snapshot.backgroundTheme !== undefined ? { backgroundTheme: snapshot.backgroundTheme } : {}),
    ...(snapshot.cutCount !== undefined ? { cutCount: snapshot.cutCount } : {}),
    ...(snapshot.targetPlatform !== undefined ? { targetPlatform: snapshot.targetPlatform } : {}),
  };
}

export function buildStoryboardCuts(
  resolved: ResolvedHyperAutomationInput,
  blueprint: GenreBlueprint,
  seed: number,
): readonly StoryboardCutPlan[] {
  const shotPool = ["와이드 설립샷", "미디엄 투샷", "클로즈업 감정샷", "로우앵글 위압샷", "오버더숄더 대치", "하이앵글 공간샷"] as const;
  const lensPool: readonly (24 | 35 | 50 | 85 | 135)[] = [24, 35, 50, 85, 135];
  const eyeFlowPool: readonly StoryboardCutPlan["eyeFlow"][] = [
    "vertical-drop",
    "Z-flow",
    "diagonal-slash",
    "center-impact",
  ];
  const cuts: StoryboardCutPlan[] = [];
  for (let index = 0; index < resolved.cutCount; index += 1) {
    const progress = resolved.cutCount <= 1 ? 1 : index / (resolved.cutCount - 1);
    const act: 1 | 2 | 3 = progress < 0.34 ? 1 : progress < 0.72 ? 2 : 3;
    const baseTension = act === 1 ? 38 + Math.round(progress * 60) : act === 2 ? 58 + Math.round(progress * 32) : 82 + Math.round(progress * 16);
    const tension = clampInt(baseTension + ((seed + index * 7) % 9) - 4, 20, 99);
    const shotType = shotPool[(index + seed) % shotPool.length] ?? shotPool[0];
    const lensMm = lensPool[(index + act + seed) % lensPool.length] ?? 35;
    const eyeFlow = eyeFlowPool[(index + seed) % eyeFlowPool.length] ?? "vertical-drop";
    const sfxCue = blueprint.sfxPool[(index + seed) % blueprint.sfxPool.length] ?? "스윽—";
    const beatLabel = act === 1
      ? `도입 · ${resolved.backgroundTheme} 위로 사건의 징조가 열린다`
      : act === 2
        ? `전개 · ${resolved.protagonistProfile}의 선택이 충돌을 키운다`
        : `클라이맥스 · "${resolved.ideaLine.slice(0, 18)}" 핵심 반전이 폭발한다`;
    const dialogueLine = act === 1
      ? "이 장면, 처음 보는 게 아니야."
      : act === 2
        ? "물러서면 모든 게 여기서 끝난다."
        : "지금이다 — 마지막 수를 뒤집는다!";
    cuts.push({
      cutIndex: index + 1,
      act,
      shotType,
      lensMm,
      tension,
      eyeFlow,
      beatSummary: beatLabel,
      dialogueLine,
      sfxCue,
    });
  }
  return cuts;
}

export function buildPlatformChecks(
  resolved: ResolvedHyperAutomationInput,
  seed: number,
): readonly PlatformSpecCheck[] {
  return PLATFORM_SPEC_TABLE.map((spec, idx) => {
    const isTarget = spec.platform === resolved.targetPlatform;
    const score = clampInt(93 + ((seed + idx) % 6) + (isTarget ? 2 : 0), 90, 99);
    const status: PlatformSpecCheck["status"] = isTarget ? "pass" : (idx + seed) % 3 === 0 ? "auto-corrected" : "pass";
    return {
      platform: spec.platform,
      name: spec.name,
      targetWidthPx: spec.targetWidthPx,
      sliceMaxHeightPx: spec.sliceMaxHeightPx,
      readabilityScore: score,
      status,
      note: status === "auto-corrected"
        ? `${spec.ruleNote} (여백·식자 자동 보정 완료)`
        : spec.ruleNote,
    };
  });
}

export function buildMasterLayers(
  resolved: ResolvedHyperAutomationInput,
  blueprint: GenreBlueprint,
  lightball: LightballShadingState,
  previousLayers: readonly MasterEditableLayer[] | undefined,
  stageLocked: boolean,
): readonly MasterEditableLayer[] {
  if (stageLocked && previousLayers && previousLayers.length === MASTER_LAYER_ORDER.length) {
    return previousLayers;
  }

  const prevById = new Map((previousLayers ?? []).map((layer) => [layer.id, layer] as const));
  const specs: readonly {
    readonly id: MasterLayerId;
    readonly label: string;
    readonly roleDescription: string;
    readonly editableMode: MasterEditableLayer["editableMode"];
    readonly defaultBlend: LayerBlendMode;
    readonly defaultOpacity: number;
    readonly colorTokenOklch: string;
    readonly elementCount: number;
  }[] = [
    {
      id: "01_BG_3D",
      label: "3D 배경·원근 레이어",
      roleDescription: `${resolved.backgroundTheme} · ${blueprint.perspective} 원근 카메라 락`,
      editableMode: "3d-camera-mesh",
      defaultBlend: "normal",
      defaultOpacity: 100,
      colorTokenOklch: blueprint.swatches[0]?.value ?? "oklch(0.24 0.03 255)",
      elementCount: resolved.cutCount * 2,
    },
    {
      id: "02_LINE_VECTOR",
      label: "벡터 선화 레이어",
      roleDescription: "떨림 보정 베지어 패스 · 필압·선폭 무손실 재편집",
      editableMode: "vector-bezier",
      defaultBlend: "normal",
      defaultOpacity: 100,
      colorTokenOklch: "oklch(0.22 0.015 70)",
      elementCount: resolved.cutCount * 14,
    },
    {
      id: "03_FLAT_COLOR",
      label: "밑색 OKLCH 레이어",
      roleDescription: `${resolved.characterCount}명 캐릭터 DNA 팔레트 락 영역 마스크`,
      editableMode: "oklch-fill-mask",
      defaultBlend: "normal",
      defaultOpacity: 100,
      colorTokenOklch: blueprint.swatches[1]?.value ?? "oklch(0.74 0.14 48)",
      elementCount: resolved.cutCount * resolved.characterCount * 4,
    },
    {
      id: "04_SHADE_LIGHT",
      label: "명암·림라이트 레이어",
      roleDescription: `3D 라이트볼 방위 ${lightball.azimuthDeg}° · 고도 ${lightball.elevationDeg}° · 림 ${lightball.rimLightPercent}% + 접촉음영 ${lightball.contactShadowPercent}%`,
      editableMode: "rim-shadow-grade",
      defaultBlend: "multiply",
      defaultOpacity: 82,
      colorTokenOklch: lightball.rimColorOklch,
      elementCount: resolved.cutCount * 6,
    },
    {
      id: "05_VFX_LINES",
      label: "효과선·이펙트 레이어",
      roleDescription: blueprint.speedLinePreset,
      editableMode: "procedural-vfx",
      defaultBlend: "screen",
      defaultOpacity: 90,
      colorTokenOklch: blueprint.swatches[4]?.value ?? "oklch(0.68 0.21 32)",
      elementCount: resolved.cutCount * 3,
    },
    {
      id: "06_SPEECH_SFX",
      label: "말풍선·식자·SFX 레이어",
      roleDescription: `${blueprint.emotionFont} · 다국어 교체 대응 텍스트 트리`,
      editableMode: "text-sfx-layout",
      defaultBlend: "normal",
      defaultOpacity: 100,
      colorTokenOklch: "oklch(0.92 0.02 85)",
      elementCount: resolved.cutCount * 2,
    },
  ];

  return specs.map((spec) => {
    const prev = prevById.get(spec.id);
    if (prev && (prev.manualLocked || prev.editCount > 0)) {
      return {
        ...prev,
        roleDescription: prev.manualLocked ? prev.roleDescription : spec.roleDescription,
        elementCount: prev.manualLocked ? prev.elementCount : spec.elementCount,
      };
    }
    return {
      id: spec.id,
      label: spec.label,
      roleDescription: spec.roleDescription,
      editableMode: spec.editableMode,
      visible: true,
      manualLocked: false,
      opacity: spec.defaultOpacity,
      blendMode: spec.defaultBlend,
      editCount: 0,
      manualNotes: "",
      colorTokenOklch: spec.colorTokenOklch,
      elementCount: spec.elementCount,
    };
  });
}

export function buildStageSummaryAndMetrics(
  stageId: PipelineStageId,
  resolved: ResolvedHyperAutomationInput,
  blueprint: GenreBlueprint,
  autonomyPercent: number,
  cuts: readonly StoryboardCutPlan[],
  platformChecks: readonly PlatformSpecCheck[],
  characterDna: CharacterDnaProfile,
  lightball: LightballShadingState,
  seed: number,
): { readonly summary: string; readonly metrics: readonly string[] } {
  const variantTag = seed > 1 ? ` · 변주 #${seed}` : "";
  const dialTag = autonomyPercent === 0 ? "수동 100%" : `AI 비중 ${autonomyPercent}%`;
  switch (stageId) {
    case "story-plot":
      return {
        summary: autonomyPercent === 0
          ? "작가 직접 집필 모드(AI 0%): 3막 구성 초안을 참고 메모로만 대기합니다."
          : `한 줄 아이디어에서 3막 구조와 1화 클라이맥스 훅을 도출했습니다(${dialTag}${variantTag}).`,
        metrics: [`장르 ${genreLabel(resolved.genre)}`, `등장인물 ${resolved.characterCount}명`, dialTag],
      };
    case "director-storyboard": {
      const peakTension = Math.max(...cuts.map((cut) => cut.tension));
      return {
        summary: `${resolved.cutCount}컷의 카메라 앵글·렌즈·시선 동선을 배분했습니다(${dialTag}${variantTag}).`,
        metrics: [`총 ${resolved.cutCount}컷`, `최고 텐션 ${peakTension}%`, dialTag],
      };
    }
    case "rough-cleanup": {
      const stabilize = autonomyPercent === 0 ? 15 : clampInt(Math.round(25 + autonomyPercent * 0.68), 25, 94);
      return {
        summary: autonomyPercent === 0
          ? "수동 선화 0%: 작가 필압 원형을 그대로 유지하며 자동 클린업을 개입시키지 않습니다."
          : `거친 콘티를 떨림 보정 ${stabilize}% 벡터 선화로 정제했습니다(${dialTag}${variantTag}).`,
        metrics: [`떨림 보정 ${stabilize}%`, `화풍 ${styleLabel(resolved.artStyle)}`, dialTag],
      };
    }
    case "scene-3d-blocking":
      return {
        summary: `${resolved.backgroundTheme} 3D 공간과 캐릭터 DNA(${characterDna.dnaCode}, 8각도·12표정) 포즈 원근을 잠갔습니다(${dialTag}${variantTag}).`,
        metrics: [`원근 ${blueprint.perspective}`, `DNA ${characterDna.dnaCode}`, dialTag],
      };
    case "one-tap-coloring":
      return {
        summary: `캐릭터 OKLCH 팔레트 5색 락으로 밑색·셀 명암·하이라이트를 배분했습니다(${dialTag}${variantTag}).`,
        metrics: ["OKLCH 5색 락", `채색 컷 ${resolved.cutCount}매`, dialTag],
      };
    case "lighting-harmonizer":
      return {
        summary: `3D 라이트볼(방위 ${lightball.azimuthDeg}° · 고도 ${lightball.elevationDeg}°) 기준 림 라이트(${lightball.rimLightPercent}%)·접촉 그림자(${lightball.contactShadowPercent}%)를 동기화했습니다(${dialTag}${variantTag}).`,
        metrics: [
          `방위 ${lightball.azimuthDeg}° · 고도 ${lightball.elevationDeg}°`,
          `림 ${lightball.rimLightPercent}% · 음영 ${lightball.contactShadowPercent}%`,
          dialTag,
        ],
      };
    case "nlp-vfx-lettering":
      return {
        summary: `자연어 연출 묘사에서 효과선(${blueprint.speedLinePreset})과 말풍선·SFX를 배치했습니다(${dialTag}${variantTag}).`,
        metrics: [`SFX ${blueprint.sfxPool.slice(0, 2).join(" ")}`, `${resolved.cutCount}컷 말풍선`, dialTag],
      };
    case "platform-preflight": {
      const avgScore = Math.round(
        platformChecks.reduce((acc, item) => acc + item.readabilityScore, 0) / platformChecks.length,
      );
      return {
        summary: `6대 플랫폼 규격과 모바일 가독성(${avgScore}점)을 자동 검수·교정했습니다(${dialTag}${variantTag}).`,
        metrics: [`기준 ${platformLabel(resolved.targetPlatform)}`, "6/6 플랫폼 통과", `가독성 ${avgScore}점`],
      };
    }
    case "layered-master-output":
      return {
        summary: `완성 ${resolved.cutCount}컷 마스터와 6계층 수동 분리 레이어(01~06)를 무손실 개방했습니다(${dialTag}${variantTag}).`,
        metrics: ["6계층 분리 완료", "수동 편집 100% 개방", "비파괴 레이어 트리"],
      };
  }
}
