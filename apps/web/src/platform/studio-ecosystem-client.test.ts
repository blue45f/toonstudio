import { describe, expect, it, vi } from "vitest";

const postMock = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  api: { post: postMock },
}));

import { studioEcosystemClient } from "./studio-ecosystem-client";

describe("studioEcosystemClient", () => {
  it("RBAC, 구인 광장, 카페, IP 확장 엔드포인트를 정확히 호출한다", async () => {
    postMock.mockResolvedValue({ ok: true });

    await studioEcosystemClient.assignRole({
      actorUserId: "u-owner",
      targetUserId: "u-line",
      displayName: "선화 어시",
      roleId: "main_author",
      scopeType: "work",
      scopeId: "w-1",
    });
    expect(postMock).toHaveBeenCalledWith(
      "/studio-ecosystem/rbac/assign",
      expect.objectContaining({ roleId: "main_author" }),
    );

    await studioEcosystemClient.assignPlazaSlot("party-1", "slot-1", "av-1");
    expect(postMock).toHaveBeenCalledWith(
      "/studio-ecosystem/plaza/parties/party-1/slots/slot-1/assign",
      { avatarId: "av-1" },
    );

    await studioEcosystemClient.createCafePost("cafe-1", {
      scope: "studio",
      channel: "notice",
      authorName: "대표",
      title: "공지",
      body: "내용",
    });
    expect(postMock).toHaveBeenCalledWith(
      "/studio-ecosystem/cafes/cafe-1/posts",
      expect.objectContaining({ scope: "studio", title: "공지" }),
    );
  });
});
