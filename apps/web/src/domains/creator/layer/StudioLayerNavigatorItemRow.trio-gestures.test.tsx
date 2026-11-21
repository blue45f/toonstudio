// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioLayerNavigatorItemRow } from "./StudioLayerNavigatorItemRow";
import type { StudioLayerNavigatorItem } from "./studio-layer-navigator";
import type { LayerNavigatorRowHandlers } from "./StudioLayerNavigatorItemRow";

const BASE_ITEM: StudioLayerNavigatorItem = {
  id: "ink-layer",
  type: "draw",
  label: "펜선 레이어",
  zIndex: 2,
  opacity: 0.8,
  clipBelow: false,
  alphaLocked: false,
  fillReference: false,
};

function makeHandlers(overrides: Partial<LayerNavigatorRowHandlers> = {}): LayerNavigatorRowHandlers {
  return {
    onRowFocus: vi.fn(),
    onRowKeyDown: vi.fn(),
    onRowClick: vi.fn(),
    onRowDoubleClick: vi.fn(),
    onToggleItemHidden: vi.fn(),
    onToggleItemLocked: vi.fn(),
    onSetItemOpacity: vi.fn(),
    onPreviewItemOpacity: vi.fn(),
    onOpenItemActionMenu: vi.fn(),
    onToggleItemClipBelow: vi.fn(),
    onToggleItemAlphaLock: vi.fn(),
    onToggleItemReference: vi.fn(),
    onToggleItemMultiSelect: vi.fn(),
    onPinchMergeItem: vi.fn(),
    registerRowRef: vi.fn(),
    ...overrides,
  };
}

function renderItemRow(
  handlers: LayerNavigatorRowHandlers,
  item: StudioLayerNavigatorItem = BASE_ITEM,
  extra: { canClipBelow?: boolean; effectivelyLocked?: boolean } = {},
) {
  return render(
    <ul role="tree">
      <StudioLayerNavigatorItemRow
        item={item}
        rowKey={`item:${item.id}`}
        level={1}
        kind="draw"
        groupName={null}
        effectivelyHidden={false}
        locallyHidden={false}
        effectivelyLocked={extra.effectivelyLocked ?? false}
        statusLabel=""
        selected={false}
        current
        selectionCount={1}
        tabStop
        renameInput={null}
        mobileMultiSelect={false}
        readOnly={false}
        hiddenByGroup={false}
        lockedByGroup={false}
        actionOpen={false}
        actionPopoverId="popover"
        stableHandlers={handlers}
        canClipBelow={extra.canClipBelow}
      />
    </ul>,
  );
}

describe("StudioLayerNavigatorItemRow T9 Layer Trio & Touch Gestures", () => {
  afterEach(cleanup);

  it("toggles Clipping Mask, Alpha Lock, and Reference via trio controls and blocks clipping on bottom layer", () => {
    const handlers = makeHandlers();
    const { rerender } = renderItemRow(handlers);

    fireEvent.click(screen.getByRole("button", { name: /펜선 레이어.*클리핑 마스크/ }));
    expect(handlers.onToggleItemClipBelow).toHaveBeenCalledWith("ink-layer", true);

    fireEvent.click(screen.getByRole("button", { name: /펜선 레이어.*알파 잠금/ }));
    expect(handlers.onToggleItemAlphaLock).toHaveBeenCalledWith("ink-layer", true);

    fireEvent.click(screen.getByRole("button", { name: /펜선 레이어.*참조 레이어/ }));
    expect(handlers.onToggleItemReference).toHaveBeenCalledWith("ink-layer", true);

    // Bottom layer (zIndex=0, canClipBelow=false) disables clipping mask
    rerender(
      <ul role="tree">
        <StudioLayerNavigatorItemRow
          item={{ ...BASE_ITEM, zIndex: 0 }}
          rowKey="item:ink-layer"
          level={1}
          kind="draw"
          groupName={null}
          effectivelyHidden={false}
          locallyHidden={false}
          effectivelyLocked={false}
          statusLabel=""
          selected={false}
          current
          selectionCount={1}
          tabStop
          renameInput={null}
          mobileMultiSelect={false}
          readOnly={false}
          hiddenByGroup={false}
          lockedByGroup={false}
          actionOpen={false}
          actionPopoverId="popover"
          stableHandlers={handlers}
          canClipBelow={false}
        />
      </ul>,
    );
    expect(
      (screen.getByRole("button", { name: /펜선 레이어.*클리핑 마스크/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("handles left-swipe lock, right-swipe multi-select, 2-finger opacity slide, and pinch merge gestures", () => {
    const handlers = makeHandlers();
    renderItemRow(handlers);
    const row = screen.getByRole("treeitem");

    // Left swipe -> lock toggle
    fireEvent.touchStart(row, { touches: [{ identifier: 1, clientX: 200, clientY: 40 }] });
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: 120, clientY: 42 }],
    });
    expect(handlers.onToggleItemLocked).toHaveBeenCalledWith("ink-layer", true);

    // Right swipe -> multi-select toggle
    fireEvent.touchStart(row, { touches: [{ identifier: 2, clientX: 100, clientY: 40 }] });
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ identifier: 2, clientX: 180, clientY: 44 }],
    });
    expect(handlers.onToggleItemMultiSelect).toHaveBeenCalledWith("ink-layer");

    // 2-finger horizontal slide -> live opacity preview + commit
    fireEvent.touchStart(row, {
      touches: [
        { identifier: 3, clientX: 100, clientY: 30 },
        { identifier: 4, clientX: 100, clientY: 70 },
      ],
    });
    fireEvent.touchMove(row, {
      touches: [
        { identifier: 3, clientX: 60, clientY: 30 },
        { identifier: 4, clientX: 60, clientY: 70 },
      ],
    });
    expect(handlers.onPreviewItemOpacity).toHaveBeenCalledWith("ink-layer", 0.6);
    fireEvent.touchEnd(row, {
      touches: [],
      changedTouches: [{ identifier: 3, clientX: 60, clientY: 30 }],
    });
    expect(handlers.onSetItemOpacity).toHaveBeenCalledWith("ink-layer", 0.6);

    // 2-finger pinch inward -> pinch merge
    fireEvent.touchStart(row, {
      touches: [
        { identifier: 5, clientX: 100, clientY: 20 },
        { identifier: 6, clientX: 100, clientY: 120 },
      ],
    });
    fireEvent.touchMove(row, {
      touches: [
        { identifier: 5, clientX: 100, clientY: 55 },
        { identifier: 6, clientX: 100, clientY: 85 },
      ],
    });
    expect(handlers.onPinchMergeItem).toHaveBeenCalledWith("ink-layer");
  });
});
