// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dAuthoredEnvironmentCyclesPanel } from "./StudioBg3dAuthoredEnvironmentCyclesPanel";
import { StudioBg3dEssentialPosePropPanel } from "./StudioBg3dEssentialPosePropPanel";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import {
  STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1,
  STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES,
  buildStudioBg3dCyclesCompositorLayerPlan,
} from "./studio-bg3d-environment-catalog";
import {
  STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES,
  STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG,
  fetchStudioBg3dEssentialGlbAsFile,
  findStudioBg3dEssentialAsset,
  listStudioBg3dEssentialAssetsByCategory,
  searchStudioBg3dEssentialAssets,
} from "./studio-bg3d-essential-pose-prop-catalog";
import { clampStudioBg3dRoomSpec } from "./studio-bg3d-room-builder";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

describe("studio-bg3d-essential-pose-prop-catalog & panels", () => {
  afterEach(() => {
    cleanup();
  });

  it("registers all 95 CC0-1.0 GLB assets (8 pose + 8 essential + 11 refined-v8 + 33 scene + 35 hand/wear) and covers 100% of public/assets/3d/*.glb on disk", () => {
    expect(STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG).toHaveLength(95);
    expect(STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES).toHaveLength(5);

    const poses = listStudioBg3dEssentialAssetsByCategory("pose-3d");
    const essentialProps = listStudioBg3dEssentialAssetsByCategory("essential-prop-3d");
    const refinedV8Props = listStudioBg3dEssentialAssetsByCategory("refined-v8-prop-3d");
    const originalSceneProps = listStudioBg3dEssentialAssetsByCategory("original-scene-prop-3d");
    const originalHandWearProps = listStudioBg3dEssentialAssetsByCategory("original-hand-wear-prop-3d");

    expect(poses).toHaveLength(8);
    expect(essentialProps).toHaveLength(8);
    expect(refinedV8Props).toHaveLength(11);
    expect(originalSceneProps).toHaveLength(33);
    expect(originalHandWearProps).toHaveLength(35);

    const diskRoot3dGlbs = fs
      .readdirSync(path.join(WEB_PUBLIC_DIR, "assets/3d"))
      .filter((name) => name.endsWith(".glb"))
      .map((name) => `/assets/3d/${name}`)
      .sort();
    expect(diskRoot3dGlbs).toHaveLength(68);

    const catalogRoot3dGlbs = [...originalSceneProps, ...originalHandWearProps]
      .map((entry) => entry.glbUrl)
      .sort();
    expect(catalogRoot3dGlbs).toEqual(diskRoot3dGlbs);

    for (const entry of STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG) {
      expect(findStudioBg3dEssentialAsset(entry.id)).toBe(entry);
      const glbDiskPath = path.join(WEB_PUBLIC_DIR, entry.glbUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbDiskPath)).toBe(true);

      if (entry.previewUrl !== null) {
        const previewDiskPath = path.join(WEB_PUBLIC_DIR, entry.previewUrl.replace(/^\//u, ""));
        expect(fs.existsSync(previewDiskPath)).toBe(true);
      }

      const glbBytes = fs.readFileSync(glbDiskPath);
      expect(glbBytes.byteLength).toBeGreaterThanOrEqual(24);
      const view = new DataView(glbBytes.buffer, glbBytes.byteOffset, glbBytes.byteLength);
      expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
      expect(view.getUint32(4, true)).toBe(2);

      if (entry.category === "pose-3d") {
        expect(entry.turnaround2dUrl).not.toBeNull();
        const turnaroundDiskPath = path.join(
          WEB_PUBLIC_DIR,
          entry.turnaround2dUrl!.replace(/^\//u, ""),
        );
        expect(fs.existsSync(turnaroundDiskPath)).toBe(true);
      } else {
        expect(entry.turnaround2dUrl).toBeNull();
      }
    }

    expect(searchStudioBg3dEssentialAssets(null, "포장마차").map((item) => item.id)).toContain(
      "original-3d-street-food-cart",
    );
    expect(searchStudioBg3dEssentialAssets("original-scene-prop-3d", "칠판").map((item) => item.id)).toContain(
      "original-3d-blackboard",
    );
  });

  it("fetches a verified GLB binary and wraps it in a model/gltf-binary File", async () => {
    const sample = findStudioBg3dEssentialAsset("pose-walking-3d")!;
    const glbDiskPath = path.join(WEB_PUBLIC_DIR, sample.glbUrl.replace(/^\//u, ""));
    const diskBytes = fs.readFileSync(glbDiskPath);
    const arrayBuffer = diskBytes.buffer.slice(
      diskBytes.byteOffset,
      diskBytes.byteOffset + diskBytes.byteLength,
    );

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => arrayBuffer,
    });

    const file = await fetchStudioBg3dEssentialGlbAsFile(
      sample,
      mockFetch as unknown as typeof fetch,
    );
    expect(file.name).toBe("ToonStudio-pose-walking-3d.glb");
    expect(file.type).toBe("model/gltf-binary");
    expect(file.size).toBe(diskBytes.byteLength);
  });

  it("renders StudioBg3dEssentialPosePropPanel and toggles 3면도 turnaround guide, category filters, and search", () => {
    const onFile = vi.fn();
    render(<StudioBg3dEssentialPosePropPanel onFile={onFile} />);

    fireEvent.click(screen.getByTestId("bg3d-essential-pose-prop-toggle"));
    expect(screen.getByTestId("bg3d-essential-item-pose-neutral-3d")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-prop-desk")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-refined-v8-blackboard")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-original-3d-blackboard")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-original-3d-cyber-katana")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-essential-turnaround-btn-pose-neutral-3d"));
    expect(screen.getByTestId("bg3d-essential-turnaround-viewer")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-essential-cat-original-scene-prop-3d"));
    expect(screen.queryByTestId("bg3d-essential-item-pose-neutral-3d")).toBeNull();
    expect(screen.getByTestId("bg3d-essential-item-original-3d-street-food-cart")).toBeTruthy();

    fireEvent.change(screen.getByTestId("bg3d-essential-search-input"), {
      target: { value: "포장마차" },
    });
    expect(screen.getByTestId("bg3d-essential-item-original-3d-street-food-cart")).toBeTruthy();
    expect(screen.queryByTestId("bg3d-essential-item-original-3d-blackboard")).toBeNull();
  });

  it("renders StudioBg3dAuthoredEnvironmentCyclesPanel with 10 Authored V1 CC0 environments and 12 V6 Cycles 4-pass render sets (48 PNGs on disk)", () => {
    expect(STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS).toHaveLength(31);
    expect(STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1).toHaveLength(10);
    expect(STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES).toHaveLength(12);

    for (const authored of STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1) {
      expect(fs.existsSync(path.join(WEB_PUBLIC_DIR, authored.url.replace(/^\//u, "")))).toBe(true);
      expect(
        fs.existsSync(path.join(WEB_PUBLIC_DIR, authored.thumbnailUrl.replace(/^\//u, ""))),
      ).toBe(true);
    }

    for (const passes of STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES) {
      const plan = buildStudioBg3dCyclesCompositorLayerPlan(passes.environmentId);
      expect(plan).toHaveLength(4);
      for (const layer of plan!) {
        expect(fs.existsSync(path.join(WEB_PUBLIC_DIR, layer.url.replace(/^\//u, "")))).toBe(true);
      }
    }

    const onAdd = vi.fn();
    render(<StudioBg3dAuthoredEnvironmentCyclesPanel onAdd={onAdd} />);

    fireEvent.click(screen.getByTestId("bg3d-authored-cycles-toggle"));
    expect(screen.getByTestId("bg3d-authored-v1-section")).toBeTruthy();

    const firstAuthoredId = STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1[0]!.id;
    fireEvent.click(screen.getByTestId(`bg3d-authored-add-${firstAuthoredId}`));
    expect(onAdd).toHaveBeenCalledWith(firstAuthoredId);

    fireEvent.click(screen.getByTestId("bg3d-tab-cycles-v6"));
    expect(screen.getByTestId("bg3d-cycles-v6-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-cycles-pass-btn-depth"));
    expect(screen.getByTestId("bg3d-cycles-active-pass-preview").textContent).toContain(
      "Depth Mist Guide",
    );

    fireEvent.click(screen.getByTestId("bg3d-cycles-v6-add-scene"));
    expect(onAdd).toHaveBeenCalledWith("ts-bg3d-compact_apartment_interior-v6");
  });

  it("renders 6 Architectural Room Surface Kits and 82 CC0 2K PBR floor/wall selectors in StudioBg3dRoomBuilderPanel", () => {
    const onSpecChange = vi.fn();
    const initialSpec = clampStudioBg3dRoomSpec({ width: 6, depth: 5 });

    render(
      <StudioBg3dRoomBuilderPanel
        spec={initialSpec}
        onSpecChange={onSpecChange}
        onApplyPreset={vi.fn()}
        onInsert={() => []}
      />,
    );

    expect(screen.getByTestId("bg3d-room-surface-kit-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bg3d-room-surface-kit-classroom_wood_plaster"));
    expect(onSpecChange).toHaveBeenCalledWith(
      expect.objectContaining({
        floorMaterialId: "polyhaven-wood-floor",
        wallMaterialId: "polyhaven-white-rough-plaster",
      }),
    );

    fireEvent.change(screen.getByTestId("bg3d-room-floor-material-select"), {
      target: { value: "polyhaven-marble-tiles" },
    });
    expect(onSpecChange).toHaveBeenCalledWith(
      expect.objectContaining({
        floorMaterialId: "polyhaven-marble-tiles",
      }),
    );
  });
});
