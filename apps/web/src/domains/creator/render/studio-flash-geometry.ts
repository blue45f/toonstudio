/**
 * CSP 플래시(Flash) 보조 도구 지오메트리 엔진 (vars 519–527).
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 지원 보조 도구 변형(StudioFlashVariant):
 * - "flash" (기본 플래시: 내부 들쭉날쭉 별 코어 + 방사형 테이퍼 광선 고리)
 * - "dense-flash" (조밀 플래시: 고밀도 광선 + 높은 내부 코어 불투명도)
 * - "sea-urchin" (성게 플래시: 잔잔한 코어 경계에서 가늘고 촘촘한 바늘 광선이 뻗어 나감)
 * - "firework" (불꽃 플래시: 중심 폭발 + 주변 방사형 위성 폭발 군집 다중 생성)
 * - "flash-pattern" (패턴 플래시: 장단 주기 리듬을 갖는 교차 광선 + 선명한 별 톱니)
 *
 * 핵심 Stream* / ConcentrateStream* 파라미터:
 * - StreamUseJag, StreamJagNumber, StreamJagLength, ConcentrateStreamFillOpacity
 */

import { createEffectPrng, hashEffectSeed } from "./studio-effect-line-planner-v2";

import type { FocusLinesEl } from "../studio-element-model";
import type { EffectPoint2D } from "./studio-effect-line-planner-v2";

export type StudioFlashVariant =
  | "flash"
  | "dense-flash"
  | "sea-urchin"
  | "firework"
  | "flash-pattern";

export interface StudioFlashInput {
  readonly variant?: StudioFlashVariant;
  readonly seed?: string | number;
  readonly centerX?: number;
  readonly centerY?: number;
  readonly innerRadiusX?: number;
  readonly innerRadiusY?: number;
  readonly outerRadius?: number;
  readonly rayCount?: number;
  readonly rayBaseWidthPx?: number;
  readonly rayLengthJitter?: number;
  readonly rayWidthJitter?: number;
  readonly rayAngleJitterDeg?: number;
  /** CSP StreamUseJag — true면 내부 코어를 들쭉날쭉한 별 다각형으로 생성한다. */
  readonly streamUseJag?: boolean;
  /** CSP StreamJagNumber — 내부 별 다각형의 뾰족한 톱니 꼭짓점 개수(6..180). */
  readonly streamJagNumber?: number;
  /** CSP StreamJagLength — 내부 별 다각형 톱니의 바깥 돌출 길이(px). */
  readonly streamJagLength?: number;
  /** CSP ConcentrateStreamFillOpacity — 내부 코어 채움 불투명도(0..1). */
  readonly concentrateStreamFillOpacity?: number;
  readonly fillColor?: string;
  readonly strokeColor?: string;
  /** 불꽃("firework") 변형의 주변 위성 군집 개수(3..12, 기본 5). */
  readonly fireworkSatelliteCount?: number;
}

export interface StudioFlashCorePolygon {
  readonly vertices: readonly EffectPoint2D[];
  readonly points: readonly number[];
  readonly pathData: string;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly jagEnabled: boolean;
  readonly jagPeakCount: number;
}

export interface StudioFlashRayPolygon {
  readonly index: number;
  readonly vertices: readonly EffectPoint2D[];
  readonly points: readonly number[];
  readonly pathData: string;
  readonly angleRad: number;
  readonly lengthPx: number;
  readonly baseWidthPx: number;
}

export interface StudioFlashCluster {
  readonly clusterIndex: number;
  readonly center: EffectPoint2D;
  readonly scale: number;
  readonly corePolygon: StudioFlashCorePolygon;
  readonly rays: readonly StudioFlashRayPolygon[];
}

export interface StudioFlashPlan {
  readonly variant: StudioFlashVariant;
  readonly seedHash: number;
  readonly strokeColor: string;
  readonly fillColor: string;
  /** 대표(중심) 클러스터의 내부 별/타원 코어 다각형. */
  readonly corePolygon: StudioFlashCorePolygon;
  /** 모든 클러스터의 외곽 테이퍼 광선 합집합. */
  readonly rays: readonly StudioFlashRayPolygon[];
  /** 단일 플래시는 1개, "firework"는 중심 + 방사형 위성 폭발 군집 목록. */
  readonly clusters: readonly StudioFlashCluster[];
}

