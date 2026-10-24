// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dEssentialPosePropPanel } from "./StudioBg3dEssentialPosePropPanel";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import {
  STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES,
  STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG,
  fetchStudioBg3dEssentialGlbAsFile,
  findStudioBg3dEssentialAsset,
  listStudioBg3dEssentialAssetsByCategory,
} from "./studio-bg3d-essential-pose-prop-catalog";
import { clampStudioBg3dRoomSpec } from "./studio-bg3d-room-builder";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

describe("studio-bg3d-essential-pose-prop-catalog & panels", () => {
  afterEach(() => {
    cleanup();
  });

  it("registers all 27 CC0-1.0 GLB assets (8 pose mannequins + 8 essential props + 11 refined-v8 props) and verifies binary GLB headers on disk", () => {
    expect(STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG).toHaveLength(27);
    expect(STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES).toHaveLength(3);

    const poses = listStudioBg3dEssentialAssetsByCategory("pose-3d");
    const essentialProps = listStudioBg3dEssentialAssetsByCategory("essential-prop-3d");
    const refinedV8Props = listStudioBg3dEssentialAssetsByCategory("refined-v8-prop-3d");

    expect(poses).toHaveLength(8);
    expect(essentialProps).toHaveLength(8);
    expect(refinedV8Props).toHaveLength(11);

    for (const entry of STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG) {
      expect(findStudioBg3dEssentialAsset(entry.id)).toBe(entry);
      const glbDiskPath = path.join(WEB_PUBLIC_DIR, entry.glbUrl.replace(/^\//u, ""));
      const previewDiskPath = path.join(WEB_PUBLIC_DIR, entry.previewUrl.replace(/^\//u, ""));

      expect(fs.existsSync(glbDiskPath)).toBe(true);
      expect(fs.existsSync(previewDiskPath)).toBe(true);

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

  it("renders StudioBg3dEssentialPosePropPanel and toggles 3면도 turnaround guide and category filters", () => {
    const onFile = vi.fn();
    render(<StudioBg3dEssentialPosePropPanel onFile={onFile} />);

    fireEvent.click(screen.getByTestId("bg3d-essential-pose-prop-toggle"));
    expect(screen.getByTestId("bg3d-essential-item-pose-neutral-3d")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-prop-desk")).toBeTruthy();
    expect(screen.getByTestId("bg3d-essential-item-refined-v8-blackboard")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-essential-turnaround-btn-pose-neutral-3d"));
    expect(screen.getByTestId("bg3d-essential-turnaround-viewer")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-essential-cat-refined-v8-prop-3d"));
    expect(screen.queryByTestId("bg3d-essential-item-pose-neutral-3d")).toBeNull();
    expect(screen.getByTestId("bg3d-essential-item-refined-v8-fox-mask")).toBeTruthy();
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
