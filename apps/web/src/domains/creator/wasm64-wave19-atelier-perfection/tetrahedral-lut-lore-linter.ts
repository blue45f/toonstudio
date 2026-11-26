/**
 * 사면체(Tetrahedral) 3D 색보정 LUT(`17³` / `.cube` 호환) 분위기 베이커·보간기 및
 * 연재 세계관 고유명사·시대착오·번역 표기 일관성 검사기 통합 모듈.
 *
 * - 외부 서버 호출 0회(₩0), 로컬 메모리 상에서 즉시 완결 동작한다.
 * - 단위 격자 정육면체를 주대각선(`(0,0,0)->(1,1,1)`) 기준 6개 사면체로 분할해 보간함으로써,
 *   표준 삼선형(Trilinear) 보간에서 발생하는 무채색 축 색 번짐과 대각 계조 마하 밴딩(Mach Banding)을
 *   원천 차단하고 4개 꼭짓점 참조만으로 정밀 색보정을 수행한다.
 * - `새벽 청명`, `황혼 회상`, `심야 추격`, `과거 세피아 필름` 4종 분위기 3D LUT 생성 및
 *   표준 `.cube` 텍스트 직렬화·파싱을 지원한다.
 */

export {
  boundedLevenshteinAtMostOne,
  DEFAULT_ERA_ANACHRONISM_RULES,
  harmonizeKoreanJosa,
  lintSeriesLoreConsistency,
  type AutoFixedEpisodeResult,
  type ForbiddenAnachronismRule,
  type LoreCanonicalEntry,
  type LoreConsistencyReport,
  type LoreEntityCategory,
  type LoreEpisodeInput,
  type LoreIssueKind,
  type LoreLinterOptions,
  type LoreLintFinding,
  type WorldEraSetting,
} from "./series-lore-consistency-linter";

export type StudioMoodPresetId =
  | "dawn-clarity"
  | "dusk-flashback"
  | "midnight-pursuit"
  | "vintage-sepia-film";

export type RgbTriplet = readonly [number, number, number];

export interface StudioMoodPresetMeta {
  readonly presetId: StudioMoodPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
}

export interface Lut3DTable {
  readonly title: string;
  readonly size: number;
  readonly domainMin: RgbTriplet;
  readonly domainMax: RgbTriplet;
  /** `.cube` 표준 순서: R이 가장 빠르게, G가 중간, B가 가장 느리게 증가 (`size³ * 3`) */
  readonly data: Float32Array;
}

export interface LutInterpolationDiagnostic {
  readonly tetrahedralNeutralChromaLeak: number;
  readonly trilinearNeutralChromaLeak: number;
  readonly tetrahedralMaxSecondDiff: number;
  readonly trilinearMaxSecondDiff: number;
  readonly serverCostKrw: 0;
}

export const STUDIO_MOOD_LUT_PRESETS: Readonly<
  Record<StudioMoodPresetId, StudioMoodPresetMeta>
> = Object.freeze({
  "dawn-clarity": {
    presetId: "dawn-clarity",
    labelKo: "새벽 청명",
    summaryKo: "맑고 서늘한 청회색 암부와 투명한 하늘빛 명부로 이른 아침 공기를 표현한다.",
  },
  "dusk-flashback": {
    presetId: "dusk-flashback",
    labelKo: "황혼 회상",
    summaryKo: "노을빛 호박색 중간톤과 부드러운 자줏빛 그림자로 아련한 기억 장면을 연출한다.",
  },
  "midnight-pursuit": {
    presetId: "midnight-pursuit",
    labelKo: "심야 추격",
    summaryKo: "차가운 청록 암부 대비를 조이고 가로등·피부 난색 포인트만 날카롭게 남긴다.",
  },
  "vintage-sepia-film": {
    presetId: "vintage-sepia-film",
    labelKo: "과거 세피아 필름",
    summaryKo: "들뜬 암부 필름 페이드와 따뜻한 인화지 은염 톤으로 옛 기록물 질감을 만든다.",
  },
});

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lutVertexOffset(size: number, rIdx: number, gIdx: number, bIdx: number): number {
  return ((bIdx * size + gIdx) * size + rIdx) * 3;
}

