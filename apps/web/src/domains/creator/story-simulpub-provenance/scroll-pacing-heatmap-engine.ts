/**
 * 모바일 9:16 독자 스크롤 피로·이탈 히트맵 & 스크롤 비트 동기화 BGM/SFX 큐 시트 엔진 (Wave 39D).
 *
 * - 컷 밀도 · 대사 텍스트 벽(word-wall) · 여백(gutter) 호흡 리듬 · 회차 끝 클리프행어 훅 점수 산출
 * - 구간별 누적 피로도 및 이탈 위험도(0~100) · 예상 잔존율 곡선 · 구체적 편집 개선 제안 생성
 * - 장면 무드·임팩트 컷 기준 스크롤 비트 동기화 BGM/SFX 큐 시트 및 실시간 스크럽 평가
 */

export type ScrollPanelShotType = "establishing" | "medium" | "closeup" | "action-splash" | "silent-breath" | "cliffhanger";
export type ScrollSceneMood = "calm" | "mystery" | "tension" | "action" | "emotional" | "reveal";
export type DropOffRiskBand = "safe" | "watch" | "high" | "critical";
export type GutterRhythmStatus = "suffocating" | "balanced" | "overstretched";
export type ScrollSuggestionKind =
  | "break-word-wall"
  | "expand-gutter-breath"
  | "rebalance-cut-density"
  | "insert-silent-breath"
  | "sharpen-cliffhanger";

export interface ScrollPanelSpec {
  readonly panelId: string; readonly index: number; readonly labelKo: string; readonly labelEn: string;
  readonly heightPx: number; readonly gutterAfterPx: number;
  readonly dialogueCharCount: number; readonly dialogueWordCount: number; readonly balloonCount: number;
  readonly visualDensity: number; readonly shotType: ScrollPanelShotType; readonly emotionalIntensity: number;
  readonly sceneMood: ScrollSceneMood; readonly isCliffhangerBeat?: boolean; readonly sfxTag?: string;
}

export interface ScrollEpisodePacingInput {
  readonly episodeId: string; readonly episodeNumber: number; readonly titleKo: string; readonly titleEn: string;
  readonly viewportWidthPx?: number; readonly viewportHeightPx?: number;
  readonly panels: readonly ScrollPanelSpec[];
}

export interface ScrollHeatmapSegment {
  readonly panelId: string; readonly panelIndex: number; readonly labelKo: string; readonly labelEn: string;
  readonly yStartPx: number; readonly yEndPx: number; readonly scrollStartPct: number; readonly scrollEndPct: number;
  readonly panelsPerScreen: number; readonly cutDensityScore: number; readonly wordWallScore: number; readonly isWordWall: boolean;
  readonly gutterBreathScore: number; readonly gutterStatus: GutterRhythmStatus;
  readonly cumulativeFatigue: number; readonly dropOffRisk: number; readonly riskBand: DropOffRiskBand;
  readonly estimatedRetentionPct: number;
}

export interface ScrollPacingSuggestion {
  readonly suggestionId: string; readonly kind: ScrollSuggestionKind; readonly priority: "critical" | "high" | "medium";
  readonly panelId: string; readonly panelIndex: number;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly expectedRiskReduction: number;
}

export interface ScrollBgmCueRegion {
  readonly cueId: string; readonly mood: ScrollSceneMood; readonly trackTitleKo: string; readonly trackTitleEn: string;
  readonly bpm: number; readonly startY: number; readonly endY: number;
  readonly scrollStartPct: number; readonly scrollEndPct: number;
  readonly fadeInPx: number; readonly fadeOutPx: number; readonly baseGain: number; readonly crossfadeWithPrev: boolean;
}

export interface ScrollSfxBeatCue {
  readonly cueId: string; readonly panelId: string; readonly panelIndex: number; readonly beatIndex: number;
  readonly sfxTag: string; readonly labelKo: string; readonly labelEn: string;
  readonly triggerY: number; readonly triggerScrollPct: number; readonly intensity: number; readonly bgmDuckingDb: number;
}

export interface ScrollBeatCueSheet {
  readonly schemaVersion: "toonstudio.scroll-beat-cuesheet.v1"; readonly episodeId: string;
  readonly totalScrollHeightPx: number; readonly bgmRegions: readonly ScrollBgmCueRegion[];
  readonly sfxBeats: readonly ScrollSfxBeatCue[]; readonly cueSheetJson: string;
}

