// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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
  it("renders 44px creation, spatial reader, and character talk links in Korean and English", () => {
    useI18n.setState({ lang: "ko" });
    render(
      <MemoryRouter>
        <TitleDetailCreationBridgeCard slug="fog-signal" titleName="안개 속의 신호" />
      </MemoryRouter>,
    );

    const card = screen.getByTestId("title-detail-creation-bridge");
    const createLink = within(card).getByRole("link", { name: "이 연출 템플릿으로 3컷 시작" });
    expect(createLink.getAttribute("href")).toBe("/create");
    expect(createLink.className).toContain("min-h-11");
    expect(within(card).getByRole("link", { name: "2.5D 공간 리더 체험" }).getAttribute("href")).toBe("/read/spatial");
    expect(within(card).getByRole("link", { name: "캐릭터와 대화하기" }).getAttribute("href")).toBe("/character-chat?work=fog-signal");

    cleanup();
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <TitleDetailCreationBridgeCard slug="fog-signal" titleName="Fog Signal" />
      </MemoryRouter>,
    );
    const enCard = screen.getByTestId("title-detail-creation-bridge");
    expect(enCard.textContent).not.toMatch(/[가-힣]/u);
    expect(within(enCard).getByRole("link", { name: "Start 3-panel story" }).getAttribute("href")).toBe("/create");
  });
});
