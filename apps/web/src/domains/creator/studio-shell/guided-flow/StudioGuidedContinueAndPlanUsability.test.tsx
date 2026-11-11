// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import {
  DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  readStudioWebtoonOnboardingProfile,
  type WebtoonOnboardingSelection,
} from "@/shared/lib/webtoon-production-onboarding";

import { CreateStartPage } from "../../CreateStartPage";
import { writeStudioExactResumeContext } from "../../studio-exact-resume-context";
import type {
  StudioProjectCollaboration,
  StudioProjectPurpose,
  StudioProjectStartPoint,
} from "../../studio-project-definition";
import { createStudioProjectDocument } from "../../studio-project-document-store";
import {
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
} from "../../studio-project-library-store";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "../StudioProjectCreatePage";
import { CreateStartContinueSection } from "./CreateStartContinueSection";
import { StudioCreateProductionPlanSection } from "./StudioCreateProductionPlanSection";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function seedContinueFixture() {
  createStudioProject(window.localStorage, {
    id: "proj-canvas",
    title: "방금 그리던 원고",
    kind: "webtoon",
    createdAt: "2026-11-10T01:00:00.000Z",
  });
  const doc = createStudioProjectDocument(window.localStorage, "proj-canvas", {
    title: "1화 본편 원고",
    kind: "webtoon",
    defaultWorkspace: "comic",
    width: 800,
    height: 8000,
    pageCount: 3,
    createdAt: "2026-11-10T01:05:00.000Z",
  });
  writeStudioExactResumeContext(window.localStorage, {
    projectId: "proj-canvas",
    documentId: doc.id,
    workspace: "comic",
    pageId: "2페이지",
    zoom: 1.25,
    selectedElementIds: ["panel-1"],
    tool: "draw",
    drawMode: "pen",
    updatedAt: "2026-11-11T03:30:00.000Z",
  });
  markStudioProjectOpened(window.localStorage, "proj-canvas", doc.id, {
    at: "2026-11-11T03:30:00.000Z",
  });

  createStudioProject(window.localStorage, {
    id: "proj-shell-only",
    title: "기획만 해 둔 작품",
    kind: "webtoon",
    createdAt: "2026-11-09T01:00:00.000Z",
  });
  markStudioProjectOpened(window.localStorage, "proj-shell-only", null, {
    at: "2026-11-10T01:00:00.000Z",
  });

  return [...readStudioProjectLibrary(window.localStorage).projects].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
}

