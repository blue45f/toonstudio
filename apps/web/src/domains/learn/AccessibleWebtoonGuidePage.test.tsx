// @vitest-environment jsdom

/**
 * 접근성 있는 웹툰 만들기 안내 화면 테스트 — 제목 계층·목차·표 의미·상태 표시·점검표·외부 링크·영어 로케일.
 */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { AccessibleWebtoonGuidePage } from "./AccessibleWebtoonGuidePage";
import {
  GUIDE_CHECKLIST,
  GUIDE_DICTATION_MESSAGES,
  GUIDE_REFERENCES,
  GUIDE_SECTIONS,
} from "./accessible-webtoon-guide";

vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

const HANGUL = /[ㄱ-ㅎㅏ-ㅣ가-힣]/u;

function renderGuide() {
  return render(
    <MemoryRouter initialEntries={["/learn/accessibility"]}>
      <AccessibleWebtoonGuidePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  vi.mocked(useDocumentTitle).mockClear();
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("구조와 목차", () => {
  it("문서 제목을 정하고 h1 하나에 구간마다 h2를 둔다", () => {
    renderGuide();
    expect(useDocumentTitle).toHaveBeenCalledWith("접근성 있는 웹툰 만들기 · 툰스튜디오");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "접근성 있는 웹툰 만들기" })).toBeTruthy();

    const h2Names = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    for (const section of GUIDE_SECTIONS) expect(h2Names).toContain(section.title.ko);
    for (const name of ["알아 둘 한계", "게시 전 점검표", "참고 자료"]) expect(h2Names).toContain(name);
  });

  it("목차의 모든 링크가 화면 안의 구간 id를 가리킨다", () => {
    renderGuide();
    const toc = screen.getByRole("navigation", { name: "이 안내의 목차" });
    const links = within(toc).getAllByRole("link");
    expect(links).toHaveLength(GUIDE_SECTIONS.length + 3);
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("#guide-"), href).toBe(true);
      expect(document.getElementById(href.slice(1)), href).not.toBeNull();
    }
  });

  it("각 구간은 이름 붙은 region이고 상태를 아이콘과 글자로 보여 준다", () => {
    renderGuide();
    const expected: Record<string, string> = {
      "키보드로 작업하기": "일부만 · 환경에 따라 달라요",
      "말로 대사 입력하기": "준비 중 · 아직 화면에 연결되지 않았어요",
      "보기 편한 화면 고르기": "일부만 · 환경에 따라 달라요",
      "독자를 위한 대체 텍스트와 읽기 순서": "일부만 · 환경에 따라 달라요",
      "소리로 듣기: 캐릭터 토크 낭독": "일부만 · 환경에 따라 달라요",
    };
    for (const [title, status] of Object.entries(expected)) {
      const region = screen.getByRole("region", { name: title });
      expect(within(region).getByText(status), title).toBeTruthy();
    }
  });

  it("받아쓰기 구간은 아직 연결되지 않았다고 먼저 밝히고, 지금 쓸 수 있는 방법과 한계를 함께 적는다", () => {
    renderGuide();
    const region = screen.getByRole("region", { name: "말로 대사 입력하기" });
    expect(within(region).getByText(/아직 편집 화면에 연결되지 않았어요/u)).toBeTruthy();
    expect(within(region).getByText(/ToonStudio는 이 방법을 따로 검증하지 않았어요/u)).toBeTruthy();
    expect(within(region).getByText(/수치로 약속할 수 없어요/u)).toBeTruthy();
    // 지원 브라우저는 앱이 안내하는 범위(Chrome·Edge)까지만 적고 다른 브라우저는 확인하지 못했다고 밝힌다.
    expect(within(region).getByText(/그 밖의 브라우저가 지원하는지는 확인하지 못했어요/u)).toBeTruthy();
  });
});

