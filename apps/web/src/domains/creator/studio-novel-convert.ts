/**
 * Studio Novel Convert — 소설 텍스트 → 글콘티 초안 변환 (규칙 기반, 순수·결정적).
 *
 * MangaPlay Studio 분석(cat2)에서 확인한 원칙을 따른다: 변환의 핵심은 AI 의미 해석이 아니라
 * 평문 표지를 신뢰하는 결정적 규칙이다. 소설 원문에는 작가가 찍은 컷 마커가 없으므로,
 * 한국어 소설 관행(장면 전환 표지 줄, 빈 줄 경계, 따옴표 대사, 발화 동사 패턴)에서
 * 경계를 도출한다. 규칙으로 확정할 수 없는 화자는 지어내지 않고 "미상"으로 남긴다 —
 * 초안은 어디까지나 초안이고, 사용자가 편집으로 확정하는 것이 이 모듈의 계약이다.
 *
 * 화자 신뢰 구분:
 *  - "explicit"  원문에 `이름:` 표기가 있어 확정된 화자
 *  - "inferred"  발화 동사 패턴으로 추정한 화자 (사실이 아니라 추정)
 *  - "manual"    사용자가 초안 편집에서 직접 지정한 화자
 *  - "unknown"   화자를 찾지 못함 (speaker === null)
 *
 * 변환 결과는 작가실 정본 문서(StudioWriterRoomDocument)의 장면·컷 플랜·대사 단계로
 * 반영된다. 이 모듈은 문서를 검증하지 않는다 — 반영 지점에서
 * admitStudioWriterRoomDocument가 최종 수용을 판정한다.
 */

import {
  STUDIO_WRITER_ROOM_LIMITS,
  type StudioWriterRoomDialogue,
  type StudioWriterRoomDocument,
  type StudioWriterRoomPanel,
  type StudioWriterRoomScene,
} from "./studio-writer-room";

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export type NovelSpeakerSource = "explicit" | "inferred" | "manual" | "unknown";
export type NovelCutKind = "action" | "dialogue";

export interface NovelDraftCut {
  id: string;
  kind: NovelCutKind;
  text: string;
  /** 대사 컷의 화자 이름. 지문 컷과 화자 미상 대사에서는 null. */
  speaker: string | null;
  speakerSource: NovelSpeakerSource;
}

export interface NovelDraftScene {
  id: string;
  /** 장면 표지에서 온 제목. 없으면 빈 문자열 (표시는 "장면 N" 폴백). */
  title: string;
  cuts: NovelDraftCut[];
}

export interface NovelScriptDraft {
  scenes: NovelDraftScene[];
}

export type NovelParseStatus = "ok" | "empty" | "too-large";

export interface NovelParseStats {
  sourceChars: number;
  sceneCount: number;
  cutCount: number;
  dialogueCount: number;
  actionCount: number;
  unknownSpeakerCount: number;
  /** 등장 순서대로의 화자 이름 목록 (미상 제외). */
  speakers: string[];
}

export interface NovelParseResult {
  status: NovelParseStatus;
  draft: NovelScriptDraft;
  stats: NovelParseStats;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 입력 상한 — 작가실 문서 직렬화 예산(2MB)과 정합하는 보수적 한계. 넘으면 자르지 않고 거부한다. */
export const NOVEL_SOURCE_MAX_CHARS = 200_000;

/** 지문 컷 1개의 목표 최대 길이. 문장 경계에서만 자른다. */
const ACTION_CUT_MAX_CHARS = 280;

const DIALOGUE_TEXT_MAX = STUDIO_WRITER_ROOM_LIMITS.maxDialogueLength;
const SCENE_SUMMARY_MAX = STUDIO_WRITER_ROOM_LIMITS.maxTextLength;
const SCENE_HEADING_MAX = STUDIO_WRITER_ROOM_LIMITS.maxShortTextLength;

/** 이름으로 볼 수 없는 단어 — 화자 후보에서 제외한다. */
const SPEAKER_STOPWORDS = new Set([
  "그녀",
  "그대",
  "자신",
  "누구",
  "모두",
  "순간",
  "그때",
  "이때",
  "바로",
  "정말",
  "프롤로그",
  "에필로그",
  "시간",
  "세상",
  "생각",
  "마음",
]);

/** 발화 동사 어간 — 이름+조사 뒤 일정 거리 안에 있으면 그 이름을 화자로 추정한다. */
const SPEECH_VERB_STEMS = [
  "말했",
  "말하",
  "물었",
  "대답했",
  "외쳤",
  "소리쳤",
  "소리 질렀",
  "속삭였",
  "중얼거렸",
  "되물었",
  "덧붙였",
  "이어 말",
] as const;

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
  ['"', '"'],
  ["'", "'"],
];

