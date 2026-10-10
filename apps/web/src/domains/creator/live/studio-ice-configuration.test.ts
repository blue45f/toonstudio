import { describe, expect, it } from "vitest";

import {
  STUDIO_ICE_STUN_ONLY_SERVERS,
  STUDIO_ICE_STUN_URL,
  getStudioIceServers,
} from "./studio-ice-configuration";

describe("studio ICE 구성 (STUN 전용)", () => {
  it("Cloudflare STUN 하나만으로 구성한다", () => {
    expect(STUDIO_ICE_STUN_URL).toBe("stun:stun.cloudflare.com:3478");
    expect(getStudioIceServers()).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
    expect(STUDIO_ICE_STUN_ONLY_SERVERS).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
  });

  it("TURN 항목이나 자격증명 필드를 포함하지 않는다", () => {
    for (const server of getStudioIceServers()) {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      for (const url of urls) {
        expect(url).not.toMatch(/^turns?:/);
      }
      expect(server.username).toBeUndefined();
      expect(server.credential).toBeUndefined();
    }
  });

  it("반환값을 바꿔도 다음 호출의 구성이 오염되지 않는다", () => {
    const servers = getStudioIceServers();
    servers.push({ urls: ["turn:evil.example.com:3478"] });
    const first = servers[0];
    if (first && Array.isArray(first.urls)) {
      first.urls.push("turn:evil.example.com:3478");
    }
    expect(getStudioIceServers()).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
  });
});
