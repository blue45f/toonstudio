/**
 * 세로 4컷 웹툰 스크롤 여백 호흡(Gutter Pacing) · 시간대 원고 색온도 무드(Manuscript Mood) ·
 * 일본어 단행본 세로쓰기(Tategaki · 縦書き) 식자 렌더러 순수 모듈 (`webtoon-strip-pacing-tategaki.ts`).
 *
 * 아키텍처 불변식:
 * - `src/export/**` 계층 순수 모듈로서 UI(`src/app/**`)에 의존하지 않는다.
 * - 오프스크린 Canvas2D 래스터화 직후 `canvas.width = 0; canvas.height = 0`으로 백업 버퍼를 즉시 해제한다.
 */

export const WEBTOON_STRIP_GUTTER_PACE_IDS = [
  "compact",
  "standard",
  "dramatic-pause",
  "cliffhanger",
] as const;
export type WebtoonStripGutterPaceId = (typeof WEBTOON_STRIP_GUTTER_PACE_IDS)[number];

export interface WebtoonStripGutterPaceSpec {
  readonly id: WebtoonStripGutterPaceId;
  readonly labelKo: string;
  readonly multiplier: number;
}

export const WEBTOON_STRIP_GUTTER_PACES: Readonly<Record<WebtoonStripGutterPaceId, WebtoonStripGutterPaceSpec>> = Object.freeze({
  compact: { id: "compact", labelKo: "빠른 템포 (0.58×)", multiplier: 0.58 },
  standard: { id: "standard", labelKo: "표준 호흡 (1.0×)", multiplier: 1.0 },
  "dramatic-pause": { id: "dramatic-pause", labelKo: "서스펜스 여백 (1.75×)", multiplier: 1.75 },
  cliffhanger: { id: "cliffhanger", labelKo: "클리프행어 장여백 (2.35×)", multiplier: 2.35 },
});

export type WebtoonStripGutterPaces = readonly [
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaceId,
  WebtoonStripGutterPaceId,
];

export const DEFAULT_WEBTOON_STRIP_GUTTER_PACES: WebtoonStripGutterPaces = Object.freeze([
  "standard",
  "standard",
  "standard",
]) as WebtoonStripGutterPaces;

export function computeVariableGutterHeights(
  baseGutterY: number,
  gutterPaces: WebtoonStripGutterPaces = DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
): readonly [number, number, number] {
  const safeBase = Math.max(4, Math.round(baseGutterY));
  const resolveOne = (paceId: WebtoonStripGutterPaceId): number => {
    const spec = WEBTOON_STRIP_GUTTER_PACES[paceId] ?? WEBTOON_STRIP_GUTTER_PACES.standard;
    return Math.max(4, Math.round(safeBase * spec.multiplier));
  };
  return [
    resolveOne(gutterPaces[0]),
    resolveOne(gutterPaces[1]),
    resolveOne(gutterPaces[2]),
  ];
}

// ---------------------------------------------------------------- 시간대 원고 분위기·림라이트 색온도 무드

export const WEBTOON_MANUSCRIPT_MOOD_IDS = [
  "daylight-paper",
  "twilight-amber",
  "midnight-noir",
  "backlit-awakening",
] as const;
export type WebtoonManuscriptMoodId = (typeof WEBTOON_MANUSCRIPT_MOOD_IDS)[number];

export interface WebtoonManuscriptMoodSpec {
  readonly id: WebtoonManuscriptMoodId;
  readonly labelKo: string;
  readonly stripMarginRgb: readonly [number, number, number];
  readonly panelTopRgb: readonly [number, number, number];
  readonly panelBottomRgb: readonly [number, number, number];
  readonly borderRgb: readonly [number, number, number];
  readonly characterGradeRgb: readonly [number, number, number];
  readonly characterGradeStrength: number;
}

export const WEBTOON_MANUSCRIPT_MOODS: Readonly<Record<WebtoonManuscriptMoodId, WebtoonManuscriptMoodSpec>> = Object.freeze({
  "daylight-paper": {
    id: "daylight-paper",
    labelKo: "주간 원고지 (5600K 표준)",
    stripMarginRgb: [255, 255, 255],
    panelTopRgb: [250, 247, 242],
    panelBottomRgb: [239, 234, 224],
    borderRgb: [24, 21, 28],
    characterGradeRgb: [255, 255, 255],
    characterGradeStrength: 0,
  },
  "twilight-amber": {
    id: "twilight-amber",
    labelKo: "황혼 노을 (3200K 골든아워)",
    stripMarginRgb: [253, 248, 242],
    panelTopRgb: [252, 232, 208],
    panelBottomRgb: [228, 186, 168],
    borderRgb: [32, 20, 24],
    characterGradeRgb: [255, 210, 162],
    characterGradeStrength: 0.14,
  },
  "midnight-noir": {
    id: "midnight-noir",
    labelKo: "심야 달빛 (7800K 느와르)",
    stripMarginRgb: [244, 247, 252],
    panelTopRgb: [222, 231, 246],
    panelBottomRgb: [188, 202, 228],
    borderRgb: [16, 20, 34],
    characterGradeRgb: [178, 206, 255],
    characterGradeStrength: 0.16,
  },
  "backlit-awakening": {
    id: "backlit-awakening",
    labelKo: "역광 각성 (6500K 섬광)",
    stripMarginRgb: [249, 247, 254],
    panelTopRgb: [244, 236, 255],
    panelBottomRgb: [212, 226, 248],
    borderRgb: [22, 16, 36],
    characterGradeRgb: [216, 196, 255],
    characterGradeStrength: 0.13,
  },
});

