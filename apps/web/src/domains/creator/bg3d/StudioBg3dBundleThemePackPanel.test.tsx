// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dBundleThemePackPanel } from "./StudioBg3dBundleThemePackPanel";

const fixtureRaw = vi.hoisted(() => ({
  schema: "toonstudio.bg3d-bundle-theme-packs.v1",
  version: 1,
  inServiceOnly: true,
  downloadable: false,
  rights: { holder: "Test Holder", inServiceOnly: true, downloadable: false },
  assetRoot: "/assets/studio/bundle-v2/",
  themes: [{ id: "city", label: "도시" }],
  packs: [
    {
      catalogIds: ["cbv1-001-test-city"], title: "Test City", creator: "RG Poly", theme: "city",
      category: "environment", ingestPackIds: ["city-pack"], placeable: 2, twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} }, note: null,
    },
    {
      catalogIds: ["cbv1-077-test-props"], title: "Test Props", creator: "EmaceArt", theme: null,
      category: "prop", ingestPackIds: ["prop-pack"], placeable: 1, twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} }, note: null,
    },
  ],
  assets: [
    { id: "cbv1-ingest-city-001", pack: 0, path: "city-pack/Town_Hall.glb", bytes: 2048, sha256: "a".repeat(64), tris: 120 },
    { id: "cbv1-ingest-city-002", pack: 0, path: "city-pack/Bakery.glb", bytes: 1024, sha256: "b".repeat(64), tris: 60 },
    { id: "cbv1-ingest-prop-001", pack: 1, path: "prop-pack/Chair.glb", bytes: 512, sha256: "c".repeat(64), tris: 24 },
  ],
  presets: [
    { id: "bundle-preset-city", label: "Test City — 완성 장면", theme: "city", pack: 0, asset: 0 },
  ],
  crowdPacks: [
    {
      catalogIds: ["cbv1-007-test-crowd"], title: "Test Crowd", creator: "EmaceArt",
      category: "crowd-render-only", glbAssets: 42, note: null,
    },
  ],
  pendingPacks: [
    { catalogIds: ["cbv1-021-test"], title: "Slavica", reason: "recovering", reasonLabel: "회수가 끝나면 편입됩니다." },
  ],
  totals: { packs: 2, placeableAssets: 3, presets: 1, crowdGlbAssets: 42, deferredAssets: 0 },
}));

const availabilityStub = vi.hoisted(() => ({
  value: "available" as "available" | "unavailable",
}));

vi.mock("./studio-bg3d-bundle-theme-packs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-bg3d-bundle-theme-packs")>();
  return {
    ...actual,
    loadStudioBg3dBundleThemePacks: async () => actual.parseStudioBg3dBundleThemePacks(fixtureRaw),
    loadStudioBg3dBundleDeployAvailability: async () => availabilityStub.value,
  };
});

afterEach(() => {
  availabilityStub.value = "available";
  cleanup();
});

describe("StudioBg3dBundleThemePackPanel", () => {
  it("shows theme groups, presets and placeable assets from the bundle data", async () => {
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} />);

    expect(await screen.findByText(/배치 가능 3종/)).toBeTruthy();
    const groups = screen.getByRole("group", { name: "테마 팩 그룹" });
    for (const label of ["전체", "도시", "소품", "배경 군중"]) {
      expect(within(groups).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByText("프리빌트 장면 프리셋")).toBeTruthy();
    expect(screen.getByText("Test City — 완성 장면")).toBeTruthy();
    expect(document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-city-001']")).not.toBeNull();
    expect(document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-prop-001']")).not.toBeNull();
    expect(screen.getByText(/준비 중인 팩 1개/)).toBeTruthy();
  });

  it("adds the preset's merged scene asset and individual assets through onAdd", async () => {
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} />);
    await screen.findByText(/배치 가능 3종/);

    const presetButton = screen.getByRole("button", { name: "장면에 배치" }) as HTMLButtonElement;
    await waitFor(() => expect(presetButton.disabled).toBe(false));
    fireEvent.click(presetButton);
    expect(onAdd).toHaveBeenCalledWith("cbv1-ingest-city-001");
  });

  it("filters to prop packs in the props group without presets", async () => {
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} />);
    await screen.findByText(/배치 가능 3종/);

    fireEvent.click(screen.getByRole("button", { name: "소품" }));
    await waitFor(() => {
      expect(document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-prop-001']")).not.toBeNull();
    });
    expect(document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-city-001']")).toBeNull();
    expect(screen.queryByText("프리빌트 장면 프리셋")).toBeNull();

    const card = document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-prop-001']");
    if (!card) throw new Error("prop card missing");
    const addButton = within(card as HTMLElement).getByRole("button", { name: "장면에 추가" }) as HTMLButtonElement;
    await waitFor(() => expect(addButton.disabled).toBe(false));
    fireEvent.click(addButton);
    expect(onAdd).toHaveBeenCalledWith("cbv1-ingest-prop-001");
  });

  it("shows an honest not-deployed state and blocks placement when the deploy index is missing", async () => {
    availabilityStub.value = "unavailable";
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} />);
    await screen.findByText(/배치 가능 3종/);

    expect(await screen.findByText(/에셋 파일 배포가 아직 완료되지 않아/)).toBeTruthy();
    const addButton = screen.getByRole("button", { name: "장면에 배치" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();
    // 목록 열람·검색은 배포와 무관하게 계속 쓸 수 있다.
    expect(document.querySelector("[data-bundle-theme-asset-id='cbv1-ingest-city-001']")).not.toBeNull();
  });

  it("keeps crowd packs render-only: listed with the badge and no add buttons", async () => {
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} />);
    await screen.findByText(/배치 가능 3종/);

    fireEvent.click(screen.getByRole("button", { name: "배경 군중" }));
    await waitFor(() => {
      expect(document.querySelector("[data-bundle-crowd-pack='Test Crowd']")).not.toBeNull();
    });
    expect(screen.getByText("렌더 전용")).toBeTruthy();
    expect(screen.getByText(/GLB 42종/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "장면에 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "장면에 배치" })).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("disables add buttons while the panel is disabled", async () => {
    const onAdd = vi.fn();
    render(<StudioBg3dBundleThemePackPanel onAdd={onAdd} disabled />);
    await screen.findByText(/배치 가능 3종/);
    const addButton = screen.getByRole("button", { name: "장면에 배치" }) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("never renders a download or export affordance", async () => {
    render(<StudioBg3dBundleThemePackPanel onAdd={vi.fn()} />);
    await screen.findByText(/배치 가능 3종/);
    expect(screen.queryByText(/다운로드|내보내기|export|download/i)).toBeNull();
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
