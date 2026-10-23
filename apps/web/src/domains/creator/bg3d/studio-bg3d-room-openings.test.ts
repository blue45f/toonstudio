import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptStudioBg3dWallOpenings,
  buildStudioBg3dRoomParts,
  clampStudioBg3dRoomSpec,
  layoutStudioBg3dWallSegments,
  planStudioBg3dRoomBuild,
  STUDIO_BG3D_ROOM_PRESETS,
  STUDIO_BG3D_ROOM_WALL_IDS,
  type StudioBg3dRoomOpening,
  type StudioBg3dRoomPart,
  type StudioBg3dRoomSpec,
  type StudioBg3dRoomWallId,
} from "./studio-bg3d-room-builder";
import {
  overlappingPairs,
  testBoundsInside,
  testBoxBounds,
  testBoxOf,
  type StudioBg3dTestBounds,
} from "./studio-bg3d-room-geometry.test-fixture";
import {
  clampStudioBg3dRoomOpeningStyleFields,
  STUDIO_BG3D_ROOM_GLASS_OVERRIDE,
  STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS,
  STUDIO_BG3D_ROOM_OPENING_STYLES,
  STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE,
  studioBg3dRoomWallFrame,
  type StudioBg3dOpeningStyle,
} from "./studio-bg3d-room-openings";
import { buildStudioBg3dSurfacePresetOverride } from "./studio-bg3d-surface-presets";
import { getStudioBg3dWebtoonBackground } from "./studio-bg3d-webtoon-background-templates";

// 개구부 부품의 계약을 고정한다: 스타일이 없으면 예전과 바이트가 같고, 스타일마다 부품 수가 정해져 있으며, 어떤 열림·경첩·
// 벽·두께에서도 부품이 벽체를 뚫지 않고 개구부 기둥(벽-로컬 u·y 사각형) 밖으로 나가지 않는다. 닫힌 부품은 벽 두께 안에 있다.

/** 2026-10-23 변경 전(HEAD 8ef318ad5) 6 프리셋의 파츠·계획 직렬화 해시. 스타일·천장·몰딩 필드가 없는 스펙의 출력이 같아야 한다. */
const PRESET_PARTS_SHA256 = "b81c0cd881ee503a66ee5da72962400cd165fc0d4b46a02bb86bf5f51868829a";
const PRESET_PLANS_SHA256 = "d199b56cbc881d8faafbc6ada1d18fc8a592dc350c7ffbbb8d47c31d9bd2e4ab";

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** 스타일별 부품 수(짝 1 / 짝 2). 문틀 3·창틀 4 를 포함한다. */
const EXPECTED_PART_COUNT: Record<StudioBg3dOpeningStyle, readonly [one: number, two: number]> = {
  hole: [0, 0],
  "hinged-door": [5, 5],
  "sliding-door": [5, 7],
  "glass-door": [5, 7],
  "window-sliding": [6, 6],
  "window-casement": [5, 6],
  "roller-blind": [7, 7],
  shutter: [4, 4],
};

const WALL_LABEL_PREFIX: Record<StudioBg3dRoomWallId, string> = { north: "뒷벽", south: "앞벽", west: "왼벽", east: "오른벽" };

function doorFor(wall: StudioBg3dRoomWallId, extra: Partial<StudioBg3dRoomOpening>): StudioBg3dRoomOpening {
  return { wall, type: "door", centerOffset: 0.4, width: 1.6, height: 2.1, sillHeight: 0, ...extra };
}

function windowFor(wall: StudioBg3dRoomWallId, extra: Partial<StudioBg3dRoomOpening>): StudioBg3dRoomOpening {
  return { wall, type: "window", centerOffset: -0.3, width: 1.6, height: 1.2, sillHeight: 0.9, ...extra };
}