export function gradeCharacterPixelByMood(
  r: number,
  g: number,
  b: number,
  mood: WebtoonManuscriptMoodSpec,
): readonly [number, number, number] {
  const s = mood.characterGradeStrength;
  if (s <= 0) return [r, g, b];
  const inv = 1 - s;
  return [
    Math.round(r * inv + mood.characterGradeRgb[0] * s),
    Math.round(g * inv + mood.characterGradeRgb[1] * s),
    Math.round(b * inv + mood.characterGradeRgb[2] * s),
  ];
}

// ---------------------------------------------------------------- 일본어 세로쓰기(Tategaki · 縦書き) 식자 렌더러

export const WEBTOON_JA_WRITING_MODES = ["horizontal", "vertical-tategaki"] as const;
export type WebtoonJaWritingMode = (typeof WEBTOON_JA_WRITING_MODES)[number];

export const WEBTOON_JA_WRITING_MODE_LABELS_KO: Readonly<Record<WebtoonJaWritingMode, string>> = Object.freeze({
  horizontal: "가로쓰기 (横書き · 웹툰식)",
  "vertical-tategaki": "세로쓰기 (縦書き · 단행본식)",
});

const JA_KINSOKU_HEAD = new Set(["。", "、", "！", "？", "…", "ー", "｜", "っ", "ゃ", "ゅ", "ょ", "ァ", "ィ", "ゥ", "ェ", "ォ", "ッ", "ャ", "ュ", "ョ", "」", "』", "）"]);

const VERTICAL_PUNCTUATION_MAP: Readonly<Record<string, string>> = Object.freeze({
  "ー": "｜",
  "—": "｜",
  "…": "⋮",
  "「": "﹁",
  "」": "﹂",
  "『": "﹃",
  "』": "﹄",
  "（": "︵",
  "）": "︶",
});

export function normalizeTategakiGlyph(ch: string): string {
  return VERTICAL_PUNCTUATION_MAP[ch] ?? ch;
}

/**
 * 일본어 대사를 우→좌(Right-to-Left)로 읽히는 1~3개의 세로쓰기 열(Column)로 금칙처리 분할한다.
 * 반환 배열의 0번 인덱스가 가장 오른쪽 첫 번째 열이다.
 */
export function splitJapaneseTategakiColumns(rawText: string): readonly string[] {
  const cleaned = rawText.trim();
  if (!cleaned) return [];
  const chars = Array.from(cleaned).map(normalizeTategakiGlyph);
  if (chars.length <= 7) return [chars.join("")];

  const targetCols = chars.length <= 16 ? 2 : 3;
  const basePerCol = Math.ceil(chars.length / targetCols);
  const columns: string[] = [];
  let cursor = 0;

  while (cursor < chars.length) {
    let nextEnd = Math.min(chars.length, cursor + basePerCol);
    while (nextEnd < chars.length && JA_KINSOKU_HEAD.has(chars[nextEnd] ?? "")) {
      nextEnd += 1;
    }
    columns.push(chars.slice(cursor, nextEnd).join(""));
    cursor = nextEnd;
  }
  return columns;
}

export function tryRasterizeJapaneseTategakiCanvas2d(
  boxWidth: number,
  boxHeight: number,
  columns: readonly string[],
  fontMultiplier: number,
  fontWeight: number,
  fontFamily: string,
): { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray } | null {
  if (typeof document === "undefined" || columns.length === 0 || boxWidth < 12 || boxHeight < 12) return null;
  const scale = 2;
  const w = Math.max(12, Math.floor(boxWidth * scale));
  const h = Math.max(12, Math.floor(boxHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);

    const maxRowChars = Math.max(...columns.map((c) => Array.from(c).length), 4);
    const colCount = columns.length;
    const fitByHeight = Math.floor((h * 0.86) / Math.max(4, maxRowChars * 1.04));
    const fitByWidth = Math.floor((w * 0.8) / Math.max(1.5, colCount * 1.35));
    const basePx = Math.min(fitByHeight, fitByWidth);
    const fontPx = Math.max(9, Math.min(Math.floor(w * 0.36), Math.round(basePx * fontMultiplier)));
    const stepY = Math.round(fontPx * 1.05);
    const stepX = Math.round(fontPx * 1.38);

    ctx.font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    ctx.fillStyle = "#18151C";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const totalColsW = (colCount - 1) * stepX;
    const rightmostColX = w * 0.5 + totalColsW * 0.5;

    columns.forEach((col, colIdx) => {
      const chars = Array.from(col);
      const colX = rightmostColX - colIdx * stepX;
      const colTotalH = (chars.length - 1) * stepY;
      const startY = h * 0.5 - colTotalH * 0.5;
      chars.forEach((ch, rowIdx) => {
        const cy = startY + rowIdx * stepY;
        const isCornerKuten = ch === "。" || ch === "、";
        const drawX = isCornerKuten ? colX + fontPx * 0.28 : colX;
        const drawY = isCornerKuten ? cy - fontPx * 0.24 : cy;
        ctx.fillText(ch, drawX, drawY);
      });
    });

    const img = ctx.getImageData(0, 0, w, h);
    let hasPixels = false;
    for (let i = 3; i < img.data.length; i += 4) {
      if ((img.data[i] ?? 0) > 16) {
        hasPixels = true;
        break;
      }
    }
    return hasPixels ? { width: w, height: h, data: img.data } : null;
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
