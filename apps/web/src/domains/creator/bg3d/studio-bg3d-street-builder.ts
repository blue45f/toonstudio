// 웹툰 배경 "거리" 절차 생성기 — 왕복 2차로 도로, 연석이 있는 보도, 길 양쪽의 건물 정면, 가로등·가로수·벤치,
// 횡단보도·중앙선, 주차된 차량을 "사람 크기(미터)" 기준 수치로 만든다.
//
// 기존 씬 템플릿의 거리(studio-background-3d-scene-templates.ts)는 건물 높이가 2.2m, 창이 0.6m 같은 장난감
// 비례라 사람(STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M = 1.6)을 세우면 문과 보도가 맞지 않았다. 이 생성기는 층고 3m 안팎,
// 문 높이 2.2m, 연석 15cm 처럼 실제 거리의 눈금을 쓴다. 허용 범위는 웹툰 배경 사람 크기 테스트가 고정한다.
//
// 룸 빌더(studio-bg3d-room-builder.ts)와 같은 계약을 따른다: 결과는 기존 BgPrimitive[] 로 전개되어 장면 문서의
// 일반 도형 노드로 저장되고(새 문서 개념 없음), 모든 파츠는 이름이 있는 독립 노드라 하나씩 고를 수 있다.
//
// 좌표: 거리 중심이 원점, 도로 윗면이 y=0, 길 방향이 Z, 서쪽 건물이 -X 쪽이다. 바퀴를 뺀 모든 파츠는 회전이 없다.
// 프리미티브 단위 크기: box 1, cylinder 지름 0.6·높이 1, sphere 지름 1 (makeGeometry 참고).

import { uid } from "../studio-id";

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";

type Vec3 = readonly [number, number, number];

export interface StudioBg3dStreetSpec {
  /** 거리 길이(m, Z축). */
  readonly length: number;
  /** 차로 하나의 폭(m). 도로는 왕복 2차로라 도로 폭은 이 값의 두 배다. */
  readonly laneWidth: number;
  readonly sidewalkWidth: number;
  /** 건물 층고(m). */
  readonly floorHeight: number;
  /** 서쪽(-X) 건물 줄: 건물마다 층수. */
  readonly westFloors: readonly number[];
  /** 동쪽(+X) 건물 줄. */
  readonly eastFloors: readonly number[];
}

export interface StudioBg3dStreetPart {
  readonly kind: BgPrimitiveKind;
  readonly name: string;
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  readonly color: string;
}

export const STUDIO_BG3D_STREET_LIMITS = Object.freeze({
  minLength: 20,
  maxLength: 80,
  minLaneWidth: 2.7,
  maxLaneWidth: 3.75,
  // 가로등(연석에서 0.45m)과 가로수(1.0m)를 보도에 세우고도 사람이 지나갈 폭이 남는 최소값.
  minSidewalkWidth: 2.4,
  maxSidewalkWidth: 5,
  minFloorHeight: 2.7,
  maxFloorHeight: 3.6,
  minFloors: 2,
  maxFloors: 6,
  maxBuildingsPerSide: 5,
  /** 건물 한 채의 최소 폭(m): 출입문·상가 유리·창이 겹치지 않고 들어가는 폭. */
  minBuildingWidth: 8,
  /** 연석(보도와 도로의 단차, m). */
  curbHeight: 0.15,
  /** 건물 본체의 X 방향 깊이(m). */
  buildingDepth: 7,
  /** 건물과 건물 사이 골목 폭(m). */
  buildingGap: 1,
});

export const STUDIO_BG3D_STREET_DEFAULT_SPEC: StudioBg3dStreetSpec = Object.freeze({
  length: 36,
  laneWidth: 3.25,
  sidewalkWidth: 2.6,
  floorHeight: 3,
  westFloors: Object.freeze([3, 4, 3]),
  eastFloors: Object.freeze([4, 3, 4]),
});

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function clampFloors(value: unknown, fallback: readonly number[], maxCount: number): readonly number[] {
  const limits = STUDIO_BG3D_STREET_LIMITS;
  const source = Array.isArray(value) ? value : fallback;
  const floors = source
    .slice(0, maxCount)
    .map((entry) => Math.round(clampNumber(entry, 3, limits.minFloors, limits.maxFloors)));
  return floors.length > 0 ? floors : fallback;
}

