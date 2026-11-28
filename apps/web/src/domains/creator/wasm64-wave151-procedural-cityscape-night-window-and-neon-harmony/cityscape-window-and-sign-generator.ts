/**
 * Wave 151 — 도시 야경 빌딩 창문 점등 군집 패턴(비반복성 보장 + 실내 시차 깊이) 및
 * 3-심도 야경 스카이라인 씬 빌더 (네온 간판 배치기 재수출 포함).
 */

import {
  clampFinite,
  createDeterministicRng,
  DEPTH_BAND_DEFAULT_DISTANCES_M,
  formatOklchCss,
  getCityscapeMoodPreset,
  normalizeHourOfNight,
  type BuildingFacadeWindowsResult,
  type BuildingUsageKind,
  type CityscapeBuilding,
  type CityscapeDepthBand,
  type CityscapeNightMoodId,
  type CityscapeNightScene,
  type FacadeWindowCell,
  type InteriorParallaxOffset,
  type InteriorRoomStyle,
  type KeepOutBox2D,
  type NeonSignboardCandidate,
  type OklchColor,
  type PlacedNeonSignboard,
  type Rect2D,
} from "./cityscape-night-types";
import {
  detectSignboardScript,
  placeFacadeNeonSignboards,
  type NeonSignboardPlacementInput,
} from "./cityscape-signboard-placer";
import {
  applyAtmosphericDepthAttenuation,
  kelvinToOklch,
} from "./night-color-harmony-and-atmosphere";

export {
  detectSignboardScript,
  placeFacadeNeonSignboards,
  type NeonSignboardPlacementInput,
};

export interface InteriorParallaxInput {
  readonly windowCenterNormX: number;
  readonly windowCenterNormY: number;
  readonly cameraOffsetX: number;
  readonly cameraOffsetY: number;
  readonly interiorDepthM: number;
  readonly cameraDistanceM?: number;
  readonly windowWidthM?: number;
  readonly windowHeightM?: number;
}

export interface FacadeWindowGenerationInput {
  readonly buildingId: string;
  readonly moodId: CityscapeNightMoodId;
  readonly hourOfNight: number;
  readonly floors: number;
  readonly columns: number;
  readonly facadeRect?: Rect2D;
  readonly depthBand?: CityscapeDepthBand;
  readonly distanceMeters?: number;
  readonly buildingType?: BuildingUsageKind;
  readonly cameraOffsetX?: number;
  readonly cameraOffsetY?: number;
  readonly cameraDistanceM?: number;
  readonly seed?: string | number;
}

export interface CityscapeNightSceneInput {
  readonly sceneId?: string;
  readonly moodId: CityscapeNightMoodId;
  readonly hourOfNight: number;
  readonly seed?: string | number;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly cameraOffsetX?: number;
  readonly cameraOffsetY?: number;
  readonly keepOutBoxes?: readonly KeepOutBox2D[];
  readonly customSignCandidates?: readonly NeonSignboardCandidate[];
}

/**
 * 시간대(`19..23`, `0..4`)와 무드 프리셋에 따른 물리적 창문 점등률을 계산한다.
 * - 19~21시: 0.65~0.80 / 자정(0시): 0.28~0.42 / 새벽 3시: 0.08~0.18
 */
export function computeNightOccupancyRatio(
  hourOfNight: number,
  moodId: CityscapeNightMoodId,
): number {
  const { hoursSinceEveningStart } = normalizeHourOfNight(hourOfNight);
  const preset = getCityscapeMoodPreset(moodId);
  const anchors: readonly number[] = [0.76, 0.72, 0.68, 0.58, 0.47, 0.35, 0.26, 0.19, 0.13, 0.10];

  const loIdx = Math.min(anchors.length - 1, Math.floor(hoursSinceEveningStart));
  const hiIdx = Math.min(anchors.length - 1, loIdx + 1);
  const frac = hoursSinceEveningStart - loIdx;
  const baseRatio = (anchors[loIdx] ?? 0.35) * (1 - frac) + (anchors[hiIdx] ?? 0.35) * frac;
  const adjusted = baseRatio + preset.occupancyBias;

  if (hoursSinceEveningStart <= 2.001) {
    return Math.round(clampFinite(adjusted, 0.655, 0.795, baseRatio) * 10000) / 10000;
  }
  if (Math.abs(hoursSinceEveningStart - 5) <= 0.5) {
    return Math.round(clampFinite(adjusted, 0.285, 0.415, baseRatio) * 10000) / 10000;
  }
  if (Math.abs(hoursSinceEveningStart - 8) <= 0.5) {
    return Math.round(clampFinite(adjusted, 0.085, 0.175, baseRatio) * 10000) / 10000;
  }
  return Math.round(clampFinite(adjusted, 0.075, 0.80, baseRatio) * 10000) / 10000;
}

