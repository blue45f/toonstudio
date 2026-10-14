import { describe, expect, it } from "vitest";

import {
  abandonPilotRun,
  activePilotRun,
  completePilotStep,
  createPilotRun,
  derivePilotProgress,
  ensureStudioTeamPilot,
  latestPilotRun,
  parseStudioTeamPilot,
  pilotTemplateFromTeamDefault,
  promotePilotRunToTeamTemplate,
  readStudioTeamPilot,
  setTeamDefaultTemplate,
  TEAM_PILOT_TEMPLATE,
  upsertPilotRun,
  writeStudioTeamPilot,
  type StudioTeamPilotState,
  type TeamPilotRun,
} from "./team-pilot-template-model";
import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";

const NOW = "2026-10-14T00:00:00.000Z";
const LATER = "2026-10-15T00:00:00.000Z";

function memoryStorage(): StudioProjectDiagnosticSourceStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function startRun(partial: Partial<Parameters<typeof createPilotRun>[0]> = {}): TeamPilotRun {
  return createPilotRun({
    id: "run-1",
    workspaceId: "ws-1",
    projectId: "project-1",
    episodeId: "episode-1",
    startedBy: "owner-1",
    now: NOW,
    ...partial,
  });
}

function completeAll(run: TeamPilotRun): TeamPilotRun {
  let current = run;
  for (const step of current.steps) {
    current = completePilotStep(current, step.stepId, { by: "owner-1", at: LATER });
  }
  return current;
}

describe("createPilotRun", () => {
  it("내장 템플릿 명세로 다섯 단계가 대기 상태로 열린다", () => {
    const run = startRun();
    expect(run.status).toBe("in-progress");
    expect(run.templateId).toBe(TEAM_PILOT_TEMPLATE.id);
    expect(run.spec.targetCuts).toBe(6);
    expect(run.spec.processKeys).toEqual(["storyboard", "line-art", "color", "lettering"]);
    expect(run.steps.map((step) => step.stepId)).toEqual([
      "invite",
      "join",
      "produce",
      "review",
      "approve",
    ]);
    expect(run.steps.every((step) => step.status === "pending")).toBe(true);
    expect(derivePilotProgress(run).currentStepId).toBe("invite");
  });

  it("레거시 공정 키는 canonical로 정규화해 명세에 담는다", () => {
    const run = startRun({
      template: {
        ...TEAM_PILOT_TEMPLATE,
        id: "custom",
        spec: { ...TEAM_PILOT_TEMPLATE.spec, processKeys: ["thumbnail", "story"] },
      },
    });
    expect(run.spec.processKeys).toEqual(["storyboard", "story-lock"]);
  });

  it("빈 식별자·잘못된 시각·컷 수 0인 명세는 거부한다", () => {
    expect(() => startRun({ workspaceId: " " })).toThrow();
    expect(() => startRun({ episodeId: "" })).toThrow();
    expect(() => startRun({ now: "not-a-date" })).toThrow();
    expect(() =>
      startRun({
        template: {
          ...TEAM_PILOT_TEMPLATE,
          spec: { ...TEAM_PILOT_TEMPLATE.spec, targetCuts: 0 },
        },
      }),
    ).toThrow();
  });
});

describe("completePilotStep — 순서 강제", () => {
  it("앞 단계를 건너뛰면 완료할 수 없다", () => {
    const run = startRun();
    expect(() => completePilotStep(run, "join", { by: "a", at: NOW })).toThrow(/invite/);
    expect(() => completePilotStep(run, "approve", { by: "a", at: NOW })).toThrow(/invite/);
  });

  it("순서대로 완료하면 기록이 쌓이고 진행도가 오른다", () => {
    const run = startRun();
    const afterInvite = completePilotStep(run, "invite", {
      by: "owner-1",
      at: NOW,
      evidenceNote: " 초대 링크 발송 ",
    });
    expect(afterInvite.steps[0]).toMatchObject({
      status: "done",
      completedBy: "owner-1",
      evidenceNote: "초대 링크 발송",
    });
    // 원본은 불변이다.
    expect(run.steps[0]!.status).toBe("pending");
    const progress = derivePilotProgress(afterInvite);
    expect(progress.doneCount).toBe(1);
    expect(progress.percent).toBe(20);
    expect(progress.currentStepId).toBe("join");
  });

  it("이미 완료한 단계는 다시 완료할 수 없다", () => {
    const run = completePilotStep(startRun(), "invite", { by: "a", at: NOW });
    expect(() => completePilotStep(run, "invite", { by: "a", at: NOW })).toThrow();
  });

  it("다섯 단계를 모두 끝내면 실행이 completed가 된다", () => {
    const done = completeAll(startRun());
    expect(done.status).toBe("completed");
    expect(done.finishedAt).toBe(LATER);
    const progress = derivePilotProgress(done);
    expect(progress.isComplete).toBe(true);
    expect(progress.currentStepId).toBeNull();
    expect(progress.percent).toBe(100);
  });

  it("중단한 실행은 단계를 더 진행할 수 없다", () => {
    const abandoned = abandonPilotRun(startRun(), NOW);
    expect(abandoned.status).toBe("abandoned");
    expect(() => completePilotStep(abandoned, "invite", { by: "a", at: NOW })).toThrow();
    expect(() => abandonPilotRun(abandoned, NOW)).toThrow();
  });
});