export interface ScrollBeatPlaybackSnapshot {
  readonly scrollY: number; readonly focalY: number; readonly scrollPct: number;
  readonly activeBgmCues: readonly {
    readonly cueId: string; readonly mood: ScrollSceneMood; readonly trackTitleKo: string; readonly trackTitleEn: string;
    readonly bpm: number; readonly effectiveGain: number; readonly phase: "fade-in" | "sustain" | "fade-out" | "crossfade";
  }[];
  readonly triggeredSfxBeats: readonly ScrollSfxBeatCue[];
  readonly activeDuckingDb: number;
}

export interface ScrollPacingHeatmapReport {
  readonly episodeId: string; readonly episodeNumber: number; readonly titleKo: string; readonly titleEn: string;
  readonly viewportWidthPx: number; readonly viewportHeightPx: number; readonly aspectRatioLabel: "9:16";
  readonly totalScrollHeightPx: number; readonly screenCount: number; readonly panelCount: number;
  readonly averageDropOffRisk: number; readonly peakDropOffRisk: number; readonly peakRiskPanelId: string | null;
  readonly wordWallPanelCount: number; readonly gutterBreathAverage: number; readonly cliffhangerHookScore: number;
  readonly estimatedCompletionRetentionPct: number; readonly overallPacingScore: number;
  readonly segments: readonly ScrollHeatmapSegment[]; readonly suggestions: readonly ScrollPacingSuggestion[];
  readonly cueSheet: ScrollBeatCueSheet; readonly summaryKo: string; readonly summaryEn: string;
}

const DEFAULT_MOBILE_W = 390;
const DEFAULT_MOBILE_H = 693;

const MOOD_TRACK_META: Readonly<Record<ScrollSceneMood, { readonly ko: string; readonly en: string; readonly bpm: number; readonly gain: number }>> = {
  calm: { ko: "새벽 안개 피아노", en: "Dawn Mist Piano", bpm: 76, gain: 0.58 },
  mystery: { ko: "시계탑 틱톡 서스펜스", en: "Clocktower Tick Suspense", bpm: 94, gain: 0.68 },
  tension: { ko: "저역 첼로 압박 드론", en: "Low Cello Tension Drone", bpm: 112, gain: 0.78 },
  action: { ko: "퍼커션 추격 비트", en: "Percussion Chase Beat", bpm: 138, gain: 0.86 },
  emotional: { ko: "현악 여운 테마", en: "Strings Resonance Theme", bpm: 84, gain: 0.72 },
  reveal: { ko: "오르간 반전 스웰", en: "Organ Reveal Swell", bpm: 108, gain: 0.84 },
};

const SFX_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string; readonly duckDb: number }>> = {
  "clock-chime": { ko: "종탑 타종 울림", en: "Clocktower Bell Chime", duckDb: -5 },
  "door-slam": { ko: "철문 쾅 닫힘", en: "Iron Door Slam", duckDb: -4 },
  heartbeat: { ko: "심박 저음 펄스", en: "Low Heartbeat Pulse", duckDb: -6 },
  "paper-flip": { ko: "수첩 페이지 넘김", en: "Notebook Page Flip", duckDb: -1.5 },
  "rain-swell": { ko: "빗소리 증폭", en: "Rain Ambience Swell", duckDb: -2 },
  "silence-drop": { ko: "정적 컷(BGM 일시 음소거)", en: "Silence Drop (BGM Mute)", duckDb: -14 },
  "flash-hit": { ko: "반전 플래시 임팩트", en: "Reveal Flash Hit", duckDb: -7 },
};

function clamp(v: number, min: number, max: number): number { return Math.min(max, Math.max(min, v)); }
function round1(v: number): number { return Math.round(v * 10) / 10; }
function classifyRiskBand(risk: number): DropOffRiskBand {
  if (risk >= 80) return "critical";
  if (risk >= 60) return "high";
  return risk >= 35 ? "watch" : "safe";
}

