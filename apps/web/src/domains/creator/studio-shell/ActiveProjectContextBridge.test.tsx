// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXAMPLE_PROJECT_ID } from "../studio-example-project-content";
import { SAMPLE_PROJECT_ID } from "../studio-sample-manuscript-content";
import { ActiveProjectContextBridge } from "./ActiveProjectContextBridge";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";

const CONTEXT_KEY = "toonstudio:active-project-context:v1";
const RETURN_KEY = "toonstudio:active-project-bridge:return:v1";
const originalNavigationEntries = Object.getOwnPropertyDescriptor(window.performance, "getEntriesByType");
function nativeNavigationType(type: "navigate" | "reload" | "back_forward") {
  Object.defineProperty(window.performance, "getEntriesByType", {
    configurable: true,
    value: (entryType: string) => entryType === "navigation" ? [{ entryType, type }] : [],
  });
}
function nativePageReturn() {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  fireEvent(window, event);
}
const fixtures = vi.hoisted(() => ({ projects: [] as StudioProjectLibraryEntry[], lang: "ko" }));

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: fixtures.lang }),
}));
vi.mock("@/shared/navigation/router-link", async () => {
  const { Link } = await import("react-router-dom");
  return { default: ({ children, href, onClick, ...props }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>) => href.startsWith("/studio/")
    ? <a href={href} {...props} onClick={(event) => { onClick?.(event); event.preventDefault(); }}>{children}</a>
    : <Link to={href} onClick={onClick} {...props}>{children}</Link> };
});
vi.mock("./useStudioProjectLibrary", () => ({
  useStudioProjectLibrary: () => ({ projects: fixtures.projects, state: null, error: null, reload: vi.fn() }),
}));

function project(id: string, title: string, lastOpenedAt: string): StudioProjectLibraryEntry {
  return {
    id, title, kind: "webtoon", status: "active", statusBeforeTrash: null,
    templateId: null, description: "", primaryLocale: "ko-KR",
    createdAt: "2026-09-20T00:00:00.000Z", updatedAt: lastOpenedAt, lastOpenedAt,
    lastOpenedDocumentId: null, thumbnailUrl: null, definition: null,
  };
}

function ContextHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  return <main id="main-content" tabIndex={-1}>
    <output data-testid="route">{`${location.pathname}${location.search}`}</output>
    <button onClick={() => navigate("/research?project=project-a")}>다른 자료로</button>
    <button onClick={() => navigate("/learn/another?project=project-a")}>같은 학습 영역</button>
    <button onClick={() => navigate("/market?project=project-a")}>마켓으로</button>
    <button onClick={() => navigate("/learn?project=project-b")}>다른 작품 학습</button>
    <button onClick={() => navigate(-1)}>뒤로</button>
    <button onClick={() => navigate("/learn?project=project-a&view=library&q=채색")}>검색 조건 변경</button>
    <button onClick={() => navigate("/learn?view=library&q=채색")}>일반 검색 조건 변경</button>
    <input aria-label="페이지의 다른 입력" />
    <ActiveProjectContextBridge />
    <h1>페이지 본문</h1>
  </main>;
}
function show(route = "/market", key = "source-entry") {
  return render(<MemoryRouter initialEntries={[{ pathname: route.split("?")[0], search: route.includes("?") ? `?${route.split("?")[1]}` : "", key }]}><ContextHarness /></MemoryRouter>);
}
function disclosure() {
  const node = document.querySelector("[data-active-project-context] details");
  if (!(node instanceof HTMLDetailsElement)) throw new Error("현재 작품 접기 누락");
  return node;
}
function summary() {
  const node = disclosure().querySelector("summary");
  if (!(node instanceof HTMLElement)) throw new Error("현재 작품 메뉴 열기 누락");
  return node;
}
function openMenu() {
  if (!disclosure().open) fireEvent.click(summary());
  expect(disclosure().open).toBe(true);
}
function selectedTitle() {
  return document.querySelector("[data-active-project-title]");
}