function normalizeDomainCoord(
  val: number,
  dMin: number,
  dMax: number,
  maxIndex: number,
): { readonly idx0: number; readonly idx1: number; readonly frac: number } {
  const span = dMax - dMin;
  const norm = span > 1e-12 ? clamp01((val - dMin) / span) : 0;
  const scaled = norm * maxIndex;
  const idx0 = Math.min(maxIndex - 1, Math.max(0, Math.floor(scaled)));
  const idx1 = Math.min(maxIndex, idx0 + 1);
  return { idx0, idx1, frac: clamp01(scaled - idx0) };
}

/**
 * 단위 큐브를 주대각선 기준 6개 사면체로 나누어 마하 밴딩 없이 3D LUT를 보간한다.
 */
export function evaluateTetrahedralLutSample(
  lut: Lut3DTable,
  r: number,
  g: number,
  b: number,
): RgbTriplet {
  const size = Math.max(2, Math.floor(lut.size));
  const maxIdx = size - 1;
  const rc = normalizeDomainCoord(r, lut.domainMin[0], lut.domainMax[0], maxIdx);
  const gc = normalizeDomainCoord(g, lut.domainMin[1], lut.domainMax[1], maxIdx);
  const bc = normalizeDomainCoord(b, lut.domainMin[2], lut.domainMax[2], maxIdx);

  const dr = rc.frac;
  const dg = gc.frac;
  const db = bc.frac;
  const d = lut.data;

  const o000 = lutVertexOffset(size, rc.idx0, gc.idx0, bc.idx0);
  const o111 = lutVertexOffset(size, rc.idx1, gc.idx1, bc.idx1);

  let w000: number;
  let wA: number;
  let wB: number;
  let w111: number;
  let oA: number;
  let oB: number;

  if (dr >= dg) {
    if (dg >= db) {
      w000 = 1 - dr;
      wA = dr - dg;
      wB = dg - db;
      w111 = db;
      oA = lutVertexOffset(size, rc.idx1, gc.idx0, bc.idx0);
      oB = lutVertexOffset(size, rc.idx1, gc.idx1, bc.idx0);
    } else if (dr >= db) {
      w000 = 1 - dr;
      wA = dr - db;
      wB = db - dg;
      w111 = dg;
      oA = lutVertexOffset(size, rc.idx1, gc.idx0, bc.idx0);
      oB = lutVertexOffset(size, rc.idx1, gc.idx0, bc.idx1);
    } else {
      w000 = 1 - db;
      wA = db - dr;
      wB = dr - dg;
      w111 = dg;
      oA = lutVertexOffset(size, rc.idx0, gc.idx0, bc.idx1);
      oB = lutVertexOffset(size, rc.idx1, gc.idx0, bc.idx1);
    }
  } else if (dg >= db) {
    if (dr >= db) {
      w000 = 1 - dg;
      wA = dg - dr;
      wB = dr - db;
      w111 = db;
      oA = lutVertexOffset(size, rc.idx0, gc.idx1, bc.idx0);
      oB = lutVertexOffset(size, rc.idx1, gc.idx1, bc.idx0);
    } else {
      w000 = 1 - dg;
      wA = dg - db;
      wB = db - dr;
      w111 = dr;
      oA = lutVertexOffset(size, rc.idx0, gc.idx1, bc.idx0);
      oB = lutVertexOffset(size, rc.idx0, gc.idx1, bc.idx1);
    }
  } else {
    w000 = 1 - db;
    wA = db - dg;
    wB = dg - dr;
    w111 = dr;
    oA = lutVertexOffset(size, rc.idx0, gc.idx0, bc.idx1);
    oB = lutVertexOffset(size, rc.idx0, gc.idx1, bc.idx1);
  }

  return [
    w000 * (d[o000] ?? 0) + wA * (d[oA] ?? 0) + wB * (d[oB] ?? 0) + w111 * (d[o111] ?? 0),
    w000 * (d[o000 + 1] ?? 0) +
      wA * (d[oA + 1] ?? 0) +
      wB * (d[oB + 1] ?? 0) +
      w111 * (d[o111 + 1] ?? 0),
    w000 * (d[o000 + 2] ?? 0) +
      wA * (d[oA + 2] ?? 0) +
      wB * (d[oB + 2] ?? 0) +
      w111 * (d[o111 + 2] ?? 0),
  ];
}

/**
 * 비교 검증용 표준 8-꼭짓점 삼선형(Trilinear) 3D LUT 보간기.
 */
