/**
 * 현수선(Catenary) 옷주름 장력·방사 주름 가이드 솔버 및
 * 깊이·법선·처마 차폐 기반 날씨·젖은 표면 반사 합성기 통합 모듈.
 *
 * - 외부 AI 토큰 0개, 서버 비용 ₩0으로 동작하는 순수 물리·기하 결정론 엔진.
 * - 어깨(`shoulder`), 팔꿈치(`elbow`), 허리(`waist`) 고정 핀과 원단 프리셋(`silk`, `cotton`,
 *   `denim`, `heavy-coat`)으로부터 쌍곡선 코사인 현수선(`y = a cosh((x - x0)/a) + y0`)과
 *   조임점(Pinch Point) 방사형 장력 부채꼴 가이드를 정밀 계산한다.
 */

export {
  composeDepthOccludedWeatherWetness,
  type DepthOccludedWeatherInput,
  type DepthOccludedWeatherResult,
  type OverheadRoofEaveOccluder,
  type OverheadUmbrellaOccluder,
  type OverheadWeatherOccluder,
  type RgbTriplet,
  type WeatherCompositionStats,
  type WeatherPrecipitationMode,
  type WeatherVec3,
} from "./depth-weather-wetness-composer";

export type FabricMaterialPreset = "silk" | "cotton" | "denim" | "heavy-coat";
export type ClothAnchorRole = "shoulder" | "elbow" | "waist" | "wrist" | "hem" | "collar";
export type CatenaryYAxisDirection = "up" | "down";

export interface ClothPoint2D { readonly x: number; readonly y: number }
export interface ClothVec3 { readonly x: number; readonly y: number; readonly z: number }

export interface FabricPhysicalProfile {
  readonly preset: FabricMaterialPreset;
  readonly labelKo: string;
  /** 단위 면적당 중량(g/m^2). */
  readonly arealDensityGsm: number;
  /** 굽힘 강성(mN·mm). 값이 클수록 잔주름이 줄고 완만한 큰 주름이 형성된다. */
  readonly bendingStiffnessMnMm: number;
  /** 두 고정점 직선 현 길이 대비 기본 원단 여유 비율(`L / chord > 1`). */
  readonly defaultSlackRatio: number;
  /** 조임점에서 뻗어 나가는 기본 방사 장력선 개수. */
  readonly radialFanCount: number;
  /** 주름 능선의 날카로움(`0..1`). */
  readonly foldCreaseSharpness: number;
}

export const FABRIC_MATERIAL_PRESETS: Readonly<Record<FabricMaterialPreset, FabricPhysicalProfile>> =
  Object.freeze({
    silk: Object.freeze({
      preset: "silk",
      labelKo: "실크·쉬폰",
      arealDensityGsm: 65,
      bendingStiffnessMnMm: 0.18,
      defaultSlackRatio: 1.18,
      radialFanCount: 7,
      foldCreaseSharpness: 0.36,
    }),
    cotton: Object.freeze({
      preset: "cotton",
      labelKo: "면·옥스포드 셔츠",
      arealDensityGsm: 145,
      bendingStiffnessMnMm: 1.15,
      defaultSlackRatio: 1.11,
      radialFanCount: 5,
      foldCreaseSharpness: 0.58,
    }),
    denim: Object.freeze({
      preset: "denim",
      labelKo: "생지·워싱 데님",
      arealDensityGsm: 380,
      bendingStiffnessMnMm: 6.4,
      defaultSlackRatio: 1.06,
      radialFanCount: 4,
      foldCreaseSharpness: 0.84,
    }),
    "heavy-coat": Object.freeze({
      preset: "heavy-coat",
      labelKo: "헤비 울 코트",
      arealDensityGsm: 560,
      bendingStiffnessMnMm: 14.5,
      defaultSlackRatio: 1.035,
      radialFanCount: 3,
      foldCreaseSharpness: 0.44,
    }),
  });

export interface ClothAnchorPin {
  readonly id: string;
  readonly role: ClothAnchorRole;
  readonly position: ClothPoint2D;
  /** 팔꿈치 접힘·허리 묶음처럼 방사 장력 주름이 모이는 조임점 여부. 미지정 시 역할에 따라 자동 판정한다. */
  readonly isPinchPoint?: boolean;
  /** 조임 강도(`0..1`, 기본값 `0.75`). */
  readonly pinchIntensity?: number;
}

