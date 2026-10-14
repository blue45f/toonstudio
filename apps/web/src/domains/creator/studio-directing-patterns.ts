/**
 * 연출 패턴 라이브러리 (REPORT C-2) — 장면 목적별 샷 시퀀스 템플릿.
 *
 * 템플릿은 '그림'이 아니라 '연출 문법' 단위다: 비트 종류(kind)의 순서만으로
 * 시퀀스를 정의하고, 샷 사이즈·카메라·간격·예상 높이는 기존 플래너
 * (planStudioStoryboard)가 kind에서 그대로 도출한다. 그래서 삽입된 비트는
 * 손으로 만든 비트와 데이터 모양이 완전히 같고, 삽입 후에는 일반 비트와
 * 동일하게 편집·삭제·재배열된다. 템플릿 출처를 비트에 남기지 않는 것도
 * 그 때문이다 — 출처 필드가 생기면 '템플릿 비트'라는 별도 상태가 된다.
 *
 * 요약(summary) 문안은 작가가 자기 이야기로 바꾸는 출발점(플레이스홀더)이다.
 * 대사(dialogue)는 비워 둔다: 지어낸 대사를 넣으면 작가가 지우는 일을 만든다.
 * 캐릭터는 호스트가 넘긴 characterIds를 dialogue/reaction 단계에만 붙인다
 * (플래너가 그 두 종류에 character-missing 경고를 내기 때문이다).
 */
import {
  planStudioStoryboard,
  type StudioShotSize,
  type StudioStoryBeat,
  type StudioStoryBeatKind,
  type StudioStoryboardPlan,
} from "./studio-storyboard-planner";

export type DirectingPatternId =
  | "confrontation-buildup"
  | "twist-reveal"
  | "flashback-entry"
  | "action-climax"
  | "emotional-confession"
  | "cliffhanger-ending";

export interface DirectingPatternStep {
  readonly kind: StudioStoryBeatKind;
  /** 작가가 자기 장면으로 바꿔 쓰는 요약 플레이스홀더. 비어 있을 수 없다(플래너 계약). */
  readonly summary: string;
  /** dialogue/reaction 단계에만 characterIds를 붙일지 여부. */
  readonly needsCharacters: boolean;
}

export interface DirectingPattern {
  readonly id: DirectingPatternId;
  /** 장면 목적 라벨 — 라이브러리 목록의 제목. */
  readonly purpose: string;
  readonly description: string;
  readonly steps: readonly DirectingPatternStep[];
}

function step(kind: StudioStoryBeatKind, summary: string): DirectingPatternStep {
  return Object.freeze({
    kind,
    summary,
    needsCharacters: kind === "dialogue" || kind === "reaction",
  });
}

