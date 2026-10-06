// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  browserStudioFalSessionStorage,
  saveStudioFalApiKey,
} from "@/domains/creator/public/studio-lora-fal-key";

import { ApiKeyHubPage } from "./ApiKeyHubPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/api-keys"]}>
      <ApiKeyHubPage />
    </MemoryRouter>,
  );
}

describe("ApiKeyHubPage 첫 화면 맥락", () => {
  afterEach(cleanup);
  beforeEach(() => {
    globalThis.sessionStorage?.clear();
  });

  it("고급 도구임을 밝히고 키별 용도 안내를 먼저 보여 준다", () => {
    renderPage();

    expect(screen.getByText("고급 도구")).toBeTruthy();
    expect(screen.getByText("어떤 키가 무슨 기능을 켜나요?")).toBeTruthy();
    // 키가 없으면 해당 기능이 어떻게 되는지까지 안내한다.
    expect(screen.getByText(/키가 없으면 사진 검색이 비활성화됩니다/)).toBeTruthy();
    expect(screen.getByText(/키가 없으면 발송 대신 발송 기록만 남습니다/)).toBeTruthy();
  });

  it("연결된 키가 없으면 상태 요약이 0개 연결을 알리고 전부 연결할 필요가 없다고 안내한다", () => {
    renderPage();

    expect(screen.getByText("4개 중 0개 연결됨")).toBeTruthy();
    expect(screen.getByText(/전부 연결할 필요는 없습니다/)).toBeTruthy();
  });

  it("세션에 저장된 키가 있으면 상태 요약과 칩에 연결됨으로 반영된다", () => {
    saveStudioFalApiKey(browserStudioFalSessionStorage(), "fal-existing-key-42");
    renderPage();

    expect(screen.getByText("4개 중 1개 연결됨")).toBeTruthy();
    const chip = screen.getByRole("link", { name: /fal\.ai 키\s*연결됨/ });
    expect(chip.getAttribute("href")).toBe("#api-key-fal");
  });

  it("용도 안내의 이동 링크가 각 키 카드를 가리킨다", () => {
    renderPage();

    const links = screen.getAllByRole("link", { name: "키 카드로 이동" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#api-key-ai",
      "#api-key-unsplash",
      "#api-key-resend",
      "#api-key-fal",
    ]);
    expect(document.getElementById("api-key-ai")).toBeTruthy();
    expect(document.getElementById("api-key-unsplash")).toBeTruthy();
    expect(document.getElementById("api-key-resend")).toBeTruthy();
    expect(document.getElementById("api-key-fal")).toBeTruthy();
  });
});
