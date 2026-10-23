// 웹툰 배경 원클릭 카탈로그 — 교실·복도·거리.
//
// 기존 씬 템플릿 24종(studio-background-3d-scene-templates.ts)은 장난감 비례(책상 윗면 0.56m, 거리의 건물 높이 2.2m)라
// 사람을 세워 구도를 잡는 용도로 쓰기 어려웠다. 여기 항목은 같은 룸 빌더·거리 생성기로 사람 크기 스펙을 새로 짠 것이다
// (문 2.1m, 책상 윗면 0.72m, 층고 3m). 허용 범위는 웹툰 배경 사람 크기 테스트가 고정한다.
//
// 결과는 장면 문서의 일반 도형 노드(BgPrimitive[])라 추가 뒤에도 벽·책상·가로등을 하나씩 고르고 옮기고 지울 수 있다.
// 이 모듈은 선택기(StudioBg3dWebtoonBackgroundPicker)와 같은 지연 청크에서만 쓴다 — 편집기 활성화 번들에 넣지 않는다.
//
// 교실·복도는 룸 빌더의 개구부 스타일(미닫이문·미서기 창·유리문)·평천장·걸레받이를 쓴다(2026-10-23). 빈 구멍 대신 문틀·
// 문짝·창틀·유리창이 생겨 노드가 늘었다(교실 99 → 134, 복도 39 → 100). 같은 학교 장면(교실 + 복도)은 기본 장면 예산
// 256 안에 들어가지만, 거리(96)까지 셋을 한 장면에 넣으면 예산을 넘는다 — 템플릿 시험이 이 경계를 고정한다.

import {
  clampStudioBg3dRoomSpec,
  planStudioBg3dRoomBuild,
  type StudioBg3dRoomFurnitureItem,
  type StudioBg3dRoomOpening,
  type StudioBg3dRoomSpec,
  type StudioBg3dRoomWallId,
} from "./studio-bg3d-room-builder";
import {
  planStudioBg3dStreetBuild,
  STUDIO_BG3D_STREET_DEFAULT_SPEC,
  type StudioBg3dStreetSpec,
} from "./studio-bg3d-street-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

const CLASSROOM_SLIDING_DOOR = { style: "sliding-door" } as const;
const SCHOOL_WINDOW = { style: "window-sliding" } as const;
/** 학교 바닥 걸레받이(높이 10cm, 두께 1.5cm). 나머지 몰딩은 쓰지 않는다. */
const SCHOOL_TRIMS = {
  baseboard: { enabled: true, heightM: 0.1, depthM: 0.015 },
  crown: { style: "none", heightM: 0.1 },
  wainscot: { enabled: false, heightM: 0.9 },
  chairRail: false,
} as const;

export const STUDIO_BG3D_WEBTOON_BACKGROUND_IDS = ["classroom", "corridor", "street"] as const;
export type StudioBg3dWebtoonBackgroundId = (typeof STUDIO_BG3D_WEBTOON_BACKGROUND_IDS)[number];

interface EntryBase {
  readonly id: StudioBg3dWebtoonBackgroundId;
  readonly label: string;
  /** 스펙에서 계산한 한 줄 설명 — 수치가 스펙과 어긋날 수 없다. */
  readonly description: string;
}

export interface StudioBg3dWebtoonRoomEntry extends EntryBase {
  readonly kind: "room";
  readonly spec: StudioBg3dRoomSpec;
}

export interface StudioBg3dWebtoonStreetEntry extends EntryBase {
  readonly kind: "street";
  readonly spec: StudioBg3dStreetSpec;
}

export type StudioBg3dWebtoonBackgroundEntry = StudioBg3dWebtoonRoomEntry | StudioBg3dWebtoonStreetEntry;

// ── 교실 ────────────────────────────────────────────────────────────────────
// 9.0 x 7.5m, 천장 3.0m. 북쪽 벽에 칠판, 서쪽(복도 쪽) 벽에 앞뒤 문, 동쪽 벽에 창 3개, 남쪽(뒤) 벽에 사물함.
// 학생은 칠판(북쪽, -Z)을 본다: 책걸상 앞면이 +Z 이므로 yaw 180.

const CLASSROOM_WIDTH = 9;
const CLASSROOM_DEPTH = 7.5;
const CLASSROOM_WALL_THICKNESS = 0.15;

function wallInnerOffset(thickness: number, half: number): number {
  return half - thickness / 2;
}

