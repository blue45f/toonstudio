import { diffChars, diffLines, type Change } from "diff";

/**
 * Line/character level text diff for dialogue and script versions.
 *
 * The semantic revision diff (`studio-revision-diff`) deliberately never copies text into its
 * result; it only reports that an element's text changed. This module is the companion surface:
 * given the two resolved text values, it produces exactly what a reviewer needs to see which
 * words changed. It is built on jsdiff (`diff`, BSD-3-Clause) with function-level imports so the
 * library only lands in the review/version-compare chunk that imports this module.
 */

/** Inputs longer than this are clipped before diffing so a pasted manuscript cannot stall the UI. */
export const STUDIO_TEXT_DIFF_MAX_INPUT_CHARS = 200_000;
/** Keeps the rendered row list bounded even for episode-length scripts. */
export const STUDIO_TEXT_DIFF_MAX_OUTPUT_LINES = 2_000;

export type StudioTextDiffSegmentKind = "same" | "added" | "removed";

export interface StudioTextDiffSegment {
  value: string;
  kind: StudioTextDiffSegmentKind;
}

export type StudioTextDiffLineKind = "unchanged" | "added" | "removed" | "modified";

export interface StudioTextDiffLine {
  kind: StudioTextDiffLineKind;
  /** 1-based line number in the before text, or null for added lines. */
  beforeLineNumber: number | null;
  /** 1-based line number in the after text, or null for removed lines. */
  afterLineNumber: number | null;
  /** Full line text for unchanged/added/removed rows. Empty for modified rows. */
  text: string;
  /** Character segments of the before line; only present for modified rows. */
  beforeSegments: readonly StudioTextDiffSegment[] | null;
  /** Character segments of the after line; only present for modified rows. */
  afterSegments: readonly StudioTextDiffSegment[] | null;
}

export interface StudioTextDiffSummary {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  unchangedLines: number;
  addedChars: number;
  removedChars: number;
}

export interface StudioTextDiffResult {
  /** True when the two texts are identical after newline normalisation. */
  identical: boolean;
  /** True when an input or the output had to be clipped to the safety limits above. */
  truncated: boolean;
  lines: readonly StudioTextDiffLine[];
  summary: StudioTextDiffSummary;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Splits one jsdiff change value into lines, dropping the single trailing newline it carries. */
function changeLines(change: Change): string[] {
  if (change.value === "") return [];
  const body = change.value.endsWith("\n") ? change.value.slice(0, -1) : change.value;
  return body.split("\n");
}

function toSegments(changes: readonly Change[], side: "before" | "after"): StudioTextDiffSegment[] {
  const segments: StudioTextDiffSegment[] = [];
  for (const change of changes) {
    if (change.value === "") continue;
    if (change.added) {
      if (side === "after") segments.push({ value: change.value, kind: "added" });
    } else if (change.removed) {
      if (side === "before") segments.push({ value: change.value, kind: "removed" });
    } else {
      segments.push({ value: change.value, kind: "same" });
    }
  }
  return segments;
}

function countSegmentChars(segments: readonly StudioTextDiffSegment[], kind: StudioTextDiffSegmentKind): number {
  let total = 0;
  for (const segment of segments) {
    if (segment.kind === kind) total += segment.value.length;
  }
  return total;
}

/**
 * Computes a line-oriented diff where lines that were edited in place are paired up and carry
 * character-level segments, so a reviewer sees the exact words that changed inside the line
 * instead of a whole-line red/green replacement.
 */
export function computeStudioTextDiff(beforeText: string, afterText: string): StudioTextDiffResult {
  let truncated = false;
  let before = normalizeNewlines(beforeText);
  let after = normalizeNewlines(afterText);
  if (before.length > STUDIO_TEXT_DIFF_MAX_INPUT_CHARS) {
    before = before.slice(0, STUDIO_TEXT_DIFF_MAX_INPUT_CHARS);
    truncated = true;
  }
  if (after.length > STUDIO_TEXT_DIFF_MAX_INPUT_CHARS) {
    after = after.slice(0, STUDIO_TEXT_DIFF_MAX_INPUT_CHARS);
    truncated = true;
  }

  const summary: StudioTextDiffSummary = {
    addedLines: 0,
    removedLines: 0,
    modifiedLines: 0,
    unchangedLines: 0,
    addedChars: 0,
    removedChars: 0,
  };
  const lines: StudioTextDiffLine[] = [];
  const pushLine = (line: StudioTextDiffLine): void => {
    if (lines.length < STUDIO_TEXT_DIFF_MAX_OUTPUT_LINES) lines.push(line);
    else truncated = true;
  };

  if (before === after) {
    for (const [index, text] of before.split("\n").entries()) {
      summary.unchangedLines += 1;
      pushLine({
        kind: "unchanged",
        beforeLineNumber: index + 1,
        afterLineNumber: index + 1,
        text,
        beforeSegments: null,
        afterSegments: null,
      });
    }
    return { identical: true, truncated, lines, summary };
  }

  const changes = diffLines(before, after);
  let beforeLineNumber = 1;
  let afterLineNumber = 1;
  let index = 0;
  while (index < changes.length) {
    const change = changes[index];
    if (!change.added && !change.removed) {
      for (const text of changeLines(change)) {
        summary.unchangedLines += 1;
        pushLine({
          kind: "unchanged",
          beforeLineNumber: beforeLineNumber++,
          afterLineNumber: afterLineNumber++,
          text,
          beforeSegments: null,
          afterSegments: null,
        });
      }
      index += 1;
      continue;
    }

    // A change block: a run of removed lines followed by a run of added lines (either may be
    // empty). Pair them positionally so edited lines become "modified" rows with char segments.
    const removedLines: string[] = [];
    const addedLines: string[] = [];
    while (index < changes.length && changes[index].removed) {
      removedLines.push(...changeLines(changes[index]));
      index += 1;
    }
    while (index < changes.length && changes[index].added) {
      addedLines.push(...changeLines(changes[index]));
      index += 1;
    }

    const paired = Math.min(removedLines.length, addedLines.length);
    for (let pair = 0; pair < paired; pair += 1) {
      const charChanges = diffChars(removedLines[pair], addedLines[pair]);
      const beforeSegments = toSegments(charChanges, "before");
      const afterSegments = toSegments(charChanges, "after");
      summary.modifiedLines += 1;
      summary.removedChars += countSegmentChars(beforeSegments, "removed");
      summary.addedChars += countSegmentChars(afterSegments, "added");
      pushLine({
        kind: "modified",
        beforeLineNumber: beforeLineNumber++,
        afterLineNumber: afterLineNumber++,
        text: "",
        beforeSegments,
        afterSegments,
      });
    }
    for (let rest = paired; rest < removedLines.length; rest += 1) {
      summary.removedLines += 1;
      summary.removedChars += removedLines[rest].length;
      pushLine({
        kind: "removed",
        beforeLineNumber: beforeLineNumber++,
        afterLineNumber: null,
        text: removedLines[rest],
        beforeSegments: null,
        afterSegments: null,
      });
    }
    for (let rest = paired; rest < addedLines.length; rest += 1) {
      summary.addedLines += 1;
      summary.addedChars += addedLines[rest].length;
      pushLine({
        kind: "added",
        beforeLineNumber: null,
        afterLineNumber: afterLineNumber++,
        text: addedLines[rest],
        beforeSegments: null,
        afterSegments: null,
      });
    }
  }

  return { identical: false, truncated, lines, summary };
}

/** True when the diff contains any added, removed, or modified line. */
export function studioTextDiffHasChanges(diff: StudioTextDiffResult): boolean {
  return !diff.identical;
}
