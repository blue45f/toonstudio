// @vitest-environment jsdom
/**
 * 문장으로 소재 찾기 허브 회귀 테스트.
 *
 * 핵심 계약: 제공처(/api/creator-resources/search)는 사용자의 명시적 행동(제출·다시 시도·더 보기·다른 제공처 찾기·도시 고르기·
 * 바꾼 대로 다시 찾기)으로만 불린다. 입력 중·칩 조정·예시/최근 검색 클릭·화면 표시만으로는 어떤 요청도 나가지 않는다.
 */
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MATERIAL_DROP_KEY } from "../material-discovery/material-search-ux";
import { MaterialSentencePanel } from "./MaterialSentencePanel";
import { hubItem, providerParam, readBlob, searchBody, searchRequests } from "./material-hub.test-fixtures";

import type { MaterialSentencePanelProps } from "./MaterialSentencePanel";
import type { CreatorResource, ResourceProvider } from "@/shared/lib/creator-resources";

vi.mock("../ProviderStatus", () => ({ ProviderStatus: () => <p>provider-status-loaded</p> }));

// 여러 작업이 한 머신에서 동시에 도는 환경에서도 비동기 대기가 흔들리지 않게 기본 1초를 넉넉히 늘린다.
configure({ asyncUtilTimeout: 4000 });

type Handler = (provider: ResourceProvider, query: string, page: number) => Response | Promise<Response>;

const request = vi.fn<typeof fetch>();
let handler: Handler;

const defaultHandler: Handler = (provider, _query, page) => searchBody(provider, [hubItem(provider, 1), hubItem(provider, 2)], { page });

function routeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input), "https://local.test");
  if (!url.pathname.includes("/creator-resources/search")) return Promise.resolve(Response.json([]));
  return Promise.resolve(handler(providerParam(url.searchParams), url.searchParams.get("q") ?? "", Number(url.searchParams.get("page") ?? 1)));
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPanel(props: Partial<MaterialSentencePanelProps> = {}, entry = "/research") {
  const onToggleSaved = vi.fn<(item: CreatorResource) => void>();
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <MaterialSentencePanel saved={[]} saveDisabled={false} onToggleSaved={onToggleSaved} {...props} />
      <LocationProbe />
    </MemoryRouter>,
  );
  return { ...view, onToggleSaved };
}

const sentenceInput = () => screen.getByRole("searchbox", { name: /찾고 싶은 장면이나 소재를 문장으로/u }) as HTMLInputElement;
const form = () => screen.getByRole("search", { name: "문장으로 소재 찾기" });
const callsTo = () => searchRequests(request.mock.calls);