beforeEach(() => {
  window.sessionStorage.clear(); fixtures.lang = "ko"; nativeNavigationType("navigate");
  fixtures.projects = [
    project("project-a", "최근 작품", "2026-09-26T02:00:00.000Z"),
    project("project-b", "두 번째 작품", "2026-09-25T02:00:00.000Z"),
  ];
});
afterEach(() => {
  cleanup(); window.sessionStorage.clear(); vi.restoreAllMocks();
  if (originalNavigationEntries) Object.defineProperty(window.performance, "getEntriesByType", originalNavigationEntries);
  else Reflect.deleteProperty(window.performance, "getEntriesByType");
});

describe("현재 작품 메뉴의 정보 밀도와 선택", () => {
  it("작품명은 기본 노출하고 부가 행동은 이름 있는 같은 메뉴에서 연다", () => {
    show();
    expect(disclosure().open).toBe(false);
    expect(selectedTitle()?.textContent).toBe("최근 작품");
    expect(summary().textContent).toContain("더 보기");
    const menu = document.getElementById(summary().getAttribute("aria-controls") ?? "");
    expect(menu?.getAttribute("aria-label")).toBe("현재 작품 메뉴");
    openMenu();
    for (const control of [
      screen.getByRole("combobox", { name: "작품 바꾸기" }),
      screen.getByRole("link", { name: "프로젝트" }),
      screen.getByRole("link", { name: /이 작품에 소재 추가/u }),
      screen.getByRole("button", { name: "이 작품 안내 숨기기" }),
    ]) expect(control.closest("[role='region']")).toBe(menu);
    expect(document.querySelector("[data-active-project-context]")?.textContent).not.toMatch(/CURRENT WORK|문맥 연결됨|저장됨/u);
  });

  it("작품을 바꾸면 기존 session 문맥과 모든 실제 목적지가 함께 바뀐다", () => {
    show(); openMenu();
    const selector = screen.getByRole("combobox", { name: "작품 바꾸기" });
    if (!(selector instanceof HTMLSelectElement)) throw new Error("작품 선택기 누락");
    expect(selector.value).toBe("project-a");
    fireEvent.change(selector, { target: { value: "project-b" } });
    expect(selector.value).toBe("project-b");
    expect(disclosure().open).toBe(true);
    expect(selectedTitle()?.textContent).toBe("두 번째 작품");
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-b");
    expect(screen.getByRole("link", { name: /이 작품에 소재 추가/u }).getAttribute("href")).toBe("/studio/assets?project=project-b&view=market");
    expect(screen.getByRole("link", { name: "프로젝트" }).getAttribute("href")).toBe("/studio/p/project-b/overview");
  });

  it("한 작품이면 중복 선택기를 만들지 않고 기존 리서치 목적지를 제공한다", () => {
    fixtures.projects = [project("project-a", "한 작품", "2026-09-26T02:00:00.000Z")];
    show("/research"); openMenu();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(selectedTitle()?.textContent).toBe("한 작품");
    expect(screen.getByRole("link", { name: /이 작품의 리서치로 저장/u }).getAttribute("href")).toBe("/research?project=project-a");
  });

  it.each([[EXAMPLE_PROJECT_ID, "예제"], [SAMPLE_PROJECT_ID, "샘플"]])("고정 예제 ID %s만 %s로 표시한다", (id, label) => {
    fixtures.projects = [project(id, "선택한 연습 원고", "2026-09-26T02:00:00.000Z")];
    show("/learn");
    expect(document.querySelector("[data-active-project-sample]")?.textContent).toBe(label);
  });

  it("이름에 샘플이 들어가는 개인 작품을 예제로 분류하지 않는다", () => {
    fixtures.projects = [project("my-own-work", "샘플이라는 이름의 나의 작품", "2026-09-26T02:00:00.000Z")];
    show("/learn");
    expect(selectedTitle()?.textContent).toBe("샘플이라는 이름의 나의 작품");
    expect(document.querySelector("[data-active-project-sample]")).toBeNull();
  });

  it("긴 제목은 전체 이름과 선택 항목을 유지한다", () => {
    const title = "아주 긴 현재 작품 제목과 한글·English ".repeat(5).slice(0, 120);
    fixtures.projects = [project("long-work", title, "2026-09-26T03:00:00.000Z"), ...fixtures.projects];
    show();
    expect(selectedTitle()?.textContent).toBe(title);
    expect(selectedTitle()?.getAttribute("title")).toBe(title);
    openMenu();
    expect(screen.getByRole("option", { name: title }).getAttribute("value")).toBe("long-work");
  });

  it("사용할 작품이 없으면 허위 선택이나 새 행동 없이 본문을 유지한다", () => {
    fixtures.projects = [];
    window.sessionStorage.setItem(CONTEXT_KEY, "missing-work");
    show("/learn?project=missing-work");
    expect(document.querySelector("[data-active-project-context]")).toBeNull();
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("missing-work");
    expect(screen.getByRole("heading", { name: "페이지 본문" })).toBeTruthy();
  });

  it("지원하지 않는 영역에서는 안내를 노출하지 않는다", () => {
    show("/account");
    expect(document.querySelector("[data-active-project-context]")).toBeNull();
  });

  it("영문에서도 선택명과 결과 중심 메뉴를 제공한다", () => {
    fixtures.lang = "en";
    show("/learn"); openMenu();
    expect(screen.getByRole("combobox", { name: "Change work" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Practice in this work/u }).getAttribute("href")).toBe("/learn?project=project-a");
    expect(screen.getByRole("button", { name: "Hide work notice" })).toBeTruthy();
  });
});

