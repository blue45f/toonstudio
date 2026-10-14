/**
 * Balloon paragraph lanes — Korean/CJK word-boundary line wrapping plus
 * region layout for speech balloons (V11 comic pipeline).
 *
 * v2 (불규칙 형상 흐름): 사각·타원에 더해 구름(cloud)·스파이크(spike)·커스텀
 * 폴리곤(polygon) 형상 안에서도 텍스트가 형상 경계를 따라 흐른다. 구름·스파이크
 * 외곽은 manga-toolkit/speech-balloon.ts의 cloudPath/spikyPath와 같은 기하
 * (구름 돌기 1.22배·스파이크 외곽 1.18/안쪽 0.92)를 폴리곤으로 샘플링하고,
 * 커스텀 형상은 호출자가 넘긴 폐곡선 폴리곤을 그대로 영역으로 쓴다. 밴드(줄
 * 상자)마다 폴리곤과의 교차 구간을 구해 그 구간 안에서만 랩핑·배치하므로,
 * 줄 상자 전체가 형상 내부에 들어가는 것이 보장된다(스캔라인 교차의 교집합).
 *
 * Design contract (절대 규칙 반영):
 * - Pure & deterministic. No DOM, no ambient locale — every `Intl.Segmenter`
 *   is constructed with an explicit locale (default `"ko"`), so the same
 *   input always yields the same output on a given ICU build.
 * - Shaping-independent. Text measurement is injected (`measure`), so the
 *   caller decides Canvas/DOM/stub metrics. `measure` must be monotonic under
 *   concatenation (`measure(a + b) >= measure(a)`) for greedy wrapping to be
 *   correct — every real text metric satisfies this.
 * - No quiet loss. Anything that cannot be laid out comes back in `overflow`;
 *   ellipsis trimming feeds the trimmed characters back into `overflow` too.
 *   The only characters not round-tripped are whitespace runs consumed at
 *   line-break boundaries and at line heads (표준 조판 관행 — 줄바꿈 지점의
 *   공백은 렌더링에 나타나지 않으므로 여기서 명시적으로 소비한다).
 */

/**
 * 행두 금지(line-start prohibition) 문자.
 *
 * 근거: 일본어 조판 규격 JIS X 4051 / W3C JLREQ §3.1.7의 행두 금칙 분류를
 * 기반으로 하며, 한국어 조판(W3C KLREQ)도 괄호·문장부호에 대해 동일 계열의
 * 금칙을 따른다. 분류별 구성:
 * - 닫는 괄호류: 」 』 ） 〉 》 】 〕 ｝ ) ] } (스펙 명시: 」』）)
 * - 닫는 따옴표: ’ ”
 * - 문장 종결·구분 부호: 、 。 ， ． ？ ！ ： ； , . ? ! : ; (스펙 명시: ？！、。)
 * - 말줄임·중점류: … ‥ · ・
 * - 행두에 올 수 없는 가나 소문자·장음·반복 부호(JLREQ cl-11): ぁぃぅぇぉっ
 *   ゃゅょゎ ァィゥェォッャュョヮヵヶ ー ゝゞヽヾ 々
 */
export const LINE_START_PROHIBITED: ReadonlySet<string> = new Set([
  ..."」』）〉》】〕｝)]}’”、。，．？！：；,.?!:;…‥·・",
  ..."ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶーゝゞヽヾ々",
]);

/**
 * 행말 금지(line-end prohibition) 문자.
 *
 * 근거: JIS X 4051 / W3C JLREQ §3.1.7의 행말 금칙(여는 괄호류가 줄 끝에
 * 고립되는 것을 금지). 한국어 조판(KLREQ)도 동일하게 적용한다.
 * - 여는 괄호류: 「 『 （ 〈 《 【 〔 ｛ ( [ {
 * - 여는 따옴표: ‘ “
 */
export const LINE_END_PROHIBITED: ReadonlySet<string> = new Set([
  ..."「『（〈《【〔｛([{‘“",
]);

const DEFAULT_WRAP_LOCALE = "ko";

/** Kinsoku boundary shifts per line — bounds cascades like `…」）。` deterministically. */
const KINSOKU_MAX_SHIFTS = 8;

