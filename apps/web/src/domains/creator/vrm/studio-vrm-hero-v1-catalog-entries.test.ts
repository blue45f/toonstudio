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
      expect(visibleIds.has(entry!.sampleVrm.id)).toBe(true);
      expect(sampleVrmUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.url);
      expect(selectableSampleVrmUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.url);
      expect(sampleVrmThumbnailUrl(entry!.sampleVrm.id)).toBe(entry!.sampleVrm.thumbnailUrl);
    }

    const audit = validateVrmHeroV1CatalogContracts();
    expect(audit.ok).toBe(true);
    expect(audit.issues).toEqual([]);
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
