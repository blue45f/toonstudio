// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ContractReviewChecklist } from "./ContractReviewChecklist";
import {
  CONTRACT_REVIEW_STORAGE_KEY,
  parseStoredContractReviewAnswers,
  serializeContractReviewAnswers,
} from "./contract-review-answer-store";
import { CONTRACT_REVIEW_ITEMS, CONTRACT_REVIEW_SOURCES } from "./contract-review-checklist";

const DELAY_PENALTY = "지체상금(마감 지연 패널티)";
const REVENUE_SHARE = "수익 배분(RS) 비율과 ‘순 매출액’ 정의";
const PAUSE = "휴재(쉬어 갈 권리)";

let previousLanguage = "ko";

beforeEach(() => {
  previousLanguage = useI18n.getState().lang;
  act(() => useI18n.setState({ lang: "ko" }));
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  // localStorage 를 가로챈 시험이 있으므로 복원을 먼저 한 뒤 저장소를 비운다.
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  act(() => useI18n.setState({ lang: previousLanguage }));
  window.localStorage.clear();
});

function group(titlePart: string): HTMLElement {
  return screen.getByRole("radiogroup", { name: new RegExp(titlePart.replace(/[()]/gu, "\\$&"), "u") });
}

function choose(titlePart: string, answerName: string): void {
  fireEvent.click(within(group(titlePart)).getByRole("radio", { name: answerName }));
}

function card(titlePart: string): HTMLElement {
  const element = group(titlePart).closest("li");
  if (!element) throw new Error(`card not found: ${titlePart}`);
  return element;
}

function alertText(): string {
  return screen.getAllByRole("alert").map((element) => element.textContent ?? "").join(" ");
}

function storedAnswers() {
  return parseStoredContractReviewAnswers(window.localStorage.getItem(CONTRACT_REVIEW_STORAGE_KEY));
}

