/**
 * 에피소드 단위 다중 4컷 씬 디렉터 큐시트(`.cutsheet.json`) 직렬화·검증·`localStorage` 자동 초안 보존·반응형 스토어 모듈.
 *
 * 주간 연재 회차(60~80컷) 제작 시 여러 개의 4컷 디렉터 스냅샷(장르 프리셋·연기·구도·여백 호흡·무드·스크린톤·다국어 대사)을
 * 순서대로 큐시트에 쌓아 전환·재정렬하고 결정적 JSON 파일로 저장/복원하며, 새로고침(`Cmd+R`) 시에도 초안을 안전하게 유지한다.
 */
import { failVisible } from "../contracts";
import { stripUtf8Bom } from "../shared/json-safety";

import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  DEFAULT_WEBTOON_STRIP_SCREENTONES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  WEBTOON_CUT_CAMERA_PRESETS,
  WEBTOON_DIALOGUE_LOCALES,
  WEBTOON_JA_WRITING_MODES,
  WEBTOON_MANUSCRIPT_MOOD_IDS,
  WEBTOON_SCREENTONE_IDS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_FONT_SCALE_LABELS_KO,
  WEBTOON_STRIP_GUTTER_PACE_IDS,
  WEBTOON_STRIP_SPEAKER_LABELS_KO,
} from "./webtoon-strip-composer";

