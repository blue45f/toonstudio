// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCameraPanRuntime,
  StudioCameraPanStore,
  type StudioCameraPanFrame,
} from "./studio-virtual-space-camera-pan";
import { StudioUserZoomStore, type StudioUserZoomStorage } from "./studio-virtual-space-user-zoom";
import { SpaceCameraChip } from "./hud/SpaceCameraChip";
import { SpaceZoomControls } from "./hud/SpaceZoomControls";

afterEach(cleanup);

function makeFrame(overrides: Partial<StudioCameraPanFrame> = {}): StudioCameraPanFrame {
  return {
    deltaSeconds: 1 / 60,
    available: true,
    directed: false,
    snap: false,
    reducedMotion: false,
    moving: false,
    cssToWorld: 1,
    base: { x: 1500, y: 900 },
    center: { x: 1500, y: 900 },
    view: { width: 800, height: 500 },
    world: { width: 3072, height: 1920 },
    ...overrides,
  };
}

const memoryZoomStorage = (): StudioUserZoomStorage => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

describe("가상 스튜디오 카메라 복구 (선택 물체 초점 · 홈 뷰 · 이전 시점 · 시야 이탈 즉시 복구)", () => {
  it("시야 밖으로 크게 끌면 outOfSight를 감지하고 즉시 복구 버튼으로 1프레임 내 원점 스냅한다", () => {
    const store = new StudioCameraPanStore();
    const runtime = new StudioCameraPanRuntime(store);
    render(<SpaceCameraChip store={store} />);

    act(() => {
      store.drag(-520, -320);
      const pannedSample = runtime.sample(makeFrame());
      expect(pannedSample.x).toBeGreaterThan(360);
    });

    expect(store.getRecoverySnapshot().outOfSight).toBe(true);
    const instantBtn = screen.getByRole("button", { name: "시야 이탈 즉시 복구" });
    fireEvent.click(instantBtn);

    let recovered = { x: 999, y: 999, direct: false };
    act(() => {
      recovered = runtime.sample(makeFrame());
    });
    expect(recovered).toEqual({ x: 0, y: 0, direct: true });
    expect(store.getRecoverySnapshot().outOfSight).toBe(false);
    expect(store.getRecoverySnapshot().canUndoView).toBe(true);
  });

  it("선택 물체 초점 이동 → 홈 뷰 초기화 → 이전 시점 복원이 배율과 오프셋을 함께 되돌린다", () => {
    const store = new StudioCameraPanStore();
    const zoom = new StudioUserZoomStore(memoryZoomStorage());
    const onThreeReset = vi.fn();
    store.attachZoomStore(zoom);
    store.attachHomeResetCallback(onThreeReset);
    const runtime = new StudioCameraPanRuntime(store);

    render(
      <>
        <SpaceCameraChip store={store} />
        <SpaceZoomControls store={zoom} cameraPan={store} />
      </>,
    );

    act(() => {
      zoom.set(1.3);
      store.setFocusTarget({
        id: "desk-1",
        labelKo: "드로잉 데스크",
        labelEn: "Drawing desk",
        x: 1920,
        y: 1120,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /선택 물체에 초점 · 드로잉 데스크/u }));
    let focused = { x: 0, y: 0, direct: false };
    act(() => {
      focused = runtime.sample(makeFrame());
    });
    expect(focused.x).toBe(420);
    expect(focused.y).toBe(220);

    // 홈 뷰 실행 시 오프셋 0, 배율 100%, 3D 회전각 콜백이 즉시 호출된다.
    fireEvent.click(screen.getByRole("button", { name: "홈 뷰" }));
    let home = { x: 99, y: 99, direct: false };
    act(() => {
      home = runtime.sample(makeFrame());
    });
    expect(home).toEqual({ x: 0, y: 0, direct: true });
    expect(zoom.get()).toBe(1);
    expect(onThreeReset).toHaveBeenCalledOnce();

    // 이전 시점을 누르면 방금 보던 드로잉 데스크 초점 위치와 130% 배율로 복원된다.
    fireEvent.click(screen.getByRole("button", { name: "이전 시점" }));
    let restored = { x: 0, y: 0, direct: false };
    act(() => {
      restored = runtime.sample(makeFrame());
    });
    expect(restored.x).toBe(420);
    expect(restored.y).toBe(220);
    expect(zoom.get()).toBe(1.3);
  });
});
