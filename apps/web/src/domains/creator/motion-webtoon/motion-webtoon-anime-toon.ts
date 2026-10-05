/**
 * 애니툰 원클릭 변환 — 저장된 웹툰 회차를 골라 모션 초안을 자동 생성하는 동선의 순수 코어.
 *
 * 지니어스 애니툰의 "작품 선택 → 컷 미리보기 → AI 자동 생성 → 정보 확인" 문법을
 * toonstudio의 기존 재료로 옮긴 것이다. 자동 생성의 실체는 규칙 기반 AI 디렉터
 * (`autoDirectEpisode`)이며 클라우드 AI 생성이 아니다 — 문구도 그에 맞춘다.
 *
 * 원본 회차는 바꾸지 않는다. 변환 결과는 새 ID의 복제본(초안)이고,
 * 저장·열기는 스토리지/페이지가 맡는다. 이 파일은 상태 전이와 변환만 담당한다.
 */

import {
  dominantCutEmotion,
  emotionToVoicePreset,
  autoDirectEpisode,
} from "./motion-webtoon-ai-director";
import {
  buildCaptionTrack,
  type CaptionTrack,
} from "./motion-webtoon-captions";
import {
  createMotionId,
  episodeDurationSeconds,
  type MotionCharacter,
  type MotionEpisode,
} from "./motion-webtoon-model";

/** 변환 위저드 단계. */
export type AnimeToonStep = "select" | "preview" | "result";

/** 변환 실패 사유 — 흉내 내지 않고 사용자에게 그대로 안내한다. */
export type AnimeToonFailureReason = "no-cuts" | "storage-save-failed";

/** 변환 결과 요약 — 자동 적용된 것과 수동으로 남은 것을 구분해 보여 준다. */
export interface AnimeToonDraftSummary {
  readonly cutCount: number;
  /** 대사가 있는 컷 수. */
  readonly cutsWithDialogue: number;
  /** 자동 생성된 자막 큐 수 — 0이면 자막이 없다는 뜻이다. */
  readonly captionCueCount: number;
  /** 컷 범위를 벗어나거나 비어 자막에서 빠진 대사 수. */
  readonly skippedCaptionCount: number;
  /** 감정 분석으로 음성 프리셋이 바뀐 캐릭터 수. */
  readonly voicePresetAppliedCount: number;
  readonly totalDurationSeconds: number;
}

/** 위저드 상태. */
export interface AnimeToonWizardState {
  readonly step: AnimeToonStep;
  /** 선택한 원본 회차. result 단계에서는 변환된 초안이 들어간다. */
  readonly source: MotionEpisode | null;
  /** result 단계의 초안 제목 (사용자가 고칠 수 있다). */
  readonly draftTitleKo: string;
  /** 자동 생성된 초안. */
  readonly draft: MotionEpisode | null;
  readonly summary: AnimeToonDraftSummary | null;
  /** 변환이 실패했으면 사유, 아니면 null. */
  readonly failure: AnimeToonFailureReason | null;
}

export function createAnimeToonWizardState(): AnimeToonWizardState {
  return {
    step: "select",
    source: null,
    draftTitleKo: "",
    draft: null,
    summary: null,
    failure: null,
  };
}

/**
 * 캐릭터별 대표 감정으로 음성 프리셋을 맞춘다.
 * 대사가 없는 캐릭터와, 대사가 전부 중립 감정인 캐릭터는 프리셋을 건드리지 않는다 —
 * 근거 없는 변경을 만들지 않기 위해서다. 바뀐 캐릭터 수를 함께 돌려준다.
 */
export function applyCharacterVoicePresets(episode: MotionEpisode): {
  readonly episode: MotionEpisode;
  readonly changedCount: number;
} {
  let changedCount = 0;
  const characters: MotionCharacter[] = episode.characters.map((character) => {
    const ownCuts = episode.cuts
      .map((cut) => ({
        dialogues: cut.dialogues.filter((dialogue) => dialogue.characterId === character.id),
      }))
      .filter((cut) => cut.dialogues.length > 0);
    if (ownCuts.length === 0) return character;
    // 캐릭터가 등장하는 컷들의 대표 감정 중 가장 강한 것을 그 캐릭터의 감정으로 본다.
    let emotion = dominantCutEmotion(ownCuts[0] ?? { dialogues: [] });
    for (const cut of ownCuts.slice(1)) {
      const candidate = dominantCutEmotion(cut);
      if (emotionPriority(candidate) < emotionPriority(emotion)) emotion = candidate;
    }
    if (emotion === "neutral") return character;
    const presetId = emotionToVoicePreset(emotion);
    if (presetId === character.presetId) return character;
    changedCount += 1;
    return { ...character, presetId };
  });
  if (changedCount === 0) return { episode, changedCount };
  return { episode: { ...episode, characters }, changedCount };
}

const EMOTION_STRENGTH_ORDER = [
  "fear",
  "anger",
  "tension",
  "sorrow",
  "surprise",
  "romance",
  "joy",
  "neutral",
] as const;

