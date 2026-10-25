// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FlowProgress } from "./FlowProgress";

afterEach(cleanup);

const STEPS = [
  { label: "스토리 확정", state: "done" as const, href: "/production/projects/p1/planning" },
  { label: "인계", state: "active" as const, href: "/production/projects/p1/handoff" },
  { label: "콘티", state: "todo" as const, href: "/production/projects/p1/production" },
];

describe("FlowProgress 단계 레일", () => {
  it("현재 단계에 aria-current=step을 붙이고 href가 있는 단계는 링크로 렌더한다", () => {
    render(<FlowProgress ariaLabel="회차 진행 단계" steps={STEPS} />);
    const current = screen.getByRole("listitem", { current: "step" });
    expect(current.textContent).toContain("인계");
    expect(screen.getByRole("link", { name: "콘티" }).getAttribute("href")).toBe(
      "/production/projects/p1/production",
    );
  });

  it("다음 행동이 있으면 접두어와 함께 CTA 링크를 렌더한다", () => {
    render(
      <FlowProgress
        ariaLabel="회차 진행 단계"
        steps={STEPS}
        nextAction={{ label: "인계", href: "/production/projects/p1/handoff" }}
        nextPrefix="다음 행동"
      />,
    );
    expect(screen.getByText("다음 행동")).toBeTruthy();
    // 단계 링크와 CTA 링크가 같은 단계명을 쓰므로 둘 다 존재함을 확인한다.
    const actionLinks = screen.getAllByRole("link", { name: "인계" });
    expect(actionLinks.map((link) => link.getAttribute("href"))).toContain(
      "/production/projects/p1/handoff",
    );
  });

  it("다음 행동이 없고 전 단계가 완료면 완료 문구만 렌더한다", () => {
    render(
      <FlowProgress
        ariaLabel="회차 진행 단계"
        steps={[
          { label: "스토리 확정", state: "done" as const },
          { label: "인계", state: "done" as const },
        ]}
        nextAction={null}
        allDoneLabel="모든 단계가 끝났습니다"
      />,
    );
    expect(screen.getByText("모든 단계가 끝났습니다")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("다음 행동이 undefined면 다음 행동 행을 그리지 않는다", () => {
    const { container } = render(<FlowProgress ariaLabel="회차 진행 단계" steps={STEPS} />);
    expect(container.textContent).not.toContain("다음 행동");
  });
});
