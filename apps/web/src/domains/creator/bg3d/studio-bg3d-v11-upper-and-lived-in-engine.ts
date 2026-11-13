import { buildBg3dObjectClusterPrimitives } from "./studio-bg3d-background-object-cluster";
import { findStudioBg3dEssentialAsset } from "./studio-bg3d-essential-pose-prop-catalog";
import { normalizeStudioBg3dComponentRef } from "./studio-bg3d-hierarchy";
import { DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } from "./studio-bg3d-scene-document";
import {
  DEFAULT_UPPER_META,
  STUDIO_BG3D_V11_UPPER_ARCHETYPES,
  RECOMMENDED_UPPER_PAIRING_BY_ARCHETYPE,
  THEME_PALETTES,
  DENSITY_RANK,
  UPPER_BLUEPRINTS,
  type Bg3dV11ScenePrimitive,
  type Bg3dV11PrimitiveKind,
  type BuildBg3dV11UpperClusterSpec,
  type Bg3dLivedInJitterOptions,
  type Bg3dViewportEdgeMetrics,
  type Bg3dV11RoomDimensions,
  type Bg3dV11RoomAnchor,
  type AssembleBg3dV11RoomPipelineSpec,
  type AssembleBg3dV11RoomPipelineResult,
} from "./studio-bg3d-v11-upper-catalog";
import {
  cleanZero,
  clampScale,
  sanitizeSafeToken,
  unitFullSizeForKind,
  composeV11WorldYawWithLocalEulerXyz,
  computeV11PrimitiveWorldHalfExtents,
  measureV11PrimitivesWorldBounds,
} from "./studio-bg3d-v11-geometry";
import { resolveBg3dClusterHumanSnapPoints } from "./studio-bg3d-v11-human-snaps";

export * from "./studio-bg3d-v11-upper-catalog";
export {
  computeV11PrimitiveWorldHalfExtents,
  measureV11PrimitivesWorldBounds,
} from "./studio-bg3d-v11-geometry";
export { resolveBg3dClusterHumanSnapPoints } from "./studio-bg3d-v11-human-snaps";

export class Bg3dV11PlacementError extends Error {
  constructor(readonly code: "invalid-input" | "room-too-small") {
    super(
      code === "invalid-input"
        ? "방 치수·높이와 생활감 값을 유효한 숫자로 입력해 주세요."
        : "선택한 세트가 방보다 큽니다. 방 치수를 늘리거나 더 작은 클러스터를 선택해 주세요.",
    );
  }
}

function validateRoom(room: Bg3dV11RoomDimensions): void {
  const thickness = room.wallThickness ?? 0;
  if (
    ![room.width, room.depth, room.wallHeight].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    !Number.isFinite(thickness) ||
    thickness < 0 ||
    thickness >= room.width ||
    thickness >= room.depth
  ) {
    throw new Bg3dV11PlacementError("invalid-input");
  }
}

function roomInteriorHalfSize(room: Bg3dV11RoomDimensions): [number, number] {
  const thickness = room.wallThickness ?? 0;
  return [(room.width - thickness) / 2, (room.depth - thickness) / 2];
}

