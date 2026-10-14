/**
 * 대본 임포트 → 콘티 비트 자동 분해 (순수 모델).
 *
 * Toon Boom Storyboard Pro의 "스크립트 임포트 → 패널 자동 분해" 패턴을 우리 방식으로
 * 재구현한다. 대본 텍스트(일반 텍스트/Fountain-lite/국내 대본 관례 혼합)를 씬 → 블록
 * (지문/대사/메모)으로 파싱하고, 스토리보드 플래너가 그대로 받는 StudioStoryBeat
 * 초안으로 변환한다. 초안 비트는 출처 필드가 없는 일반 비트라 삽입 후에도 다른
 * 비트와 동일하게 편집된다.
 *
 * 지원 표기:
 * - 씬 헤딩: "S#12", "#12", "씬 12", "INT./EXT."로 시작하는 줄, "12. 장소 - 시간"
 * - 대사: "이름: 대사" 또는 "이름 : 대사" (이름 12자 이내·공백 없음, 콜론 뒤 텍스트)
 * - 메모: "//" 또는 "※"로 시작하는 줄 → note 블록 (비트로는 안 가고 검수 메모로 남김)
 * - 그 외 줄: 지문(action)
 *
 * 결정적·DOM 무의존. 파싱 문제는 예외가 아니라 issues로 정직하게 보고한다
 * (빈 씬·대사만 있는 씬). 변환 옵션(idPrefix·startOrder)이 잘못됐을 때만 throw 한다 —
 * 그건 대본 내용이 아니라 호출자 계약 위반이다.
 */

import type { StudioStoryBeat } from "./studio-storyboard-planner";

/* ── 파싱 ─────────────────────────────────────────────────────────────── */

export interface ScreenplayBlock {
  readonly type: "action" | "dialogue" | "note";
  /** dialogue일 때만. */
  readonly speaker?: string;
  readonly text: string;
  /** 원본 1-base 줄 번호. */
  readonly line: number;
}

export interface ScreenplayScene {
  readonly index: number;
  readonly heading: string;
  readonly location?: string;
  readonly blocks: readonly ScreenplayBlock[];
  readonly startLine: number;
}

export interface ScreenplayParseIssue {
  readonly line: number;
  readonly kind: "empty-scene" | "dialogue-only-scene";
  readonly message: string;
}

export interface ParsedScreenplay {
  readonly scenes: readonly ScreenplayScene[];
  readonly issues: readonly ScreenplayParseIssue[];
  readonly stats: {
    readonly sceneCount: number;
    readonly dialogueCount: number;
    readonly actionCount: number;
    readonly speakers: readonly string[];
  };
}

const SCENE_HEADING_PATTERNS: readonly RegExp[] = [
  /^\s*(?:S#|씬\s*|#)(\d+)\s*[.)]?\s*(.*)$/u,
  /^\s*(INT\.|EXT\.|내부|외부)\s*(.*)$/u,
  /^\s*(\d+)\s*[.)]\s+(\S.*)$/u,
];

const DIALOGUE_PATTERN = /^\s*([^:：]{1,12})\s*[:：]\s*(.+)$/u;

function matchSceneHeading(line: string): { location?: string } | null {
  for (const pattern of SCENE_HEADING_PATTERNS) {
    const m = pattern.exec(line);
    if (m) {
      const rest = (m[2] ?? "").trim();
      return { location: rest.length > 0 ? rest : undefined };
    }
  }
  return null;
}

