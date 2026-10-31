// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCc0SurfaceMaterialPicker } from "./StudioBg3dCc0SurfaceMaterialPicker";
import { StudioBg3dPurchasedSurfaceMaterialPicker } from "./StudioBg3dPurchasedSurfaceMaterialPicker";
import { STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS } from "./studio-bg3d-purchased-surface-material-catalog";

import type { StudioBg3dPurchasedSurfaceMaterialPickerProps } from "./StudioBg3dPurchasedSurfaceMaterialPicker";

const locale = vi.hoisted(() => {
  const state: { current: "ko" | "en" } = { current: "ko" };
  return state;
});

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string, en: string) => locale.current === "ko" ? ko : en,
}));

function materialCard(materialId: string) {
  return screen.getByTestId(`bg3d-purchased-material-${materialId}`);
}

function selectedSource(materialId: string): HTMLSelectElement {
  const select = within(materialCard(materialId)).getByRole("combobox");
  if (!(select instanceof HTMLSelectElement)) throw new Error("원본 선택 입력이 필요합니다.");
  return select;
}

function firstMaterialWithNativeSource() {
  const material = STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.find((entry) => entry.variants.some((variant) => variant.sourceVariant === "native-8k"));
  if (!material) throw new Error("8K 원본 재질이 필요합니다.");
  return material;
}

