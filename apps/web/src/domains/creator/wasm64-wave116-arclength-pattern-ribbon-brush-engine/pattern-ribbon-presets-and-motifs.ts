/**
 * Wave 116 — 5종 만화 패턴 리본 프리셋 명세, 끝단 캡 및 UV 문양 스트로크 생성기.
 *
 * - 5종 정규 프리셋: 체인 링크, 고딕 프릴 레이스, 보태니컬 덩굴, 한국 단청 테두리, 건축 석조 난간.
 * - 시작·끝단 캡 4종(round, flat, tapered, ornamental-finial)과 타일 UV -> 곡면 XY 매핑을 담당한다.
 */

import {
  clampFinite,
  vec2Add,
  vec2Scale,
  type Vec2,
} from "./arclength-curve-and-frame-solver";

export type PatternRibbonPresetId =
  | "chain-link"
  | "gothic-lace"
  | "botanical-vine"
  | "korean-dancheong-border"
  | "architectural-balustrade";

export type RibbonCapStyle = "round" | "flat" | "tapered" | "ornamental-finial";

export type RibbonOffsetMode = "guarded" | "naive";

export interface PatternRibbonPresetSpec {
  readonly id: PatternRibbonPresetId;
  readonly labelKo: string;
  readonly categoryKo: string;
  readonly descriptionKo: string;
  readonly defaultWidthPx: number;
  readonly defaultTileRepeatLengthPx: number;
  readonly pressureWidthResponse: number;
  readonly handJitterAmplitudePx: number;
  readonly miterLimit: number;
  readonly bevelAngleThresholdDeg: number;
  readonly maxInnerCurvatureRatio: number;
  readonly defaultStartCap: RibbonCapStyle;
  readonly defaultEndCap: RibbonCapStyle;
  readonly patternMotifCode: number;
  readonly fillOklch: string;
  readonly strokeOklch: string;
  readonly accentOklch: string;
}

export interface RibbonStation {
  readonly index: number;
  readonly spine: Vec2;
  readonly arcLengthPx: number;
  readonly u: number;
  readonly tileIndex: number;
  readonly tileLocalU: number;
  readonly pressure: number;
  readonly tangent: Vec2;
  readonly normal: Vec2;
  readonly signedCurvature: number;
  readonly curvatureRadiusPx: number;
  readonly nominalHalfWidthPx: number;
  readonly leftHalfWidthPx: number;
  readonly rightHalfWidthPx: number;
  readonly leftPoint: Vec2;
  readonly rightPoint: Vec2;
  readonly leftUv: Vec2;
  readonly rightUv: Vec2;
  readonly isBevelStation: boolean;
  readonly innerClamped: boolean;
  readonly isTileBoundary: boolean;
}

export interface RibbonQuad {
  readonly index: number;
  readonly stationStartIndex: number;
  readonly stationEndIndex: number;
  readonly leftStart: Vec2;
  readonly rightStart: Vec2;
  readonly rightEnd: Vec2;
  readonly leftEnd: Vec2;
  readonly uStart: number;
  readonly uEnd: number;
  readonly signedAreaTri1: number;
  readonly signedAreaTri2: number;
  readonly totalAreaPx2: number;
  readonly inverted: boolean;
}

export interface RibbonEndCapGeometry {
  readonly end: "start" | "end";
  readonly capStyle: RibbonCapStyle;
  readonly anchor: Vec2;
  readonly outwardTangent: Vec2;
  readonly widthPx: number;
  readonly vertices: readonly Vec2[];
  readonly uvs: readonly Vec2[];
}

export interface RibbonMotifStroke {
  readonly tileIndex: number;
  readonly kind: "outline" | "accent" | "detail";
  readonly closed: boolean;
  readonly points: readonly Vec2[];
}