/** Tolerance for float noise when comparing measured widths against slot widths. */
const WIDTH_EPSILON = 1e-6;

const WHITESPACE_ONLY = /^\s+$/u;

/**
 * Scripts that conventionally allow a break between any two characters
 * (JLREQ: 한자·가나는 글자 단위 줄바꿈이 기본). Hangul is deliberately NOT
 * here — 한국어는 어절(공백 단위) 랩이 우선 관례이고, 어절 내부 분절은
 * 강제 분절(한 어절이 줄 폭을 넘을 때)로만 일어난다.
 * ー(장음)·々(반복)·ゝゞヽヾ(반복)·〆 are Script=Common so they are listed
 * explicitly to keep kana/han runs in one class.
 */
const CJK_CHAR_WRAP =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ゝゞヽヾ]+$/u;

export type WrapUnitKind = "word" | "cjk" | "space" | "newline";

/**
 * Atomic wrapping unit. Units concatenate losslessly back to the source text;
 * line breaks may only occur between units (kinsoku-adjusted), except for the
 * forced grapheme split of a unit wider than the line.
 */
export interface WrapUnit {
  text: string;
  kind: WrapUnitKind;
}

const wordSegmenters = new Map<string, Intl.Segmenter>();
const graphemeSegmenters = new Map<string, Intl.Segmenter>();

function wordSegmenter(locale: string): Intl.Segmenter {
  let segmenter = wordSegmenters.get(locale);
  if (segmenter === undefined) {
    segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    wordSegmenters.set(locale, segmenter);
  }
  return segmenter;
}

function graphemeSegmenter(locale: string): Intl.Segmenter {
  let segmenter = graphemeSegmenters.get(locale);
  if (segmenter === undefined) {
    segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    graphemeSegmenters.set(locale, segmenter);
  }
  return segmenter;
}

function splitGraphemes(text: string, locale: string): string[] {
  const graphemes: string[] = [];
  for (const segment of graphemeSegmenter(locale).segment(text)) {
    graphemes.push(segment.segment);
  }
  return graphemes;
}

function pushWhitespaceUnits(piece: string, units: WrapUnit[]): void {
  let spaceRun = "";
  for (let index = 0; index < piece.length; index += 1) {
    const ch = piece[index];
    if (ch === "\n" || ch === "\r") {
      if (spaceRun !== "") {
        units.push({ text: spaceRun, kind: "space" });
        spaceRun = "";
      }
      if (ch === "\r" && piece[index + 1] === "\n") {
        units.push({ text: "\r\n", kind: "newline" });
        index += 1;
      } else {
        units.push({ text: ch, kind: "newline" });
      }
    } else {
      spaceRun += ch;
    }
  }
  if (spaceRun !== "") {
    units.push({ text: spaceRun, kind: "space" });
  }
}

/**
 * Break-candidate segmentation for balloon wrapping.
 *
 * - `Intl.Segmenter` (granularity `"word"`, 명시 로케일) produces the base
 *   break candidates — Korean text falls out as 어절 units because ICU keeps
 *   whitespace-delimited Hangul runs together.
 * - Runs of Han/Kana (NOT Hangul) are re-split into grapheme units because
 *   CJK convention allows a break between any two characters; Korean keeps
 *   어절 units intact (어절 우선).
 * - Whitespace becomes `space` units; `\n`, `\r\n`, `\r` become `newline`
 *   units (hard breaks).
 *
 * Lossless: concatenating `units[i].text` reproduces the input exactly.
 */
export function segmentForWrapping(
  text: string,
  locale: string = DEFAULT_WRAP_LOCALE,
): WrapUnit[] {
  if (text === "") return [];
  const units: WrapUnit[] = [];
  for (const segment of wordSegmenter(locale).segment(text)) {
    const piece = segment.segment;
    if (WHITESPACE_ONLY.test(piece)) {
      pushWhitespaceUnits(piece, units);
      continue;
    }
    if (CJK_CHAR_WRAP.test(piece)) {
      for (const grapheme of splitGraphemes(piece, locale)) {
        units.push({ text: grapheme, kind: "cjk" });
      }
      continue;
    }
    units.push({ text: piece, kind: "word" });
  }
  return units;
}

