// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_USER_ZOOM_MAX,
  STUDIO_USER_ZOOM_MIN,
  StudioUserZoomStore,
  type StudioUserZoomStorage,
} from "../studio-virtual-space-user-zoom";
import { SpaceZoomControls } from "./SpaceZoomControls";

afterEach(cleanup);

const memory = (): StudioUserZoomStorage => {
  const data = new Map<string, string>();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

describe("화면 크기(줌) 버튼", () => {
  it("확대·현재 배율·축소 버튼을 한 묶음으로 보이고, 눌러서 배율을 바꾼다", () => {
    const store = new StudioUserZoomStore(memory());
    render(<SpaceZoomControls store={store} />);
    expect(screen.getByRole("group", { name: "화면 크기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "화면 확대" }));
    expect(store.get()).toBe(1.15);
    expect(screen.getByRole("button", { name: "화면 크기 115% · 눌러서 원래 크기로" }).textContent).toBe("115%");
    fireEvent.click(screen.getByRole("button", { name: "화면 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "화면 축소" }));
    expect(store.get()).toBe(0.9);
    fireEvent.click(screen.getByRole("button", { name: /화면 크기 90%/u }));
    expect(store.get()).toBe(1);
  });

  it("다른 곳(휠·단축키)이 바꾼 배율도 그대로 따라 보인다", () => {
    const store = new StudioUserZoomStore(memory());
    render(<SpaceZoomControls store={store} />);
    act(() => { store.set(1.5); });
    expect(screen.getByRole("button", { name: /화면 크기 150%/u }).textContent).toBe("150%");
  });

  it("끝 배율에서는 해당 버튼이 aria-disabled이고 눌러도 더 바뀌지 않는다", () => {
    const store = new StudioUserZoomStore(memory());
    render(<SpaceZoomControls store={store} />);
    act(() => { store.set(STUDIO_USER_ZOOM_MAX); });
    const zoomIn = screen.getByRole("button", { name: "화면 확대" });
    expect(zoomIn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(zoomIn);
    expect(store.get()).toBe(STUDIO_USER_ZOOM_MAX);
    act(() => { store.set(STUDIO_USER_ZOOM_MIN); });
    expect(screen.getByRole("button", { name: "화면 축소" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "화면 확대" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("마우스·터치로 누르면 초점을 월드로 돌려 바로 걷게 하고, 키보드로 활성화하면 초점을 그대로 둔다", () => {
    const store = new StudioUserZoomStore(memory());
    const onPointerUse = vi.fn();
    render(<SpaceZoomControls store={store} onPointerUse={onPointerUse} />);
    fireEvent.click(screen.getByRole("button", { name: "화면 확대" }), { detail: 1 });
    expect(onPointerUse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "화면 확대" }), { detail: 0 });
    expect(onPointerUse, "키보드 활성화(detail 0)는 Tab 순서를 끊지 않는다").toHaveBeenCalledOnce();
    expect(store.get()).toBe(1.3);
  });

  it("줌을 받을 수 없는 장소에서는 아무것도 그리지 않고, 다시 받을 수 있게 되면 돌아온다", () => {
    const store = new StudioUserZoomStore(memory());
    store.setAvailable(false);
    const { container } = render(<SpaceZoomControls store={store} />);
    expect(container.firstChild).toBeNull();
    act(() => { store.setAvailable(true); });
    expect(screen.getByRole("group", { name: "화면 크기" })).toBeTruthy();
  });
});
