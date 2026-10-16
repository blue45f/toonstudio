import { describe, expect, it } from "vitest";

import {
  buildStudioBg3dRoomParts,
  evaluateStudioBg3dRoomAutoCutaway,
  getStudioBg3dRoomPreset,
  instantiateStudioBg3dRoomBuild,
  planStudioBg3dRoomBuild,
  STUDIO_BG3D_ROOM_PRESETS,
  STUDIO_BG3D_ROOM_WALL_IDS,
  STUDIO_BG3D_ROOM_WALL_LABELS,
  type StudioBg3dRoomWallId,
} from "./studio-bg3d-room-builder";

// 편집기 첫 화면의 기본 카메라(studio-bg3d-editor-derivations 의 default 프리셋과 같은 값).
const DEFAULT_CAMERA = { position: [4, 3, 6], target: [0, 0.6, 0] } as const;

function sorted(walls: ReadonlySet<StudioBg3dRoomWallId>): StudioBg3dRoomWallId[] {
  return [...walls].sort();
}

describe("buildStudioBg3dRoomParts 의 벽 소속 표시", () => {
  it("벽체 파츠만 자기 벽을 가리키고 바닥·가구는 벽 소속이 없다", () => {
    for (const preset of STUDIO_BG3D_ROOM_PRESETS) {
      const parts = buildStudioBg3dRoomParts(preset.spec);
      const wallsSeen = new Set<StudioBg3dRoomWallId>();
      for (const part of parts) {
        const owner = STUDIO_BG3D_ROOM_WALL_IDS.find(
          (wall) => part.name === `${STUDIO_BG3D_ROOM_WALL_LABELS[wall]} 벽체`,
        );
        expect(part.wall, `${preset.id}/${part.name}`).toBe(owner);
        if (owner) wallsSeen.add(owner);
      }
      // 오프닝이 어느 벽을 얼마나 잘게 쪼개든 네 벽 모두 최소 한 개의 벽체를 갖는다.
      expect(sorted(wallsSeen)).toEqual([...STUDIO_BG3D_ROOM_WALL_IDS].sort());
    }
  });
});