import type { LabFailure } from "../contracts";
import type {
  WebtoonDialogueLocale,
  WebtoonJaWritingMode,
  WebtoonManuscriptMoodId,
  WebtoonScreentoneId,
  WebtoonSfxStampOption,
  WebtoonStripActingArcId,
  WebtoonStripBubbleFontScale,
  WebtoonStripBubbleFontScales,
  WebtoonStripBubbleShape,
  WebtoonStripBubbleShapes,
  WebtoonStripCutCameraPresetId,
  WebtoonStripCutCameraPresets,
  WebtoonStripDialogueLines,
  WebtoonStripFxLinesKind,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaces,
  WebtoonStripScreentones,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "./webtoon-strip-composer";

export const EPISODE_CUTSHEET_SCHEMA = "toonstudio.character-lab.episode-cutsheet/1";
export const EPISODE_CUTSHEET_STORAGE_KEY = "toonstudio.character-lab.episode-cutsheet.v1";
export const CUTSHEET_FILE_SUFFIX = ".cutsheet.json";
export const CUTSHEET_MIME = "application/json;charset=utf-8";
export const MAX_CUTSHEET_BEATS = 32;

export type TankobonReadingOrder = "rtl-tankobon" | "ltr-manhwa";

export interface MinimalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EpisodeCutsheetDirectorSnapshot {
  readonly activeDirectorId: string;
  readonly locale: WebtoonDialogueLocale;
  readonly jaWritingMode: WebtoonJaWritingMode;
  readonly tankobonOrder: TankobonReadingOrder;
  readonly manuscriptMood: WebtoonManuscriptMoodId;
  readonly gutterPaces: WebtoonStripGutterPaces;
  readonly screentones: WebtoonStripScreentones;
  readonly actingArc: WebtoonStripActingArcId;
  readonly bakeStripFx: boolean;
  readonly stripFxLines: WebtoonStripFxLinesKind;
  readonly dialogueLines: WebtoonStripDialogueLines;
  readonly bubbleShapes: WebtoonStripBubbleShapes;
  readonly bubbleFontScales: WebtoonStripBubbleFontScales;
  readonly sfxStamps: WebtoonStripSfxStamps;
  readonly speakerTargets: WebtoonStripSpeakerTargets;
  readonly cutCameraPresets: WebtoonStripCutCameraPresets;
  readonly partnerSide: "left" | "right";
  readonly includePsdMangaFx: boolean;
}

export interface EpisodeCutsheetBeat {
  readonly beatId: string;
  readonly titleKo: string;
  readonly cutRangeLabel: string;
  readonly snapshot: EpisodeCutsheetDirectorSnapshot;
}

export interface EpisodeCutsheetDocument {
  readonly schema: typeof EPISODE_CUTSHEET_SCHEMA;
  readonly episodeTitleKo: string;
  readonly savedAtIso: string;
  readonly beats: readonly EpisodeCutsheetBeat[];
}

export type ParseEpisodeCutsheetOutcome =
  | { readonly ok: true; readonly document: EpisodeCutsheetDocument }
  | { readonly ok: false; readonly failure: LabFailure };

export const DEFAULT_EPISODE_CUTSHEET_SNAPSHOT: EpisodeCutsheetDirectorSnapshot = Object.freeze({
  activeDirectorId: "",
  locale: "ko",
  jaWritingMode: "horizontal",
  tankobonOrder: "rtl-tankobon",
  manuscriptMood: "daylight-paper",
  gutterPaces: DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  screentones: DEFAULT_WEBTOON_STRIP_SCREENTONES,
  actingArc: "none",
  bakeStripFx: false,
  stripFxLines: "focus-radial",
  dialogueLines: DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  bubbleShapes: DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  bubbleFontScales: DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  sfxStamps: DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  speakerTargets: DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  cutCameraPresets: DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
  partnerSide: "right",
  includePsdMangaFx: false,
});

const VALID_LOCALES = new Set<string>(WEBTOON_DIALOGUE_LOCALES);
const VALID_JA_MODES = new Set<string>(WEBTOON_JA_WRITING_MODES);
const VALID_MOODS = new Set<string>(WEBTOON_MANUSCRIPT_MOOD_IDS);
const VALID_PACES = new Set<string>(WEBTOON_STRIP_GUTTER_PACE_IDS);
const VALID_TONES = new Set<string>(WEBTOON_SCREENTONE_IDS);
const VALID_SHAPES = new Set<string>(Object.keys(WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO));
const VALID_SCALES = new Set<string>(Object.keys(WEBTOON_STRIP_FONT_SCALE_LABELS_KO));
const VALID_SPEAKERS = new Set<string>(Object.keys(WEBTOON_STRIP_SPEAKER_LABELS_KO));
const VALID_CAMERAS = new Set<string>(Object.keys(WEBTOON_CUT_CAMERA_PRESETS));
const VALID_FX_LINES = new Set<string>(["none", "focus-radial", "speed-diagonal", "romance-sparkle"]);
const VALID_SFX = new Set<string>(["none", "seureung", "dugeun", "kugugung", "pat", "ssaa", "beonjjeok"]);
const VALID_ARCS = new Set<string>([
  "none",
  "arc-romance-flutter",
  "arc-thriller-shock",
  "arc-confident-smirk",
  "arc-awakening-climax",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTuple4<T>(
  raw: unknown,
  guard: (item: unknown) => item is T,
  fallback: readonly [T, T, T, T],
): readonly [T, T, T, T] {
  if (!Array.isArray(raw) || raw.length !== 4) return fallback;
  if (guard(raw[0]) && guard(raw[1]) && guard(raw[2]) && guard(raw[3])) {
    return [raw[0], raw[1], raw[2], raw[3]];
  }
  return fallback;
}

function parseTuple3<T>(
  raw: unknown,
  guard: (item: unknown) => item is T,
  fallback: readonly [T, T, T],
): readonly [T, T, T] {
  if (!Array.isArray(raw) || raw.length !== 3) return fallback;
  if (guard(raw[0]) && guard(raw[1]) && guard(raw[2])) {
    return [raw[0], raw[1], raw[2]];
  }
  return fallback;
}

export function formatBeatCutRangeLabel(beatIndex: number): string {
  const startCut = beatIndex * 4 + 1;
  const endCut = startCut + 3;
  return `${startCut}~${endCut}컷`;
}

export function serializeEpisodeCutsheet(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  nowMs = Date.now(),
): string {
  const normalizedBeats = beats.slice(0, MAX_CUTSHEET_BEATS).map((beat, idx) => ({
    ...beat,
    cutRangeLabel: formatBeatCutRangeLabel(idx),
  }));
  const doc: EpisodeCutsheetDocument = {
    schema: EPISODE_CUTSHEET_SCHEMA,
    episodeTitleKo: episodeTitleKo.trim() || "주간 연재 에피소드 콘티 큐시트",
    savedAtIso: new Date(nowMs).toISOString(),
    beats: normalizedBeats,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function episodeCutsheetFileName(episodeTitleKo: string, beatCount: number): string {
  const slug = episodeTitleKo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 24);
  const prefix = slug.length > 0 ? slug : "episode";
  return `${prefix}-${beatCount * 4}cuts${CUTSHEET_FILE_SUFFIX}`;
}

export function parseEpisodeCutsheet(rawText: string, nowMs = Date.now()): ParseEpisodeCutsheetOutcome {
  const { text } = stripUtf8Bom(rawText);
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-file-empty", "큐시트 파일이 비어 있습니다. 올바른 .cutsheet.json 파일을 선택하세요.", undefined, nowMs),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      ok: false,
      failure: failVisible("cutsheet-json-syntax", "큐시트 JSON 구문이 올바르지 않아 열 수 없습니다.", error, nowMs),
    };
  }
  if (!isRecord(parsed) || parsed.schema !== EPISODE_CUTSHEET_SCHEMA) {
    return {
      ok: false,
      failure: failVisible(
        "cutsheet-schema-invalid",
        `큐시트 스키마가 '${EPISODE_CUTSHEET_SCHEMA}' 형식이 아닙니다.`,
        undefined,
        nowMs,
      ),
    };
  }
  if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-beats-empty", "큐시트에 저장된 4컷 씬 비트가 하나도 없습니다.", undefined, nowMs),
    };
  }
  if (parsed.beats.length > MAX_CUTSHEET_BEATS) {
    return {
      ok: false,
      failure: failVisible(
        "cutsheet-beats-limit",
        `큐시트 최대 비트 수(${MAX_CUTSHEET_BEATS}개 · ${MAX_CUTSHEET_BEATS * 4}컷)를 초과했습니다.`,
        undefined,
        nowMs,
      ),
    };
  }

  const beats: EpisodeCutsheetBeat[] = [];
  for (let idx = 0; idx < parsed.beats.length; idx += 1) {
    const item = parsed.beats[idx];
    if (!isRecord(item) || !isRecord(item.snapshot)) {
      return {
        ok: false,
        failure: failVisible("cutsheet-beat-invalid", `${idx + 1}번째 씬 비트 구조가 손상되었습니다.`, undefined, nowMs),
      };
    }
    const snap = item.snapshot;
    const snapshot: EpisodeCutsheetDirectorSnapshot = {
      activeDirectorId: typeof snap.activeDirectorId === "string" ? snap.activeDirectorId : "",
      locale: typeof snap.locale === "string" && VALID_LOCALES.has(snap.locale) ? (snap.locale as WebtoonDialogueLocale) : "ko",
      jaWritingMode:
        typeof snap.jaWritingMode === "string" && VALID_JA_MODES.has(snap.jaWritingMode)
          ? (snap.jaWritingMode as WebtoonJaWritingMode)
          : "horizontal",
      tankobonOrder: snap.tankobonOrder === "ltr-manhwa" ? "ltr-manhwa" : "rtl-tankobon",
      manuscriptMood:
        typeof snap.manuscriptMood === "string" && VALID_MOODS.has(snap.manuscriptMood)
          ? (snap.manuscriptMood as WebtoonManuscriptMoodId)
          : "daylight-paper",
      gutterPaces: parseTuple3(
        snap.gutterPaces,
        (v): v is WebtoonStripGutterPaceId => typeof v === "string" && VALID_PACES.has(v),
        DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
      ),
      screentones: parseTuple4(
        snap.screentones,
        (v): v is WebtoonScreentoneId => typeof v === "string" && VALID_TONES.has(v),
        DEFAULT_WEBTOON_STRIP_SCREENTONES,
      ),
      actingArc:
        typeof snap.actingArc === "string" && VALID_ARCS.has(snap.actingArc)
          ? (snap.actingArc as WebtoonStripActingArcId)
          : "none",
      bakeStripFx: snap.bakeStripFx === true,
      stripFxLines:
        typeof snap.stripFxLines === "string" && VALID_FX_LINES.has(snap.stripFxLines)
          ? (snap.stripFxLines as WebtoonStripFxLinesKind)
          : "focus-radial",
      dialogueLines: parseTuple4(
        snap.dialogueLines,
        (v): v is string => typeof v === "string" && v.length <= 80,
        DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
      ),
      bubbleShapes: parseTuple4(
        snap.bubbleShapes,
        (v): v is WebtoonStripBubbleShape => typeof v === "string" && VALID_SHAPES.has(v),
        DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
      ),
      bubbleFontScales: parseTuple4(
        snap.bubbleFontScales,
        (v): v is WebtoonStripBubbleFontScale => typeof v === "string" && VALID_SCALES.has(v),
        DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
      ),
      sfxStamps: parseTuple4(
        snap.sfxStamps,
        (v): v is WebtoonSfxStampOption => typeof v === "string" && VALID_SFX.has(v),
        DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
      ),
      speakerTargets: parseTuple4(
        snap.speakerTargets,
        (v): v is WebtoonStripSpeakerTarget => typeof v === "string" && VALID_SPEAKERS.has(v),
        DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
      ),
      cutCameraPresets: parseTuple4(
        snap.cutCameraPresets,
        (v): v is WebtoonStripCutCameraPresetId => typeof v === "string" && VALID_CAMERAS.has(v),
        DEFAULT_WEBTOON_STRIP_CUT_CAMERA_PRESETS,
      ),
      partnerSide: snap.partnerSide === "left" ? "left" : "right",
      includePsdMangaFx: snap.includePsdMangaFx === true,
    };

    beats.push({
      beatId: typeof item.beatId === "string" && item.beatId.trim().length > 0 ? item.beatId : `beat-${idx + 1}`,
      titleKo: typeof item.titleKo === "string" && item.titleKo.trim().length > 0 ? item.titleKo.trim().slice(0, 48) : `씬 비트 ${idx + 1}`,
      cutRangeLabel: formatBeatCutRangeLabel(idx),
      snapshot,
    });
  }

  return {
    ok: true,
    document: {
      schema: EPISODE_CUTSHEET_SCHEMA,
      episodeTitleKo:
        typeof parsed.episodeTitleKo === "string" && parsed.episodeTitleKo.trim().length > 0
          ? parsed.episodeTitleKo.trim().slice(0, 64)
          : "주간 연재 에피소드 콘티 큐시트",
      savedAtIso: typeof parsed.savedAtIso === "string" ? parsed.savedAtIso : new Date(nowMs).toISOString(),
      beats,
    },
  };
}