function evaluateGutterBreath(panel: ScrollPanelSpec, prevPanel: ScrollPanelSpec | null): { readonly score: number; readonly status: GutterRhythmStatus } {
  const gutter = Math.max(0, panel.gutterAfterPx);
  const idealMin = panel.shotType === "cliffhanger" || panel.shotType === "action-splash" ? 110 : panel.shotType === "silent-breath" ? 140 : 76;
  const idealMax = panel.shotType === "silent-breath" || panel.shotType === "cliffhanger" ? 420 : 280;
  let status: GutterRhythmStatus = "balanced";
  let score = 92;

  if (gutter < idealMin) {
    const deficit = (idealMin - gutter) / Math.max(1, idealMin);
    score = clamp(Math.round(88 - deficit * 68), 12, 85);
    if (gutter < 56 || deficit >= 0.42) status = "suffocating";
  } else if (gutter > idealMax) {
    const excess = (gutter - idealMax) / Math.max(1, idealMax);
    score = clamp(Math.round(88 - excess * 52), 24, 86);
    if (gutter > 460 || excess >= 0.65) status = "overstretched";
  }

  if (prevPanel && Math.abs(prevPanel.gutterAfterPx - gutter) <= 6 && gutter < 70 && Math.abs(prevPanel.heightPx - panel.heightPx) <= 40) {
    score = Math.max(10, score - 12);
    status = "suffocating";
  }
  return { score, status };
}

function computeCliffhangerHookScore(panels: readonly ScrollPanelSpec[]): number {
  const last = panels[panels.length - 1];
  if (!last) return 0;
  const prev = panels.length >= 2 ? panels[panels.length - 2] : null;
  let score = 26 + Math.round(clamp(last.emotionalIntensity, 0, 100) * 0.34);
  if (last.isCliffhangerBeat || last.shotType === "cliffhanger") score += 28;
  else if (last.shotType === "closeup" || last.shotType === "action-splash") score += 14;
  if (last.sceneMood === "reveal" || last.sceneMood === "tension") score += 10;
  else if (last.sceneMood === "calm") score -= 10;
  if (last.dialogueCharCount > 85) score -= 18;
  else if (last.dialogueCharCount <= 40) score += 8;
  if (prev && last.emotionalIntensity > prev.emotionalIntensity + 12) score += 8;
  return clamp(Math.round(score), 0, 100);
}

function buildScrollBeatCueSheet(
  episodeId: string,
  panels: readonly ScrollPanelSpec[],
  yBounds: readonly { readonly yStart: number; readonly yEnd: number }[],
  totalScrollHeightPx: number,
): ScrollBeatCueSheet {
  const safeTotal = Math.max(1, totalScrollHeightPx);
  const bgmRegions: ScrollBgmCueRegion[] = [];
  const sfxBeats: ScrollSfxBeatCue[] = [];

  let regionIdx = 0;
  let i = 0;
  while (i < panels.length) {
    const startP = panels[i]; const startB = yBounds[i];
    if (!startP || !startB) break;
    let endIdx = i;
    while (endIdx + 1 < panels.length && panels[endIdx + 1]?.sceneMood === startP.sceneMood) endIdx += 1;
    const endB = yBounds[endIdx] ?? startB;
    const meta = MOOD_TRACK_META[startP.sceneMood];
    const crossfadeWithPrev = regionIdx > 0;
    const startY = Math.max(0, startB.yStart - (crossfadeWithPrev ? 220 : 0));
    const endY = Math.min(totalScrollHeightPx, endB.yEnd + (endIdx + 1 < panels.length ? 220 : 0));
    bgmRegions.push({
      cueId: `bgm-${regionIdx + 1}-${startP.sceneMood}`, mood: startP.sceneMood,
      trackTitleKo: meta.ko, trackTitleEn: meta.en, bpm: meta.bpm, startY, endY,
      scrollStartPct: round1((startY / safeTotal) * 100), scrollEndPct: round1((endY / safeTotal) * 100),
      fadeInPx: crossfadeWithPrev ? 280 : 220, fadeOutPx: 280, baseGain: meta.gain, crossfadeWithPrev,
    });
    regionIdx += 1;
    i = endIdx + 1;
  }

  let beatIndex = 1;
  for (let idx = 0; idx < panels.length; idx += 1) {
    const p = panels[idx]; const b = yBounds[idx];
    if (!p || !b) continue;
    const tag = p.sfxTag ?? (p.isCliffhangerBeat || p.shotType === "cliffhanger" ? "flash-hit" : p.shotType === "silent-breath" ? "silence-drop" : p.shotType === "action-splash" ? "door-slam" : null);
    if (!tag) continue;
    const meta = SFX_LABELS[tag] ?? { ko: tag, en: tag, duckDb: -3 };
    const triggerY = b.yStart + Math.round(p.heightPx * 0.25);
    sfxBeats.push({
      cueId: `sfx-${beatIndex}-${p.panelId}`, panelId: p.panelId, panelIndex: p.index, beatIndex,
      sfxTag: tag, labelKo: meta.ko, labelEn: meta.en, triggerY,
      triggerScrollPct: round1((triggerY / safeTotal) * 100),
      intensity: round1(clamp(p.emotionalIntensity / 100, 0.25, 1)), bgmDuckingDb: meta.duckDb,
    });
    beatIndex += 1;
  }

  const payload = { schemaVersion: "toonstudio.scroll-beat-cuesheet.v1" as const, episodeId, totalScrollHeightPx, bgmRegions, sfxBeats };
  return { ...payload, cueSheetJson: JSON.stringify(payload, null, 2) };
}

