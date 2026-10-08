import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";
import {
  issueStudioSpaceEntryCode,
  verifyStudioSpaceEntryCode,
  verifyStudioSpatialInvite,
} from "./studio-virtual-space-access-client";

vi.mock("@/platform/api", () => ({ api: { post: vi.fn() } }));

const post = vi.mocked(api.post);

describe("studio-virtual-space-access-client", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("유효한 초대 토큰은 valid로 돌려주고 토큰을 소모하지 않는 검증 경로를 쓴다", async () => {
    post.mockResolvedValue({ valid: true, workspaceId: "ws-1", role: "guest", expiresAt: "2026-10-15T00:00:00.000Z" });
    const result = await verifyStudioSpatialInvite("a".repeat(43), { kind: "project-space", projectId: "project-1" });
    expect(result).toEqual({ status: "valid", expiresAt: "2026-10-15T00:00:00.000Z" });
    expect(post).toHaveBeenCalledWith("/studio/space/access/invite/verify", {
      token: "a".repeat(43),
      context: { kind: "project-space", projectId: "project-1" },
    });
  });

  it("서버가 거절한 초대는 사유를 그대로 전한다", async () => {
    post.mockResolvedValue({ valid: false, reason: "expired" });
    const result = await verifyStudioSpatialInvite("a".repeat(43), { kind: "team-lobby" });
    expect(result).toEqual({ status: "invalid", reason: "expired" });
  });

  it("네트워크 실패와 형식 이상 응답은 무효가 아니라 확인 불가로 구분한다", async () => {
    post.mockRejectedValue(new Error("offline"));
    await expect(verifyStudioSpatialInvite("a".repeat(43), { kind: "team-lobby" })).resolves.toEqual({ status: "unavailable" });
    post.mockResolvedValue({ valid: "yes" });
    await expect(verifyStudioSpatialInvite("a".repeat(43), { kind: "team-lobby" })).resolves.toEqual({ status: "unavailable" });
    post.mockResolvedValue({ valid: false, reason: "unknown-reason" });
    await expect(verifyStudioSpatialInvite("a".repeat(43), { kind: "team-lobby" })).resolves.toEqual({ status: "unavailable" });
  });

  it("잠긴 공간의 코드 검증은 대기 시간을 함께 전한다", async () => {
    post.mockResolvedValue({ valid: false, reason: "locked", retryAfterSeconds: 812 });
    const result = await verifyStudioSpaceEntryCode("project-1", "ZZZ999");
    expect(result).toEqual({ status: "invalid", reason: "locked", retryAfterSeconds: 812 });
    expect(post).toHaveBeenCalledWith("/studio/space/access/entry-codes/verify", { spaceId: "project-1", code: "ZZZ999" });
  });

  it("코드 발급은 서버 응답을 그대로 돌려준다", async () => {
    post.mockResolvedValue({ id: "code-1", code: "ABC234", spaceId: "project-1", spaceName: "본관", expiresAt: "2026-11-07T00:00:00.000Z" });
    const issued = await issueStudioSpaceEntryCode("project-1", { spaceName: "본관" });
    expect(issued.code).toBe("ABC234");
    expect(post).toHaveBeenCalledWith("/studio/space/access/entry-codes", { spaceId: "project-1", spaceName: "본관" });
  });
});
