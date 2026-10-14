import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_PLATE_POC_ASSET_ID,
  STUDIO_BG3D_PLATE_POC_CATALOG_BYTE_SIZE,
  STUDIO_BG3D_PLATE_POC_CATALOG_ID,
  STUDIO_BG3D_PLATE_POC_CATALOG_SHA256,
  STUDIO_BG3D_PLATE_POC_LT_EDGE_RETENTION_MIN,
  STUDIO_BG3D_PLATE_POC_RENDER_TIME_BUDGET_SECONDS,
  STUDIO_BG3D_PLATE_POC_SPEC,
  computeStudioBg3dPlateEdgeRetention,
  evaluateStudioBg3dPlatePocManifest,
  type StudioBg3dPlatePocManifest,
} from "./studio-bg3d-plate-poc";

const PASSING_MANIFEST: StudioBg3dPlatePocManifest = {
  schemaVersion: 1,
  assetId: "korean_convenience_store_night",
  textureDimensionPx: 1024,
  samples: 256,
  hdri: { mode: "file", polyHavenId: "cobblestone_street_night" },
  angles: [
    {
      id: "exterior-front",
      widthPx: 2560,
      heightPx: 1600,
      renderSeconds: 142.5,
      passes: ["beauty", "depth", "normal", "ao"],
    },
    {
      id: "interior-aisle",
      widthPx: 2560,
      heightPx: 1600,
      renderSeconds: 167.25,
      passes: ["beauty", "depth", "normal", "ao"],
    },
  ],
  lt: { edgeRetention: 0.93, compositePresent: true },
};

function checkById(
  manifest: StudioBg3dPlatePocManifest,
  id: string,
): boolean {
  const verdict = evaluateStudioBg3dPlatePocManifest(manifest);
  const check = verdict.checks.find((entry) => entry.id === id);
  if (!check) throw new Error(`missing check ${id}`);
  return check.passed;
}

describe("STUDIO_BG3D_PLATE_POC_SPEC", () => {
  it("pins the PoC asset to the catalogued convenience-store entry", () => {
    expect(STUDIO_BG3D_PLATE_POC_ASSET_ID).toBe("korean_convenience_store_night");
    expect(STUDIO_BG3D_PLATE_POC_CATALOG_ID).toBe(
      "ts-bg3d-korean_convenience_store_night-v1",
    );
    expect(STUDIO_BG3D_PLATE_POC_CATALOG_BYTE_SIZE).toBe(3_748_664);
    expect(STUDIO_BG3D_PLATE_POC_CATALOG_SHA256).toBe(
      "sha256:e31665694ca5ab05e09736d24623a4bfe14cc07b9f60bec261445f7dcf6f476e",
    );
    expect(STUDIO_BG3D_PLATE_POC_SPEC.assetId).toBe(STUDIO_BG3D_PLATE_POC_ASSET_ID);
    expect(STUDIO_BG3D_PLATE_POC_SPEC.catalogId).toBe(STUDIO_BG3D_PLATE_POC_CATALOG_ID);
  });

  it("records the measured baseline (128px, EEVEE thumbnail, no passes)", () => {
    const { baseline } = STUDIO_BG3D_PLATE_POC_SPEC;
    expect(baseline.textureDimensionPx).toBe(128);
    expect(baseline.thumbnailEngine).toBe("BLENDER_EEVEE");
    expect(baseline.thumbnailWidthPx).toBe(640);
    expect(baseline.thumbnailHeightPx).toBe(400);
    expect(baseline.world).toBe("solid-color");
    expect(baseline.passes).toEqual([]);
  });

  it("targets Cycles 256 samples + OIDN + AgX at 2560px long side", () => {
    const { target } = STUDIO_BG3D_PLATE_POC_SPEC;
    expect(target.textureDimensionPx).toBe(1024);
    expect(target.engine).toBe("CYCLES");
    expect(target.samples).toBe(256);
    expect(target.denoiser).toBe("OPENIMAGEDENOISE");
    expect(target.viewTransform).toBe("AgX");
    expect(target.widthPx).toBe(2560);
    expect(target.heightPx).toBe(1600);
    expect(target.passes).toEqual(["beauty", "depth", "normal", "ao"]);
  });

  it("uses the night-street HDRI already catalogued for night-store scenes", () => {
    const { target } = STUDIO_BG3D_PLATE_POC_SPEC;
    expect(target.hdriAssetId).toBe("cobblestone-street-night");
    expect(target.hdriPolyHavenId).toBe("cobblestone_street_night");
  });

  it("keeps the v5 thumbnail camera as the exterior angle and adds an interior angle", () => {
    const [exterior, interior] = STUDIO_BG3D_PLATE_POC_SPEC.angles;
    expect(exterior.id).toBe("exterior-front");
    expect(exterior.cameraLocation).toEqual([8.8, -17.8, 8.4]);
    expect(exterior.cameraTarget).toEqual([0, -0.15, 1.35]);
    expect(exterior.lensMm).toBe(43);
    expect(interior.id).toBe("interior-aisle");
    expect(interior.cameraLocation).toEqual([-3.4, -2.6, 1.7]);
    expect(interior.cameraTarget).toEqual([1.2, 1.6, 1.0]);
    expect(interior.lensMm).toBe(46);
  });

  it("fixes the §6 time budget and LT retention floor as constants", () => {
    expect(STUDIO_BG3D_PLATE_POC_RENDER_TIME_BUDGET_SECONDS).toBe(300);
    expect(STUDIO_BG3D_PLATE_POC_LT_EDGE_RETENTION_MIN).toBe(0.85);
  });
});