export const PATTERN_RIBBON_PRESETS: Readonly<Record<PatternRibbonPresetId, PatternRibbonPresetSpec>> = {
  "chain-link": {
    id: "chain-link",
    labelKo: "쇠사슬 체인",
    categoryKo: "금속·소품 패턴",
    descriptionKo: "타원형 쇠사슬 고리가 아크-길이 간격으로 맞물리는 액션·판타지용 리본 브러시",
    defaultWidthPx: 26,
    defaultTileRepeatLengthPx: 28,
    pressureWidthResponse: 0.45,
    handJitterAmplitudePx: 0.35,
    miterLimit: 1.5,
    bevelAngleThresholdDeg: 20,
    maxInnerCurvatureRatio: 0.72,
    defaultStartCap: "round",
    defaultEndCap: "round",
    patternMotifCode: 0,
    fillOklch: "oklch(0.86 0.018 245 / 0.34)",
    strokeOklch: "oklch(0.32 0.036 250)",
    accentOklch: "oklch(0.58 0.055 245)",
  },
  "gothic-lace": {
    id: "gothic-lace",
    labelKo: "고딕 프릴 레이스",
    categoryKo: "의상·장식 패턴",
    descriptionKo: "부채꼴 스캘럽 곡선과 아일릿 구멍이 규칙적으로 이어지는 로맨스·고딕 의상 레이스",
    defaultWidthPx: 30,
    defaultTileRepeatLengthPx: 26,
    pressureWidthResponse: 0.55,
    handJitterAmplitudePx: 0.45,
    miterLimit: 1.45,
    bevelAngleThresholdDeg: 18,
    maxInnerCurvatureRatio: 0.7,
    defaultStartCap: "tapered",
    defaultEndCap: "tapered",
    patternMotifCode: 1,
    fillOklch: "oklch(0.95 0.015 350 / 0.45)",
    strokeOklch: "oklch(0.34 0.058 345)",
    accentOklch: "oklch(0.56 0.095 348)",
  },
  "botanical-vine": {
    id: "botanical-vine",
    labelKo: "보태니컬 덩굴",
    categoryKo: "자연·식물 패턴",
    descriptionKo: "줄기 좌우로 대칭 잎사귀와 덩굴손이 필압에 따라 강약을 이루며 뻗는 식물 리본",
    defaultWidthPx: 28,
    defaultTileRepeatLengthPx: 32,
    pressureWidthResponse: 0.78,
    handJitterAmplitudePx: 0.75,
    miterLimit: 1.55,
    bevelAngleThresholdDeg: 22,
    maxInnerCurvatureRatio: 0.72,
    defaultStartCap: "tapered",
    defaultEndCap: "tapered",
    patternMotifCode: 2,
    fillOklch: "oklch(0.90 0.045 148 / 0.38)",
    strokeOklch: "oklch(0.35 0.095 152)",
    accentOklch: "oklch(0.52 0.125 142)",
  },
  "korean-dancheong-border": {
    id: "korean-dancheong-border",
    labelKo: "한국 단청 테두리",
    categoryKo: "전통·사극 문양",
    descriptionKo: "연화·뇌문 기하 띠가 급커브에서도 찌그러지지 않고 일정한 마디로 흐르는 단청 장식띠",
    defaultWidthPx: 32,
    defaultTileRepeatLengthPx: 34,
    pressureWidthResponse: 0.35,
    handJitterAmplitudePx: 0.25,
    miterLimit: 1.4,
    bevelAngleThresholdDeg: 18,
    maxInnerCurvatureRatio: 0.68,
    defaultStartCap: "ornamental-finial",
    defaultEndCap: "ornamental-finial",
    patternMotifCode: 3,
    fillOklch: "oklch(0.88 0.055 162 / 0.36)",
    strokeOklch: "oklch(0.42 0.145 26)",
    accentOklch: "oklch(0.52 0.115 165)",
  },
  "architectural-balustrade": {
    id: "architectural-balustrade",
    labelKo: "건축 석조 난간",
    categoryKo: "배경·건축 패턴",
    descriptionKo: "상하 난간대와 수직 기둥 간격을 원근 곡선에서도 균일하게 지키는 배경 건축 브러시",
    defaultWidthPx: 34,
    defaultTileRepeatLengthPx: 30,
    pressureWidthResponse: 0.22,
    handJitterAmplitudePx: 0.2,
    miterLimit: 1.38,
    bevelAngleThresholdDeg: 18,
    maxInnerCurvatureRatio: 0.68,
    defaultStartCap: "flat",
    defaultEndCap: "flat",
    patternMotifCode: 4,
    fillOklch: "oklch(0.89 0.016 82 / 0.42)",
    strokeOklch: "oklch(0.32 0.024 78)",
    accentOklch: "oklch(0.56 0.042 75)",
  },
};