/** 임의 입력을 렌더 가능한 안전 범위로 눌러 담는다(룸 빌더의 clamp 와 같은 철학: 항상 유효한 스펙). */
export function clampStudioBg3dStreetSpec(
  raw: Partial<StudioBg3dStreetSpec> | null | undefined,
): StudioBg3dStreetSpec {
  const limits = STUDIO_BG3D_STREET_LIMITS;
  const base = STUDIO_BG3D_STREET_DEFAULT_SPEC;
  const source = raw ?? {};
  const length = clampNumber(source.length, base.length, limits.minLength, limits.maxLength);
  // 길이에 비해 건물이 너무 많으면 건물이 좁아져 문·유리가 겹친다: 최소 폭이 지켜지는 개수까지만 둔다.
  const maxCount = Math.max(
    1,
    Math.min(
      limits.maxBuildingsPerSide,
      Math.floor((length + limits.buildingGap) / (limits.minBuildingWidth + limits.buildingGap)),
    ),
  );
  return {
    length,
    laneWidth: clampNumber(source.laneWidth, base.laneWidth, limits.minLaneWidth, limits.maxLaneWidth),
    sidewalkWidth: clampNumber(
      source.sidewalkWidth,
      base.sidewalkWidth,
      limits.minSidewalkWidth,
      limits.maxSidewalkWidth,
    ),
    floorHeight: clampNumber(source.floorHeight, base.floorHeight, limits.minFloorHeight, limits.maxFloorHeight),
    westFloors: clampFloors(source.westFloors, base.westFloors, maxCount),
    eastFloors: clampFloors(source.eastFloors, base.eastFloors, maxCount),
  };
}

// ── 파츠 생성 ────────────────────────────────────────────────────────────────

const NO_ROTATION: Vec3 = [0, 0, 0];

const COLORS = Object.freeze({
  road: "#4a4a50",
  sidewalk: "#b8b4aa",
  crosswalk: "#e8e8e8",
  centerLine: "#e0c840",
  glass: "#5c7a96",
  shopGlass: "#7aa0b8",
  door: "#6b4a37",
  lampMetal: "#3a3a42",
  lampLight: "#f4e6b0",
  trunk: "#6b4a37",
  canopy: "#4f8a45",
  wheel: "#222226",
  bench: "#8a6b4a",
  benchBase: "#4a4a52",
});

const BUILDING_COLORS = ["#d8c8b0", "#c9b8a8", "#b8c4cc", "#e0d4c0", "#c4b8c8"] as const;
const CAR_COLORS = [
  { body: "#c0392b", cabin: "#8e2a20" },
  { body: "#3b6ea5", cabin: "#2a4e78" },
] as const;

function part(
  kind: BgPrimitiveKind,
  name: string,
  color: string,
  position: Vec3,
  scale: Vec3,
  rotation: Vec3 = NO_ROTATION,
): StudioBg3dStreetPart {
  return { kind, name, position, rotation, scale, color };
}

function buildingParts(
  side: -1 | 1,
  centerZ: number,
  width: number,
  floors: number,
  colorIndex: number,
  facadeX: number,
  spec: StudioBg3dStreetSpec,
): StudioBg3dStreetPart[] {
  const { curbHeight, buildingDepth } = STUDIO_BG3D_STREET_LIMITS;
  const floorHeight = spec.floorHeight;
  const bodyHeight = curbHeight + floors * floorHeight;
  // 정면(거리 쪽 면)에서 거리 방향으로 2cm 들여 박고 5cm 튀어나오게 하는 얇은 유리·문 박스.
  const frontX = side * (facadeX - 0.02);
  const parts: StudioBg3dStreetPart[] = [
    part(
      "box",
      "건물 본체",
      BUILDING_COLORS[colorIndex % BUILDING_COLORS.length],
      [side * (facadeX + buildingDepth / 2), bodyHeight / 2, centerZ],
      [buildingDepth, bodyHeight, width],
    ),
    // 1층: 출입문 1.0m x 2.2m 와 상가 유리(창턱 0.5m, 높이 1.8m).
    part("box", "건물 문", COLORS.door, [frontX, curbHeight + 1.1, centerZ + 0.3 * width], [0.06, 2.2, 1]),
    part(
      "box",
      "상가 유리",
      COLORS.shopGlass,
      [frontX, curbHeight + 0.5 + 0.9, centerZ - 0.18 * width],
      [0.06, 1.8, 2.8],
    ),
  ];
  // 2층부터: 층마다 창 2개(폭 1.4m, 높이 1.3m, 층 바닥에서 창턱 0.9m).
  for (let floor = 1; floor < floors; floor += 1) {
    const sillY = curbHeight + floor * floorHeight + 0.9;
    for (const offset of [-0.27, 0.27]) {
      parts.push(
        part("box", "건물 창", COLORS.glass, [frontX, sillY + 0.65, centerZ + offset * width], [0.06, 1.3, 1.4]),
      );
    }
  }
  return parts;
}

