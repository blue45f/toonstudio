// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { PromoVideoLibraryPage } from "./PromoVideoLibraryPage";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("PromoVideoLibraryPage — 20종 REA 3-Mode 뷰 스위처·필터·허브 서브탭·6단계 파이프라인", () => {
  it("204개 원본과 쇼츠 49개를 유지하며 명시적 재생 전에는 미디어를 선로딩하지 않는다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/promo-library"]}><PromoVideoLibraryPage /></MemoryRouter>);
    const videos = Array.from(container.querySelectorAll("video"));
    expect(videos).toHaveLength(204);
    expect(container.querySelectorAll("#promo-category-shorts [data-promo-video]")).toHaveLength(49);
    expect(videos.every((video) => video.preload === "none" && !video.hasAttribute("src"))).toBe(true);
    expect(container.querySelectorAll('a[download][href$=".mp4"]')).toHaveLength(204);
  });

  it("맥락형 서브탭과 3-Mode 뷰 스위처(card, poster, list), 화면 비율 필터, 20종 REA 기준표 및 6단계 창작 동선을 렌더링한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/promo-library"]}>
        <PromoVideoLibraryPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("홍보 메뉴", { selector: "summary" }));
    const subnav = screen.getByRole("navigation", {
      name: "영상 · 홍보 · 컷츠 허브",
    });
    expect(subnav).toBeTruthy();

    const root = container.querySelector(".promo-library");
    expect(root?.getAttribute("data-view-mode")).toBe("card");

    const reaItems = container.querySelectorAll("[data-rea-platform]");
    expect(reaItems).toHaveLength(28);

    fireEvent.click(screen.getByText("다운로드·활용 안내", { selector: "summary" }));
    fireEvent.click(screen.getByText("제작·탐색 참고 자료", { selector: "summary" }));
    const pipelineNav = screen.getByRole("navigation", {
      name: "창작·예고편·배포 6단계 통합 동선",
    });
    expect(pipelineNav).toBeTruthy();

    const presetNav = screen.getByRole("navigation", {
      name: "경쟁사 표준 탐색·랭킹 바로가기",
    });
    expect(presetNav).toBeTruthy();

    fireEvent.click(screen.getByText("보기 설정", { selector: "summary" }));
    const posterBtn = screen.getByRole("button", {
      name: "포스터·쇼츠 그리드",
    });
    fireEvent.click(posterBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("poster");
    expect(posterBtn.getAttribute("aria-pressed")).toBe("true");

    const listBtn = screen.getByRole("button", { name: "컴팩트 리스트" });
    fireEvent.click(listBtn);
    expect(root?.getAttribute("data-view-mode")).toBe("list");

    const ratio = screen.getByRole("combobox", { name: "화면 비율 필터" });
    fireEvent.change(ratio, { target: { value: "vertical-9-16" } });
    expect((ratio as HTMLSelectElement).value).toBe("vertical-9-16");
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeTruthy();
  });
});

function NavigationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="current-address">{`${location.pathname}${location.search}${location.hash}`}</output><button type="button" onClick={() => navigate("/other")}>다른 화면</button><button type="button" onClick={() => navigate(-1)}>주소 뒤로</button><button type="button" onClick={() => navigate(1)}>주소 앞으로</button><button type="button" onClick={() => navigate("/promo-library?from=external&promo-q=%EA%B7%B8%EB%A6%AC%EA%B3%A0%2C+%EC%83%89%EA%B9%8C%EC%A7%80&promo-view=list")}>외부 조건 주소</button></>;
}

function renderPromo(address = "/promo-library") {
  return render(<MemoryRouter initialEntries={[address]}><NavigationControls /><Routes><Route path="/promo-library" element={<PromoVideoLibraryPage />} /><Route path="/other" element={<h1>다른 화면 예시</h1>} /></Routes></MemoryRouter>);
}

const currentAddress = () => new URL(screen.getByTestId("current-address").textContent ?? "", "https://example.test");
const search = () => screen.getByRole<HTMLInputElement>("searchbox", { name: "영상 제목·설명·쓰는 곳으로 검색" });

