// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineeringStoryPage } from "./EngineeringStoryPage";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("./engineering-atlas-content", async () => {
  const fixtures = await import("./engineering-atlas.fixtures");
  return { ENGINEERING_ATLAS_ENTRIES: [fixtures.FIXTURE_ATLAS_OPFS, fixtures.FIXTURE_ATLAS_BUDGET] };
});

afterEach(cleanup);

describe("제작 스토리 → 기술 도감 역참조", () => {
  it("도감 카드가 연결한 챕터에만 '기술 도감에서 더 보기' 링크가 생긴다", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology/story"]}>
        <EngineeringStoryPage />
      </MemoryRouter>,
    );
    // 도감 데이터는 렌더 뒤에 동적으로 불러온다.
    await waitFor(() => expect(container.querySelector('#storage a[href="/about/technology/atlas#fixture-opfs"]')).toBeTruthy());
    expect(container.querySelector('#free-ai-routing a[href="/about/technology/atlas#fixture-free-budget"]')).toBeTruthy();
    // 연결되지 않은 챕터에는 줄 자체가 없다.
    expect(container.querySelector('#architecture a[href^="/about/technology/atlas#"]')).toBeNull();
  });
});