describe("promotePilotRunToTeamTemplate — 성공한 순서만 고정", () => {
  it("완료되지 않은 실행은 고정할 수 없다", () => {
    const run = completePilotStep(startRun(), "invite", { by: "a", at: NOW });
    expect(() =>
      promotePilotRunToTeamTemplate(run, { id: "tpl-1", createdBy: "owner-1", now: LATER }),
    ).toThrow();
  });

  it("완료한 실행의 명세와 순서를 그대로 복사한다", () => {
    const done = completeAll(startRun());
    const template = promotePilotRunToTeamTemplate(done, {
      id: "tpl-1",
      createdBy: "owner-1",
      now: LATER,
    });
    expect(template.workspaceId).toBe("ws-1");
    expect(template.sourcePilotRunId).toBe("run-1");
    expect(template.spec).toEqual(done.spec);
    expect(template.stepOrder).toEqual(["invite", "join", "produce", "review", "approve"]);
  });

  it("고정된 템플릿으로 새 파일럿을 시작하면 같은 명세가 복제된다", () => {
    const done = completeAll(startRun());
    const template = promotePilotRunToTeamTemplate(done, {
      id: "tpl-1",
      createdBy: "owner-1",
      now: LATER,
    });
    const next = createPilotRun({
      id: "run-2",
      workspaceId: "ws-1",
      projectId: "project-2",
      episodeId: "episode-9",
      startedBy: "owner-1",
      now: LATER,
      template: pilotTemplateFromTeamDefault(template),
    });
    expect(next.templateId).toBe("tpl-1");
    expect(next.spec).toEqual(done.spec);
    expect(derivePilotProgress(next).currentStepId).toBe("invite");
  });
});

describe("저장소", () => {
  it("ensure→upsert→고정→write→read 왕복이 상태를 보존한다", () => {
    const storage = memoryStorage();
    let state: StudioTeamPilotState = ensureStudioTeamPilot(storage, "ws-1");
    expect(state.runs).toEqual([]);
    expect(state.defaultTemplate).toBeNull();

    const done = completeAll(startRun());
    state = upsertPilotRun(state, done);
    const template = promotePilotRunToTeamTemplate(done, {
      id: "tpl-1",
      createdBy: "owner-1",
      now: LATER,
    });
    state = setTeamDefaultTemplate(state, template);
    writeStudioTeamPilot(storage, state);

    const restored = readStudioTeamPilot(storage, "ws-1");
    expect(restored).not.toBeNull();
    expect(restored!.runs).toHaveLength(1);
    expect(restored!.defaultTemplate?.id).toBe("tpl-1");
    expect(latestPilotRun(restored!)?.status).toBe("completed");
    expect(activePilotRun(restored!)).toBeNull();
  });

  it("진행 중 실행은 activePilotRun으로 잡힌다", () => {
    const storage = memoryStorage();
    let state = ensureStudioTeamPilot(storage, "ws-1");
    state = upsertPilotRun(state, startRun());
    expect(activePilotRun(state)?.id).toBe("run-1");
  });

  it("다른 워크스페이스의 실행·템플릿은 섞을 수 없다", () => {
    const state = ensureStudioTeamPilot(memoryStorage(), "ws-1");
    const other = startRun({ id: "run-x", workspaceId: "ws-2" });
    expect(() => upsertPilotRun(state, other)).toThrow();
    expect(readStudioTeamPilot(memoryStorage(), "ws-1")).toBeNull();
  });

  it("깨진 스냅샷은 null로 복구한다", () => {
    expect(parseStudioTeamPilot(null)).toBeNull();
    expect(parseStudioTeamPilot({ schemaVersion: 2 })).toBeNull();
    expect(
      parseStudioTeamPilot(
        { schemaVersion: 1, workspaceId: "ws-1", runs: [{ id: "x" }], defaultTemplate: null },
        "ws-1",
      ),
    ).toBeNull();
    expect(
      parseStudioTeamPilot(
        { schemaVersion: 1, workspaceId: "ws-1", runs: [], defaultTemplate: null },
        "ws-2",
      ),
    ).toBeNull();
  });
});
