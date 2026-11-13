// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import { IrPitchPage } from "./IrPitchPage";
import { resolveIrBriefSection } from "./ir-brief-navigation";
import { IR_DECK_PDF, IR_DECK_PPTX } from "./ir-pitch-data";

function Probe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output data-testid="route">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>검증용 뒤로</button></>;
}
function open(entry = "/ir") { return render(<MemoryRouter initialEntries={[entry]}><IrPitchPage /><Probe /></MemoryRouter>); }
beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(cleanup);
describe("투자 소개 목적별 페이지", () => {
  it("첫 화면은 세 목적을 보여주고 본문은 선택 후 하나씩 읽는다", () => {
    const { container } = open("/ir?from=meeting");
    expect(screen.getByRole("navigation", { name: "투자 소개 목적 고르기" }).querySelectorAll("a")).toHaveLength(3);
    expect(container.querySelectorAll("[data-ir-brief-section]")).toHaveLength(1);
    expect(container.querySelector('[data-ir-brief-section="problem"]')).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /제품과 문제/ }));
    expect(screen.getByTestId("route").textContent).toBe("/ir?from=meeting&brief=problem#ir-problem-title");
    expect(container.querySelectorAll("[data-ir-brief-section]")).toHaveLength(1);
    expect(document.activeElement).toBe(document.getElementById("ir-problem-title"));
    expect(screen.getByRole("navigation", { name: "현재 주제의 세부 목차" }).querySelectorAll("a")).toHaveLength(5);
    fireEvent.click(within(screen.getByRole("navigation", { name: "현재 주제의 세부 목차" })).getByRole("link", { name: "경쟁 지형", exact: true }));
    expect(container.querySelector('[data-ir-brief-section="landscape"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검증용 뒤로" }));
    expect(container.querySelector('[data-ir-brief-section="problem"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.getElementById("ir-problem-title"));
  });
  it("기존 hash 딥링크·자료 다운로드·별도 발표 플레이어를 보존한다", () => {
    const { container } = open("/ir#ir-downloads-title");
    expect(container.querySelector('[data-ir-brief-section="downloads"]')).not.toBeNull();
    expect(container.querySelector(`a[href="${IR_DECK_PDF}"]`)?.hasAttribute("download")).toBe(true);
    expect(container.querySelector(`a[href="${IR_DECK_PPTX}"]`)?.hasAttribute("download")).toBe(true);
    expect(screen.getByRole("link", { name: "전체 발표 · 24씬" }).getAttribute("href")).toBe("/ir/present");
    expect(resolveIrBriefSection("?brief=unknown", "#ir-market-title")).toBe("market");
    expect(resolveIrBriefSection("?brief=problem", "#ir-market-title")).toBe("problem");
  });
  it("발표 overlay의 키보드 이동·종료와 원래 실행 버튼 포커스를 유지한다", () => {
    open();
    const trigger = screen.getByRole("button", { name: "발표 시작" });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "IR 발표 모드" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("dialog").textContent).toContain("2 / 10");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