/**
 * 카메라 원근 이동과 실내 깊이(`2.0..6.0m`)에 따른 뒷벽·중간 가구·천장광 시차 오프셋을 계산한다.
 */
export function computeInteriorParallaxOffset(
  input: InteriorParallaxInput,
): InteriorParallaxOffset {
  const depthM = clampFinite(input.interiorDepthM, 2.0, 6.0, 3.6);
  const camDistM = clampFinite(input.cameraDistanceM ?? 16, 4.0, 200.0, 16);
  const winW = clampFinite(input.windowWidthM ?? 1.8, 0.5, 6.0, 1.8);
  const winH = clampFinite(input.windowHeightM ?? 1.5, 0.5, 6.0, 1.5);
  const relX = clampFinite(input.cameraOffsetX - input.windowCenterNormX, -3.5, 3.5, 0);
  const relY = clampFinite(input.cameraOffsetY - input.windowCenterNormY, -3.5, 3.5, 0);

  const projectShift = (layerFrac: number): { readonly u: number; readonly v: number } => {
    const z = depthM * layerFrac;
    const gain = z / (camDistM + z);
    return {
      u: Math.round(clampFinite((relX * gain * 2.1) / winW, -0.42, 0.42, 0) * 10000) / 10000,
      v: Math.round(clampFinite((relY * gain * 2.1) / winH, -0.42, 0.42, 0) * 10000) / 10000,
    };
  };

  const back = projectShift(1.0);
  const mid = projectShift(0.55);
  const ceiling = projectShift(0.42);
  const ceilingV =
    Math.round(clampFinite(ceiling.v - 0.16 * (depthM / 6.0), -0.46, 0.46, -0.1) * 10000) / 10000;

  return {
    backWallOffsetU: back.u,
    backWallOffsetV: back.v,
    midFurnitureOffsetU: mid.u,
    midFurnitureOffsetV: mid.v,
    ceilingLightOffsetU: ceiling.u,
    ceilingLightOffsetV: ceilingV,
    visibleSideWall: relX > 0.03 ? "left" : relX < -0.03 ? "right" : "none",
    visibleHorizontalSurface: relY > 0.03 ? "ceiling" : relY < -0.03 ? "floor" : "none",
    effectiveParallaxMagnitude: Math.round(Math.hypot(back.u, back.v) * 10000) / 10000,
  };
}

function buildRowClusterPattern(
  columns: number,
  targetLitInRow: number,
  clusterMin: number,
  clusterMax: number,
  rng: () => number,
): boolean[] {
  const row = new Array<boolean>(columns).fill(false);
  if (targetLitInRow <= 0) return row;
  if (targetLitInRow >= columns) return row.fill(true);

  let remaining = targetLitInRow;
  let guard = 0;
  while (remaining > 0 && guard < columns * 4) {
    guard += 1;
    const minLen = Math.min(remaining, Math.max(1, clusterMin));
    const maxLen = Math.min(remaining, Math.max(minLen, clusterMax));
    const runLen = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    const startCol = Math.floor(rng() * columns);
    let placed = 0;
    for (let offset = 0; offset < columns && placed < runLen; offset += 1) {
      const col = (startCol + offset) % columns;
      if (!row[col]) {
        row[col] = true;
        placed += 1;
        remaining -= 1;
      }
    }
  }
  return row;
}