export const DIRECTING_PATTERNS: readonly DirectingPattern[] = Object.freeze([
  Object.freeze({
    id: "confrontation-buildup",
    purpose: "대결 전 빌드업",
    description: "공간을 잡고, 두 인물을 마주 세운 뒤, 짧은 주고받음과 반응으로 긴장을 쌓아 첫 움직임 직전에서 끊는다.",
    steps: Object.freeze([
      step("setup", "대결이 벌어질 공간과 두 인물의 위치를 보여준다"),
      step("dialogue", "한쪽이 먼저 도발하거나 조건을 내건다"),
      step("reaction", "상대의 표정·손의 움직임으로 긴장이 올라간다"),
      step("dialogue", "짧게 받아치며 물러설 곳이 없음을 확인한다"),
      step("action", "첫 움직임이 시작되는 순간에서 끊는다"),
    ]),
  }),
  Object.freeze({
    id: "twist-reveal",
    purpose: "반전 공개",
    description: "평소와 같은 장면으로 안심시킨 뒤, 단서를 클로즈업하고, 공개와 반응을 분리해 충격이 머물 시간을 만든다.",
    steps: Object.freeze([
      step("setup", "반전 전, 평소와 다름없는 상황을 보여준다"),
      step("dialogue", "인물이 의심이나 단서를 무심코 언급한다"),
      step("reveal", "숨겨져 있던 사실·물건이 드러난다"),
      step("reaction", "인물의 반응만으로 여운을 남긴다"),
    ]),
  }),
  Object.freeze({
    id: "flashback-entry",
    purpose: "회상 진입",
    description: "현재의 사물·장소를 다리로 삼아 과거로 넘어가고, 과거를 한 장면 보여준 뒤 현재로 돌아온다.",
    steps: Object.freeze([
      step("transition", "현재 장면의 사물·장소에 시선이 머문다"),
      step("setup", "과거의 같은 장소·인물을 보여준다"),
      step("dialogue", "과거의 결정적인 한마디가 오간다"),
      step("transition", "현재로 돌아와 인물의 표정이 달라져 있다"),
    ]),
  }),
  Object.freeze({
    id: "action-climax",
    purpose: "액션 클라이맥스",
    description: "넓게 잡은 움직임, 반응으로 쉬는 한 박자, 결정타, 그리고 결과를 넓게 확인하는 순서로 속도를 조절한다.",
    steps: Object.freeze([
      step("setup", "전투 공간과 양쪽의 거리를 보여준다"),
      step("action", "빠른 공격이 오간다"),
      step("reaction", "맞은 쪽·보는 쪽의 반응으로 한 박자 쉰다"),
      step("action", "결정적인 일격이 들어간다"),
      step("reveal", "결정타의 결과·정체가 드러난다"),
      step("transition", "전투 후 공간을 넓게 보여주며 숨을 고른다"),
    ]),
  }),
  Object.freeze({
    id: "emotional-confession",
    purpose: "감정 고백·대치",
    description: "일상의 대화에서 시작해 망설임을 반응 컷으로 보여주고, 고백 뒤에는 침묵에 가까운 반응으로 받는다.",
    steps: Object.freeze([
      step("setup", "두 인물이 함께 있는 일상적인 공간을 보여준다"),
      step("dialogue", "가벼운 대화로 시작하지만 핵심을 피한다"),
      step("reaction", "말을 꺼내기 전의 망설임이 보인다"),
      step("dialogue", "숨겨온 감정·사실을 꺼낸다"),
      step("reaction", "듣는 쪽의 반응으로 장면을 닫는다"),
    ]),
  }),
  Object.freeze({
    id: "cliffhanger-ending",
    purpose: "회차 끝 훅",
    description: "회차 마지막 장면 전용. 안도할 틈에 새 위협·인물을 등장시켜 다음 화의 첫 장면이 받을 질문을 남긴다.",
    steps: Object.freeze([
      step("setup", "일이 마무리된 듯한 공간을 보여준다"),
      step("reveal", "새로운 위협·인물·사실이 모습을 드러낸다"),
      step("reaction", "인물의 놀란 반응에서 회차를 끊는다"),
    ]),
  }),
]);

export function getDirectingPattern(patternId: DirectingPatternId): DirectingPattern {
  const pattern = DIRECTING_PATTERNS.find((entry) => entry.id === patternId);
  if (!pattern) throw new Error(`Unknown directing pattern: ${patternId}`);
  return pattern;
}

export interface BuildPatternBeatsOptions {
  readonly sceneId: string;
  /** 삽입된 첫 비트의 order. 기존 비트 뒤에 붙일 때는 마지막 order + 1. */
  readonly startOrder: number;
  /** 비트 id 접두사. 기본 "beat". 영숫자·하이픈·언더스코어만 허용한다. */
  readonly idPrefix?: string;
  readonly characterIds?: readonly string[];
  readonly locationId?: string | null;
}

function resolveIdPrefix(raw: string | undefined): string {
  const prefix = (raw ?? "beat").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(prefix)) {
    throw new Error("Directing pattern id prefix must use letters, digits, '-' or '_'.");
  }
  return prefix;
}

/**
 * 패턴을 실제 비트 배열로 인스턴스화한다. 반환 비트는 플래너 계약
 * (id·sceneId·summary 비어 있지 않음, order 정수)을 그대로 만족한다.
 */
export function buildDirectingPatternBeats(
  patternId: DirectingPatternId,
  options: BuildPatternBeatsOptions,
): StudioStoryBeat[] {
  const pattern = getDirectingPattern(patternId);
  const sceneId = options.sceneId.trim();
  if (!sceneId) throw new Error("Directing pattern insertion requires a scene id.");
  if (!Number.isSafeInteger(options.startOrder) || options.startOrder < 0) {
    throw new Error("Directing pattern start order must be a non-negative integer.");
  }
  const prefix = resolveIdPrefix(options.idPrefix);
  const characterIds = options.characterIds ?? [];
  return pattern.steps.map((entry, index) => Object.freeze({
    id: `${prefix}-${pattern.id}-${index + 1}`,
    sceneId,
    order: options.startOrder + index,
    kind: entry.kind,
    summary: entry.summary,
    dialogue: "",
    characterIds: entry.needsCharacters ? characterIds : [],
    locationId: options.locationId ?? null,
  }));
}

