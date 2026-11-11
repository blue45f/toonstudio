// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { MySpaceVaultAndRestBar } from "./MySpaceVaultAndRestBar";

afterEach(cleanup);

describe("MySpaceVaultAndRestBar", () => {
  it("separates security/recovery vault links from the rest & inspiration corner", () => {
    render(
      <MemoryRouter>
        <MySpaceVaultAndRestBar />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("my-space-vault-rest-bar");
    expect(within(section).getByRole("link", { name: /통합 API 키 볼트/u }).getAttribute("href"))
      .toBe("/settings/api-keys");
    expect(within(section).getByRole("link", { name: /원고 복구 금고/u }).getAttribute("href"))
      .toBe("/studio/recovery");
    expect(within(section).getByRole("link", { name: /창작 운세/u }).getAttribute("href"))
      .toBe("/fortune");
    expect(within(section).getByRole("link", { name: /미니 놀이터/u }).getAttribute("href"))
      .toBe("/play");
  });
});
