// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { MySpaceVaultAndRestBar } from "./MySpaceVaultAndRestBar";
import { useI18n } from "@/shared/lib/i18n";

afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("MySpaceVaultAndRestBar", () => {
  it.each(["ko", "en"] as const)("%s에서 기술 보관 용어 대신 복구와 연결 목적을 보여 준다", (locale) => {
    useI18n.getState().setLang(locale);
    render(
      <MemoryRouter>
        <MySpaceVaultAndRestBar />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("my-space-vault-rest-bar");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "외부 서비스 연결 설정" : "Service connection settings" }).getAttribute("href"))
      .toBe("/settings/api-keys");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "작업 복구 자료" : "Work recovery data" }).getAttribute("href"))
      .toBe("/studio/recovery");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "창작 운세" : "Creator Fortune" }).getAttribute("href"))
      .toBe("/fortune");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "미니 놀이터" : "Playground" }).getAttribute("href"))
      .toBe("/play");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "전체 기능" : "All tools" }).getAttribute("href")).toBe("/sitemap");
    expect(within(section).getByRole("link", { name: locale === "ko" ? "영감 둘러보기" : "Explore inspiration" }).getAttribute("href")).toBe("/now");
    expect(section.textContent).not.toMatch(/ATELIER VAULT|AES-GCM|OPFS|Key Vault|금고|볼트|zero plaintext/u);
  });
});