export function evaluateTrilinearLutSample(
  lut: Lut3DTable,
  r: number,
  g: number,
  b: number,
): RgbTriplet {
  const size = Math.max(2, Math.floor(lut.size));
  const maxIdx = size - 1;
  const rc = normalizeDomainCoord(r, lut.domainMin[0], lut.domainMax[0], maxIdx);
  const gc = normalizeDomainCoord(g, lut.domainMin[1], lut.domainMax[1], maxIdx);
  const bc = normalizeDomainCoord(b, lut.domainMin[2], lut.domainMax[2], maxIdx);
  const dr = rc.frac;
  const dg = gc.frac;
  const db = bc.frac;
  const d = lut.data;

  const corner = (ri: number, gi: number, bi: number, ch: number): number =>
    d[lutVertexOffset(size, ri, gi, bi) + ch] ?? 0;

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const c00 = corner(rc.idx0, gc.idx0, bc.idx0, ch) * (1 - dr) + corner(rc.idx1, gc.idx0, bc.idx0, ch) * dr;
    const c01 = corner(rc.idx0, gc.idx0, bc.idx1, ch) * (1 - dr) + corner(rc.idx1, gc.idx0, bc.idx1, ch) * dr;
    const c10 = corner(rc.idx0, gc.idx1, bc.idx0, ch) * (1 - dr) + corner(rc.idx1, gc.idx1, bc.idx0, ch) * dr;
    const c11 = corner(rc.idx0, gc.idx1, bc.idx1, ch) * (1 - dr) + corner(rc.idx1, gc.idx1, bc.idx1, ch) * dr;
    out[ch] = (c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db;
  }
  return out;
}

/**
 * 무채색 대각선(`r = g = b`) 상에서 사면체 보간과 삼선형 보간의 색 번짐 및 2차 미분 굴곡을 비교 진단한다.
 */
export function compareTetrahedralVsTrilinearLut(
  lut: Lut3DTable,
  sampleSteps = 128,
): LutInterpolationDiagnostic {
  const steps = Math.max(8, Math.floor(sampleSteps));
  let tetChromaLeak = 0;
  let triChromaLeak = 0;
  let tetMaxD2 = 0;
  let triMaxD2 = 0;
  const tetLuma: number[] = [];
  const triLuma: number[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const tet = evaluateTetrahedralLutSample(lut, t, t, t);
    const tri = evaluateTrilinearLutSample(lut, t, t, t);
    tetChromaLeak = Math.max(tetChromaLeak, Math.abs(tet[0] - tet[1]) + Math.abs(tet[1] - tet[2]));
    triChromaLeak = Math.max(triChromaLeak, Math.abs(tri[0] - tri[1]) + Math.abs(tri[1] - tri[2]));
    tetLuma.push(0.2126 * tet[0] + 0.7152 * tet[1] + 0.0722 * tet[2]);
    triLuma.push(0.2126 * tri[0] + 0.7152 * tri[1] + 0.0722 * tri[2]);
  }

  for (let i = 1; i < steps; i += 1) {
    const d2Tet = Math.abs((tetLuma[i + 1] ?? 0) - 2 * (tetLuma[i] ?? 0) + (tetLuma[i - 1] ?? 0));
    const d2Tri = Math.abs((triLuma[i + 1] ?? 0) - 2 * (triLuma[i] ?? 0) + (triLuma[i - 1] ?? 0));
    if (d2Tet > tetMaxD2) tetMaxD2 = d2Tet;
    if (d2Tri > triMaxD2) triMaxD2 = d2Tri;
  }

  return {
    tetrahedralNeutralChromaLeak: tetChromaLeak,
    trilinearNeutralChromaLeak: triChromaLeak,
    tetrahedralMaxSecondDiff: tetMaxD2,
    trilinearMaxSecondDiff: triMaxD2,
    serverCostKrw: 0,
  };
}

function applySCurve(x: number, contrast: number): number {
  const c = clamp01(x);
  const centered = c - 0.5;
  return clamp01(0.5 + centered * (1 + contrast * (1 - 4 * centered * centered)));
}