function emotionPriority(emotion: string): number {
  const index = (EMOTION_STRENGTH_ORDER as readonly string[]).indexOf(emotion);
  return index === -1 ? EMOTION_STRENGTH_ORDER.length : index;
}

/** 초안 기본 제목 — 원본 제목에 "애니툰"을 붙인다. 이미 붙어 있으면 그대로 둔다. */
export function suggestAnimeToonTitle(source: MotionEpisode): string {
  const base = source.titleKo.trim();
  if (!base) return "애니툰";
  return base.endsWith("애니툰") ? base : `${base} 애니툰`;
}

/** 변환 결과 요약. 자막 트랙은 병합된 자막 코어(buildCaptionTrack)로 그대로 센다. */
export function summarizeAnimeToonDraft(
  draft: MotionEpisode,
  voicePresetAppliedCount: number,
): AnimeToonDraftSummary {
  const track: CaptionTrack = buildCaptionTrack(draft);
  return {
    cutCount: draft.cuts.length,
    cutsWithDialogue: draft.cuts.filter((cut) => cut.dialogues.length > 0).length,
    captionCueCount: track.cues.length,
    skippedCaptionCount: track.skippedDialogueCount,
    voicePresetAppliedCount,
    totalDurationSeconds: episodeDurationSeconds(draft),
  };
}

/**
 * 원본 회차 → 애니툰 초안.
 * AI 디렉터 연출 + 캐릭터 음성 프리셋을 적용한 새 회차 복제본을 만든다.
 * 컷이 없는 회차는 변환할 수 없어 실패로 돌려준다.
 */
export function buildAnimeToonDraft(
  source: MotionEpisode,
  options?: { readonly titleKo?: string; readonly random?: () => number },
): { readonly draft: MotionEpisode; readonly summary: AnimeToonDraftSummary } | { readonly failure: "no-cuts" } {
  if (source.cuts.length === 0) return { failure: "no-cuts" };
  const random = options?.random;
  const directed = autoDirectEpisode(source);
  const voiced = applyCharacterVoicePresets(directed);
  const titleKo = (options?.titleKo ?? suggestAnimeToonTitle(source)).trim();
  const draft: MotionEpisode = {
    ...voiced.episode,
    id: createMotionId("episode", random),
    titleKo: titleKo || suggestAnimeToonTitle(source),
    // 컷·대사·캐릭터 ID는 원본과 겹치면 자막 큐 키·공유 해시가 섞이므로 전부 새로 발급한다.
    characters: voiced.episode.characters.map((character) => ({
      ...character,
      id: createMotionId("char", random),
    })),
    cuts: [],
  };
  const characterIdMap = new Map(
    voiced.episode.characters.map((character, index) => [character.id, draft.characters[index]?.id ?? character.id]),
  );
  const cuts = voiced.episode.cuts.map((cut) => ({
    ...cut,
    id: createMotionId("cut", random),
    dialogues: cut.dialogues.map((dialogue) => ({
      ...dialogue,
      id: createMotionId("dlg", random),
      characterId: characterIdMap.get(dialogue.characterId) ?? dialogue.characterId,
    })),
  }));
  const finalDraft: MotionEpisode = { ...draft, cuts };
  return { draft: finalDraft, summary: summarizeAnimeToonDraft(finalDraft, voiced.changedCount) };
}

/** 1단계 → 2단계: 작품을 고르면 컷 미리보기로 넘어간다. */
export function selectAnimeToonSource(
  state: AnimeToonWizardState,
  source: MotionEpisode,
): AnimeToonWizardState {
  return {
    ...createAnimeToonWizardState(),
    step: "preview",
    source,
    draftTitleKo: suggestAnimeToonTitle(source),
  };
}

/** 단계 되돌리기. 결과 단계에서는 초안을 버리고 미리보기로 돌아간다. */
export function backAnimeToonStep(state: AnimeToonWizardState): AnimeToonWizardState {
  if (state.step === "result") {
    return { ...state, step: "preview", draft: null, summary: null, failure: null };
  }
  if (state.step === "preview") return createAnimeToonWizardState();
  return state;
}

/** 2단계 → 3단계: 자동 생성을 실행한다. 컷이 없으면 실패 상태로 남는다. */
export function generateAnimeToonDraft(
  state: AnimeToonWizardState,
  options?: { readonly random?: () => number },
): AnimeToonWizardState {
  if (state.step !== "preview" || !state.source) return state;
  const result = buildAnimeToonDraft(state.source, {
    titleKo: state.draftTitleKo,
    random: options?.random,
  });
  if ("failure" in result) {
    return { ...state, failure: result.failure };
  }
  return {
    ...state,
    step: "result",
    draft: result.draft,
    summary: result.summary,
    failure: null,
  };
}

/** 결과 단계에서 초안 제목을 고친다 — 저장될 회차에 반영된다. */
export function renameAnimeToonDraft(
  state: AnimeToonWizardState,
  titleKo: string,
): AnimeToonWizardState {
  if (!state.draft) return { ...state, draftTitleKo: titleKo };
  return {
    ...state,
    draftTitleKo: titleKo,
    draft: { ...state.draft, titleKo },
  };
}
