import { describe, expect, it } from "vitest";

import { createProductionDemoProject } from "./production-demo";
import {
  handoffBoardHref,
  handoffDirections,
  handoffEpisodeProcesses,
  handoffNextProcess,
} from "./handoff-next-process-model";

describe("인계 → 다음 공정 연결 모델", () => {
  it("회차 공정을 공정 순서대로 정렬하고 레거시 키를 표준 키로 맞춘다", () => {
    const aggregate = createProductionDemoProject();
    const processes = handoffEpisodeProcesses(aggregate, "episode-12");
    // 데모 12화 작업은 thumbnail(→storyboard) 레거시 키를 쓴다.
    expect(processes).not.toContain("thumbnail");
    expect(processes[0]).toBe("storyboard");
    expect(processes.indexOf("line-art")).toBeGreaterThan(processes.indexOf("storyboard"));
    expect(processes.indexOf("color")).toBeGreaterThan(processes.indexOf("line-art"));
    expect(processes).toContain("lettering");
  });

  it("다음 공정은 스토리를 건너뛴 가장 이른 공정이고 열린 작업 수를 함께 준다", () => {
    const aggregate = createProductionDemoProject();
    const next = handoffNextProcess(aggregate, "episode-12");
    expect(next?.key).toBe("storyboard");
    expect(next?.taskCount).toBeGreaterThanOrEqual(1);
    expect(next?.openTaskCount).toBeGreaterThanOrEqual(1);
    expect(next?.firstOpenTaskId).toBe("task-episode-12-thumbnail");
  });

  it("다음 공정 작업이 아직 없어도 설정·기본 순서의 두 번째 공정을 가리킨다", () => {
    const aggregate = createProductionDemoProject();
    // 데모 13화는 스토리 작업만 있어 다음 공정 작업이 아직 생성되지 않은 상태다.
    const next = handoffNextProcess(aggregate, "episode-13");
    expect(next?.key).toBe("storyboard");
    expect(next?.taskCount).toBe(0);
    expect(next?.openTaskCount).toBe(0);
    expect(next?.firstOpenTaskId).toBeNull();
  });

  it("인계 방향은 첫 방향이 다음 공정, 선화→채색 같은 후단은 후단 인계로 구분된다", () => {
    const aggregate = createProductionDemoProject();
    const directions = handoffDirections(aggregate, "episode-12");
    expect(directions[0]).toEqual({ fromKey: "storyboard", toKey: "line-art", stage: "next" });
    const downstream = directions.filter((entry) => entry.stage === "downstream");
    expect(downstream.length).toBeGreaterThan(0);
    expect(downstream).toContainEqual({ fromKey: "line-art", toKey: "background", stage: "downstream" });
    expect(downstream).toContainEqual({ fromKey: "background", toKey: "color", stage: "downstream" });
    // 방향은 중복이 없고 대상 공정 순서대로 정렬된다.
    const keys = directions.map((entry) => `${entry.fromKey}->${entry.toKey}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("보드 딥링크는 보드가 읽는 회차·공정·공정별 보기 값만 담는다", () => {
    expect(handoffBoardHref("sample-project", "episode-12", "color")).toBe(
      "/production/projects/sample-project/production?boardEpisode=episode-12&boardProcess=color&boardLayout=process",
    );
    // 레거시 공정 키도 표준 키로 바꿔 보드 필터와 어긋나지 않게 한다.
    expect(handoffBoardHref("sample-project", "episode-12", "thumbnail")).toContain("boardProcess=storyboard");
  });
});