describe("구매 번들 표면 재질 선택", () => {
  afterEach(() => {
    cleanup();
    locale.current = "ko";
    vi.clearAllMocks();
  });

  it("접힌 목록은 프리뷰와 원본 선택 입력을 만들지 않는다", () => {
    const { container } = render(<StudioBg3dPurchasedSurfaceMaterialPicker onSelectMaterial={vi.fn()} />);
    expect(screen.getByTestId("bg3d-purchased-surface-material-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("11개 재질과 실제 19개 원본을 표시하고 확보한 최고 해상도를 기본으로 고른다", () => {
    const { container } = render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded onSelectMaterial={vi.fn()} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(11);
    expect(screen.getAllByRole("option")).toHaveLength(19);
    expect(screen.getAllByRole("option", { name: "8K 원본 · 4맵" })).toHaveLength(8);
    expect(screen.getAllByRole("option", { name: "2K Godot 원본 · 3맵" })).toHaveLength(11);
    for (const material of STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS) {
      const highest = material.variants.find((entry) => entry.resolution === 8192)
        ?? material.variants.find((entry) => entry.resolution === 2048);
      expect(highest).toBeDefined();
      expect(selectedSource(material.id).value).toBe(highest?.id);
      expect(selectedSource(material.id).labels?.item(0)?.textContent).toBe("원본 선택");
    }
    const previewUrls = new Set(STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.map((material) => material.previewUrl));
    const nativeChannelUrls = new Set(STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.flatMap((material) => material.variants
      .filter((variant) => variant.sourceVariant === "native-8k")
      .flatMap((variant) => [variant.baseColorUrl, variant.pbrMaps?.roughnessUrl, variant.pbrMaps?.normalGlUrl, variant.pbrMaps?.metalnessUrl])));
    for (const image of container.querySelectorAll("img")) {
      expect(previewUrls.has(image.getAttribute("src") ?? "")).toBe(true);
      expect(nativeChannelUrls.has(image.getAttribute("src") ?? "")).toBe(false);
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("decoding")).toBe("async");
    }
  });

  it("원본을 바꾸기만 해서는 적용하지 않고 적용할 때 선택한 variant ID를 넘긴다", () => {
    const onSelectMaterial = vi.fn<StudioBg3dPurchasedSurfaceMaterialPickerProps["onSelectMaterial"]>();
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded onSelectMaterial={onSelectMaterial} />);
    const material = firstMaterialWithNativeSource();
    const native = material.variants.find((entry) => entry.sourceVariant === "native-8k");
    const godot = material.variants.find((entry) => entry.sourceVariant === "godot-2k");
    if (!native || !godot) throw new Error("두 해상도 원본이 필요합니다.");
    const apply = within(materialCard(material.id)).getByRole("button", { name: `${material.labelKo} 적용` });
    fireEvent.click(apply);
    expect(onSelectMaterial).toHaveBeenLastCalledWith(native, expect.objectContaining({ surfaceMaterialId: native.id }));
    fireEvent.change(selectedSource(material.id), { target: { value: godot.id } });
    expect(onSelectMaterial).toHaveBeenCalledTimes(1);
    fireEvent.click(apply);
    expect(onSelectMaterial).toHaveBeenLastCalledWith(godot, expect.objectContaining({ surfaceMaterialId: godot.id }));
    expect(onSelectMaterial).toHaveBeenCalledTimes(2);
  });

  it("2K만 확보한 세 재질에는 없는 8K 선택지를 만들지 않는다", () => {
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded onSelectMaterial={vi.fn()} />);
    const godotOnly = STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS.filter((material) => !material.variants.some((entry) => entry.sourceVariant === "native-8k"));
    expect(godotOnly).toHaveLength(3);
    for (const material of godotOnly) {
      const select = selectedSource(material.id);
      expect(select.disabled).toBe(true);
      expect(within(select).getAllByRole("option")).toHaveLength(1);
      expect(within(select).queryByRole("option", { name: /8K/ })).toBeNull();
    }
  });

  it("저장된 2K 원본을 다시 열면 기본 8K 대신 저장한 원본을 선택하고 적용한다", () => {
    const material = firstMaterialWithNativeSource();
    const godot = material.variants.find((entry) => entry.sourceVariant === "godot-2k");
    if (!godot) throw new Error("저장된 2K 원본이 필요합니다.");
    const onSelectMaterial = vi.fn();
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded selectedMaterialId={godot.id} onSelectMaterial={onSelectMaterial} />);
    expect(selectedSource(material.id).value).toBe(godot.id);
    const apply = within(materialCard(material.id)).getByRole("button", { name: `${material.labelKo} 적용` });
    expect(apply.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(apply);
    expect(onSelectMaterial).toHaveBeenLastCalledWith(godot, expect.objectContaining({ surfaceMaterialId: godot.id }));
  });

  it("상위 적용 ID 변경을 반영하고 사용자가 명시한 원본 선택은 유지한다", () => {
    const material = firstMaterialWithNativeSource();
    const native = material.variants.find((entry) => entry.sourceVariant === "native-8k");
    const godot = material.variants.find((entry) => entry.sourceVariant === "godot-2k");
    if (!native || !godot) throw new Error("두 해상도 원본이 필요합니다.");
    const onSelectMaterial = vi.fn();
    const { rerender } = render(<StudioBg3dCc0SurfaceMaterialPicker defaultExpanded selectedMaterialId={godot.id} onSelectMaterial={onSelectMaterial} />);
    fireEvent.click(screen.getByTestId("bg3d-purchased-surface-material-toggle"));
    expect(selectedSource(material.id).value).toBe(godot.id);
    rerender(<StudioBg3dCc0SurfaceMaterialPicker defaultExpanded selectedMaterialId={native.id} onSelectMaterial={onSelectMaterial} />);
    expect(selectedSource(material.id).value).toBe(native.id);
    const purchased = within(materialCard(material.id)).getByRole("button", { name: `${material.labelKo} 적용` });
    expect(purchased.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(selectedSource(material.id), { target: { value: godot.id } });
    rerender(<StudioBg3dCc0SurfaceMaterialPicker defaultExpanded selectedMaterialId="polyhaven-brick-wall-001" onSelectMaterial={onSelectMaterial} />);
    expect(selectedSource(material.id).value).toBe(godot.id);
    const cc0 = screen.getByTestId("bg3d-cc0-surface-item-polyhaven-brick-wall-001");
    expect(cc0.getAttribute("aria-pressed")).toBe("true");
    expect(purchased.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(purchased);
    expect(onSelectMaterial).toHaveBeenLastCalledWith(godot, expect.objectContaining({ surfaceMaterialId: godot.id }));
    expect(cc0.getAttribute("aria-pressed")).toBe("true");
    expect(purchased.getAttribute("aria-pressed")).toBe("false");
    rerender(<StudioBg3dCc0SurfaceMaterialPicker defaultExpanded selectedMaterialId={godot.id} onSelectMaterial={onSelectMaterial} />);
    expect(cc0.getAttribute("aria-pressed")).toBe("false");
    expect(purchased.getAttribute("aria-pressed")).toBe("true");
  });

  it("사용 중지 상태에서는 원본 선택과 적용을 모두 막는다", () => {
    const onSelectMaterial = vi.fn();
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded disabled onSelectMaterial={onSelectMaterial} />);
    for (const material of STUDIO_BG3D_PURCHASED_SURFACE_MATERIALS) {
      expect(selectedSource(material.id).disabled).toBe(true);
      const apply = within(materialCard(material.id)).getByRole("button", { name: `${material.labelKo} 적용` });
      fireEvent.click(apply);
    }
    expect(onSelectMaterial).not.toHaveBeenCalled();
  });

  it("프리뷰 실패 후 사용자가 다시 불러올 수 있다", () => {
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded onSelectMaterial={vi.fn()} />);
    const material = firstMaterialWithNativeSource();
    const card = materialCard(material.id);
    const image = card.querySelector("img");
    if (!image) throw new Error("구매 재질 프리뷰가 필요합니다.");
    fireEvent.error(image);
    const retry = within(card).getByRole("button", { name: `${material.labelKo} 미리보기 다시 불러오기` });
    fireEvent.click(retry);
    expect(card.querySelector("img")?.getAttribute("src")).toBe(material.previewUrl);
  });

  it("공통 적용 ID로 CC0와 구매 재질을 동시에 선택 표시하지 않는다", () => {
    const onSelectMaterial = vi.fn();
    render(<StudioBg3dCc0SurfaceMaterialPicker defaultExpanded onSelectMaterial={onSelectMaterial} />);
    const cc0 = screen.getByTestId("bg3d-cc0-surface-item-polyhaven-brick-wall-001");
    fireEvent.click(cc0);
    expect(cc0.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("bg3d-purchased-surface-material-toggle"));
    const material = firstMaterialWithNativeSource();
    const purchased = within(materialCard(material.id)).getByRole("button", { name: `${material.labelKo} 적용` });
    fireEvent.click(purchased);
    expect(cc0.getAttribute("aria-pressed")).toBe("false");
    expect(purchased.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(cc0);
    expect(cc0.getAttribute("aria-pressed")).toBe("true");
    expect(purchased.getAttribute("aria-pressed")).toBe("false");
    expect(onSelectMaterial).toHaveBeenCalledTimes(3);
  });

  it("신규 문구와 원본 선택에 영어 원문도 제공한다", () => {
    locale.current = "en";
    render(<StudioBg3dPurchasedSurfaceMaterialPicker defaultExpanded onSelectMaterial={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Plasticine surface materials (11)" })).toBeDefined();
    expect(screen.getAllByRole("option", { name: "Original 8K · 4 maps" })).toHaveLength(8);
    expect(screen.getAllByRole("option", { name: "Original Godot 2K · 3 maps" })).toHaveLength(11);
  });
});
