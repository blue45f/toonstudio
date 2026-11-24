/**
 * 크리에이터 개인 G펜 필압·테이퍼 곡선, C1 연속 큐빅 베지어 피팅 및 SVG/JSON 벡터 레이어 내보내기.
 */

import type {
  CreatorGpenProfile,
  CubicBezierSegment,
  ExportVectorInkSvgOptions,
  FitBezierInkOptions,
  FittedBezierInkStroke,
  GpenStyleId,
  InkEdgeKind,
  InkPolyline,
  InkPolylinePoint,
  Vec2,
  VectorInkLayerPayload,
  VectorInkLayerStrokePayload,
  VectorInkProjectionResult,
  VectorInkSvgExport,
} from "./types";

const EPSILON = 1e-8;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalize2(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= EPSILON) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function turningAngleDeg(dirA: Vec2, dirB: Vec2): number {
  const dot = clamp(dirA.x * dirB.x + dirA.y * dirB.y, -1, 1);
  return Math.acos(dot) * RAD_TO_DEG;
}

/** 크리에이터 개인 G펜 필압·테이퍼 프리셋 3종. */
export const GPEN_STYLE_PRESETS: Readonly<Record<GpenStyleId, CreatorGpenProfile>> = {
  "webtoon-gpen": {
    id: "webtoon-gpen",
    labelKo: "웹툰 G펜",
    labelEn: "Webtoon G-Pen",
    descriptionKo: "날렵한 진입·빼기 스냅과 그림자 측 필압 강약을 균형 있게 살린 표준 웹툰 G펜",
    descriptionEn: "Balanced Korean webtoon G-Pen with crisp entry/exit flicks and shadow-side line weight.",
    baseWidthPx: 2.6,
    entryTaper: 0.72,
    exitFlick: 0.88,
    bellySwell: 0.44,
    curvatureWeight: 0.36,
    shadowSideThickening: 0.78,
    creaseWidthRatio: 0.68,
    minWidthPx: 0.35,
  },
  "expressive-brush": {
    id: "expressive-brush",
    labelKo: "강약 붓펜",
    labelEn: "Expressive Brush",
    descriptionKo: "중앙 배부름과 어두운 면 먹선 강약을 극대화해 액션·감정 컷에 어울리는 붓펜",
    descriptionEn: "High-contrast brush pen with strong belly swell, sweeping flicks, and bold shadow weight.",
    baseWidthPx: 3.4,
    entryTaper: 0.86,
    exitFlick: 0.96,
    bellySwell: 0.78,
    curvatureWeight: 0.46,
    shadowSideThickening: 1.15,
    creaseWidthRatio: 0.62,
    minWidthPx: 0.3,
  },
  "architectural-technical": {
    id: "architectural-technical",
    labelKo: "건축 테크니컬",
    labelEn: "Architectural Technical",
    descriptionKo: "균일한 제도펜 선폭과 절제된 그림자 가중치로 배경·소품 선화에 특화된 테크니컬 펜",
    descriptionEn: "Clean technical draftsman nib with restrained taper and consistent architectural creases.",
    baseWidthPx: 1.85,
    entryTaper: 0.14,
    exitFlick: 0.18,
    bellySwell: 0.08,
    curvatureWeight: 0.12,
    shadowSideThickening: 0.28,
    creaseWidthRatio: 0.86,
    minWidthPx: 0.55,
  },
};

export const GPEN_STYLE_IDS: readonly GpenStyleId[] = [
  "webtoon-gpen",
  "expressive-brush",
  "architectural-technical",
];

export function getGpenStyleProfile(id: GpenStyleId): CreatorGpenProfile {
  return GPEN_STYLE_PRESETS[id];
}

/**
 * 크리에이터 개인 G펜 필압-테이퍼 곡선 선폭 계산기.
 * - `entryTaper` / `exitFlick`: 진입 및 끝 빼기 테이퍼
 * - `bellySwell`: 획 중앙 필압 팽창
 * - `curvatureWeight`: 곡률이 급할수록 날카롭게 가늘어지는 보정
 * - `shadowSideThickening`: 주광 반대편 그림자 측 선폭 강조
 */
