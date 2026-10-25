// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDesignPlatformWorkbench } from "./StudioDesignPlatformWorkbench";

afterEach(cleanup);

describe("StudioDesignPlatformWorkbench", () => {
  it("매직 스위치 · 워프 타이포 · 스타일 셔플 · 회차 대량 생성 4대 탭과 키보드 탐색을 수행한다", () => {
    const onApplyStyle = vi.fn();
    render(
      <StudioDesignPlatformWorkbench
        projectId="proj-design-demo"
        onApplyStylePackToSeriesKit={onApplyStyle}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /캔바·미리캔버스·망고보드·키틀 통합 디자인 & 멀티포맷 워크벤치/u,
      }),
    ).toBeTruthy();

    // 1. 기본 탭(매직 스위치) 확인 및 단행본 펼침면 계산 확인
    expect(screen.getByText(/스마트 멀티포맷 매직 스위치/u)).toBeTruthy();
    expect(screen.getByText(/A5 단행본 표지 펼침면/u)).toBeTruthy();

    // 키보드 ArrowRight로 2번 탭(웹툰 타이틀 · 워프 타이포) 전환
    const firstTab = screen.getByRole("tab", {
      name: /1\. 매직 스위치 · 멀티포맷 변환/u,
    });
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });
    expect(
      screen.getByText(/키틀\(Kittl\) · 미리캔버스 웹툰 타이틀 & 의성어 워프\(Warp\) 스튜디오/u),
    ).toBeTruthy();

    // 3. 3번 탭(스타일 셔플 · 브랜드 가드레일) 전환 및 원클릭 셔플/Series Kit 반영 실행
    fireEvent.click(
      screen.getByRole("tab", { name: /3\. 스타일 셔플 · 브랜드 가드레일/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: /스타일 원클릭 셔플/u }));
    expect(screen.getByRole("status").textContent).toContain("조합으로 전환했습니다");

    fireEvent.click(
      screen.getByRole("button", { name: /현재 Series Kit 색상·글자 스타일에 즉시 반영/u }),
    );
    expect(onApplyStyle).toHaveBeenCalledTimes(1);

    // 4. 4번 탭(회차 대량 생성 · 굿즈 · 라이선스) 전환 및 회차 행 추가
    fireEvent.click(
      screen.getByRole("tab", { name: /4\. 회차 대량 생성 · 굿즈 · 라이선스/u }),
    );
    fireEvent.click(screen.getByRole("button", { name: /회차 행 추가/u }));
    expect(screen.getByRole("status").textContent).toContain(
      "4화 대량 생성(Bulk Create) 행을 추가했습니다.",
    );
    expect(screen.getByText(/4페이지/u)).toBeTruthy();
  });
});
