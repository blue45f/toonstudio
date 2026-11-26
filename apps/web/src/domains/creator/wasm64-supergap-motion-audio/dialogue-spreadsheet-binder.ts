/**
 * #11 양방향 에피소드 대사 스프레드시트 ↔ 캔버스 실시간 바인더 (₩0 로컬).
 *
 * 60컷 이상의 에피소드 전체 말풍선 텍스트, KO/EN/JA/ZH 다국어 리플로우 박스 크기,
 * 화자 ID, AudioToon 보이스 타이밍 큐를 스프레드시트와 캔버스 양방향으로 동기화하며
 * 결정론적 Diff·Undo/Redo 트랜잭션 원장을 유지한다.
 */

import {
  ALL_DIALOGUE_LOCALES,
  cloneBalloonSnapshot,
  computeFnv1aHex,
  computeLocalizedBalloonReflow,
  diffChangedBalloonFields,
  LOCALE_TYPOGRAPHY_PROFILES,
  normalizeLocaleTexts,
  resolveLocaleText,
  type BalloonWritingDirection,
  type BatchDiffEntry,
  type BatchDiffRecord,
  type BoundBalloonStateSnapshot,
  type CanvasBalloonMutation,
  type CanvasBalloonNode,
  type DialogueBinderOptions,
  type DialogueCellPatch,
  type DialogueRowInit,
  type DialogueSpreadsheetRow,
  type DialogueSyncEvent,
  type DialogueSyncListener,
  type SupportedDialogueLocale,
  type VoiceCueOverlap,
  type VoiceEmotionTag,
  type VoiceTimingCue,
} from "./dialogue-reflow-and-types";

export {
  ALL_DIALOGUE_LOCALES,
  computeLocalizedBalloonReflow,
  LOCALE_TYPOGRAPHY_PROFILES,
  type BalloonReflowBox,
  type BalloonWritingDirection,
  type BatchDiffEntry,
  type BatchDiffRecord,
  type BoundBalloonStateSnapshot,
  type CanvasBalloonMutation,
  type CanvasBalloonNode,
  type DialogueBinderOptions,
  type DialogueCellPatch,
  type DialogueRowInit,
  type DialogueSpreadsheetRow,
  type DialogueSyncEvent,
  type DialogueSyncListener,
  type LocalizedTextMap,
  type LocaleTypographyProfile,
  type ReflowSizingOptions,
  type SupportedDialogueLocale,
  type VoiceCueOverlap,
  type VoiceEmotionTag,
  type VoiceTimingCue,
} from "./dialogue-reflow-and-types";

/**
 * 60컷 이상 에피소드의 대사 스프레드시트와 캔버스 말풍선 노드를 양방향 실시간 동기화한다.
 */
export class EpisodeDialogueSpreadsheetBinder {
  private readonly snapshots = new Map<string, BoundBalloonStateSnapshot>();
  private readonly maxWidthByBalloon = new Map<string, number>();
  private readonly orderedIds: string[] = [];
  private readonly undoStack: BatchDiffRecord[] = [];
  private readonly redoStack: BatchDiffRecord[] = [];
  private readonly canvasListeners = new Set<DialogueSyncListener>();
  private readonly spreadsheetListeners = new Set<DialogueSyncListener>();
  private readonly defaultLocale: SupportedDialogueLocale;
  private readonly autoCascadeTiming: boolean;
  private readonly interLineGapMs: number;
  private readonly maxUndoHistory: number;
  private revision = 0;

