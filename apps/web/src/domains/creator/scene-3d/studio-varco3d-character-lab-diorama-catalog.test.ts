import { describe, expect, it } from "vitest";

import {
  STUDIO_VARCO3D_ACTIVE_FLOW_ID,
  STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS,
  STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES,
  STUDIO_VARCO3D_WEBTOON_PROP_ASSETS,
  composeVarco3dCharacterLabLoadout,
  evaluateVarco3dDioramaScenePlacement,
  resolveVarco3dTurnaroundViewUrl,
} from "./studio-varco3d-character-lab-diorama-catalog";

describe("studio-varco3d-character-lab-diorama-catalog", () => {
  it("registers 20 Character Labs modular items, 23 character archetypes, 22 dioramas, and 21 props", () => {
    expect(STUDIO_VARCO3D_ACTIVE_FLOW_ID).toBe("70a90b59-8678-4d35-a5f1-4d1ea39195a7");
    expect(STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS).toHaveLength(20);
    expect(STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES).toHaveLength(23);
    expect(STUDIO_VARCO3D_ISOMETRIC_DIORAMA_SCENES).toHaveLength(22);
    expect(STUDIO_VARCO3D_WEBTOON_PROP_ASSETS).toHaveLength(21);

    const riggedCount = STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES.filter(
      (entry) => entry.rigTaskId !== null,
    ).length;
    expect(riggedCount).toBe(12);
    expect(
      STUDIO_VARCO3D_RIGGED_CHARACTER_ARCHETYPES.some(
        (entry) => entry.meshTaskId === "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
      ),
    ).toBe(true);
  });

  it("composes a Character Labs loadout with slot deduplication, bone attachments, and genre synergy", () => {
    const loadout = composeVarco3dCharacterLabLoadout({
      archetypeId: "char_rofan_villainess_empress",
      itemIds: [
        "charlab_wig_rofan_hime_wave",
        "charlab_outfit_rofan_crimson_gown",
        "charlab_acc_rofan_ruby_tiara",
        "charlab_weapon_paladin_greatsword",
        "charlab_wings_archangel_six",
      ],
    });

    expect(loadout.archetype.id).toBe("char_rofan_villainess_empress");
    expect(loadout.equippedItems).toHaveLength(5);
    expect(loadout.totalPolygonBudget).toBe(65000 + 22400 + 48000 + 12400 + 16800 + 28400);
    expect(loadout.attachedBones).toEqual([
      "mixamorig:Head",
      "mixamorig:Spine2",
      "mixamorig:RightHand",
    ]);
    expect(loadout.genreSynergyScore).toBe(100);
    expect(loadout.primaryTurnaround?.taskId).toBe("f18a1134-2161-40a1-a1d4-d1a080cb8d53");
  });

  it("resolves 4-view orthographic turnaround sheet URLs for front, back, left, and right angles", () => {
    const firstItem = STUDIO_VARCO3D_CHARACTER_LAB_MODULAR_ITEMS[0]!;
    expect(resolveVarco3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "front")).toBe(
      "https://3d.varco.ai/api/objects/3e46113ff7e0439ceddc0c12604d8b91.png",
    );
    expect(resolveVarco3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "back")).toBe(
      "https://3d.varco.ai/api/objects/8b23d71cda5b9b8fb0c466e8962cfe4b.png",
    );
    expect(resolveVarco3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "left")).toBe(
      "https://3d.varco.ai/api/objects/07f7044d3bb661a4059eb6019de69d3c.png",
    );
    expect(resolveVarco3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "right")).toBe(
      "https://3d.varco.ai/api/objects/54fb417e408722a409c9ebfba769ac0f.png",
    );
  });

  it("evaluates isometric cutaway 3D diorama placement with Korean webtoon props", () => {
    const plan = evaluateVarco3dDioramaScenePlacement({
      dioramaId: "diorama_school_hallway",
      propIds: ["prop_school_desk_chair", "prop_school_steel_lockers"],
    });

    expect(plan.diorama.meshTaskId).toBe("0c2f14f6-81a2-49a9-9f43-6582a10f9d12");
    expect(plan.props).toHaveLength(2);
    expect(plan.totalFootprintAreaSqMeters).toBe(1.16);
    expect(plan.recommendedShadowBias).toBe(-0.0006);
    expect(plan.varcoAssetPortalUrl).toBe(
      "https://3d.varco.ai/myAssets/0c2f14f6-81a2-49a9-9f43-6582a10f9d12",
    );
  });
});