function roomWith(opening: StudioBg3dRoomOpening, thickness: number): StudioBg3dRoomSpec {
  return clampStudioBg3dRoomSpec({ width: 7, depth: 6, wallHeight: 3, wallThickness: thickness, openings: [opening], furniture: [] });
}

const isWallSegment = (part: StudioBg3dRoomPart) => part.name.endsWith(" 벽체");
const isFloor = (part: StudioBg3dRoomPart) => part.name === "바닥";
const openingPartsOf = (parts: readonly StudioBg3dRoomPart[]) => parts.filter((part) => !isWallSegment(part) && !isFloor(part));

/** 개구부 상자(벽-로컬 사각형 × 범위 n)의 월드 경계. */
function gapBounds(spec: StudioBg3dRoomSpec, wall: StudioBg3dRoomWallId, rect: { left: number; right: number; bottom: number; top: number }, n: readonly [number, number]): StudioBg3dTestBounds {
  const frame = studioBg3dRoomWallFrame(wall, spec.width, spec.depth, spec.wallThickness);
  const corners = [rect.left, rect.right].flatMap((u) => n.map((depth) => frame.toWorld(u, depth)));
  const xs = corners.map(([x]) => x);
  const zs = corners.map(([, z]) => z);
  return { min: [Math.min(...xs), rect.bottom, Math.min(...zs)], max: [Math.max(...xs), rect.top, Math.max(...zs)] };
}

describe("개구부 스타일 카탈로그", () => {
  it("1단계 스타일 8종이 있고 모두 한글 이름이 있으며 문·창마다 고를 수 있는 목록이 정해져 있다", () => {
    expect(STUDIO_BG3D_ROOM_OPENING_STYLES).toHaveLength(8);
    for (const style of STUDIO_BG3D_ROOM_OPENING_STYLES) expect(STUDIO_BG3D_ROOM_OPENING_STYLE_LABELS[style]).toMatch(/[가-힣]/u);
    expect(STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE.door).toEqual(["hole", "hinged-door", "sliding-door", "glass-door", "shutter"]);
    expect(STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE.window).toEqual(["hole", "window-sliding", "window-casement", "roller-blind", "shutter"]);
  });

  it("부품 유리는 표면 프리셋 '유리'와 같은 재질이다(값을 복제했지만 어긋나지 않는다)", () => {
    expect(STUDIO_BG3D_ROOM_GLASS_OVERRIDE).toEqual(buildStudioBg3dSurfacePresetOverride("glass"));
  });

  it("선택 필드는 주어진 키만 남기고, 종류에 맞지 않는 스타일·범위 밖 값은 고치거나 버린다", () => {
    expect(clampStudioBg3dRoomOpeningStyleFields({}, "door")).toEqual({});
    expect(Object.keys(clampStudioBg3dRoomOpeningStyleFields({ style: "hinged-door" }, "door"))).toEqual(["style"]);
    expect(clampStudioBg3dRoomOpeningStyleFields({ style: "window-sliding" }, "door")).toEqual({});
    expect(clampStudioBg3dRoomOpeningStyleFields({ style: "shoji" as never }, "window")).toEqual({});
    expect(clampStudioBg3dRoomOpeningStyleFields({ openRatio: 4, hinge: "up" as never, divisions: 2.6 }, "window"))
      .toEqual({ openRatio: 1, divisions: 3 });
    expect(clampStudioBg3dRoomOpeningStyleFields({ openRatio: Number.NaN, divisions: -9 }, "door")).toEqual({ divisions: 1 });
  });

  it("스타일 필드가 있는 스펙도 clamp 고정점이다(저장된 값이 곧 렌더되는 값)", () => {
    const spec = clampStudioBg3dRoomSpec({
      width: 6,
      depth: 5,
      openings: [
        doorFor("south", { style: "hinged-door", openRatio: 0.3, hinge: "right" }),
        windowFor("east", { style: "window-casement", divisions: 1 }),
      ],
      ceiling: "coffered",
      trims: {
        baseboard: { enabled: true, heightM: 0.1, depthM: 0.02 },
        crown: { style: "cove", heightM: 0.12 },
        wainscot: { enabled: false, heightM: 0.9 },
        chairRail: true,
      },
    });
    expect(clampStudioBg3dRoomSpec(spec)).toEqual(spec);
    expect(JSON.stringify(clampStudioBg3dRoomSpec(spec))).toBe(JSON.stringify(spec));
  });
});