describe("홍보 영상 찾기·복귀와 필터 경계", () => {
  it("검색·분류·비율은 목록보다 앞에 있고 개념영상 안내와 기존 원본은 유지한다", () => {
    const { container } = renderPromo();
    const form = screen.getByRole("form", { name: "홍보 영상 찾기" });
    const section = container.querySelector("#promo-category-shorts");
    if (!section) throw new Error("쇼츠 목록 누락");
    expect(form.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "영상 분류" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "화면 비율 필터" })).toBeTruthy();
    expect(screen.getByText("생성형 AI 개념 영상입니다. 실제 제품 화면과 다를 수 있어요.")).toBeTruthy();
    const first = container.querySelector('[data-promo-video]');
    const title = first?.querySelector("h3");
    const video = first?.querySelector("video");
    if (!title || !video) throw new Error("첫 영상 제목 또는 미리보기 누락");
    expect(title.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('a[download][href$=".mp4"]')).toHaveLength(204);
  });

  it("빠른 입력과 즉시 Enter에서도 실제 입력을 보존하고 관련 없는 query·hash를 유지한다", () => {
    renderPromo("/promo-library?from=guide&campaign=keep#usage-help");
    const input = search();
    fireEvent.change(input, { target: { value: "그리고, 색까지" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    const submitted = new Event("submit", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("form", { name: "홍보 영상 찾기" }), submitted);
    expect(submitted.defaultPrevented).toBe(true);
    expect(input.value).toBe("그리고, 색까지");
    expect(currentAddress().searchParams.get("promo-q")).toBe(input.value);
    expect(currentAddress().searchParams.get("from")).toBe("guide");
    expect(currentAddress().searchParams.get("campaign")).toBe("keep");
    expect(currentAddress().hash).toBe("#usage-help");
    expect(screen.getByText("1 / 204편")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "그리고, 색까지" })).toBeTruthy();
  });

  it("조합 중 Enter는 주소를 제출하지 않고 조합 완료의 실제 문자열을 반영한다", () => {
    renderPromo("/promo-library?from=ime");
    const input = search();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "그리고" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });
    fireEvent.submit(screen.getByRole("form", { name: "홍보 영상 찾기" }));
    expect(currentAddress().searchParams.has("promo-q")).toBe(false);
    expect(input.value).toBe("그리고");
    fireEvent.change(input, { target: { value: "그리고, 색까지" } });
    fireEvent.compositionEnd(input);
    expect(currentAddress().searchParams.get("promo-q")).toBe("그리고, 색까지");
    expect(currentAddress().searchParams.get("from")).toBe("ime");
    expect(input.value).toBe("그리고, 색까지");
  });

  it("0결과와 카테고리 이동 충돌을 정직하게 표시하고 명시적 초기화 전 검색어를 지우지 않는다", () => {
    const { container } = renderPromo("/promo-library?from=kept#promo-category-shorts");
    fireEvent.change(search(), { target: { value: "그리고, 색까지" } });
    fireEvent.change(screen.getByRole("combobox", { name: "영상 분류" }), { target: { value: "brand" } });
    expect(search().value).toBe("그리고, 색까지");
    expect(currentAddress().searchParams.get("promo-q")).toBe("그리고, 색까지");
    expect(currentAddress().hash).toBe("");
    expect(screen.getByRole("heading", { name: "조건에 맞는 영상이 없어요" })).toBeTruthy();
    expect(screen.getByText("0 / 204편")).toBeTruthy();
    expect(container.querySelectorAll('[data-promo-video]')).toHaveLength(0);
    fireEvent.click(screen.getByText("다운로드·활용 안내", { selector: "summary" }));
    const jump = screen.getByRole("navigation", { name: "카테고리 바로가기" });
    expect(within(jump).queryAllByRole("link")).toHaveLength(0);
    expect(jump.querySelectorAll('[aria-disabled="true"]')).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(search().value).toBe("");
    expect(currentAddress().search).toBe("?from=kept");
    expect(container.querySelectorAll('[data-promo-video]')).toHaveLength(204);
    expect(container.querySelectorAll('#promo-category-shorts [data-promo-video]')).toHaveLength(49);
  });

  it("최초 외부 hash·유효한 전용 주소를 복원하고 허용되지 않은 모델값은 전체 기본값으로 읽는다", () => {
    const { container } = renderPromo("/promo-library?from=share&promo-category=not-a-category&promo-ratio=unknown&promo-view=unknown#promo-category-brand");
    expect(container.querySelectorAll('[data-promo-video]')).toHaveLength(204);
    expect(currentAddress().hash).toBe("#promo-category-brand");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "영상 분류" }).value).toBe("all");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "화면 비율 필터" }).value).toBe("all");
    fireEvent.change(screen.getByRole("combobox", { name: "영상 분류" }), { target: { value: "brand" } });
    expect(currentAddress().searchParams.get("promo-category")).toBe("brand");
    expect(currentAddress().searchParams.has("promo-ratio")).toBe(false);
    expect(currentAddress().searchParams.has("promo-view")).toBe(false);
    expect(currentAddress().hash).toBe("#promo-category-brand");
    expect(container.querySelectorAll('[data-promo-video]')).toHaveLength(51);
  });

  it("외부 주소 변경·Back·Forward와 페이지 왕복에서 검색·보기 조건을 복원한다", async () => {
    const { container } = renderPromo("/promo-library?from=first");
    fireEvent.click(screen.getByRole("button", { name: "외부 조건 주소" }));
    await waitFor(() => expect(search().value).toBe("그리고, 색까지"));
    expect(container.querySelector('.promo-library')?.getAttribute("data-view-mode")).toBe("list");
    fireEvent.click(screen.getByRole("button", { name: "주소 뒤로" }));
    await waitFor(() => expect(search().value).toBe(""));
    expect(container.querySelectorAll('[data-promo-video]')).toHaveLength(204);
    fireEvent.click(screen.getByRole("button", { name: "주소 앞으로" }));
    await waitFor(() => expect(search().value).toBe("그리고, 색까지"));
    fireEvent.click(screen.getByRole("button", { name: "다른 화면" }));
    expect(screen.getByRole("heading", { name: "다른 화면 예시" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "주소 뒤로" }));
    await waitFor(() => expect(search().value).toBe("그리고, 색까지"));
    expect(container.querySelector('.promo-library')?.getAttribute("data-view-mode")).toBe("list");
    expect(currentAddress().searchParams.get("from")).toBe("external");
  });

  it("보기·활용·관련 메뉴를 닫아도 필터를 유지하고 Escape 초점이 각 이름으로 돌아간다", () => {
    const { container } = renderPromo();
    fireEvent.change(search(), { target: { value: "그리고, 색까지" } });
    const viewSummary = screen.getByText("보기 설정", { selector: "summary" });
    fireEvent.click(viewSummary);
    const poster = screen.getByRole("button", { name: "포스터·쇼츠 그리드" });
    fireEvent.click(poster); poster.focus();
    fireEvent.keyDown(poster, { key: "Escape" });
    expect(viewSummary.closest("details")?.open).toBe(false);
    expect(document.activeElement).toBe(viewSummary);
    expect(search().value).toBe("그리고, 색까지");
    expect(currentAddress().searchParams.get("promo-view")).toBe("poster");
    const helpSummary = screen.getByText("다운로드·활용 안내", { selector: "summary" });
    fireEvent.click(helpSummary);
    expect(screen.getByRole("navigation", { name: "영상·홍보 바로가기" })).toBeTruthy();
    const originalLink = container.querySelector<HTMLAnchorElement>('a[download]');
    expect(originalLink?.getAttribute("href")).toBe("/brand/promo-shorts/shorts-1-drawing-autocolor.mp4");
    expect(container.querySelector("video")?.hasAttribute("src")).toBe(false);
    expect(screen.getByText(/실제 제품 화면 캡처가 아니라/)).toBeTruthy();
  });

  it("영문에서도 분류·비율·결과와 원본 동선을 같은 의미로 제공한다", () => {
    useI18n.getState().setLang("en");
    renderPromo("/promo-library?promo-category=shorts&promo-ratio=vertical-9-16");
    expect(screen.getByRole("heading", { name: "Promo Video Library" })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Clip category" }).value).toBe("shorts");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Aspect ratio filter" }).value).toBe("vertical-9-16");
    expect(screen.getByText("49 / 204 clips")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Download original" })).toHaveLength(49);
  });
});