function joinUnits(units: readonly WrapUnit[]): string {
  return units.map((unit) => unit.text).join("");
}

function firstCodePoint(text: string): string {
  const cp = text.codePointAt(0);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

function lastCodePoint(text: string): string {
  const points = [...text];
  return points.length === 0 ? "" : points[points.length - 1];
}

interface GreedyWrapOptions {
  widthForLine: (lineIndex: number) => number;
  measure: (text: string) => number;
  maxLines: number;
  locale: string;
}

interface GreedyWrapResult {
  lines: string[];
  /** Unconsumed units — exact source text of the remainder. */
  overflowUnits: WrapUnit[];
}

/**
 * Kinsoku boundary correction (줄 경계 이동) after a soft break:
 * - 행두 금지 → 추이코미(pull-in): a prohibited-start unit that would head the
 *   next line is pulled onto the current line end as hanging punctuation.
 *   Units separated from the break by whitespace in the source are left alone
 *   (저자가 띄어 쓴 부호는 이동하지 않는다).
 * - 행말 금지 → 오이다시(push-out): an opening bracket left at the line end is
 *   pushed down to the next line. A line consisting of only that bracket is
 *   left as-is to guarantee forward progress.
 * Returns the new cursor index into `units`.
 */
function applyKinsoku(
  lineUnits: WrapUnit[],
  units: WrapUnit[],
  index: number,
  brokeBeforeSpace: boolean,
): number {
  let cursor = index;
  let spaced = brokeBeforeSpace;
  for (let guard = 0; guard < KINSOKU_MAX_SHIFTS; guard += 1) {
    const next = cursor < units.length ? units[cursor] : undefined;
    if (
      next !== undefined &&
      next.kind !== "space" &&
      next.kind !== "newline" &&
      !spaced &&
      lineUnits.length > 0 &&
      LINE_START_PROHIBITED.has(firstCodePoint(next.text))
    ) {
      lineUnits.push(next);
      cursor += 1;
      spaced = false;
      continue;
    }
    if (lineUnits.length >= 2) {
      const last = lineUnits[lineUnits.length - 1];
      if (
        last.kind !== "space" &&
        LINE_END_PROHIBITED.has(lastCodePoint(last.text))
      ) {
        lineUnits.pop();
        units.splice(cursor, 0, last);
        spaced = false;
        continue;
      }
    }
    return cursor;
  }
  return cursor;
}

/**
 * Greedy first-fit wrapper over wrap units with a per-line width callback
 * (shared by rect wrapping and the ellipse chord lanes).
 *
 * Guarantees:
 * - Progress: a unit wider than its line is force-split at grapheme
 *   boundaries, consuming at least one grapheme per line, so the loop always
 *   terminates even for `width <= 0`.
 * - Hard breaks (`newline` units) commit the line verbatim and skip kinsoku
 *   (저자 의도 존중).
 * - Whitespace at a soft break and at a line head is consumed (standard
 *   typesetting; documented at module level).
 */
function greedyWrapUnits(
  source: readonly WrapUnit[],
  options: GreedyWrapOptions,
): GreedyWrapResult {
  const { widthForLine, measure, maxLines, locale } = options;
  const units = [...source];
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < units.length && lines.length < maxLines) {
    const width = widthForLine(lines.length);
    const lineUnits: WrapUnit[] = [];
    let pendingSpaces: WrapUnit[] = [];
    let hardBreak = false;
    let brokeBeforeSpace = false;
    while (cursor < units.length) {
      const unit = units[cursor];
      if (unit.kind === "newline") {
        cursor += 1;
        hardBreak = true;
        break;
      }
      if (unit.kind === "space") {
        if (lineUnits.length === 0) {
          cursor += 1; // 줄 머리 공백은 소비(표준 조판)
          continue;
        }
        pendingSpaces.push(unit);
        cursor += 1;
        continue;
      }
      const candidate =
        joinUnits(lineUnits) + joinUnits(pendingSpaces) + unit.text;
      if (measure(candidate) <= width) {
        lineUnits.push(...pendingSpaces, unit);
        pendingSpaces = [];
        cursor += 1;
        continue;
      }
      if (lineUnits.length === 0) {
        // 강제 분절: 한 유닛(긴 어절·연속 라틴 등)이 줄 폭보다 넓다.
        // grapheme 단위 최대 접두어를 취하되 최소 1 grapheme은 소비해
        // 진행을 보장한다 (폭 초과는 fit 단계의 밴드 검사에서 정직 판정).
        const graphemes = splitGraphemes(unit.text, locale);
        let take = 1;
        while (
          take < graphemes.length &&
          measure(graphemes.slice(0, take + 1).join("")) <= width
        ) {
          take += 1;
        }
        const head = graphemes.slice(0, take).join("");
        const rest = graphemes.slice(take).join("");
        lineUnits.push({ text: head, kind: unit.kind });
        if (rest === "") {
          cursor += 1;
        } else {
          units[cursor] = { text: rest, kind: unit.kind };
        }
      } else {
        brokeBeforeSpace = pendingSpaces.length > 0;
      }
      break;
    }
    if (!hardBreak && cursor < units.length) {
      cursor = applyKinsoku(lineUnits, units, cursor, brokeBeforeSpace);
    }
    if (lineUnits.length > 0 || hardBreak) {
      lines.push(joinUnits(lineUnits));
    }
  }
  return { lines, overflowUnits: units.slice(cursor) };
}