function classroomSpec(): StudioBg3dRoomSpec {
  const halfDepth = CLASSROOM_DEPTH / 2;
  const northInner = -wallInnerOffset(CLASSROOM_WALL_THICKNESS, halfDepth);
  const southInner = wallInnerOffset(CLASSROOM_WALL_THICKNESS, halfDepth);
  const deskSets: StudioBg3dRoomFurnitureItem[] = [];
  // 열 간격 1.5m(책상 폭 0.6m + 통로 0.9m), 줄 간격 1.4m(책걸상 깊이 0.8m + 통로 0.6m).
  for (const z of [-0.6, 0.8, 2.2]) {
    for (const x of [-2.25, -0.75, 0.75, 2.25]) deskSets.push({ kind: "deskSet", x, z, yawDeg: 180 });
  }
  return clampStudioBg3dRoomSpec({
    width: CLASSROOM_WIDTH,
    depth: CLASSROOM_DEPTH,
    wallHeight: 3,
    wallThickness: CLASSROOM_WALL_THICKNESS,
    floorColor: "#cdb98f",
    wallColor: "#f2ead8",
    openings: [
      // 서쪽 벽: 안에서 볼 때 +오프셋이 북쪽(-Z). 앞문은 칠판 쪽, 뒷문은 뒤쪽. 둘 다 위가 유리인 미닫이문.
      { wall: "west", type: "door", centerOffset: 2.6, width: 1, height: 2.1, sillHeight: 0, ...CLASSROOM_SLIDING_DOOR },
      { wall: "west", type: "door", centerOffset: -2.6, width: 1, height: 2.1, sillHeight: 0, ...CLASSROOM_SLIDING_DOOR },
      // 동쪽 벽: 오프셋 = Z 좌표. 두 짝 미서기 창.
      { wall: "east", type: "window", centerOffset: -2.4, width: 1.8, height: 1.3, sillHeight: 0.9, ...SCHOOL_WINDOW },
      { wall: "east", type: "window", centerOffset: 0, width: 1.8, height: 1.3, sillHeight: 0.9, ...SCHOOL_WINDOW },
      { wall: "east", type: "window", centerOffset: 2.4, width: 1.8, height: 1.3, sillHeight: 0.9, ...SCHOOL_WINDOW },
    ],
    ceiling: "flat",
    trims: SCHOOL_TRIMS,
    furniture: [
      // 칠판 뒷면이 북쪽 벽 안쪽 면에 닿는다(틀 두께 0.05m의 절반 0.025m).
      { kind: "blackboard", x: 0, z: northInner + 0.025, yawDeg: 0 },
      { kind: "podium", x: -2.4, z: -2.8, yawDeg: 0 },
      // 사물함 뒷면(0.225m)이 남쪽 벽 안쪽 면에 닿고 앞면은 교실 안(-Z)을 본다.
      { kind: "locker", x: -3, z: southInner - 0.225, yawDeg: 180 },
      ...deskSets,
    ],
  });
}

// ── 복도 ────────────────────────────────────────────────────────────────────
// 15 x 2.6m, 천장 3.0m. 북쪽 벽에 교실 문 4개와 그 사이 사물함, 남쪽 벽에 창 4개, 동쪽 끝에 양문.

const CORRIDOR_WIDTH = 15;
const CORRIDOR_DEPTH = 2.6;
const CORRIDOR_WALL_THICKNESS = 0.15;

function corridorSpec(): StudioBg3dRoomSpec {
  const northInner = -wallInnerOffset(CORRIDOR_WALL_THICKNESS, CORRIDOR_DEPTH / 2);
  const classroomDoors: StudioBg3dRoomOpening[] = [-5.25, -1.75, 1.75, 5.25].map((centerOffset) => ({
    wall: "north",
    type: "door",
    centerOffset,
    width: 1,
    height: 2.1,
    sillHeight: 0,
    ...CLASSROOM_SLIDING_DOOR,
  }));
  const windows: StudioBg3dRoomOpening[] = [-5.25, -1.75, 1.75, 5.25].map((centerOffset) => ({
    wall: "south",
    type: "window",
    centerOffset,
    width: 1.5,
    height: 1.3,
    sillHeight: 1,
    ...SCHOOL_WINDOW,
  }));
  return clampStudioBg3dRoomSpec({
    width: CORRIDOR_WIDTH,
    depth: CORRIDOR_DEPTH,
    wallHeight: 3,
    wallThickness: CORRIDOR_WALL_THICKNESS,
    floorColor: "#d4d0c4",
    wallColor: "#eef0f2",
    openings: [
      ...classroomDoors,
      ...windows,
      // 복도 끝 양문 유리문.
      { wall: "east", type: "door", centerOffset: 0, width: 1.6, height: 2.1, sillHeight: 0, style: "glass-door" },
    ],
    ceiling: "flat",
    trims: SCHOOL_TRIMS,
    // 사물함은 문과 문 사이 빈 벽(폭 2.5m)에 한 단(폭 1.8m)씩. 복도 쪽 앞면(+Z)을 본다.
    furniture: [-3.5, 0, 3.5].map((x): StudioBg3dRoomFurnitureItem => ({
      kind: "locker",
      x,
      z: northInner + 0.225,
      yawDeg: 0,
    })),
  });
}

