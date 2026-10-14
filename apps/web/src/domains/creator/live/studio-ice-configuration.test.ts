import { describe, expect, it } from "vitest";

import {
  STUDIO_ICE_STUN_ONLY_SERVERS,
  STUDIO_ICE_STUN_URL,
  buildStudioIceServers,
  getStudioIceServers,
  iceServersIncludeTurn,
  parseStudioTurnIceServer,
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

describe("studio ICE 구성 (운영자 지정 coturn)", () => {
  it("지정이 없으면 STUN 전용으로 만든다", () => {
    expect(buildStudioIceServers()).toEqual([{ urls: [STUDIO_ICE_STUN_URL] }]);
    expect(buildStudioIceServers({})).toEqual([{ urls: [STUDIO_ICE_STUN_URL] }]);
    expect(iceServersIncludeTurn(buildStudioIceServers())).toBe(false);
  });

  it("주소·사용자·자격증명이 모두 있을 때만 TURN 항목을 덧붙인다", () => {
    const servers = buildStudioIceServers({
      urls: "turn:coturn.example.com:3478",
      username: "toonstudio",
      credential: "secret",
    });
    expect(servers).toEqual([
      { urls: [STUDIO_ICE_STUN_URL] },
      { urls: ["turn:coturn.example.com:3478"], username: "toonstudio", credential: "secret" },
    ]);
    expect(iceServersIncludeTurn(servers)).toBe(true);
  });

  it("반쪽 지정은 통째로 무시한다", () => {
    expect(parseStudioTurnIceServer({ urls: "turn:a.example.com:3478", username: "u" })).toBeNull();
    expect(parseStudioTurnIceServer({ urls: "turn:a.example.com:3478", credential: "c" })).toBeNull();
    expect(parseStudioTurnIceServer({ username: "u", credential: "c" })).toBeNull();
    expect(parseStudioTurnIceServer({ urls: "  ", username: "u", credential: "c" })).toBeNull();
  });

  it("turn:/turns:가 아닌 주소와 빈 항목을 걸러내고 중복을 제거한다", () => {
    const turn = parseStudioTurnIceServer({
      urls: " stun:stun.example.com:3478, turn:a.example.com:3478 ,turn:a.example.com:3478, turns:b.example.com:5349?transport=tcp, https://evil.example.com ",
      username: "u",
      credential: "c",
    });
    expect(turn?.urls).toEqual(["turn:a.example.com:3478", "turns:b.example.com:5349?transport=tcp"]);
  });

  it("빌더 반환값을 바꿔도 다음 호출이 오염되지 않는다", () => {
    const env = { urls: "turn:a.example.com:3478", username: "u", credential: "c" };
    const first = buildStudioIceServers(env);
    first.pop();
    (first[0]?.urls as string[]).push("turn:evil.example.com:3478");
    expect(buildStudioIceServers(env)).toEqual([
      { urls: [STUDIO_ICE_STUN_URL] },
      { urls: ["turn:a.example.com:3478"], username: "u", credential: "c" },
    ]);
  });
});
