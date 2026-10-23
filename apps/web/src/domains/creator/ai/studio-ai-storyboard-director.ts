/**
 * studio-ai-storyboard-director.ts
 *
 * 지문(대본·연출 지시) + 간단한 스케치(구도 프리셋·바운딩 박스·초점·동세선) + 작가 그림체 모델(LoRA·화풍 특성)을
 * 결합해 의도한 웹툰 스토리보드와 작화 프롬프트를 생성하는 디렉터 엔진.
 *
 * 핵심 설계 원칙:
 * 1. 기존 대본 전용 호출(`direct(scriptText)`)의 샷 스케일·카메라 앵글·감정·패널 높이 비율 결정 규칙을
 *    그대로 보존해 텐션 맵(`webtoon-tension-map`)과 에피소드 프로덕션 디렉터의 결정적 계약을 깨지 않는다.
 * 2. 지문에 명시적 연출 지시어(`[클로즈업]`, `[버즈아이]`, `[더치앵글]` 등)나 나레이션(`(독백)`), 또는
 *    간단한 스케치 입력(`StoryboardRoughSketchInput`)이 주어지면 작가의 의도를 최우선으로 반영한다.
 * 3. 작가 그림체 모델(`StoryboardArtistStyleBinding` / `StudioLoraTrainingJob`)이 연결되면 트리거 워드와
 *    선화·채색·색감 특성 토큰을 각 컷의 작화 프롬프트에 일관되게 주입한다.
 * 4. 전문 웹툰 작가뿐 아니라 미래 웹툰 작가 지망생도 연출 원리를 이해할 수 있도록 컷별 코칭 팁과
 *    글로벌 K-웹툰 세로 스크롤·번역 말풍선 여유율 지표를 함께 산출한다.
 */

import {
  planStudioStoryboard,
  type StudioStoryboardPlan,
  type StudioStoryBeat,
  type StudioStoryBeatKind,
} from "../studio-storyboard-planner";
import {
  describeStudioArtistStyleTraits,
  type StudioArtistLineWeight,
  type StudioArtistPaletteMood,
  type StudioArtistShadingMode,
  type StudioLoraTrainingJob,
} from "./studio-lora-training";

export type StoryboardShotScale =
  | "extreme-close-up"
  | "close-up"
  | "medium-shot"
  | "full-shot"
  | "long-shot"
  | "birds-eye"
  | "worms-eye";

export type StoryboardCameraAngle = "eye-level" | "low-angle" | "high-angle" | "dutch-tilt";

export type CharacterEmotionalTone =
  | "determination"
  | "shock"
  | "joy"
  | "rage"
  | "sorrow"
  | "calm";

/** 간단한 스케치 구도 프리셋 — 지망생·전문 작가가 러프 스케치 의도를 빠르게 지정할 때 쓴다. */
export type StoryboardRoughSketchPresetId =
  | "center-focus"
  | "diagonal-action"
  | "low-horizon-hero"
  | "high-angle-isolation"
  | "two-shot-dialogue"
  | "split-reaction";

export interface StoryboardRoughSketchPresetMeta {
  readonly id: StoryboardRoughSketchPresetId;
  readonly label: string;
  readonly summary: string;
  readonly shotScale: StoryboardShotScale;
  readonly cameraAngle: StoryboardCameraAngle;
  readonly compositionGuide: string;
}

