/**
 * Scene-context pose suggestion engine.
 *
 * 투닝 플러스 3D Studio의 "포즈 추천"을 흡수한 연결 모듈: 포즈 프리셋 자체는 이미
 * 풍부하지만(고급 라이브러리·마네킹 프리셋), 장면 맥락(대사 감정·장면 설명·인원·성별)으로
 * "지금 이 컷에 맞는 포즈"를 골라주는 층이 없었다. 이 모듈은 결정적·로컬 전용으로
 * 카탈로그 메타데이터를 채점해 추천과 그 근거를 함께 반환한다 — 작가가 제안을
 * 판단할 수 있게 근거 없는 원샷 추천을 하지 않는다(감정 매처와 같은 원칙).
 *
 * 카탈로그 항목 타입은 `studio-3d-advanced-poses-library`의
 * CharacterFullBodyPosePreset 메타 부분집합과 구조적으로 호환된다.
 */

export const STUDIO_POSE_SUGGESTION_VERSION = 1 as const;

/** 감정 매처(studio-ai-emotion-bubble-matcher)의 SpeechEmotionKind와 같은 어휘. */
export type PoseSuggestionEmotion =
  | "rage-shout"
  | "shock-gasp"
  | "whisper-secret"
  | "thought-monologue"
  | "romance-blush"
  | "neutral-calm";

export type PoseSuggestionCategory = "action" | "daily" | "dramatic" | "emotion";

export interface PoseCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly category: PoseSuggestionCategory;
  readonly gender: "any" | "male" | "female";
  readonly figures: 1 | 2;
  readonly tags: readonly string[];
  readonly description: string;
}

export interface PoseSuggestionContext {
  /** 컷의 대사 (감정 신호·키워드 추출용). */
  readonly dialogue?: string;
  /** 감정 매처가 판정한 감정. 없으면 dialogue에서 약식 판정한다. */
  readonly emotion?: PoseSuggestionEmotion;
  /** 장면 설명 자유 텍스트 (콘티 메모 등). */
  readonly sceneDescription?: string;
  readonly figures?: 1 | 2;
  readonly gender?: "male" | "female";
  /** 추천 개수 상한 (기본 3). */
  readonly limit?: number;
}

export type PoseSuggestionReasonCode =
  | "emotion-match"
  | "keyword-match"
  | "category-match"
  | "figure-match";

export interface PoseSuggestion {
  readonly presetId: string;
  readonly name: string;
  /** 0..100 결정적 점수. */
  readonly score: number;
  readonly reasons: readonly PoseSuggestionReasonCode[];
  /** keyword-match일 때 실제로 맞은 태그들. */
  readonly matchedTags: readonly string[];
}

export interface PoseSuggestionResult {
  readonly version: typeof STUDIO_POSE_SUGGESTION_VERSION;
  readonly resolvedEmotion: PoseSuggestionEmotion | null;
  readonly suggestions: readonly PoseSuggestion[];
}

/**
 * 감정 → 포즈 친화도. 실재 프리셋 id(고급 라이브러리)를 직접 겨냥하고,
 * 없는 id는 무시되므로 카탈로그가 달라도 안전하다.
 */
const EMOTION_PRESET_AFFINITY: Readonly<
  Record<PoseSuggestionEmotion, readonly string[]>
> = Object.freeze({
  "rage-shout": Object.freeze([
    "action-sword-slash",
    "action-dynamic-jump-kick",
    "action-magic-burst",
    "dramatic-wall-slam-kabe-don",
  ]),
  "shock-gasp": Object.freeze([
    "dramatic-shock-stepback",
    "dramatic-kneeling-despair",
  ]),
  "whisper-secret": Object.freeze([
    "daily-phone-call",
    "daily-sitting-chair",
  ]),
  "thought-monologue": Object.freeze([
    "daily-sitting-chair",
    "daily-standing-casual",
  ]),
  "romance-blush": Object.freeze([
    "dramatic-romantic-hug",
    "dramatic-wall-slam-kabe-don",
    "daily-coffee-sip",
  ]),
  "neutral-calm": Object.freeze([
    "daily-standing-casual",
    "daily-coffee-sip",
    "daily-phone-call",
  ]),
});

/** 감정 → 어울리는 카테고리 (친화 프리셋이 카탈로그에 없을 때의 폴백 축). */
const EMOTION_CATEGORY_AFFINITY: Readonly<
  Record<PoseSuggestionEmotion, readonly PoseSuggestionCategory[]>
> = Object.freeze({
  "rage-shout": Object.freeze(["action", "dramatic"] as const),
  "shock-gasp": Object.freeze(["dramatic", "emotion"] as const),
  "whisper-secret": Object.freeze(["daily", "emotion"] as const),
  "thought-monologue": Object.freeze(["daily", "emotion"] as const),
  "romance-blush": Object.freeze(["dramatic", "emotion"] as const),
  "neutral-calm": Object.freeze(["daily"] as const),
});

