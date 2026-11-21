/**
 * 대본(`[컷 N]` 마커 파싱) -> 컷·말풍선·대사 양방향 시드 + 전 페이지 검색·치환 헬퍼.
 *
 * Plotr의 대본->글콘티 분할·대사 양방향 동기화와 CSP EX 스토리 에디터의
 * 전 페이지 검색·치환을 단일 순수 모듈(DOM/Konva 무의존)로 제공한다.
 */
import {
  applyReplacePlanToPages,
  collectDialogueItems,
  isDialogueElement,
  planDialogueReplace,
  type DialogueElementLike,
  type DialoguePageLike,
  type DialogueReplaceOptions,
  type DialogueReplacePlan,
} from "./studio-dialogue-batch";

export type ScriptDialogueKind = "speech" | "thought" | "shout" | "narration" | "sfx";

export interface ParsedScriptDialogueLine {
  readonly lineId: string;
  readonly lineIndex: number;
  readonly cutNumber: number;
  readonly speaker: string | null;
  readonly kind: ScriptDialogueKind;
  readonly text: string;
}

export interface ParsedScriptCut {
  readonly cutNumber: number;
  readonly headingLineIndex: number;
  readonly directionNote: string;
  readonly actionLines: readonly string[];
  readonly dialogues: readonly ParsedScriptDialogueLine[];
}

export interface ParsedScriptDocument {
  readonly hasExplicitMarkers: boolean;
  readonly cuts: readonly ParsedScriptCut[];
  readonly rawLines: readonly string[];
}

export interface ScriptPanelSeedBinding {
  readonly cutNumber: number;
  readonly pageId: string;
  readonly frameElementId: string;
  readonly dialogueBindings: readonly {
    readonly lineId: string;
    readonly lineIndex: number;
    readonly elementId: string;
    readonly speaker: string | null;
    readonly kind: ScriptDialogueKind;
    readonly seededText: string;
  }[];
}

export interface SeedPanelsFromScriptOptions {
  readonly pageIdPrefix?: string;
  readonly canvasWidth?: number;
  readonly viewportHeightPx?: number;
  readonly cutsPerPage?: number;
  readonly gutterPx?: number;
  readonly sideMarginPx?: number;
}

export interface SeededScriptCanvasResult {
  readonly parsed: ParsedScriptDocument;
  readonly pages: readonly (DialoguePageLike & { readonly canvasH: number })[];
  readonly bindings: readonly ScriptPanelSeedBinding[];
  readonly totalCutCount: number;
  readonly totalDialogueCount: number;
}

export interface BidirectionalSyncReport {
  readonly updatedScript: string;
  readonly updatedLineCount: number;
  readonly preservedUnchangedCount: number;
}

export interface ScriptReconcileResult {
  readonly pages: readonly (DialoguePageLike & { readonly canvasH: number })[];
  readonly bindings: readonly ScriptPanelSeedBinding[];
  readonly preservedCanvasEditIds: readonly string[];
  readonly addedElementIds: readonly string[];
  readonly removedElementIds: readonly string[];
}

export interface StoryDialogueMatch {
  readonly matchId: string;
  readonly pageId: string;
  readonly pageIndex: number;
  readonly elementId: string;
  readonly occurrenceIndex: number;
  readonly start: number;
  readonly end: number;
  readonly fullText: string;
  readonly locked: boolean;
}

const CUT_MARKER_REGEX = /^\s*\[(?:컷|cut)\s*(\d+)\s*(?:[-–—:|]\s*(.+?))?\]\s*(.*)$/iu;
const SPEAKER_LINE_REGEX =
  /^\s*([^:\n()[\]]{1,24}?)(?:\s*\((생각|독백|속마음|외침|소리침|나레이션|해설|효과음|SFX)\))?\s*[:：]\s*(.+)$/iu;