/**
 * Grapheme-trims `line` until `line + ellipsis` fits `width`; trailing
 * whitespace before the ellipsis is trimmed too. Trimmed characters are
 * returned so the caller can push them into `overflow` (no quiet loss).
 * If even the ellipsis alone exceeds `width`, the line becomes the bare
 * ellipsis — a visible truncation signal beats silent emptiness.
 */
function applyEllipsisToLine(
  line: string,
  width: number,
  measure: (text: string) => number,
  ellipsis: string,
  locale: string,
): { line: string; trimmed: string } {
  const graphemes = splitGraphemes(line, locale);
  const removed: string[] = [];
  while (
    graphemes.length > 0 &&
    measure(graphemes.join("") + ellipsis) > width
  ) {
    const popped = graphemes.pop();
    if (popped === undefined) break;
    removed.unshift(popped);
  }
  while (
    graphemes.length > 0 &&
    WHITESPACE_ONLY.test(graphemes[graphemes.length - 1])
  ) {
    const popped = graphemes.pop();
    if (popped === undefined) break;
    removed.unshift(popped);
  }
  return { line: graphemes.join("") + ellipsis, trimmed: removed.join("") };
}

export interface WrapBalloonTextOptions {
  maxWidthPx: number;
  /** Injected metric — must be monotonic under concatenation. */
  measure: (text: string) => number;
  /** Explicit segmentation locale; default `"ko"` (결정성). */
  locale?: string;
  /** Line cap; wrapping stops here and the rest is returned in `overflow`. */
  maxLines?: number;
  /**
   * Explicit truncation marker (e.g. `"…"`). Only applied when `maxLines`
   * overflow occurs; trimmed characters are prepended to `overflow`.
   * Omitted (default): lines are capped without alteration — 손실 없음.
   */
  ellipsis?: string;
}

export interface WrapBalloonTextResult {
  lines: string[];
  /**
   * Source text not represented in `lines` (empty when everything fit).
   * `lines.join("")` + soft-break whitespace + `overflow` reconstructs the
   * input (ellipsis-trimmed characters are included here).
   */
  overflow: string;
}

/**
 * Greedy Korean/CJK-aware line wrapping into a fixed-width lane.
 * 어절 우선(한국어), 글자 단위 랩(한자·가나), 행두·행말 금칙 보정 포함.
 */