describe("표의 의미", () => {
  it("단축키 표는 캡션·열 머리글·행 머리글을 갖고 키는 kbd로 표시한다", () => {
    renderGuide();
    const table = screen.getByRole("table", { name: "Studio 기본 단축키" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["동작", "키"]);

    const undoRow = within(table).getByRole("row", { name: /실행 취소/u });
    expect(within(undoRow).getByRole("rowheader").textContent).toBe("실행 취소");
    expect(undoRow.querySelector("kbd")?.textContent).toBe("Ctrl/⌘+Z");

    const findRow = within(table).getByRole("row", { name: /기능·설정 찾기/u });
    expect(Array.from(findRow.querySelectorAll("kbd")).map((kbd) => kbd.textContent)).toEqual(["Ctrl+K", "⌘K", "F1"]);

    // 가로로 넘칠 수 있는 표는 키보드로도 스크롤할 수 있게 포커스를 받는 region에 담는다.
    const scroller = screen.getByRole("region", { name: "단축키 표" });
    expect(scroller.getAttribute("tabindex")).toBe("0");
    expect(scroller.contains(table)).toBe(true);
  });

  it("받아쓰기 안내 표는 화면에 나오는 한국어 문장을 그대로 싣고 lang=ko로 표시한다", () => {
    renderGuide();
    const table = screen.getByRole("table", { name: "받아쓰기 안내와 해결 방법" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "화면에 나오는 안내",
      "뜻",
      "할 일",
    ]);
    const rowHeaders = within(table).getAllByRole("rowheader");
    expect(rowHeaders).toHaveLength(GUIDE_DICTATION_MESSAGES.length);
    expect(rowHeaders.map((cell) => cell.textContent)).toEqual(GUIDE_DICTATION_MESSAGES.map((row) => row.message));
    for (const cell of rowHeaders) expect(cell.getAttribute("lang")).toBe("ko");
  });
});

describe("링크", () => {
  it("구간 링크는 실제 기능 경로로 간다", () => {
    renderGuide();
    const expectedHrefs: Record<string, string> = {
      "Studio 매뉴얼: 기본 단축키": "/studio/manual/shortcuts",
      "사용 환경 안내 (마이크 권한·기능 진단)": "/studio/environment",
      "설정 열기 (화면·음성 탭)": "/settings",
      "게시 화면 (작품 대체 텍스트)": "/studio/publish",
      "캐릭터 토크 열기": "/character-chat",
      "캐릭터 챗 관리 (작가용)": "/character-chat/manage",
    };
    for (const [name, href] of Object.entries(expectedHrefs)) {
      expect(screen.getAllByRole("link", { name }).some((link) => link.getAttribute("href") === href), name).toBe(true);
    }
    expect(screen.getByRole("link", { name: /접근성 문제 제보/u }).getAttribute("href"))
      .toBe("/feedback?type=bug&tag=accessibility");
  });

  it("외부 참고 링크는 새 창으로 열리고 접근 가능한 이름에 그 사실이 들어 있다", () => {
    renderGuide();
    const section = screen.getByRole("region", { name: "참고 자료" });
    const links = within(section).getAllByRole("link");
    expect(links).toHaveLength(GUIDE_REFERENCES.length);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
      expect(link.getAttribute("href")?.startsWith("https://")).toBe(true);
      expect(link.textContent).toContain("(새 창)");
    }
  });
});

describe("게시 전 점검표", () => {
  it("항목을 표시하면 진행이 상태 영역으로 알려지고, 처음으로 돌리면 모두 해제된다", () => {
    renderGuide();
    const section = screen.getByRole("region", { name: "게시 전 점검표" });
    const total = GUIDE_CHECKLIST.length;
    const status = within(section).getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe(`0/${total}개 확인했어요`);

    const reset = within(section).getByRole("button", { name: "점검표 처음으로" }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);

    const boxes = within(section).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(total);
    fireEvent.click(boxes[0] as HTMLInputElement);
    fireEvent.click(boxes[2] as HTMLInputElement);
    expect(status.textContent).toBe(`2/${total}개 확인했어요`);
    expect(boxes[0]?.checked).toBe(true);
    expect(reset.disabled).toBe(false);

    // 같은 항목을 다시 누르면 해제된다.
    fireEvent.click(boxes[0] as HTMLInputElement);
    expect(status.textContent).toBe(`1/${total}개 확인했어요`);

    fireEvent.click(reset);
    expect(status.textContent).toBe(`0/${total}개 확인했어요`);
    expect(boxes.every((box) => !box.checked)).toBe(true);
  });

  it("점검 항목마다 라벨이 입력과 연결되어 있다", () => {
    renderGuide();
    const group = screen.getByRole("group", { name: "게시 전 점검 항목" });
    for (const item of GUIDE_CHECKLIST) {
      expect(within(group).getByRole("checkbox", { name: item.label.ko })).toBeTruthy();
    }
  });
});

describe("영어 로케일", () => {
  it("제목·상태·단축키·점검표 진행이 영어로 나오고 화면 문구에 한글이 섞이지 않는다", async () => {
    useI18n.getState().setLang("en");
    const view = renderGuide();
    await act(async () => {});

    expect(useDocumentTitle).toHaveBeenCalledWith("Making webtoons accessible · ToonStudio");
    expect(screen.getByRole("heading", { level: 1, name: "Making webtoons accessible" })).toBeTruthy();
    const dictation = screen.getByRole("region", { name: "Dictate dialogue by voice" });
    expect(within(dictation).getByText("Coming soon · not wired into a screen yet")).toBeTruthy();

    const table = screen.getByRole("table", { name: "Studio default shortcuts" });
    const panRow = within(table).getByRole("row", { name: /Pan the canvas/u });
    expect(panRow.querySelector("kbd")?.textContent).toBe("Space+drag");

    const checklist = screen.getByRole("region", { name: "Pre-publish checklist" });
    expect(within(checklist).getByRole("status").textContent).toBe(`0 of ${GUIDE_CHECKLIST.length} checked`);

    // 앱이 실제로 보여 주는 한국어 안내문(lang="ko")을 뺀 나머지에는 한글이 없어야 한다.
    const clone = view.container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[lang="ko"]').forEach((node) => node.remove());
    expect(clone.textContent?.match(HANGUL)?.[0]).toBeUndefined();
  });
});
