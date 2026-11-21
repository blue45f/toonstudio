// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioProjectStoryPlanning } from "./StudioProjectStoryPlanning";
import { StudioStoryLivingSpecWorkbench } from "./StudioStoryLivingSpecWorkbench";
import { ensureStudioProjectPlanning, saveStudioEpisodePlan } from "./studio-planning-store";

vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ data: null, loading: false, error: null }),
}));

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function seedPlanning(projectId: string) {
  const initial = ensureStudioProjectPlanning(localStorage, projectId, "2026-11-20T09:00:00.000Z");
  const first = initial.plans[0]!;
  return saveStudioEpisodePlan(localStorage, projectId, {
    ...first,
    title: "옥상의 진실",
    logline: "서연이 옥상에서 숨겨진 편지를 열어 본다.",
    synopsis: "노을 아래 마주 선 서연과 하진.",
    turningPoints: ["편지 개봉", "진실 대면"],
  });
}

describe("StudioStoryLivingSpecWorkbench (Manyfast 3-뷰 라이브 연동)", () => {
  it("StudioProjectStoryPlanning episodes 뷰에서 점진 노출로 지연 마운트된다", async () => {
    const projectId = "proj-living-lazy";
    seedPlanning(projectId);

    render(
      <MemoryRouter initialEntries={[`/studio/p/${projectId}/story?view=episodes`]}>
        <StudioProjectStoryPlanning projectId={projectId} view="episodes" />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("story-planning-living-spec-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-story-living-spec-workbench")).toBeNull();

    fireEvent.click(disclosure.querySelector("summary")!);
    const workbench = await screen.findByTestId("studio-story-living-spec-workbench");
    expect(workbench).toBeTruthy();
  });

  it("① 스토리 텍스트 ↔ 시나리오 표 ↔ 컷 카드 3-뷰 실시간 동기화와 ② 양방향 호버 하이라이트가 동작한다", () => {
    const projectId = "proj-manyfast-sync";
    const planning = seedPlanning(projectId);

    render(
      <StudioStoryLivingSpecWorkbench
        projectId={projectId}
        planning={planning}
        characters={[{ id: "c1", name: "서연" }, { id: "c2", name: "하진" }]}
        locations={[{ id: "l1", name: "학교 옥상" }]}
      />,
    );

    const firstCutKey = "CUT:EP-01-C01";
    const secondCutKey = "CUT:EP-01-C02";

    // ① 스토리 텍스트 편집 -> 시나리오 표 & 컷 카드 & localStorage 즉시 동기화
    fireEvent.change(screen.getByTestId("manyfast-story-title-input"), {
      target: { value: "옥상 편지 클로즈업" },
    });
    fireEvent.change(screen.getByTestId("manyfast-story-dialogue-input"), {
      target: { value: "이 편지, 네가 쓴 거 맞지?" },
    });

    const row1 = screen.getByTestId(`scenario-table-row-${firstCutKey}`);
    const card1 = screen.getByTestId(`manyfast-cut-card-${firstCutKey}`);
    expect(row1.textContent).toContain("옥상 편지 클로즈업");
    expect(card1.textContent).toContain("옥상 편지 클로즈업");
    expect(card1.textContent).toContain("이 편지, 네가 쓴 거 맞지?");

    // ② 표 -> 컷 양방향 호버 하이라이트
    const row2 = screen.getByTestId(`scenario-table-row-${secondCutKey}`);
    const card2 = screen.getByTestId(`manyfast-cut-card-${secondCutKey}`);
    fireEvent.mouseEnter(row2);
    expect(row2.getAttribute("data-hovered")).toBe("true");
    expect(card2.getAttribute("data-hovered")).toBe("true");
    fireEvent.mouseLeave(row2);
    expect(card2.getAttribute("data-hovered")).toBe("false");

    // 컷 -> 표 역방향 호버 하이라이트
    fireEvent.mouseEnter(card1);
    expect(card1.getAttribute("data-hovered")).toBe("true");
    expect(row1.getAttribute("data-hovered")).toBe("true");
  });

  it("③ 원고 컷 변경 이벤트 시 '컷 수정됨' 드리프트 배지가 뜨고 1클릭 동기화로 해소되며, ⑥ 컷 단위 승인·공유 상태가 영속된다", async () => {
    const projectId = "proj-drift-approval";
    const planning = seedPlanning(projectId);
    const firstCutKey = "CUT:EP-01-C01";

    const { unmount } = render(
      <StudioStoryLivingSpecWorkbench
        projectId={projectId}
        planning={planning}
        characters={[{ id: "c1", name: "서연" }]}
      />,
    );

    // 확장 도구 원고 커밋 이벤트 발행 -> 드리프트 자동 감지
    window.dispatchEvent(
      new CustomEvent("toonstudio:expanded-tool-commit", {
        detail: { id: "commit-99", cutId: firstCutKey, summaryKo: "메쉬 워프 확정" },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId(`cut-card-drift-badge-${firstCutKey}`).textContent).toContain("컷 수정됨");
    });

    // 1클릭 대본과 다시 맞추기
    fireEvent.click(screen.getByTestId(`cut-card-sync-drift-${firstCutKey}`));
    expect(screen.queryByTestId(`cut-card-drift-badge-${firstCutKey}`)).toBeNull();

    // ⑥ 컷 단위 승인 상태 토글 (초안 -> 검토 요청 -> 승인 완료) + 공유 링크 켜기
    const approvalBtn = screen.getByTestId(`cut-approval-toggle-${firstCutKey}`);
    expect(approvalBtn.getAttribute("data-approval-status")).toBe("draft");
    fireEvent.click(approvalBtn);
    expect(approvalBtn.getAttribute("data-approval-status")).toBe("review-requested");
    fireEvent.click(approvalBtn);
    expect(approvalBtn.getAttribute("data-approval-status")).toBe("approved");

    const shareBtn = screen.getByTestId(`cut-share-toggle-${firstCutKey}`);
    fireEvent.click(shareBtn);
    const shareUrl = screen.getByTestId(`cut-share-url-${firstCutKey}`);
    expect(shareUrl.textContent).toContain(`/studio/p/${projectId}/review/cut/EP-01-C01`);
    unmount();

    // 재마운트 시 localStorage에서 승인·공유 상태가 그대로 복원되어야 한다
    render(<StudioStoryLivingSpecWorkbench projectId={projectId} planning={planning} />);
    expect(screen.getByTestId(`cut-approval-toggle-${firstCutKey}`).getAttribute("data-approval-status")).toBe("approved");
    expect(screen.getByTestId(`cut-share-url-${firstCutKey}`).textContent).toContain("?snap=");
    expect(localStorage.getItem(`toonstudio:story-living-spec:v1:${encodeURIComponent(projectId)}`)).toBeTruthy();
  });

  it("④ AI 변경 제안 Diff 게이트 승인/수정/거절과 ⑤ 6관점 증분 원고 검수가 프로젝트 스토어에 직결된다", () => {
    const projectId = "proj-diff-review";
    const planning = seedPlanning(projectId);

    render(
      <StudioStoryLivingSpecWorkbench
        projectId={projectId}
        planning={planning}
        characters={[{ id: "c1", name: "서연" }]}
      />,
    );

    // ④ AI 제안 Diff 게이트 열기 및 승인
    fireEvent.click(screen.getByTestId("living-spec-tab-proposal-gate"));
    const gate = screen.getByTestId("studio-ai-proposal-diff-gate");
    expect(gate.textContent).toContain("도입 연출 밀도 보강");
    fireEvent.click(within(gate).getByRole("button", { name: "승인" }));
    expect(screen.getByTestId("living-spec-status-notice").textContent).toContain("승인");

    // ⑤ 6관점 증분 원고 검수 드로어 열기 및 재검수
    fireEvent.click(screen.getByTestId("living-spec-tab-review-drawer"));
    const drawer = screen.getByTestId("studio-six-perspective-review-drawer");
    fireEvent.click(within(drawer).getByRole("button", { name: "증분 재검수" }));
    expect(screen.getByTestId("living-spec-status-notice").textContent).toContain("6관점 증분");
  });

  it("워크벤치와 StoryPlanning 파일이 800줄 이하 및 OKLCH·무금지패턴 가드레일을 준수한다", () => {
    const files = [
      resolve(__dirname, "./StudioStoryLivingSpecWorkbench.tsx"),
      resolve(__dirname, "./StudioProjectStoryPlanning.tsx"),
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src.split("\n").length, file).toBeLessThanOrEqual(800);
      expect(src, file).not.toContain("@ts-ignore");
      expect(src, file).not.toContain("eslint-disable");
      expect(src, file).not.toContain("transition-all");
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    }
  });
});