function lampParts(side: -1 | 1, z: number, roadHalf: number): StudioBg3dStreetPart[] {
  const { curbHeight } = STUDIO_BG3D_STREET_LIMITS;
  const poleX = side * (roadHalf + 0.45);
  const poleHeight = 5;
  // 팔은 도로 쪽(-side)으로 1.0m 뻗고 등은 그 끝에 단다.
  return [
    // 기둥 지름 0.12m (cylinder 지름 0.6 x scale 0.2).
    part("cylinder", "가로등 기둥", COLORS.lampMetal, [poleX, curbHeight + poleHeight / 2, z], [0.2, poleHeight, 0.2]),
    part("box", "가로등 팔", COLORS.lampMetal, [poleX - side * 0.5, curbHeight + poleHeight + 0.04, z], [1.1, 0.08, 0.08]),
    part("box", "가로등 등", COLORS.lampLight, [poleX - side * 1.0, curbHeight + poleHeight - 0.06, z], [0.5, 0.12, 0.25]),
  ];
}

function treeParts(side: -1 | 1, z: number, roadHalf: number): StudioBg3dStreetPart[] {
  const { curbHeight } = STUDIO_BG3D_STREET_LIMITS;
  const x = side * (roadHalf + 1);
  const trunkHeight = 2.4;
  const canopyDiameter = 2.4;
  return [
    // 줄기 지름 0.25m.
    part("cylinder", "가로수 줄기", COLORS.trunk, [x, curbHeight + trunkHeight / 2, z], [0.4167, trunkHeight, 0.4167]),
    // 잎 덩어리 지름 2.4m, 아래끝이 보도 위 2.25m.
    part(
      "sphere",
      "가로수 잎",
      COLORS.canopy,
      [x, curbHeight + trunkHeight + canopyDiameter / 2 - 0.15, z],
      [canopyDiameter, canopyDiameter, canopyDiameter],
    ),
  ];
}

function carParts(laneX: number, z: number, paint: (typeof CAR_COLORS)[number]): StudioBg3dStreetPart[] {
  const wheelRadius = 0.33;
  const wheelDiameter = wheelRadius * 2;
  // 길이 4.5m, 폭 1.8m, 몸통 윗면 1.0m, 지붕 윗면 1.55m, 바퀴 지름 0.66m.
  const parts: StudioBg3dStreetPart[] = [
    part("box", "차량 몸체", paint.body, [laneX, 0.675, z], [1.8, 0.65, 4.5]),
    part("box", "차량 객실", paint.cabin, [laneX, 1.275, z - 0.2], [1.6, 0.55, 2.4]),
  ];
  for (const sx of [-1, 1]) {
    for (const dz of [-1.4, 1.4]) {
      parts.push(
        part(
          "cylinder",
          "차량 바퀴",
          COLORS.wheel,
          [laneX + sx * 0.88, wheelRadius, z + dz],
          // 원기둥 축(Y)을 차축(X)으로 눕힌다: 지름 0.66m(0.6 x 1.1), 두께 0.22m.
          [wheelDiameter / 0.6, 0.22, wheelDiameter / 0.6],
          [0, 0, Math.PI / 2],
        ),
      );
    }
  }
  return parts;
}