function ProductionPlanHarness({
  initialEnabled = false,
  initialSelection = DEFAULT_WEBTOON_ONBOARDING_SELECTION,
  onSyncStartPoint = vi.fn<(next: StudioProjectStartPoint) => void>(),
  onSyncPurpose = vi.fn<(next: StudioProjectPurpose) => void>(),
  onSyncCollaboration = vi.fn<(next: StudioProjectCollaboration) => void>(),
}: {
  readonly initialEnabled?: boolean;
  readonly initialSelection?: WebtoonOnboardingSelection;
  readonly onSyncStartPoint?: (next: StudioProjectStartPoint) => void;
  readonly onSyncPurpose?: (next: StudioProjectPurpose) => void;
  readonly onSyncCollaboration?: (next: StudioProjectCollaboration) => void;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selection, setSelection] = useState<WebtoonOnboardingSelection>(initialSelection);

  return (
    <div>
      <StudioCreateProductionPlanSection
        onboardingEnabled={enabled}
        selection={selection}
        onToggleOnboarding={() => setEnabled((prev) => !prev)}
        onChangeSelection={(updater) => setSelection((prev) => updater(prev))}
        onSyncStartPoint={onSyncStartPoint}
        onSyncPurpose={onSyncPurpose}
        onSyncCollaboration={onSyncCollaboration}
      />
      <output data-testid="harness-state">
        {`${enabled ? "on" : "off"}:${selection.startingPoint}:${selection.goal}:${selection.teamModel}:${selection.cadence}`}
      </output>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("CreateStartContinueSection · 기존 작업 복귀 사용성 검증", () => {
  it("빈 상태에서 첫 작품 만들기·파일 불러오기·작업실 둘러보기 동선과 44px 터치 타깃·저장 범위 안내를 제공한다", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CreateStartContinueSection
          recentProjects={[]}
          locale="ko-KR"
          userId={null}
          showContinue
        />
      </MemoryRouter>,
    );

    const empty = screen.getByTestId("continue-empty-state");
    const links = within(empty).getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toBe("/studio/new?lane=blank");
    expect(links[1]?.getAttribute("href")).toBe("/studio/import");
    expect(links[2]?.getAttribute("href")).toBe("/studio");
    for (const link of links) {
      expect(link.style.minHeight).toBe("44px");
      expect(link.className).toContain("min-h-11");
      expect(link.className).toContain("focus-visible:outline");
    }
    expect(screen.getByText(/지금은 이 기기에만 저장돼요/u)).toBeTruthy();

    useI18n.setState({ lang: "en" });
    rerender(
      <MemoryRouter>
        <CreateStartContinueSection
          recentProjects={[]}
          locale="en-US"
          userId="creator-7"
          showContinue
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No works yet/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Import my file/u }).getAttribute("href")).toBe(
      "/studio/import",
    );
    expect(screen.getByText(/syncs to your account/u)).toBeTruthy();
  });

  it("방금 작업 강조 배지, ko-KR 마지막 위치 요약, 원고 캔버스 vs 작품 홈 분리 이동, 위·아래 방향키 탐색을 지원한다", () => {
    const sorted = seedContinueFixture();

    render(
      <MemoryRouter>
        <CreateStartContinueSection
          recentProjects={sorted}
          locale="ko-KR"
          userId={null}
          showContinue
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("continue-recent-count").textContent).toContain("최근 2개");
    expect(screen.getByTestId("continue-latest-badge").textContent).toBe("방금 작업");

    // ko-KR 로케일에서도 영어로 폴백되지 않고 한국어 작업 위치 요약을 표시한다.
    const canvasDest = screen.getByTestId("continue-destination-proj-canvas").textContent ?? "";
    expect(canvasDest).toContain("마지막 작업 위치:");
    expect(canvasDest).toContain("2페이지 · 확대 125%");

    const canvasPrimary = screen.getByRole("link", { name: "방금 그리던 원고 이어서 작업" });
    const canvasOverview = screen.getByTestId("continue-overview-proj-canvas");
    expect(canvasPrimary.getAttribute("href")).toContain("/studio/p/proj-canvas/d/");
    expect(canvasPrimary.getAttribute("href")).toContain("resume=latest");
    expect(canvasOverview.getAttribute("href")).toBe("/studio/p/proj-canvas/overview");
    expect(canvasOverview.style.minHeight).toBe("44px");
    expect(canvasOverview.style.minWidth).toBe("44px");

    // 문서가 없는 기획 전용 프로젝트는 이미 작품 홈으로 연결되므로 중복 '작품 홈' 버튼을 만들지 않는다.
    const shellPrimary = screen.getByRole("link", { name: "기획만 해 둔 작품 이어서 작업" });
    expect(shellPrimary.getAttribute("href")).toBe("/studio/p/proj-shell-only/overview");
    expect(screen.queryByTestId("continue-overview-proj-shell-only")).toBeNull();
    expect(screen.getByTestId("continue-destination-proj-shell-only").textContent).toContain(
      "작품 홈 · 기획 개요",
    );

    // 키보드 위·아래·Home·End 방향키로 최근 작품 주 링크 사이를 순환 이동한다.
    canvasPrimary.focus();
    fireEvent.keyDown(canvasPrimary, { key: "ArrowDown" });
    expect(document.activeElement).toBe(shellPrimary);
    fireEvent.keyDown(shellPrimary, { key: "ArrowDown" });
    expect(document.activeElement).toBe(canvasPrimary);
    fireEvent.keyDown(canvasPrimary, { key: "End" });
    expect(document.activeElement).toBe(shellPrimary);
    fireEvent.keyDown(shellPrimary, { key: "Home" });
    expect(document.activeElement).toBe(canvasPrimary);
  });

  it("showContinue가 false일 때 이어가기 카드만 숨기고 공개 작품 갤러리 구역은 유지한다", () => {
    render(
      <MemoryRouter>
        <CreateStartContinueSection
          recentProjects={[]}
          locale="ko"
          userId={null}
          showContinue={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("create-start-continue-section")).toBeNull();
    expect(screen.getByRole("link", { name: /창작 갤러리/u }).getAttribute("href")).toBe(
      "/showcase",
    );
  });
});