export interface InsertPatternOptions extends BuildPatternBeatsOptions {
  /**
   * 이 order를 가진 비트 바로 뒤에 삽입한다. null/미지정이면 맨 뒤에 붙인다.
   * 뒤 비트들의 order는 패턴 길이만큼 밀려 전체 순서는 그대로 유지된다.
   */
  readonly afterOrder?: number | null;
}

/**
 * 기존 비트 배열에 패턴을 삽입한 새 배열을 돌려준다(원본 불변).
 * id가 기존 비트와 겹치면 접미사(-2, -3…)를 붙여 유일성을 보장한다 —
 * 같은 패턴을 두 번 삽입하는 것이 정상 사용법이기 때문이다.
 * 결과는 planStudioStoryboard에 그대로 넣을 수 있어야 한다(테스트로 고정).
 */
export function insertDirectingPattern(
  existingBeats: readonly StudioStoryBeat[],
  patternId: DirectingPatternId,
  options: InsertPatternOptions,
): StudioStoryBeat[] {
  const sorted = [...existingBeats].sort((left, right) => left.order - right.order);
  const pattern = getDirectingPattern(patternId);
  const count = pattern.steps.length;

  let insertOrder: number;
  if (options.afterOrder === null || options.afterOrder === undefined) {
    const last = sorted[sorted.length - 1];
    insertOrder = last ? last.order + 1 : options.startOrder;
    if (last && options.startOrder > last.order + 1) insertOrder = options.startOrder;
  } else {
    if (!sorted.some((beat) => beat.order === options.afterOrder)) {
      throw new Error(`No story beat with order ${options.afterOrder} to insert after.`);
    }
    insertOrder = options.afterOrder + 1;
  }

  const shifted = sorted.map((beat) => (
    beat.order >= insertOrder ? Object.freeze({ ...beat, order: beat.order + count }) : beat
  ));

  const usedIds = new Set(shifted.map((beat) => beat.id));
  const fresh = buildDirectingPatternBeats(patternId, {
    sceneId: options.sceneId,
    startOrder: insertOrder,
    idPrefix: options.idPrefix,
    characterIds: options.characterIds,
    locationId: options.locationId,
  }).map((beat) => {
    if (!usedIds.has(beat.id)) {
      usedIds.add(beat.id);
      return beat;
    }
    let suffix = 2;
    while (usedIds.has(`${beat.id}-${suffix}`)) suffix += 1;
    const renamed = Object.freeze({ ...beat, id: `${beat.id}-${suffix}` });
    usedIds.add(renamed.id);
    return renamed;
  });

  return [...shifted, ...fresh].sort((left, right) => left.order - right.order);
}

/**
 * 패턴 미리보기 — 플레이스홀더 장면으로 플래너를 실제로 돌려
 * 샷 사이즈 시퀀스·예상 높이를 라이브러리에 표시한다. 별도 계산식을
 * 만들지 않으므로 미리보기와 실제 삽입 결과가 어긋날 수 없다.
 */
export function previewDirectingPattern(patternId: DirectingPatternId): StudioStoryboardPlan {
  const beats = buildDirectingPatternBeats(patternId, { sceneId: "pattern-preview", startOrder: 0 });
  return planStudioStoryboard(beats);
}

export const DIRECTING_BEAT_KIND_LABELS: Readonly<Record<StudioStoryBeatKind, string>> = {
  setup: "상황 설정",
  dialogue: "대사",
  action: "액션",
  reaction: "반응",
  reveal: "공개",
  transition: "전환",
};

export const DIRECTING_SHOT_SIZE_LABELS: Readonly<Record<StudioShotSize, string>> = {
  "extreme-wide": "익스트림 와이드",
  wide: "와이드",
  medium: "미디엄",
  "close-up": "클로즈업",
  "extreme-close-up": "익스트림 클로즈업",
};
