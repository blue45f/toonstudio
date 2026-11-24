/**
 * 음성 운율(Prosody) & 대사 리듬 기반 웹툰 말풍선 자동 조판 코어 엔진.
 *
 * - 외부 네트워크 호출 없이 100% 로컬 결정적(deterministic) 알고리즘으로 동작한다.
 * - 한글 어절 보존(`[word-break:keep-all]`)과 영문 단어 경계 줄바꿈을 결합해 모바일 800px 세로 스트립에서
 *   한 줄 14~18자 최적 가독성과 0겹침(0-overlap) 수직 여백을 보장한다.
 */

import type {
  BalloonGeometryKind,
  BalloonLayoutOptions,
  BalloonTailDirection,
  DynamicTypographyMetrics,
  KineticSfxCallout,
  KineticSfxEmphasis,
  LaidOutSpeechBalloon,
  LayoutOverlapPair,
  OverlapCheckResult,
  SpeakerAlignment,
  VoiceBalloonLayoutResult,
  VoiceEmotionTag,
  VoiceProsodyCue,
  VoiceScriptPreset,
} from "./types";

export const DEFAULT_STRIP_WIDTH_PX = 800;
export const DEFAULT_MAX_CHARS_PER_LINE = 16;
export const MIN_CHARS_PER_LINE_LIMIT = 12;
export const MAX_CHARS_PER_LINE_LIMIT = 18;
export const DEFAULT_HORIZONTAL_MARGIN_PX = 44;
export const DEFAULT_MIN_VERTICAL_GUTTER_PX = 34;
export const DEFAULT_BASE_FONT_SIZE_PX = 22;

export const BALLOON_GEOMETRY_META_KO: Readonly<
  Record<BalloonGeometryKind, { readonly labelKo: string; readonly hintKo: string }>
> = {
  "normal-oval": { labelKo: "일반 타원", hintKo: "표준 대화·일상 리듬" },
  "shout-spike": { labelKo: "외침 톱니", hintKo: "고에너지·급상승 피치 강조" },
  "whisper-dashed": { labelKo: "속삭임 점선", hintKo: "저음압·친밀한 속삭임" },
  "thought-cloud": { labelKo: "독백 구름", hintKo: "내면 독백·심리 묘사" },
  "narration-rect": { labelKo: "내레이션 사각", hintKo: "상황 설명·시간 경과 박스" },
};

export const VOICE_EMOTION_LABELS_KO: Readonly<Record<VoiceEmotionTag, string>> = {
  neutral: "평온 대화",
  anger: "격앙·분노",
  urgency: "긴박·다급",
  whisper: "속삭임",
  affection: "설렘·다정",
  thought: "내면 독백",
  narration: "내레이션",
  shock: "충격·경악",
  deadpan: "정색·무표정",
};