describe("작품 메뉴의 키보드와 숨김", () => {
  it("내부 Escape는 접고 summary로 초점을 돌리며 선택을 지우지 않는다", () => {
    show("/learn"); openMenu();
    const selector = screen.getByRole("combobox", { name: "작품 바꾸기" });
    fireEvent.change(selector, { target: { value: "project-b" } }); selector.focus();
    fireEvent.keyDown(selector, { key: "Escape" });
    expect(disclosure().open).toBe(false);
    expect(document.activeElement).toBe(summary());
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-b");
    expect(selectedTitle()?.textContent).toBe("두 번째 작품");
  });

  it("다른 입력의 Escape와 조합 중 Escape를 가로채지 않는다", () => {
    show(); openMenu();
    const outside = screen.getByRole("textbox", { name: "페이지의 다른 입력" }); outside.focus();
    fireEvent.keyDown(outside, { key: "Escape" });
    expect(disclosure().open).toBe(true); expect(document.activeElement).toBe(outside);
    const selector = screen.getByRole("combobox", { name: "작품 바꾸기" }); selector.focus();
    fireEvent.keyDown(selector, { key: "Escape", isComposing: true });
    expect(disclosure().open).toBe(true); expect(document.activeElement).toBe(selector);
  });

  it("내부에 초점이 있는 채 native 접기가 닫혀도 숨은 조작에 초점을 남기지 않는다", () => {
    show(); openMenu();
    screen.getByRole("link", { name: "프로젝트" }).focus();
    const details = disclosure(); details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(document.activeElement).toBe(summary());
  });

  it("native 접힘 알림이 페이지의 다른 입력 초점을 옮기지 않는다", () => {
    show(); openMenu();
    const outside = screen.getByRole("textbox", { name: "페이지의 다른 입력" }); outside.focus();
    const details = disclosure(); details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(document.activeElement).toBe(outside);
  });

  it("안내 숨김은 작품 선택을 유지하고 현재 본문에 키보드 문맥을 넘긴다", () => {
    show("/learn"); openMenu();
    const close = screen.getByRole("button", { name: "이 작품 안내 숨기기" }); close.focus(); fireEvent.click(close);
    expect(document.querySelector("[data-active-project-context]")).toBeNull();
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-a");
    expect(window.sessionStorage.getItem("toonstudio:active-project-bridge:dismissed:learn:project-a")).toBe("1");
    expect(document.activeElement).toBe(document.getElementById("main-content"));
  });

  it("안내를 코드로 숨길 때 이미 다른 입력에 있는 초점은 유지한다", () => {
    show(); openMenu();
    const outside = screen.getByRole("textbox", { name: "페이지의 다른 입력" }); outside.focus();
    fireEvent.click(screen.getByRole("button", { name: "이 작품 안내 숨기기" }));
    expect(document.activeElement).toBe(outside);
  });
});