export function parseScreenplay(text: string): ParsedScreenplay {
  const lines = text.split(/\r?\n/u);
  const scenes: ScreenplayScene[] = [];
  const issues: ScreenplayParseIssue[] = [];
  let current: { heading: string; location?: string; blocks: ScreenplayBlock[]; startLine: number } | null =
    null;

  const flush = () => {
    if (!current) return;
    if (current.blocks.length === 0) {
      issues.push({
        line: current.startLine,
        kind: "empty-scene",
        message: `씬 "${current.heading}"에 내용이 없어요.`,
      });
    } else if (current.blocks.every((b) => b.type === "dialogue")) {
      issues.push({
        line: current.startLine,
        kind: "dialogue-only-scene",
        message: `씬 "${current.heading}"에 지문 없이 대사만 있어요.`,
      });
    }
    scenes.push({
      index: scenes.length,
      heading: current.heading,
      location: current.location,
      blocks: current.blocks,
      startLine: current.startLine,
    });
    current = null;
  };

  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.trim();
    if (line.length === 0) return;
    const heading = matchSceneHeading(line);
    if (heading) {
      flush();
      current = { heading: line, location: heading.location, blocks: [], startLine: lineNo };
      return;
    }
    if (!current) {
      current = { heading: "(제목 없음)", blocks: [], startLine: lineNo };
    }
    if (line.startsWith("//") || line.startsWith("※")) {
      current.blocks.push({ type: "note", text: line.replace(/^(\/\/|※)\s*/u, ""), line: lineNo });
      return;
    }
    const dlg = DIALOGUE_PATTERN.exec(line);
    // 지문에 콜론이 흔히 섞이므로, 화자 후보가 짧고 공백이 없을 때만 대사로 본다.
    if (dlg && !/\s/u.test(dlg[1]!.trim())) {
      current!.blocks.push({ type: "dialogue", speaker: dlg[1]!.trim(), text: dlg[2]!.trim(), line: lineNo });
      return;
    }
    current.blocks.push({ type: "action", text: line, line: lineNo });
  });
  flush();

  const speakers = new Set<string>();
  let dialogueCount = 0;
  let actionCount = 0;
  for (const scene of scenes) {
    for (const block of scene.blocks) {
      if (block.type === "dialogue") {
        dialogueCount += 1;
        if (block.speaker) speakers.add(block.speaker);
      } else if (block.type === "action") actionCount += 1;
    }
  }
  return {
    scenes,
    issues,
    stats: {
      sceneCount: scenes.length,
      dialogueCount,
      actionCount,
      speakers: [...speakers].sort(),
    },
  };
}

/* ── 비트 변환 ────────────────────────────────────────────────────────── */

export interface ScreenplayBeatOptions {
  /** 비트 id 접두사. 기본 "screenplay". 영문·숫자·하이픈만 허용. */
  readonly idPrefix?: string;
  /** 첫 비트의 order. 기본 0. */
  readonly startOrder?: number;
  /** 씬 → 플래너 sceneId. 기본 `scene-<씬 번호>`. */
  readonly sceneIdFor?: (scene: ScreenplayScene) => string;
  /** 화자 이름 → 캐릭터 id. 없으면 characterIds는 비워 두고 플래너 경고에 맡긴다(지어내지 않음). */
  readonly characterIdByName?: Readonly<Record<string, string>>;
  /** 장소 표기 → locationId. 없으면 locationId는 null. */
  readonly locationIdByName?: Readonly<Record<string, string>>;
}

export interface ScreenplayDialogueLine {
  readonly speaker?: string;
  readonly text: string;
}

export interface ScreenplaySceneDraft {
  readonly sceneIndex: number;
  readonly sceneId: string;
  readonly heading: string;
  readonly location?: string;
  readonly beatIds: readonly string[];
  /** 이 씬의 대사 목록 (플래너 비트의 dialogue와 같은 원문). */
  readonly dialogueLines: readonly ScreenplayDialogueLine[];
  readonly speakers: readonly string[];
  /** 대사량·지문 수 기반 패널 수 추정 (1~12로 클램프) — 표시용 참고치. */
  readonly panelCountEstimate: number;
  /** 메모 블록 — 비트로 가지 않고 검수 메모로만 남는다. */
  readonly notes: readonly string[];
}

export interface ScreenplayImportDraft {
  readonly beats: readonly StudioStoryBeat[];
  readonly scenes: readonly ScreenplaySceneDraft[];
  readonly issues: readonly ScreenplayParseIssue[];
  readonly stats: ParsedScreenplay["stats"];
}

const ID_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/u;
const SUMMARY_LIMIT = 120;

function summarize(text: string): string {
  return text.length <= SUMMARY_LIMIT ? text : `${text.slice(0, SUMMARY_LIMIT)}…`;
}

/**
 * 파싱 결과를 플래너 비트 초안으로 변환한다.
 * - 지문 블록 → 비트 (씬의 첫 비트는 setup, 이후 지문은 action)
 * - 대사 블록 → dialogue 비트 (summary는 대사 앞부분, dialogue는 원문 전체)
 * - 메모 블록 → 비트로 만들지 않고 씬 초안의 notes로만 남긴다
 * - 빈 씬 → 비트 없음 (issues에 이미 보고됨)
 */