function type(value: string) {
  fireEvent.change(sentenceInput(), { target: { value } });
}
function submit(value?: string) {
  if (value !== undefined) type(value);
  fireEvent.submit(form());
}
async function searchAndWait(value: string) {
  submit(value);
  await waitFor(() => expect(screen.queryByText("공식 제공처에서 자료를 확인하고 있어요…")).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  handler = defaultHandler;
  request.mockReset().mockImplementation(routeFetch);
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("제공처 호출은 명시적 행동으로만 일어난다", () => {
  it("화면을 열거나, 입력하거나, 예시·최근 검색·칩을 눌러도 제공처를 부르지 않는다", async () => {
    renderPanel();
    expect(request).not.toHaveBeenCalled();

    type("비 오는 골목 야경");
    expect(await screen.findByRole("heading", { name: "이렇게 이해했어요" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "조선시대 한복 입은 인물 포즈" }));
    expect(sentenceInput().value).toBe("조선시대 한복 입은 인물 포즈");
    fireEvent.click(within(screen.getByRole("group", { name: "읽은 단서" })).getByRole("button", { name: /^한복/u }));
    fireEvent.click(within(screen.getByRole("group", { name: "찾는 종류" })).getAllByRole("button")[0]!);
    expect(request).not.toHaveBeenCalled();
  });

  it("입력 중 미리보기는 계획기만 돌려 읽은 종류·단서·검색어를 보여 준다", async () => {
    renderPanel();
    type("비 오는 골목 야경");
    const kinds = screen.getByRole("group", { name: "찾는 종류" });
    expect(within(kinds).getByRole("button", { name: /3D·재질 소재/u }).getAttribute("aria-pressed")).toBe("true");
    expect(within(kinds).getByRole("button", { name: /날씨·빛 참고/u }).getAttribute("aria-pressed")).toBe("true");
    const cues = screen.getByRole("group", { name: "읽은 단서" });
    expect(within(cues).getAllByRole("button").map((button) => button.textContent)).toEqual(["비 오는 → rain", "골목 → alley", "야경 → night"]);
    expect(screen.getByText(/찾기를 누르기 전에는 어떤 제공처도 부르지 않아요/u)).toBeTruthy();
    expect(screen.getAllByText("alley night").length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  it("제출하면 렌즈별 선두 제공처만 부르고, 날씨·빛은 도시를 고를 때까지 부르지 않는다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    expect(callsTo().map((params) => [params.get("provider"), params.get("q"), params.get("page")])).toEqual([
      ["polyhaven", "alley night", "1"],
      ["ambientcg", "alley night", "1"],
    ]);
    expect(screen.getByRole("group", { name: "예보를 볼 도시" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "서울" }));
    await waitFor(() => expect(callsTo().map((params) => params.get("provider"))).toContain("metweather"));
    expect(callsTo().filter((params) => params.get("provider") === "metweather").map((params) => params.get("q"))).toEqual(["서울"]);
    expect(callsTo()).toHaveLength(3);
  });

  it("같은 제출을 반복해도 이미 받은 제공처·검색어는 다시 부르지 않는다", async () => {
    renderPanel();
    await searchAndWait("골목 야경");
    const first = callsTo().length;
    expect(first).toBeGreaterThan(0);
    submit();
    submit();
    expect(callsTo()).toHaveLength(first);
  });

  it("?mq= 로 들어와도 입력창만 채우고 자동으로 찾지 않는다", () => {
    renderPanel({}, "/research?mq=%EB%B9%84%20%EC%98%A4%EB%8A%94%20%EA%B3%A8%EB%AA%A9");
    expect(sentenceInput().value).toBe("비 오는 골목");
    expect(request).not.toHaveBeenCalled();
  });

  it("단서가 없으면 제출해도 부르지 않고 안내한다", () => {
    renderPanel();
    submit("!!!");
    expect(screen.getByRole("alert").textContent).toContain("찾을 수 있는 단서가 없어요");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("칩: 켜기·끄기·편집", () => {
  it("단서 칩을 끄면 바꾼 이해로 다시 찾기 전까지 호출하지 않고, 누르면 바뀐 검색어만 부른다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const before = callsTo().length;

    const alley = within(screen.getByRole("group", { name: "읽은 단서" })).getByRole("button", { name: /^골목/u });
    expect(alley.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(alley);
    expect(alley.getAttribute("aria-pressed")).toBe("false");
    expect(callsTo()).toHaveLength(before);
    expect(screen.getByText(/아직 이전 이해로 찾은 결과를 보고 있어요/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    await waitFor(() => expect(callsTo().length).toBeGreaterThan(before));
    expect(callsTo().slice(before).map((params) => [params.get("provider"), params.get("q")])).toEqual([
      ["polyhaven", "rain night"],
      ["ambientcg", "rain night"],
    ]);
  });

  it("다시 켜서 이전 이해로 돌아가면 새로 부르지 않고 받아 둔 결과를 쓴다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const alley = within(screen.getByRole("group", { name: "읽은 단서" })).getByRole("button", { name: /^골목/u });
    fireEvent.click(alley);
    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    await waitFor(() => expect(callsTo()).toHaveLength(4));
    fireEvent.click(alley);
    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    expect(callsTo()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "바꾼 대로 다시 찾기" })).toBeNull();
  });

  it("렌즈 칩: 제안된 종류를 켜면 다시 찾기 때만 부른다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const kinds = screen.getByRole("group", { name: "찾는 종류" });
    const photo = within(kinds).getByRole("button", { name: /사진·역사 아카이브/u });
    expect(photo.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(photo);
    expect(photo.getAttribute("aria-pressed")).toBe("true");
    expect(callsTo()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    await waitFor(() => expect(callsTo().map((params) => params.get("provider"))).toContain("internetarchive"));
  });

  it("렌즈 칩을 끄면 다음 찾기에서 그 종류를 부르지 않는다", async () => {
    renderPanel();
    type("한복 캐릭터");
    fireEvent.click(within(screen.getByRole("group", { name: "찾는 종류" })).getByRole("button", { name: /미술·복식 레퍼런스/u }));
    submit();
    expect(screen.getByText("켜 둔 종류가 없어요. 위에서 찾을 종류를 하나 이상 켜 주세요.")).toBeTruthy();
    expect(callsTo()).toHaveLength(0);
  });

  it("검색어 고치기: 적용하면 이해만 바뀌고, 다시 찾으면 고친 검색어로 부른다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    fireEvent.click(screen.getByRole("button", { name: "3D·재질 소재 검색어 고치기" }));
    const edit = screen.getByRole("textbox", { name: /제공처에 보낼 검색어/u });
    expect(document.activeElement).toBe(edit);
    fireEvent.change(edit, { target: { value: "brick alley" } });
    fireEvent.submit(edit.closest("form")!);
    expect(callsTo()).toHaveLength(2);
    expect(screen.getByText("(직접 고침)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    await waitFor(() => expect(callsTo()).toHaveLength(4));
    expect(callsTo().slice(2).map((params) => params.get("q"))).toEqual(["brick alley", "brick alley"]);
  });

  it("검색어 편집은 Escape 로 취소하고 초점을 편집 버튼으로 돌려준다", async () => {
    renderPanel();
    type("골목 야경");
    const open = screen.getByRole("button", { name: "3D·재질 소재 검색어 고치기" });
    fireEvent.click(open);
    fireEvent.keyDown(screen.getByRole("textbox", { name: /제공처에 보낼 검색어/u }), { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: /제공처에 보낼 검색어/u })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "3D·재질 소재 검색어 고치기" })));
  });

  it("사전에 없는 낱말은 그대로 보내고 칩으로 끌 수 있다", async () => {
    renderPanel();
    type("스산한 폐건물");
    const free = screen.getByRole("group", { name: "사전에 없는 낱말" });
    expect(within(free).getByRole("button", { name: "스산한" }).getAttribute("aria-pressed")).toBe("true");
    submit();
    await waitFor(() => expect(callsTo().length).toBeGreaterThan(0));
    expect(callsTo()[0]?.get("q")).toBe("스산한 abandoned building");
    fireEvent.click(within(screen.getByRole("group", { name: "사전에 없는 낱말" })).getByRole("button", { name: "스산한" }));
    fireEvent.click(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" }));
    await waitFor(() => expect(callsTo().some((params) => params.get("q") === "abandoned building")).toBe(true));
  });

  it("어긋나는 단서와 80자 상한을 숨기지 않고 알린다", () => {
    renderPanel();
    type("맑은 날 비 오는 골목");
    expect(screen.getByRole("list", { name: "서로 어긋나는 단서" }).textContent).toContain("서로 어긋나는 단서예요");
    type(`골목 ${"가".repeat(70)} 야경 야경 야경`);
    expect(sentenceInput().value.length).toBeGreaterThan(0);
  });
});

describe("결과 그룹과 카드", () => {
  it("권리 배지·출처 링크·제공기관 표기를 그대로 보여 준다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const group = screen.getByRole("heading", { name: "3D·재질 소재", level: 3 }).closest("section")!;
    const poly = within(group).getByRole("heading", { name: "Poly Haven", level: 4 }).closest("section")!;
    expect(within(poly).getByText("alley night")).toBeTruthy();
    const card = within(poly).getByRole("heading", { name: "polyhaven 자료 1", level: 5 }).closest("article")!;
    expect(card.textContent).toContain("CC0");
    expect(card.textContent).toContain("공개 이용 확인");
    expect(card.textContent).toContain("제공");
    expect(card.textContent).toContain("Poly Haven · 무료 CC0 3D·HDRI·텍스처");
    const source = within(card).getByRole("link", { name: /원문 확인/u });
    expect(source.getAttribute("href")).toBe("https://polyhaven.com/a/brick_1");
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(within(card).getByText("이용조건·조회일")).toBeTruthy();
    expect(within(poly).getByRole("link", { name: "공식 사이트 ↗" }).getAttribute("href")).toBe("https://polyhaven.com/");
  });

  it("레퍼런스 전용 자료는 그 배지를 달고 스튜디오로 보내기를 막는다", async () => {
    renderPanel();
    await searchAndWait("한복 캐릭터");
    // met·aic 는 CC0, 레퍼런스 전용은 vam 이라 먼저 다른 제공처를 연다.
    fireEvent.click(screen.getByRole("button", { name: /다른 제공처에서도 찾기 · 3곳/u }));
    const vam = (await screen.findByRole("heading", { name: "V&A", level: 4 })).closest("section")!;
    const card = (await within(vam).findByRole("heading", { name: "vam 자료 1", level: 5 })).closest("article")!;
    expect(card.textContent).toContain("REF");
    expect(card.textContent).toContain("레퍼런스 전용");
    expect(within(card).queryByRole("button", { name: /스튜디오로 보내기/u })).toBeNull();
    expect(card.textContent).toContain("스튜디오로 직접 보내지 않아요");
  });

  it("제공처마다 loading → 결과 로 바뀌고, 로딩 중에는 aria-busy 를 건다", async () => {
    let release: (value: Response) => void = () => undefined;
    handler = (provider, _query, page) => (provider === "polyhaven"
      ? new Promise<Response>((resolve) => { release = resolve; })
      : searchBody(provider, [hubItem(provider, 1)], { page }));
    renderPanel();
    submit("비 오는 골목 야경");
    const poly = (await screen.findByRole("heading", { name: "Poly Haven", level: 4 })).closest("section")!;
    expect(poly.getAttribute("aria-busy")).toBe("true");
    expect(within(poly).getByText("공식 제공처에서 자료를 확인하고 있어요…")).toBeTruthy();
    const cg = screen.getByRole("heading", { name: "ambientCG", level: 4 }).closest("section")!;
    expect(await within(cg).findByRole("heading", { name: "ambientcg 자료 1", level: 5 })).toBeTruthy();
    expect(poly.getAttribute("aria-busy")).toBe("true");

    await act(async () => { release(searchBody("polyhaven", [hubItem("polyhaven", 1)])); });
    expect(await within(poly).findByRole("heading", { name: "polyhaven 자료 1", level: 5 })).toBeTruthy();
    expect(poly.getAttribute("aria-busy")).toBeNull();
  });

  it("실패한 제공처만 오류와 다시 시도를 보여 주고, 다시 시도하면 그 제공처만 다시 부른다", async () => {
    let polyFailures = 1;
    handler = (provider, _query, page) => {
      if (provider === "polyhaven" && polyFailures > 0) {
        polyFailures -= 1;
        return new Response("boom", { status: 500 });
      }
      return searchBody(provider, [hubItem(provider, 1)], { page });
    };
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("검색 서버에 연결하지 못했어요");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "ambientcg 자료 1", level: 5 })).toBeTruthy();

    fireEvent.click(within(alert).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "polyhaven 자료 1", level: 5 })).toBeTruthy();
    expect(callsTo().filter((params) => params.get("provider") === "polyhaven")).toHaveLength(2);
    expect(callsTo().filter((params) => params.get("provider") === "ambientcg")).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("요청 제한(429)·응답 형식 오류·네트워크 오류를 구분해 안내한다", async () => {
    handler = (provider, _query, page) => {
      if (provider === "polyhaven") return new Response("slow down", { status: 429 });
      if (provider === "ambientcg") return Response.json({ provider: "ambientcg", status: "ready", items: "nope" });
      return searchBody(provider, [], { page });
    };
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const texts = (await screen.findAllByRole("alert")).map((node) => node.textContent ?? "");
    expect(texts.some((text) => text.includes("요청이 많습니다. 1분 뒤에 다시 시도하세요."))).toBe(true);
    expect(texts.some((text) => text.includes("응답의 형식을 확인하지 못했어요"))).toBe(true);

    request.mockReset().mockRejectedValue(new TypeError("offline"));
    fireEvent.click(screen.getAllByRole("button", { name: "다시 시도" })[0]!);
    await waitFor(() => expect(screen.getAllByRole("alert").map((node) => node.textContent).join(" ")).toContain("네트워크 오류로 불러오지 못했어요"));
  });

  it("JSON 이 아닌 응답은 네트워크 오류가 아니라 형식 오류로 안내한다", async () => {
    handler = (provider, _query, page) => (provider === "polyhaven"
      ? new Response("<html>bad gateway page</html>", { status: 200, headers: { "Content-Type": "text/html" } })
      : searchBody(provider, [hubItem(provider, 1)], { page }));
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("응답의 형식을 확인하지 못했어요");
    expect(alert.textContent).not.toContain("네트워크 오류");
  });

  it("빈 결과는 이유와 다음 행동을 알려 준다 — 사전에 없는 낱말이 원인일 수 있으면 그 낱말을 짚는다", async () => {
    handler = (provider, _query, page) => searchBody(provider, [], { page });
    renderPanel();
    await searchAndWait("스산한 폐건물");
    const poly = (await screen.findByRole("heading", { name: "Poly Haven", level: 4 })).closest("section")!;
    expect(within(poly).getByText(/와 맞는 자료가 없어요/u)).toBeTruthy();
    expect(within(poly).getByText(/사전에 없는 낱말 ‘스산한’ 때문에/u)).toBeTruthy();
    expect(within(poly).getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("서버 인증키 미설정·일시 불가·부분 응답을 각각 다르게 알린다", async () => {
    handler = (provider, _query, page) => {
      if (provider === "polyhaven") return searchBody(provider, [], { status: "not_configured", page });
      if (provider === "ambientcg") return searchBody(provider, [], { status: "unavailable", page });
      return searchBody(provider, [], { page });
    };
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    expect(await screen.findByText(/서버 인증키가 아직 연결되지 않아/u)).toBeTruthy();
    expect(screen.getByText(/제공처가 일시적으로 응답하지 않아요/u)).toBeTruthy();

    cleanup();
    request.mockClear();
    handler = (provider, _query, page) => searchBody(provider, [hubItem(provider, 1)], { status: "partial", page });
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    expect((await screen.findAllByText("일부 응답만 받았어요. 빠진 자료가 있을 수 있어요.")).length).toBe(2);
  });

  it("제공처당 처음 4개만 보여 주고, 더 보기로 늘리고, 다 보여 주면 다음 페이지를 부른다", async () => {
    handler = (provider, _query, page) => (provider === "polyhaven"
      ? searchBody(provider, Array.from({ length: 6 }, (_, index) => hubItem(provider, page === 1 ? index + 1 : index + 7)), { page, hasMore: page === 1, total: 12 })
      : searchBody(provider, [hubItem(provider, 1)], { page }));
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const poly = screen.getByRole("heading", { name: "Poly Haven", level: 4 }).closest("section")!;
    expect(within(poly).getAllByRole("heading", { level: 5 })).toHaveLength(4);
    expect(within(poly).getByText("4개 표시 · 받은 자료 6개")).toBeTruthy();
    expect(within(poly).getByText("전체 12건")).toBeTruthy();

    const more = within(poly).getByRole("button", { name: "Poly Haven 더 보기" });
    expect(more.textContent).toBe("더 보기 · 2개");
    fireEvent.click(more);
    expect(within(poly).getAllByRole("heading", { level: 5 })).toHaveLength(6);
    expect(callsTo().filter((params) => params.get("provider") === "polyhaven")).toHaveLength(1);
    // 새로 보이게 된 첫 카드로 초점이 간다.
    await waitFor(() => expect(document.activeElement?.textContent).toBe("polyhaven 자료 5"));

    const next = within(poly).getByRole("button", { name: "Poly Haven 더 보기" });
    expect(next.textContent).toBe("다음 페이지 불러오기");
    fireEvent.click(next);
    await waitFor(() => expect(callsTo().filter((params) => params.get("provider") === "polyhaven").map((params) => params.get("page"))).toEqual(["1", "2"]));
    await waitFor(() => expect(within(poly).getAllByRole("heading", { level: 5 }).length).toBe(10));
    // 받은 자료 12개 중 10개가 보이고, 마지막 쪽이라 남은 2개는 더 보기로만 펼친다(다음 페이지 요청 없음).
    const rest = within(poly).getByRole("button", { name: "Poly Haven 더 보기" });
    expect(rest.textContent).toBe("더 보기 · 2개");
    fireEvent.click(rest);
    expect(within(poly).getAllByRole("heading", { level: 5 })).toHaveLength(12);
    expect(within(poly).queryByRole("button", { name: "Poly Haven 더 보기" })).toBeNull();
    expect(callsTo().filter((params) => params.get("provider") === "polyhaven")).toHaveLength(2);
  });

  it("다른 제공처는 사용자가 누를 때만 부른다", async () => {
    renderPanel();
    await searchAndWait("한복 캐릭터");
    expect(callsTo().map((params) => params.get("provider"))).toEqual(["met", "aic"]);
    const more = screen.getByRole("button", { name: /다른 제공처에서도 찾기 · 3곳/u });
    expect(more.parentElement?.textContent).toContain("클리블랜드");
    fireEvent.click(more);
    await waitFor(() => expect(callsTo()).toHaveLength(5));
    expect(callsTo().slice(2).map((params) => params.get("provider")).sort()).toEqual(["cleveland", "rijksmuseum", "vam"]);
    expect(screen.queryByRole("button", { name: /다른 제공처에서도 찾기/u })).toBeNull();
  });

  it("한글 문서 제목만 받는 제공처(wikimedia)에는 한글 검색어를, 영문 인덱스에는 영문 검색어를 보낸다", async () => {
    renderPanel();
    await searchAndWait("1980년대 서울 시장 사진");
    fireEvent.click(screen.getByRole("button", { name: /다른 제공처에서도 찾기 · 4곳/u }));
    await waitFor(() => expect(callsTo().map((params) => params.get("provider"))).toContain("wikimedia"));
    const byProvider = Object.fromEntries(callsTo().map((params) => [params.get("provider"), params.get("q")]));
    expect(byProvider.internetarchive).toBe("1980s Seoul market photograph");
    expect(byProvider.wikimedia).toBe("서울");
    expect(byProvider.dpla).toBe("1980s Seoul market photograph");
    expect(byProvider.kheritage).toBe("서울");
    expect(byProvider.tourapi).toBe("서울 시장");
  });
});

describe("행동: 장면 보드 · 스튜디오 · 브리프 · 마켓 · 내 라이브러리", () => {
  const polyTexture = hubItem("polyhaven", 1, { title: "Brick wall", description: "붉은 벽돌 · 텍스처 · 최대 4K · 태그 brick, wall" });

  beforeEach(() => {
    handler = (provider, _query, page) => (provider === "polyhaven"
      ? searchBody(provider, [polyTexture], { page })
      : searchBody(provider, [hubItem(provider, 1)], { page }));
  });

  it("장면 보드에 담기: 토글로 부모 보드에 전달하고, 담긴 자료는 눌림 상태로 보인다", async () => {
    const { onToggleSaved } = renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const button = await screen.findByRole("button", { name: "Brick wall 장면 보드에 담기" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(onToggleSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "polyhaven:item-1" }));
    expect(screen.getByText("장면 보드에 담았어요: Brick wall")).toBeTruthy();
  });

  it("이미 담은 자료는 aria-pressed=true 이고, 저장이 막힌 상태에서는 담기를 막는다", async () => {
    renderPanel({ saved: [polyTexture], saveDisabled: true });
    await searchAndWait("비 오는 골목 야경");
    const button = await screen.findByRole("button", { name: "Brick wall 장면 보드에 담기" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("스튜디오로 보내기: MATERIAL_DROP_KEY 계약 그대로 sessionStorage 에 담고, 불러오기가 아직 없다고 솔직히 안내한다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    fireEvent.click(await screen.findByRole("button", { name: "Brick wall 스튜디오로 보내기" }));
    const stored = JSON.parse(sessionStorage.getItem(MATERIAL_DROP_KEY) ?? "null") as Record<string, unknown>;
    expect(stored).toMatchObject({
      schema: "toonstudio.material-drop.v1",
      id: "polyhaven:item-1",
      provider: "polyhaven",
      kind: "texture",
      title: "Brick wall",
      sourceUrl: "https://polyhaven.com/a/brick_1",
      tags: ["brick", "wall"],
    });
    // 스튜디오 쪽 불러오기는 아직 연결되지 않았으므로 불러올 수 있다고 약속하지 않고, 이동 링크도 두지 않는다.
    expect(screen.getByText(/스튜디오 전달함에 담았어요: Brick wall/u).textContent).toContain("아직 연결되지 않았어요");
    expect(screen.queryByRole("link", { name: /스튜디오/u })).toBeNull();
  });

  it("전달함에 저장하지 못하면 경고하고 성공 안내를 하지 않는다", async () => {
    renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.click(await screen.findByRole("button", { name: "Brick wall 스튜디오로 보내기" }));
    expect(screen.getByRole("alert").textContent).toContain("전달 정보를 저장하지 못했어요");
    expect(screen.queryByText(/스튜디오 전달함에 담았어요/u)).toBeNull();
    setItem.mockRestore();
  });

  it("브리프 내보내기: 담은 자료가 있어야 켜지고, 문장·이해·출처 기록을 Markdown 으로 내려받는다", async () => {
    let content = "";
    const createUrl = vi.fn((blob: Blob) => { void readBlob(blob).then((text) => { content = text; }); return "blob:scene-brief"; });
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const { rerender } = renderPanel();
    await searchAndWait("비 오는 골목 야경");
    const exportButton = () => screen.getByRole("button", { name: /브리프 내보내기/u }) as HTMLButtonElement;
    expect(exportButton().disabled).toBe(true);
    expect(exportButton().textContent).toContain("담은 자료 0개");

    rerender(
      <MemoryRouter initialEntries={["/research"]}>
        <MaterialSentencePanel saved={[polyTexture]} saveDisabled={false} onToggleSaved={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(exportButton().disabled).toBe(false);
    expect(exportButton().textContent).toContain("담은 자료 1개");
    fireEvent.click(exportButton());
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click.mock.instances[0]).toHaveProperty("download", "toonstudio-scene-brief.md");
    await waitFor(() => expect(content).toContain("# 장면 소재 브리프"));
    expect(content).toContain("- 문장: 비 오는 골목 야경");
    expect(content).toContain("## Brick wall");
    expect(content).toContain("- 원문: https://polyhaven.com/a/brick_1");
    expect(content).toContain("- 이용조건: CC0");
  });

  it("마켓·내 소재장으로 이동하는 링크가 있고, 마켓 링크는 계획의 조건을 URL 필터로 담는다", async () => {
    renderPanel();
    type("저작권 걱정 없는 학교 배경");
    const market = screen.getAllByRole("link", { name: "마켓에서 찾기 →" })[0]!;
    const url = new URL(market.getAttribute("href") ?? "", "https://local.test");
    expect(url.pathname).toBe("/market/browse");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교" });
    expect(screen.getByRole("link", { name: "내 소재장(3D 포함) 열기 →" }).getAttribute("href")).toBe("/studio/assets?view=library");
    expect(request).not.toHaveBeenCalled();
  });

  it("마켓 렌즈 그룹은 요청 없이 적용될 조건과 링크만 보여 준다", async () => {
    renderPanel();
    await searchAndWait("저작권 걱정 없는 학교 배경");
    const group = screen.getByRole("heading", { name: "마켓 리소스", level: 3 }).closest("section")!;
    expect(group.textContent).toContain("2D 에셋");
    expect(group.textContent).toContain("CC0 1.0");
    expect(group.textContent).toContain("#학교");
    expect(within(group).getByRole("link", { name: "마켓에서 찾기 →" }).getAttribute("href")).toContain("/market/browse?");
  });

  it("내 라이브러리 렌즈는 저장 보드에서만 찾는다(네트워크 없음)", async () => {
    const mine = hubItem("met", 9, { title: "My cat sketch", description: "cat study" });
    renderPanel({ saved: [mine] });
    await searchAndWait("내가 저장한 고양이 3D 모델");
    const group = screen.getByRole("heading", { name: "내 라이브러리", level: 3 }).closest("section")!;
    expect(within(group).getByRole("heading", { name: "My cat sketch", level: 5 })).toBeTruthy();
    expect(group.textContent).toContain("네트워크 요청은 없어요");
    expect(within(group).getByRole("link", { name: "내 소재장(3D 포함) 열기 →" })).toBeTruthy();
    expect(callsTo().map((params) => params.get("provider"))).not.toContain("met");
  });
});

describe("접근성 · 진행 안내", () => {
  it("검색 폼은 이름 있는 search 랜드마크이고, 입력은 label·도움말·maxLength 를 갖는다", () => {
    renderPanel();
    expect(form()).toBeTruthy();
    expect(sentenceInput().maxLength).toBe(80);
    expect(sentenceInput().getAttribute("aria-describedby")).toBeTruthy();
    expect(sentenceInput().getAttribute("enterkeyhint")).toBe("search");
    expect(screen.getByRole("heading", { name: "문장으로 소재 찾기", level: 2 })).toBeTruthy();
  });

  it("진행은 폴라이트 라이브 영역으로 알린다: 찾는 중 → 끝남(자료 수·비어 있음·오류)", async () => {
    handler = (provider, _query, page) => (provider === "polyhaven"
      ? new Response("boom", { status: 500 })
      : searchBody(provider, [hubItem(provider, 1), hubItem(provider, 2)], { page }));
    renderPanel();
    const live = () => screen.getAllByRole("status").find((node) => node.getAttribute("aria-live") === "polite" && node.classList.contains("sr-only"))!;
    expect(live().textContent).toBe("");
    submit("비 오는 골목 야경");
    expect(live().textContent).toContain("2곳에서 찾는 중이에요");
    await waitFor(() => expect(live().textContent).toContain("찾기를 마쳤어요 — 자료 2개 · 비어 있음 0곳 · 오류 1곳"));
    expect(live().getAttribute("aria-atomic")).toBe("true");
  });

  it("제출 후 입력을 고치면 이해는 새 문장을 따르고, 결과는 다시 찾을 때까지 이전 문장을 유지한다", async () => {
    renderPanel();
    await searchAndWait("골목 야경");
    const before = callsTo().length;
    type("바다 노을");
    expect(screen.getByText(/아직 이전 이해로 찾은 결과를 보고 있어요/u)).toBeTruthy();
    expect(callsTo()).toHaveLength(before);
    expect(screen.getAllByRole("heading", { name: "3D·재질 소재", level: 3 })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "바꾼 대로 다시 찾기" })).toBeTruthy();
  });

  it("최근 검색은 제출한 문장을 저장해 다시 쓰게 하고, 지우면 사라진다", async () => {
    const view = renderPanel();
    await searchAndWait("골목 야경");
    view.unmount();
    renderPanel();
    const recent = screen.getByRole("group", { name: "최근 검색" });
    fireEvent.click(within(recent).getByRole("button", { name: "골목 야경" }));
    expect(sentenceInput().value).toBe("골목 야경");
    fireEvent.click(within(recent).getByRole("button", { name: "기록 지우기" }));
    expect(screen.queryByRole("group", { name: "최근 검색" })).toBeNull();
    expect(localStorage.getItem("toonstudio.material-recent-searches.v1")).toBeNull();
  });

  it("제공처 연결 상태는 펼칠 때만 확인한다", () => {
    renderPanel();
    expect(screen.queryByText("provider-status-loaded")).toBeNull();
    const details = screen.getByText("제공처 연결 상태 확인").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(screen.getByText("provider-status-loaded")).toBeTruthy();
  });

  it("움직임 줄이기: 스켈레톤은 모션 감소에서 애니메이션을 끈다", async () => {
    handler = () => new Promise<Response>(() => undefined);
    const { container } = renderPanel();
    submit("골목 야경");
    await screen.findAllByText("공식 제공처에서 자료를 확인하고 있어요…");
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
    for (const node of skeletons) expect(node.className).toContain("motion-reduce:animate-none");
  });

  it("화면을 떠나면 진행 중인 요청을 취소한다", async () => {
    let signal: AbortSignal | undefined;
    request.mockReset().mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const view = renderPanel();
    submit("한복 캐릭터");
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});

describe("AI로 다듬기(선택, 명시적 클릭에서만)", () => {
  it("refineSentence 가 없으면 버튼을 그리지 않는다", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "AI로 다듬기" })).toBeNull();
  });

  it("누를 때만 문장을 바꾸고 자동으로 찾지 않으며, 원래 문장으로 되돌릴 수 있다", async () => {
    const refineSentence = vi.fn(async () => "비 오는 골목 밤 풍경");
    renderPanel({ refineSentence });
    type("비 와서 으스스한 동네 뒷길");
    expect(refineSentence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "AI로 다듬기" }));
    await waitFor(() => expect(sentenceInput().value).toBe("비 오는 골목 밤 풍경"));
    expect(refineSentence).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "원래 문장으로 되돌리기" }));
    expect(sentenceInput().value).toBe("비 와서 으스스한 동네 뒷길");
  });

  it("실패하거나 null 이면 조용히 규칙 기반 해석을 유지한다", async () => {
    const refineSentence = vi.fn(async () => null);
    renderPanel({ refineSentence });
    type("골목 야경");
    fireEvent.click(screen.getByRole("button", { name: "AI로 다듬기" }));
    await waitFor(() => expect(screen.getByText(/규칙 기반 해석을 그대로 두었어요/u)).toBeTruthy());
    expect(sentenceInput().value).toBe("골목 야경");
    expect(screen.queryByRole("alert")).toBeNull();

    cleanup();
    const failing = vi.fn(async () => { throw new Error("quota"); });
    renderPanel({ refineSentence: failing });
    type("골목 야경");
    fireEvent.click(screen.getByRole("button", { name: "AI로 다듬기" }));
    await waitFor(() => expect(screen.getByText(/규칙 기반 해석을 그대로 두었어요/u)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