function gradeMoodPoint(presetId: StudioMoodPresetId, r: number, g: number, b: number): RgbTriplet {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const shadowWeight = (1 - luma) * (1 - luma);
  const highlightWeight = luma * luma;
  const midWeight = 4 * luma * (1 - luma);

  if (presetId === "dawn-clarity") {
    const cr = applySCurve(r, 0.22);
    const cg = applySCurve(g, 0.24);
    const cb = applySCurve(b, 0.26);
    const sat = 1.12;
    return [
      0.02 + clamp01(luma + (cr - luma) * sat - 0.035 * shadowWeight + 0.01 * highlightWeight) * 0.98,
      0.03 + clamp01(luma + (cg - luma) * sat + 0.025 * shadowWeight + 0.03 * highlightWeight) * 0.97,
      0.05 + clamp01(luma + (cb - luma) * sat + 0.075 * shadowWeight + 0.06 * highlightWeight) * 0.95,
    ];
  }

  if (presetId === "dusk-flashback") {
    const softLuma = 0.035 + 0.91 * applySCurve(luma, 0.14);
    const sat = 0.88;
    return [
      clamp01(softLuma + (r - luma) * sat + 0.085 * midWeight + 0.09 * highlightWeight + 0.02 * shadowWeight),
      clamp01(softLuma + (g - luma) * sat + 0.025 * midWeight + 0.03 * highlightWeight - 0.02 * shadowWeight),
      clamp01(softLuma + (b - luma) * sat - 0.055 * midWeight - 0.04 * highlightWeight + 0.045 * shadowWeight),
    ];
  }

  if (presetId === "midnight-pursuit") {
    const crushedR = applySCurve(Math.pow(r, 1.18), 0.36);
    const crushedG = applySCurve(Math.pow(g, 1.12), 0.36);
    const crushedB = applySCurve(Math.pow(b, 1.04), 0.32);
    const warmAccent = Math.max(0, r - Math.max(g, b));
    return [
      clamp01(crushedR * 0.86 + warmAccent * 0.28 - 0.03 * shadowWeight),
      clamp01(crushedG * 0.95 + 0.035 * shadowWeight),
      clamp01(crushedB * 1.08 + 0.095 * shadowWeight),
    ];
  }

  const fadedSilver = 0.065 + 0.855 * applySCurve(Math.pow(luma, 0.96), 0.18);
  const chroma = 0.16;
  return [
    clamp01((fadedSilver + (r - luma) * chroma) * 1.09 + 0.045 * midWeight + 0.02 * highlightWeight),
    clamp01((fadedSilver + (g - luma) * chroma) * 0.96 + 0.01 * midWeight),
    clamp01((fadedSilver + (b - luma) * chroma) * 0.77 - 0.03 * midWeight),
  ];
}

/**
 * 지정된 연출 분위기(`새벽 청명`, `황혼 회상`, `심야 추격`, `과거 세피아 필름`)를
 * `size³` (기본 `17³ = 4,913` 노드) 3D 색보정 LUT로 굽는다.
 */