  constructor(rows: readonly DialogueRowInit[], options: DialogueBinderOptions = {}) {
    this.defaultLocale = options.defaultLocale ?? "ko";
    this.autoCascadeTiming = options.autoCascadeTiming ?? true;
    this.interLineGapMs = Math.max(0, options.interLineGapMs ?? 180);
    this.maxUndoHistory = Math.max(8, options.maxUndoHistory ?? 128);

    const sorted = rows.slice().sort((a, b) => {
      if (a.cutOrder !== b.cutOrder) return a.cutOrder - b.cutOrder;
      return a.orderInCut - b.orderInCut;
    });

    let runningVoiceCursorMs = 0;
    for (let i = 0; i < sorted.length; i += 1) {
      const init = sorted[i];
      const activeLocale = init.activeLocale ?? this.defaultLocale;
      const fallbackText =
        init.localeTexts[activeLocale] ??
        init.localeTexts.ko ??
        init.localeTexts.en ??
        init.localeTexts.ja ??
        init.localeTexts.zh ??
        "";
      const localeTexts = normalizeLocaleTexts(init.localeTexts, fallbackText);
      const text = resolveLocaleText(localeTexts, activeLocale);
      const maxWidthPx = init.maxWidthPx ?? LOCALE_TYPOGRAPHY_PROFILES[activeLocale].defaultMaxWidthPx;
      this.maxWidthByBalloon.set(init.balloonId, maxWidthPx);

      const reflowBox = computeLocalizedBalloonReflow(text, activeLocale, {
        fontSizePx: init.fontSizePx,
        maxWidthPx,
        writingDirection: init.writingDirection,
      });
      const startMs = init.voiceStartMs ?? runningVoiceCursorMs;
      const durationMs = init.voiceDurationMs ?? reflowBox.estimatedSpeechDurationMs;
      const endMs = startMs + durationMs;
      runningVoiceCursorMs = Math.max(runningVoiceCursorMs, endMs + this.interLineGapMs);

      const widthPx = init.widthPx ?? reflowBox.widthPx;
      const heightPx = init.heightPx ?? reflowBox.heightPx;
      const emotionTag = init.emotionTag ?? "neutral";
      const voiceCue: VoiceTimingCue = {
        balloonId: init.balloonId,
        cutId: init.cutId,
        speakerId: init.speakerId,
        startMs,
        durationMs,
        endMs,
        emotionTag,
        locale: activeLocale,
        text,
      };
      const row: DialogueSpreadsheetRow = {
        balloonId: init.balloonId,
        cutId: init.cutId,
        cutOrder: init.cutOrder,
        orderInCut: init.orderInCut,
        speakerId: init.speakerId,
        speakerName: init.speakerName ?? init.speakerId,
        activeLocale,
        text,
        localeTexts,
        emotionTag,
        voiceCue,
        reflowBox,
        manualSizeOverride: init.widthPx !== undefined || init.heightPx !== undefined,
      };
      const canvas: CanvasBalloonNode = {
        balloonId: init.balloonId,
        cutId: init.cutId,
        speakerId: init.speakerId,
        activeLocale,
        text,
        lines: reflowBox.lines,
        x: init.x,
        y: init.y,
        widthPx,
        heightPx,
        fontSizePx: reflowBox.fontSizePx,
        writingDirection: reflowBox.writingDirection,
        overflowClamped: reflowBox.overflowClamped,
        voiceStartMs: startMs,
        voiceDurationMs: durationMs,
      };

      this.snapshots.set(init.balloonId, { row, canvas });
      this.orderedIds.push(init.balloonId);
    }
  }

  public getRevision(): number {
    return this.revision;
  }

  public getRowCount(): number {
    return this.orderedIds.length;
  }

