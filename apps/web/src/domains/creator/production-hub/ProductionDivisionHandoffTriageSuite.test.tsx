// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CANVAS_STAGE_BRANCHES,
  DEFAULT_DIVISION_HANDOFF_PACKETS,
  evaluateHandoffPreflightGate,
  getDivisionStageSpec,
  simulateStageBranchMerge,
  WEBTOON_DIVISION_STAGES,
} from "./production-division-handoff-triage-model";
import { MemoryRouter } from "react-router-dom";
import { createProductionDemoProject } from "./production-demo";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { ProductionDivisionHandoffTriageSuite } from "./ProductionDivisionHandoffTriageSuite";
import { ProductionHandoffSurface } from "./ProductionHandoffSurface";
import * as boardMove from "./production-board-move-preview";
import { divisionQueueScaleFixture } from "./production-division-handoff-queue.test-fixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("production-division-handoff-triage-model", () => {
  it("8단계 웹툰 분업 공정과 필수 레이어 계약을 정의한다", () => {
    expect(WEBTOON_DIVISION_STAGES).toHaveLength(8);
    const lineArt = getDivisionStageSpec("line_art");
    expect(lineArt.order).toBe(4);
    expect(lineArt.requiredLayers).toContain("CHAR_VECTOR_LINE");
  });

  it("프리플라이트 게이트가 해상도·필수 체크리스트·레이어 충돌을 정확히 판정한다", () => {
    const readyEval = evaluateHandoffPreflightGate(DEFAULT_DIVISION_HANDOFF_PACKETS[0]);
    expect(readyEval.gateStatus).toBe("ready-for-handoff");
    expect(readyEval.readinessScore).toBe(100);
    expect(readyEval.blockersKo).toHaveLength(0);

    const blockedLinePacket = evaluateHandoffPreflightGate(DEFAULT_DIVISION_HANDOFF_PACKETS[1]);
    expect(blockedLinePacket.gateStatus).toBe("blocked-by-spec");
    expect(blockedLinePacket.mandatoryFailedCount).toBe(1);
    expect(blockedLinePacket.blockersKo.length).toBeGreaterThan(0);

    const lowSpecPacket = evaluateHandoffPreflightGate(DEFAULT_DIVISION_HANDOFF_PACKETS[3]);
    expect(lowSpecPacket.specValid).toBe(false);
    expect(lowSpecPacket.gateStatus).toBe("blocked-by-spec");
  });

  it("캔버스 스테이지 브랜치 병합 가능 여부와 레이어 충돌 수를 계산한다", () => {
    const initialMerge = simulateStageBranchMerge(DEFAULT_CANVAS_STAGE_BRANCHES);
    expect(initialMerge.canAutoMerge).toBe(false);
    expect(initialMerge.totalConflictingLayers).toBe(1);

    const resolvedMerge = simulateStageBranchMerge(
      DEFAULT_CANVAS_STAGE_BRANCHES.map((b) => ({
        ...b,
        conflictingLayers: [],
        readyForStage: true,
      })),
    );
    expect(resolvedMerge.canAutoMerge).toBe(true);
    expect(resolvedMerge.totalConflictingLayers).toBe(0);
  });
});

function liveFixture(): ProductionProjectAggregate {
  const aggregate = createProductionDemoProject();
  const task = aggregate.tasks[0];
  if (!task) throw new Error("테스트 기준 작업이 없습니다.");
  return { ...aggregate, workflowProfile: null, tasks: [{ ...task, title: "실제 선화 인계", status: "ready", dependencyTaskIds: [] }] };
}
function mount(aggregate: ProductionProjectAggregate, execute = vi.fn().mockResolvedValue(undefined), canEdit = true) {
  render(<MemoryRouter><ProductionDivisionHandoffTriageSuite aggregate={aggregate} episodeId="episode-12" episodeLabel="12화" canEdit={canEdit} execute={execute} /></MemoryRouter>);
  return execute;
}

