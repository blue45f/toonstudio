import { describe, expect, it } from "vitest";

import {
  STUDIO_VOICE_DEFAULT_STUN_URL,
  issueStudioVoiceIcePolicy,
  resolveStudioVoiceIceConfiguration,
} from "./studio-voice-ice-policy.service";

const NOW_MS = Date.parse("2026-10-11T00:00:00.000Z");

describe("resolveStudioVoiceIceConfiguration", () => {
  it("STUN 미설정 시 Cloudflare STUN을 기본값으로 쓴다", () => {
    const configuration = resolveStudioVoiceIceConfiguration({
      NODE_ENV: "test",
    });
    expect(configuration.stunUrls).toEqual([STUDIO_VOICE_DEFAULT_STUN_URL]);
    expect(STUDIO_VOICE_DEFAULT_STUN_URL).toBe("stun:stun.cloudflare.com:3478");
  });

  it("STUDIO_VOICE_STUN_URLS 설정을 그대로 반영한다", () => {
    const configuration = resolveStudioVoiceIceConfiguration({
      NODE_ENV: "test",
      STUDIO_VOICE_STUN_URLS: "stun:voice.example.com:3478, stun:voice2.example.com:3478",
    });
    expect(configuration.stunUrls).toEqual([
      "stun:voice.example.com:3478",
      "stun:voice2.example.com:3478",
    ]);
  });

  it("STUN 설정에 turn: 주소가 섞이면 거부한다", () => {
    expect(() =>
      resolveStudioVoiceIceConfiguration({
        NODE_ENV: "test",
        STUDIO_VOICE_STUN_URLS: "turn:voice.example.com:3478",
      })
    ).toThrow();
  });
});

describe("issueStudioVoiceIcePolicy (STUN 전용)", () => {
  it("항상 stun 모드로 발급하고 자격증명을 만들지 않는다", () => {
    const configuration = resolveStudioVoiceIceConfiguration({ NODE_ENV: "test" });
    const policy = issueStudioVoiceIcePolicy({
      configuration,
      userId: "user-1",
      workId: "work-1",
      nowMs: NOW_MS,
    });
    expect(policy.mode).toBe("stun");
    expect(policy.iceServers).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
    expect(policy.expiresAt).toBeNull();
    expect(policy.ttlSeconds).toBe(0);
    expect(JSON.stringify(policy)).not.toMatch(/turn:|credential/);
  });

  it("배포 환경에 TURN 변수가 남아 있어도 TURN 자격을 발급하지 않는다", () => {
    const configuration = resolveStudioVoiceIceConfiguration({
      NODE_ENV: "test",
      STUDIO_VOICE_TURN_URLS: "turn:voice.example.com:3478",
      STUDIO_VOICE_TURN_SHARED_SECRET:
        "voice-turn-secret-at-least-thirty-two-characters",
      STUDIO_VOICE_TURN_REQUIRED: "true",
    } as NodeJS.ProcessEnv);
    const policy = issueStudioVoiceIcePolicy({
      configuration,
      userId: "user-1",
      workId: "work-1",
      nowMs: NOW_MS,
    });
    expect(policy.mode).toBe("stun");
    expect(JSON.stringify(policy.iceServers)).not.toContain("turn:");
  });
});