describe("계약서 검토 체크리스트 화면", () => {
  it("법률 자문이 아니라는 안내와 기준을 먼저 보여 주고, 모든 항목에 ‘내 계약서에 있나요?’ 선택지를 둔다", () => {
    render(<ContractReviewChecklist />);
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("법률 자문이 아니에요");
    expect(note.textContent).toContain("고시 제2024-0032호(2024-06-13 개정)");
    expect(note.textContent).toContain("이후 개정은 확인하지 못했어요");

    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(CONTRACT_REVIEW_ITEMS.length);
    for (const radiogroup of groups) {
      expect(within(radiogroup).getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual([
        "present",
        "absent",
        "unsure",
      ]);
    }
    expect(group(DELAY_PENALTY).getAttribute("aria-labelledby")?.split(" ")).toHaveLength(2);
    expect(screen.getAllByText("내 계약서에 있나요?")).toHaveLength(CONTRACT_REVIEW_ITEMS.length);
    expect((screen.getByRole("progressbar") as HTMLProgressElement).value).toBe(0);
    expect(screen.getByText(`0 / ${CONTRACT_REVIEW_ITEMS.length}개 답함 (0%)`)).toBeTruthy();
  });

  it("제목 수준은 호출한 자리에 맞고 항목 제목이 분류 제목보다 한 단계 아래다", () => {
    const { unmount } = render(<ContractReviewChecklist headingLevel={2} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(CONTRACT_REVIEW_ITEMS.length);
    expect(screen.getByRole("heading", { level: 2, name: "일정과 분량" })).toBeTruthy();
    unmount();

    render(<ContractReviewChecklist headingLevel={3} />);
    expect(screen.getAllByRole("heading", { level: 4 })).toHaveLength(CONTRACT_REVIEW_ITEMS.length);
    expect(screen.getByRole("heading", { level: 3, name: "일정과 분량" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("‘있어요’가 주의 신호인 항목(지체상금)은 먼저 확인 항목으로 모이고 답이 이 브라우저에 저장된다", () => {
    render(<ContractReviewChecklist />);
    choose(DELAY_PENALTY, "있어요");

    expect(within(card(DELAY_PENALTY)).getByText("먼저 확인하세요")).toBeTruthy();
    expect(within(card(DELAY_PENALTY)).getByText("다음 행동")).toBeTruthy();
    expect(screen.getByText("먼저 확인할 항목 1개")).toBeTruthy();
    expect(screen.getByRole("button", { name: DELAY_PENALTY })).toBeTruthy();
    expect(screen.getByText(`1 / ${CONTRACT_REVIEW_ITEMS.length}개 답함 (5%)`)).toBeTruthy();
    expect(storedAnswers()).toEqual({ "delay-penalty": "present" });
  });

  it("‘없어요’가 주의 신호인 항목(수익 배분)과 문제 신호가 없는 답을 구분한다", () => {
    render(<ContractReviewChecklist />);
    choose(REVENUE_SHARE, "없어요");
    choose(PAUSE, "있어요");
    choose(DELAY_PENALTY, "없어요");

    expect(within(card(REVENUE_SHARE)).getByText("먼저 확인하세요")).toBeTruthy();
    expect(within(card(PAUSE)).getByText("표시된 문제 신호 없음")).toBeTruthy();
    expect(within(card(DELAY_PENALTY)).getByText("표시된 문제 신호 없음")).toBeTruthy();
    expect(within(card(PAUSE)).queryByText("다음 행동")).toBeNull();
    expect(screen.getByText("먼저 확인할 항목 1개")).toBeTruthy();
  });

  it("‘잘 모르겠어요’는 다시 확인이 필요한 항목으로 두고 다음 행동을 보여 준다", () => {
    render(<ContractReviewChecklist />);
    choose(PAUSE, "잘 모르겠어요");
    expect(within(card(PAUSE)).getByText("다시 확인 필요")).toBeTruthy();
    expect(within(card(PAUSE)).getByText("다음 행동")).toBeTruthy();
    // 주의 신호는 아니므로 ‘먼저 확인할 항목’ 목록에는 들어가지 않고, 요약에는 포함된다는 안내가 나온다.
    expect(screen.getByText("먼저 확인할 항목 0개")).toBeTruthy();
    expect(screen.getByText(/‘잘 모르겠음’ 1개와 아직 확인하지 않은/u)).toBeTruthy();
  });

  it("항목별로 답을 지울 수 있다", () => {
    render(<ContractReviewChecklist />);
    choose(DELAY_PENALTY, "있어요");
    const clear = within(card(DELAY_PENALTY)).getByRole("button", { name: "이 항목 답 지우기" });
    fireEvent.click(clear);
    expect(within(group(DELAY_PENALTY)).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(within(card(DELAY_PENALTY)).queryByRole("button", { name: "이 항목 답 지우기" })).toBeNull();
    expect(storedAnswers()).toEqual({});
    expect(window.localStorage.getItem(CONTRACT_REVIEW_STORAGE_KEY)).toBeNull();
  });

  it("저장된 답으로 시작하고 다른 탭의 변경을 따라간다", () => {
    window.localStorage.setItem(CONTRACT_REVIEW_STORAGE_KEY, serializeContractReviewAnswers({ pause: "present" }));
    render(<ContractReviewChecklist />);
    expect((within(group(PAUSE)).getByRole("radio", { name: "있어요" }) as HTMLInputElement).checked).toBe(true);

    window.localStorage.setItem(
      CONTRACT_REVIEW_STORAGE_KEY,
      serializeContractReviewAnswers({ pause: "present", "revenue-share": "absent" }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: CONTRACT_REVIEW_STORAGE_KEY }));
    });
    expect((within(group(REVENUE_SHARE)).getByRole("radio", { name: "없어요" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("먼저 확인할 항목 1개")).toBeTruthy();
  });

  it("‘답 모두 지우기’는 한 번 더 눌러야 지우고, 취소할 수 있다", () => {
    render(<ContractReviewChecklist />);
    const clearAll = screen.getByRole("button", { name: "답 모두 지우기" }) as HTMLButtonElement;
    expect(clearAll.disabled).toBe(true);

    choose(PAUSE, "있어요");
    fireEvent.click(screen.getByRole("button", { name: "답 모두 지우기" }));
    expect(screen.getByRole("status").textContent).toContain("한 번 더 누르면");
    expect(storedAnswers()).toEqual({ pause: "present" });

    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(storedAnswers()).toEqual({ pause: "present" });

    fireEvent.click(screen.getByRole("button", { name: "답 모두 지우기" }));
    fireEvent.click(screen.getByRole("button", { name: "정말 모두 지우기" }));
    expect(storedAnswers()).toEqual({});
    expect(screen.getByRole("status").textContent).toContain("모든 답을 지웠어요");
  });

  it("먼저 확인할 항목을 누르면 그 항목의 선택지로 포커스가 옮겨진다", () => {
    render(<ContractReviewChecklist />);
    choose(DELAY_PENALTY, "있어요");
    fireEvent.click(screen.getByRole("button", { name: DELAY_PENALTY }));
    expect(document.activeElement).toBe(within(group(DELAY_PENALTY)).getByRole("radio", { name: "있어요" }));
  });

  it("표준계약서 설명과 근거 위치는 접어 두었다가 펼치면 공식 문서 링크와 함께 보인다", () => {
    render(<ContractReviewChecklist />);
    const details = card(DELAY_PENALTY).querySelector("details");
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(within(card(DELAY_PENALTY)).getByText("표준계약서는 이렇게 다뤄요 · 내 계약서에서 볼 점")).toBeTruthy();
    expect(within(card(DELAY_PENALTY)).getByText(/‘지체상금’·‘위약금’·‘패널티’라는 표현이 나오지 않고/u)).toBeTruthy();
    const links = within(card(DELAY_PENALTY)).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("href")?.startsWith("https://")).toBe(true);
      expect(link.textContent).toContain("(새 창에서 열림)");
    }
  });

  it("근거 문서 목록은 확인한 공식 문서 전부를 확인일과 함께 링크한다", () => {
    render(<ContractReviewChecklist />);
    const heading = screen.getByRole("heading", { name: "근거 문서" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const links = within(section as HTMLElement).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(CONTRACT_REVIEW_SOURCES.map((source) => source.url));
    expect((section as HTMLElement).textContent).toContain("확인일 2026-10-15");
  });

  it("영어 화면은 영어 문구와 영어 요약을 쓴다", () => {
    act(() => useI18n.setState({ lang: "en" }));
    render(<ContractReviewChecklist />);
    expect(screen.getByRole("note").textContent).toContain("This is not legal advice");
    expect(screen.getByRole("radiogroup", { name: /Late-delivery penalties/u })).toBeTruthy();
    choose("Late-delivery penalties", "It is in my contract");
    expect(screen.getByText("Items to check first: 1")).toBeTruthy();
    expect(within(card("Late-delivery penalties")).getByText("Check this first")).toBeTruthy();
  });
});

describe("요약 내려받기·복사", () => {
  const originalCreateObjectUrl: unknown = Reflect.get(URL, "createObjectURL");
  const originalRevokeObjectUrl: unknown = Reflect.get(URL, "revokeObjectURL");

  afterEach(() => {
    Reflect.set(URL, "createObjectURL", originalCreateObjectUrl);
    Reflect.set(URL, "revokeObjectURL", originalRevokeObjectUrl);
  });

  function stubDownload() {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:contract-review-test";
    });
    Reflect.set(URL, "createObjectURL", createObjectURL);
    Reflect.set(URL, "revokeObjectURL", vi.fn());
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(this);
    });
    return { blobs, clicked, createObjectURL };
  }

  it("답을 담은 Markdown 파일을 브라우저에서 만들어 내려받는다", async () => {
    const { blobs, clicked, createObjectURL } = stubDownload();
    render(<ContractReviewChecklist />);
    choose(DELAY_PENALTY, "있어요");
    fireEvent.click(screen.getByRole("button", { name: "요약 내려받기 (.md)" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toMatch(/^toonstudio-contract-review-\d{4}-\d{2}-\d{2}\.md$/u);
    const text = await blobs[0]?.text();
    expect(text?.startsWith("# 계약서 검토 체크리스트 요약")).toBe(true);
    expect(text).toContain("법률 자문이 아닙니다");
    expect(text).toContain("- [ ] **지체상금(마감 지연 패널티)** — 내 답: 있음 · 먼저 확인 필요");
    expect(screen.getByRole("status").textContent).toContain("서버로 보내지 않았어요");
  });

  it("다운로드를 시작할 수 없으면 오류와 대안을 알린다", () => {
    Reflect.set(URL, "createObjectURL", undefined);
    render(<ContractReviewChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "요약 내려받기 (.md)" }));
    expect(alertText()).toContain("내려받기를 시작하지 못했어요");
  });

  it("요약을 클립보드에 복사하고 결과를 알린다", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    render(<ContractReviewChecklist />);
    choose(REVENUE_SHARE, "없어요");
    fireEvent.click(screen.getByRole("button", { name: "요약 복사" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("요약을 복사했어요"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain("내 답: 없음 · 먼저 확인 필요");
  });

  it("복사가 막히면 실패를 알린다", async () => {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), {
      clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    }));
    render(<ContractReviewChecklist />);
    fireEvent.click(screen.getByRole("button", { name: "요약 복사" }));
    await waitFor(() => expect(alertText()).toContain("복사하지 못했어요"));
  });

  it("요약 미리 보기는 열었을 때만 만들고 선택한 답을 반영한다", () => {
    render(<ContractReviewChecklist />);
    expect(screen.queryByLabelText("요약 Markdown 미리 보기")).toBeNull();
    choose(PAUSE, "있어요");
    const details = screen.getByText("요약 미리 보기").closest("details");
    expect(details).not.toBeNull();
    (details as HTMLDetailsElement).open = true;
    fireEvent(details as HTMLDetailsElement, new Event("toggle"));
    const preview = screen.getByLabelText("요약 Markdown 미리 보기");
    expect(preview.getAttribute("tabindex")).toBe("0");
    expect(preview.textContent).toContain("- [x] **휴재(쉬어 갈 권리)** — 내 답: 있음");
  });
});

describe("저장소를 쓸 수 없는 환경", () => {
  it("저장이 막혀도 체크리스트는 동작하고 저장되지 않는다는 사실을 알린다", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<ContractReviewChecklist />);
    expect(screen.getByText(/이 브라우저에서는 답을 저장할 수 없어요/u)).toBeTruthy();
    choose(PAUSE, "있어요");
    expect((within(group(PAUSE)).getByRole("radio", { name: "있어요" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(`1 / ${CONTRACT_REVIEW_ITEMS.length}개 답함 (5%)`)).toBeTruthy();
  });

  it("저장에 실패하면 경고와 ‘다시 저장’을 보여 주고, 성공하면 경고가 사라진다", () => {
    let failing = true;
    const backing = new Map<string, string>();
    const fake: Storage = {
      get length() {
        return backing.size;
      },
      clear: () => backing.clear(),
      getItem: (key) => backing.get(key) ?? null,
      key: (index) => Array.from(backing.keys())[index] ?? null,
      removeItem: (key) => {
        backing.delete(key);
      },
      setItem: (key, value) => {
        if (failing) throw new DOMException("quota", "QuotaExceededError");
        backing.set(key, value);
      },
    };
    vi.spyOn(window, "localStorage", "get").mockReturnValue(fake);
    render(<ContractReviewChecklist />);
    choose(PAUSE, "있어요");
    expect(alertText()).toContain("답을 저장하지 못했어요");
    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    expect(screen.queryByText(/답을 저장하지 못했어요/u)).toBeNull();
    expect(parseStoredContractReviewAnswers(backing.get(CONTRACT_REVIEW_STORAGE_KEY) ?? null)).toEqual({ pause: "present" });
  });
});
