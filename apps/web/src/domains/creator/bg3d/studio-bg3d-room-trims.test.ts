import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M } from "./studio-bg3d-scale-guide";
import {
  acceptStudioBg3dWallOpenings,
  buildStudioBg3dRoomParts,
  clampStudioBg3dRoomSpec,
  planStudioBg3dRoomBuild,
  STUDIO_BG3D_ROOM_LIMITS,
  STUDIO_BG3D_ROOM_PRESETS,
  STUDIO_BG3D_ROOM_WALL_IDS,
  type StudioBg3dRoomOpening,
  type StudioBg3dRoomPart,
  type StudioBg3dRoomSpec,
} from "./studio-bg3d-room-builder";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES } from "./studio-bg3d-scene-document-types";
import { overlappingPairs, testBoxBounds, testBoxOf } from "./studio-bg3d-room-geometry.test-fixture";
import { STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE, type StudioBg3dOpeningStyle } from "./studio-bg3d-room-openings";
import {
  clampStudioBg3dRoomCeiling,
  clampStudioBg3dRoomTrims,
  DEFAULT_STUDIO_BG3D_ROOM_TRIMS,
  evaluateStudioBg3dRoomCeilingCutaway,
  resolveStudioBg3dRoomTrimBands,
  STUDIO_BG3D_ROOM_CEILING_STYLES,
  STUDIO_BG3D_ROOM_CEILING_THICKNESS,
  STUDIO_BG3D_ROOM_CROWN_STYLES,
  type StudioBg3dRoomTrims,
} from "./studio-bg3d-room-trims";

// 몰딩·천장의 계약: 선택 필드가 없으면 아무것도 더하지 않고, 몰딩은 벽 안쪽 면에 붙어 문·창에서 끊기며 서로·벽체·문창
// 부품과 겹치지 않고, 모서리는 빈틈 없이 맞댄다. 천장은 벽 위에 얹혀 실내 층고 = 벽 높이를 지킨다.

const HUMAN = STUDIO_BG3D_SCALE_GUIDE_HEIGHT_M;

const ALL_TRIMS: StudioBg3dRoomTrims = {
  baseboard: { enabled: true, heightM: 0.1, depthM: 0.02 },
  crown: { style: "cove", heightM: 0.15 },
  wainscot: { enabled: true, heightM: 1.0 },
  chairRail: true,
};

const isWallSegment = (part: StudioBg3dRoomPart) => part.name.endsWith(" 벽체");
const TRIM_NAME = /(걸레받이|징두리|의자 레일|크라운 몰딩)$/u;
const isTrim = (part: StudioBg3dRoomPart) => TRIM_NAME.test(part.name);
const isCeiling = (part: StudioBg3dRoomPart) => part.ceiling === true;
const isOpeningPart = (part: StudioBg3dRoomPart) =>
  part.wall !== undefined && !isWallSegment(part) && !isTrim(part);

/** 프리셋의 문·창에 스타일을 입힌 스펙(열림까지 바꿔 가며 겹침을 본다). */
function styledPreset(
  spec: StudioBg3dRoomSpec,
  doorStyle: StudioBg3dOpeningStyle,
  windowStyle: StudioBg3dOpeningStyle,
  openRatio: number,
  extra: Partial<StudioBg3dRoomSpec> = {},
): StudioBg3dRoomSpec {
  return clampStudioBg3dRoomSpec({
    ...spec,
    ...extra,
    openings: spec.openings.map((opening): StudioBg3dRoomOpening => ({
      ...opening,
      style: opening.type === "door" ? doorStyle : windowStyle,
      openRatio,
    })),
  });
}