  public getCutCount(): number {
    const cutIds = new Set<string>();
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const snap = this.snapshots.get(this.orderedIds[i]);
      if (snap) cutIds.add(snap.row.cutId);
    }
    return cutIds.size;
  }

  public getSpreadsheetRows(): readonly DialogueSpreadsheetRow[] {
    const rows: DialogueSpreadsheetRow[] = [];
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const snap = this.snapshots.get(this.orderedIds[i]);
      if (snap) rows.push(snap.row);
    }
    return rows;
  }

  public getCanvasBalloons(): readonly CanvasBalloonNode[] {
    const nodes: CanvasBalloonNode[] = [];
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const snap = this.snapshots.get(this.orderedIds[i]);
      if (snap) nodes.push(snap.canvas);
    }
    return nodes;
  }

  public getBalloon(balloonId: string): BoundBalloonStateSnapshot | undefined {
    const snap = this.snapshots.get(balloonId);
    return snap ? cloneBalloonSnapshot(snap) : undefined;
  }

  public subscribeCanvasSync(listener: DialogueSyncListener): () => void {
    this.canvasListeners.add(listener);
    return () => {
      this.canvasListeners.delete(listener);
    };
  }

  public subscribeSpreadsheetSync(listener: DialogueSyncListener): () => void {
    this.spreadsheetListeners.add(listener);
    return () => {
      this.spreadsheetListeners.delete(listener);
    };
  }

  /**
   * 스프레드시트 다중 셀 배치 편집을 적용하고 캔버스 리플로우 + 보이스 타이밍 큐를 동기화한다.
   */
  public applySpreadsheetBatchEdit(
    patches: readonly DialogueCellPatch[],
    reason = "spreadsheet-batch-edit",
    source: BatchDiffRecord["source"] = "spreadsheet",
  ): BatchDiffRecord {
    const entries: BatchDiffEntry[] = [];
    const touchedIndices = new Set<number>();

    for (let i = 0; i < patches.length; i += 1) {
      const patch = patches[i];
      const existing = this.snapshots.get(patch.balloonId);
      if (!existing) continue;

      const before = cloneBalloonSnapshot(existing);
      const nextLocale = patch.locale ?? existing.row.activeLocale;
      const nextLocaleTexts: Record<SupportedDialogueLocale, string> = {
        ...existing.row.localeTexts,
      };
      if (patch.localeTexts) {
        for (let l = 0; l < ALL_DIALOGUE_LOCALES.length; l += 1) {
          const loc = ALL_DIALOGUE_LOCALES[l];
          const val = patch.localeTexts[loc];
          if (val !== undefined) nextLocaleTexts[loc] = val;
        }
      }
      if (patch.text !== undefined) {
        nextLocaleTexts[nextLocale] = patch.text;
      }

      const nextText = resolveLocaleText(nextLocaleTexts, nextLocale);
      const nextSpeakerId = patch.speakerId ?? existing.row.speakerId;
      const nextSpeakerName = patch.speakerName ?? (patch.speakerId ? patch.speakerId : existing.row.speakerName);
      const nextEmotion = patch.emotionTag ?? existing.row.emotionTag;
      const maxWidthPx =
        patch.maxWidthPx ??
        this.maxWidthByBalloon.get(patch.balloonId) ??
        LOCALE_TYPOGRAPHY_PROFILES[nextLocale].defaultMaxWidthPx;
      this.maxWidthByBalloon.set(patch.balloonId, maxWidthPx);

      const reflowBox = computeLocalizedBalloonReflow(nextText, nextLocale, {
        fontSizePx: patch.fontSizePx ?? existing.canvas.fontSizePx,
        maxWidthPx,
        writingDirection: patch.writingDirection ?? existing.canvas.writingDirection,
      });
      const autoReflow = patch.autoReflow ?? true;
      const nextWidthPx = autoReflow ? reflowBox.widthPx : existing.canvas.widthPx;
      const nextHeightPx = autoReflow ? reflowBox.heightPx : existing.canvas.heightPx;

      const textChanged = nextText !== existing.row.text || nextLocale !== existing.row.activeLocale;
      const nextStartMs = patch.voiceStartMs ?? existing.row.voiceCue.startMs;
      const nextDurationMs =
        patch.voiceDurationMs ??
        (textChanged ? reflowBox.estimatedSpeechDurationMs : existing.row.voiceCue.durationMs);

      const nextVoiceCue: VoiceTimingCue = {
        balloonId: existing.row.balloonId,
        cutId: existing.row.cutId,
        speakerId: nextSpeakerId,
        startMs: nextStartMs,
        durationMs: nextDurationMs,
        endMs: nextStartMs + nextDurationMs,
        emotionTag: nextEmotion,
        locale: nextLocale,
        text: nextText,
      };

      const after: BoundBalloonStateSnapshot = {
        row: {
          ...existing.row,
          speakerId: nextSpeakerId,
          speakerName: nextSpeakerName,
          activeLocale: nextLocale,
          text: nextText,
          localeTexts: nextLocaleTexts,
          emotionTag: nextEmotion,
          voiceCue: nextVoiceCue,
          reflowBox,
          manualSizeOverride: !autoReflow && existing.row.manualSizeOverride,
        },
        canvas: {
          ...existing.canvas,
          speakerId: nextSpeakerId,
          activeLocale: nextLocale,
          text: nextText,
          lines: reflowBox.lines,
          widthPx: nextWidthPx,
          heightPx: nextHeightPx,
          fontSizePx: reflowBox.fontSizePx,
          writingDirection: reflowBox.writingDirection,
          overflowClamped: reflowBox.overflowClamped,
          voiceStartMs: nextStartMs,
          voiceDurationMs: nextDurationMs,
        },
      };

      const changedFields = diffChangedBalloonFields(before, after);
      if (changedFields.length > 0) {
        this.snapshots.set(patch.balloonId, after);
        entries.push({
          balloonId: patch.balloonId,
          cutId: existing.row.cutId,
          changedFields,
          before,
          after,
        });
        const idx = this.orderedIds.indexOf(patch.balloonId);
        if (idx >= 0) touchedIndices.add(idx);
      }
    }

    if (this.autoCascadeTiming && touchedIndices.size > 0) {
      this.cascadeFollowingVoiceCues(entries);
    }

    return this.commitTransaction(source, reason, entries, true);
  }

  /**
   * 캔버스에서 말풍선 위치·크기·텍스트를 직접 수정했을 때 스프레드시트 행으로 역동기화한다.
   */
  public applyCanvasBalloonUpdate(
    mutation: CanvasBalloonMutation,
    reason = "canvas-direct-edit",
  ): BatchDiffRecord {
    const existing = this.snapshots.get(mutation.balloonId);
    if (!existing) {
      return this.commitTransaction("canvas", reason, [], false);
    }
    const before = cloneBalloonSnapshot(existing);
    const nextText = mutation.text ?? existing.canvas.text;
    const nextLocale = existing.row.activeLocale;
    const nextLocaleTexts: Record<SupportedDialogueLocale, string> = {
      ...existing.row.localeTexts,
      [nextLocale]: nextText,
    };
    const nextSpeakerId = mutation.speakerId ?? existing.canvas.speakerId;
    const targetMaxWidth = mutation.widthPx ?? existing.canvas.widthPx;
    const reflowBox = computeLocalizedBalloonReflow(nextText, nextLocale, {
      fontSizePx: existing.canvas.fontSizePx,
      maxWidthPx: targetMaxWidth,
      maxHeightPx: mutation.heightPx ?? 420,
      writingDirection: existing.canvas.writingDirection,
    });

    const nextWidthPx = mutation.widthPx ?? reflowBox.widthPx;
    const nextHeightPx = mutation.heightPx ?? reflowBox.heightPx;
    const nextStartMs = mutation.voiceStartMs ?? existing.row.voiceCue.startMs;
    const nextDurationMs =
      mutation.voiceDurationMs ??
      (nextText !== existing.canvas.text
        ? reflowBox.estimatedSpeechDurationMs
        : existing.row.voiceCue.durationMs);

    const after: BoundBalloonStateSnapshot = {
      row: {
        ...existing.row,
        speakerId: nextSpeakerId,
        text: nextText,
        localeTexts: nextLocaleTexts,
        voiceCue: {
          ...existing.row.voiceCue,
          speakerId: nextSpeakerId,
          startMs: nextStartMs,
          durationMs: nextDurationMs,
          endMs: nextStartMs + nextDurationMs,
          text: nextText,
        },
        reflowBox,
        manualSizeOverride:
          mutation.widthPx !== undefined || mutation.heightPx !== undefined
            ? true
            : existing.row.manualSizeOverride,
      },
      canvas: {
        ...existing.canvas,
        speakerId: nextSpeakerId,
        text: nextText,
        lines: reflowBox.lines,
        x: mutation.x ?? existing.canvas.x,
        y: mutation.y ?? existing.canvas.y,
        widthPx: nextWidthPx,
        heightPx: nextHeightPx,
        overflowClamped: reflowBox.overflowClamped || nextHeightPx < reflowBox.heightPx,
        voiceStartMs: nextStartMs,
        voiceDurationMs: nextDurationMs,
      },
    };

    const changedFields = diffChangedBalloonFields(before, after);
    const entries: BatchDiffEntry[] = [];
    if (changedFields.length > 0) {
      this.snapshots.set(mutation.balloonId, after);
      entries.push({
        balloonId: mutation.balloonId,
        cutId: existing.row.cutId,
        changedFields,
        before,
        after,
      });
    }

    return this.commitTransaction("canvas", reason, entries, true);
  }

  public switchEpisodeLocale(
    locale: SupportedDialogueLocale,
    writingDirection?: BalloonWritingDirection,
  ): BatchDiffRecord {
    const patches: DialogueCellPatch[] = [];
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      patches.push({
        balloonId: this.orderedIds[i],
        locale,
        writingDirection,
        autoReflow: true,
      });
    }
    return this.applySpreadsheetBatchEdit(patches, `switch-locale:${locale}`, "locale-switch");
  }

  public undo(): BatchDiffRecord | null {
    const last = this.undoStack.pop();
    if (!last) return null;

    const reversedEntries: BatchDiffEntry[] = [];
    for (let i = last.entries.length - 1; i >= 0; i -= 1) {
      const entry = last.entries[i];
      const restored = cloneBalloonSnapshot(entry.before);
      this.snapshots.set(entry.balloonId, restored);
      reversedEntries.push({
        balloonId: entry.balloonId,
        cutId: entry.cutId,
        changedFields: entry.changedFields,
        before: cloneBalloonSnapshot(entry.after),
        after: restored,
      });
    }

    this.redoStack.push(last);
    return this.commitTransaction("undo", `undo:${last.txId}`, reversedEntries, false);
  }

  public redo(): BatchDiffRecord | null {
    const next = this.redoStack.pop();
    if (!next) return null;

    const reappliedEntries: BatchDiffEntry[] = [];
    for (let i = 0; i < next.entries.length; i += 1) {
      const entry = next.entries[i];
      const restored = cloneBalloonSnapshot(entry.after);
      this.snapshots.set(entry.balloonId, restored);
      reappliedEntries.push({
        balloonId: entry.balloonId,
        cutId: entry.cutId,
        changedFields: entry.changedFields,
        before: cloneBalloonSnapshot(entry.before),
        after: restored,
      });
    }

    this.undoStack.push(next);
    return this.commitTransaction("redo", `redo:${next.txId}`, reappliedEntries, false);
  }

  public getUndoDepth(): number {
    return this.undoStack.length;
  }

  public getRedoDepth(): number {
    return this.redoStack.length;
  }

  public getAudioToonCueSheet(): readonly VoiceTimingCue[] {
    const cues: VoiceTimingCue[] = [];
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const snap = this.snapshots.get(this.orderedIds[i]);
      if (snap) cues.push(snap.row.voiceCue);
    }
    return cues.sort((a, b) => a.startMs - b.startMs);
  }

  public detectVoiceCueOverlaps(): readonly VoiceCueOverlap[] {
    const cues = this.getAudioToonCueSheet();
    const overlaps: VoiceCueOverlap[] = [];
    for (let i = 1; i < cues.length; i += 1) {
      const prev = cues[i - 1];
      const curr = cues[i];
      if (prev.endMs > curr.startMs) {
        overlaps.push({
          firstBalloonId: prev.balloonId,
          secondBalloonId: curr.balloonId,
          cutId: curr.cutId,
          overlapMs: prev.endMs - curr.startMs,
        });
      }
    }
    return overlaps;
  }

  public exportToTsv(): string {
    const header = "balloonId\tcutId\tspeakerId\temotionTag\tstartMs\tdurationMs\tko\ten\tja\tzh";
    const lines: string[] = [header];
    const escapeCell = (val: string): string => val.replace(/\t/g, " ").replace(/\n/g, "\\n");

    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const snap = this.snapshots.get(this.orderedIds[i]);
      if (!snap) continue;
      const r = snap.row;
      lines.push(
        [
          r.balloonId,
          r.cutId,
          r.speakerId,
          r.emotionTag,
          String(r.voiceCue.startMs),
          String(r.voiceCue.durationMs),
          escapeCell(r.localeTexts.ko),
          escapeCell(r.localeTexts.en),
          escapeCell(r.localeTexts.ja),
          escapeCell(r.localeTexts.zh),
        ].join("\t"),
      );
    }
    return lines.join("\n");
  }

  public importFromTsv(tsv: string): BatchDiffRecord {
    const rawLines = tsv.replace(/\r\n/g, "\n").split("\n");
    const patches: DialogueCellPatch[] = [];
    const unescapeCell = (val: string): string => val.replace(/\\n/g, "\n");

    for (let i = 1; i < rawLines.length; i += 1) {
      const line = rawLines[i].trim();
      if (line.length === 0) continue;
      const cols = rawLines[i].split("\t");
      if (cols.length < 10) continue;
      const startMs = Number(cols[4]);
      const durationMs = Number(cols[5]);
      patches.push({
        balloonId: cols[0],
        speakerId: cols[2],
        emotionTag: cols[3] as VoiceEmotionTag,
        voiceStartMs: Number.isFinite(startMs) ? startMs : undefined,
        voiceDurationMs: Number.isFinite(durationMs) ? durationMs : undefined,
        localeTexts: {
          ko: unescapeCell(cols[6]),
          en: unescapeCell(cols[7]),
          ja: unescapeCell(cols[8]),
          zh: unescapeCell(cols[9]),
        },
        autoReflow: true,
      });
    }
    return this.applySpreadsheetBatchEdit(patches, "tsv-import", "tsv-import");
  }

  private cascadeFollowingVoiceCues(entries: BatchDiffEntry[]): void {
    const existingEntryById = new Map<string, BatchDiffEntry>();
    for (let i = 0; i < entries.length; i += 1) {
      existingEntryById.set(entries[i].balloonId, entries[i]);
    }

    let prevEndMs = -this.interLineGapMs;
    for (let i = 0; i < this.orderedIds.length; i += 1) {
      const id = this.orderedIds[i];
      const snap = this.snapshots.get(id);
      if (!snap) continue;
      const minAllowedStart = prevEndMs + this.interLineGapMs;
      if (snap.row.voiceCue.startMs < minAllowedStart) {
        const before = existingEntryById.get(id)?.before ?? cloneBalloonSnapshot(snap);
        const shiftedStart = minAllowedStart;
        const shiftedEnd = shiftedStart + snap.row.voiceCue.durationMs;
        const after: BoundBalloonStateSnapshot = {
          row: {
            ...snap.row,
            voiceCue: { ...snap.row.voiceCue, startMs: shiftedStart, endMs: shiftedEnd },
          },
          canvas: { ...snap.canvas, voiceStartMs: shiftedStart },
        };
        this.snapshots.set(id, after);
        const existingEntry = existingEntryById.get(id);
        if (existingEntry) {
          const idx = entries.indexOf(existingEntry);
          entries[idx] = {
            ...existingEntry,
            changedFields: diffChangedBalloonFields(before, after),
            after,
          };
        } else {
          const added: BatchDiffEntry = {
            balloonId: id,
            cutId: snap.row.cutId,
            changedFields: diffChangedBalloonFields(before, after),
            before,
            after,
          };
          entries.push(added);
          existingEntryById.set(id, added);
        }
        prevEndMs = shiftedEnd;
      } else {
        prevEndMs = snap.row.voiceCue.endMs;
      }
    }
  }

  private commitTransaction(
    source: BatchDiffRecord["source"],
    reason: string,
    entries: readonly BatchDiffEntry[],
    recordHistory: boolean,
  ): BatchDiffRecord {
    this.revision += 1;
    const payload = entries
      .map(
        (e) =>
          `${e.balloonId}:${e.after.row.activeLocale}:${e.after.row.speakerId}:${e.after.row.text}:${e.after.canvas.widthPx}x${e.after.canvas.heightPx}:${e.after.row.voiceCue.startMs}+${e.after.row.voiceCue.durationMs}`,
      )
      .join("|");

    const record: BatchDiffRecord = {
      txId: `tx-${this.revision}`,
      revision: this.revision,
      source,
      reason,
      timestampMs: Date.now(),
      checksum: computeFnv1aHex(`${this.revision}|${source}|${payload}`),
      entries,
    };

    if (recordHistory && entries.length > 0) {
      this.undoStack.push(record);
      if (this.undoStack.length > this.maxUndoHistory) {
        this.undoStack.shift();
      }
      this.redoStack.length = 0;
    }

    if (entries.length > 0) {
      const affectedBalloonIds = entries.map((e) => e.balloonId);
      const cutSet = new Set<string>();
      for (let i = 0; i < entries.length; i += 1) {
        cutSet.add(entries[i].cutId);
      }
      const event: DialogueSyncEvent = {
        record,
        affectedBalloonIds,
        affectedCutIds: Array.from(cutSet),
      };

      if (source !== "canvas") {
        this.canvasListeners.forEach((listener) => listener(event));
      }
      if (source !== "spreadsheet") {
        this.spreadsheetListeners.forEach((listener) => listener(event));
      }
    }

    return record;
  }
}