describe("evaluateStudioBg3dRoomAutoCutaway", () => {
  const room = { roomWidth: 6, roomDepth: 5 } as const;

  it("scene-3d v2 에서 옮겨 온 기준 사례: 앞(+Z) 바깥에서 중심을 보면 앞벽만 가린다", () => {
    const cut = evaluateStudioBg3dRoomAutoCutaway({
      cameraPosition: [0, 2, 8],
      focusPoint: [0, 1, 0],
      ...room,
    });
    expect(sorted(cut)).toEqual(["south"]);
    expect(cut.has("north")).toBe(false);
  });

  it.each([
    ["north", [0, 2, -8]],
    ["south", [0, 2, 8]],
    ["west", [-9, 2, 0]],
    ["east", [9, 2, 0]],
  ] as const)("%s 바깥에서 안쪽을 바라보면 그 벽 하나만 가린다", (wall, cameraPosition) => {
    const cut = evaluateStudioBg3dRoomAutoCutaway({ cameraPosition, focusPoint: [0, 1, 0], ...room });
    expect(sorted(cut)).toEqual([wall]);
  });

  it("모서리 바깥에서 보면 맞닿은 두 벽을 함께 가린다", () => {
    const cut = evaluateStudioBg3dRoomAutoCutaway({
      cameraPosition: [-8, 2, -8],
      focusPoint: [0, 1, 0],
      ...room,
    });
    expect(sorted(cut)).toEqual(["north", "west"]);
  });

  it("방 안에 있는 카메라는 아무 벽도 가리지 않는다", () => {
    const cut = evaluateStudioBg3dRoomAutoCutaway({
      cameraPosition: [1, 1.6, 1],
      focusPoint: [-2, 1.4, -2],
      ...room,
    });
    expect(cut.size).toBe(0);
  });

  it("벽 평면 위에 선 카메라와 바깥으로 등지고 있는 카메라는 가리지 않는다", () => {
    // 카메라가 정확히 남벽 평면(z = +2.5) 위: 엄격히 바깥이 아니다.
    expect(
      evaluateStudioBg3dRoomAutoCutaway({ cameraPosition: [0, 2, 2.5], focusPoint: [0, 1, 0], ...room }).size,
    ).toBe(0);
    // 남쪽 바깥이지만 초점이 카메라보다 더 바깥(남쪽)이라 방을 등지고 있다.
    expect(
      evaluateStudioBg3dRoomAutoCutaway({ cameraPosition: [0, 2, 8], focusPoint: [0, 1, 12], ...room }).size,
    ).toBe(0);
  });

  describe("벽 높이를 알려 주면(생성 경로) 시선이 벽 윗단 위로 지나는 낮은 벽은 남긴다", () => {
    it("옥상 난간(1.1m)은 높은 카메라가 내려다볼 때 가리지 않는다", () => {
      const input = {
        cameraPosition: [0, 8, 12],
        focusPoint: [0, 0, 0],
        roomWidth: 9,
        roomDepth: 8,
      } as const;
      // 남쪽 평면(z=4)을 지나는 시선 높이 = 8 + (4-12)/(0-12) * (0-8) ≈ 2.67m > 1.1m
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway({ ...input, wallHeight: 1.1 }))).toEqual([]);
      // 같은 위치라도 벽 높이를 모르면 v2 처럼 위치만으로 가린다.
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway(input))).toEqual(["south"]);
    });

    it("3m 벽은 같은 높이의 시선이 아래로 지나므로 가린다", () => {
      const cut = evaluateStudioBg3dRoomAutoCutaway({
        cameraPosition: [0, 2, 12],
        focusPoint: [0, 1, 0],
        roomWidth: 8,
        roomDepth: 7,
        wallHeight: 3,
      });
      expect(sorted(cut)).toEqual(["south"]);
    });

    it("시선이 벽 윗단과 정확히 같은 높이로 지나면 가리고, 조금이라도 위면 남긴다", () => {
      // 남쪽 평면(z = 2.5) 통과 높이 = 4 + 0.6875 * (0 - 4) = 1.25m (모두 이진수로 정확히 표현되는 값)
      const base = { cameraPosition: [0, 4, 8], focusPoint: [0, 0, 0], ...room } as const;
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway({ ...base, wallHeight: 1.25 }))).toEqual(["south"]);
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway({ ...base, wallHeight: 1.2 }))).toEqual([]);
    });

    it("동·서 벽도 같은 높이 규칙을 따른다", () => {
      const base = { cameraPosition: [12, 8, 0], focusPoint: [0, 0, 0], roomWidth: 9, roomDepth: 8 } as const;
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway({ ...base, wallHeight: 1.1 }))).toEqual([]);
      expect(sorted(evaluateStudioBg3dRoomAutoCutaway({ ...base, wallHeight: 3 }))).toEqual(["east"]);
    });
  });

  it("유한하지 않은 입력에서는 아무 벽도 가리지 않는다", () => {
    expect(
      evaluateStudioBg3dRoomAutoCutaway({ cameraPosition: [0, 2, Number.NaN], focusPoint: [0, 1, 0], ...room }).size,
    ).toBe(0);
    expect(
      evaluateStudioBg3dRoomAutoCutaway({ cameraPosition: [0, 2, 8], focusPoint: [0, 1, 0], roomWidth: Number.POSITIVE_INFINITY, roomDepth: 5 }).size,
    ).toBe(0);
  });
});