describe("몰딩·천장 선택 필드 clamp", () => {
  it("값이 없거나 객체가 아니면 키를 만들지 않는다", () => {
    expect(clampStudioBg3dRoomTrims(undefined)).toBeUndefined();
    expect(clampStudioBg3dRoomTrims("all")).toBeUndefined();
    expect(clampStudioBg3dRoomCeiling("grid-tile")).toBeUndefined();
    expect(clampStudioBg3dRoomCeiling(undefined)).toBeUndefined();
    for (const style of STUDIO_BG3D_ROOM_CEILING_STYLES) expect(clampStudioBg3dRoomCeiling(style)).toBe(style);
    const spec = clampStudioBg3dRoomSpec({ width: 6, depth: 5 });
    expect(spec).not.toHaveProperty("ceiling");
    expect(spec).not.toHaveProperty("trims");
  });

  it("빠진 하위 값은 기본값(모두 꺼짐)으로 채우고 범위 밖 값은 한도로 누른다", () => {
    expect(clampStudioBg3dRoomTrims({})).toEqual(DEFAULT_STUDIO_BG3D_ROOM_TRIMS);
    const trims = clampStudioBg3dRoomTrims({
      baseboard: { enabled: true, heightM: 9, depthM: -1 },
      crown: { style: "baroque", heightM: 0 },
      wainscot: { enabled: "yes", heightM: 0.1 },
      chairRail: 1,
    });
    expect(trims).toEqual({
      baseboard: { enabled: true, heightM: 0.2, depthM: 0.01 },
      crown: { style: "none", heightM: 0.04 },
      wainscot: { enabled: false, heightM: 0.6 },
      chairRail: false,
    });
    expect(clampStudioBg3dRoomTrims(trims)).toEqual(trims);
  });
});

describe("몰딩 단 쌓기", () => {
  it("아래부터 걸레받이 → 징두리 → 의자 레일 → 크라운 순으로 겹치지 않게 쌓는다", () => {
    const bands = resolveStudioBg3dRoomTrimBands(ALL_TRIMS, 3);
    expect(bands.map((band) => band.name)).toEqual(["걸레받이", "징두리", "의자 레일", "크라운 몰딩", "크라운 몰딩", "크라운 몰딩"]);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.y[0]).toBeGreaterThanOrEqual(bands[index - 1]!.y[1] - 1e-9);
    }
    expect(bands.at(-1)!.y[1]).toBe(3);
    // 의자 레일은 징두리 윗단에 얹힌다.
    expect(bands[2]!.y[0]).toBe(bands[1]!.y[1]);
  });

  it("크라운은 평 1단·계단형 2단·곡선형 3단이고 위로 갈수록 깊어진다", () => {
    for (const [style, count] of [["flat", 1], ["stepped", 2], ["cove", 3]] as const) {
      const crown = resolveStudioBg3dRoomTrimBands({ ...DEFAULT_STUDIO_BG3D_ROOM_TRIMS, crown: { style, heightM: 0.12 } }, 2.8);
      expect(crown).toHaveLength(count);
      for (let index = 1; index < crown.length; index += 1) expect(crown[index]!.depth).toBeGreaterThan(crown[index - 1]!.depth);
    }
    expect(STUDIO_BG3D_ROOM_CROWN_STYLES).toEqual(["none", "flat", "stepped", "cove"]);
  });

  it("낮은 벽(2m 미만, 옥상 난간)에는 걸레받이만 둔다", () => {
    expect(resolveStudioBg3dRoomTrimBands(ALL_TRIMS, 1.1).map((band) => band.name)).toEqual(["걸레받이"]);
    expect(resolveStudioBg3dRoomTrimBands(ALL_TRIMS, 0.4)).toEqual([]);
  });
});

