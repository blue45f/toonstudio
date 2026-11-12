// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { TitleDetailCreationBridgeCard } from "./TitleDetailCreationBridgeCard";

import { useI18n } from "@/shared/lib/i18n-core";

const initialLang = useI18n.getState().lang;

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLang });
});

describe("TitleDetailCreationBridgeCard", () => {
  it.each([
    {
      lang: "ko" as const,
      title: "안개 속의 신호",
      summary: "창작·뷰어 체험",
      create: "3컷 이야기 만들기",
      spatial: "공간 뷰어 체험",
      chat: "캐릭터와 대화하기",
    },
    {
      lang: "en" as const,
      title: "Fog Signal",
      summary: "Create or try the viewer",
      create: "Create a 3-panel story",
      spatial: "Try the spatial viewer",
      chat: "Chat with characters",
    },
  ])("$lang: 부가 활동을 접어 시작하고 펼치면 기존 목적지 3개를 제공한다", (copy) => {
    useI18n.setState({ lang: copy.lang });
    render(
      <MemoryRouter>
        <TitleDetailCreationBridgeCard slug="fog-signal" titleName={copy.title} />
      </MemoryRouter>,
    );

    const card = screen.getByTestId("title-detail-creation-bridge");
    const summary = within(card).getByText(copy.summary, { selector: "summary" });
    expect(card.tagName).toBe("DETAILS");
    expect(card.hasAttribute("open")).toBe(false);
    // jsdom은 닫힌 details의 렌더링을 생략하지 않아 native open 상태와 링크 소속을 확인한다.
    expect(within(card).getAllByRole("link").every((link) => link.closest("details") === card)).toBe(true);
    expect(summary.className).toContain("min-h-11");

    fireEvent.click(summary);
    expect(card.hasAttribute("open")).toBe(true);
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.className.includes("min-h-11"))).toBe(true);
    expect(within(card).getByRole("link", { name: copy.create }).getAttribute("href")).toBe("/create");
    expect(within(card).getByRole("link", { name: copy.spatial }).getAttribute("href")).toBe("/read/spatial");
    expect(within(card).getByRole("link", { name: copy.chat }).getAttribute("href")).toBe("/character-chat?work=fog-signal");
    expect(within(card).getByText(new RegExp(copy.title))).toBeTruthy();
    if (copy.lang === "en") expect(card.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(summary);
    expect(card.hasAttribute("open")).toBe(false);
  });

  it("캐릭터 대화의 작품 식별자를 안전하게 인코딩한다", () => {
    useI18n.setState({ lang: "ko" });
    render(
      <MemoryRouter>
        <TitleDetailCreationBridgeCard slug="fog & signal" titleName="안개 속의 신호" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText("창작·뷰어 체험", { selector: "summary" }));
    expect(screen.getByRole("link", { name: "캐릭터와 대화하기" }).getAttribute("href")).toBe("/character-chat?work=fog%20%26%20signal");
  });
});
