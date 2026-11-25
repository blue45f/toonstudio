// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CRAFT_STATION_CATALOG, StudioAtelierCraftLauncherPanel, createInitialPinState,
  recommendNextCraftStations, togglePinnedCraftStation,
  type CraftLauncherPinState, type CraftStationSpec,
} from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("런처 입력·알림·소개 범위 경계", () => {
  it("잘못된 핀 한도는 초기 핀을 버리거나 한도를 우회하는 상태를 만들지 않는다", () => {
    const ids = ["drawing-physical-ink", "color-script-p3"] as const;
    const before = [...ids];
    for (const max of [NaN, Infinity, -1, 0, 1.5, 9]) expect(() => createInitialPinState(ids, max)).toThrow();
    expect(ids).toEqual(before);
    const overCapacity = [...ids, "bg3d-solar-lighting"] as const;
    expect(() => createInitialPinState(overCapacity, 2)).toThrow(/한도/);
    expect(overCapacity).toEqual([...ids, "bg3d-solar-lighting"]);
    const state = createInitialPinState(ids, 2);
    expect(() => togglePinnedCraftStation({ ...state, maxPinned: NaN }, "bg3d-solar-lighting")).toThrow();
    expect(togglePinnedCraftStation(state, "bg3d-solar-lighting").pinnedIds).toEqual(ids);
    expect(state.pinnedIds).toEqual(ids);
  });

  it("NaN·무한·소수 추천 한도를 정상적인 빈 추천으로 반환하지 않는다", () => {
    for (const limit of [NaN, Infinity, -1, 0, 1.5, 9]) expect(() => recommendNextCraftStations("conti", { limit })).toThrow();
  });

  it("핀은 메모리 상태임을 기록하고 근거 없는 시작 시간 수치를 제공하지 않는다", () => {
    expect(createInitialPinState()).toMatchObject({ storageKind: "in-memory-preferences", persistent: false });
    for (const station of CRAFT_STATION_CATALOG) {
      expect(station).toHaveProperty("scope", "catalog-reference");
      expect(station).not.toHaveProperty("estimatedStartSeconds");
      expect(station).not.toHaveProperty("estimatedStartTimeKo");
      expect(station).not.toHaveProperty("estimatedStartTimeEn");
    }
    render(<StudioAtelierCraftLauncherPanel locale="ko" />);
    expect(screen.getByTestId("craft-launcher-scope").textContent).toContain("정적 소개");
    expect(screen.getByTestId("craft-launcher-scope").textContent).toContain("원고 저장");
    expect(screen.getByTestId("craft-launcher-summary-counts").textContent).toContain("목록 기준");
  });

  it.each([
    { channel: "select", trigger: "craft-station-select-bg3d-solar-lighting" },
    { channel: "pin", trigger: "craft-station-pin-color-script-p3" },
    { channel: "launch", trigger: "craft-preview-launch-link" },
  ] as const)("$channel 알림은 pending 중복을 막고 최신 수신자로 동일 결과를 재시도한다", async ({ channel, trigger }) => {
    let reject: (error: Error) => void = () => { throw new Error("대기 Promise 누락"); };
    const waiting = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const original = vi.fn<(result: CraftStationSpec | CraftLauncherPinState) => void | Promise<void>>(() => waiting);
    const replacement = vi.fn<(result: CraftStationSpec | CraftLauncherPinState) => void>(() => { throw new Error("새 수신자 거부"); });
    const initialProps = channel === "select" ? { onSelectStation: original } : channel === "pin" ? { onPinnedChange: original } : { onLaunchStation: original };
    const latestProps = channel === "select" ? { onSelectStation: replacement } : channel === "pin" ? { onPinnedChange: replacement } : { onLaunchStation: replacement };
    const view = render(<StudioAtelierCraftLauncherPanel locale="ko" {...initialProps} />);
    const query = "  한👨‍👩‍👧‍👦  ";
    fireEvent.click(screen.getByTestId(trigger));
    fireEvent.click(screen.getByTestId(trigger));
    expect(original).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("craft-launcher-notification").textContent).toContain("처리 중");
    fireEvent.change(screen.getByTestId("craft-launcher-search-input"), { target: { value: query } });
    const payload = original.mock.calls[0]?.[0];
    await act(async () => { reject(new Error("첫 수신자 거부")); });
    expect(screen.getByRole("alert").textContent).toContain("첫 수신자 거부");
    view.rerender(<StudioAtelierCraftLauncherPanel locale="ko" {...latestProps} />);
    fireEvent.click(screen.getByRole("button", { name: "알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.calls[0]?.[0]).toBe(payload);
    expect(screen.getByTestId("craft-launcher-search-input")).toHaveProperty("value", query);
    view.rerender(<StudioAtelierCraftLauncherPanel locale="ko" />);
    fireEvent.click(screen.getByRole("button", { name: "알림 다시 시도" }));
    expect(original).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("craft-launcher-notification")).toBeNull();
    expect(screen.getByTestId("craft-launcher-search-input")).toHaveProperty("value", query);
    if (channel === "pin") {
      fireEvent.change(screen.getByTestId("craft-launcher-search-input"), { target: { value: "" } });
      expect(screen.getByTestId(trigger).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("한도 도달로 핀이 바뀌지 않으면 저장 수신자를 다시 부르지 않는다", () => {
    const receive = vi.fn();
    render(<StudioAtelierCraftLauncherPanel locale="ko" initialPinnedIds={["drawing-physical-ink"]} maxPinned={1} onPinnedChange={receive} />);
    fireEvent.click(screen.getByTestId("craft-station-pin-color-script-p3"));
    expect(receive).not.toHaveBeenCalled();
    expect(screen.getByTestId("craft-station-pin-color-script-p3").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("craft-launcher-status").textContent).toContain("최대 1개");
  });
});
