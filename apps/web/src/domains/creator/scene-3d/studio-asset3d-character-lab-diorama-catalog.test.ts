import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_ASSET3D_ACTIVE_FLOW_ID,
  STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS,
  STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS,
  STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES,
  STUDIO_ASSET3D_LOCAL_GLB_ASSETS,
  STUDIO_ASSET3D_RETARGETED_MOTION_TASKS,
  STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES,
  STUDIO_ASSET3D_WEBTOON_PROP_ASSETS,
  composeAsset3dCharacterLabLoadout,
  evaluateAsset3dDioramaScenePlacement,
  findAsset3dTurnaroundForReferenceImage,
  mapAsset3dDioramaToBg3dTemplateId,
  resolveAsset3dArchetypeMannequinApplication,
  resolveAsset3dLocalGlbAsset,
  resolveAsset3dTurnaroundViewUrl,
} from "./studio-asset3d-character-lab-diorama-catalog";

describe("studio-asset3d-character-lab-diorama-catalog", () => {
  it("registers all 140 Flow assets: 20 modular items, 77 character archetypes (66 AI-rigged), 22 dioramas, 21 props, and 7 retargeted motion tasks", () => {
    expect(STUDIO_ASSET3D_ACTIVE_FLOW_ID).toBe("70a90b59-8678-4d35-a5f1-4d1ea39195a7");
    expect(STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS).toHaveLength(20);
    expect(STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES).toHaveLength(77);
    expect(STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES).toHaveLength(22);
    expect(STUDIO_ASSET3D_WEBTOON_PROP_ASSETS).toHaveLength(21);
    expect(
      STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS.length +
        STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.length +
        STUDIO_ASSET3D_ISOMETRIC_DIORAMA_SCENES.length +
        STUDIO_ASSET3D_WEBTOON_PROP_ASSETS.length,
    ).toBe(140);

    const riggedCount = STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.filter(
      (entry) => entry.rigTaskId !== null,
    ).length;
    expect(riggedCount).toBe(66);
    const councilPresident = STUDIO_ASSET3D_RIGGED_CHARACTER_ARCHETYPES.find(
      (entry) => entry.meshTaskId === "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
    );
    expect(councilPresident?.rigTaskId).toBe("58923776-91f0-4b60-a985-835d204f9a24");
    expect(STUDIO_ASSET3D_RETARGETED_MOTION_TASKS).toHaveLength(18);
  });

  it("composes a Character Labs loadout with slot deduplication, bone attachments, and genre synergy", () => {
    const loadout = composeAsset3dCharacterLabLoadout({
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
    const firstItem = STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS[0]!;
    expect(resolveAsset3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "front")).toBe(
      "https://3d.varco.ai/api/objects/3e46113ff7e0439ceddc0c12604d8b91.png",
    );
    expect(resolveAsset3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "back")).toBe(
      "https://3d.varco.ai/api/objects/8b23d71cda5b9b8fb0c466e8962cfe4b.png",
    );
    expect(resolveAsset3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "left")).toBe(
      "https://3d.varco.ai/api/objects/07f7044d3bb661a4059eb6019de69d3c.png",
    );
    expect(resolveAsset3dTurnaroundViewUrl(firstItem.multiviewTurnaround, "right")).toBe(
      "https://3d.varco.ai/api/objects/54fb417e408722a409c9ebfba769ac0f.png",
    );
  });

  it("evaluates isometric cutaway 3D diorama placement with Korean webtoon props", () => {
    const plan = evaluateAsset3dDioramaScenePlacement({
      dioramaId: "diorama_school_hallway",
      propIds: ["prop_school_desk_chair", "prop_school_steel_lockers"],
    });

    expect(plan.diorama.meshTaskId).toBe("0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0");
    expect(plan.props).toHaveLength(2);
    expect(plan.totalFootprintAreaSqMeters).toBe(1.16);
    expect(plan.recommendedShadowBias).toBe(-0.0006);
    expect(plan.varcoAssetPortalUrl).toBe(
      "https://3d.varco.ai/myAssets/0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0",
    );
  });

  it("registers all 40 completed 4-view Multi-View Turnaround sheets (160 PNG views) and verifies 32-char hashes for all 20 modular items", () => {
    expect(STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS).toHaveLength(40);
    for (const sheet of STUDIO_ASSET3D_COMPLETED_TURNAROUND_SHEETS) {
      expect(sheet.frontPath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
      expect(sheet.backPath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
      expect(sheet.leftPath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
      expect(sheet.rightPath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
    }
    for (const item of STUDIO_ASSET3D_CHARACTER_LAB_MODULAR_ITEMS) {
      expect(item.referenceImagePath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
      expect(item.multiviewTurnaround.frontPath).toMatch(/^\/api\/objects\/[0-9a-f]{32}\.png$/u);
    }
    const matched = findAsset3dTurnaroundForReferenceImage(
      "/api/objects/7af8249b7dcc90c35afe5d82e9b55bd0.png",
    );
    expect(matched?.taskId).toBe("f18a1134-2161-40a1-a1d4-d1a080cb8d53");
  });

  it("maps VARCO 3D dioramas to bg3d template IDs and resolves mannequin body/pose presets from archetypes", () => {
    expect(mapAsset3dDioramaToBg3dTemplateId("diorama_rofan_imperial_ballroom")).toBe(
      "rofan-palace-ballroom",
    );
    expect(mapAsset3dDioramaToBg3dTemplateId("diorama_school_hallway")).toBe(
      "school-classroom-sunset",
    );
    expect(mapAsset3dDioramaToBg3dTemplateId("diorama_murim_sect_courtyard")).toBe(
      "murim-bamboo-pavilion",
    );

    const applied = resolveAsset3dArchetypeMannequinApplication({
      archetypeId: "char_inkwash_wandering_swordsman_rigged",
      animTaskId: "559118f7-f8eb-483f-a266-ca4bf170872f",
    });
    expect(applied.archetype.id).toBe("char_inkwash_wandering_swordsman_rigged");
    expect(applied.posePresetId).toBe("running");
    expect(applied.mannequinSliders.heightCm).toBeGreaterThan(165);
  });

  it("verifies all 26 downloaded and optimized VARCO 3D .glb files exist in public/models/varco3d with valid glTF magic headers", () => {
    expect(STUDIO_ASSET3D_LOCAL_GLB_ASSETS).toHaveLength(26);
    const publicDir = path.resolve(__dirname, "../../../../public");
    for (const asset of STUDIO_ASSET3D_LOCAL_GLB_ASSETS) {
      const filePath = path.join(publicDir, asset.publicUrl);
      expect(fs.existsSync(filePath)).toBe(true);
      const buf = fs.readFileSync(filePath);
      expect(buf.subarray(0, 4).toString("utf8")).toBe("glTF");
    }
    expect(
      resolveAsset3dLocalGlbAsset(
        "6df9274b69f28be22edcb31cccf53d6a7115eb6ddaaa12223b5bd462826c0c9e",
      ).id,
    ).toBe("varco_char_student_council_rigged");
  });
});