export const PATTERN_RIBBON_PRESET_IDS: readonly PatternRibbonPresetId[] = [
  "chain-link",
  "gothic-lace",
  "botanical-vine",
  "korean-dancheong-border",
  "architectural-balustrade",
];

export function getPatternRibbonPreset(presetId: PatternRibbonPresetId): PatternRibbonPresetSpec {
  return PATTERN_RIBBON_PRESETS[presetId];
}

export function listPatternRibbonPresets(): readonly PatternRibbonPresetSpec[] {
  return PATTERN_RIBBON_PRESET_IDS.map((id) => PATTERN_RIBBON_PRESETS[id]);
}

export function buildRibbonEndCap(
  end: "start" | "end",
  station: RibbonStation | undefined,
  capStyle: RibbonCapStyle,
): RibbonEndCapGeometry {
  if (!station) {
    return {
      end,
      capStyle,
      anchor: { x: 0, y: 0 },
      outwardTangent: end === "start" ? { x: -1, y: 0 } : { x: 1, y: 0 },
      widthPx: 0,
      vertices: [],
      uvs: [],
    };
  }

  const outT = end === "start" ? vec2Scale(station.tangent, -1) : station.tangent;
  const halfAvg = 0.5 * (station.leftHalfWidthPx + station.rightHalfWidthPx);
  const widthPx = station.leftHalfWidthPx + station.rightHalfWidthPx;
  const center = vec2Scale(vec2Add(station.leftPoint, station.rightPoint), 0.5);
  const vertices: Vec2[] = [station.leftPoint];
  const uvs: Vec2[] = [station.leftUv];

  if (capStyle === "flat") {
    vertices.push(station.rightPoint);
    uvs.push(station.rightUv);
  } else if (capStyle === "tapered") {
    vertices.push(vec2Add(center, vec2Scale(outT, Math.max(2, halfAvg * 1.15))), station.rightPoint);
    uvs.push({ x: station.u, y: 0.5 }, station.rightUv);
  } else if (capStyle === "ornamental-finial") {
    vertices.push(
      vec2Add(station.leftPoint, vec2Scale(outT, halfAvg * 0.45)),
      vec2Add(center, vec2Scale(outT, Math.max(3, halfAvg * 1.25))),
      vec2Add(station.rightPoint, vec2Scale(outT, halfAvg * 0.45)),
      station.rightPoint,
    );
    uvs.push({ x: station.u, y: 0.2 }, { x: station.u, y: 0.5 }, { x: station.u, y: 0.8 }, station.rightUv);
  } else {
    const segments = 6;
    for (let k = 1; k < segments; k += 1) {
      const theta = (Math.PI * k) / segments;
      const pt = vec2Add(
        center,
        vec2Add(vec2Scale(station.normal, Math.cos(theta) * halfAvg), vec2Scale(outT, Math.sin(theta) * halfAvg)),
      );
      vertices.push(pt);
      uvs.push({ x: station.u, y: k / segments });
    }
    vertices.push(station.rightPoint);
    uvs.push(station.rightUv);
  }

  return { end, capStyle, anchor: station.spine, outwardTangent: outT, widthPx, vertices, uvs };
}

function sampleRibbonUv(quads: readonly RibbonQuad[], u: number, v: number): Vec2 | null {
  if (quads.length === 0) return null;
  const clampedV = clampFinite(v, 0, 1, 0.5);
  for (let i = 0; i < quads.length; i += 1) {
    const q = quads[i];
    if (u >= q.uStart - 1e-6 && u <= q.uEnd + 1e-6) {
      const span = q.uEnd - q.uStart;
      const t = span > 1e-7 ? clampFinite((u - q.uStart) / span, 0, 1, 0) : 0;
      const topX = q.leftStart.x + (q.leftEnd.x - q.leftStart.x) * t;
      const topY = q.leftStart.y + (q.leftEnd.y - q.leftStart.y) * t;
      const botX = q.rightStart.x + (q.rightEnd.x - q.rightStart.x) * t;
      const botY = q.rightStart.y + (q.rightEnd.y - q.rightStart.y) * t;
      return { x: topX + (botX - topX) * clampedV, y: topY + (botY - topY) * clampedV };
    }
  }
  return null;
}

