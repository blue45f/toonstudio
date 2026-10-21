// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioStorySeedBuilder } from "./StudioStorySeedBuilder";

afterEach(cleanup);

describe("StudioStorySeedBuilder (E2 연결 전 + 로컬 폴백 동작)", () => {
  it("외부 AI 연결 전을 명시하고, 로컬 결정적 제안이 실제로 초안을 만든다", async () => {
    const onApplySeed = vi.fn();
    const { container } = render(<StudioStorySeedBuilder onApplySeed={onApplySeed} />);

    // 외부 제공자 '연결 전' 배지 + 로컬 폴백 안내가 보인다.
    expect(
      container.querySelector('[data-studio-ai-connection-status="not-connected"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("외부 AI 제공자는 연결 전입니다");

    // 장르를 고르고 생성하면 (기본 제공자 = 로컬 결정적) 초안이 실제로 나온다.
    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByRole("button", { name: "씨앗 초안 만들기" }));
    await waitFor(() => {
      expect(screen.getByText("로그라인 후보 — 하나를 고르세요")).toBeTruthy();
    });

    // 적용하면 회차 기획 패치가 실제로 콜백으로 나간다.
    fireEvent.click(screen.getByRole("button", { name: "이 초안을 회차 기획에 넣기" }));
    expect(onApplySeed).toHaveBeenCalledTimes(1);
    const [patch, draft] = onApplySeed.mock.calls[0]!;
    expect(patch.logline.length).toBeGreaterThan(0);
    expect(draft.source).toBe("local");
  });
});
