/**
 * Wave 38B — 한국어 일상어·초성·영문 통합 퍼지 명령 팔레트(⌘K) ·
 * 플로팅 미니맵 & 명도/실루엣 흑백 검수 토글 · 비주얼 언두 필름스트립 스크러버 엔진.
 *
 * - 순수 결정론적 함수형 상태기(브라우저 스토리지 비의존 · private store Map 0건 · 원시 색상 0건).
 */

import {
  CANVAS_COMMAND_CATALOG,
  DEFAULT_FILMSTRIP_ENTRIES,
  type CanvasCommandItem,
  type CommandMatchKind,
  type CommandUsageRecord,
  type MinimapInspectionMode,
  type MinimapInspectionState,
  type MinimapViewportRect,
  type RankedCanvasCommand,
  type UndoFilmstripEntry,
  type UndoFilmstripState,
  type ValueContrastAudit,
} from "./command-palette-catalog";

export {
  CANVAS_COMMAND_CATALOG,
  MINIMAP_INSPECTION_META,
  type CanvasCommandCategory,
  type CanvasCommandItem,
  type CommandMatchKind,
  type CommandUsageRecord,
  type FilmstripBandTone,
  type FilmstripThumbnailBand,
  type MinimapInspectionMode,
  type MinimapInspectionState,
  type MinimapViewportRect,
  type RankedCanvasCommand,
  type UndoFilmstripEntry,
  type UndoFilmstripState,
  type ValueContrastAudit,
} from "./command-palette-catalog";

const HANGUL_CHOSEONG = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const CHOSEONG_SET: ReadonlySet<string> = new Set(HANGUL_CHOSEONG);
const HANGUL_SYLLABLE_BASE = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const CHOSEONG_STRIDE = 588;

const MATCH_BADGE_LABELS: Readonly<Record<CommandMatchKind, string>> = {
  exact: "정확 일치",
  "everyday-ko": "일상어",
  choseong: "초성",
  english: "영문",
  fuzzy: "유사",
  recent: "최근 사용",
};

