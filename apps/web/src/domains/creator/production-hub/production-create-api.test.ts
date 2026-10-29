import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProject } from "./production-api";

const http = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { post: http.post }, apiPath: (path: string) => path }));
const input = { projectId: "project", workId: "work", ownerPartyId: "owner-party", ownerDisplayName: "작품 소유자",
  title: "실제 제작", collaborationModel: "studio-production" as const };
beforeEach(() => { http.post.mockReset(); http.post.mockResolvedValue({}); });

describe("Production 생성의 호출자 소유 mutation ID", () => {
  it("미확인 생성의 같은 본문과 clientMutationId를 그대로 보낸다", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    http.post.mockRejectedValueOnce(new Error("응답 유실"));
    await expect(createProductionProject(input, id)).rejects.toThrow("응답 유실");
    await createProductionProject(input, id);
    expect(http.post.mock.calls[0]).toEqual(http.post.mock.calls[1]);
    expect(http.post).toHaveBeenLastCalledWith("/production/projects", { ...input, clientMutationId: id });
  });
  it("식별자를 전달하지 않는 기존 호출은 새 생성 식별자를 발급한다", async () => {
    await createProductionProject(input); await createProductionProject(input);
    expect(http.post.mock.calls[0]?.[1]?.clientMutationId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(http.post.mock.calls[1]?.[1]?.clientMutationId).not.toBe(http.post.mock.calls[0]?.[1]?.clientMutationId);
  });
});
