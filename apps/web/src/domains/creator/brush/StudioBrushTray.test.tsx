// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_BRUSH_QUARANTINED_PRESET_IDS } from "./studio-brush-quarantine";
import { STUDIO_V6_BRUSH_CATALOG_ITEMS } from "./studio-brush-v6-catalog";
import { StudioBrushTray } from "./StudioBrushTray";

import type { StudioBrushTrayItem } from "../studio-creative-ux";

const traySource = readFileSync(
  resolve(process.cwd(), "apps/web/src/domains/creator/brush/StudioBrushTray.tsx"),
  "utf8"
);

afterEach(cleanup);

describe("StudioBrushTray", () => {
  it("renders recent and favorite brushes with a single full-library affordance", () => {
    const onSelect = vi.fn();
    const onOpenLibrary = vi.fn();
    const html = renderToStaticMarkup(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={["neon", "pen"]}
        recentBrushIds={["marker", "neon", "gpen"]}
        onSelect={onSelect}
        onOpenLibrary={onOpenLibrary}
      />
    );
    expect(html).toContain('data-studio-brush-tray="true"');
    expect(html).toContain('data-studio-brush-surface-role="quick-subtools"');
    expect(html).toContain('data-studio-active-brush-id="pen"');
    expect(html).toContain('role="listbox"');
    // Names live in aria-label / title only — no short-label text chips
    expect(html).toContain('aria-label="');
    expect(html).toContain("펜");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('data-studio-quick-source="favorite"');
    expect(html).toContain('data-studio-quick-source="recent"');
    expect(html).toContain('data-studio-quick-source="starter"');
    expect(html).toContain('data-studio-open-brush-library="true"');
    expect(html).toContain('aria-label="브러시 전체 라이브러리와 관리 열기"');
    expect(html).toContain("라이브러리");
    expect(html).toContain('data-studio-brush-kind="펜·잉크"');
    expect(html).not.toContain("브러시 키트 펼치기");
    expect(html).not.toContain("브러시 키트 접기");
    // Commercial stroke-preview glyphs (not text-only chips)
    expect(html).toContain('data-studio-brush-preview=');
    expect(html).toContain('data-studio-brush-chip="pen"');
    expect(html).toContain('data-studio-brush-media=');
    // The quick shelf never duplicates the full catalog's category tabs.
    expect(html).not.toContain('role="tablist"');
    expect(traySource).toContain("onOpenLibrary(event.currentTarget)");
  });

  it("loads persisted pro favorites through the deferred catalogue without injection", async () => {
    const onSelect = vi.fn();
    render(
      <StudioBrushTray
        activeBrushId="leaf-cluster"
        favoriteBrushIds={["leaf-cluster"]}
        recentBrushIds={["hair-curl-ribbon", "ink-particle"]}
        onSelect={onSelect}
        onOpenLibrary={vi.fn()}
      />
    );

    const tray = screen.getByRole("listbox").closest("[data-studio-brush-tray]");
    expect(tray?.getAttribute("aria-busy")).toBe("true");
    expect(tray?.getAttribute("data-studio-pro-catalog-state")).toBe("loading");
    const heart = await screen.findByRole("option", {
      name: /즐겨찾기 브러시 잎송이 · 질감/,
    });
    const hair = await screen.findByRole("option", {
      name: /최근 사용 브러시 곱슬 모발 리본 · 질감/,
    });
    expect(heart.getAttribute("aria-selected")).toBe("true");
    expect(heart.getAttribute("data-studio-brush-chip")).toBe("leaf-cluster");
    expect(hair.getAttribute("data-studio-brush-chip")).toBe("hair-curl-ribbon");
    expect(tray?.getAttribute("aria-busy")).toBeNull();
    expect(tray?.getAttribute("data-studio-pro-catalog-state")).toBe("loaded");

    fireEvent.click(hair);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({
      id: "hair-curl-ribbon",
      name: "곱슬 모발 리본",
      quickSource: "recent",
    });
  });

  it("restores a persisted V6 favorite through the artist-facing deferred catalogue", async () => {
    const v6 = STUDIO_V6_BRUSH_CATALOG_ITEMS[0]!;
    const onSelect = vi.fn();
    render(
      <StudioBrushTray
        activeBrushId={v6.id}
        favoriteBrushIds={[v6.id]}
        onSelect={onSelect}
        onOpenLibrary={vi.fn()}
      />
    );

    const option = await screen.findByRole("option", {
      name: new RegExp(`즐겨찾기 브러시 ${v6.name}`),
    });
    expect(option.getAttribute("data-studio-brush-chip")).toBe(v6.id);
    expect(option.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: v6.id }));
  });

  it("keeps quarantined favorites off both the core and deferred listing lanes", async () => {
    expect(STUDIO_BRUSH_QUARANTINED_PRESET_IDS.length).toBeGreaterThan(0);
    const quarantinedId = STUDIO_BRUSH_QUARANTINED_PRESET_IDS[0]!;

    // Core-only path (no pack ids, no deferred load): the quarantined favorite is skipped,
    // never a hole — listed neighbours keep their slots.
    const html = renderToStaticMarkup(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={[quarantinedId, "pen"]}
        recentBrushIds={[quarantinedId, "marker"]}
        onSelect={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );
    expect(html).not.toContain(`data-studio-brush-chip="${quarantinedId}"`);
    expect(html).toContain('data-studio-brush-chip="pen"');
    expect(html).toContain('data-studio-brush-chip="marker"');

    // Deferred pro path: the tray injects the LISTED (quarantine-filtered) catalogue, so the
    // quarantined id stays off the shelf after the full catalogue arrives too.
    render(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={[quarantinedId, "leaf-cluster"]}
        onSelect={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );
    const heart = await screen.findByRole("option", {
      name: /즐겨찾기 브러시 잎송이/,
    });
    expect(heart.getAttribute("data-studio-brush-chip")).toBe("leaf-cluster");
    expect(
      document.querySelector(`[data-studio-brush-chip="${quarantinedId}"]`)
    ).toBeNull();
    expect(traySource).toContain("loadStudioLibraryBrushCatalogItems");
    expect(traySource).not.toContain("loadStudioFullBrushCatalogItems");
  });

  it("uses the selected preset's real outer opacity in the quick preview", () => {
    const html = renderToStaticMarkup(
      <StudioBrushTray
        activeBrushId="highlighter"
        favoriteBrushIds={["highlighter"]}
        onSelect={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );

    expect(html).toContain('data-studio-brush-chip="highlighter"');
    expect(html).toContain('opacity="0.45"');
  });

  it("uses one roving tab stop and arrow keys across the quick shelf", () => {
    render(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={["pen", "neon"]}
        recentBrushIds={["marker"]}
        onSelect={vi.fn()}
        onOpenLibrary={vi.fn()}
      />
    );

    const options = screen.getAllByRole("option");
    expect(options.filter((option) => option.tabIndex === 0)).toHaveLength(1);
    expect(options[0]?.tabIndex).toBe(0);
    const scrollIntoView = vi.fn();
    Object.defineProperty(options[1]!, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    options[0]?.focus();
    fireEvent.keyDown(options[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(options[1]);
    expect(options[1]?.tabIndex).toBe(0);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    fireEvent.keyDown(options[1]!, { key: "End" });
    expect(document.activeElement).toBe(options.at(-1));
  });

  it("blocks provider-unavailable V6 presets without mutating active brush and restores focus on retry/dismiss", async () => {
    const blockedV6 = STUDIO_V6_BRUSH_CATALOG_ITEMS.find(
      (item) => item.id === "v6:mineral-bloom",
    )!;
    expect(blockedV6).toBeDefined();
    const onSelect = vi.fn();

    render(
      <StudioBrushTray
        activeBrushId="pen"
        favoriteBrushIds={["pen", blockedV6.id]}
        onSelect={onSelect}
        onOpenLibrary={vi.fn()}
      />
    );

    const blockedOption = await screen.findByRole("option", {
      name: new RegExp(`즐겨찾기 브러시 ${blockedV6.name}`),
    });
    const penOption = screen.getByRole("option", { name: /즐겨찾기 브러시 펜/ });

    fireEvent.click(blockedOption);

    expect(onSelect).not.toHaveBeenCalled();
    expect(penOption.getAttribute("aria-selected")).toBe("true");
    expect(blockedOption.getAttribute("aria-selected")).toBe("false");
    expect(blockedOption.getAttribute("data-studio-brush-apply-state")).toBe(
      "provider-unavailable",
    );

    const alert = screen.getByTestId("studio-brush-tray-error-alert");
    expect(alert.getAttribute("data-error-kind")).toBe("provider-unavailable");
    expect(alert.getAttribute("data-blocked-nodes")).toContain("deposit-wet");
    expect(alert.textContent).toContain("deposit-wet");

    const retryButton = screen.getByTestId("studio-brush-tray-retry-button");
    retryButton.focus();
    fireEvent.click(retryButton);
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(blockedOption);

    const dismissButton = screen.getByTestId("studio-brush-tray-dismiss-error");
    dismissButton.focus();
    fireEvent.click(dismissButton);
    expect(screen.queryByTestId("studio-brush-tray-error-alert")).toBeNull();
    expect(document.activeElement).toBe(blockedOption);
  });

  it("preserves active preset on transient onSelect error and syncs active chip after retry while restoring focus", () => {
    let failNext = true;

    function ControlledTrayHarness() {
      const [activeId, setActiveId] = useState("pen");
      return (
        <StudioBrushTray
          activeBrushId={activeId}
          favoriteBrushIds={["pen", "marker"]}
          onSelect={(item: StudioBrushTrayItem) => {
            if (item.id === "marker" && failNext) {
              throw new Error("세션 브러시 전환 지연");
            }
            setActiveId(item.id);
          }}
          onOpenLibrary={vi.fn()}
        />
      );
    }

    render(<ControlledTrayHarness />);
    const penChip = screen.getByRole("option", { name: /즐겨찾기 브러시 펜/ });
    const markerChip = screen.getByRole("option", { name: /즐겨찾기 브러시 마카/ });

    // 1차 시도 실패: 기존 pen 활성 상태가 유지된다.
    fireEvent.click(markerChip);
    expect(penChip.getAttribute("aria-selected")).toBe("true");
    expect(markerChip.getAttribute("aria-selected")).toBe("false");
    const alert = screen.getByTestId("studio-brush-tray-error-alert");
    expect(alert.getAttribute("data-error-kind")).toBe("apply-failed");
    expect(alert.textContent).toContain("세션 브러시 전환 지연");

    // 2차 다시 시도 성공: 선택된 marker 칩이 현재 적용 프리셋과 일치하고 포커스가 복원된다.
    failNext = false;
    const retryBtn = screen.getByTestId("studio-brush-tray-retry-button");
    retryBtn.focus();
    fireEvent.click(retryBtn);

    expect(screen.queryByTestId("studio-brush-tray-error-alert")).toBeNull();
    expect(markerChip.getAttribute("aria-selected")).toBe("true");
    expect(penChip.getAttribute("aria-selected")).toBe("false");
    expect(document.activeElement).toBe(markerChip);
  });
});
