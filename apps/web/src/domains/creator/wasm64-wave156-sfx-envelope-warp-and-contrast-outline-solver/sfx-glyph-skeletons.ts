/**
 * Wave 156 — 한/일/영 만화 SFX 글리프 스크립트 분류, 자폭 가중치, 정규화 획 스켈레톤 및
 * UV 세분화·다각형 면적 계산 유틸리티.
 */

import {
  makeVec2,
  type SfxGlyphUvBox,
  type Vec2,
} from "./sfx-coons-presets";

export type SfxGlyphScriptKind =
  | "hangul"
  | "kana-cjk"
  | "latin"
  | "punctuation"
  | "other";

export function classifyGlyphScript(char: string): SfxGlyphScriptKind {
  const cp = char.codePointAt(0) ?? 0;
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x3130 && cp <= 0x318f)) {
    return "hangul";
  }
  if (
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf)
  ) {
    return "kana-cjk";
  }
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39)) {
    return "latin";
  }
  if ("!?—–-~….,:;/\\★☆⚡".indexOf(char) >= 0) {
    return "punctuation";
  }
  return "other";
}

export function glyphAdvanceWeight(char: string, script: SfxGlyphScriptKind): number {
  if (char === " " || char === "\t") return 0.44;
  if (char === "!" || char === "|" || char === "I" || char === "i" || char === "l") return 0.46;
  if (char === "?" || char === "…" || char === "~") return 0.68;
  if (char === "—" || char === "–" || char === "-") return 0.86;
  if (script === "hangul" || script === "kana-cjk") return 1.0;
  if (script === "latin") {
    const upper = char.toUpperCase();
    if (upper === "M" || upper === "W") return 0.88;
    return 0.72;
  }
  return 0.76;
}

/**
 * 글리프 단위 정규화 `[0, 1] × [0, 1]` 공간에서 만화 효과음 획 스켈레톤(폴리라인 목록)을 생성한다.
 * 한글 음절은 초·중·종성 구조 분해를 반영해 시각적으로 구분되는 블록 획을 만든다.
 */
export function buildGlyphUnitStrokes(
  char: string,
  script: SfxGlyphScriptKind,
): readonly (readonly Vec2[])[] {
  if (char === "!") {
    return [
      [makeVec2(0.5, 0.08), makeVec2(0.46, 0.66)],
      [makeVec2(0.44, 0.84), makeVec2(0.54, 0.92)],
    ];
  }
  if (char === "?") {
    return [
      [makeVec2(0.22, 0.24), makeVec2(0.52, 0.08), makeVec2(0.80, 0.26), makeVec2(0.50, 0.54), makeVec2(0.50, 0.68)],
      [makeVec2(0.47, 0.85), makeVec2(0.53, 0.92)],
    ];
  }
  if (char === "—" || char === "–" || char === "-") {
    return [[makeVec2(0.06, 0.50), makeVec2(0.94, 0.50)]];
  }
  if (char === "~") {
    return [[makeVec2(0.08, 0.56), makeVec2(0.34, 0.34), makeVec2(0.66, 0.66), makeVec2(0.92, 0.44)]];
  }

  const cp = char.codePointAt(0) ?? 65;
  if (script === "hangul" && cp >= 0xac00 && cp <= 0xd7a3) {
    const syllable = cp - 0xac00;
    const jong = syllable % 28;
    const jung = Math.floor(syllable / 28) % 21;
    const cho = Math.floor(syllable / (28 * 21));
    const hasJong = jong > 0;
    const midY = hasJong ? 0.62 : 0.90;
    const strokes: Vec2[][] = [];

    if (cho % 3 === 0) {
      strokes.push([makeVec2(0.10, 0.14), makeVec2(0.52, 0.14), makeVec2(0.52, midY * 0.78)]);
    } else if (cho % 3 === 1) {
      strokes.push([makeVec2(0.14, 0.14), makeVec2(0.14, midY * 0.78), makeVec2(0.54, midY * 0.78)]);
      strokes.push([makeVec2(0.14, 0.14), makeVec2(0.52, 0.14)]);
    } else {
      strokes.push([makeVec2(0.32, 0.12), makeVec2(0.12, midY * 0.76)]);
      strokes.push([makeVec2(0.32, 0.12), makeVec2(0.54, midY * 0.76)]);
    }

    if (jung >= 8 && jung <= 13) {
      strokes.push([makeVec2(0.10, midY * 0.88), makeVec2(0.90, midY * 0.88)]);
      strokes.push([makeVec2(0.50, midY * 0.62), makeVec2(0.50, midY * 0.88)]);
    } else {
      strokes.push([makeVec2(0.76, 0.10), makeVec2(0.76, midY * 0.94)]);
      strokes.push([makeVec2(0.76, midY * 0.45), makeVec2(0.92, midY * 0.45)]);
    }

    if (hasJong) {
      strokes.push([makeVec2(0.18, 0.74), makeVec2(0.84, 0.74), makeVec2(0.84, 0.92), makeVec2(0.18, 0.92)]);
    }
    return strokes;
  }

  const variant = cp % 4;
  if (variant === 0) {
    return [
      [makeVec2(0.14, 0.12), makeVec2(0.86, 0.12), makeVec2(0.86, 0.88), makeVec2(0.14, 0.88), makeVec2(0.14, 0.12)],
      [makeVec2(0.16, 0.50), makeVec2(0.84, 0.50)],
    ];
  }
  if (variant === 1) {
    return [
      [makeVec2(0.16, 0.12), makeVec2(0.84, 0.12)],
      [makeVec2(0.50, 0.12), makeVec2(0.50, 0.88)],
      [makeVec2(0.16, 0.88), makeVec2(0.84, 0.88)],
    ];
  }
  if (variant === 2) {
    return [
      [makeVec2(0.16, 0.88), makeVec2(0.50, 0.12), makeVec2(0.84, 0.88)],
      [makeVec2(0.28, 0.58), makeVec2(0.72, 0.58)],
    ];
  }
  return [[makeVec2(0.16, 0.12), makeVec2(0.84, 0.12), makeVec2(0.18, 0.88), makeVec2(0.86, 0.88)]];
}

export function subdividePolylineInUv(
  points: readonly Vec2[],
  box: SfxGlyphUvBox,
  subdivisions: number,
): readonly Vec2[] {
  const result: Vec2[] = [];
  const uSpan = box.u1 - box.u0;
  const vSpan = box.v1 - box.v0;
  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i];
    if (i === 0) {
      result.push(makeVec2(box.u0 + curr.x * uSpan, box.v0 + curr.y * vSpan));
      continue;
    }
    const prev = points[i - 1];
    for (let s = 1; s <= subdivisions; s += 1) {
      const t = s / subdivisions;
      const lx = prev.x + (curr.x - prev.x) * t;
      const ly = prev.y + (curr.y - prev.y) * t;
      result.push(makeVec2(box.u0 + lx * uSpan, box.v0 + ly * vSpan));
    }
  }
  return result;
}

export function computePolygonArea(poly: readonly Vec2[]): number {
  if (poly.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) * 0.5;
}
