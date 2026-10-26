// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CANVAS_STAGE_BRANCHES,
  DEFAULT_DIVISION_HANDOFF_PACKETS,
  evaluateHandoffPreflightGate,
  getDivisionStageSpec,
  simulateStageBranchMerge,
  WEBTOON_DIVISION_STAGES,
} from "./production-division-handoff-triage-model";
import { ProductionDivisionHandoffTriageSuite } from "./ProductionDivisionHandoffTriageSuite";

afterEach(() => {
  cleanup();
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

describe("ProductionDivisionHandoffTriageSuite", () => {
  it("인계 패킷 프리플라이트 일괄 충족 및 브랜치 레이어 충돌 해소를 수행한다", () => {
    render(<ProductionDivisionHandoffTriageSuite episodeLabel="12화" />);

    expect(screen.getByText(/8단계 분업 배턴 인계 게이트/)).toBeTruthy();
    expect(screen.getByText(/인계 패킷 2\/4 통과/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /규격·체크리스트 일괄 충족/ }));
    expect(screen.getByText(/인계 패킷 3\/4 통과/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /레이어 충돌 해소 및 Ready 전환/ }));
    expect(screen.getByText(/모든 작업 브랜치\(3개\)가 Ready for Stage 상태/)).toBeTruthy();
  });
});