export function wrapBalloonText(
  text: string,
  options: WrapBalloonTextOptions,
): WrapBalloonTextResult {
  const {
    maxWidthPx,
    measure,
    locale = DEFAULT_WRAP_LOCALE,
    maxLines = Number.POSITIVE_INFINITY,
    ellipsis,
  } = options;
  const units = segmentForWrapping(text, locale);
  const wrapped = greedyWrapUnits(units, {
    widthForLine: () => maxWidthPx,
    measure,
    maxLines,
    locale,
  });
  const lines = wrapped.lines;
  let overflow = joinUnits(wrapped.overflowUnits);
  if (overflow !== "" && ellipsis !== undefined && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const result = applyEllipsisToLine(
      lines[lastIndex],
      maxWidthPx,
      measure,
      ellipsis,
      locale,
    );
    lines[lastIndex] = result.line;
    overflow = result.trimmed + overflow;
  }
  return { lines, overflow };
}

/**
 * Balloon region shapes. `rect`/`ellipse` are the v1 analytic shapes;
 * `cloud`/`spike` sample the preset outlines drawn by
 * manga-toolkit/speech-balloon.ts; `polygon` uses the caller-supplied
 * closed outline (`outline` option, balloon-local coordinates).
 */
export type BalloonShape = "rect" | "ellipse" | "cloud" | "spike" | "polygon";

export interface BalloonOutlinePoint {
  x: number;
  y: number;
}

/** Horizontal room a shape offers one line box, in balloon-local coords. */
export interface BalloonBand {
  /** Left edge of the usable interval. */
  left: number;
  /** Usable width (0 when the band is degenerate / outside the shape). */
  width: number;
}
export type BalloonTextAlign = "left" | "center" | "right";

export interface PlacedBalloonLine {
  text: string;
  /** Left edge of the aligned text run (balloon-local coordinates). */
  x: number;
  /** Top edge of the line box (balloon-local, y-down). */
  y: number;
  /** Horizontal room the shape offers at this line's vertical band. */
  availableWidth: number;
}

export interface BalloonRegionOptions {
  /** Closed outline for `shape: "polygon"` (balloon-local, y-down). */
  outline?: readonly BalloonOutlinePoint[];
  /**
   * Extra safety inset (px) shaved off both sides of every band.
   * Default 0 — v1 rect/ellipse behaviour is unchanged.
   */
  insetPx?: number;
  /** Cloud bump count for `shape: "cloud"` (speech-balloon 기본값 14). */
  cloudBumps?: number;
  /** Spike count for `shape: "spike"` (speech-balloon shout 기본값 18). */
  spikeCount?: number;
}

export interface LayoutBalloonLinesOptions extends BalloonRegionOptions {
  shape: BalloonShape;
  width: number;
  height: number;
  lineHeightPx: number;
  align: BalloonTextAlign;
  /** Injected metric — needed to place `x` for center/right alignment. */
  measure: (text: string) => number;
}

/**
 * Horizontal chord of the ellipse `x²/b² + y²/a² = 1` at vertical offset
 * `offsetY` from the center: `2·b·√(1 − (offsetY/a)²)` where `a = halfHeight`
 * and `b = halfWidth`. Returns 0 outside the ellipse (no NaN leakage).
 */
export function ellipseChordWidth(
  offsetY: number,
  halfHeight: number,
  halfWidth: number,
): number {
  const dy = Math.abs(offsetY);
  if (halfHeight <= 0 || halfWidth <= 0 || dy >= halfHeight) return 0;
  return 2 * halfWidth * Math.sqrt(1 - (dy / halfHeight) ** 2);
}

/**
 * Spike outline polygon — the exact vertices of speech-balloon.ts
 * `spikyPath`: outer tips at 1.18× the nominal ellipse radii, valleys at
 * 0.92×, alternating around the perimeter.
 */
export function spikeBalloonOutline(
  width: number,
  height: number,
  spikes = 18,
): BalloonOutlinePoint[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const count = Math.max(6, Math.floor(spikes));
  const points: BalloonOutlinePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    points.push({
      x: cx + Math.cos(angle) * rx * 1.18,
      y: cy + Math.sin(angle) * ry * 1.18,
    });
    const midAngle = (Math.PI * 2 * (i + 0.5)) / count;
    points.push({
      x: cx + Math.cos(midAngle) * rx * 0.92,
      y: cy + Math.sin(midAngle) * ry * 0.92,
    });
  }
  return points;
}