describe("evaluateStudioBg3dPlatePocManifest", () => {
  it("passes a manifest that meets every §6 criterion", () => {
    const verdict = evaluateStudioBg3dPlatePocManifest(PASSING_MANIFEST);
    expect(verdict.status).toBe("pass");
    expect(verdict.checks.every((check) => check.passed)).toBe(true);
    expect(verdict.checks.map((check) => check.id)).toEqual([
      "asset-match",
      "texture-upgrade",
      "samples",
      "passes-complete",
      "resolution",
      "render-time",
      "hdri-real",
      "lt-edge-retention",
    ]);
  });

  it("fails when the texture stayed at the 128px baseline", () => {
    const manifest = { ...PASSING_MANIFEST, textureDimensionPx: 128 };
    expect(checkById(manifest, "texture-upgrade")).toBe(false);
    expect(evaluateStudioBg3dPlatePocManifest(manifest).status).toBe("fail");
  });

  it("fails when a pass is missing from one angle", () => {
    const manifest: StudioBg3dPlatePocManifest = {
      ...PASSING_MANIFEST,
      angles: [
        PASSING_MANIFEST.angles[0],
        { ...PASSING_MANIFEST.angles[1], passes: ["beauty", "depth", "normal"] },
      ],
    };
    expect(checkById(manifest, "passes-complete")).toBe(false);
  });

  it("fails when an angle renders at thumbnail resolution", () => {
    const manifest: StudioBg3dPlatePocManifest = {
      ...PASSING_MANIFEST,
      angles: [
        { ...PASSING_MANIFEST.angles[0], widthPx: 640, heightPx: 400 },
        PASSING_MANIFEST.angles[1],
      ],
    };
    expect(checkById(manifest, "resolution")).toBe(false);
  });

  it("fails when an angle exceeds the per-angle render-time budget", () => {
    const manifest: StudioBg3dPlatePocManifest = {
      ...PASSING_MANIFEST,
      angles: [
        { ...PASSING_MANIFEST.angles[0], renderSeconds: 300 },
        PASSING_MANIFEST.angles[1],
      ],
    };
    expect(checkById(manifest, "render-time")).toBe(false);
  });

  it("fails a procedural-fallback HDRI run instead of judging it as a plate", () => {
    const manifest: StudioBg3dPlatePocManifest = {
      ...PASSING_MANIFEST,
      hdri: { mode: "procedural-fallback", polyHavenId: null },
    };
    expect(checkById(manifest, "hdri-real")).toBe(false);
  });

  it("fails when LT edge retention drops below the floor or no composite exists", () => {
    expect(
      checkById(
        { ...PASSING_MANIFEST, lt: { edgeRetention: 0.84, compositePresent: true } },
        "lt-edge-retention",
      ),
    ).toBe(false);
    expect(
      checkById(
        { ...PASSING_MANIFEST, lt: { edgeRetention: 0.95, compositePresent: false } },
        "lt-edge-retention",
      ),
    ).toBe(false);
    const { lt: _lt, ...withoutLt } = PASSING_MANIFEST;
    expect(checkById(withoutLt, "lt-edge-retention")).toBe(false);
  });

  it("fails a manifest for a different asset", () => {
    expect(
      checkById({ ...PASSING_MANIFEST, assetId: "seoul_subway_platform" }, "asset-match"),
    ).toBe(false);
  });
});

describe("computeStudioBg3dPlateEdgeRetention", () => {
  it("returns 1 for identical edge maps and for an empty reference", () => {
    const edges = new Uint8Array([0, 255, 0, 255]);
    expect(computeStudioBg3dPlateEdgeRetention(edges, edges, 4, 1)).toBe(1);
    expect(
      computeStudioBg3dPlateEdgeRetention(
        new Uint8Array([0, 0]),
        new Uint8Array([255, 255]),
        2,
        1,
      ),
    ).toBe(1);
  });

  it("counts an edge shifted by one pixel as retained (ink flanks its line)", () => {
    const reference = new Uint8Array([0, 255, 0]);
    const lt = new Uint8Array([255, 0, 0]);
    expect(computeStudioBg3dPlateEdgeRetention(reference, lt, 3, 1)).toBe(1);
  });

  it("returns the retained fraction of reference edges", () => {
    const reference = new Uint8Array([255, 0, 0, 255, 0, 0, 255]);
    const lt = new Uint8Array([255, 0, 0, 0, 0, 0, 0]);
    expect(computeStudioBg3dPlateEdgeRetention(reference, lt, 7, 1)).toBe(1 / 3);
    expect(
      computeStudioBg3dPlateEdgeRetention(reference, new Uint8Array(7), 7, 1),
    ).toBe(0);
  });

  it("rejects mismatched or empty inputs", () => {
    expect(() =>
      computeStudioBg3dPlateEdgeRetention(new Uint8Array(3), new Uint8Array(4), 3, 1),
    ).toThrow(RangeError);
    expect(() =>
      computeStudioBg3dPlateEdgeRetention(new Uint8Array(0), new Uint8Array(0), 1, 1),
    ).toThrow(RangeError);
    expect(() =>
      computeStudioBg3dPlateEdgeRetention(new Uint8Array(4), new Uint8Array(4), 0, 4),
    ).toThrow(RangeError);
    expect(() =>
      computeStudioBg3dPlateEdgeRetention(
        [0, 1] as unknown as Uint8Array,
        new Uint8Array(2),
        2,
        1,
      ),
    ).toThrow(TypeError);
  });
});