export interface StudioFlashPresetSpec {
  readonly variant: StudioFlashVariant;
  readonly label: string;
  readonly description: string;
  readonly defaults: Required<
    Pick<
      StudioFlashInput,
      | "rayCount"
      | "rayBaseWidthPx"
      | "rayLengthJitter"
      | "rayWidthJitter"
      | "rayAngleJitterDeg"
      | "streamUseJag"
      | "streamJagNumber"
      | "streamJagLength"
      | "concentrateStreamFillOpacity"
    >
  >;
}

export const STUDIO_FLASH_SUBTOOL_PRESETS: Readonly<
  Record<StudioFlashVariant, StudioFlashPresetSpec>
> = Object.freeze({
  flash: {
    variant: "flash",
    label: "기본 플래시",
    description: "내부 톱니 별 코어와 촘촘한 방사형 테이퍼 광선으로 대사·아이디어를 강조합니다.",
    defaults: {
      rayCount: 108,
      rayBaseWidthPx: 2.6,
      rayLengthJitter: 0.28,
      rayWidthJitter: 0.25,
      rayAngleJitterDeg: 0.9,
      streamUseJag: true,
      streamJagNumber: 28,
      streamJagLength: 18,
      concentrateStreamFillOpacity: 1,
    },
  },
  "dense-flash": {
    variant: "dense-flash",
    label: "조밀 플래시",
    description: "백색 코어 주위에 매우 빽빽한 광선 고리를 형성해 강렬한 역광 효과를 만듭니다.",
    defaults: {
      rayCount: 200,
      rayBaseWidthPx: 3.1,
      rayLengthJitter: 0.2,
      rayWidthJitter: 0.22,
      rayAngleJitterDeg: 0.55,
      streamUseJag: true,
      streamJagNumber: 44,
      streamJagLength: 22,
      concentrateStreamFillOpacity: 1,
    },
  },
  "sea-urchin": {
    variant: "sea-urchin",
    label: "성게 플래시",
    description: "톱니 없는 매끈한 중심 주변으로 아주 가는 바늘 광선을 방사합니다.",
    defaults: {
      rayCount: 160,
      rayBaseWidthPx: 1.35,
      rayLengthJitter: 0.36,
      rayWidthJitter: 0.18,
      rayAngleJitterDeg: 0.7,
      streamUseJag: false,
      streamJagNumber: 24,
      streamJagLength: 0,
      concentrateStreamFillOpacity: 0.9,
    },
  },
  firework: {
    variant: "firework",
    label: "불꽃 플래시",
    description: "중심 폭발과 주변 위성 방사 군집을 함께 배치해 반짝이는 연출을 만듭니다.",
    defaults: {
      rayCount: 64,
      rayBaseWidthPx: 2.1,
      rayLengthJitter: 0.34,
      rayWidthJitter: 0.26,
      rayAngleJitterDeg: 1.4,
      streamUseJag: true,
      streamJagNumber: 18,
      streamJagLength: 14,
      concentrateStreamFillOpacity: 0.95,
    },
  },
  "flash-pattern": {
    variant: "flash-pattern",
    label: "패턴 플래시",
    description: "긴 주광선과 짧은 보조광선을 규칙적 주기로 교차 배치한 장식 플래시입니다.",
    defaults: {
      rayCount: 96,
      rayBaseWidthPx: 2.8,
      rayLengthJitter: 0.06,
      rayWidthJitter: 0.08,
      rayAngleJitterDeg: 0.15,
      streamUseJag: true,
      streamJagNumber: 24,
      streamJagLength: 24,
      concentrateStreamFillOpacity: 1,
    },
  },
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toFlatPoints(vertices: readonly EffectPoint2D[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < vertices.length; i += 1) {
    out.push(round2(vertices[i]!.x), round2(vertices[i]!.y));
  }
  return out;
}

function toSvgPath(vertices: readonly EffectPoint2D[]): string {
  if (vertices.length === 0) return "";
  const cmds: string[] = [`M ${round2(vertices[0]!.x)} ${round2(vertices[0]!.y)}`];
  for (let i = 1; i < vertices.length; i += 1) {
    cmds.push(`L ${round2(vertices[i]!.x)} ${round2(vertices[i]!.y)}`);
  }
  cmds.push("Z");
  return cmds.join(" ");
}

/** 내부 들쭉날쭉 별(StreamUseJag) 또는 매끈한 타원 코어 폴리곤을 생성한다. */
export function buildFlashCorePolygon(params: {
  readonly center: EffectPoint2D;
  readonly rx: number;
  readonly ry: number;
  readonly streamUseJag: boolean;
  readonly streamJagNumber: number;
  readonly streamJagLength: number;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly rand: () => number;
  readonly jagJitterRatio?: number;
}): StudioFlashCorePolygon {
  const { center, rx, ry, streamUseJag, fillColor } = params;
  const fillOpacity = clamp(params.fillOpacity, 0, 1);

  if (!streamUseJag || params.streamJagLength <= 0) {
    const smoothSteps = 48;
    const vertices: EffectPoint2D[] = [];
    for (let i = 0; i < smoothSteps; i += 1) {
      const theta = (i * 2 * Math.PI) / smoothSteps;
      vertices.push({
        x: center.x + rx * Math.cos(theta),
        y: center.y + ry * Math.sin(theta),
      });
    }
    return {
      vertices,
      points: toFlatPoints(vertices),
      pathData: toSvgPath(vertices),
      fillColor,
      fillOpacity,
      jagEnabled: false,
      jagPeakCount: 0,
    };
  }

  const peakCount = clamp(Math.round(params.streamJagNumber), 6, 180);
  const jagLen = Math.max(1, params.streamJagLength);
  const jitterRatio = clamp(params.jagJitterRatio ?? 0.2, 0, 0.8);
  const totalVerts = peakCount * 2;
  const vertices: EffectPoint2D[] = [];

  for (let i = 0; i < totalVerts; i += 1) {
    const isPeak = i % 2 === 0;
    const theta = (i * 2 * Math.PI) / totalVerts;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const jitter = 1 + (params.rand() - 0.5) * 2 * jitterRatio;
    const extra = isPeak ? jagLen * jitter : 0;
    vertices.push({
      x: center.x + (rx + extra) * ux,
      y: center.y + (ry + extra) * uy,
    });
  }

  return {
    vertices,
    points: toFlatPoints(vertices),
    pathData: toSvgPath(vertices),
    fillColor,
    fillOpacity,
    jagEnabled: true,
    jagPeakCount: peakCount,
  };
}

function buildSingleFlashCluster(params: {
  readonly clusterIndex: number;
  readonly variant: StudioFlashVariant;
  readonly center: EffectPoint2D;
  readonly scale: number;
  readonly rx: number;
  readonly ry: number;
  readonly outerRadius: number;
  readonly rayCount: number;
  readonly rayBaseWidthPx: number;
  readonly rayLengthJitter: number;
  readonly rayWidthJitter: number;
  readonly rayAngleJitterDeg: number;
  readonly streamUseJag: boolean;
  readonly streamJagNumber: number;
  readonly streamJagLength: number;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly rand: () => number;
  readonly rayIndexOffset: number;
}): StudioFlashCluster {
  const { center, scale, rx, ry, outerRadius, variant, rand } = params;
  const scaledRx = Math.max(4, rx * scale);
  const scaledRy = Math.max(4, ry * scale);
  const scaledOuter = Math.max(Math.max(scaledRx, scaledRy) + 12, outerRadius * scale);
  const scaledJagLen = params.streamJagLength * scale;

  const corePolygon = buildFlashCorePolygon({
    center,
    rx: scaledRx,
    ry: scaledRy,
    streamUseJag: params.streamUseJag,
    streamJagNumber: params.streamJagNumber,
    streamJagLength: scaledJagLen,
    fillColor: params.fillColor,
    fillOpacity: params.fillOpacity,
    rand,
    jagJitterRatio: variant === "flash-pattern" ? 0.04 : 0.22,
  });

  const rays: StudioFlashRayPolygon[] = [];
  const count = Math.max(8, Math.round(params.rayCount));

  for (let i = 0; i < count; i += 1) {
    const baseTheta = (i * 2 * Math.PI) / count;
    const angJitter = ((rand() - 0.5) * 2 * params.rayAngleJitterDeg * Math.PI) / 180;
    const theta = baseTheta + angJitter;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);

    // 패턴 플래시는 4주기 리듬(장-단-중-단)으로 길이를 변조한다.
    const patternScale =
      variant === "flash-pattern"
        ? i % 4 === 0
          ? 1.18
          : i % 2 === 0
            ? 0.86
            : 0.62
        : 1;

    const lenFactor = Math.max(
      0.2,
      patternScale * (1 + (rand() - 0.5) * 2 * params.rayLengthJitter),
    );
    const widthFactor = Math.max(
      0.2,
      (variant === "flash-pattern" && i % 4 === 0 ? 1.35 : 1) *
        (1 + (rand() - 0.5) * 2 * params.rayWidthJitter),
    );

    const rimX = scaledRx * ux;
    const rimY = scaledRy * uy;
    const rimR = Math.hypot(rimX, rimY);
    const startR = Math.max(2, rimR + (params.streamUseJag ? scaledJagLen * 0.35 : 0));
    const span = Math.max(10, (scaledOuter - rimR) * lenFactor);
    const endR = startR + span;

    const halfBase = Math.max(0.2, params.rayBaseWidthPx * scale * widthFactor * 0.5);
    const nx = -uy;
    const ny = ux;

    const baseCenter = { x: center.x + ux * startR, y: center.y + uy * startR };
    const tip = { x: center.x + ux * endR, y: center.y + uy * endR };
    // 바깥 끝이 바늘처럼 뾰족하게 수렴하는 3~4정점 테이퍼 사각형(팁 미세 폭 0.12px).
    const tipHalf = Math.min(0.12, halfBase * 0.08);
    const vertices: EffectPoint2D[] = [
      { x: baseCenter.x + nx * halfBase, y: baseCenter.y + ny * halfBase },
      { x: tip.x + nx * tipHalf, y: tip.y + ny * tipHalf },
      { x: tip.x - nx * tipHalf, y: tip.y - ny * tipHalf },
      { x: baseCenter.x - nx * halfBase, y: baseCenter.y - ny * halfBase },
    ];

    rays.push({
      index: params.rayIndexOffset + i,
      vertices,
      points: toFlatPoints(vertices),
      pathData: toSvgPath(vertices),
      angleRad: theta,
      lengthPx: span,
      baseWidthPx: halfBase * 2,
    });
  }

  return {
    clusterIndex: params.clusterIndex,
    center,
    scale,
    corePolygon,
    rays,
  };
}

/** CSP 플래시(vars 519–527) 전체 기하 계획을 생성한다. */
export function planStudioFlashGeometry(input: StudioFlashInput = {}): StudioFlashPlan {
  const variant: StudioFlashVariant = input.variant ?? "flash";
  const preset = STUDIO_FLASH_SUBTOOL_PRESETS[variant];
  const seed = input.seed ?? `flash-${variant}`;
  const rand = createEffectPrng(seed);

  const center: EffectPoint2D = {
    x: input.centerX ?? 400,
    y: input.centerY ?? 300,
  };
  const rx = Math.max(8, input.innerRadiusX ?? 90);
  const ry = Math.max(8, input.innerRadiusY ?? rx);
  const outerRadius = Math.max(Math.max(rx, ry) + 24, input.outerRadius ?? 260);

  const rayCount = clamp(
    Math.round(input.rayCount ?? preset.defaults.rayCount),
    8,
    480,
  );
  const rayBaseWidthPx = clamp(
    input.rayBaseWidthPx ?? preset.defaults.rayBaseWidthPx,
    0.3,
    32,
  );
  const rayLengthJitter = clamp(
    input.rayLengthJitter ?? preset.defaults.rayLengthJitter,
    0,
    0.95,
  );
  const rayWidthJitter = clamp(
    input.rayWidthJitter ?? preset.defaults.rayWidthJitter,
    0,
    0.95,
  );
  const rayAngleJitterDeg = clamp(
    input.rayAngleJitterDeg ?? preset.defaults.rayAngleJitterDeg,
    0,
    30,
  );
  const streamUseJag = input.streamUseJag ?? preset.defaults.streamUseJag;
  const streamJagNumber = clamp(
    Math.round(input.streamJagNumber ?? preset.defaults.streamJagNumber),
    6,
    180,
  );
  const streamJagLength = clamp(
    input.streamJagLength ?? preset.defaults.streamJagLength,
    0,
    240,
  );
  const fillOpacity = clamp(
    input.concentrateStreamFillOpacity ?? preset.defaults.concentrateStreamFillOpacity,
    0,
    1,
  );
  const fillColor = input.fillColor ?? "#ffffff";
  const strokeColor = input.strokeColor ?? "#000000";

  const clusters: StudioFlashCluster[] = [];
  const primary = buildSingleFlashCluster({
    clusterIndex: 0,
    variant,
    center,
    scale: variant === "firework" ? 0.62 : 1,
    rx,
    ry,
    outerRadius,
    rayCount,
    rayBaseWidthPx,
    rayLengthJitter,
    rayWidthJitter,
    rayAngleJitterDeg,
    streamUseJag,
    streamJagNumber,
    streamJagLength,
    fillColor,
    fillOpacity,
    rand,
    rayIndexOffset: 0,
  });
  clusters.push(primary);

  if (variant === "firework") {
    const satCount = clamp(Math.round(input.fireworkSatelliteCount ?? 5), 3, 12);
    let rayOffset = primary.rays.length;
    const ringRadius = outerRadius * 0.72;
    for (let s = 0; s < satCount; s += 1) {
      const orbitAngle = (s * 2 * Math.PI) / satCount + (rand() - 0.5) * 0.35;
      const dist = ringRadius * (0.82 + rand() * 0.32);
      const satScale = 0.3 + rand() * 0.18;
      const satCluster = buildSingleFlashCluster({
        clusterIndex: s + 1,
        variant,
        center: {
          x: center.x + Math.cos(orbitAngle) * dist,
          y: center.y + Math.sin(orbitAngle) * dist,
        },
        scale: satScale,
        rx,
        ry,
        outerRadius,
        rayCount: Math.max(16, Math.round(rayCount * 0.55)),
        rayBaseWidthPx,
        rayLengthJitter,
        rayWidthJitter,
        rayAngleJitterDeg,
        streamUseJag,
        streamJagNumber: Math.max(8, Math.round(streamJagNumber * 0.65)),
        streamJagLength,
        fillColor,
        fillOpacity,
        rand,
        rayIndexOffset: rayOffset,
      });
      rayOffset += satCluster.rays.length;
      clusters.push(satCluster);
    }
  }

  const allRays: StudioFlashRayPolygon[] = [];
  for (const cluster of clusters) {
    allRays.push(...cluster.rays);
  }

  return {
    variant,
    seedHash: hashEffectSeed(seed),
    strokeColor,
    fillColor,
    corePolygon: primary.corePolygon,
    rays: allRays,
    clusters,
  };
}

/** 인스펙터에서 플래시 프리셋을 기존 FocusLinesEl 속성으로 투영할 때 사용한다. */
export function flashVariantToFocusLinesPatch(
  variant: StudioFlashVariant,
): Partial<FocusLinesEl> {
  const spec = STUDIO_FLASH_SUBTOOL_PRESETS[variant];
  return {
    lineCount: Math.min(200, spec.defaults.rayCount),
    strokeWidth: spec.defaults.rayBaseWidthPx,
    innerRadius: variant === "sea-urchin" ? 70 : 95,
    outerRadius: variant === "firework" ? 300 : 260,
    noise: Math.round(spec.defaults.rayLengthJitter * 80),
  };
}
