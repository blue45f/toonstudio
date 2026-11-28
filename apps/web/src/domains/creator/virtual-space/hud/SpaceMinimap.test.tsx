// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import type { StudioVirtualSpaceWalkReport } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { SpaceMinimap } from "./SpaceMinimap";
import { spaceMinimapPeerTarget } from "./space-minimap-labels";

afterEach(cleanup);

const campus = studioVirtualCampusManifest(false);

describe("SpaceMinimap quick travel", () => {
  it("막힌 목적지를 다시 확인할 때 검색·현재 위치·조작을 유지한다", async () => {
    const manifest = studioVirtualToonHqManifest(false);
    const onMoveTo = vi.fn();
    const onWalkAccepted = vi.fn();
    const cancel = vi.fn();
    const onRequestWalk = vi.fn((_point: StudioVirtualSpacePoint, _report: StudioVirtualSpaceWalkReport) => cancel);
    const { unmount } = render(<SpaceMinimap manifest={manifest} self={{ x: 336, y: 1470 }} people={[]} currentRoomId="hq-lobby"
      variant="full" onMoveTo={onMoveTo} onRequestWalk={onRequestWalk} onWalkAccepted={onWalkAccepted} />);
    fireEvent.click(screen.getByRole("button", { name: "목적지 목록" }));
    const input = screen.getByRole("searchbox", { name: "방·좌석·도구 검색" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Review seat 2" } });
    fireEvent.click(screen.getByRole("button", { name: "PD 리뷰 좌석 2로 걸어가기" }));
    expect(screen.getByText("경로를 확인하고 있어요.")).toBeTruthy();
    expect(onWalkAccepted).not.toHaveBeenCalled();
    act(() => onRequestWalk.mock.calls[0]![1]("unreachable"));
    expect(screen.getByText("이 목적지에는 지금 갈 수 없어요.")).toBeTruthy();
    expect(input.value).toBe("Review seat 2");
    expect(screen.getByText("현재 위치", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "경로 다시 확인" }));
    expect(onRequestWalk.mock.calls[1]?.[0]).toEqual(onRequestWalk.mock.calls[0]?.[0]);
    act(() => onRequestWalk.mock.calls[0]![1]("walking"));
    expect(onWalkAccepted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다른 목적지 고르기" }));
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input.value).toBe("Review seat 2");
    expect(cancel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "PD 리뷰 좌석 2로 걸어가기" }));
    act(() => onRequestWalk.mock.calls[2]![1]("walking"));
    expect(onWalkAccepted).toHaveBeenCalledOnce();
    expect(onMoveTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "PD 리뷰 좌석 2로 걸어가기" }));
    unmount();
    expect(cancel).toHaveBeenCalledTimes(2);
    act(() => onRequestWalk.mock.calls[3]![1]("arrived"));
    expect(onWalkAccepted).toHaveBeenCalledOnce();
  });
  it("구역 걸어가기는 스폰으로 걷고, 번개 버튼은 바로 가기를 요청한다", () => {
    const onMoveTo = vi.fn(), onJumpTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} onJumpTo={onJumpTo} />);
    fireEvent.click(screen.getByRole("button", { name: /카페로 걸어가기/u }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith({ x: 2688, y: 600 });
    fireEvent.click(screen.getByRole("button", { name: /카페로 바로 가기/u }));
    expect(onJumpTo).toHaveBeenCalledExactlyOnceWith({ x: 2688, y: 600 });
    expect(onMoveTo).toHaveBeenCalledOnce();
  });

  it("큰 지도는 구역마다 걸어가기 버튼과 바로 가기 마커를 한 묶음으로 두고, 마커 콜백이 없으면 마커를 그리지 않는다", () => {
    const { container, rerender } = render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={vi.fn()} onJumpTo={vi.fn()} />);
    const groups = [...container.querySelectorAll(".space-minimap__zone-actions")];
    // 캠퍼스 구역 10곳(공용 길 campus-commons는 지도 구역이 아니다)마다 한 묶음이다.
    expect(groups).toHaveLength(10);
    expect(container.querySelectorAll(".space-minimap__zone-button")).toHaveLength(10);
    for (const group of groups) {
      // 같은 묶음 안에서 버튼 다음에 마커가 오므로 탭 순서가 구역마다 이어지고, 마커는 자기 구역 버튼의 모서리에만 붙는다.
      expect([...group.children].map((child) => child.className)).toEqual(["space-minimap__zone-button", "space-minimap__zone-jump"]);
    }
    rerender(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={vi.fn()} />);
    expect(container.querySelectorAll(".space-minimap__zone-actions")).toHaveLength(10);
    expect(container.querySelector(".space-minimap__zone-jump")).toBeNull();
  });

  it("목적지 목록에서 영문 좌석명을 찾아 그 좌석 앞으로 걷고, 방 바로 가기는 별도 동작으로 실행한다", () => {
    const manifest = studioVirtualToonHqManifest(false);
    const onMoveTo = vi.fn(), onJumpTo = vi.fn();
    render(<SpaceMinimap manifest={manifest} self={{ x: 336, y: 1470 }} people={[]} currentRoomId="hq-lobby"
      variant="full" onMoveTo={onMoveTo} onJumpTo={onJumpTo} />);
    fireEvent.click(screen.getByRole("button", { name: "목적지 목록" }));
    const input = screen.getByRole("searchbox", { name: "방·좌석·도구 검색" });
    fireEvent.change(input, { target: { value: " Ｒｅｖｉｅｗ seat 2 " } });
    expect(screen.getByRole("status").textContent).toBe("공간 1곳");
    expect(onMoveTo).not.toHaveBeenCalled();
    expect(onJumpTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "PD 리뷰 좌석 2로 걸어가기" }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith({ x: 1660, y: 1002 });
    fireEvent.click(screen.getByRole("button", { name: "PD 리뷰룸으로 바로 가기" }));
    expect(onJumpTo).toHaveBeenCalledExactlyOnceWith(manifest.spawns.find(spawn => spawn.id === "hq-review-room")?.point);
    fireEvent.change(input, { target: { value: "없는자리" } });
    expect(screen.getByRole("status").textContent).toContain("일치하는 목적지가 없어요");
    fireEvent.click(screen.getByRole("button", { name: "공간 지도" }));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("개별 스폰이 없는 방에서는 월드 입구 대신 그 방의 상호작용 지점으로 이동한다", () => {
    const cafe = campus.rooms.find(room => room.labelKo.includes("카페"));
    if (!cafe) throw new Error("캠퍼스 카페가 필요합니다");
    const point = { x: cafe.x + 24, y: cafe.y + 24 };
    const manifest = { ...campus, spawns: campus.spawns.filter(spawn => spawn.id !== cafe.id),
      interactions: [{ id: "cafe-tool", zoneId: cafe.id, point, radius: 24, labelKo: "도구", labelEn: "Tool", action: "assets" as const }] };
    const onMoveTo = vi.fn();
    render(<SpaceMinimap manifest={manifest} self={{ x: 50, y: 50 }} people={[]} currentRoomId={null} variant="full" onMoveTo={onMoveTo} />);
    fireEvent.click(screen.getByRole("button", { name: /카페로 걸어가기/u }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith(point);
  });

  it("게이트 칩은 바로 가기 콜백이 없으면 게이트까지 걷는다", () => {
    const onMoveTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} />);
    fireEvent.click(screen.getByRole("button", { name: /라이브러리 게이트까지 걷기/u }));
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith({ x: 132, y: 790 });
  });

  it("게이트 칩 바로 가기는 한 번 더 눌러 확인해야 장소 전환을 요청한다", () => {
    const onJumpToPlace = vi.fn(), onMoveTo = vi.fn();
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="full" onMoveTo={onMoveTo} onJumpToPlace={onJumpToPlace} />);
    fireEvent.click(screen.getByRole("button", { name: /라이브러리로 바로 가기/u }));
    expect(onJumpToPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /라이브러리 바로 가기 확인/u }));
    expect(onJumpToPlace).toHaveBeenCalledExactlyOnceWith("tree-library");
    expect(onMoveTo).not.toHaveBeenCalled();
  });

  it("미니 변형에는 바로 가기 버튼을 그리지 않는다", () => {
    render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={[]}
      currentRoomId={null} variant="mini" onMoveTo={vi.fn()} onJumpTo={vi.fn()} onJumpToPlace={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /바로 가기/u })).toBeNull();
  });

  it("큰 지도에서는 다른 사람을 이름 첫 글자 칩으로 그리고, 미니 지도에서는 점으로만 그린다", () => {
    const people = [{ id: "peer-1", name: "민지", point: { x: 900, y: 700 } }];
    const { container, rerender } = render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={people}
      currentRoomId={null} variant="full" onMoveTo={vi.fn()} />);
    const initial = container.querySelector(".space-minimap__peer-initial");
    expect(initial?.textContent).toBe("민");
    const marker = initial?.closest("g");
    expect(marker?.getAttribute("transform")).toBe("translate(900 700)");
    rerender(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={people}
      currentRoomId={null} variant="mini" onMoveTo={vi.fn()} />);
    expect(container.querySelector(".space-minimap__peer-initial")).toBeNull();
    expect(container.querySelector(".space-minimap__peer")).not.toBeNull();
  });

  it("동료 클러스터의 실제 더블클릭 순서에서 오프셋 목적지 이동을 한 번만 요청한다", () => {
    const onMoveTo = vi.fn();
    const people = [
      { id: "peer-1", name: "민지", point: { x: 900, y: 700 } },
      { id: "peer-2", name: "현우", point: { x: 912, y: 708 } },
    ];
    const { container } = render(<SpaceMinimap manifest={campus} self={{ x: 448, y: 540 }} people={people}
      currentRoomId={null} variant="mini" onMoveTo={onMoveTo} />);
    const initial = container.querySelector(".space-minimap__peer-initial");
    expect(initial?.textContent).toBe("+2");
    const pin = container.querySelector(".space-minimap__peer-pin");
    expect(pin).not.toBeNull();
    const surface = screen.getByRole("button", { name: "지도에서 걸어갈 곳 선택" });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
    if (!pin) throw new Error("동료 클러스터 핀이 필요합니다.");
    fireEvent.click(pin, { detail: 1, clientX: 100, clientY: 100 });
    fireEvent.click(pin, { detail: 2, clientX: 100, clientY: 100 });
    expect(onMoveTo).not.toHaveBeenCalled();
    fireEvent.doubleClick(pin, { detail: 2, clientX: 100, clientY: 100 });
    expect(onMoveTo).toHaveBeenCalledExactlyOnceWith(spaceMinimapPeerTarget({ x: 906, y: 704 }, "peer-1"));
  });
});
