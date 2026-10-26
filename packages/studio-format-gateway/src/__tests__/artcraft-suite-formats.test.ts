import { describe, expect, it } from "vitest";

import {
  ARTCRAFT_SUITE_FORMAT_LIMITS,
  auditFiniteFloats,
  buildPcraftAutosaveRecoveryInfo,
  computeFnv1a64Hex,
  createDefaultLightCraftDevelopSettings,
  isDesignCraftIdmlArchiveHeader,
  mergeAndClampLightCraftSettings,
  validateAniCraftManifest,
  validateFigCraftContainerBudget,
  validatePcraftManifest,
  type PcraftDocumentManifest,
} from "../artcraft-suite-formats";

describe("artcraft-suite-formats (REA ArtCraft 15-app format gateway)", () => {
  it("audits non-finite floats and reports exact nested JSON paths like PhotoCraft finite::check", () => {
    const sample = {
      version: 1,
      layers: [
        { name: "bg", opacity: 1.0 },
        { name: "fx", opacity: Number.NaN, feather: Number.POSITIVE_INFINITY },
      ],
    };
    const violations = auditFiniteFloats(sample);
    expect(violations).toEqual([
      { path: "layers[1].opacity", value: "NaN" },
      { path: "layers[1].feather", value: "Infinity" },
    ]);
  });

  it("validates PhotoCraft .pcraft manifests, BLAKE3 tile digests, and deduplication counts", () => {
    const validHash = "a".repeat(64);
    const manifest: PcraftDocumentManifest = {
      version: 1,
      width: 1600,
      height: 24000,
      dpi: 300,
      tileSize: 256,
      nextId: 4,
      layers: [
        {
          id: 1,
          name: "웹툰 선화 레이어",
          opacity: 1,
          visible: true,
          blendMode: "normal",
          kind: "pixel",
          tiles: [
            { tx: 0, ty: 0, hash: validHash },
            { tx: 1, ty: 0, hash: validHash },
          ],
        },
      ],
    };

    const result = validatePcraftManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.uniqueTileHashes).toEqual([validHash]);
    expect(result.deduplicatedTileCount).toBe(1);

    const invalidResult = validatePcraftManifest({
      ...manifest,
      layers: [
        {
          ...manifest.layers[0]!,
          opacity: Number.NaN,
          tiles: [{ tx: 0, ty: 0, hash: "not-blake3" }],
        },
      ],
    });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some((e) => e.includes("NonFiniteFloat"))).toBe(true);
    expect(invalidResult.errors.some((e) => e.includes("InvalidTileHash"))).toBe(true);
  });

  it("builds deterministic PhotoCraft autosave recovery descriptors and LightCraft FNV-1a 64-bit hashes", () => {
    const recovery = buildPcraftAutosaveRecoveryInfo("/work/ep01.pcraft", 1761436800);
    expect(recovery.snapshotKey).toHaveLength(16);
    expect(recovery.pcraftFileName).toBe(`${recovery.snapshotKey}.pcraft`);
    expect(recovery.metadataFileName).toBe(`${recovery.snapshotKey}.json`);

    const rawDefaults = createDefaultLightCraftDevelopSettings({ isRaw: true });
    expect(rawDefaults.sharpenAmount).toBe(40);
    expect(rawDefaults.nrColor).toBe(25);

    const merged = mergeAndClampLightCraftSettings(rawDefaults, {
      exposure: 8.5, // clamped to +5
      temp: 1200, // clamped to 2000K
      vibrance: 32,
    });
    expect(merged.settings.exposure).toBe(5);
    expect(merged.settings.temp).toBe(2000);
    expect(merged.settings.vibrance).toBe(32);
    expect(merged.previewCacheHash).toBe(computeFnv1a64Hex(JSON.stringify(merged.settings)));
  });

  it("enforces FigCraft DOCUMENT_RATIO = 16 zip-bomb budget and SHA-256 image asset names", () => {
    const safeDigest = "b".repeat(64);
    const valid = validateFigCraftContainerBudget({
      compressedArchiveBytes: 200_000,
      uncompressedDocumentBytes: 1_600_000,
      versionCount: 12,
      branchCount: 3,
      imageEntryNames: [safeDigest],
    });
    expect(valid.valid).toBe(true);

    const bomb = validateFigCraftContainerBudget({
      compressedArchiveBytes: 100_000,
      uncompressedDocumentBytes: 5_000_000, // 50x > 16x and > 1 MiB
      versionCount: 105,
      branchCount: 2,
      imageEntryNames: ["../evil.png"],
    });
    expect(bomb.valid).toBe(false);
    expect(bomb.errors.some((e) => e.includes("ZipBombExpansionRatioExceeded"))).toBe(true);
    expect(bomb.errors.some((e) => e.includes("VersionLimitExceeded"))).toBe(true);
    expect(bomb.errors.some((e) => e.includes("InvalidImageDigestName"))).toBe(true);
  });

  it("detects DesignCraft IDML ZIP mimetype headers and validates AniCraft 2D cel manifests", () => {
    const mime = ARTCRAFT_SUITE_FORMAT_LIMITS.idmlExpectedMimeType;
    const header = new Uint8Array(38 + mime.length);
    header.set([0x50, 0x4b, 0x03, 0x04], 0);
    header.set(new TextEncoder().encode("mimetype"), 30);
    header.set(new TextEncoder().encode(mime), 38);
    expect(isDesignCraftIdmlArchiveHeader(header)).toBe(true);
    expect(isDesignCraftIdmlArchiveHeader(new Uint8Array([1, 2, 3]))).toBe(false);

    const aniValidation = validateAniCraftManifest({
      format: "anicraft-project-v1",
      title: "회귀자의 시계탑 PV 원화 컷 01",
      fps: 24,
      widthPx: 1920,
      heightPx: 1080,
      totalFrames: 48,
      onionSkinPrevFrames: 3,
      onionSkinNextFrames: 2,
      cels: [
        { celId: "cel-1", layerName: "A셀 주인공", startFrame: 1, holdFrames: 2, drawingKey: "A-001", lipSyncMouthCode: "A" },
        { celId: "cel-2", layerName: "A셀 주인공", startFrame: 3, holdFrames: 3, drawingKey: "A-002", lipSyncMouthCode: "D" },
      ],
    });
    expect(aniValidation.valid).toBe(true);
    expect(aniValidation.totalExposedFrames).toBe(5);
  });
});
