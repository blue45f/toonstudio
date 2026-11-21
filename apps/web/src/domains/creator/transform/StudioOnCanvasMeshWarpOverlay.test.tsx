// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioOnCanvasMeshWarpOverlay } from "./StudioOnCanvasMeshWarpOverlay";
import { createIdentityCornerPinQuad } from "./studio-corner-pin-transform";
import { createRasterMeshLattice } from "./studio-raster-mesh-transform";

afterEach(() => {
  cleanup();
});

describe("StudioOnCanvasMeshWarpOverlay", () => {
  it("메쉬 모드에서 격자 핸들을 키보드로 이동하고 프리셋·적용 버튼을 호출한다", () => {
    const lattice = createRasterMeshLattice(100, 100, 3, 3);
    const onLatticeChange = vi.fn();
    const onApply = vi.fn();

    render(
      <StudioOnCanvasMeshWarpOverlay
        mode="mesh"
        frame={{ leftPx: 20, topPx: 30, widthPx: 200, heightPx: 200, zoomScale: 2 }}
        targetLayerCount={3}
        lattice={lattice}
        onLatticeChange={onLatticeChange}
        onApply={onApply}
      />,
    );

    expect(screen.getByTestId("warp-target-layer-badge").textContent).toContain("레이어 3개 동시 변형");

    // 3×3 격자 = 9개 제어점 핸들
    const centerHandle = screen.getByRole("button", { name: /메쉬 제어점 2행 2열/u });
    fireEvent.keyDown(centerHandle, { key: "ArrowRight", shiftKey: true });
    expect(onLatticeChange).toHaveBeenCalledTimes(1);
    const updatedLattice = onLatticeChange.mock.calls[0]![0];
    expect(updatedLattice.nodes[4].x).toBeCloseTo(lattice.nodes[4]!.x + 10, 1);

    fireEvent.click(screen.getByRole("button", { name: "아치" }));
    expect(onLatticeChange).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "변형 적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("코너핀 모드에서 등변사다리꼴 제약과 자가교차 경고를 표시한다", () => {
    const quad = createIdentityCornerPinQuad(101, 101);
    const onCornerQuadChange = vi.fn();

    const { rerender } = render(
      <StudioOnCanvasMeshWarpOverlay
        mode="corner-pin"
        frame={{ leftPx: 0, topPx: 0, widthPx: 101, heightPx: 101, zoomScale: 1 }}
        cornerQuad={quad}
        cornerDistortMode="isopod-trapezoid"
        trapezoidAxis="horizontal"
        onCornerQuadChange={onCornerQuadChange}
      />,
    );

    const tlHandle = screen.getByRole("button", { name: /좌상단 모서리 핸들/u });
    fireEvent.keyDown(tlHandle, { key: "ArrowRight", shiftKey: true });
    expect(onCornerQuadChange).toHaveBeenCalledTimes(1);
    const nextQuad = onCornerQuadChange.mock.calls[0]![0];
    // 등변사다리꼴: 좌상단이 +10 이동하면 우상단은 대칭으로 -10 이동
    expect(nextQuad.topLeft.x).toBe(10);
    expect(nextQuad.topRight.x).toBe(90);

    // 자가교차(나비넥타이) 사각형이면 적용 버튼 비활성 + 경고 표시
    rerender(
      <StudioOnCanvasMeshWarpOverlay
        mode="corner-pin"
        frame={{ leftPx: 0, topPx: 0, widthPx: 101, heightPx: 101, zoomScale: 1 }}
        cornerQuad={{
          topLeft: { x: 0, y: 100 },
          topRight: { x: 100, y: 0 },
          bottomRight: { x: 100, y: 100 },
          bottomLeft: { x: 0, y: 0 },
        }}
        onCornerQuadChange={onCornerQuadChange}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("교차 또는 오목 사각형 경고");
    expect((screen.getByRole("button", { name: "변형 적용" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
