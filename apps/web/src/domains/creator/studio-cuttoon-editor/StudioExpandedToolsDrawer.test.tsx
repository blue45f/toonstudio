// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_EXPANDED_ECOSYSTEM_COMMANDS } from "../shortcuts/studio-expanded-ecosystem-commands";
import { StudioCommandSearchHost } from "../StudioCommandSearchHost";
import { STUDIO_FORBIDDEN_DEFAULT_UI_TERMS } from "../studio-product-ia";
import { StudioExpandedToolsDrawer } from "./StudioExpandedToolsDrawer";
import {
  clearEcosystemLazyLoaderOverrides,
  registerEcosystemLazyLoaderOverride,
} from "./studio-ecosystem-lazy-registry";
import {
  STUDIO_EXPANDED_TOOL_CATEGORIES,
  countExpandedToolsByCategory,
  filterExpandedTools,
  formatShortcutKeycaps,
} from "./studio-expanded-tools-catalog";

afterEach(() => {
  cleanup();
  clearEcosystemLazyLoaderOverrides();
});

describe("StudioExpandedToolsDrawer", () => {
  it("확장 생태계 전체 커맨드를 6대 카테고리에 누락 없이 배정하며 금지 UI 용어가 0건이다", () => {
    expect(STUDIO_EXPANDED_TOOL_CATEGORIES).toHaveLength(6);
    const counts = countExpandedToolsByCategory(STUDIO_EXPANDED_ECOSYSTEM_COMMANDS);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.length);
    expect(total).toBe(80);

    // 80/80 전체 카드가 라이브 로드 상태(planned === 0)여야 한다
    const allCards = filterExpandedTools({ categoryId: "all", query: "" });
    expect(allCards).toHaveLength(80);
    expect(allCards.filter((card) => card.status === "planned")).toHaveLength(0);

    for (const cat of STUDIO_EXPANDED_TOOL_CATEGORIES) {
      expect(counts[cat.id]).toBeGreaterThan(0);
      const lower = `${cat.labelKo} ${cat.aliasChipKo} ${cat.descriptionKo}`.toLowerCase();
      for (const forbidden of STUDIO_FORBIDDEN_DEFAULT_UI_TERMS) {
        expect(lower).not.toContain(forbidden.toLowerCase());
      }
    }

    expect(formatShortcutKeycaps("Shift+Alt+P")).toEqual(["Shift", "Alt", "P"]);
  });

  it("6대 카테고리 탭은 순수 한국어 작가명만 노출하며 경쟁 툴 별칭 검색은 100% 매칭한다", () => {
    const onClose = vi.fn();
    render(<StudioExpandedToolsDrawer open initialCategory="bg3d-dcc" onClose={onClose} />);

    // 기본 가시 DOM에 경쟁사 브랜드명이 노출되지 않아야 한다.
    const tablist = screen.getByTestId("expanded-tools-category-tabs");
    const visibleTabText = tablist.textContent ?? "";
    for (const cat of STUDIO_EXPANDED_TOOL_CATEGORIES) {
      expect(visibleTabText).toContain(cat.labelKo);
    }
    expect(visibleTabText).not.toMatch(
      /Photoshop|Figma|Blender|ABLER|SHAPER|VRoid|Plotr|Manyfast|포토샵|크리타|피그마|일러스트|블렌더/iu,
    );

    const bgTab = screen.getByTestId("expanded-tools-tab-bg3d-dcc");
    expect(bgTab.getAttribute("aria-selected")).toBe("true");
    expect(bgTab.getAttribute("data-active-baseline")).toBe("inset-lavender-2px");

    // 화살표 오른쪽으로 다음 카테고리(character-3d) 이동
    fireEvent.keyDown(bgTab, { key: "ArrowRight" });
    const charTab = screen.getByTestId("expanded-tools-tab-character-3d");
    expect(charTab.getAttribute("aria-selected")).toBe("true");
    expect(charTab.getAttribute("data-active-baseline")).toBe("inset-lavender-2px");

    // 경쟁 툴 별칭 검색 ("Shaper", "Photoshop", "Blender", "Plotr", "Manyfast")은 100% 매칭 유지
    const searchInput = screen.getByTestId("expanded-tools-search-input");
    for (const aliasQuery of ["Shaper", "Photoshop", "Blender", "Plotr", "Manyfast"]) {
      fireEvent.change(searchInput, { target: { value: aliasQuery } });
      const matches = filterExpandedTools({ categoryId: "all", query: aliasQuery });
      expect(matches.length, aliasQuery).toBeGreaterThan(0);
      expect(screen.getByTestId("expanded-tools-grid").querySelectorAll("button").length).toBe(
        matches.length,
      );
    }

    // Escape 키로 서랍 닫기
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("카드 호버 예열 및 클릭 시 동적 로더를 호출하고 상태를 안내한다", async () => {
    const mockModule = { StudioTestLaunchToken: "ok" };
    const importer = vi.fn(async () => mockModule);
    const targetCmd = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS[0];
    registerEcosystemLazyLoaderOverride(targetCmd.panelLoaderId, importer);

    const onLaunchTool = vi.fn();
    render(
      <StudioExpandedToolsDrawer
        open
        initialCategory="all"
        commands={[targetCmd]}
        onLaunchTool={onLaunchTool}
      />,
    );

    const card = screen.getByTestId(`expanded-tool-card-${targetCmd.id}`);
    fireEvent.mouseEnter(card);
    fireEvent.click(card);

    await waitFor(() => {
      expect(onLaunchTool).toHaveBeenCalledWith(targetCmd, mockModule);
    });
    expect(importer).toHaveBeenCalledOnce();
    expect(screen.getByTestId("expanded-tools-status").textContent).toContain(
      targetCmd.koreanLabel,
    );
  });

  it("닫힘 상태(open=false)에서는 DOM을 마운트하지 않는다", () => {
    render(<StudioExpandedToolsDrawer open={false} />);
    expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull();
  });

  it("StudioCommandSearchHost에서 1클릭으로 지연 로드 서랍을 열고 Escape로 닫는다", async () => {
    render(<StudioCommandSearchHost />);
    expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull();

    const launcher = screen.getByTestId("studio-expanded-tools-launcher");
    fireEvent.click(launcher);

    const drawer = await screen.findByTestId("studio-expanded-tools-drawer");
    expect(drawer).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull();
    });
  });
});
