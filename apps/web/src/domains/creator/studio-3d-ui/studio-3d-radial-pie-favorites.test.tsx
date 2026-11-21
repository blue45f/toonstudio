// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Studio3dRadialPieMenu } from "./Studio3dRadialPieMenu";
import {
  DEFAULT_QUICK_FAVORITE_IDS,
  buildQuickFavoritesPieMenu,
  deserializeQuickFavorites,
  resolvePieMenuShortcut,
  resolveRadialPieDirection,
  serializeQuickFavorites,
  toggleQuickFavoriteItem,
} from "./studio-3d-radial-pie-favorites";

afterEach(() => {
  cleanup();
});

describe("studio-3d-radial-pie-favorites & Studio3dRadialPieMenu", () => {
  it("resolves Blender Tab / Z / Shift+S / Q shortcuts and ignores editable inputs", () => {
    expect(resolvePieMenuShortcut({ code: "Tab", key: "Tab" })).toBe("mode");
    expect(resolvePieMenuShortcut({ code: "KeyZ", key: "z" })).toBe("shading");
    expect(resolvePieMenuShortcut({ code: "KeyS", key: "S", shiftKey: true })).toBe("snap");
    expect(resolvePieMenuShortcut({ code: "KeyQ", key: "q" })).toBe("favorites");

    expect(resolvePieMenuShortcut({ code: "KeyS", key: "s", shiftKey: false })).toBeNull();
    expect(resolvePieMenuShortcut({ code: "KeyZ", key: "z", ctrlKey: true })).toBeNull();
    expect(resolvePieMenuShortcut({ code: "Tab", target: { tagName: "TEXTAREA" } })).toBeNull();
  });

  it("maps 8 compass gesture angles accurately and cancels inside center deadzone", () => {
    expect(resolveRadialPieDirection(200, 200, 205, 205, 18)).toBeNull();
    expect(resolveRadialPieDirection(200, 200, 200, 140, 18)).toBe("N");
    expect(resolveRadialPieDirection(200, 200, 250, 150, 18)).toBe("NE");
    expect(resolveRadialPieDirection(200, 200, 270, 200, 18)).toBe("E");
    expect(resolveRadialPieDirection(200, 200, 250, 250, 18)).toBe("SE");
    expect(resolveRadialPieDirection(200, 200, 200, 270, 18)).toBe("S");
    expect(resolveRadialPieDirection(200, 200, 150, 250, 18)).toBe("SW");
    expect(resolveRadialPieDirection(200, 200, 130, 200, 18)).toBe("W");
    expect(resolveRadialPieDirection(200, 200, 150, 150, 18)).toBe("NW");
  });

  it("toggles, serializes, and deserializes Quick Favorites safely", () => {
    const added = toggleQuickFavoriteItem(DEFAULT_QUICK_FAVORITE_IDS, "shading:wireframe");
    expect(added).toContain("shading:wireframe");

    const removed = toggleQuickFavoriteItem(added, "shading:wireframe");
    expect(removed).not.toContain("shading:wireframe");

    const serialized = serializeQuickFavorites(added);
    expect(deserializeQuickFavorites(serialized)).toEqual(added);
    expect(deserializeQuickFavorites("invalid-json")).toEqual(DEFAULT_QUICK_FAVORITE_IDS);

    const favPie = buildQuickFavoritesPieMenu(added);
    expect(favPie.items).toHaveLength(added.length);
  });

  it("renders Studio3dRadialPieMenu with 8 mode slices, keyboard selection, and favorites star toggle", () => {
    const onSelectAction = vi.fn();
    const onToggleFavorite = vi.fn();
    const onClose = vi.fn();

    render(
      <Studio3dRadialPieMenu
        open
        menuId="mode"
        onSelectAction={onSelectAction}
        onToggleFavorite={onToggleFavorite}
        onClose={onClose}
      />,
    );

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(8);

    fireEvent.click(screen.getByRole("menuitem", { name: /표면 직드로잉/u }));
    expect(onSelectAction).toHaveBeenCalledWith(expect.objectContaining({ id: "mode:surface-stroke" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /포즈 편집 퀵 즐겨찾기 추가/u }));
    expect(onToggleFavorite).toHaveBeenCalledWith("mode:pose");

    fireEvent.keyDown(screen.getByTestId("studio-3d-radial-pie-menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
