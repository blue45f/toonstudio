// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PromoVideoLibraryPage } from "./PromoVideoLibraryPage";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("PromoVideoLibraryPage — REA 3-Mode 뷰 스위처·필터·허브 서브탭", () => {
  it("맥락형 서브탭과 3-Mode 뷰 스위처(card, poster, list), 화면 비율 필터, REA 기준표를 렌더링한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/promo-library"]}>
        <PromoVideoLibraryPage />
      </MemoryRouter>,
    );

    const subnav = screen.getByRole("navigation", {
      name: "영상 · 홍보 · 컷츠 허브",
    });
    expect(subnav).toBeTruthy();

    const root = container.querySelector(".promo-library");
    expect(root?.getAttribute("data-view-mode")).toBe("card");

    const posterBtn = screen.getByRole("button", {
      name: "포스터·쇼츠 그리드",
    });
    fireEvent.click(posterBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("poster");
    expect(posterBtn.getAttribute("aria-pressed")).toBe("true");

    const listBtn = screen.getByRole("button", { name: "컴팩트 리스트" });
    fireEvent.click(listBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("list");

    const verticalBtn = screen.getByRole("button", {
      name: "세로 9:16 쇼츠",
    });
    fireEvent.click(verticalBtn);
    expect(verticalBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeTruthy();
  });
});