describe("몰딩 부품 배치", () => {
  const doorStyles = STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE.door;
  const windowStyles = STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE.window;

  it.each(STUDIO_BG3D_ROOM_PRESETS.map((preset) => [preset.id, preset] as const))(
    "%s: 모든 스타일·열림에서 몰딩이 벽체·문창 부품·서로와 겹치지 않는다",
    (_id, preset) => {
      for (const [index, doorStyle] of doorStyles.entries()) {
        for (const openRatio of [0, 1]) {
          const windowStyle = windowStyles[index % windowStyles.length]!;
          const spec = styledPreset(preset.spec, doorStyle, windowStyle, openRatio, { trims: ALL_TRIMS, ceiling: "coffered" });
          const parts = buildStudioBg3dRoomParts(spec);
          const trims = parts.filter(isTrim).map(testBoxOf);
          const label = `${preset.id}/${doorStyle}/${windowStyle}/${openRatio}`;
          expect(overlappingPairs(trims, parts.filter(isWallSegment).map(testBoxOf)), label).toEqual([]);
          expect(overlappingPairs(trims, parts.filter(isOpeningPart).map(testBoxOf)), label).toEqual([]);
          expect(overlappingPairs(trims, trims, true), label).toEqual([]);
        }
      }
    },
  );

  it("걸레받이는 문 앞에서 끊기고, 창턱보다 높은 징두리·의자 레일은 창 아래 높이에서 끊긴다", () => {
    const classroom = STUDIO_BG3D_ROOM_PRESETS.find((preset) => preset.id === "classroom")!.spec;
    const spec = clampStudioBg3dRoomSpec({ ...classroom, trims: ALL_TRIMS });
    const parts = buildStudioBg3dRoomParts(spec);
    const southBase = parts.filter((part) => part.name === "앞벽 걸레받이");
    // 남벽 문 2개 → 걸레받이 3토막. 남벽 +u = -x 이므로 문 중심 x = -오프셋.
    expect(southBase).toHaveLength(3);
    for (const door of spec.openings.filter((opening) => opening.wall === "south")) {
      const doorX = [-door.centerOffset - door.width / 2, -door.centerOffset + door.width / 2];
      for (const run of southBase) {
        const bounds = testBoxBounds(testBoxOf(run));
        expect(bounds.max[0] <= doorX[0]! + 1e-9 || bounds.min[0] >= doorX[1]! - 1e-9).toBe(true);
      }
    }
    // 동벽 창 3개(창턱 1m) — 걸레받이(0.1m)는 이어지고, 징두리(1m 까지)·의자 레일(1–1.04m)은 창마다 끊긴다.
    expect(parts.filter((part) => part.name === "오른벽 걸레받이")).toHaveLength(1);
    expect(parts.filter((part) => part.name === "오른벽 징두리")).toHaveLength(1);
    expect(parts.filter((part) => part.name === "오른벽 의자 레일")).toHaveLength(4);
  });

  it("모서리는 맞댐 이음이다: 앞·뒷벽 몰딩은 옆벽 안쪽 면까지, 옆벽 몰딩은 그 몰딩 깊이에서 시작한다", () => {
    const spec = clampStudioBg3dRoomSpec({ width: 6, depth: 5, wallThickness: 0.2, trims: ALL_TRIMS, openings: [] });
    const parts = buildStudioBg3dRoomParts(spec);
    const north = testBoxBounds(testBoxOf(parts.find((part) => part.name === "뒷벽 걸레받이")!));
    const west = testBoxBounds(testBoxOf(parts.find((part) => part.name === "왼벽 걸레받이")!));
    const innerX = 3 - 0.1;
    const innerZ = 2.5 - 0.1;
    expect(north.min[0]).toBeCloseTo(-innerX, 10);
    expect(north.max[0]).toBeCloseTo(innerX, 10);
    expect(north.max[2]).toBeCloseTo(-innerZ + 0.02, 10);
    expect(west.min[2]).toBeCloseTo(north.max[2], 10);
    expect(west.max[2]).toBeCloseTo(innerZ - 0.02, 10);
    expect(west.min[0]).toBeCloseTo(-innerX, 10);
  });

  it("몰딩은 벽에 속해 자동 단면이 숨긴 벽과 함께 숨는다", () => {
    const corridor = STUDIO_BG3D_ROOM_PRESETS.find((preset) => preset.id === "corridor")!.spec;
    const spec = styledPreset(corridor, "sliding-door", "window-sliding", 0, { trims: ALL_TRIMS });
    const plan = planStudioBg3dRoomBuild(spec, 0, undefined, { autoCutawayCamera: { position: [0, 1.6, 9], target: [0, 1, 0] } });
    expect(plan.hiddenWalls).toEqual(["south"]);
    const hidden = plan.primitives.filter((primitive) => primitive.visible === false);
    expect(hidden.every((primitive) => primitive.name?.startsWith("앞벽 "))).toBe(true);
    expect(hidden.some((primitive) => primitive.name === "앞벽 걸레받이")).toBe(true);
    expect(hidden.some((primitive) => primitive.name === "앞벽 창짝")).toBe(true);
    const shown = plan.primitives.filter((primitive) => primitive.visible !== false);
    expect(shown.some((primitive) => primitive.name?.startsWith("앞벽 "))).toBe(false);
  });
});