/** Samples per quadratic bump when polygonising the cloud outline. */
const CLOUD_BUMP_SAMPLES = 8;

/**
 * Cloud outline polygon — samples speech-balloon.ts `cloudPath`: quadratic
 * Bézier bumps between consecutive ellipse perimeter points with the control
 * point pushed out to 1.22× the radii at the mid-angle.
 */
export function cloudBalloonOutline(
  width: number,
  height: number,
  bumps = 14,
): BalloonOutlinePoint[] {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2;
  const ry = height / 2;
  const count = Math.max(8, Math.floor(bumps));
  const points: BalloonOutlinePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const a0 = (Math.PI * 2 * i) / count;
    const a1 = (Math.PI * 2 * (i + 1)) / count;
    const x0 = cx + Math.cos(a0) * rx;
    const y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx;
    const y1 = cy + Math.sin(a1) * ry;
    const midA = (a0 + a1) / 2;
    const qx = cx + Math.cos(midA) * rx * 1.22;
    const qy = cy + Math.sin(midA) * ry * 1.22;
    for (let step = 0; step < CLOUD_BUMP_SAMPLES; step += 1) {
      const t = step / CLOUD_BUMP_SAMPLES;
      const mt = 1 - t;
      points.push({
        x: mt * mt * x0 + 2 * mt * t * qx + t * t * x1,
        y: mt * mt * y0 + 2 * mt * t * qy + t * t * y1,
      });
    }
  }
  return points;
}

/** Even-odd fill intervals of a closed polygon along the scanline `y`. */
function polygonScanlineIntervals(
  outline: readonly BalloonOutlinePoint[],
  y: number,
): Array<{ left: number; right: number }> {
  const crossings: number[] = [];
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (a.y === b.y) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y >= hi) continue;
    crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
  }
  crossings.sort((p, q) => p - q);
  const intervals: Array<{ left: number; right: number }> = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    intervals.push({ left: crossings[i], right: crossings[i + 1] });
  }
  return intervals;
}

/** Scanline fractions sampled across a line box for the band intersection. */
const BAND_SCAN_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Usable interval for a line box spanning `[top, top + lineHeightPx]` inside
 * a closed polygon outline.
 *
 * The interval is the intersection, over several scanlines across the band,
 * of the polygon fill interval that contains the outline's bounding-box
 * centre (falling back to the widest interval). Intersecting across the
 * whole band — not just sampling the middle scanline — is what guarantees
 * the entire line box rests inside the shape, the same guarantee the
 * ellipse chord-at-far-edge rule gives analytically. Non-convex outlines
 * whose centre interval vanishes mid-band honestly report width 0.
 */
export function polygonBalloonBand(
  outline: readonly BalloonOutlinePoint[],
  top: number,
  lineHeightPx: number,
): BalloonBand {
  if (outline.length < 3 || lineHeightPx <= 0) return { left: 0, width: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const point of outline) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
  }
  const centerX = (minX + maxX) / 2;
  let band: { left: number; right: number } | null = null;
  for (const fraction of BAND_SCAN_FRACTIONS) {
    const intervals = polygonScanlineIntervals(
      outline,
      top + fraction * lineHeightPx,
    );
    if (intervals.length === 0) return { left: centerX, width: 0 };
    const chosen =
      intervals.find(
        (interval) => centerX >= interval.left && centerX <= interval.right,
      ) ??
      intervals.reduce((widest, interval) =>
        interval.right - interval.left > widest.right - widest.left
          ? interval
          : widest,
      );
    if (band === null) {
      band = { ...chosen };
    } else {
      band = {
        left: Math.max(band.left, chosen.left),
        right: Math.min(band.right, chosen.right),
      };
      if (band.right <= band.left) return { left: centerX, width: 0 };
    }
  }
  if (band === null) return { left: centerX, width: 0 };
  return { left: band.left, width: band.right - band.left };
}

/**
 * Band offered to a line box spanning `[top, top + lineHeightPx]`.
 * For the ellipse the constraining chord is at the edge of the line box
 * farther from the center (the chord shrinks monotonically with |y|), so the
 * whole line box fits inside the shape at the returned width. Cloud, spike
 * and custom polygon shapes go through `polygonBalloonBand`.
 */
