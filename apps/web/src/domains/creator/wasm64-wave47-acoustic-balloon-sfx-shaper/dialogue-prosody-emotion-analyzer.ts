/**
 * Wave 47: 대사 감정·음향 운율 분석기 및 세로 웹툰 한글 어절 균형 줄바꿈 엔진.
 *
 * - 한국어/영어 대사의 문장부호(`!`, `?`, `...`, `~`, 반복 자모, 괄호 속삭임, 내면 인용)와
 *   선택적 음성 에너지·피치 프로파일을 결정론적으로 융합해 7종 감정과 강도(`0..1`)를 산출한다.
 * - 세로 스크롤 웹툰 말풍선에서 마지막 줄 외톨이 글자(Orphan)를 막고 시각적 너비 편차를
 *   최소화하는 동적 계획법(DP) 기반 한글 어절 줄바꿈을 수행한다.
 */

export type DialogueEmotionKind =
  | "calm" | "whisper" | "shout" | "shock" | "tremor" | "narration" | "inner_thought";

export type RecommendedBalloonStyle =
  | "ellipse" | "cloud" | "tremor_wave" | "burst_spike" | "double_border" | "dashed_whisper";

export const DEFAULT_MAX_LINE_UNITS = 12 as const;
export const DEFAULT_MIN_ORPHAN_UNITS = 2.2 as const;
export const DEFAULT_FONT_SIZE_PX = 18 as const;
export const DEFAULT_LINE_HEIGHT_RATIO = 1.45 as const;

export const DIALOGUE_EMOTION_LABELS_KO: Readonly<Record<DialogueEmotionKind, string>> = {
  calm: "차분한 대사",
  whisper: "속삭임",
  shout: "외침",
  shock: "충격",
  tremor: "떨림",
  narration: "내레이션",
  inner_thought: "속마음",
};

export interface AcousticProsodyProfile {
  /** 평균 음압 레벨(`dBFS`, 대략 `-60..0`). */
  readonly rmsDb?: number;
  /** 정규화된 최대 음향 에너지(`0..1`). */
  readonly peakEnergy?: number;
  /** 평균 기본 주파수(`Hz`). */
  readonly pitchMeanHz?: number;
  /** 문장 내 피치 변동 폭(반음 단위, `0..24`). */
  readonly pitchRangeSemitones?: number;
  /** 성대 떨림·미세 지터 비율(`0..1`). */
  readonly pitchJitterRatio?: number;
  /** 초당 음절 발화 속도. */
  readonly speechRateSyllablesPerSec?: number;
  /** 속삭임·기식음 비율(`0..1`). */
  readonly breathinessRatio?: number;
}

export interface OpticalLineBalanceOptions {
  readonly maxLineUnits?: number;
  readonly minOrphanUnits?: number;
  readonly maxLines?: number;
  readonly fontSizePx?: number;
  readonly lineHeightRatio?: number;
}

export interface DialogueProsodyInput {
  readonly text: string;
  readonly prosody?: AcousticProsodyProfile;
  readonly lineBalance?: OpticalLineBalanceOptions;
  readonly isNarrationBox?: boolean;
  readonly isInnerThought?: boolean;
}

export interface DialogueProsodySignals {
  readonly exclamationCount: number;
  readonly questionCount: number;
  readonly interrobangCount: number;
  readonly ellipsisCount: number;
  readonly tildeCount: number;
  readonly repeatedJamoCount: number;
  readonly hasWhisperBrackets: boolean;
  readonly hasThoughtMarkers: boolean;
  readonly hasNarrationMarkers: boolean;
  readonly allCapsRatio: number;
  readonly stutterSegmentCount: number;
  readonly acousticEnergy: number | null;
  readonly acousticJitter: number | null;
  readonly acousticBreathiness: number | null;
}

export interface OpticalBalancedLine {
  readonly text: string;
  readonly opticalUnits: number;
  readonly wordCount: number;
  readonly estimatedWidthPx: number;
}

export interface OpticalLineBalanceResult {
  readonly lines: readonly OpticalBalancedLine[];
  readonly maxLineWidthPx: number;
  readonly estimatedTextBoxWidthPx: number;
  readonly estimatedTextBoxHeightPx: number;
  readonly balanceVariance: number;
  readonly orphanPrevented: boolean;
}

