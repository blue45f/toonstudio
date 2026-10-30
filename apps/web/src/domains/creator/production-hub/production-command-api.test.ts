import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeProductionCommand, recoverProductionCommand } from "./production-api";

const http = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { post: http.post }, apiPath: (value: string) => value }));

beforeEach(() => { http.post.mockReset(); http.post.mockResolvedValue({}); });

describe("제작 명령 영수증 식별자", () => {
  it("호출자가 보관한 식별자와 최초 버전을 바꾸지 않고 재전송한다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const command = { type: "evaluate-risks" as const };
    http.post.mockRejectedValueOnce(new Error("응답 유실"));
    await expect(executeProductionCommand("project/a", 4, command, id)).rejects.toThrow("응답 유실");
    expect(http.post).toHaveBeenCalledTimes(1);
    await executeProductionCommand("project/a", 4, command, id);
    expect(http.post.mock.calls[0]).toEqual(http.post.mock.calls[1]);
    expect(http.post).toHaveBeenLastCalledWith("/production/projects/project%2Fa/commands", {
      expectedRevision: 4, mutationId: id, command,
    });
  });

  it("새 명령의 기본 식별자는 기존 호출 계약대로 각각 발급한다", async () => {
    await executeProductionCommand("project-a", 1, { type: "evaluate-risks" });
    await executeProductionCommand("project-a", 2, { type: "evaluate-risks" });
    const first: unknown = http.post.mock.calls[0]?.[1]?.mutationId;
    const second: unknown = http.post.mock.calls[1]?.[1]?.mutationId;
    expect(first).toMatch(/^[a-f0-9-]{36}$/u);
    expect(second).not.toBe(first);
  });
  it("복원 본문은 식별자·버전·command만 서버 검증에 보내고 로컬 메타데이터를 섞지 않는다", async () => {
    const request = { mutationId: "11111111-1111-4111-8111-111111111111", expectedRevision: 4,
      command: { type: "upsert-task", task: { id: "task-a" } }, confirmedRevision: null, queuedAt: Date.now() };
    await recoverProductionCommand("project-a", request);
    expect(http.post).toHaveBeenLastCalledWith("/production/projects/project-a/commands", {
      mutationId: request.mutationId, expectedRevision: 4, command: request.command,
    });
  });
});
