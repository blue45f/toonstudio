// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoverShelves } from "./DiscoverShelves";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/lib/i18n", async (importOriginal) => ({ ...await importOriginal<typeof import("@/shared/lib/i18n")>(), useT: () => () => "재시도" }));
afterEach(cleanup);

describe("탐색의 간결한 오류 안내", () => {
  it("실패 안내와 재시도를 보존하고 탐색 전용 레이아웃을 사용한다", () => {
    const retry = vi.fn();
    render(<DiscoverShelves snapshot={null} loading={false} error="offline" onRetry={retry} />);
    const alert = screen.getByRole("alert");
    expect(alert.classList.contains("discover-hub-error")).toBe(true);
    expect(alert.textContent).toContain("추천 작품을 불러오지 못했어요");
    expect(alert.textContent).toContain("검색과 아래 탐색 도구는 그대로 쓸 수 있어요");
    fireEvent.click(within(alert).getByRole("button", { name: "재시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("로딩 상태에는 오류 안내 대신 진행 상태를 표시한다", () => {
    render(<DiscoverShelves snapshot={null} loading error={null} onRetry={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
});
