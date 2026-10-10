import {
  ForbiddenException,
  HttpException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";


import { CreatorService } from "../../../../../../apps/api/src/modules/creator/creator.service";
import {
  STUDIO_VOICE_DEFAULT_STUN_URL,
  StudioVoiceIcePolicyService,
  issueStudioVoiceIcePolicy,
  resolveStudioVoiceIceConfiguration,
  type StudioVoiceIceConfiguration,
} from "../../../../../../apps/api/src/modules/creator/studio-voice-ice-policy.service";
import { StudioVoiceIcePolicyResponseSchema } from "../../../../../../apps/web/src/shared/lib/studio-voice-ice-policy-contract";

function configuration(
  overrides: Partial<StudioVoiceIceConfiguration> = {}
): StudioVoiceIceConfiguration {
  return {
    stunUrls: [STUDIO_VOICE_DEFAULT_STUN_URL],
    production: false,
    ...overrides,
  };
}

function team(options: { userId: string; workId: string; role?: string }) {
  const role = options.role ?? "editor";
  return {
    workId: options.workId,
    viewer: {
      userId: options.userId,
      role,
      status: "active",
      capabilities: {
        view: true,
        comment: role !== "viewer",
        edit: role === "editor" || role === "admin" || role === "owner",
        manageMembers: role === "admin" || role === "owner",
        respondInvite: false,
      },
    },
    members: [],
  };
}

describe("Studio voice ICE configuration", () => {
  it("defaults to the Cloudflare STUN without contacting third parties", () => {
    expect(resolveStudioVoiceIceConfiguration({})).toEqual({
      stunUrls: ["stun:stun.cloudflare.com:3478"],
      production: false,
    });
    expect(STUDIO_VOICE_DEFAULT_STUN_URL).toBe("stun:stun.cloudflare.com:3478");
  });

  it("parses, deduplicates and bounds deployment-owned STUN settings", () => {
    expect(resolveStudioVoiceIceConfiguration({
      STUDIO_VOICE_STUN_URLS: "stun:voice.example.com, stun:voice.example.com stun:voice2.example.com:3478",
    })).toEqual({
      stunUrls: ["stun:voice.example.com", "stun:voice2.example.com:3478"],
      production: false,
    });
  });

  it("ignores the retired TURN variables instead of failing or issuing relay credentials", () => {
    // TURN은 2026-10-11 결정으로 쓰지 않는다. 배포 환경에 과거 변수가 남아
    // 있어도 구성은 STUN 전용으로 고정되고 오류도 나지 않는다.
    expect(resolveStudioVoiceIceConfiguration({
      STUDIO_VOICE_TURN_URLS: "turn:voice.example.com?transport=udp",
      STUDIO_VOICE_TURN_SHARED_SECRET: "x".repeat(40),
      STUDIO_VOICE_TURN_REQUIRED: "true",
      STUDIO_VOICE_TURN_TTL_SECONDS: "600",
    })).toEqual({
      stunUrls: ["stun:stun.cloudflare.com:3478"],
      production: false,
    });
    expect(resolveStudioVoiceIceConfiguration({
      NODE_ENV: "production",
    })).toMatchObject({ production: true });
  });

  it("rejects non-STUN addresses in the STUN setting", () => {
    expect(() => resolveStudioVoiceIceConfiguration({
      STUDIO_VOICE_STUN_URLS: "https://voice.example.com",
    })).toThrow();
    expect(() => resolveStudioVoiceIceConfiguration({
      STUDIO_VOICE_STUN_URLS: "turn:voice.example.com:3478",
    })).toThrow(/stun:/u);
    expect(() => resolveStudioVoiceIceConfiguration({
      STUDIO_VOICE_STUN_URLS: "stun:user@voice.example.com",
    })).toThrow();
  });
});

describe("Studio voice ICE policy issuance (STUN-only)", () => {
  it("issues a STUN-only policy with no credentials and no expiry", () => {
    const nowMs = Date.parse("2026-07-18T08:00:00.000Z");
    const policy = issueStudioVoiceIcePolicy({
      configuration: configuration({ stunUrls: ["stun:voice.example.com"] }),
      userId: "private-user-id",
      workId: "private-work-id",
      nowMs,
    });

    expect(StudioVoiceIcePolicyResponseSchema.parse(policy)).toEqual(policy);
    expect(policy).toEqual({
      version: 1,
      mode: "stun",
      iceServers: [{ urls: ["stun:voice.example.com"] }],
      issuedAt: "2026-07-18T08:00:00.000Z",
      expiresAt: null,
      ttlSeconds: 0,
    });
    expect(JSON.stringify(policy)).not.toMatch(/turn:|username|credential/);
  });

  it("never issues TURN credentials even when the environment still carries TURN variables", () => {
    const configurationFromEnv = resolveStudioVoiceIceConfiguration({
      NODE_ENV: "production",
      STUDIO_VOICE_TURN_URLS: "turn:voice.example.com?transport=udp",
      STUDIO_VOICE_TURN_SHARED_SECRET: "x".repeat(40),
      STUDIO_VOICE_TURN_REQUIRED: "true",
    });
    const policy = issueStudioVoiceIcePolicy({
      configuration: configurationFromEnv,
      userId: "user-1",
      workId: "work-1",
      nowMs: 1,
    });
    expect(policy.mode).toBe("stun");
    expect(JSON.stringify(policy.iceServers)).not.toContain("turn:");
  });
});

describe("StudioVoiceIcePolicyService", () => {
  it("rate-limits screen-share ICE issuance per user and work", async () => {
    const userId = "screen-rate-user-unique-0720";
    const workId = "screen-rate-work-unique-0720";
    const getWorkTeam = vi.fn().mockResolvedValue(team({ userId, workId }));
    const service = new StudioVoiceIcePolicyService(
      { getWorkTeam } as unknown as CreatorService,
      configuration()
    );

    for (let count = 0; count < 12; count += 1) {
      await expect(service.issueScreenShare(userId, workId)).resolves.toMatchObject({
        mode: "stun",
      });
    }
    await expect(service.issueScreenShare(userId, workId)).rejects.toBeInstanceOf(
      HttpException
    );
    expect(getWorkTeam).toHaveBeenCalledTimes(12);
  });

  it("issues screen-share ICE policies to active viewers", async () => {
    const userId = "screen-viewer-unique-a";
    const workId = "screen-work-unique-a";
    const getWorkTeam = vi.fn().mockResolvedValue(team({
      userId,
      workId,
      role: "viewer",
    }));
    const service = new StudioVoiceIcePolicyService(
      { getWorkTeam } as unknown as CreatorService,
      configuration()
    );

    await expect(service.issueScreenShare(userId, workId)).resolves.toMatchObject({
      mode: "stun",
    });
    expect(getWorkTeam).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a screen-share ICE caller has no active view capability", async () => {
    const userId = "screen-revoked-unique-a";
    const workId = "screen-work-unique-b";
    const snapshot = team({ userId, workId, role: "viewer" });
    const getWorkTeam = vi.fn().mockResolvedValue({
      ...snapshot,
      viewer: {
        ...snapshot.viewer,
        capabilities: { ...snapshot.viewer.capabilities, view: false },
      },
    });
    const service = new StudioVoiceIcePolicyService(
      { getWorkTeam } as unknown as CreatorService,
      configuration()
    );

    await expect(service.issueScreenShare(userId, workId)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("keeps production screen sharing on the zero-relay-cost STUN-only path", async () => {
    const userId = "screen-production-unique-a";
    const workId = "screen-production-work-unique-a";
    const getWorkTeam = vi.fn().mockResolvedValue(team({ userId, workId }));
    const service = new StudioVoiceIcePolicyService(
      { getWorkTeam } as unknown as CreatorService,
      configuration({ production: true })
    );

    await expect(service.issueScreenShare(userId, workId)).resolves.toMatchObject({
      mode: "stun",
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
    });
  });
});
