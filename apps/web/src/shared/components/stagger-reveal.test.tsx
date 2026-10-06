// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StaggerReveal, staggerDelayMs, STAGGER_MAX_DELAY_MS, STAGGER_STEP_MS } from "./stagger-reveal";

describe("staggerDelayMs", () => {
  it("첫 아이템은 지연이 없다", () => {
    expect(staggerDelayMs(0)).toBe(0);
  });

  it("인덱스만큼 간격이 누적된다", () => {
    expect(staggerDelayMs(1)).toBe(STAGGER_STEP_MS);
    expect(staggerDelayMs(3)).toBe(STAGGER_STEP_MS * 3);
  });

  it("상한에서 멈춘다 — 긴 목록의 뒤쪽이 늦어지지 않는다", () => {
    expect(staggerDelayMs(100)).toBe(STAGGER_MAX_DELAY_MS);
    expect(staggerDelayMs(6, 55, 330)).toBe(330);
  });

  it("음수·비정상 인덱스는 0으로 폴백한다", () => {
    expect(staggerDelayMs(-2)).toBe(0);
    expect(staggerDelayMs(Number.NaN)).toBe(0);
  });

  it("커스텀 간격·상한을 받는다", () => {
    expect(staggerDelayMs(2, 100, 500)).toBe(200);
    expect(staggerDelayMs(9, 100, 500)).toBe(500);
  });
});

describe("StaggerReveal", () => {
  it("자식마다 reveal 래퍼를 입히고 순서대로 --reveal-delay를 얹는다", () => {
    const { container } = render(
      <StaggerReveal>
        <p>첫째</p>
        <p>둘째</p>
        <p>셋째</p>
      </StaggerReveal>,
    );
    expect(screen.getByText("첫째")).toBeTruthy();
    const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".reveal"));
    expect(wrappers).toHaveLength(3);
    // 첫 아이템은 지연 스타일 자체가 없다(즉시), 이후는 간격 누적.
    expect(wrappers[0]?.getAttribute("style") ?? "").not.toContain("--reveal-delay");
    expect(wrappers[1]?.style.getPropertyValue("--reveal-delay")).toBe(String(STAGGER_STEP_MS));
    expect(wrappers[2]?.style.getPropertyValue("--reveal-delay")).toBe(String(STAGGER_STEP_MS * 2));
  });

  it("fade 변형은 reveal-soft를 쓴다", () => {
    const { container } = render(
      <StaggerReveal variant="fade">
        <p>하나</p>
      </StaggerReveal>,
    );
    expect(container.querySelectorAll(".reveal-soft")).toHaveLength(1);
  });

  it("목록 시맨틱(ul/li)과 컨테이너·아이템 클래스를 지킨다", () => {
    const { container } = render(
      <StaggerReveal as="ul" itemAs="li" className="grid" itemClassName="h-full">
        <p>항목</p>
      </StaggerReveal>,
    );
    const list = container.querySelector("ul.grid");
    expect(list).toBeTruthy();
    const item = container.querySelector("li.h-full");
    expect(item?.classList.contains("reveal")).toBe(true);
  });

  it("빈 자식·null은 건너뛴다", () => {
    const { container } = render(
      <StaggerReveal>
        {null}
        <p>남는 것</p>
        {false}
      </StaggerReveal>,
    );
    expect(container.querySelectorAll(".reveal")).toHaveLength(1);
  });
});