const QUOTE_WRAP_REGEX = /^["“”'‘’](.+)["“”'‘’]$/u;

function classifyCueKind(speakerRaw: string, qualifierRaw?: string): {
  readonly speaker: string | null;
  readonly kind: ScriptDialogueKind;
} {
  const speaker = speakerRaw.trim();
  const qualifier = (qualifierRaw ?? "").trim().toLowerCase();
  if (
    speaker === "나레이션" ||
    speaker === "해설" ||
    qualifier === "나레이션" ||
    qualifier === "해설"
  ) {
    return { speaker: null, kind: "narration" };
  }
  if (
    speaker === "효과음" ||
    speaker.toUpperCase() === "SFX" ||
    qualifier === "효과음" ||
    qualifier === "sfx"
  ) {
    return { speaker: null, kind: "sfx" };
  }
  if (qualifier === "생각" || qualifier === "독백" || qualifier === "속마음") {
    return { speaker, kind: "thought" };
  }
  if (qualifier === "외침" || qualifier === "소리침") {
    return { speaker, kind: "shout" };
  }
  return { speaker, kind: "speech" };
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  const matched = trimmed.match(QUOTE_WRAP_REGEX);
  return matched?.[1]?.trim() ?? trimmed;
}

function bubbleVariantForKind(kind: ScriptDialogueKind): string {
  if (kind === "thought") return "thought";
  if (kind === "shout") return "shout";
  if (kind === "narration") return "caption";
  return "round";
}

/**
 * `[컷 N]` 마커가 포함된 웹툰 대본을 구조화된 컷·대사 트리로 파싱한다.
 * 명시 마커가 없으면 빈 줄(문단) 단위로 자동 컷 분할해 어떤 원고도 바로 시드할 수 있다.
 */
export function parseWebtoonScript(scriptText: string): ParsedScriptDocument {
  const rawLines = scriptText.replace(/\r\n?/gu, "\n").split("\n");
  const hasExplicitMarkers = rawLines.some((line) => CUT_MARKER_REGEX.test(line));

  const cuts: {
    cutNumber: number;
    headingLineIndex: number;
    directionNote: string;
    actionLines: string[];
    dialogues: ParsedScriptDialogueLine[];
  }[] = [];

  let activeCut: (typeof cuts)[number] | null = null;
  let autoCutNumber = 0;

  const ensureCut = (cutNumber: number, lineIndex: number, directionNote: string) => {
    const created = {
      cutNumber,
      headingLineIndex: lineIndex,
      directionNote,
      actionLines: [] as string[],
      dialogues: [] as ParsedScriptDialogueLine[],
    };
    cuts.push(created);
    activeCut = created;
  };

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (!hasExplicitMarkers) {
        activeCut = null;
      }
      continue;
    }

    const markerMatch = trimmed.match(CUT_MARKER_REGEX);
    if (markerMatch) {
      const cutNumber = Math.max(1, Number.parseInt(markerMatch[1] ?? "1", 10));
      const headerNote = [markerMatch[2]?.trim(), markerMatch[3]?.trim()]
        .filter(Boolean)
        .join(" · ");
      ensureCut(cutNumber, lineIndex, headerNote);
      continue;
    }

    if (!activeCut) {
      autoCutNumber += 1;
      ensureCut(autoCutNumber, lineIndex, "");
    }

    const current = activeCut!;
    const speakerMatch = trimmed.match(SPEAKER_LINE_REGEX);
    if (speakerMatch) {
      const { speaker, kind } = classifyCueKind(speakerMatch[1] ?? "", speakerMatch[2]);
      const cleanedText = stripOuterQuotes(speakerMatch[3] ?? "");
      if (cleanedText.length > 0) {
        current.dialogues.push({
          lineId: `cut-${current.cutNumber}-line-${current.dialogues.length + 1}`,
          lineIndex,
          cutNumber: current.cutNumber,
          speaker,
          kind,
          text: cleanedText,
        });
      }
      continue;
    }

    current.actionLines.push(trimmed);
  }

  return {
    hasExplicitMarkers,
    cuts,
    rawLines,
  };
}