export interface ClothSpanSpec {
  readonly fromAnchorId: string;
  readonly toAnchorId: string;
  readonly slackRatio?: number;
  readonly tierCount?: number;
}

export interface CatenaryClothSolverInput {
  readonly anchors: readonly ClothAnchorPin[];
  readonly fabricPreset: FabricMaterialPreset;
  readonly spans?: readonly ClothSpanSpec[];
  /** 기본값 `"up"`(`y = a cosh((x - x0)/a) + y0` 표준 좌표계). 화면 하단 `+y` 캔버스는 `"down"`. */
  readonly yAxisDirection?: CatenaryYAxisDirection;
  readonly sampleCount?: number;
  readonly gravityMps2?: number;
  readonly metersPerUnit?: number;
}

export interface SolvedCatenaryDrapeCurve {
  readonly spanId: string;
  readonly fromAnchorId: string;
  readonly toAnchorId: string;
  readonly tierIndex: number;
  readonly catenaryA: number;
  readonly x0: number;
  readonly y0: number;
  readonly yAxisDirection: CatenaryYAxisDirection;
  readonly chordLength: number;
  readonly targetArcLength: number;
  readonly solvedArcLength: number;
  readonly lowestSagPoint: ClothPoint2D;
  readonly sagDepth: number;
  readonly horizontalTensionNpm: number;
  readonly maxAnchorTensionNpm: number;
  readonly isNearVerticalFallback: boolean;
  readonly sampledPoints: readonly ClothPoint2D[];
}

export interface RadialTensionFanLine {
  readonly fanId: string;
  readonly pinchAnchorId: string;
  readonly pinchRole: ClothAnchorRole;
  readonly rayIndex: number;
  readonly start: ClothPoint2D;
  readonly control: ClothPoint2D;
  readonly end: ClothPoint2D;
  readonly angleRad: number;
  readonly normalizedTension: number;
  readonly creaseSharpness: number;
  readonly suggestedStrokeWidthPx: number;
  readonly sampledPoints: readonly ClothPoint2D[];
}

export interface CatenaryClothGuideReport {
  readonly fabricProfile: FabricPhysicalProfile;
  readonly yAxisDirection: CatenaryYAxisDirection;
  readonly catenaryCurves: readonly SolvedCatenaryDrapeCurve[];
  readonly radialTensionFans: readonly RadialTensionFanLine[];
  readonly aiTokensUsed: 0;
  readonly serverCostKrw: 0;
}

const EPS = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 초월방정식 `sinh(z) / z = ratio` (`ratio > 1`, `z > 0`)를 단조 브래킷 보장 뉴턴-랩슨법으로 푼다.
 */
function solveSinhOverZ(ratio: number): number {
  if (ratio <= 1 + 1e-11) return 1e-5;

  let z: number;
  if (ratio < 2.8) {
    const u = 6 * (ratio - 1);
    z = Math.sqrt(u) * (1 - u / 120);
  } else {
    const ln2r = Math.log(2 * ratio);
    z = ln2r + Math.log(Math.max(1, ln2r));
  }

  let low = 1e-8;
  let high = Math.max(z * 2 + 1, 2);
  while (Math.sinh(high) / high < ratio && high < 64) {
    high *= 1.8;
  }

  z = clamp(z, low, high);
  for (let iter = 0; iter < 28; iter += 1) {
    const sh = Math.sinh(z);
    const ch = Math.cosh(z);
    const f = sh / z - ratio;
    if (Math.abs(f) <= 1e-13 * ratio) break;
    if (f < 0) low = z;
    else high = z;

    const df = (z * ch - sh) / (z * z);
    const candidate = df > 1e-14 ? z - f / df : 0.5 * (low + high);
    z = candidate > low && candidate < high && Number.isFinite(candidate) ? candidate : 0.5 * (low + high);
  }
  return z;
}

/**
 * 풀린 현수선 곡선 파라미터로부터 임의의 수평 위치 `x`에서의 정확한 현수선 `y` 좌표를 계산한다.
 */
export function evaluateCatenaryCurveY(curve: SolvedCatenaryDrapeCurve, x: number): number {
  const yUp = curve.catenaryA * Math.cosh((x - curve.x0) / curve.catenaryA) + curve.y0;
  return curve.yAxisDirection === "up" ? yUp : -yUp;
}