/** 대사만 있을 때의 약식 감정 판정 (감정 매처를 못 쓰는 표면용 최소 신호). */
function inferEmotionFromDialogue(dialogue: string): PoseSuggestionEmotion | null {
  const text = dialogue.trim();
  if (!text) return null;
  if (/[!！]{2,}|소리|외치|비명/u.test(text)) return "rage-shout";
  // 충격 신호가 말줄임표보다 강하다 — "뭐…? 말도 안 돼!"의 …를 속삭임으로 오판하지 않는다.
  if (/[?？].*[!！]|말도 안|어떻게|믿을 수 없/u.test(text)) return "shock-gasp";
  if (/\.{3,}|…|속삭|쉿/u.test(text)) return "whisper-secret";
  if (/좋아|사랑|설레|두근/u.test(text)) return "romance-blush";
  if (/생각|역시|그때/u.test(text)) return "thought-monologue";
  return "neutral-calm";
}

function tokenize(text: string): readonly string[] {
  return Object.freeze(
    text
      .toLowerCase()
      .split(/[\s,。、·/()[\]"']+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

/**
 * 장면 맥락으로 포즈를 추천한다. 순수·결정적이며, 카탈로그가 비면 빈 결과를,
 * 인원 조건이 명시되면 그 인원과 다른 프리셋은 제외한다(fail-closed).
 */
export function suggestStudioPoses(
  catalog: readonly PoseCatalogEntry[],
  context: PoseSuggestionContext,
): PoseSuggestionResult {
  const limit = Math.max(1, Math.min(8, context.limit ?? 3));
  const emotion: PoseSuggestionEmotion | null =
    context.emotion ??
    (context.dialogue ? inferEmotionFromDialogue(context.dialogue) : null);

  const contextTokens = new Set<string>([
    ...tokenize(context.sceneDescription ?? ""),
    ...tokenize(context.dialogue ?? ""),
  ]);

  const affinityIds = emotion ? EMOTION_PRESET_AFFINITY[emotion] : [];
  const affinityCategories = emotion
    ? EMOTION_CATEGORY_AFFINITY[emotion]
    : [];

  const scored: PoseSuggestion[] = [];
  for (const entry of catalog) {
    if (context.figures !== undefined && entry.figures !== context.figures) {
      continue;
    }
    if (
      context.gender !== undefined &&
      entry.gender !== "any" &&
      entry.gender !== context.gender
    ) {
      continue;
    }

    let score = 0;
    const reasons: PoseSuggestionReasonCode[] = [];
    const matchedTags: string[] = [];

    const affinityRank = affinityIds.indexOf(entry.id);
    if (affinityRank >= 0) {
      score += 60 - affinityRank * 5;
      reasons.push("emotion-match");
    } else if (affinityCategories.includes(entry.category)) {
      score += 25;
      reasons.push("category-match");
    }

    for (const tag of entry.tags) {
      const normalized = tag.toLowerCase();
      for (const token of contextTokens) {
        if (normalized.includes(token) || token.includes(normalized)) {
          matchedTags.push(tag);
          break;
        }
      }
    }
    if (matchedTags.length > 0) {
      score += Math.min(30, matchedTags.length * 10);
      reasons.push("keyword-match");
    }

    if (context.figures !== undefined) {
      reasons.push("figure-match");
      score += 5;
    }

    if (score <= 0) continue;
    scored.push(
      Object.freeze({
        presetId: entry.id,
        name: entry.name,
        score: Math.min(100, score),
        reasons: Object.freeze(reasons),
        matchedTags: Object.freeze(matchedTags),
      }),
    );
  }

  scored.sort((a, b) => b.score - a.score || a.presetId.localeCompare(b.presetId));

  return Object.freeze({
    version: STUDIO_POSE_SUGGESTION_VERSION,
    resolvedEmotion: emotion,
    suggestions: Object.freeze(scored.slice(0, limit)),
  });
}

/** 추천 근거 코드의 이중언어 라벨 (패널 표시용). */
export const POSE_SUGGESTION_REASON_LABELS: Readonly<
  Record<PoseSuggestionReasonCode, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "emotion-match": Object.freeze({ ko: "대사 감정과 어울려요", en: "Matches the line's emotion" }),
  "keyword-match": Object.freeze({ ko: "장면 설명 키워드와 맞아요", en: "Matches scene keywords" }),
  "category-match": Object.freeze({ ko: "장면 분위기 카테고리예요", en: "Fits the scene mood category" }),
  "figure-match": Object.freeze({ ko: "필요한 인원수와 맞아요", en: "Matches the figure count" }),
});