/**
 * 파싱된 대본을 세로 웹툰 컷(frame)과 말풍선(bubble/text) 요소 묶음으로 시드한다.
 * 단일 컷 높이는 viewportHeight의 1.35배 이하로 제한해 스크롤 리듬 기준을 자연스럽게 지킨다.
 */
export function seedPanelsFromScript(
  scriptText: string,
  options: SeedPanelsFromScriptOptions = {},
): SeededScriptCanvasResult {
  const parsed = parseWebtoonScript(scriptText);
  const pageIdPrefix = options.pageIdPrefix ?? "seed-page";
  const canvasWidth = Math.max(320, Math.round(options.canvasWidth ?? 720));
  const viewportHeight = Math.max(640, Math.round(options.viewportHeightPx ?? 1_280));
  const cutsPerPage = Math.max(1, Math.round(options.cutsPerPage ?? 4));
  const gutterPx = Math.max(80, Math.round(options.gutterPx ?? 220));
  const sideMarginPx = Math.max(24, Math.round(options.sideMarginPx ?? 48));
  const maxPanelHeight = Math.floor(viewportHeight * 1.32);

  const pages: (DialoguePageLike & { readonly canvasH: number })[] = [];
  const bindings: ScriptPanelSeedBinding[] = [];
  let totalDialogueCount = 0;

  for (let start = 0; start < parsed.cuts.length; start += cutsPerPage) {
    const pageIndex = Math.floor(start / cutsPerPage);
    const pageId = `${pageIdPrefix}-${pageIndex + 1}`;
    const slice = parsed.cuts.slice(start, start + cutsPerPage);
    const elements: DialogueElementLike[] = [];
    let cursorY = 120;

    for (const cut of slice) {
      const panelWidth = canvasWidth - sideMarginPx * 2;
      const estimatedHeight = 460 + cut.dialogues.length * 140;
      const panelHeight = Math.min(maxPanelHeight, Math.max(480, estimatedHeight));
      const frameElementId = `${pageId}-frame-${cut.cutNumber}`;

      elements.push({
        id: frameElementId,
        type: "frame",
        name: `컷 ${cut.cutNumber}${cut.directionNote ? ` · ${cut.directionNote}` : ""}`,
        order: cut.cutNumber,
        x: sideMarginPx,
        y: cursorY,
        width: panelWidth,
        height: panelHeight,
      });

      const dialogueBindings: {
        lineId: string;
        lineIndex: number;
        elementId: string;
        speaker: string | null;
        kind: ScriptDialogueKind;
        seededText: string;
      }[] = [];

      const bubbleWidth = Math.min(340, Math.round(panelWidth * 0.56));
      const verticalSlot = Math.max(
        110,
        Math.floor((panelHeight - 64) / Math.max(1, cut.dialogues.length)),
      );

      cut.dialogues.forEach((dialogue, index) => {
        const elementId = `${pageId}-dlg-${cut.cutNumber}-${index + 1}`;
        const alignRight = index % 2 === 1;
        const bx = alignRight
          ? sideMarginPx + panelWidth - bubbleWidth - 28
          : sideMarginPx + 28;
        const by = cursorY + 32 + index * verticalSlot;
        const isSfx = dialogue.kind === "sfx";
        const isNarration = dialogue.kind === "narration";

        elements.push({
          id: elementId,
          type: isSfx || isNarration ? "text" : "bubble",
          variant: isSfx || isNarration ? undefined : bubbleVariantForKind(dialogue.kind),
          name: isSfx
            ? `효과음 ${cut.cutNumber}-${index + 1}`
            : dialogue.speaker
              ? `${dialogue.speaker} 대사`
              : "나레이션",
          frameId: frameElementId,
          order: index + 1,
          x: bx,
          y: by,
          width: bubbleWidth,
          height: 96,
          text: dialogue.text,
        });

        dialogueBindings.push({
          lineId: dialogue.lineId,
          lineIndex: dialogue.lineIndex,
          elementId,
          speaker: dialogue.speaker,
          kind: dialogue.kind,
          seededText: dialogue.text,
        });
        totalDialogueCount += 1;
      });

      bindings.push({
        cutNumber: cut.cutNumber,
        pageId,
        frameElementId,
        dialogueBindings,
      });

      cursorY += panelHeight + gutterPx;
    }

    pages.push({
      id: pageId,
      canvasH: Math.max(viewportHeight, cursorY + 180),
      elements,
    });
  }

  return {
    parsed,
    pages,
    bindings,
    totalCutCount: parsed.cuts.length,
    totalDialogueCount,
  };
}

