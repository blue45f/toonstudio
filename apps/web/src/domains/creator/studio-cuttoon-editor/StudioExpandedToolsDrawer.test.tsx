// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, type ComponentProps } from "react";
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

const commitEscape = vi.hoisted(() => ({ armed: false, sent: false }));

vi.mock("./StudioExpandedToolRunnerHost", async (importOriginal) => {
  const { StudioExpandedToolRunnerHost: Runner } =
    await importOriginal<typeof import("./StudioExpandedToolRunnerHost")>();
  return {
    StudioExpandedToolRunnerHost: function RunnerCommitProbe(props: ComponentProps<typeof Runner>) {
      useLayoutEffect(() => {
        if (!commitEscape.armed) return;
        commitEscape.armed = false;
        commitEscape.sent = true;
        screen.getByTestId("studio-expanded-tool-runner").dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );
      }, []);
      return <Runner {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  commitEscape.armed = false;
  commitEscape.sent = false;
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
    expect(screen.getByTestId("expanded-tools-tab-all").getAttribute("aria-selected")).toBe("true");
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(charTab.getAttribute("aria-selected")).toBe("true");

    // Escape 키로 서랍 닫기
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("분류에서 연속 화살표와 Home·End로 선택·초점을 옮기고 가려진 탭을 표시한다", () => {
    render(<StudioExpandedToolsDrawer open embeddedInModal initialCategory="bg3d-dcc" />);
    const rail = screen.getByRole("tablist");
    const tabs = screen.getAllByRole<HTMLButtonElement>("tab");
    const all = screen.getByTestId("expanded-tools-tab-all");
    const bg = screen.getByTestId("expanded-tools-tab-bg3d-dcc");
    const character = screen.getByTestId("expanded-tools-tab-character-3d");
    const story = screen.getByTestId("expanded-tools-tab-story-planning");
    const motion = screen.getByTestId("expanded-tools-tab-motion-production");
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 300, 48));
    for (const [tab, left] of [[all, 0], [character, 280], [story, 380], [motion, 480]] as const) {
      vi.spyOn(tab, "getBoundingClientRect").mockImplementation(() => new DOMRect(left - rail.scrollLeft, 0, 100, 48));
    }

    function press(key: string): void {
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    }
    function expectTab(target: HTMLElement, scrollLeft: number): void {
      expect(document.activeElement).toBe(target);
      expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toEqual([target]);
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([target]);
      expect(rail.scrollLeft).toBe(scrollLeft);
    }

    bg.focus();
    press("ArrowRight");
    expectTab(character, 80);
    press("ArrowRight");
    expectTab(story, 180);
    press("Home");
    expectTab(all, 0);
    rail.scrollLeft = 64;
    press("Home");
    expectTab(all, 0);
    press("End");
    expectTab(motion, 280);
    press("ArrowRight");
    expectTab(all, 0);
    press("ArrowLeft");
    expectTab(motion, 280);
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

  it("도구 카드 클릭 시 인터랙티브 실행 호스트가 열리고 Escape 1회로 목록·포커스 복원, 2회로 서랍을 닫는다", async () => {
    const headCmd = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.find(
      (cmd) => cmd.panelLoaderId === "head-mixer-3d-panel",
    );
    if (!headCmd) throw new Error("head-mixer-3d-panel 커맨드를 찾을 수 없습니다.");

    const onClose = vi.fn();
    const onLaunchTool = vi.fn();
    render(
      <StudioExpandedToolsDrawer
        open
        initialCategory="all"
        commands={[headCmd]}
        onClose={onClose}
        onLaunchTool={onLaunchTool}
      />,
    );

    const card = screen.getByTestId(`expanded-tool-card-${headCmd.id}`);
    fireEvent.click(card);

    // 지연 로드된 러너 호스트와 실제 3D 두상 믹서 패널이 마운트되어야 한다
    const runner = await screen.findByTestId("studio-expanded-tool-runner");
    expect(runner.getAttribute("data-runner-tool-id")).toBe(headCmd.id);
    expect(screen.getByTestId("studio-3d-head-mixer-panel")).toBeTruthy();
    expect(onLaunchTool).toHaveBeenCalledOnce();

    // 1차 Escape: 도구 목록으로 복귀하고 직전 카드 버튼에 포커스가 복원되어야 한다 (서랍 미닫힘)
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("studio-expanded-tool-runner")).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();

    const restoredCard = screen.getByTestId(`expanded-tool-card-${headCmd.id}`);
    expect(document.activeElement).toBe(restoredCard);

    // 2차 Escape: 목록 상태에서 서랍을 닫아야 한다
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("StudioCommandSearchHost에서 도구를 실행하면 최근 실행 도구 상태를 기록하고 2단계 Escape로 복귀·닫기한다", async () => {
    render(<StudioCommandSearchHost />);
    expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull();

    const launcher = screen.getByTestId("studio-expanded-tools-launcher");
    fireEvent.click(launcher);

    const drawer = await screen.findByTestId("studio-expanded-tools-drawer");
    expect(drawer).toBeTruthy();

    // 전체 탭으로 전환 후 3D 두상 믹서 실행
    fireEvent.click(screen.getByTestId("expanded-tools-tab-all"));
    const headCmd = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.find(
      (cmd) => cmd.panelLoaderId === "head-mixer-3d-panel",
    );
    if (!headCmd) throw new Error("head-mixer-3d-panel 커맨드를 찾을 수 없습니다.");

    fireEvent.click(screen.getByTestId(`expanded-tool-card-${headCmd.id}`));
    await screen.findByTestId("studio-expanded-tool-runner");

    expect(launcher.getAttribute("data-recent-expanded-tool")).toBe(headCmd.id);
    expect(launcher.getAttribute("title")).toContain(headCmd.koreanLabel);

    // 1차 Escape: 목록 복귀(서랍 유지)
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("studio-expanded-tool-runner")).toBeNull();
    });
    expect(screen.getByTestId("studio-expanded-tools-drawer")).toBeTruthy();

    // 2차 Escape: 서랍 닫기
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull();
    });
  });

  it("실행 패널이 붙는 프레임의 첫 Escape에서 서랍을 닫지 않고 목록과 카드 포커스를 복구한다", async () => {
    const headCmd = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS.find((cmd) => cmd.panelLoaderId === "head-mixer-3d-panel");
    if (!headCmd) throw new Error("head-mixer-3d-panel 커맨드를 찾을 수 없습니다.");
    const cardId = `expanded-tool-card-${headCmd.id}`;
    async function openDrawerAndLaunch() {
      fireEvent.click(screen.getByTestId("studio-expanded-tools-launcher"));
      await screen.findByTestId("studio-expanded-tools-drawer");
      fireEvent.click(screen.getByTestId("expanded-tools-tab-all"));
      fireEvent.click(screen.getByTestId(cardId));
    }

    const warm = render(<StudioCommandSearchHost />);
    await openDrawerAndLaunch();
    await screen.findByTestId("studio-expanded-tool-runner");
    warm.unmount();

    render(<StudioCommandSearchHost />);
    commitEscape.armed = true;
    await openDrawerAndLaunch();
    await waitFor(() => {
      expect(commitEscape.sent).toBe(true);
      expect(screen.getByTestId("studio-expanded-tools-launcher").getAttribute("aria-expanded")).toBe("true");
      expect(screen.queryByTestId("studio-expanded-tool-runner")).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId(cardId));
    });

    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("studio-expanded-tools-drawer")).toBeNull());
  });
});
