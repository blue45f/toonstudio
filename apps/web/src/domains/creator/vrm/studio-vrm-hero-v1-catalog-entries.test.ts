import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  STUDIO_VRM_HERO_V1_ENTRIES,
  STUDIO_VRM_HERO_V1_SAMPLES,
  VRM_HERO_V1_ARCHETYPE_IDS,
  getVrmHeroV1EntryByArchetype,
  hydrateVrmHeroV1FromManifest,
  validateVrmHeroV1CatalogContracts,
} from "./studio-vrm-hero-v1-catalog-entries";
import {
  SAMPLE_VRMS,
  SAMPLE_VRM_ENTRIES,
  inspectVrmGlbBytes,
  sampleVrmThumbnailUrl,
  sampleVrmUrl,
  savedLegacySampleVrmEntry,
  selectableSampleVrmUrl,
} from "./vrm-library";

function publicAssetPath(url: string): string {
  return fileURLToPath(new URL(`../../../../public${url}`, import.meta.url));
}

describe("studio-vrm-hero-v1-catalog-entries", () => {
  it("registers all 8 Wave 4 VRM 1.0 hero archetypes live in SAMPLE_VRMS and SAMPLE_VRM_ENTRIES", () => {
    expect(STUDIO_VRM_HERO_V1_ENTRIES).toHaveLength(8);
    expect(STUDIO_VRM_HERO_V1_SAMPLES).toHaveLength(8);

    const sampleIds = new Set(SAMPLE_VRMS.map((s) => s.id));
    const visibleIds = new Set(SAMPLE_VRM_ENTRIES.map((e) => e.id));

    for (const archetypeId of VRM_HERO_V1_ARCHETYPE_IDS) {
      const entry = getVrmHeroV1EntryByArchetype(archetypeId);
      expect(entry).toBeDefined();
      expect(entry!.deliveryStatus).toBe("verified-on-disk");
      expect(entry!.sampleVrm.url).toBe(`/vrm/toonstudio-hero-v1/${archetypeId}.vrm`);
      expect(entry!.sampleVrm.thumbnailUrl).toBe(
        `/assets/3d/characters/thumbnails/toonstudio-hero-v1/${archetypeId}.png`,
      );
      expect(entry!.mtoonContract.vrmSpecVersion).toBe("1.0");
      expect(entry!.mtoonContract.outlineWidthMode).toBe("screenCoordinates");
      expect(entry!.rightsBom.licenseId).toBe("CC0-1.0");
      expect(entry!.rightsBom.commercialUse).toBe(true);

      expect(sampleIds.has(entry!.sampleVrm.id)).toBe(true);
      expect(visibleIds.has(entry!.sampleVrm.id)).toBe(archetypeId !== "academy-female");
      expect(sampleVrmUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.url);
      expect(selectableSampleVrmUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.url);
      expect(sampleVrmThumbnailUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.thumbnailUrl);
    }

    const audit = validateVrmHeroV1CatalogContracts();
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it("새 하늘의 재킷은 독립된 재질과 텍스처이고 저장된 구판은 원래 파일로 열린다", () => {
    const original = "ts-vrm-hero-v1-academy-female";
    const edition = "ts-vrm-hero-v1-academy-female-blazer";
    expect(SAMPLE_VRM_ENTRIES.filter((entry) => entry.id.startsWith(original)).map((entry) => entry.id)).toEqual([edition]);
    expect(savedLegacySampleVrmEntry(original)?.id).toBe(original);
    expect(savedLegacySampleVrmEntry(edition)).toBeNull();
    const inspect = (id: string) => {
      const url = selectableSampleVrmUrl(id);
      if (!url) throw new Error("검증할 번들 URL이 없습니다.");
      const bytes = readFileSync(publicAssetPath(url));
      const jsonSize = bytes.readUInt32LE(12);
      return { binary: bytes.subarray(28 + jsonSize), scene: JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize)) as {
        meshes: { name: string; primitives: { material: number }[] }[];
        materials: { pbrMetallicRoughness: { baseColorTexture: { index: number } } }[];
        textures: { source: number }[];
        images: { bufferView: number }[];
        bufferViews: { buffer: number; byteOffset?: number; byteLength: number }[];
      } };
    };
    const before = inspect(original);
    const after = inspect(edition);
    expect(after.binary.equals(before.binary)).toBe(true);
    const garments = (doc: typeof before.scene) => doc.meshes.map((mesh) => {
      const material = mesh.primitives[0]!.material;
      const texture = doc.materials[material]!.pbrMetallicRoughness.baseColorTexture.index;
      const image = doc.textures[texture]!.source;
      return { name: mesh.name, material, texture, image, pixels: doc.images[image]!.bufferView };
    }).filter((mesh) => mesh.name.startsWith("TS_HeroGar_"));
    const parts = garments(after.scene);
    const originalParts = garments(before.scene);
    for (const target of parts.filter((part) => part.name.startsWith("TS_HeroGar_school-blazer_"))) {
      const source = originalParts.find((part) => part.name === target.name)!;
      expect(after.scene.bufferViews[target.pixels]).toEqual(before.scene.bufferViews[source.pixels]);
      for (const other of parts.filter((part) => part !== target)) {
        expect(other.material).not.toBe(target.material);
        expect(other.texture).not.toBe(target.texture);
        expect(other.image).not.toBe(target.image);
        expect(other.pixels).not.toBe(target.pixels);
      }
    }
  });

  it.each(STUDIO_VRM_HERO_V1_ENTRIES)(
    "$archetypeId verifies real VRM 1.0 bytes, SHA-256, MToon screenCoordinates, and 768x768 production thumbnail on disk",
    (entry) => {
      const vrmBytes = readFileSync(publicAssetPath(entry.sampleVrm.url));
      expect(vrmBytes.byteLength).toBe(entry.byteSize);
      expect(`sha256:${createHash("sha256").update(vrmBytes).digest("hex")}`).toBe(entry.contentHash);

      const inspected = inspectVrmGlbBytes(vrmBytes);
      expect(inspected.vrmVersion).toBe(1);
      const vrmc = (inspected.json.extensions as Record<string, Record<string, unknown>>).VRMC_vrm;
      expect(vrmc?.specVersion).toBe("1.0");

      const materials = (inspected.json.materials ?? []) as Array<{
        extensions?: { VRMC_materials_mtoon?: { outlineWidthMode?: string } };
      }>;
      expect(materials.length).toBeGreaterThan(0);
      for (const material of materials) {
        expect(material.extensions?.VRMC_materials_mtoon?.outlineWidthMode).toBe("screenCoordinates");
      }

      const thumbBytes = readFileSync(publicAssetPath(entry.sampleVrm.thumbnailUrl!));
      expect([...thumbBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(thumbBytes.readUInt32BE(16)).toBe(768);
      expect(thumbBytes.readUInt32BE(20)).toBe(768);
      expect(thumbBytes.byteLength).toBeLessThan(384 * 1024);
    },
  );

  it("immutably overrides verified on-disk VRM metadata via hydrateVrmHeroV1FromManifest", () => {
    const hydrated = hydrateVrmHeroV1FromManifest([
      {
        archetypeId: "rofan-empress",
        byteSize: 6_250_000,
        contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
    ]);
    const empress = hydrated.find((e) => e.archetypeId === "rofan-empress")!;
    const duke = hydrated.find((e) => e.archetypeId === "rofan-duke")!;
    expect(empress.deliveryStatus).toBe("verified-on-disk");
    expect(empress.byteSize).toBe(6_250_000);
    expect(duke.deliveryStatus).toBe("verified-on-disk");
    expect(duke.byteSize).toBe(4_647_524);
  });
});
