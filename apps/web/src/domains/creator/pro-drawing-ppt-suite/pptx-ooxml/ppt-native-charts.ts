/**
 * 네이티브 데이터 차트 4종(`bar`, `line`, `donut`, `radar`) 순수 SVG 기하 생성기.
 * 모든 색상은 CSS 시맨틱 토큰(`var(--pptx-slide-accent-*)`)만 사용한다.
 */

import type { NativeChartDatum, NativeChartVariant } from "./ooxml-pptx-types";

export const CHART_ACCENT_TOKEN_SLOTS = [
  "var(--pptx-slide-accent-1)",
  "var(--pptx-slide-accent-2)",
  "var(--pptx-slide-accent-3)",
  "var(--pptx-slide-accent-4)",
] as const;

export function getChartAccentToken(index: number): string {
  const len = CHART_ACCENT_TOKEN_SLOTS.length;
  return CHART_ACCENT_TOKEN_SLOTS[((index % len) + len) % len];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ChartGridLine {
  readonly y: number;
  readonly label: string;
}

export interface ChartBarGeometry {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fillToken: string;
  readonly labelX: number;
  readonly valueY: number;
}

export interface ChartLinePoint {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly cx: number;
  readonly cy: number;
}

export interface ChartDonutSlice {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly percentage: number;
  readonly path: string;
  readonly fillToken: string;
}

export interface ChartRadarVertex {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly labelX: number;
  readonly labelY: number;
  readonly axisPath: string;
}

export interface NativeChartSvgModel {
  readonly variant: NativeChartVariant;
  readonly width: number;
  readonly height: number;
  readonly unit: string;
  readonly maxValue: number;
  readonly totalValue: number;
  readonly gridLines: readonly ChartGridLine[];
  readonly bars: readonly ChartBarGeometry[];
  readonly linePath: string;
  readonly areaPath: string;
  readonly linePoints: readonly ChartLinePoint[];
  readonly donutSlices: readonly ChartDonutSlice[];
  readonly radarRings: readonly string[];
  readonly radarDataPath: string;
  readonly radarVertices: readonly ChartRadarVertex[];
}

function buildDonutArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= Math.PI * 1.999) {
    const mid = startAngle + Math.PI;
    return `${buildDonutArcPath(cx, cy, outerR, innerR, startAngle, mid)} ${buildDonutArcPath(cx, cy, outerR, innerR, mid, endAngle - 0.001)}`;
  }
  const largeArc = sweep > Math.PI ? 1 : 0;
  const x1 = round2(cx + Math.cos(startAngle) * outerR);
  const y1 = round2(cy + Math.sin(startAngle) * outerR);
  const x2 = round2(cx + Math.cos(endAngle) * outerR);
  const y2 = round2(cy + Math.sin(endAngle) * outerR);
  const ix1 = round2(cx + Math.cos(endAngle) * innerR);
  const iy1 = round2(cy + Math.sin(endAngle) * innerR);
  const ix2 = round2(cx + Math.cos(startAngle) * innerR);
  const iy2 = round2(cy + Math.sin(startAngle) * innerR);

  return [
    `M ${x1} ${y1}`,
    `A ${round2(outerR)} ${round2(outerR)} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${ix1} ${iy1}`,
    `A ${round2(innerR)} ${round2(innerR)} 0 ${largeArc} 0 ${ix2} ${iy2}`,
    "Z",
  ].join(" ");
}