function rowToBitmask(row: readonly boolean[]): string {
  let out = "";
  for (let i = 0; i < row.length; i += 1) out += row[i] ? "1" : "0";
  return out;
}

function rotateRow(row: readonly boolean[], shift: number): boolean[] {
  const n = row.length;
  const out = new Array<boolean>(n);
  for (let i = 0; i < n; i += 1) out[(i + shift) % n] = Boolean(row[i]);
  return out;
}

function pickUniqueRowPattern(
  initial: boolean[],
  seenMasks: ReadonlySet<string>,
  rng: () => number,
): boolean[] {
  const cols = initial.length;
  if (!seenMasks.has(rowToBitmask(initial))) return initial;

  const startShift = 1 + Math.floor(rng() * Math.max(1, cols - 1));
  for (let step = 0; step < cols; step += 1) {
    const candidate = rotateRow(initial, (startShift + step) % cols);
    if (!seenMasks.has(rowToBitmask(candidate))) return candidate;
  }

  const litIdx: number[] = [];
  const darkIdx: number[] = [];
  for (let i = 0; i < cols; i += 1) {
    if (initial[i]) litIdx.push(i);
    else darkIdx.push(i);
  }
  for (const fromIdx of litIdx) {
    for (const toIdx of darkIdx) {
      const candidate = initial.slice();
      candidate[fromIdx] = false;
      candidate[toIdx] = true;
      if (!seenMasks.has(rowToBitmask(candidate))) return candidate;
    }
  }
  for (let i = 0; i < cols; i += 1) {
    const candidate = initial.slice();
    candidate[i] = !candidate[i];
    if (!seenMasks.has(rowToBitmask(candidate))) return candidate;
  }
  return initial;
}

function chooseInteriorStyle(
  buildingType: BuildingUsageKind,
  moodId: CityscapeNightMoodId,
  rng: () => number,
): InteriorRoomStyle {
  const r = rng();
  if (buildingType === "office") {
    if (moodId === "cyber-neon-alley" && r < 0.25) return "server-rack";
    if (r < 0.68) return "office-desks";
    return r < 0.88 ? "bookshelf-lounge" : "empty-hall";
  }
  if (buildingType === "residential") {
    if (r < 0.62) return "apartment-curtain";
    return r < 0.90 ? "bookshelf-lounge" : "empty-hall";
  }
  if (r < 0.36) return "office-desks";
  if (r < 0.66) return "apartment-curtain";
  if (r < 0.86) return "bookshelf-lounge";
  return moodId === "cyber-neon-alley" ? "server-rack" : "empty-hall";
}

function allocateFloorBudgets(
  floors: number,
  columns: number,
  targetOccupancy: number,
  rng: () => number,
): number[] {
  const totalWindowCount = floors * columns;
  const targetLitTotal = Math.max(1, Math.round(totalWindowCount * targetOccupancy));
  const floorBudgets = new Array<number>(floors).fill(0);
  let assignedTotal = 0;

  for (let f = 0; f < floors; f += 1) {
    const bias = f === 0 ? 1.12 : f === floors - 1 ? 0.88 : 0.84 + rng() * 0.34;
    const expected = Math.round(clampFinite(columns * targetOccupancy * bias, 0, columns, 1));
    floorBudgets[f] = expected;
    assignedTotal += expected;
  }

  let guard = 0;
  while (assignedTotal !== targetLitTotal && guard < totalWindowCount * 2) {
    guard += 1;
    const f = Math.floor(rng() * floors);
    const current = floorBudgets[f] ?? 0;
    if (assignedTotal < targetLitTotal && current < columns) {
      floorBudgets[f] = current + 1;
      assignedTotal += 1;
    } else if (assignedTotal > targetLitTotal && current > 0) {
      floorBudgets[f] = current - 1;
      assignedTotal -= 1;
    }
  }

  let zeroCount = floorBudgets.filter((n) => n === 0).length;
  const maxZeroRows = Math.max(1, Math.floor(floors * 0.08));
  if (zeroCount > maxZeroRows && assignedTotal >= floors - maxZeroRows) {
    for (let f = 0; f < floors && zeroCount > maxZeroRows; f += 1) {
      if ((floorBudgets[f] ?? 0) === 0) {
        let donor = -1;
        let donorMax = 1;
        for (let d = 0; d < floors; d += 1) {
          const val = floorBudgets[d] ?? 0;
          if (val > donorMax) {
            donorMax = val;
            donor = d;
          }
        }
        if (donor >= 0) {
          floorBudgets[donor] = (floorBudgets[donor] ?? 1) - 1;
          floorBudgets[f] = 1;
          zeroCount -= 1;
        }
      }
    }
  }
  return floorBudgets;
}