describe("ProductionDivisionHandoffTriageSuite 실제 작업", () => {
  it("스토리 인계 패키지가 없어도 실제 분업 작업과 다음 행동을 보여 준다", () => {
    const aggregate = { ...liveFixture(), handoffs: [] };
    render(<MemoryRouter><ProductionHandoffSurface aggregate={aggregate} canEdit={false} isDemo={false} roleLens="producer" execute={vi.fn().mockResolvedValue(undefined)} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "실제 선화 인계" })).toBeTruthy();
    expect(screen.getByText("스토리 인계 패키지가 없습니다")).toBeTruthy();
    expect(screen.queryByText(/시뮬레이터/)).toBeNull();
  });

  it("프로젝트 자료로 인계를 표시하고 같은 상태 전환 명령을 서버로 보낸다", async () => {
    const aggregate = liveFixture();
    const execute = mount(aggregate);
    expect(screen.getByRole("heading", { name: "실제 선화 인계" })).toBeTruthy();
    expect(screen.queryByText(/규격·체크리스트 일괄 충족/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "작업 시작·재개" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "transition-task-batch", transitions: [{ taskId: aggregate.tasks[0]?.id, fromStatus: "ready", toStatus: "in-progress" }] }, expect.any(String)));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("완료"));
  });

  it("읽기 전용 참여자는 인계 상태를 변경할 수 없다", () => {
    const execute = mount(liveFixture(), vi.fn().mockResolvedValue(undefined), false);
    const start = screen.getByRole("button", { name: "작업 시작·재개" });
    expect(start.hasAttribute("disabled")).toBe(true);
    fireEvent.click(start);
    expect(execute).not.toHaveBeenCalled();
  });

  it("실패한 요청을 성공으로 표시하지 않고 같은 요청의 중복 클릭을 막는다", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    const execute = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectRequest = reject; }));
    mount(liveFixture(), execute);
    const start = screen.getByRole("button", { name: "작업 시작·재개" });
    fireEvent.click(start); fireEvent.click(start);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(start.hasAttribute("disabled")).toBe(true);
    await act(async () => { rejectRequest?.(new Error("프로젝트 버전이 변경되었습니다.")); });
    expect(screen.getByRole("alert").textContent).toContain("버전이 변경");
    expect(screen.queryByRole("status")).toBeNull();
    expect(start.hasAttribute("disabled")).toBe(false);
  });

  it("실제 필터·검색과 상세 링크를 제공하고 미완료 입력의 시작은 차단한다", () => {
    const aggregate = liveFixture();
    mount({ ...aggregate, tasks: aggregate.tasks.map((task) => ({ ...task, inputRevisionRefs: [] })) });
    expect(screen.getByRole("button", { name: "작업 시작·재개" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/작업을 시작하기 전에 입력 버전을 고정/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("작업·공정·담당자 검색"), { target: { value: "없는 작업" } });
    expect(screen.getByText("조건에 맞는 작업이 없습니다")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("작업·공정·담당자 검색"), { target: { value: "실제 선화" } });
    expect(screen.getByRole("link", { name: "작업 상세·배정" }).getAttribute("href")).toContain("openTask=");
  });

  it("3000개 작업도 첫 20개만 표시·검증하고 실행 시 현재 계약을 다시 확인한다", async () => {
    const preview = vi.spyOn(boardMove, "previewProductionBoardMove");
    const execute = mount(divisionQueueScaleFixture(3000));
    expect(document.querySelectorAll('[data-testid^="division-task-"]')).toHaveLength(20);
    expect(preview).toHaveBeenCalledTimes(20);
    expect(screen.getByRole("button", { name: "다음 단계 확인 3000" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "인계 준비로 이동" })[0]);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(preview).toHaveBeenCalledTimes(21);
    expect(execute).toHaveBeenCalledWith({ type: "transition-task-batch", transitions: [{ taskId: "scale-task-00000", fromStatus: "draft", toStatus: "ready" }] }, expect.any(String));
    fireEvent.click(screen.getByRole("button", { name: "작업 더 보기 · 20/3000" }));
    expect(document.querySelectorAll('[data-testid^="division-task-"]')).toHaveLength(40);
    expect(preview).toHaveBeenCalledTimes(41);
  });
});
