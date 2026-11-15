import { describe, expect, it } from "vitest";
import {
  addStudioVirtualDecoration,
  studioVirtualDecorationPreset,
} from "./studio-virtual-space-customization";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";
import { createStudioLightFixture } from "./studio-virtual-space-lighting";
import { STUDIO_DAY_NIGHT_CYCLE_MS } from "./studio-virtual-space-day-night-cycle";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import {
  STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX,
  appendStudioVirtualSceneSnapshot,
  createStudioVirtualSceneSnapshot,
  duplicateStudioVirtualSceneSnapshot,
  planStudioVirtualSceneSnapshotRestore,
  removeStudioVirtualSceneSnapshot,
  summarizeStudioVirtualSceneState,
  type StudioVirtualSceneStateInput,
} from "./studio-virtual-space-scene-snapshot";

function makeSampleState(): StudioVirtualSceneStateInput {
  const baseDecor = addStudioVirtualDecoration(
    studioVirtualDecorationPreset("creator-garden"),
    "lamp",
    { x: 420, y: 360 },
  );
  return {
    camera: { zoomLevel: 1.25, panOffsetX: 48, panOffsetY: -32 },
    lighting: {
      dayNightEnabled: true,
      dayNightSpeedMs: STUDIO_DAY_NIGHT_CYCLE_MS,
      lightHourOverride: 19,
      lightAutoMode: false,
      cycleTimeOfDay: 0.78,
      fixtures: [
        createStudioLightFixture({
          id: "lamp-1",
          kind: "floor-lamp",
          position: { x: 300, y: 280 },
          dimmer: 0.85,
          on: true,
        }),
      ],
    },
    environment: {
      ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
      backdrop: "coast",
      dayPhase: "dusk",
      weather: "petals",
    },
    spaceTheme: "sunset-harbor",
    atmosphere: "lively",
    furniture: {
      decorations: baseDecor,
      placedFixtureRequests: [
        {
          entryId: "light:floor-lamp",
          category: "light",
          refId: "floor-lamp",
          point: { x: 460, y: 380 },
          rotation: 90,
        },
      ],
    },
  };
}

describe("studio-virtual-space-scene-snapshot", () => {
  it("deep-clones and freezes camera, lighting, and furniture so rearranging or restoring a clone never mutates stored snapshots", () => {
    const state = makeSampleState();
    const original = createStudioVirtualSceneSnapshot(state, {
      id: "snap-1",
      name: "노을 정원 배치",
    });
    const listWithClone = duplicateStudioVirtualSceneSnapshot([original], "snap-1", {
      id: "snap-1-clone",
    });
    expect(listWithClone).not.toBeNull();
    expect(listWithClone).toHaveLength(2);
    const clone = listWithClone![1]!;
    expect(clone.name).toBe("노을 정원 배치 복제본");
    expect(clone.clonedFromId).toBe("snap-1");
    expect(Object.isFrozen(clone)).toBe(true);
    expect(Object.isFrozen(clone.furniture.decorations.placements)).toBe(true);

    const expectedSummary = summarizeStudioVirtualSceneState(clone, 12);

    const firstRestore = planStudioVirtualSceneSnapshotRestore({
      snapshot: clone,
      currentRevision: 10,
      world: DEFAULT_STUDIO_WORLD_MANIFEST,
      selfPoint: { x: 640, y: 520 },
    });
    expect(firstRestore.ok).toBe(true);
    if (!firstRestore.ok) return;

    expect(firstRestore.decorations.revision).toBeGreaterThan(10);
    expect(firstRestore.camera).toEqual({
      zoomLevel: 1.25,
      panOffsetX: 48,
      panOffsetY: -32,
    });
    expect(firstRestore.lighting.lightHourOverride).toBe(19);
    expect(firstRestore.spaceTheme).toBe("sunset-harbor");
    expect(firstRestore.placedFixtureRequests).toHaveLength(1);

    const secondRestore = planStudioVirtualSceneSnapshotRestore({
      snapshot: clone,
      currentRevision: 25,
      world: DEFAULT_STUDIO_WORLD_MANIFEST,
      selfPoint: { x: 640, y: 520 },
    });
    expect(secondRestore.ok).toBe(true);
    if (!secondRestore.ok) return;
    expect(summarizeStudioVirtualSceneState(clone, 12)).toBe(expectedSummary);
    expect(secondRestore.decorations.placements).toEqual(
      firstRestore.decorations.placements,
    );
  });

  it("safely relocates selfPoint when restored furniture collider overlaps current avatar position", () => {
    const state = makeSampleState();
    const benchState = {
      ...state,
      furniture: {
        ...state.furniture,
        decorations: {
          ...studioVirtualDecorationPreset("minimal"),
          layoutWidth: DEFAULT_STUDIO_WORLD_MANIFEST.width,
          layoutHeight: DEFAULT_STUDIO_WORLD_MANIFEST.height,
          placements: [
            {
              id: "bench-overlap",
              type: "bench" as const,
              x: 640,
              y: 520,
              rotation: 0 as const,
              scale: 1,
            },
          ],
          revision: 3,
        },
      },
    };
    const snap = createStudioVirtualSceneSnapshot(benchState, { id: "snap-overlap" });
    const plan = planStudioVirtualSceneSnapshotRestore({
      snapshot: snap,
      currentRevision: 5,
      world: DEFAULT_STUDIO_WORLD_MANIFEST,
      selfPoint: { x: 640, y: 520 },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.relocatedSelfPoint).not.toBeNull();
  });

  it("fails closed without mutating scene when fixture request or world is incompatible", () => {
    const state = makeSampleState();
    const badSnap = createStudioVirtualSceneSnapshot({
      ...state,
      furniture: {
        ...state.furniture,
        placedFixtureRequests: [
          {
            entryId: "non-existent-catalog-entry",
            category: "light",
            refId: "bad",
            point: { x: 100, y: 100 },
            rotation: 0,
          },
        ],
      },
    });
    const plan = planStudioVirtualSceneSnapshotRestore({
      snapshot: badSnap,
      currentRevision: 4,
      world: DEFAULT_STUDIO_WORLD_MANIFEST,
      selfPoint: { x: 640, y: 520 },
    });
    expect(plan).toEqual({ ok: false, reason: "incompatible-world" });
  });

  it("bounds stored snapshot count and supports removal", () => {
    const state = makeSampleState();
    let list: readonly ReturnType<typeof createStudioVirtualSceneSnapshot>[] = [];
    for (let i = 0; i < STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX + 3; i += 1) {
      list = appendStudioVirtualSceneSnapshot(
        list,
        createStudioVirtualSceneSnapshot(state, { id: `s-${i}` }),
      );
    }
    expect(list).toHaveLength(STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX);
    expect(duplicateStudioVirtualSceneSnapshot(list, list[0]!.id)).toBeNull();
    const afterDelete = removeStudioVirtualSceneSnapshot(list, list[0]!.id);
    expect(afterDelete).toHaveLength(STUDIO_VIRTUAL_SCENE_SNAPSHOT_MAX - 1);
  });
});
