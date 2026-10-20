import { describe, expect, it } from "vitest";

import { UnitySpaceDefinitionSchema } from "./studio-unity-space-layout.dto";

function definitionWithGlb(glb: string) {
  return {
    v: 1 as const,
    id: "studio-room",
    name: "스튜디오 방",
    size: [1600, 1200] as [number, number],
    background: { glb },
    zones: [],
    props: [],
  };
}

describe("background.glb reference contract", () => {
  it("accepts a catalog static asset reference", () => {
    expect(
      UnitySpaceDefinitionSchema.safeParse(
        definitionWithGlb("spaces/studio-room.glb"),
      ).success,
    ).toBe(true);
  });

  it("accepts an uploaded background reference", () => {
    expect(
      UnitySpaceDefinitionSchema.safeParse(
        definitionWithGlb(
          "uploads/11111111-2222-4333-8444-555555555555.glb",
        ),
      ).success,
    ).toBe(true);
  });

  it("rejects an arbitrary external URL", () => {
    expect(
      UnitySpaceDefinitionSchema.safeParse(
        definitionWithGlb("https://example.com/evil.glb"),
      ).success,
    ).toBe(false);
  });

  it("rejects an uploads/ reference that is not a UUID asset id", () => {
    expect(
      UnitySpaceDefinitionSchema.safeParse(
        definitionWithGlb("uploads/../../etc/passwd.glb"),
      ).success,
    ).toBe(false);
    expect(
      UnitySpaceDefinitionSchema.safeParse(
        definitionWithGlb("uploads/not-a-uuid.glb"),
      ).success,
    ).toBe(false);
  });

  it("still accepts a null background", () => {
    const parsed = UnitySpaceDefinitionSchema.safeParse({
      ...definitionWithGlb("spaces/street.glb"),
      background: null,
    });
    expect(parsed.success).toBe(true);
  });
});
