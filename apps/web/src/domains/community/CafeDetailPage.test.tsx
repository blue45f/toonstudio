// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommunityCafe } from "@/shared/lib/types";

import { CafeDetailPage } from "./CafeDetailPage";

const mocks = vi.hoisted(() => ({
  raw: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  getApiErrorMessage: vi.fn(
    async (_caught: unknown, fallback: string) => fallback,
  ),
  state: {
    userId: "user-qa" as string | null,
    sessionToken: "token-qa" as string | null,
  },
}));

vi.mock("@/platform/api", () => ({
  api: { raw: mocks.raw, post: mocks.post, delete: mocks.delete },
  apiPath: (path: string) => path,
  getApiErrorMessage: mocks.getApiErrorMessage,
}));
vi.mock("@/shared/lib/http-safe", () => ({
  safeParseJson: async (response: { json: () => Promise<unknown> }) =>
    response.json(),
  resolveApiError: (_data: unknown, fallback: string) => fallback,
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaDescription: () => undefined,
  usePageSocialMeta: () => undefined,
}));
vi.mock("@/shared/components/fan-cafe-panel", () => ({
  FanCafePanel: () => <div data-testid="fan-cafe-panel" />,
}));
vi.mock("@/shared/components/share-page-button", () => ({
  SharePageButton: () => null,
}));
vi.mock("@/shared/motion-assets", () => ({
  MotionIllustration: () => null,
}));

const memberCafe: CommunityCafe = {
  id: "cafe-1",
  slug: "muhyup-lovers",
  name: "무협을 사랑하는 모임",
  description: "무협 웹툰을 이야기하는 커뮤니티",
  genre: "무협",
  kind: "genre",
  tags: ["무협"],
  visibility: "public",
  joinPolicy: "open",
  postingPolicy: "members",
  rules: [],
  status: "active",
  createdBy: "user-owner",
  ownerName: "소유자",
  memberCount: 4,
  postCount: 12,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  viewerIsMember: true,
  viewerRole: "member",
  viewerMembershipState: "member",
  viewerJoinRequestId: null,
  viewerCanViewContent: true,
  viewerCanManage: false,
  viewerCanModerate: false,
  viewerCanPost: true,
};

const leftCafe: CommunityCafe = {
  ...memberCafe,
  memberCount: 3,
  viewerIsMember: false,
  viewerRole: null,
  viewerMembershipState: "none",
  viewerCanViewContent: true,
  viewerCanPost: false,
};

function mockCafeLoad(cafe: CommunityCafe) {
  mocks.raw.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => cafe,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/community/cafes/muhyup-lovers"]}>
      <Routes>
        <Route path="/community/cafes/:slug" element={<CafeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.userId = "user-qa";
  mocks.state.sessionToken = "token-qa";
});
afterEach(cleanup);

describe("CafeDetailPage 카페 탈퇴 (F-B15-1)", () => {
  it("탈퇴하기를 누르면 확인 절차가 먼저 열리고 DELETE는 아직 나가지 않는다", async () => {
    mockCafeLoad(memberCafe);
    renderPage();

    const leaveButton = await screen.findByRole("button", { name: "탈퇴하기" });
    fireEvent.click(leaveButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("이 커뮤니티에서 탈퇴할까요?"),
    ).toBeTruthy();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("확인하면 DELETE 요청 후 멤버 상태·버튼·안내가 즉시 갱신된다", async () => {
    mockCafeLoad(memberCafe);
    mocks.delete.mockResolvedValue(leftCafe);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "탈퇴하기" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "탈퇴하기" }));

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledTimes(1);
    });
    expect(mocks.delete.mock.calls[0]?.[0]).toBe(
      "/community/cafes/muhyup-lovers/membership",
    );
    expect(
      await screen.findByRole("button", { name: "가입하기" }),
    ).toBeTruthy();
    expect(screen.getByText("커뮤니티에서 탈퇴했어요.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("멤버 3명")).toBeTruthy();
  });

  it("취소하면 요청 없이 다이얼로그만 닫힌다", async () => {
    mockCafeLoad(memberCafe);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "탈퇴하기" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "탈퇴하기" })).toBeTruthy();
  });

  it("DELETE가 실패하면 오류를 표시하고 멤버 상태와 재시도 버튼을 유지한다", async () => {
    mockCafeLoad(memberCafe);
    mocks.delete.mockRejectedValue(new Error("network down"));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "탈퇴하기" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "탈퇴하기" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "탈퇴 또는 요청 취소를 처리하지 못했습니다.",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "탈퇴하기" })).toBeTruthy();
  });
});
