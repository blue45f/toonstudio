import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { FortuneController } from "./fortune.controller";
import { FortuneUsedDto } from "./fortune.dto";
import { FortuneService } from "./fortune.service";
import type { MembershipRewardService } from "../membership-wallet/membership-wallet.tokens";

@Module({ controllers: [FortuneController], providers: [FortuneService] })
class FortuneTestModule {}

it("injects the fortune engine without compiler-emitted constructor metadata", async () => {
  const module = await NestFactory.createApplicationContext(FortuneTestModule, { logger: false });
  try {
    const characters = module.get(FortuneController).getCharacters();
    expect(characters.length).toBeGreaterThan(0);
    expect(characters[0]).toHaveProperty("id");
  } finally {
    await module.close();
  }
});

// F-B10-1 (2026-10-08): 생년월일을 받던 계산 엔드포인트는 제거됐고, 서버에는
// mode만 받는 리워드 기록 엔드포인트만 남는다. 그 계약을 아래 테스트로 고정한다.
describe("FortuneController.recordFortuneUse (POST /fortune/used)", () => {
  function controllerWithWallet(grantActivityPoints: MembershipRewardService["grantActivityPoints"]) {
    const wallet = { grantActivityPoints } as unknown as MembershipRewardService;
    return new FortuneController(new FortuneService(), wallet);
  }

  it("grants activity points with mode-only metadata", async () => {
    const grantActivityPoints = vi.fn(async () => ({}));
    const controller = controllerWithWallet(grantActivityPoints);

    await expect(controller.recordFortuneUse({ mode: "saju" }, "user-1")).resolves.toEqual({ ok: true });

    expect(grantActivityPoints).toHaveBeenCalledTimes(1);
    const input = grantActivityPoints.mock.calls[0][0];
    expect(input.userId).toBe("user-1");
    expect(input.activity).toBe("fortune.used");
    // 메타데이터는 mode 하나뿐 — 생년월일·출생시간 같은 프로필 원본이 섞이지 않는다.
    expect(input.metadata).toEqual({ mode: "saju" });
    expect(Object.keys(input).sort()).toEqual(["activity", "metadata", "sourceRef", "userId"]);
  });

  it("does not grant for guests (no verified user id)", async () => {
    const grantActivityPoints = vi.fn(async () => ({}));
    const controller = controllerWithWallet(grantActivityPoints);

    await expect(controller.recordFortuneUse({ mode: "today" }, undefined)).resolves.toEqual({ ok: true });
    expect(grantActivityPoints).not.toHaveBeenCalled();
  });

  it("stays available when reward accounting fails", async () => {
    const grantActivityPoints = vi.fn(async () => {
      throw new Error("wallet unavailable");
    });
    const controller = controllerWithWallet(grantActivityPoints);

    await expect(controller.recordFortuneUse({ mode: "zodiac" }, "user-1")).resolves.toEqual({ ok: true });
  });

  it("no longer exposes birth-date draw handlers", () => {
    const proto = FortuneController.prototype as unknown as Record<string, unknown>;
    expect(proto.drawSaju).toBeUndefined();
    expect(proto.drawTodayFortune).toBeUndefined();
    expect(proto.drawCompatibility).toBeUndefined();
    expect(proto.drawZodiac).toBeUndefined();
    expect(typeof proto.recordFortuneUse).toBe("function");
    expect(typeof proto.drawTarot).toBe("function");
    expect(typeof proto.drawPrescription).toBe("function");
  });
});

describe("FortuneUsedDto", () => {
  it("accepts exactly the four client-computed modes", () => {
    for (const mode of ["today", "saju", "compatibility", "zodiac"]) {
      expect(FortuneUsedDto.schema.parse({ mode })).toEqual({ mode });
    }
  });

  it("rejects server-computed modes and missing mode", () => {
    expect(() => FortuneUsedDto.schema.parse({ mode: "tarot" })).toThrow();
    expect(() => FortuneUsedDto.schema.parse({ mode: "prescription" })).toThrow();
    expect(() => FortuneUsedDto.schema.parse({})).toThrow();
  });

  it("strips birth profile fields instead of carrying them", () => {
    const parsed = FortuneUsedDto.schema.parse({
      mode: "today",
      birthDate: "1990-06-15",
      birthTime: "14:30",
      gender: "male",
    });
    expect(parsed).toEqual({ mode: "today" });
  });
});
