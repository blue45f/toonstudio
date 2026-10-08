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

describe("CommunityController post report boundary", () => {
  it("게스트 신고는 401이고 서비스를 호출하지 않는다", async () => {
    const reportPost = vi.fn();
    const controller = new CommunityController({ reportPost } as never);

    await expect(
      controller.reportPost("post-1", { reason: "스팸 글입니다. 확인해 주세요." }, undefined, fakeReq),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(reportPost).not.toHaveBeenCalled();
  });

  it("회원 신고는 본문과 함께 서비스에 위임된다", async () => {
    const reportPost = vi.fn().mockResolvedValue({ reported: true });
    const controller = new CommunityController({ reportPost } as never);
    const body = { reason: "스팸 글입니다. 확인해 주세요." };

    await expect(controller.reportPost("post-1", body, "user-1", fakeReq)).resolves.toEqual({
      reported: true,
    });
    expect(reportPost).toHaveBeenCalledWith("post-1", "user-1", body);
  });
});
