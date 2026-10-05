import { describe, expect, it } from "vitest";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import {
  resolveLinkedCloneRootId,
  syncLinkedCloneAppearance,
} from "./studio-bg3d-linked-clones";

function primitive(partial: Partial<BgPrimitive> & { id: string }): BgPrimitive {
  return {
    kind: "box",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#111111",
    ...partial,
  };
}

function model(partial: Partial<BgCustomModelInstance> & { id: string }): BgCustomModelInstance {
  return {
    modelId: "storage-1",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...partial,
  };
}

const OVERRIDE_A = {
  colorMode: "multiply" as const,
  color: "#ff0000",
  colorStrength: 0.5,
  opacityMultiplier: 1,
  roughness: null,
  metalness: null,
  emissiveColor: "#000000",
  emissiveIntensity: null,
  wireframe: false,
  doubleSided: false,
};

describe("resolveLinkedCloneRootId", () => {
  it("an unlinked entity is its own root", () => {
    expect(resolveLinkedCloneRootId(primitive({ id: "a" }))).toBe("a");
  });

  it("a linked clone resolves to its root, never a chain", () => {
    expect(resolveLinkedCloneRootId(primitive({ id: "b", linkedSourceId: "a" }))).toBe("a");
  });
});

describe("syncLinkedCloneAppearance", () => {
  it("returns inputs by identity when no links exist (fence fast path)", () => {
    const primitives = [primitive({ id: "a" })];
    const customModels = [model({ id: "m" })];
    const result = syncLinkedCloneAppearance({ primitives, customModels });
    expect(result.changed).toBe(false);
    expect(result.primitives).toBe(primitives);
    expect(result.customModels).toBe(customModels);
  });

  it("copies color and material override from the root to a linked primitive", () => {
    const root = primitive({ id: "root", color: "#ff0000", materialOverride: OVERRIDE_A });
    const clone = primitive({ id: "clone", color: "#00ff00", linkedSourceId: "root" });
    const result = syncLinkedCloneAppearance({ primitives: [root, clone], customModels: [] });
    expect(result.changed).toBe(true);
    const synced = result.primitives.find((entry) => entry.id === "clone")!;
    expect(synced.color).toBe("#ff0000");
    expect(synced.materialOverride).toEqual(OVERRIDE_A);
    // Transform and identity stay independent.
    expect(synced.position).toEqual([0, 0, 0]);
    expect(result.primitives[0]).toBe(root);
  });

  it("clears the clone material override when the root has none", () => {
    const root = primitive({ id: "root" });
    const clone = primitive({
      id: "clone",
      linkedSourceId: "root",
      materialOverride: OVERRIDE_A,
    });
    const result = syncLinkedCloneAppearance({ primitives: [root, clone], customModels: [] });
    expect(result.primitives[1]!.materialOverride).toBeUndefined();
  });

  it("syncs model material overrides and keeps model transforms independent", () => {
    const root = model({ id: "root", materialOverride: OVERRIDE_A });
    const clone = model({ id: "clone", linkedSourceId: "root", position: [5, 0, 0] });
    const result = syncLinkedCloneAppearance({ primitives: [], customModels: [root, clone] });
    const synced = result.customModels[1]!;
    expect(synced.materialOverride).toEqual(OVERRIDE_A);
    expect(synced.position).toEqual([5, 0, 0]);
  });

  it("unlinks a clone whose root was deleted, keeping its last appearance", () => {
    const orphan = primitive({ id: "clone", color: "#123456", linkedSourceId: "gone" });
    const result = syncLinkedCloneAppearance({ primitives: [orphan], customModels: [] });
    expect(result.changed).toBe(true);
    expect(result.primitives[0]!.linkedSourceId).toBeUndefined();
    expect(result.primitives[0]!.color).toBe("#123456");
  });

  it("is a no-op when appearances already match", () => {
    const root = primitive({ id: "root", color: "#ff0000" });
    const clone = primitive({ id: "clone", color: "#ff0000", linkedSourceId: "root" });
    const primitives = [root, clone];
    const result = syncLinkedCloneAppearance({ primitives, customModels: [] });
    expect(result.changed).toBe(false);
    expect(result.primitives).toBe(primitives);
  });
});