describe("스타일이 없는 스펙은 예전 출력과 바이트가 같다", () => {
  it("6 프리셋의 파츠·생성 계획(자동 단면 포함) 해시가 변경 전과 같다", () => {
    expect(sha256(STUDIO_BG3D_ROOM_PRESETS.map((preset) => buildStudioBg3dRoomParts(preset.spec)))).toBe(PRESET_PARTS_SHA256);
    const plans = STUDIO_BG3D_ROOM_PRESETS.map((preset) => {
      let next = 0;
      return planStudioBg3dRoomBuild(preset.spec, 3, () => `g-${next++}`, {
        autoCutawayCamera: { position: [4, 3, 6], target: [0, 0.6, 0] },
      });
    });
    expect(sha256(plans)).toBe(PRESET_PLANS_SHA256);
  });

  it("빈 구멍(hole) 스타일은 부품을 만들지 않는다", () => {
    const hole = buildStudioBg3dRoomParts(roomWith(doorFor("south", { style: "hole" }), 0.15));
    const none = buildStudioBg3dRoomParts(roomWith(doorFor("south", {}), 0.15));
    expect(hole).toEqual(none);
  });

  it("개구부 판정은 벽 세그먼트 레이아웃과 같은 결과다(받아들인 개구부 = 세그먼트가 비운 칸)", () => {
    const openings = [
      { centerOffset: -2, width: 0.9, height: 2.1, sillHeight: 0 },
      { centerOffset: 1.5, width: 1.5, height: 1.1, sillHeight: 1 },
      { centerOffset: 1.8, width: 1, height: 1, sillHeight: 1 }, // 앞의 것과 겹쳐 탈락
    ];
    const accepted = acceptStudioBg3dWallOpenings(10, 3, openings);
    expect(accepted.map((entry) => entry.opening)).toEqual([openings[0], openings[1]]);
    const segments = layoutStudioBg3dWallSegments(10, 3, openings);
    const area = segments.reduce((sum, segment) => sum + segment.lengthU * segment.height, 0);
    const holes = accepted.reduce((sum, entry) => sum + (entry.right - entry.left) * (entry.top - entry.bottom), 0);
    expect(area).toBeCloseTo(30 - holes, 10);
  });
});

const OPEN_RATIOS = [0, 0.35, 1] as const;
const THICKNESSES = [0.05, 0.15, 0.3] as const;