function buildAutoSpans(anchors: readonly ClothAnchorPin[]): readonly ClothSpanSpec[] {
  if (anchors.length < 2) return [];
  const spans: ClothSpanSpec[] = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (a && b) spans.push({ fromAnchorId: a.id, toAnchorId: b.id, tierCount: 2 });
  }
  const shoulder = anchors.find((item) => item.role === "shoulder");
  const waist = anchors.find((item) => item.role === "waist");
  if (
    shoulder
    && waist
    && !spans.some(
      (s) =>
        (s.fromAnchorId === shoulder.id && s.toAnchorId === waist.id)
        || (s.fromAnchorId === waist.id && s.toAnchorId === shoulder.id),
    )
  ) {
    spans.push({ fromAnchorId: shoulder.id, toAnchorId: waist.id, tierCount: 1 });
  }
  return spans;
}

function solveSingleCatenarySpan(params: {
  readonly spanId: string;
  readonly fromAnchor: ClothAnchorPin;
  readonly toAnchor: ClothAnchorPin;
  readonly tierIndex: number;
  readonly slackRatio: number;
  readonly profile: FabricPhysicalProfile;
  readonly yAxisDirection: CatenaryYAxisDirection;
  readonly sampleCount: number;
  readonly gravityMps2: number;
  readonly metersPerUnit: number;
}): SolvedCatenaryDrapeCurve {
  const {
    spanId,
    fromAnchor,
    toAnchor,
    tierIndex,
    slackRatio,
    profile,
    yAxisDirection,
    sampleCount,
    gravityMps2,
    metersPerUnit,
  } = params;

  const pA: ClothPoint2D = {
    x: fromAnchor.position.x,
    y: yAxisDirection === "up" ? fromAnchor.position.y : -fromAnchor.position.y,
  };
  const pB: ClothPoint2D = {
    x: toAnchor.position.x,
    y: yAxisDirection === "up" ? toAnchor.position.y : -toAnchor.position.y,
  };

  const rawDx = pB.x - pA.x;
  const rawDy = pB.y - pA.y;
  const chordLength = Math.hypot(rawDx, rawDy);
  const stiffnessSlackDamping = 1 / (1 + 0.012 * profile.bendingStiffnessMnMm);
  const excessSlack = Math.max(0.004, (slackRatio - 1) * stiffnessSlackDamping * (1 + tierIndex * 0.28));
  const targetArcLength = Math.max(chordLength * (1 + excessSlack), chordLength + 1e-3);

  const absDx = Math.abs(rawDx);
  const isNearVertical = absDx < Math.max(1e-3, chordLength * 0.02);
  const leftPt = rawDx >= 0 ? pA : pB;
  const rightPt = rawDx >= 0 ? pB : pA;
  const effectiveDx = isNearVertical ? Math.max(absDx, Math.max(0.5, chordLength * 0.04)) : absDx;
  const rightX = isNearVertical ? leftPt.x + effectiveDx : rightPt.x;
  const dy = rightPt.y - leftPt.y;

  const safeArcLength = Math.max(targetArcLength, Math.hypot(effectiveDx, dy) * 1.002);
  const horizontalArcTerm = Math.sqrt(Math.max(1e-12, safeArcLength * safeArcLength - dy * dy));
  const ratio = Math.max(1.000001, horizontalArcTerm / effectiveDx);
  const z = solveSinhOverZ(ratio);
  const catenaryA = effectiveDx / (2 * z);

  const tanhArg = clamp(dy / safeArcLength, -0.9999999, 0.9999999);
  const artanhVal = 0.5 * Math.log((1 + tanhArg) / (1 - tanhArg));
  const x0 = 0.5 * (leftPt.x + rightX) - catenaryA * artanhVal;
  const y0 = leftPt.y - catenaryA * Math.cosh((leftPt.x - x0) / catenaryA);

  const solvedArcLength =
    catenaryA * (Math.sinh((rightX - x0) / catenaryA) - Math.sinh((leftPt.x - x0) / catenaryA));

  const samples: ClothPoint2D[] = [];
  let minUpY = Number.POSITIVE_INFINITY;
  let minUpX = leftPt.x;

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / (sampleCount - 1);
    const xSample = lerp(pA.x, pB.x, t);
    const evalX = isNearVertical ? lerp(leftPt.x, rightX, rawDx >= 0 ? t : 1 - t) : xSample;
    const yUp = catenaryA * Math.cosh((evalX - x0) / catenaryA) + y0;
    if (yUp < minUpY) {
      minUpY = yUp;
      minUpX = xSample;
    }
    samples.push({ x: xSample, y: yAxisDirection === "up" ? yUp : -yUp });
  }

  if (!isNearVertical && x0 >= leftPt.x && x0 <= rightX) {
    const vertexYUp = catenaryA + y0;
    if (vertexYUp < minUpY) {
      minUpY = vertexYUp;
      minUpX = x0;
    }
  }

  const lowestSagPoint: ClothPoint2D = {
    x: minUpX,
    y: yAxisDirection === "up" ? minUpY : -minUpY,
  };
  const sagDepth = Math.max(0, Math.min(pA.y, pB.y) - minUpY);

  const linearWeightNpm2 = profile.arealDensityGsm * 0.001 * gravityMps2;
  const horizontalTensionNpm = linearWeightNpm2 * (catenaryA * metersPerUnit);
  const maxCosh = Math.max(
    Math.cosh((leftPt.x - x0) / catenaryA),
    Math.cosh((rightX - x0) / catenaryA),
  );

  return {
    spanId,
    fromAnchorId: fromAnchor.id,
    toAnchorId: toAnchor.id,
    tierIndex,
    catenaryA,
    x0,
    y0,
    yAxisDirection,
    chordLength,
    targetArcLength: safeArcLength,
    solvedArcLength,
    lowestSagPoint,
    sagDepth,
    horizontalTensionNpm,
    maxAnchorTensionNpm: horizontalTensionNpm * maxCosh,
    isNearVerticalFallback: isNearVertical,
    sampledPoints: samples,
  };
}

