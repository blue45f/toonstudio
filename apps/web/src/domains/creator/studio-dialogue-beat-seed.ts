/**
 * Studio Dialogue Beat Seed — 콘티 비트 대사를 식자 대사 초기값으로 인계(대사 단일 원천).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * 대사가 두 곳에서 태어났다: 콘티 비트(StudioStoryBeat.dialogue)에 쓴 대사와,
 * 식자에서 말풍선에 다시 입력하는 "캔버스 대사"가 별개 원천이라 콘티에서 확정한
 * 대사를 식자에서 처음부터 다시 쳐야 했다(흐름 진단 작화→식자 단절).
 *
 * 이 모듈이 추가하는 것:
 *  · 비트 목록을 순서대로 읽어, 대사가 있는 비트만 골라 식자 삽입 경로
 *    (studio-dialogue)의 입력 형태 — 대사 라인(DialogueLine)과 붙여넣기용
 *    스크립트 문자열 — 로 한 번에 도출한다. 비트가 대사의 단일 원천이 된다.
 *  · 화자는 비트의 첫 등장인물(characterIds[0])을 화자 이름표로 해석한다.
 *    이름표를 못 찾으면 화자 미지정으로 두고, 좌/우 배치는 삽입 경로의 파서와
 *    같은 규칙(화자별 고정·미지정은 번갈아)으로 미리 계산해 둔다 — 스크립트로
 *    넣든 라인으로 넣든 같은 배치가 된다.
 *  · 대사를 지어내지 않는다: 비트 dialogue가 비어 있으면 그 비트는 건너뛰고
 *    skippedBeatIds로 보고한다. 요약(summary)을 대사로 승격하지도 않는다.
 *
 * 규칙(studio-dialogue·studio-storyboard-planner와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 입력 배열/객체는 변형하지 않는다.
 *  - 비트 id 중복은 플래너와 같은 계약 위반으로 throw한다.
 */

import {
  layoutDialogueBubbles,
  type DialogueBubbleSeed,
  type DialogueLayoutOptions,
  type DialogueLine,
  type DialogueSide,
} from "./studio-dialogue";
import type { StudioStoryBeat } from "./studio-storyboard-planner";

/** 비트 1개에서 나온 대사 라인 — 어느 비트가 원천인지 항상 들고 다닌다. */
export interface BeatDialogueLine extends DialogueLine {
  readonly beatId: string;
  /** 비트의 원래 order(정렬 기준이었던 값). */
  readonly beatOrder: number;
}

export interface DialogueSeedFromBeats {
  /** 대사 스크립트 붙여넣기 경로(parseDialogueScript)에 그대로 넣을 수 있는 문자열. 대사가 없으면 "". */
  readonly script: string;
  readonly lines: readonly BeatDialogueLine[];
  /** 대사가 있어 인계된 비트 id(비트 순서대로). */
  readonly seededBeatIds: readonly string[];
  /** dialogue가 비어 있어 건너뛴 비트 id(비트 순서대로). */
  readonly skippedBeatIds: readonly string[];
  readonly hasSeed: boolean;
}

export interface DialogueSeedFromBeatsOptions {
  /** characterId → 화자 이름표. 없거나 빈 이름이면 화자 미지정으로 인계한다. */
  readonly speakerNames?: Readonly<Record<string, string>>;
}

/** 스크립트 문법의 화자로 쓸 수 있는 이름인지 — 콜론·개행이 있으면 문법이 깨진다. */
function usableSpeakerName(raw: string | undefined): string {
  if (!raw) return "";
  const name = raw.trim();
  if (!name || name.length > 16 || /[:：\r\n]/.test(name)) return "";
  return name;
}

/**
 * 비트 대사를 식자 초기값으로 도출한다.
 * 정렬은 비트 order 오름차순(플래너와 동일). 한 비트의 대사에 줄바꿈이 있으면
 * 줄마다 별도 라인으로 나눈다(말풍선 하나에 한 호흡이 기본 단위라서다).
 */
export function deriveDialogueSeedFromBeats(
  beats: readonly StudioStoryBeat[],
  options: DialogueSeedFromBeatsOptions = {},
): DialogueSeedFromBeats {
  const ids = beats.map((beat) => beat.id);
  if (new Set(ids).size !== ids.length) throw new Error("Story beat ids must be unique.");

  const ordered = [...beats].sort((left, right) => left.order - right.order);
  const lines: BeatDialogueLine[] = [];
  const seededBeatIds: string[] = [];
  const skippedBeatIds: string[] = [];

  // 좌/우 배치 — studio-dialogue의 parseDialogueScript와 같은 규칙을 구조화 입력에 적용한다.
  const sideBySpeaker = new Map<string, DialogueSide>();
  let nextSpeakerSide: DialogueSide = "left";
  let lastSide: DialogueSide = "right";

  for (const beat of ordered) {
    const firstCharacterId = beat.characterIds[0];
    const speaker = usableSpeakerName(
      firstCharacterId ? options.speakerNames?.[firstCharacterId] : undefined,
    );
    const texts = beat.dialogue
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (texts.length === 0) {
      skippedBeatIds.push(beat.id);
      continue;
    }
    seededBeatIds.push(beat.id);
    for (const text of texts) {
      let side: DialogueSide;
      if (speaker) {
        const known = sideBySpeaker.get(speaker);
        if (known) {
          side = known;
        } else {
          side = nextSpeakerSide;
          sideBySpeaker.set(speaker, side);
          nextSpeakerSide = side === "left" ? "right" : "left";
        }
        lastSide = side;
      } else {
        side = lastSide === "left" ? "right" : "left";
        lastSide = side;
      }
      lines.push(Object.freeze({
        speaker,
        text,
        kind: "speech" as const,
        side,
        beatId: beat.id,
        beatOrder: beat.order,
      }));
    }
  }

  const script = lines
    .map((line) => (line.speaker ? `${line.speaker}: ${line.text}` : line.text))
    .join("\n");

  return Object.freeze({
    script,
    lines: Object.freeze(lines),
    seededBeatIds: Object.freeze(seededBeatIds),
    skippedBeatIds: Object.freeze(skippedBeatIds),
    hasSeed: lines.length > 0,
  });
}

/**
 * 비트 대사를 곧바로 말풍선 시드로 만든다 — 도출된 라인을 기존 배치 함수
 * (layoutDialogueBubbles)에 그대로 넘기므로, 스크립트 문자열로 다시 해석하는
 * 과정에서 대사가 변형될 여지가 없다(라인이 단일 원천, 스크립트는 붙여넣기용 표현).
 */
export function seedDialogueBubblesFromBeats(
  beats: readonly StudioStoryBeat[],
  layout: DialogueLayoutOptions,
  options: DialogueSeedFromBeatsOptions = {},
): readonly DialogueBubbleSeed[] {
  const seed = deriveDialogueSeedFromBeats(beats, options);
  if (!seed.hasSeed) return [];
  return layoutDialogueBubbles([...seed.lines], layout);
}
