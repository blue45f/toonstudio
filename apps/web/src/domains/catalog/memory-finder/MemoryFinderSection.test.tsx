// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryFinderSection } from "./MemoryFinderSection";

import type { Title } from "@/shared/lib/types";

// 카드 행은 3D·효과음·캠퍼스 오브젝트까지 끌고 오는 무거운 화면이라 얇은 링크로 대체한다. 이 시험은 근거 표시를 본다.
vi.mock("@/shared/components/title-card", () => ({
  TitleRow: ({ title }: { title: Title }) => <a href={`/title/${title.slug}`}>{title.title}</a>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function work(overrides: Partial<Title> & { id: string; title: string }): Title {
  return {
    slug: overrides.id,
    type: "webtoon",
    author: "작가",
    genres: [],
    tags: [],
    synopsis: "",
    releaseYear: 2022,
    ...overrides,
  } as unknown as Title;
}

function renderFinder(search: (query: string, signal: AbortSignal) => Promise<readonly Title[]>) {
  return render(
    <MemoryRouter>
      <MemoryFinderSection search={search} />
    </MemoryRouter>,
  );
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: /작품 찾기/u }));
}

describe("MemoryFinderSection — 입력", () => {
  it("제목을 모른다는 것이 기본이라 제목 칸은 숨어 있고, 고르면 나타난다", () => {
    renderFinder(vi.fn());

    expect((screen.getByRole("radio", { name: /전혀 기억나지 않아요/u }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText(/제목 조각/u)).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /일부만 기억나요/u }));
    expect(screen.getByLabelText(/기억나는 제목 조각/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /정확히 기억해요/u }));
    expect(screen.getByLabelText(/기억하는 제목/u)).toBeTruthy();
  });

  it("출시 연도가 자리표시값이 많아 시기 입력은 받지 않는다", () => {
    renderFinder(vi.fn());

    expect(screen.queryByLabelText(/언제 보셨나요/u)).toBeNull();
  });

  it("장면 칸이 비어 있으면 검색하지 않고 이유를 알리며 초점을 그 칸으로 옮긴다", () => {
    const search = vi.fn();
    renderFinder(search);

    submit();

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("한 줄이라도 적어 주세요");
    const scene = screen.getByLabelText(/기억나는 장면이나 줄거리/u);
    expect(document.activeElement).toBe(scene);
    expect(scene.getAttribute("aria-invalid")).toBe("true");
    expect(scene.getAttribute("aria-describedby")).toContain("scene-problem");
  });

  it("의미 있는 낱말이 하나도 없으면 다른 이유로 알린다", () => {
    const search = vi.fn();
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "그 장면 내용 이야기 비 눈");

    submit();

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("두 글자 이상의 구체적인 낱말");
  });

  it("장면을 고치기 시작하면 지난 입력 오류 문구를 치운다", () => {
    renderFinder(vi.fn());
    submit();
    expect(screen.getByRole("alert")).toBeTruthy();

    type(/기억나는 장면이나 줄거리/u, "우산");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(/기억나는 장면이나 줄거리/u).getAttribute("aria-invalid")).toBeNull();
  });
});