export function evaluateGpenStrokeWidth(params: {
  readonly t: number;
  readonly curvature: number;
  readonly shadowFactor: number;
  readonly kind: InkEdgeKind;
  readonly closed: boolean;
  readonly profile: CreatorGpenProfile;
}): number {
  const t = clamp(params.t, 0, 1);
  const curvature = clamp(params.curvature, 0, 1);
  const shadow = clamp(params.shadowFactor, 0, 1);
  const { profile } = params;

  const entryStrength = params.closed ? profile.entryTaper * 0.15 : profile.entryTaper;
  const exitStrength = params.closed ? profile.exitFlick * 0.15 : profile.exitFlick;

  const entryZone = 0.08 + entryStrength * 0.24;
  let entryFactor = 1;
  if (entryStrength > 0 && t < entryZone) {
    const u = clamp(t / entryZone, 0, 1);
    const smooth = u * u * (3 - 2 * u);
    const minEntry = 1 - entryStrength * 0.82;
    entryFactor = minEntry + (1 - minEntry) * smooth;
  }

  const exitZone = 0.1 + exitStrength * 0.28;
  let exitFactor = 1;
  if (exitStrength > 0 && t > 1 - exitZone) {
    const u = clamp((1 - t) / exitZone, 0, 1);
    const flick = Math.pow(u, 1.45);
    const minExit = 1 - exitStrength * 0.9;
    exitFactor = minExit + (1 - minExit) * flick;
  }

  const bellyFactor = 1 + profile.bellySwell * 0.48 * Math.pow(Math.sin(Math.PI * t), 1.2);
  const curvatureFactor = 1 - profile.curvatureWeight * 0.36 * curvature;
  const shadowFactorMult = 1 + profile.shadowSideThickening * Math.pow(shadow, 1.15);
  const kindFactor = params.kind === "crease" ? profile.creaseWidthRatio : 1;

  const rawWidth =
    profile.baseWidthPx * kindFactor * entryFactor * exitFactor * bellyFactor * curvatureFactor * shadowFactorMult;
  const minW = profile.minWidthPx ?? 0.3;
  return clamp(rawWidth, minW, profile.baseWidthPx * 3.6);
}

function evalCubicBezierPoint(seg: CubicBezierSegment, u: number): Vec2 {
  const inv = 1 - u;
  const inv2 = inv * inv;
  const u2 = u * u;
  return {
    x:
      inv2 * inv * seg.p0.x +
      3 * inv2 * u * seg.cp1.x +
      3 * inv * u2 * seg.cp2.x +
      u2 * u * seg.p3.x,
    y:
      inv2 * inv * seg.p0.y +
      3 * inv2 * u * seg.cp1.y +
      3 * inv * u2 * seg.cp2.y +
      u2 * u * seg.p3.y,
  };
}

function evalCubicBezierTangent(seg: CubicBezierSegment, u: number): Vec2 {
  const inv = 1 - u;
  const dx =
    3 * inv * inv * (seg.cp1.x - seg.p0.x) +
    6 * inv * u * (seg.cp2.x - seg.cp1.x) +
    3 * u * u * (seg.p3.x - seg.cp2.x);
  const dy =
    3 * inv * inv * (seg.cp1.y - seg.p0.y) +
    6 * inv * u * (seg.cp2.y - seg.cp1.y) +
    3 * u * u * (seg.p3.y - seg.cp2.y);
  if (Math.hypot(dx, dy) <= EPSILON) {
    return normalize2(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y);
  }
  return normalize2(dx, dy);
}

