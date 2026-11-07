// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioCreatorSupportPage } from "./StudioCreatorSupportPage";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: () => undefined }));
const BrowserURL = URL;
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("URL", class extends BrowserURL {
    static createObjectURL = vi.fn(() => "blob:local-support-export");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); });

describe("support request local draft/export status", () => {
  it.each([false, true])("reports persistence truthfully when storage is blocked=%s", (blocked) => {
    if (blocked) vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<MemoryRouter><StudioCreatorSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: "도움이 필요한 내용" }), { target: { value: "Review my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    if (blocked) {
      expect(screen.queryByText("브라우저에 초안을 저장했습니다.")).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
      expect(window.localStorage.getItem("toonstudio:creator-support-request:v1")).toBeNull();
    } else {
      expect(screen.getByText("브라우저에 초안을 저장했습니다.")).toBeTruthy();
      expect(JSON.parse(window.localStorage.getItem("toonstudio:creator-support-request:v1")!))
        .toMatchObject({ version: 1, summary: "Review my draft" });
    }
  });
});


describe("지원 브리프 입력과 접근성", () => {
  it("브리프 바로가기와 저장 범위, 입력 도움말을 제공한다", () => {
    render(<MemoryRouter><StudioCreatorSupportPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "지원 브리프 작성" }).getAttribute("href")).toBe("#support-request");
    const summary = screen.getByRole("textbox", { name: "도움이 필요한 내용" });
    expect(summary.getAttribute("aria-describedby")).toBe("support-request-hint support-request-count");
    expect(screen.getByRole("textbox", { name: "연락 방법 (선택)" }).getAttribute("aria-describedby")).toBe("support-request-privacy");
    expect(screen.getByText(/상담 접수나 전송은 되지 않습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(summary, { target: { value: "작업 설명" } });
    expect(screen.getByText("5 / 6,000자")).toBeTruthy();
    expect(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["category", "contact", "summary"])("%s 수정 후 과거 저장 완료 상태를 남기지 않는다", (field) => {
    render(<MemoryRouter><StudioCreatorSupportPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole("textbox", { name: "도움이 필요한 내용" }), { target: { value: "초안" } });
    fireEvent.click(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }));
    expect(screen.getByRole("status").textContent).toContain("브라우저에 초안을 저장했습니다");
    const control = field === "category" ? screen.getByRole("combobox", { name: "지원 유형" })
      : screen.getByRole("textbox", { name: field === "contact" ? "연락 방법 (선택)" : "도움이 필요한 내용" });
    fireEvent.change(control, { target: { value: field === "category" ? "rights" : "수정 내용" } });
    expect(screen.queryByRole("status")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("toonstudio:creator-support-request:v1")!)).toMatchObject({ summary: "초안", category: "story", contact: "" });
  });

  it("저장 실패 뒤 편집하면 이전 경고를 지우고 다시 저장할 수 있다", () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    render(<MemoryRouter><StudioCreatorSupportPage /></MemoryRouter>);
    const summary = screen.getByRole("textbox", { name: "도움이 필요한 내용" });
    fireEvent.change(summary, { target: { value: "초안" } });
    fireEvent.click(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(summary, { target: { value: "다시 저장할 초안" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "요청 브리프 저장·내보내기" }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(storage).toHaveBeenCalledTimes(2);
  });
});
