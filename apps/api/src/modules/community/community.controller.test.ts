import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CommunityController } from "./community.controller";

// 컨트롤러 경계 계약 — 인증 없는 좋아요는 서비스에 닿기 전에 401이어야 하고,
// 인증된 요청은 그대로 서비스에 위임돼야 한다.
const fakeReq = { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as never;

describe("CommunityController post like boundary", () => {
  it("게스트 좋아요는 401이고 서비스를 호출하지 않는다", async () => {
    const togglePostLike = vi.fn();
    const controller = new CommunityController({
      togglePostLike,
    } as never);

    await expect(
      controller.togglePostLike("post-1", undefined, fakeReq),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(togglePostLike).not.toHaveBeenCalled();
  });

  it("회원 좋아요는 서비스 토글 결과를 그대로 반환한다", async () => {
    const togglePostLike = vi
      .fn()
      .mockResolvedValue({ liked: true, likeCount: 3 });
    const controller = new CommunityController({
      togglePostLike,
    } as never);

    await expect(controller.togglePostLike("post-1", "user-1", fakeReq)).resolves.toEqual({
      liked: true,
      likeCount: 3,
    });
    expect(togglePostLike).toHaveBeenCalledWith("post-1", "user-1");
  });
});