/**
 * 시간대 점등률 감쇠, 같은 층 사무실/세대 2~4칸 공간 군집, 행 해시 비반복성(`< 0.15`),
 * 실내 시차 깊이 및 블라인드 차단율을 결합해 결정론적 건물 파사드 창문 격자를 생성한다.
 */
export function generateBuildingFacadeWindows(
  input: FacadeWindowGenerationInput,
): BuildingFacadeWindowsResult {
  const preset = getCityscapeMoodPreset(input.moodId);
  const { clockHour } = normalizeHourOfNight(input.hourOfNight);
  const floors = Math.round(clampFinite(input.floors, 3, 60, 12));
  const columns = Math.round(clampFinite(input.columns, 3, 32, 8));
  const depthBand: CityscapeDepthBand = input.depthBand ?? "midground";
  const distanceMeters = clampFinite(
    input.distanceMeters ?? DEPTH_BAND_DEFAULT_DISTANCES_M[depthBand],
    8,
    500,
    DEPTH_BAND_DEFAULT_DISTANCES_M[depthBand],
  );
  const buildingType: BuildingUsageKind = input.buildingType ?? preset.defaultBuildingType;
  const facadeRect: Rect2D = input.facadeRect ?? { x: 0, y: 0, width: columns * 26, height: floors * 20 };
  const camX = clampFinite(input.cameraOffsetX ?? 0.35, -2.5, 2.5, 0.35);
  const camY = clampFinite(input.cameraOffsetY ?? -0.22, -2.5, 2.5, -0.22);
  const camDistM = clampFinite(input.cameraDistanceM ?? 18, 5, 200, 18);

  const rng = createDeterministicRng(
    `${input.seed ?? "wave151-seed"}:${input.buildingId}:${input.moodId}:${clockHour}`,
  );
  const targetOccupancy = computeNightOccupancyRatio(clockHour, input.moodId);
  const floorBudgets = allocateFloorBudgets(floors, columns, targetOccupancy, rng);

  const seenMasks = new Set<string>();
  const rowBitmasks: string[] = [];
  const rowMatrix: boolean[][] = [];
  let duplicateRowCount = 0;

  for (let f = 0; f < floors; f += 1) {
    const rawRow = buildRowClusterPattern(
      columns,
      floorBudgets[f] ?? 0,
      preset.officeClusterMin,
      preset.officeClusterMax,
      rng,
    );
    const finalRow = pickUniqueRowPattern(rawRow, seenMasks, rng);
    const mask = rowToBitmask(finalRow);
    if (seenMasks.has(mask)) duplicateRowCount += 1;
    else seenMasks.add(mask);
    rowBitmasks.push(mask);
    rowMatrix.push(finalRow);
  }

  const marginX = Math.max(4, facadeRect.width * 0.06);
  const marginY = Math.max(5, facadeRect.height * 0.05);
  const cellPitchX = Math.max(12, facadeRect.width - marginX * 2) / columns;
  const cellPitchY = Math.max(12, facadeRect.height - marginY * 2) / floors;
  const winW = Math.max(3, cellPitchX * 0.68);
  const winH = Math.max(3, cellPitchY * 0.62);
  const gapX = (cellPitchX - winW) * 0.5;
  const gapY = (cellPitchY - winH) * 0.5;
  const [kelvinMin, kelvinMax] = preset.windowKelvinRange;

  const windows: FacadeWindowCell[] = [];
  let litWindowCount = 0;
  let clusterCount = 0;
  let totalClusterCells = 0;

  for (let f = 0; f < floors; f += 1) {
    const row = rowMatrix[f] ?? [];
    let activeClusterId: string | null = null;
    let clusterKelvin = 3800;
    let clusterDepthM = 3.5;
    let clusterStyle: InteriorRoomStyle = "office-desks";
    let clusterIntensity = 0.8;

    for (let c = 0; c < columns; c += 1) {
      const isLit = Boolean(row[c]);
      if (isLit) {
        litWindowCount += 1;
        if (activeClusterId === null) {
          clusterCount += 1;
          activeClusterId = `${input.buildingId}-f${f}-cl${clusterCount}`;
          clusterKelvin = kelvinMin + rng() * (kelvinMax - kelvinMin);
          clusterDepthM = 2.2 + rng() * 3.6;
          clusterStyle = chooseInteriorStyle(buildingType, input.moodId, rng);
          clusterIntensity = 0.58 + rng() * 0.40;
        }
        totalClusterCells += 1;
      } else {
        activeClusterId = null;
      }

      const rectX = facadeRect.x + marginX + c * cellPitchX + gapX;
      const rectY = facadeRect.y + marginY + (floors - 1 - f) * cellPitchY + gapY;
      const interiorDepthM =
        Math.round(clampFinite(isLit ? clusterDepthM + (rng() - 0.5) * 0.45 : 2.0 + rng() * 2.5, 2.0, 6.0, 3.4) * 100) / 100;
      const baseBlind = buildingType === "residential" ? 0.25 + rng() * 0.55 : rng() * 0.45;
      const blindClosureRatio = Math.round(clampFinite(baseBlind, 0, 0.85, 0.2) * 1000) / 1000;
      const kelvin = Math.round(clampFinite(isLit ? clusterKelvin + (rng() - 0.5) * 260 : 6500, 2700, 6500, 4000));

      let winOklch: OklchColor;
      let luminanceIntensity = 0;
      if (isLit) {
        const rawWarmth = kelvinToOklch(kelvin);
        luminanceIntensity = Math.round(clampFinite(clusterIntensity * (1 - blindClosureRatio * 0.42), 0.35, 1.0, 0.72) * 1000) / 1000;
        winOklch = applyAtmosphericDepthAttenuation(
          {
            l: clampFinite(rawWarmth.l * (0.68 + luminanceIntensity * 0.24), 0.38, 0.92, 0.76),
            c: clampFinite(rawWarmth.c * (depthBand === "foreground" ? 1.18 : 1.0), 0.014, 0.22, 0.08),
            h: rawWarmth.h,
          },
          preset.hazeOklch,
          distanceMeters,
          preset.atmosphericExtinctionBeta,
        );
      } else {
        winOklch = applyAtmosphericDepthAttenuation(
          {
            l: clampFinite(preset.facadeBaseOklch.l * 0.72 + (rng() - 0.5) * 0.02, 0.09, 0.26, 0.15),
            c: clampFinite(preset.skyHorizonOklch.c * 0.42, 0.004, 0.03, 0.012),
            h: preset.skyHorizonOklch.h,
          },
          preset.hazeOklch,
          distanceMeters,
          preset.atmosphericExtinctionBeta,
        );
      }

      const normX = columns > 1 ? (c / (columns - 1)) * 2 - 1 : 0;
      const normY = floors > 1 ? (f / (floors - 1)) * 2 - 1 : 0;
      windows.push({
        id: `${input.buildingId}-f${f}-c${c}`,
        buildingId: input.buildingId,
        floor: f,
        column: c,
        rect: {
          x: Math.round(rectX * 100) / 100,
          y: Math.round(rectY * 100) / 100,
          width: Math.round(winW * 100) / 100,
          height: Math.round(winH * 100) / 100,
        },
        lit: isLit,
        clusterId: activeClusterId,
        interiorDepthM,
        blindClosureRatio,
        kelvin,
        oklch: winOklch,
        oklchCss: formatOklchCss(winOklch),
        luminanceIntensity,
        interiorStyle: isLit ? clusterStyle : "empty-hall",
        parallax: computeInteriorParallaxOffset({
          windowCenterNormX: normX * 0.45,
          windowCenterNormY: normY * 0.45,
          cameraOffsetX: camX,
          cameraOffsetY: camY,
          interiorDepthM,
          cameraDistanceM: camDistM,
        }),
      });
    }
  }

  const totalWindowCount = floors * columns;
  return {
    buildingId: input.buildingId,
    moodId: input.moodId,
    hourOfNight: clockHour,
    floors,
    columns,
    buildingType,
    depthBand,
    targetOccupancyRatio: targetOccupancy,
    actualOccupancyRatio: Math.round((litWindowCount / totalWindowCount) * 10000) / 10000,
    litWindowCount,
    totalWindowCount,
    clusterCount,
    averageClusterSize: clusterCount > 0 ? Math.round((totalClusterCells / clusterCount) * 100) / 100 : 0,
    rowBitmasks,
    duplicateRowCount,
    rowHashRepetitionRate: Math.round((duplicateRowCount / floors) * 10000) / 10000,
    windows,
  };
}

