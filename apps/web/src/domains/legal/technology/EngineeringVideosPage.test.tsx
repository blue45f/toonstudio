// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringVideosPage } from "./EngineeringVideosPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("EngineeringVideosPage 첫 화면", () => {
  it("발표 · 영상 정체성 칩과 핵심 요약을 보여준다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/videos"]}>
        <EngineeringVideosPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/발표 · 영상|Present · Video/u)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();
  });
});
