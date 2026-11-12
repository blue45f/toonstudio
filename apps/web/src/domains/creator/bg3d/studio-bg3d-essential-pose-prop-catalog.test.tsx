// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import v11Provenance from "../../../../public/studio-assets/kitbash-v11/provenance.json";

import { StudioBg3dAuthoredEnvironmentCyclesPanel } from "./StudioBg3dAuthoredEnvironmentCyclesPanel";
import { StudioBg3dEssentialPosePropPanel } from "./StudioBg3dEssentialPosePropPanel";
import { StudioBg3dRoomBuilderPanel } from "./StudioBg3dRoomBuilderPanel";
import { StudioBg3dWebtoonBackgroundPicker } from "./StudioBg3dWebtoonBackgroundPicker";
import {
  applyStudioBg3dCyclesLayerOverrides,
  buildStudioBg3dCyclesMultiPassPsd,
  compositeStudioBg3dCyclesLayers,
} from "./studio-bg3d-cycles-multipass-compositor";
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
  resolveStudioBg3dRefinedV8PropCounterpart,
  searchStudioBg3dEssentialAssets,
} from "./studio-bg3d-essential-pose-prop-catalog";
import { clampStudioBg3dRoomSpec } from "./studio-bg3d-room-builder";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

describe("studio-bg3d-essential-pose-prop-catalog & panels", () => {
  afterEach(() => {
    cleanup();
  });

  it("배치 요청이 끝나도 실제 위치 확정 전에는 성공 상태를 만들지 않는다", async () => {
    let finishRequest: () => void = () => undefined;
    const request = new Promise<void>((resolve) => { finishRequest = resolve; });
    const onAdd = vi.fn(() => request);
    const rendered = render(<StudioBg3dAuthoredEnvironmentCyclesPanel onAdd={onAdd} defaultExpanded />);
    const authored = STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1[0];
    if (!authored) throw new Error("자체 제작 배경 fixture 필요");
    const action = screen.getByTestId(`bg3d-authored-add-${authored.id}`);
    fireEvent.click(action);
    expect(onAdd).toHaveBeenCalledWith(authored.id);
    expect(action.textContent).toBe("배치 위치 고르기");
    expect(screen.queryByText(/배치됨/)).toBeNull();
    await act(async () => { finishRequest(); await request; });
    expect(action.textContent).toBe("배치 위치 고르기");
    expect(screen.queryByText(/배치됨/)).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-tab-cycles-v6"));
    const cyclesAction = screen.getByTestId("bg3d-cycles-v6-add-scene");
    fireEvent.click(cyclesAction);
    expect(cyclesAction.textContent).toContain("배치 위치 고르기");
    expect(screen.queryByText(/배치됨/)).toBeNull();
    rendered.rerender(<StudioBg3dAuthoredEnvironmentCyclesPanel onAdd={onAdd} defaultExpanded disabled />);
    fireEvent.click(cyclesAction);
    expect(onAdd).toHaveBeenCalledTimes(2);
  });

  it("V11 상부 배경을 포함한 115종 CC0 GLB와 기존 assets/3d 정본을 빠짐없이 등록한다", () => {
    expect(STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG).toHaveLength(115);
    expect(STUDIO_BG3D_ESSENTIAL_ASSET_CATEGORIES).toHaveLength(8);

    const poses = listStudioBg3dEssentialAssetsByCategory("pose-3d");
    const essentialProps = listStudioBg3dEssentialAssetsByCategory("essential-prop-3d");
    const refinedV8Props = listStudioBg3dEssentialAssetsByCategory("refined-v8-prop-3d");
    const kitbashV9Props = listStudioBg3dEssentialAssetsByCategory("kitbash-v9-prop-3d");
    const kitbashV10Props = listStudioBg3dEssentialAssetsByCategory("kitbash-v10-prop-3d");
    const kitbashV11Props = listStudioBg3dEssentialAssetsByCategory("kitbash-v11-prop-3d");
    const originalSceneProps = listStudioBg3dEssentialAssetsByCategory("original-scene-prop-3d");
    const originalHandWearProps = listStudioBg3dEssentialAssetsByCategory("original-hand-wear-prop-3d");

    expect(poses).toHaveLength(8);
    expect(essentialProps).toHaveLength(8);
    expect(refinedV8Props).toHaveLength(11);
    expect(kitbashV9Props).toHaveLength(6);
    expect(kitbashV10Props).toHaveLength(8);
    expect(kitbashV11Props).toHaveLength(6);
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

  it("V11 카탈로그의 6개 GLB는 출처·라이선스 원장과 같은 경로·바이트·SHA를 갖는다", () => {
    const entries = listStudioBg3dEssentialAssetsByCategory("kitbash-v11-prop-3d");
    const root = path.join(WEB_PUBLIC_DIR, "studio-assets/kitbash-v11");
    const files = fs.readdirSync(root).filter((name) => name.endsWith(".glb")).sort();
    expect(entries.map((entry) => path.basename(entry.glbUrl)).sort()).toEqual(files);
    expect(v11Provenance.files.map((record) => record.file).sort()).toEqual(files);
    expect(v11Provenance.thumbnails.map((record) => record.file).sort()).toEqual(entries.map((entry) => `thumbnails/${path.basename(entry.glbUrl, ".glb")}.png`).sort());
    expect(v11Provenance.license).toBe("CC0-1.0");
    expect(v11Provenance.externalSources).toEqual([]);
    const licenses = fs.readFileSync(path.join(root, "LICENSES.md"), "utf8");
    for (const record of v11Provenance.files) {
      const bytes = fs.readFileSync(path.join(root, record.file));
      expect(bytes.byteLength).toBe(record.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
      expect(licenses).toContain(record.file);
    }
    for (const record of v11Provenance.thumbnails) {
      const bytes = fs.readFileSync(path.join(root, record.file));
      expect(bytes.byteLength).toBe(record.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
    }
  });

  it("실제 V11 GLB에 높이 1.5m 블라인드와 방송 스피커의 장착부·그릴·드라이버가 들어 있다", async () => {
    const loader = new GLTFLoader();
    const load = async (slug: string) => {
      const bytes = fs.readFileSync(path.join(WEB_PUBLIC_DIR, `studio-assets/kitbash-v11/${slug}.glb`));
      return (await loader.parseAsync(Uint8Array.from(bytes).buffer, "")).scene;
    };
    const blind = await load("window-venetian-blind-pelmet");
    const bounds = new Box3().setFromObject(blind);
    expect(bounds.getSize(new Vector3()).y).toBeCloseTo(1.5, 6);
    expect(bounds.max.y).toBeCloseTo(0, 6);
    expect(blind.getObjectByName("BlindBottomRail")).toBeDefined();
    const classroom = await load("classroom-ceiling-speaker-projector");
    for (const component of ["BroadcastSpeakerMount", "BroadcastSpeakerCabinet", "BroadcastSpeakerGrille", "BroadcastSpeakerDriver"]) {
      expect(classroom.getObjectByName(component)).toBeDefined();
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

    fireEvent.click(screen.getByTestId("bg3d-essential-cat-kitbash-v10-prop-3d"));
    expect(screen.getByTestId("bg3d-essential-item-kitbash-v10-alley-ac-meter-pipe-wall-v10")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-essential-cat-kitbash-v11-prop-3d"));
    expect(screen.getByTestId("bg3d-essential-item-kitbash-v11-window-venetian-blind-pelmet")).toBeTruthy();

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

    // Toggle depth pass visibility and adjust opacity, then export 4-layer PSD
    fireEvent.click(screen.getByTestId("bg3d-cycles-toggle-visible-depth"));
    fireEvent.change(screen.getByTestId("bg3d-cycles-opacity-depth"), {
      target: { value: "65" },
    });
    fireEvent.click(screen.getByTestId("bg3d-cycles-export-psd"));
    expect(screen.getByTestId("bg3d-cycles-psd-receipt").textContent).toContain(
      "PSD 생성 완료: ts-bg3d-compact_apartment_interior-v6-cycles-4pass.psd (4레이어",
    );

    fireEvent.click(screen.getByTestId("bg3d-cycles-v6-add-scene"));
    expect(onAdd).toHaveBeenCalledWith("ts-bg3d-compact_apartment_interior-v6");
  });

  it("resolves all 11 V8 refined hero prop counterparts and composites 4-pass Cycles PSD buffers accurately", () => {
    const matchingOriginals = STUDIO_BG3D_ESSENTIAL_POSE_PROP_CATALOG.filter(
      (entry) => resolveStudioBg3dRefinedV8PropCounterpart(entry) !== null,
    );
    expect(matchingOriginals).toHaveLength(11);
    expect(resolveStudioBg3dRefinedV8PropCounterpart("original-3d-blackboard")?.id).toBe(
      "refined-v8-blackboard",
    );
    expect(resolveStudioBg3dRefinedV8PropCounterpart("refined-v8-blackboard")).toBeNull();

    const basePlan = buildStudioBg3dCyclesCompositorLayerPlan(
      "ts-bg3d-compact_apartment_interior-v6",
    )!;
    const overridden = applyStudioBg3dCyclesLayerOverrides(basePlan, {
      depth: { visible: true, opacity: 0.5 },
    });
    expect(overridden.find((l) => l.pass === "depth")?.visible).toBe(true);
    expect(overridden.find((l) => l.pass === "depth")?.opacity).toBe(0.5);

    const w = 4;
    const h = 4;
    const fill = (r: number, g: number, b: number) => {
      const arr = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < arr.length; i += 4) {
        arr[i] = r;
        arr[i + 1] = g;
        arr[i + 2] = b;
        arr[i + 3] = 255;
      }
      return arr;
    };
    const buffers = {
      beauty: fill(200, 180, 160),
      ao: fill(128, 128, 128),
      normal: fill(128, 128, 255),
      depth: fill(220, 220, 240),
    };
    const composite = compositeStudioBg3dCyclesLayers(w, h, overridden, buffers);
    expect(composite).toHaveLength(w * h * 4);
    expect(composite[3]).toBe(255);

    const psdResult = buildStudioBg3dCyclesMultiPassPsd({
      environmentId: "ts-bg3d-compact_apartment_interior-v6",
      title: "Compact Apartment Cycles",
      width: w,
      height: h,
      layers: overridden,
      buffers,
    });
    expect(psdResult.layerNames).toHaveLength(4);
    expect(psdResult.visiblePassCount).toBe(3);
    expect(psdResult.byteLength).toBeGreaterThan(64);
  });

  it("renders 3D Shaper 8-Universe Customizer in StudioBg3dWebtoonBackgroundPicker and builds world with VARCO hero props", () => {
    const committed: unknown[] = [];
    const onBuild = vi.fn((buildParts: (existingCount: number, view: { position: readonly [number, number, number]; target: readonly [number, number, number] }) => unknown[]) => {
      const parts = buildParts(0, { position: [0, 2, 10], target: [0, 1, 0] });
      committed.push(parts);
      return true;
    });

    render(
      <StudioBg3dWebtoonBackgroundPicker
        autoCutaway={false}
        onAutoCutawayChange={vi.fn()}
        onBuild={onBuild}
      />,
    );

    fireEvent.click(screen.getByTestId("bg3d-world-shaper-toggle"));
    expect(screen.getByTestId("bg3d-world-shaper-section")).toBeTruthy();

    fireEvent.change(screen.getByTestId("bg3d-world-shaper-universe-select"), {
      target: { value: "romance-fantasy-palace" },
    });
    fireEvent.change(screen.getByTestId("bg3d-world-shaper-mood-select"), {
      target: { value: "sunset-romance" },
    });
    fireEvent.change(screen.getByTestId("bg3d-world-shaper-blend-range"), {
      target: { value: "75" },
    });

    fireEvent.click(screen.getByTestId("bg3d-world-shaper-build-btn"));
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(committed).toHaveLength(1);
    expect((committed[0] as unknown[]).length).toBeGreaterThan(20);
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
