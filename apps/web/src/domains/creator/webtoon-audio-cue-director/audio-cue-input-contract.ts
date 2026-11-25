import { BGM_MOOD_IDS, SFX_CATEGORY_IDS, SPEECH_EMOTION_TONES, buildEpisodeAudioCueSheet, type EpisodeAudioCueSheet, type EpisodeAudioCueSheetInput, type KoreanLipSyncInput, type ScheduledAudioCut } from "./audio-cue-director-engine";

export const MAX_AUDIO_CUTS = 64;
export const MAX_DIALOGUE_LENGTH = 512;
export const MAX_SFX_PER_CUT = 32;
export const MAX_LIP_SYNC_FRAMES = 30000;
export const MAX_AUDIO_INPUT_TEXT = 1048576;

function checkNumber(value: number | undefined, maximum = 86400000): void {
  if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > maximum)) throw new RangeError("오디오 큐 수치가 유한한 예제 범위를 벗어났습니다.");
}
function checkText(value: string, maximum = 2048): void {
  if (typeof value !== "string" || value.length > maximum) throw new RangeError("오디오 큐 원문 상한을 넘었습니다.");
}
function checkId(value: string, ids: Set<string>): void {
  checkText(value, 256);
  if (!value.trim() || /[\r\n]/u.test(value) || ids.has(value)) throw new RangeError("오디오 큐 ID는 비어 있지 않고 고유한 한 줄이어야 합니다.");
  ids.add(value);
}
export function assertKoreanLipSyncInput(input: KoreanLipSyncInput): void {
  checkText(input.text, MAX_DIALOGUE_LENGTH);
  checkText(input.speaker ?? "");
  checkNumber(input.startTimeMs); checkNumber(input.fps, 10000); checkNumber(input.syllablesPerSecond, 10000);
  if ((input.startTimeMs ?? 0) < 0) throw new RangeError("시작 시간은 음수일 수 없습니다.");
  if (input.emotionTone !== undefined && !SPEECH_EMOTION_TONES.includes(input.emotionTone)) throw new RangeError("지원하지 않는 감정 톤입니다.");
}
export function assertAudioCueInput(input: EpisodeAudioCueSheetInput): void {
  let inputTextLength = 0;
  function includeText(value: string): void {
    inputTextLength += value.length;
    if (inputTextLength > MAX_AUDIO_INPUT_TEXT) throw new RangeError("오디오 큐 전체 원문 길이 상한(1048576)을 넘었습니다. 이전 입력과 초안은 유지됩니다.");
  }
  checkText(input.episodeTitle);
  includeText(input.episodeTitle);
  for (const value of [input.episodeNumber, input.fps, input.targetLufs, input.dialogueDuckingDb, input.duckingAttackMs, input.duckingReleaseMs, input.defaultSyllablesPerSecond]) checkNumber(value, 1000000);
  if (!Array.isArray(input.cuts) || input.cuts.length > MAX_AUDIO_CUTS) throw new RangeError("컷 상한은 64개입니다.");
  const cutIds = new Set<string>(); const sfxIds = new Set<string>(); let totalText = 0;
  for (const cut of input.cuts) {
    checkId(cut.id, cutIds); checkText(cut.label);
    assertKoreanLipSyncInput({ text: cut.dialogue, speaker: cut.speaker, emotionTone: cut.emotionTone, syllablesPerSecond: cut.syllablesPerSecond });
    totalText += cut.dialogue.length;
    if (totalText > 4096) throw new RangeError("에피소드 대사 상한은 4096자입니다.");
    checkNumber(cut.panelHeightPx, 100000); checkNumber(cut.minCutDurationMs, 600000); checkNumber(cut.crossfadeMs, 1000000);
    if (!BGM_MOOD_IDS.includes(cut.bgmMood)) throw new RangeError("지원하지 않는 BGM 무드입니다.");
    for (const value of [cut.id, cut.label, cut.speaker ?? "", cut.dialogue, cut.emotionTone ?? "", cut.bgmMood]) includeText(value);
    if ((cut.sfxMarkers?.length ?? 0) > MAX_SFX_PER_CUT) throw new RangeError("컷별 SFX 상한은 32개입니다.");
    for (const marker of cut.sfxMarkers ?? []) {
      checkId(marker.id, sfxIds); checkText(marker.label);
      if (!SFX_CATEGORY_IDS.includes(marker.category)) throw new RangeError("지원하지 않는 SFX 분류입니다.");
      for (const value of [marker.id, marker.label, marker.category]) includeText(value);
      for (const value of [marker.offsetRatio01, marker.gainDb, marker.pan, marker.durationMs]) checkNumber(value, 1000000);
    }
  }
}
function minimumDurationForRebuild(cut: ScheduledAudioCut): number {
  if (!cut.lipSync.hasSpokenDialogue) return cut.durationMs;
  const lower = Math.round((cut.lipSync.durationMs + 220) * 10) / 10;
  const upper = Math.round((cut.lipSync.durationMs + 750) * 10) / 10;
  if (cut.durationMs === lower) return 400;
  if (cut.durationMs === upper) return 600000;
  return cut.durationMs;
}
function matches(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matches(actual[index], value));
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => matches(Reflect.get(actual, key), Reflect.get(expected, key)));
}
/** 외부 큐시트는 수치·크기를 먼저 제한한 뒤 같은 모델로 재계산해 대조한다. */
export function assertAudioCueExport(sheet: EpisodeAudioCueSheet): void {
  const ancestors = new WeakSet<object>(); let nodes = 0; let textLength = 0;
  function visit(value: unknown, depth: number): void {
    nodes += 1;
    if (nodes > 5000000 || depth > 20) throw new RangeError("큐시트 크기·깊이 상한을 넘었습니다.");
    if (typeof value === "number") checkNumber(value);
    if (typeof value === "string") { checkText(value, 8192); textLength += value.length; if (textLength > 8000000) throw new RangeError("큐시트 원문 상한을 넘었습니다."); }
    if (!value || typeof value !== "object") return;
    if (ancestors.has(value)) throw new RangeError("순환 큐시트는 지원하지 않습니다.");
    ancestors.add(value);
    if (Array.isArray(value) && value.length > 300000) throw new RangeError("큐시트 목록 상한을 넘었습니다.");
    for (const child of Object.values(value)) visit(child, depth + 1);
    ancestors.delete(value);
  }
  visit(sheet, 0);
  if (sheet.cuts.length > MAX_AUDIO_CUTS) throw new RangeError("컷 상한은 64개입니다.");
  const model = buildEpisodeAudioCueSheet({
    episodeTitle: sheet.originalEpisodeTitle ?? sheet.episodeTitle, episodeNumber: sheet.episodeNumber, fps: sheet.fps,
    targetLufs: sheet.targetLufs, dialogueDuckingDb: sheet.dialogueDuckingDb,
    duckingAttackMs: sheet.duckingAttackMs, duckingReleaseMs: sheet.duckingReleaseMs,
    cuts: sheet.cuts.map((cut) => ({
      id: cut.cutId, label: cut.label, panelHeightPx: cut.panelHeightPx, speaker: cut.speaker, dialogue: cut.dialogue,
      emotionTone: cut.emotionTone, bgmMood: cut.bgmMood, syllablesPerSecond: cut.lipSync.baseSyllablesPerSecond,
      crossfadeMs: cut.crossfadeMs, minCutDurationMs: minimumDurationForRebuild(cut),
      sfxMarkers: cut.sfxEvents.map((marker) => ({ id: marker.eventId, category: marker.category, label: marker.label, offsetRatio01: marker.offsetRatio01, gainDb: marker.gainDb, pan: marker.pan, durationMs: marker.durationMs })),
    })),
  });
  if (!matches({ ...sheet, originalEpisodeTitle: sheet.originalEpisodeTitle ?? sheet.episodeTitle }, model)) throw new RangeError("외부 큐시트가 현재 모델과 일치하지 않습니다.");
}
