// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorSupportPage } from "./CreatorSupportPage";

import {
  apiErrorMessage as realApiErrorMessage,
  observeApiResponse,
} from "@/platform/api-error";

const api = vi.hoisted(() => ({
  listCreatorSupportProjects: vi.fn(),
  getMyCreatorSupportApplication: vi.fn(),
  listMyCreatorSupportOffers: vi.fn(),
  submitCreatorSupportApplication: vi.fn(),
  submitCreatorSupportOffer: vi.fn(),
}));

const platformMocks = vi.hoisted(() => ({
  getApiErrorMessage: vi.fn(
    (_error: unknown, fallback: string) => Promise.resolve(fallback),
  ),
}));

const sessionState = vi.hoisted(() => ({ status: "authenticated" }));

vi.mock("./creator-support-api", async (original) => {
  const actual = await original<typeof import("./creator-support-api")>();
  return { ...actual, ...api };
});

vi.mock("@/platform/api", async (original) => {
  const actual = await original<typeof import("@/platform/api")>();
  return {
    ...actual,
    getApiErrorMessage: platformMocks.getApiErrorMessage,
  };
});

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: sessionState.status }),
}));

const stableT = (key: string) => key;

vi.mock("@/shared/lib/i18n", async (original) => {
  const actual = await original<typeof import("@/shared/lib/i18n")>();
  // 실제 useT처럼 안정적인 참조를 돌려줘야 한다. 렌더마다 새 함수면 게스트 분기의
  // 상태 초기화가 effect를 무한히 재실행한다 (실제 훅은 안정 참조가 계약).
  return { ...actual, useT: () => stableT };
});

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.status = "authenticated";
  platformMocks.getApiErrorMessage.mockImplementation(
    (_error: unknown, fallback: string) => Promise.resolve(fallback),
  );
  api.listCreatorSupportProjects.mockResolvedValue({ items: [] });
});

describe("CreatorSupportPage 내 지원 정보", () => {
  it("조회 실패를 '신청 없음'으로 위장하지 않고 오류와 재시도를 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockRejectedValue(new Error("down"));
    api.listMyCreatorSupportOffers.mockRejectedValue(new Error("down"));
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("creatorSupport.mine.loadError");
    // 실패를 빈 결과로 위장하는 문구는 없어야 한다.
    expect(screen.queryByText("creatorSupport.mine.noApplication")).toBeNull();
    expect(screen.queryByText("creatorSupport.mine.noOffers")).toBeNull();

    // 재시도가 성공하면 실제 빈 상태가 표시된다.
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("첫 화면에서 지원받기와 지원하기 두 갈래를 앵커로 나눈다", () => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    // useT 목은 키를 그대로 돌려주므로, 두 갈래 제목과 앵커 목적지가 조립되는지 확인한다.
    expect(screen.getByRole("heading", { name: "creatorSupport.paths.receiveTitle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "creatorSupport.paths.giveTitle" })).toBeTruthy();
    const applyLinks = screen.getAllByRole("link", { name: "creatorSupport.hero.apply" });
    expect(applyLinks.length).toBeGreaterThanOrEqual(2);
    expect(applyLinks.every((link) => link.getAttribute("href") === "#creator-support-apply")).toBe(true);
    const browseLinks = screen.getAllByRole("link", { name: "creatorSupport.hero.browse" });
    expect(browseLinks.length).toBeGreaterThanOrEqual(2);
    expect(browseLinks.every((link) => link.getAttribute("href") === "#creator-support-projects")).toBe(true);
  });

  it("조회가 비어 있으면 실패 없이 빈 상태만 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CreatorSupportPage 신청 게이트·검증 (F-B17-1)", () => {
  beforeEach(() => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

  const fillValidApplication = () => {
    fireEvent.change(screen.getByLabelText("creatorSupport.apply.projectTitle"), {
      target: { value: "첫 단행본을 준비하는 학생 창작자" },
    });
    fireEvent.change(screen.getByLabelText("creatorSupport.apply.story"), {
      target: { value: "학교를 다니며 주말마다 단편 만화를 그리고 있습니다." },
    });
    fireEvent.change(screen.getByLabelText("creatorSupport.apply.intendedUse"), {
      target: { value: "태블릿과 소재 구입에 도움이 필요합니다." },
    });
    fireEvent.click(screen.getByLabelText("creatorSupport.apply.consent"));
  };

  it("게스트에게는 신청 폼 대신 로그인 안내 게이트를 보여준다", () => {
    sessionState.status = "unauthenticated";
    renderPage();

    expect(
      screen.getByRole("heading", { name: "creatorSupport.apply.guestTitle" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "creatorSupport.apply.guestAction" }),
    ).toBeTruthy();
    // 폼 자체가 없으므로 제출 시도 자체가 불가능하다.
    expect(
      screen.queryByRole("button", { name: "creatorSupport.apply.submit" }),
    ).toBeNull();
    expect(api.submitCreatorSupportApplication).not.toHaveBeenCalled();
  });

  it("빈 신청은 클라이언트 검증에서 막혀 서버로 전송되지 않는다", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: "creatorSupport.apply.submit" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "지원 프로그램 운영 및 연락 안내에 동의해 주세요.",
    );
    expect(api.submitCreatorSupportApplication).not.toHaveBeenCalled();
  });

  it("동의만 하고 본문이 비면 필드 안내로 막혀 전송되지 않는다", async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("creatorSupport.apply.consent"));

    fireEvent.click(
      screen.getByRole("button", { name: "creatorSupport.apply.submit" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "프로젝트 제목과 소개, 필요한 지원 설명을 충분히 입력해 주세요.",
    );
    expect(api.submitCreatorSupportApplication).not.toHaveBeenCalled();
  });

  it("유효한 신청은 검증을 통과해 제출된다", async () => {
    api.submitCreatorSupportApplication.mockResolvedValue({
      item: null,
      updated: false,
    });
    renderPage();
    fillValidApplication();

    fireEvent.click(
      screen.getByRole("button", { name: "creatorSupport.apply.submit" }),
    );

    await waitFor(() =>
      expect(api.submitCreatorSupportApplication).toHaveBeenCalledTimes(1),
    );
    expect(api.submitCreatorSupportApplication.mock.calls[0]?.[0]).toMatchObject({
      title: "첫 단행본을 준비하는 학생 창작자",
      consentAccepted: true,
    });
    expect(
      await screen.findByText("creatorSupport.apply.success"),
    ).toBeTruthy();
  });

  it("서버가 403 사유를 주면 그 문구를 그대로 보여주고 입력은 보존한다", async () => {
    // 실제 플랫폼 오류 변환을 그대로 태워, 페이지가 서버 사유를 받는지 검증한다.
    platformMocks.getApiErrorMessage.mockImplementation(
      (error: unknown, fallback: string) =>
        Promise.resolve(realApiErrorMessage(error, fallback)),
    );
    const serverError = await observeApiResponse(
      new Response(JSON.stringify({ message: "로그인이 필요해요." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(serverError).not.toBeNull();
    api.submitCreatorSupportApplication.mockRejectedValue(serverError);
    renderPage();
    fillValidApplication();

    fireEvent.click(
      screen.getByRole("button", { name: "creatorSupport.apply.submit" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("로그인이 필요해요.");
    expect(alert.textContent).not.toContain("이 작업을 수행할 권한이 없습니다");
    expect(
      (screen.getByLabelText("creatorSupport.apply.projectTitle") as HTMLInputElement)
        .value,
    ).toBe("첫 단행본을 준비하는 학생 창작자");
  });
});