export const VOICE_BALLOON_PRESETS: readonly VoiceScriptPreset[] = [
  {
    id: "action-duel",
    nameKo: "액션 대결",
    genreKo: "판타지 액션 · 옥상 결계 돌파",
    descriptionKo: "짧은 휴지와 높은 음압 피크, 외침 톱니 말풍선과 타격 SFX가 교차하는 고속 전투 템포입니다.",
    stripWidthPx: DEFAULT_STRIP_WIDTH_PX,
    cues: [
      { id: "act-1", speaker: "내레이션", alignment: "center", text: "자정이 지나자 옥상 결계의 마지막 봉인이 금이 가기 시작했다.", pauseBeforeMs: 240, durationMs: 2200, peakDb: -13.5, pitchSlopeSemitones: -0.4, emotion: "narration" },
      { id: "act-2", speaker: "강현", alignment: "left", text: "그 검을 내려놔. 지금 당장 멈추지 않으면 도시 전체가 휘말려!", pauseBeforeMs: 320, durationMs: 1950, peakDb: -4.2, pitchSlopeSemitones: 5.4, emotion: "urgency", sfxHint: "쩌적!" },
      { id: "act-3", speaker: "세라", alignment: "right", text: "늦었어. 이미 좌표는 고정됐어!", pauseBeforeMs: 160, durationMs: 1200, peakDb: -1.6, pitchSlopeSemitones: 6.8, emotion: "anger", sfxHint: "쾅!!" },
      { id: "act-4", speaker: "강현", alignment: "left", text: "호흡을 고르자... 0.4초만 버티면 반격 각이 열린다.", pauseBeforeMs: 680, durationMs: 2100, peakDb: -16.4, pitchSlopeSemitones: -1.2, emotion: "thought" },
      { id: "act-5", speaker: "강현", alignment: "left", text: "지금이다! 파쇄 베기!", pauseBeforeMs: 140, durationMs: 920, peakDb: -0.8, pitchSlopeSemitones: 7.4, emotion: "shock", sfxHint: "번쩍!!" },
    ],
  },
  {
    id: "romance-whisper",
    nameKo: "로맨스 속삭임",
    genreKo: "감성 로맨스 · 빗속 우산 아래",
    descriptionKo: "긴 침묵 여백과 낮은 음압의 점선 속삭임, 내면 독백 구름이 천천히 호흡을 이끄는 연출입니다.",
    stripWidthPx: DEFAULT_STRIP_WIDTH_PX,
    cues: [
      { id: "rom-1", speaker: "내레이션", alignment: "center", text: "소나기가 잦아든 골목, 하나의 우산 아래 어깨가 스쳤다.", pauseBeforeMs: 300, durationMs: 2400, peakDb: -15.0, pitchSlopeSemitones: -0.6, emotion: "narration" },
      { id: "rom-2", speaker: "지우", alignment: "left", text: "우산... 조금만 더 이쪽으로 기울여도 될까요?", pauseBeforeMs: 860, durationMs: 2300, peakDb: -22.5, pitchSlopeSemitones: 1.4, emotion: "whisper", sfxHint: "후두둑" },
      { id: "rom-3", speaker: "도윤", alignment: "right", text: "목소리가 너무 작아서 심장 소리가 먼저 들릴 것 같아.", pauseBeforeMs: 1080, durationMs: 2500, peakDb: -19.8, pitchSlopeSemitones: -1.8, emotion: "thought", sfxHint: "두근..." },
      { id: "rom-4", speaker: "도윤", alignment: "right", text: "어깨 다 젖어요. 그냥 내 쪽으로 바짝 붙어요.", pauseBeforeMs: 740, durationMs: 2100, peakDb: -14.2, pitchSlopeSemitones: -1.1, emotion: "affection" },
      { id: "rom-5", speaker: "지우", alignment: "left", text: "사실은... 비가 조금 더 오래 왔으면 좋겠어요.", pauseBeforeMs: 1120, durationMs: 2450, peakDb: -24.1, pitchSlopeSemitones: -2.2, emotion: "whisper" },
    ],
  },
  {
    id: "comedy-twist",
    nameKo: "코미디 반전",
    genreKo: "일상 개그 · 고지서 대참사",
    descriptionKo: "무표정 정색에서 급격한 음압 폭발과 한영 혼용 비명으로 리듬이 꺾이는 반전 타이밍입니다.",
    stripWidthPx: DEFAULT_STRIP_WIDTH_PX,
    cues: [
      { id: "com-1", speaker: "민수", alignment: "left", text: "이번 달엔 커피도 줄이고 배달도 끊었어. 완벽한 절약 라이프지.", pauseBeforeMs: 280, durationMs: 2350, peakDb: -11.4, pitchSlopeSemitones: 0.6, emotion: "neutral" },
      { id: "com-2", speaker: "룸메", alignment: "right", text: "형, 현관에 관리비 고지서 왔는데 숫자가 좀 특이해.", pauseBeforeMs: 420, durationMs: 1900, peakDb: -13.8, pitchSlopeSemitones: -0.9, emotion: "deadpan", sfxHint: "스윽..." },
      { id: "com-3", speaker: "민수", alignment: "left", text: "설마 전기세가 좀 나왔나? 어차피 5만 원 안쪽이겠지.", pauseBeforeMs: 620, durationMs: 1850, peakDb: -16.0, pitchSlopeSemitones: -0.3, emotion: "thought" },
      { id: "com-4", speaker: "민수", alignment: "left", text: "Wait, 300만 원?! 보일러를 사우나 모드로 한 달 켰다고?!", pauseBeforeMs: 180, durationMs: 1650, peakDb: -0.9, pitchSlopeSemitones: 7.9, emotion: "shock", sfxHint: "덜컹!!" },
      { id: "com-5", speaker: "룸메", alignment: "right", text: "어쩐지 겨울인데 바닥이 참 따뜻하더라.", pauseBeforeMs: 920, durationMs: 1700, peakDb: -15.2, pitchSlopeSemitones: -1.6, emotion: "deadpan", sfxHint: "싸늘..." },
    ],
  },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isWideCjkChar(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3040 && code <= 0x30ff)
  );
}

/** 한글(1.0)과 영문·숫자·문장부호(0.58)의 시각적 폭을 반영해 한 줄 표시 글자수를 계산한다. */
export function measureVisualCharWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += ch === " " ? 0.36 : isWideCjkChar(ch) ? 1 : 0.58;
  }
  return round1(width);
}

