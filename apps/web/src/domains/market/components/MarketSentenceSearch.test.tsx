// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketSentenceSearch } from "./MarketSentenceSearch";

const fetchSpy = vi.fn<typeof fetch>();
const onApply = vi.fn<(patch: Readonly<Record<string, string | null>>) => void>();

beforeEach(() => {
  fetchSpy.mockReset();
  onApply.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSearch() {
  return render(
    <MemoryRouter>
      <MarketSentenceSearch onApply={onApply} />
    </MemoryRouter>,
  );
}

const toggle = () => screen.getByRole("button", { name: "문장으로 찾기" });
const input = () => screen.getByRole("textbox", { name: "찾는 자료를 문장으로 적기" }) as HTMLInputElement;
const chips = () => within(screen.getByRole("list", { name: "읽은 마켓 조건" })).getAllByRole("button");
const live = () => screen.getByRole("status");

function open() {
  fireEvent.click(toggle());
}
function type(value: string) {
  fireEvent.change(input(), { target: { value } });
}
function apply(value?: string) {
  if (value !== undefined) type(value);
  fireEvent.submit(screen.getByRole("search", { name: "문장으로 마켓 찾기" }));
}

describe("열고 닫기", () => {
  it("처음에는 접혀 있고, 토글은 aria-expanded/aria-controls 를 갖는다", () => {
    renderSearch();
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("search", { name: "문장으로 마켓 찾기" })).toBeNull();
    const target = document.getElementById(toggle().getAttribute("aria-controls") ?? "");
    expect(target).toBeTruthy();
    expect(target?.hasAttribute("hidden")).toBe(true);
  });

  it("열면 입력창으로 초점이 가고, Escape 는 닫고 토글로 초점을 돌려준다", () => {
    renderSearch();
    open();
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(input());
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle());
  });

  it("한글 조합 중의 Escape 는 조합 취소일 뿐 패널을 닫지 않는다", () => {
    renderSearch();
    open();
    expect(fireEvent.keyDown(input(), { key: "Escape", isComposing: true })).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("닫았다 다시 열어도 적던 문장은 남는다", () => {
    renderSearch();
    open();
    type("학교 배경");
    open();
    open();
    expect(input().value).toBe("학교 배경");
  });
});

describe("입력 중에는 아무것도 반영하지 않는다", () => {
  it("타이핑은 칩 미리보기만 바꾸고 onApply·네트워크를 부르지 않는다", () => {
    renderSearch();
    open();
    type("저작권 걱정 없는 학교 배경");
    expect(chips().map((chip) => chip.textContent)).toEqual(["종류 · 2D 에셋", "#학교", "라이선스 · CC0 1.0", "검색어 “배경”"]);
    expect(onApply).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("칩을 빼는 것도 반영이 아니다", () => {
    renderSearch();
    open();
    type("저작권 걱정 없는 학교 배경");
    fireEvent.click(screen.getByRole("button", { name: "라이선스 CC0 1.0 조건 빼기" }));
    expect(onApply).not.toHaveBeenCalled();
  });

  it("문장이 비어 있거나 읽을 단서가 없으면 안내만 보인다", () => {
    renderSearch();
    open();
    expect(screen.getByText("문장을 입력하면 읽은 조건이 칩으로 보여요.")).toBeTruthy();
    type("!!!");
    expect(screen.getByText(/아직 읽어 낸 조건이 없어요/u)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "읽은 마켓 조건" })).toBeNull();
  });

  it("입력창은 80자 제한과 도움말 연결을 갖는다", () => {
    renderSearch();
    open();
    expect(input().maxLength).toBe(80);
    const described = (input().getAttribute("aria-describedby") ?? "").split(" ");
    expect(described).toHaveLength(2);
    for (const id of described) expect(document.getElementById(id)).toBeTruthy();
  });
});

describe("칩 빼기", () => {
  it("뺀 칩은 사라지고 초점이 이웃 칩으로 간다", () => {
    renderSearch();
    open();
    type("저작권 걱정 없는 학교 배경");
    fireEvent.click(screen.getByRole("button", { name: "태그 학교 조건 빼기" }));
    expect(chips().map((chip) => chip.textContent)).toEqual(["종류 · 2D 에셋", "라이선스 · CC0 1.0", "검색어 “배경”"]);
    expect(document.activeElement?.textContent).toBe("라이선스 · CC0 1.0");
    expect(live().textContent).toBe("태그 학교 조건을 뺐어요. 남은 조건 3개");
  });

  it("마지막 칩을 빼면 앞 칩으로, 칩이 하나도 안 남으면 입력창으로 간다", () => {
    renderSearch();
    open();
    type("G펜 브러시 CC0");
    fireEvent.click(screen.getByRole("button", { name: "라이선스 CC0 1.0 조건 빼기" }));
    expect(document.activeElement?.textContent).toBe("종류 · 브러시");
    fireEvent.click(screen.getByRole("button", { name: "종류 브러시 조건 빼기" }));
    expect(document.activeElement).toBe(input());
  });

  it("뺀 조건 다시 넣기로 되돌리고, 문장을 고치면 뺀 목록이 초기화된다", () => {
    renderSearch();
    open();
    type("저작권 걱정 없는 학교 배경");
    fireEvent.click(screen.getByRole("button", { name: "검색어 “배경” 조건 빼기" }));
    fireEvent.click(screen.getByRole("button", { name: "뺀 조건 다시 넣기" }));
    expect(chips()).toHaveLength(4);
    expect(document.activeElement).toBe(input());

    fireEvent.click(screen.getByRole("button", { name: "검색어 “배경” 조건 빼기" }));
    type("저작권 걱정 없는 학교 배경 책상");
    expect(screen.queryByRole("button", { name: "뺀 조건 다시 넣기" })).toBeNull();
  });
});

describe("이 조건으로 찾기", () => {
  it("제출하면 그때 한 번만 onApply 에 URL 필터 변경분을 넘기고 결과를 안내한다", () => {
    renderSearch();
    open();
    apply("저작권 걱정 없는 학교 배경");
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({ q: "배경", kind: "asset", license: "cc0-1.0", tag: "학교" });
    expect(live().textContent).toBe("조건 4개를 적용했어요: 종류 2D 에셋, 태그 학교, 라이선스 CC0 1.0, 검색어 “배경”");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("뺀 조건은 반영에서도 빠진다", () => {
    renderSearch();
    open();
    type("저작권 걱정 없는 학교 배경");
    fireEvent.click(screen.getByRole("button", { name: "라이선스 CC0 1.0 조건 빼기" }));
    apply();
    expect(onApply).toHaveBeenCalledWith({ q: "배경", kind: "asset", license: null, tag: "학교" });
  });

  it("검색어 없는 조건이면 관련도순 정렬을 풀도록 sort 를 비운다", () => {
    renderSearch();
    open();
    apply("G펜 브러시 CC0");
    expect(onApply).toHaveBeenCalledWith({ q: null, kind: "brush", license: "cc0-1.0", tag: null, sort: null });
  });

  it("읽을 수 없으면 반영하지 않고 알린다", () => {
    renderSearch();
    open();
    apply("!!!");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("읽을 수 있는 조건이 없어서 적용하지 않았어요");
    type("학교 배경");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("뺄 수 있는 것을 모두 빼면 반영하지 않는다", () => {
    renderSearch();
    open();
    type("G펜 브러시 CC0");
    fireEvent.click(screen.getByRole("button", { name: "종류 브러시 조건 빼기" }));
    fireEvent.click(screen.getByRole("button", { name: "라이선스 CC0 1.0 조건 빼기" }));
    apply();
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("한글 조합 중의 Enter 는 제출 동작을 막는다", () => {
    renderSearch();
    open();
    type("학교 배경");
    expect(fireEvent.keyDown(input(), { key: "Enter", isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("안내", () => {
  it("종류·라이선스 단서가 어긋나면 어느 쪽을 골랐는지 알린다", () => {
    renderSearch();
    open();
    type("템플릿 브러시");
    expect(screen.getByRole("list", { name: "서로 어긋나는 단서" }).textContent).toContain("서로 어긋나는 단서예요");
  });

  it("마켓과 무관한 어긋남(날씨)은 보이지 않는다", () => {
    renderSearch();
    open();
    type("맑은 날 비 오는 골목");
    expect(screen.queryByRole("list", { name: "서로 어긋나는 단서" })).toBeNull();
  });

  it("허브 링크는 같은 문장을 mq 로 넘기며 자동 검색은 하지 않는다", () => {
    renderSearch();
    open();
    expect(screen.queryByRole("link", { name: /소재·자료 허브에서/u })).toBeNull();
    type("비 오는 골목 야경");
    const link = screen.getByRole("link", { name: /소재·자료 허브에서/u });
    expect(link.getAttribute("href")).toBe(`/research?mq=${encodeURIComponent("비 오는 골목 야경")}`);
  });
});

describe("계약", () => {
  it("컴포넌트와 변환 모듈의 소스에는 네트워크 호출이 없다", () => {
    const sources = ["./MarketSentenceSearch.tsx", "../models/market-sentence.ts"].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
    for (const source of sources) {
      expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\/api\//u);
    }
  });
});