describe("planStudioBg3dRoomBuild", () => {
  const classroom = getStudioBg3dRoomPreset("classroom")!.spec;
  let counter = 0;
  const idFactory = () => `plan-${counter++}`;

  it("자동 단면 카메라를 주지 않으면 예전 instantiate 결과와 같고 숨긴 파츠가 없다", () => {
    counter = 0;
    const plan = planStudioBg3dRoomBuild(classroom, 0, idFactory);
    counter = 0;
    const legacy = instantiateStudioBg3dRoomBuild(classroom, 0, idFactory);
    expect(plan.primitives).toEqual(legacy);
    expect(plan.hiddenWalls).toEqual([]);
    expect(plan.anchorX).toBe(0);
    for (const primitive of plan.primitives) expect("visible" in primitive).toBe(false);
  });

  it("카메라가 null 이어도 단면을 적용하지 않는다", () => {
    const plan = planStudioBg3dRoomBuild(classroom, 0, idFactory, { autoCutawayCamera: null });
    expect(plan.hiddenWalls).toEqual([]);
    expect(plan.primitives.some((primitive) => primitive.visible === false)).toBe(false);
  });

  it("가린 벽의 벽체만 visible:false 로 만들고, 아무것도 지우지 않는다", () => {
    const camera = { position: [0, 2, 12], target: [0, 1, 0] } as const;
    const withCutaway = planStudioBg3dRoomBuild(classroom, 0, idFactory, { autoCutawayCamera: camera });
    const without = planStudioBg3dRoomBuild(classroom, 0, idFactory);
    expect(withCutaway.hiddenWalls).toEqual(["south"]);
    // 파츠 수와 지오메트리는 그대로 — 지워진 것이 없다.
    expect(withCutaway.primitives).toHaveLength(without.primitives.length);
    const strip = (primitives: typeof without.primitives) =>
      primitives.map(({ visible: _visible, id: _id, ...rest }) => rest);
    expect(strip(withCutaway.primitives)).toEqual(strip(without.primitives));
    // 숨김은 앞벽 벽체에만: 문 2개가 있는 앞벽은 여러 조각이고 전부 숨겨진다.
    const hidden = withCutaway.primitives.filter((primitive) => primitive.visible === false);
    expect(hidden.length).toBeGreaterThan(1);
    expect(hidden.every((primitive) => primitive.name === `${STUDIO_BG3D_ROOM_WALL_LABELS.south} 벽체`)).toBe(true);
    const southSegments = buildStudioBg3dRoomParts(classroom).filter((part) => part.wall === "south");
    expect(hidden).toHaveLength(southSegments.length);
    // 나머지(바닥·다른 벽·가구)는 visible 키 자체가 없다.
    for (const primitive of withCutaway.primitives) {
      if (primitive.visible !== false) expect("visible" in primitive).toBe(false);
    }
  });

  it("먼저 놓인 방 때문에 옆으로 밀린 방은 밀린 만큼 뺀 방-로컬 좌표로 판정한다", () => {
    // classroom 폭 8 → 기존 도형 6개면 X 오프셋 = 6 * 8/6 = 8m. 방은 월드 x ∈ [4, 12] 에 놓인다.
    const outside = planStudioBg3dRoomBuild(classroom, 6, idFactory, {
      autoCutawayCamera: { position: [0, 2, 0], target: [8, 1, 0] },
    });
    expect(outside.anchorX).toBe(8);
    // 월드 x=0 은 오프셋을 무시하면 방 안(x ∈ [-4, 4])이지만 실제 방은 [4, 12] 라 서쪽 바깥이다.
    expect(outside.hiddenWalls).toEqual(["west"]);

    // 반대로, 월드 x=10 은 오프셋을 무시하면 동쪽 바깥(> 4)이지만 실제로는 방 안쪽 열이다 — 앞벽만 가려야 한다.
    const withinColumn = planStudioBg3dRoomBuild(classroom, 6, idFactory, {
      autoCutawayCamera: { position: [10, 2, 8], target: [8, 1, 0] },
    });
    expect(withinColumn.hiddenWalls).toEqual(["south"]);
  });

  it("편집기 기본 카메라에서 프리셋별로 가려지는 벽이 정해져 있다(회귀 고정)", () => {
    const hiddenByPreset = Object.fromEntries(
      STUDIO_BG3D_ROOM_PRESETS.map((preset) => [
        preset.id,
        planStudioBg3dRoomBuild(preset.spec, 0, idFactory, { autoCutawayCamera: DEFAULT_CAMERA }).hiddenWalls,
      ]),
    );
    expect(hiddenByPreset).toEqual({
      // 카메라 x=4 는 교실 동쪽 벽 평면(x=4) 위라 엄격히 바깥이 아니다.
      classroom: ["south"],
      cafe: ["south", "east"],
      "studio-flat": ["south", "east"],
      corridor: ["south"],
      // 벽 높이 1.1m 난간은 기본 카메라의 시선이 윗단 위로 지나므로 가리지 않는다.
      rooftop: [],
      study: ["south", "east"],
    });
  });

  it("스펙의 비정상 값은 clamp 한 뒤 판정한다", () => {
    const plan = planStudioBg3dRoomBuild(
      { ...classroom, width: Number.NaN, depth: 9999, wallHeight: -3 },
      0,
      idFactory,
      { autoCutawayCamera: { position: [0, 0.5, 40], target: [0, 0.5, 0] } },
    );
    expect(plan.primitives.length).toBeGreaterThan(4);
    for (const primitive of plan.primitives) {
      expect(primitive.position.every(Number.isFinite)).toBe(true);
    }
    expect(plan.hiddenWalls).toEqual(["south"]);
  });
});
