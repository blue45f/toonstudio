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
    releaseYear: 2014,
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
    expect(within(row).getByText("제목에 ‘혼자만레벨’")).toBeTruthy();
    expect(document.activeElement?.textContent).toContain("제목 조각과 맞는 작품");
  });

  it("장면·태그 단서만 겹치면 ‘추정 일치’이고 제목이 맞았다고 말하지 않는다", async () => {
    const search = vi.fn().mockResolvedValue([
      work({ id: "p", title: "첫사랑 일기", tags: ["우산"], synopsis: "갑작스러운 소나기가 내리던 날" }),
    ]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    expect(await screen.findByRole("heading", { name: /확실하진 않지만 단서가 겹치는 후보예요/u })).toBeTruthy();
    const row = screen.getByText("첫사랑 일기").closest("li") as HTMLElement;
    expect(within(row).getByText("추정 일치")).toBeTruthy();
    expect(within(row).queryByText("확인된 일치")).toBeNull();
    expect(within(row).getByText("태그에 ‘우산’")).toBeTruthy();
    expect(within(row).getByText("소개에 ‘소나기’")).toBeTruthy();
    expect(screen.getByText(/제목이 아니라 장면·태그 같은 단서가 겹쳤다는 뜻/u)).toBeTruthy();
  });

  it("단서가 하나만 소개에서 겹치면 ‘약한 후보’라고 낮춰 말한다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "w", title: "도시 이야기", synopsis: "골목 끝의 작은 가게" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "가게 손님");

    submit();

    expect(await screen.findByRole("heading", { name: /단서가 하나만 겹치는 약한 후보예요 \(1편\)/u })).toBeTruthy();
    const row = screen.getByText("도시 이야기").closest("li") as HTMLElement;
    expect(within(row).getByText("약한 후보")).toBeTruthy();
  });

  it("근거 있는 작품이 없으면 못 찾았다고 말하고 다른 길을 안내한다", async () => {
    const search = vi.fn().mockResolvedValue([work({ id: "x", title: "무관한 작품" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산 소나기");

    submit();

    expect(await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u })).toBeTruthy();
    expect(screen.queryByText("무관한 작품")).toBeNull();
    expect(screen.getByRole("link", { name: /제목 조각으로 검색/u }).getAttribute("href")).toBe("/search");
    expect(screen.getByRole("link", { name: /장르로 둘러보기/u }).getAttribute("href")).toBe("/explore");
    expect(screen.getByText(/1~3문장 요약이라, 장면 하나만으로는 못 찾을 수 있어요/u)).toBeTruthy();
  });

  it("시기는 걸러 내지 않고 근거가 있을 때만 거든다", async () => {
    const search = vi.fn().mockResolvedValue([
      work({ id: "near", title: "우산 소녀", releaseYear: 2012 }),
      work({ id: "far", title: "우산 소년", releaseYear: 2022 }),
    ]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");
    fireEvent.change(screen.getByLabelText(/대략 언제 보셨나요/u), { target: { value: "2011-2015" } });

    submit();

    await screen.findByRole("heading", { name: /후보예요 \(2편\)/u });
    expect(within(screen.getByText("우산 소녀").closest("li") as HTMLElement).getByText(/보신 시기\(2011~2015년\)와 가까워요/u)).toBeTruthy();
    expect(within(screen.getByText("우산 소년").closest("li") as HTMLElement).queryByText(/보신 시기/u)).toBeNull();
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
    expect(screen.getByRole("status").textContent).toContain("후보를 찾고 있어요");
    await act(async () => resolve([]));
    expect(await screen.findByRole("heading", { name: /맞는 작품을 찾지 못했어요/u })).toBeTruthy();
  });

  it("검색이 실패하면 입력은 그대로 두고 다시 시도할 수 있게 한다", async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error("search_request_failed")).mockResolvedValueOnce([work({ id: "ok", title: "우산 소녀" })]);
    renderFinder(search);
    type(/기억나는 장면이나 줄거리/u, "우산");

    submit();

    expect((await screen.findByRole("alert")).textContent).toContain("검색을 하지 못했어요");
    expect((screen.getByLabelText(/기억나는 장면이나 줄거리/u) as HTMLTextAreaElement).value).toBe("우산");

    fireEvent.click(screen.getByRole("button", { name: /다시 시도/u }));

    expect(await screen.findByText("우산 소녀")).toBeTruthy();
    expect(search).toHaveBeenCalledTimes(2);
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