function lineBand(
  shape: BalloonShape,
  top: number,
  lineHeightPx: number,
  width: number,
  height: number,
  region: BalloonRegionOptions,
): BalloonBand {
  const inset = Math.max(0, region.insetPx ?? 0);
  let band: BalloonBand;
  switch (shape) {
    case "rect":
      band = { left: 0, width };
      break;
    case "ellipse": {
      const cy = height / 2;
      const dyFar = Math.max(
        Math.abs(top - cy),
        Math.abs(top + lineHeightPx - cy),
      );
      const chord = ellipseChordWidth(dyFar, height / 2, width / 2);
      band = { left: (width - chord) / 2, width: chord };
      break;
    }
    case "cloud":
      band = polygonBalloonBand(
        cloudBalloonOutline(width, height, region.cloudBumps),
        top,
        lineHeightPx,
      );
      break;
    case "spike":
      band = polygonBalloonBand(
        spikeBalloonOutline(width, height, region.spikeCount),
        top,
        lineHeightPx,
      );
      break;
    case "polygon":
      band = polygonBalloonBand(region.outline ?? [], top, lineHeightPx);
      break;
  }
  if (inset === 0) return band;
  return {
    left: band.left + inset,
    width: Math.max(0, band.width - inset * 2),
  };
}

function alignedX(
  align: BalloonTextAlign,
  bandLeft: number,
  availableWidth: number,
  lineWidth: number,
): number {
  switch (align) {
    case "left":
      return bandLeft;
    case "center":
      return bandLeft + (availableWidth - lineWidth) / 2;
    case "right":
      return bandLeft + availableWidth - lineWidth;
  }
}

/**
 * Places already-wrapped lines inside a balloon region (rect, ellipse,
 * cloud, spike, or a caller-supplied custom polygon outline).
 * The line block is vertically centered; each line reports the width its
 * band actually offers (`availableWidth` — 0 means the band is degenerate,
 * e.g. an ellipse line box poking past the vertical extremes).
 */
export function layoutBalloonLines(
  lines: readonly string[],
  options: LayoutBalloonLinesOptions,
): PlacedBalloonLine[] {
  const { shape, width, height, lineHeightPx, align, measure } = options;
  const blockTop = (height - lines.length * lineHeightPx) / 2;
  return lines.map((text, index) => {
    const y = blockTop + index * lineHeightPx;
    const band = lineBand(shape, y, lineHeightPx, width, height, options);
    return {
      text,
      x: alignedX(align, band.left, band.width, measure(text)),
      y,
      availableWidth: band.width,
    };
  });
}

/**
 * Width of the line minus trailing hanging punctuation: pulled-in 행두 금지
 * 부호(추이코미)는 밴드 밖으로 매달리는 것이 허용되므로(JLReq의 ぶら下げ組),
 * 밴드 적합성 판정은 이 보정 폭으로 한다.
 */
function hangingAwareWidth(
  line: string,
  measure: (text: string) => number,
): number {
  const points = [...line];
  let end = points.length;
  while (end > 0 && LINE_START_PROHIBITED.has(points[end - 1])) {
    end -= 1;
  }
  return measure(points.slice(0, end).join(""));
}

export interface FitBalloonTextOptions extends BalloonRegionOptions {
  shape: BalloonShape;
  width: number;
  height: number;
  lineHeightPx: number;
  align: BalloonTextAlign;
  measure: (text: string) => number;
  /** Explicit segmentation locale; default `"ko"`. */
  locale?: string;
  /** Truncation marker applied only when the balloon cannot hold the text. */
  ellipsis?: string;
}

export interface FitBalloonTextResult {
  lines: PlacedBalloonLine[];
  /** Source text that did not fit (ellipsis trimmings included). */
  overflow: string;
  /** Wrap passes executed — bounded by `floor(height / lineHeightPx) + 1`. */
  iterations: number;
  /** True iff every character was placed and every line rests in its band. */
  fitted: boolean;
}