export function screenplayToStoryBeats(
  parsed: ParsedScreenplay,
  options: ScreenplayBeatOptions = {},
): ScreenplayImportDraft {
  const idPrefix = options.idPrefix ?? "screenplay";
  if (!ID_PREFIX_PATTERN.test(idPrefix)) {
    throw new Error("Screenplay beat idPrefix must use letters, digits and hyphens only.");
  }
  const startOrder = options.startOrder ?? 0;
  if (!Number.isSafeInteger(startOrder) || startOrder < 0) {
    throw new Error("Screenplay beat startOrder must be a non-negative integer.");
  }

  const beats: StudioStoryBeat[] = [];
  const sceneDrafts: ScreenplaySceneDraft[] = [];
  let order = startOrder;

  for (const scene of parsed.scenes) {
    const sceneId = options.sceneIdFor?.(scene) ?? `scene-${scene.index + 1}`;
    const locationId = scene.location
      ? (options.locationIdByName?.[scene.location] ?? null)
      : null;
    const beatIds: string[] = [];
    const dialogueLines: ScreenplayDialogueLine[] = [];
    const notes: string[] = [];
    let beatInScene = 0;

    for (const block of scene.blocks) {
      if (block.type === "note") {
        notes.push(block.text);
        continue;
      }
      beatInScene += 1;
      const id = `${idPrefix}-s${scene.index + 1}-b${beatInScene}`;
      if (block.type === "dialogue") {
        const characterId = block.speaker
          ? options.characterIdByName?.[block.speaker]
          : undefined;
        beats.push(Object.freeze({
          id,
          sceneId,
          order,
          kind: "dialogue",
          summary: summarize(block.text),
          dialogue: block.text,
          characterIds: Object.freeze(characterId ? [characterId] : []),
          locationId,
        }));
        dialogueLines.push({ speaker: block.speaker, text: block.text });
      } else {
        beats.push(Object.freeze({
          id,
          sceneId,
          order,
          kind: beatInScene === 1 ? "setup" : "action",
          summary: summarize(block.text),
          dialogue: "",
          characterIds: Object.freeze([]),
          locationId,
        }));
      }
      beatIds.push(id);
      order += 1;
    }

    const actions = scene.blocks.filter((b) => b.type === "action").length;
    const dialogues = scene.blocks.filter((b) => b.type === "dialogue").length;
    sceneDrafts.push(Object.freeze({
      sceneIndex: scene.index,
      sceneId,
      heading: scene.heading,
      location: scene.location,
      beatIds: Object.freeze(beatIds),
      dialogueLines: Object.freeze(dialogueLines),
      speakers: Object.freeze(
        [...new Set(dialogueLines.map((d) => d.speaker).filter((s): s is string => !!s))],
      ),
      panelCountEstimate: Math.min(12, Math.max(1, actions + Math.ceil(dialogues / 2))),
      notes: Object.freeze(notes),
    }));
  }

  return Object.freeze({
    beats: Object.freeze(beats),
    scenes: Object.freeze(sceneDrafts),
    issues: parsed.issues,
    stats: parsed.stats,
  });
}

/** 대본 텍스트 한 번에 파싱+변환하는 진입점 (표면이 쓰는 경로). */
export function buildScreenplayImportDraft(
  text: string,
  options: ScreenplayBeatOptions = {},
): ScreenplayImportDraft {
  return screenplayToStoryBeats(parseScreenplay(text), options);
}

/**
 * 이미 비트가 있는 플래너에 임포트 초안을 이어 붙인다.
 * order는 기존 최대 order 다음부터 다시 매기고, id가 겹치면 -2·-3 접미사로 유일성을
 * 보장한다(같은 대본을 두 번 넣어도 플래너의 유일성 계약이 깨지지 않는다).
 * 원본 배열은 바꾸지 않는다.
 */
export function appendScreenplayBeats(
  existing: readonly StudioStoryBeat[],
  incoming: readonly StudioStoryBeat[],
): readonly StudioStoryBeat[] {
  if (incoming.length === 0) return existing;
  const usedIds = new Set(existing.map((beat) => beat.id));
  let nextOrder = existing.reduce((max, beat) => Math.max(max, beat.order), -1) + 1;
  const appended = incoming.map((beat) => {
    let id = beat.id;
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${beat.id}-${suffix}`)) suffix += 1;
      id = `${beat.id}-${suffix}`;
    }
    usedIds.add(id);
    const order = nextOrder;
    nextOrder += 1;
    return Object.freeze({ ...beat, id, order });
  });
  return Object.freeze([...existing, ...appended]);
}