// ---------------------------------------------------------------------------
// id 생성
// ---------------------------------------------------------------------------

export type NovelIdFactory = () => string;

/** 결정적 기본 id 생성기 — 호출 순서대로 novel-1, novel-2, … 를 돌려준다. */
export function createNovelIdFactory(prefix = "novel"): NovelIdFactory {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${counter}`;
  };
}

// ---------------------------------------------------------------------------
// 문장 분리
// ---------------------------------------------------------------------------

const SENTENCE_RE = /[^.!?…\n]+[.!?…]+["'”’」』)]*\s*|[^.!?…\n]+$/g;

function splitSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE) ?? [];
  return matches.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

/** 지문을 문장 단위로 묶어 최대 길이를 넘지 않는 덩어리로 나눈다. 긴 단일 문장은 공백 경계에서 자른다. */
function chunkActionText(text: string): string[] {
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };
  for (const sentence of sentences) {
    if (sentence.length > ACTION_CUT_MAX_CHARS) {
      flush();
      let rest = sentence;
      while (rest.length > ACTION_CUT_MAX_CHARS) {
        const cut = rest.lastIndexOf(" ", ACTION_CUT_MAX_CHARS);
        const at = cut > ACTION_CUT_MAX_CHARS / 2 ? cut : ACTION_CUT_MAX_CHARS;
        chunks.push(rest.slice(0, at).trim());
        rest = rest.slice(at).trim();
      }
      if (rest) current = rest;
      continue;
    }
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length > ACTION_CUT_MAX_CHARS) {
      flush();
      current = sentence;
    } else {
      current = joined;
    }
  }
  flush();
  return chunks;
}

/** 대사 상한을 넘는 긴 대사를 문장 경계에서 나눈다. */
function chunkDialogueText(text: string): string[] {
  if (text.length <= DIALOGUE_TEXT_MAX) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of splitSentences(text)) {
    const joined = current ? `${current} ${sentence}` : sentence;
    if (joined.length > DIALOGUE_TEXT_MAX && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = joined;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, DIALOGUE_TEXT_MAX)];
}

// ---------------------------------------------------------------------------
// 화자 추정
// ---------------------------------------------------------------------------

/**
 * 이름+조사 패턴. 조사 뒤에 연결 어미(며·고·자·서)가 바로 붙으면 조사가 아니라
 * 어미의 일부이므로 후보에서 제외한다 — 예: "헐떡이며"의 "이"를 조사로 오인하면
 * "헐떡"이 화자로 둔갑한다.
 */
const NAME_TOKEN_RE = /([가-힣]{2,5})(이|가|은|는|도)(?![며고자서])/g;

/**
 * 지문 덩어리에서 "이름 + 조사 … 발화 동사" 패턴으로 화자를 찾는다.
 * preferLast가 참이면 따옴표에 가장 가까운(마지막) 후보를, 거짓이면 첫 후보를 쓴다.
 * 이름 후보가 발화 동사와 무관하게 등장만 한 경우(예: "민준은 방에 있었다")는 잡지 않는다 —
 * 동사가 일정 거리 안에 있을 때만 추정한다.
 */
function findAttributedSpeaker(chunk: string, preferLast: boolean): string | null {
  if (!chunk) return null;
  const candidates: string[] = [];
  for (const match of chunk.matchAll(NAME_TOKEN_RE)) {
    const name = match[1];
    if (!name || SPEAKER_STOPWORDS.has(name)) continue;
    const after = chunk.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 22);
    if (SPEECH_VERB_STEMS.some((stem) => after.includes(stem))) {
      candidates.push(name);
    }
  }
  if (candidates.length === 0) return null;
  return preferLast ? candidates[candidates.length - 1]! : candidates[0]!;
}

const EXPLICIT_PREFIX_RE = /^([가-힣]{2,5})\s*[:：]\s*(.*)$/;

/** 문서 전체에서 `이름:` 접두사가 반복 등장하는 이름을 모은다 (각본식 표기 판정용). */
function collectRepeatedPrefixNames(text: string): Set<string> {
  const counts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const match = EXPLICIT_PREFIX_RE.exec(line.trim());
    if (match?.[1] && !SPEAKER_STOPWORDS.has(match[1])) {
      counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    }
  }
  const names = new Set<string>();
  for (const [name, count] of counts) {
    if (count >= 2) names.add(name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// 장면 분리
// ---------------------------------------------------------------------------

interface RawScene {
  title: string;
  paragraphs: string[];
}

const DIVIDER_LINE_RE = /^\s*([*\-|_=~#]{3,})\s*$/;
const HEADING_LINE_RE = /^#{1,3}\s+(.+)$/;
const CHAPTER_LINE_RE =
  /^\s*(제\s?\d+\s?[장화막](?:[.\s:：].{0,30})?|\d{1,3}\s?[장화](?:[.\s].{0,30})?)$/;
const NUMBER_ONLY_LINE_RE = /^\s*\d{1,4}\s*[.)]\s*$/;

/**
 * 원문을 장면 단위 문단 묶음으로 나눈다.
 * 장면 경계: 표지 줄(구분자·헤딩·장/화 표지·번호 단독 줄), 빈 줄 2개 이상 연속.
 * 빈 줄 1개는 같은 장면 안의 문단 구분이다.
 */
function splitRawScenes(text: string): RawScene[] {
  const scenes: RawScene[] = [];
  let title = "";
  let paragraphs: string[] = [];
  let paragraphLines: string[] = [];
  let blankRun = 0;

  const flushParagraph = () => {
    const paragraph = paragraphLines.join(" ").replace(/\s+/g, " ").trim();
    paragraphLines = [];
    if (paragraph) paragraphs.push(paragraph);
  };
  const flushScene = (nextTitle: string) => {
    flushParagraph();
    if (paragraphs.length > 0 || title) {
      scenes.push({ title, paragraphs });
    }
    paragraphs = [];
    title = nextTitle;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      blankRun += 1;
      if (blankRun >= 2) {
        flushScene("");
        blankRun = 0;
      } else {
        flushParagraph();
      }
      continue;
    }
    blankRun = 0;

    const heading = HEADING_LINE_RE.exec(line);
    if (heading?.[1]) {
      flushScene(heading[1].trim());
      continue;
    }
    if (DIVIDER_LINE_RE.test(line) || NUMBER_ONLY_LINE_RE.test(line)) {
      flushScene("");
      continue;
    }
    if (CHAPTER_LINE_RE.test(line)) {
      flushScene(line);
      continue;
    }
    paragraphLines.push(line);
  }
  flushScene("");
  if (scenes.length === 0) scenes.push({ title: "", paragraphs: [] });
  // 마지막 flushScene이 만든 빈 꼬리 장면 제거
  return scenes.filter((scene, index) => scene.paragraphs.length > 0 || scene.title || index === 0);
}

// ---------------------------------------------------------------------------
// 문단 → 컷 분리
// ---------------------------------------------------------------------------

interface QuoteSegment {
  kind: "quote";
  text: string;
  /** 따옴표 바로 앞 지문 (화자 추정용). */
  before: string;
  /** 따옴표 바로 뒤 지문의 첫 문장 (화자 추정용). */
  after: string;
}

type Segment = { kind: "narration"; text: string } | QuoteSegment;

/** 문단을 지문/따옴표 구간으로 나눈다. 닫히지 않은 따옴표는 지문으로 남긴다. */
function segmentParagraph(paragraph: string): Segment[] {
  const segments: Segment[] = [];
  let narration = "";
  let index = 0;

  const pushNarration = () => {
    const text = narration.trim();
    narration = "";
    if (text) segments.push({ kind: "narration", text });
  };

  while (index < paragraph.length) {
    const char = paragraph[index]!;
    const pair = QUOTE_PAIRS.find(([open]) => open === char);
    if (pair) {
      const [open, close] = pair;
      const end = paragraph.indexOf(close, index + open.length);
      if (end > index + open.length) {
        const content = paragraph.slice(index + open.length, end).trim();
        if (content) {
          const before = narration;
          pushNarration();
          segments.push({ kind: "quote", text: content, before, after: "" });
          index = end + close.length;
          continue;
        }
      }
    }
    narration += char;
    index += 1;
  }
  pushNarration();

  // 따옴표 뒤 지문의 첫 문장을 after로 연결한다 (화자 추정용).
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment?.kind !== "quote") continue;
    const next = segments[i + 1];
    if (next?.kind === "narration") {
      const firstSentence = splitSentences(next.text)[0] ?? next.text;
      segment.after = firstSentence;
    }
  }
  return segments;
}

/** 문단 하나를 컷 배열로 변환한다. */
function paragraphToCuts(
  paragraph: string,
  repeatedPrefixNames: ReadonlySet<string>,
  createId: NovelIdFactory
): NovelDraftCut[] {
  const cuts: NovelDraftCut[] = [];
  let rest = paragraph;
  let explicitSpeaker: string | null = null;

  const prefix = EXPLICIT_PREFIX_RE.exec(rest);
  if (prefix?.[1] && prefix[2] !== undefined) {
    const name = prefix[1];
    const remainder = prefix[2].trim();
    const startsWithQuote = QUOTE_PAIRS.some(([open]) => remainder.startsWith(open));
    if (startsWithQuote) {
      explicitSpeaker = name;
      rest = remainder;
    } else if (repeatedPrefixNames.has(name) && remainder) {
      // 각본식 단독 표기 — 따옴표 없는 대사 줄.
      for (const chunk of chunkDialogueText(remainder)) {
        cuts.push({
          id: createId(),
          kind: "dialogue",
          text: chunk,
          speaker: name,
          speakerSource: "explicit",
        });
      }
      return cuts;
    }
  }

  for (const segment of segmentParagraph(rest)) {
    if (segment.kind === "narration") {
      for (const chunk of chunkActionText(segment.text)) {
        cuts.push({
          id: createId(),
          kind: "action",
          text: chunk,
          speaker: null,
          speakerSource: "unknown",
        });
      }
      continue;
    }
    let speaker: string | null = null;
    let source: NovelSpeakerSource = "unknown";
    if (explicitSpeaker) {
      speaker = explicitSpeaker;
      source = "explicit";
      explicitSpeaker = null;
    } else {
      const fromBefore = findAttributedSpeaker(segment.before, true);
      const fromAfter = fromBefore ? null : findAttributedSpeaker(segment.after, false);
      const found = fromBefore ?? fromAfter;
      if (found) {
        speaker = found;
        source = "inferred";
      }
    }
    for (const chunk of chunkDialogueText(segment.text)) {
      cuts.push({
        id: createId(),
        kind: "dialogue",
        text: chunk,
        speaker,
        speakerSource: speaker ? source : "unknown",
      });
    }
  }
  return cuts;
}

// ---------------------------------------------------------------------------
// 파서 본체
// ---------------------------------------------------------------------------

export interface ParseNovelOptions {
  createId?: NovelIdFactory;
}

/** 소설 텍스트를 글콘티 초안으로 변환한다. 빈 입력·초과 입력은 상태로 구분해 돌려준다. */
export function parseNovelToScriptDraft(source: string, options: ParseNovelOptions = {}): NovelParseResult {
  const createId = options.createId ?? createNovelIdFactory();
  const normalized = source.replace(/\r\n?/g, "\n");
  const emptyStats: NovelParseStats = {
    sourceChars: normalized.length,
    sceneCount: 0,
    cutCount: 0,
    dialogueCount: 0,
    actionCount: 0,
    unknownSpeakerCount: 0,
    speakers: [],
  };

  if (!normalized.trim()) {
    return { status: "empty", draft: { scenes: [] }, stats: emptyStats, warnings: [] };
  }
  if (normalized.length > NOVEL_SOURCE_MAX_CHARS) {
    return {
      status: "too-large",
      draft: { scenes: [] },
      stats: emptyStats,
      warnings: [
        `원고가 ${NOVEL_SOURCE_MAX_CHARS.toLocaleString("ko-KR")}자를 넘어 변환하지 않았어요. 회차 단위로 나눠서 가져와 주세요.`,
      ],
    };
  }

  const repeatedPrefixNames = collectRepeatedPrefixNames(normalized);
  const rawScenes = splitRawScenes(normalized);
  const scenes: NovelDraftScene[] = rawScenes.map((raw) => ({
    id: createId(),
    title: raw.title,
    cuts: raw.paragraphs.flatMap((paragraph) => paragraphToCuts(paragraph, repeatedPrefixNames, createId)),
  }));

  const speakers: string[] = [];
  let cutCount = 0;
  let dialogueCount = 0;
  let actionCount = 0;
  let unknownSpeakerCount = 0;
  for (const scene of scenes) {
    for (const cut of scene.cuts) {
      cutCount += 1;
      if (cut.kind === "dialogue") {
        dialogueCount += 1;
        if (cut.speaker) {
          if (!speakers.includes(cut.speaker)) speakers.push(cut.speaker);
        } else {
          unknownSpeakerCount += 1;
        }
      } else {
        actionCount += 1;
      }
    }
  }

  const warnings: string[] = [];
  if (unknownSpeakerCount > 0) {
    warnings.push(
      `화자를 찾지 못한 대사가 ${unknownSpeakerCount}개 있어요. 초안에서 화자를 지정해 주세요.`
    );
  }
  if (dialogueCount === 0) {
    warnings.push("따옴표 대사를 찾지 못했어요. 지문만으로 초안을 만들었어요.");
  }

  return {
    status: "ok",
    draft: { scenes },
    stats: {
      sourceChars: normalized.length,
      sceneCount: scenes.length,
      cutCount,
      dialogueCount,
      actionCount,
      unknownSpeakerCount,
      speakers,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 초안 편집 연산 (전부 불변 — 새 초안을 돌려준다)
// ---------------------------------------------------------------------------

interface CutLocation {
  sceneIndex: number;
  cutIndex: number;
}

function locateCut(draft: NovelScriptDraft, cutId: string): CutLocation | null {
  for (let sceneIndex = 0; sceneIndex < draft.scenes.length; sceneIndex += 1) {
    const cutIndex = draft.scenes[sceneIndex]!.cuts.findIndex((cut) => cut.id === cutId);
    if (cutIndex >= 0) return { sceneIndex, cutIndex };
  }
  return null;
}

function replaceSceneCuts(
  draft: NovelScriptDraft,
  sceneIndex: number,
  cuts: NovelDraftCut[]
): NovelScriptDraft {
  return {
    scenes: draft.scenes.map((scene, index) =>
      index === sceneIndex ? { ...scene, cuts } : scene
    ),
  };
}

export function updateNovelCutText(
  draft: NovelScriptDraft,
  cutId: string,
  text: string
): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const scene = draft.scenes[location.sceneIndex]!;
  const cuts = scene.cuts.map((cut, index) =>
    index === location.cutIndex ? { ...cut, text } : cut
  );
  return replaceSceneCuts(draft, location.sceneIndex, cuts);
}

/** 화자를 지정한다. null이면 미상으로 되돌린다. 사용자가 지정하면 출처는 manual이다. */
export function setNovelCutSpeaker(
  draft: NovelScriptDraft,
  cutId: string,
  speaker: string | null
): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const scene = draft.scenes[location.sceneIndex]!;
  const trimmed = speaker?.trim() ? speaker.trim() : null;
  const cuts = scene.cuts.map((cut, index) =>
    index === location.cutIndex
      ? {
          ...cut,
          speaker: trimmed,
          speakerSource: (trimmed ? "manual" : "unknown") as NovelSpeakerSource,
        }
      : cut
  );
  return replaceSceneCuts(draft, location.sceneIndex, cuts);
}

/** 같은 이름의 화자를 가진 모든 대사 컷에 한 번에 적용한다 (등장인물 단위 지정). */
export function renameNovelSpeaker(
  draft: NovelScriptDraft,
  from: string,
  to: string | null
): NovelScriptDraft {
  const trimmed = to?.trim() ? to.trim() : null;
  return {
    scenes: draft.scenes.map((scene) => ({
      ...scene,
      cuts: scene.cuts.map((cut) =>
        cut.kind === "dialogue" && cut.speaker === from
          ? {
              ...cut,
              speaker: trimmed,
              speakerSource: (trimmed ? "manual" : "unknown") as NovelSpeakerSource,
            }
          : cut
      ),
    })),
  };
}

/**
 * 컷을 다음 컷과 합친다. 규칙:
 *  - 지문+지문: 이어붙인다.
 *  - 대사+대사: 화자가 같을 때만 (다르면 원본 유지 — 섞으면 화자가 거짓이 된다).
 *  - 종류가 다르면 합치지 않는다.
 *  - 합친 대사가 정본 상한을 넘으면 합치지 않는다.
 */
export function mergeNovelCutWithNext(
  draft: NovelScriptDraft,
  cutId: string
): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const scene = draft.scenes[location.sceneIndex]!;
  const current = scene.cuts[location.cutIndex];
  const next = scene.cuts[location.cutIndex + 1];
  if (!current || !next || current.kind !== next.kind) return draft;
  if (current.kind === "dialogue" && current.speaker !== next.speaker) return draft;
  const joinedText = `${current.text} ${next.text}`.trim();
  if (current.kind === "dialogue" && joinedText.length > DIALOGUE_TEXT_MAX) return draft;
  const merged: NovelDraftCut = {
    ...current,
    text: joinedText,
    speakerSource:
      current.speakerSource === "inferred" || next.speakerSource === "inferred"
        ? "inferred"
        : current.speakerSource,
  };
  const cuts = [
    ...scene.cuts.slice(0, location.cutIndex),
    merged,
    ...scene.cuts.slice(location.cutIndex + 2),
  ];
  return replaceSceneCuts(draft, location.sceneIndex, cuts);
}

/** 컷을 첫 문장 뒤에서 나눌 수 있는지 (문장이 2개 이상인지). */
export function canSplitNovelCut(cut: NovelDraftCut): boolean {
  return splitSentences(cut.text).length >= 2;
}

/** mergeNovelCutWithNext가 실제로 합치는 조건인지 미리 확인한다 (UI 비활성 판정용). */
export function canMergeNovelCutWithNext(draft: NovelScriptDraft, cutId: string): boolean {
  const location = locateCut(draft, cutId);
  if (!location) return false;
  const scene = draft.scenes[location.sceneIndex]!;
  const current = scene.cuts[location.cutIndex];
  const next = scene.cuts[location.cutIndex + 1];
  if (!current || !next || current.kind !== next.kind) return false;
  if (current.kind === "dialogue" && current.speaker !== next.speaker) return false;
  if (current.kind === "dialogue" && `${current.text} ${next.text}`.trim().length > DIALOGUE_TEXT_MAX) {
    return false;
  }
  return true;
}

/** 컷을 첫 문장 뒤에서 나눈다. 문장이 하나뿐이면 원본을 유지한다. */
export function splitNovelCutAtFirstSentence(
  draft: NovelScriptDraft,
  cutId: string
): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const scene = draft.scenes[location.sceneIndex]!;
  const current = scene.cuts[location.cutIndex];
  if (!current) return draft;
  const sentences = splitSentences(current.text);
  if (sentences.length < 2) return draft;
  const first: NovelDraftCut = { ...current, text: sentences[0]! };
  const rest: NovelDraftCut = {
    ...current,
    id: `${current.id}-s`,
    text: sentences.slice(1).join(" "),
  };
  const cuts = [
    ...scene.cuts.slice(0, location.cutIndex),
    first,
    rest,
    ...scene.cuts.slice(location.cutIndex + 1),
  ];
  return replaceSceneCuts(draft, location.sceneIndex, cuts);
}

/** 장면 안에서 컷 순서를 위/아래로 한 칸 옮긴다. */
export function moveNovelCut(
  draft: NovelScriptDraft,
  cutId: string,
  direction: -1 | 1
): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const target = location.cutIndex + direction;
  const scene = draft.scenes[location.sceneIndex]!;
  if (target < 0 || target >= scene.cuts.length) return draft;
  const cuts = [...scene.cuts];
  const [moved] = cuts.splice(location.cutIndex, 1);
  cuts.splice(target, 0, moved!);
  return replaceSceneCuts(draft, location.sceneIndex, cuts);
}

export function removeNovelCut(draft: NovelScriptDraft, cutId: string): NovelScriptDraft {
  const location = locateCut(draft, cutId);
  if (!location) return draft;
  const scene = draft.scenes[location.sceneIndex]!;
  return replaceSceneCuts(
    draft,
    location.sceneIndex,
    scene.cuts.filter((cut) => cut.id !== cutId)
  );
}

export function renameNovelScene(
  draft: NovelScriptDraft,
  sceneId: string,
  title: string
): NovelScriptDraft {
  return {
    scenes: draft.scenes.map((scene) => (scene.id === sceneId ? { ...scene, title } : scene)),
  };
}

/** 초안에 등장하는 화자 이름과 대사 수를 등장 순서대로 돌려준다. */
export function collectNovelSpeakers(
  draft: NovelScriptDraft
): Array<{ name: string; dialogueCount: number; inferredCount: number }> {
  const byName = new Map<string, { name: string; dialogueCount: number; inferredCount: number }>();
  for (const scene of draft.scenes) {
    for (const cut of scene.cuts) {
      if (cut.kind !== "dialogue" || !cut.speaker) continue;
      const entry = byName.get(cut.speaker) ?? {
        name: cut.speaker,
        dialogueCount: 0,
        inferredCount: 0,
      };
      entry.dialogueCount += 1;
      if (cut.speakerSource === "inferred") entry.inferredCount += 1;
      byName.set(cut.speaker, entry);
    }
  }
  return [...byName.values()];
}

// ---------------------------------------------------------------------------
// 작가실 문서 변환
// ---------------------------------------------------------------------------

export interface NovelWriterRoomCharacterRef {
  id: string;
  name: string;
}

export interface BuildWriterRoomFromNovelOptions {
  /** 캐릭터 사전 — 이름이 일치하면 자동으로 연결한다. */
  characters?: readonly NovelWriterRoomCharacterRef[];
  /** 이름 → 캐릭터 id 명시 매핑. 자동 매칭보다 우선하고, null이면 연결하지 않는다. */
  speakerCharacterIds?: Readonly<Record<string, string | null>>;
  createId?: NovelIdFactory;
}

function resolveSpeakerCharacterId(
  speaker: string | null,
  options: BuildWriterRoomFromNovelOptions
): string | null {
  if (!speaker) return null;
  const explicit = options.speakerCharacterIds?.[speaker];
  if (explicit !== undefined) return explicit;
  const matched = (options.characters ?? []).find(
    (character) => character.name.trim() === speaker
  );
  return matched?.id ?? null;
}

/**
 * 초안을 작가실 문서의 장면·컷 플랜·대사 단계로 반영한 새 문서를 만든다.
 * 나머지 단계(기획·시놉시스·아웃라인·비트)와 완료 표시는 기준 문서를 그대로 유지한다.
 * location/time/shot처럼 원문에서 알 수 없는 값은 지어내지 않고 빈 문자열로 둔다.
 */
export function buildWriterRoomDocumentFromNovelDraft(
  base: StudioWriterRoomDocument,
  draft: NovelScriptDraft,
  options: BuildWriterRoomFromNovelOptions = {}
): StudioWriterRoomDocument {
  const createId = options.createId ?? createNovelIdFactory("novel-wr");
  const scenes: StudioWriterRoomScene[] = [];
  const panels: StudioWriterRoomPanel[] = [];
  const dialogue: StudioWriterRoomDialogue[] = [];
  let panelOrder = 0;
  let dialogueOrder = 0;

  draft.scenes.forEach((draftScene, sceneIndex) => {
    const sceneId = createId();
    const sceneCharacterIds: string[] = [];
    const actionTexts: string[] = [];
    let currentPanelId: string | null = null;

    const openPanel = (action: string, characterIds: string[]) => {
      const panelId = createId();
      panels.push({
        id: panelId,
        order: panelOrder,
        sceneId,
        shot: "",
        action: action.slice(0, SCENE_SUMMARY_MAX),
        characterIds,
      });
      panelOrder += 1;
      currentPanelId = panelId;
      return panelId;
    };

    for (const cut of draftScene.cuts) {
      if (cut.kind === "action") {
        actionTexts.push(cut.text);
        openPanel(cut.text, []);
        continue;
      }
      const characterId = resolveSpeakerCharacterId(cut.speaker, options);
      if (characterId && !sceneCharacterIds.includes(characterId)) {
        sceneCharacterIds.push(characterId);
      }
      const panelId = currentPanelId ?? openPanel("", []);
      if (characterId) {
        const panel = panels.find((item) => item.id === panelId);
        if (panel && !panel.characterIds.includes(characterId)) {
          panel.characterIds = [...panel.characterIds, characterId];
        }
      }
      for (const chunk of chunkDialogueText(cut.text)) {
        dialogue.push({
          id: createId(),
          order: dialogueOrder,
          panelId,
          characterId,
          text: chunk,
        });
        dialogueOrder += 1;
      }
    }

    const firstAction = actionTexts[0] ?? "";
    const heading =
      draftScene.title.trim() ||
      (firstAction ? firstAction.slice(0, 40) : `장면 ${sceneIndex + 1}`);
    scenes.push({
      id: sceneId,
      order: sceneIndex,
      beatIds: [],
      heading: heading.slice(0, SCENE_HEADING_MAX),
      summary: actionTexts.join("\n\n").slice(0, SCENE_SUMMARY_MAX),
      location: "",
      time: "",
      characterIds: sceneCharacterIds,
    });
  });

  return {
    ...base,
    stages: {
      ...base.stages,
      scenes: { items: scenes },
      "panel-plan": { items: panels },
      "dialogue-sfx": { dialogue, sfx: base.stages["dialogue-sfx"].sfx },
    },
    lastDecision: undefined,
  };
}

// ---------------------------------------------------------------------------
// 대사 미니 문법 내보내기
// ---------------------------------------------------------------------------

/**
 * 초안을 기존 대사 미니 문법(studio-dialogue.parseDialogueScript 호환) 문자열로 내보낸다.
 * 지문은 "(지문)" 줄, 대사는 "이름: 대사" 줄이 된다. 화자 미상 대사는 이름 없이 내보내
 * 파서가 번갈아 배치하게 둔다 (이름을 지어내지 않는다).
 */
export function novelDraftToDialogueScript(draft: NovelScriptDraft): string {
  const lines: string[] = [];
  for (const scene of draft.scenes) {
    for (const cut of scene.cuts) {
      const flat = cut.text.replace(/\s*\n\s*/g, " ").trim();
      if (!flat) continue;
      if (cut.kind === "action") {
        lines.push(`(${flat})`);
      } else if (cut.speaker) {
        lines.push(`${cut.speaker}: ${flat}`);
      } else {
        lines.push(flat);
      }
    }
  }
  return lines.join("\n");
}
