// @vitest-environment jsdom
import { useEffect } from "react";
import { readFileSync } from "node:fs";
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
    expect(details.querySelector('[data-studio-collaboration-body] [data-studio-collaboration-huddle-slot]')).not.toBeNull();
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
    expect(document.getElementById("studio-collaboration-huddle-slot")).toBeNull();
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
  it("화면 따라가기 중에는 현재 문맥과 기존 중단 조작을 먼저 펼쳐 보인다", () => {
    const stop = vi.fn();
    render(<StudioCanvasCollaborationDisclosure mobileImmersive following onOpenTeam={vi.fn()}><button onClick={stop}>따라가기 중지</button></StudioCanvasCollaborationDisclosure>);
    expect(detailsForSummary().open).toBe(true);
    expect(screen.getByText("따라가기 중")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "따라가기 중지" })); expect(stop).toHaveBeenCalledOnce();
  });

  it("간결한 모바일은 idle 행만 접고 active-follow·외부 P2P 표면과 모드 복귀는 보존한다", () => {
    const css = readFileSync("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css", "utf8");
    const rule = css.split("\n").find((line) => line.startsWith("[data-studio-drawing-clarity-mobile=true] [data-studio-collaboration-disclosure=true]"));
    if (!rule) throw new Error("협업 행의 실제 명료성 CSS 규칙이 필요합니다.");
    const stopped = vi.fn(), mounted = vi.fn(), unmounted = vi.fn();
    function ExistingControls() { useEffect(() => { mounted(); return unmounted; }, []); return <button onClick={stopped}>따라가기 중지</button>; }
    function Surface({ following, clarity }: { following: boolean; clarity: boolean }) {
      return <><style>{rule}</style><div data-studio-drawing-clarity-mobile={clarity ? "true" : undefined}>
        <StudioCanvasCollaborationDisclosure mobileImmersive following={following} onOpenTeam={vi.fn()}><ExistingControls /></StudioCanvasCollaborationDisclosure>
        <div data-studio-huddle-placement="floating"><button>진행 중인 통화</button></div>
      </div></>;
    }
    const view = render(<Surface following={false} clarity />);
    expect(getComputedStyle(detailsForSummary()).display).toBe("none");
    expect(screen.getByRole("button", { name: "진행 중인 통화" })).toBeTruthy();
    view.rerender(<Surface following clarity />);
    expect(detailsForSummary().getAttribute("data-studio-collaboration-following")).toBe("true");
    expect(getComputedStyle(detailsForSummary()).display).not.toBe("none");
    expect(detailsForSummary().open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "따라가기 중지" })); expect(stopped).toHaveBeenCalledOnce();
    view.rerender(<Surface following={false} clarity={false} />);
    expect(getComputedStyle(detailsForSummary()).display).not.toBe("none");
    expect(screen.getByRole("button", { name: "진행 중인 통화" })).toBeTruthy();
    expect(mounted).toHaveBeenCalledOnce(); expect(unmounted).not.toHaveBeenCalled();
  });

});
