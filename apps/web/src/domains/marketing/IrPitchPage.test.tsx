// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import { IrPitchPage } from "./IrPitchPage";
import { resolveIrBriefSection } from "./ir-brief-navigation";
import { IR_DECK_PDF, IR_DECK_PPTX, IR_DECK_UPDATED_AT } from "./ir-pitch-data";

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
    fireEvent.click(within(screen.getByRole("navigation", { name: "현재 주제의 세부 목차" })).getByRole("link", { name: "경쟁 지형" }));
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
    expect(screen.getByText(new RegExp(`${IR_DECK_UPDATED_AT} 검토본`))).toBeTruthy();
    expect(screen.getByRole("link", { name: "최신 웹 발표 보기" }).getAttribute("href")).toBe("/ir/present");
    expect(screen.getByRole("link", { name: "전체 발표 · 24씬" }).getAttribute("href")).toBe("/ir/present");
    expect(resolveIrBriefSection("?brief=unknown", "#ir-market-title")).toBe("market");
    expect(resolveIrBriefSection("?brief=problem", "#ir-market-title")).toBe("problem");
  });
  it("영문 다운로드에도 검토본의 기준일과 최신 발표 경로를 표시한다", () => {
    useI18n.setState({ lang: "en" });
    open("/ir?brief=downloads");
    expect(screen.getByText(new RegExp(`Review edition dated ${IR_DECK_UPDATED_AT}`))).toBeTruthy();
    expect(screen.getByRole("link", { name: "View the current web presentation" }).getAttribute("href")).toBe("/ir/present");
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
  it("각 목적 섹션에서 2026-11-22 실측 요약·분광 위젯·₩0 단위경제성·라이선스 카드·5대 Q&A를 제공한다", () => {
    open("/ir");
    expect(screen.getByText("PostgreSQL 17 스키마 원장")).toBeTruthy();
    cleanup();
    open("/ir?brief=difference");
    expect(screen.getByRole("slider", { name: "안료 혼색 비율 조절" })).toBeTruthy();
    cleanup();
    open("/ir?brief=model");
    expect(screen.getByText("₩0 / 월 (실측)")).toBeTruthy();
    expect(screen.getByTestId("unit-economics-output")).toBeTruthy();
    cleanup();
    open("/ir?brief=founder");
    expect(screen.getByText("1인 기업 상용 라이선스 무결성 & 크로스-LLM 배포 가드")).toBeTruthy();
    cleanup();
    open("/ir?brief=downloads");
    expect(screen.getByText("투자자·심사위원이 가장 먼저 묻는 5가지 질문")).toBeTruthy();
  });
  it("2026-11-25 웨이브 45~49 구현·보안 마일스톤과 /compare/studio 링크를 정직하게 동기화한다", () => {
    open("/ir");
    const milestones = screen.getByTestId("ir-wave-milestones");
    expect(milestones.textContent).toContain("현재 구현 · 2026-11-25 (웨이브 45~49)");
    expect(milestones.textContent).toContain("매출·고객 목표와 분리");
    expect(milestones.textContent).toContain("spectrum-editorial-theme.css");
    expect(milestones.textContent).toContain("180° 카메라 앵글 리프레이밍");
    expect(milestones.textContent).toContain("USB HID 0x0D");
    expect(milestones.textContent).toContain("106/106 GitHub Actions 최소 권한");
    expect(milestones.textContent).toContain("rustix 1.1.6");
    expect(milestones.textContent).toContain("pnpm audit 취약점 0건");
    expect(within(milestones).getByRole("link", { name: /경쟁사 7종 9축 정직 비교/ }).getAttribute("href")).toBe("/compare/studio");
    cleanup();
    open("/ir?brief=landscape");
    expect(screen.getByRole("link", { name: /경쟁사 7종 9축 정직 비교표 보기/ }).getAttribute("href")).toBe("/compare/studio");
    cleanup();
    open("/ir?brief=product");
    expect(screen.getByTestId("ir-wave-milestones").textContent).toContain("120Hz 프레임 예산 가드");
    cleanup();
    open("/ir?brief=founder");
    expect(screen.getByTestId("ir-security-governance-update").textContent).toContain("106/106 GitHub Actions");
    cleanup();
    useI18n.setState({ lang: "en" });
    open("/ir");
    const enMilestones = screen.getByTestId("ir-wave-milestones");
    expect(enMilestones.textContent).toContain("Current Build · 2026-11-25");
    expect(enMilestones.textContent).not.toMatch(/[가-힣]/);
  });
});