/** 문자열에서 한글 음절을 초성으로 추출하고 공백을 제거한 비교용 초성 시퀀스를 만든다. */
export function extractHangulChoseong(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch.trim().length === 0) continue;
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_SYLLABLE_BASE && code <= HANGUL_SYLLABLE_END) {
      const idx = Math.floor((code - HANGUL_SYLLABLE_BASE) / CHOSEONG_STRIDE);
      out += HANGUL_CHOSEONG[idx] ?? ch;
    } else if (CHOSEONG_SET.has(ch)) {
      out += ch;
    } else {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** 입력 문자열이 한글 초성 자모(공백 포함)로만 구성되었는지 판별한다. */
export function isChoseongOnlyQuery(query: string): boolean {
  const compact = query.replace(/\s+/gu, "");
  if (compact.length === 0) return false;
  for (const ch of compact) {
    if (!CHOSEONG_SET.has(ch)) return false;
  }
  return true;
}

function normalizeCompact(text: string): string {
  return text.toLowerCase().replace(/[\s·\-_/]+/gu, "");
}

function scoreOrderedSubsequence(haystack: string, needle: string): number {
  if (needle.length === 0 || haystack.length < needle.length) return 0;
  let hi = 0;
  let streak = 0;
  let maxStreak = 0;
  let firstMatchIdx = -1;

  for (let ni = 0; ni < needle.length; ni += 1) {
    const target = needle[ni];
    let found = -1;
    for (let scan = hi; scan < haystack.length; scan += 1) {
      if (haystack[scan] === target) {
        found = scan;
        break;
      }
    }
    if (found < 0) return 0;
    if (firstMatchIdx < 0) firstMatchIdx = found;
    streak = found === hi ? streak + 1 : 1;
    if (streak > maxStreak) maxStreak = streak;
    hi = found + 1;
  }

  const compactness = needle.length / Math.max(needle.length, hi - firstMatchIdx);
  const startBonus = firstMatchIdx === 0 ? 12 : Math.max(0, 8 - firstMatchIdx);
  return Math.round(34 + compactness * 24 + maxStreak * 4 + startBonus);
}

/** 최근 사용 이력을 불변 배열로 기록한다(동일 명령은 횟수 누적, 최대 32건 유지). */
export function recordCommandUsage(
  history: readonly CommandUsageRecord[],
  commandId: string,
  timestampMs: number,
  maxEntries = 32,
): readonly CommandUsageRecord[] {
  const existing = history.find((item) => item.commandId === commandId);
  const nextRecord: CommandUsageRecord = {
    commandId,
    lastUsedAtMs: timestampMs,
    useCount: (existing?.useCount ?? 0) + 1,
  };
  const rest = history.filter((item) => item.commandId !== commandId);
  return [nextRecord, ...rest]
    .sort((a, b) => b.lastUsedAtMs - a.lastUsedAtMs)
    .slice(0, Math.max(1, maxEntries));
}

function computeRecencyBoost(usageRecord: CommandUsageRecord | undefined, nowMs: number): number {
  if (!usageRecord) return 0;
  const ageMinutes = Math.max(0, (nowMs - usageRecord.lastUsedAtMs) / 60_000);
  const recencyPart = 28 * Math.exp(-ageMinutes / 90);
  const freqPart = Math.min(16, Math.log2(usageRecord.useCount + 1) * 7.5);
  return Number((recencyPart + freqPart).toFixed(2));
}

function evaluateCommandMatch(
  item: CanvasCommandItem,
  rawQuery: string,
): {
  readonly baseScore: number;
  readonly matchKind: CommandMatchKind;
  readonly matchedPhrase: string;
} | null {
  const trimmed = rawQuery.trim();
  const compactQuery = normalizeCompact(trimmed);
  if (compactQuery.length === 0) {
    return { baseScore: 10, matchKind: "recent", matchedPhrase: item.titleKo };
  }

  const compactTitle = normalizeCompact(item.titleKo);
  const titleChoseong = extractHangulChoseong(item.titleKo);
  const queryChoseong = extractHangulChoseong(trimmed);
  const choseongOnly = isChoseongOnlyQuery(trimmed);

  if (!choseongOnly) {
    if (compactTitle === compactQuery) {
      return { baseScore: 120, matchKind: "exact", matchedPhrase: item.titleKo };
    }
    if (compactTitle.startsWith(compactQuery)) {
      return { baseScore: 106, matchKind: "everyday-ko", matchedPhrase: item.titleKo };
    }
    if (compactTitle.includes(compactQuery)) {
      return { baseScore: 94, matchKind: "everyday-ko", matchedPhrase: item.titleKo };
    }

    for (const alias of item.everydayAliasesKo) {
      const compactAlias = normalizeCompact(alias);
      if (compactAlias === compactQuery) {
        return { baseScore: 112, matchKind: "everyday-ko", matchedPhrase: alias };
      }
      if (compactAlias.startsWith(compactQuery)) {
        return { baseScore: 98, matchKind: "everyday-ko", matchedPhrase: alias };
      }
      if (compactAlias.includes(compactQuery)) {
        return { baseScore: 86, matchKind: "everyday-ko", matchedPhrase: alias };
      }
    }
  } else {
    if (titleChoseong === queryChoseong) {
      return { baseScore: 114, matchKind: "choseong", matchedPhrase: item.titleKo };
    }
    if (titleChoseong.startsWith(queryChoseong)) {
      return { baseScore: 102, matchKind: "choseong", matchedPhrase: item.titleKo };
    }
    if (titleChoseong.includes(queryChoseong)) {
      return { baseScore: 90, matchKind: "choseong", matchedPhrase: item.titleKo };
    }
    for (const alias of item.everydayAliasesKo) {
      const aliasChoseong = extractHangulChoseong(alias);
      if (aliasChoseong.startsWith(queryChoseong)) {
        return { baseScore: 92, matchKind: "choseong", matchedPhrase: alias };
      }
      if (aliasChoseong.includes(queryChoseong)) {
        return { baseScore: 80, matchKind: "choseong", matchedPhrase: alias };
      }
    }
    const subScore = scoreOrderedSubsequence(titleChoseong, queryChoseong);
    if (subScore > 0) {
      return { baseScore: subScore, matchKind: "choseong", matchedPhrase: item.titleKo };
    }
  }

  for (const enAlias of item.englishAliases) {
    const compactEn = normalizeCompact(enAlias);
    if (compactEn === compactQuery) {
      return { baseScore: 108, matchKind: "english", matchedPhrase: enAlias };
    }
    if (compactEn.startsWith(compactQuery)) {
      return { baseScore: 92, matchKind: "english", matchedPhrase: enAlias };
    }
    if (compactEn.includes(compactQuery)) {
      return { baseScore: 80, matchKind: "english", matchedPhrase: enAlias };
    }
    const subEn = scoreOrderedSubsequence(compactEn, compactQuery);
    if (subEn >= 54) {
      return { baseScore: subEn, matchKind: "english", matchedPhrase: enAlias };
    }
  }

  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/u)
    .filter((t) => t.length > 0);
  if (tokens.length > 1) {
    const corpus = normalizeCompact(
      [item.titleKo, item.subtitleKo, ...item.everydayAliasesKo, ...item.englishAliases].join(" "),
    );
    const corpusChoseong = extractHangulChoseong([item.titleKo, ...item.everydayAliasesKo].join(" "));
    const matchedTokens = tokens.filter((tok) =>
      isChoseongOnlyQuery(tok)
        ? corpusChoseong.includes(extractHangulChoseong(tok))
        : corpus.includes(normalizeCompact(tok)),
    );
    if (matchedTokens.length === tokens.length) {
      return { baseScore: 84, matchKind: "everyday-ko", matchedPhrase: item.titleKo };
    }
  }

  if (!choseongOnly && normalizeCompact(item.subtitleKo).includes(compactQuery)) {
    return { baseScore: 68, matchKind: "fuzzy", matchedPhrase: item.subtitleKo };
  }

  const fuzzyTitle = scoreOrderedSubsequence(compactTitle, compactQuery);
  return fuzzyTitle >= 52 ? { baseScore: fuzzyTitle, matchKind: "fuzzy", matchedPhrase: item.titleKo } : null;
}