/**
 * 3-심도(원경/중경/근경) 빌딩 스카이라인, 실내 시차 창문 격자, 무충돌 다국어 네온 간판을
 * 하나의 결정론적 야경 씬으로 조합한다.
 */
export function generateCityscapeNightScene(input: CityscapeNightSceneInput): CityscapeNightScene {
  const preset = getCityscapeMoodPreset(input.moodId);
  const { clockHour } = normalizeHourOfNight(input.hourOfNight);
  const seed = String(input.seed ?? `wave151-${input.moodId}-${clockHour}`);
  const width = Math.round(clampFinite(input.viewportWidthPx ?? 960, 480, 2400, 960));
  const height = Math.round(clampFinite(input.viewportHeightPx ?? 560, 320, 1600, 560));
  const groundY = Math.round(height * 0.84);
  const keepOutBoxes = input.keepOutBoxes ?? [];

  const specs: readonly {
    readonly id: string;
    readonly labelKo: string;
    readonly depthBand: CityscapeDepthBand;
    readonly distanceMeters: number;
    readonly xFrac: number;
    readonly wFrac: number;
    readonly hFrac: number;
    readonly floors: number;
    readonly columns: number;
    readonly hasSigns: boolean;
  }[] = [
    { id: "bg-west", labelKo: "원경 서측 타워", depthBand: "background", distanceMeters: 175, xFrac: 0.06, wFrac: 0.16, hFrac: 0.56, floors: 16, columns: 7, hasSigns: false },
    { id: "bg-center", labelKo: "원경 중앙 마천루", depthBand: "background", distanceMeters: 190, xFrac: 0.36, wFrac: 0.20, hFrac: 0.64, floors: 18, columns: 8, hasSigns: false },
    { id: "bg-east", labelKo: "원경 동측 타워", depthBand: "background", distanceMeters: 170, xFrac: 0.72, wFrac: 0.17, hFrac: 0.52, floors: 14, columns: 7, hasSigns: false },
    { id: "mid-left", labelKo: "중경 좌측 오피스", depthBand: "midground", distanceMeters: 84, xFrac: 0.16, wFrac: 0.21, hFrac: 0.50, floors: 12, columns: 7, hasSigns: true },
    { id: "mid-right", labelKo: "중경 우측 상가빌딩", depthBand: "midground", distanceMeters: 78, xFrac: 0.56, wFrac: 0.22, hFrac: 0.54, floors: 13, columns: 8, hasSigns: true },
    { id: "fg-left", labelKo: "근경 좌측 메인 빌딩", depthBand: "foreground", distanceMeters: 22, xFrac: 0.02, wFrac: 0.23, hFrac: 0.62, floors: 12, columns: 7, hasSigns: true },
    { id: "fg-right", labelKo: "근경 우측 코너 빌딩", depthBand: "foreground", distanceMeters: 24, xFrac: 0.76, wFrac: 0.22, hFrac: 0.60, floors: 12, columns: 7, hasSigns: true },
  ];

  const buildings: CityscapeBuilding[] = [];
  let signOverlapCount = 0;
  let keepOutViolationCount = 0;
  let outOfBoundsSignCount = 0;
  let totalLit = 0;
  let totalWins = 0;
  let repSum = 0;

  for (const spec of specs) {
    const rectW = Math.round(width * spec.wFrac);
    const rectH = Math.round(height * spec.hFrac);
    const rect: Rect2D = { x: Math.round(width * spec.xFrac), y: groundY - rectH, width: rectW, height: rectH };

    const facadeWindows = generateBuildingFacadeWindows({
      buildingId: spec.id,
      moodId: input.moodId,
      hourOfNight: clockHour,
      floors: spec.floors,
      columns: spec.columns,
      facadeRect: rect,
      depthBand: spec.depthBand,
      distanceMeters: spec.distanceMeters,
      cameraOffsetX: input.cameraOffsetX ?? 0.35,
      cameraOffsetY: input.cameraOffsetY ?? -0.22,
      seed,
    });
    totalLit += facadeWindows.litWindowCount;
    totalWins += facadeWindows.totalWindowCount;
    repSum += facadeWindows.rowHashRepetitionRate;

    let placedSignboards: readonly PlacedNeonSignboard[] = [];
    if (spec.hasSigns) {
      const candidates: NeonSignboardCandidate[] =
        input.customSignCandidates && spec.depthBand === "foreground"
          ? input.customSignCandidates.slice()
          : preset.defaultSignSamples.slice(0, spec.depthBand === "foreground" ? 3 : 1).map((sample, sIdx) => ({
              id: `${spec.id}-sign-${sIdx}`,
              text: sample.text,
              script: sample.script,
              preferredOrientation: sample.preferredOrientation,
              preferredZone: sample.preferredZone,
              priority: 80 - sIdx * 10,
              fontSizePx: spec.depthBand === "foreground" ? 11.5 : 9.5,
            }));

      const placement = placeFacadeNeonSignboards({
        buildingId: spec.id,
        moodId: input.moodId,
        facadeRect: rect,
        depthBand: spec.depthBand,
        distanceMeters: spec.distanceMeters,
        candidates,
        keepOutBoxes,
        minGapPx: 8,
        facadePaddingPx: 6,
        seed,
      });
      placedSignboards = placement.placedSigns;
      signOverlapCount += placement.signOverlapCount;
      keepOutViolationCount += placement.keepOutViolationCount;
      outOfBoundsSignCount += placement.outOfBoundsCount;
    }

    const facadeBaseOklch = applyAtmosphericDepthAttenuation(
      preset.facadeBaseOklch,
      preset.hazeOklch,
      spec.distanceMeters,
      preset.atmosphericExtinctionBeta,
    );
    buildings.push({
      id: spec.id,
      labelKo: spec.labelKo,
      depthBand: spec.depthBand,
      distanceMeters: spec.distanceMeters,
      buildingType: preset.defaultBuildingType,
      rect,
      facadeBaseOklch,
      facadeBaseCss: formatOklchCss(facadeBaseOklch),
      facadeWindows,
      signboards: placedSignboards,
    });
  }

  return {
    sceneId: input.sceneId ?? `cityscape-${input.moodId}-${clockHour}h`,
    moodId: input.moodId,
    hourOfNight: clockHour,
    seed,
    viewportWidthPx: width,
    viewportHeightPx: height,
    skyZenithOklch: preset.skyZenithOklch,
    skyHorizonOklch: preset.skyHorizonOklch,
    hazeOklch: preset.hazeOklch,
    moonlightKelvin: preset.moonlightKelvin,
    keepOutBoxes,
    buildings,
    signOverlapCount,
    keepOutViolationCount,
    outOfBoundsSignCount,
    averageRowHashRepetitionRate: Math.round((repSum / Math.max(1, specs.length)) * 10000) / 10000,
    overallOccupancyRatio: Math.round((totalLit / Math.max(1, totalWins)) * 10000) / 10000,
  };
}