// ── 설명·카탈로그 ───────────────────────────────────────────────────────────

function formatMeters(value: number): string {
  return `${Number(value.toFixed(2))}m`;
}

function formatSize(spec: StudioBg3dRoomSpec): string {
  return `${Number(spec.width.toFixed(2))}×${Number(spec.depth.toFixed(2))}m`;
}

function countOpenings(spec: StudioBg3dRoomSpec, type: "door" | "window"): number {
  return spec.openings.filter((opening) => opening.type === type).length;
}

function countFurniture(spec: StudioBg3dRoomSpec, kind: StudioBg3dRoomFurnitureItem["kind"]): number {
  return spec.furniture.filter((item) => item.kind === kind).length;
}

function describeClassroom(spec: StudioBg3dRoomSpec): string {
  return `${formatSize(spec)} · 천장 ${formatMeters(spec.wallHeight)} · 문 ${countOpenings(spec, "door")}개 · 창 ${countOpenings(spec, "window")}개 · 책걸상 ${countFurniture(spec, "deskSet")}세트 · 칠판·교탁·사물함`;
}

function describeCorridor(spec: StudioBg3dRoomSpec): string {
  return `${formatSize(spec)} · 천장 ${formatMeters(spec.wallHeight)} · 문 ${countOpenings(spec, "door")}개 · 창 ${countOpenings(spec, "window")}개 · 사물함 ${countFurniture(spec, "locker")}단`;
}

function describeStreet(spec: StudioBg3dStreetSpec): string {
  const buildings = spec.westFloors.length + spec.eastFloors.length;
  return `길이 ${formatMeters(spec.length)} · 왕복 2차로 · 보도 ${formatMeters(spec.sidewalkWidth)} · 건물 ${buildings}채 · 가로등·가로수·차량`;
}

function createCatalog(): readonly StudioBg3dWebtoonBackgroundEntry[] {
  const classroom = classroomSpec();
  const corridor = corridorSpec();
  const street = STUDIO_BG3D_STREET_DEFAULT_SPEC;
  return Object.freeze([
    { id: "classroom", label: "교실", kind: "room", spec: classroom, description: describeClassroom(classroom) },
    { id: "corridor", label: "복도", kind: "room", spec: corridor, description: describeCorridor(corridor) },
    { id: "street", label: "거리", kind: "street", spec: street, description: describeStreet(street) },
  ]);
}

export const STUDIO_BG3D_WEBTOON_BACKGROUNDS: readonly StudioBg3dWebtoonBackgroundEntry[] = createCatalog();

export function getStudioBg3dWebtoonBackground(id: unknown): StudioBg3dWebtoonBackgroundEntry | null {
  return typeof id === "string"
    ? STUDIO_BG3D_WEBTOON_BACKGROUNDS.find((entry) => entry.id === id) ?? null
    : null;
}

// ── 생성 ────────────────────────────────────────────────────────────────────

export interface StudioBg3dWebtoonBackgroundBuildOptions {
  /** 테스트가 결정적 id 를 주입한다. 기본은 공용 uid. */
  readonly idFactory?: () => string;
  /** 주어지면 방 항목에서 카메라를 가리는 벽을 숨김 상태로 만든다(거리에는 벽이 없어 영향 없음). */
  readonly autoCutawayCamera?: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  } | null;
}

export interface StudioBg3dWebtoonBackgroundBuild {
  readonly entry: StudioBg3dWebtoonBackgroundEntry;
  readonly primitives: BgPrimitive[];
  readonly hiddenWalls: readonly StudioBg3dRoomWallId[];
  readonly anchorX: number;
}

/**
 * 카탈로그 항목 하나를 장면에 더할 도형 묶음으로 전개한다. 알 수 없는 id 면 null.
 * existingCount 는 기존 도형 수로, 룸 빌더·씬 템플릿과 같은 X 오프셋 규약으로 겹침을 피한다.
 */
export function buildStudioBg3dWebtoonBackground(
  id: unknown,
  existingCount: number,
  options: StudioBg3dWebtoonBackgroundBuildOptions = {},
): StudioBg3dWebtoonBackgroundBuild | null {
  const entry = getStudioBg3dWebtoonBackground(id);
  if (!entry) return null;
  if (entry.kind === "street") {
    const plan = planStudioBg3dStreetBuild(entry.spec, existingCount, options.idFactory);
    return { entry, primitives: plan.primitives, hiddenWalls: [], anchorX: plan.anchorX };
  }
  const plan = planStudioBg3dRoomBuild(entry.spec, existingCount, options.idFactory, {
    autoCutawayCamera: options.autoCutawayCamera ?? null,
  });
  return { entry, primitives: plan.primitives, hiddenWalls: plan.hiddenWalls, anchorX: plan.anchorX };
}