export const STORYBOARD_ROUGH_SKETCH_PRESETS: readonly StoryboardRoughSketchPresetMeta[] =
  Object.freeze([
    {
      id: "center-focus",
      label: "중앙 시선 집중",
      summary: "인물 얼굴·눈빛을 캔버스 중앙 상단에 배치해 감정 몰입을 유도",
      shotScale: "close-up",
      cameraAngle: "eye-level",
      compositionGuide: "center-weighted emotional focal subject with upper speech safe zone",
    },
    {
      id: "diagonal-action",
      label: "대각선 액션 동세",
      summary: "좌하단→우상단 대각선 운동선으로 타격감과 속도감을 극대화",
      shotScale: "full-shot",
      cameraAngle: "dutch-tilt",
      compositionGuide: "dynamic diagonal action line with motion blur and foreground impact",
    },
    {
      id: "low-horizon-hero",
      label: "로우앵글 히어로 구도",
      summary: "지평선을 낮추고 인물을 올려다보아 위압감·결의를 강조",
      shotScale: "worms-eye",
      cameraAngle: "low-angle",
      compositionGuide: "low-horizon heroic silhouette looking up with dramatic vertical headroom",
    },
    {
      id: "high-angle-isolation",
      label: "하이앵글 고립·배경",
      summary: "위에서 내려다보는 부감 구도로 공간감과 인물의 고독·위기를 부각",
      shotScale: "birds-eye",
      cameraAngle: "high-angle",
      compositionGuide: "overhead environmental staging emphasizing spatial scale and isolation",
    },
    {
      id: "two-shot-dialogue",
      label: "2인 대치·대화 역샷",
      summary: "좌우 시선 교차와 중앙 말풍선 통로를 확보한 대화 구도",
      shotScale: "medium-shot",
      cameraAngle: "eye-level",
      compositionGuide: "balanced two-character over-the-shoulder staging with center bubble corridor",
    },
    {
      id: "split-reaction",
      label: "익스트림 리액션 컷",
      summary: "동공·손끝·입술 등 결정적 디테일만 좁게 잘라 서스펜스를 압축",
      shotScale: "extreme-close-up",
      cameraAngle: "eye-level",
      compositionGuide: "tight macro crop on eyes or hands with high-contrast rim light",
    },
  ]);

/** 간단한 스케치 안의 영역 박스(정규화 0..1 또는 캔버스 좌표). */
export interface StoryboardRoughSketchStrokeBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly role?: "subject" | "prop" | "background" | "speech-zone" | "motion-line";
  readonly label?: string;
}

/** 지문과 함께(또는 단독으로) 전달하는 간단한 스케치 입력. */
export interface StoryboardRoughSketchInput {
  readonly presetId?: StoryboardRoughSketchPresetId;
  /** 주요 피사체 초점 위치 (0..1 정규화 좌표). */
  readonly focalPoint?: { readonly x: number; readonly y: number };
  readonly focalX?: number;
  readonly focalY?: number;
  readonly horizonRatio?: number;
  readonly subjectScale?: number;
  readonly motionVector?: "none" | "diagonal-slash" | "upward-rise" | "downward-drop" | "inward-zoom";
  readonly speechZoneHint?: "top" | "bottom" | "split";
  /** 주요 동세선 각도 (0~90도, 25도 이상이면 역동적 대각 구도로 해석). */
  readonly dominantDiagonalDeg?: number;
  /** 스케치 선 밀도 (0..1). */
  readonly strokeDensity?: number;
  /** 스케치에서 감지된 피사체·말풍선·동세선 영역 목록. */
  readonly boxes?: readonly StoryboardRoughSketchStrokeBox[];
  /** 작가가 스케치 옆에 짧게 적은 연출 메모. */
  readonly sketchNote?: string;
}

/** 작가 그림체 모델(학습된 style LoRA 또는 작가 화풍 프로필) 연결 정보. */
export interface StoryboardArtistStyleBinding {
  readonly modelId?: string;
  readonly artistLabel: string;
  readonly triggerWord: string;
  readonly loraFileUrl?: string | null;
  readonly lineWeight?: StudioArtistLineWeight;
  readonly shadingMode?: StudioArtistShadingMode;
  readonly paletteMood?: StudioArtistPaletteMood;
}