describe("StudioCreateProductionPlanSection · 제작 계획 선택·프리셋·취소 사용성 검증", () => {
  it("접힌 상태에서도 1클릭 상황 프리셋으로 바로 켜지고, 같은 프리셋 반복 클릭 시 중복 콜백을 호출하지 않는다", () => {
    const syncStart = vi.fn<(next: StudioProjectStartPoint) => void>();
    const syncPurpose = vi.fn<(next: StudioProjectPurpose) => void>();
    const syncCollab = vi.fn<(next: StudioProjectCollaboration) => void>();

    render(
      <ProductionPlanHarness
        onSyncStartPoint={syncStart}
        onSyncPurpose={syncPurpose}
        onSyncCollaboration={syncCollab}
      />,
    );

    const presetGroup = screen.getByTestId("production-plan-preset-group");
    const presetButtons = within(presetGroup).getAllByRole("button");
    expect(presetButtons).toHaveLength(3);
    for (const button of presetButtons) {
      expect(button.style.minHeight).toBe("44px");
      expect(button.style.minWidth).toBe("44px");
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }

    const contestBtn = screen.getByTestId("production-plan-preset-contest-pitch");
    fireEvent.click(contestBtn);

    expect(contestBtn.getAttribute("aria-pressed")).toBe("true");
    expect(contestBtn.getAttribute("data-state")).toBe("active");
    expect(contestBtn.textContent).toContain("선택됨");
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "on:script:pitch:solo:biweekly",
    );
    expect(screen.getByRole("heading", { name: "대본 잠금 트랙" })).toBeTruthy();
    expect(screen.getByTestId("production-plan-landing-badge").textContent).toContain(
      "첫 이동 화면: 이야기 기획실",
    );
    expect(
      within(screen.getByTestId("production-plan-task-preview")).getAllByRole("listitem").length,
    ).toBeGreaterThanOrEqual(4);

    expect(syncStart).toHaveBeenCalledTimes(1);
    expect(syncStart).toHaveBeenCalledWith("script");
    expect(syncPurpose).toHaveBeenCalledTimes(1);
    expect(syncPurpose).toHaveBeenCalledWith("portfolio");

    // 이미 활성화된 동일 프리셋을 반복 클릭해도 꺼지거나 불필요한 동기화를 다시 호출하지 않는다.
    fireEvent.click(contestBtn);
    fireEvent.click(contestBtn);
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "on:script:pitch:solo:biweekly",
    );
    expect(syncStart).toHaveBeenCalledTimes(1);
    expect(syncPurpose).toHaveBeenCalledTimes(1);
    expect(syncCollab).toHaveBeenCalledTimes(1);
  });

  it("방향키로 프리셋을 탐색하고, 드롭다운 직접 조합 시 상태 배지 표시 및 기본값 초기화·계획 취소(Esc 포함)로 안전하게 복원한다", () => {
    const syncStart = vi.fn<(next: StudioProjectStartPoint) => void>();
    const syncPurpose = vi.fn<(next: StudioProjectPurpose) => void>();
    const syncCollab = vi.fn<(next: StudioProjectCollaboration) => void>();

    const initial: WebtoonOnboardingSelection = {
      startingPoint: "storyboard",
      goal: "independent",
      teamModel: "solo",
      cadence: "monthly",
    };

    const { rerender } = render(
      <ProductionPlanHarness
        initialSelection={initial}
        onSyncStartPoint={syncStart}
        onSyncPurpose={syncPurpose}
        onSyncCollaboration={syncCollab}
      />,
    );

    const soloBtn = screen.getByTestId("production-plan-preset-solo-ep1");
    const contestBtn = screen.getByTestId("production-plan-preset-contest-pitch");
    const teamBtn = screen.getByTestId("production-plan-preset-team-serial");

    soloBtn.focus();
    fireEvent.keyDown(soloBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(contestBtn);
    fireEvent.keyDown(contestBtn, { key: "End" });
    expect(document.activeElement).toBe(teamBtn);
    fireEvent.keyDown(teamBtn, { key: "Home" });
    expect(document.activeElement).toBe(soloBtn);

    // 토글로 계획을 켠 뒤(초기 스냅샷: storyboard/independent/solo/monthly) 드롭다운을 실험적으로 변경한다.
    const toggleBtn = screen.getByTestId("production-plan-toggle");
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId("production-plan-custom-badge").textContent).toBe("직접 조합 중");
    expect(screen.getByTestId("production-plan-landing-badge").textContent).toContain(
      "제작 공정 보드",
    );

    const materialSelect = screen.getByLabelText("현재 가지고 있는 자료");
    fireEvent.change(materialSelect, {
      target: { value: "finished-art" },
    });
    fireEvent.change(screen.getByLabelText("제작 인원"), {
      target: { value: "studio" },
    });
    expect(screen.getByTestId("production-plan-landing-badge").textContent).toContain(
      "출고 사전검사",
    );
    expect(syncStart).toHaveBeenLastCalledWith("files");
    expect(syncCollab).toHaveBeenLastCalledWith("team");

    // 기본값 초기화 동작 확인 및 이미 기본값일 때 비활성화 확인
    const resetBtn = screen.getByTestId("production-plan-reset-default") as HTMLButtonElement;
    expect(resetBtn.disabled).toBe(false);
    fireEvent.click(resetBtn);
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "on:idea:independent:solo:undecided",
    );
    expect(resetBtn.disabled).toBe(true);

    // 상호작용 컨트롤(select/button)에 포커스가 있을 때 Esc 키로 취소하면 켜기 전 스냅샷으로 되돌리고 토글 버튼으로 포커스를 돌려준다.
    materialSelect.focus();
    fireEvent.keyDown(materialSelect, { key: "Escape" });
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "off:storyboard:independent:solo:monthly",
    );
    expect(syncStart).toHaveBeenLastCalledWith("storyboard");
    expect(document.activeElement).toBe(toggleBtn);

    // 버튼 포커스 상태의 Esc 취소와 영어 로케일 취소 버튼 클릭 복원도 함께 확인한다.
    fireEvent.click(contestBtn);
    contestBtn.focus();
    fireEvent.keyDown(contestBtn, { key: "Escape" });
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "off:storyboard:independent:solo:monthly",
    );
    expect(document.activeElement).toBe(toggleBtn);

    useI18n.setState({ lang: "en" });
    rerender(
      <ProductionPlanHarness
        initialSelection={initial}
        onSyncStartPoint={syncStart}
        onSyncPurpose={syncPurpose}
        onSyncCollaboration={syncCollab}
      />,
    );
    fireEvent.click(screen.getByTestId("production-plan-preset-team-serial"));
    expect(screen.getByText(/Starter checklist ready/u)).toBeTruthy();
    fireEvent.click(screen.getByTestId("production-plan-cancel"));
    expect(screen.getByTestId("harness-state").textContent).toBe(
      "off:storyboard:independent:solo:monthly",
    );
  });

  it("상위 생성·시작 화면과 결합했을 때 세부 자료(시놉시스)·1클릭 프리셋 생성·이어 만들기 동선이 기존 계약 그대로 동작한다", async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /프로젝트 이름/u }), {
      target: { value: "공모전 단편 1화" },
    });
    fireEvent.click(screen.getByTestId("production-plan-preset-contest-pitch"));
    // 상위 onSyncStartPoint 호출 시에도 시놉시스 같은 세부 선택이 'idea'로 덮어써지지 않는지 확인한다.
    fireEvent.change(screen.getByLabelText("현재 가지고 있는 자료"), {
      target: { value: "synopsis" },
    });
    expect(screen.getByRole("heading", { name: "시리즈 개발 트랙" })).toBeTruthy();

    // 다시 공모전 프리셋을 눌러 최종 생성한다.
    fireEvent.click(screen.getByTestId("production-plan-preset-contest-pitch"));
    fireEvent.click(screen.getByRole("button", { name: /프로젝트와 제작 계획 만들기/u }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/studio\/p\/[^/]+\/story\?view=script$/u,
      );
    });

    const created = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(created).toBeDefined();
    expect(
      readStudioWebtoonOnboardingProfile(window.localStorage, created!.id),
    ).toMatchObject({
      startingPoint: "script",
      goal: "pitch",
      teamModel: "solo",
      cadence: "biweekly",
    });

    unmount();

    render(
      <MemoryRouter initialEntries={["/create?section=continue"]}>
        <CreateStartPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("continue-latest-badge").textContent).toBe("방금 작업");
    expect(
      screen.getByRole("link", { name: "공모전 단편 1화 이어서 작업" }).getAttribute("href"),
    ).toContain(`/studio/p/${created!.id}/d/`);
    expect(screen.getByTestId(`continue-overview-${created!.id}`).getAttribute("href")).toBe(
      `/studio/p/${created!.id}/overview`,
    );
  });
});