describe("천장", () => {
  const base = { width: 8, depth: 6, wallHeight: 3, wallThickness: 0.2, openings: [], furniture: [] };

  it("평천장은 벽 위에 얹힌 판 하나다: 아랫면 = 벽 높이(실내 층고), 방 바깥 둘레를 덮는다", () => {
    const parts = buildStudioBg3dRoomParts({ ...base, ceiling: "flat" });
    const ceiling = parts.filter(isCeiling);
    expect(ceiling).toHaveLength(1);
    const slab = testBoxBounds(testBoxOf(ceiling[0]!));
    expect(slab.min[1]).toBeCloseTo(3, 10);
    expect(slab.max[1]).toBeCloseTo(3 + STUDIO_BG3D_ROOM_CEILING_THICKNESS, 10);
    expect(slab.max[0] - slab.min[0]).toBeCloseTo(8.2, 10);
    expect(slab.max[2] - slab.min[2]).toBeCloseTo(6.2, 10);
    expect(ceiling[0]!.wall).toBeUndefined();
    expect(buildStudioBg3dRoomParts({ ...base, ceiling: "none" }).some(isCeiling)).toBe(false);
  });

  it("서까래는 짧은 쪽으로 걸쳐 2–12개, 우물반자 보는 8개 이하이고 두 방향 깊이가 다르다", () => {
    const rafters = buildStudioBg3dRoomParts({ ...base, ceiling: "rafter" }).filter((part) => part.name === "천장 서까래");
    expect(rafters.length).toBeGreaterThanOrEqual(2);
    expect(rafters.length).toBeLessThanOrEqual(12);
    // 깊이(z) 6 이 짧은 쪽 → 서까래는 z 방향으로 걸친다.
    expect(rafters.every((part) => part.scale[2] > part.scale[0])).toBe(true);
    const huge = buildStudioBg3dRoomParts({ ...base, width: 30, depth: 30, ceiling: "rafter" }).filter((part) => part.name === "천장 서까래");
    expect(huge).toHaveLength(12);
    const coffers = buildStudioBg3dRoomParts({ ...base, width: 30, depth: 30, ceiling: "coffered" }).filter((part) => part.name === "천장 우물 보");
    expect(coffers.length).toBeLessThanOrEqual(8);
    expect(new Set(coffers.map((part) => part.scale[1])).size).toBe(2);
  });

  it("천장 보는 벽체와 겹치지 않고 보 아래로 사람이 지나간다(사람 눈금 × 1.2 이상)", () => {
    for (const ceiling of ["rafter", "coffered"] as const) {
      const spec = clampStudioBg3dRoomSpec({ ...base, wallHeight: STUDIO_BG3D_ROOM_LIMITS.minWallHeight + 1.4, ceiling });
      const parts = buildStudioBg3dRoomParts(spec);
      const beams = parts.filter((part) => isCeiling(part) && part.name !== "천장");
      expect(beams.length).toBeGreaterThan(0);
      expect(overlappingPairs(beams.map(testBoxOf), parts.filter(isWallSegment).map(testBoxOf))).toEqual([]);
      for (const beam of beams) expect(testBoxBounds(testBoxOf(beam)).min[1]).toBeGreaterThanOrEqual(HUMAN * 1.2);
    }
  });

  it("자동 단면: 위에서 내려다보는 카메라만 천장을 숨긴다(천장 높이·방 안·옆에서 보는 카메라는 남긴다)", () => {
    const spec = { ...base, ceiling: "rafter" as const };
    const view = (position: readonly [number, number, number], target: readonly [number, number, number] = [0, 0.6, 0]) =>
      planStudioBg3dRoomBuild(spec, 0, undefined, { autoCutawayCamera: { position, target } });
    const above = view([4, 9, 7]);
    expect(above.hiddenCeiling).toBe(true);
    const ceilingParts = above.primitives.filter((primitive) => primitive.name?.startsWith("천장"));
    expect(ceilingParts.length).toBeGreaterThan(1);
    expect(ceilingParts.every((primitive) => primitive.visible === false)).toBe(true);
    // 편집기 기본 카메라(높이 3m = 벽 높이)·방 안·멀리 옆에서 낮게: 천장을 남긴다.
    for (const position of [[4, 3, 6], [0, 1.6, 0], [30, 4, 0]] as const) {
      const plan = view(position);
      expect(plan.hiddenCeiling, position.join(",")).toBeUndefined();
      expect(plan.primitives.filter((primitive) => primitive.name?.startsWith("천장")).every((primitive) => primitive.visible !== false)).toBe(true);
    }
    expect(evaluateStudioBg3dRoomCeilingCutaway({
      cameraPosition: [Number.NaN, 9, 0], focusPoint: [0, 0, 0], roomWidth: 8, roomDepth: 6, wallThickness: 0.2, wallHeight: 3,
    })).toBe(false);
    // 천장이 없으면 숨길 것도 없다.
    expect(planStudioBg3dRoomBuild(base, 0, undefined, { autoCutawayCamera: { position: [4, 9, 7], target: [0, 0.6, 0] } }).hiddenCeiling).toBeUndefined();
  });
});