/** 한국어 일상어 · 초성 · 영문 통합 퍼지 명령 검색(최근 실행 가중치 부스트 포함). */
export function searchCanvasCommands(
  query: string,
  options?: {
    readonly catalog?: readonly CanvasCommandItem[];
    readonly recentUsage?: readonly CommandUsageRecord[];
    readonly nowMs?: number;
    readonly limit?: number;
  },
): readonly RankedCanvasCommand[] {
  const catalog = options?.catalog ?? CANVAS_COMMAND_CATALOG;
  const recentUsage = options?.recentUsage ?? [];
  const nowMs = options?.nowMs ?? 1_764_000_000_000;
  const limit = Math.max(1, options?.limit ?? 8);
  const hasQuery = query.trim().length > 0;

  const usageLookup = new Map<string, CommandUsageRecord>();
  for (const record of recentUsage) {
    usageLookup.set(record.commandId, record);
  }

  const ranked: RankedCanvasCommand[] = [];
  for (const item of catalog) {
    const match = evaluateCommandMatch(item, query);
    if (!match) continue;
    const recencyBoost = computeRecencyBoost(usageLookup.get(item.id), nowMs);
    const score = Number((match.baseScore + recencyBoost).toFixed(2));
    const effectiveMatchKind: CommandMatchKind = !hasQuery && recencyBoost > 0 ? "recent" : match.matchKind;

    ranked.push({
      command: item,
      score,
      baseScore: match.baseScore,
      recencyBoost,
      matchKind: effectiveMatchKind,
      matchBadgeKo:
        recencyBoost >= 18 && hasQuery
          ? `${MATCH_BADGE_LABELS[effectiveMatchKind]} · 최근`
          : MATCH_BADGE_LABELS[effectiveMatchKind],
      matchedPhrase: match.matchedPhrase,
    });
  }

  ranked.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.command.titleKo.localeCompare(b.command.titleKo, "ko"),
  );

  return ranked.slice(0, limit);
}

/** 플로팅 미니맵 초기 상태를 생성한다. */
export function createInitialMinimapInspectionState(): MinimapInspectionState {
  return {
    canvasWidth: 1600,
    canvasHeight: 2400,
    viewportWidth: 880,
    viewportHeight: 960,
    panX: 340,
    panY: 420,
    zoomPct: 125,
    flippedHorizontal: false,
    inspectionMode: "normal",
    silhouetteThresholdPct: 48,
  };
}

/** 명도/실루엣 흑백 검수 또는 다크모드 검수 모드를 토글한다. */
export function toggleMinimapInspectionMode(
  state: MinimapInspectionState,
  targetMode: MinimapInspectionMode,
): MinimapInspectionState {
  const nextMode: MinimapInspectionMode =
    state.inspectionMode === targetMode && targetMode !== "normal" ? "normal" : targetMode;
  return { ...state, inspectionMode: nextMode };
}