/** 운율 단서(감정 태그 · peak dB · pitch slope · 구두점)를 바탕으로 말풍선 기하학을 분류한다. */
export function classifyBalloonGeometry(cue: VoiceProsodyCue): BalloonGeometryKind {
  if (cue.emotion === "narration") return "narration-rect";
  if (cue.emotion === "thought") return "thought-cloud";
  if (cue.emotion === "whisper" || cue.peakDb <= -19.5) return "whisper-dashed";

  const hasExclamation = /[!！]{1,}|\?!|!\?/u.test(cue.text);
  const isHighEnergy = cue.emotion === "anger" || cue.emotion === "shock" || cue.emotion === "urgency";
  if (
    cue.peakDb >= -5.5 ||
    (isHighEnergy && (cue.peakDb >= -7.5 || cue.pitchSlopeSemitones >= 4.2)) ||
    (hasExclamation && cue.peakDb >= -8.0 && cue.pitchSlopeSemitones >= 3.2)
  ) {
    return "shout-spike";
  }
  return "normal-oval";
}

/** 피크 음압(dB)과 말풍선 기하학에 맞춰 동적 폰트 크기·굵기·행간을 산출한다. */
export function computeDynamicTypography(
  cue: VoiceProsodyCue,
  geometry: BalloonGeometryKind,
  baseFontSizePx: number = DEFAULT_BASE_FONT_SIZE_PX,
): DynamicTypographyMetrics {
  const safeBase = clamp(baseFontSizePx, 16, 32);
  const energyNorm = clamp((cue.peakDb + 26) / 26, 0, 1);
  const pitchBoost = clamp(Math.abs(cue.pitchSlopeSemitones) / 10, 0, 1);

  let scale = 0.92 + energyNorm * 0.24 + pitchBoost * 0.06;
  let fontWeight: 400 | 500 | 700 | 800 = 500;
  let letterSpacingEm = -0.01;

  if (geometry === "shout-spike") {
    scale = Math.max(scale, 1.18) + energyNorm * 0.14;
    fontWeight = cue.peakDb >= -2.5 ? 800 : 700;
    letterSpacingEm = -0.025;
  } else if (geometry === "whisper-dashed") {
    scale = Math.min(scale, 0.86);
    fontWeight = 400;
    letterSpacingEm = 0.03;
  } else if (geometry === "thought-cloud") {
    scale = clamp(scale * 0.94, 0.84, 1.02);
    fontWeight = 400;
    letterSpacingEm = 0.01;
  } else if (geometry === "narration-rect") {
    scale = clamp(0.95 + energyNorm * 0.05, 0.92, 1.02);
    letterSpacingEm = 0;
  } else if (cue.emotion === "deadpan") {
    scale = 0.94;
    letterSpacingEm = 0.005;
  }

  const fontSizePx = Math.round(clamp(safeBase * scale, 15, 34));
  const lineHeightPx = Math.round(fontSizePx * (geometry === "shout-spike" ? 1.24 : 1.38));
  return {
    fontSizePx,
    fontWeight,
    lineHeightPx,
    letterSpacingEm: round1(letterSpacingEm * 1000) / 1000,
  };
}