export interface StoryboardDirectingOptions {
  /** 컷 순서에 대응하는 간단한 스케치 배열. */
  readonly sketches?: readonly (StoryboardRoughSketchInput | null | undefined)[];
  /** 모든 컷(또는 스케치가 따로 지정되지 않은 컷)에 공통 적용할 대표 스케치 의도. */
  readonly defaultSketch?: StoryboardRoughSketchInput | null;
  /** 작가 그림체 모델 바인딩. */
  readonly artistStyle?: StoryboardArtistStyleBinding | null;
  /** 사용자 숙련도 모드 — 지망생(`aspiring`)이면 더 구체적인 카메라·호흡 원리 코칭을 제공한다. */
  readonly creatorLevel?: "pro" | "aspiring";
  /** 글로벌 K-웹툰 연재 타깃 언어 — 다국어 번역 시 말풍선 확장 여유율을 보정한다. */
  readonly targetLocale?: "ko" | "en" | "ja" | "es";
}

export interface AnalyzedRoughSketchIntent {
  readonly shotScale: StoryboardShotScale;
  readonly cameraAngle: StoryboardCameraAngle;
  readonly compositionGuide: string;
  readonly reserveSpeechRatioBoost: number;
  readonly panelHeightMultiplier: number;
  readonly summaryHint: string;
}

export interface StoryboardCutPlan {
  readonly cutNumber: number;
  readonly summary: string;
  readonly dialogue?: string;
  readonly narration?: string;
  readonly speaker?: string;
  readonly stageDirection?: string;
  readonly shotScale: StoryboardShotScale;
  readonly cameraAngle: StoryboardCameraAngle;
  readonly emotion: CharacterEmotionalTone;
  readonly beatKind?: StudioStoryBeatKind;
  readonly suggestedSfx?: string;
  readonly backgroundPrompt: string;
  readonly artistStylePrompt?: string;
  readonly artistLoraFileUrl?: string | null;
  readonly compositionGuide?: string;
  readonly sketchIntentApplied?: boolean;
  readonly reserveDialogueAreaRatio?: number;
  readonly scrollGapAfterPx?: number;
  readonly creatorCoachingTip?: string;
  readonly panelHeightRatio: number;
}

export interface GlobalKWebtoonReadiness {
  /** 모바일 세로 스크롤 호흡 점수 (0..100). */
  readonly verticalScrollRhythmScore: number;
  /** 다국어(영어·일본어·스페인어) 번역 시 말풍선 안전 여유 비율 (0..1). */
  readonly localizationSafeBubbleRatio: number;
  readonly summary: string;
}

export interface StoryboardDirectingResult {
  readonly rawText: string;
  readonly cuts: readonly StoryboardCutPlan[];
  readonly totalCuts: number;
  readonly estimatedEpisodeReadingSec: number;
  readonly pacingScore: number;
  readonly appliedArtistStyle?: StoryboardArtistStyleBinding | null;
  readonly sketchMatchedCutCount?: number;
  readonly globalKWebtoonReadiness?: GlobalKWebtoonReadiness;
}

