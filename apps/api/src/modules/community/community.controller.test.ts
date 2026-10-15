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

// 속도 제한 키에 클라이언트가 바꿀 수 있는 `X-Forwarded-For`·`X-Real-IP` 를 넣으면, 요청마다
// 헤더 값을 바꿔 버킷을 새로 얻어 제한(신고·답글·좋아요 도배 방지)을 무력화할 수 있다.
// 신뢰 프록시를 명시하지 않은 기본 구성에서는 직접 연결된 소켓 주소만 신원으로 쓴다.
function requestFrom(headers: Record<string, string>) {
  return { headers, socket: { remoteAddress: "198.51.100.7" } } as never;
}

describe("CommunityController 속도 제한 신원", () => {
  it("요청마다 X-Forwarded-For 를 바꿔도 신고 제한(10회/10분)을 우회하지 못한다", async () => {
    const reportPost = vi.fn().mockResolvedValue({ reported: true });
    const controller = new CommunityController({ reportPost } as never);
    const body = { reason: "스팸 글입니다. 확인해 주세요." };

    for (let index = 0; index < 10; index += 1) {
      await controller.reportPost(
        "post-1",
        body,
        "xff-spoof-user",
        requestFrom({ "x-forwarded-for": `203.0.113.${index + 1}` }),
      );
    }
    await expect(
      controller.reportPost(
        "post-1",
        body,
        "xff-spoof-user",
        requestFrom({ "x-forwarded-for": "203.0.113.250" }),
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(reportPost).toHaveBeenCalledTimes(10);
  });

  it("X-Real-IP 를 바꿔도 같은 사용자의 제한은 공유된다", async () => {
    const reportPost = vi.fn().mockResolvedValue({ reported: true });
    const controller = new CommunityController({ reportPost } as never);
    const body = { reason: "스팸 글입니다. 확인해 주세요." };

    for (let index = 0; index < 10; index += 1) {
      await controller.reportPost(
        "post-1",
        body,
        "real-ip-spoof-user",
        requestFrom({ "x-real-ip": `192.0.2.${index + 1}` }),
      );
    }
    await expect(
      controller.reportPost(
        "post-1",
        body,
        "real-ip-spoof-user",
        requestFrom({ "x-real-ip": "192.0.2.250" }),
      ),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("다른 사용자의 제한에는 영향을 주지 않는다", async () => {
    const reportPost = vi.fn().mockResolvedValue({ reported: true });
    const controller = new CommunityController({ reportPost } as never);
    const body = { reason: "스팸 글입니다. 확인해 주세요." };

    for (let index = 0; index < 10; index += 1) {
      await controller.reportPost("post-1", body, "limited-user", requestFrom({}));
    }
    await expect(
      controller.reportPost("post-1", body, "limited-user", requestFrom({})),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      controller.reportPost("post-1", body, "other-user", requestFrom({})),
    ).resolves.toEqual({ reported: true });
  });
});