export function bakeStudioMoodLut3D(presetId: StudioMoodPresetId, size = 17): Lut3DTable {
  const grid = clamp(Math.floor(size), 2, 65);
  const meta = STUDIO_MOOD_LUT_PRESETS[presetId];
  const data = new Float32Array(grid * grid * grid * 3);
  const denom = grid - 1;

  for (let bi = 0; bi < grid; bi += 1) {
    const b = bi / denom;
    for (let gi = 0; gi < grid; gi += 1) {
      const g = gi / denom;
      for (let ri = 0; ri < grid; ri += 1) {
        const graded = gradeMoodPoint(presetId, ri / denom, g, b);
        const off = lutVertexOffset(grid, ri, gi, bi);
        data[off] = graded[0];
        data[off + 1] = graded[1];
        data[off + 2] = graded[2];
      }
    }
  }

  return {
    title: `${meta.presetId} (${meta.labelKo})`,
    size: grid,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

/**
 * 8비트 RGBA 이미지 버퍼에 사면체 3D LUT를 적용한다(알파 채널 무손실 보존).
 */
export function applyTetrahedralLutToRgbaBuffer(
  rgba: Uint8Array | Uint8ClampedArray,
  lut: Lut3DTable,
  intensity = 1.0,
): Uint8ClampedArray {
  const mix = clamp01(intensity);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r0 = (rgba[i] ?? 0) / 255;
    const g0 = (rgba[i + 1] ?? 0) / 255;
    const b0 = (rgba[i + 2] ?? 0) / 255;
    const graded = evaluateTetrahedralLutSample(lut, r0, g0, b0);
    out[i] = Math.round(clamp01(r0 + (graded[0] - r0) * mix) * 255);
    out[i + 1] = Math.round(clamp01(g0 + (graded[1] - g0) * mix) * 255);
    out[i + 2] = Math.round(clamp01(b0 + (graded[2] - b0) * mix) * 255);
    out[i + 3] = rgba[i + 3] ?? 255;
  }
  return out;
}

function splitWhitespaceTokens(line: string): string[] {
  const tokens: string[] = [];
  let start = -1;
  for (let i = 0; i < line.length; i += 1) {
    const code = line.charCodeAt(i);
    const isSpace = code === 32 || code === 9 || code === 13;
    if (!isSpace && start < 0) start = i;
    else if (isSpace && start >= 0) {
      tokens.push(line.slice(start, i));
      start = -1;
    }
  }
  if (start >= 0) tokens.push(line.slice(start));
  return tokens;
}

/**
 * `Lut3DTable`을 업계 표준 Adobe/Resolve 호환 `.cube` 문자열로 직렬화한다.
 */
export function serializeCubeLut(lut: Lut3DTable): string {
  const size = Math.max(2, Math.floor(lut.size));
  const safeTitle = lut.title.replaceAll('"', "'").replaceAll("\n", " ");
  const lines: string[] = [
    `TITLE "${safeTitle}"`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN ${lut.domainMin[0].toFixed(6)} ${lut.domainMin[1].toFixed(6)} ${lut.domainMin[2].toFixed(6)}`,
    `DOMAIN_MAX ${lut.domainMax[0].toFixed(6)} ${lut.domainMax[1].toFixed(6)} ${lut.domainMax[2].toFixed(6)}`,
  ];
  const totalNodes = size * size * size;
  for (let idx = 0; idx < totalNodes; idx += 1) {
    const off = idx * 3;
    lines.push(
      `${(lut.data[off] ?? 0).toFixed(6)} ${(lut.data[off + 1] ?? 0).toFixed(6)} ${(lut.data[off + 2] ?? 0).toFixed(6)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * `.cube` 포맷 문자열을 정규식 백트래킹 없이 선형 파싱하여 `Lut3DTable`로 복원한다.
 */
export function parseCubeLut(cubeSource: string): Lut3DTable {
  let title = "Untitled LUT";
  let size = 0;
  let domainMin: RgbTriplet = [0, 0, 0];
  let domainMax: RgbTriplet = [1, 1, 1];
  const values: number[] = [];

  for (const rawLine of cubeSource.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.charCodeAt(0) === 35) continue;

    if (trimmed.startsWith("TITLE")) {
      const q0 = trimmed.indexOf('"');
      const q1 = trimmed.lastIndexOf('"');
      title = q0 >= 0 && q1 > q0 ? trimmed.slice(q0 + 1, q1) : trimmed.slice(5).trim();
      continue;
    }

    const tokens = splitWhitespaceTokens(trimmed);
    const head = tokens[0];
    if (head === "LUT_3D_SIZE" && tokens.length >= 2) {
      const parsed = Number(tokens[1]);
      if (!Number.isInteger(parsed) || parsed < 2 || parsed > 129) {
        throw new Error(`유효하지 않은 LUT_3D_SIZE 값입니다: ${tokens[1]}`);
      }
      size = parsed;
    } else if (head === "DOMAIN_MIN" && tokens.length >= 4) {
      domainMin = [Number(tokens[1]), Number(tokens[2]), Number(tokens[3])];
    } else if (head === "DOMAIN_MAX" && tokens.length >= 4) {
      domainMax = [Number(tokens[1]), Number(tokens[2]), Number(tokens[3])];
    } else if (tokens.length === 3) {
      const r = Number(tokens[0]);
      const g = Number(tokens[1]);
      const b = Number(tokens[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (size < 2) throw new Error(".cube 헤더에 LUT_3D_SIZE 정의가 없습니다.");
  const expectedLength = size * size * size * 3;
  if (values.length !== expectedLength) {
    throw new Error(
      `.cube 데이터 개수가 일치하지 않습니다(기대: ${expectedLength / 3}줄, 실제: ${values.length / 3}줄).`,
    );
  }

  return { title, size, domainMin, domainMax, data: Float32Array.from(values) };
}