describe("노드 수 예산", () => {
  it("가장 무거운 조합(개구부 12 × 최다 부품 스타일 + 몰딩 전부 + 우물반자 + 가구 24)도 문서 하드 한도 안이다", () => {
    const openings = STUDIO_BG3D_ROOM_WALL_IDS.flatMap((wall) => [-6, 0, 6].map((centerOffset, index): StudioBg3dRoomOpening =>
      index === 1
        ? { wall, type: "window", centerOffset, width: 1.8, height: 1.4, sillHeight: 0.9, style: "roller-blind", divisions: 2 }
        : { wall, type: "door", centerOffset, width: 1.8, height: 2.1, sillHeight: 0, style: "glass-door", divisions: 2 }));
    const spec = clampStudioBg3dRoomSpec({
      width: 20,
      depth: 20,
      wallHeight: 3.2,
      openings,
      trims: ALL_TRIMS,
      ceiling: "coffered",
      furniture: Array.from({ length: STUDIO_BG3D_ROOM_LIMITS.maxFurniture }, (_, index) => ({ kind: "deskSet", x: index % 5, z: Math.floor(index / 5), yawDeg: 0 })),
    });
    for (const wall of STUDIO_BG3D_ROOM_WALL_IDS) {
      expect(acceptStudioBg3dWallOpenings(20, 3.2, spec.openings.filter((opening) => opening.wall === wall))).toHaveLength(3);
    }
    const count = buildStudioBg3dRoomParts(spec).length;
    expect(count).toBeLessThanOrEqual(STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES);
    expect(count).toBeGreaterThan(256);
  });
});
