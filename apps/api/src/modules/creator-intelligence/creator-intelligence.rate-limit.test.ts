import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorIntelligenceController } from "./creator-intelligence.module";

import type { Request } from "express";

// 로그인 없이 서버 키로 Pexels, Pixabay 등 무료 참고 자료 API 를 부르는 조회 네 개다. 네 경로는
// 하나의 버킷을 공유해, 경로를 번갈아 호출해도 클라이언트당 분당 30회를 넘지 못한다(CWE-770).
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

function controllerWithStubs() {
  const core = {
    searchReferences: vi.fn().mockResolvedValue({ status: "ready" }),
    sceneReference: vi.fn().mockResolvedValue({ status: "ready" }),
    searchAniList: vi.fn().mockResolvedValue({ status: "ready" }),
    searchSoundEffects: vi.fn().mockResolvedValue({ status: "ready" }),
  };
  return new CreatorIntelligenceController(core as never, {} as never, {} as never);
}

// 컨트롤러 메서드가 동기로 던지든 비동기로 거부하든 같은 방식으로 상태 코드를 읽는다.
async function statusOf(call: () => unknown): Promise<number | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe("무료 참고 자료 검색의 클라이언트별 제한", () => {
  it("references, scene, anilist, sfx 는 하나의 버킷으로 분당 30회를 제한한다", async () => {
    const controller = controllerWithStubs();
    const client = clientRequest("198.51.100.40");
    const call = (index: number) => {
      switch (index % 4) {
        case 0: return controller.references("pexels", `q${index}`, "1", "image", client);
        case 1: return controller.scene(`장소${index}`, "2026-10-15", client);
        case 2: return controller.anilist(`q${index}`, "ANIME", client);
        default: return controller.soundSearch(`q${index}`, "1", client);
      }
    };
    for (let index = 0; index < 30; index += 1) await call(index);
    expect(await statusOf(() => call(30))).toBe(429);
  });

  it("전달 헤더를 바꿔도 새 한도를 얻지 못하고 다른 클라이언트는 영향을 받지 않는다", async () => {
    const controller = controllerWithStubs();
    for (let index = 0; index < 30; index += 1) {
      await controller.soundSearch(`q${index}`, "1", clientRequest("198.51.100.41", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      }));
    }
    const rotated = clientRequest("198.51.100.41", { "x-forwarded-for": "203.0.113.250" });
    expect(await statusOf(() => controller.soundSearch("q", "1", rotated))).toBe(429);
    const another = clientRequest("198.51.100.42");
    expect(await statusOf(() => controller.soundSearch("q", "1", another))).toBeNull();
  });
});