function buildSvgOutlinePathD(polygon: readonly Vec2[]): string {
  if (polygon.length < 3) return "";
  const first = polygon[0];
  if (!first) return "";
  const parts: string[] = [`M ${round2(first.x)} ${round2(first.y)}`];
  for (let i = 1; i < polygon.length; i += 1) {
    const pt = polygon[i];
    if (pt) parts.push(`L ${round2(pt.x)} ${round2(pt.y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function buildSvgCenterlinePathD(segments: readonly CubicBezierSegment[], closed: boolean): string {
  const first = segments[0];
  if (!first) return "";
  const parts: string[] = [`M ${round2(first.p0.x)} ${round2(first.p0.y)}`];
  for (const seg of segments) {
    parts.push(
      `C ${round2(seg.cp1.x)} ${round2(seg.cp1.y)} ${round2(seg.cp2.x)} ${round2(seg.cp2.y)} ${round2(seg.p3.x)} ${round2(seg.p3.y)}`,
    );
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/**
 * ③ 폴리라인을 C1 연속 큐빅 베지어 세그먼트와 크리에이터 G펜 가변 폭 잉크 외곽선으로 변환한다.
 */
export function fitCubicBezierInkStrokes(
  polylines: readonly InkPolyline[],
  profile: CreatorGpenProfile,
  options: FitBezierInkOptions = {},
): readonly FittedBezierInkStroke[] {
  const subdivisions = clamp(Math.round(options.subdivisionsPerSegment ?? 6), 2, 16);
  const strokes: FittedBezierInkStroke[] = [];

  for (const polyline of polylines) {
    const pts = polyline.points;
    if (pts.length < 2) continue;

    const cumLen: number[] = [0];
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const step = prev && curr ? dist2(prev, curr) : 0;
      cumLen.push((cumLen[i - 1] ?? 0) + step);
    }
    const totalLen = Math.max(cumLen[cumLen.length - 1] ?? 0, EPSILON);

    const n = pts.length;
    const tangents: Vec2[] = new Array(n);
    const curvatures: number[] = new Array(n);

    for (let i = 0; i < n; i += 1) {
      const curr = pts[i];
      if (!curr) {
        tangents[i] = { x: 1, y: 0 };
        curvatures[i] = 0;
        continue;
      }
      let prevPt: InkPolylinePoint | undefined;
      let nextPt: InkPolylinePoint | undefined;

      if (i === 0) {
        prevPt = polyline.closed && n >= 3 ? pts[n - 2] : undefined;
        nextPt = pts[1];
      } else if (i === n - 1) {
        prevPt = pts[n - 2];
        nextPt = polyline.closed && n >= 3 ? pts[1] : undefined;
      } else {
        prevPt = pts[i - 1];
        nextPt = pts[i + 1];
      }

      if (prevPt && nextPt) {
        const dIn = normalize2(curr.x - prevPt.x, curr.y - prevPt.y);
        const dOut = normalize2(nextPt.x - curr.x, nextPt.y - curr.y);
        const avgX = dIn.x + dOut.x;
        const avgY = dIn.y + dOut.y;
        tangents[i] = Math.hypot(avgX, avgY) > EPSILON ? normalize2(avgX, avgY) : dOut;
        curvatures[i] = clamp(turningAngleDeg(dIn, dOut) / 75, 0, 1);
      } else if (nextPt) {
        tangents[i] = normalize2(nextPt.x - curr.x, nextPt.y - curr.y);
        curvatures[i] = 0;
      } else if (prevPt) {
        tangents[i] = normalize2(curr.x - prevPt.x, curr.y - prevPt.y);
        curvatures[i] = 0;
      } else {
        tangents[i] = { x: 1, y: 0 };
        curvatures[i] = 0;
      }
    }

    const vertexWidths: number[] = pts.map((pt, i) =>
      evaluateGpenStrokeWidth({
        t: (cumLen[i] ?? 0) / totalLen,
        curvature: curvatures[i] ?? 0,
        shadowFactor: pt.shadowFactor,
        kind: polyline.kind,
        closed: polyline.closed,
        profile,
      }),
    );

    const segments: CubicBezierSegment[] = [];
    const segmentVertexPairs: { readonly startIdx: number; readonly endIdx: number }[] = [];
    for (let i = 0; i < n - 1; i += 1) {
      const p0 = pts[i];
      const p3 = pts[i + 1];
      const t0 = tangents[i];
      const t1 = tangents[i + 1];
      if (!p0 || !p3 || !t0 || !t1) continue;
      const chord = dist2(p0, p3);
      if (chord <= EPSILON) continue;
      const handleLen = chord / 3;

      segments.push({
        p0: { x: p0.x, y: p0.y },
        cp1: { x: p0.x + t0.x * handleLen, y: p0.y + t0.y * handleLen },
        cp2: { x: p3.x - t1.x * handleLen, y: p3.y - t1.y * handleLen },
        p3: { x: p3.x, y: p3.y },
        widthStart: vertexWidths[i] ?? profile.baseWidthPx,
        widthEnd: vertexWidths[i + 1] ?? profile.baseWidthPx,
        shadowFactor: (p0.shadowFactor + p3.shadowFactor) * 0.5,
      });
      segmentVertexPairs.push({ startIdx: i, endIdx: i + 1 });
    }

    if (segments.length === 0) continue;

    const leftRail: Vec2[] = [];
    const rightRail: Vec2[] = [];
    let minWidthPx = Number.POSITIVE_INFINITY;
    let maxWidthPx = 0;
    let widthSum = 0;
    let widthSamples = 0;

    let segStartArc = 0;
    for (let sIdx = 0; sIdx < segments.length; sIdx += 1) {
      const seg = segments[sIdx];
      const pair = segmentVertexPairs[sIdx];
      if (!seg || !pair) continue;
      const segChord = dist2(seg.p0, seg.p3);
      const startStep = sIdx === 0 ? 0 : 1;
      const shadowStart = pts[pair.startIdx]?.shadowFactor ?? seg.shadowFactor;
      const shadowEnd = pts[pair.endIdx]?.shadowFactor ?? seg.shadowFactor;
      const curvStart = curvatures[pair.startIdx] ?? 0;
      const curvEnd = curvatures[pair.endIdx] ?? 0;

      for (let step = startStep; step <= subdivisions; step += 1) {
        const u = step / subdivisions;
        const pt = evalCubicBezierPoint(seg, u);
        const tan = evalCubicBezierTangent(seg, u);
        const nx = -tan.y;
        const ny = tan.x;
        const globalT = clamp((segStartArc + segChord * u) / totalLen, 0, 1);

        const localCurv = clamp(curvStart * (1 - u) + curvEnd * u, 0, 1);
        const localShadow = clamp(shadowStart * (1 - u) + shadowEnd * u, 0, 1);
        const sampleWidth = evaluateGpenStrokeWidth({
          t: globalT,
          curvature: localCurv,
          shadowFactor: localShadow,
          kind: polyline.kind,
          closed: polyline.closed,
          profile,
        });

        const halfW = sampleWidth * 0.5;
        leftRail.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
        rightRail.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });

        if (sampleWidth < minWidthPx) minWidthPx = sampleWidth;
        if (sampleWidth > maxWidthPx) maxWidthPx = sampleWidth;
        widthSum += sampleWidth;
        widthSamples += 1;
      }
      segStartArc += segChord;
    }

    const outlinePolygon: Vec2[] = [...leftRail, ...rightRail.reverse()];
    const svgOutlinePathD = buildSvgOutlinePathD(outlinePolygon);
    const svgCenterlinePathD = buildSvgCenterlinePathD(segments, polyline.closed);

    strokes.push({
      id: polyline.id,
      kind: polyline.kind,
      closed: polyline.closed,
      averageDepth: polyline.averageDepth,
      averageShadowFactor: polyline.averageShadowFactor,
      arcLengthPx: polyline.arcLengthPx,
      segments,
      outlinePolygon,
      svgOutlinePathD,
      svgCenterlinePathD,
      minWidthPx: Number.isFinite(minWidthPx) ? minWidthPx : profile.baseWidthPx,
      maxWidthPx,
      meanWidthPx: widthSamples > 0 ? widthSum / widthSamples : profile.baseWidthPx,
    });
  }

  return strokes;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * ④ 가변 폭 SVG `<path>` 외곽선 폴리곤과 편집 가능한 JSON 큐빅 베지어 벡터 레이어를 내보낸다.
 */
export function exportVectorInkSvg(
  result: VectorInkProjectionResult,
  options: ExportVectorInkSvgOptions = {},
): VectorInkSvgExport {
  const includeGuides = options.includeEditableBezierGuides ?? true;
  const fillToken = options.inkFillToken ?? "currentColor";
  const width = Math.round(result.camera.viewportWidth);
  const height = Math.round(result.camera.viewportHeight);

  const outlinePaths: string[] = [];
  const guidePaths: string[] = [];
  const layerStrokes: VectorInkLayerStrokePayload[] = [];

  for (const stroke of result.strokes) {
    if (stroke.svgOutlinePathD.length === 0) continue;
    const safeId = escapeXmlAttr(stroke.id);
    const safeKind = escapeXmlAttr(stroke.kind);
    const shadowAttr = round2(stroke.averageShadowFactor);

    outlinePaths.push(
      `    <path id="${safeId}" data-edge-kind="${safeKind}" data-shadow-factor="${shadowAttr}" d="${stroke.svgOutlinePathD}" fill="${escapeXmlAttr(fillToken)}" stroke="none" />`,
    );

    if (includeGuides && stroke.svgCenterlinePathD.length > 0) {
      guidePaths.push(
        `    <path id="${safeId}-bezier" data-edge-kind="${safeKind}" d="${stroke.svgCenterlinePathD}" fill="none" stroke="none" />`,
      );
    }

    layerStrokes.push({
      id: stroke.id,
      kind: stroke.kind,
      closed: stroke.closed,
      averageDepth: round2(stroke.averageDepth),
      averageShadowFactor: shadowAttr,
      arcLengthPx: round2(stroke.arcLengthPx),
      minWidthPx: round2(stroke.minWidthPx),
      maxWidthPx: round2(stroke.maxWidthPx),
      segments: stroke.segments.map((seg) => ({
        p0: { x: round2(seg.p0.x), y: round2(seg.p0.y) },
        cp1: { x: round2(seg.cp1.x), y: round2(seg.cp1.y) },
        cp2: { x: round2(seg.cp2.x), y: round2(seg.cp2.y) },
        p3: { x: round2(seg.p3.x), y: round2(seg.p3.y) },
        widthStart: round2(seg.widthStart),
        widthEnd: round2(seg.widthEnd),
        shadowFactor: round2(seg.shadowFactor),
      })),
      svgOutlinePathD: stroke.svgOutlinePathD,
      svgCenterlinePathD: stroke.svgCenterlinePathD,
    });
  }

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-toonstudio-layer="vector-ink-projection" data-mesh-preset="${escapeXmlAttr(result.mesh.id)}" data-gpen-style="${escapeXmlAttr(result.gpenProfile.id)}">`,
    `  <title>${escapeXmlAttr(`${result.mesh.labelKo} - ${result.gpenProfile.labelKo} 벡터 잉크`)}</title>`,
    `  <g id="vector-ink-outlines" data-layer-kind="gpen-outline">`,
    ...outlinePaths,
    `  </g>`,
  ];

  if (includeGuides) {
    lines.push(`  <g id="vector-ink-bezier-guides" data-layer-kind="editable-bezier" fill="none" stroke="none">`);
    lines.push(...guidePaths);
    lines.push(`  </g>`);
  }
  lines.push(`</svg>`);

  const svgMarkup = lines.join("\n");

  const payload: VectorInkLayerPayload = {
    schemaVersion: "toonstudio.vector-ink-layer.v1",
    meshId: result.mesh.id,
    gpenStyleId: result.gpenProfile.id,
    viewport: { width, height },
    camera: result.camera,
    keyLightDirection: result.keyLightDirection,
    creaseAngleDeg: result.creaseAngleDeg,
    gpenProfile: result.gpenProfile,
    strokes: layerStrokes,
    stats: result.stats,
  };

  const layerJson = JSON.stringify(payload, null, 2);

  return {
    svgMarkup,
    layerJson,
    payload,
    pathCount: outlinePaths.length,
    byteLength: new TextEncoder().encode(svgMarkup).byteLength,
  };
}