/** 현재 스크롤 위치(scrollY)에서 활성 BGM 페이드/크로스페이드 및 트리거된 SFX 비트를 평가한다. */
export function evaluateScrollBeatAtPosition(
  cueSheet: ScrollBeatCueSheet,
  scrollY: number,
  viewportHeightPx = DEFAULT_MOBILE_H,
): ScrollBeatPlaybackSnapshot {
  const clampedScrollY = clamp(scrollY, 0, Math.max(0, cueSheet.totalScrollHeightPx));
  const focalY = Math.min(cueSheet.totalScrollHeightPx, Math.round(clampedScrollY + viewportHeightPx * 0.36));
  const scrollPct = cueSheet.totalScrollHeightPx <= 0 ? 0 : round1((focalY / cueSheet.totalScrollHeightPx) * 100);
  const triggeredSfxBeats = cueSheet.sfxBeats.filter((b) => Math.abs(b.triggerY - focalY) <= Math.round(viewportHeightPx * 0.28));
  const activeDuckingDb = triggeredSfxBeats.reduce((minDb, b) => Math.min(minDb, b.bgmDuckingDb), 0);
  const duckMul = Math.pow(10, activeDuckingDb / 20);
  const overlapping = cueSheet.bgmRegions.filter((r) => focalY >= r.startY && focalY <= r.endY);
  const isCrossfade = overlapping.length > 1;

  const activeBgmCues = overlapping.map((reg) => {
    let env = 1;
    let phase: "fade-in" | "sustain" | "fade-out" | "crossfade" = "sustain";
    if (focalY - reg.startY < reg.fadeInPx) { env = Math.min(env, clamp((focalY - reg.startY) / Math.max(1, reg.fadeInPx), 0.08, 1)); phase = "fade-in"; }
    if (reg.endY - focalY < reg.fadeOutPx) { env = Math.min(env, clamp((reg.endY - focalY) / Math.max(1, reg.fadeOutPx), 0.08, 1)); phase = "fade-out"; }
    if (isCrossfade) phase = "crossfade";
    return {
      cueId: reg.cueId, mood: reg.mood, trackTitleKo: reg.trackTitleKo, trackTitleEn: reg.trackTitleEn,
      bpm: reg.bpm, effectiveGain: Math.round(reg.baseGain * env * duckMul * 1000) / 1000, phase,
    };
  });

  return { scrollY: clampedScrollY, focalY, scrollPct, activeBgmCues, triggeredSfxBeats, activeDuckingDb };
}