const ACTION_PATTERN = /(?:결투|공격|타격|대검|장검|단검|마검|검(?=$|[\s,.:;!?)]|을|이|으로|과|도|만|날|집|자루|끝)|칼(?=$|[\s,.:;!?)]|을|이|로|과|도|만|날|자루|끝)|주먹|때리|폭발|쾅|쿵)/u;
const QUOTED_DIALOGUE_PATTERN = /["“](.+?)["”]/u;
const SPEAKER_DIALOGUE_PATTERN = /^\s*([^:：\n(["“]{1,20})[:：]\s*(.+)$/u;
const PAREN_NARRATION_PATTERN = /\((?:나레이션|독백|해설|N)[:：]?\s*([^)]+)\)/u;
const BRACKET_DIRECTIVE_PATTERN = /\[([^\]]+)\]/gu;

function visualPromptSource(line: string): string {
  const withoutDialogue = line
    .replace(BRACKET_DIRECTIVE_PATTERN, "")
    .replace(PAREN_NARRATION_PATTERN, "")
    .replace(/["“][^"”]*["”]/gu, "")
    .replace(/^\s*[^:：\n]{1,20}[:：]\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
  return (withoutDialogue || "character reaction and visual acting").slice(0, 80);
}

/** 학습이 완료된 `StudioLoraTrainingJob`을 스토리보드 작가 그림체 바인딩으로 변환한다. */
export function bindLoraJobAsArtistStyle(
  job: Pick<
    StudioLoraTrainingJob,
    "id" | "characterLabel" | "triggerWord" | "loraFileUrl" | "styleTraits"
  >,
): StoryboardArtistStyleBinding {
  return Object.freeze({
    modelId: job.id,
    artistLabel: job.characterLabel,
    triggerWord: job.triggerWord,
    loraFileUrl: job.loraFileUrl,
    lineWeight: job.styleTraits?.lineWeight ?? "balanced",
    shadingMode: job.styleTraits?.shadingMode ?? "cel",
    paletteMood: job.styleTraits?.paletteMood ?? "vibrant",
  });
}

/** 간단한 스케치 입력에서 샷 스케일·카메라 앵글·구도 가이드를 결정적으로 추론한다. */
export function analyzeRoughSketchIntent(
  sketch: StoryboardRoughSketchInput,
): AnalyzedRoughSketchIntent {
  const preset = sketch.presetId
    ? STORYBOARD_ROUGH_SKETCH_PRESETS.find((item) => item.id === sketch.presetId) ?? null
    : null;

  let shotScale: StoryboardShotScale = preset?.shotScale ?? "medium-shot";
  let cameraAngle: StoryboardCameraAngle = preset?.cameraAngle ?? "eye-level";
  const guides: string[] = preset ? [preset.compositionGuide] : [];
  let reserveSpeechRatioBoost = 0;
  let panelHeightMultiplier = 1.0;

  const boxes = sketch.boxes ?? [];
  const subjectBoxes = boxes.filter((box) => !box.role || box.role === "subject");
  const speechBoxes = boxes.filter((box) => box.role === "speech-zone");
  const motionBoxes = boxes.filter((box) => box.role === "motion-line");

  if (!preset && subjectBoxes.length > 0) {
    const primary = subjectBoxes[0]!;
    const area = Math.max(0.01, Math.min(1, primary.width * primary.height));
    if (area >= 0.55) shotScale = "extreme-close-up";
    else if (area >= 0.32) shotScale = "close-up";
    else if (area >= 0.16) shotScale = "medium-shot";
    else if (area >= 0.07) shotScale = "full-shot";
    else shotScale = "long-shot";

    if (subjectBoxes.length >= 2) {
      guides.push("two-subject conversational balance");
    }
  }

  if (sketch.focalPoint) {
    const fy = Math.max(0, Math.min(1, sketch.focalPoint.y));
    const fx = Math.max(0, Math.min(1, sketch.focalPoint.x));
    if (!preset) {
      if (fy <= 0.3) cameraAngle = "low-angle";
      else if (fy >= 0.72) cameraAngle = "high-angle";
    }
    const horizontalZone = fx < 0.38 ? "left-third" : fx > 0.62 ? "right-third" : "center";
    const verticalZone = fy < 0.38 ? "upper-frame" : fy > 0.62 ? "lower-frame" : "mid-frame";
    guides.push(`focal anchor at ${horizontalZone} ${verticalZone}`);
  }

  const diagonal = sketch.dominantDiagonalDeg ?? (motionBoxes.length > 0 ? 35 : 0);
  if (diagonal >= 25) {
    cameraAngle = "dutch-tilt";
    panelHeightMultiplier = Math.max(panelHeightMultiplier, 1.25);
    guides.push(`dynamic diagonal flow (${Math.round(diagonal)}deg)`);
  }

  if (speechBoxes.length > 0) {
    reserveSpeechRatioBoost = Math.min(0.12, speechBoxes.length * 0.05);
    guides.push("dedicated upper speech bubble safe zone from sketch");
  }

  if (typeof sketch.strokeDensity === "number" && sketch.strokeDensity >= 0.7) {
    guides.push("high-density detailed background staging");
  }

  const note = sketch.sketchNote?.trim() ?? "";
  if (note) {
    guides.push(`sketch note: ${note.slice(0, 60)}`);
  }

  return Object.freeze({
    shotScale,
    cameraAngle,
    compositionGuide:
      guides.length > 0 ? guides.join(", ") : "sketch-guided single focal subject staging",
    reserveSpeechRatioBoost,
    panelHeightMultiplier,
    summaryHint: note || preset?.summary || "스케치 구도 기반 연출 컷",
  });
}

function parseExplicitDirectiveOverrides(line: string): {
  shotScale?: StoryboardShotScale;
  cameraAngle?: StoryboardCameraAngle;
} {
  let shotScale: StoryboardShotScale | undefined;
  let cameraAngle: StoryboardCameraAngle | undefined;
  const matches = [...line.matchAll(BRACKET_DIRECTIVE_PATTERN)].map((m) => m[1] ?? "").join(" ");
  if (!matches) return {};

  if (/익스트림\s*클로즈업|ECU|초근접/iu.test(matches)) shotScale = "extreme-close-up";
  else if (/클로즈업|CU|얼굴/iu.test(matches)) shotScale = "close-up";
  else if (/미디엄|바스트|MS/iu.test(matches)) shotScale = "medium-shot";
  else if (/풀\s*샷|전신|FS/iu.test(matches)) shotScale = "full-shot";
  else if (/롱\s*샷|와이드|원경|LS/iu.test(matches)) shotScale = "long-shot";
  else if (/버즈\s*아이|부감|조감/iu.test(matches)) shotScale = "birds-eye";
  else if (/웜즈\s*아이|앙각/iu.test(matches)) shotScale = "worms-eye";

  if (/로우\s*앵글|앙각/iu.test(matches)) cameraAngle = "low-angle";
  else if (/하이\s*앵글|부감/iu.test(matches)) cameraAngle = "high-angle";
  else if (/더치|사선|기울림/iu.test(matches)) cameraAngle = "dutch-tilt";
  else if (/아이\s*레벨|눈높이/iu.test(matches)) cameraAngle = "eye-level";

  return { shotScale, cameraAngle };
}

function inferBeatKind(
  cutNum: number,
  totalCuts: number,
  emotion: CharacterEmotionalTone,
  shotScale: StoryboardShotScale,
  hasDialogue: boolean,
  line: string,
): StudioStoryBeatKind {
  if (/장면\s*전환|잠시\s*후|다음\s*날|한편/u.test(line)) return "transition";
  if (emotion === "rage" || ACTION_PATTERN.test(line)) return "action";
  if (cutNum === totalCuts && totalCuts > 1) return "reveal";
  if (emotion === "shock" || shotScale === "extreme-close-up") return "reaction";
  if (hasDialogue) return "dialogue";
  if (cutNum === 1) return "setup";
  return "dialogue";
}

function buildCoachingTip(params: {
  readonly cutNum: number;
  readonly totalCuts: number;
  readonly shotScale: StoryboardShotScale;
  readonly cameraAngle: StoryboardCameraAngle;
  readonly emotion: CharacterEmotionalTone;
  readonly sketchApplied: boolean;
  readonly creatorLevel: "pro" | "aspiring";
}): string {
  const { cutNum, totalCuts, shotScale, cameraAngle, emotion, sketchApplied, creatorLevel } = params;
  const prefix = sketchApplied ? "[스케치 의도 반영] " : "";
  if (emotion === "rage") {
    return `${prefix}${shotScale}·${cameraAngle} 구도로 동세 에너지를 살리고, 컷 아래 스크롤 여백을 넓혀 타격의 여운을 남기세요.`;
  }
  if (emotion === "shock") {
    return `${prefix}시선이 동공과 표정에 즉시 꽂히도록 배경 디테일을 덜어내고 말풍선은 컷 상단 가장자리에 비켜 배치하세요.`;
  }
  if (cutNum === totalCuts && totalCuts > 1) {
    return `${prefix}회차/장면 마무리 훅 컷입니다. ${cameraAngle} 연출과 세로 긴 패널 호흡으로 다음 화 궁금증을 극대화하세요.`;
  }
  if (creatorLevel === "aspiring") {
    return `${prefix}입문 팁: ${shotScale}에서는 피사체 머리 위쪽 20%를 말풍선 안전 영역으로 비워 두면 모바일에서도 그림과 대사가 겹치지 않습니다.`;
  }
  return `${prefix}${shotScale} (${cameraAngle}) 호흡으로 인물 시선 방향과 다음 컷 스크롤 동선을 자연스럽게 연결하세요.`;
}

function buildArtistStyleCutPrompt(
  baseBackgroundPrompt: string,
  artistStyle: StoryboardArtistStyleBinding | null | undefined,
  compositionGuide: string,
): string {
  if (!artistStyle) return `${baseBackgroundPrompt}, ${compositionGuide}`;
  const trigger = artistStyle.triggerWord.trim();
  const traitTokens = describeStudioArtistStyleTraits({
    lineWeight: artistStyle.lineWeight ?? "balanced",
    shadingMode: artistStyle.shadingMode ?? "cel",
    paletteMood: artistStyle.paletteMood ?? "vibrant",
  });
  return [
    trigger,
    `artist style (${artistStyle.artistLabel})`,
    traitTokens,
    compositionGuide,
    baseBackgroundPrompt,
  ]
    .filter(Boolean)
    .join(", ");
}

export class StudioAiStoryboardDirector {
  public direct(
    scriptText: string,
    options: StoryboardDirectingOptions = {},
  ): StoryboardDirectingResult {
    const lines = scriptText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      if (options.defaultSketch) {
        return this.directFromSketchOnly(options.defaultSketch, options);
      }
      return {
        rawText: scriptText,
        cuts: [],
        totalCuts: 0,
        estimatedEpisodeReadingSec: 0,
        pacingScore: 100,
        appliedArtistStyle: options.artistStyle ?? null,
        sketchMatchedCutCount: 0,
        globalKWebtoonReadiness: {
          verticalScrollRhythmScore: 100,
          localizationSafeBubbleRatio: 1,
          summary: "대본 또는 간단한 스케치를 입력하면 글로벌 K-웹툰 연출 지표가 계산됩니다.",
        },
      };
    }

    const cuts: StoryboardCutPlan[] = [];
    let sketchMatchedCutCount = 0;
    lines.forEach((line, index) => {
      const cutSketch = options.sketches?.[index] ?? options.defaultSketch ?? null;
      if (cutSketch) sketchMatchedCutCount += 1;
      cuts.push(
        this.analyzeLineDirectives(line, index + 1, lines.length, cutSketch, options),
      );
    });

    const pacingScore = Math.min(100, Math.max(50, 95 - Math.abs(cuts.length - 8) * 3));
    const safeBubbleCuts = cuts.filter((c) => (c.reserveDialogueAreaRatio ?? 0.15) <= 0.36).length;
    const localizationSafeBubbleRatio = Number((safeBubbleCuts / cuts.length).toFixed(2));

    return {
      rawText: scriptText,
      cuts,
      totalCuts: cuts.length,
      estimatedEpisodeReadingSec: cuts.length * 6,
      pacingScore,
      appliedArtistStyle: options.artistStyle ?? null,
      sketchMatchedCutCount,
      globalKWebtoonReadiness: {
        verticalScrollRhythmScore: pacingScore,
        localizationSafeBubbleRatio,
        summary:
          localizationSafeBubbleRatio >= 0.85
            ? "모바일 세로 스크롤 호흡과 다국어 번역 말풍선 여유 공간이 모두 안정적입니다."
            : "일부 컷의 대사 밀도가 높습니다. 글로벌 번역(영어·스페인어)을 위해 대사를 두 컷으로 나누는 것을 권장합니다.",
      },
    };
  }

  /** 지문 없이 간단한 스케치만 주어졌을 때 스케치 구도와 메모에서 스토리보드를 생성한다. */
  public directFromSketchOnly(
    sketch: StoryboardRoughSketchInput,
    options: StoryboardDirectingOptions = {},
  ): StoryboardDirectingResult {
    const analyzed = analyzeRoughSketchIntent(sketch);
    const syntheticLine = sketch.sketchNote?.trim() || analyzed.summaryHint;
    return this.direct(syntheticLine, {
      ...options,
      defaultSketch: sketch,
    });
  }

  /** 디렉팅 결과를 `planStudioStoryboard` 및 작화 인계(F-3)와 호환되는 `StudioStoryBeat[]`로 변환한다. */
  public toStudioStoryBeats(
    result: StoryboardDirectingResult,
    options: { readonly episodeId?: string | null; readonly sceneId?: string } = {},
  ): readonly StudioStoryBeat[] {
    const sceneId = options.sceneId?.trim() || "directed-scene-1";
    const episodeId = options.episodeId?.trim() || null;
    return Object.freeze(
      result.cuts.map((cut, index): StudioStoryBeat =>
        Object.freeze({
          id: `directed-beat-${cut.cutNumber}`,
          sceneId,
          order: index,
          kind: cut.beatKind ?? "dialogue",
          summary: cut.stageDirection || cut.summary,
          dialogue: cut.dialogue ?? cut.narration ?? "",
          characterIds: cut.speaker ? Object.freeze([cut.speaker]) : Object.freeze(["protagonist"]),
          locationId: null,
          ...(episodeId ? { episodeId } : {}),
        }),
      ),
    );
  }

  /** 디렉팅 결과에서 즉시 `StudioStoryboardPlan`을 생성한다. */
  public toStudioStoryboardPlan(
    result: StoryboardDirectingResult,
    options: { readonly episodeId?: string | null; readonly sceneId?: string } = {},
  ): StudioStoryboardPlan {
    const beats = this.toStudioStoryBeats(result, options);
    return planStudioStoryboard(beats);
  }

  private analyzeLineDirectives(
    line: string,
    cutNum: number,
    totalCuts: number,
    sketch: StoryboardRoughSketchInput | null,
    options: StoryboardDirectingOptions,
  ): StoryboardCutPlan {
    let shotScale: StoryboardShotScale = "medium-shot";
    let cameraAngle: StoryboardCameraAngle = "eye-level";
    let emotion: CharacterEmotionalTone = "calm";
    let suggestedSfx: string | undefined;
    let heightRatio = 1.0;

    const narrationMatch = line.match(PAREN_NARRATION_PATTERN);
    const narration = narrationMatch?.[1]?.trim() || undefined;
    const quoteMatch = line.match(QUOTED_DIALOGUE_PATTERN);
    const speakerMatch = line.match(SPEAKER_DIALOGUE_PATTERN);
    const speaker = speakerMatch?.[1]?.trim() || undefined;
    const rawSpeakerDialogue = speakerMatch?.[2]?.trim().replace(/^["“]|["”]$/gu, "");
    const dialogue: string | undefined =
      quoteMatch?.[1]?.trim() || rawSpeakerDialogue;

    if (ACTION_PATTERN.test(line)) {
      shotScale = "full-shot";
      cameraAngle = "low-angle";
      emotion = "rage";
      suggestedSfx = "콰앙";
      heightRatio = 1.5;
    } else if (/눈빛|숨결|동공|입술|바라보|경악|놀라|충격/.test(line)) {
      shotScale = "extreme-close-up";
      emotion = "shock";
      suggestedSfx = "두근";
      heightRatio = 0.9;
    } else if (/눈물|울|슬픔|비탄|절망|주저앉/.test(line)) {
      shotScale = "close-up";
      cameraAngle = "high-angle";
      emotion = "sorrow";
      suggestedSfx = "주룩주룩";
      heightRatio = 1.2;
    } else if (/웃|미소|행복|기쁨|환호/.test(line)) {
      emotion = "joy";
    } else if (cutNum === totalCuts) {
      shotScale = "worms-eye";
      cameraAngle = "low-angle";
      emotion = "determination";
      suggestedSfx = "스윽";
      heightRatio = 1.8;
    }

    // 지문 내 명시적 연출 지시어([버즈아이], [하이앵글] 등)가 있으면 우선 적용
    const directiveOverrides = parseExplicitDirectiveOverrides(line);
    if (directiveOverrides.shotScale) shotScale = directiveOverrides.shotScale;
    if (directiveOverrides.cameraAngle) cameraAngle = directiveOverrides.cameraAngle;

    // 간단한 스케치(rough sketch)가 전달된 경우 스케치 구도 의도를 결합
    const sketchIntent = sketch ? analyzeRoughSketchIntent(sketch) : null;
    if (sketchIntent) {
      if (!directiveOverrides.shotScale) shotScale = sketchIntent.shotScale;
      if (!directiveOverrides.cameraAngle) cameraAngle = sketchIntent.cameraAngle;
      heightRatio = Number(
        Math.min(2.2, heightRatio * sketchIntent.panelHeightMultiplier).toFixed(2),
      );
    }

    const stageDirection = visualPromptSource(line);
    const beatKind = inferBeatKind(
      cutNum,
      totalCuts,
      emotion,
      shotScale,
      Boolean(dialogue),
      line,
    );
    const compositionGuide =
      sketchIntent?.compositionGuide ??
      (speaker ? "character-focused readable framing with upper bubble headroom" : "single focal subject webtoon staging");

    const localeBoost =
      options.targetLocale && options.targetLocale !== "ko" ? 0.04 : 0;
    const textLength = (dialogue?.length ?? 0) + (narration?.length ?? 0);
    const reserveDialogueAreaRatio = Number(
      Math.min(
        0.42,
        0.12 +
          (textLength > 0 ? 0.04 + textLength / 240 : 0) +
          (sketchIntent?.reserveSpeechRatioBoost ?? 0) +
          localeBoost,
      ).toFixed(2),
    );
    const scrollGapAfterPx =
      beatKind === "reveal" ? 180 : beatKind === "action" ? 60 : beatKind === "transition" ? 220 : 100;

    const backgroundPrompt = `Webtoon panel staging for ${stageDirection}, cinematic lighting, clean manhwa cel aesthetic, no speech bubbles, no readable text`;
    const artistStylePrompt = buildArtistStyleCutPrompt(
      backgroundPrompt,
      options.artistStyle,
      compositionGuide,
    );
    const creatorCoachingTip = buildCoachingTip({
      cutNum,
      totalCuts,
      shotScale,
      cameraAngle,
      emotion,
      sketchApplied: Boolean(sketchIntent),
      creatorLevel: options.creatorLevel ?? "aspiring",
    });

    return {
      cutNumber: cutNum,
      summary: line,
      dialogue,
      ...(narration ? { narration } : {}),
      ...(speaker ? { speaker } : {}),
      stageDirection,
      shotScale,
      cameraAngle,
      emotion,
      beatKind,
      suggestedSfx,
      backgroundPrompt,
      artistStylePrompt,
      artistLoraFileUrl: options.artistStyle?.loraFileUrl ?? null,
      compositionGuide,
      sketchIntentApplied: Boolean(sketchIntent),
      reserveDialogueAreaRatio,
      scrollGapAfterPx,
      creatorCoachingTip,
      panelHeightRatio: heightRatio,
    };
  }
}