export interface DialogueProsodyAnalysis {
  readonly emotion: DialogueEmotionKind;
  readonly emotionLabelKo: string;
  readonly intensity: number;
  readonly confidence: number;
  readonly scores: Readonly<Record<DialogueEmotionKind, number>>;
  readonly recommendedBalloonStyle: RecommendedBalloonStyle;
  readonly signals: DialogueProsodySignals;
  readonly balancedText: OpticalLineBalanceResult;
}

const PRIORITY_ORDER: readonly DialogueEmotionKind[] = [
  "narration", "inner_thought", "shock", "shout", "tremor", "whisper", "calm",
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function measureCharUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === " " || ch === "\t") return 0.32;
  if (
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)
  ) return 1.0;
  if (code >= 0x41 && code <= 0x5a) return 0.68;
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) return 0.56;
  return 0.38;
}

/** 문자열의 세로 웹툰 말풍선 기준 시각 폭(한글 1음절 = `1.0`)을 계산한다. */
export function measureOpticalTextUnits(text: string): number {
  let total = 0;
  for (const ch of text) total += measureCharUnits(ch);
  return round3(total);
}

function splitOversizedToken(token: string, maxUnits: number): string[] {
  if (measureOpticalTextUnits(token) <= maxUnits || token.length <= 1) return [token];
  const chunks: string[] = [];
  let current = "";
  let currentUnits = 0;
  for (const ch of token) {
    const chUnits = measureCharUnits(ch);
    if (current.length > 0 && currentUnits + chUnits > maxUnits) {
      chunks.push(current);
      current = ch;
      currentUnits = chUnits;
    } else {
      current += ch;
      currentUnits += chUnits;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function greedyHasOrphan(tokens: readonly string[], maxUnits: number, minOrphan: number): boolean {
  if (tokens.length <= 1) return false;
  const widths: number[] = [];
  const words: number[] = [];
  let curW = 0;
  let curWords = 0;
  for (const token of tokens) {
    const w = measureOpticalTextUnits(token);
    const nextW = curWords === 0 ? w : curW + 0.32 + w;
    if (curWords > 0 && nextW > maxUnits) {
      widths.push(curW);
      words.push(curWords);
      curW = w;
      curWords = 1;
    } else {
      curW = nextW;
      curWords += 1;
    }
  }
  if (curWords > 0) {
    widths.push(curW);
    words.push(curWords);
  }
  if (widths.length <= 1) return false;
  const lastW = widths[widths.length - 1] ?? 0;
  const lastWords = words[words.length - 1] ?? 0;
  const avgW = widths.reduce((acc, v) => acc + v, 0) / widths.length;
  return lastW < minOrphan || (lastWords === 1 && lastW < avgW * 0.45);
}

function balanceSingleParagraph(
  paragraph: string,
  maxUnits: number,
  minOrphan: number,
): { readonly lines: readonly string[]; readonly orphanPrevented: boolean } {
  const rawTokens = paragraph.trim().split(/\s+/u).filter(Boolean);
  if (rawTokens.length === 0) return { lines: [], orphanPrevented: false };

  const tokens: string[] = [];
  for (const token of rawTokens) tokens.push(...splitOversizedToken(token, maxUnits));
  const n = tokens.length;
  const unitList = tokens.map((token) => measureOpticalTextUnits(token));

  const spanWidth = (start: number, end: number): number => {
    let w = 0;
    for (let k = start; k < end; k += 1) {
      w += unitList[k] ?? 0;
      if (k > start) w += 0.32;
    }
    return w;
  };

  const fullWidth = spanWidth(0, n);
  if (fullWidth <= maxUnits) return { lines: [tokens.join(" ")], orphanPrevented: false };

  const estLines = Math.max(2, Math.ceil(fullWidth / Math.max(maxUnits * 0.88, 1)));
  const targetW = clamp(fullWidth / estLines, minOrphan, maxUnits);

  const dpCost = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const prevBreak = new Array<number>(n + 1).fill(0);
  dpCost[0] = 0;

  for (let i = 1; i <= n; i += 1) {
    for (let j = i - 1; j >= 0; j -= 1) {
      const w = spanWidth(j, i);
      if (w > maxUnits && i - j > 1) break;
      const base = dpCost[j] ?? Number.POSITIVE_INFINITY;
      if (!Number.isFinite(base)) continue;

      const diff = (w - targetW) / Math.max(maxUnits, 1);
      let penalty = diff * diff * 12 + 0.75;
      if (i === n && j > 0) {
        if (w < minOrphan) penalty += 30;
        else if (i - j === 1 && w < targetW * 0.5) penalty += 16;
      } else if (i < n && w < minOrphan) {
        penalty += 14;
      }

      if (base + penalty < (dpCost[i] ?? Number.POSITIVE_INFINITY)) {
        dpCost[i] = base + penalty;
        prevBreak[i] = j;
      }
    }
  }

  const lines: string[] = [];
  for (let cur = n; cur > 0; cur = prevBreak[cur] ?? 0) {
    lines.push(tokens.slice(prevBreak[cur] ?? 0, cur).join(" "));
  }
  lines.reverse();

  const lastUnits = measureOpticalTextUnits(lines[lines.length - 1] ?? "");
  const orphanPrevented =
    greedyHasOrphan(tokens, maxUnits, minOrphan) && lines.length > 1 && lastUnits >= minOrphan;
  return { lines, orphanPrevented };
}

/** 세로 스크롤 웹툰 말풍선에 맞춰 어절 보존·외톨이 방지 광학 균형 줄바꿈을 계산한다. */
export function balanceHangulDialogueLines(
  text: string,
  options: OpticalLineBalanceOptions = {},
): OpticalLineBalanceResult {
  const maxUnits = clamp(options.maxLineUnits ?? DEFAULT_MAX_LINE_UNITS, 4, 48);
  const minOrphan = clamp(options.minOrphanUnits ?? DEFAULT_MIN_ORPHAN_UNITS, 1, maxUnits * 0.45);
  const fontSizePx = clamp(options.fontSizePx ?? DEFAULT_FONT_SIZE_PX, 10, 72);
  const lineHeightRatio = clamp(options.lineHeightRatio ?? DEFAULT_LINE_HEIGHT_RATIO, 1.1, 2.2);

  const balancedLines: OpticalBalancedLine[] = [];
  let orphanPrevented = false;

  for (const paragraph of text.split(/\r?\n/u)) {
    if (paragraph.trim().length === 0) continue;
    const result = balanceSingleParagraph(paragraph, maxUnits, minOrphan);
    if (result.orphanPrevented) orphanPrevented = true;
    for (const lineText of result.lines) {
      const opticalUnits = measureOpticalTextUnits(lineText);
      balancedLines.push({
        text: lineText,
        opticalUnits,
        wordCount: lineText.split(/\s+/u).filter(Boolean).length,
        estimatedWidthPx: round3(opticalUnits * fontSizePx),
      });
    }
  }

  const maxLineWidthPx = balancedLines.reduce((acc, l) => Math.max(acc, l.estimatedWidthPx), 0);
  const meanU = balancedLines.length > 0
    ? balancedLines.reduce((acc, l) => acc + l.opticalUnits, 0) / balancedLines.length
    : 0;
  const variance = balancedLines.length > 1
    ? balancedLines.reduce((acc, l) => acc + (l.opticalUnits - meanU) ** 2, 0) / balancedLines.length
    : 0;

  return {
    lines: balancedLines,
    maxLineWidthPx: round3(maxLineWidthPx),
    estimatedTextBoxWidthPx: round3(maxLineWidthPx),
    estimatedTextBoxHeightPx: round3(balancedLines.length * fontSizePx * lineHeightRatio),
    balanceVariance: round3(variance),
    orphanPrevented,
  };
}

function extractSignals(
  trimmed: string,
  prosody: AcousticProsodyProfile | undefined,
  isNarrationBox: boolean,
  isInnerThought: boolean,
): DialogueProsodySignals {
  const latin = trimmed.match(/[A-Za-z]/gu) ?? [];
  const upper = trimmed.match(/[A-Z]/gu) ?? [];
  const stutter =
    (trimmed.match(/([가-힣])[,…-]\s*\1/gu) ?? []).length +
    (trimmed.match(/\b([A-Za-z])-\1/giu) ?? []).length +
    (trimmed.match(/(ㄷㄷ|덜덜|부들|후들|떨려)/gu) ?? []).length;

  let acousticEnergy: number | null = null;
  if (prosody?.peakEnergy !== undefined && Number.isFinite(prosody.peakEnergy)) {
    acousticEnergy = round3(clamp(prosody.peakEnergy, 0, 1));
  } else if (prosody?.rmsDb !== undefined && Number.isFinite(prosody.rmsDb)) {
    acousticEnergy = round3(clamp((prosody.rmsDb + 54) / 50, 0, 1));
  }

  return {
    exclamationCount: (trimmed.match(/!/gu) ?? []).length,
    questionCount: (trimmed.match(/\?/gu) ?? []).length,
    interrobangCount: (trimmed.match(/(!\?|\?!|⁉)/gu) ?? []).length,
    ellipsisCount: (trimmed.match(/(\.{2,}|…)/gu) ?? []).length,
    tildeCount: (trimmed.match(/[~～]/gu) ?? []).length,
    repeatedJamoCount: (trimmed.match(/([ㄱ-ㅎㅏ-ㅣ])\1+|([가-힣])\2{2,}|([A-Za-z])\3{2,}/gu) ?? []).length,
    hasWhisperBrackets: /^\s*[（(].+[)）]\s*$/su.test(trimmed) || /(속닥|소곤|쉿|작게)/u.test(trimmed),
    hasThoughtMarkers:
      isInnerThought || /^\s*['‘].+['’]\s*$/su.test(trimmed) || /(인가|일까|인 걸까|일지도|속으로|생각해)/u.test(trimmed),
    hasNarrationMarkers: isNarrationBox || /^\s*[[【『〈].+[\]】』〉]\s*$/su.test(trimmed),
    allCapsRatio: latin.length >= 4 ? round3(upper.length / latin.length) : 0,
    stutterSegmentCount: stutter,
    acousticEnergy,
    acousticJitter:
      prosody?.pitchJitterRatio !== undefined && Number.isFinite(prosody.pitchJitterRatio)
        ? round3(clamp(prosody.pitchJitterRatio, 0, 1))
        : null,
    acousticBreathiness:
      prosody?.breathinessRatio !== undefined && Number.isFinite(prosody.breathinessRatio)
        ? round3(clamp(prosody.breathinessRatio, 0, 1))
        : null,
  };
}

function mapBalloonStyle(emotion: DialogueEmotionKind): RecommendedBalloonStyle {
  if (emotion === "whisper") return "dashed_whisper";
  if (emotion === "inner_thought") return "cloud";
  if (emotion === "tremor") return "tremor_wave";
  if (emotion === "shout") return "burst_spike";
  if (emotion === "shock" || emotion === "narration") return "double_border";
  return "ellipse";
}

/** 대사 텍스트와 선택적 음향 프로파일에서 감정 유형, 강도(`0..1`), 최적 줄바꿈을 결정론적으로 산출한다. */
export function analyzeDialogueProsody(input: DialogueProsodyInput): DialogueProsodyAnalysis {
  const trimmed = input.text.trim();
  const signals = extractSignals(trimmed, input.prosody, input.isNarrationBox === true, input.isInnerThought === true);
  const balancedText = balanceHangulDialogueLines(trimmed, input.lineBalance);

  const pitchRange =
    input.prosody?.pitchRangeSemitones !== undefined && Number.isFinite(input.prosody.pitchRangeSemitones)
      ? clamp(input.prosody.pitchRangeSemitones, 0, 24)
      : 0;
  const hasShockCue = /(헉|설마|말도 안 돼|뭐라고|맙소사|WHAT\?!|NO WAY)/iu.test(trimmed);

  const raw: Record<DialogueEmotionKind, number> = {
    calm: 0.28 + (signals.tildeCount > 0 ? 0.12 : 0),
    whisper: 0,
    shout: 0,
    shock: 0,
    tremor: 0,
    narration: 0,
    inner_thought: 0,
  };

  if (signals.hasNarrationMarkers) raw.narration += input.isNarrationBox ? 1.15 : 0.95;
  if (signals.hasThoughtMarkers) raw.inner_thought += (input.isInnerThought ? 1.12 : 0.72) + (signals.ellipsisCount > 0 ? 0.14 : 0);
  if (signals.hasWhisperBrackets) raw.whisper += 0.86;
  if (signals.acousticEnergy !== null && signals.acousticEnergy <= 0.28) raw.whisper += (0.28 - signals.acousticEnergy) * 1.4;
  if (signals.acousticBreathiness !== null && signals.acousticBreathiness >= 0.45) raw.whisper += signals.acousticBreathiness * 0.55;

  if (signals.stutterSegmentCount > 0) raw.tremor += 0.58 + Math.min(signals.stutterSegmentCount - 1, 3) * 0.16;
  if (signals.ellipsisCount >= 2 && signals.exclamationCount === 0 && !signals.hasThoughtMarkers) raw.tremor += 0.25;
  if (signals.acousticJitter !== null && signals.acousticJitter >= 0.4) raw.tremor += signals.acousticJitter * 0.85;

  if (signals.exclamationCount > 0) raw.shout += Math.min(signals.exclamationCount, 4) * 0.28;
  if (signals.allCapsRatio >= 0.75) raw.shout += 0.42;
  if (signals.repeatedJamoCount > 0 && signals.exclamationCount > 0) raw.shout += 0.24;
  if (signals.acousticEnergy !== null && signals.acousticEnergy >= 0.68) raw.shout += (signals.acousticEnergy - 0.5) * 1.25;

  if (signals.interrobangCount > 0) raw.shock += 0.82 + Math.min(signals.interrobangCount - 1, 2) * 0.2;
  if (hasShockCue) raw.shock += 0.56;
  if (pitchRange >= 9 && (signals.acousticEnergy ?? 0) >= 0.75) raw.shock += 0.52 + (pitchRange - 9) * 0.04;
  if (signals.exclamationCount >= 2 && signals.questionCount >= 1) raw.shock += 0.35;

  let selected: DialogueEmotionKind = "calm";
  let topScore = raw.calm;
  let secondScore = 0;
  for (const kind of PRIORITY_ORDER) {
    const score = raw[kind];
    if (score > topScore) {
      secondScore = topScore;
      topScore = score;
      selected = kind;
    } else if (kind !== selected && score > secondScore) {
      secondScore = score;
    }
  }

  let intensity: number;
  if (trimmed.length === 0) {
    intensity = 0.1;
  } else if (selected === "calm") {
    intensity = clamp(0.18 + (signals.acousticEnergy !== null ? signals.acousticEnergy * 0.2 : 0.1) + Math.min(signals.tildeCount, 2) * 0.05, 0.1, 0.45);
  } else if (selected === "narration") {
    intensity = clamp(0.32 + Math.min(balancedText.lines.length, 4) * 0.06, 0.25, 0.6);
  } else {
    const boost = selected === "whisper" ? (signals.acousticBreathiness ?? 0) * 0.2 : (signals.acousticEnergy ?? 0) * 0.22;
    intensity = clamp(0.35 + Math.min(topScore, 1.3) * 0.42 + boost, 0.25, 1);
  }

  return {
    emotion: selected,
    emotionLabelKo: DIALOGUE_EMOTION_LABELS_KO[selected],
    intensity: round3(intensity),
    confidence: round3(trimmed.length === 0 ? 0.5 : clamp(0.55 + Math.max(0, topScore - secondScore) * 0.45, 0.5, 0.99)),
    scores: {
      calm: round3(clamp(raw.calm, 0, 1)),
      whisper: round3(clamp(raw.whisper, 0, 1)),
      shout: round3(clamp(raw.shout, 0, 1)),
      shock: round3(clamp(raw.shock, 0, 1)),
      tremor: round3(clamp(raw.tremor, 0, 1)),
      narration: round3(clamp(raw.narration, 0, 1)),
      inner_thought: round3(clamp(raw.inner_thought, 0, 1)),
    },
    recommendedBalloonStyle: mapBalloonStyle(selected),
    signals,
    balancedText,
  };
}