/** 모바일 9:16 스크롤 피로·이탈 히트맵, 개선 제안, BGM/SFX 큐 시트를 일괄 분석한다. */
export function simulateScrollPacingHeatmap(input: ScrollEpisodePacingInput): ScrollPacingHeatmapReport {
  const viewportWidthPx = input.viewportWidthPx ?? DEFAULT_MOBILE_W;
  const viewportHeightPx = input.viewportHeightPx ?? DEFAULT_MOBILE_H;

  if (input.panels.length === 0) {
    return {
      episodeId: input.episodeId, episodeNumber: input.episodeNumber, titleKo: input.titleKo, titleEn: input.titleEn,
      viewportWidthPx, viewportHeightPx, aspectRatioLabel: "9:16",
      totalScrollHeightPx: 0, screenCount: 0, panelCount: 0, averageDropOffRisk: 100, peakDropOffRisk: 100, peakRiskPanelId: null,
      wordWallPanelCount: 0, gutterBreathAverage: 0, cliffhangerHookScore: 0, estimatedCompletionRetentionPct: 0, overallPacingScore: 0,
      segments: [],
      suggestions: [{
        suggestionId: "empty-episode", kind: "sharpen-cliffhanger", priority: "critical", panelId: "none", panelIndex: 0,
        titleKo: "분석할 컷이 비어 있습니다", titleEn: "No panels available to simulate",
        detailKo: "최소 1개 이상의 세로 컷을 배치해 모바일 9:16 리듬을 측정하세요.", detailEn: "Add at least one vertical panel to simulate 9:16 pacing.",
        expectedRiskReduction: 0,
      }],
      cueSheet: buildScrollBeatCueSheet(input.episodeId, [], [], 0),
      summaryKo: "분석할 컷이 없습니다.", summaryEn: "No panels provided.",
    };
  }

  const yBounds: { readonly yStart: number; readonly yEnd: number }[] = [];
  let cursorY = 0;
  for (const p of input.panels) {
    const start = cursorY;
    const end = start + Math.max(80, p.heightPx);
    yBounds.push({ yStart: start, yEnd: end });
    cursorY = end + Math.max(0, p.gutterAfterPx);
  }
  const totalScrollHeightPx = Math.max(1, cursorY);

  const segments: ScrollHeatmapSegment[] = [];
  const suggestions: ScrollPacingSuggestion[] = [];
  let cumulativeFatigue = 10;
  let retention = 100;
  let heavyStreak = 0;

  for (let i = 0; i < input.panels.length; i += 1) {
    const panel = input.panels[i]; const bound = yBounds[i];
    if (!panel || !bound) continue;
    const prevPanel = i > 0 ? (input.panels[i - 1] ?? null) : null;

    const wStart = Math.max(0, bound.yStart - viewportHeightPx * 0.2);
    const wEnd = wStart + viewportHeightPx;
    let visibleCount = 0;
    for (const b of yBounds) if (b.yEnd > wStart && b.yStart < wEnd) visibleCount += 1;

    const panelsPerScreen = round1(visibleCount);
    const cutDensityScore = clamp(Math.round(Math.max(0, panelsPerScreen - 1.4) * 28 + clamp(panel.visualDensity, 0, 1) * 38), 0, 100);
    const charsPer100 = (panel.dialogueCharCount / Math.max(120, panel.heightPx)) * 100;
    const wordWallScore = clamp(Math.round((panel.dialogueCharCount / 115) * 58 + Math.max(0, panel.balloonCount - 1) * 11 + Math.max(0, charsPer100 - 14) * 1.4), 0, 100);
    const isWordWall = wordWallScore >= 62 || panel.dialogueCharCount >= 95 || panel.balloonCount >= 4;
    const gutterEval = evaluateGutterBreath(panel, prevPanel);

    if (panel.shotType === "silent-breath" && panel.dialogueCharCount <= 15) {
      cumulativeFatigue = clamp(cumulativeFatigue - 18, 4, 100);
      heavyStreak = 0;
    } else {
      const load = wordWallScore * 0.42 + cutDensityScore * 0.28 + (100 - gutterEval.score) * 0.3;
      cumulativeFatigue = clamp(cumulativeFatigue + (load - 38) * 0.42, 6, 100);
      heavyStreak = load >= 58 ? heavyStreak + 1 : 0;
    }

    const dropOffRisk = clamp(Math.round(wordWallScore * 0.36 + cutDensityScore * 0.2 + (100 - gutterEval.score) * 0.2 + cumulativeFatigue * 0.34 - clamp(panel.emotionalIntensity, 0, 100) * 0.22), 0, 100);
    const riskBand = classifyRiskBand(dropOffRisk);
    retention = clamp(round1(retention - (dropOffRisk >= 80 ? 5.8 : dropOffRisk >= 60 ? 3.4 : dropOffRisk >= 35 ? 1.5 : 0.45)), 12, 100);

    segments.push({
      panelId: panel.panelId, panelIndex: panel.index, labelKo: panel.labelKo, labelEn: panel.labelEn,
      yStartPx: bound.yStart, yEndPx: bound.yEnd,
      scrollStartPct: round1((bound.yStart / totalScrollHeightPx) * 100), scrollEndPct: round1((bound.yEnd / totalScrollHeightPx) * 100),
      panelsPerScreen, cutDensityScore, wordWallScore, isWordWall,
      gutterBreathScore: gutterEval.score, gutterStatus: gutterEval.status,
      cumulativeFatigue: round1(cumulativeFatigue), dropOffRisk, riskBand, estimatedRetentionPct: retention,
    });

    if (isWordWall) {
      suggestions.push({
        suggestionId: `sug-ww-${panel.panelId}`, kind: "break-word-wall", priority: wordWallScore >= 80 ? "critical" : "high",
        panelId: panel.panelId, panelIndex: panel.index,
        titleKo: `컷 #${panel.index} 대사 텍스트 벽 분할 필요`, titleEn: `Split word-wall in Cut #${panel.index}`,
        detailKo: `대사 ${panel.dialogueCharCount}자 · 말풍선 ${panel.balloonCount}개가 몰려 있습니다. 2컷으로 나누어 컷당 55자 이하로 줄이세요.`,
        detailEn: `${panel.dialogueCharCount} chars across ${panel.balloonCount} balloons crowd this cut. Split under 55 chars/panel.`,
        expectedRiskReduction: 22,
      });
    }
    if (gutterEval.status === "suffocating") {
      suggestions.push({
        suggestionId: `sug-gt-${panel.panelId}`, kind: "expand-gutter-breath", priority: "high",
        panelId: panel.panelId, panelIndex: panel.index,
        titleKo: `컷 #${panel.index} 하단 여백(Gutter) 호흡 부족`, titleEn: `Expand gutter after Cut #${panel.index}`,
        detailKo: `현재 여백 ${panel.gutterAfterPx}px로 9:16 시선 전환이 답답합니다. 110~160px 이상 여백을 확보하세요.`,
        detailEn: `Current ${panel.gutterAfterPx}px gutter cramps flow. Expand to 110-160px for breathing rhythm.`,
        expectedRiskReduction: 14,
      });
    }
    if (panelsPerScreen >= 3) {
      suggestions.push({
        suggestionId: `sug-den-${panel.panelId}`, kind: "rebalance-cut-density", priority: "medium",
        panelId: panel.panelId, panelIndex: panel.index,
        titleKo: `컷 #${panel.index} 구간 9:16 화면당 컷 과밀(${panelsPerScreen}컷)`, titleEn: `High 9:16 density around Cut #${panel.index}`,
        detailKo: `한 모바일 화면에 ${panelsPerScreen}컷이 겹쳐 시선이 분산됩니다. 핵심 컷 높이를 520px 이상으로 확장하세요.`,
        detailEn: `${panelsPerScreen} cuts stack in one viewport. Stretch the hero cut above 520px.`,
        expectedRiskReduction: 12,
      });
    }
    if (heavyStreak === 2) {
      suggestions.push({
        suggestionId: `sug-breath-${panel.panelId}`, kind: "insert-silent-breath", priority: "high",
        panelId: panel.panelId, panelIndex: panel.index,
        titleKo: `컷 #${panel.index} 직후 무대사 호흡 컷 삽입 권장`, titleEn: `Insert silent breath beat after Cut #${panel.index}`,
        detailKo: `고밀도 컷이 연속되어 누적 피로도가 ${round1(cumulativeFatigue)}까지 올랐습니다. 무대사 컷으로 완급을 조절하세요.`,
        detailEn: `Consecutive heavy cuts pushed fatigue to ${round1(cumulativeFatigue)}. Add a wordless breath beat.`,
        expectedRiskReduction: 16,
      });
    }
  }

  const cliffhangerHookScore = computeCliffhangerHookScore(input.panels);
  const lastPanel = input.panels[input.panels.length - 1];
  if (cliffhangerHookScore < 65 && lastPanel) {
    suggestions.push({
      suggestionId: `sug-cliff-${lastPanel.panelId}`, kind: "sharpen-cliffhanger",
      priority: cliffhangerHookScore < 45 ? "critical" : "high", panelId: lastPanel.panelId, panelIndex: lastPanel.index,
      titleKo: `회차 말미 클리프행어 훅 보강 필요(${cliffhangerHookScore}점)`, titleEn: `Strengthen cliffhanger (${cliffhangerHookScore}/100)`,
      detailKo: `마지막 컷(#${lastPanel.index})의 감정 강도(${lastPanel.emotionalIntensity})와 반전 임팩트를 끌어올리세요.`,
      detailEn: `Final Cut #${lastPanel.index} lacks tension peak (${lastPanel.emotionalIntensity}). End on a sharp reveal.`,
      expectedRiskReduction: 18,
    });
  }

  const averageDropOffRisk = round1(segments.reduce((s, x) => s + x.dropOffRisk, 0) / segments.length);
  const peakSeg = segments.reduce<ScrollHeatmapSegment | null>((best, cur) => (!best || cur.dropOffRisk > best.dropOffRisk ? cur : best), null);
  const wordWallPanelCount = segments.filter((s) => s.isWordWall).length;
  const gutterBreathAverage = round1(segments.reduce((s, x) => s + x.gutterBreathScore, 0) / segments.length);
  const estimatedCompletionRetentionPct = segments[segments.length - 1]?.estimatedRetentionPct ?? 0;
  const overallPacingScore = clamp(Math.round((100 - averageDropOffRisk) * 0.48 + gutterBreathAverage * 0.22 + cliffhangerHookScore * 0.3), 0, 100);
  const cueSheet = buildScrollBeatCueSheet(input.episodeId, input.panels, yBounds, totalScrollHeightPx);

  return {
    episodeId: input.episodeId, episodeNumber: input.episodeNumber, titleKo: input.titleKo, titleEn: input.titleEn,
    viewportWidthPx, viewportHeightPx, aspectRatioLabel: "9:16",
    totalScrollHeightPx, screenCount: round1(totalScrollHeightPx / Math.max(1, viewportHeightPx)), panelCount: input.panels.length,
    averageDropOffRisk, peakDropOffRisk: peakSeg?.dropOffRisk ?? 0, peakRiskPanelId: peakSeg?.panelId ?? null,
    wordWallPanelCount, gutterBreathAverage, cliffhangerHookScore, estimatedCompletionRetentionPct, overallPacingScore,
    segments, suggestions, cueSheet,
    summaryKo: `평균 이탈 위험 ${averageDropOffRisk} · 대사 벽 ${wordWallPanelCount}컷 · 클리프행어 ${cliffhangerHookScore}점 · 예상 잔존율 ${estimatedCompletionRetentionPct}%`,
    summaryEn: `Avg drop-off ${averageDropOffRisk} · ${wordWallPanelCount} word-walls · cliffhanger ${cliffhangerHookScore}/100 · est. retention ${estimatedCompletionRetentionPct}%`,
  };
}