describe("스타일 × 열림 × 경첩 × 짝 수 × 벽 × 두께: 부품 경계", () => {
  for (const style of STUDIO_BG3D_ROOM_OPENING_STYLES.filter((candidate) => candidate !== "hole")) {
    it(`${style}: 부품 수가 정해져 있고 벽체를 뚫지 않으며 개구부 기둥 안에 있다`, () => {
      let checked = 0;
      for (const wall of STUDIO_BG3D_ROOM_WALL_IDS) {
        for (const thickness of THICKNESSES) {
          for (const openRatio of OPEN_RATIOS) {
            for (const hinge of ["left", "right"] as const) {
              for (const divisions of [1, 2]) {
                const isDoor = STUDIO_BG3D_ROOM_OPENING_STYLES_BY_TYPE.door.includes(style);
                const raw = isDoor
                  ? doorFor(wall, { style, openRatio, hinge, divisions })
                  : windowFor(wall, { style, openRatio, hinge, divisions });
                const spec = roomWith(raw, thickness);
                const opening = spec.openings[0]!;
                const parts = buildStudioBg3dRoomParts(spec);
                const walls = parts.filter(isWallSegment).map(testBoxOf);
                const extra = openingPartsOf(parts);
                const label = `${style}/${wall}/t${thickness}/r${openRatio}/${hinge}/${divisions}`;

                expect(extra, label).toHaveLength(EXPECTED_PART_COUNT[style][divisions - 1]!);
                for (const part of extra) {
                  expect(part.name.startsWith(`${WALL_LABEL_PREFIX[wall]} `), `${label} ${part.name}`).toBe(true);
                  expect(part.wall, label).toBe(wall);
                  expect(part.kind, label).toBe("box");
                  expect([...part.position, ...part.scale, ...part.rotation].every(Number.isFinite), label).toBe(true);
                  expect(part.scale.every((value) => value > 0), `${label} ${part.name} ${part.scale.join(",")}`).toBe(true);
                  expect(part.rotation[0], label).toBe(0);
                  expect(part.rotation[2], label).toBe(0);
                  expect(part.rotation[1] >= -Math.PI && part.rotation[1] < Math.PI, label).toBe(true);
                }
                // 벽체(모든 벽의 세그먼트)와 겹침 0, 부품끼리도 겹침 0.
                expect(overlappingPairs(extra.map(testBoxOf), walls), label).toEqual([]);
                expect(overlappingPairs(extra.map(testBoxOf), extra.map(testBoxOf), true), label).toEqual([]);
                // 개구부 기둥: 벽-로컬 u·y 는 받아들인 사각형 안. 닫혀 있으면(열림 0) 벽 두께 안까지.
                const [accepted] = acceptStudioBg3dWallOpenings(
                  wall === "north" || wall === "south" ? spec.width : spec.depth,
                  spec.wallHeight,
                  [opening],
                );
                const column = gapBounds(spec, wall, accepted!, [-50, 50]);
                const gap = gapBounds(spec, wall, accepted!, [-spec.wallThickness / 2, spec.wallThickness / 2]);
                for (const part of extra) {
                  const bounds = testBoxBounds(testBoxOf(part));
                  const alongX = wall === "north" || wall === "south";
                  const columnBounds: StudioBg3dTestBounds = alongX
                    ? { min: [column.min[0], column.min[1], -1e9], max: [column.max[0], column.max[1], 1e9] }
                    : { min: [-1e9, column.min[1], column.min[2]], max: [1e9, column.max[1], column.max[2]] };
                  expect(testBoundsInside(bounds, columnBounds), `${label} ${part.name} 기둥`).toBe(true);
                  if (openRatio === 0 && style !== "roller-blind" && style !== "shutter") {
                    expect(testBoundsInside(bounds, gap), `${label} ${part.name} 닫힘`).toBe(true);
                  }
                }
                if (style === "roller-blind" || style === "shutter") {
                  // 블라인드·셔터는 열림과 무관하게 언제나 벽 두께 안이다(말아 올리거나 내릴 뿐).
                  for (const part of extra) expect(testBoundsInside(testBoxBounds(testBoxOf(part)), gap), `${label} ${part.name}`).toBe(true);
                }
                checked += 1;
              }
            }
          }
        }
      }
      expect(checked).toBe(4 * THICKNESSES.length * OPEN_RATIOS.length * 2 * 2);
    });
  }

  it("검사기는 실제 결함을 잡아낸다(합성 결함): 문틀을 벽 쪽으로 밀거나 문짝을 벽 밖으로 빼면 걸린다", () => {
    const spec = roomWith(doorFor("north", { style: "hinged-door", openRatio: 0.35 }), 0.15);
    const parts = buildStudioBg3dRoomParts(spec);
    const walls = parts.filter(isWallSegment).map(testBoxOf);
    const extra = openingPartsOf(parts);
    expect(overlappingPairs(extra.map(testBoxOf), walls)).toEqual([]);
    const shifted = extra.map((part) => part.name === "뒷벽 문틀"
      ? { ...part, position: [part.position[0] - 0.03, part.position[1], part.position[2]] as const }
      : part);
    expect(overlappingPairs(shifted.map(testBoxOf), walls).length).toBeGreaterThan(0);
    // 요 회전한 문짝도 분리축 판정으로 잡는다(축 정렬 경계만 보면 놓친다).
    const leaf = extra.find((part) => part.name === "뒷벽 문짝")!;
    const intoWall = { ...leaf, position: [leaf.position[0] - 0.8, leaf.position[1], -3] as const };
    expect(overlappingPairs([testBoxOf(intoWall)], walls).length).toBeGreaterThan(0);
    const [accepted] = acceptStudioBg3dWallOpenings(spec.width, spec.wallHeight, spec.openings);
    const gap = gapBounds(spec, "north", accepted!, [-spec.wallThickness / 2, spec.wallThickness / 2]);
    expect(testBoundsInside(testBoxBounds(testBoxOf(leaf)), gap)).toBe(false);
  });

  it("유리 부품만 유리 재질을 갖고 나머지는 재질 없이 색만 쓴다", () => {
    const glassy = buildStudioBg3dRoomParts(roomWith(windowFor("east", { style: "window-sliding" }), 0.15));
    const withOverride = glassy.filter((part) => part.materialOverride);
    expect(withOverride.map((part) => part.name)).toEqual(["오른벽 창짝", "오른벽 창짝"]);
    expect(withOverride.every((part) => part.materialOverride === STUDIO_BG3D_ROOM_GLASS_OVERRIDE)).toBe(true);
    const plan = planStudioBg3dRoomBuild(roomWith(windowFor("east", { style: "window-sliding" }), 0.15), 0, () => "x");
    const sashes = plan.primitives.filter((primitive) => primitive.materialOverride);
    expect(sashes).toHaveLength(2);
    // 계획은 재질을 복사해 도형마다 따로 갖는다(한 도형을 고쳐도 다른 도형이 바뀌지 않는다).
    expect(sashes[0]!.materialOverride).not.toBe(sashes[1]!.materialOverride);
    expect(sashes[0]!.materialOverride).toEqual(STUDIO_BG3D_ROOM_GLASS_OVERRIDE);
  });
});

