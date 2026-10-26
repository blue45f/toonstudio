import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_DEFAULT_3D_CHARACTER_C2FR_SPECS,
  CSP_DESSIN_DOLL_C3DD_SPECS,
  CSP_FORMAT_PLUGIN_BUNDLE_SPECS,
  CSP_HAND_FINGER_JOINT_NAMES,
  CSP_HAND_SETUP_PEP_PRESETS,
  encodeCspC2frTarArchive,
  encodeCspC3ddCatalogDataBlob,
  encodeCspPsDescriptorStream,
  extractCspC2frTarEntryBytes,
  interpolateCspHandSetupPadPose,
  parseCspC2frCharacterInfoXml,
  parseCspC2frTarManifest,
  parseCspC3ddCatalogDataHeader,
  parseCspHandSetupPepXml,
  parseCspNininBaoriNnbXml,
  parseCspPsDescriptorStream,
} from "../csp-c2fr-c3dd-psd-pdfx";

describe("csp-c2fr-c3dd-psd-pdfx", () => {
  it("encodes and parses POSIX ustar .c2fr TAR archives and XML/NNB metadata", () => {
    const sampleInfoXml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<CelsysCharacterInfo version="1.0.0">
  <info author="" comment="" tool="CHARACTER STDUIO 1.0"/>
  <character alias_name="default_model_man" parts_gourp_count="11" plain_scale="170" type="dessindoll" version="1.0.0">
    <model_entry>
      <file copy="0" model_filename=".\\data\\shape_man_07.fbx" model_index="0" model_uuid="e04dcd8b06-4641-f5bc-d5f4-6d7bbd21a9"/>
    </model_entry>
    <parts_group_root>
      <parts_group alias_name="Body" select_mode="toggle">
        <parts nnb_filename=".\\parts_0000.nnb">
          <model model_filename=".\\data\\shape_man_07.fbx">
            <mesh mesh_name="ShapeMan_Average">
              <material material_name="shapeman_base_mat">
                <texture map_type="diffuse" texture_filename=".\\data\\shape_human_tex.jpg" uv_index="0"/>
              </material>
            </mesh>
          </model>
        </parts>
      </parts_group>
      <parts_group alias_name="Accessories" select_mode="checkable"/>
    </parts_group_root>
  </character>
</CelsysCharacterInfo>`;

    const sampleNnbXml = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<Celsys_Ninin-Baori_Info version="1.0.0">
  <info author="" comment="" tool="NnB_Module 1.0"/>
  <ninin-baori name_list_fmt="1" version="1.0.0">
    <bone_group destination_name_group="__SkeletonRoot001&#xD;&#xA;hips_bb_" source_name_group="__SkeletonRoot001&#xD;&#xA;hips_bb_">
      <bone_group destination_name_group="hips_bb_&#xD;&#xA;spine_bb_" source_name_group="hips_bb_&#xD;&#xA;spine_bb_"/>
    </bone_group>
  </ninin-baori>
</Celsys_Ninin-Baori_Info>`;

    const encoder = new TextEncoder();
    const tarBytes = encodeCspC2frTarArchive([
      { name: "data/shape_man_07.fbx", data: new Uint8Array([0x4b, 0x61, 0x79, 0x64, 0x61, 0x72, 0x61]) },
      { name: "metadata/parts_0000.nnb", data: encoder.encode(sampleNnbXml) },
      { name: "metadata/info.xml", data: encoder.encode(sampleInfoXml) },
    ]);

    const manifest = parseCspC2frTarManifest(tarBytes);
    expect(manifest.entries.length).toBe(3);
    expect(manifest.hasFbxModel).toBe(true);
    expect(manifest.hasNnbRigging).toBe(true);
    expect(manifest.hasCharacterInfoXml).toBe(true);

    const extractedInfo = extractCspC2frTarEntryBytes(tarBytes, "metadata/info.xml");
    expect(extractedInfo).not.toBeNull();
    const charMeta = parseCspC2frCharacterInfoXml(new TextDecoder().decode(extractedInfo!));
    expect(charMeta.aliasName).toBe("default_model_man");
    expect(charMeta.plainScaleCm).toBe(170);
    expect(charMeta.meshName).toBe("ShapeMan_Average");
    expect(charMeta.materialName).toBe("shapeman_base_mat");
    expect(charMeta.diffuseTextureFilename).toBe("./data/shape_human_tex.jpg");
    expect(charMeta.partsGroups.length).toBe(2);

    const extractedNnb = extractCspC2frTarEntryBytes(tarBytes, "metadata/parts_0000.nnb");
    const nnbMeta = parseCspNininBaoriNnbXml(new TextDecoder().decode(extractedNnb!));
    expect(nnbMeta.tool).toBe("NnB_Module 1.0");
    expect(nnbMeta.boneLinks.length).toBe(2);
    expect(nnbMeta.boneLinks[0]?.sourceParentBone).toBe("__SkeletonRoot001");
    expect(nnbMeta.boneLinks[0]?.sourceChildBone).toBe("hips_bb_");

    expect(CSP_DEFAULT_3D_CHARACTER_C2FR_SPECS.length).toBe(2);
  });

  it("verifies real default_model_man.c2fr and handsetup_*.pep on disk when installed", () => {
    const realC2frPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/default_model_man.c2fr";
    if (existsSync(realC2frPath)) {
      const c2frBytes = new Uint8Array(readFileSync(realC2frPath));
      const manifest = parseCspC2frTarManifest(c2frBytes);
      expect(manifest.entries.length).toBe(7);
      expect(manifest.hasFbxModel).toBe(true);
      expect(manifest.hasNnbRigging).toBe(true);

      const infoBytes = extractCspC2frTarEntryBytes(c2frBytes, "metadata/info.xml");
      expect(infoBytes).not.toBeNull();
      const charInfo = parseCspC2frCharacterInfoXml(new TextDecoder().decode(infoBytes!));
      expect(charInfo.aliasName).toBe("default_model_man");
      expect(charInfo.partsGroups.length).toBe(11);
    }

    const realPepPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/handsetup_gu00.pep";
    if (existsSync(realPepPath)) {
      const pepXml = readFileSync(realPepPath, "utf-8");
      const parsed = parseCspHandSetupPepXml(pepXml);
      expect(parsed.aliasName).toBe("グー003");
      expect(Object.keys(parsed.joints).length).toBe(20);
      expect(parsed.joints.lefthandmiddle1_bb_?.[0]).toBeCloseTo(0.679109, 4);
    }
  });

  it("round-trips .c3dd CLIP_STUDIO_3D_DATA and CLIP_STUDIO_3D_DATA2 catalog_dessindoll headers", () => {
    expect(CSP_DESSIN_DOLL_C3DD_SPECS.length).toBe(4);
    for (const spec of CSP_DESSIN_DOLL_C3DD_SPECS) {
      const blob = encodeCspC3ddCatalogDataBlob({
        magicSignature: spec.magicSignature,
        catalogCategory: "catalog_dessindoll",
        uuidHex: spec.uuidHex,
        formatVersion: spec.formatVersion,
        payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      });
      const parsed = parseCspC3ddCatalogDataHeader(blob);
      expect(parsed.magicSignature).toBe(spec.magicSignature);
      expect(parsed.catalogCategory).toBe("catalog_dessindoll");
      expect(parsed.uuidHex).toBe(spec.uuidHex);
      expect(parsed.formatVersion).toBe(spec.formatVersion);
      expect(parsed.payloadByteLength).toBe(8);
    }
  });

  it("interpolates 6-preset 3D Hand Setup Pad poses via SLERP with finger locking and right-hand mirroring", () => {
    expect(Object.keys(CSP_HAND_SETUP_PEP_PRESETS)).toEqual([
      "pa00",
      "pa01",
      "gu00",
      "gu01",
      "gu02",
      "gu03",
    ]);

    // Top-right corner (spreadX01=1, fistY01=0) -> exact pa00
    const openSpread = interpolateCspHandSetupPadPose({
      spreadX01: 1,
      fistY01: 0,
      fistPresetId: "gu00",
      handSide: "left",
    });
    for (const joint of CSP_HAND_FINGER_JOINT_NAMES) {
      const q = openSpread.boneQuaternionsWxyz[joint]!;
      const expected = CSP_HAND_SETUP_PEP_PRESETS.pa00.joints[joint];
      expect(q[0]).toBeCloseTo(expected[0], 3);
      expect(q[3]).toBeCloseTo(expected[3], 3);
    }

    // Bottom corner (fistY01=1) -> exact gu03
    const pointingFist = interpolateCspHandSetupPadPose({
      spreadX01: 0.5,
      fistY01: 1,
      fistPresetId: "gu03",
      handSide: "right",
      lockedFingers: {
        thumb: [1, 0, 0, 0],
      },
    });
    expect(pointingFist.boneQuaternionsWxyz.righthandthumb1_bb_).toEqual([1, 0, -0, -0]);
    expect(pointingFist.boneQuaternionsWxyz.righthandindex1_bb_?.[0]).toBeCloseTo(
      CSP_HAND_SETUP_PEP_PRESETS.gu03.joints.lefthandindex1_bb_[0],
      3,
    );
  });

  it("encodes and parses FormatPlugIn PsDescriptor Big-Endian binary streams", () => {
    expect(CSP_FORMAT_PLUGIN_BUNDLE_SPECS.length).toBe(6);

    const sampleDescriptor = {
      descriptorVersion: 16,
      classNameUnicode: "TxLr",
      classId: "TxLr",
      items: [
        { keyId: "Txt ", data: { osType: "TEXT", value: "클립스튜디오 대사" } as const },
        { keyId: "Opct", data: { osType: "UntF", unitFourCc: "#Prc", value: 87.5 } as const },
        { keyId: "Vrsn", data: { osType: "long", value: 2 } as const },
        { keyId: "Scl ", data: { osType: "doub", value: 1.25 } as const },
        { keyId: "Vsbl", data: { osType: "bool", value: true } as const },
        {
          keyId: "AntA",
          data: { osType: "enum", typeId: "Annt", enumValue: "AnCr" } as const,
        },
      ],
    };

    const bytes = encodeCspPsDescriptorStream(sampleDescriptor);
    const decoded = parseCspPsDescriptorStream(bytes);
    expect(decoded.descriptorVersion).toBe(16);
    expect(decoded.classNameUnicode).toBe("TxLr");
    expect(decoded.classId).toBe("TxLr");
    expect(decoded.items).toEqual(sampleDescriptor.items);
  });
});