/** 현재 캔버스 패닝·줌을 플로팅 미니맵 영역 내 뷰포트 사각형 좌표로 투영한다. */
export function computeMinimapViewportRect(
  state: MinimapInspectionState,
  minimapWidth: number,
  minimapHeight: number,
): MinimapViewportRect {
  const scale = Math.max(0.25, state.zoomPct / 100);
  const visibleCanvasW = Math.min(state.canvasWidth, state.viewportWidth / scale);
  const visibleCanvasH = Math.min(state.canvasHeight, state.viewportHeight / scale);

  const clampedPanX = Math.max(0, Math.min(state.panX, Math.max(0, state.canvasWidth - visibleCanvasW)));
  const clampedPanY = Math.max(0, Math.min(state.panY, Math.max(0, state.canvasHeight - visibleCanvasH)));

  const rx = (clampedPanX / Math.max(1, state.canvasWidth)) * minimapWidth;
  const ry = (clampedPanY / Math.max(1, state.canvasHeight)) * minimapHeight;
  const rw = Math.max(16, (visibleCanvasW / Math.max(1, state.canvasWidth)) * minimapWidth);
  const rh = Math.max(16, (visibleCanvasH / Math.max(1, state.canvasHeight)) * minimapHeight);

  const visibleCoveragePct = Math.round(
    ((visibleCanvasW * visibleCanvasH) / Math.max(1, state.canvasWidth * state.canvasHeight)) * 100,
  );

  return {
    x: Number(Math.min(Math.max(0, rx), Math.max(0, minimapWidth - rw)).toFixed(1)),
    y: Number(Math.min(Math.max(0, ry), Math.max(0, minimapHeight - rh)).toFixed(1)),
    width: Number(Math.min(rw, minimapWidth).toFixed(1)),
    height: Number(Math.min(rh, minimapHeight).toFixed(1)),
    visibleCoveragePct: Math.min(100, Math.max(1, visibleCoveragePct)),
  };
}

/** 미니맵 내부 클릭 좌표를 캔버스 패닝 좌표 `(panX, panY)`로 역매핑한다. */
export function panCanvasFromMinimapPoint(
  state: MinimapInspectionState,
  clickX: number,
  clickY: number,
  minimapWidth: number,
  minimapHeight: number,
): MinimapInspectionState {
  const scale = Math.max(0.25, state.zoomPct / 100);
  const visibleCanvasW = Math.min(state.canvasWidth, state.viewportWidth / scale);
  const visibleCanvasH = Math.min(state.canvasHeight, state.viewportHeight / scale);

  const ratioX = Math.max(0, Math.min(1, clickX / Math.max(1, minimapWidth)));
  const ratioY = Math.max(0, Math.min(1, clickY / Math.max(1, minimapHeight)));
  const maxPanX = Math.max(0, state.canvasWidth - visibleCanvasW);
  const maxPanY = Math.max(0, state.canvasHeight - visibleCanvasH);

  return {
    ...state,
    panX: Math.round(Math.max(0, Math.min(maxPanX, ratioX * state.canvasWidth - visibleCanvasW / 2))),
    panY: Math.round(Math.max(0, Math.min(maxPanY, ratioY * state.canvasHeight - visibleCanvasH / 2))),
  };
}

/** 명도 샘플(`[0..1]`) 배열로 명암 3분포와 실루엣 분리 점수를 계산한다. */
export function computeValueContrastAudit(sampleLuminances: readonly number[]): ValueContrastAudit {
  if (sampleLuminances.length === 0) {
    return {
      darkRatioPct: 0,
      midRatioPct: 0,
      lightRatioPct: 0,
      silhouetteSeparationScore: 0,
      verdictKo: "검사할 명도 샘플이 없어요",
      tone: "warn",
    };
  }

  let darkCount = 0;
  let midCount = 0;
  let lightCount = 0;
  let minL = 1;
  let maxL = 0;

  for (const raw of sampleLuminances) {
    const l = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0.5));
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
    if (l < 0.34) darkCount += 1;
    else if (l <= 0.68) midCount += 1;
    else lightCount += 1;
  }

  const total = sampleLuminances.length;
  const darkRatioPct = Math.round((darkCount / total) * 100);
  const midRatioPct = Math.round((midCount / total) * 100);
  const lightRatioPct = Math.round((lightCount / total) * 100);
  const dynamicRange = maxL - minL;
  const midPenalty = Math.max(0, midRatioPct - 45) * 0.9;
  const balanceBonus = Math.min(darkRatioPct, lightRatioPct) >= 18 ? 16 : 6;
  const silhouetteSeparationScore = Math.round(
    Math.max(0, Math.min(100, dynamicRange * 84 + balanceBonus - midPenalty)),
  );

  if (silhouetteSeparationScore >= 76) {
    return {
      darkRatioPct,
      midRatioPct,
      lightRatioPct,
      silhouetteSeparationScore,
      verdictKo: "인물 실루엣과 배경 명도 차이가 또렷해요",
      tone: "good",
    };
  }
  if (silhouetteSeparationScore >= 52) {
    return {
      darkRatioPct,
      midRatioPct,
      lightRatioPct,
      silhouetteSeparationScore,
      verdictKo: "중간 톤 비중이 다소 높아 주 피사체 대비 보강을 권해요",
      tone: "warn",
    };
  }
  return {
    darkRatioPct,
    midRatioPct,
    lightRatioPct,
    silhouetteSeparationScore,
    verdictKo: "명암 폭이 좁아 인물과 배경이 겹쳐 보여요",
    tone: "bad",
  };
}