export function buildPresetMotifStrokes(
  presetId: PatternRibbonPresetId,
  quads: readonly RibbonQuad[],
  tileCount: number,
): readonly RibbonMotifStroke[] {
  const fullTiles = Math.floor(tileCount);
  if (fullTiles <= 0 || quads.length === 0) return [];

  const strokes: RibbonMotifStroke[] = [];
  const mapUv = (pairs: ReadonlyArray<readonly [number, number]>): Vec2[] => {
    const pts: Vec2[] = [];
    for (let i = 0; i < pairs.length; i += 1) {
      const mapped = sampleRibbonUv(quads, pairs[i][0], pairs[i][1]);
      if (mapped) pts.push(mapped);
    }
    return pts;
  };

  for (let t = 0; t < fullTiles; t += 1) {
    if (presetId === "chain-link") {
      const oval: Array<readonly [number, number]> = [];
      for (let k = 0; k < 10; k += 1) {
        const ang = (Math.PI * 2 * k) / 10;
        oval.push([t + 0.5 + Math.cos(ang) * 0.38, 0.5 + Math.sin(ang) * 0.34]);
      }
      strokes.push({ tileIndex: t, kind: "outline", closed: true, points: mapUv(oval) });
      strokes.push({ tileIndex: t, kind: "accent", closed: false, points: mapUv([[t + 0.08, 0.5], [t + 0.24, 0.5]]) });
    } else if (presetId === "gothic-lace") {
      const arch: Array<readonly [number, number]> = [];
      for (let k = 0; k <= 6; k += 1) {
        const frac = k / 6;
        arch.push([t + frac, 0.22 + Math.sin(frac * Math.PI) * 0.66]);
      }
      strokes.push({ tileIndex: t, kind: "outline", closed: false, points: mapUv(arch) });
      strokes.push({
        tileIndex: t,
        kind: "accent",
        closed: true,
        points: mapUv([[t + 0.5, 0.36], [t + 0.66, 0.5], [t + 0.5, 0.64], [t + 0.34, 0.5]]),
      });
    } else if (presetId === "botanical-vine") {
      strokes.push({
        tileIndex: t,
        kind: "outline",
        closed: false,
        points: mapUv([[t, 0.5], [t + 0.25, 0.38], [t + 0.5, 0.5], [t + 0.75, 0.62], [t + 1, 0.5]]),
      });
      const leafV = t % 2 === 0 ? 0.14 : 0.86;
      strokes.push({
        tileIndex: t,
        kind: "accent",
        closed: true,
        points: mapUv([[t + 0.35, 0.5], [t + 0.52, leafV], [t + 0.72, 0.5]]),
      });
    } else if (presetId === "korean-dancheong-border") {
      strokes.push({
        tileIndex: t,
        kind: "outline",
        closed: true,
        points: mapUv([[t + 0.12, 0.2], [t + 0.88, 0.2], [t + 0.88, 0.8], [t + 0.12, 0.8]]),
      });
      strokes.push({
        tileIndex: t,
        kind: "accent",
        closed: true,
        points: mapUv([[t + 0.5, 0.26], [t + 0.74, 0.5], [t + 0.5, 0.74], [t + 0.26, 0.5]]),
      });
    } else {
      strokes.push({ tileIndex: t, kind: "outline", closed: false, points: mapUv([[t, 0.18], [t + 1, 0.18]]) });
      strokes.push({ tileIndex: t, kind: "outline", closed: false, points: mapUv([[t, 0.82], [t + 1, 0.82]]) });
      strokes.push({
        tileIndex: t,
        kind: "accent",
        closed: true,
        points: mapUv([
          [t + 0.36, 0.18],
          [t + 0.64, 0.18],
          [t + 0.58, 0.5],
          [t + 0.64, 0.82],
          [t + 0.36, 0.82],
          [t + 0.42, 0.5],
        ]),
      });
    }
  }

  return strokes;
}