/**
 * Wrap + layout fixed point for a balloon region.
 *
 * Non-rect shapes couple wrapping and layout: each line's available width is
 * the shape's band at its vertical position (ellipse chord, or the polygon
 * band intersection for cloud/spike/custom outlines), but the bands depend
 * on how many lines exist.
 * We resolve the fixed point by trying line counts `n = 1 … maxSlots`
 * (`maxSlots = floor(height / lineHeightPx)`, the vertical capacity — the
 * guaranteed convergence bound): each pass wraps against the n-line chord
 * grid and is accepted when nothing overflows and every line's
 * hanging-punctuation-adjusted width fits its band. Rect lanes have uniform
 * width, so they start directly at `maxSlots` (single pass).
 *
 * If no count fits, the text is wrapped once more against the `maxSlots`
 * grid and returned with honest `overflow` (+ optional `ellipsis`) and
 * `fitted: false` — never silently dropped.
 */
export function fitBalloonText(
  text: string,
  options: FitBalloonTextOptions,
): FitBalloonTextResult {
  const {
    shape,
    width,
    height,
    lineHeightPx,
    align,
    measure,
    locale = DEFAULT_WRAP_LOCALE,
    ellipsis,
  } = options;
  const units = segmentForWrapping(text, locale);
  if (units.length === 0) {
    return { lines: [], overflow: "", iterations: 0, fitted: true };
  }
  const maxSlots = Math.floor(height / lineHeightPx);
  if (maxSlots < 1) {
    return { lines: [], overflow: text, iterations: 0, fitted: false };
  }
  const layoutOptions = {
    shape,
    width,
    height,
    lineHeightPx,
    align,
    measure,
    outline: options.outline,
    insetPx: options.insetPx,
    cloudBumps: options.cloudBumps,
    spikeCount: options.spikeCount,
  };
  const slotWidthsFor = (count: number): number[] => {
    const blockTop = (height - count * lineHeightPx) / 2;
    return Array.from({ length: count }, (_, index) =>
      lineBand(
        shape,
        blockTop + index * lineHeightPx,
        lineHeightPx,
        width,
        height,
        options,
      ).width,
    );
  };

  let iterations = 0;
  const startCount = shape === "rect" ? maxSlots : 1;
  for (let count = startCount; count <= maxSlots; count += 1) {
    iterations += 1;
    const widths = slotWidthsFor(count);
    const wrapped = greedyWrapUnits(units, {
      widthForLine: (index) => widths[Math.min(index, count - 1)],
      measure,
      maxLines: count,
      locale,
    });
    if (wrapped.overflowUnits.length > 0) continue;
    const finalWidths =
      wrapped.lines.length === count ? widths : slotWidthsFor(wrapped.lines.length);
    const fitsBands = wrapped.lines.every(
      (line, index) =>
        hangingAwareWidth(line, measure) <= finalWidths[index] + WIDTH_EPSILON,
    );
    if (!fitsBands) continue;
    return {
      lines: layoutBalloonLines(wrapped.lines, layoutOptions),
      overflow: "",
      iterations,
      fitted: true,
    };
  }

  // 수렴 실패 — maxSlots 격자로 한 번 더 랩핑해 정직하게 반환한다.
  iterations += 1;
  const widths = slotWidthsFor(maxSlots);
  const wrapped = greedyWrapUnits(units, {
    widthForLine: (index) => widths[Math.min(index, maxSlots - 1)],
    measure,
    maxLines: maxSlots,
    locale,
  });
  const lines = wrapped.lines;
  let overflow = joinUnits(wrapped.overflowUnits);
  if (overflow !== "" && ellipsis !== undefined && lines.length > 0) {
    const lastIndex = lines.length - 1;
    const result = applyEllipsisToLine(
      lines[lastIndex],
      widths[Math.min(lastIndex, maxSlots - 1)],
      measure,
      ellipsis,
      locale,
    );
    lines[lastIndex] = result.line;
    overflow = result.trimmed + overflow;
  }
  return {
    lines: layoutBalloonLines(lines, layoutOptions),
    overflow,
    iterations,
    fitted: false,
  };
}