export function buildStudioBg3dStreetParts(rawSpec: Partial<StudioBg3dStreetSpec>): StudioBg3dStreetPart[] {
  const spec = clampStudioBg3dStreetSpec(rawSpec);
  const { curbHeight, buildingGap } = STUDIO_BG3D_STREET_LIMITS;
  const roadHalf = spec.laneWidth; // 왕복 2차로: 도로 폭 = 2 x laneWidth
  const sidewalkInner = roadHalf;
  const facadeX = roadHalf + spec.sidewalkWidth;
  const parts: StudioBg3dStreetPart[] = [];

  // 도로(윗면 y=0)와 양쪽 보도(윗면 = 연석 높이).
  parts.push(part("box", "도로", COLORS.road, [0, -0.05, 0], [roadHalf * 2, 0.1, spec.length]));
  for (const side of [-1, 1] as const) {
    parts.push(
      part(
        "box",
        "보도",
        COLORS.sidewalk,
        [side * (sidewalkInner + spec.sidewalkWidth / 2), curbHeight / 2, 0],
        [spec.sidewalkWidth, curbHeight, spec.length],
      ),
    );
  }

  // 건물: 줄마다 같은 폭으로 나누고 골목(1m)을 둔다.
  const rows: ReadonlyArray<{ side: -1 | 1; floors: readonly number[] }> = [
    { side: -1, floors: spec.westFloors },
    { side: 1, floors: spec.eastFloors },
  ];
  for (const { side, floors } of rows) {
    const count = floors.length;
    const width = (spec.length - (count - 1) * buildingGap) / count;
    floors.forEach((floorCount, index) => {
      const centerZ = -spec.length / 2 + width / 2 + index * (width + buildingGap);
      parts.push(...buildingParts(side, centerZ, width, floorCount, index + (side === 1 ? 2 : 0), facadeX, spec));
    });
  }

  // 가로등·가로수: 길이에 비례한 개수를 균등 간격으로 놓는다. 나무는 가로등에서 간격의 1/4 만큼 엇갈린다.
  const props = Math.max(2, Math.round(spec.length / 18));
  const pitch = spec.length / props;
  for (let index = 0; index < props; index += 1) {
    const lampZ = -spec.length / 2 + (index + 0.5) * pitch;
    for (const side of [-1, 1] as const) {
      parts.push(...lampParts(side, lampZ, roadHalf));
      parts.push(...treeParts(side, lampZ + pitch / 4, roadHalf));
    }
  }

  // 벤치: 서쪽 보도의 건물 쪽에 한 개. 좌판 윗면이 보도 위 0.45m.
  const benchX = -(facadeX - 0.55);
  const benchZ = -spec.length / 2 + pitch / 4;
  parts.push(
    part("box", "벤치 좌판", COLORS.bench, [benchX, curbHeight + 0.425, benchZ], [0.45, 0.05, 1.5]),
    part("box", "벤치 등받이", COLORS.bench, [benchX - 0.2, curbHeight + 0.7, benchZ], [0.05, 0.45, 1.5]),
    part("box", "벤치 다리", COLORS.benchBase, [benchX, curbHeight + 0.2, benchZ], [0.3, 0.4, 1.3]),
  );

  // 차량 2대: 오른쪽 차로(+X)와 왼쪽 차로(-X)에 한 대씩.
  parts.push(...carParts(spec.laneWidth / 2, -spec.length / 6, CAR_COLORS[0]));
  parts.push(...carParts(-spec.laneWidth / 2, spec.length / 7, CAR_COLORS[1]));

  // 횡단보도: 차선과 나란한(Z 방향) 줄무늬, 폭 0.5m, 피치 1.0m, 길이 3.0m — 도로 폭 안에 들어가는 만큼.
  const stripeCount = Math.floor((roadHalf * 2 - 0.5) / 1);
  for (let index = 0; index < stripeCount; index += 1) {
    const x = (index - (stripeCount - 1) / 2) * 1;
    parts.push(part("box", "횡단보도 줄무늬", COLORS.crosswalk, [x, 0.011, 0], [0.5, 0.02, 3]));
  }

  // 중앙선 점선(횡단보도 구간은 비운다).
  for (const z of [-spec.length * 0.39, -spec.length * 0.28, spec.length * 0.28, spec.length * 0.39]) {
    parts.push(part("box", "중앙선 점선", COLORS.centerLine, [0, 0.011, z], [0.12, 0.02, 2]));
  }

  return parts;
}

// ── BgPrimitive 전개 ────────────────────────────────────────────────────────

export interface StudioBg3dStreetBuildPlan {
  readonly primitives: BgPrimitive[];
  /** 기존 도형과 겹치지 않도록 거리 전체에 더한 X 오프셋(m). */
  readonly anchorX: number;
}

/** 도로·보도·양쪽 건물 깊이를 합한 거리 단면 폭(m). 룸 빌더와 같은 "기존 도형 수 x 폭/6" 오프셋 규약에 쓴다. */
export function studioBg3dStreetFootprintWidth(spec: StudioBg3dStreetSpec): number {
  return (spec.laneWidth + spec.sidewalkWidth + STUDIO_BG3D_STREET_LIMITS.buildingDepth) * 2;
}

/**
 * 룸 빌더·씬 템플릿과 같은 "결정적 X 오프셋 + uid" 전개. 테스트는 idFactory 를 주입해 완전 결정적으로 검증한다.
 */
export function planStudioBg3dStreetBuild(
  rawSpec: Partial<StudioBg3dStreetSpec>,
  existingCount: number,
  idFactory: () => string = uid,
): StudioBg3dStreetBuildPlan {
  const spec = clampStudioBg3dStreetSpec(rawSpec);
  const anchorX = existingCount > 0 ? existingCount * (studioBg3dStreetFootprintWidth(spec) / 6) : 0;
  const primitives = buildStudioBg3dStreetParts(spec).map((entry): BgPrimitive => ({
    id: idFactory(),
    kind: entry.kind,
    name: entry.name,
    position: [entry.position[0] + anchorX, entry.position[1], entry.position[2]],
    rotation: [...entry.rotation] as [number, number, number],
    scale: [...entry.scale] as [number, number, number],
    color: entry.color,
  }));
  return { primitives, anchorX };
}
