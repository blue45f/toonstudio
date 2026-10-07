// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringReferencesPage } from "./EngineeringReferencesPage";
import { ENGINEERING_REFERENCES } from "./engineering-story-deep-dive-content";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("EngineeringReferencesPage 첫 화면", () => {
  it("자료 · 참고 자료 정체성 칩과 핵심 요약을 보여주고 전체 항목 수를 알린다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/references"]}>
        <EngineeringReferencesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/자료 · 참고 자료|Resources · References/u)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /핵심 요약|Key summary/u })).toBeTruthy();
    expect(screen.getByText(new RegExp(`${ENGINEERING_REFERENCES.length}개 결과|${ENGINEERING_REFERENCES.length} results`, "u"))).toBeTruthy();
  });
});
