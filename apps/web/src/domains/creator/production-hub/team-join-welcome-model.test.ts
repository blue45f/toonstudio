import { describe, expect, it } from "vitest";

import { teamJoinWelcomeModel } from "./team-join-welcome-model";

const PROJECTS = [
  { id: "proj-1", title: "달빛 기사단" },
  { id: "proj-2", title: "두 번째 작품" },
] as const;

describe("합류 환영 — 먼저 할 일", () => {
  it("작품 권한이 있는 구성원은 첫 작품 공정 보드가 첫 단계다", () => {
    const welcome = teamJoinWelcomeModel({
      workspaceId: "ws-1",
      workspaceName: "우리 팀",
      role: "member",
      projects: PROJECTS,
    });
    expect(welcome.hasProjectAccess).toBe(true);
    expect(welcome.headline.ko).toContain("우리 팀");
    const primary = welcome.steps.filter((step) => step.primary);
    expect(primary).toHaveLength(1);
    expect(primary[0]!.href).toBe("/production/projects/proj-1/production");
    // 작품이 여럿이면 전체 목록 단계가 따라온다.
    expect(welcome.steps.some((step) => step.id === "all-projects")).toBe(true);
  });

  it("게스트는 보드가 아니라 공유받은 작품 개요가 첫 단계다", () => {
    const welcome = teamJoinWelcomeModel({
      workspaceId: "ws-1",
      workspaceName: "우리 팀",
      role: "guest",
      projects: PROJECTS,
    });
    const primary = welcome.steps.find((step) => step.primary);
    expect(primary?.href).toBe("/production/projects/proj-1/overview");
    // 게스트에게는 구성원 보기 단계를 제안하지 않는다(구성원 목록 비공개와 정합).
    expect(welcome.steps.some((step) => step.id === "meet-members")).toBe(false);
  });

  it("작품 권한이 없으면 요청하기가 첫 단계이고, 없는 권한을 있는 것처럼 말하지 않는다", () => {
    const welcome = teamJoinWelcomeModel({
      workspaceId: "ws-9",
      workspaceName: "새 팀",
      role: "member",
      projects: [],
    });
    expect(welcome.hasProjectAccess).toBe(false);
    const primary = welcome.steps.find((step) => step.primary);
    expect(primary?.id).toBe("request-project-access");
    expect(primary?.href).toBe("/team/people/ws-9");
    expect(primary?.description.ko).toContain("열 수 있는 작품이 없어요");
  });

  it("단계는 최대 3개, primary는 항상 정확히 하나다", () => {
    for (const role of ["owner", "admin", "member", "guest"] as const) {
      for (const projects of [PROJECTS, []] as const) {
        const welcome = teamJoinWelcomeModel({
          workspaceId: "ws-1",
          workspaceName: "팀",
          role,
          projects,
        });
        expect(welcome.steps.length).toBeLessThanOrEqual(3);
        expect(welcome.steps.filter((step) => step.primary)).toHaveLength(1);
        for (const step of welcome.steps) {
          expect(step.title.ko.length).toBeGreaterThan(0);
          expect(step.href.startsWith("/")).toBe(true);
        }
      }
    }
  });
});
