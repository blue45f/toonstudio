// @vitest-environment jsdom
/**
 * 리서치 데스크 한글 검색 — 표면 적용 계약 테스트 (2026-10-06).
 * 한글로 입력하면 영문 변환어로 소스를 호출하고, 변환은 화면에 투명하게 표시된다.
 * 한글 네이티브 제공처는 변환 없이 원문 그대로 호출한다 (회귀 방지).
 * 모델 층은 이 테스트에서 사전 완결 입력만 써서 결정적으로 검증한다 —
 * 실모델 로드는 CI에서 돌리지 않는다 (research-query-translation.test.ts의 목 계약 참조).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentPacksPage } from "./ContentPacksPage";
import { GlobalBooksPage } from "./GlobalBooksPage";
import { OpenCreationPage } from "./OpenCreationPage";
import { ReferenceAssetsPage } from "./ReferenceAssetsPage";
import { AmbientCgPage, GbifPage, PolyHavenPage, WorksPage } from "./ResourceSearchPage";

vi.mock("./ProviderStatus", () => ({ ProviderStatus: () => null }));

const request = vi.fn<typeof fetch>();

function searchResponse(provider: string) {
  return Response.json({
    provider, page: 1, status: "ready", items: [], hasMore: false,
    message: "공식 제공처 응답", fetchedAt: "2026-10-06T00:00:00.000Z",
  });
}

function searchCalls(): URL[] {
  return request.mock.calls
    .map((call) => new URL(String(call[0]), "https://local.test"))
    .filter((url) => url.pathname.includes("/api/creator-resources/search"));
}

beforeEach(() => {
  localStorage.clear();
  request.mockReset().mockImplementation((input) => {
    const url = new URL(String(input), "https://local.test");
    if (url.hostname === "api.artic.edu") return Promise.resolve(Response.json({ data: [] }));
    if (url.pathname.includes("/api/creator-resources/providers")) return Promise.resolve(Response.json([]));
    return Promise.resolve(searchResponse(url.searchParams.get("provider") ?? ""));
  });
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
    locks: { request: async (_key: string, _options: unknown, operation: () => unknown) => operation() },
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ResourceSearchPage 계열 — 영문 인덱스 제공처", () => {
  it("Poly Haven: 한글 검색어를 영문 변환어로 호출하고 변환을 표시한다", async () => {
    render(<MemoryRouter initialEntries={["/research/3d-assets?q=숲속 오두막"]}><PolyHavenPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("q") === "forest cabin")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "숲속 오두막")).toBe(true);
    expect(screen.getByText(/‘숲속 오두막’ →/)).toBeTruthy();
    expect(screen.getByText(/‘forest cabin’/)).toBeTruthy();
  });

  it("Poly Haven: 영문 검색어는 변환 안내 없이 종전 그대로 호출한다", async () => {
    render(<MemoryRouter initialEntries={["/research/3d-assets?q=forest"]}><PolyHavenPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("q") === "forest")).toBe(true);
    });
    expect(screen.queryByText(/검색 중입니다/)).toBeNull();
    expect(screen.queryByLabelText("실제로 검색할 영문 검색어")).toBeNull();
  });
});

describe("ResourceSearchPage 계열 — 한글 네이티브 제공처 (변환 금지)", () => {
  it("카카오 도서: 한글 검색어를 원문 그대로 호출하고 변환 안내가 없다", async () => {
    render(<MemoryRouter initialEntries={["/research/works?q=만화 작법"]}><WorksPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "kakao" && url.searchParams.get("q") === "만화 작법")).toBe(true);
    });
    expect(screen.queryByText(/검색 중입니다/)).toBeNull();
    expect(screen.queryByLabelText("실제로 검색할 영문 검색어")).toBeNull();
  });
});

describe("GbifPage — 서버 별칭표 우선 (F-B14-1)", () => {
  // GBIF는 서버에 한글 종명 별칭표(여우→Vulpes vulpes)가 있어, 질의 전체가 별칭
  // 키와 일치하면 클라이언트 사전이 영문 일반명(fox)으로 먼저 바꾸면 안 된다 —
  // 영문 일반명은 GBIF 분류군 매칭에서 확정되지 않아 정당한 한글 검색이 0건이 된다.
  it("여우: 사전 변환 없이 원문 그대로 보내 서버 별칭 해석 경로에 도달한다", async () => {
    render(<MemoryRouter initialEntries={["/research/creatures?q=여우"]}><GbifPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "gbif" && url.searchParams.get("q") === "여우")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "fox")).toBe(true);
    expect(screen.queryByText(/검색 중입니다/)).toBeNull();
    expect(screen.queryByLabelText("실제로 검색할 영문 검색어")).toBeNull();
  });

  it("호랑이: 별칭 질의는 원문 그대로 보낸다", async () => {
    render(<MemoryRouter initialEntries={["/research/creatures?q=호랑이"]}><GbifPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "gbif" && url.searchParams.get("q") === "호랑이")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "tiger")).toBe(true);
  });

  it("별칭 범위 밖의 사슴은 종전대로 클라이언트 사전이 영문으로 보강한다", async () => {
    render(<MemoryRouter initialEntries={["/research/creatures?q=사슴"]}><GbifPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "gbif" && url.searchParams.get("q") === "deer")).toBe(true);
    });
    expect(screen.getByText(/‘사슴’ →/)).toBeTruthy();
  });
});

describe("AmbientCgPage — 한글 사전 변환 유지 (F-B14-1 대조군)", () => {
  it("나무: 서버 별칭표가 없는 제공처는 종전대로 사전 변환해 보낸다", async () => {
    render(<MemoryRouter initialEntries={["/research/material-assets?q=나무"]}><AmbientCgPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "ambientcg" && url.searchParams.get("q") === "tree")).toBe(true);
    });
    expect(screen.getByText(/‘나무’ →/)).toBeTruthy();
  });
});

describe("GlobalBooksPage — 글로벌 서지", () => {
  it("한글 주제어를 영문으로 변환해 Open Library·Google Books를 호출한다", async () => {
    render(<MemoryRouter initialEntries={["/research/books?q=중세 갑옷"]}><GlobalBooksPage /></MemoryRouter>);
    await waitFor(() => {
      const calls = searchCalls();
      expect(calls.some((url) => url.searchParams.get("provider") === "openlibrary" && url.searchParams.get("q") === "medieval armor")).toBe(true);
      expect(calls.some((url) => url.searchParams.get("provider") === "googlebooks" && url.searchParams.get("q") === "medieval armor")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "중세 갑옷")).toBe(true);
    expect(screen.getByText(/‘중세 갑옷’ →/)).toBeTruthy();
  });

  it("ISBN 질의는 변환 없이 그대로 조회한다", async () => {
    render(<MemoryRouter initialEntries={["/research/books?q=9784088820118"]}><GlobalBooksPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("q") === "9784088820118")).toBe(true);
    });
    expect(screen.queryByText(/검색 중입니다/)).toBeNull();
  });
});

describe("ReferenceAssetsPage — Met 레퍼런스", () => {
  it("한글 검색어를 영문 변환어로 Met에 보낸다", async () => {
    render(<MemoryRouter initialEntries={["/research/assets?q=숲속 오두막"]}><ReferenceAssetsPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("provider") === "met" && url.searchParams.get("q") === "forest cabin")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "숲속 오두막")).toBe(true);
  });
});

describe("ContentPacksPage — 제작 팩 자료 검색", () => {
  it("한글 검색어를 영문 변환어로 제공처에 보낸다", async () => {
    render(<MemoryRouter initialEntries={["/research/packs?q=숲"]}><ContentPacksPage /></MemoryRouter>);
    await waitFor(() => {
      expect(searchCalls().some((url) => url.searchParams.get("q") === "forest")).toBe(true);
    });
    expect(searchCalls().every((url) => url.searchParams.get("q") !== "숲")).toBe(true);
  });
});

describe("OpenCreationPage — 무료 자료 탐색", () => {
  it("사전이 못 푸는 한글은 원문으로 검색하되, 안내에서 영문으로 고쳐 재검색할 수 있다", async () => {
    render(<MemoryRouter><OpenCreationPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("찾을 소재"), { target: { value: "울창한 밀림" } });
    fireEvent.click(screen.getByRole("button", { name: "무료 자료 검색" }));
    // 자체 사전이 못 푸는 입력 — 원문 검색 + 공용 안내(모델 층은 미설치라 폴백)가 뜬다.
    await waitFor(() => expect(screen.getByText(/원문으로 검색합니다/)).toBeTruthy());
    const field = screen.getByLabelText("실제로 검색할 영문 검색어") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "dense jungle" } });
    // 제공처 보호 쿨다운(1.5초)이 지난 뒤 재검색한다 — 실제 사용 흐름과 같다.
    await new Promise((resolve) => { setTimeout(resolve, 1600); });
    fireEvent.click(screen.getByRole("button", { name: "이 검색어로 다시 검색" }));
    await waitFor(() => {
      const articQueries = request.mock.calls
        .map((call) => String(call[0]))
        .filter((url) => {
          try {
            return new URL(url).hostname === "api.artic.edu";
          } catch {
            return false;
          }
        })
        .map((url) => new URL(url).searchParams.get("q"));
      expect(articQueries).toContain("dense jungle");
    });
  });
});