describe("MemoryFinderSection — 결과의 정직한 표기", () => {
  it("제목 조각이 제목과 맞으면 ‘확인된 일치’와 근거를 보여 주고 질의에 제목 조각을 넣는다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "lv", title: "나 혼자만 레벨업" })]);
    renderFinder(search);
    fireEvent.click(screen.getByRole("radio", { name: /일부만 기억나요/u }));
    type(/기억나는 제목 조각/u, "혼자만레벨");
    type(/기억나는 장면이나 줄거리/u, "던전 괴물");

    submit();

    expect(await screen.findByRole("heading", { name: /제목 조각과 맞는 작품을 찾았어요 \(1편\)/u })).toBeTruthy();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toBe("혼자만레벨 던전 괴물");
    const row = screen.getByText("나 혼자만 레벨업").closest("li") as HTMLElement;
    expect(row.getAttribute("data-memory-match-level")).toBe("confirmed");
    expect(within(row).getByText("확인된 일치")).toBeTruthy();
    // 띄어쓰기를 빼야만 맞은 것이라 근거 칩이 그 사실을 그대로 말한다 — "제목에 ‘혼자만레벨’" 이라고 쓰지 않는다.
    expect(within(row).getByText("제목에서 띄어쓰기를 빼면 ‘혼자만레벨’")).toBeTruthy();
    // 초점은 passive effect 에서 옮기므로 제목이 보인 직후에는 아직 옮겨지기 전일 수 있다.
    await waitFor(() => expect(document.activeElement?.textContent).toContain("제목 조각과 맞는 작품"));
  });

  it("머리말 편수는 가장 확실한 단계만 세고 나머지는 따로 묶어 보여 준다", async () => {
    const search = vi.fn().mockResolvedValue([
      work({ id: "lv", title: "나 혼자만 레벨업" }),
      work({ id: "p1", title: "던전 일기", tags: ["괴물", "헌터"] }),
      work({ id: "p2", title: "헌터 이야기", tags: ["던전"], synopsis: "괴물이 나오는 사건 기록을 추적하는 이야기가 이어지는 아침" }),
    ]);
    renderFinder(search);
    fireEvent.click(screen.getByRole("radio", { name: /일부만 기억나요/u }));
    type(/기억나는 제목 조각/u, "레벨업");
    type(/기억나는 장면이나 줄거리/u, "던전 괴물 헌터");

    submit();

    expect(await screen.findByRole("heading", { level: 3, name: "제목 조각과 맞는 작품을 찾았어요 (1편)" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "그 밖에 단서가 겹치는 추정 후보 (2편)" })).toBeTruthy();
    const probable = document.querySelector('[data-memory-group="probable"]') as HTMLElement;
    expect(within(probable).getByText("던전 일기")).toBeTruthy();
    expect(within(probable).getByText("헌터 이야기")).toBeTruthy();
  });

  it("장면·태그 단서만 겹치면 ‘추정 일치’이고 제목이 맞았다고 말하지 않는다", async () => {
    const search = vi.fn().mockResolvedValue([
      work({ id: "p", title: "첫사랑 일기", tags: ["우산"], synopsis: "갑작스러운 소나기가 내리던 날 시작되는 이야기" }),
    ]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    expect(await screen.findByRole("heading", { name: /확실하진 않지만 단서가 겹치는 후보예요 \(1편\)/u })).toBeTruthy();
    const row = screen.getByText("첫사랑 일기").closest("li") as HTMLElement;
    expect(within(row).getByText("추정 일치")).toBeTruthy();
    expect(within(row).queryByText("확인된 일치")).toBeNull();
    expect(within(row).getByText("태그에 ‘우산’")).toBeTruthy();
    expect(within(row).getByText("소개에 ‘소나기’")).toBeTruthy();
    expect(screen.getByText(/제목이 아니라 장면·태그 같은 단서가 겹쳤다는 뜻/u)).toBeTruthy();
  });

  it("칩에는 사용자가 쓴 말이 아니라 실제로 맞은 형태를 보인다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "sky", title: "하늘 연못에 너를 피워내다" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "하늘을");

    submit();

    const row = (await screen.findByText("하늘 연못에 너를 피워내다")).closest("li") as HTMLElement;
    expect(within(row).getByText("제목에 ‘하늘’")).toBeTruthy();
    expect(within(row).queryByText("제목에 ‘하늘을’")).toBeNull();
  });

  it("단서가 하나만 겹치면 ‘약한 후보’라고 낮춰 말한다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "w", title: "도시 이야기", synopsis: "골목 끝의 작은 가게" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "가게 손님");

    submit();

    expect(await screen.findByRole("heading", { name: /단서가 하나만 겹치는 약한 후보예요 \(1편\)/u })).toBeTruthy();
    const row = screen.getByText("도시 이야기").closest("li") as HTMLElement;
    expect(within(row).getByText("약한 후보")).toBeTruthy();
  });

  it("근거 있는 작품이 없으면 못 찾았다고 말하고 제목 조각을 넘겨 검색으로 안내한다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "x", title: "무관한 작품" })]);
    renderFinder(search);
    fireEvent.click(screen.getByRole("radio", { name: /일부만 기억나요/u }));
    type(/기억나는 제목 조각/u, "없는제목");
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    expect(await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u })).toBeTruthy();
    expect(screen.queryByText("무관한 작품")).toBeNull();
    expect(screen.getByRole("link", { name: /제목 조각으로 검색/u }).getAttribute("href")).toBe(`/search?q=${encodeURIComponent("없는제목")}`);
    expect(screen.getByRole("link", { name: /장르로 둘러보기/u }).getAttribute("href")).toBe("/explore");
  });

  it("제목 조각이 없으면 검색 링크는 빈 검색으로 안내한다", async () => {
    renderFinder(vi.fn().mockResolvedValue([]));
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u });
    expect(screen.getByRole("link", { name: /제목 조각으로 검색/u }).getAttribute("href")).toBe("/search");
  });

  it("소개가 자동 문구뿐인 작품이 많다는 한계를 사실대로 알린다", async () => {
    renderFinder(vi.fn().mockResolvedValue([]));
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u });
    expect(screen.getByText(/출처 표기뿐인 작품은 소개로 비교하지 않고 제목·태그·장르로만 비교해요/u)).toBeTruthy();
    expect(screen.queryByText(/서비스가 직접 쓴/u)).toBeNull();
  });

  it("낱말이 여덟 개를 넘으면 앞의 것만 썼다고 알린다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "o", title: "하나둘 이야기" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "하나둘 셋넷 다섯여섯 일곱여덟 아홉열 가나다 라마바 사아자 차카타 파하");

    submit();

    expect(await screen.findByText("낱말이 많아 앞의 8개만 썼어요.")).toBeTruthy();
  });
});