function splitOversizedToken(token: string, maxVisualChars: number): string[] {
  if (measureVisualCharWidth(token) <= maxVisualChars) return [token];
  const chunks: string[] = [];
  let current = "";
  for (const ch of token) {
    const candidate = `${current}${ch}`;
    if (current.length > 0 && measureVisualCharWidth(candidate) > maxVisualChars) {
      chunks.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** 한글 어절 보존(`word-break: keep-all`)과 영문 단어 경계를 유지하며 줄바꿈한다. */
export function wrapBilingualMobileLines(
  rawText: string,
  maxCharsPerLine: number = DEFAULT_MAX_CHARS_PER_LINE,
): readonly string[] {
  const limit = clamp(Math.round(maxCharsPerLine), MIN_CHARS_PER_LINE_LIMIT, MAX_CHARS_PER_LINE_LIMIT);
  const normalized = rawText.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return [""];

  const tokens = normalized.split(" ").flatMap((word) => splitOversizedToken(word, limit));
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    if (current.length === 0) {
      current = token;
    } else if (measureVisualCharWidth(`${current} ${token}`) <= limit) {
      current = `${current} ${token}`;
    } else {
      lines.push(current);
      current = token;
    }
  }
  if (current.length > 0) lines.push(current);

  if (lines.length >= 2) {
    const lastIdx = lines.length - 1;
    const prevWords = (lines[lastIdx - 1] ?? "").split(" ");
    const lastLine = lines[lastIdx] ?? "";
    if (prevWords.length >= 3 && measureVisualCharWidth(lastLine) <= limit * 0.36) {
      const moved = prevWords[prevWords.length - 1] ?? "";
      const nextPrev = prevWords.slice(0, -1).join(" ");
      const nextLast = `${moved} ${lastLine}`;
      if (measureVisualCharWidth(nextPrev) <= limit && measureVisualCharWidth(nextLast) <= limit) {
        lines[lastIdx - 1] = nextPrev;
        lines[lastIdx] = nextLast;
      }
    }
  }
  return lines;
}

/** 긴 대사를 문장 경계에서 2~3개 연쇄 말풍선으로 분할한다. */
export function splitDialogueIntoReadableSegments(
  rawText: string,
  maxCharsPerLine: number = DEFAULT_MAX_CHARS_PER_LINE,
): readonly string[] {
  const limit = clamp(Math.round(maxCharsPerLine), MIN_CHARS_PER_LINE_LIMIT, MAX_CHARS_PER_LINE_LIMIT);
  const normalized = rawText.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return [""];

  const maxSingleVisual = limit * 2.45;
  if (measureVisualCharWidth(normalized) <= maxSingleVisual) return [normalized];

  const sentences = normalized
    .split(/(?<=[.!?…？！])\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (sentences.length <= 1) {
    const words = normalized.split(" ");
    if (words.length <= 3) return [normalized];
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  const segments: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer.length === 0) {
      buffer = sentence;
    } else if (measureVisualCharWidth(`${buffer} ${sentence}`) <= maxSingleVisual) {
      buffer = `${buffer} ${sentence}`;
    } else {
      segments.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer.length > 0) segments.push(buffer);
  return segments;
}

/** 발화 전 침묵(pauseBeforeMs)을 세로 스크롤 거터(px)로 환산한다. */
export function computePauseGutterPx(
  pauseBeforeMs: number,
  minVerticalGutterPx: number = DEFAULT_MIN_VERTICAL_GUTTER_PX,
  emotion: VoiceEmotionTag = "neutral",
): number {
  const safePause = clamp(pauseBeforeMs, 0, 2500);
  const safeMin = clamp(minVerticalGutterPx, 18, 120);
  const factor =
    emotion === "whisper" || emotion === "thought" || emotion === "affection"
      ? 1.18
      : emotion === "anger" || emotion === "shock" || emotion === "urgency"
        ? 0.85
        : 1;
  return Math.round(clamp(safeMin + (safePause / 1000) * 64 * factor, safeMin, 190));
}

function chooseTailDirection(alignment: SpeakerAlignment, geometry: BalloonGeometryKind): BalloonTailDirection {
  if (geometry === "narration-rect") return "none";
  return alignment === "right" ? "bottom-right" : "bottom-left";
}

interface LayoutBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function computeAabbOverlapArea(a: LayoutBox, b: LayoutBox): number {
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapW <= 0 || overlapH <= 0 ? 0 : round1(overlapW * overlapH);
}

/** 모든 말풍선과 SFX 콜아웃 사이의 AABB 겹침(0-overlap) 및 최소 수직 간격을 검증한다. */
export function detectLayoutOverlaps(
  balloons: readonly LaidOutSpeechBalloon[],
  sfxCallouts: readonly KineticSfxCallout[],
): OverlapCheckResult {
  const boxes: LayoutBox[] = [
    ...balloons.map((b) => ({ id: b.id, x: b.x, y: b.y, width: b.width, height: b.height })),
    ...sfxCallouts.map((s) => ({ id: s.id, x: s.x, y: s.y, width: s.width, height: s.height })),
  ];

  const overlappingPairs: LayoutOverlapPair[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (!a || !b) continue;
      const area = computeAabbOverlapArea(a, b);
      if (area > 0) overlappingPairs.push({ aId: a.id, bId: b.id, overlapAreaPx2: area });
    }
  }

  let minVerticalGapPx = Number.POSITIVE_INFINITY;
  for (let i = 1; i < balloons.length; i += 1) {
    const prev = balloons[i - 1];
    const curr = balloons[i];
    if (!prev || !curr) continue;
    minVerticalGapPx = Math.min(minVerticalGapPx, curr.y - (prev.y + prev.height));
  }

  return {
    overlapCount: overlappingPairs.length,
    overlappingPairs,
    minVerticalGapPx: Number.isFinite(minVerticalGapPx) ? round1(minVerticalGapPx) : 0,
  };
}

function deriveAutoSfxText(cue: VoiceProsodyCue, geometry: BalloonGeometryKind): string | null {
  if (cue.sfxHint && cue.sfxHint.trim().length > 0) return cue.sfxHint.trim();
  if (geometry === "shout-spike" && cue.peakDb >= -3.5) return cue.emotion === "shock" ? "콰앙!!" : "쿵!";
  if (cue.emotion === "whisper" && cue.pauseBeforeMs >= 950) return "소근...";
  return null;
}

function pickSfxEmphasis(cue: VoiceProsodyCue, geometry: BalloonGeometryKind): KineticSfxEmphasis {
  if (geometry === "shout-spike" || cue.emotion === "anger" || cue.emotion === "shock") return "impact";
  return cue.emotion === "deadpan" ? "freeze" : "flutter";
}

function buildSfxCalloutNearBalloon(
  cue: VoiceProsodyCue,
  balloon: LaidOutSpeechBalloon,
  stripWidthPx: number,
  horizontalMarginPx: number,
  existingBoxes: readonly LayoutBox[],
): KineticSfxCallout | null {
  const sfxText = deriveAutoSfxText(cue, balloon.geometry);
  if (!sfxText) return null;

  const emphasis = pickSfxEmphasis(cue, balloon.geometry);
  const intensity = round1(clamp((cue.peakDb + 26) / 26, 0.15, 1));
  const fontSizePx = emphasis === "impact" ? Math.round(28 + intensity * 12) : emphasis === "freeze" ? 22 : 20;
  const width = Math.round(clamp(Math.max(2.4, measureVisualCharWidth(sfxText)) * fontSizePx * 0.96 + 26, 86, 220));
  const height = Math.round(fontSizePx * 1.48 + 14);
  const rotationDeg = emphasis === "impact" ? (balloon.alignment === "left" ? -9 : 9) : emphasis === "freeze" ? -3 : 5;

  const gutterGap = 18;
  const spaceRight = stripWidthPx - horizontalMarginPx - (balloon.x + balloon.width + gutterGap);
  const spaceLeft = balloon.x - gutterGap - horizontalMarginPx;

  let candidateX: number;
  let candidateY = Math.round(balloon.y + Math.max(0, (balloon.height - height) * 0.35));

  if (balloon.alignment === "left" && spaceRight >= width) {
    candidateX = Math.round(balloon.x + balloon.width + gutterGap);
  } else if (balloon.alignment === "right" && spaceLeft >= width) {
    candidateX = Math.round(balloon.x - gutterGap - width);
  } else if (spaceRight >= width) {
    candidateX = Math.round(balloon.x + balloon.width + gutterGap);
  } else if (spaceLeft >= width) {
    candidateX = Math.round(balloon.x - gutterGap - width);
  } else {
    candidateX = balloon.alignment === "right" ? horizontalMarginPx : Math.round(stripWidthPx - horizontalMarginPx - width);
    candidateY = Math.round(balloon.y + balloon.height + 14);
  }

  candidateX = Math.round(clamp(candidateX, horizontalMarginPx, stripWidthPx - horizontalMarginPx - width));
  let resolvedY = candidateY;
  for (let guard = 0; guard < 20; guard += 1) {
    const collider = existingBoxes.find(
      (box) => computeAabbOverlapArea({ id: "probe", x: candidateX, y: resolvedY, width, height }, box) > 0,
    );
    if (!collider) break;
    resolvedY = Math.round(collider.y + collider.height + 14);
  }

  return { id: `sfx-${cue.id}`, sourceCueId: cue.id, text: sfxText, x: candidateX, y: resolvedY, width, height, rotationDeg, fontSizePx, intensity, emphasis };
}

/** 음성 운율 큐 배열을 800px 세로 웹툰 스트립 말풍선 및 키네틱 SFX 레이아웃으로 변환한다. */
export function layoutVoiceToBalloons(
  cues: readonly VoiceProsodyCue[],
  options: BalloonLayoutOptions = {},
): VoiceBalloonLayoutResult {
  const stripWidthPx = Math.round(clamp(options.stripWidthPx ?? DEFAULT_STRIP_WIDTH_PX, 480, 1440));
  const maxCharsPerLine = Math.round(
    clamp(options.maxCharsPerLine ?? DEFAULT_MAX_CHARS_PER_LINE, MIN_CHARS_PER_LINE_LIMIT, MAX_CHARS_PER_LINE_LIMIT),
  );
  const horizontalMarginPx = Math.round(clamp(options.horizontalMarginPx ?? DEFAULT_HORIZONTAL_MARGIN_PX, 20, 120));
  const minVerticalGutterPx = Math.round(clamp(options.minVerticalGutterPx ?? DEFAULT_MIN_VERTICAL_GUTTER_PX, 20, 100));
  const baseFontSizePx = clamp(options.baseFontSizePx ?? DEFAULT_BASE_FONT_SIZE_PX, 16, 30);
  const includeSfx = options.includeSfx ?? true;

  const balloons: LaidOutSpeechBalloon[] = [];
  const sfxCallouts: KineticSfxCallout[] = [];
  const placedBoxes: LayoutBox[] = [];
  const geometryCounts: Record<BalloonGeometryKind, number> = {
    "normal-oval": 0,
    "shout-spike": 0,
    "whisper-dashed": 0,
    "thought-cloud": 0,
    "narration-rect": 0,
  };

  const maxAllowedW = Math.round(Math.min(stripWidthPx - horizontalMarginPx * 2, stripWidthPx * 0.68));
  const minBalloonW = Math.round(stripWidthPx * 0.28);
  let cursorY = horizontalMarginPx;
  let totalReadTimeSec = 0;

  for (const cue of cues) {
    const geometry = classifyBalloonGeometry(cue);
    const typo = computeDynamicTypography(cue, geometry, baseFontSizePx);
    const segments = splitDialogueIntoReadableSegments(cue.text, maxCharsPerLine);
    const baseGutter = computePauseGutterPx(cue.pauseBeforeMs, minVerticalGutterPx, cue.emotion);

    totalReadTimeSec += clamp(cue.pauseBeforeMs, 0, 2500) / 1000 + Math.max(0.55, clamp(cue.durationMs, 350, 8000) / 1000);

    segments.forEach((segmentText, partIndex) => {
      const lines = wrapBilingualMobileLines(segmentText, maxCharsPerLine);
      const maxLineVisual = lines.reduce((acc, line) => Math.max(acc, measureVisualCharWidth(line)), 0);
      const padX = geometry === "shout-spike" ? 44 : geometry === "thought-cloud" ? 38 : geometry === "narration-rect" ? 28 : 34;
      const padY = geometry === "shout-spike" ? 34 : geometry === "thought-cloud" ? 30 : geometry === "narration-rect" ? 22 : 26;

      const width = Math.round(
        clamp(
          Math.ceil(maxLineVisual * typo.fontSizePx * 0.96) + padX * 2,
          geometry === "narration-rect" ? stripWidthPx * 0.56 : minBalloonW,
          geometry === "narration-rect" ? stripWidthPx - horizontalMarginPx * 2 : maxAllowedW,
        ),
      );
      const height = Math.round(Math.max(66, lines.length * typo.lineHeightPx + padY * 2));
      const effectiveGutter =
        balloons.length === 0 ? 0 : partIndex === 0 ? baseGutter : Math.round(Math.max(minVerticalGutterPx * 0.75, 24));

      let x: number;
      if (geometry === "narration-rect" || cue.alignment === "center") {
        x = Math.round((stripWidthPx - width) / 2);
      } else if (cue.alignment === "left") {
        x = horizontalMarginPx + (partIndex % 2 === 1 ? 26 : 0);
      } else {
        x = stripWidthPx - horizontalMarginPx - width - (partIndex % 2 === 1 ? 26 : 0);
      }
      x = Math.round(clamp(x, horizontalMarginPx, stripWidthPx - horizontalMarginPx - width));

      let y = Math.round(cursorY + effectiveGutter);
      for (let guard = 0; guard < 24; guard += 1) {
        const hit = placedBoxes.find(
          (box) => computeAabbOverlapArea({ id: "probe", x, y, width, height }, box) > 0,
        );
        if (!hit) break;
        y = Math.round(hit.y + hit.height + minVerticalGutterPx);
      }

      const penalty =
        (maxLineVisual > maxCharsPerLine ? (maxLineVisual - maxCharsPerLine) * 8 : 0) +
        (lines.length > 3 ? (lines.length - 3) * 10 : 0);

      const balloon: LaidOutSpeechBalloon = {
        id: segments.length > 1 ? `${cue.id}-p${partIndex + 1}` : cue.id,
        sourceCueId: cue.id,
        speaker: cue.speaker,
        partIndex,
        partCount: segments.length,
        alignment: geometry === "narration-rect" ? "center" : cue.alignment,
        geometry,
        tailDirection: chooseTailDirection(cue.alignment, geometry),
        lines,
        rawText: segmentText,
        maxLineVisualChars: round1(maxLineVisual),
        fontSizePx: typo.fontSizePx,
        fontWeight: typo.fontWeight,
        lineHeightPx: typo.lineHeightPx,
        letterSpacingEm: typo.letterSpacingEm,
        x,
        y,
        width,
        height,
        pauseGutterPx: effectiveGutter,
        peakDb: cue.peakDb,
        pitchSlopeSemitones: cue.pitchSlopeSemitones,
        emotion: cue.emotion,
        readabilityScore: Math.round(clamp(100 - penalty, 45, 100)),
      };

      balloons.push(balloon);
      geometryCounts[geometry] += 1;
      placedBoxes.push({ id: balloon.id, x: balloon.x, y: balloon.y, width: balloon.width, height: balloon.height });
      cursorY = Math.max(cursorY, balloon.y + balloon.height);

      if (includeSfx && partIndex === 0) {
        const sfx = buildSfxCalloutNearBalloon(cue, balloon, stripWidthPx, horizontalMarginPx, placedBoxes);
        if (sfx) {
          sfxCallouts.push(sfx);
          placedBoxes.push({ id: sfx.id, x: sfx.x, y: sfx.y, width: sfx.width, height: sfx.height });
          cursorY = Math.max(cursorY, sfx.y + sfx.height);
        }
      }
    });
  }

  const stripHeightPx = Math.max(320, Math.round(cursorY + horizontalMarginPx + 24));
  const overlapCheck = detectLayoutOverlaps(balloons, sfxCallouts);
  const allLineWidths = balloons.flatMap((b) => b.lines.map((line) => measureVisualCharWidth(line)));
  const averageLineVisualChars =
    allLineWidths.length > 0 ? round1(allLineWidths.reduce((s, w) => s + w, 0) / allLineWidths.length) : 0;
  const maxLineVisualCharsObserved = allLineWidths.length > 0 ? round1(Math.max(...allLineWidths)) : 0;

  const gutters = balloons.slice(1).map((b) => b.pauseGutterPx);
  let rhythmVarianceScore = 75;
  if (gutters.length >= 2) {
    const mean = gutters.reduce((s, g) => s + g, 0) / gutters.length;
    const stdDev = Math.sqrt(gutters.reduce((s, g) => s + (g - mean) ** 2, 0) / gutters.length);
    rhythmVarianceScore = Math.round(clamp(55 + stdDev * 1.15, 40, 100));
  }

  return {
    stripWidthPx,
    stripHeightPx,
    maxCharsPerLine,
    balloons,
    sfxCallouts,
    overlapCheck,
    averageLineVisualChars,
    maxLineVisualCharsObserved,
    estimatedReadTimeSec: round1(totalReadTimeSec),
    rhythmVarianceScore,
    geometryBreakdown: geometryCounts,
  };
}

/** 각 말풍선 기하학(타원·외침 톱니·점선·구름·내레이션 사각)의 결정적 SVG `<path d="...">`를 생성한다. */
export function buildBalloonSvgPath(balloon: LaidOutSpeechBalloon): string {
  const { x, y, width, height, geometry } = balloon;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;

  if (geometry === "narration-rect") {
    const r = 6;
    return [
      `M ${round1(x + r)} ${round1(y)}`,
      `H ${round1(x + width - r)}`,
      `Q ${round1(x + width)} ${round1(y)} ${round1(x + width)} ${round1(y + r)}`,
      `V ${round1(y + height - r)}`,
      `Q ${round1(x + width)} ${round1(y + height)} ${round1(x + width - r)} ${round1(y + height)}`,
      `H ${round1(x + r)}`,
      `Q ${round1(x)} ${round1(y + height)} ${round1(x)} ${round1(y + height - r)}`,
      `V ${round1(y + r)}`,
      `Q ${round1(x)} ${round1(y)} ${round1(x + r)} ${round1(y)}`,
      "Z",
    ].join(" ");
  }

  if (geometry === "shout-spike") {
    const spikes = 18;
    const pts: string[] = [];
    for (let i = 0; i < spikes * 2; i += 1) {
      const angle = (i * Math.PI) / spikes;
      const factor = i % 2 === 0 ? 1.03 : 0.84;
      pts.push(`${i === 0 ? "M" : "L"} ${round1(cx + Math.cos(angle) * rx * factor)} ${round1(cy + Math.sin(angle) * ry * factor)}`);
    }
    return `${pts.join(" ")} Z`;
  }

  if (geometry === "thought-cloud") {
    const bumps = 12;
    const cmds: string[] = [];
    for (let i = 0; i < bumps; i += 1) {
      const a0 = (i / bumps) * Math.PI * 2;
      const a1 = ((i + 1) / bumps) * Math.PI * 2;
      const aMid = (a0 + a1) / 2;
      if (i === 0) cmds.push(`M ${round1(cx + Math.cos(a0) * rx * 0.9)} ${round1(cy + Math.sin(a0) * ry * 0.88)}`);
      cmds.push(
        `Q ${round1(cx + Math.cos(aMid) * rx * 1.08)} ${round1(cy + Math.sin(aMid) * ry * 1.1)} ${round1(cx + Math.cos(a1) * rx * 0.9)} ${round1(cy + Math.sin(a1) * ry * 0.88)}`,
      );
    }
    return `${cmds.join(" ")} Z`;
  }

  return [
    `M ${round1(cx)} ${round1(y)}`,
    `A ${round1(rx)} ${round1(ry)} 0 1 0 ${round1(cx)} ${round1(y + height)}`,
    `A ${round1(rx)} ${round1(ry)} 0 1 0 ${round1(cx)} ${round1(y)}`,
    "Z",
  ].join(" ");
}

/** 대본 텍스트(`화자: 대사` 또는 `[화자|감정|휴지ms|dB] 대사`)를 운율 큐 배열로 파싱한다. */
export function parseScriptLinesToProsodyCues(scriptText: string): readonly VoiceProsodyCue[] {
  const validEmotions = new Set<VoiceEmotionTag>([
    "neutral", "anger", "urgency", "whisper", "affection", "thought", "narration", "shock", "deadpan",
  ]);
  const lines = scriptText.split(/\r?\n/u).map((l) => l.trim()).filter((l) => l.length > 0);
  const parsed: VoiceProsodyCue[] = [];

  lines.forEach((line, index) => {
    const tagged = /^\[([^|\]]+)\|([^|\]]+)\|(\d+)\|(-?\d+(?:\.\d+)?)\]\s*(.+)$/u.exec(line);
    if (tagged) {
      const rawEmotion = (tagged[2] ?? "neutral").trim() as VoiceEmotionTag;
      const emotion: VoiceEmotionTag = validEmotions.has(rawEmotion) ? rawEmotion : "neutral";
      const text = (tagged[5] ?? "").trim();
      parsed.push({
        id: `parsed-${index + 1}`,
        speaker: (tagged[1] ?? "화자").trim(),
        alignment: emotion === "narration" ? "center" : index % 2 === 0 ? "left" : "right",
        text,
        pauseBeforeMs: clamp(Number(tagged[3]), 0, 2500),
        durationMs: Math.round(Math.max(800, measureVisualCharWidth(text) * 145)),
        peakDb: clamp(Number(tagged[4]), -32, 0),
        pitchSlopeSemitones: emotion === "anger" || emotion === "shock" ? 5.6 : emotion === "whisper" ? -1.8 : 0.5,
        emotion,
      });
      return;
    }

    const colonIdx = line.indexOf(":");
    const speaker = colonIdx > 0 ? line.slice(0, colonIdx).trim() : index % 2 === 0 ? "화자 A" : "화자 B";
    const text = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line;
    const isNarration = speaker === "내레이션" || speaker.toLowerCase() === "narrator";
    const isShout = /[!！]{2,}|\?!|!\?/u.test(text);
    const isWhisper = text.includes("...") || text.includes("…");
    const emotion: VoiceEmotionTag = isNarration ? "narration" : isShout ? "shock" : isWhisper ? "whisper" : "neutral";

    parsed.push({
      id: `parsed-${index + 1}`,
      speaker,
      alignment: isNarration ? "center" : index % 2 === 0 ? "left" : "right",
      text,
      pauseBeforeMs: isWhisper ? 820 : isShout ? 180 : 380,
      durationMs: Math.round(Math.max(800, measureVisualCharWidth(text) * 145)),
      peakDb: isShout ? -2.2 : isWhisper ? -21.0 : -12.0,
      pitchSlopeSemitones: isShout ? 6.2 : isWhisper ? -1.9 : 0.4,
      emotion,
    });
  });

  return parsed;
}

/** 프리셋 ID로 내장 프리셋을 안전하게 조회한다. */
export function findVoiceBalloonPresetById(presetId: string | undefined): VoiceScriptPreset {
  const matched = VOICE_BALLOON_PRESETS.find((preset) => preset.id === presetId);
  if (matched) return matched;
  const fallback = VOICE_BALLOON_PRESETS[0];
  if (!fallback) throw new Error("내장 음성 말풍선 프리셋이 비어 있습니다.");
  return fallback;
}

/** 조판 결과를 스튜디오 레이어·식자 도구 연동용 JSON 문자열로 직렬화한다. */
export function serializeVoiceBalloonLayout(result: VoiceBalloonLayoutResult): string {
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.voice-balloon-layout.v1",
      stripWidthPx: result.stripWidthPx,
      stripHeightPx: result.stripHeightPx,
      maxCharsPerLine: result.maxCharsPerLine,
      overlapCount: result.overlapCheck.overlapCount,
      estimatedReadTimeSec: result.estimatedReadTimeSec,
      balloons: result.balloons,
      sfxCallouts: result.sfxCallouts,
    },
    null,
    2,
  );
}
