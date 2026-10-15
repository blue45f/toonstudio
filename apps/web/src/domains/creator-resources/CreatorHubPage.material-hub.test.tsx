// @vitest-environment jsdom
/**
 * /research 에 올라간 "문장으로 소재 찾기" 패널이 리서치 데스크와 함께 잘 동작하는지 확인한다.
 * 패널 자체의 상태·접근성 회귀는 material-hub/MaterialSentencePanel.test.tsx 가 맡는다.
 */
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorHubPage } from "./CreatorHubPage";
import { hubItem, providerParam, searchBody, searchRequests } from "./material-hub/material-hub.test-fixtures";

import type { CreatorHubPageProps } from "./CreatorHubPage";
import type { CreatorWorkspace } from "@/shared/lib/creator-resources";

import { creatorWorkspaceStorageKey } from "@/shared/lib/creator-workspace-persistence";

const GUEST_WORKSPACE_KEY = creatorWorkspaceStorageKey("guest");

vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => <p>provider-status-loaded</p> }));

// 페이지 전체를 그리는 테스트라 동시 작업이 많은 머신에서는 비동기 대기 기본 1초가 빠듯하다.
configure({ asyncUtilTimeout: 4000 });

const request = vi.fn<typeof fetch>();

function renderPage(entry = "/research", props: CreatorHubPageProps = {}) {
  return render(<MemoryRouter initialEntries={[entry]}><CreatorHubPage {...props} /></MemoryRouter>);
}

const sentenceBox = () => screen.getByRole("searchbox", { name: /찾고 싶은 장면이나 소재를 문장으로/u }) as HTMLInputElement;
const savedIds = () => (JSON.parse(localStorage.getItem(GUEST_WORKSPACE_KEY) ?? "{\"saved\":[]}") as CreatorWorkspace).saved.map((item) => item.id);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  request.mockReset().mockImplementation((input) => {
    const url = new URL(String(input), "https://local.test");
    if (!url.pathname.includes("/creator-resources/search")) return Promise.resolve(Response.json([]));
    const provider = providerParam(url.searchParams);
    return Promise.resolve(searchBody(provider, [hubItem(provider, 1, { title: "Brick wall" })]));
  });
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("리서치 데스크의 문장 허브", () => {
  it("기존 검색 바로 아래 본문 맨 앞에 놓이고, 화면을 여는 것만으로는 어떤 제공처도 부르지 않는다", () => {
    renderPage();
    const panel = screen.getByRole("heading", { name: "문장으로 소재 찾기", level: 2 }).closest("section")!;
    expect(panel).toBeTruthy();
    // 기존 시각 레퍼런스 검색은 그대로 남아 있고, 문장 허브는 그 뒤 본문의 첫 구역이다.
    const legacy = screen.getByRole("searchbox", { name: "시각 레퍼런스 검색" });
    expect(legacy.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const guide = screen.getByText("여기는 리서치 데스크").closest("section")!;
    expect(panel.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("?mq= 로 들어오면 문장만 채우고 찾지 않는다", () => {
    renderPage("/research?mq=%EB%B9%84%20%EC%98%A4%EB%8A%94%20%EA%B3%A8%EB%AA%A9");
    expect(sentenceBox().value).toBe("비 오는 골목");
    expect(request).not.toHaveBeenCalled();
  });

  it("문장을 제출하면 그때만 공식 제공처 검색 API 를 부른다", async () => {
    renderPage();
    fireEvent.change(sentenceBox(), { target: { value: "비 오는 골목 야경" } });
    expect(request).not.toHaveBeenCalled();
    fireEvent.submit(sentenceBox().closest("form")!);
    await screen.findAllByRole("heading", { name: "Brick wall", level: 5 });
    const calls = searchRequests(request.mock.calls);
    expect(calls.map((params) => params.get("provider"))).toEqual(["polyhaven", "ambientcg"]);
    expect(request.mock.calls.every((call) => String(call[0]).includes("/creator-resources/search"))).toBe(true);
  });

  it("허브에서 담은 자료가 리서치 데스크의 저장 보드에 들어가고, 다시 누르면 빠진다", async () => {
    renderPage();
    fireEvent.change(sentenceBox(), { target: { value: "비 오는 골목 야경" } });
    fireEvent.submit(sentenceBox().closest("form")!);
    const poly = (await screen.findByRole("heading", { name: "Poly Haven", level: 4 })).closest("section")!;
    const add = await within(poly).findByRole("button", { name: "Brick wall 장면 보드에 담기" });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(add);
    await waitFor(() => expect(savedIds()).toEqual(["polyhaven:item-1"]));
    await waitFor(() => expect(add.getAttribute("aria-pressed")).toBe("true"));

    fireEvent.click(screen.getByRole("tab", { name: /저장 보드/u }));
    const board = screen.getByRole("heading", { name: "저장한 자료 찾기" }).closest("section")!;
    expect(within(board).getByRole("button", { name: "Brick wall 저장 해제" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Brick wall 장면 보드에 담기" })[0]!);
    await waitFor(() => expect(savedIds()).toEqual([]));
  });

  it("AI 다듬기는 앱 계층이 주입했을 때만 보이고, 누를 때만 호출되며 자동으로 찾지 않는다", async () => {
    const view = renderPage();
    expect(screen.queryByRole("button", { name: "AI로 다듬기" })).toBeNull();
    view.unmount();

    const refine = vi.fn(async () => "비 오는 골목 밤 풍경");
    renderPage("/research", { refineMaterialSentence: refine });
    fireEvent.change(sentenceBox(), { target: { value: "비 와서 으스스한 동네 뒷길" } });
    expect(refine).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "AI로 다듬기" }));
    await waitFor(() => expect(sentenceBox().value).toBe("비 오는 골목 밤 풍경"));
    expect(refine).toHaveBeenCalledTimes(1);
    expect(refine).toHaveBeenCalledWith("비 와서 으스스한 동네 뒷길", expect.any(AbortSignal));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText(/이 문장만 AI\(무료 공유 풀 또는 내가 연결한 AI\)로 보내요/u)).toBeTruthy();
  });
});