/** 비주얼 언두 필름스트립 초기 상태기를 생성한다. */
export function createInitialUndoFilmstrip(maxEntries = 24): UndoFilmstripState {
  const entries = DEFAULT_FILMSTRIP_ENTRIES.slice(-Math.max(1, maxEntries));
  const cursorIndex = entries.length - 1;
  return {
    entries,
    cursorIndex,
    previewIndex: null,
    maxEntries: Math.max(4, maxEntries),
    lastJumpDelta: 0,
    lastStatusKo: `현재 ${cursorIndex + 1}/${entries.length}단계 (${entries[cursorIndex]?.labelKo ?? ""})`,
  };
}

/** 현재 커서 위치에 새 작업 체크포인트를 기록한다. */
export function pushFilmstripCheckpoint(
  state: UndoFilmstripState,
  draft: Omit<UndoFilmstripEntry, "id" | "seq">,
): UndoFilmstripState {
  const kept = state.entries.slice(0, state.cursorIndex + 1);
  const nextSeq = (kept[kept.length - 1]?.seq ?? 0) + 1;
  const created: UndoFilmstripEntry = { ...draft, id: `step-${nextSeq}`, seq: nextSeq };
  const combined = [...kept, created].slice(-state.maxEntries);
  const nextCursor = combined.length - 1;

  return {
    ...state,
    entries: combined,
    cursorIndex: nextCursor,
    previewIndex: null,
    lastJumpDelta: 1,
    lastStatusKo: `새 단계 기록: ${created.labelKo} (${nextCursor + 1}/${combined.length})`,
  };
}

/** 비주얼 필름스트립에서 지정한 인덱스로 즉시 점프한다. */
export function jumpToFilmstripIndex(state: UndoFilmstripState, targetIndex: number): UndoFilmstripState {
  if (state.entries.length === 0) return state;
  const clamped = Math.max(0, Math.min(state.entries.length - 1, Math.round(targetIndex)));
  const delta = clamped - state.cursorIndex;
  const target = state.entries[clamped];

  return {
    ...state,
    cursorIndex: clamped,
    previewIndex: null,
    lastJumpDelta: delta,
    lastStatusKo:
      delta === 0
        ? `현재 ${clamped + 1}/${state.entries.length}단계 (${target.labelKo})`
        : delta < 0
          ? `${Math.abs(delta)}단계 되돌림 → ${target.labelKo}`
          : `${delta}단계 복구 → ${target.labelKo}`,
  };
}

/** 필름스트립 1단계 실행취소. */
export function stepFilmstripUndo(state: UndoFilmstripState): UndoFilmstripState {
  return jumpToFilmstripIndex(state, state.cursorIndex - 1);
}

/** 필름스트립 1단계 다시실행. */
export function stepFilmstripRedo(state: UndoFilmstripState): UndoFilmstripState {
  return jumpToFilmstripIndex(state, state.cursorIndex + 1);
}

/** 필름스트립 썸네일 호버 미리보기 인덱스를 설정한다. */
export function setFilmstripScrubPreview(
  state: UndoFilmstripState,
  previewIndex: number | null,
): UndoFilmstripState {
  if (previewIndex === null) return { ...state, previewIndex: null };
  const clamped = Math.max(0, Math.min(state.entries.length - 1, Math.round(previewIndex)));
  return { ...state, previewIndex: clamped };
}