function formatDialogueScriptLine(
  speaker: string | null,
  kind: ScriptDialogueKind,
  text: string,
): string {
  if (kind === "narration") return `나레이션: ${text}`;
  if (kind === "sfx") return `효과음: ${text}`;
  const label = speaker ?? "화자";
  if (kind === "thought") return `${label}(생각): ${text}`;
  if (kind === "shout") return `${label}(외침): ${text}`;
  return `${label}: ${text}`;
}

/**
 * 캔버스/스토리 에디터에서 수정된 말풍선 대사를 원본 대본 텍스트로 양방향 역반영한다.
 * `[컷 N]` 마커와 지문은 그대로 유지하고 바뀐 대사 줄만 정밀 교체한다.
 */
export function syncCanvasDialoguesBackToScript(
  originalScript: string,
  pages: readonly DialoguePageLike[],
  bindings: readonly ScriptPanelSeedBinding[],
): BidirectionalSyncReport {
  const lines = originalScript.replace(/\r\n?/gu, "\n").split("\n");
  const currentTextByElementId = new Map<string, string>();
  for (const page of pages) {
    for (const element of page.elements) {
      if (isDialogueElement(element)) {
        currentTextByElementId.set(element.id, element.text);
      }
    }
  }

  let updatedLineCount = 0;
  let preservedUnchangedCount = 0;

  for (const cutBinding of bindings) {
    for (const dialogue of cutBinding.dialogueBindings) {
      const liveText = currentTextByElementId.get(dialogue.elementId);
      if (liveText === undefined) continue;
      if (liveText === dialogue.seededText) {
        preservedUnchangedCount += 1;
        continue;
      }
      if (dialogue.lineIndex >= 0 && dialogue.lineIndex < lines.length) {
        lines[dialogue.lineIndex] = formatDialogueScriptLine(
          dialogue.speaker,
          dialogue.kind,
          liveText,
        );
        updatedLineCount += 1;
      }
    }
  }

  return {
    updatedScript: lines.join("\n"),
    updatedLineCount,
    preservedUnchangedCount,
  };
}

/**
 * 대본을 다시 시드하더라도 캔버스에서 작가가 직접 고친 대사는 덮어쓰지 않고 보존한다.
 */
export function reconcileScriptWithCanvasEdits(
  previousSeed: SeededScriptCanvasResult,
  nextScriptText: string,
  currentPages: readonly DialoguePageLike[],
  options: SeedPanelsFromScriptOptions = {},
): ScriptReconcileResult {
  const liveTextByElementId = new Map<string, string>();
  for (const page of currentPages) {
    for (const element of page.elements) {
      if (isDialogueElement(element)) {
        liveTextByElementId.set(element.id, element.text);
      }
    }
  }

  const manualEditByLineId = new Map<string, string>();
  const previousElementIds = new Set<string>();
  for (const cutBinding of previousSeed.bindings) {
    for (const dialogue of cutBinding.dialogueBindings) {
      previousElementIds.add(dialogue.elementId);
      const live = liveTextByElementId.get(dialogue.elementId);
      if (live !== undefined && live !== dialogue.seededText) {
        manualEditByLineId.set(dialogue.lineId, live);
      }
    }
  }

  const freshSeed = seedPanelsFromScript(nextScriptText, options);
  const preservedCanvasEditIds: string[] = [];
  const nextElementIds = new Set<string>();
  const lineIdByElementId = new Map<string, string>();

  for (const cutBinding of freshSeed.bindings) {
    for (const dialogue of cutBinding.dialogueBindings) {
      nextElementIds.add(dialogue.elementId);
      lineIdByElementId.set(dialogue.elementId, dialogue.lineId);
    }
  }

  const mergedPages = freshSeed.pages.map((page) => ({
    ...page,
    elements: page.elements.map((element) => {
      if (!isDialogueElement(element)) return element;
      const lineId = lineIdByElementId.get(element.id);
      if (!lineId) return element;
      const manualText = manualEditByLineId.get(lineId);
      if (manualText === undefined) return element;
      preservedCanvasEditIds.push(element.id);
      return { ...element, text: manualText };
    }),
  }));

  const addedElementIds = [...nextElementIds].filter((id) => !previousElementIds.has(id));
  const removedElementIds = [...previousElementIds].filter((id) => !nextElementIds.has(id));

  return {
    pages: mergedPages,
    bindings: freshSeed.bindings,
    preservedCanvasEditIds,
    addedElementIds,
    removedElementIds,
  };
}