export interface EpisodeCutsheetState {
  readonly episodeTitleKo: string;
  readonly beats: readonly EpisodeCutsheetBeat[];
  readonly activeBeatId: string | null;
}

export interface CreateEpisodeCutsheetStoreOptions extends Partial<EpisodeCutsheetState> {
  readonly storage?: MinimalStorageLike | null;
}

export interface EpisodeCutsheetStore {
  getState(): EpisodeCutsheetState;
  setEpisodeTitle(titleKo: string): void;
  addBeat(titleKo: string, snapshot: EpisodeCutsheetDirectorSnapshot): EpisodeCutsheetBeat | null;
  updateBeat(beatId: string, snapshot: EpisodeCutsheetDirectorSnapshot, nextTitleKo?: string): boolean;
  removeBeat(beatId: string): void;
  moveBeat(beatId: string, direction: "up" | "down"): void;
  markActiveBeat(beatId: string | null): void;
  replaceDocument(doc: EpisodeCutsheetDocument): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

function resolveDefaultStorage(): MinimalStorageLike | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // 샌드박스·프라이빗 브라우징 접근 차단 시 무시
  }
  return null;
}

function loadPersistedState(storage: MinimalStorageLike | null): EpisodeCutsheetState | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(EPISODE_CUTSHEET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseEpisodeCutsheet(raw);
    if (!parsed.ok) return null;
    return {
      episodeTitleKo: parsed.document.episodeTitleKo,
      beats: parsed.document.beats,
      activeBeatId: parsed.document.beats[0]?.beatId ?? null,
    };
  } catch {
    return null;
  }
}