describe("MemoryFinderSection — 진행·오류", () => {
  it("찾는 동안 버튼을 잠그고 상태를 알린다", async () => {
    let resolve!: (items: Title[]) => void;
    const search = vi.fn().mockReturnValue(new Promise<Title[]>((done) => (resolve = done)));
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    expect((screen.getByRole("button", { name: /찾는 중/u }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("후보를 찾고 있어요…").getAttribute("role")).toBe("status");
    await act(async () => resolve([]));
    expect(await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u })).toBeTruthy();
  });

  it("검색이 실패하면 입력은 그대로 두고 다시 시도할 수 있게 한다", async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error("search_request_failed")).mockResolvedValueOnce([work({ id: "ok", title: "우산 소녀" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");

    submit();

    expect((await screen.findByRole("heading", { name: /검색을 하지 못했어요/u })).textContent).toContain("검색을 하지 못했어요");
    expect((screen.getByLabelText(/기억나는 장면이나 줄거리/u) as HTMLTextAreaElement).value).toBe("우산");

    fireEvent.click(screen.getByRole("button", { name: /다시 시도/u }));

    expect(await screen.findByText("우산 소녀")).toBeTruthy();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("‘다시 시도’도 입력 검증을 거친다 — 오류 뒤 장면을 비우면 빈 질의로 검색하지 않는다", async () => {
    const search = vi.fn().mockRejectedValue(new Error("search_request_failed"));
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");
    submit();
    await screen.findByRole("heading", { name: /검색을 하지 못했어요/u });

    type(/기억나는 장면이나 줄거리/u, "   ");
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/u }));

    expect(search).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toContain("한 줄이라도 적어 주세요");
  });

  it("우리가 중단하지 않은 AbortError(시간 초과 등)는 오류로 보여 주고 ‘찾는 중’에 갇히지 않는다", async () => {
    const abort = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    renderFinder(vi.fn().mockRejectedValue(abort));
    type(/기억나는 장면이나 줄거리/u, "우산");

    submit();

    expect(await screen.findByRole("heading", { name: /검색을 하지 못했어요/u })).toBeTruthy();
    expect((screen.getByRole("button", { name: /작품 찾기/u }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("다시 검색하면 앞의 요청을 중단한다", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn((_query: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<Title[]>(() => undefined);
    });
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");

    submit();
    await waitFor(() => expect(signals).toHaveLength(1));
    // 로딩 중에는 버튼이 잠기므로 폼 제출을 직접 보낸다(엔터 키 같은 경로).
    fireEvent.submit(screen.getByRole("button", { name: /찾는 중/u }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("닫히면(마운트 해제) 진행 중인 요청을 중단한다", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn((_query: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<Title[]>(() => undefined);
    });
    const view = renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");
    submit();
    await waitFor(() => expect(signals).toHaveLength(1));

    view.unmount();

    expect(signals[0]?.aborted).toBe(true);
  });
});

describe("MemoryFinderSection — 초점과 화면 읽기", () => {
  it("찾는 동안 입력을 고쳤다면 결과가 와도 초점을 빼앗지 않고 조용히 알린다", async () => {
    let resolve!: (items: Title[]) => void;
    const search = vi.fn().mockReturnValue(new Promise<Title[]>((done) => (resolve = done)));
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");
    submit();

    const scene = screen.getByLabelText(/기억나는 장면이나 줄거리/u) as HTMLTextAreaElement;
    scene.focus();
    type(/기억나는 장면이나 줄거리/u, "우산 소나기 학교");
    await act(async () => resolve([work({ id: "u", title: "우산 소녀" })]));

    expect(await screen.findByText("우산 소녀")).toBeTruthy();
    expect(document.activeElement).toBe(scene);
    expect(document.querySelector("[data-memory-finder-live]")?.textContent).toBe("후보 1편을 찾았어요");
  });

  it("고치지 않았다면 결과 제목으로 초점이 가고 따로 알림을 겹쳐 읽지 않는다", async () => {
    renderFinder(vi.fn().mockResolvedValue([work({ id: "u", title: "우산 소녀" })]));
    type(/기억나는 장면이나 줄거리/u, "우산");

    submit();

    const heading = await screen.findByRole("heading", { level: 3 });
    // 초점은 passive effect 에서 옮기므로 제목이 보인 직후에는 아직 옮겨지기 전일 수 있다.
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector("[data-memory-finder-live]")?.textContent).toBe("");
  });
});
