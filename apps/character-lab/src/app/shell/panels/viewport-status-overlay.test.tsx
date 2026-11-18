// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { createPaintSession } from "../../../paint/paint-session";
import { mockDiagnostics } from "../../../testing/mock-engine";

import { ViewportStatusOverlay } from "./viewport-status-overlay";

afterEach(cleanup);

it("드로잉 안내가 다른 패널에서 바꾼 도구·레이어·브러시 설정을 즉시 반영한다", () => {
  const paint = createPaintSession({ layerSize: 32, brush: { radiusPx: 4 } });
  render(
    <ViewportStatusOverlay
      engineStatus={{ phase: "ready", backend: "webgl2", diagnostics: mockDiagnostics("webgl2") }}
      hasEngine
      onSelectBackend={vi.fn()}
      drawingMode
      paint={paint}
      notice={null}
      noHandleReason={null}
    />,
  );
  expect(screen.getByText(/드로잉 모드\(브러시\) · 레이어 피부\(L0\) · 브러시 4px/u)).toBeTruthy();

  act(() => {
    paint.setToolMode("eraser");
    paint.setSymmetry(true);
    paint.setActivePart("hair");
    paint.setActiveSublayer(2);
    paint.setBrush({ radiusPx: 12 });
  });

  expect(screen.getByText(/드로잉 모드\(지우개 · 대칭 ON\) · 레이어 헤어\(L2\) · 브러시 12px/u)).toBeTruthy();
  expect(screen.queryByText(/레이어 피부\(L0\)/u)).toBeNull();
});
