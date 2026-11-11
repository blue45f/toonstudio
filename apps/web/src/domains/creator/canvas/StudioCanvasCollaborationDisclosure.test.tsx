// @vitest-environment jsdom
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCanvasCollaborationDisclosure } from "./StudioCanvasCollaborationDisclosure";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/shared/hooks/use-media-query", () => ({ useIsMobile: () => viewport.mobile }));
afterEach(() => { cleanup(); viewport.mobile = true; });
function detailsForSummary() {
  const details = screen.getByText("함께 작업").closest("details");
  if (!details) throw new Error("함께 작업 접힘을 찾지 못했습니다.");
  return details;
}

describe("함께 작업 접힘", () => {
  it("모바일 기본 닫힘과 펼침·Escape 복귀에서도 자식 구독을 유지한다", () => {
    const mounted = vi.fn(); const unmounted = vi.fn(); const action = vi.fn();
    function Controls() { useEffect(() => { mounted(); return unmounted; }, []); return <button onClick={action}>팀원 커서 보기</button>; }
    const view = render(<StudioCanvasCollaborationDisclosure mobileImmersive onOpenTeam={vi.fn()}><Controls /></StudioCanvasCollaborationDisclosure>);
    const summary = screen.getByText("함께 작업");
    const details = detailsForSummary();
    expect(details.open).toBe(false);
    expect(screen.queryByRole("button", { name: "팀원 커서 보기" })).toBeNull();
    expect(mounted).toHaveBeenCalledOnce();
    act(() => { details.open = true; fireEvent(details, new Event("toggle")); });
    fireEvent.click(screen.getByRole("button", { name: "팀원 커서 보기" }));
    expect(action).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", { name: "팀원 커서 보기" }), { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
    expect(unmounted).not.toHaveBeenCalled();
    view.unmount(); expect(unmounted).toHaveBeenCalledOnce();
  });

  it("상세 기능이 Escape를 먼저 처리하면 바깥 접힘은 유지한다", () => {
    render(<StudioCanvasCollaborationDisclosure mobileImmersive onOpenTeam={vi.fn()}><button onKeyDown={(event) => event.preventDefault()}>커서 옵션</button></StudioCanvasCollaborationDisclosure>);
    const details = detailsForSummary();
    act(() => { details.open = true; fireEvent(details, new Event("toggle")); });
    fireEvent.keyDown(screen.getByRole("button", { name: "커서 옵션" }), { key: "Escape" });
    expect(details.open).toBe(true);
  });

  it("데스크톱·일반 레이아웃은 열린 채 같은 협업 컨트롤을 유지한다", () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Controls() { useEffect(() => { mounted(); return unmounted; }, []); return <button>따라가기</button>; }
    const view = render(<StudioCanvasCollaborationDisclosure mobileImmersive onOpenTeam={vi.fn()}><Controls /></StudioCanvasCollaborationDisclosure>);
    viewport.mobile = false;
    view.rerender(<StudioCanvasCollaborationDisclosure mobileImmersive onOpenTeam={vi.fn()}><Controls /></StudioCanvasCollaborationDisclosure>);
    expect(screen.getByText("함께 작업").closest("details")?.open).toBe(true);
    expect(screen.getByRole("button", { name: "따라가기" })).toBeTruthy();
    expect(mounted).toHaveBeenCalledOnce(); expect(unmounted).not.toHaveBeenCalled();
    viewport.mobile = true;
    view.rerender(<StudioCanvasCollaborationDisclosure mobileImmersive={false} onOpenTeam={vi.fn()}><Controls /></StudioCanvasCollaborationDisclosure>);
    expect(screen.getByText("함께 작업").closest("details")?.open).toBe(true);
  });

  it("참여자가 없어도 팀·채팅을 여는 목적 행동을 제공한다", () => {
    const onOpenTeam = vi.fn();
    render(<StudioCanvasCollaborationDisclosure mobileImmersive onOpenTeam={onOpenTeam}>{null}</StudioCanvasCollaborationDisclosure>);
    const details = detailsForSummary();
    act(() => { details.open = true; fireEvent(details, new Event("toggle")); });
    fireEvent.click(screen.getByRole("button", { name: "팀·채팅 열기" }));
    expect(onOpenTeam).toHaveBeenCalledOnce();
  });
  it("접혀 있어도 화면 따라가기 중인 현재 문맥을 표시한다", () => {
    render(<StudioCanvasCollaborationDisclosure mobileImmersive following onOpenTeam={vi.fn()}>{null}</StudioCanvasCollaborationDisclosure>);
    expect(detailsForSummary().open).toBe(false);
    expect(screen.getByText("따라가기 중")).toBeTruthy();
  });

});