export function buildNativeChartSvgModel(
  variant: NativeChartVariant,
  rawPoints: readonly NativeChartDatum[],
  width = 480,
  height = 230,
  unit = "",
): NativeChartSvgModel {
  const points: readonly NativeChartDatum[] =
    rawPoints.length > 0 ? rawPoints : [{ id: "empty", label: "항목", value: 10 }];
  const safeValues = points.map((pt) => (Number.isFinite(pt.value) ? Math.max(0, pt.value) : 0));
  const rawMax = Math.max(...safeValues, 1);
  const maxValue = rawMax <= 10 ? Math.ceil(rawMax / 2) * 2 : Math.ceil(rawMax / 10) * 10;
  const totalValue = safeValues.reduce((acc, v) => acc + v, 0);

  const plotLeft = 44;
  const plotRight = width - 20;
  const plotTop = 24;
  const plotBottom = height - 34;
  const plotW = Math.max(40, plotRight - plotLeft);
  const plotH = Math.max(40, plotBottom - plotTop);

  const gridLines: ChartGridLine[] = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: round2(plotBottom - plotH * ratio),
    label: `${Math.round(maxValue * ratio)}`,
  }));

  if (variant === "bar") {
    const slotW = plotW / points.length;
    const barW = Math.min(48, Math.max(14, slotW * 0.56));
    const bars: ChartBarGeometry[] = points.map((pt, idx) => {
      const val = safeValues[idx];
      const barH = Math.max(2, (val / maxValue) * plotH);
      const x = round2(plotLeft + idx * slotW + (slotW - barW) / 2);
      const y = round2(plotBottom - barH);
      return {
        id: pt.id,
        label: pt.label,
        value: val,
        x,
        y,
        width: round2(barW),
        height: round2(barH),
        fillToken: getChartAccentToken(idx),
        labelX: round2(x + barW / 2),
        valueY: round2(Math.max(14, y - 6)),
      };
    });

    return {
      variant,
      width,
      height,
      unit,
      maxValue,
      totalValue,
      gridLines,
      bars,
      linePath: "",
      areaPath: "",
      linePoints: [],
      donutSlices: [],
      radarRings: [],
      radarDataPath: "",
      radarVertices: [],
    };
  }

  if (variant === "line") {
    const linePoints: ChartLinePoint[] = points.map((pt, idx) => {
      const val = safeValues[idx];
      const cx =
        points.length === 1
          ? round2(plotLeft + plotW / 2)
          : round2(plotLeft + (plotW * idx) / (points.length - 1));
      const cy = round2(plotBottom - (val / maxValue) * plotH);
      return { id: pt.id, label: pt.label, value: val, cx, cy };
    });

    const linePath = linePoints
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.cx} ${pt.cy}`)
      .join(" ");
    const first = linePoints[0];
    const last = linePoints[linePoints.length - 1];
    const areaPath =
      linePoints.length > 0
        ? `${linePath} L ${last.cx} ${round2(plotBottom)} L ${first.cx} ${round2(plotBottom)} Z`
        : "";

    return {
      variant,
      width,
      height,
      unit,
      maxValue,
      totalValue,
      gridLines,
      bars: [],
      linePath,
      areaPath,
      linePoints,
      donutSlices: [],
      radarRings: [],
      radarDataPath: "",
      radarVertices: [],
    };
  }

  if (variant === "donut") {
    const cx = round2(width * 0.34);
    const cy = round2(height / 2);
    const outerR = round2(Math.min(width * 0.28, height * 0.41));
    const innerR = round2(outerR * 0.56);
    const denom = totalValue > 0 ? totalValue : 1;
    let cursor = -Math.PI / 2;

    const donutSlices: ChartDonutSlice[] = points.map((pt, idx) => {
      const val = safeValues[idx];
      const share = val / denom;
      const sweep = Math.max(0.02, share * Math.PI * 2);
      const startAngle = cursor;
      const endAngle = cursor + sweep;
      cursor = endAngle;
      return {
        id: pt.id,
        label: pt.label,
        value: val,
        percentage: Math.round(share * 100),
        path: buildDonutArcPath(cx, cy, outerR, innerR, startAngle, endAngle),
        fillToken: getChartAccentToken(idx),
      };
    });

    return {
      variant,
      width,
      height,
      unit,
      maxValue,
      totalValue,
      gridLines: [],
      bars: [],
      linePath: "",
      areaPath: "",
      linePoints: [],
      donutSlices,
      radarRings: [],
      radarDataPath: "",
      radarVertices: [],
    };
  }

  // radar
  const cx = width / 2;
  const cy = height / 2 + 4;
  const maxR = Math.min(width, height) * 0.35;
  const radarPoints = points.slice(0, Math.max(3, points.length));

  const radarRings: string[] = [0.25, 0.5, 0.75, 1].map((level) => {
    const coords = Array.from({ length: radarPoints.length }, (_, idx) => {
      const angle = -Math.PI / 2 + (idx * Math.PI * 2) / radarPoints.length;
      return `${round2(cx + Math.cos(angle) * maxR * level)} ${round2(cy + Math.sin(angle) * maxR * level)}`;
    });
    return `M ${coords.join(" L ")} Z`;
  });

  const radarVertices: ChartRadarVertex[] = radarPoints.map((pt, idx) => {
    const val = safeValues[idx];
    const angle = -Math.PI / 2 + (idx * Math.PI * 2) / radarPoints.length;
    const ratio = clamp(val / maxValue, 0.06, 1);
    const x = round2(cx + Math.cos(angle) * maxR * ratio);
    const y = round2(cy + Math.sin(angle) * maxR * ratio);
    return {
      id: pt.id,
      label: pt.label,
      value: val,
      x,
      y,
      labelX: round2(cx + Math.cos(angle) * (maxR + 20)),
      labelY: round2(cy + Math.sin(angle) * (maxR + 18)),
      axisPath: `M ${round2(cx)} ${round2(cy)} L ${round2(cx + Math.cos(angle) * maxR)} ${round2(cy + Math.sin(angle) * maxR)}`,
    };
  });

  return {
    variant: "radar",
    width,
    height,
    unit,
    maxValue,
    totalValue,
    gridLines: [],
    bars: [],
    linePath: "",
    areaPath: "",
    linePoints: [],
    donutSlices: [],
    radarRings,
    radarDataPath:
      radarVertices.length > 0
        ? `M ${radarVertices.map((v) => `${v.x} ${v.y}`).join(" L ")} Z`
        : "",
    radarVertices,
  };
}