function sampleQuadraticBezier(
  p0: ClothPoint2D,
  control: ClothPoint2D,
  p2: ClothPoint2D,
  count: number,
): readonly ClothPoint2D[] {
  const out: ClothPoint2D[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const inv = 1 - t;
    out.push({
      x: inv * inv * p0.x + 2 * inv * t * control.x + t * t * p2.x,
      y: inv * inv * p0.y + 2 * inv * t * control.y + t * t * p2.y,
    });
  }
  return out;
}

/**
 * 고정 핀과 원단 프리셋으로부터 쌍곡선 코사인 현수선 주름 곡선과 조임점 방사형 장력선 가이드를 계산한다.
 */
export function solveCatenaryClothFoldGuides(
  input: CatenaryClothSolverInput,
): CatenaryClothGuideReport {
  const profile = FABRIC_MATERIAL_PRESETS[input.fabricPreset];
  const yAxisDirection: CatenaryYAxisDirection = input.yAxisDirection ?? "up";
  const sampleCount = Math.max(5, Math.floor(input.sampleCount ?? 33));
  const gravityMps2 = input.gravityMps2 ?? 9.80665;
  const metersPerUnit = input.metersPerUnit ?? 0.0025;

  const anchorMap = new Map<string, ClothAnchorPin>();
  for (const anchor of input.anchors) anchorMap.set(anchor.id, anchor);

  const activeSpans = input.spans && input.spans.length > 0 ? input.spans : buildAutoSpans(input.anchors);
  const catenaryCurves: SolvedCatenaryDrapeCurve[] = [];
  const neighborVectors = new Map<string, ClothPoint2D[]>();

  for (const spec of activeSpans) {
    const fromAnchor = anchorMap.get(spec.fromAnchorId);
    const toAnchor = anchorMap.get(spec.toAnchorId);
    if (!fromAnchor || !toAnchor) continue;

    const dx = toAnchor.position.x - fromAnchor.position.x;
    const dy = toAnchor.position.y - fromAnchor.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist > EPS) {
      const fromList = neighborVectors.get(fromAnchor.id) ?? [];
      fromList.push({ x: dx, y: dy });
      neighborVectors.set(fromAnchor.id, fromList);

      const toList = neighborVectors.get(toAnchor.id) ?? [];
      toList.push({ x: -dx, y: -dy });
      neighborVectors.set(toAnchor.id, toList);
    }

    const tierCount = clamp(Math.floor(spec.tierCount ?? 1), 1, 5);
    const baseSlack = Math.max(1.002, spec.slackRatio ?? profile.defaultSlackRatio);
    for (let tier = 0; tier < tierCount; tier += 1) {
      catenaryCurves.push(
        solveSingleCatenarySpan({
          spanId: `${fromAnchor.id}->${toAnchor.id}#${tier}`,
          fromAnchor,
          toAnchor,
          tierIndex: tier,
          slackRatio: baseSlack,
          profile,
          yAxisDirection,
          sampleCount,
          gravityMps2,
          metersPerUnit,
        }),
      );
    }
  }

  const radialTensionFans: RadialTensionFanLine[] = [];
  const gravitySignY = yAxisDirection === "up" ? -1 : 1;

  for (const anchor of input.anchors) {
    const isPinch = anchor.isPinchPoint ?? (anchor.role === "elbow" || anchor.role === "waist");
    if (!isPinch) continue;

    const vectors = neighborVectors.get(anchor.id) ?? [];
    let dirX = 0;
    let dirY = 0;
    let avgNeighborLength = 64;
    if (vectors.length > 0) {
      let sumLen = 0;
      for (const vec of vectors) {
        const len = Math.hypot(vec.x, vec.y);
        if (len > EPS) {
          dirX += vec.x / len;
          dirY += vec.y / len;
          sumLen += len;
        }
      }
      avgNeighborLength = sumLen / vectors.length;
    }

    const dirNorm = Math.hypot(dirX, dirY);
    const baseAngle =
      dirNorm > 1e-4 ? Math.atan2(dirY / dirNorm, dirX / dirNorm) : Math.atan2(gravitySignY, 0.25);

    const intensity = clamp(anchor.pinchIntensity ?? 0.75, 0.1, 1);
    const rayCount = profile.radialFanCount;
    const totalSpreadRad =
      lerp(0.52, 1.18, 1 - profile.foldCreaseSharpness) * (0.75 + 0.35 * intensity);
    const baseRayLen = avgNeighborLength * lerp(0.32, 0.56, intensity);

    for (let r = 0; r < rayCount; r += 1) {
      const normalizedOffset = rayCount === 1 ? 0 : (r / (rayCount - 1)) * 2 - 1;
      const angleOffset = normalizedOffset * 0.5 * totalSpreadRad;
      const rayAngle = baseAngle + angleOffset;
      const lobeWeight = Math.pow(Math.max(0.2, Math.cos(angleOffset)), 1.35);
      const rayLength = baseRayLen * lobeWeight;
      const startInset = Math.min(4, rayLength * 0.08);

      const start: ClothPoint2D = {
        x: anchor.position.x + Math.cos(rayAngle) * startInset,
        y: anchor.position.y + Math.sin(rayAngle) * startInset,
      };
      const gravityDroop = rayLength * lerp(0.18, 0.05, profile.foldCreaseSharpness);
      const end: ClothPoint2D = {
        x: anchor.position.x + Math.cos(rayAngle) * rayLength,
        y: anchor.position.y + Math.sin(rayAngle) * rayLength + gravitySignY * gravityDroop,
      };
      const control: ClothPoint2D = {
        x: lerp(start.x, end.x, 0.52),
        y: lerp(start.y, end.y, 0.52) + gravitySignY * gravityDroop * 0.35,
      };
      const normalizedTension = clamp(intensity * lobeWeight, 0.08, 1);

      radialTensionFans.push({
        fanId: `${anchor.id}:fan:${r}`,
        pinchAnchorId: anchor.id,
        pinchRole: anchor.role,
        rayIndex: r,
        start,
        control,
        end,
        angleRad: rayAngle,
        normalizedTension,
        creaseSharpness: profile.foldCreaseSharpness,
        suggestedStrokeWidthPx: lerp(0.85, 2.8, normalizedTension * profile.foldCreaseSharpness),
        sampledPoints: sampleQuadraticBezier(start, control, end, 11),
      });
    }
  }

  return {
    fabricProfile: profile,
    yAxisDirection,
    catenaryCurves,
    radialTensionFans,
    aiTokensUsed: 0,
    serverCostKrw: 0,
  };
}