function validateRoomFit(
  primitives: readonly Bg3dV11ScenePrimitive[],
  room: Bg3dV11RoomDimensions,
): void {
  const { min, max } = measureV11PrimitivesWorldBounds(primitives);
  const [halfWidth, halfDepth] = roomInteriorHalfSize(room);
  const epsilon = 0.0001;
  if (
    min[0] < -halfWidth - epsilon ||
    max[0] > halfWidth + epsilon ||
    min[2] < -halfDepth - epsilon ||
    max[2] > halfDepth + epsilon ||
    min[1] < -epsilon ||
    max[1] > room.wallHeight + epsilon
  ) {
    throw new Bg3dV11PlacementError("room-too-small");
  }
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBg3dV11UpperClusterPrimitives(
  spec: BuildBg3dV11UpperClusterSpec,
): Bg3dV11ScenePrimitive[] {
  const meta =
    STUDIO_BG3D_V11_UPPER_ARCHETYPES.find(
      (item) => item.id === spec.archetype,
    ) ?? DEFAULT_UPPER_META;
  const density = spec.density ?? "detailed";
  const theme = spec.theme ?? "daylight-neutral";
  const palette = THEME_PALETTES[theme];
  const mountHeight = Math.max(
    1.2,
    spec.mountHeightMeters ?? meta.defaultMountHeightMeters,
  );
  const [ox, oz] = spec.offsetXZ ?? [0, 0];
  if (![mountHeight, ox, oz, spec.yawDeg ?? 0].every(Number.isFinite)) {
    throw new Bg3dV11PlacementError("invalid-input");
  }
  const yawRad = ((spec.yawDeg ?? 0) * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const safeKey = sanitizeSafeToken(
    spec.instanceKey ?? `v11-${meta.shortCode}`,
    42,
  );
  const asset = findStudioBg3dEssentialAsset(`kitbash-v11-${meta.id}`);
  const componentRef = normalizeStudioBg3dComponentRef(
    asset ? { id: asset.id, name: asset.labelKo } : undefined,
  );
  if (!componentRef) {
    throw new Error("상부 설비의 에셋 카탈로그 정보를 확인하지 못했어요.");
  }

  const blueprints = UPPER_BLUEPRINTS[meta.id].filter(
    (part) => DENSITY_RANK[part.minDensity] <= DENSITY_RANK[density],
  );

  return blueprints.map((part, idx) => {
    const [ux, uy, uz] = unitFullSizeForKind(part.kind);
    const scale: [number, number, number] = [
      clampScale(part.sizeMeters[0] / ux),
      clampScale(part.sizeMeters[1] / uy),
      clampScale(part.sizeMeters[2] / uz),
    ];
    const localEuler = part.localEulerRad ?? [0, 0, 0];
    const rotation = composeV11WorldYawWithLocalEulerXyz(yawRad, localEuler);
    const [, hy] = computeV11PrimitiveWorldHalfExtents(
      part.kind,
      scale,
      rotation,
    );
    const worldX =
      ox + part.localOffsetXZ[0] * cosY + part.localOffsetXZ[1] * sinY;
    const worldZ =
      oz - part.localOffsetXZ[0] * sinY + part.localOffsetXZ[1] * cosY;
    const worldY = Math.max(hy, mountHeight - part.topDropMeters - hy);

    const tags = [
      "BgCluster",
      "BgV11_Upper",
      `BgV11_${meta.shortCode}`,
      ...(part.movableProp ? ["BgV11_Prop"] : []),
    ];

    return {
      id: `${safeKey}-${idx + 1}-${sanitizeSafeToken(part.key, 24)}`,
      name: `${meta.labelKo} - ${part.nameKo}`,
      kind: part.kind,
      position: [cleanZero(worldX), cleanZero(worldY), cleanZero(worldZ)],
      rotation,
      scale,
      color: palette[part.paletteSlot].toLowerCase(),
      materialOverride: {
        ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
        roughness: part.roughness,
        metalness: part.metalness,
      },
      visible: true,
      locked: false,
      parentId: null,
      componentRef,
      tags: tags.sort(),
    };
  });
}

export function applyBg3dDeterministicLivedInJitter(
  primitives: readonly Bg3dV11ScenePrimitive[],
  options: Bg3dLivedInJitterOptions,
): Bg3dV11ScenePrimitive[] {
  if (![options.seed, options.messiness].every(Number.isFinite))
    throw new Bg3dV11PlacementError("invalid-input");
  const messiness = Math.max(0, Math.min(1, options.messiness));
  if (messiness === 0) {
    return primitives.map((p) => ({
      ...p,
      tags: p.tags ? [...p.tags] : undefined,
    }));
  }
  const rng = createMulberry32(options.seed);
  const maxYawJitterRad = ((2 + 4 * messiness) * Math.PI) / 180;
  const maxOffsetMeters = 0.04 * messiness;

  const result: Bg3dV11ScenePrimitive[] = [];
  primitives.forEach((prim, index) => {
    const [, hy] = computeV11PrimitiveWorldHalfExtents(
      prim.kind,
      prim.scale,
      prim.rotation,
    );
    const isTaggedProp = prim.tags?.includes("BgV11_Prop") ?? false;
    // 가구 지지대·설비 연결부를 흩트리지 않고 생활 소품만 분산한다.
    const isSmallClutter =
      /Crate|Eraser|Stylus_Holder|Planter|Bottle|Flask|Book/u.test(
        prim.name ?? "",
      );
    if (!isTaggedProp && !isSmallClutter) {
      result.push({ ...prim, tags: prim.tags ? [...prim.tags] : undefined });
      return;
    }

    const keepRoll = rng();
    if (index >= 4 && messiness < 0.35 && keepRoll > 0.45 + messiness) {
      return;
    }

    const deltaYaw = (rng() * 2 - 1) * maxYawJitterRad;
    const deltaX = (rng() * 2 - 1) * maxOffsetMeters;
    const deltaZ = (rng() * 2 - 1) * maxOffsetMeters;
    const nextRotation = composeV11WorldYawWithLocalEulerXyz(
      deltaYaw,
      prim.rotation,
    );
    const [, nextHy] = computeV11PrimitiveWorldHalfExtents(
      prim.kind,
      prim.scale,
      nextRotation,
    );
    const safeY = Math.max(nextHy, prim.position[1] + (nextHy - hy));

    result.push({
      ...prim,
      position: [
        cleanZero(prim.position[0] + deltaX),
        cleanZero(safeY),
        cleanZero(prim.position[2] + deltaZ),
      ],
      rotation: nextRotation,
      tags: prim.tags ? [...prim.tags] : undefined,
    });
  });

  return result;
}

const KIND_EDGE_WEIGHT: Record<Bg3dV11PrimitiveKind, number> = {
  box: 1.0,
  cylinder: 1.35,
  plane: 0.5,
  sphere: 0.9,
  hemisphere: 0.95,
  cone: 1.25,
  pyramid: 1.25,
  triangularPrism: 1.25,
  hexPrism: 1.4,
  torus: 1.6,
  tube: 1.55,
  ring: 1.45,
  capsule: 1.3,
};

export function evaluateBg3dViewportEdgeDistribution(
  primitives: readonly Bg3dV11ScenePrimitive[],
  room: Bg3dV11RoomDimensions,
): Bg3dViewportEdgeMetrics {
  const wallHeight = Math.max(1.5, room.wallHeight);
  const bandStep = wallHeight / 3;
  let lowerScore = 0;
  let midScore = 0;
  let upperScore = 0;
  let coveredWallArea = 0;

  const northZ = -room.depth / 2;
  const westX = -room.width / 2;
  const eastX = room.width / 2;

  for (const prim of primitives) {
    if (prim.visible === false) continue;
    const [hx, hy, hz] = computeV11PrimitiveWorldHalfExtents(
      prim.kind,
      prim.scale,
      prim.rotation,
    );
    const minY = Math.max(0, prim.position[1] - hy);
    const maxY = Math.min(wallHeight, prim.position[1] + hy);
    const spanY = Math.max(
      0.001,
      prim.position[1] + hy - (prim.position[1] - hy),
    );
    const edgeScore = KIND_EDGE_WEIGHT[prim.kind] * 2 * (hx + hy + hz);

    const lowOverlap = Math.max(
      0,
      Math.min(maxY, bandStep) - Math.max(minY, 0),
    );
    const midOverlap = Math.max(
      0,
      Math.min(maxY, bandStep * 2) - Math.max(minY, bandStep),
    );
    const upOverlap = Math.max(
      0,
      Math.min(maxY, wallHeight) - Math.max(minY, bandStep * 2),
    );

    lowerScore += edgeScore * (lowOverlap / spanY);
    midScore += edgeScore * (midOverlap / spanY);
    upperScore += edgeScore * (upOverlap / spanY);

    const clampedHeight = Math.max(0, maxY - minY);
    if (Math.abs(prim.position[2] - northZ) <= hz + 0.95) {
      coveredWallArea += Math.min(room.width, hx * 2) * clampedHeight;
    }
    if (
      Math.abs(prim.position[0] - westX) <= hx + 0.95 ||
      Math.abs(prim.position[0] - eastX) <= hx + 0.95
    ) {
      coveredWallArea += Math.min(room.depth, hz * 2) * clampedHeight;
    }
  }

  const total = lowerScore + midScore + upperScore;
  const totalWallArea = Math.max(
    1,
    room.width * wallHeight + 2 * room.depth * wallHeight,
  );
  const reductionPct = Math.min(100, (coveredWallArea / totalWallArea) * 100);

  if (total <= 0) {
    return {
      lowerBandRatio: 0,
      midBandRatio: 0,
      upperBandRatio: 0,
      totalEdgeScore: 0,
      wallBlankAreaReductionPct: 0,
    };
  }

  const lowRatio = Number((lowerScore / total).toFixed(4));
  const midRatio = Number((midScore / total).toFixed(4));
  return {
    lowerBandRatio: lowRatio,
    midBandRatio: midRatio,
    upperBandRatio: Number(Math.max(0, 1 - lowRatio - midRatio).toFixed(4)),
    totalEdgeScore: Number(total.toFixed(3)),
    wallBlankAreaReductionPct: Number(reductionPct.toFixed(2)),
  };
}

export function snapBg3dClusterToRoomAnchor(
  primitives: readonly Bg3dV11ScenePrimitive[],
  room: Bg3dV11RoomDimensions,
  anchor: Bg3dV11RoomAnchor,
  marginMeters = 0.08,
): {
  snappedPrimitives: Bg3dV11ScenePrimitive[];
  appliedDeltaXZ: [number, number];
} {
  validateRoom(room);
  if (!Number.isFinite(marginMeters) || marginMeters < 0)
    throw new Bg3dV11PlacementError("invalid-input");
  if (primitives.length === 0) {
    return { snappedPrimitives: [], appliedDeltaXZ: [0, 0] };
  }
  const bounds = measureV11PrimitivesWorldBounds(primitives);
  const centerX = (bounds.min[0] + bounds.max[0]) * 0.5;
  const centerZ = (bounds.min[2] + bounds.max[2]) * 0.5;
  const halfW = (bounds.max[0] - bounds.min[0]) * 0.5;
  const halfD = (bounds.max[2] - bounds.min[2]) * 0.5;
  const [roomHalfWidth, roomHalfDepth] = roomInteriorHalfSize(room);
  if (
    halfW + marginMeters > roomHalfWidth ||
    halfD + marginMeters > roomHalfDepth
  ) {
    throw new Bg3dV11PlacementError("room-too-small");
  }

  let targetX: number;
  let targetZ: number;
  switch (anchor) {
    case "north-wall":
      targetX = 0;
      targetZ = -roomHalfDepth + halfD + marginMeters;
      break;
    case "nw-corner":
      targetX = -roomHalfWidth + halfW + marginMeters;
      targetZ = -roomHalfDepth + halfD + marginMeters;
      break;
    case "east-window":
      targetX = roomHalfWidth - halfW - marginMeters;
      targetZ = 0;
      break;
    case "alley-facade-upper":
      // 자동 단면으로 벽을 숨겨도 설비는 복원 가능한 벽의 실내 면 안에 둔다.
      targetX = -room.width * 0.25;
      targetZ = -roomHalfDepth + halfD + marginMeters;
      break;
    case "ceiling-center":
    default:
      targetX = 0;
      targetZ = 0;
      break;
  }

  const dx =
    Math.max(
      -roomHalfWidth + halfW + marginMeters,
      Math.min(roomHalfWidth - halfW - marginMeters, targetX),
    ) - centerX;
  const dz =
    Math.max(
      -roomHalfDepth + halfD + marginMeters,
      Math.min(roomHalfDepth - halfD - marginMeters, targetZ),
    ) - centerZ;
  const snappedPrimitives = primitives.map((prim) => ({
    ...prim,
    position: [
      cleanZero(prim.position[0] + dx),
      prim.position[1],
      cleanZero(prim.position[2] + dz),
    ] as [number, number, number],
    tags: prim.tags ? [...prim.tags] : undefined,
  }));

  return {
    snappedPrimitives,
    appliedDeltaXZ: [cleanZero(dx), cleanZero(dz)],
  };
}

export function buildBg3dV11VisibilityHiddenTags(options: {
  hideUpperZone?: boolean;
  hideAllClusters?: boolean;
  hiddenShortCodes?: readonly string[];
}): string[] {
  const tags = new Set<string>();
  if (options.hideAllClusters) tags.add("BgCluster");
  if (options.hideUpperZone) tags.add("BgV11_Upper");
  for (const code of options.hiddenShortCodes ?? []) {
    const safe = code.trim().slice(0, 20);
    if (safe.length > 0) {
      tags.add(`BgCluster_${safe}`);
      tags.add(`BgV11_${safe}`);
    }
  }
  return [...tags].filter((tag) => [...tag].length <= 32).slice(0, 64);
}

/** 단독·전체 배치가 같은 상부 생성·분산·스냅·방 경계 검사를 사용한다. */
export function assembleBg3dV11UpperRoomPlacement(
  spec: AssembleBg3dV11RoomPipelineSpec,
): {
  upperPrimitives: Bg3dV11ScenePrimitive[];
  pairedUpperArchetype: AssembleBg3dV11RoomPipelineResult["pairedUpperArchetype"];
  upperArchetypeTag: string;
} {
  validateRoom(spec.room);
  const density = spec.density ?? "detailed";
  const theme = spec.theme ?? "daylight-neutral";
  const seed = spec.seed ?? 20261113;
  const messiness = spec.messiness ?? 0.35;
  const prefix = sanitizeSafeToken(spec.instancePrefix ?? "rmv11", 24);
  const pairedUpper =
    spec.upperArchetype ??
    RECOMMENDED_UPPER_PAIRING_BY_ARCHETYPE[spec.lowerArchetype];
  const upperMeta =
    STUDIO_BG3D_V11_UPPER_ARCHETYPES.find((m) => m.id === pairedUpper) ??
    DEFAULT_UPPER_META;

  const upperAnchor: Bg3dV11RoomAnchor =
    upperMeta.mountZone === "window-head"
      ? "east-window"
      : upperMeta.mountZone === "upper-wall"
        ? "alley-facade-upper"
        : "ceiling-center";
  const mountHeight =
    upperMeta.mountZone === "ceiling"
      ? spec.room.wallHeight
      : Math.min(
          spec.room.wallHeight - 0.15,
          upperMeta.defaultMountHeightMeters,
        );

  const rawUpper = buildBg3dV11UpperClusterPrimitives({
    archetype: pairedUpper,
    density,
    theme,
    mountHeightMeters: mountHeight,
    instanceKey: `${prefix}-up`,
    yawDeg: upperAnchor === "east-window" ? -90 : 0,
  });
  const snappedUpper = snapBg3dClusterToRoomAnchor(
    applyBg3dDeterministicLivedInJitter(rawUpper, {
      seed: seed + 97,
      messiness: messiness * 0.5,
    }),
    spec.room,
    upperAnchor,
  );
  const upperPrimitives = snappedUpper.snappedPrimitives;
  validateRoomFit(upperPrimitives, spec.room);

  return {
    upperPrimitives,
    pairedUpperArchetype: upperMeta.id,
    upperArchetypeTag: `BgV11_${upperMeta.shortCode}`,
  };
}

export function assembleBg3dV11RoomPipeline(
  spec: AssembleBg3dV11RoomPipelineSpec,
): AssembleBg3dV11RoomPipelineResult {
  validateRoom(spec.room);
  const density = spec.density ?? "detailed";
  const theme = spec.theme ?? "daylight-neutral";
  const seed = spec.seed ?? 20261113;
  const messiness = spec.messiness ?? 0.35;
  const prefix = sanitizeSafeToken(spec.instancePrefix ?? "rmv11", 24);
  const rawLowerBase = buildBg3dObjectClusterPrimitives({
    archetype: spec.lowerArchetype,
    moduleCount: 1,
    clutterDensity: density,
    arrangement: spec.lowerAnchor === "nw-corner" ? "l-corner" : "linear-wall",
    surfaceTheme: theme,
  });
  const rawLower = rawLowerBase.primitives.map((prim, idx) => ({
    ...prim,
    id: `${prefix}-low-${idx + 1}`,
    tags: [...new Set([...(prim.tags ?? []), "BgCluster"])].sort(),
  }));
  const snappedLower = snapBg3dClusterToRoomAnchor(
    applyBg3dDeterministicLivedInJitter(rawLower, { seed, messiness }),
    spec.room,
    spec.lowerAnchor ?? "north-wall",
  );
  const lowerPrimitives = snappedLower.snappedPrimitives;
  const beforeUpperEdgeMetrics = evaluateBg3dViewportEdgeDistribution(
    lowerPrimitives,
    spec.room,
  );
  const upperPlacement = assembleBg3dV11UpperRoomPlacement(spec);
  const { upperPrimitives } = upperPlacement;

  const combinedPrimitives = [...lowerPrimitives, ...upperPrimitives];
  validateRoomFit(combinedPrimitives, spec.room);
  const afterUpperEdgeMetrics = evaluateBg3dViewportEdgeDistribution(
    combinedPrimitives,
    spec.room,
  );

  const lowerArchetypeTag =
    lowerPrimitives[0]?.tags?.find((t) => t.startsWith("BgCluster_")) ??
    "BgCluster";

  return {
    lowerPrimitives,
    upperPrimitives,
    combinedPrimitives,
    pairedUpperArchetype: upperPlacement.pairedUpperArchetype,
    beforeUpperEdgeMetrics,
    afterUpperEdgeMetrics,
    humanSnapPoints: resolveBg3dClusterHumanSnapPoints({
      archetype: spec.lowerArchetype,
      offsetXZ: snappedLower.appliedDeltaXZ,
      yawDeg: 0,
      primitives: lowerPrimitives,
    }),
    cutVisibilityTags: {
      allClusterTag: "BgCluster",
      lowerArchetypeTag,
      upperZoneTag: "BgV11_Upper",
      upperArchetypeTag: upperPlacement.upperArchetypeTag,
    },
  };
}
