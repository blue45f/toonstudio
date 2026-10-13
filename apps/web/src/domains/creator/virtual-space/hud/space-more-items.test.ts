import { describe, expect, it, vi } from "vitest";

import { spaceMoreItems, type SpaceMoreItemActions } from "./space-more-items";

function actions() {
  return {
    openPanel: vi.fn<SpaceMoreItemActions["openPanel"]>(),
    openSeats: vi.fn<() => void>(), openSearch: vi.fn<() => void>(), capturePhoto: vi.fn<() => void>(),
    unstuck: vi.fn<() => void>(), openHelp: vi.fn<() => void>(), exit: vi.fn<() => void>(),
    togglePose: vi.fn<() => void>(),
  };
}

describe("spaceMoreItems", () => {
  it("프로젝트 데스크톱 메뉴는 작업 도구와 연결 진단을 두고 도크에 있는 대화·꾸미기·나가기는 뺀다", () => {
    const ids = spaceMoreItems({ personal: false, desktop: true }, actions()).map((item) => item.id);
    expect(ids).toEqual(["today", "work", "sessions", "board", "annotation", "team", "seats", "town", "megaphone", "poll", "pose", "places", "search", "photo", "settings", "rtc", "unstuck", "help"]);
  });

  it("개인 모바일 메뉴는 프로젝트 도구를 숨기고 좁은 도크에 없는 대화·꾸미기·나가기를 넣는다", () => {
    const items = spaceMoreItems({ personal: true, desktop: false }, actions());
    expect(items.map((item) => item.id)).toEqual(["seats", "town", "pose", "places", "search", "chat", "build", "photo", "settings", "unstuck", "help", "exit"]);
    expect(items.find((item) => item.id === "seats")?.labelKo).toBe("내 작업 자리로 걷기");
  });

  it("메가폰·투표 항목은 개인 공간에서는 숨기고 프로젝트에서는 각 패널을 연다", () => {
    const personalIds = spaceMoreItems({ personal: true, desktop: true }, actions()).map((item) => item.id);
    expect(personalIds).not.toContain("megaphone");
    expect(personalIds).not.toContain("poll");
    const handlers = actions();
    const items = spaceMoreItems({ personal: false, desktop: true }, handlers);
    items.find((item) => item.id === "megaphone")?.onSelect();
    items.find((item) => item.id === "poll")?.onSelect();
    expect(handlers.openPanel).toHaveBeenCalledWith("megaphone");
    expect(handlers.openPanel).toHaveBeenCalledWith("poll");
  });

  it("좁은 화면 메뉴에는 화면 확대·축소를 넣고, 원래 크기 항목은 배율이 달라졌을 때만 보인다", () => {
    const handlers = { ...actions(), zoom: vi.fn<NonNullable<SpaceMoreItemActions["zoom"]>>() };
    const normal = spaceMoreItems({ personal: true, desktop: false, zoomLevel: 1 }, handlers);
    expect(normal.map((item) => item.id)).toEqual(["seats", "town", "pose", "places", "search", "chat", "build", "zoom-in", "zoom-out", "photo", "settings", "unstuck", "help", "exit"]);
    expect(normal.find((item) => item.id === "zoom-in")?.descriptionKo).toBe("지금 100%");
    const zoomed = spaceMoreItems({ personal: true, desktop: false, zoomLevel: 1.3 }, handlers);
    expect(zoomed.find((item) => item.id === "zoom-in")?.descriptionEn).toBe("Now 130%");
    expect(zoomed.map((item) => item.id)).toContain("zoom-reset");
    zoomed.find((item) => item.id === "zoom-in")?.onSelect();
    zoomed.find((item) => item.id === "zoom-out")?.onSelect();
    zoomed.find((item) => item.id === "zoom-reset")?.onSelect();
    expect(handlers.zoom.mock.calls.map(([action]) => action)).toEqual(["in", "out", "reset"]);
  });

  it("데스크톱 메뉴와 줌을 받을 수 없는 장소(zoomLevel null)·동작이 없는 호출에는 줌 항목을 넣지 않는다", () => {
    const handlers = { ...actions(), zoom: vi.fn<NonNullable<SpaceMoreItemActions["zoom"]>>() };
    const none = (items: ReturnType<typeof spaceMoreItems>) => items.every((item) => !item.id.startsWith("zoom"));
    expect(none(spaceMoreItems({ personal: true, desktop: true, zoomLevel: 1 }, handlers))).toBe(true);
    expect(none(spaceMoreItems({ personal: true, desktop: false, zoomLevel: null }, handlers))).toBe(true);
    expect(none(spaceMoreItems({ personal: true, desktop: false }, handlers))).toBe(true);
    expect(none(spaceMoreItems({ personal: true, desktop: false, zoomLevel: 1 }, actions()))).toBe(true);
  });

  it("항목을 고르면 해당 패널이나 동작만 실행한다", () => {
    const handlers = actions();
    const items = spaceMoreItems({ personal: false, desktop: false }, handlers);
    items.find((item) => item.id === "work")?.onSelect();
    items.find((item) => item.id === "search")?.onSelect();
    items.find((item) => item.id === "exit")?.onSelect();
    expect(handlers.openPanel).toHaveBeenCalledExactlyOnceWith("work");
    expect(handlers.openSearch).toHaveBeenCalledOnce();
    expect(handlers.exit).toHaveBeenCalledOnce();
    expect(handlers.capturePhoto).not.toHaveBeenCalled();
  });
});
