// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreateStartPage } from "../CreateStartPage";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("초보자 1초 장르 스타터 및 원클릭 프리셋 흐름", () => {
  it("시작 화면(/create)에 4가지 비주얼 장르 스타터 카드를 렌더링하고 올바른 생성 주소로 연결한다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <CreateStartPage />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("create-start-genre-starters");
    expect(section).toBeTruthy();

    const romance = screen.getByTestId("genre-starter-romance");
    const action = screen.getByTestId("genre-starter-action");
    const daily = screen.getByTestId("genre-starter-daily");
    const mystery = screen.getByTestId("genre-starter-mystery");

    expect(romance.getAttribute("href")).toContain("format=vertical-webtoon");
    expect(action.getAttribute("href")).toContain("lane=storyboard");
    expect(daily.getAttribute("href")).toContain("format=cuttoon");
    expect(mystery.getAttribute("href")).toContain("format=page-comic");
  });

  it("프로젝트 생성 화면(/studio/new)에서 일상 4컷툰 프리셋을 누르면 형식·템플릿·가제가 한 번에 채워진다", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const dailyPreset = screen.getByTestId("studio-quick-preset-daily-cuttoon");
    fireEvent.click(dailyPreset);

    expect(dailyPreset.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[data-studio-create-format="cuttoon"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    const titleInput = screen.getByRole("textbox", {
      name: /프로젝트 이름|Project name/u,
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("오늘 하루 네 컷 일기");

    fireEvent.click(
      screen.getByRole("button", {
        name: /컷툰·SNS 만화 시작|Start Card comic & social series/u,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("format=cuttoon");
    });

    const created = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(created?.title).toBe("오늘 하루 네 컷 일기");
    expect(created?.templateId).toBe("cuttoon-square-4");
  });
});