function persistStateToStorage(storage: MinimalStorageLike | null, state: EpisodeCutsheetState): void {
  if (!storage) return;
  try {
    if (state.beats.length === 0) {
      storage.removeItem(EPISODE_CUTSHEET_STORAGE_KEY);
      return;
    }
    storage.setItem(EPISODE_CUTSHEET_STORAGE_KEY, serializeEpisodeCutsheet(state.episodeTitleKo, state.beats));
  } catch {
    // 저장소 용량 초과 시 인메모리 동작 유지
  }
}

export function createEpisodeCutsheetStore(initial?: CreateEpisodeCutsheetStoreOptions): EpisodeCutsheetStore {
  const storage = initial?.storage === undefined ? null : initial.storage;
  const restored =
    initial?.beats === undefined && initial?.episodeTitleKo === undefined ? loadPersistedState(storage) : null;
  let seq = (restored?.beats.length ?? initial?.beats?.length ?? 0) + 1;
  let state: EpisodeCutsheetState = restored ?? {
    episodeTitleKo: initial?.episodeTitleKo ?? "1화 콘티 큐시트",
    beats: initial?.beats ?? [],
    activeBeatId: initial?.activeBeatId ?? null,
  };
  const listeners = new Set<() => void>();
  const commit = (next: EpisodeCutsheetState): void => {
    state = next;
    persistStateToStorage(storage, state);
    for (const fn of listeners) fn();
  };
  const reindex = (beats: readonly EpisodeCutsheetBeat[]): readonly EpisodeCutsheetBeat[] =>
    beats.map((b, idx) => ({ ...b, cutRangeLabel: formatBeatCutRangeLabel(idx) }));

  return {
    getState: () => state,
    setEpisodeTitle(titleKo) {
      commit({ ...state, episodeTitleKo: titleKo });
    },
    addBeat(titleKo, snapshot) {
      if (state.beats.length >= MAX_CUTSHEET_BEATS) return null;
      const nextIdx = state.beats.length;
      const beat: EpisodeCutsheetBeat = {
        beatId: `beat-${seq++}-${nextIdx + 1}`,
        titleKo: titleKo.trim() || `씬 ${nextIdx + 1}`,
        cutRangeLabel: formatBeatCutRangeLabel(nextIdx),
        snapshot,
      };
      commit({
        ...state,
        beats: [...state.beats, beat],
        activeBeatId: beat.beatId,
      });
      return beat;
    },
    updateBeat(beatId, snapshot, nextTitleKo) {
      const idx = state.beats.findIndex((b) => b.beatId === beatId);
      if (idx < 0) return false;
      const prev = state.beats[idx]!;
      const updated: EpisodeCutsheetBeat = {
        ...prev,
        titleKo: nextTitleKo && nextTitleKo.trim().length > 0 ? nextTitleKo.trim().slice(0, 48) : prev.titleKo,
        snapshot,
      };
      const copy = [...state.beats];
      copy[idx] = updated;
      commit({
        ...state,
        beats: reindex(copy),
        activeBeatId: beatId,
      });
      return true;
    },
    removeBeat(beatId) {
      const filtered = reindex(state.beats.filter((b) => b.beatId !== beatId));
      commit({
        ...state,
        beats: filtered,
        activeBeatId: state.activeBeatId === beatId ? (filtered[0]?.beatId ?? null) : state.activeBeatId,
      });
    },
    moveBeat(beatId, direction) {
      const idx = state.beats.findIndex((b) => b.beatId === beatId);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= state.beats.length) return;
      const copy = [...state.beats];
      const a = copy[idx]!;
      const b = copy[swapIdx]!;
      copy[idx] = b;
      copy[swapIdx] = a;
      commit({ ...state, beats: reindex(copy) });
    },
    markActiveBeat(beatId) {
      state = { ...state, activeBeatId: beatId };
      for (const fn of listeners) fn();
    },
    replaceDocument(doc) {
      const reindexed = reindex(doc.beats);
      commit({
        episodeTitleKo: doc.episodeTitleKo,
        beats: reindexed,
        activeBeatId: reindexed[0]?.beatId ?? null,
      });
    },
    reset() {
      seq = 1;
      commit({
        episodeTitleKo: "1화 콘티 큐시트",
        beats: [],
        activeBeatId: null,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let defaultEpisodeCutsheetStore: EpisodeCutsheetStore | null = null;

export function getDefaultEpisodeCutsheetStore(): EpisodeCutsheetStore {
  defaultEpisodeCutsheetStore ??= createEpisodeCutsheetStore({ storage: resolveDefaultStorage() });
  return defaultEpisodeCutsheetStore;
}
