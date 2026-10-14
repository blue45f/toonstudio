// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketOwnedResourcesPage } from "./MarketOwnedResourcesPage";

import type { CreatorMarketplaceOwnedRelease } from "@/shared/lib/creator-marketplace-resource-contract";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), list: vi.fn(), delist: vi.fn(), relist: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: mocks.session }));
vi.mock("@/platform/creator-marketplace-client", () => ({
  listCreatorMarketplaceOwnedHeads: mocks.list,
  deleteCreatorMarketplaceResource: mocks.delist,
  relistCreatorMarketplaceResource: mocks.relist,
}));

function release(delisted: boolean): CreatorMarketplaceOwnedRelease {
  return {
    resource: { ...CREATOR_MARKETPLACE_STARTER_RECORDS[0]!, isOwner: true },
    releaseOrdinal: 1,
    hidden: false,
    delistedAt: delisted ? "2026-09-08T00:00:00.000Z" : null,
    packageModeration: { state: "active", revision: 0, hiddenAt: null },
  };
}

function page(delisted: boolean) {
  return { items: [release(delisted)], limit: 20, hasMore: false, nextCursor: null };
}

function session(userId: string) {
  return { ready: true, status: "authenticated", data: { user: { id: userId } } };
}

function view() {
  return <MemoryRouter><MarketOwnedResourcesPage /></MemoryRouter>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockReturnValue(session("owner-a"));
  mocks.delist.mockResolvedValue(undefined);
  mocks.relist.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("MarketOwnedResourcesPage listing confirmation", () => {
  it.each([false, true])("preserves the server-confirmed operation through refresh (delisted=%s)", async (delisted) => {
    mocks.list.mockResolvedValueOnce(page(delisted)).mockResolvedValue(page(!delisted));
    render(view());
    fireEvent.click(await screen.findByRole("button", {
      name: delisted ? "재공개" : "공개 목록에서 내리기",
    }));

    await screen.findByRole("button", { name: delisted ? "공개 목록에서 내리기" : "재공개" });
    expect(screen.getByRole("status").textContent).toContain(
      delisted ? "공개 목록에 다시 올렸습니다." : "공개 목록에서 내렸습니다.",
    );
    expect(delisted ? mocks.relist : mocks.delist).toHaveBeenCalledWith(release(delisted).resource.id);
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retains a successful mutation notice even when the follow-up read fails", async () => {
    mocks.list.mockResolvedValueOnce(page(false)).mockRejectedValue(new Error("offline"));
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "공개 목록에서 내리기" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("status").textContent).toContain("공개 목록에서 내렸습니다.");
  });

  it("does not announce success or refresh another account after a late mutation", async () => {
    const pending = Promise.withResolvers<void>();
    mocks.delist.mockReturnValue(pending.promise);
    mocks.list.mockResolvedValueOnce(page(false)).mockResolvedValue({ ...page(false), items: [] });
    const { rerender } = render(view());
    fireEvent.click(await screen.findByRole("button", { name: "공개 목록에서 내리기" }));
    mocks.session.mockReturnValue(session("owner-b"));
    rerender(view());
    await act(async () => { pending.resolve(); await pending.promise; });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("heading", { name: release(false).resource.name })).toBeNull();
  });

  it("clears the old account confirmation while its refresh is still pending", async () => {
    const pending = Promise.withResolvers<ReturnType<typeof page>>();
    mocks.list.mockResolvedValueOnce(page(false)).mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ...page(false), items: [] });
    const { rerender } = render(view());
    fireEvent.click(await screen.findByRole("button", { name: "공개 목록에서 내리기" }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status").textContent).toContain("공개 목록에서 내렸습니다.");
    mocks.session.mockReturnValue(session("owner-b"));
    rerender(view());
    await act(async () => { pending.resolve(page(true)); await pending.promise; });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "재공개" })).toBeNull();
  });

  it("shows only the error when the server rejects the listing change", async () => {
    mocks.list.mockResolvedValue(page(false));
    mocks.delist.mockRejectedValue(new Error("denied"));
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "공개 목록에서 내리기" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});

function twoItemPage() {
  const base = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
  const listed: CreatorMarketplaceOwnedRelease = {
    resource: { ...base, id: "res-listed", name: "공개 에셋", isOwner: true },
    releaseOrdinal: 1,
    hidden: false,
    delistedAt: null,
    packageModeration: { state: "active", revision: 0, hiddenAt: null },
  };
  const delisted: CreatorMarketplaceOwnedRelease = {
    resource: { ...base, id: "res-delisted", name: "비공개 에셋", isOwner: true },
    releaseOrdinal: 1,
    hidden: false,
    delistedAt: "2026-09-08T00:00:00.000Z",
    packageModeration: { state: "active", revision: 0, hiddenAt: null },
  };
  return { items: [listed, delisted], limit: 20, hasMore: false, nextCursor: null };
}

describe("MarketOwnedResourcesPage bulk processing", () => {
  it("relist bulk-runs only the selected delisted items and reports the count", async () => {
    mocks.list.mockResolvedValue(twoItemPage());
    render(view());
    fireEvent.click(await screen.findByRole("checkbox", { name: "비공개 에셋 선택" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "공개 에셋 선택" }));

    const relistButton = screen.getByRole("button", { name: "선택 항목 재공개 (1)" });
    expect(screen.getByRole("button", { name: "선택 항목 내리기 (1)" })).toBeTruthy();
    fireEvent.click(relistButton);

    await waitFor(() => expect(mocks.relist).toHaveBeenCalledTimes(1));
    expect(mocks.relist).toHaveBeenCalledWith("res-delisted");
    expect(mocks.delist).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("선택한 에셋 1개를 공개 목록에 다시 올렸습니다."),
    );
  });

  it("unlist bulk requires a second confirming click", async () => {
    mocks.list.mockResolvedValue(twoItemPage());
    render(view());
    fireEvent.click(await screen.findByRole("checkbox", { name: "선택 가능한 항목 전체 선택" }));

    fireEvent.click(screen.getByRole("button", { name: "선택 항목 내리기 (1)" }));
    expect(mocks.delist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "정말 1개를 내릴까요?" }));

    await waitFor(() => expect(mocks.delist).toHaveBeenCalledTimes(1));
    expect(mocks.delist).toHaveBeenCalledWith("res-listed");
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("선택한 에셋 1개를 공개 목록에서 내렸습니다."),
    );
  });

  it("reports partial bulk failure in the confirmation and keeps going", async () => {
    const bulkPage = twoItemPage();
    bulkPage.items = bulkPage.items.map((item) => ({
      ...item,
      delistedAt: "2026-09-08T00:00:00.000Z",
    }));
    mocks.list.mockResolvedValue(bulkPage);
    mocks.relist
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    render(view());
    fireEvent.click(await screen.findByRole("checkbox", { name: "선택 가능한 항목 전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 항목 재공개 (2)" }));

    await waitFor(() => expect(mocks.relist).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("1개는 실패해 상태가 그대로입니다."),
    );
  });
});
