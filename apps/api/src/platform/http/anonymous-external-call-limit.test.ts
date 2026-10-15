import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorEcosystemController } from "../../modules/creator-ecosystem/creator-ecosystem.controller";
import { CreatorIntelligenceController } from "../../modules/creator-intelligence/creator-intelligence.module";
import { LearningController } from "../../modules/learning/learning.module";

import type { Request } from "express";

// 로그인 없이 서버 키로 외부 API(YouTube 검색은 호출당 100 쿼터 단위, 도서관 정보나루, Pexels/
// Pixabay)를 부르는 엔드포인트다. 캐시는 같은 질의만 막으므로 질의를 바꿔 가며 반복하면 서버
// 키의 쿼터를 소진시킬 수 있다(CWE-770). 클라이언트별 한도를 넘기면 429 여야 한다.
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

async function exhaust(
  limit: number,
  call: (index: number) => unknown,
): Promise<{ status: number | null }> {
  for (let index = 0; index < limit; index += 1) await call(index);
  try {
    await call(limit);
    return { status: null };
  } catch (error) {
    return { status: error instanceof HttpException ? error.getStatus() : -1 };
  }
}

describe("익명 외부 호출 엔드포인트의 클라이언트별 제한", () => {
  it("YouTube 학습 검색은 분당 30회를 넘으면 429 이고 질의/헤더를 바꿔도 우회하지 못한다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    const outcome = await exhaust(30, (index) =>
      controller.searchYouTube(`콘티 연출 ${index}`, "8", clientRequest("198.51.100.20", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      })));
    expect(outcome.status).toBe(429);
    expect(search).toHaveBeenCalledTimes(30);
  });

  it("다른 클라이언트는 영향을 받지 않는다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    await exhaust(30, (index) => controller.searchYouTube(`q${index}`, "8", clientRequest("198.51.100.21")));
    await expect(
      Promise.resolve(controller.searchYouTube("q", "8", clientRequest("198.51.100.22"))),
    ).resolves.toBeDefined();
  });

  it("도서관 소장 조회는 분당 20회를 넘으면 429 이다", async () => {
    const getLibraryHoldings = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new CreatorEcosystemController({ getLibraryHoldings } as never);
    const outcome = await exhaust(20, (index) =>
      controller.libraryHoldings(`97800000000${index % 10}`, "11", clientRequest("198.51.100.30")));
    expect(outcome.status).toBe(429);
    expect(getLibraryHoldings).toHaveBeenCalledTimes(20);
  });

  it("무료 참고 자료 검색(references, scene, anilist, sfx)은 하나의 버킷으로 분당 30회를 제한한다", async () => {
    const core = {
      searchReferences: vi.fn().mockResolvedValue({ status: "ready" }),
      sceneReference: vi.fn().mockResolvedValue({ status: "ready" }),
      searchAniList: vi.fn().mockResolvedValue({ status: "ready" }),
      searchSoundEffects: vi.fn().mockResolvedValue({ status: "ready" }),
    };
    const controller = new CreatorIntelligenceController(
      core as never,
      {} as never,
      {} as never,
    );
    const client = clientRequest("198.51.100.40");
    const outcome = await exhaust(30, (index) => {
      switch (index % 4) {
        case 0: return controller.references("pexels", `q${index}`, "1", "image", client);
        case 1: return controller.scene(`장소${index}`, "2026-10-15", client);
        case 2: return controller.anilist(`q${index}`, "ANIME", client);
        default: return controller.soundSearch(`q${index}`, "1", client);
      }
    });
    expect(outcome.status).toBe(429);
  });

  it("요청 객체가 없는 직접 호출(테스트, 내부 사용)은 제한하지 않는다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    for (let index = 0; index < 60; index += 1) await controller.searchYouTube("q", "8");
    expect(search).toHaveBeenCalledTimes(60);
  });
});