describe("기존 선택 우선순위와 영역별 복귀", () => {
  it("URL 명시 작품이 session보다 먼저이며 알 수 없는 URL은 session으로 복귀한다", () => {
    window.sessionStorage.setItem(CONTEXT_KEY, "project-b");
    const view = show("/learn?project=project-a");
    expect(selectedTitle()?.textContent).toBe("최근 작품");
    view.unmount(); window.sessionStorage.setItem(CONTEXT_KEY, "project-b");
    show("/learn?project=unknown");
    expect(selectedTitle()?.textContent).toBe("두 번째 작품");
  });

  it("route 안의 수동 선택은 URL보다 우선하고 다른 영역 왕복 뒤에도 유지된다", async () => {
    show("/learn?project=project-a"); openMenu();
    fireEvent.change(screen.getByRole("combobox", { name: "작품 바꾸기" }), { target: { value: "project-b" } });
    expect(selectedTitle()?.textContent).toBe("두 번째 작품");
    fireEvent.click(screen.getByRole("button", { name: "다른 자료로" }));
    await waitFor(() => expect(selectedTitle()?.textContent).toBe("최근 작품"));
    expect(disclosure().open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => expect(selectedTitle()?.textContent).toBe("두 번째 작품"));
    expect(screen.getByTestId("route").textContent).toBe("/learn?project=project-a");
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-b");
    openMenu(); expect(screen.getByRole("link", { name: /이 작품에서 실습/u }).getAttribute("href")).toBe("/learn?project=project-b");
  });

  it("같은 영역과 작품의 숨김을 유지하고 다른 영역·작품에는 전파하지 않는다", async () => {
    show("/learn?project=project-a"); openMenu();
    fireEvent.click(screen.getByRole("button", { name: "이 작품 안내 숨기기" }));
    fireEvent.click(screen.getByRole("button", { name: "같은 학습 영역" }));
    expect(document.querySelector("[data-active-project-context]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "마켓으로" }));
    await waitFor(() => expect(selectedTitle()?.textContent).toBe("최근 작품"));
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => expect(document.querySelector("[data-active-project-context]")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "다른 작품 학습" }));
    await waitFor(() => expect(selectedTitle()?.textContent).toBe("두 번째 작품"));
    expect(window.sessionStorage.getItem("toonstudio:active-project-bridge:dismissed:learn:project-b")).toBeNull();
  });
});


