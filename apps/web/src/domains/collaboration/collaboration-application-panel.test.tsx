// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationsPanel, InviteNextStepsPanel } from "./collaboration-application-panel";

const clientMocks = vi.hoisted(() => ({
  applications: vi.fn(),
  applicationStatus: vi.fn(),
}));
vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: clientMocks,
}));
vi.mock("./hiring/HiringSubmissionPanel", () => ({
  HiringSnapshotPanel: () => null,
  HiringSubmissionPanel: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("InviteNextStepsPanel", () => {
  it("합류 확정 안내와 3단계 초대 순서를 보여준다", () => {
    render(
      <InviteNextStepsPanel
        name="김작가"
        onContinue={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "김작가님의 합류를 확정했어요" }),
    ).not.toBeNull();
    const steps = screen.getByRole("list").querySelectorAll("li");
    expect(steps.length).toBe(3);
    expect(screen.queryByText(/팀 초대 보내기/)).not.toBeNull();
    expect(screen.queryByText(/작품 접근 권한 연결/)).not.toBeNull();
    expect(screen.queryByText(/첫 작업 안내/)).not.toBeNull();
  });
  it("계속하기와 나중에 하기 버튼이 각 콜백을 호출한다", () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(
      <InviteNextStepsPanel
        name="김작가"
        onContinue={onContinue}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "팀·권한 연결하러 가기" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

describe("ApplicationsPanel (받은 지원)", () => {
  it("합류가 확정된 지원에서는 언제 돌아와도 팀·권한 연결을 계속할 수 있다", async () => {
    clientMocks.applications.mockResolvedValue([
      {
        id: "app-1",
        postId: "post-1",
        userId: "user-9",
        applicantName: "김작가",
        status: "selected",
        message: "함께하고 싶습니다. 주 3회 작업 가능합니다.",
        contact: "artist@example.com",
        portfolioUrl: "",
        createdAt: "2026-10-10T00:00:00.000Z",
      },
    ]);
    render(
      <MemoryRouter initialEntries={["/collaborate/post-1"]}>
        <ApplicationsPanel id="post-1" busy={false} act={async () => true} />
        <LocationProbe />
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", { name: "팀·권한 연결 계속하기" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/team/people?onboard=app-1");
    });
    // 온보딩 문맥은 서버 항목에서 다시 만들어져 세션 저장소에 실린다.
    const saved = Object.values(sessionStorage).join(" ");
    expect(saved).toContain("app-1");
    expect(saved).toContain("user-9");
  });
});
