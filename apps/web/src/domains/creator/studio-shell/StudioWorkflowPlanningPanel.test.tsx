// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioLibraryPersonalizePanels } from "./StudioLibraryPersonalizePanels";

import { useI18n } from "@/shared/lib/i18n";

const requests = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../studio-intent-lazy-loader", async (importOriginal) => {
  const original = await importOriginal<typeof import("../studio-intent-lazy-loader")>();
  return {
    ...original,
    createStudioIntentLazyLoader: <TModule,>(importer: () => Promise<TModule>) => {
      const loader = original.createStudioIntentLazyLoader(importer);
      return { ...loader, load: () => { requests.load(); return loader.load(); } };
    },
  };
});

// 주변의 기존 프로필 요청만 격리한다. 새 계획 패널과 두 예제·경쟁사 메뉴는 실제 구현을 쓴다.
vi.mock("./StudioRoleWorkspacePanel", () => ({ StudioRoleWorkspacePanel: () => null }));
vi.mock("./StudioProjectStartPanel", () => ({ StudioProjectStartPanel: () => null }));
vi.mock("./StudioRolePersonalizationCenter", () => ({ StudioRolePersonalizationCenter: () => null }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="planning-location">{location.pathname}{location.search}</output>;
}

function renderEntry(locale: "ko" | "en" = "ko") {
  return render(
    <MemoryRouter initialEntries={["/settings/role?tab=workspace"]}>
      <StudioLibraryPersonalizePanels locale={locale} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function openPlanning() {
  fireEvent.click(screen.getByRole("button", { name: "분업 계획·만화 프리셋 펼치기" }));
  return screen.findByTestId("studio-workflow-planning-panel");
}

beforeEach(() => { requests.load.mockClear(); useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });

describe("공개 작업환경의 분업 계획·만화 프리셋 진입", () => {
  it("접힌 화면에서는 예제를 마운트하지 않고 의도적으로 연 뒤 닫을 때 초점을 돌려준다", async () => {
    renderEntry();
    const trigger = screen.getByRole("button", { name: "분업 계획·만화 프리셋 펼치기" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("studio-workflow-planning-panel")).toBeNull();
    expect(screen.queryByTestId("webtoon-role-pipeline-section")).toBeNull();
    expect(screen.queryByTestId("higgsfield-mangaka-section")).toBeNull();
    expect(requests.load).not.toHaveBeenCalled();
    await openPlanning();
    expect(requests.load).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(await screen.findByTestId("webtoon-role-pipeline-section")).toBeTruthy();
    expect(screen.queryByTestId("higgsfield-mangaka-section")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "분업 계획·만화 프리셋 접기" }));
    expect(screen.queryByTestId("studio-workflow-planning-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await openPlanning();
    expect(await screen.findByTestId("webtoon-role-pipeline-section")).toBeTruthy();
    expect(requests.load).toHaveBeenCalledTimes(1);
  });

  it("두 실제 예제 탭은 키보드로 전환하고 떠난 미리보기는 안내대로 초기화한다", async () => {
    renderEntry();
    await openPlanning();
    const rolesTab = screen.getByRole("tab", { name: "직무별 분업 계획" });
    const mangakaTab = screen.getByRole("tab", { name: "만화·웹툰 예제" });
    const assistant = screen.getByTestId("role-pipeline-select-line-assistant");
    fireEvent.click(assistant);
    expect(assistant.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(rolesTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(mangakaTab);
    expect(mangakaTab.getAttribute("aria-selected")).toBe("true");
    expect(rolesTab.getAttribute("tabindex")).toBe("-1");
    const panel = screen.getByRole("tabpanel", { name: "만화·웹툰 예제" });
    expect(within(panel).getByTestId("higgsfield-mangaka-section")).toBeTruthy();
    expect(screen.queryByTestId("webtoon-role-pipeline-section")).toBeNull();
    fireEvent.click(within(panel).getByTestId("mangaka-genre-preset-kr-action-noir"));
    expect((within(panel).getByTestId("mangaka-portal-select") as HTMLSelectElement).value).toBe("daum");
    fireEvent.keyDown(mangakaTab, { key: "Home" });
    expect(document.activeElement).toBe(rolesTab);
    expect(rolesTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("role-pipeline-select-story").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("higgsfield-mangaka-section")).toBeNull();
    expect(screen.getByTestId("planning-location").textContent).toBe("/settings/role?tab=workspace");
  });

  it("효과 직군 검색에서 고른 실제 배치를 검증된 편집기 URL로 연다", async () => {
    renderEntry();
    await openPlanning();
    fireEvent.click(screen.getByTestId("competitor-role-filter-color"));
    fireEvent.change(screen.getByRole("searchbox", { name: "익숙한 도구 또는 작업 검색" }), {
      target: { value: "Spine" },
    });
    expect(screen.getByText("Rive · Toon Boom · Live2D")).toBeTruthy();
    expect(screen.getByTestId("planning-location").textContent).toBe("/settings/role?tab=workspace");
    fireEvent.click(screen.getByRole("button", { name: "애니메이션 배치 선택" }));
    expect(screen.getByTestId("planning-location").textContent).toBe("/studio/canvas?roleWorkspace=animation");
  });

  it("영문 진입도 실제 계획 패널을 열고 Escape로 닫는다", async () => {
    useI18n.setState({ lang: "en" });
    renderEntry("en");
    const trigger = screen.getByRole("button", { name: "Open production planning and comic presets" });
    fireEvent.click(trigger);
    const planning = await screen.findByTestId("studio-workflow-planning-panel");
    expect(screen.getByRole("tab", { name: "Role work plan" }).getAttribute("aria-selected")).toBe("true");
    expect(within(planning).getByText(/These preview choices do not edit the current document/u)).toBeTruthy();
    expect(screen.getByTestId("role-pipeline-scope-notice").textContent).toContain("production plan and permission preview");
    fireEvent.keyDown(planning, { key: "Escape" });
    expect(screen.queryByTestId("studio-workflow-planning-panel")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