describe("원클릭 웹툰 배경(교실·복도)의 문·창 부품은 사람 크기를 지킨다", () => {
  // 기준은 웹툰 배경 사람 크기 시험(studio-bg3d-webtoon-background-human-scale.test.ts)의 RANGES 와 같은 값이다:
  // 문 높이 1.9–2.5·폭 0.8–1.8 m, 창턱 0.8–1.2 m, 사람 눈금 1.6 m 의 1.2배 머리 여유.
  const HUMAN = 1.6;
  for (const id of ["classroom", "corridor"] as const) {
    it(`${id}: 문틀 안쪽(지나가는 폭·높이)과 창짝 아래끝이 사람 크기 범위다`, () => {
      const entry = getStudioBg3dWebtoonBackground(id);
      if (entry?.kind !== "room") throw new Error("방 항목이 아닙니다");
      const parts = buildStudioBg3dRoomParts(entry.spec);
      for (const wall of STUDIO_BG3D_ROOM_WALL_IDS) {
        const prefix = WALL_LABEL_PREFIX[wall];
        const frames = parts.filter((part) => part.name === `${prefix} 문틀`);
        // 문틀은 문마다 3조각(좌우 문설주 + 위 틀): 위 틀 아랫면 = 지나가는 높이, 문설주 사이 = 지나가는 폭.
        const heads = frames.filter((part) => part.scale[1] < 0.2);
        const doors = entry.spec.openings.filter((opening) => opening.wall === wall && opening.type === "door");
        expect(heads, `${id}/${wall}`).toHaveLength(doors.length);
        for (const head of heads) {
          const bounds = testBoxBounds(testBoxOf(head));
          expect(bounds.min[1], `${id}/${wall} 지나가는 높이`).toBeGreaterThanOrEqual(HUMAN * 1.2);
          const span = wall === "north" || wall === "south" ? bounds.max[0] - bounds.min[0] : bounds.max[2] - bounds.min[2];
          expect(span, `${id}/${wall} 지나가는 폭`).toBeGreaterThanOrEqual(0.8);
          expect(span, `${id}/${wall} 지나가는 폭`).toBeLessThanOrEqual(1.8);
        }
        for (const sash of parts.filter((part) => part.name === `${prefix} 창짝`)) {
          const bottom = testBoxBounds(testBoxOf(sash)).min[1];
          expect(bottom, `${id}/${wall} 창짝 아래끝`).toBeGreaterThanOrEqual(0.8);
          expect(bottom, `${id}/${wall} 창짝 아래끝`).toBeLessThanOrEqual(1.25);
        }
      }
    });
  }
});

