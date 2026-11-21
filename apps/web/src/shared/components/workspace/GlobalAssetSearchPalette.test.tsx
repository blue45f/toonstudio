// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  GLOBAL_ASSET_CATALOG,
  GLOBAL_ASSET_QUICK_HUBS,
  extractKoreanChoseong,
  filterGlobalAssetCatalog,
  isEditableEventTarget,
  type GlobalAssetCatalogEntry,
} from "./global-asset-search-index";
import { GlobalAssetSearchPalette } from "./GlobalAssetSearchPalette";

function StandalonePaletteHarness({
  onSelectAsset,
  initialOpen = false,
}: {
  readonly onSelectAsset?: (asset: GlobalAssetCatalogEntry, targetHref: string) => void;
  readonly initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <MemoryRouter initialEntries={["/studio"]}>
      <div>
        <input aria-label="외부 입력창" type="text" />
        <GlobalAssetSearchPalette
          open={open}
          onClose={() => setOpen(false)}
          onOpenRequest={() => setOpen(true)}
          enableGlobalShortcut
          onSelectAsset={onSelectAsset}
        />
      </div>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
});

describe("GlobalAssetSearchPalette — 전역 통합 소재 검색 (⌘K / /)", () => {
  it("한글 초성 추출과 초성·한영 다중 키워드 검색이 정확히 동작한다", () => {
    expect(extractKoreanChoseong("로판 황궁")).toBe("ㄹㅍ ㅎㄱ");
    expect(extractKoreanChoseong("서울 홍대 야경")).toBe("ㅅㅇ ㅎㄷ ㅇㄱ");

    const rofanByChoseong = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "ㄹㅍ",
      category: "all",
      freeCommercialOnly: false,
    });
    expect(rofanByChoseong.length).toBeGreaterThanOrEqual(4);
    expect(rofanByChoseong[0]?.genre).toBe("로판");
    expect(
      rofanByChoseong.every((item) => {
        const hay = extractKoreanChoseong(`${item.titleKo}${item.genre}${item.keywords.join("")}`).replace(/\s+/gu, "");
        return hay.includes("ㄹㅍ");
      }),
    ).toBe(true);

    const wuxiaByEn = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "wuxia cliff",
      category: "all",
      freeCommercialOnly: false,
    });
    expect(wuxiaByEn[0]?.id).toBe("hero-3d-wuxia-cliff");

    const seoulChoseong = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "ㅅㅇ ㅎㄷ",
      category: "3d-hero",
      freeCommercialOnly: true,
    });
    expect(seoulChoseong.map((item) => item.id)).toEqual(["hero-3d-seoul-alley"]);
  });

  it("3D 배경 히어로 4종·배경·브러시·텍스처·포즈·효과음과 상업 무료 필터가 내장 인덱스에 완비된다", () => {
    const heroes = GLOBAL_ASSET_CATALOG.filter((item) => item.category === "3d-hero");
    expect(heroes).toHaveLength(4);
    expect(GLOBAL_ASSET_CATALOG.some((item) => item.category === "background")).toBe(true);
    expect(GLOBAL_ASSET_CATALOG.some((item) => item.category === "brush")).toBe(true);
    expect(GLOBAL_ASSET_CATALOG.some((item) => item.category === "texture")).toBe(true);
    expect(GLOBAL_ASSET_CATALOG.some((item) => item.category === "pose")).toBe(true);
    expect(GLOBAL_ASSET_CATALOG.some((item) => item.category === "sfx")).toBe(true);

    const freeOnly = filterGlobalAssetCatalog(GLOBAL_ASSET_CATALOG, {
      query: "",
      category: "all",
      freeCommercialOnly: true,
    });
    expect(freeOnly.length).toBeGreaterThan(0);
    expect(freeOnly.length).toBeLessThan(GLOBAL_ASSET_CATALOG.length);
    expect(freeOnly.every((item) => item.licenseTier !== "commercial-verified")).toBe(true);
    expect(GLOBAL_ASSET_QUICK_HUBS.map((hub) => hub.href)).toEqual([
      "/research/materials",
      "/market",
      "/studio/bg3d",
      "/studio",
    ]);
  });

  it("⌘K / Ctrl+K 및 입력창 밖 `/`로 열리고, 입력창 안 `/`는 입력을 방해하지 않는다", () => {
    render(<StandalonePaletteHarness />);
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    const outsideInput = screen.getByLabelText("외부 입력창");
    expect(isEditableEventTarget(outsideInput)).toBe(true);
    fireEvent.keyDown(outsideInput, { key: "/" });
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "/" });
    expect(screen.getByTestId("global-asset-search-dialog")).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("global-asset-search-dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByTestId("global-asset-search-dialog")).not.toBeNull();
  });

  it("화살표·Home·End·Enter 키보드 탐색과 1클릭 캔버스/소재 허브 이동을 지원한다", () => {
    const onSelect = vi.fn();
    render(<StandalonePaletteHarness initialOpen onSelectAsset={onSelect} />);

    const searchInput = screen.getByRole("combobox");
    fireEvent.change(searchInput, { target: { value: "브러시" } });

    const options = screen.getAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(searchInput, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(searchInput, { key: "End" });
    const allAfterEnd = screen.getAllByRole("option");
    expect(allAfterEnd.at(-1)?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(searchInput, { key: "Home" });
    const firstAfterHome = screen.getAllByRole("option")[0];
    expect(firstAfterHome?.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(searchInput, { key: "Enter", shiftKey: true });
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [pickedAsset, pickedHref] = onSelect.mock.calls[0] as [GlobalAssetCatalogEntry, string];
    expect(pickedHref).toBe(pickedAsset.canvasHref);
  });

  it("카테고리 필터·상업 무료 필터·소재 허브 1클릭 버튼이 정상 작동한다", () => {
    const onSelect = vi.fn();
    render(<StandalonePaletteHarness initialOpen onSelectAsset={onSelect} />);

    const bgChip = document.querySelector('[data-category-chip="background"]') as HTMLButtonElement;
    fireEvent.click(bgChip);
    expect(bgChip.getAttribute("aria-pressed")).toBe("true");
    const bgCount = screen.getAllByRole("option").length;
    expect(bgCount).toBe(3);

    const licenseToggle = document.querySelector('[data-license-toggle="true"]') as HTMLButtonElement;
    fireEvent.click(licenseToggle);
    expect(screen.getAllByRole("option").length).toBe(1);

    const hubBtn = screen.getByRole("button", { name: "소재 허브" });
    fireEvent.click(hubBtn);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bg-seoul-office-subway" }),
      "/research/materials?q=seoul-office",
    );
  });

  it("shared 경계·원시 HEX 0건·transition-all 0건·prefers-reduced-motion·44px 터치 계약을 준수한다", () => {
    const baseDir = path.resolve(process.cwd(), "apps/web/src/shared/components/workspace");
    const tsx = readFileSync(path.join(baseDir, "GlobalAssetSearchPalette.tsx"), "utf8");
    const css = readFileSync(path.join(baseDir, "global-asset-search-palette.css"), "utf8");

    expect(tsx).not.toMatch(/from\s+["'][^"']*domains\//u);
    expect(tsx).not.toMatch(/:\s*any\b|as\s+any\b/u);
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(tsx).not.toContain("transition-all");

    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//gu, "");
    expect(cssNoComments.match(/#[0-9a-fA-F]{3,8}\b/gu) ?? []).toEqual([]);
    expect(cssNoComments.match(/transition(?:-property)?\s*:\s*[^;]*\ball\b/gu) ?? []).toEqual([]);
    expect(cssNoComments).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/u);
    expect(cssNoComments).toContain("min-height: 44px");
    expect(cssNoComments).toContain("env(safe-area-inset-bottom)");
    const standardBackdrop = (cssNoComments.match(/(?<![-\w])backdrop-filter\s*:/gu) ?? []).length;
    const webkitBackdrop = (cssNoComments.match(/-webkit-backdrop-filter\s*:/gu) ?? []).length;
    expect(webkitBackdrop).toBe(standardBackdrop);
  });
});
