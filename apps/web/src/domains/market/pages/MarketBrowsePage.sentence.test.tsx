// @vitest-environment jsdom
/**
 * 마켓 "문장으로 찾기": 계획기가 읽은 조건이 기존 URL 필터(q·kind·license·tag)로만 반영되는지 확인한다.
 * 새 API 는 없으므로 useMarketResources 의 입력(= URL 필터)이 바뀌는 순간이 곧 "검색이 일어나는 순간"이다.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketResources } from "../hooks/use-market-resources";

import { MarketBrowsePage } from "./MarketBrowsePage";

import type { MarketResourcesPage } from "../hooks/use-market-resources";

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../components/MarketResourceCard", () => ({
  MarketResourceCard: ({ record }: { record: { id: string } }) => <div data-testid={`resource-${record.id}`} />,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useResources = vi.mocked(useMarketResources);
const PUBLISHER = "123e4567-e89b-12d3-a456-426614174000";

function marketPage(): MarketResourcesPage {
  return {
    items: [],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    stale: false,
    staleSavedAt: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 검색 쿼리">{location.search}</output>;
}

function renderPage(entry = "/market/browse") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MarketBrowsePage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const params = () => new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
const keywordBox = () => screen.getByRole("searchbox", { name: "마켓 리소스 검색" }) as HTMLInputElement;
const sentenceBox = () => screen.getByRole("textbox", { name: "찾는 자료를 문장으로 적기" }) as HTMLInputElement;
const lastQuery = () => useResources.mock.lastCall?.[0];

function openSentence() {
  fireEvent.click(screen.getByRole("button", { name: "문장으로 찾기" }));
}
function applySentence(value: string) {
  fireEvent.change(sentenceBox(), { target: { value } });
  fireEvent.submit(screen.getByRole("search", { name: "문장으로 마켓 찾기" }));
}

beforeEach(() => {
  useResources.mockReturnValue(marketPage());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("마켓 문장으로 찾기", () => {
  it("접힌 채로 시작하고, 기존 키워드 검색과 이름이 겹치지 않는다", () => {
    renderPage();
    expect(screen.queryByRole("search", { name: "문장으로 마켓 찾기" })).toBeNull();
    expect(keywordBox()).toBeTruthy();
    openSentence();
    expect(sentenceBox()).not.toBe(keywordBox());
  });

  it("입력하는 동안에는 URL 도 마켓 조회 조건도 바뀌지 않는다", () => {
    renderPage();
    openSentence();
    const before = lastQuery();
    fireEvent.change(sentenceBox(), { target: { value: "저작권 걱정 없는 학교 배경" } });
    expect(params().toString()).toBe("");
    expect(lastQuery()).toEqual(before);
  });

  it("제출하면 읽은 조건이 기존 URL 필터로 반영되고 마켓 조회 조건이 바뀐다", () => {
    renderPage();
    openSentence();
    applySentence("저작권 걱정 없는 학교 배경");
    expect(Object.fromEntries(params())).toEqual({ q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교" });
    expect(lastQuery()).toEqual(expect.objectContaining({ search: "배경", kind: "asset", license: "cc0-1.0", tag: "학교", sort: "relevance" }));
  });

  it("반영된 조건은 페이지의 '적용된 조건' 칩으로도 보이고, 거기서 하나씩 뺄 수 있다", () => {
    renderPage();
    openSentence();
    applySentence("저작권 걱정 없는 학교 배경");
    const applied = screen.getByLabelText("적용된 조건");
    expect(within(applied).getByRole("button", { name: "종류: 2D 에셋 필터 제거" })).toBeTruthy();
    expect(within(applied).getByRole("button", { name: "#학교 태그 필터 제거" })).toBeTruthy();
    expect(within(applied).getByRole("button", { name: "CC0 1.0 필터 제거" })).toBeTruthy();
    fireEvent.click(within(applied).getByRole("button", { name: "CC0 1.0 필터 제거" }));
    expect(params().get("license")).toBeNull();
    expect(params().get("tag")).toBe("학교");
  });

  it("키워드 입력창도 읽은 검색어로 맞춰진다", () => {
    renderPage();
    openSentence();
    applySentence("비 오는 골목 야경");
    expect(keywordBox().value).toBe("골목 야경");
  });

  it("빼낸 조건은 URL 에 오르지 않는다", () => {
    renderPage();
    openSentence();
    fireEvent.change(sentenceBox(), { target: { value: "저작권 걱정 없는 학교 배경" } });
    fireEvent.click(screen.getByRole("button", { name: "라이선스 CC0 1.0 조건 빼기" }));
    fireEvent.click(screen.getByRole("button", { name: "검색어 “배경” 조건 빼기" }));
    fireEvent.submit(screen.getByRole("search", { name: "문장으로 마켓 찾기" }));
    expect(Object.fromEntries(params())).toEqual({ kind: "asset", tag: "학교" });
    expect(lastQuery()).toEqual(expect.objectContaining({ kind: "asset", tag: "학교", sort: "newest", search: undefined }));
  });

  it("새 문장은 이전 조건을 통째로 바꾸고, 배급자·보기 방식은 건드리지 않는다", () => {
    renderPage(`/market/browse?q=old&sort=relevance&kind=palette&license=cc-by-4.0&tag=소품&publisher=${PUBLISHER}&layout=list`);
    openSentence();
    applySentence("G펜 브러시 CC0");
    expect(Object.fromEntries(params())).toEqual({ kind: "brush", license: "cc0-1.0", publisher: PUBLISHER, layout: "list" });
    expect(lastQuery()).toEqual(expect.objectContaining({ kind: "brush", license: "cc0-1.0", publisher: PUBLISHER, sort: "newest", search: undefined, tag: undefined }));
  });

  it("읽을 수 없는 문장은 URL 을 바꾸지 않는다", () => {
    renderPage("/market/browse?kind=brush");
    openSentence();
    applySentence("!!!");
    expect(params().toString()).toBe("kind=brush");
    expect(screen.getByRole("alert").textContent).toContain("읽을 수 있는 조건이 없어서 적용하지 않았어요");
  });

  it("키워드 입력의 대기 중인 반영이 문장 조건을 덮어쓰지 않는다", () => {
    vi.useFakeTimers();
    renderPage();
    fireEvent.change(keywordBox(), { target: { value: "pending" } });
    openSentence();
    applySentence("저작권 걱정 없는 학교 배경");
    act(() => vi.advanceTimersByTime(400));
    expect(params().get("q")).toBe("배경");
    expect(keywordBox().value).toBe("배경");
  });

  it("주소에 이미 있던 중복·잘못된 조건은 문장 조건이 대신 정리한다", () => {
    renderPage("/market/browse?kind=brush&kind=asset&license=nope");
    expect(screen.getByRole("alert").textContent).toContain("주소의 검색 조건을 적용할 수 없어요");
    openSentence();
    applySentence("G펜 브러시 CC0");
    expect(Object.fromEntries(params())).toEqual({ kind: "brush", license: "cc0-1.0" });
    expect(screen.queryByText("주소의 검색 조건을 적용할 수 없어요.")).toBeNull();
  });
});
