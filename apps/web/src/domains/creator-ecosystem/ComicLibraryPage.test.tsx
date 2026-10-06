// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComicLibraryPage } from "./ComicLibraryPage";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  apiGet: vi.fn(),
}));

vi.mock("@/platform/api", () => ({
  api: {
    get: mocks.apiGet,
    put: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: mocks.userId }),
}));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/ecosystem/library"]}>
      <ComicLibraryPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = null;
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url === "/creator-ecosystem/library/me") return { items: [] };
    throw new Error(`unexpected url: ${url}`);
  });
});

afterEach(cleanup);

describe("만화 라이브러리 페이지", () => {
  it("게스트에게는 로그인 후 저장할 수 있다고 안내한다", () => {
    renderPage();
    expect(screen.getByText("내 서재 저장은 로그인 후 사용할 수 있습니다.")).toBeTruthy();
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });

  it("로그인했고 서재가 비었으면 빈 상태와 다음 행동을 보여준다", async () => {
    mocks.userId = "me";
    renderPage();
    expect(await screen.findByText("저장한 만화·단행본이 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /도서 검색하러 가기/ })).toBeTruthy();
  });

  it("서재를 불러오지 못하면 오류를 알린다", async () => {
    mocks.userId = "me";
    mocks.apiGet.mockRejectedValue(new Error("network down"));
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("내 서재를 불러오지 못했어요.");
  });

  it("서재 행은 표지 타일 위에 소장·읽음 상태 배지를 겹쳐 보여준다", async () => {
    mocks.userId = "me";
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === "/creator-ecosystem/library/me") {
        return {
          items: [{
            id: "c1", isbn13: "9784088820118", title: "책장 속 만화", creator: "작가", publisher: "출판사",
            volumeLabel: "1권", coverUrl: "", ownershipStatus: "owned", readStatus: "reading",
            editionType: "standard", lentTo: "", notes: "", sourceProvider: "kakao",
            sourceUrl: "https://example.com/book", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
          }],
        };
      }
      throw new Error(`unexpected url: ${url}`);
    });
    renderPage();
    const card = (await screen.findByRole("heading", { name: "책장 속 만화" })).closest("article");
    expect(card).toBeTruthy();
    // 상태 배지(소장/읽는 중)는 select 옵션과 별개로 표지 위에 겹쳐 보인다.
    const badges = [...(card?.querySelectorAll("span") ?? [])].filter((span) => span.className.includes("bg-black/70"));
    expect(badges.map((span) => span.textContent)).toEqual(["소장", "읽는 중"]);
    // 표지가 없으면 "표지 없음" 박스 대신 타이포 커버(장식 영역)가 붙는다.
    expect(card?.textContent).not.toContain("표지 없음");
    expect(card?.querySelector("[aria-hidden='true']")).toBeTruthy();
  });
});