describe("현재 작품의 검색 선택과 실제 문서 경계 복귀", () => {
  it.each([
    ["/learn?project=project-a", "검색 조건 변경"],
    ["/learn", "일반 검색 조건 변경"],
  ])("%s의 탭·검색 변경은 수동 작품 선택을 유지한다", (route, action) => {
    show(route); openMenu();
    fireEvent.change(screen.getByRole("combobox", { name: "작품 바꾸기" }), { target: { value: "project-b" } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    expect(selectedTitle()?.textContent).toBe("두 번째 작품");
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-b");
    expect(disclosure().open).toBe(false);
  });

  it("프로젝트로 나간 history entry로 native Back하면 메뉴와 원래 링크 초점을 복원한다", async () => {
    const first = show("/learn"); openMenu();
    const projectLink = screen.getByRole("link", { name: "프로젝트" });
    projectLink.focus(); fireEvent.click(projectLink);
    expect(window.sessionStorage.getItem(RETURN_KEY)).not.toBeNull();
    first.unmount(); nativeNavigationType("back_forward");
    show("/learn");
    await waitFor(() => expect(disclosure().open).toBe(true));
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "프로젝트" }));
    expect(window.sessionStorage.getItem(RETURN_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(CONTEXT_KEY)).toBe("project-a");
  });

  it("소재 추가의 native 경계와 BFCache 복귀도 실제 연결 행동으로 초점을 돌린다", () => {
    show("/market"); openMenu();
    const link = screen.getByRole("link", { name: /이 작품에 소재 추가/u });
    link.focus(); fireEvent.click(link);
    expect(window.sessionStorage.getItem(RETURN_KEY)).not.toBeNull();
    disclosure().open = false; link.blur();
    nativePageReturn();
    expect(disclosure().open).toBe(true);
    expect(document.activeElement).toBe(link);
    expect(window.sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it.each(["navigate", "reload"] as const)("같은 주소의 일반 %s 진입은 과거 복귀 기록으로 초점을 옮기지 않는다", (type) => {
    const first = show("/learn"); openMenu();
    fireEvent.click(screen.getByRole("link", { name: "프로젝트" }));
    first.unmount(); nativeNavigationType(type);
    show("/learn");
    expect(disclosure().open).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ["/learn", "another-entry"],
    ["/market", "source-entry"],
    ["/learn?project=project-b", "source-entry"],
  ])("다른 URL·history key·작품인 %s/%s에서는 초점을 가로채지 않는다", (route, key) => {
    const first = show("/learn"); openMenu();
    fireEvent.click(screen.getByRole("link", { name: "프로젝트" }));
    first.unmount(); nativeNavigationType("back_forward");
    show(route, key);
    expect(disclosure().open).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it("다른 입력에 이미 복원된 초점은 BFCache 복귀가 빼앗지 않는다", () => {
    show("/learn"); openMenu();
    fireEvent.click(screen.getByRole("link", { name: "프로젝트" }));
    const outside = screen.getByRole("textbox", { name: "페이지의 다른 입력" }); outside.focus();
    disclosure().open = false;
    nativePageReturn();
    expect(document.activeElement).toBe(outside);
    expect(disclosure().open).toBe(false);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])("다른 탭/보조 클릭 %j에는 현재 탭 복귀 기록을 쓰지 않는다", (modifiers) => {
    show("/learn"); openMenu();
    fireEvent.click(screen.getByRole("link", { name: "프로젝트" }), modifiers);
    expect(window.sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("이미 취소된 클릭에는 복귀 기록을 쓰지 않는다", () => {
    show("/learn"); openMenu();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true }); event.preventDefault();
    fireEvent(screen.getByRole("link", { name: "프로젝트" }), event);
    expect(window.sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("sessionStorage getter가 거부돼도 선택과 프로젝트 링크를 계속 쓴다", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("storage denied", "SecurityError"); } });
    try {
      show("/learn"); openMenu();
      fireEvent.change(screen.getByRole("combobox", { name: "작품 바꾸기" }), { target: { value: "project-b" } });
      expect(selectedTitle()?.textContent).toBe("두 번째 작품");
      expect(() => fireEvent.click(screen.getByRole("link", { name: "프로젝트" }))).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(window, "sessionStorage", descriptor);
    }
  });
});


describe("현재 작품의 실습 SPA 복귀", () => {
  it("실습 링크로 이동한 뒤 실제 POP에서는 원래 펼친 메뉴·실습 링크를 복원한다", async () => {
    show("/learn/lesson"); openMenu();
    const practice = screen.getByRole("link", { name: /이 작품에서 실습/u }); practice.focus();
    fireEvent.click(practice);
    await waitFor(() => expect(screen.getByTestId("route").textContent).toBe("/learn?project=project-a"));
    expect(disclosure().open).toBe(false);
    expect(window.sessionStorage.getItem(RETURN_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => expect(screen.getByTestId("route").textContent).toBe("/learn/lesson"));
    expect(disclosure().open).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /이 작품에서 실습/u }));
    expect(window.sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it("SPA POP도 이미 사용 중인 외부 입력 초점을 침범하지 않는다", async () => {
    show("/learn/lesson"); openMenu();
    fireEvent.click(screen.getByRole("link", { name: /이 작품에서 실습/u }));
    const outside = screen.getByRole("textbox", { name: "페이지의 다른 입력" }); outside.focus();
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
    await waitFor(() => expect(screen.getByTestId("route").textContent).toBe("/learn/lesson"));
    expect(document.activeElement).toBe(outside);
    expect(disclosure().open).toBe(false);
  });
});