/** 비교용 모바일 9:16 에피소드 프리셋 2종 (피로 과밀 회차 vs 리듬 최적화 회차). */
export const DEFAULT_SCROLL_EPISODE_PRESETS: readonly ScrollEpisodePacingInput[] = [
  {
    episodeId: "ep02-wordwall", episodeNumber: 2,
    titleKo: "EP.02 지하 도서관의 기록 (수정 전 · 대사 벽 과밀)",
    titleEn: "EP.02 Underground Archive (Draft · Word-Wall Heavy)",
    viewportWidthPx: DEFAULT_MOBILE_W, viewportHeightPx: DEFAULT_MOBILE_H,
    panels: [
      { panelId: "p-01", index: 1, labelKo: "도서관 진입 전경", labelEn: "Archive Entrance", heightPx: 420, gutterAfterPx: 90, dialogueCharCount: 34, dialogueWordCount: 9, balloonCount: 1, visualDensity: 0.45, shotType: "establishing", emotionalIntensity: 48, sceneMood: "mystery", sfxTag: "rain-swell" },
      { panelId: "p-02", index: 2, labelKo: "사서 장문 세계관 설명 1", labelEn: "Archivist Lore Dump 1", heightPx: 260, gutterAfterPx: 32, dialogueCharCount: 138, dialogueWordCount: 36, balloonCount: 5, visualDensity: 0.82, shotType: "medium", emotionalIntensity: 32, sceneMood: "mystery", sfxTag: "paper-flip" },
      { panelId: "p-03", index: 3, labelKo: "연속 밀집 설명 2", labelEn: "Dense Exposition 2", heightPx: 240, gutterAfterPx: 28, dialogueCharCount: 124, dialogueWordCount: 31, balloonCount: 4, visualDensity: 0.85, shotType: "medium", emotionalIntensity: 34, sceneMood: "mystery" },
      { panelId: "p-04", index: 4, labelKo: "암호표 클로즈업 과밀", labelEn: "Cramped Cipher Cut", heightPx: 250, gutterAfterPx: 34, dialogueCharCount: 102, dialogueWordCount: 25, balloonCount: 4, visualDensity: 0.78, shotType: "closeup", emotionalIntensity: 52, sceneMood: "tension", sfxTag: "heartbeat" },
      { panelId: "p-05", index: 5, labelKo: "복도 발소리 추적", labelEn: "Corridor Footsteps", heightPx: 480, gutterAfterPx: 110, dialogueCharCount: 42, dialogueWordCount: 11, balloonCount: 2, visualDensity: 0.58, shotType: "action-splash", emotionalIntensity: 68, sceneMood: "tension", sfxTag: "door-slam" },
      { panelId: "p-06", index: 6, labelKo: "평탄한 마무리 설명", labelEn: "Flat Closing Exposition", heightPx: 380, gutterAfterPx: 60, dialogueCharCount: 94, dialogueWordCount: 24, balloonCount: 3, visualDensity: 0.5, shotType: "medium", emotionalIntensity: 36, sceneMood: "calm" },
    ],
  },
  {
    episodeId: "ep12-cliffhanger", episodeNumber: 12,
    titleKo: "EP.12 13번째 타종 (리듬 최적화 · 강 클리프행어)",
    titleEn: "EP.12 The 13th Bell (Pacing Tuned · Strong Cliffhanger)",
    viewportWidthPx: DEFAULT_MOBILE_W, viewportHeightPx: DEFAULT_MOBILE_H,
    panels: [
      { panelId: "t-01", index: 1, labelKo: "폭설 속 시계탑 롱샷", labelEn: "Snowy Clocktower Long Shot", heightPx: 540, gutterAfterPx: 140, dialogueCharCount: 24, dialogueWordCount: 6, balloonCount: 1, visualDensity: 0.42, shotType: "establishing", emotionalIntensity: 62, sceneMood: "mystery", sfxTag: "rain-swell" },
      { panelId: "t-02", index: 2, labelKo: "금고 다이얼 회전", labelEn: "Vault Dial Turn", heightPx: 460, gutterAfterPx: 120, dialogueCharCount: 38, dialogueWordCount: 10, balloonCount: 2, visualDensity: 0.5, shotType: "closeup", emotionalIntensity: 70, sceneMood: "tension", sfxTag: "heartbeat" },
      { panelId: "t-03", index: 3, labelKo: "무대사 정적 호흡 컷", labelEn: "Wordless Silence Breath", heightPx: 520, gutterAfterPx: 210, dialogueCharCount: 0, dialogueWordCount: 0, balloonCount: 0, visualDensity: 0.25, shotType: "silent-breath", emotionalIntensity: 76, sceneMood: "tension", sfxTag: "silence-drop" },
      { panelId: "t-04", index: 4, labelKo: "종탑 기어 붕괴 액션", labelEn: "Clock Gear Collapse Action", heightPx: 680, gutterAfterPx: 150, dialogueCharCount: 26, dialogueWordCount: 7, balloonCount: 1, visualDensity: 0.68, shotType: "action-splash", emotionalIntensity: 88, sceneMood: "action", sfxTag: "clock-chime" },
      { panelId: "t-05", index: 5, labelKo: "진범 가면 탈착 클리프행어", labelEn: "Culprit Unmasked Cliffhanger", heightPx: 720, gutterAfterPx: 180, dialogueCharCount: 22, dialogueWordCount: 5, balloonCount: 1, visualDensity: 0.54, shotType: "cliffhanger", emotionalIntensity: 96, sceneMood: "reveal", isCliffhangerBeat: true, sfxTag: "flash-hit" },
    ],
  },
];