describe("열림·경첩의 뜻", () => {
  const leafOf = (parts: readonly StudioBg3dRoomPart[], name: string) => parts.find((part) => part.name === name)!;

  it("여닫이문은 열림 0 이면 회전이 없고, 1 이면 방 안으로 90° 돌아 경첩 쪽 문설주 옆에 선다", () => {
    const closed = buildStudioBg3dRoomParts(roomWith(doorFor("north", { style: "hinged-door", openRatio: 0 }), 0.15));
    const open = buildStudioBg3dRoomParts(roomWith(doorFor("north", { style: "hinged-door", openRatio: 1, hinge: "left" }), 0.15));
    expect(leafOf(closed, "뒷벽 문짝").rotation).toEqual([0, 0, 0]);
    const leaf = leafOf(open, "뒷벽 문짝");
    expect(Math.abs(Math.cos(leaf.rotation[1]))).toBeLessThan(1e-9);
    // 북벽(z = -3) 안쪽은 +z. 열린 문짝은 경첩에서 방 안으로 문 폭만큼 뻗고, 벽 바깥(-z)으로는 나가지 않는다.
    const bounds = testBoxBounds(testBoxOf(leaf));
    expect(bounds.min[2]).toBeGreaterThan(-3);
    expect(bounds.max[2]).toBeGreaterThan(-3 + 1.4);
    // 왼쪽 경첩: 문 중심(u=0.4)보다 왼쪽(북벽 +u=+x 이므로 x 가 작은 쪽)에 선다.
    expect(leaf.position[0]).toBeLessThan(0.4 - 0.5);
    const right = leafOf(buildStudioBg3dRoomParts(roomWith(doorFor("north", { style: "hinged-door", openRatio: 1, hinge: "right" }), 0.15)), "뒷벽 문짝");
    expect(right.position[0]).toBeGreaterThan(0.4 + 0.5);
  });

  it("여닫이 창은 바깥으로 열린다(방 안 가구·블라인드와 부딪히지 않는다)", () => {
    const open = buildStudioBg3dRoomParts(roomWith(windowFor("north", { style: "window-casement", openRatio: 1 }), 0.15));
    const sashes = open.filter((part) => part.name === "뒷벽 창짝");
    expect(sashes).toHaveLength(2);
    for (const sash of sashes) {
      // 북벽 바깥은 -z. 활짝 연 창짝은 벽 중심선(z = -3)보다 바깥에만 있다.
      expect(testBoxBounds(testBoxOf(sash)).max[2]).toBeLessThanOrEqual(-3 + 1e-6);
      expect(testBoxBounds(testBoxOf(sash)).min[2]).toBeLessThan(-3 - 0.5);
    }
  });

  it("미닫이 한 짝은 열수록 보이는 폭이 줄고, 끝까지 열어도 손잡이 끝 6cm 가 남는다", () => {
    const widthAt = (openRatio: number) => leafOf(
      buildStudioBg3dRoomParts(roomWith(doorFor("north", { style: "sliding-door", width: 1.1, divisions: 1, openRatio }), 0.15)),
      "뒷벽 문짝",
    ).scale[0];
    expect(widthAt(0)).toBeCloseTo(1.0, 10);
    expect(widthAt(0.5)).toBeCloseTo(0.5, 10);
    expect(widthAt(1)).toBeCloseTo(0.06, 10);
  });

  it("롤스크린은 열림(올림) 1 일 때 가장 짧고 0 일 때 창턱까지 내려온다, 셔터도 같은 뜻이다", () => {
    const screenHeight = (openRatio: number) => leafOf(
      buildStudioBg3dRoomParts(roomWith(windowFor("east", { style: "roller-blind", openRatio }), 0.15)),
      "오른벽 롤스크린",
    ).scale[1];
    expect(screenHeight(0)).toBeGreaterThan(screenHeight(0.5));
    expect(screenHeight(1)).toBeCloseTo(0.02, 10);
    const panelHeight = (openRatio: number) => leafOf(
      buildStudioBg3dRoomParts(roomWith(doorFor("south", { style: "shutter", openRatio }), 0.15)),
      "앞벽 셔터",
    ).scale[1];
    expect(panelHeight(0)).toBeGreaterThan(1.5);
    expect(panelHeight(1)).toBeCloseTo(0.03, 10);
  });

  it("짝 수를 고르지 않으면 폭으로 정한다(미닫이·유리문 1.4m, 여닫이 창 1m 부터 두 짝)", () => {
    const count = (opening: StudioBg3dRoomOpening) => openingPartsOf(buildStudioBg3dRoomParts(roomWith(opening, 0.15))).length;
    expect(count(doorFor("south", { style: "sliding-door", width: 1.0 }))).toBe(5);
    expect(count(doorFor("south", { style: "sliding-door", width: 1.6 }))).toBe(7);
    expect(count(doorFor("south", { style: "glass-door", width: 1.6 }))).toBe(7);
    expect(count(windowFor("east", { style: "window-casement", width: 0.8 }))).toBe(5);
    expect(count(windowFor("east", { style: "window-casement", width: 1.6 }))).toBe(6);
  });

  it("옆벽 두께와 겹치는 모서리 개구부는 안쪽 면에서 잘라 부품을 두고, 너무 작으면 빈 구멍으로 둔다", () => {
    const corner = clampStudioBg3dRoomSpec({
      width: 4,
      depth: 4,
      wallThickness: 0.6,
      openings: [{ wall: "north", type: "door", centerOffset: -1.35, width: 1.1, height: 2.1, sillHeight: 0, style: "hinged-door" }],
    });
    const parts = buildStudioBg3dRoomParts(corner);
    const extra = openingPartsOf(parts).map(testBoxOf);
    expect(extra.length).toBe(5);
    expect(overlappingPairs(extra, parts.filter(isWallSegment).map(testBoxOf))).toEqual([]);
    for (const box of extra) expect(testBoxBounds(box).min[0]).toBeGreaterThanOrEqual(-2 + 0.3 - 1e-6);
    const tiny = clampStudioBg3dRoomSpec({
      width: 4,
      depth: 4,
      wallThickness: 0.6,
      // u ∈ [-1.9, -1.5] 중 옆벽 안쪽 면(-1.7) 안쪽은 0.2m 뿐이다.
      openings: [{ wall: "north", type: "door", centerOffset: -1.7, width: 0.4, height: 2.1, sillHeight: 0, style: "hinged-door" }],
    });
    expect(tiny.openings[0]!.centerOffset).toBe(-1.7);
    expect(openingPartsOf(buildStudioBg3dRoomParts(tiny))).toEqual([]);
  });
});
