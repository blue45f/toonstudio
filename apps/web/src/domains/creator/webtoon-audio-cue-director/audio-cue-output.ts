import { formatSmpteTimecode, formatWebVttTimestamp, type EpisodeAudioCueSheet, type ExportWebVttOptions, type ExportAudioCueJsonOptions, type AudioCueEdlEvent } from "./audio-cue-director-engine";
import { assertAudioCueExport } from "./audio-cue-input-contract";

function round1(value: number): number { return Math.round(value * 10) / 10; }

function sanitizeWebVttText(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/\r?\n+/gu, " ");
}

/** 에피소드 오디오 큐시트를 표준 WebVTT(`.vtt`) 자막 문자열로 직렬화한다. */
export function exportAudioCueWebVtt(cueSheet: EpisodeAudioCueSheet, options?: ExportWebVttOptions): string {
  assertAudioCueExport(cueSheet);
  const includeCueNotes = options?.includeCueNotes ?? true;
  const includeSfxCaptions = options?.includeSfxCaptions ?? true;
  const lines: string[] = ["WEBVTT", ""];

  if (includeCueNotes) {
    lines.push(
      `NOTE ${sanitizeWebVttText(cueSheet.episodeTitle)} | dataSourceKind=${cueSheet.dataSourceKind} | target=${cueSheet.targetLufs} LUFS | ducking=${cueSheet.dialogueDuckingDb} dB | fps=${cueSheet.fps}`,
      "",
    );
  }

  let cueNumber = 1;
  for (const cut of cueSheet.cuts) {
    if (cut.lipSync.hasSpokenDialogue && cut.dialogue.length > 0) {
      const startTs = formatWebVttTimestamp(cut.lipSync.startTimeMs);
      const endTs = formatWebVttTimestamp(Math.max(cut.lipSync.startTimeMs + 100, cut.lipSync.endTimeMs));
      if (includeCueNotes) {
        lines.push(`NOTE cut=${cut.cutId} scroll=${cut.scrollStartPct}%..${cut.scrollEndPct}% mood=${cut.bgmMood} tone=${cut.emotionTone} duck=${cut.isDuckingActive ? `${cueSheet.dialogueDuckingDb}dB` : "0dB"}`, "");
      }
      lines.push(String(cueNumber), `${startTs} --> ${endTs}`, `<v ${sanitizeWebVttText(cut.speaker || "화자")}>${sanitizeWebVttText(cut.dialogue)}`, "");
      cueNumber += 1;
    }
    if (includeSfxCaptions) {
      for (const sfx of cut.sfxEvents) {
        const startTs = formatWebVttTimestamp(sfx.triggerTimeMs);
        const endTs = formatWebVttTimestamp(Math.max(sfx.triggerTimeMs + 120, sfx.endTimeMs));
        lines.push(String(cueNumber), `${startTs} --> ${endTs}`, `[SFX: ${sanitizeWebVttText(sfx.label)}]`, "");
        cueNumber += 1;
      }
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** 에피소드 오디오 큐시트를 SMPTE 타임코드 기반 EDL/JSON 문자열로 직렬화한다. */
export function exportAudioCueJson(cueSheet: EpisodeAudioCueSheet, options?: ExportAudioCueJsonOptions): string {
  assertAudioCueExport(cueSheet);
  const includeLipSyncFrames = options?.includeLipSyncFrames ?? false;
  const pretty = options?.pretty ?? true;
  const edlEvents: AudioCueEdlEvent[] = [];
  let edlIndex = 1;

  for (const tr of cueSheet.bgmTransitions) {
    const outMs = tr.triggerTimeMs + Math.max(100, tr.crossfadeMs);
    edlEvents.push({
      edlIndex: edlIndex++, track: "BGM", cutId: tr.cutId, cutIndex: tr.cutIndex, triggerScrollPct: tr.triggerScrollPct,
      inTimeMs: tr.triggerTimeMs, outTimeMs: round1(outMs),
      inTimecode: formatSmpteTimecode(tr.triggerTimeMs, cueSheet.fps), outTimecode: formatSmpteTimecode(outMs, cueSheet.fps),
      label: `${tr.fromMood ?? "START"} -> ${tr.toMood}`, detail: `crossfade=${tr.crossfadeMs}ms curve=${tr.curve} target=${tr.targetLufs}LUFS`,
    });
  }
  for (const cut of cueSheet.cuts) {
    if (cut.lipSync.hasSpokenDialogue) {
      edlEvents.push({
        edlIndex: edlIndex++, track: "VOICE", cutId: cut.cutId, cutIndex: cut.cutIndex, triggerScrollPct: cut.scrollStartPct,
        inTimeMs: cut.lipSync.startTimeMs, outTimeMs: cut.lipSync.endTimeMs,
        inTimecode: formatSmpteTimecode(cut.lipSync.startTimeMs, cueSheet.fps), outTimecode: formatSmpteTimecode(cut.lipSync.endTimeMs, cueSheet.fps),
        label: `${cut.speaker || "화자"} (${cut.emotionTone})`, detail: `syllables=${cut.lipSync.hangulSyllableCount} frames=${cut.lipSync.totalFrames}`,
      });
    }
  }
  for (const env of cueSheet.duckingEnvelopes) {
    edlEvents.push({
      edlIndex: edlIndex++, track: "DUCK", cutId: env.cutId, cutIndex: env.cutIndex, triggerScrollPct: env.triggerScrollPct,
      inTimeMs: env.startTimeMs, outTimeMs: env.endTimeMs,
      inTimecode: formatSmpteTimecode(env.startTimeMs, cueSheet.fps), outTimecode: formatSmpteTimecode(env.endTimeMs, cueSheet.fps),
      label: `BGM Duck ${env.duckingDb}dB`, detail: `base=${env.baseLufs}LUFS ducked=${env.duckedLufs}LUFS attack=${env.attackMs}ms release=${env.releaseMs}ms`,
    });
  }
  for (const sfx of cueSheet.sfxSchedule) {
    edlEvents.push({
      edlIndex: edlIndex++, track: "SFX", cutId: sfx.cutId, cutIndex: sfx.cutIndex, triggerScrollPct: sfx.triggerScrollPct,
      inTimeMs: sfx.triggerTimeMs, outTimeMs: sfx.endTimeMs,
      inTimecode: formatSmpteTimecode(sfx.triggerTimeMs, cueSheet.fps), outTimecode: formatSmpteTimecode(sfx.endTimeMs, cueSheet.fps),
      label: sfx.label, detail: `category=${sfx.category} gain=${sfx.gainDb}dB pan=${sfx.pan} peakLimit=${sfx.peakLimitDbfs}dBFS`,
    });
  }

  edlEvents.sort((a, b) => a.inTimeMs - b.inTimeMs || a.edlIndex - b.edlIndex);

  const payload = {
    schemaVersion: "webtoon-audio-cue-edl/v1" as const,
    dataSourceKind: cueSheet.dataSourceKind,
    estimateNoticeKo: cueSheet.estimateNoticeKo,
    metadata: {
      episodeTitle: cueSheet.episodeTitle, originalEpisodeTitle: cueSheet.originalEpisodeTitle ?? cueSheet.episodeTitle, episodeNumber: cueSheet.episodeNumber, fps: cueSheet.fps,
      targetLufs: cueSheet.targetLufs, dialogueDuckingDb: cueSheet.dialogueDuckingDb,
      duckingAttackMs: cueSheet.duckingAttackMs, duckingReleaseMs: cueSheet.duckingReleaseMs,
      totalDurationMs: cueSheet.totalDurationMs, totalDurationTimecode: formatSmpteTimecode(cueSheet.totalDurationMs, cueSheet.fps),
      totalPanelHeightPx: cueSheet.totalPanelHeightPx,
    },
    summary: cueSheet.summary,
    edlEvents: edlEvents.map((ev, idx) => ({ ...ev, edlIndex: idx + 1 })),
    bgmTransitions: cueSheet.bgmTransitions,
    duckingEnvelopes: cueSheet.duckingEnvelopes,
    sfxSchedule: cueSheet.sfxSchedule,
    cuts: cueSheet.cuts.map((cut) => ({
      cutId: cut.cutId, cutIndex: cut.cutIndex, label: cut.label,
      scrollStartPct: cut.scrollStartPct, scrollEndPct: cut.scrollEndPct,
      inTimecode: formatSmpteTimecode(cut.startTimeMs, cueSheet.fps), outTimecode: formatSmpteTimecode(cut.endTimeMs, cueSheet.fps),
      bgmMood: cut.bgmMood, crossfadeMs: cut.crossfadeMs, speaker: cut.speaker, dialogue: cut.dialogue,
      emotionTone: cut.emotionTone, bgmTargetLufs: cut.bgmTargetLufs, bgmDuckedLufs: cut.bgmDuckedLufs, isDuckingActive: cut.isDuckingActive,
      lipSync: {
        dataSourceKind: cut.lipSync.dataSourceKind, hangulSyllableCount: cut.lipSync.hangulSyllableCount,
        totalFrames: cut.lipSync.totalFrames, effectiveSyllablesPerSecond: cut.lipSync.effectiveSyllablesPerSecond,
        visemeDistribution: cut.lipSync.visemeDistribution, segments: cut.lipSync.segments,
        ...(includeLipSyncFrames ? { frames: cut.lipSync.frames } : {}),
      },
      sfxEvents: cut.sfxEvents,
    })),
  };

  return JSON.stringify(payload, null, pretty ? 2 : 0);
}