// ── 전 페이지 대사 일괄 검색·치환 헬퍼 ─────────────────────────────────────────

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * 스토리 에디터의 모든 페이지 대사에서 읽기 순서대로 매치 목록을 수집한다.
 */
export function collectStoryDialogueMatches(
  pages: readonly DialoguePageLike[],
  query: string,
  options: Pick<DialogueReplaceOptions, "caseSensitive" | "scope" | "currentPageId"> = {},
): readonly StoryDialogueMatch[] {
  if (!query) return [];
  const caseSensitive = options.caseSensitive ?? false;
  const scope = options.scope ?? "all";
  const regex = new RegExp(escapeRegExpLiteral(query), caseSensitive ? "gu" : "giu");
  const items = collectDialogueItems(pages);
  const matches: StoryDialogueMatch[] = [];

  for (const item of items) {
    if (scope === "current" && item.pageId !== options.currentPageId) continue;
    regex.lastIndex = 0;
    let occurrenceIndex = 0;
    let found = regex.exec(item.text);
    while (found !== null) {
      const start = found.index;
      const end = start + found[0].length;
      matches.push({
        matchId: `${item.pageId}:${item.id}:${occurrenceIndex}`,
        pageId: item.pageId,
        pageIndex: item.pageIndex,
        elementId: item.id,
        occurrenceIndex,
        start,
        end,
        fullText: item.text,
        locked: item.locked,
      });
      occurrenceIndex += 1;
      if (found[0].length === 0) break;
      found = regex.exec(item.text);
    }
  }

  return matches;
}

/**
 * 단일 매치(특정 요소 내 특정 위치)만 치환한 새 페이지 배열을 반환한다.
 * 잠긴 요소거나 범위가 유효하지 않으면 입력 배열을 그대로(참조 동일) 반환한다.
 */
export function replaceSingleStoryMatch(
  pages: readonly DialoguePageLike[],
  match: StoryDialogueMatch,
  replacement: string,
): readonly DialoguePageLike[] {
  if (match.locked) return pages;
  let changed = false;
  const next = pages.map((page) => {
    if (page.id !== match.pageId) return page;
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      if (element.id !== match.elementId || !isDialogueElement(element)) return element;
      if (match.start < 0 || match.end > element.text.length || match.end < match.start) {
        return element;
      }
      const nextText =
        element.text.slice(0, match.start) + replacement + element.text.slice(match.end);
      if (nextText === element.text) return element;
      pageChanged = true;
      return { ...element, text: nextText };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, elements };
  });
  return changed ? next : pages;
}

/**
 * 전 페이지 또는 현재 페이지의 대사를 일괄 치환하고 계획과 결과 페이지를 함께 반환한다.
 */
export function runStoryBatchFindReplace(
  pages: readonly DialoguePageLike[],
  find: string,
  replace: string,
  options: DialogueReplaceOptions = {},
): { readonly pages: readonly DialoguePageLike[]; readonly plan: DialogueReplacePlan } {
  const plan = planDialogueReplace(pages, find, replace, options);
  const nextPages = applyReplacePlanToPages(pages, plan);
  return { pages: nextPages, plan };
}
